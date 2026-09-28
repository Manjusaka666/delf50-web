#!/usr/bin/env node
'use strict';
/**
 * Sets (or shows) the R2 bucket CORS policy through the S3 API, so browsers on
 * the site can PUT/GET recordings with presigned URLs directly.
 *
 *   R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=… \
 *     node scripts/r2-cors.js [--show] [origin …]
 *
 * Default origins: https://delf50-mvp.vercel.app
 */
const crypto = require('crypto');
const r2 = require('../api/_lib/r2.js');

const args = process.argv.slice(2);
const show = args.includes('--show');
const origins = args.filter((a) => !a.startsWith('--'));
if (!origins.length) origins.push('https://delf50-mvp.vercel.app');

async function call(method, body) {
  const cfg = r2.config();
  if (!cfg) throw new Error('R2 env vars are not set');
  const path = `/${cfg.bucket}`;
  const payload = body ? Buffer.from(body, 'utf8') : Buffer.alloc(0);
  const headers = {};
  if (body) {
    headers['content-type'] = 'application/xml';
    headers['content-md5'] = crypto.createHash('md5').update(payload).digest('base64');
  }
  const signed = r2.signHeaders({
    method, host: cfg.host, path, query: { cors: '' }, headers,
    payloadHash: crypto.createHash('sha256').update(payload).digest('hex'),
    accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey
  });
  const r = await fetch(`https://${cfg.host}${path}?cors=`, { method, headers: signed, body: body ? payload : undefined });
  return { status: r.status, text: await r.text() };
}

async function main() {
  if (!show) {
    const rule = [
      '<CORSRule>',
      ...origins.map((o) => `<AllowedOrigin>${o}</AllowedOrigin>`),
      '<AllowedMethod>GET</AllowedMethod><AllowedMethod>PUT</AllowedMethod><AllowedMethod>HEAD</AllowedMethod>',
      '<AllowedHeader>content-type</AllowedHeader>',
      '<ExposeHeader>ETag</ExposeHeader>',
      '<MaxAgeSeconds>3600</MaxAgeSeconds>',
      '</CORSRule>'
    ].join('');
    const put = await call('PUT', `<?xml version="1.0" encoding="UTF-8"?><CORSConfiguration>${rule}</CORSConfiguration>`);
    if (put.status !== 200) throw new Error(`PutBucketCors ${put.status}: ${put.text.slice(0, 300)}`);
    console.log(`CORS set for ${origins.join(', ')}`);
  }
  const got = await call('GET');
  console.log(`GetBucketCors ${got.status}: ${got.text}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
