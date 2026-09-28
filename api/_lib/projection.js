'use strict';
/**
 * Derives the relational read model from a web-app state document (Schema 2).
 *
 * It is deliberately tolerant: every field is optional, unexpected shapes are
 * skipped, and nothing here can reject a push. The state document stays the
 * source of truth; the projection only has to be faithful to what is present.
 *
 * diff(prevState, nextState) returns the minimal upsert/delete set, so a push
 * that changes one answer writes one row, not the learner's whole history.
 */
const crypto = require('crypto');

const PROJECTION_VERSION = 1;
const OBJECTIVE = ['reading', 'listening'];
const PRODUCTION = ['writing', 'application', 'speaking'];

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const intOrNull = (v) => (Number.isInteger(v) ? v : (typeof v === 'string' && /^-?\d{1,9}$/.test(v) ? Number(v) : null));
const dayOrNull = (v) => { const n = intOrNull(v); return n !== null && n >= 1 && n <= 366 ? n : null; };
const nonNeg = (v) => (Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);
const text = (v, max = 400) => (typeof v === 'string' ? v.slice(0, max) : null);
const bool = (v) => (typeof v === 'boolean' ? v : null);
const hashKey = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 40);

function ts(v) {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const d = new Date(v);
  const t = d.getTime();
  return Number.isFinite(t) && t > 946684800000 && t < 4102444800000 ? d.toISOString() : null;
}

/** Recursively sorted JSON, so equal content always yields an equal string. */
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (isObj(v)) return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}

function stats(S) {
  const g = isObj(S.grammar) ? S.grammar : {};
  const r = isObj(S.reading) ? S.reading : {};
  const l = isObj(S.listening) ? S.listening : {};
  const w = isObj(S.writing) ? S.writing : {};
  const a = isObj(S.application) ? S.application : {};
  const sp = isObj(S.speaking) ? S.speaking : {};
  return {
    selected_day: dayOrNull(S.selectedDay),
    intensity: text(S.intensity, 40),
    app_version: text(S.version, 40),
    started_at: ts(S.startedAt),
    last_saved_at: ts(S.lastSavedAt),
    grammar_attempts: nonNeg(g.attempts), grammar_correct: nonNeg(g.correct),
    reading_attempts: nonNeg(r.attempts), reading_correct: nonNeg(r.correct),
    listening_attempts: nonNeg(l.attempts), listening_correct: nonNeg(l.correct),
    writing_count: nonNeg(w.count), application_count: nonNeg(a.count),
    speaking_count: nonNeg(sp.count), speaking_total_sec: nonNeg(sp.totalSec),
    errors_count: Array.isArray(S.errors) ? S.errors.length : 0
  };
}

function daily(S) {
  const out = new Map();
  const d = isObj(S.daily) ? S.daily : {};
  const pc = isObj(S.practiceCounters172) ? S.practiceCounters172 : {};
  const hist = isObj(S.dayHistory171) ? S.dayHistory171 : {};
  const days = new Set([...Object.keys(d), ...Object.keys(pc), ...Object.keys(hist)]);
  for (const k of days) {
    const day = dayOrNull(k);
    if (!day) continue;
    const metrics = {};
    for (const src of [d[k], pc[k]]) {
      if (!isObj(src)) continue;
      for (const [mk, mv] of Object.entries(src)) if (typeof mv === 'number' && Number.isFinite(mv)) metrics[mk] = mv;
    }
    const h = isObj(hist[k]) ? hist[k] : {};
    if (Number.isFinite(h.actions)) metrics.actions = h.actions;
    out.set(String(day), {
      day, metrics,
      first_activity_at: ts(h.firstActivityAt),
      last_activity_at: ts(h.lastActivityAt)
    });
  }
  return out;
}

function answers(S) {
  const out = new Map();
  for (const module of OBJECTIVE) {
    const m = isObj(S[module]) && isObj(S[module].answers) ? S[module].answers : {};
    for (const [key, sel] of Object.entries(m)) {
      if (key.length > 300) continue;
      const parts = key.split(':');
      let day = null, contentId = null, q = null;
      if (parts.length >= 3) {
        day = dayOrNull(parts[0]);
        q = intOrNull(parts[parts.length - 1]);
        contentId = parts.slice(1, -1).join(':');
      } else if (parts.length === 2) {
        // Pre-Schema-2 key "<documentIndex>:<question>".
        contentId = `legacy-index-${parts[0]}`;
        q = intOrNull(parts[1]);
      }
      out.set(`${module}|${key}`, {
        module, answer_key: key, day, content_id: text(contentId, 200), q_index: q,
        selected: intOrNull(sel), correct: null, answered_at: null, detail: null
      });
    }
  }
  const review = isObj(S.grammarReview202) ? S.grammarReview202 : {};
  for (const [key, v] of Object.entries(review)) {
    if (!isObj(v) || key.length > 300) continue;
    out.set(`grammar|${key}`, {
      module: 'grammar', answer_key: key, day: dayOrNull(v.day),
      content_id: text(v.contentId, 200), q_index: 0,
      selected: intOrNull(v.selectedIndex), correct: bool(v.correct), answered_at: ts(v.answeredAt),
      detail: {
        nodeId: text(v.nodeId, 80), question: text(v.question, 1000),
        options: Array.isArray(v.options) ? v.options.slice(0, 12).map((o) => text(o, 400)) : null,
        correctIndex: intOrNull(v.correctIndex)
      }
    });
  }
  return out;
}

function completions(S) {
  const out = new Map();
  const c = isObj(S.contentProgress172) && isObj(S.contentProgress172.completed) ? S.contentProgress172.completed : {};
  for (const [module, items] of Object.entries(c)) {
    if (!isObj(items) || module.length > 40) continue;
    for (const [id, v] of Object.entries(items)) {
      if (id.length > 200) continue;
      const e = isObj(v) ? v : {};
      out.set(`${module}|${id}`, {
        module, content_id: id, day: dayOrNull(e.day), correct: bool(e.correct),
        first_completed_at: ts(e.firstCompletedAt), last_completed_at: ts(e.lastCompletedAt)
      });
    }
  }
  return out;
}

const PRODUCTION_KNOWN = new Set(['day', 'title', 'text', 'words', 'sec', 'id', 'at', 'contentId']);

function productions(S) {
  const out = new Map();
  for (const module of PRODUCTION) {
    const recs = isObj(S[module]) && Array.isArray(S[module].records) ? S[module].records : [];
    for (const r of recs) {
      if (!isObj(r)) continue;
      const identity = stable(r);
      const key = hashKey(`${module}|${identity}`);
      const detail = {};
      for (const [k, v] of Object.entries(r)) if (!PRODUCTION_KNOWN.has(k)) detail[k] = v;
      out.set(`${module}|${key}`, {
        module, record_key: key, day: dayOrNull(r.day), content_id: text(r.contentId, 200),
        title: text(r.title, 400), body: typeof r.text === 'string' ? r.text.slice(0, 20000) : null,
        words: Number.isInteger(r.words) ? r.words : null,
        duration_sec: Number.isFinite(r.sec) ? Math.round(r.sec) : null,
        clip_id: text(r.id, 200), created_at: ts(r.at),
        detail: Object.keys(detail).length ? detail : null
      });
    }
  }
  return out;
}

function errors(S) {
  const out = new Map();
  const list = Array.isArray(S.errors) ? S.errors : [];
  for (const e of list) {
    if (!isObj(e)) continue;
    const key = hashKey(stable(e));
    out.set(key, { item_key: key, day: dayOrNull(e.day), payload: e, created_at: ts(e.at) });
  }
  return out;
}

function extract(S) {
  if (!isObj(S)) S = {};
  return {
    stats: stats(S),
    daily: daily(S),
    answers: answers(S),
    completions: completions(S),
    productions: productions(S),
    errors: errors(S)
  };
}

const TABLES = ['daily', 'answers', 'completions', 'productions', 'errors'];

/**
 * prev may be null (no previous head, or projection version changed): the
 * result then carries rebuild:true and every row.
 */
function diff(prevState, nextState) {
  const next = extract(nextState);
  const out = { rebuild: prevState == null, stats: next.stats };
  const prev = prevState == null ? null : extract(prevState);
  for (const t of TABLES) {
    const upsert = [];
    const del = [];
    for (const [k, row] of next[t]) {
      if (!prev || !prev[t].has(k) || stable(prev[t].get(k)) !== stable(row)) upsert.push(row);
    }
    if (prev) for (const k of prev[t].keys()) if (!next[t].has(k)) del.push(t === 'daily' ? Number(k) : k);
    out[t] = { upsert, delete: del };
  }
  return out;
}

module.exports = { extract, diff, stable, PROJECTION_VERSION };
