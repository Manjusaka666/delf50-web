'use strict';
/**
 * Learning-state sync: compare-and-swap of the exact localStorage document.
 *
 * Wire format (PUT /sync/state, POST /sync/archive):
 *   body                     the document text, gzip-compressed when
 *                            X-DELF50-Encoding: gzip
 *   X-DELF50-Hash            SHA-256 (hex) of the UTF-8 document text
 *   X-DELF50-Base-Rev        head revision the client last synced (0 = none)
 *   X-DELF50-Reason          push | merge | claim | adopt | restore | import
 * The server recomputes the hash, so a truncated or altered upload is refused
 * rather than stored.
 */
const crypto = require('crypto');
const zlib = require('zlib');
const db = require('./db');
const projection = require('./projection');
const { HttpError, readRaw, header, send, int } = require('./http');

const MAX_STATE_BYTES = 16 * 1024 * 1024;
const REASONS = new Set(['push', 'merge', 'claim', 'adopt', 'restore', 'import']);
const HEX64 = /^[0-9a-f]{64}$/;

const sha256hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Projection rows go into jsonb, which rejects NUL and lone surrogates. */
function jsonbSafe(value) {
  return JSON.stringify(value, (k, v) => {
    if (typeof v !== 'string') return v;
    const s = typeof v.toWellFormed === 'function' ? v.toWellFormed() : v;
    return s.indexOf('\u0000') >= 0 ? s.replace(/\u0000/g, '') : s;
  });
}

async function readDocument(req) {
  const hash = String(header(req, 'x-delf50-hash') || '').toLowerCase();
  if (!HEX64.test(hash)) throw new HttpError(400, 'invalid_hash', 'X-DELF50-Hash must be a SHA-256 hex digest');
  const encoding = String(header(req, 'x-delf50-encoding') || 'identity').toLowerCase();
  const raw = await readRaw(req);
  let bytes;
  let gz = null;
  if (encoding === 'gzip') {
    try { bytes = zlib.gunzipSync(raw, { maxOutputLength: MAX_STATE_BYTES }); } catch (e) {
      throw new HttpError(400, 'invalid_gzip', 'Body is not valid gzip or is too large');
    }
    gz = raw;
  } else if (encoding === 'identity') {
    bytes = raw;
  } else {
    throw new HttpError(400, 'invalid_encoding', 'X-DELF50-Encoding must be gzip or identity');
  }
  if (!bytes.length) throw new HttpError(400, 'empty_state', 'State document is empty');
  if (bytes.length > MAX_STATE_BYTES) throw new HttpError(413, 'state_too_large', 'State document is too large');
  if (sha256hex(bytes) !== hash) throw new HttpError(422, 'hash_mismatch', 'Body does not match X-DELF50-Hash');
  const textValue = bytes.toString('utf8');
  // Invalid UTF-8 would be replaced during decoding, so the stored text would
  // no longer match the hash every client verifies on download.
  if (!Buffer.from(textValue, 'utf8').equals(bytes)) throw new HttpError(422, 'invalid_utf8', 'State document is not valid UTF-8');
  let parsed;
  try { parsed = JSON.parse(textValue); } catch (e) { throw new HttpError(422, 'invalid_state', 'State document is not valid JSON'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new HttpError(422, 'invalid_state', 'State document must be a JSON object');
  if (!gz) gz = zlib.gzipSync(bytes, { level: 6 });
  return { hash, text: textValue, parsed, gz, size: bytes.length };
}

function schemaOf(S) {
  const v = S && S.meta172 && S.meta172.schemaVersion;
  return Number.isInteger(v) ? v : null;
}

/**
 * Writes `doc` as the new head if the head is still at baseRev. The projection
 * diff is computed against the current head, inside the same CAS window: if the
 * head moves between the read and the write, push_state reports a conflict and
 * nothing is written.
 */
async function casWrite(auth, baseRev, doc, reason) {
  const head = await db.one(
    'select rev, hash, state_text, projection_version from delf50.learning_state where user_id = $1', [auth.userId]);
  const headRev = head ? Number(head.rev) : 0;
  if (headRev !== baseRev) {
    if (head && head.hash === doc.hash) return { status: 'same', rev: headRev, hash: head.hash };
    return { status: 'conflict', rev: headRev, hash: head ? head.hash : null };
  }
  if (head && head.hash === doc.hash) return { status: 'unchanged', rev: headRev, hash: head.hash };

  let prev = null;
  if (head && head.projection_version === projection.PROJECTION_VERSION) {
    try { prev = JSON.parse(head.state_text); } catch (e) { prev = null; }
  }
  const proj = projection.diff(prev, doc.parsed);
  const S = doc.parsed;
  const row = await db.one(
    'select status, rev, hash from delf50.push_state($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)',
    [auth.userId, baseRev, doc.hash, doc.text, doc.gz.toString('base64'), doc.size,
      schemaOf(S), typeof S.version === 'string' ? S.version.slice(0, 40) : null,
      auth.deviceId, reason, jsonbSafe(proj), projection.PROJECTION_VERSION]);
  return { status: row.status, rev: Number(row.rev), hash: row.hash };
}

async function putState(req, res, auth) {
  const baseRev = int(header(req, 'x-delf50-base-rev'), 'X-DELF50-Base-Rev', { min: 0 });
  const reason = String(header(req, 'x-delf50-reason') || 'push');
  if (!REASONS.has(reason)) throw new HttpError(400, 'invalid_reason', 'Unknown X-DELF50-Reason');
  const doc = await readDocument(req);
  const r = await casWrite(auth, baseRev, doc, reason);
  send(res, r.status === 'conflict' ? 409 : 200, r);
}

async function getState(req, res, auth) {
  const have = req.query && req.query.have !== undefined ? int(req.query.have, 'have', { min: 0 }) : null;
  const meta = await db.one(
    'select rev, hash, updated_at, size_bytes from delf50.learning_state where user_id = $1', [auth.userId]);
  const rev = meta ? Number(meta.rev) : 0;
  const headers = {
    'X-DELF50-Rev': String(rev),
    'X-DELF50-Hash': meta ? meta.hash : '',
    'X-DELF50-Updated-At': meta ? new Date(meta.updated_at).toISOString() : ''
  };
  if (!meta || (have !== null && have === rev)) { send(res, 204, null, headers); return; }
  const row = await db.one('select rev, hash, state_text from delf50.learning_state where user_id = $1', [auth.userId]);
  // The head may have advanced between the two reads; describe what is sent.
  headers['X-DELF50-Rev'] = String(row.rev);
  headers['X-DELF50-Hash'] = row.hash;
  send(res, 200, Buffer.from(row.state_text, 'utf8'), Object.assign(headers, { 'Content-Type': 'application/json; charset=utf-8' }));
}

async function listRevisions(req, res, auth) {
  const rows = await db.query(
    `select r.rev, r.parent_rev, r.hash, r.size_bytes, r.reason, r.app_version, r.created_at,
            d.platform, d.name as device_name
       from delf50.learning_state_revisions r left join delf50.devices d on d.id = r.device_id
      where r.user_id = $1 order by r.rev desc limit 200`, [auth.userId]);
  send(res, 200, { revisions: rows.map((r) => ({
    rev: Number(r.rev), parentRev: Number(r.parent_rev), hash: r.hash, size: r.size_bytes, reason: r.reason,
    appVersion: r.app_version, createdAt: r.created_at, device: r.device_name || r.platform || null
  })) });
}

async function revisionText(auth, rev) {
  const row = await db.one(
    `select hash, encode(state_gz, 'base64') as gz from delf50.learning_state_revisions where user_id = $1 and rev = $2`,
    [auth.userId, rev]);
  if (!row) throw new HttpError(404, 'not_found', 'Revision not found');
  const bytes = zlib.gunzipSync(Buffer.from(row.gz, 'base64'));
  if (sha256hex(bytes) !== row.hash) throw new HttpError(500, 'corrupt_revision', 'Stored revision failed its integrity check');
  return { hash: row.hash, bytes };
}

async function getRevision(req, res, auth, rev) {
  const r = await revisionText(auth, int(rev, 'rev', { min: 1 }));
  send(res, 200, r.bytes, { 'Content-Type': 'application/json; charset=utf-8', 'X-DELF50-Hash': r.hash, 'X-DELF50-Rev': String(rev) });
}

/** Makes an old revision the new head (a new revision; history is not rewritten). */
async function restore(req, res, auth, body) {
  const rev = int(body.rev, 'rev', { min: 1 });
  const baseRev = int(body.baseRev, 'baseRev', { min: 0 });
  const r = await revisionText(auth, rev);
  const textValue = r.bytes.toString('utf8');
  const doc = { hash: r.hash, text: textValue, parsed: JSON.parse(textValue), gz: zlib.gzipSync(r.bytes), size: r.bytes.length };
  const out = await casWrite(auth, baseRev, doc, 'restore');
  send(res, out.status === 'conflict' ? 409 : 200, out);
}

async function archive(req, res, auth) {
  const doc = await readDocument(req);
  const reason = String(header(req, 'x-delf50-reason') || 'device-archive').slice(0, 60);
  await db.query(
    `insert into delf50.state_archives (user_id, hash, state_gz, size_bytes, reason, device_id)
     values ($1, $2, decode($3, 'base64'), $4, $5, $6) on conflict (user_id, hash) do nothing`,
    [auth.userId, doc.hash, doc.gz.toString('base64'), doc.size, reason, auth.deviceId]);
  send(res, 200, { ok: true, hash: doc.hash });
}

async function listArchives(req, res, auth) {
  const rows = await db.query(
    `select a.id, a.hash, a.size_bytes, a.reason, a.created_at, d.name as device_name, d.platform
       from delf50.state_archives a left join delf50.devices d on d.id = a.device_id
      where a.user_id = $1 order by a.created_at desc limit 100`, [auth.userId]);
  send(res, 200, { archives: rows.map((r) => ({ id: r.id, hash: r.hash, size: r.size_bytes, reason: r.reason, createdAt: r.created_at, device: r.device_name || r.platform || null })) });
}

async function getArchive(req, res, auth, id) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(400, 'invalid_field', 'Invalid archive id');
  const row = await db.one(
    `select hash, encode(state_gz, 'base64') as gz from delf50.state_archives where user_id = $1 and id = $2`, [auth.userId, id]);
  if (!row) throw new HttpError(404, 'not_found', 'Archive not found');
  send(res, 200, zlib.gunzipSync(Buffer.from(row.gz, 'base64')), { 'Content-Type': 'application/json; charset=utf-8', 'X-DELF50-Hash': row.hash });
}

module.exports = { putState, getState, listRevisions, getRevision, restore, archive, listArchives, getArchive, jsonbSafe };
