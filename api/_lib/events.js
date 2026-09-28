'use strict';
/**
 * Event log for native clients, plus read endpoints over the projection.
 *
 * POST /events   {events:[{id, type, occurredAt, day?, module?, contentId?, payload?}]}
 *                Idempotent on (user, id): re-sending a batch after a lost
 *                response is safe; duplicates are reported, not re-inserted.
 * GET  /events?after=<seq>&limit=<n>   cursor-paginated, oldest first.
 */
const db = require('./db');
const { jsonbSafe } = require('./state');
const { HttpError, send, int } = require('./http');

const ID_RE = /^[A-Za-z0-9._:-]{1,100}$/;
const TYPE_RE = /^[A-Za-z0-9_.:-]{1,60}$/;

async function post(req, res, auth, body) {
  const list = Array.isArray(body.events) ? body.events : null;
  if (!list || !list.length || list.length > 500) throw new HttpError(400, 'invalid_field', 'events must be an array of 1-500 items');
  const rows = list.map((e, i) => {
    if (!e || typeof e !== 'object') throw new HttpError(400, 'invalid_field', `events[${i}] must be an object`);
    if (typeof e.id !== 'string' || !ID_RE.test(e.id)) throw new HttpError(400, 'invalid_field', `events[${i}].id is invalid`);
    if (typeof e.type !== 'string' || !TYPE_RE.test(e.type)) throw new HttpError(400, 'invalid_field', `events[${i}].type is invalid`);
    const t = new Date(e.occurredAt);
    if (!Number.isFinite(t.getTime())) throw new HttpError(400, 'invalid_field', `events[${i}].occurredAt is invalid`);
    const payload = e.payload && typeof e.payload === 'object' && !Array.isArray(e.payload) ? e.payload : {};
    if (JSON.stringify(payload).length > 32768) throw new HttpError(413, 'payload_too_large', `events[${i}].payload exceeds 32 KB`);
    return {
      client_event_id: e.id, type: e.type, occurred_at: t.toISOString(),
      day: Number.isInteger(e.day) && e.day >= 1 && e.day <= 366 ? e.day : null,
      module: typeof e.module === 'string' ? e.module.slice(0, 40) : null,
      content_id: typeof e.contentId === 'string' ? e.contentId.slice(0, 200) : null,
      payload
    };
  });
  // A repeated id inside one batch is a duplicate of its first occurrence.
  const seen = new Set();
  const repeated = [];
  const unique = rows.filter((r) => {
    if (seen.has(r.client_event_id)) { repeated.push(r.client_event_id); return false; }
    seen.add(r.client_event_id);
    return true;
  });
  const inserted = await db.query(
    `insert into delf50.learning_events (user_id, device_id, client_event_id, type, day, module, content_id, occurred_at, payload)
     select $1, $2, x.client_event_id, x.type, x.day, x.module, x.content_id, x.occurred_at, coalesce(x.payload, '{}'::jsonb)
       from jsonb_to_recordset($3::jsonb) as x(client_event_id text, type text, day int, module text, content_id text, occurred_at timestamptz, payload jsonb)
     on conflict (user_id, client_event_id) do nothing
     returning client_event_id, seq`,
    [auth.userId, auth.deviceId, jsonbSafe(unique)]);
  const got = new Set(inserted.map((r) => r.client_event_id));
  send(res, 200, {
    accepted: inserted.length,
    duplicates: unique.filter((r) => !got.has(r.client_event_id)).map((r) => r.client_event_id).concat(repeated)
  });
}

async function get(req, res, auth) {
  const after = int(req.query.after || 0, 'after', { min: 0, max: Number.MAX_SAFE_INTEGER });
  const limit = int(req.query.limit || 200, 'limit', { min: 1, max: 1000 });
  const rows = await db.query(
    `select seq, client_event_id, type, day, module, content_id, occurred_at, received_at, payload
       from delf50.learning_events where user_id = $1 and seq > $2 order by seq limit $3`,
    [auth.userId, after, limit]);
  send(res, 200, {
    events: rows.map((r) => ({ seq: Number(r.seq), id: r.client_event_id, type: r.type, day: r.day, module: r.module,
      contentId: r.content_id, occurredAt: r.occurred_at, receivedAt: r.received_at, payload: r.payload })),
    nextCursor: rows.length ? Number(rows[rows.length - 1].seq) : after
  });
}

async function summary(req, res, auth) {
  const [stats, days, head] = await Promise.all([
    db.one('select * from delf50.learning_stats where user_id = $1', [auth.userId]),
    db.query('select day, metrics, first_activity_at, last_activity_at from delf50.daily_progress where user_id = $1 order by day', [auth.userId]),
    db.one('select rev, updated_at from delf50.learning_state where user_id = $1', [auth.userId])
  ]);
  if (stats) delete stats.user_id;
  send(res, 200, { rev: head ? Number(head.rev) : 0, updatedAt: head ? head.updated_at : null, stats, days });
}

const MODULE_TABLE = {
  answers: { table: 'item_answers', order: 'day nulls first, content_id, q_index' },
  productions: { table: 'production_records', order: 'created_at nulls first' },
  completions: { table: 'content_completions', order: 'first_completed_at nulls first' }
};

async function records(req, res, auth, kind) {
  const spec = MODULE_TABLE[kind];
  const params = [auth.userId];
  let where = 'user_id = $1';
  if (req.query.module) { params.push(String(req.query.module).slice(0, 40)); where += ` and module = $${params.length}`; }
  if (req.query.day) { params.push(int(req.query.day, 'day', { min: 1, max: 366 })); where += ` and day = $${params.length}`; }
  const rows = await db.query(`select * from delf50.${spec.table} where ${where} order by ${spec.order} limit 5000`, params);
  for (const r of rows) delete r.user_id;
  send(res, 200, { [kind]: rows });
}

module.exports = { post, get, summary, records };
