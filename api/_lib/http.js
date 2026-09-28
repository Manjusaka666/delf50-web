'use strict';
/** Request/response helpers shared by the /api/v1 router. */

class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const MAX_BODY = 12 * 1024 * 1024;

/**
 * Reads the raw request body. The stream is read directly so binary uploads and
 * gzip bodies arrive untouched; a body a platform helper already buffered is used
 * as-is.
 */
async function readRaw(req, limit = MAX_BODY) {
  const checked = (buf) => {
    if (buf.length > limit) throw new HttpError(413, 'body_too_large', `Request body exceeds ${limit} bytes`);
    return buf;
  };
  if (Buffer.isBuffer(req.rawBody)) return checked(req.rawBody);
  const chunks = [];
  let size = 0;
  if (typeof req[Symbol.asyncIterator] === 'function' && !req.readableEnded) {
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.length;
      if (size > limit) throw new HttpError(413, 'body_too_large', `Request body exceeds ${limit} bytes`);
      chunks.push(buf);
    }
  }
  if (chunks.length) return Buffer.concat(chunks);
  const b = req.body;
  if (Buffer.isBuffer(b)) return checked(b);
  if (typeof b === 'string') return checked(Buffer.from(b, 'utf8'));
  if (b && typeof b === 'object') return checked(Buffer.from(JSON.stringify(b), 'utf8'));
  return Buffer.alloc(0);
}

async function readJson(req, limit = 256 * 1024) {
  const raw = await readRaw(req, limit);
  if (!raw.length) return {};
  try {
    const v = JSON.parse(raw.toString('utf8'));
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
    return v;
  } catch (e) {
    throw new HttpError(400, 'invalid_json', 'Request body must be a JSON object');
  }
}

function send(res, status, body, headers) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (headers) for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (body === undefined || body === null) { res.end(); return; }
  if (Buffer.isBuffer(body) || typeof body === 'string') {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/octet-stream');
    res.end(body);
    return;
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function header(req, name) {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

function parseCookies(req) {
  const out = {};
  const raw = header(req, 'cookie');
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k || k in out) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch (e) { /* ignore malformed */ }
  }
  return out;
}

function clientIp(req) {
  const fwd = header(req, 'x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim().slice(0, 64);
  return String(header(req, 'x-real-ip') || (req.socket && req.socket.remoteAddress) || '').slice(0, 64);
}

function isSecure(req) {
  const proto = header(req, 'x-forwarded-proto');
  if (proto) return proto.split(',')[0].trim() === 'https';
  return Boolean(req.socket && req.socket.encrypted);
}

/** Small string validators; they throw 400 with the field name. */
function str(v, field, { min = 1, max = 200, pattern } = {}) {
  if (typeof v !== 'string') throw new HttpError(400, 'invalid_field', `${field} is required`, { field });
  const s = v.trim();
  if (s.length < min || s.length > max) throw new HttpError(400, 'invalid_field', `${field} length must be ${min}-${max}`, { field });
  if (pattern && !pattern.test(s)) throw new HttpError(400, 'invalid_field', `${field} has an invalid format`, { field });
  return s;
}

function int(v, field, { min = -2147483648, max = 2147483647, optional = false } = {}) {
  if ((v === undefined || v === null || v === '') && optional) return null;
  const n = typeof v === 'string' && /^-?\d+$/.test(v) ? Number(v) : v;
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, 'invalid_field', `${field} must be an integer`, { field });
  return n;
}

module.exports = { HttpError, readRaw, readJson, send, header, parseCookies, clientIp, isSecure, str, int };
