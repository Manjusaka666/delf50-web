/**
 * Progress, derived from the records alone (pure functions, no storage).
 *
 * An item is done when its work exists: every question of a text answered, a
 * text submitted, a speaking round recorded or practised, a chunk self-assessed,
 * a review item done. A module is done when
 * the day's plan for the chosen intensity is covered; the day when every module is.
 */
import { DAYS, answerKey, grammarKey, productionKey } from './state.js';
import { nodeOf } from './course.js';

export function questionState(S, module, day, item, q) {
  const v = S[module][answerKey(day, item.id, q)];
  return v === undefined ? null : { selected: v, correct: v === item.questions[q].answer };
}

export function itemState(S, module, day, item) {
  if (module === 'reading' || module === 'listening') {
    const answered = item.questions.filter((_, q) => S[module][answerKey(day, item.id, q)] !== undefined).length;
    return { done: answered === item.questions.length, answered, total: item.questions.length };
  }
  const recs = S[module].filter((r) => r.day === day && r.contentId === item.id);
  return { done: recs.length > 0, records: recs };
}

export const grammarAnswer = (S, day, qid) => S.grammar[grammarKey(day, qid)] || null;
export const chunkMark = (S, day, id) => S.lexicon[`${day}:${id}`] || null;
export const reviewDone = (S, day) => Object.keys(S.review).filter((k) => k.startsWith(`${day}:`)).length;

/** Per module: {done, total} for the plan, plus the overall fraction and completion. */
export function dayProgress(S, day, plan) {
  const count = (module, items) => items.filter((x) => itemState(S, module, day.day, x).done).length;
  const doneProd = plan.production.reduce((n, p) => n + p.prompts.filter((_, i) => S.production[productionKey(day.day, p.node.id, i)]).length, 0);
  const m = {
    grammar: { done: plan.grammar.filter((id) => grammarAnswer(S, day.day, id)).length, total: plan.grammar.length },
    production: { done: Math.min(plan.targets.production, doneProd * 2), total: plan.targets.production },
    reading: { done: count('reading', plan.reading), total: plan.reading.length },
    listening: { done: count('listening', plan.listening), total: plan.listening.length },
    writing: { done: count('writing', plan.writing), total: plan.writing.length },
    speaking: { done: count('speaking', plan.speaking), total: plan.speaking.length },
    application: { done: count('application', plan.application), total: plan.application.length },
    vocab: { done: plan.vocab.filter((c) => chunkMark(S, day.day, c.id)).length, total: plan.vocab.length },
    review: { done: Math.min(plan.targets.review, reviewDone(S, day.day)), total: plan.targets.review }
  };
  const parts = Object.values(m);
  const fraction = parts.reduce((s, x) => s + (x.total ? Math.min(1, x.done / x.total) : 1), 0) / parts.length;
  return { modules: m, fraction, complete: parts.every((x) => x.done >= x.total) };
}

/** Days with any learning record, with the time of the first and last one. */
export function studyDays(S) {
  const days = new Map();
  const touch = (day, at) => {
    const d = Number(day);
    if (!(d >= 1 && d <= DAYS)) return;
    const x = days.get(d) || { day: d, first: null, last: null, records: 0 };
    x.records++;
    if (at) { if (!x.first || at < x.first) x.first = at; if (!x.last || at > x.last) x.last = at; }
    days.set(d, x);
  };
  for (const m of ['reading', 'listening']) for (const k of Object.keys(S[m])) touch(k.split(':')[0]);
  for (const k of Object.keys(S.production)) touch(k.split(':')[0]);
  for (const g of Object.values(S.grammar)) touch(g.day, g.answeredAt);
  for (const m of ['writing', 'application', 'speaking']) for (const r of S[m]) touch(r.day, r.at);
  for (const k of Object.keys(S.lexicon)) touch(k.split(':')[0]);
  for (const r of Object.values(S.review)) touch(r.day, r.at);
  return [...days.values()].sort((a, b) => a.day - b.day);
}

/** Correct / answered for grammar across all days. */
export function grammarAccuracy(S) {
  const v = Object.values(S.grammar);
  return { correct: v.filter((x) => x.correct).length, answered: v.length };
}

/** Correct / answered for reading or listening on the given loaded days. */
export function choiceAccuracy(S, module, loadedDays) {
  let correct = 0, answered = 0;
  for (const day of loadedDays) for (const item of day.items[module]) item.questions.forEach((q, i) => {
    const v = S[module][answerKey(day.day, item.id, i)];
    if (v === undefined) return;
    answered++; if (v === q.answer) correct++;
  });
  return { correct, answered };
}

/** Accuracy per grammar point (grammar and review answers), weakest first. */
export function nodeMastery(S) {
  const m = {};
  const add = (id, ok) => { const x = m[id] || (m[id] = { id, answered: 0, correct: 0 }); x.answered++; if (ok) x.correct++; };
  for (const g of Object.values(S.grammar)) add(g.nodeId, g.correct);
  for (const r of Object.values(S.review)) if (r.kind === 'g') add(nodeOf(r.contentId), r.correct);
  return Object.values(m).sort((a, b) => a.correct / a.answered - b.correct / b.answered || b.answered - a.answered);
}
