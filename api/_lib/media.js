'use strict';
/**
 * Speaking recordings in Cloudflare R2; delf50.media_objects is their record.
 *
 * Web upload: PUT /media/raw?clipId&type&size[&part&parts] streams each
 *   ≤ 3.5 MB part through the function (Vercel's body limit is 4.5 MB; the
 *   bucket has no browser CORS). One part completes by itself; n parts
 *   complete with POST /media/complete {clipId, parts}.
 * App upload: POST /media/upload-url → PUT to the presigned URL → complete.
 * Download: GET /media/raw?clipId[&part] or GET /media/url (presigned).
 * The object is verified in R2 (HEAD, exact size) before a row turns 'stored'.
 */
const db = require('./db');
const r2 = require('./r2');
const { HttpError, readRaw, send, str, int } = require('./http');

const CLIP_RE = /^[A-Za-z0-9._-]{1,120}$/;
const TYPE_RE = /^(audio|video)\/[A-Za-z0-9.+-]{1,40}(;[ A-Za-z0-9=.,+-]{0,80})?$/;
const MAX_BYTES = 50 * 1024 * 1024;
const PART_BYTES = 3.5 * 1024 * 1024;
const MAX_PARTS = Math.ceil(MAX_BYTES / PART_BYTES);
const EXT = { webm: 'webm', ogg: 'ogg', mp4: 'm4a', 'x-m4a': 'm4a', aac: 'aac', mpeg: 'mp3', mp3: 'mp3', wav: 'wav', 'x-wav': 'wav', wave: 'wav' };

const COLS = 'clip_id, object_key, mime_type, size_bytes, parts, status, created_at, uploaded_at';

function need() {
  if (!r2.configured()) throw new HttpError(503, 'r2_not_configured', 'Media storage is not configured');
}

const clipOf = (v) => str(v, 'clipId', { max: 120, pattern: CLIP_RE });
const keyOf = (row, i) => (row.parts > 1 ? `${row.object_key}.part-${String(i).padStart(4, '0')}` : row.object_key);

async function find(user, clipId) {
  const [rows] = await db.tx(user.id, [[`select ${COLS} from delf50.media_objects where clip_id = $1`, [clipId]]]);
  if (!rows[0]) throw new HttpError(404, 'not_found', 'Media not found');
  return rows[0];
}

/** Creates (or returns) the pending record for a clip. */
async function open(user, clipId, type, size) {
  const mime = str(type || 'audio/webm', 'type', { max: 130, pattern: TYPE_RE });
  const key = `u/${user.id}/speaking/${clipId}.${EXT[mime.split(';')[0].split('/')[1].toLowerCase()] || 'bin'}`;
  const [rows] = await db.tx(user.id, [[
    `insert into delf50.media_objects (clip_id, object_key, mime_type, size_bytes) values ($1, $2, $3, $4)
     on conflict (user_id, clip_id) do update set
       mime_type = case when media_objects.status = 'stored' then media_objects.mime_type else excluded.mime_type end,
       size_bytes = case when media_objects.status = 'stored' then media_objects.size_bytes else excluded.size_bytes end
     returning ${COLS}`, [clipId, key, mime, int(size, 'size', { min: 1, max: MAX_BYTES })]]]);
  return rows[0];
}

/** Marks the clip stored once R2 holds exactly the declared bytes in n parts. */
async function seal(user, row, n) {
  const heads = await Promise.all(Array.from({ length: n }, (_, i) => r2.head(keyOf({ object_key: row.object_key, parts: n }, i))));
  if (heads.some((h) => !h)) throw new HttpError(409, 'not_uploaded', 'Upload incomplete');
  const total = heads.reduce((a, h) => a + h.size, 0);
  if (total !== Number(row.size_bytes)) {
    await Promise.all(heads.map((_, i) => r2.del(keyOf({ object_key: row.object_key, parts: n }, i))));
    throw new HttpError(422, 'size_mismatch', `Stored ${total} bytes; ${row.size_bytes} were declared`);
  }
  await db.tx(user.id, [[`update delf50.media_objects set status = 'stored', parts = $2, uploaded_at = now() where clip_id = $1`, [row.clip_id, n]]]);
  return { status: 'stored', clipId: row.clip_id, size: total };
}

async function proxyUpload(req, res, user) {
  need();
  const q = req.query;
  const clipId = clipOf(q.clipId);
  const n = int(q.parts || 1, 'parts', { min: 1, max: MAX_PARTS });
  const i = int(q.part || 0, 'part', { min: 0, max: n - 1 });
  const row = await open(user, clipId, q.type, q.size);
  if (row.status === 'stored') return send(res, 200, { status: 'stored', clipId, size: Number(row.size_bytes) });
  const bytes = await readRaw(req, PART_BYTES);
  if (!bytes.length) throw new HttpError(400, 'empty_body', 'Empty upload');
  await r2.put(keyOf({ object_key: row.object_key, parts: n }, i), bytes, row.mime_type);
  if (n > 1) return send(res, 200, { status: 'part', clipId, part: i, parts: n });
  send(res, 200, await seal(user, row, 1));
}

async function uploadUrl(req, res, user, body) {
  need();
  const row = await open(user, clipOf(body.clipId), body.type, body.size);
  if (row.status === 'stored') return send(res, 200, { status: 'stored', clipId: row.clip_id });
  send(res, 200, { status: 'pending', clipId: row.clip_id, upload: { method: 'PUT', url: r2.presignPut(row.object_key, 900), headers: { 'Content-Type': row.mime_type } } });
}

async function complete(req, res, user, body) {
  need();
  const row = await find(user, clipOf(body.clipId));
  if (row.status === 'stored') return send(res, 200, { status: 'stored', clipId: row.clip_id, size: Number(row.size_bytes) });
  send(res, 200, await seal(user, row, int(body.parts || 1, 'parts', { min: 1, max: MAX_PARTS })));
}

async function stored(user, req) {
  need();
  const row = await find(user, clipOf(req.query.clipId));
  if (row.status !== 'stored') throw new HttpError(409, 'not_uploaded', 'Upload incomplete');
  return row;
}

async function proxyDownload(req, res, user) {
  const row = await stored(user, req);
  const obj = await r2.get(keyOf(row, int(req.query.part || 0, 'part', { min: 0, max: row.parts - 1 })));
  if (!obj) throw new HttpError(404, 'not_found', 'Object missing from storage');
  send(res, 200, obj.body, { 'Content-Type': row.mime_type, 'X-Parts': String(row.parts) });
}

async function downloadUrl(req, res, user) {
  const row = await stored(user, req);
  send(res, 200, { type: row.mime_type, size: Number(row.size_bytes), parts: row.parts,
    urls: Array.from({ length: row.parts }, (_, i) => r2.presignGet(keyOf(row, i), 900)) });
}

async function list(req, res, user) {
  const [rows] = await db.tx(user.id, [[`select ${COLS} from delf50.media_objects order by created_at`, []]]);
  send(res, 200, { media: rows.map((r) => ({ clipId: r.clip_id, type: r.mime_type, size: Number(r.size_bytes), parts: r.parts, status: r.status, createdAt: r.created_at, uploadedAt: r.uploaded_at })) });
}

async function remove(req, res, user) {
  need();
  const row = await find(user, clipOf(req.query.clipId));
  await Promise.all(Array.from({ length: row.parts }, (_, i) => r2.del(keyOf(row, i))));
  await db.tx(user.id, [['delete from delf50.media_objects where clip_id = $1', [row.clip_id]]]);
  send(res, 200, { ok: true });
}

module.exports = { proxyUpload, uploadUrl, complete, proxyDownload, downloadUrl, list, remove, PART_BYTES };
