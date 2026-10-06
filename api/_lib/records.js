'use strict';
/**
 * The learning state as database entities.
 *
 * The web app keeps one state object S. Its learning records live in their
 * own tables (COLLECTIONS below); the rest (current day, intensity, start
 * date) is the study_state document. Progress is never stored: the app
 * derives it from the records. bootstrap() rebuilds S from the tables;
 * sync() applies one batch of fine-grained changes in one transaction,
 * idempotently, so a retried request is harmless.
 *
 * A record's fields go to typed columns when the value has the column's type,
 * anything else to `extra`, so every record reads back exactly as written.
 * The document keeps each collection's empty container, so presence round-trips.
 *
 * Everything is per course (CEFR level; see _lib/courses.js): each statement
 * carries the course, which is part of every record table's primary key.
 *
 * Wire format of a change batch (see app/sync-core.js):
 *   doc: [[path, value] | [path]]                     set / delete in the document
 *   ops: {name: {set: [[key, value, pos?]], del: [key], move?: [[from, to, pos]]}}  key = [part, …]
 *   move renames a list row (same record, new key and position).
 */
const crypto = require('crypto');
const db = require('./db');

const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TYPES = {
  int: ['int', (v) => Number.isInteger(v) && Math.abs(v) < 2 ** 31],
  text: ['text', (v) => typeof v === 'string'],
  bool: ['boolean', (v) => typeof v === 'boolean'],
  ts: ['timestamptz', (v) => typeof v === 'string' && ISO_MS.test(v) && new Date(v).toISOString() === v]
};

// Record types, as the app writes them (app/state.js):
//   map  — S.path[key] = value      list — S.path = [record, …]
// parse/parsed: descriptive columns derived from the key (the key stays authoritative).
const int = (s) => (/^\d{1,6}$/.test(s) ? Number(s) : null);
const answerKey = (k) => { const p = k.split(':'); return { day: int(p[0]), content_id: p.slice(1, -1).join(':') || null, q_index: int(p[p.length - 1]) }; };
const answers = (path, table) => ({ path, table, kind: 'map', keys: ['answer_key'], scalar: ['selected', 'int'], touch: 'answered_at',
  parse: answerKey, parsed: [['day', 'int'], ['content_id', 'text'], ['q_index', 'int']] });
const submissions = (path, table, fields, extra) => Object.assign({ path, table, kind: 'list', keys: ['item_key'], fields }, extra);
const draft = (kind) => ({ path: ['drafts', kind], table: 'drafts', kind: 'map', keys: ['draft_key'], fixed: { kind }, scalar: ['body', 'text'], touch: 'updated_at' });

const COLLECTIONS = {
  // Reading and listening: "<day>:<item>:<question>" = chosen option.
  reading: answers(['reading'], 'reading_answers'),
  listening: answers(['listening'], 'listening_answers'),
  // Grammar: "<day>:<question>" = the answer as given; every change is kept (append-only).
  grammar: {
    path: ['grammar'], table: 'grammar_attempts', kind: 'map', keys: ['answer_key'], history: true,
    fields: [['day', 'day', 'int'], ['content_id', 'contentId', 'text'], ['node_id', 'nodeId', 'text'], ['question', 'question', 'text'],
      ['selected', 'selectedIndex', 'int'], ['correct_index', 'correctIndex', 'int'], ['correct', 'correct', 'bool'], ['answered_at', 'answeredAt', 'ts']]
  },
  // Grammar output practice: "<day>:<node>:<prompt>" = done.
  production: { path: ['production'], table: 'grammar_productions', kind: 'map', keys: ['prod_key'], scalar: ['done', 'bool'],
    parse: (k) => { const p = k.split(':'); return { day: int(p[0]), node_id: p.slice(1, -1).join(':') || null, prompt_index: int(p[p.length - 1]) }; },
    parsed: [['day', 'int'], ['node_id', 'text'], ['prompt_index', 'int']] },
  writing: submissions(['writing'], 'writing_submissions', [['day', 'day', 'int'], ['content_id', 'contentId', 'text'],
    ['title', 'title', 'text'], ['body', 'text', 'text'], ['word_count', 'words', 'int'], ['created_at', 'at', 'ts']]),
  application: submissions(['application'], 'application_submissions', [['day', 'day', 'int'], ['content_id', 'contentId', 'text'],
    ['title', 'title', 'text'], ['body', 'text', 'text'], ['created_at', 'at', 'ts']]),
  speaking: submissions(['speaking'], 'speaking_attempts', [['clip_id', 'clip', 'text'], ['day', 'day', 'int'],
    ['content_id', 'contentId', 'text'], ['title', 'title', 'text'], ['duration_sec', 'sec', 'int'], ['created_at', 'at', 'ts']]),
  // Resolving an error removes it from the app's list; here it is kept as resolved.
  errors: submissions(['errors'], 'error_items', [['skill', 'skill', 'text'], ['original', 'original', 'text'],
    ['correction', 'correct', 'text'], ['explanation', 'why', 'text'], ['created_at', 'at', 'ts']], { soft: 'resolved_at' }),
  writingDrafts: draft('writing'),
  applicationDrafts: draft('application'),
  // Vocabulary chunks: "<day>:<chunk>" = known | again.
  lexicon: { path: ['lexicon'], table: 'lexicon_marks', kind: 'map', keys: ['mark_key'], scalar: ['mark', 'text'], touch: 'marked_at',
    parse: (k) => { const i = k.indexOf(':'); return { day: int(k.slice(0, i)), chunk_id: i < 0 ? null : k.slice(i + 1) }; }, parsed: [['day', 'int'], ['chunk_id', 'text']] },
  // Spaced review: "<day>:<g|v>:<source day>:<item>" = the item as done on <day>.
  review: { path: ['review'], table: 'review_answers', kind: 'map', keys: ['answer_key'],
    fields: [['day', 'day', 'int'], ['kind', 'kind', 'text'], ['source_day', 'src', 'int'], ['content_id', 'contentId', 'text'],
      ['selected', 'selectedIndex', 'int'], ['correct', 'correct', 'bool'], ['answered_at', 'at', 'ts']] }
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const stable = (v) => (Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : isObj(v) ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v === undefined ? null : v));
const sig = (v) => crypto.createHash('sha1').update(stable(v)).digest('base64url');

/** Every column a collection writes, with its SQL type. */
function columns(c) {
  const cols = c.keys.map((k) => [k, 'text']);
  if (c.kind === 'list') cols.push(['pos', 'float8']);
  if (c.fixed) for (const k of Object.keys(c.fixed)) cols.push([k, 'text']);
  if (c.scalar) cols.push([c.scalar[0], TYPES[c.scalar[1]][0]], ['value', 'jsonb']);
  if (c.parsed) cols.push(...c.parsed);
  if (c.fields) { for (const [col, , t] of c.fields) cols.push([col, TYPES[t][0]]); cols.push(['extra', 'jsonb']); }
  if (c.history) cols.push(['sig', 'text']);
  return cols;
}

function toRow(c, key, value, pos) {
  const row = Object.assign({}, c.fixed);
  c.keys.forEach((k, i) => { row[k] = String(key[i]); });
  if (c.history) row.sig = sig(value);
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

// The latest history row for x.answer_key in the course (row-level security scopes it to the caller).
const LATEST = (c) => `(select g.sig, g.deleted from delf50.${c.table} g where g.course = $2 and g.answer_key = x.answer_key order by g.id desc limit 1)`;

/** Statements for one collection's changes; $1 = the rows or keys, $2 = the course. */
function statements(name, change, course) {
  const c = COLLECTIONS[name];
  if (!c) return [];
  const out = [];
  if (c.kind === 'list' && Array.isArray(change.move) && change.move.length) {
    out.push([`update delf50.${c.table} t set ${c.keys[0]} = x->>1, pos = (x->>2)::float8 from jsonb_array_elements($1::jsonb) x
      where t.course = $2 and t.${c.keys[0]} = x->>0 and jsonb_typeof(x->2) = 'number'`, [JSON.stringify(change.move), course]]);
  }
  if (Array.isArray(change.del) && change.del.length) {
    const del = JSON.stringify(change.del);
    if (c.history) { // a removal is a tombstone row
      out.push([`insert into delf50.${c.table} (course, answer_key, sig, deleted) select $2, x.answer_key, 'deleted', true
        from (select e->>0 as answer_key from jsonb_array_elements($1::jsonb) e) x where exists (select 1 from ${LATEST(c)} l where not l.deleted)`, [del, course]]);
    } else {
      const sel = c.keys.map((_, i) => `x->>${i}`).join(', ');
      const where = `course = $2 and (${c.keys.join(', ')}) in (select ${sel} from jsonb_array_elements($1::jsonb) x)`;
      if (c.soft) out.push([`update delf50.${c.table} set ${c.soft} = now() where ${c.soft} is null and ${where}`, [del, course]]);
      else out.push([`delete from delf50.${c.table} where ${where}${fixedWhere(c)}`, [del, course]]);
    }
  }
  if (Array.isArray(change.set) && change.set.length) {
    const cols = columns(c);
    const names = cols.map(([n]) => n).join(', ');
    const rows = [JSON.stringify(change.set.map(([key, value, pos]) => toRow(c, key, value, pos))), course];
    const from = `from jsonb_to_recordset($1::jsonb) as x(${cols.map(([n, t]) => `${n} ${t}`).join(', ')})`;
    if (c.history) { // append unless it repeats the current content (a replay)
      out.push([`insert into delf50.${c.table} (course, ${names}) select $2, ${names} ${from}
        where not exists (select 1 from ${LATEST(c)} l where l.sig = x.sig and not l.deleted)`, rows]);
    } else {
      const target = c.keys.concat(c.fixed ? Object.keys(c.fixed) : []);
      const update = cols.filter(([n]) => !target.includes(n)).map(([n]) => `${n} = excluded.${n}`)
        .concat(c.touch ? [`${c.touch} = now()`] : [], c.soft ? [`${c.soft} = null`] : []).join(', ');
      out.push([`insert into delf50.${c.table} (course, ${names}) select $2, ${names} ${from}
        on conflict (user_id, course, ${target.join(', ')}) do update set ${update}`, rows]);
    }
  }
  return out;
}

/**
 * Applies one change batch atomically; returns the revision. A batch that
 * repeats the previous one (same `batch` id: a retry or a keepalive replay)
 * keeps the revision.
 */
async function sync(user, body, course) {
  const stmts = [];
  for (const name of Object.keys(body.ops || {})) stmts.push(...statements(name, body.ops[name], course));
  stmts.push([
    `insert into delf50.study_state (course, doc, rev, device, batch) values ($4, delf50.jsonb_patch('{}', $1::jsonb), 1, $2, $3)
     on conflict (user_id, course) do update set doc = delf50.jsonb_patch(study_state.doc, $1::jsonb), device = $2, batch = $3, updated_at = now(),
       rev = study_state.rev + case when $3::text is not null and study_state.batch = $3 then 0 else 1 end
     returning rev`,
    [JSON.stringify(body.doc || []), typeof body.device === 'string' ? body.device.slice(0, 80) : null, typeof body.batch === 'string' ? body.batch.slice(0, 64) : null, course]
  ]);
  const res = await db.tx(user.id, stmts);
  return { rev: Number(res[res.length - 1][0].rev) };
}

function selectFor(c) {
  const cols = columns(c).map(([n]) => n).join(', ');
  const where = ` where course = $1${fixedWhere(c)}${c.soft ? ` and ${c.soft} is null` : ''}`;
  if (c.history) {
    return `select * from (select distinct on (answer_key) ${cols}, deleted from delf50.${c.table} where course = $1 order by answer_key, id desc) t where not deleted`;
  }
  return `select ${cols} from delf50.${c.table}${where} order by ${c.kind === 'list' ? 'pos' : c.keys.join(', ')}`;
}

function setPath(obj, path, value) {
  let o = obj;
  for (const k of path.slice(0, -1)) { if (!isObj(o[k])) o[k] = {}; o = o[k]; }
  o[path[path.length - 1]] = value;
}

/** The learner's whole state in one course, rebuilt from the tables, plus each list's row positions and keys. */
async function bootstrap(user, course) {
  const names = Object.keys(COLLECTIONS);
  const res = await db.tx(user.id, [
    ['select doc, rev from delf50.study_state where course = $1', [course]],
    ...names.map((n) => [selectFor(COLLECTIONS[n]), [course]])
  ]);
  const head = res[0][0];
  const has = head || res.slice(1).some((rows) => rows.length);
  const state = head ? head.doc : {};
  const positions = {}, keys = {};
  names.forEach((n, i) => {
    const c = COLLECTIONS[n];
    const rows = res[i + 1];
    // The document holds the collection's empty container, so a collection's
    // presence round-trips; rows fill it.
    let cur = state;
    for (const k of c.path) cur = isObj(cur) ? cur[k] : undefined;
    const list = c.kind === 'list';
    if (!rows.length && !(list ? Array.isArray(cur) : isObj(cur))) return;
    let value;
    if (list) {
      value = rows.map((r) => fromRow(c, r));
      positions[n] = rows.map((r) => Number(r.pos));
      keys[n] = rows.map((r) => r[c.keys[0]]);
    } else {
      value = isObj(cur) ? cur : {};
      for (const r of rows) value[r[c.keys[0]]] = fromRow(c, r);
    }
    setPath(state, c.path, value);
  });
  return { state: has ? state : null, rev: head ? Number(head.rev) : 0, positions, keys };
}

const collections = () => Object.keys(COLLECTIONS).map((name) => ({ name, path: COLLECTIONS[name].path, kind: COLLECTIONS[name].kind }));

module.exports = { sync, bootstrap, collections, COLLECTIONS, toRow, fromRow };
