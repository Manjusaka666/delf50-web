/**
 * Comprehension answers, as the official papers ask them (pure functions, no storage).
 *
 *   choice — {options, answer}: the index of the option chosen.
 *   cite   — {options: [Vrai, Faux], answer, cite}: true or false, justified by quoting the text;
 *            stored as {c: the option chosen, j: the quotation}. As in the exam, the point needs both:
 *            the right option and a quotation of the passage that proves it.
 *   open   — {open: true, accept, need?, model}: a short answer written out; stored as the text.
 *            accept lists the elements the answer must contain (each one a list of accepted
 *            wordings); need is how many of them it must contain (all by default).
 *
 * Wordings are compared without case, accents or punctuation, word by word.
 */
export const fold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[^a-z0-9]+/g, ' ').trim();
const words = (s) => fold(s).split(' ').filter(Boolean);

export const kindOf = (q) => (q.open ? 'open' : q.cite ? 'cite' : 'choice');

/** The quotation is the expected passage: five words of it in a row, or most of its content words. */
export function quotes(text, cite) {
  const a = words(text), b = words(String(cite).replace(/…|\[…\]/g, ' '));
  if (a.length < 3 || !b.length) return false;
  const run = Math.min(5, b.length), hay = ` ${a.join(' ')} `;
  for (let i = 0; i + run <= b.length; i++) if (hay.includes(` ${b.slice(i, i + run).join(' ')} `)) return true;
  const content = b.filter((w) => w.length > 3), have = new Set(a);
  return content.length > 0 && content.filter((w) => have.has(w)).length / content.length >= 0.6;
}

/** How many of the expected elements a written answer contains. */
export function elementsFound(text, accept) {
  const hay = ` ${words(text).join(' ')} `;
  return accept.filter((alts) => alts.some((alt) => { const w = words(alt).join(' '); return w && hay.includes(` ${w} `); })).length;
}

export const needed = (q) => (Number.isInteger(q.need) ? q.need : q.accept.length);

export const answered = (v) => v !== undefined && v !== null;

export function isCorrect(q, v) {
  if (!answered(v)) return false;
  if (q.open) return typeof v === 'string' && elementsFound(v, q.accept) >= needed(q);
  if (q.cite) return typeof v === 'object' && v.c === q.answer && quotes(v.j, q.cite);
  return v === q.answer;
}

/** A right answer, as a learner would give it. */
export const expected = (q) => (q.open ? q.model : q.cite ? { c: q.answer, j: q.cite } : q.answer);

/** The option chosen (choice and cite), or null. */
export const chosen = (q, v) => (q.open || !answered(v) ? null : q.cite ? v.c : v);
