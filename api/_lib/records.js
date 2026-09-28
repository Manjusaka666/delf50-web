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
 * The document keeps each collection's empty container (a two-level map
 * keeps its first level, e.g. the module names), so presence round-trips.
 *
 * Wire format of a change batch (see cloud/delf50-cloud.js):
 *   doc: [[path, value] | [path]]                     set / delete in the document
 *   ops: {name: {set: [[key, value, pos?]], del: [key]}}  key = [part, …]
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

// Record types, as the app writes them (see the probe in scripts/verify-cloud.js):
//   map  — S.path[key] = value      list — S.path = [record, …]      map2 — S.path[module][id] = value
// parse/parsed: descriptive columns derived from the key (the key stays authoritative).
const int = (s) => (/^\d{1,6}$/.test(s) ? Number(s) : null);
const answerKey = (k) => { const p = k.split(':'); return { day: int(p[0]), content_id: p.slice(1, -1).join(':') || null, q_index: int(p[p.length - 1]) }; };
const DAY = { parse: (k) => ({ day: int(k) }), parsed: [['day', 'int']] };
const answers = (path, table) => ({ path, table, kind: 'map', keys: ['answer_key'], scalar: ['selected', 'int'], touch: 'answered_at',
  parse: answerKey, parsed: [['day', 'int'], ['content_id', 'text'], ['q_index', 'int']] });
const productions = (path, table, fields, extra) => Object.assign({ path, table, kind: 'list', keys: ['item_key'], fields }, extra);
const perDay = (path, table, fields) => Object.assign({ path, table, kind: 'map', keys: ['day_key'], fields }, DAY);

const COLLECTIONS = {
  reading: answers(['reading', 'answers'], 'reading_answers'),
  listening: answers(['listening', 'answers'], 'listening_answers'),
  grammar: {
    path: ['grammarReview202'], table: 'grammar_attempts', kind: 'map', keys: ['answer_key'], history: true,
    fields: [['day', 'day', 'int'], ['content_id', 'contentId', 'text'], ['node_id', 'nodeId', 'text'], ['question', 'question', 'text'],
      ['selected', 'selectedIndex', 'int'], ['correct_index', 'correctIndex', 'int'], ['correct', 'correct', 'bool'], ['answered_at', 'answeredAt', 'ts']]
  },
  writing: productions(['writing', 'records'], 'writing_submissions', [['day', 'day', 'int'], ['content_id', 'contentId', 'text'],
    ['title', 'title', 'text'], ['body', 'text', 'text'], ['word_count', 'words', 'int'], ['created_at', 'at', 'ts']]),
  application: productions(['application', 'records'], 'application_submissions', [['day', 'day', 'int'], ['content_id', 'contentId', 'text'],
    ['title', 'title', 'text'], ['body', 'text', 'text'], ['created_at', 'at', 'ts']]),
  speaking: productions(['speaking', 'records'], 'speaking_attempts', [['clip_id', 'id', 'text'], ['day', 'day', 'int'],
    ['content_id', 'contentId', 'text'], ['title', 'title', 'text'], ['duration_sec', 'sec', 'int'], ['created_at', 'at', 'ts']]),
  // Fixing an error removes it from the app's list; here it is kept as resolved.
  errors: productions(['errors'], 'error_items', [['skill', 'skill', 'text'], ['original', 'original', 'text'],
    ['correction', 'correct', 'text'], ['explanation', 'why', 'text'], ['created_at', 'at', 'ts']], { soft: 'resolved_at' }),
  // Grammar output practice: prodDone["<day>:<node>:<prompt>"] = true.
  grammarProductions: { path: ['prodDone'], table: 'grammar_productions', kind: 'map', keys: ['prod_key'], scalar: ['done', 'bool'],
    parse: (k) => { const p = k.split(':'); return { day: int(p[0]), node_id: p.slice(1, -1).join(':') || null, prompt_index: int(p[p.length - 1]) }; },
    parsed: [['day', 'int'], ['node_id', 'text'], ['prompt_index', 'int']] },
  // Daily checklist: taskDone["<day>:<task id>"] = bool.
  tasks: { path: ['taskDone'], table: 'task_checks', kind: 'map', keys: ['task_key'], scalar: ['done', 'bool'], touch: 'updated_at',
    parse: (k) => { const i = k.indexOf(':'); return { day: int(k.slice(0, i)), task_id: i < 0 ? k : k.slice(i + 1) }; }, parsed: [['day', 'int'], ['task_id', 'text']] },
  dailyProgress: perDay(['daily'], 'daily_progress', [['grammar', 'grammar', 'int'], ['grammar_prod', 'grammarProd', 'int'], ['reading', 'reading', 'int'],
    ['listening', 'listening', 'int'], ['writing', 'writing', 'int'], ['speaking', 'speaking', 'int'], ['application', 'application', 'int']]),
  studyDays: perDay(['dayHistory171'], 'study_days', [['first_activity_at', 'firstActivityAt', 'ts'], ['last_activity_at', 'lastActivityAt', 'ts'],
    ['actions', 'actions', 'int'], ['last_action', 'lastAction', 'text']]),
  // Vocabulary (词块) and review practice counts per day.
  practice: perDay(['practiceCounters172'], 'practice_counters', [['vocab', 'vocab', 'int'], ['review', 'review', 'int'], ['legacy_inferred', 'legacyInferred', 'bool']]),
  writingDrafts: { path: ['drafts171', 'writing'], table: 'drafts', kind: 'map', keys: ['draft_key'], fixed: { kind: 'writing' }, scalar: ['body', 'text'], touch: 'updated_at' },
  applicationDrafts: { path: ['drafts171', 'application'], table: 'drafts', kind: 'map', keys: ['draft_key'], fixed: { kind: 'application' }, scalar: ['body', 'text'], touch: 'updated_at' },
  completions: {
    path: ['contentProgress172', 'completed'], table: 'content_completions', kind: 'map2', keys: ['module', 'content_id'],
    fields: [['day', 'day', 'int'], ['correct', 'correct', 'bool'], ['first_completed_at', 'firstCompletedAt', 'ts'], ['last_completed_at', 'lastCompletedAt', 'ts']]
  }
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

// The latest history row for x.answer_key (row-level security scopes it to the caller).
const LATEST = (c) => `(select g.sig, g.deleted from delf50.${c.table} g where g.answer_key = x.answer_key order by g.id desc limit 1)`;

function statements(name, change) {
  const c = COLLECTIONS[name];
  if (!c) return [];
  const out = [];
  if (Array.isArray(change.del) && change.del.length) {
    const del = JSON.stringify(change.del);
    if (c.history) { // a removal is a tombstone row
      out.push([`insert into delf50.${c.table} (answer_key, sig, deleted) select x.answer_key, 'deleted', true
        from (select e->>0 as answer_key from jsonb_array_elements($1::jsonb) e) x where exists (select 1 from ${LATEST(c)} l where not l.deleted)`, [del]]);
    } else {
      const sel = c.keys.map((_, i) => `x->>${i}`).join(', ');
      if (c.soft) out.push([`update delf50.${c.table} set ${c.soft} = now() where ${c.soft} is null and (${c.keys.join(', ')}) in (select ${sel} from jsonb_array_elements($1::jsonb) x)`, [del]]);
      else out.push([`delete from delf50.${c.table} where (${c.keys.join(', ')}) in (select ${sel} from jsonb_array_elements($1::jsonb) x)${fixedWhere(c)}`, [del]]);
    }
  }
  if (Array.isArray(change.set) && change.set.length) {
    const cols = columns(c);
    const names = cols.map(([n]) => n).join(', ');
    const rows = [JSON.stringify(change.set.map(([key, value, pos]) => toRow(c, key, value, pos)))];
    const from = `from jsonb_to_recordset($1::jsonb) as x(${cols.map(([n, t]) => `${n} ${t}`).join(', ')})`;
    if (c.history) { // append unless it repeats the current content (a replay)
      out.push([`insert into delf50.${c.table} (${names}) select ${names} ${from}
        where not exists (select 1 from ${LATEST(c)} l where l.sig = x.sig and not l.deleted)`, rows]);
    } else {
      const target = c.keys.concat(c.fixed ? Object.keys(c.fixed) : []);
      const update = cols.filter(([n]) => !target.includes(n)).map(([n]) => `${n} = excluded.${n}`)
        .concat(c.touch ? [`${c.touch} = now()`] : [], c.soft ? [`${c.soft} = null`] : []).join(', ');
      out.push([`insert into delf50.${c.table} (${names}) select ${names} ${from}
        on conflict (user_id, ${target.join(', ')}) do update set ${update}`, rows]);
    }
  }
  return out;
}

/**
 * Applies one change batch atomically; returns the revision. A batch that
 * repeats the previous one (same `batch` id: a retry or a keepalive replay)
 * keeps the revision.
 */
async function sync(user, body) {
  const stmts = [];
  for (const name of Object.keys(body.ops || {})) stmts.push(...statements(name, body.ops[name]));
  stmts.push([
    `insert into delf50.study_state (doc, rev, device, batch) values (delf50.jsonb_patch('{}', $1::jsonb), 1, $2, $3)
     on conflict (user_id) do update set doc = delf50.jsonb_patch(study_state.doc, $1::jsonb), device = $2, batch = $3, updated_at = now(),
       rev = study_state.rev + case when $3::text is not null and study_state.batch = $3 then 0 else 1 end
     returning rev`,
    [JSON.stringify(body.doc || []), typeof body.device === 'string' ? body.device.slice(0, 80) : null, typeof body.batch === 'string' ? body.batch.slice(0, 64) : null]
  ]);
  const res = await db.tx(user.id, stmts);
  return { rev: Number(res[res.length - 1][0].rev) };
}

function selectFor(c) {
  const cols = columns(c).map(([n]) => n).join(', ');
  const where = c.fixed || c.soft ? ` where true${fixedWhere(c)}${c.soft ? ` and ${c.soft} is null` : ''}` : '';
  if (c.history) {
    return `select * from (select distinct on (answer_key) ${cols}, deleted from delf50.${c.table} order by answer_key, id desc) t where not deleted`;
  }
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
    // The document holds the collection's empty container (a two-level map:
    // its first level), so a collection's presence round-trips; rows fill it.
    let cur = state;
    for (const k of c.path) cur = isObj(cur) ? cur[k] : undefined;
    const list = c.kind === 'list';
    if (!rows.length && !(list ? Array.isArray(cur) : isObj(cur))) return;
    let value;
    if (list) {
      value = rows.map((r) => fromRow(c, r));
      positions[n] = rows.map((r) => Number(r.pos));
    } else {
      value = isObj(cur) ? cur : {};
      for (const r of rows) {
        if (c.kind === 'map2') {
          const m = r[c.keys[0]];
          if (!isObj(value[m])) value[m] = {};
          value[m][r[c.keys[1]]] = fromRow(c, r);
        } else value[r[c.keys[0]]] = fromRow(c, r);
      }
    }
    setPath(state, c.path, value);
  });
  return { state: has ? state : null, rev: head ? Number(head.rev) : 0, positions };
}

const collections = () => Object.keys(COLLECTIONS).map((name) => ({ name, path: COLLECTIONS[name].path, kind: COLLECTIONS[name].kind }));

module.exports = { sync, bootstrap, collections, COLLECTIONS, toRow, fromRow };
