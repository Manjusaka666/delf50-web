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
  const cc = spawnSync(process.execPath, [path.join(__dirname, 'check-course.js')], { encoding: 'utf8' });
  check(cc.status === 0, (cc.stdout || '').trim() || 'check-course', cc.stderr || cc.stdout);

  // The app's modules, loaded as the browser loads them (fetch serves course/ from disk).
  globalThis.fetch = async (url) => ({ ok: true, status: 200, json: async () => readJson(String(url).replace(/^\//, '')) });
  const imp = (p) => import(path.join(ROOT, 'app', p));
  const [course, state, progress, ui] = await Promise.all([imp('course.js'), imp('state.js'), imp('progress.js'), imp('ui.js')]);
  const C = await course.loadCourse();

  out.push('\nPlans (50 days × 3 intensities)');
  const order = ['light', 'standard', 'high'];
  const planErrors = [];
  for (let d = 1; d <= C.days; d++) {
    const day = await course.loadDay(d);
    const plans = order.map((k) => course.plan(day, k));
    order.forEach((k, i) => {
      const q = C.quotas[k], p = plans[i];
      for (const m of course.MODULES) if (p[m].length !== q[m]) planErrors.push(`${d} ${k} ${m}: ${p[m].length} ≠ ${q[m]}`);
      const prompts = p.production.reduce((n, x) => n + x.prompts.length, 0);
      if (prompts !== day.focus.length * Math.ceil(q.production / 2)) planErrors.push(`${d} ${k} production prompts ${prompts}`);
      if (p.production.some((x) => !x.node)) planErrors.push(`${d} ${k}: focus node missing`);
      if (i) for (const m of course.MODULES) if (plans[i - 1][m].some((x, j) => x !== p[m][j])) planErrors.push(`${d} ${k} ${m}: not an extension of ${order[i - 1]}`);
    });
    if (C.map[d - 1].title !== day.title) planErrors.push(`${d}: map title differs`);
  }
  check(!planErrors.length, 'every day has its full plan at every intensity; a higher intensity extends the lower one', planErrors.slice(0, 5));

  out.push('\nState and progress');
  const S = state.blank();
  const d16 = await course.loadDay(16), p16 = course.plan(d16, 'standard');
  const empty = progress.dayProgress(S, d16, p16);
  check(empty.fraction === 0 && !empty.complete && progress.studyDays(S).length === 0, 'a new learner has no progress');

  const r = p16.reading[0];
  check(state.answerChoice(S, 'reading', 16, r.id, 0, r.questions[0].answer) && !state.answerChoice(S, 'reading', 16, r.id, 0, 0)
    && S.reading[state.answerKey(16, r.id, 0)] === r.questions[0].answer, 'a reading answer is final once given');
  check(!progress.itemState(S, 'reading', 16, r).done && progress.dayProgress(S, d16, p16).modules.reading.done === 0, 'a partly answered text is not done');

  const wrong = p16.grammar[0], wi = (wrong.answer + 1) % wrong.options.length;
  state.answerGrammar(S, 16, wrong, course.node(wrong.node), wi);
  check(S.errors.length === 1 && S.errors[0].original === wrong.options[wi] && S.errors[0].correct === wrong.options[wrong.answer]
    && S.grammar[state.grammarKey(16, wrong.id)].correct === false && !state.answerGrammar(S, 16, wrong, null, wrong.answer), 'a wrong grammar answer is recorded once and goes to the error book');

  // Do the whole standard plan.
  for (const q of p16.grammar.slice(1)) state.answerGrammar(S, 16, q, course.node(q.node), q.answer);
  for (const m of ['reading', 'listening']) for (const it of p16[m]) it.questions.forEach((q, i) => state.answerChoice(S, m, 16, it.id, i, q.answer));
  for (const it of p16.writing) { state.saveDraft(S, 'writing', 16, it.id, 'Un brouillon.'); state.submitText(S, 'writing', 16, it, 'Je pense que l’air de la ville est pollué.'); }
  for (const it of p16.application) state.submitText(S, 'application', 16, it, 'Je voudrais savoir…');
  for (const it of p16.speaking) state.addSpeaking(S, 16, it, null, 95.4);
  const half = p16.production.map((x) => x.prompts.length).reduce((a, b) => a + b, 0);
  p16.production.forEach((x) => x.prompts.forEach((_, i) => state.setProduction(S, 16, x.node.id, i, true)));
  state.setPractice(S, 16, 'vocab', 40);
  state.setPractice(S, 16, 'review', 15);
  const full = progress.dayProgress(S, d16, p16);
  check(full.complete && full.fraction === 1, 'the whole plan completes the day', full.modules);
  check(full.modules.production.done === p16.targets.production && half * 2 >= p16.targets.production && full.modules.vocab.done === p16.targets.vocab, 'output practice and counters are capped at the target');
  check(S.writing[0].words === 9 && !Object.keys(S.drafts.writing).length && S.speaking[0].sec === 95 && S.speaking[0].clip === null, 'a submission counts its words and clears its draft; a timed round is rounded');
  const light = progress.dayProgress(S, d16, course.plan(d16, 'light')), high = progress.dayProgress(S, d16, course.plan(d16, 'high'));
  check(light.complete && !high.complete && high.modules.reading.done === p16.reading.length, 'the same records complete a lighter plan, not a higher one');
  state.setProduction(S, 16, p16.production[0].node.id, 0, false);
  check(!(state.productionKey(16, p16.production[0].node.id, 0) in S.production), 'unchecking an output prompt removes it');
  state.setPractice(S, 16, 'vocab', 0); state.setPractice(S, 16, 'review', 0);
  check(!('16' in S.practice), 'zeroed counters leave no record');
  const sd = progress.studyDays(S);
  check(sd.length === 1 && sd[0].day === 16 && sd[0].first && sd[0].last, 'study days come from the records', sd);
  check(progress.grammarAccuracy(S).answered === p16.grammar.length && progress.grammarAccuracy(S).correct === p16.grammar.length - 1, 'grammar accuracy counts every answer');
  state.resolveError(S, 0);
  check(S.errors.length === 0, 'a mastered error leaves the error book');

  const N = state.normalize({ day: 99, intensity: 'max', startedAt: 5, onboarded: 'yes', reading: [], writing: {}, junk: 1, drafts: { writing: { a: 'b' } } });
  check(N.day === 1 && N.intensity === 'standard' && N.startedAt === null && N.onboarded === false && !('junk' in N)
    && Array.isArray(N.writing) && !Array.isArray(N.reading) && N.drafts.writing.a === 'b' && typeof N.drafts.application === 'object', 'a stored state is reduced to the known shape', N);
  check(state.countWords('Aujourd’hui, l’air est-il pollué ? 85 % oui.') === 6, 'words are counted like DELF counts them');

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
