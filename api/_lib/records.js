'use strict';
/**
 * The learning state as database entities.
 *
 * The web app keeps one state object S. Its learning records live in their
 * own tables (COLLECTIONS below); everything else (plan, routing, counters,
 * settings) is the study_state document. bootstrap() rebuilds S from the
 * tables; sync() applies one batch of fine-grained changes in one
 * transaction, idempotently, so a retried request is harmless.
 *
 * A record's fields go to typed columns when the value has the column's type,
 * anything else to `extra`, so every record reads back exactly as written.
 * (A two-level map keeps its first level, e.g. the module names, in the
 * document, so empty modules survive.)
 *
 * Wire format of a change batch (see cloud/delf50-cloud.js):
 *   doc: [[path, value] | [path]]                     set / delete in the document
 *   ops: {name: {set: [[key, value, pos?]], del: [key]}}  key = [part, …]
 */
const db = require('./db');

const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TYPES = {
  int: ['int', (v) => Number.isInteger(v) && Math.abs(v) < 2 ** 31],
  text: ['text', (v) => typeof v === 'string'],
  bool: ['boolean', (v) => typeof v === 'boolean'],
  ts: ['timestamptz', (v) => typeof v === 'string' && ISO_MS.test(v) && new Date(v).toISOString() === v]
};

const answers = (path, table) => ({ path, table, kind: 'map', keys: ['answer_key'], scalar: ['selected', 'int'], touch: 'answered_at', parse: answerKey });
const productions = (path, table, fields) => ({ path, table, kind: 'list', keys: ['item_key'], fields });

const COLLECTIONS = {
  reading: answers(['reading', 'answers'], 'reading_answers'),
  listening: answers(['listening', 'answers'], 'listening_answers'),
  grammar: {
    path: ['grammarReview202'], table: 'grammar_attempts', kind: 'map', keys: ['answer_key'], conflict: ['answer_key', 'answered_at'],
    fields: [['day', 'day', 'int'], ['content_id', 'contentId', 'text'], ['node_id', 'nodeId', 'text'], ['question', 'question', 'text'],
      ['selected', 'selectedIndex', 'int'], ['correct_index', 'correctIndex', 'int'], ['correct', 'correct', 'bool'], ['answered_at', 'answeredAt', 'ts']]
  },
  writing: productions(['writing', 'records'], 'writing_submissions', [['day', 'day', 'int'], ['content_id', 'contentId', 'text'],
    ['title', 'title', 'text'], ['body', 'text', 'text'], ['word_count', 'words', 'int'], ['created_at', 'at', 'ts']]),
  application: productions(['application', 'records'], 'application_submissions', [['day', 'day', 'int'], ['content_id', 'contentId', 'text'],
    ['title', 'title', 'text'], ['body', 'text', 'text'], ['created_at', 'at', 'ts']]),
  speaking: productions(['speaking', 'records'], 'speaking_attempts', [['clip_id', 'id', 'text'], ['day', 'day', 'int'],
    ['content_id', 'contentId', 'text'], ['title', 'title', 'text'], ['duration_sec', 'sec', 'int'], ['created_at', 'at', 'ts']]),
  errors: productions(['errors'], 'error_items', [['skill', 'skill', 'text'], ['original', 'original', 'text'],
    ['correction', 'correct', 'text'], ['explanation', 'why', 'text'], ['created_at', 'at', 'ts']]),
  writingDrafts: { path: ['drafts171', 'writing'], table: 'drafts', kind: 'map', keys: ['draft_key'], fixed: { kind: 'writing' }, scalar: ['body', 'text'], touch: 'updated_at' },
  applicationDrafts: { path: ['drafts171', 'application'], table: 'drafts', kind: 'map', keys: ['draft_key'], fixed: { kind: 'application' }, scalar: ['body', 'text'], touch: 'updated_at' },
  completions: {
    path: ['contentProgress172', 'completed'], table: 'content_completions', kind: 'map2', keys: ['module', 'content_id'],
    fields: [['day', 'day', 'int'], ['correct', 'correct', 'bool'], ['first_completed_at', 'firstCompletedAt', 'ts'], ['last_completed_at', 'lastCompletedAt', 'ts']]
  }
};

/** "day:contentId:q" → descriptive columns (the key itself stays authoritative). */
function answerKey(k) {
  const p = k.split(':');
  return { day: /^\d{1,6}$/.test(p[0]) ? Number(p[0]) : null, content_id: p.slice(1, -1).join(':') || null, q_index: /^\d{1,6}$/.test(p[p.length - 1]) ? Number(p[p.length - 1]) : null };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Every column a collection writes, with its SQL type. */
function columns(c) {
  const cols = c.keys.map((k) => [k, 'text']);
  if (c.kind === 'list') cols.push(['pos', 'float8']);
  if (c.fixed) for (const k of Object.keys(c.fixed)) cols.push([k, 'text']);
  if (c.scalar) cols.push([c.scalar[0], TYPES[c.scalar[1]][0]], ['value', 'jsonb']);
  if (c.parse) cols.push(['day', 'int'], ['content_id', 'text'], ['q_index', 'int']);
  if (c.fields) { for (const [col, , t] of c.fields) cols.push([col, TYPES[t][0]]); cols.push(['extra', 'jsonb']); }
  return cols;
}

function toRow(c, key, value, pos) {
  const row = Object.assign({}, c.fixed);
  c.keys.forEach((k, i) => { row[k] = String(key[i]); });
  if (c.kind === 'list') row.pos = pos;
  if (c.parse) Object.assign(row, c.parse(row[c.keys[0]]));
  if (c.scalar) {
    if (TYPES[c.scalar[1]][1](value)) row[c.scalar[0]] = value;
    else row.value = value;
  }
  if (c.fields) {
    if (!isObj(value)) { row.extra = { $v: value }; return row; }
    const rest = Object.assign({}, value);
    for (const [col, field, t] of c.fields) {
      if (TYPES[t][1](rest[field])) { row[col] = rest[field]; delete rest[field]; }
    }
    row.extra = Object.keys(rest).length ? rest : null;
  }
  return row;
}

function fromRow(c, r) {
  if (c.scalar) return r[c.scalar[0]] != null ? r[c.scalar[0]] : r.value;
  if (r.extra && Object.keys(r.extra).length === 1 && '$v' in r.extra) return r.extra.$v;
  const v = Object.assign({}, r.extra);
  for (const [col, field, t] of c.fields) {
    if (r[col] != null) v[field] = t === 'ts' ? new Date(r[col]).toISOString() : r[col];
  }
  return v;
}

const fixedWhere = (c) => (c.fixed ? Object.keys(c.fixed).map((k) => ` and ${k} = '${c.fixed[k]}'`).join('') : '');

function statements(name, change) {
  const c = COLLECTIONS[name];
  if (!c) return [];
  const out = [];
  if (Array.isArray(change.del) && change.del.length) {
    const keys = c.keys.join(', ');
    const sel = c.keys.map((_, i) => `x->>${i}`).join(', ');
    out.push([`delete from delf50.${c.table} where (${keys}) in (select ${sel} from jsonb_array_elements($1::jsonb) x)${fixedWhere(c)}`, [JSON.stringify(change.del)]]);
  }
  if (Array.isArray(change.set) && change.set.length) {
    const cols = columns(c);
    const names = cols.map(([n]) => n).join(', ');
    const target = (c.conflict || c.keys).concat(c.fixed ? Object.keys(c.fixed) : []);
    const update = cols.filter(([n]) => !target.includes(n)).map(([n]) => `${n} = excluded.${n}`)
      .concat(c.touch ? [`${c.touch} = now()`] : []).join(', ');
    out.push([
      `insert into delf50.${c.table} (${names}) select ${names} from jsonb_to_recordset($1::jsonb) as x(${cols.map(([n, t]) => `${n} ${t}`).join(', ')})
       on conflict (user_id, ${target.join(', ')}) do update set ${update}`,
      [JSON.stringify(change.set.map(([key, value, pos]) => toRow(c, key, value, pos)))]
    ]);
  }
  return out;
}

/** Applies one change batch atomically; returns the new revision. */
async function sync(user, body) {
  const stmts = [];
  for (const name of Object.keys(body.ops || {})) stmts.push(...statements(name, body.ops[name]));
  stmts.push([
    `insert into delf50.study_state (doc, rev, device) values (delf50.jsonb_patch('{}', $1::jsonb), 1, $2)
     on conflict (user_id) do update set doc = delf50.jsonb_patch(study_state.doc, $1::jsonb), rev = study_state.rev + 1, device = $2, updated_at = now()
     returning rev`,
    [JSON.stringify(body.doc || []), typeof body.device === 'string' ? body.device.slice(0, 80) : null]
  ]);
  const res = await db.tx(user.id, stmts);
  return { rev: Number(res[res.length - 1][0].rev) };
}

function selectFor(c) {
  const cols = columns(c).map(([n]) => n).join(', ');
  const where = c.fixed ? ` where true${fixedWhere(c)}` : '';
  if (c.conflict) return `select distinct on (${c.keys.join(', ')}) ${cols} from delf50.${c.table} order by ${c.keys.join(', ')}, id desc`;
  return `select ${cols} from delf50.${c.table}${where} order by ${c.kind === 'list' ? 'pos' : c.keys.join(', ')}`;
}

function setPath(obj, path, value) {
  let o = obj;
  for (const k of path.slice(0, -1)) { if (!isObj(o[k])) o[k] = {}; o = o[k]; }
  o[path[path.length - 1]] = value;
}

/** The learner's whole state, rebuilt from the tables, plus list positions. */
async function bootstrap(user) {
  const names = Object.keys(COLLECTIONS);
  const res = await db.tx(user.id, [
    ['select doc, rev from delf50.study_state', []],
    ...names.map((n) => [selectFor(COLLECTIONS[n]), []])
  ]);
  const head = res[0][0];
  const has = head || res.slice(1).some((rows) => rows.length);
  const state = head ? head.doc : {};
  const positions = {};
  names.forEach((n, i) => {
    const c = COLLECTIONS[n];
    const rows = res[i + 1];
    let parent = state;
    for (const k of c.path.slice(0, -1)) parent = isObj(parent) ? parent[k] : undefined;
    if (!rows.length && !isObj(parent)) return;
    let value;
    if (c.kind === 'list') {
      value = rows.map((r) => fromRow(c, r));
      positions[n] = rows.map((r) => Number(r.pos));
    } else if (c.kind === 'map2') {
      // The document keeps the first level (possibly empty maps) as a skeleton.
      value = isObj(parent) && isObj(parent[c.path[c.path.length - 1]]) ? parent[c.path[c.path.length - 1]] : {};
      for (const r of rows) {
        const m = r[c.keys[0]];
        if (!isObj(value[m])) value[m] = {};
        value[m][r[c.keys[1]]] = fromRow(c, r);
      }
    } else {
      value = {};
      for (const r of rows) value[r[c.keys[0]]] = fromRow(c, r);
    }
    setPath(state, c.path, value);
  });
  return { state: has ? state : null, rev: head ? Number(head.rev) : 0, positions };
}

const collections = () => Object.keys(COLLECTIONS).map((name) => ({ name, path: COLLECTIONS[name].path, kind: COLLECTIONS[name].kind }));

module.exports = { sync, bootstrap, collections, COLLECTIONS, toRow, fromRow };
