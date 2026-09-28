'use strict';
/**
 * Learner media in Cloudflare R2 (speaking recordings today; the table also
 * models shared course audio for later).
 *
 * Upload, preferred: POST /media/upload-url → PUT the bytes to the presigned
 *   R2 URL → POST /media/complete (the server HEADs R2 and checks the size).
 * Upload, fallback (the browser cannot reach R2, e.g. bucket CORS not set):
 *   PUT /media/raw?clipId=…&part=i&parts=n streams each ≤ 3.5 MB part through
 *   the function (under Vercel's 4.5 MB body limit), then POST /media/complete
 *   {clipId, parts:n}. A one-part upload completes by itself. Parts are stored
 *   as separate objects `<key>.part-0000…`, so any length is supported.
 * Download: GET /media/url → {url} (presigned GET), or {parts:n} for a parted
 *   object; GET /media/raw?clipId=…&part=i returns one object/part (≤ 3.5 MB).
 */
const db = require('./db');
const r2 = require('./r2');
const { HttpError, readRaw, send, str, int } = require('./http');

const CLIP_RE = /^[A-Za-z0-9._-]{1,120}$/;
const TYPE_RE = /^(audio|video)\/[A-Za-z0-9.+-]{1,40}(;[ A-Za-z0-9=.,+-]{0,80})?$/;
const KINDS = new Set(['speaking_recording', 'attachment']);
const MAX_UPLOAD = 50 * 1024 * 1024;
const PART_BYTES = 3.5 * 1024 * 1024;
const MAX_PARTS = Math.ceil(MAX_UPLOAD / PART_BYTES);

const EXT = { webm: 'webm', ogg: 'ogg', mp4: 'm4a', 'x-m4a': 'm4a', aac: 'aac', mpeg: 'mp3', mp3: 'mp3', wav: 'wav', 'x-wav': 'wav' };

function requireR2() {
  if (!r2.configured()) throw new HttpError(503, 'r2_not_configured', 'Media storage is not configured on the server');
}

function extFor(contentType) {
  const sub = contentType.split(';')[0].split('/')[1].toLowerCase();
  return EXT[sub] || 'bin';
}

function clipParam(v) {
  return str(v, 'clipId', { max: 120, pattern: CLIP_RE });
}

function partsOf(row) {
  const n = row.meta && Number.isInteger(row.meta.parts) ? row.meta.parts : 1;
  return n > 1 ? n : 1;
}

function partKey(row, i, n) {
  return n > 1 ? `${row.object_key}.part-${String(i).padStart(4, '0')}` : row.object_key;
}

async function findClip(auth, clipId) {
  const row = await db.one(
    `select id, object_key, content_type, size_bytes, status, kind, day, duration_sec, stored_at, meta
       from delf50.media_objects where user_id = $1 and client_clip_id = $2`, [auth.userId, clipId]);
  if (!row || row.status === 'deleted') throw new HttpError(404, 'not_found', 'Media not found');
  return row;
}

async function uploadUrl(req, res, auth, body) {
  requireR2();
  const clipId = clipParam(body.clipId);
  const contentType = str(body.contentType || 'audio/webm', 'contentType', { max: 130, pattern: TYPE_RE });
  const size = int(body.size, 'size', { min: 1, max: MAX_UPLOAD });
  const kind = KINDS.has(body.kind) ? body.kind : 'speaking_recording';
  const day = int(body.day, 'day', { min: 1, max: 366, optional: true });
  const durationSec = int(body.durationSec, 'durationSec', { min: 0, max: 86400, optional: true });
  const folder = kind === 'speaking_recording' ? 'speaking' : 'files';
  const key = `u/${auth.userId}/${folder}/${clipId}.${extFor(contentType)}`;

  const row = await db.one(
    `insert into delf50.media_objects (scope, user_id, kind, client_clip_id, object_key, content_type, size_bytes, day, duration_sec)
     values ('user', $1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (user_id, client_clip_id) where client_clip_id is not null do update set
       content_type = case when delf50.media_objects.status = 'stored' then delf50.media_objects.content_type else excluded.content_type end,
       size_bytes   = case when delf50.media_objects.status = 'stored' then delf50.media_objects.size_bytes else excluded.size_bytes end,
       day = coalesce(excluded.day, delf50.media_objects.day),
       duration_sec = coalesce(excluded.duration_sec, delf50.media_objects.duration_sec),
       status = case when delf50.media_objects.status = 'deleted' then 'pending' else delf50.media_objects.status end
     returning object_key, status, content_type`,
    [auth.userId, kind, clipId, key, contentType, size, day, durationSec]);

  if (row.status === 'stored') { send(res, 200, { status: 'stored', clipId }); return; }
  send(res, 200, {
    status: 'pending',
    clipId,
    upload: { method: 'PUT', url: r2.presignPut(row.object_key, 900), headers: { 'Content-Type': row.content_type }, expiresIn: 900 },
    proxy: { method: 'PUT', url: `/api/v1/media/raw?clipId=${encodeURIComponent(clipId)}`, partBytes: PART_BYTES, maxParts: MAX_PARTS }
  });
}

/**
 * Confirms the object in R2. Its real size must equal the size declared at
 * upload-url (and stay within MAX_UPLOAD); otherwise it is deleted and refused,
 * since a presigned PUT does not itself bound the body.
 */
async function markStored(auth, row) {
  const h = await r2.head(row.object_key);
  if (!h) return null;
  const declared = row.size_bytes === null ? null : Number(row.size_bytes);
  if (!Number.isFinite(h.size) || h.size > MAX_UPLOAD || (declared !== null && h.size !== declared)) {
    await r2.del(row.object_key);
    throw new HttpError(422, 'size_mismatch', `Uploaded object is ${h.size} bytes; ${declared} bytes were declared`);
  }
  await db.query(
    `update delf50.media_objects set status = 'stored', size_bytes = $3, stored_at = coalesce(stored_at, now())
      where user_id = $1 and id = $2`, [auth.userId, row.id, h.size]);
  return h;
}

/** Verifies an n-part upload: every part present, full-size parts in order, exact total. */
async function markStoredParts(auth, row, n) {
  const heads = await Promise.all(Array.from({ length: n }, (_, i) => r2.head(partKey(row, i, n))));
  if (heads.some((h) => !h)) return null;
  const declared = row.size_bytes === null ? null : Number(row.size_bytes);
  const total = heads.reduce((a, h) => a + h.size, 0);
  const shapeOk = heads.every((h, i) => (i < n - 1 ? h.size === PART_BYTES : h.size >= 1 && h.size <= PART_BYTES));
  if (!shapeOk || total > MAX_UPLOAD || (declared !== null && total !== declared)) {
    await Promise.all(heads.map((_, i) => r2.del(partKey(row, i, n))));
    throw new HttpError(422, 'size_mismatch', `Uploaded parts total ${total} bytes; ${declared} bytes were declared`);
  }
  await db.query(
    `update delf50.media_objects set status = 'stored', size_bytes = $3, stored_at = coalesce(stored_at, now()),
            meta = meta || jsonb_build_object('parts', $4::int)
      where user_id = $1 and id = $2`, [auth.userId, row.id, total, n]);
  return { size: total };
}

async function complete(req, res, auth, body) {
  requireR2();
  const row = await findClip(auth, clipParam(body.clipId));
  const n = int(body.parts === undefined ? 1 : body.parts, 'parts', { min: 1, max: MAX_PARTS });
  const h = n > 1 ? await markStoredParts(auth, row, n) : await markStored(auth, row);
  if (!h) throw new HttpError(409, 'not_uploaded', 'The object is not in storage yet');
  send(res, 200, { status: 'stored', clipId: body.clipId, size: h.size });
}

async function proxyUpload(req, res, auth) {
  requireR2();
  const clipId = clipParam(req.query.clipId);
  const n = int(req.query.parts === undefined ? 1 : req.query.parts, 'parts', { min: 1, max: MAX_PARTS });
  const i = int(req.query.part === undefined ? 0 : req.query.part, 'part', { min: 0, max: n - 1 });
  const row = await findClip(auth, clipId);
  if (row.status === 'stored') { send(res, 200, { status: 'stored', clipId, size: Number(row.size_bytes) }); return; }
  const bytes = await readRaw(req, PART_BYTES);
  if (!bytes.length) throw new HttpError(400, 'empty_body', 'Empty upload');
  await r2.put(partKey(row, i, n), bytes, row.content_type);
  if (n > 1) { send(res, 200, { status: 'part', clipId, part: i, parts: n, size: bytes.length }); return; }
  const h = await markStored(auth, row);
  send(res, 200, { status: 'stored', clipId, size: h ? h.size : bytes.length });
}

async function list(req, res, auth) {
  const rows = await db.query(
    `select client_clip_id, kind, status, content_type, size_bytes, day, duration_sec, created_at, stored_at
       from delf50.media_objects where user_id = $1 and status <> 'deleted' order by created_at`, [auth.userId]);
  send(res, 200, { r2: r2.configured(), media: rows.map((r) => ({
    clipId: r.client_clip_id, kind: r.kind, status: r.status, contentType: r.content_type,
    size: r.size_bytes === null ? null : Number(r.size_bytes), day: r.day, durationSec: r.duration_sec,
    createdAt: r.created_at, storedAt: r.stored_at
  })) });
}

async function downloadUrl(req, res, auth) {
  requireR2();
  const row = await findClip(auth, clipParam(req.query.clipId));
  if (row.status !== 'stored') throw new HttpError(409, 'not_uploaded', 'The object is not in storage yet');
  const n = partsOf(row);
  const base = { contentType: row.content_type, size: Number(row.size_bytes), parts: n };
  if (n > 1) { send(res, 200, base); return; }
  send(res, 200, Object.assign(base, { url: r2.presignGet(row.object_key, 900), expiresIn: 900 }));
}

async function proxyDownload(req, res, auth) {
  requireR2();
  const row = await findClip(auth, clipParam(req.query.clipId));
  if (row.status !== 'stored') throw new HttpError(409, 'not_uploaded', 'The object is not in storage yet');
  const n = partsOf(row);
  const i = int(req.query.part === undefined ? 0 : req.query.part, 'part', { min: 0, max: n - 1 });
  const obj = await r2.get(partKey(row, i, n));
  if (!obj) throw new HttpError(404, 'not_found', 'Object missing from storage');
  send(res, 200, obj.body, { 'Content-Type': row.content_type });
}

async function remove(req, res, auth) {
  requireR2();
  const row = await findClip(auth, clipParam(req.query.clipId));
  const n = partsOf(row);
  await Promise.all(Array.from({ length: n }, (_, i) => r2.del(partKey(row, i, n))));
  await db.query(`update delf50.media_objects set status = 'deleted', deleted_at = now() where id = $1`, [row.id]);
  send(res, 200, { ok: true });
}

module.exports = { uploadUrl, complete, proxyUpload, list, downloadUrl, proxyDownload, remove };
