#!/usr/bin/env node
'use strict';
/**
 * Validates the course data in course/, day by day (1-50).
 *
 * Every day must be complete for the highest intensity (Days 41–50: grammar is
 * drawn from the question banks at run time), every question in every bank must
 * be answerable (distinct options, a valid key), no development marker may
 * reach a learner, and no text or chunk may repeat across the 50 days.
 *
 * Run: node scripts/check-course.js
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'course');
const course = JSON.parse(fs.readFileSync(path.join(DIR, 'course.json'), 'utf8'));
const nodes = JSON.parse(fs.readFileSync(path.join(DIR, 'grammar.json'), 'utf8'));
const days = Array.from({ length: course.days }, (_, i) => JSON.parse(fs.readFileSync(path.join(DIR, 'days', String(i + 1).padStart(2, '0') + '.json'), 'utf8')));

const failures = [];
let checks = 0;
const fail = (where, what) => failures.push(`${where}: ${what}`);
const check = (ok, where, what) => { checks++; if (!ok) fail(where, what); };

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
    question(where, q);
    bank.set(q.id, q);
  });
}

function question(where, q) {
  check(q.stem && plain(q.stem).length > 2, where, 'empty stem');
  check(Array.isArray(q.options) && q.options.length >= 3, where, 'fewer than 3 options');
  check(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, where, `invalid key ${q.answer}`);
  check(new Set(q.options.map(norm)).size === q.options.length, where, 'duplicate options');
  check(!LEAK.test([q.stem, ...q.options, q.why].join(' ')), where, 'development marker');
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
      const body = m === 'reading' ? x.text.join(' ') : m === 'listening' ? x.script.join(' ') : m === 'application' ? x.task : x.prompt;
      check(words(body) >= (m === 'reading' || m === 'listening' ? (d.day <= 2 ? 20 : 45) : 8), where, `body too short (${words(body)} words)`);
      check(!LEAK.test(x.title + ' ' + body), where, 'development marker');
      check(!SCAFFOLD.test(body), where, 'generator scaffolding');
      const key = m + '|' + norm(body);
      check(!seen.body.has(key), where, `same text as ${seen.body.get(key)}`); seen.body.set(key, where);
      if (m === 'reading' || m === 'listening') {
        check(x.questions.length >= 3, where, 'fewer than 3 questions');
        x.questions.forEach((q, qi) => question(`${where} Q${qi + 1}`, q));
        check(new Set(x.questions.map((q) => norm(q.stem))).size === x.questions.length, where, 'repeated stem');
      }
      if (m === 'writing') check(x.minWords >= 60 && x.checklist.length, where, 'no word target or checklist');
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

// Each bank starts with exactly the questions Days 1–40 use (in order); remediation continues from there.
for (const n of nodes) {
  const t = taught[n.id] || new Set();
  check(n.taught === t.size && [...t].every((id) => Number(id.slice(n.id.length + 1)) <= t.size), `grammar ${n.id}`, `taught ${n.taught}, Days 1–40 use ${t.size} (must be the bank's first ones)`);
}

if (failures.length) {
  console.error(failures.slice(0, 60).join('\n'));
  console.error(`\n${failures.length} problem(s) in ${checks} checks.`);
  process.exit(1);
}
console.log(`course/ is valid: ${days.length} days, ${seen.id.size} items, ${seen.chunk.size} chunks, ${bank.size} grammar questions in ${nodes.length} banks — ${checks} checks.`);
