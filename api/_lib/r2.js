'use strict';
/**
 * Cloudflare R2 through its S3-compatible API, signed with AWS Signature V4.
 * No SDK: the signer is ~80 lines and is checked against the published AWS
 * test vectors in scripts/verify-cloud.js.
 *
 * Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *      (optional R2_ENDPOINT to override https://<account>.r2.cloudflarestorage.com)
 */
const crypto = require('crypto');

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data, 'utf8').digest();
const sha256hex = (data) => crypto.createHash('sha256').update(data).digest('hex');

/** RFC 3986 encoding as S3 expects it; '/' is kept when encoding a key path. */
function uriEncode(str, keepSlash) {
  let out = '';
  for (const ch of Buffer.from(String(str), 'utf8')) {
    const c = String.fromCharCode(ch);
    if ((ch >= 0x41 && ch <= 0x5a) || (ch >= 0x61 && ch <= 0x7a) || (ch >= 0x30 && ch <= 0x39) || '-_.~'.includes(c)) out += c;
    else if (keepSlash && c === '/') out += c;
    else out += '%' + ch.toString(16).toUpperCase().padStart(2, '0');
  }
  return out;
}

function amzDate(d) {
  return d.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/, '');
}

function signingKey(secret, date, region, service) {
  return hmac(hmac(hmac(hmac('AWS4' + secret, date), region), service), 'aws4_request');
}

function canonicalQuery(params) {
  return Object.keys(params).sort().map((k) => `${uriEncode(k)}=${uriEncode(params[k])}`).join('&');
}

/**
 * Presigned URL (query-string auth). Only `host` is signed, so the uploader may
 * send any Content-Type; the payload is UNSIGNED-PAYLOAD.
 */
function presign({ method, host, path, accessKeyId, secretAccessKey, region = 'auto', service = 's3', expires = 900, now = new Date(), extraQuery = {} }) {
  const t = amzDate(now);
  const date = t.slice(0, 8);
  const scope = `${date}/${region}/${service}/aws4_request`;
  const q = Object.assign({}, extraQuery, {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${scope}`,
    'X-Amz-Date': t,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host'
  });
  const cq = canonicalQuery(q);
  const canonical = [method, uriEncode(path, true), cq, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', t, scope, sha256hex(canonical)].join('\n');
  const sig = hmac(signingKey(secretAccessKey, date, region, service), toSign).toString('hex');
  return `https://${host}${uriEncode(path, true)}?${cq}&X-Amz-Signature=${sig}`;
}

/** Header-auth signature; returns the headers to send (including Authorization). */
function signHeaders({ method, host, path, query = {}, headers = {}, payloadHash, accessKeyId, secretAccessKey, region = 'auto', service = 's3', now = new Date() }) {
  const t = amzDate(now);
  const date = t.slice(0, 8);
  const scope = `${date}/${region}/${service}/aws4_request`;
  const h = { host, 'x-amz-date': t, 'x-amz-content-sha256': payloadHash };
  for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = String(v).trim();
  const names = Object.keys(h).sort();
  const canonicalHeaders = names.map((k) => `${k}:${h[k]}\n`).join('');
  const signed = names.join(';');
  const canonical = [method, uriEncode(path, true), canonicalQuery(query), canonicalHeaders, signed, payloadHash].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', t, scope, sha256hex(canonical)].join('\n');
  const sig = hmac(signingKey(secretAccessKey, date, region, service), toSign).toString('hex');
  const out = Object.assign({}, h);
  delete out.host;
  out.authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${sig}`;
  return out;
}

function config() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT } = process.env;
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !(R2_ACCOUNT_ID || R2_ENDPOINT)) return null;
  const endpoint = R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  return { host: new URL(endpoint).host, bucket: R2_BUCKET, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY };
}

function objectPath(cfg, key) {
  return `/${cfg.bucket}/${key}`;
}

function presignPut(key, expires = 900) {
  const cfg = config();
  return presign({ method: 'PUT', host: cfg.host, path: objectPath(cfg, key), accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, expires });
}

function presignGet(key, expires = 900, filename) {
  const cfg = config();
  const extraQuery = filename ? { 'response-content-disposition': `inline; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"` } : {};
  return presign({ method: 'GET', host: cfg.host, path: objectPath(cfg, key), accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, expires, extraQuery });
}

async function request(method, key, { body, contentType } = {}) {
  const cfg = config();
  const path = objectPath(cfg, key);
  const payloadHash = body ? sha256hex(body) : sha256hex('');
  const headers = contentType ? { 'content-type': contentType } : {};
  const signed = signHeaders({ method, host: cfg.host, path, headers, payloadHash, accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey });
  return fetch(`https://${cfg.host}${uriEncode(path, true)}`, { method, headers: signed, body });
}

/** Returns {size, contentType, etag} or null when the object does not exist. */
async function head(key) {
  const r = await request('HEAD', key);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`R2 HEAD ${r.status}`);
  return { size: Number(r.headers.get('content-length')), contentType: r.headers.get('content-type'), etag: r.headers.get('etag') };
}

async function put(key, body, contentType) {
  const r = await request('PUT', key, { body, contentType });
  if (!r.ok) throw new Error(`R2 PUT ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function get(key) {
  const r = await request('GET', key);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`R2 GET ${r.status}`);
  return { body: Buffer.from(await r.arrayBuffer()), contentType: r.headers.get('content-type') };
}

async function del(key) {
  const r = await request('DELETE', key);
  if (!r.ok && r.status !== 404) throw new Error(`R2 DELETE ${r.status}`);
}

module.exports = { presign, signHeaders, uriEncode, config, presignPut, presignGet, head, put, get, del, configured: () => Boolean(config()) };
