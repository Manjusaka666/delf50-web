#!/usr/bin/env node
'use strict';
/**
 * Verifies the cloud layer end to end.
 *
 *   1. Units: SigV4 against the published AWS vectors, the three-way merge, the
 *      projection extractor.
 *   2. API against a real PostgreSQL: accounts, sessions, CSRF, rate limits,
 *      compare-and-swap sync, exact round trips, history, archives, projection
 *      rows, events, media (against an HTTPS S3 mock that checks signatures).
 *   3. Browser: the real index.html + cloud layer + app bundle booted in jsdom
 *      as several devices against the local API, covering first sign-in with
 *      existing progress, a second device, concurrent edits on two devices,
 *      conflicting histories, shared-device account switching and recordings.
 *
 * Needs (outside the deployment, resolved via NODE_PATH): jsdom, pg,
 * fake-indexeddb. Needs a PostgreSQL URL in TEST_DATABASE_URL (an empty scratch
 * database; the schema is created by the migration).
 *
 *   TEST_DATABASE_URL=postgres://… NODE_PATH=… node scripts/verify-cloud.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const results = [];
let failed = 0;
function check(ok, label, detail) {
  results.push(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
  if (!ok) failed++;
}
function section(name) { results.push(`\n${name}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 20000, label = 'condition') {
  const t0 = Date.now();
  for (;;) {
    let v;
    try { v = await fn(); } catch (e) { v = false; }
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${label}`);
    await sleep(60);
  }
}
const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ───────────────────────── 1. units ─────────────────────────────────────────

function unitTests() {
  section('Units');
  const r2 = require(path.join(ROOT, 'api/_lib/r2.js'));
  const now = new Date(Date.UTC(2013, 4, 24));
  const K = { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1', now };
  const url = r2.presign(Object.assign({ method: 'GET', host: 'examplebucket.s3.amazonaws.com', path: '/test.txt', expires: 86400 }, K));
  check(url.endsWith('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404'), 'SigV4 presigned URL matches the AWS test vector');
  const h = r2.signHeaders(Object.assign({ method: 'GET', host: 'examplebucket.s3.amazonaws.com', path: '/test.txt', headers: { range: 'bytes=0-9' },
    payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }, K));
  check(h.authorization.endsWith('Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41'), 'SigV4 header signature matches the AWS test vector');

  const C = require(path.join(ROOT, 'cloud/delf50-cloud.js'));
  const base = { v: 1, grammar: { attempts: 10, correct: 8, skill: { p: { a: 10, c: 8 } } }, reading: { index: 2, answers: { '1:r1:0': 1 } },
    writing: { count: 1, records: [{ at: '2026-09-01T10:00:00.000Z', text: 'a' }] }, drafts171: { writing: { k1: 'draft' } },
    errors: [{ at: '2026-09-01T09:00:00.000Z', q: 'x' }], startedAt: '2026-09-01T08:00:00.000Z', lastSavedAt: '2026-09-01T10:00:00.000Z', selectedDay: 3 };
  const ours = JSON.parse(JSON.stringify(base));
  ours.grammar.attempts = 13; ours.grammar.correct = 10; ours.grammar.skill.p = { a: 13, c: 10 };
  ours.reading.answers['1:r1:1'] = 2; ours.reading.index = 3;
  ours.writing.count = 2; ours.writing.records.push({ at: '2026-09-02T10:00:00.000Z', text: 'ours' });
  delete ours.drafts171.writing.k1;
  ours.errors.unshift({ at: '2026-09-02T09:00:00.000Z', q: 'ours-err' });
  ours.lastSavedAt = '2026-09-02T10:00:00.000Z'; ours.selectedDay = 4;
  const theirs = JSON.parse(JSON.stringify(base));
  theirs.grammar.attempts = 15; theirs.grammar.correct = 9; theirs.grammar.skill.p = { a: 15, c: 9 }; theirs.grammar.skill.q = { a: 1, c: 1 };
  theirs.reading.answers['2:r9:0'] = 0;
  theirs.writing.count = 2; theirs.writing.records.push({ at: '2026-09-01T12:00:00.000Z', text: 'theirs' });
  theirs.errors.unshift({ at: '2026-09-01T11:00:00.000Z', q: 'theirs-err' });
  theirs.lastSavedAt = '2026-09-01T12:00:00.000Z'; theirs.selectedDay = 5; theirs.startedAt = '2026-08-31T08:00:00.000Z';
  const m = C.merge3(base, ours, theirs);
  check(m.grammar.attempts === 18 && m.grammar.correct === 11, 'merge adds both sides’ counter increments', m.grammar);
  check(m.grammar.skill.p.a === 18 && m.grammar.skill.p.c === 11 && m.grammar.skill.q.a === 1, 'merge adds per-skill counters and keeps skills only one side has', m.grammar.skill);
  check(Object.keys(m.reading.answers).length === 3, 'merge keeps every answered question from both sides', m.reading.answers);
  check(m.writing.count === 3 && m.writing.records.map((r) => r.text).join() === 'a,theirs,ours', 'merge keeps both new writing records in time order', m.writing.records);
  check(!('k1' in m.drafts171.writing), 'a draft one side submitted (deleted) and the other left untouched stays deleted');
  check(m.errors.map((e) => e.q).join() === 'ours-err,theirs-err,x', 'merge keeps newest-first error list order', m.errors);
  check(m.selectedDay === 4 && m.reading.index === 3, 'non-counter scalars resolve to the side saved last');
  check(m.startedAt === '2026-08-31T08:00:00.000Z' && m.lastSavedAt === '2026-09-02T10:00:00.000Z', 'startedAt takes the earliest, lastSavedAt the latest');

  const t2 = JSON.parse(JSON.stringify(base)); t2.drafts171.writing.k1 = 'edited on other device';
  const m2 = C.merge3(base, ours, t2);
  check(m2.drafts171.writing.k1 === 'edited on other device', 'a draft edited on one side survives its deletion on the other');
  check(C.deepEqual(C.merge3(base, ours, base), ours) && C.deepEqual(C.merge3(base, base, theirs), theirs), 'one-sided change merges to that side exactly');
  const m3 = C.merge3(undefined, ours, ours);
  check(C.deepEqual(m3, ours), 'merging identical documents without a base is the identity');
  const m4 = C.merge3(undefined, ours, theirs);
  check(m4.writing.records.length === 3 && m4.writing.records.filter((r) => r.text === 'a').length === 1, 'base-less merge unions records and de-duplicates shared ones', m4.writing.records);
  const same = C.merge3({ w: { count: 1, n: 'x' } }, { w: { count: 2, n: 'y' } }, { w: { count: 2, n: 'y' } });
  check(same.w.count === 3 && same.w.n === 'y', 'identical counter increments on two devices are two events, identical values one', same);
  const arr = C.mergeArray(['r1', 'r2'], ['r1', 'r3'], ['r1', 'r2', 'r4']);
  check(arr.join() === 'r1,r3,r4', 'array merge applies removals and additions from both sides', arr);

  const H = require(path.join(ROOT, 'api/_lib/http.js'));
  results.push('  (async readRaw checks run with the API section)');
  H.readRaw({ rawBody: Buffer.alloc(11) }, 10).then(() => check(false, 'buffered rawBody over the limit is refused'), (e) => check(e.status === 413, 'buffered rawBody over the limit is refused'));
  H.readRaw({ body: 'x'.repeat(11) }, 10).then(() => check(false, 'buffered string body over the limit is refused'), (e) => check(e.status === 413, 'buffered string body over the limit is refused'));

  const P = require(path.join(ROOT, 'api/_lib/projection.js'));
  const S = {
    version: '1.9.4', selectedDay: 2, grammar: { attempts: 3, correct: 2 }, reading: { attempts: 2, correct: 1, answers: { '2:r181-d02-s01:0': 1, '2:r181-d02-s01:1': 0 } },
    listening: { answers: { '4:1': 2 } }, daily: { 1: { grammar: 3 }, 2: { reading: 2 } }, dayHistory171: { 2: { firstActivityAt: '2026-09-02T08:00:00.000Z', lastActivityAt: 'bad', actions: 5 } },
    writing: { count: 1, records: [{ day: 2, title: 'T', text: 'Bonjour\u0000', words: 1, at: '2026-09-02T08:00:00.000Z', contentId: 'w1', connectors: [] }] },
    grammarReview202: { '2:GQ-1': { day: 2, contentId: 'GQ-1', selectedIndex: 1, correctIndex: 1, correct: true, answeredAt: '2026-09-02T08:00:00.000Z' } },
    contentProgress172: { completed: { writing: { w1: { day: 2, firstCompletedAt: '2026-09-02T08:00:00.000Z' } } } },
    errors: [{ q: 'x', day: 2 }]
  };
  const x = P.extract(S);
  check(x.answers.get('reading|2:r181-d02-s01:0').content_id === 'r181-d02-s01' && x.answers.get('reading|2:r181-d02-s01:0').day === 2, 'projection parses "<day>:<contentId>:<q>" answer keys');
  check(x.answers.get('listening|4:1').content_id === 'legacy-index-4', 'projection keeps legacy "<index>:<q>" answer keys');
  check(x.answers.get('grammar|2:GQ-1').correct === true, 'projection carries grammar correctness from grammarReview202');
  check(x.daily.get('2').metrics.actions === 5 && x.daily.get('2').last_activity_at === null, 'projection merges day history and drops invalid timestamps');
  check(x.productions.size === 1 && x.completions.size === 1 && x.errors.size === 1, 'projection extracts records, completions and errors');
  const d1 = P.diff(S, S);
  check(!d1.rebuild && ['daily', 'answers', 'completions', 'productions', 'errors'].every((t) => d1[t].upsert.length === 0 && d1[t].delete.length === 0), 'projection diff of an unchanged document is empty');
  const S2 = JSON.parse(JSON.stringify(S)); S2.reading.answers['2:r181-d02-s02:0'] = 2; delete S2.listening.answers['4:1'];
  const d2 = P.diff(S, S2);
  check(d2.answers.upsert.length === 1 && d2.answers.delete.join() === 'listening|4:1', 'projection diff writes only changed rows', d2.answers);
  check(P.diff(null, S).rebuild === true, 'projection without a previous head rebuilds');
}

// ───────────────────────── test infrastructure ─────────────────────────────

function installPgShim(url) {
  const { Pool, types } = require('pg');
  const pool = new Pool({ connectionString: url, max: 8 });
  const neonPath = require.resolve('@neondatabase/serverless', { paths: [path.join(ROOT, 'api/_lib')] });
  const fn = () => { throw new Error('tagged template not used'); };
  fn.query = (text, params) => pool.query(text, params).then((r) => r.rows);
  require.cache[neonPath] = { id: neonPath, filename: neonPath, loaded: true, exports: { neon: () => fn } };
  void types;
  return pool;
}

function makeCert(dir) {
  const key = path.join(dir, 'k.pem'), cert = path.join(dir, 'c.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

/** An S3 endpoint that stores objects in memory and rejects bad signatures. */
function startS3Mock(tls, creds) {
  const r2 = require(path.join(ROOT, 'api/_lib/r2.js'));
  const objects = new Map();
  const stats = { badSig: 0, puts: 0, gets: 0 };
  const server = https.createServer(tls, (req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const u = new URL(req.url, `https://${req.headers.host}`);
      const pth = decodeURIComponent(u.pathname);
      let ok = false;
      if (u.searchParams.get('X-Amz-Signature')) {
        const t = u.searchParams.get('X-Amz-Date');
        const when = new Date(Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8), +t.slice(9, 11), +t.slice(11, 13), +t.slice(13, 15)));
        const extra = {};
        for (const [k, v] of u.searchParams) if (!/^X-Amz-/.test(k)) extra[k] = v;
        const expect = r2.presign({ method: req.method, host: req.headers.host, path: pth, accessKeyId: creds.id, secretAccessKey: creds.secret, expires: Number(u.searchParams.get('X-Amz-Expires')), now: when, extraQuery: extra });
        ok = new URL(expect).searchParams.get('X-Amz-Signature') === u.searchParams.get('X-Amz-Signature') && Date.now() < when.getTime() + 1000 * Number(u.searchParams.get('X-Amz-Expires'));
      } else if (req.headers.authorization) {
        const t = req.headers['x-amz-date'];
        const when = new Date(Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8), +t.slice(9, 11), +t.slice(11, 13), +t.slice(13, 15)));
        const hdrs = {};
        if (req.headers['content-type']) hdrs['content-type'] = req.headers['content-type'];
        const expect = r2.signHeaders({ method: req.method, host: req.headers.host, path: pth, headers: hdrs, payloadHash: req.headers['x-amz-content-sha256'], accessKeyId: creds.id, secretAccessKey: creds.secret, now: when });
        ok = expect.authorization === req.headers.authorization && (req.method !== 'PUT' || sha256hex(body) === req.headers['x-amz-content-sha256']);
      }
      if (!ok) { stats.badSig++; res.writeHead(403); res.end('SignatureDoesNotMatch'); return; }
      const key = pth.replace(/^\/[^/]+\//, '');
      if (req.method === 'PUT') { objects.set(key, { body, type: req.headers['content-type'] || 'application/octet-stream' }); stats.puts++; res.writeHead(200, { ETag: '"x"' }); res.end(); return; }
      const o = objects.get(key);
      if (req.method === 'DELETE') { objects.delete(key); res.writeHead(204); res.end(); return; }
      if (!o) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': o.type, 'Content-Length': o.body.length });
      if (req.method === 'GET') { stats.gets++; res.end(o.body); } else res.end();
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, objects, stats, port: server.address().port })));
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' };

/** Serves the repository like Vercel: static files, /api/source, /api/v1/* rewrite. */
function startApp() {
  const v1 = require(path.join(ROOT, 'api/v1.js'));
  const source = require(path.join(ROOT, 'api/source.js'));
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/v1' || u.pathname.startsWith('/api/v1/')) {
      req.query = Object.fromEntries(u.searchParams);
      req.query.__route = u.pathname.replace(/^\/api\/v1\/?/, '');
      return v1(req, res);
    }
    if (u.pathname === '/api/source') {
      req.query = Object.fromEntries(u.searchParams);
      res.status = (c) => { res.statusCode = c; return res; };
      res.send = (b) => res.end(b);
      return source(req, res);
    }
    const rel = u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname).replace(/^\/+/, '');
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

/** Minimal API client with a cookie jar (for the API section). */
function apiClient(base) {
  let cookie = '';
  async function req(method, p, { json, body, headers = {}, auth = true, raw = false } = {}) {
    const h = Object.assign({ 'X-DELF50-Client': 'test' }, headers);
    if (auth && cookie) h.cookie = cookie;
    let b = body;
    if (json !== undefined) { h['Content-Type'] = 'application/json'; b = JSON.stringify(json); }
    const r = await fetch(base + '/api/v1' + p, { method, headers: h, body: b });
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    for (const c of sc) { const v = c.split(';')[0]; cookie = /Max-Age=0/.test(c) ? '' : v; }
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') && !raw && r.status !== 204 ? await r.json() : Buffer.from(await r.arrayBuffer());
    return { status: r.status, data, headers: r.headers };
  }
  return { req, get cookie() { return cookie; }, set cookie(v) { cookie = v; } };
}

function pushBody(text, gz = true) {
  const bytes = Buffer.from(text, 'utf8');
  return { body: gz ? zlib.gzipSync(bytes) : bytes, headers: { 'X-DELF50-Hash': sha256hex(bytes), 'X-DELF50-Encoding': gz ? 'gzip' : 'identity', 'Content-Type': 'application/octet-stream' } };
}

// ───────────────────────── 2. API ───────────────────────────────────────────

async function apiTests(base, pool, s3) {
  section('API');
  const A = apiClient(base);
  const health = await A.req('GET', '/health', { auth: false });
  check(health.status === 200 && health.data.db === true && health.data.r2 === true, 'health reports database and R2', health.data);

  let r = await A.req('POST', '/auth/register', { json: { email: 'a@example.com', password: 'longpassword', inviteCode: 'nope' } });
  check(r.status === 403 && r.data.error.code === 'invalid_invite', 'registration requires the invite code');
  r = await A.req('POST', '/auth/register', { json: { email: 'a@example.com', password: 'short', inviteCode: 'INVITE-123' } });
  check(r.status === 400 && r.data.error.code === 'weak_password', 'registration rejects short passwords');
  r = await A.req('POST', '/auth/register', { json: { email: 'Api@Example.com', password: 'longpassword', displayName: 'Api', inviteCode: 'INVITE-123', client: { platform: 'web', deviceId: 'web-test-device-1' } } });
  check(r.status === 201 && r.data.user.email === 'Api@Example.com' && r.data.token === null && A.cookie, 'register creates the account and a cookie session', r.data);
  const pw = await pool.query("select password_hash from delf50.users where email_norm = 'api@example.com'");
  check(/^scrypt\$32768\$8\$1\$/.test(pw.rows[0].password_hash), 'passwords are stored as scrypt hashes');
  const tok = await pool.query('select token_hash from delf50.sessions');
  check(tok.rows.every((x) => x.token_hash.length === 32) && !tok.rows.some((x) => A.cookie.includes(x.token_hash.toString('base64url'))), 'only a SHA-256 of the session token is stored');
  r = await A.req('POST', '/auth/register', { json: { email: 'api@example.com', password: 'longpassword', inviteCode: 'INVITE-123' } });
  check(r.status === 409, 'duplicate email (case-insensitive) is rejected');

  r = await A.req('GET', '/auth/me');
  check(r.status === 200 && r.data.user.displayName === 'Api', 'me returns the signed-in user');
  r = await fetch(base + '/api/v1/sync/state', { method: 'PUT', headers: Object.assign({ cookie: A.cookie, 'X-DELF50-Base-Rev': '0' }, pushBody('{"a":1}').headers), body: pushBody('{"a":1}').body });
  check(r.status === 403, 'cookie writes without X-DELF50-Client are refused (CSRF)');
  r = await fetch(base + '/api/v1/sync/state', { method: 'PUT', headers: Object.assign({ cookie: A.cookie, 'X-DELF50-Client': 'web', Origin: 'https://evil.example', 'X-DELF50-Base-Rev': '0' }, pushBody('{"a":1}').headers), body: pushBody('{"a":1}').body });
  check(r.status === 403, 'cookie writes from another origin are refused');

  r = await A.req('GET', '/sync/state?have=0');
  check(r.status === 204 && r.headers.get('x-delf50-rev') === '0', 'a new account has no document (204, rev 0)');

  const doc1 = JSON.stringify({ version: '1.9.4', z: 1, a: { y: 2, b: [3, 'é中😀'], esc: '\\u0000' }, lastSavedAt: '2026-09-01T00:00:00.000Z', meta172: { schemaVersion: 2 } });
  let p = pushBody(doc1);
  r = await A.req('PUT', '/sync/state', { body: p.body, headers: Object.assign({ 'X-DELF50-Base-Rev': '0', 'X-DELF50-Reason': 'claim' }, p.headers) });
  check(r.status === 200 && r.data.status === 'ok' && r.data.rev === 1, 'first push claims revision 1', r.data);
  r = await A.req('PUT', '/sync/state', { body: p.body, headers: Object.assign({ 'X-DELF50-Base-Rev': '0' }, p.headers) });
  check(r.status === 200 && r.data.status === 'same' && r.data.rev === 1, 'a retried push (lost response) is idempotent', r.data);
  r = await A.req('GET', '/sync/state', { raw: true });
  check(r.status === 200 && r.data.toString('utf8') === doc1 && r.headers.get('x-delf50-hash') === sha256hex(doc1), 'the pulled document is byte-identical, key order and escapes included');

  const bad = pushBody('{"x":2}');
  r = await A.req('PUT', '/sync/state', { body: bad.body, headers: Object.assign({}, bad.headers, { 'X-DELF50-Base-Rev': '1', 'X-DELF50-Hash': sha256hex('something else') }) });
  check(r.status === 422 && r.data.error.code === 'hash_mismatch', 'a body that does not match its hash is refused');
  const badUtf8 = Buffer.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]);
  r = await A.req('PUT', '/sync/state', { body: badUtf8, headers: { 'Content-Type': 'application/octet-stream', 'X-DELF50-Encoding': 'identity', 'X-DELF50-Hash': sha256hex(badUtf8), 'X-DELF50-Base-Rev': '1' } });
  check(r.status === 422 && r.data.error.code === 'invalid_utf8', 'a document that is not valid UTF-8 is refused (its hash could never verify)');
  const notJson = pushBody('{not json');
  r = await A.req('PUT', '/sync/state', { body: notJson.body, headers: Object.assign({ 'X-DELF50-Base-Rev': '1' }, notJson.headers) });
  check(r.status === 422, 'a document that is not a JSON object is refused');

  const doc2 = doc1.replace('"z":1', '"z":2');
  p = pushBody(doc2, false);
  r = await A.req('PUT', '/sync/state', { body: p.body, headers: Object.assign({ 'X-DELF50-Base-Rev': '1' }, p.headers) });
  check(r.data.status === 'ok' && r.data.rev === 2, 'push on the current base advances the head (uncompressed body)');
  const doc3 = doc1.replace('"z":1', '"z":3');
  p = pushBody(doc3);
  r = await A.req('PUT', '/sync/state', { body: p.body, headers: Object.assign({ 'X-DELF50-Base-Rev': '1' }, p.headers) });
  check(r.status === 409 && r.data.status === 'conflict' && r.data.rev === 2, 'push on a stale base is a conflict and writes nothing', r.data);
  r = await A.req('GET', '/sync/state?have=2');
  check(r.status === 204, 'pull with the current revision returns 204');

  // Concurrent pushes on the same base: exactly one wins.
  const racers = await Promise.all([4, 5, 6, 7, 8].map((z) => {
    const b = pushBody(doc1.replace('"z":1', `"z":${z}`));
    return A.req('PUT', '/sync/state', { body: b.body, headers: Object.assign({ 'X-DELF50-Base-Rev': '2' }, b.headers) });
  }));
  check(racers.filter((x) => x.data.status === 'ok').length === 1 && racers.filter((x) => x.status === 409).length === 4, 'concurrent pushes on one base: exactly one wins', racers.map((x) => x.data.status));

  r = await A.req('GET', '/sync/revisions');
  check(r.data.revisions.length === 3 && r.data.revisions[0].rev === 3, 'history lists every revision', r.data.revisions.map((x) => x.rev));
  r = await A.req('GET', '/sync/revisions/1', { raw: true });
  check(r.data.toString('utf8') === doc1, 'an old revision is returned byte-identical');
  r = await A.req('POST', '/sync/restore', { json: { rev: 1, baseRev: 3 } });
  check(r.data.status === 'ok' && r.data.rev === 4, 'restore makes an old revision the new head', r.data);
  r = await A.req('GET', '/sync/state', { raw: true });
  check(r.data.toString('utf8') === doc1 && r.headers.get('x-delf50-rev') === '4', 'the restored head equals revision 1');

  p = pushBody('{"archived":true}');
  r = await A.req('POST', '/sync/archive', { body: p.body, headers: Object.assign({ 'X-DELF50-Reason': 'test' }, p.headers) });
  await A.req('POST', '/sync/archive', { body: p.body, headers: Object.assign({ 'X-DELF50-Reason': 'test' }, p.headers) });
  const arch = await A.req('GET', '/sync/archives');
  check(arch.data.archives.length === 1, 'archives are stored once per distinct document');
  r = await A.req('GET', '/sync/archives/' + arch.data.archives[0].id, { raw: true });
  check(r.data.toString('utf8') === '{"archived":true}', 'an archive is returned byte-identical');

  // Projection from a realistic document.
  const S = {
    version: '1.9.4', selectedDay: 2, intensity: 'standard', startedAt: '2026-09-01T08:00:00.000Z', lastSavedAt: '2026-09-02T09:00:00.000Z',
    grammar: { attempts: 4, correct: 3 }, reading: { attempts: 2, correct: 2, answers: { '2:r181-d02-s01:0': 1, '2:r181-d02-s01:1': 2 } },
    listening: { attempts: 0, correct: 0, answers: {} }, writing: { count: 1, records: [{ day: 2, title: 'Lettre', text: 'Chère Marie\u0000…', words: 2, at: '2026-09-02T08:30:00.000Z', contentId: 'w181-d02-s01' }] },
    speaking: { count: 1, totalSec: 42, records: [{ id: 'd2-s1', day: 2, title: 'Présentation', sec: 42, stored: true, at: '2026-09-02T08:40:00.000Z' }] },
    application: { count: 0, records: [] }, daily: { 1: { grammar: 4 }, 2: { reading: 2, writing: 1, speaking: 1 } },
    grammarReview202: { '1:GQ-a': { day: 1, contentId: 'GQ-a', selectedIndex: 0, correctIndex: 0, correct: true, answeredAt: '2026-09-01T08:10:00.000Z' } },
    contentProgress172: { completed: { writing: { 'w181-d02-s01': { day: 2, firstCompletedAt: '2026-09-02T08:30:00.000Z', lastCompletedAt: '2026-09-02T08:30:00.000Z' } } } },
    errors: [{ q: 'Nous ___ prêts.', a: 'avons', good: 'sommes', day: 1, bad: '\ud800' }], meta172: { schemaVersion: 2 }
  };
  const t1 = JSON.stringify(S);
  p = pushBody(t1);
  r = await A.req('PUT', '/sync/state', { body: p.body, headers: Object.assign({ 'X-DELF50-Base-Rev': '4' }, p.headers) });
  check(r.data.status === 'ok' && r.data.rev === 5, 'a realistic document (with NUL and lone surrogate) is accepted', r.data);
  const uid = (await pool.query("select id from delf50.users where email_norm='api@example.com'")).rows[0].id;
  const q = async (sql) => (await pool.query(sql, [uid])).rows;
  const st = (await q('select * from delf50.learning_stats where user_id=$1'))[0];
  check(st && st.grammar_attempts === 4 && st.reading_correct === 2 && st.speaking_total_sec === 42 && st.selected_day === 2, 'learning_stats mirrors the document', st);
  check((await q('select count(*)::int n from delf50.item_answers where user_id=$1'))[0].n === 3, 'item_answers holds reading answers and grammar reviews');
  const pr = await q('select * from delf50.production_records where user_id=$1 order by module');
  check(pr.length === 2 && pr.find((x) => x.module === 'writing').body === 'Chère Marie…' && pr.find((x) => x.module === 'speaking').clip_id === 'd2-s1', 'production_records holds writing text and recording references', pr.map((x) => [x.module, x.body, x.clip_id]));
  check((await q('select count(*)::int n from delf50.daily_progress where user_id=$1'))[0].n === 2, 'daily_progress has one row per day');

  const S2 = JSON.parse(t1);
  S2.reading.answers['2:r181-d02-s02:0'] = 0; S2.reading.attempts = 3; delete S2.daily['1']; S2.errors = [];
  p = pushBody(JSON.stringify(S2));
  r = await A.req('PUT', '/sync/state', { body: p.body, headers: Object.assign({ 'X-DELF50-Base-Rev': '5' }, p.headers) });
  check(r.data.rev === 6, 'incremental push accepted');
  check((await q('select count(*)::int n from delf50.item_answers where user_id=$1'))[0].n === 4
    && (await q('select count(*)::int n from delf50.daily_progress where user_id=$1'))[0].n === 1
    && (await q('select count(*)::int n from delf50.error_items where user_id=$1'))[0].n === 0, 'projection follows additions and removals');
  const sum = await A.req('GET', '/progress/summary');
  check(sum.data.rev === 6 && sum.data.stats.reading_attempts === 3 && sum.data.days.length === 1, 'progress summary endpoint', sum.data);
  const ans = await A.req('GET', '/progress/answers?module=reading&day=2');
  check(ans.data.answers.length === 3, 'progress answers endpoint filters by module and day');

  // Events (native clients).
  const evs = [{ id: 'e1', type: 'answer', occurredAt: '2026-09-02T10:00:00Z', day: 2, module: 'reading', contentId: 'r1', payload: { q: 0, choice: 1 } },
    { id: 'e2', type: 'answer', occurredAt: '2026-09-02T10:01:00Z', payload: { note: 'x\u0000y' } }];
  r = await A.req('POST', '/events', { json: { events: evs } });
  const r2x = await A.req('POST', '/events', { json: { events: evs } });
  check(r.data.accepted === 2 && r2x.data.accepted === 0 && r2x.data.duplicates.length === 2, 'events are idempotent by client id');
  const dup = await A.req('POST', '/events', { json: { events: [{ id: 'e3', type: 'x', occurredAt: '2026-09-02T10:02:00Z' }, { id: 'e3', type: 'x', occurredAt: '2026-09-02T10:02:00Z' }] } });
  check(dup.data.accepted === 1 && dup.data.duplicates.join() === 'e3', 'a repeated id within one batch is reported as a duplicate', dup.data);
  r = await A.req('GET', '/events?after=0');
  const cursor = r.data.nextCursor;
  r = await A.req('GET', '/events?after=' + cursor);
  check(r.data.events.length === 0, 'event cursor pagination');

  // Media via the S3 mock.
  const audio = crypto.randomBytes(3000);
  r = await A.req('POST', '/media/upload-url', { json: { clipId: 'd2-s1', contentType: 'audio/webm;codecs=opus', size: audio.length, day: 2, durationSec: 42 } });
  check(r.status === 200 && r.data.status === 'pending' && /X-Amz-Signature=/.test(r.data.upload.url), 'upload-url returns a presigned PUT', r.data);
  let put = await fetch(r.data.upload.url, { method: 'PUT', body: audio, headers: r.data.upload.headers });
  check(put.ok, 'the presigned PUT is accepted by S3 (signature verified by the mock)');
  const tampered = r.data.upload.url.replace('d2-s1', 'd2-s2');
  put = await fetch(tampered, { method: 'PUT', body: audio });
  check(put.status === 403, 'a presigned URL cannot be reused for another key');
  r = await A.req('POST', '/media/complete', { json: { clipId: 'd2-s1' } });
  check(r.data.status === 'stored' && r.data.size === 3000, 'complete verifies the object in storage (HEAD)');
  r = await A.req('POST', '/media/upload-url', { json: { clipId: 'd2-s1', contentType: 'audio/webm', size: 1 } });
  check(r.data.status === 'stored', 'a stored clip is not uploaded twice');
  r = await A.req('POST', '/media/upload-url', { json: { clipId: 'd2-s9', contentType: 'audio/mp4', size: 10 } });
  r = await A.req('PUT', '/media/raw?clipId=d2-s9', { body: Buffer.from('0123456789'), headers: { 'Content-Type': 'audio/mp4' } });
  check(r.data.status === 'stored' && s3.objects.has(`u/${uid}/speaking/d2-s9.m4a`), 'proxy upload stores through the function (header-signed)');
  r = await A.req('GET', '/media/url?clipId=d2-s1');
  const dl = await fetch(r.data.url);
  check(dl.ok && Buffer.from(await dl.arrayBuffer()).equals(audio), 'presigned GET returns the exact bytes');
  r = await A.req('GET', '/media/raw?clipId=d2-s9');
  check(r.data.toString() === '0123456789', 'proxy download returns the exact bytes');
  r = await A.req('GET', '/media');
  check(r.data.media.length === 2 && r.data.media.every((x) => x.status === 'stored'), 'media list');
  r = await A.req('POST', '/media/upload-url', { json: { clipId: 'd2-big', contentType: 'audio/webm', size: 10 } });
  put = await fetch(r.data.upload.url, { method: 'PUT', body: crypto.randomBytes(5000), headers: r.data.upload.headers });
  r = await A.req('POST', '/media/complete', { json: { clipId: 'd2-big' } });
  check(r.status === 422 && r.data.error.code === 'size_mismatch' && !s3.objects.has(`u/${uid}/speaking/d2-big.webm`), 'an upload larger than declared is refused and deleted', r.data);
  r = await A.req('POST', '/media/upload-url', { json: { clipId: '../../etc', contentType: 'audio/webm', size: 10 } });
  check(r.status === 400, 'clip ids cannot escape the user prefix');
  check(s3.stats.badSig === 1, 'no request from the server failed signature checks', s3.stats);

  // Isolation between accounts.
  const B = apiClient(base);
  await B.req('POST', '/auth/register', { json: { email: 'b@example.com', password: 'longpassword', inviteCode: 'INVITE-123' } });
  r = await B.req('GET', '/sync/state');
  check(r.status === 204, 'another account does not see the first account’s document');
  r = await B.req('GET', '/media/url?clipId=d2-s1');
  check(r.status === 404, 'another account cannot reach the first account’s recordings');

  // Account cap under concurrent registrations.
  const before = (await pool.query('select count(*)::int n from delf50.users')).rows[0].n;
  process.env.DELF50_MAX_USERS = String(before + 2);
  const regs = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => apiClient(base).req('POST', '/auth/register', { json: { email: `cap${i}@example.com`, password: 'longpassword', inviteCode: 'INVITE-123' } })));
  delete process.env.DELF50_MAX_USERS;
  const after = (await pool.query('select count(*)::int n from delf50.users')).rows[0].n;
  check(after === before + 2 && regs.filter((x) => x.status === 201).length === 2 && regs.filter((x) => x.status === 403 && x.data.error.code === 'registration_full').length === 4, 'concurrent registrations never exceed DELF50_MAX_USERS', { before, after, statuses: regs.map((x) => x.status) });

  // Bearer tokens for apps.
  const T = apiClient(base);
  r = await T.req('POST', '/auth/login', { json: { email: 'api@example.com', password: 'longpassword', transport: 'bearer', client: { platform: 'ios', deviceId: 'ios-device-0001', name: 'iPhone' } } });
  const token = r.data.token;
  check(r.status === 200 && typeof token === 'string' && token.length >= 40 && !T.cookie, 'bearer login returns a token and no cookie');
  r = await fetch(base + '/api/v1/sync/state?have=0', { headers: { Authorization: 'Bearer ' + token } });
  check(r.status === 200 && r.headers.get('x-delf50-rev') === '6', 'bearer token reads the same document (no CSRF header needed)');
  r = await fetch(base + '/api/v1/auth/me', { headers: { cookie: 'delf50_sid=' + token } });
  check(r.status === 401, 'a bearer token is not accepted as a cookie');

  // Sessions and password change.
  r = await A.req('GET', '/auth/sessions');
  check(r.data.sessions.length === 2 && r.data.sessions.some((s) => s.current), 'session list shows web and app sessions');
  r = await A.req('POST', '/auth/password', { json: { currentPassword: 'wrong', newPassword: 'newlongpassword' } });
  check(r.status === 401, 'password change requires the current password');
  r = await A.req('POST', '/auth/password', { json: { currentPassword: 'longpassword', newPassword: 'newlongpassword' } });
  check(r.status === 200, 'password change');
  r = await fetch(base + '/api/v1/auth/me', { headers: { Authorization: 'Bearer ' + token } });
  check(r.status === 401, 'password change signs out every other session');
  r = await A.req('GET', '/auth/me');
  check(r.status === 200, 'the current session survives the password change');

  // Rate limiting.
  const L = apiClient(base);
  let last;
  for (let i = 0; i < 9; i++) last = await L.req('POST', '/auth/login', { json: { email: 'api@example.com', password: 'bad-' + i } });
  check(last.status === 429, 'login locks after repeated failures', last.status);
  last = await L.req('POST', '/auth/login', { json: { email: 'api@example.com', password: 'newlongpassword' } });
  check(last.status === 429, 'the lock also holds for the right password until it expires');
  await pool.query("delete from delf50.auth_attempts where subject = 'api@example.com'");

  r = await A.req('POST', '/auth/logout');
  check(r.status === 200, 'logout');
  r = await A.req('GET', '/auth/me');
  check(r.status === 401, 'the session is revoked after logout');
}

// ───────────────────────── 3. browser devices ──────────────────────────────

async function browserTests(base, pool, s3) {
  section('Browser (index.html + cloud layer + app bundle in jsdom)');
  const { JSDOM, VirtualConsole } = require('jsdom');
  const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');
  const { Blob } = require('buffer');
  const origin = new URL(base).origin;

  class Device {
    constructor(name) {
      this.name = name; this.ls = {}; this.ss = {}; this.idb = new IDBFactory(); this.cookie = '';
      this.corsBlocked = false; this.w = null; this.reloads = 0; this.errors = [];
    }
    async fetchShim(input, init) {
      init = init || {};
      const url = new URL(typeof input === 'string' ? input : input.url, base);
      if (this.corsBlocked && url.origin !== origin) throw new TypeError('Failed to fetch');
      const headers = new Headers(init.headers || {});
      if (url.origin === origin && this.cookie) headers.set('cookie', this.cookie);
      let body = init.body;
      if (body && typeof body === 'object' && !(body instanceof Uint8Array) && !(body instanceof ArrayBuffer) && typeof body.arrayBuffer === 'function') body = Buffer.from(await body.arrayBuffer());
      const r = await fetch(url, { method: init.method || 'GET', headers, body, signal: init.signal });
      if (url.origin === origin) {
        for (const c of (r.headers.getSetCookie ? r.headers.getSetCookie() : [])) this.cookie = /Max-Age=0/.test(c) ? '' : c.split(';')[0];
      }
      return r;
    }
    async open() {
      this.reloadRequested = false;
      const vc = new VirtualConsole();
      vc.on('jsdomError', (e) => { if (/navigation/i.test(String(e.message))) this.reloadRequested = true; else this.errors.push(String(e.message)); });
      vc.on('error', (e) => this.errors.push(String(e)));
      const dev = this;
      const dom = await JSDOM.fromURL(base + '/', {
        runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
        beforeParse(w) {
          for (const [k, v] of Object.entries(dev.ls)) w.localStorage.setItem(k, v);
          for (const [k, v] of Object.entries(dev.ss)) w.sessionStorage.setItem(k, v);
          Object.defineProperty(w, 'indexedDB', { value: dev.idb, configurable: true });
          w.IDBKeyRange = IDBKeyRange;
          Object.defineProperty(w, 'crypto', { value: crypto.webcrypto, configurable: true });
          w.fetch = (i, o) => dev.fetchShim(i, o);
          w.TextEncoder = TextEncoder; w.CompressionStream = CompressionStream; w.Response = Response; w.Headers = Headers;
          w.Blob = Blob; w.AbortController = AbortController;
          w.alert = () => {}; w.scrollTo = () => {};
          w.confirm = () => true;
        }
      });
      this.w = dom.window;
      await until(() => this.w.__DELF50_BOOT && this.w.__DELF50_BOOT.status === 'ready', 60000, `${this.name} boot`);
      await until(() => this.w.document.querySelector('.dc-chip'), 10000, `${this.name} chip`);
      return this;
    }
    snapshot() {
      const w = this.w;
      this.ls = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); this.ls[k] = w.localStorage.getItem(k); }
      this.ss = {}; for (let i = 0; i < w.sessionStorage.length; i++) { const k = w.sessionStorage.key(i); this.ss[k] = w.sessionStorage.getItem(k); }
    }
    async reload() { this.snapshot(); this.w.close(); this.reloads++; return this.open(); }
    close() { if (this.w) { this.snapshot(); this.w.close(); this.w = null; } }
    /** Waits for a reload the page asked for, then performs it. */
    async followReload(ms = 20000) { await until(() => this.reloadRequested, ms, `${this.name} reload`); return this.reload(); }
    state() { return JSON.parse(this.w.localStorage.getItem('delf50_v12_state')); }
    text() { return this.w.localStorage.getItem('delf50_v12_state'); }
    cloud() { return this.w.__DELF50_CLOUD.status(); }
    click(sel) { const e = this.w.document.querySelector(sel); if (!e) throw new Error(`${this.name}: no ${sel}`); e.click(); }
    async signIn(kind, email, password, extra = {}) {
      const d = this.w.document;
      if (!d.querySelector('[data-dc="form"]')) { this.click('.dc-chip'); }
      await until(() => d.querySelector('[data-dc="form"]'), 5000, 'auth form');
      this.click(kind === 'register' ? '[data-dc="tab-register"]' : '[data-dc="tab-login"]');
      const form = d.querySelector('[data-dc="form"]');
      const fields = Object.assign({ email, password }, extra);
      for (const [k, v] of Object.entries(fields)) { const el = form.querySelector(`[name="${k}"]`); if (el) el.value = v; }
      form.dispatchEvent(new this.w.Event('submit', { cancelable: true, bubbles: true }));
    }
    async answerGrammar(n) {
      for (let i = 0; i < n; i++) {
        this.click('[data-nav="grammar"]');
        const opt = this.w.document.querySelector('[data-gopt="0"]');
        if (!opt) break;
        opt.click();
        const b = this.w.document.getElementById('submitG'); if (b) b.click();
        const next = [...this.w.document.querySelectorAll('button')].find((x) => /下一题|继续/.test(x.textContent) && !x.disabled);
        if (next) next.click();
      }
    }
    answerReading(keys) {
      this.click('[data-nav="input"]'); this.click('[data-inputtab="reading"]');
      for (const k of keys) { const e = this.w.document.querySelector(`[data-ropt="${k}"]`); if (e) e.click(); }
    }
    write(textValue) {
      this.click('[data-nav="output"]');
      const ta = this.w.document.getElementById('writeText');
      ta.value = textValue; ta.dispatchEvent(new this.w.Event('input'));
      [...this.w.document.querySelectorAll('button')].find((b) => /保存本次写作/.test(b.textContent)).click();
    }
  }

  const head = async (email) => (await pool.query(
    'select s.rev, s.hash, s.state_text from delf50.learning_state s join delf50.users u on u.id=s.user_id where u.email_norm=$1', [email])).rows[0];
  const Cl = require(path.join(ROOT, 'cloud/delf50-cloud.js'));
  // Synced = same revision and the same learning (bookkeeping stamps the app
  // rewrites on every start may differ; they are deliberately not synced alone).
  const synced = (dev, email) => until(async () => {
    const h = await head(email);
    const st = dev.cloud();
    return h && st.status === 'synced' && st.meta.rev === Number(h.rev) && Cl.semanticText(dev.text()) === Cl.semanticText(h.state_text);
  }, 25000, `${dev.name} synced`).catch(async (e) => {
    const h = await head(email);
    const st = dev.cloud();
    throw new Error(`${e.message}: status=${st.status} detail=${st.detail} rev=${st.meta.rev} head=${h && h.rev} sameLearning=${h && Cl.semanticText(dev.text()) === Cl.semanticText(h.state_text)}\n      ${st.trace.join('\n      ')}`);
  });
  const catchUp = async (dev) => { await dev.w.__DELF50_CLOUD.syncNow(); if (dev.reloadRequested) await dev.followReload(); };
  /** Waits until the device is in sync, performing any reload it asks for. */
  const settle = async (dev, email) => {
    const t0 = Date.now();
    for (;;) {
      if (dev.reloadRequested) await dev.followReload();
      try { await until(async () => dev.reloadRequested || (await synced(dev, email).then(() => true)), 25000); } catch (e) { if (Date.now() - t0 > 40000) throw e; }
      if (!dev.reloadRequested) return synced(dev, email);
    }
  };

  // ── A: a learner with existing local progress signs up ──
  const A = new Device('A');
  await A.open();
  check(A.cloud().status === 'anon' && A.w.document.querySelector('.dc-chip').textContent.includes('登录'), 'signed out, the app runs as before and the chip offers sign-in');
  await A.answerGrammar(3);
  A.answerReading(['0:0', '1:1', '2:1']);
  A.write('Bonjour madame, je vous écris parce que je voudrais des informations sur le cours de français du soir.');
  const beforeLogin = A.text();
  const s0 = JSON.parse(beforeLogin);
  check(s0.grammar.attempts >= 1 && Object.keys(s0.reading.answers).length === 3 && s0.writing.count === 1, 'anonymous learning is recorded locally', { g: s0.grammar.attempts, r: Object.keys(s0.reading.answers).length, w: s0.writing.count });
  await sleep(1500);
  await A.signIn('register', 'lea@example.com', 'correct-horse-9', { displayName: 'Léa', inviteCode: 'INVITE-123' });
  await synced(A, 'lea@example.com');
  let h = await head('lea@example.com');
  check(Number(h.rev) >= 1 && h.state_text === A.text() && JSON.parse(h.state_text).writing.records[0].text.startsWith('Bonjour madame'), 'sign-up uploads the existing local progress exactly (claim)');
  check(A.reloads === 0 && !A.reloadRequested, 'claiming does not reload the page');

  A.answerReading([]);
  const nextBtn = A.w.document.getElementById('nextReading'); if (nextBtn && !nextBtn.disabled) nextBtn.click();
  await A.answerGrammar(2);
  await synced(A, 'lea@example.com');
  h = await head('lea@example.com');
  check(JSON.parse(h.state_text).grammar.attempts === A.state().grammar.attempts, 'further learning is pushed automatically');

  // ── B: a second, fresh device for the same learner ──
  const B = new Device('B');
  await B.open();
  await sleep(1400);
  await B.signIn('login', 'lea@example.com', 'correct-horse-9');
  await B.followReload();
  await settle(B, 'lea@example.com');
  await catchUp(A); await settle(A, 'lea@example.com');
  const sa = A.state(), sb = B.state();
  check(sb.grammar.attempts === sa.grammar.attempts && C_eq(sb.reading.answers, sa.reading.answers) && sb.writing.records.length === sa.writing.records.length
    && sb.writing.records[0].text === sa.writing.records[0].text, 'a second device receives the full learning record', { a: sa.grammar.attempts, b: sb.grammar.attempts });
  check(B.w.document.querySelector('.dc-chip').textContent.includes('Léa'), 'the chip shows the signed-in learner');

  // The app's own migrations may re-route unstarted slots the first time a
  // document boots on another device; that converges once. After that,
  // opening the app anywhere must not create revisions or reload other pages.
  await sleep(3500);
  await catchUp(A); await settle(A, 'lea@example.com');
  await catchUp(B); await settle(B, 'lea@example.com');
  const revStable = Number((await head('lea@example.com')).rev);
  const reloadsA = A.reloads;
  await B.reload();
  await sleep(4000);
  await catchUp(A);
  check(Number((await head('lea@example.com')).rev) === revStable, 'reopening the app without learning creates no new revision', { before: revStable, after: Number((await head('lea@example.com')).rev) });
  check(!A.reloadRequested && A.reloads === reloadsA, 'a device opening the app elsewhere does not reload this page');

  // ── concurrent learning on A and B ──
  await synced(A, 'lea@example.com');
  const gA0 = A.state().grammar.attempts;
  A.w.__DELF50_CLOUD; // A keeps its base
  await A.answerGrammar(2);
  await B.answerGrammar(3);
  B.write('Salut Paul, merci pour ton message. Je peux venir samedi après-midi avec ma sœur si tu veux.');
  // Both push; one of them conflicts, merges and reloads.
  await sleep(4000);
  const reloader = A.reloadRequested ? A : B.reloadRequested ? B : null;
  check(Boolean(reloader), 'a concurrent edit is detected as a conflict (one device merges)');
  if (reloader) { check(/pull|reconcile|apply merged/.test(reloader.cloud().trace.join(' ')) && reloader.cloud().trace.some((t) => /apply merged/.test(t)), 'the conflicting device merged (three-way, with its base)', reloader.cloud().trace.slice(-6)); await settle(reloader, 'lea@example.com'); }
  const other = reloader === A ? B : A;
  await catchUp(other);
  await settle(A, 'lea@example.com');
  await settle(B, 'lea@example.com');
  const ma = A.state(), mb = B.state();
  check(ma.grammar.attempts === gA0 + 5 && mb.grammar.attempts === gA0 + 5, 'after merging, both devices count all 5 new grammar answers', { base: gA0, a: ma.grammar.attempts, b: mb.grammar.attempts });
  check(ma.writing.records.length === 2 && mb.writing.records.length === 2, 'the writing done on B reached A', ma.writing.records.length);
  check(Cl.semanticText(A.text()) === Cl.semanticText(B.text()), 'both devices end with the same learning record');

  // ── recordings ──
  const clip = { id: 'd1-s' + Date.now(), blob: new Blob([crypto.randomBytes(4096)], { type: 'audio/webm' }), at: Date.now() };
  await new Promise((resolve, reject) => {
    const rq = A.w.indexedDB.open('delf50_audio_v1', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('clips', { keyPath: 'id' });
    rq.onsuccess = () => { const tx = rq.result.transaction('clips', 'readwrite'); tx.objectStore('clips').put(clip); tx.oncomplete = () => { rq.result.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
    rq.onerror = () => reject(rq.error);
  });
  const sA = A.state();
  sA.speaking.records.push({ id: clip.id, day: 1, title: 'Test', sec: 12, stored: true, at: new Date().toISOString() });
  sA.speaking.count++; sA.speaking.totalSec += 12;
  A.w.localStorage.setItem('delf50_v12_state', JSON.stringify(sA)); // as the app's save() would
  A.corsBlocked = true;
  await synced(A, 'lea@example.com');
  await A.w.__DELF50_CLOUD.syncMedia();
  const leaId = (await pool.query("select id from delf50.users where email_norm='lea@example.com'")).rows[0].id;
  const stored = s3.objects.get(`u/${leaId}/speaking/${clip.id}.webm`);
  check(stored && stored.body.equals(Buffer.from(await clip.blob.arrayBuffer())), 'a recording is uploaded to R2 (proxy fallback when direct upload is blocked)', A.cloud().media);
  await catchUp(B);
  await settle(B, 'lea@example.com');
  await B.w.__DELF50_CLOUD.syncMedia();
  const got = await new Promise((resolve) => {
    const rq = B.w.indexedDB.open('delf50_audio_v1', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('clips', { keyPath: 'id' });
    rq.onsuccess = () => { const g = rq.result.transaction('clips').objectStore('clips').get(clip.id); g.onsuccess = () => { rq.result.close(); resolve(g.result); }; };
  });
  check(got && got.blob && Buffer.from(await got.blob.arrayBuffer()).equals(Buffer.from(await clip.blob.arrayBuffer())), 'the recording is restored into the second device’s audio store (direct presigned GET)');

  // ── C: independent local history meets an existing account ──
  const C = new Device('C');
  await C.open();
  await C.answerGrammar(4);
  C.write('Bonsoir, je m’appelle Léa et j’habite à Lyon depuis deux ans avec ma famille et mon chat.');
  const cLocal = C.state();
  await sleep(1400);
  await C.signIn('login', 'lea@example.com', 'correct-horse-9');
  await until(() => C.cloud().decision, 15000, 'decision');
  check(Boolean(C.w.document.querySelector('[data-dc="merge"]')), 'conflicting histories ask the learner (merge / cloud / local)');
  const cloudBefore = JSON.parse((await head('lea@example.com')).state_text);
  C.click('[data-dc="merge"]');
  await C.followReload();
  await settle(C, 'lea@example.com');
  const merged = C.state();
  check(merged.grammar.attempts === cloudBefore.grammar.attempts + cLocal.grammar.attempts, 'merge adds the local grammar history to the cloud history', { cloud: cloudBefore.grammar.attempts, local: cLocal.grammar.attempts, merged: merged.grammar.attempts });
  check(merged.writing.records.length === cloudBefore.writing.records.length + 1, 'merge keeps every writing record from both histories');
  const archived = await pool.query('select count(*)::int n from delf50.state_archives where user_id=$1', [leaId]);
  check(archived.rows[0].n >= 1, 'the local document was archived on the server before merging');

  // ── shared device: another learner signs in on C ──
  const leaText = C.text();
  C.click('.dc-chip');
  await until(() => C.w.document.querySelector('[data-dc="logout"]'), 5000, 'account panel');
  C.click('[data-dc="logout"]');
  await until(() => C.cloud().meta.loggedIn === false, 10000, 'logout');
  check(C.text() === leaText, 'signing out keeps the local record by default');
  await C.signIn('register', 'tom@example.com', 'another-pass-7', { displayName: 'Tom', inviteCode: 'INVITE-123' });
  await C.followReload();
  await until(() => C.cloud().meta.loggedIn && C.cloud().status === 'synced', 20000, 'tom synced');
  check(C.state().grammar.attempts === 0 && C.cloud().meta.user.displayName === 'Tom', 'a different learner starts from their own (empty) record');
  const tomHead = await head('tom@example.com');
  check(!tomHead || JSON.parse(tomHead.state_text).grammar.attempts === 0, 'the first learner’s data never reaches the second account');
  await C.answerGrammar(1);
  await synced(C, 'tom@example.com');
  // A clip left in this browser's audio store by another learner.
  await new Promise((resolve, reject) => {
    const rq = C.w.indexedDB.open('delf50_audio_v1', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('clips', { keyPath: 'id' });
    rq.onsuccess = () => { const tx = rq.result.transaction('clips', 'readwrite'); tx.objectStore('clips').put({ id: 'd1-s-foreign', blob: new Blob([Buffer.alloc(64)], { type: 'audio/webm' }), at: Date.now() }); tx.oncomplete = () => { rq.result.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
  });
  await C.w.__DELF50_CLOUD.syncMedia();
  const tomId = (await pool.query("select id from delf50.users where email_norm='tom@example.com'")).rows[0].id;
  check(![...s3.objects.keys()].some((k) => k.startsWith(`u/${tomId}/`)), 'recordings in a shared browser are never uploaded to another account', [...s3.objects.keys()]);
  C.click('.dc-chip');
  await until(() => C.w.document.querySelector('[data-dc="logout"]'), 5000, 'account panel');
  C.w.document.querySelector('[data-dc="wipe"]').checked = true;
  C.click('[data-dc="logout"]');
  await C.followReload();
  check(C.text() === null || JSON.parse(C.text()).grammar.attempts === 0, 'sign-out with “remove from this device” clears the local record');
  await sleep(1400);
  await C.signIn('login', 'lea@example.com', 'correct-horse-9');
  await C.followReload();
  await settle(C, 'lea@example.com');
  check(C.state().grammar.attempts === JSON.parse((await head('lea@example.com')).state_text).grammar.attempts && C.state().grammar.attempts > 0, 'the first learner signs back in and gets their record back');

  // ── "use this device" archives the cloud copy before replacing it ──
  const D = new Device('D');
  await D.open();
  await D.answerGrammar(2);
  await sleep(1400);
  await D.signIn('login', 'lea@example.com', 'correct-horse-9');
  await until(() => D.cloud().decision, 15000, 'decision D');
  const cloudText = (await head('lea@example.com')).state_text;
  D.click('[data-dc="local"]');
  await settle(D, 'lea@example.com');
  const arch = await pool.query("select count(*)::int n from delf50.state_archives where user_id=$1 and hash=$2 and reason='replaced-by-local'", [leaId, sha256hex(cloudText)]);
  check(arch.rows[0].n === 1, 'choosing this device archives the replaced cloud document first');
  check(Cl.semanticText((await head('lea@example.com')).state_text) === Cl.semanticText(D.text()), 'choosing this device makes its record the account head');
  D.close();

  // ── the rest ──
  const allErrors = [A, B, C, D].flatMap((d) => d.errors.filter((e) => !/Could not load (img|link)|not implemented/i.test(e)));
  check(allErrors.length === 0, 'no script errors in any device', allErrors.slice(0, 5));
  for (const d of [A, B, C]) d.close();
}

function C_eq(a, b) { return JSON.stringify(Object.keys(a).sort().map((k) => [k, a[k]])) === JSON.stringify(Object.keys(b).sort().map((k) => [k, b[k]])); }

// ───────────────────────── main ─────────────────────────────────────────────

async function main() {
  unitTests();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    results.push('\n  skip API and browser sections: TEST_DATABASE_URL is not set');
  } else {
    const pool = installPgShim(url);
    await pool.query('drop schema if exists delf50 cascade');
    for (const f of fs.readdirSync(path.join(ROOT, 'db/migrations')).filter((x) => x.endsWith('.sql')).sort()) {
      await pool.query(fs.readFileSync(path.join(ROOT, 'db/migrations', f), 'utf8'));
    }
    process.env.DATABASE_URL = 'postgres://shim';
    process.env.DELF50_INVITE_CODE = 'INVITE-123';
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'delf50-cloud-'));
    const creds = { id: 'TESTKEYID', secret: crypto.randomBytes(20).toString('hex') };
    const s3 = await startS3Mock(makeCert(tmp), creds);
    Object.assign(process.env, { R2_ENDPOINT: `https://127.0.0.1:${s3.port}`, R2_BUCKET: 'delf50-test', R2_ACCESS_KEY_ID: creds.id, R2_SECRET_ACCESS_KEY: creds.secret });
    const app = await startApp();
    try {
      await apiTests(app.base, pool, s3);
      await pool.query('delete from delf50.users');
      s3.objects.clear();
      await browserTests(app.base, pool, s3);
    } catch (e) {
      check(false, 'suite aborted', e.stack || String(e));
    } finally {
      app.server.close(); s3.server.close(); await pool.end();
    }
  }
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} check(s) FAILED.` : '\nAll cloud checks passed.');
  process.exit(failed ? 1 : 0);
}

main();
