#!/usr/bin/env node
'use strict';
/**
 * Validates one course's data, day by day: course/ (DELF B1, the default) or
 * another course root such as course/b2/ (DELF B2).
 *
 * Every day must be complete for the highest intensity (Days 41–50: grammar is
 * drawn from the question banks at run time), every question in every bank must
 * be answerable (distinct options, a valid key), no development marker may
 * reach a learner, and no text or chunk may repeat across the 50 days (writing
 * tasks may not even resemble each other: distinct titles, distinct consignes).
 *
 * Run: node scripts/check-course.js [course/b2]
 */
const fs = require('fs');
const path = require('path');

const answers = require('../app/answers.js');

const DIR = path.join(__dirname, '..', process.argv[2] || 'course');
const course = JSON.parse(fs.readFileSync(path.join(DIR, 'course.json'), 'utf8'));
const nodes = JSON.parse(fs.readFileSync(path.join(DIR, 'grammar.json'), 'utf8'));
const days = Array.from({ length: course.days }, (_, i) => JSON.parse(fs.readFileSync(path.join(DIR, 'days', String(i + 1).padStart(2, '0') + '.json'), 'utf8')));

const failures = [];
let checks = 0;
const fail = (where, what) => failures.push(`${where}: ${what}`);
const check = (ok, where, what) => { checks++; if (!ok) fail(where, what); };

// The level of the official papers, below which no text, recording or task may fall (course.json: floors).
const FLOORS = course.floors || {};
const MODULES = { reading: 'R', listening: 'L', writing: 'W', speaking: 'S', application: 'A' };
const MAX = Object.fromEntries(Object.keys(MODULES).map((m) => [m, course.quotas.high[m]]));
const LEAK = /\b(?:traceId|sourceSeed|contentId|familyId|semanticFingerprint|Dossier\s+[RLWSA]\d|Audio\s+[RL]\d{2}-\d|[rlwsa]1(?:76|77|81)-d\d|GQ\d*-)/i;
const SCAFFOLD = /Le dossier porte la référence|Information\s+·|Message\s+·|La décision finale n’est donc pas fondée/i;
const plain = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const norm = (s) => plain(s).toLowerCase().replace(/[^a-zà-ÿ0-9 ]+/gi, ' ').replace(/\s+/g, ' ').trim();
const words = (s) => norm(s).split(' ').filter(Boolean).length;

const nodeIds = new Set(nodes.map((n) => n.id));
for (const n of nodes) {
  check(n.name && n.level && n.use, `grammar ${n.id}`, 'node without name, level or use');
  check(Array.isArray(n.prompts) && n.prompts.length >= 1, `grammar ${n.id}`, 'no production prompt');
  check(n.guide && Array.isArray(n.guide.formula) && n.guide.formula.length, `grammar ${n.id}`, 'no guide');
}

const REMEDIAL_FROM = 41;
const nodeOf = (id) => id.replace(/-\d+$/, '');
const node = (id) => nodes.find((n) => n.id === id);
const bank = new Map(), taught = {};
for (const n of nodes) {
  const qs = JSON.parse(fs.readFileSync(path.join(DIR, 'questions', n.id + '.json'), 'utf8'));
  check(n.bank === qs.length && qs.length >= course.quotas.high.grammar, `grammar ${n.id}`, `bank of ${qs.length} questions, node says ${n.bank}`);
  qs.forEach((q, i) => {
    const where = `bank ${n.id} ${i + 1}`;
    check(q.id === `${n.id}-${String(i + 1).padStart(2, '0')}` && !bank.has(q.id), where, `id ${q.id}`);
    question(where, q, true);
    bank.set(q.id, q);
  });
}

function question(where, q, bankQuestion, body) {
  check(q.stem && plain(q.stem).length > 2, where, 'empty stem');
  check(!LEAK.test([q.stem, ...(q.options || []), q.why, q.cite, q.model].join(' ')), where, 'development marker');
  if (q.open) {
    // A short answer: the elements it must contain, and a model answer that contains them.
    check(!bankQuestion && !q.options && Array.isArray(q.accept) && q.accept.length && q.accept.every((g) => Array.isArray(g) && g.length && g.every((w) => plain(w).length)), where, 'short answer without accepted elements');
    check(q.need === undefined || (Number.isInteger(q.need) && q.need >= 1 && q.need <= q.accept.length), where, `need ${q.need}`);
    check(q.model && answers.isCorrect(q, answers.expected(q)), where, 'the model answer does not contain the expected elements');
    check(!answers.isCorrect(q, q.stem), where, 'the question itself contains the answer');
    return;
  }
  check(Array.isArray(q.options) && q.options.length >= (bankQuestion ? 3 : 2), where, bankQuestion ? 'fewer than 3 options' : 'fewer than 2 options');
  check(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, where, `invalid key ${q.answer}`);
  check(new Set(q.options.map(norm)).size === q.options.length, where, 'duplicate options');
  if (q.cite) {
    // True or false, justified: the passage to quote is in the text, word for word.
    check(q.options.length === 2 && /^vrai$/i.test(q.options[0]) && /^faux$/i.test(q.options[1]), where, 'a justified question is true or false');
    check(q.cite.split(/\s*(?:…|\[…\])\s*/).every((part) => !part.trim() || norm(body).includes(norm(part).replace(/[.,;:!?]+$/, ''))), where, `passage to quote not in the text: ${q.cite}`);
    check(answers.isCorrect(q, answers.expected(q)) && !answers.isCorrect(q, { c: q.answer, j: q.stem }), where, 'the passage to quote cannot be told from the statement');
  }
}

// Multiple choice the official way: the right option cannot be spotted without reading. It is not
// the longest (or the shortest) one much more often than chance, not longer or shorter on average,
// and absolute words (toujours, jamais…) do not mark the wrong ones.
const ABSOLUTE = /\b(toujours|jamais|aucun|aucune|seulement|uniquement|totalement|interdit|interdite|tous|toutes|rien|personne|exclusivement|systématiquement|entièrement|complètement)\b/i;
const tells = {};
const grid = { n: 0, oui: 0 };
function choiceTells(m, x) {
  const t = tells[m] || (tells[m] = { n: 0, longest: 0, shortest: 0, right: 0, wrong: 0, rightAbs: 0, wrongAbs: 0, nr: 0, nw: 0 });
  for (const q of x.questions) {
    // Names (who says what) and options of a few words carry no length tell.
    if (q.open || q.cite || q.options.length < 3 || q.options.every((o) => words(o) <= 3)) continue;
    const len = q.options.map((o) => plain(o).length), max = Math.max(...len);
    if (len.filter((l) => l === max).length === 1) { t.n++; if (len[q.answer] === max) t.longest++; if (len[q.answer] === Math.min(...len)) t.shortest++; }
    q.options.forEach((o, k) => { if (k === q.answer) { t.right += len[k]; t.nr++; t.rightAbs += ABSOLUTE.test(o); } else { t.wrong += len[k]; t.nw++; t.wrongAbs += ABSOLUTE.test(o); } });
  }
}

const seen = { body: new Map(), id: new Set(), grammar: new Map(), chunk: new Map() };
for (const d of days) {
  const at = `Day ${d.day}`;
  check(d.title && d.phase && d.level && d.canDo, at, 'curriculum entry incomplete');
  for (const [m, letter] of Object.entries(MODULES)) {
    const list = d.items[m];
    check(Array.isArray(list) && list.length === MAX[m], at, `${m}: ${list && list.length} items, need ${MAX[m]}`);
    (list || []).forEach((x, i) => {
      const where = `${at} ${m} ${i + 1}`;
      if (!x) { fail(where, 'missing'); return; }
      check(x.id === `${letter}${String(d.day).padStart(2, '0')}-${i + 1}`, where, `id ${x.id}`);
      check(!seen.id.has(x.id), where, `id ${x.id} repeated`); seen.id.add(x.id);
      check(x.title && plain(x.title).length > 2, where, 'no title');
      const body = m === 'reading' ? x.text.join(' ') : m === 'listening' ? x.script.join(' ') : m === 'application' ? x.task : [x.prompt, ...(x.trigger ? x.trigger.text : [])].join(' ');
      check(words(body) >= (m === 'reading' || m === 'listening' ? (d.day <= 2 ? 20 : 45) : 8), where, `body too short (${words(body)} words)`);
      check(!LEAK.test(x.title + ' ' + body), where, 'development marker');
      check(!SCAFFOLD.test(body), where, 'generator scaffolding');
      const key = m + '|' + norm(body);
      check(!seen.body.has(key), where, `same text as ${seen.body.get(key)}`); seen.body.set(key, where);
      if (m === 'reading' || m === 'listening') {
        check(x.questions.length >= 3, where, 'fewer than 3 questions');
        const floor = FLOORS[m];
        if (floor) {
          check(words(body) >= floor.words, where, `${words(body)} words, the exam level needs ${floor.words}`);
          check(x.questions.length >= floor.questions, where, `${x.questions.length} questions, the exam level needs ${floor.questions}`);
          // No key may be guessed from its position: the right answers of the multiple-choice questions are spread.
          const keys = x.questions.filter((q) => q.options && q.options.length > 2).map((q) => q.answer);
          check(keys.length < 4 || new Set(keys).size > 1, where, 'every key in the same position');
        }
        x.questions.forEach((q, qi) => question(`${where} Q${qi + 1}`, q, false, body));
        choiceTells(m, x);
        check(new Set(x.questions.map((q) => norm(q.stem))).size === x.questions.length, where, 'repeated stem');
        // One point, one question: two multiple-choice questions never rest on the same quotation
        // (the grid's closing « which one fits every criterion » question sums up the others by design).
        const proofs = x.questions.filter((q) => q.options && q.options[0] !== 'Oui' && !q.cite && !/correspond à tous/.test(q.stem) && plain(q.why || '').length > 12)
          .map((q) => norm(String(q.why).split('»')[0]));
        check(new Set(proofs).size === proofs.length, where, 'two questions test the same passage');
        for (const q of x.questions) if (q.options && q.options.length === 2 && q.options[0] === 'Oui' && q.options[1] === 'Non') { grid.n++; grid.oui += q.answer === 0; }
      }
      if (m === 'writing') check(x.minWords >= (FLOORS.writing || 60) && x.checklist.length, where, `word target ${x.minWords}, the exam asks for ${FLOORS.writing || 60}`);
      if (m === 'writing' && x.model) check(words(x.model.join(' ')) >= x.minWords, where, 'model answer shorter than the word target');
      if (x.trigger) check(x.trigger.title && Array.isArray(x.trigger.text) && words(x.trigger.text.join(' ')) >= 20, where, 'trigger document without title or text');
      if (x.followUps) check(Array.isArray(x.followUps) && x.followUps.every((f) => plain(f).length > 8), where, 'empty follow-up question');
      if (m === 'speaking') check(x.targetSeconds >= 30 && x.checklist.length, where, 'no target time or checklist');
      if (m === 'speaking' && x.doc) check(days.some((o) => o.day <= d.day && o.items.reading.some((r) => r.id === x.doc)), where, `unknown document ${x.doc}`);
      if (m === 'application') check(x.chunks.length, where, 'no chunks');
    });
  }
  if (d.day >= REMEDIAL_FROM) {
    // Days 41–50 draw their grammar from the learner's weakest points (app/course.js).
    check(d.remedial === true && !d.grammar && !d.focus, at, 'a remediation day has no fixed grammar or focus');
    // …and add optional B1→B2 bridge questions.
    check(Array.isArray(d.bridge) && d.bridge.length >= 3 && d.bridge.every((id) => bank.has(id) && node(nodeOf(id)).firstDay >= REMEDIAL_FROM), at, 'bridge questions missing or unknown');
  } else {
    check(!d.remedial && d.grammar.length === course.quotas.high.grammar, at, `grammar: ${d.grammar && d.grammar.length} questions, need ${course.quotas.high.grammar}`);
    check(new Set(d.grammar).size === d.grammar.length, at, 'grammar question repeated within the day');
    d.grammar.forEach((id, i) => {
      const where = `${at} grammar ${i + 1} (${id})`;
      check(bank.has(id), where, 'not in the question bank');
      (taught[nodeOf(id)] = taught[nodeOf(id)] || new Set()).add(id);
      // The 6.5 h plan never repeats a question; the 8 h extras are the next day's first questions by design.
      if (i >= course.quotas.standard.grammar) return;
      const first = seen.grammar.get(id);
      if (first === undefined) seen.grammar.set(id, d.day); else fail(where, `also on Day ${first}`);
    });
    check(d.focus.every((n) => nodeIds.has(n)), at, 'unknown focus node');
  }
  check(Array.isArray(d.vocab) && d.vocab.length === course.quotas.high.vocab, at, `vocab: ${d.vocab && d.vocab.length} chunks, need ${course.quotas.high.vocab}`);
  (d.vocab || []).forEach((c, i) => {
    const where = `${at} chunk ${i + 1}`;
    check(c.id === `V${String(d.day).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`, where, `id ${c.id}`);
    check(c.fr && c.zh && c.ex && c.exZh, where, 'chunk without fr, zh, ex or exZh');
    check((String(c.ex).match(/\[\[/g) || []).length === 1 && /\[\[[^\]]+\]\]/.test(c.ex), where, 'example must mark the chunk once with [[ ]]');
    check(/^([RLWSA]\d{2}-\d|topic)$/.test(c.src || ''), where, `source ${c.src}`);
    check(!LEAK.test(`${c.fr} ${c.ex}`), where, 'development marker');
    const k = norm(c.fr);
    check(!seen.chunk.has(k), where, `"${c.fr}" also on ${seen.chunk.get(k)}`); seen.chunk.set(k, at);
  });
}

// Writing tasks are distinct situations, not one template with the topic swapped: no two share a title, and no two
// consignes share more than 45 % of their word trigrams (a template reused across days shares 80–95 %).
const trigrams = (s) => { const w = norm(s).split(' ').filter(Boolean); return new Set(w.slice(2).map((x, i) => `${w[i]} ${w[i + 1]} ${x}`)); };
const tasks = days.flatMap((d) => d.items.writing.map((x) => ({ id: x.id, title: norm(x.title), grams: trigrams(x.prompt) })));
tasks.forEach((a, i) => tasks.slice(i + 1).forEach((b) => {
  check(a.title !== b.title, `writing ${b.id}`, `same title as ${a.id}`);
  const shared = [...a.grams].filter((g) => b.grams.has(g)).length / Math.max(1, Math.min(a.grams.size, b.grams.size));
  check(shared <= 0.45, `writing ${b.id}`, `consigne ${Math.round(shared * 100)} % the same as ${a.id}`);
}));

// Each bank starts with exactly the questions Days 1–40 use (in order); remediation continues from there.
for (const n of nodes) {
  const t = taught[n.id] || new Set();
  check(n.taught === t.size && [...t].every((id) => Number(id.slice(n.id.length + 1)) <= t.size), `grammar ${n.id}`, `taught ${n.taught}, Days 1–40 use ${t.size} (must be the bank's first ones)`);
}

for (const [m, t] of Object.entries(tells)) {
  const longest = t.n ? t.longest / t.n : 0, shortest = t.n ? t.shortest / t.n : 0, ratio = t.nr && t.nw ? (t.right / t.nr) / (t.wrong / t.nw) : 1;
  const absRight = t.nr ? t.rightAbs / t.nr : 0, absWrong = t.nw ? t.wrongAbs / t.nw : 0;
  if (process.env.TELLS) console.log(`${m}: right option longest ${(100 * longest).toFixed(0)}% shortest ${(100 * shortest).toFixed(0)}% of ${t.n}, length right/wrong ${ratio.toFixed(2)}, absolute words right ${(100 * absRight).toFixed(1)}% wrong ${(100 * absWrong).toFixed(1)}%`);
  check(longest <= 0.4, `${m}`, `the right option is the longest in ${(100 * longest).toFixed(0)}% of the multiple-choice questions (chance: 33%)`);
  check(shortest <= 0.45, `${m}`, `the right option is the shortest in ${(100 * shortest).toFixed(0)}% of the multiple-choice questions`);
  check(ratio <= 1.15 && ratio >= 0.87, `${m}`, `right options are ${ratio.toFixed(2)}× as long as wrong ones`);
  check(absWrong <= absRight + 0.04, `${m}`, `absolute words mark the wrong options (${(100 * absWrong).toFixed(1)}% of wrong options, ${(100 * absRight).toFixed(1)}% of right ones)`);
}

// The criteria grid is not a « mostly yes » exercise: about as many « non » as the official papers.
if (grid.n) {
  if (process.env.TELLS) console.log(`grid: « oui » ${(100 * grid.oui / grid.n).toFixed(0)}% of ${grid.n}`);
  check(grid.oui / grid.n <= 0.68 && grid.oui / grid.n >= 0.45, 'reading grid', `« oui » is the answer in ${(100 * grid.oui / grid.n).toFixed(0)}% of the criteria`);
}

if (failures.length) {
  console.error(failures.slice(0, 60).join('\n'));
  console.error(`\n${failures.length} problem(s) in ${checks} checks.`);
  process.exit(1);
}
console.log(`${path.relative(path.join(__dirname, '..'), DIR)}/ (${course.id}) is valid: ${days.length} days, ${seen.id.size} items, ${seen.chunk.size} chunks, ${bank.size} grammar questions in ${nodes.length} banks — ${checks} checks.`);
