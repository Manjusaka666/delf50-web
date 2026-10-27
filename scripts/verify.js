#!/usr/bin/env node
'use strict';
/**
 * Fast checks, no database or browser: the course data (every day), the plan
 * at every intensity, the progress engine, the state mutations, French
 * typography and the app's module graph.
 *
 * Run: node scripts/verify.js   (the API and browser flows: scripts/verify-cloud.js)
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const out = [];
let failed = 0;
function check(ok, label, detail) {
  out.push(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
  if (!ok) failed++;
}
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

async function main() {
  out.push('Course data');
  const ROOTS = { 'delf-b1': 'course', 'delf-b2': 'course/b2' };
  for (const dir of Object.values(ROOTS)) {
    const cc = spawnSync(process.execPath, [path.join(__dirname, 'check-course.js'), dir], { encoding: 'utf8' });
    check(cc.status === 0, (cc.stdout || '').trim() || `check-course ${dir}`, cc.stderr || cc.stdout);
  }

  const ci = spawnSync(process.execPath, [path.join(__dirname, 'check-i18n.js')], { encoding: 'utf8' });
  check(ci.status === 0, (ci.stdout || '').trim().split('\n').pop() || 'check-i18n', (ci.stderr || ci.stdout || '').slice(0, 600));

  // The app's modules, loaded as the browser loads them (fetch serves course/ from disk).
  globalThis.fetch = async (url) => ({ ok: true, status: 200, json: async () => readJson(String(url).replace(/^\//, '')) });
  const imp = (p) => import(path.join(ROOT, 'app', p));
  const [course, state, progress, ui] = await Promise.all([imp('course.js'), imp('state.js'), imp('progress.js'), imp('ui.js')]);

  const order = ['light', 'standard', 'high'];
  // Plans in every interface language: a translation may relabel a day, never reshape it.
  for (const [id, locale] of Object.keys(ROOTS).flatMap((id) => ['zh-CN', 'en'].map((l) => [id, l]))) {
    const K = await course.loadCourse(id, locale);
    out.push(`\nPlans · ${id} · ${locale} (${K.days} days × 3 intensities)`);
    const planErrors = [];
    for (let d = 1; d <= K.days; d++) {
      const day = await course.loadDay(d);
      const plans = order.map((k) => course.plan(day, k, state.blank()));
      order.forEach((k, i) => {
        const q = K.quotas[k], p = plans[i];
        for (const m of course.MODULES) if (p[m].length !== q[m]) planErrors.push(`${d} ${k} ${m}: ${p[m].length} ≠ ${q[m]}`);
        const prompts = p.production.reduce((n, x) => n + x.prompts.length, 0);
        if (prompts !== (day.remedial ? 3 : day.focus.length) * Math.ceil(q.production / 2)) planErrors.push(`${d} ${k} production prompts ${prompts}`);
        if (p.vocab.length !== q.vocab) planErrors.push(`${d} ${k} vocab ${p.vocab.length}`);
        if (p.production.some((x) => !x.node)) planErrors.push(`${d} ${k}: focus node missing`);
        if (i) for (const m of course.MODULES) if (plans[i - 1][m].some((x, j) => x !== p[m][j])) planErrors.push(`${d} ${k} ${m}: not an extension of ${order[i - 1]}`);
      });
      if (K.map[d - 1].title !== day.title) planErrors.push(`${d}: map title differs`);
    }
    check(!planErrors.length, 'every day has its full plan at every intensity; a higher intensity extends the lower one', planErrors.slice(0, 5));
    const R = state.blank(), last = await course.loadDay(K.days);
    state.setRemedial(R, K.days, course.weakestNodes(R));
    const ids = course.grammarIds(last, R);
    check(ids.length === K.quotas.high.grammar && (await course.loadQuestions(ids)).size === ids.length, `Day ${K.days}: remediation questions exist in the banks`, ids);
  }
  check(course.LEVELS.every((l) => (l.root ? ROOTS[l.id] === l.root.slice(1) : !ROOTS[l.id])), 'every open level of the switcher is a checked course root');
  const C = await course.loadCourse('delf-b1', 'zh-CN');

  out.push('\nState and progress');
  const S = state.blank();
  const d16 = await course.loadDay(16), p16 = course.plan(d16, 'standard', S);
  const Q16 = await course.loadQuestions(course.grammarIds(d16, S)), q16 = p16.grammar.map((id) => Q16.get(id));
  const empty = progress.dayProgress(S, d16, p16);
  check(empty.fraction === 0 && !empty.complete && progress.studyDays(S).length === 0, 'a new learner has no progress');

  const r = p16.reading[0];
  check(state.answerChoice(S, 'reading', 16, r.id, 0, r.questions[0].answer) && !state.answerChoice(S, 'reading', 16, r.id, 0, 0)
    && S.reading[state.answerKey(16, r.id, 0)] === r.questions[0].answer, 'a reading answer is final once given');
  check(!progress.itemState(S, 'reading', 16, r).done && progress.dayProgress(S, d16, p16).modules.reading.done === 0, 'a partly answered text is not done');

  const wrong = q16[0], wi = (wrong.answer + 1) % wrong.options.length;
  state.answerGrammar(S, 16, wrong, course.node(wrong.node), wi);
  check(S.errors.length === 1 && S.errors[0].original === wrong.options[wi] && S.errors[0].correct === wrong.options[wrong.answer]
    && S.grammar[state.grammarKey(16, wrong.id)].correct === false && !state.answerGrammar(S, 16, wrong, null, wrong.answer), 'a wrong grammar answer is recorded once and goes to the error book');

  // Do the whole standard plan.
  for (const q of q16.slice(1)) state.answerGrammar(S, 16, q, course.node(q.node), q.answer);
  for (const m of ['reading', 'listening']) for (const it of p16[m]) it.questions.forEach((q, i) => state.answerChoice(S, m, 16, it.id, i, q.answer));
  for (const it of p16.writing) { state.saveDraft(S, 'writing', 16, it.id, 'Un brouillon.'); state.submitText(S, 'writing', 16, it, 'Je pense que l’air de la ville est pollué.'); }
  for (const it of p16.application) state.submitText(S, 'application', 16, it, 'Je voudrais savoir…');
  for (const it of p16.speaking) state.addSpeaking(S, 16, it, null, 95.4);
  const half = p16.production.map((x) => x.prompts.length).reduce((a, b) => a + b, 0);
  p16.production.forEach((x) => x.prompts.forEach((_, i) => state.setProduction(S, 16, x.node.id, i, true)));
  for (const c of p16.vocab) state.markChunk(S, 16, c.id, c.id.endsWith('1') ? 'again' : 'known');
  const items16 = await course.reviewItems(16, S);
  for (const x of items16.slice(0, p16.targets.review)) state.answerReview(S, 16, x, x.kind === 'g' ? x.question.answer : true);
  const full = progress.dayProgress(S, d16, p16);
  check(full.complete && full.fraction === 1, 'the whole plan completes the day', full.modules);
  check(full.modules.production.done === p16.targets.production && half * 2 >= p16.targets.production, 'output practice is capped at the target');
  check(full.modules.vocab.done === p16.vocab.length && full.modules.review.done === p16.targets.review, 'every chunk self-assessed (known or again) and every review item done counts');
  check(S.writing[0].words === 9 && !Object.keys(S.drafts.writing).length && S.speaking[0].sec === 95 && S.speaking[0].clip === null, 'a submission counts its words and clears its draft; a timed round is rounded');
  const light = progress.dayProgress(S, d16, course.plan(d16, 'light')), high = progress.dayProgress(S, d16, course.plan(d16, 'high'));
  check(light.complete && !high.complete && high.modules.reading.done === p16.reading.length, 'the same records complete a lighter plan, not a higher one');
  state.setProduction(S, 16, p16.production[0].node.id, 0, false);
  check(!(state.productionKey(16, p16.production[0].node.id, 0) in S.production), 'unchecking an output prompt removes it');
  const n0 = p16.production[0].node.id, k0 = state.productionKey(16, n0, 0);
  state.saveProduction(S, 16, n0, 0, 'Je doute qu’il vienne.\nIl faut que tu partes.');
  check(S.production[k0] === true && S.drafts.production[k0].startsWith('Je doute'), 'typed output sentences are kept and mark the prompt done');
  state.saveProduction(S, 16, n0, 0, '  ');
  check(S.production[k0] === true && !(k0 in S.drafts.production), 'clearing the sentences removes the text, not the done mark');
  const sp0 = p16.speaking[0];
  state.saveDraft(S, 'speaking', 16, sp0.id, 'Plan : 1. constat 2. causes ');
  state.addSpeaking(S, 16, sp0, null, 60);
  check(S.speaking[S.speaking.length - 1].notes === 'Plan : 1. constat 2. causes' && S.drafts.speaking[state.draftKey(16, sp0.id)], 'a speaking round keeps the typed plan, which stays for the next round');
  state.markChunk(S, 16, p16.vocab[0].id, 'known');
  check(S.lexicon[`16:${p16.vocab[0].id}`] === 'known' && !state.answerReview(S, 16, items16[0], 0), 'the latest self-assessment of a chunk counts; a review item is done once');
  const sd = progress.studyDays(S);
  check(sd.length === 1 && sd[0].day === 16 && sd[0].first && sd[0].last, 'study days come from the records', sd);
  check(progress.grammarAccuracy(S).answered === q16.length && progress.grammarAccuracy(S).correct === q16.length - 1, 'grammar accuracy counts every answer');
  const errs = S.errors.length;
  state.resolveError(S, 0);
  check(S.errors.length === errs - 1, 'a mastered error leaves the error book');

  out.push('\nSpaced review');
  const g16 = items16.filter((x) => x.kind === 'g'), v16 = items16.filter((x) => x.kind === 'v');
  const srcs = [...new Set(items16.map((x) => x.src))];
  check(items16.length === C.quotas.high.review && g16.length && v16.length && srcs.every((s) => [15, 13, 9, 2].includes(s)) && srcs[0] === 15,
    'review draws grammar and chunks from Days 15, 13, 9 and 2 (1, 3, 7, 14 days back), nearest first', srcs);
  check(JSON.stringify((await course.reviewItems(16, S)).map((x) => x.key)) === JSON.stringify(items16.map((x) => x.key)), 'the review sequence is stable');
  const r1 = await course.reviewItems(1, state.blank());
  check(r1.length === C.quotas.high.review && r1.every((x) => x.src === 1), 'Day 1 reviews its own material');

  out.push('\nRemediation (Days 41–50)');
  const R = state.blank();
  const sub = (await course.loadQuestions(['subjonctif-01', 'subjonctif-02', 'subjonctif-03'])), hyp = await course.loadQuestions(['hypothesis-01']);
  for (const q of sub.values()) state.answerGrammar(R, 25, q, course.node(q.node), (q.answer + 1) % q.options.length);
  for (const q of hyp.values()) state.answerGrammar(R, 15, q, course.node(q.node), (q.answer + 1) % q.options.length);
  const weak = course.weakestNodes(R);
  check(weak[0] === 'subjonctif' && weak[1] === 'hypothesis' && weak.length === 3, 'the weakest points come first (accuracy, then practice)', weak);
  const d41 = await course.loadDay(41);
  state.setRemedial(R, 41, weak);
  const ids41 = course.grammarIds(d41, R), n41 = course.node('subjonctif');
  check(ids41.length === 12 && ids41.filter((id) => id.startsWith('subjonctif-')).length === 6 && ids41[0] === `subjonctif-${String(n41.taught + 1).padStart(2, '0')}`,
    'Day 41: 12 questions, half on the weakest point, starting after what Days 1–40 taught', ids41);
  const before = course.grammarIds(d41, R).join();
  state.answerGrammar(R, 41, (await course.loadQuestions([ids41[0]])).get(ids41[0]), n41, 0);
  check(course.grammarIds(d41, R).join() === before, 'once opened, a remediation day keeps its questions whatever the learner answers');
  state.setRemedial(R, 42, ['subjonctif', 'pc', 'present']);
  const ids42 = course.grammarIds(await course.loadDay(42), R);
  check(ids42[0] === `subjonctif-${String(n41.taught + 7).padStart(2, '0')}` && (await course.loadQuestions(ids42)).size === 12, 'the next remediation day continues each bank where the previous one stopped', ids42.slice(0, 3));

  const N = state.normalize({ day: 99, intensity: 'max', startedAt: 5, onboarded: 'yes', reading: [], writing: {}, junk: 1, drafts: { writing: { a: 'b' } } });
  check(N.day === 1 && N.intensity === 'standard' && N.startedAt === null && N.onboarded === false && !('junk' in N)
    && Array.isArray(N.writing) && !Array.isArray(N.reading) && N.drafts.writing.a === 'b' && ['application', 'speaking', 'production'].every((k) => typeof N.drafts[k] === 'object'), 'a stored state is reduced to the known shape', N);
  check(state.countWords('Aujourd’hui, l’air est-il pollué ? 85 % oui.') === 6, 'words are counted like DELF counts them');
  const sp = [['remet  en Cause', 'remet en cause', true], ['remetencause', 'remet en cause', true], ['Je regrette mais', 'Je regrette, mais', true],
    ["s'il vous plaît", 's’il vous plaît', true], ['coeur', 'cœur', true], ["s'il vous plait", 's’il vous plaît', false],
    ['peut être', 'peut-être', false], ['remettre en cause', 'remet en cause', false], ['  ', '', false]];
  const spBad = sp.filter(([a, b, ok]) => state.spelledRight(a, b) !== ok);
  check(!spBad.length, 'a typed chunk must be spelled exactly (accents, apostrophes, hyphens); spaces, case and punctuation do not count', spBad);

  out.push('\nInterface languages');
  // The same learner, the same answers, in each interface language: the records must not differ.
  const neutral = (o) => JSON.stringify(o, (k, v) => (['at', 'answeredAt', 'startedAt'].includes(k) ? undefined : v));
  const session = async (locale) => {
    await course.loadCourse('delf-b1', locale);
    const L = state.blank(), day = await course.loadDay(16), p = course.plan(day, 'high', L);
    const Q = await course.loadQuestions(course.grammarIds(day, L));
    for (const id of p.grammar) { const q = Q.get(id); state.answerGrammar(L, 16, q, course.node(q.node), (q.answer + 1) % q.options.length); }
    for (const x of await course.reviewItems(16, L)) {
      const q = x.question;
      state.answerReview(L, 16, x, q ? (q.answer + 1) % q.options.length : false, q ? course.node(q.node) : null);
    }
    return { L, why: Q.get(p.grammar[0]).why, title: day.canDo };
  };
  const zh = await session('zh-CN'), en = await session('en');
  check(zh.why !== en.why && zh.title !== en.title, 'the English interface shows the translated explanations and goals', [zh.why, en.why]);
  check(zh.L.errors.length > 0 && neutral(zh.L) === neutral(en.L), 'answers given in English are recorded exactly as in Chinese (stems, explanations, grammar points)');
  await course.loadCourse('delf-b1', 'zh-CN');

  out.push('\nSpeech');
  // A device's speech engine: it speaks each utterance at once and reports its end.
  const said = [];
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  globalThis.speechSynthesis = { speaking: false, pending: false, paused: false, addEventListener() {}, cancel() {}, pause() {}, resume() {},
    getVoices: () => [{ name: 'Thomas', lang: 'fr-FR', voiceURI: 'thomas', localService: true }],
    speak(u) { said.push(u.text); setTimeout(() => u.onend && u.onend({}), 1); } };
  const speech = await imp('speech.js');
  const seg = speech.segments(['— Bonjour. Ça va ?\n— Oui, merci.', 'Le <b>narrateur</b> parle. Fin.']);
  const segOk = JSON.stringify(seg.map((s) => [s.text, s.para, s.speaker, s.dialogue, s.first])) === JSON.stringify([
    ['Bonjour.', 0, 0, true, true], ['Ça va ?', 0, 0, true, false], ['Oui, merci.', 0, 1, true, true],
    ['Le narrateur parle.', 1, 0, false, true], ['Fin.', 1, 0, false, false]]);
  check(segOk, 'a script is read sentence by sentence; dialogue turns alternate speakers; tags are not read', seg);
  const quoted = speech.segments(['Il m’a dit « conduite hésitante ». Puis il est parti.', 'Elle a demandé : « Vous venez ? ». Oui.']).map((s) => s.text);
  check(quoted.every((s) => /[\p{L}\p{N}]/u.test(s)), 'no sentence is punctuation alone (a closing « ». » stays with its sentence)', quoted);
  const long = 'Les mesures montrent pourtant que le temps de parcours augmente très peu en ville, de l’ordre d’une minute sur un trajet de vingt minutes, parce que ce sont les feux, et non la vitesse maximale, qui déterminent la durée réelle des déplacements quotidiens.';
  const cut = speech.parts(long);
  check(speech.parts('Bonjour Marie.').length === 1 && cut.length > 1 && cut.every((p) => p.length <= 170) && cut.join(' ') === long,
    'a long sentence is spoken in clause-sized parts (network voices stop after ~15 s), nothing lost', cut);
  // Every course recording, played to its end, returns to the start and can be played again (DELF plays most recordings twice).
  const script = ['— Bonjour. Vous avez réservé ?\n— Oui, au nom de Martin.', long];
  const playedOut = async () => { for (let k = 0; k < 400 && speech.tts.state !== 'idle'; k++) await new Promise((r) => setTimeout(r, 10)); return speech.tts.state === 'idle'; };
  speech.play('t:1', script);
  const first = await playedOut(), once = said.length;
  speech.toggle('t:1', script);
  const second = speech.tts.state === 'playing' && await playedOut();
  check(first && second && once === 3 + cut.length && said.length === 2 * once && speech.tts.at === 0,
    'a recording played to the end goes back to the start, and plays in full again', { first, second, once, said: said.length, state: speech.tts.state });
  const voices = [{ name: 'Thomas', lang: 'fr-FR' }, { name: 'Amélie', lang: 'fr-CA' }, { name: 'Audrey (Premium)', lang: 'fr-FR' },
    { name: 'Samantha', lang: 'en-US' }, { name: 'Jacques', lang: 'fr_FR' }, { name: 'Grandma', lang: 'fr-FR' }];
  const ranked = voices.filter((v) => speech.score(v) > -Infinity).sort((a, b) => speech.score(b) - speech.score(a)).map((v) => v.name);
  check(JSON.stringify(ranked) === JSON.stringify(['Audrey (Premium)', 'Thomas', 'Jacques', 'Amélie', 'Grandma']),
    'French voices are ranked: premium first, then the exam’s French, other French, novelty voices last; other languages never', ranked);

  out.push('\nFrench typography');
  const NN = ' ';
  const cases = [['Pourquoi ?', `Pourquoi${NN}?`], ['Attention : non', `Attention${NN}: non`], ['10:30', '10:30'], ['« oui »', `«${NN}oui${NN}»`],
    ["l'eau", 'l’eau'], ['Quoi!', `Quoi${NN}!`], ['https://x.fr', 'https://x.fr']];
  const bad = cases.filter(([a, b]) => ui.fr(a) !== b).map(([a, b]) => [a, ui.fr(a), b]);
  check(!bad.length, 'narrow no-break spaces before ? ! ; : and inside « », typographic apostrophes', bad);
  check(String(ui.frText('<b>gras</b> & <script>x</script><br>')) === '<b>gras</b> &amp; &lt;script&gt;x&lt;/script&gt;<br>', 'course text keeps only <b>, <i> and <br>; anything else is escaped');
  check(String(ui.html`<p title="${'"x"'}">${'<i>'}</p>`) === '<p title="&quot;x&quot;">&lt;i&gt;</p>', 'templates escape every value');

  out.push('\nApp');
  const seen = new Set(), missing = [];
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    if (!fs.existsSync(file)) { missing.push(path.relative(ROOT, file)); return; }
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/^import [^'"]*['"](\.[^'"]+)['"]/gm)) walk(path.resolve(path.dirname(file), m[1]));
  };
  walk(path.join(ROOT, 'app/main.js'));
  const files = fs.readdirSync(path.join(ROOT, 'app'), { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => path.join(ROOT, 'app', f));
  const unused = files.filter((f) => !seen.has(f));
  check(!missing.length && !unused.length, `every app module is reachable from main.js and exists (${seen.size} modules)`, { missing, unused: unused.map((f) => path.relative(ROOT, f)) });
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const refs = [...index.matchAll(/(?:href|src)="(\/[^"]+)"/g)].map((m) => m[1]);
  check(refs.length >= 5 && refs.every((r) => fs.existsSync(path.join(ROOT, r))), 'index.html references only files that exist', refs);
  check(!/localStorage|sessionStorage|indexedDB/.test(files.map((f) => fs.readFileSync(f, 'utf8')).join('\n')), 'the app never uses browser storage');

  console.log(out.join('\n'));
  console.log(failed ? `\n${failed} check(s) FAILED.` : '\nAll checks passed.');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.log(out.join('\n')); console.error(e); process.exit(1); });
