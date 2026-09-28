#!/usr/bin/env node
'use strict';
/**
 * Verifies the cloud layer end to end.
 *
 *   1. Units: SigV4 against the AWS test vectors, the client's change batches,
 *      the column mapping.
 *   2. API against a real PostgreSQL, connected as the RLS-bound delf50_api
 *      role: Neon Auth proxy (against a mock that issues real cookies and
 *      EdDSA JWTs), exact state round trips, idempotent replays, append-only
 *      grammar history, row-level isolation, bearer tokens, R2 media (HTTPS
 *      S3 mock that checks signatures), vocabulary SM-2.
 *   3. Browser: index.html + cloud layer + the real app bundle in jsdom:
 *      sign-in gate, live saving latency, nothing persisted in the browser,
 *      reload / second device / cross-device refresh, recordings, session
 *      expiry mid-study, sign-out.
 *
 * Needs (resolved via NODE_PATH): jsdom, pg, fake-indexeddb, and an empty
 * scratch PostgreSQL (superuser) in TEST_DATABASE_URL.
 *
 *   TEST_DATABASE_URL=postgres://… NODE_PATH=… node scripts/verify-cloud.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const results = [];
let failed = 0;
function check(ok, label, detail) {
  results.push(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
  if (!ok) failed++;
}
const section = (name) => results.push(`\n${name}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 20000, label = 'condition') {
  const t0 = Date.now();
  for (;;) {
    let v;
    try { v = await fn(); } catch (e) { v = false; }
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${label}`);
    await sleep(20);
  }
}
const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
const clone = (x) => JSON.parse(JSON.stringify(x));

const C = require(path.join(ROOT, 'cloud/delf50-cloud.js'));
const records = require(path.join(ROOT, 'api/_lib/records.js'));
const SPEC = records.collections();
const sameData = (a, b) => C.equal(a, b);

/** A realistic learner state, with edge cases the column mapping must keep. */
function sampleState() {
  return {
    version: '2.0.2', selectedDay: 3, intensity: 'standard', taskDone: { '3-0': true },
    grammar: { attempts: 4, correct: 3, skill: { subj: { a: 2, c: 1 } } },
    reading: { attempts: 3, correct: 2, index: 1, answers: { '3:r181-d03-s01:0': 1, '3:r181-d03-s01:1': 0, 'odd-key': 'x' } },
    listening: { attempts: 1, correct: 1, index: 0, answers: { '2:l1:0': 2 } },
    application: { count: 1, index: 1, records: [{ day: 3, title: 'Lettre', text: 'Madame, …', hits: ['donc'], at: '2026-09-28T08:00:00.000Z', contentId: 'a1' }] },
    writing: { count: 2, index: 2, records: [
      { day: 2, title: 'Essai', text: 'Je pense que…', words: 120, connectors: ['cependant'], paragraphs: 3, at: '2026-09-27T09:15:00.123Z', contentId: 'w1' },
      { day: 3, title: 'Essai 2', text: 'Premièrement 😀 "quotes" \\ back', words: 12.5, at: 'not a date', contentId: null }
    ] },
    speaking: { count: 2, totalSec: 95, index: 2, records: [
      { id: 'd3-s1', day: 3, title: 'Monologue', sec: 60, stored: true, at: '2026-09-28T08:10:00.000Z' },
      { id: 'd3-s2', day: 3, title: 'Dialogue', sec: 35.5, stored: false, manual: true, at: '2026-09-28T08:12:00.000Z', contentId: 's2' }
    ] },
    errors: [
      { skill: 'grammar', original: 'je suis allé', correct: 'je suis allée', why: 'accord', at: '2026-09-28T08:20:00.000Z' },
      { skill: 'grammar', original: 'x', correct: 'y', why: 'z', at: '2026-09-28T08:19:00.000Z' },
      { skill: 'grammar', original: 'x', correct: 'y', why: 'z', at: '2026-09-28T08:19:00.000Z' },
      'legacy string item'
    ],
    startedAt: '2026-09-26T07:00:00.000Z', lastSavedAt: '2026-09-28T08:20:01.000Z',
    daily: { 3: { grammar: 4, reading: 3, writing: 1 } },
    drafts171: { writing: { 'd3-w': 'brouillon', 'd3-x': { rich: true } }, application: {} },
    dayHistory171: { 3: { firstActivityAt: '2026-09-28T07:00:00.000Z' } },
    meta172: { schemaVersion: 2, migrations: ['a', 'b'] },
    contentProgress172: { completed: { writing: { w1: { firstCompletedAt: '2026-09-27T09:15:00.123Z', lastCompletedAt: '2026-09-28T09:15:00.123Z', day: 2 } }, reading: { r1: { day: 3, correct: true, firstCompletedAt: '2026-09-28T08:00:00.000Z' } } } },
    grammarReview202: {
      '3:GQ-1': { day: 3, contentId: 'GQ-1', nodeId: 'subj', nodeName: 'Subjonctif', question: 'Il faut que tu …', options: ['viens', 'viennes'], selectedIndex: 1, correctIndex: 1, correct: true, explanation: '…', answeredAt: '2026-09-28T08:05:00.000Z', route: 'main' },
      '3:GQ-2': { day: 3, contentId: 'GQ-2', selectedIndex: 0, correctIndex: 1, correct: false, answeredAt: '2026-09-28T08:06:00.000Z' }
    }
  };
}

// ───────────────────────── 1. units ─────────────────────────────────────────

function unitTests() {
  section('Units');
  const r2 = require(path.join(ROOT, 'api/_lib/r2.js'));
  const K = { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1', now: new Date(Date.UTC(2013, 4, 24)) };
  const url = r2.presign(Object.assign({ method: 'GET', host: 'examplebucket.s3.amazonaws.com', path: '/test.txt', expires: 86400 }, K));
  check(url.endsWith('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404'), 'SigV4 presigned URL matches the AWS test vector');
  const h = r2.signHeaders(Object.assign({ method: 'GET', host: 'examplebucket.s3.amazonaws.com', path: '/test.txt', headers: { range: 'bytes=0-9' },
    payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }, K));
  check(h.authorization.endsWith('Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41'), 'SigV4 header signature matches the AWS test vector');

  const S = sampleState();
  const d0 = C.diff({}, {}, S, SPEC);
  const docKeys = d0.doc.map((o) => o[0].join('.'));
  check(!docKeys.some((k) => /answers|records|^errors|grammarReview202|drafts171\.writing|completed/.test(k)) && docKeys.includes('reading') && docKeys.includes('meta172'),
    'records are never part of the document batch', docKeys);
  check(d0.ops.writing.set.length === 2 && d0.ops.errors.set.length === 4 && d0.ops.completions.set.length === 2 && d0.ops.reading.set.length === 3,
    'a first batch writes every record as its own row');
  check(C.equal(d0.pos.errors, [0, 1, 2, 3]) && new Set(d0.ops.errors.set.map((x) => x[0][0])).size === 4, 'identical list items get distinct keys');

  const noop = C.diff(S, d0.pos, clone(S), SPEC);
  check(noop.empty, 'an unchanged state produces an empty batch');

  const S2 = clone(S);
  S2.errors.unshift({ skill: 'reading', original: 'a', correct: 'b', why: 'c', at: '2026-09-28T09:00:00.000Z' });
  S2.speaking.records[1].stored = true;
  S2.writing.records.splice(0, 1);
  S2.reading.answers['3:r181-d03-s01:2'] = 3; delete S2.reading.answers['odd-key'];
  S2.contentProgress172.completed.listening = { l1: { day: 3 } };
  delete S2.drafts171.writing['d3-w'];
  S2.selectedDay = 4; S2.daily['4'] = { grammar: 1 }; delete S2.taskDone['3-0'];
  const d1 = C.diff(S, d0.pos, S2, SPEC);
  check(d1.ops.errors.set.length === 1 && d1.ops.errors.set[0][2] < 0 && !d1.ops.errors.del.length, 'prepending an error writes one row before the others', d1.ops.errors);
  check(d1.ops.speaking.set.length === 1 && d1.ops.speaking.del.length === 1 && d1.ops.speaking.set[0][2] > d0.pos.speaking[0], 'an edited record replaces its row in place', d1.ops.speaking);
  check(d1.ops.writing.del.length === 1 && !d1.ops.writing.set.length, 'a removed record deletes one row');
  check(C.equal(d1.ops.reading, { set: [[['3:r181-d03-s01:2'], 3]], del: [['odd-key']] }) && C.equal(d1.ops.completions.set, [[['listening', 'l1'], { day: 3 }]]), 'map changes are per key');
  check(C.equal(d1.doc.map((o) => o[0].join('.')).sort(), ['contentProgress172.completed.listening', 'daily.4', 'selectedDay', 'taskDone.3-0']), 'document changes are per field (a new module only adds its skeleton)', d1.doc);
  const S3 = clone(S2); S3.errors.reverse();
  const d2 = C.diff(S2, d1.pos, S3, SPEC);
  check(C.equal(d2.pos.errors, [0, 1, 2, 3, 4]) && d2.ops.errors.set.length === 5, 'a reordered list is renumbered');

  // Column mapping round trip for every collection.
  let exact = true;
  for (const c of SPEC) {
    const v = c.path.reduce((o, k) => o && o[k], S);
    const items = c.kind === 'list' ? v.map((x, i) => [[String(i)], x]) : c.kind === 'map2'
      ? Object.entries(v).flatMap(([m, o]) => Object.entries(o).map(([k, x]) => [[m, k], x])) : Object.entries(v).map(([k, x]) => [[k], x]);
    for (const [key, x] of items) {
      const row = JSON.parse(JSON.stringify(records.toRow(records.COLLECTIONS[c.name], key, x, 0)));
      if (!sameData(records.fromRow(records.COLLECTIONS[c.name], row), x)) { exact = false; results.push(`      ${c.name} ${JSON.stringify(x)}`); }
    }
  }
  check(exact, 'every record maps to columns (+extra) and back exactly');
  const wrow = records.toRow(records.COLLECTIONS.writing, ['k'], S.writing.records[1], 1);
  check(wrow.word_count === undefined && wrow.extra.words === 12.5 && wrow.extra.at === 'not a date' && wrow.body.startsWith('Premièrement'), 'values of the wrong type stay in extra, the rest are typed columns', wrow);
}

// ───────────────────────── infrastructure ──────────────────────────────────

function useDatabase(apiUrl) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: apiUrl, max: 10 });
  require(path.join(ROOT, 'api/_lib/db.js')).setDriver({
    query: (t, p) => pool.query(t, p).then((r) => r.rows),
    async transaction(list) {
      const c = await pool.connect();
      try {
        await c.query('begin');
        const out = [];
        for (const [t, p] of list) out.push((await c.query(t, p)).rows);
        await c.query('commit');
        return out;
      } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
    }
  });
  return pool;
}

/** Neon Auth as seen through its REST API: users and sessions in neon_auth.*, cookies, EdDSA JWTs. */
function startAuthMock(owner) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const kid = 'k1';
  const passwords = new Map();
  const stats = { origins: [] };
  let base;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = (u) => {
    const now = Math.floor(Date.now() / 1000);
    const hp = `${b64({ alg: 'EdDSA', kid, typ: 'JWT' })}.${b64({ sub: u.id, email: u.email, name: u.name, iat: now, exp: now + 900, iss: new URL(base).origin, aud: new URL(base).origin })}`;
    return `${hp}.${crypto.sign(null, Buffer.from(hp), privateKey).toString('base64url')}`;
  };
  const cookieToken = (req) => { const m = /__Secure-neon-auth\.session_token=([^;]+)/.exec(req.headers.cookie || ''); return m ? decodeURIComponent(m[1]).split('.')[0] : null; };
  async function newSession(res, user) {
    const token = crypto.randomBytes(24).toString('base64url');
    await owner.query(`insert into neon_auth.session (id, token, "userId", "expiresAt") values (gen_random_uuid(), $1, $2, now() + interval '7 days')`, [token, user.id]);
    res.setHeader('Set-Cookie', `__Secure-neon-auth.session_token=${encodeURIComponent(token + '.' + crypto.randomBytes(8).toString('base64url'))}; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=None; Partitioned`);
    return token;
  }
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      stats.origins.push(req.headers.origin || null);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      const route = new URL(req.url, 'http://x').pathname.replace(/^\/neondb\/auth\//, '');
      const json = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (route === '.well-known/jwks.json') return json(200, { keys: [Object.assign(publicKey.export({ format: 'jwk' }), { kid, alg: 'EdDSA' })] });
      if (!req.headers.origin) return json(403, { code: 'MISSING_OR_NULL_ORIGIN', message: 'Missing or null Origin' });
      if (route === 'sign-up/email') {
        const exists = (await owner.query('select 1 from neon_auth."user" where email = $1', [body.email])).rows.length;
        if (exists) return json(422, { code: 'USER_ALREADY_EXISTS', message: 'User already exists' });
        if (String(body.password).length < 8) return json(400, { code: 'PASSWORD_TOO_SHORT', message: 'Password too short' });
        const u = (await owner.query('insert into neon_auth."user" (id, email, name) values (gen_random_uuid(), $1, $2) returning id, email, name', [body.email, body.name])).rows[0];
        passwords.set(body.email, body.password);
        return json(200, { token: await newSession(res, u), user: u });
      }
      if (route === 'sign-in/email') {
        const u = (await owner.query('select id, email, name from neon_auth."user" where email = $1', [body.email])).rows[0];
        if (!u || passwords.get(body.email) !== body.password) return json(401, { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' });
        return json(200, { token: await newSession(res, u), user: u });
      }
      if (route === 'get-session') {
        const u = (await owner.query('select u.id, u.email, u.name from neon_auth.session s join neon_auth."user" u on u.id = s."userId" where s.token = $1', [cookieToken(req)])).rows[0];
        if (u) res.setHeader('set-auth-jwt', jwt(u));
        return json(200, u ? { user: u, session: { token: cookieToken(req) } } : null);
      }
      if (route === 'sign-out') {
        await owner.query('delete from neon_auth.session where token = $1', [cookieToken(req)]);
        res.setHeader('Set-Cookie', '__Secure-neon-auth.session_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None; Partitioned');
        return json(200, { success: true });
      }
      json(404, { code: 'NOT_FOUND' });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    base = `http://127.0.0.1:${server.address().port}/neondb/auth`;
    resolve({ server, base, stats });
  }));
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
  const stats = { badSig: 0, puts: 0 };
  const server = https.createServer(tls, (req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const u = new URL(req.url, `https://${req.headers.host}`);
      const pth = decodeURIComponent(u.pathname);
      const t = req.headers['x-amz-date'] || u.searchParams.get('X-Amz-Date') || '';
      const when = new Date(Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8), +t.slice(9, 11), +t.slice(11, 13), +t.slice(13, 15)));
      let ok = false;
      if (u.searchParams.get('X-Amz-Signature')) {
        const expect = r2.presign({ method: req.method, host: req.headers.host, path: pth, accessKeyId: creds.id, secretAccessKey: creds.secret, expires: Number(u.searchParams.get('X-Amz-Expires')), now: when });
        ok = new URL(expect).searchParams.get('X-Amz-Signature') === u.searchParams.get('X-Amz-Signature');
      } else if (req.headers.authorization) {
        const hdrs = req.headers['content-type'] ? { 'content-type': req.headers['content-type'] } : {};
        const expect = r2.signHeaders({ method: req.method, host: req.headers.host, path: pth, headers: hdrs, payloadHash: req.headers['x-amz-content-sha256'], accessKeyId: creds.id, secretAccessKey: creds.secret, now: when });
        ok = expect.authorization === req.headers.authorization && (req.method !== 'PUT' || sha256hex(body) === req.headers['x-amz-content-sha256']);
      }
      if (!ok) { stats.badSig++; res.writeHead(403); res.end('SignatureDoesNotMatch'); return; }
      const key = pth.replace(/^\/[^/]+\//, '');
      if (req.method === 'PUT') { objects.set(key, { body, type: req.headers['content-type'] || 'application/octet-stream' }); stats.puts++; res.writeHead(200); res.end(); return; }
      const o = objects.get(key);
      if (req.method === 'DELETE') { objects.delete(key); res.writeHead(204); res.end(); return; }
      if (!o) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': o.type, 'Content-Length': o.body.length });
      res.end(req.method === 'GET' ? o.body : undefined);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, objects, stats, port: server.address().port })));
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css' };

/** Serves the repository like Vercel: static files, /api/source, /api/v1/* rewrite. */
function startApp() {
  const v1 = require(path.join(ROOT, 'api/v1.js'));
  const source = require(path.join(ROOT, 'api/source.js'));
  const stats = { sync: [] };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/api/v1/')) {
      req.query = Object.fromEntries(u.searchParams);
      req.query.__route = u.pathname.slice(8);
      if (req.query.__route === 'sync') { const t0 = Date.now(); res.on('finish', () => stats.sync.push(Date.now() - t0)); }
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
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, stats, base: `http://127.0.0.1:${server.address().port}` })));
}

/** API client with a cookie jar. */
function client(base) {
  let cookie = '';
  async function req(method, p, { json, body, headers = {}, raw = false } = {}) {
    const h = Object.assign({}, headers);
    if (cookie) h.cookie = cookie;
    let b = body;
    if (json !== undefined) { h['Content-Type'] = 'application/json'; b = JSON.stringify(json); }
    const r = await fetch(base + '/api/v1' + p, { method, headers: h, body: b });
    for (const c of r.headers.getSetCookie()) cookie = /Max-Age=0/.test(c) ? '' : c.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') && !raw ? await r.json() : Buffer.from(await r.arrayBuffer());
    return { status: r.status, data, headers: r.headers };
  }
  return { req, get cookie() { return cookie; }, set cookie(v) { cookie = v; } };
}

// ───────────────────────── 2. API ───────────────────────────────────────────

async function apiTests(base, owner, auth, s3) {
  section('API');
  const A = client(base);
  let r = await A.req('GET', '/health?deep=1');
  check(r.status === 200 && r.data.db && r.data.auth && r.data.r2Reachable === true, 'health reports database, auth and R2', r.data);
  r = await A.req('GET', '/bootstrap');
  check(r.status === 401, 'signed out, bootstrap is 401');

  r = await A.req('POST', '/auth/sign-up/email', { json: { email: 'lea@example.com', password: 'correct-horse-9', name: 'Léa' } });
  check(r.status === 200 && /^__Secure-neon-auth\.session_token=/.test(A.cookie) && auth.stats.origins.slice(-1)[0] === new URL(base).origin,
    'sign-up goes through the Neon Auth proxy; the session cookie becomes first-party', r.data);
  r = await client(base).req('POST', '/auth/sign-in/email', { json: { email: 'lea@example.com', password: 'wrong' } });
  check(r.status === 401 && r.data.code === 'INVALID_EMAIL_OR_PASSWORD', 'wrong password is refused by Neon Auth');

  r = await A.req('GET', '/bootstrap');
  check(r.status === 200 && r.data.state === null && r.data.rev === 0 && r.data.user.email === 'lea@example.com' && r.data.collections.length === SPEC.length, 'a new learner bootstraps empty', r.data);

  const S = sampleState();
  const d0 = C.diff({}, {}, S, SPEC);
  r = await A.req('POST', '/sync', { json: { doc: d0.doc, ops: d0.ops, device: 'test' } });
  check(r.status === 200 && r.data.rev === 1, 'the first batch commits as revision 1', r.data);
  r = await A.req('GET', '/bootstrap');
  check(sameData(r.data.state, S), 'bootstrap rebuilds the state exactly from the tables', r.data.state);
  check(C.equal(r.data.positions, d0.pos), 'list positions come back as written');

  const counts = async () => (await owner.query(`select (select count(*) from delf50.grammar_attempts)::int g, (select count(*) from delf50.error_items)::int e,
    (select count(*) from delf50.writing_submissions)::int w, (select count(*) from delf50.reading_answers)::int ra, (select count(*) from delf50.content_completions)::int cc`)).rows[0];
  const c1 = await counts();
  check(c1.g === 2 && c1.e === 4 && c1.w === 2 && c1.ra === 3 && c1.cc === 2, 'each record is its own row', c1);
  const typed = (await owner.query(`select body, word_count, created_at, extra from delf50.writing_submissions order by pos`)).rows;
  check(typed[0].word_count === 120 && typed[0].created_at.toISOString() === '2026-09-27T09:15:00.123Z' && typed[0].extra.connectors[0] === 'cependant', 'writing is stored as typed columns', typed[0]);

  r = await A.req('POST', '/sync', { json: { doc: d0.doc, ops: d0.ops } });
  const c2 = await counts();
  check(r.status === 200 && C.equal(c1, c2) && sameData((await A.req('GET', '/bootstrap')).data.state, S), 'replaying a batch changes nothing (idempotent)');

  const S2 = clone(S);
  S2.grammarReview202['3:GQ-2'] = Object.assign({}, S2.grammarReview202['3:GQ-2'], { selectedIndex: 1, correct: true, answeredAt: '2026-09-28T08:30:00.000Z' });
  S2.errors.unshift({ skill: 'reading', original: 'a', correct: 'b', why: 'c', at: '2026-09-28T09:00:00.000Z' });
  S2.speaking.records[1].stored = true;
  S2.writing.records.splice(0, 1);
  delete S2.drafts171.writing['d3-w'];
  S2.selectedDay = 4;
  const d1 = C.diff(S, d0.pos, S2, SPEC);
  r = await A.req('POST', '/sync', { json: { doc: d1.doc, ops: d1.ops } });
  const b2 = (await A.req('GET', '/bootstrap')).data;
  check(r.data.rev === 3 && sameData(b2.state, S2) && C.equal(b2.positions, d1.pos), 'incremental batches keep the state exact', b2.state);
  const g = (await owner.query(`select answer_key, selected, correct from delf50.grammar_attempts order by id`)).rows;
  check(g.length === 3 && g[1].correct === false && g[2].correct === true && g[2].selected === 1, 'grammar history is append-only; the latest answer is current', g);
  const rev = await A.req('GET', '/rev');
  check(rev.data.rev === 3, 'rev reports the latest revision');

  // Row-level security: the API role sees only the caller's rows.
  const B = client(base);
  await B.req('POST', '/auth/sign-up/email', { json: { email: 'noah@example.com', password: 'correct-horse-10', name: 'Noah' } });
  r = await B.req('GET', '/bootstrap');
  check(r.status === 200 && r.data.state === null, 'another learner sees nothing of the first');
  const ids = (await owner.query('select id, email from neon_auth."user" order by email')).rows;
  const api = new (require('pg').Client)({ connectionString: process.env.API_DATABASE_URL });
  await api.connect();
  const asUser = async (id, sql, params) => {
    await api.query('begin');
    try { await api.query(`select set_config('app.user_id', $1, true)`, [id || '']); return (await api.query(sql, params)).rows; } finally { await api.query('rollback'); }
  };
  const noah = ids.find((x) => x.email === 'noah@example.com').id, lea = ids.find((x) => x.email === 'lea@example.com').id;
  check((await asUser(noah, 'select * from delf50.error_items')).length === 0 && (await asUser(lea, 'select * from delf50.error_items')).length === 5, 'RLS: rows are visible to their owner only');
  check((await asUser(null, 'select * from delf50.study_state')).length === 0, 'RLS: without a user, nothing is visible');
  let denied = false;
  try { await asUser(noah, `insert into delf50.drafts (user_id, kind, draft_key, body) values ($1, 'writing', 'x', 'y')`, [lea]); } catch (e) { denied = /row-level security/.test(e.message); }
  check(denied, 'RLS: writing a row for another user is refused');
  denied = false;
  try { await asUser(noah, 'select * from neon_auth.session'); } catch (e) { denied = /permission denied/.test(e.message); }
  check(denied, 'the API role cannot read Neon Auth tables');
  await api.end();

  // Bearer tokens for apps.
  const gs = await A.req('GET', '/auth/get-session');
  const token = gs.headers.get('set-auth-jwt');
  const asBearer = (t) => fetch(base + '/api/v1/rev', { headers: { Authorization: 'Bearer ' + t } }).then((x) => x.status);
  check(token && (await asBearer(token)) === 200, 'a Neon Auth JWT works as a bearer token');
  const forged = token.split('.').slice(0, 2).join('.') + '.' + crypto.randomBytes(64).toString('base64url');
  check((await asBearer(forged)) === 401, 'a JWT with a bad signature is refused');
  check((await asBearer(decodeURIComponent(A.cookie.split('=')[1]).split('.')[0])) === 200, 'a session token works as a bearer token');

  // Media in R2.
  const clip = crypto.randomBytes(300 * 1024);
  r = await A.req('PUT', `/media/raw?clipId=d3-s1&type=audio%2Fwebm&size=${clip.length}`, { body: clip, headers: { 'Content-Type': 'application/octet-stream' } });
  check(r.status === 200 && r.data.status === 'stored', 'a recording uploads through the API in one request', r.data);
  r = await A.req('GET', '/media/raw?clipId=d3-s1', { raw: true });
  check(r.status === 200 && Buffer.compare(r.data, clip) === 0 && r.headers.get('content-type') === 'audio/webm', 'it downloads byte-identical');
  const big = crypto.randomBytes(8 * 1024 * 1024 + 123);
  const PART = 3.5 * 1024 * 1024, n = Math.ceil(big.length / PART);
  for (let i = 0; i < n; i++) {
    await A.req('PUT', `/media/raw?clipId=big&type=audio%2Fogg&size=${big.length}&parts=${n}&part=${i}`, { body: big.subarray(i * PART, (i + 1) * PART), headers: { 'Content-Type': 'application/octet-stream' } });
  }
  r = await A.req('POST', '/media/complete', { json: { clipId: 'big', parts: n } });
  const back = [];
  for (let i = 0; i < n; i++) back.push((await A.req('GET', `/media/raw?clipId=big&part=${i}`, { raw: true })).data);
  check(r.data.status === 'stored' && Buffer.compare(Buffer.concat(back), big) === 0, `an 8 MB recording round-trips in ${n} parts`);
  r = await A.req('PUT', `/media/raw?clipId=short&size=999`, { body: Buffer.alloc(10), headers: { 'Content-Type': 'application/octet-stream' } });
  check(r.status === 422 && ![...s3.objects.keys()].some((k) => k.includes('/short')), 'a size mismatch is refused and nothing is kept');
  r = await B.req('GET', '/media/raw?clipId=d3-s1', { raw: true });
  check(r.status === 404, 'another learner cannot fetch the recording');
  r = await A.req('GET', '/media/url?clipId=d3-s1');
  const direct = await fetch(r.data.urls[0]);
  check(Buffer.compare(Buffer.from(await direct.arrayBuffer()), clip) === 0, 'presigned download URLs work (for apps)');
  check(s3.stats.badSig === 0, 'every R2 request was correctly signed');

  // Vocabulary.
  r = await A.req('POST', '/vocab', { json: { lemma: 'néanmoins', definition: 'nevertheless', partOfSpeech: 'adv' } });
  const vid = r.data.item && r.data.item.id;
  check(r.status === 201 && vid, 'a word is added to the shared dictionary and the deck', r.data);
  r = await B.req('POST', '/vocab', { json: { lemma: 'néanmoins', partOfSpeech: 'adv' } });
  check(r.data.item && r.data.item.id === vid, 'the dictionary is shared, decks are per learner', r.data);
  const iv = [];
  for (const q of [5, 5, 5]) iv.push((await A.req('POST', '/vocab/review', { json: { vocabularyId: vid, rating: q } })).data.item.interval_days);
  r = await A.req('POST', '/vocab/review', { json: { vocabularyId: vid, rating: 1 } });
  check(C.equal(iv, [1, 6, 16]) && r.data.item.interval_days === 1 && r.data.item.lapses === 1, 'reviews follow SM-2', { iv, last: r.data.item });
  r = await A.req('GET', '/vocab');
  const nb = (await B.req('GET', '/vocab')).data.items;
  check(r.data.items.length === 1 && nb.length === 1 && nb[0].repetitions === 0, 'each deck keeps its own schedule');
  const rv = (await owner.query('select count(*)::int n from delf50.vocabulary_reviews')).rows[0].n;
  check(rv === 4, 'every review is logged');
  const act = (await owner.query(`select module, n from delf50.daily_activity where user_id = $1`, [lea])).rows;
  check(act.some((x) => x.module === 'grammar') && act.some((x) => x.module === 'vocabulary'), 'daily activity is derived from the records', act);

  const oldCookie = A.cookie;
  r = await A.req('POST', '/auth/sign-out', { json: {} });
  const after = await fetch(base + '/api/v1/bootstrap', { headers: { cookie: oldCookie } });
  check(r.status === 200 && A.cookie === '' && after.status === 401, 'sign-out ends the session');
}

// ───────────────────────── 3. browser ──────────────────────────────────────

async function browserTests(base, owner, app) {
  section('Browser (index.html + cloud layer + app bundle in jsdom)');
  const { JSDOM, VirtualConsole } = require('jsdom');
  const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');
  const { Blob } = require('buffer');
  const origin = new URL(base).origin;

  class Device {
    constructor(name) { this.name = name; this.idb = new IDBFactory(); this.cookie = ''; this.w = null; this.errors = []; this.realLs = {}; }
    async fetch(input, init = {}) {
      const url = new URL(typeof input === 'string' ? input : input.url, base);
      const headers = new Headers(init.headers || {});
      if (url.origin === origin && this.cookie) headers.set('cookie', this.cookie);
      let body = init.body;
      if (body && typeof body.arrayBuffer === 'function') body = Buffer.from(await body.arrayBuffer());
      const r = await fetch(url, { method: init.method || 'GET', headers, body, signal: init.signal });
      for (const c of r.headers.getSetCookie()) this.cookie = /Max-Age=0/.test(c) ? '' : c.split(';')[0];
      return r;
    }
    async open(waitBoot = true) {
      this.reloadRequested = false;
      const vc = new VirtualConsole();
      vc.on('jsdomError', (e) => { if (/navigation/i.test(String(e.message))) this.reloadRequested = true; else this.errors.push(String(e.message)); });
      const dev = this;
      const dom = await JSDOM.fromURL(base + '/', {
        runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
        beforeParse(w) {
          for (const [k, v] of Object.entries(dev.realLs)) w.localStorage.setItem(k, v);
          Object.defineProperty(w, 'indexedDB', { value: dev.idb, configurable: true });
          w.IDBKeyRange = IDBKeyRange;
          w.fetch = (i, o) => dev.fetch(i, o);
          w.Response = Response; w.Headers = Headers; w.Blob = Blob; w.AbortController = AbortController;
          w.alert = () => {}; w.scrollTo = () => {}; w.confirm = () => true;
        }
      });
      this.w = dom.window;
      await until(() => this.w.__DELF50_CLOUD, 10000, 'cloud layer');
      if (waitBoot) await this.booted();
      return this;
    }
    booted() { return until(() => this.w.__DELF50_BOOT && this.w.__DELF50_BOOT.status === 'ready', 60000, `${this.name} boot`); }
    close() { if (this.w) { this.w.close(); this.w = null; } }
    async reload() { this.close(); return this.open(); }
    cloud() { return this.w.__DELF50_CLOUD.state(); }
    text() { return this.w.localStorage.getItem('delf50_v12_state'); }
    state() { return JSON.parse(this.text()); }
    realKeys() { const ls = this.w.localStorage, out = []; for (let i = 0; i < ls.length; i++) out.push(ls.key(i)); return out; }
    $(sel) { return this.w.document.querySelector(sel); }
    click(sel) { const e = this.$(sel); if (!e) throw new Error(`${this.name}: no ${sel}`); e.click(); }
    async signIn(kind, email, password, name) {
      await until(() => this.$('.dc-mask form'), 10000, 'sign-in form');
      if (kind === 'register') { this.click('[data-t="register"]'); await until(() => this.$('.dc-mask [name="name"]'), 2000); }
      const form = this.$('.dc-mask form');
      for (const [k, v] of Object.entries({ email, password, name })) { const el = form.querySelector(`[name="${k}"]`); if (el) el.value = v; }
      form.dispatchEvent(new this.w.Event('submit', { cancelable: true, bubbles: true }));
    }
    saved() { return until(() => { const s = this.cloud(); return s.ready && !s.pending && !s.inflight && !s.uploads && s.status === 'saved'; }, 20000, `${this.name} saved`); }
    async answerGrammar(n) {
      for (let i = 0; i < n; i++) {
        this.click('[data-nav="grammar"]');
        const opt = this.$('[data-gopt="0"]');
        if (!opt) break;
        opt.click();
        const b = this.w.document.getElementById('submitG'); if (b) b.click();
        const next = [...this.w.document.querySelectorAll('button')].find((x) => /下一题|继续/.test(x.textContent) && !x.disabled);
        if (next) next.click();
        await sleep(30); // a learner's pace: let the page breathe between answers
      }
    }
    answerReading(keys) {
      this.click('[data-nav="input"]'); this.click('[data-inputtab="reading"]');
      for (const k of keys) { const e = this.$(`[data-ropt="${k}"]`); if (e) e.click(); }
    }
    write(text) {
      this.click('[data-nav="output"]');
      const ta = this.w.document.getElementById('writeText');
      ta.value = text; ta.dispatchEvent(new this.w.Event('input'));
      [...this.w.document.querySelectorAll('button')].find((b) => /保存本次写作/.test(b.textContent)).click();
    }
  }

  const server = async (dev) => (await dev.fetch(base + '/api/v1/bootstrap').then((r) => r.json()));

  // ── first visit: sign-in gate ──
  const A = new Device('A');
  A.realLs = { delf50_v12_state: '{"old":"local copy"}', delf50_cloud_meta_v1: '{}', other_site_key: 'kept' };
  await A.open(false);
  await until(() => A.$('.dc-mask form'), 10000, 'login overlay');
  await sleep(1500);
  check(A.w.__DELF50_BOOT.status !== 'ready', 'signed out, the app does not start; the sign-in form is shown');
  check(!A.realKeys().some((k) => k.startsWith('delf50_')) && A.realKeys().includes('other_site_key'), 'old browser copies are removed; other keys are untouched', A.realKeys());
  A.realLs = {};
  await A.signIn('register', 'lea@example.com', 'correct-horse-9', 'Léa');
  await A.booted();
  await A.saved();
  check(A.$('.dc-chip').textContent.includes('Léa') && A.$('.dc-chip').textContent.includes('已保存') && !A.$('.dc-mask'), 'after sign-up the app starts and everything is saved', A.$('.dc-chip').textContent);

  // ── live saving ──
  app.stats.sync.length = 0;
  const from = A.cloud().latency.length;
  await A.answerGrammar(3); await A.saved();
  A.answerReading(['0:0', '1:1']); await A.saved();
  A.write('Bonjour madame, je vous écris parce que je voudrais des informations sur le cours de français du soir.');
  await A.saved();
  const lat = A.cloud().latency.slice(from).map((x) => x[0]);
  check(lat.length >= 3 && Math.max(...lat) < 500, `every change reaches the database within 500 ms (max ${Math.max(...lat)} ms; request times ${app.stats.sync.join('/')} ms)`, lat);
  const sA = A.state();
  const srv = await server(A);
  check(sameData(srv.state, sA), 'the database holds exactly the app state', (function walk(a, b, p) { if (sameData(a, b)) return []; if (a && b && typeof a === 'object' && typeof b === 'object') return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => walk(a[k], b[k], p + '.' + k)); return [[p, a, b]]; })(sA, srv.state, 'S').slice(0, 5));
  const rows = (await owner.query(`select (select count(*) from delf50.grammar_attempts)::int g, (select count(*) from delf50.reading_answers)::int r, (select count(*) from delf50.writing_submissions)::int w`)).rows[0];
  check(rows.g >= 1 && rows.r === Object.keys(sA.reading.answers).length && rows.w === 1, 'answers and writing are rows in their tables', rows);
  check(!A.realKeys().some((k) => k.startsWith('delf50_')), 'nothing is written to browser storage');

  // ── recordings ──
  const clip = crypto.randomBytes(8 * 1024 * 1024 + 7);
  const ok = await A.w.storeAudio('d1-s1', new A.w.Blob([clip], { type: 'audio/webm' }));
  await A.saved();
  const stored = (await owner.query(`select status, size_bytes, parts from delf50.media_objects where clip_id = 'd1-s1'`)).rows[0];
  check(ok === true && stored && stored.status === 'stored' && Number(stored.size_bytes) === clip.length && stored.parts === 3, 'a saved recording is uploaded to R2 at once', stored);
  const dbs = (await A.idb.databases()).map((d) => d.name);
  check(!dbs.includes('delf50_audio_v1'), 'no recording is stored in the browser', dbs);

  // ── reload and a second device ──
  const before = A.state();
  await A.reload();
  await A.saved();
  check(sameData(before.writing, A.state().writing) && sameData(before.reading.answers, A.state().reading.answers), 'a reload restores the learning from the database');
  const B = new Device('B');
  await B.open(false);
  await B.signIn('login', 'lea@example.com', 'correct-horse-9');
  await B.booted(); await B.saved(); await A.saved();
  check(B.state().grammar.attempts === A.state().grammar.attempts && sameData(B.state().writing.records, A.state().writing.records), 'a second device continues with the same records');
  const got = await B.w.getAudio('d1-s1');
  check(got && Buffer.compare(Buffer.from(await got.blob.arrayBuffer()), clip) === 0, 'the second device plays the recording from R2');

  await B.answerGrammar(1); await B.saved();
  A.w.document.dispatchEvent(new A.w.Event('visibilitychange'));
  await until(() => A.reloadRequested, 5000, 'A refresh');
  check(true, 'a device returning to the foreground reloads when another device saved meanwhile');
  await A.reload();
  await A.saved(); await B.saved();
  check(A.state().grammar.attempts === B.state().grammar.attempts, 'after the refresh both devices agree');

  // ── the session ends mid-study: nothing is lost ──
  const other = client(base); other.cookie = A.cookie;
  await other.req('POST', '/auth/sign-out', { json: {} });
  A.write('Deuxième texte écrit pendant que la session expirait.');
  await until(() => A.$('.dc-mask form'), 10000, 'login after expiry');
  check(A.cloud().pending, 'an expired session asks to sign in again and keeps the unsaved change');
  await A.signIn('login', 'lea@example.com', 'correct-horse-9');
  await A.saved();
  check((await server(A)).state.writing.records.length === 2, 'after signing in again the change is saved');

  // ── sign-out ──
  A.click('.dc-chip');
  await until(() => A.$('[data-a="out"]'), 3000);
  A.click('[data-a="out"]');
  await until(() => A.reloadRequested, 5000, 'reload after sign-out');
  check(A.cookie === '', 'sign-out clears the session and reloads to the sign-in form');
  const errs = A.errors.concat(B.errors).filter((e) => !/Not implemented/.test(e));
  check(errs.length === 0, 'no page errors', errs.slice(0, 3));
  A.close(); B.close();
}

// ───────────────────────── main ─────────────────────────────────────────────

async function main() {
  unitTests();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    results.push('\n  skip API and browser sections: TEST_DATABASE_URL is not set');
  } else {
    const { Pool } = require('pg');
    const owner = new Pool({ connectionString: url, max: 4 });
    await owner.query('drop schema if exists delf50 cascade; drop schema if exists neon_auth cascade');
    await owner.query(`create schema neon_auth;
      create table neon_auth."user" (id uuid primary key, email text unique not null, name text);
      create table neon_auth.session (id uuid primary key, token text unique not null, "userId" uuid references neon_auth."user"(id) on delete cascade, "expiresAt" timestamptz not null);
      do $$ begin if not exists (select from pg_roles where rolname = 'delf50_api') then create role delf50_api; end if; end $$;
      alter role delf50_api login password 'api-test-password'`);
    await owner.query(fs.readFileSync(path.join(ROOT, 'db/migrations/0001_learning.sql'), 'utf8'));
    const u = new URL(url); u.username = 'delf50_api'; u.password = 'api-test-password';
    process.env.API_DATABASE_URL = u.toString();
    const apiPool = useDatabase(process.env.API_DATABASE_URL);
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const creds = { id: 'TESTKEYID', secret: crypto.randomBytes(20).toString('hex') };
    const s3 = await startS3Mock(makeCert(fs.mkdtempSync(path.join(os.tmpdir(), 'delf50-'))), creds);
    const auth = await startAuthMock(owner);
    Object.assign(process.env, { NEON_AUTH_BASE_URL: auth.base, R2_ENDPOINT: `https://127.0.0.1:${s3.port}`, R2_BUCKET: 'delf50-test', R2_ACCESS_KEY_ID: creds.id, R2_SECRET_ACCESS_KEY: creds.secret });
    const app = await startApp();
    try {
      await apiTests(app.base, owner, auth, s3);
      await owner.query('delete from neon_auth."user"; delete from delf50.vocabulary_items');
      await browserTests(app.base, owner, app);
    } catch (e) {
      check(false, 'suite aborted', e.stack || String(e));
    } finally {
      app.server.close(); s3.server.close(); auth.server.close(); await apiPool.end(); await owner.end();
    }
  }
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} check(s) FAILED.` : '\nAll cloud checks passed.');
  process.exit(failed ? 1 : 0);
}

main();
