/**
 * The learner's state: settings plus learning records. Nothing derived is stored —
 * progress, completion and statistics are computed from the records (progress.js).
 *
 *   day, intensity, startedAt, onboarded             settings (study_state document)
 *   reading / listening   "<day>:<item>:<q>" = option index
 *   grammar               "<day>:<question>" = {day, contentId, nodeId, question, selectedIndex, correctIndex, correct, answeredAt}
 *   production            "<day>:<node>:<prompt>" = true
 *   writing / application [{day, contentId, title, text, words?, at}]
 *   speaking              [{clip, day, contentId, title, sec, at}]   clip = recording in R2, null when practised offline
 *   errors                [{skill, original, correct, why, at}]
 *   drafts                {writing: {"<day>:<item>": text}, application: {…}}
 *   practice              "<day>" = {vocab, review}
 */

export const DAYS = 50;
export const INTENSITIES = ['light', 'standard', 'high'];

export function blank() {
  return {
    day: 1, intensity: 'standard', startedAt: null, onboarded: false,
    reading: {}, listening: {}, grammar: {}, production: {},
    writing: [], application: [], speaking: [], errors: [],
    drafts: { writing: {}, application: {} }, practice: {}
  };
}

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const list = (v) => (Array.isArray(v) ? v : []);

/** A state from the server, reduced to the known shape (anything else is dropped). */
export function normalize(raw) {
  const r = obj(raw), s = blank();
  if (Number.isInteger(r.day) && r.day >= 1 && r.day <= DAYS) s.day = r.day;
  if (INTENSITIES.includes(r.intensity)) s.intensity = r.intensity;
  if (typeof r.startedAt === 'string') s.startedAt = r.startedAt;
  s.onboarded = r.onboarded === true;
  for (const k of ['reading', 'listening', 'grammar', 'production', 'practice']) s[k] = obj(r[k]);
  for (const k of ['writing', 'application', 'speaking', 'errors']) s[k] = list(r[k]);
  s.drafts = { writing: obj(obj(r.drafts).writing), application: obj(obj(r.drafts).application) };
  return s;
}

export const answerKey = (day, itemId, q) => `${day}:${itemId}:${q}`;
export const grammarKey = (day, qid) => `${day}:${qid}`;
export const productionKey = (day, node, i) => `${day}:${node}:${i}`;
export const draftKey = (day, itemId) => `${day}:${itemId}`;
export const countWords = (text) => (String(text || '').match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) || []).length;

const now = () => new Date().toISOString();
function started(S) { if (!S.startedAt) S.startedAt = now(); }

/** Reading or listening: an answer is final once given. */
export function answerChoice(S, module, day, itemId, q, option) {
  const k = answerKey(day, itemId, q);
  if (S[module][k] !== undefined) return false;
  S[module][k] = option;
  started(S);
  return true;
}

/** Grammar: the answer as given, with the question it answered; a wrong one goes to the error book. */
export function answerGrammar(S, day, q, node, selected) {
  const k = grammarKey(day, q.id);
  if (S.grammar[k]) return false;
  const correct = selected === q.answer, at = now();
  S.grammar[k] = { day, contentId: q.id, nodeId: q.node, question: q.stem, selectedIndex: selected, correctIndex: q.answer, correct, answeredAt: at };
  if (!correct) S.errors.push({ skill: node ? node.name : q.node, original: q.options[selected], correct: q.options[q.answer], why: q.why || '', at });
  started(S);
  return true;
}

export function setProduction(S, day, node, i, done) {
  const k = productionKey(day, node, i);
  if (done) S.production[k] = true; else delete S.production[k];
  if (done) started(S);
}

export function saveDraft(S, module, day, itemId, text) {
  const k = draftKey(day, itemId);
  if (String(text || '').trim()) S.drafts[module][k] = text; else delete S.drafts[module][k];
}

export function submitText(S, module, day, item, text) {
  const rec = { day, contentId: item.id, title: item.title, text: String(text).trim(), at: now() };
  if (module === 'writing') rec.words = countWords(text);
  S[module].push(rec);
  delete S.drafts[module][draftKey(day, item.id)];
  started(S);
  return rec;
}

export function addSpeaking(S, day, item, clip, sec) {
  S.speaking.push({ clip: clip || null, day, contentId: item.id, title: item.title, sec: Math.max(0, Math.round(sec || 0)), at: now() });
  started(S);
}

export function resolveError(S, index) { S.errors.splice(index, 1); }

export function setPractice(S, day, field, value) {
  const p = Object.assign({ vocab: 0, review: 0 }, S.practice[String(day)]);
  p[field] = Math.max(0, Math.round(value));
  if (p.vocab || p.review) S.practice[String(day)] = p; else delete S.practice[String(day)];
  if (value > 0) started(S);
}

export function setDay(S, day) { if (Number.isInteger(day) && day >= 1 && day <= DAYS) S.day = day; }
export function setIntensity(S, v) { if (INTENSITIES.includes(v)) S.intensity = v; }
