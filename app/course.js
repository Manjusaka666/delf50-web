/**
 * Course data (course/): the 50-day map, the grammar points, one file per day
 * and one question bank per grammar point (course/questions/). A day is fixed
 * material — except Days 41–50, whose grammar is drawn from the learner's
 * weakest points and fixed when the day is first opened. The intensity only
 * decides how much of a day is due.
 */

let course = null, nodes = null;
const days = new Map();

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

export async function loadCourse() {
  if (!course) [course, nodes] = await Promise.all([json('/course/course.json'), json('/course/grammar.json')]);
  return course;
}

export const getCourse = () => course;
export const node = (id) => nodes.find((n) => n.id === id) || null;
export const allNodes = () => nodes;

/** One day's material; the neighbours are fetched in the background. */
export function loadDay(d) {
  if (!days.has(d)) {
    const p = json(`/course/days/${String(d).padStart(2, '0')}.json`);
    days.set(d, p);
    p.catch(() => days.delete(d));
  }
  return days.get(d);
}
export function prefetch(d) { for (const n of [d + 1, d - 1]) if (n >= 1 && n <= course.days) loadDay(n).catch(() => {}); }

export const MODULES = ['grammar', 'reading', 'listening', 'writing', 'speaking', 'application'];

// ── grammar questions: one bank per node (course/questions/<node>.json), loaded when needed ──
const banks = new Map();
export const nodeOf = (qid) => qid.replace(/-\d+$/, '');
function loadBank(id) {
  if (!banks.has(id)) {
    const p = json(`/course/questions/${id}.json`).then((qs) => qs.map((q) => Object.assign({ node: id }, q)));
    banks.set(id, p);
    p.catch(() => banks.delete(id));
  }
  return banks.get(id);
}
/** The questions with these ids, as a Map id → question. */
export async function loadQuestions(ids) {
  const nodeIds = [...new Set(ids.map(nodeOf))];
  const all = (await Promise.all(nodeIds.map(loadBank))).flat();
  const byId = new Map(all.map((q) => [q.id, q]));
  return new Map(ids.filter((id) => byId.has(id)).map((id) => [id, byId.get(id)]));
}

// ── Days 41–50: remediation on the learner's three weakest grammar points ──
const REMEDIAL_FROM = 41, WEAK_UNTIL_DAY = 30, WEAK = 3;

/** The weakest grammar points taught by Day 30: lowest accuracy first (unpractised = 50 %), then most practised, then earliest. */
export function weakestNodes(S) {
  const stat = {};
  for (const g of Object.values(S.grammar)) {
    const x = stat[g.nodeId] || (stat[g.nodeId] = { a: 0, c: 0 });
    x.a++; if (g.correct) x.c++;
  }
  return nodes.filter((n) => n.firstDay <= WEAK_UNTIL_DAY).map((n) => {
    const x = stat[n.id] || { a: 0, c: 0 };
    return { id: n.id, a: x.a, score: x.a ? x.c / x.a : 0.5, day: n.firstDay };
  }).sort((p, q) => p.score - q.score || q.a - p.a || p.day - q.day).slice(0, WEAK).map((x) => x.id);
}

/** A remediation day's grammar points: the ones fixed when the day was first opened, else the current weakest. */
export const remedialNodes = (S, d) => (S.remedial[String(d)] || weakestNodes(S));

/** 12 questions: half on the weakest point, then 30 % and 20 %, interleaved; each point continues its bank after what was already taught. */
function remedialIds(S, d) {
  const ids = remedialNodes(S, d), total = course.quotas.high.grammar;
  const a = Math.ceil(total * 0.5), b = Math.ceil((total - a) * 0.6), left = [a, b, total - a - b].slice(0, ids.length);
  const seq = [];
  while (seq.length < total && left.some((x) => x > 0)) left.forEach((x, i) => { if (x > 0 && seq.length < total) { seq.push(ids[i]); left[i]--; } });
  const used = {};
  for (let p = REMEDIAL_FROM; p < d; p++) for (const id of S.remedial[String(p)] ? remedialSequenceNodes(S.remedial[String(p)]) : []) used[id] = (used[id] || 0) + 1;
  const ord = {};
  return seq.map((id) => {
    const n = node(id), k = (n.taught + (used[id] || 0) + (ord[id] = (ord[id] || 0) + 1) - 1) % n.bank;
    return `${id}-${String(k + 1).padStart(2, '0')}`;
  });
}
function remedialSequenceNodes(ids) {
  const total = course.quotas.high.grammar, a = Math.ceil(total * 0.5), b = Math.ceil((total - a) * 0.6);
  return ids.flatMap((id, i) => Array(i === 0 ? a : i === 1 ? b : total - a - b).fill(id));
}

/** The day's grammar question ids in order (the plan is a prefix). */
export const grammarIds = (day, S) => (day.remedial ? remedialIds(S, day.day) : day.grammar);
const focusIds = (day, S) => (day.remedial ? remedialNodes(S, day.day) : day.focus);

/** What is due on a day at an intensity: a prefix of the day's fixed sequences. */
export function plan(day, intensity, S) {
  const q = course.quotas[intensity] || course.quotas.standard;
  return {
    grammar: grammarIds(day, S).slice(0, q.grammar),
    reading: day.items.reading.slice(0, q.reading),
    listening: day.items.listening.slice(0, q.listening),
    writing: day.items.writing.slice(0, q.writing),
    speaking: day.items.speaking.slice(0, q.speaking),
    application: day.items.application.slice(0, q.application),
    production: productionPrompts(focusIds(day, S), q.production),
    vocab: day.vocab.slice(0, q.vocab),
    targets: { production: q.production, review: q.review }
  };
}

/** Output practice: each focus node's prompts (padded like a teacher would), two sentences each. */
function productionPrompts(ids, target) {
  const need = Math.ceil(target / 2);
  return ids.map((id) => {
    const n = node(id), prompts = n.prompts.slice(0, need);
    while (prompts.length < need) prompts.push(`用 ${n.name} 再造 2 个和今天主题有关的新句子，并口头说一遍。`);
    return { node: n, prompts };
  });
}

// ── Spaced review: earlier days' grammar and chunks, at growing intervals ──
const GAPS = [1, 3, 7, 14, 21, 30, 45];

/**
 * The day's review sequence (the plan is a prefix): from the nearest earlier
 * days first, alternating a grammar question and a chunk, so each day
 * resurfaces at 1, 3, 7, 14, 21, 30 and 45 days. Day 1 reviews itself.
 */
export async function reviewItems(d, S) {
  const total = course.quotas.high.review;
  const sources = GAPS.map((g) => d - g).filter((s) => s >= 1);
  if (!sources.length) sources.push(d);
  const srcDays = await Promise.all(sources.map(loadDay));
  const out = [], seen = new Set();
  const add = (x) => { if (out.length < total && !seen.has(x.key)) { seen.add(x.key); out.push(x); } };
  for (let r = 0; out.length < total && r < total; r++) {
    for (const src of srcDays) {
      const g = src.remedial ? (S.remedial[String(src.day)] ? remedialIds(S, src.day) : []) : src.grammar;
      if (g.length) { const id = g[(d + r) % g.length]; add({ key: `g:${src.day}:${id}`, kind: 'g', src: src.day, id }); }
      const v = src.vocab;
      if (v.length) { const c = v[(d + 3 * r) % v.length]; add({ key: `v:${src.day}:${c.id}`, kind: 'v', src: src.day, id: c.id, chunk: c }); }
    }
  }
  const qs = await loadQuestions(out.filter((x) => x.kind === 'g').map((x) => x.id));
  for (const x of out) if (x.kind === 'g') x.question = qs.get(x.id);
  return out.filter((x) => x.kind === 'v' || x.question);
}
