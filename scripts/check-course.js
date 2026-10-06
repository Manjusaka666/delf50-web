#!/usr/bin/env node
'use strict';
/**
 * Validates the course data in course/, day by day (1-50).
 *
 * Every day must be complete for the highest intensity, every question must be
 * answerable (distinct options, a valid key, an explanation where one exists),
 * no development marker may reach a learner, and no material may repeat across
 * the 50 days.
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

function question(where, q) {
  check(q.stem && plain(q.stem).length > 2, where, 'empty stem');
  check(Array.isArray(q.options) && q.options.length >= 3, where, 'fewer than 3 options');
  check(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, where, `invalid key ${q.answer}`);
  check(new Set(q.options.map(norm)).size === q.options.length, where, 'duplicate options');
  check(!LEAK.test([q.stem, ...q.options, q.why].join(' ')), where, 'development marker');
}

const seen = { body: new Map(), id: new Set(), grammar: new Map() };
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
      if (m === 'application') check(x.chunks.length, where, 'no chunks');
    });
  }
  check(d.grammar.length === course.quotas.high.grammar, at, `grammar: ${d.grammar.length} questions, need ${course.quotas.high.grammar}`);
  check(new Set(d.grammar.map((q) => q.id)).size === d.grammar.length, at, 'grammar question repeated within the day');
  d.grammar.forEach((q, i) => {
    const where = `${at} grammar ${i + 1} (${q.id})`;
    check(nodeIds.has(q.node), where, `unknown node ${q.node}`);
    question(where, q);
    // The 6.5 h plan never repeats a question before the mock-exam phase (days 41-50 revisit
    // earlier ones on purpose); the 8 h extras are the next day's first questions by design.
    if (i >= course.quotas.standard.grammar) return;
    const first = seen.grammar.get(q.id);
    if (first === undefined) seen.grammar.set(q.id, d.day);
    else if (d.day <= 40) fail(where, `also on Day ${first}`);
  });
  check(d.focus.every((n) => nodeIds.has(n)), at, 'unknown focus node');
}

if (failures.length) {
  console.error(failures.slice(0, 60).join('\n'));
  console.error(`\n${failures.length} problem(s) in ${checks} checks.`);
  process.exit(1);
}
console.log(`course/ is valid: ${days.length} days, ${seen.id.size} items, ${new Set(days.flatMap((d) => d.grammar.map((q) => q.id))).size} grammar questions — ${checks} checks.`);
