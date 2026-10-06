/**
 * Course data (course/): the 50-day map, grammar nodes and one file per day.
 * A day is fixed material; the intensity only decides how much of it is due.
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

/** What is due on a day at an intensity: a prefix of the day's fixed sequences. */
export function plan(day, intensity) {
  const q = course.quotas[intensity] || course.quotas.standard;
  return {
    grammar: day.grammar.slice(0, q.grammar),
    reading: day.items.reading.slice(0, q.reading),
    listening: day.items.listening.slice(0, q.listening),
    writing: day.items.writing.slice(0, q.writing),
    speaking: day.items.speaking.slice(0, q.speaking),
    application: day.items.application.slice(0, q.application),
    production: productionPrompts(day, q.production),
    targets: { production: q.production, vocab: q.vocab, review: q.review }
  };
}

/** Output practice: each focus node's prompts (padded like a teacher would), two sentences each. */
function productionPrompts(day, target) {
  const need = Math.ceil(target / 2);
  return day.focus.map((id) => {
    const n = node(id), prompts = n.prompts.slice(0, need);
    while (prompts.length < need) prompts.push(`用 ${n.name} 再造 2 个和今天主题有关的新句子，并口头说一遍。`);
    return { node: n, prompts };
  });
}
