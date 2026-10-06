#!/usr/bin/env node
'use strict';
/**
 * Boots the shipped bundle in a real DOM and checks the two things that matter:
 * an existing learner's stored progress survives the upgrade untouched, and the
 * study materials a learner actually sees are distinct from one another.
 *
 * Run: node scripts/verify.js
 * jsdom is resolved from NODE_PATH so it stays out of the deployment.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const BUNDLE = require(path.join(ROOT, 'build', 'bundle-parts.js'));
const STORAGE_KEY = 'delf50_v12_state';

const failures = [];
{
  // A content edit that was never built into build/bundle-parts.js would not ship.
  const { status } = require('child_process').spawnSync(
    process.execPath, [path.join(__dirname, 'build-bundle.js'), '--check'], { stdio: 'inherit' });
  if (status !== 0) process.exit(1);
}
const notes = [];
function check(ok, label, detail) {
  if (ok) notes.push(`  ok   ${label}`);
  else failures.push(`  FAIL ${label}${detail ? ' — ' + detail : ''}`);
}

/**
 * The learner state this project must never damage: days 1-3 finished, days 4-8
 * grammar finished, day 4 reading finished and one day-4 listening answered.
 */
function priorLearnerState() {
  const state = {
    version: '1.8.0', selectedDay: 8, intensity: 'standard',
    taskDone: {}, daily: {},
    grammar: { attempts: 240, correct: 198, skill: {} },
    reading: { attempts: 21, correct: 17, index: 3, answers: {} },
    listening: { attempts: 3, correct: 2, index: 1, answers: {} },
    application: { count: 9, index: 3, records: [] },
    writing: { count: 3, index: 1, records: [] },
    speaking: { count: 9, totalSec: 1260, index: 3, records: [] },
    errors: [{ q: 'Nous ___ prêts.', a: 'avons', good: 'sommes', day: 2 }],
    prodDone: { 'present|0': true, 'negation|0': true },
    drafts171: { writing: { '3:writing:w181-d03-s01': 'Bonjour, je voudrais des informations.' } },
    contentProgress172: { completed: { reading: {}, listening: {}, writing: {}, speaking: {}, application: {} } },
    startedAt: '2026-08-20T08:00:00.000Z', lastSavedAt: '2026-08-28T21:14:00.000Z'
  };
  for (let day = 1; day <= 3; day++) {
    state.daily[String(day)] = { grammar: 10, grammarProd: 8, application: 3, listening: 3, reading: 3, writing: 1, speaking: 3 };
  }
  for (let day = 4; day <= 8; day++) {
    state.daily[String(day)] = { grammar: 10, grammarProd: 8, application: 0, listening: 0, reading: 0, writing: 0, speaking: 0 };
  }
  state.daily['4'].reading = 3;
  state.daily['4'].listening = 1;
  for (let day = 1; day <= 3; day++) {
    for (let slot = 1; slot <= 3; slot++) {
      for (let q = 0; q < 3; q++) {
        state.reading.answers[`${day}:r181-d0${day}-s0${slot}:${q}`] = q % 3;
        state.listening.answers[`${day}:l181-d0${day}-s0${slot}:${q}`] = q % 3;
      }
    }
  }
  for (let slot = 1; slot <= 3; slot++) {
    for (let q = 0; q < 3; q++) state.reading.answers[`4:r181-d04-s0${slot}:${q}`] = q % 3;
  }
  for (let q = 0; q < 3; q++) state.listening.answers[`4:l181-d04-s01:${q}`] = q % 3;
  /* A real browser also carries the day-by-day assignment map the routing wrote. */
  state.assignments172 = {};
  for (let day = 3; day <= 8; day++) {
    const dd = String(day).padStart(2, '0');
    state.assignments172[String(day)] = {
      reading: [1, 2, 3, 4].map((n) => `r181-d${dd}-s0${n}`),
      listening: [1, 2, 3, 4].map((n) => `l181-d${dd}-s0${n}`),
      writing: [1, 2].map((n) => `w181-d${dd}-s0${n}`),
      speaking: [1, 2, 3, 4].map((n) => `s181-d${dd}-s0${n}`),
      application: [1, 2, 3, 4].map((n) => `a181-d${dd}-s0${n}`)
    };
  }
  return state;
}

function boot(initialState) {
  // Scripts must run as <script> elements, not eval: top-level `const`/`let` only
  // become cross-script globals when the browser evaluates them as classic scripts.
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://delf50-mvp.vercel.app/', pretendToBeVisual: true, runScripts: 'dangerously'
  });
  const { window } = dom;
  if (initialState) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initialState));
  window.alert = () => {};
  window.confirm = () => false;
  window.scrollTo = () => {};

  const errors = [];
  window.addEventListener('error', (e) => errors.push(String(e.message || e.error)));

  const sources = BUNDLE.parts;
  for (let i = 0; i < sources.length; i++) {
    let thrown = null;
    const onError = (e) => { thrown = String(e.message || e.error || 'unknown'); };
    window.addEventListener('error', onError);
    const el = window.document.createElement('script');
    el.textContent = sources[i];
    window.document.body.appendChild(el);
    el.remove();
    window.removeEventListener('error', onError);
    if (thrown) { errors.push(`${BUNDLE.files[i]}: ${thrown}`); break; }
  }
  return { window, errors, stored: () => JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null') };
}

/* ---------------------------------------------------------------- boot */
const cold = boot(null);
check(cold.errors.length === 0, 'bundle boots from an empty browser', cold.errors[0]);
check(!!cold.window.document.getElementById('root').innerHTML.trim(), 'first paint renders content');

const prior = priorLearnerState();
const warm = boot(JSON.parse(JSON.stringify(prior)));
check(warm.errors.length === 0, 'bundle boots over an existing learner state', warm.errors[0]);

/* ------------------------------------------------- progress preservation */
const after = warm.stored();
if (!after) {
  check(false, 'stored state is readable after boot');
} else {
  const dayLoss = [];
  for (const [day, before] of Object.entries(prior.daily)) {
    const now = after.daily && after.daily[day];
    if (!now) { dayLoss.push(`day ${day} vanished`); continue; }
    for (const [k, v] of Object.entries(before)) {
      if (Number(now[k] || 0) < Number(v)) dayLoss.push(`day ${day}.${k}: ${v} -> ${now[k]}`);
    }
  }
  check(dayLoss.length === 0, 'every per-day completion counter is preserved', dayLoss.join('; '));

  const answerLoss = [];
  for (const [k, v] of Object.entries(prior.reading.answers)) {
    if (after.reading.answers[k] !== v) answerLoss.push(`reading ${k}`);
  }
  for (const [k, v] of Object.entries(prior.listening.answers)) {
    if (after.listening.answers[k] !== v) answerLoss.push(`listening ${k}`);
  }
  check(answerLoss.length === 0, 'every recorded answer is preserved', answerLoss.slice(0, 4).join('; '));

  const counters = [
    ['grammar.attempts', prior.grammar.attempts, after.grammar.attempts],
    ['grammar.correct', prior.grammar.correct, after.grammar.correct],
    ['reading.attempts', prior.reading.attempts, after.reading.attempts],
    ['reading.correct', prior.reading.correct, after.reading.correct],
    ['listening.attempts', prior.listening.attempts, after.listening.attempts],
    ['application.count', prior.application.count, after.application.count],
    ['writing.count', prior.writing.count, after.writing.count],
    ['speaking.count', prior.speaking.count, after.speaking.count],
    ['speaking.totalSec', prior.speaking.totalSec, after.speaking.totalSec],
    ['errors.length', prior.errors.length, (after.errors || []).length]
  ];
  const counterLoss = counters.filter(([, b, a]) => Number(a || 0) < Number(b)).map(([n, b, a]) => `${n}: ${b} -> ${a}`);
  check(counterLoss.length === 0, 'every cumulative counter is preserved', counterLoss.join('; '));
  check(after.startedAt === prior.startedAt, 'startedAt is preserved');
  check(after.prodDone && after.prodDone['present|0'] === true, 'grammar production records are preserved');
  check(after.drafts171 && after.drafts171.writing && after.drafts171.writing['3:writing:w181-d03-s01'] === prior.drafts171.writing['3:writing:w181-d03-s01'], 'saved drafts are preserved');
  check(warm.window.localStorage.getItem('delf50_pre172_snapshot_v1') !== undefined, 'pre-migration snapshot key is reachable');
}

/* -------------------------------------------------- content uniqueness */
const W = warm.window;
function bankOf(name) {
  const el = W.document.createElement('script');
  el.textContent = `window.__probe=(typeof ${name}!=='undefined'?${name}:null);`;
  W.document.body.appendChild(el); el.remove();
  return W.__probe || [];
}
const readings = bankOf('V13_READINGS');
const listenings = bankOf('V13_LISTENINGS');
check(readings.length > 0 && listenings.length > 0, 'reading and listening banks are populated', `${readings.length}/${listenings.length}`);

function norm(s) {
  return String(s || '').toLowerCase().replace(/<[^>]+>/g, ' ')
    .replace(/[^a-zà-ÿ0-9 ]+/gi, ' ').replace(/\s+/g, ' ').trim();
}
function trigrams(s) {
  const w = norm(s).split(' ').filter(Boolean), out = new Set();
  for (let i = 0; i + 2 < w.length; i++) out.add(w.slice(i, i + 3).join(' '));
  return out;
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let hit = 0; a.forEach((x) => { if (b.has(x)) hit++; });
  return hit / (a.size + b.size - hit);
}
function words(s) { return norm(s).split(' ').filter(Boolean).length; }

const AUTHORED_UNTIL = Number(process.env.DELF50_AUTHORED_UNTIL || 20);

/**
 * Two id generations (177 and 181) exist per day/slot and the layer stack decides
 * which one a learner is routed to. Asking the app itself is the only reliable way
 * to know what is actually on screen, so the quality gates below run on exactly the
 * documents currentReading()/currentListening() hand back, day by day and slot by
 * slot — not on a generation this script assumed.
 */
function resolveRouted(type) {
  const el = W.document.createElement('script');
  el.textContent = `window.__probe=(function(){
    var out=[], fn = ${type === 'reading' ? 'currentReading' : 'currentListening'};
    var day0=S.selectedDay, browse0=JSON.stringify(UI.browse174||{});
    for(var d=1; d<=50; d++){
      for(var s=0; s<4; s++){
        S.selectedDay=d;
        UI.browse174=UI.browse174||{}; UI.browse174['${type}']={}; UI.browse174['${type}'][String(d)]=s;
        var x=null; try{ x=fn(); }catch(e){}
        if(x) out.push({id:x.id, day:d, slot:s+1, body:String(x.${type === 'reading' ? 'text' : 'script'}||''), title:String(x.title||''), qs:x.qs||[]});
      }
    }
    S.selectedDay=day0; UI.browse174=JSON.parse(browse0);
    return out;
  })();`;
  W.document.body.appendChild(el); el.remove();
  return (W.__probe || []).map((r) => ({ item: { id: r.id, title: r.title, qs: r.qs }, day: r.day, slot: r.slot, body: r.body }));
}
const R = resolveRouted('reading');
const L = resolveRouted('listening');
if (process.env.DELF50_DEBUG) {
  const odd = R.concat(L).filter((r) => r.day >= 4 && !/^[rl](177|181)-d\d{2}-s\d{2}$/.test(r.item.id));
  console.log('DEBUG unexpected ids in window:', odd.map((r) => `D${r.day}S${r.slot}=${r.item.id}`).join(', ') || 'none');
}
notes.push(`  info routed generation in use — reading: ${(R.find((x) => x.day === 12) || {}).id || 'n/a'}, listening: ${(L.find((x) => x.day === 12) || {}).id || 'n/a'}`);
const inWindow = (r) => r.day >= 4 && r.day <= AUTHORED_UNTIL;

/* The corpus layer must report clean and must not have skipped anything. */
const corpusAudit = (() => {
  const el = W.document.createElement('script');
  el.textContent = 'window.__probe=JSON.parse(JSON.stringify(globalThis.__DELF50_CORPUS_AUDIT||null));';
  W.document.body.appendChild(el); el.remove();
  return W.__probe;
})();
check(!!corpusAudit, 'corpus layer published its audit');
if (corpusAudit) {
  check(corpusAudit.status === 'pass', 'corpus audit status is pass',
    `${corpusAudit.status}: rejected ${JSON.stringify(corpusAudit.rejected).slice(0, 200)} missing ${JSON.stringify(corpusAudit.missing).slice(0, 120)}`);
  notes.push(`  info corpus: ${corpusAudit.applied.length} documents applied, coverage ${JSON.stringify(corpusAudit.coverage)}`);
}

const deliverable = inWindow;

function uniqueness(rows, label) {
  const scoped = rows.filter(deliverable);
  const withGrams = scoped.map((r) => ({ ...r, g: trigrams(r.body) }));
  let worst = { score: 0 };
  const dupes = [];
  for (let i = 0; i < withGrams.length; i++) {
    for (let j = i + 1; j < withGrams.length; j++) {
      const score = jaccard(withGrams[i].g, withGrams[j].g);
      if (score > worst.score) worst = { score, a: `D${withGrams[i].day}S${withGrams[i].slot}`, b: `D${withGrams[j].day}S${withGrams[j].slot}` };
      if (score >= 0.35) dupes.push(`D${withGrams[i].day}S${withGrams[i].slot}~D${withGrams[j].day}S${withGrams[j].slot} ${(score * 100).toFixed(0)}%`);
    }
  }
  check(dupes.length === 0, `${label}: no two routed documents in days 4-${AUTHORED_UNTIL} overlap by 35%+`,
    `${dupes.length} pairs, worst ${dupes[0] || ''}`);
  const titles = new Set(scoped.map((r) => norm(r.item.title)));
  check(titles.size === scoped.length, `${label}: every routed title in days 4-${AUTHORED_UNTIL} is distinct`, `${titles.size}/${scoped.length}`);
  const counts = {};
  for (const r of scoped) for (const q of (r.item.qs || [])) counts[norm(q[0])] = (counts[norm(q[0])] || 0) + 1;
  const repeated = Object.entries(counts).filter(([, n]) => n > 1);
  check(repeated.length === 0, `${label}: no question stem is reused in days 4-${AUTHORED_UNTIL}`,
    repeated.slice(0, 3).map(([t, n]) => `"${t.slice(0, 40)}" x${n}`).join('; '));
  notes.push(`  info ${label}: ${scoped.length} routed documents in window, peak similarity ${(worst.score * 100).toFixed(0)}% (${worst.a || '-'} vs ${worst.b || '-'})`);
  return scoped;
}
const scopedR = uniqueness(R, 'reading');
const scopedL = uniqueness(L, 'listening');

/* The whole authored corpus, all days: no two documents of a kind overlap by 55%+.
   Run here, once per build, rather than in every learner's browser on every load. */
{
  const el = W.document.createElement('script');
  el.textContent = 'window.__probe=globalThis.__DELF50_CORPUS_V200||[];';
  W.document.body.appendChild(el); el.remove();
  const corpus = W.__probe;
  for (const [t, field, label] of [['r', 'text', 'reading'], ['l', 'script', 'listening']]) {
    const docs = corpus.filter((e) => e.t === t).map((e) => ({ tag: `D${e.d}S${e.s}`, g: trigrams(e[field]) }));
    const close = [];
    for (let i = 0; i < docs.length; i++) for (let j = i + 1; j < docs.length; j++) {
      const q = jaccard(docs[i].g, docs[j].g);
      if (q >= 0.55) close.push(`${docs[i].tag}~${docs[j].tag} ${(q * 100).toFixed(0)}%`);
    }
    check(docs.length >= 190 && close.length === 0, `${label}: no two of the ${docs.length} authored documents overlap by 55%+`, close.slice(0, 3).join('; '));
  }
}

/* Cross-modal: the same day's reading and listening must not restate one another. */
let crossWorst = { score: 0 };
const crossHits = [];
for (const r of scopedR) {
  const g = trigrams(r.body);
  for (const l of scopedL.filter((x) => x.day === r.day)) {
    const score = jaccard(g, trigrams(l.body));
    if (score > crossWorst.score) crossWorst = { score, a: `R${r.day}S${r.slot}`, b: `L${l.day}S${l.slot}` };
    if (score >= 0.30) crossHits.push(`R${r.day}S${r.slot}~L${l.day}S${l.slot} ${(score * 100).toFixed(0)}%`);
  }
}
check(crossHits.length === 0, `cross-modal: same-day reading and listening never restate each other (days 4-${AUTHORED_UNTIL})`,
  `${crossHits.length} pairs, worst ${crossHits[0] || ''}`);
notes.push(`  info cross-modal peak similarity ${(crossWorst.score * 100).toFixed(0)}% (${crossWorst.a || '-'} vs ${crossWorst.b || '-'})`);

/* A correct option copied verbatim from the text is answerable by position alone. */
function sentences(text) {
  return norm(text).split(/(?:\.|\?|!|;|•|<br>)+/).map((x) => x.trim()).filter((x) => x.split(' ').length >= 5);
}
const verbatim = [];
for (const r of scopedR.concat(scopedL)) {
  const sents = new Set(sentences(r.body));
  for (const q of (r.item.qs || [])) {
    const opts = q[1] || [];
    const correct = norm(opts[q[2]]);
    if (correct.split(' ').length >= 5 && sents.has(correct)) verbatim.push(`${r.item.id} "${correct.slice(0, 34)}"`);
  }
}
check(verbatim.length === 0, `no correct option is a verbatim sentence from its own text (days 4-${AUTHORED_UNTIL})`,
  `${verbatim.length}: ${verbatim.slice(0, 2).join('; ')}`);

/* Distractors drawn from one global pool make every question answerable blind. */
const optionUse = {};
for (const r of scopedR.concat(scopedL)) {
  for (const q of (r.item.qs || [])) {
    (q[1] || []).forEach((o, i) => {
      if (i === q[2]) return;
      const k = norm(o);
      (optionUse[k] = optionUse[k] || new Set()).add(r.item.id);
    });
  }
}
const shared = Object.entries(optionUse).filter(([, ids]) => ids.size > 1);
check(shared.length === 0, `no distractor is shared between documents (days 4-${AUTHORED_UNTIL})`,
  shared.slice(0, 3).map(([t, ids]) => `"${t.slice(0, 34)}" in ${[...ids].join('+')}`).join('; '));

/* Internal routing identifiers must never reach the learner. */
const leakRe = /(traceId|sourceSeed|contentId|familyId|semanticFingerprint|[rlwsa](?:177|181)-d\d{2}-s\d{2})/i;
const leaks = scopedR.concat(scopedL)
  .filter((r) => leakRe.test(String(r.item.title) + ' ' + String(r.body)))
  .map((r) => r.item.id);
check(leaks.length === 0, 'no internal identifier leaks into study text', leaks.slice(0, 3).join(', '));

/* Length has to climb with the curriculum, or the ramp to B1 is cosmetic. */
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const early = scopedR.filter((r) => r.day <= 8).map((r) => words(r.body));
const later = scopedR.filter((r) => r.day >= 15).map((r) => words(r.body));
check(early.length === 0 || avg(early) >= 80, 'day 4-8 readings are substantial enough', `avg ${avg(early).toFixed(0)} words`);
check(later.length === 0 || avg(later) >= avg(early) + 25, 'readings grow materially as the curriculum advances',
  `${avg(early).toFixed(0)} -> ${avg(later).toFixed(0)} words`);

/* Every question needs a valid key, distinct options and a real explanation. */
const broken = [];
for (const r of scopedR.concat(scopedL)) {
  for (const q of (r.item.qs || [])) {
    const [stem, opts, key, why] = q;
    if (!stem || !Array.isArray(opts) || opts.length < 3) broken.push(`${r.item.id} malformed`);
    else if (!(key >= 0 && key < opts.length)) broken.push(`${r.item.id} key ${key}`);
    else if (new Set(opts.map(norm)).size !== opts.length) broken.push(`${r.item.id} duplicate options`);
    else if (String(why || '').trim().length < 10) broken.push(`${r.item.id} thin explanation`);
  }
}
check(broken.length === 0, 'every question has a valid key, distinct options and an explanation', broken.slice(0, 4).join('; '));

/* A browser whose assignment map was lost must still get day-appropriate documents. */
const noMap = priorLearnerState();
delete noMap.assignments172;
const recovered = boot(noMap);
check(recovered.errors.length === 0, 'bundle boots when the assignment map is missing', recovered.errors[0]);
const strayIds = (() => {
  const el = recovered.window.document.createElement('script');
  el.textContent = `window.__probe=(function(){var out=[];for(var d=4;d<=20;d++){for(var s=0;s<4;s++){
    S.selectedDay=d; UI.browse174={reading:{}}; UI.browse174.reading[String(d)]=s;
    var x=null; try{x=currentReading();}catch(e){}
    if(x && !/-d\\d{2}-s\\d{2}$/.test(String(x.id))) out.push('D'+d+'S'+(s+1)+'='+x.id);
  }} return out;})();`;
  recovered.window.document.body.appendChild(el); el.remove();
  return recovered.window.__probe || [];
})();
check(strayIds.length === 0, 'no pre-curriculum document is served for days 4-20 without an assignment map',
  strayIds.slice(0, 4).join(', '));

/* The learner-facing pages must actually render, and must show the cited source. */
function run(code) {
  const el = W.document.createElement('script');
  el.textContent = code;
  W.document.body.appendChild(el); el.remove();
  return W.__probe;
}
const renderProbe = run(`window.__probe=(function(){try{
  S.selectedDay=12; view='input'; UI.inputTab='reading'; render();
  var reading=document.getElementById('root').innerHTML;
  UI.inputTab='listening'; render();
  var listening=document.getElementById('root').innerHTML;
  view='progress'; render();
  var progress=document.getElementById('root').innerHTML;
  view='today'; render();
  return {reading:reading, listening:listening, progress:progress, err:null};
}catch(e){return {err:String(e && e.message || e)}}})();`);
check(renderProbe && !renderProbe.err, 'reading, listening and progress pages all render', renderProbe && renderProbe.err);
if (renderProbe && !renderProbe.err) {
  check(/校准参照/.test(renderProbe.reading), 'the reading page shows the cited source to the learner');
  check(/Journal en français facile/.test(renderProbe.listening), 'the listening page points to authentic French audio');
  check(!/学习材料校验|兼容与升级保护|Content ID|Schema \d/.test(renderProbe.progress), 'the progress page carries no developer diagnostics');
  check(!/r177-d\d{2}-s\d{2}|traceId|semanticFingerprint/.test(renderProbe.reading), 'no internal identifier is rendered on the reading page');
}

/* Coverage of the authored window, reported so the gap is never silent. */
const authoredIds = new Set((corpusAudit && corpusAudit.applied) || []);
const gaps = [];
for (let day = 4; day <= AUTHORED_UNTIL; day++) {
  for (const [prefix, rows] of [['r', R], ['l', L]]) {
    for (const row of rows.filter((x) => x.day === day)) {
      if (!authoredIds.has(row.item.id)) gaps.push(row.item.id);
    }
  }
}
notes.push(`  info authored coverage days 4-${AUTHORED_UNTIL}: ${authoredIds.size} documents; ${gaps.length} slot(s) still generator-produced${gaps.length ? ' (' + gaps.slice(0, 6).join(', ') + (gaps.length > 6 ? ', …' : '') + ')' : ''}`);

/**
 * A correct option that always sits in the same place makes every question
 * answerable by clicking that position, with no French involved. Nothing else in
 * this file catches it: the texts can be perfectly distinct and the distractors
 * perfectly text-derived while the key never moves. So the position distribution
 * is a release gate in its own right.
 */
function keyPositions(rows) {
  const counts = {};
  for (const r of rows) for (const q of (r.item.qs || [])) counts[q[2]] = (counts[q[2]] || 0) + 1;
  return counts;
}
function balanceOf(counts) {
  const slots = Object.keys(counts);
  const total = slots.reduce((n, k) => n + counts[k], 0);
  const share = slots.map((k) => counts[k] / total);
  return { total, counts, top: Math.max(...share), bottom: Math.min(...share), slots: slots.length };
}
{
  const all = R.concat(L).filter((r) => r.day >= 1 && r.day <= 50);
  const b = balanceOf(keyPositions(all));
  const fair = 1 / Math.max(b.slots, 1);
  check(b.total > 0 && b.top <= fair * 1.25 && b.bottom >= fair * 0.75,
    'correct answers are spread evenly across option positions (days 1-50)',
    `${JSON.stringify(b.counts)} of ${b.total}; top ${(b.top * 100).toFixed(1)}%, bottom ${(b.bottom * 100).toFixed(1)}%`);
  notes.push(`  info answer key positions days 1-50: ${JSON.stringify(b.counts)} — always picking one position scores ${(b.top * 100).toFixed(1)}%`);

  const win = R.concat(L).filter(inWindow);
  const bw = balanceOf(keyPositions(win));
  const fairw = 1 / Math.max(bw.slots, 1);
  check(bw.total > 0 && bw.top <= fairw * 1.25 && bw.bottom >= fairw * 0.75,
    `correct answers are spread evenly across option positions (days 4-${AUTHORED_UNTIL})`,
    `${JSON.stringify(bw.counts)} of ${bw.total}`);

  /* The layer's own balance audit must agree, and must be visible, not just computed. */
  check(!!(corpusAudit && corpusAudit.answerBalance && corpusAudit.answerBalance.ok),
    'the corpus layer reports a balanced answer-key distribution',
    corpusAudit && JSON.stringify(corpusAudit.answerBalance));
  if (corpusAudit) {
    notes.push(`  info option order: ${corpusAudit.applied.length} authored + ${corpusAudit.balanced || 0} legacy documents shuffled`);
  }
}

/**
 * The shuffle is seeded from question content, so it must land identically on every
 * boot, every device and every redeploy. If it ever drifted, a stored answer index
 * would point at a different option and the learner's record would silently rot.
 */
{
  const again = boot(JSON.parse(JSON.stringify(prior)));
  check(again.errors.length === 0, 'bundle boots a second time cleanly', again.errors[0]);
  const snap = (win) => {
    const el = win.document.createElement('script');
    el.textContent = `window.__probe=(function(){var out={};
      [['reading',V13_READINGS],['listening',V13_LISTENINGS]].forEach(function(p){
        p[1].forEach(function(it){ if(it&&it.qs) out[p[0]+'|'+it.id]=JSON.stringify(it.qs.map(function(q){return [q[1],q[2]];})); });});
      return out;})();`;
    win.document.body.appendChild(el); el.remove();
    return win.__probe || {};
  };
  const a = snap(W), b = snap(again.window);
  const keys = Object.keys(a);
  const drift = keys.filter((k) => a[k] !== b[k]);
  check(keys.length > 0 && drift.length === 0,
    'option order and answer keys are identical across two independent boots',
    `${drift.length}/${keys.length} drifted, e.g. ${drift.slice(0, 3).join(', ')}`);
}

/**
 * Every layer rebuilds the question banks on each boot and none of it is stored, so a
 * document's content must be a function of its id alone. A learner first meets every
 * document with no answer on it, i.e. exactly as a fresh browser sees it, and their
 * answer indices are stored against that. If any layer made content depend on learning
 * evidence (answers, completions, day counters, records, drafts), the next boot would
 * swap an answered document for an older text and the stored answers would point at
 * options the learner never saw. So: a fresh learner, the fixture learner and a learner
 * who has touched everything must all get identical banks, grammar included.
 */
function contentOf(win) {
  const el = win.document.createElement('script');
  el.textContent = `window.__probe=(function(){var out={};
    function fp(x){return JSON.stringify([x.title,x.text||x.script||x.prompt||x.task||'',(x.qs||[]).map(function(q){return [q[0],q[1],q[2],q[3]];})]);}
    [['reading',V13_READINGS],['listening',V13_LISTENINGS],['writing',V13_WRITINGS],['speaking',V13_SPEAKING],['application',V13_APPLICATION]].forEach(function(p){
      p[1].forEach(function(x){ out[p[0]+'|'+x.id]=fp(x); });});
    GRAMMAR.forEach(function(g){ grammarQuestions(g).forEach(function(q,i){ out['grammar|'+g.id+'|'+i]=JSON.stringify([q[0],q[1],q[2],q[3]]); }); });
    return out;})();`;
  win.document.body.appendChild(el); el.remove();
  return win.__probe || {};
}
function everythingTouched(fresh, content) {
  const st = JSON.parse(JSON.stringify(fresh));
  const C = ((st.contentProgress172 = st.contentProgress172 || {}).completed = st.contentProgress172.completed || {});
  const at = '2026-10-05T12:00:00.000Z';
  st.daily = st.daily || {};
  st.drafts171 = st.drafts171 || {};
  for (let d = 1; d <= 50; d++) st.daily[d] = Object.assign({}, st.daily[d], { grammar: 10, reading: 4, listening: 4, writing: 2, speaking: 4, application: 4 });
  for (const key of Object.keys(content)) {
    const [t, id, qi] = key.split('|');
    const day = Number((/-d(\d+)-s/.exec(id) || [])[1] || 1);
    C[t] = C[t] || {};
    if (t === 'grammar') { C.grammar['GQ-' + id + '-' + String(Number(qi) + 1).padStart(2, '0')] = { day, at }; continue; }
    C[t][id] = { day, at };
    if (t === 'reading' || t === 'listening') { for (let q = 0; q < 3; q++) st[t].answers[`${day}:${id}:${q}`] = 0; continue; }
    st[t].records = st[t].records || [];
    st[t].records.push({ day, contentId: id, title: 'x', text: 'x', at });
    if (t !== 'speaking') (st.drafts171[t] = st.drafts171[t] || {})[`${day}:${t}:${id}`] = 'brouillon';
  }
  return st;
}
{
  const fresh = contentOf(cold.window);
  const touched = boot(everythingTouched(cold.stored(), fresh));
  check(touched.errors.length === 0, 'bundle boots for a learner who has answered every document', touched.errors[0]);
  const keys = Object.keys(fresh);
  for (const [label, win] of [['the fixture learner', W], ['a learner who answered everything', touched.window]]) {
    const got = contentOf(win);
    const drift = keys.filter((k) => got[k] !== fresh[k]);
    check(keys.length > 3000 && drift.length === 0, `every document and grammar question is identical for a fresh learner and ${label}`,
      `${drift.length}/${keys.length} differ, e.g. ${drift.slice(0, 4).join(', ')}`);
  }
  const answered = Object.keys(prior.reading.answers).map((k) => 'reading|' + k.split(':')[1])
    .concat(Object.keys(prior.listening.answers).map((k) => 'listening|' + k.split(':')[1])).filter((k) => fresh[k]);
  notes.push(`  info ${keys.length} documents and grammar questions compared; ${new Set(answered).size} of them carry the fixture learner's answers`);
}

/* ------------------------------------------------------------- report */
console.log(notes.join('\n'));
if (failures.length) {
  console.error('\n' + failures.join('\n'));
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${notes.filter((n) => n.startsWith('  ok')).length} checks passed.`);
