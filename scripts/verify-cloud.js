#!/usr/bin/env node
'use strict';
/**
 * Verifies the cloud layer end to end.
 *
 *   1. Units: SigV4 against the AWS test vectors, the app's change batches
 *      (app/sync-core.js), the column mapping (api/_lib/records.js).
 *   2. API against PostgreSQL, connected as the RLS-bound delf50_api role:
 *      Neon Auth proxy (against a mock that issues real cookies and EdDSA
 *      JWTs), exact state round trips, idempotent replays, re-keying of rows
 *      rewritten server-side, append-only grammar history, row-level
 *      isolation, courses, bearer tokens, R2 media (HTTPS S3 mock that checks
 *      signatures), vocabulary SM-2.
 *
 *   3. Browser (Playwright, from NODE_PATH): the app in Chromium against the
 *      API: sign-up, every module saving its records, drafts, recordings to
 *      R2, intensity, nothing kept in the browser, a second device,
 *      cross-device refresh, session expiry mid-study, sign-out.
 *
 * Runs in the cloud: a Vercel Sandbox (fra1) against a dedicated database on
 * the Neon test branch (never production). TEST_DATABASE_URL is that
 * database's owner connection; the suite resets its delf50 schema and a stub
 * neon_auth schema, and sets a fresh random password on the branch's
 * delf50_api role for each run. Any other PostgreSQL works too (a local run
 * goes through node-postgres instead of Neon's HTTP driver). Test-only dependency:
 *
 *   npm i --no-save pg@8.23.0 playwright
 *   TEST_DATABASE_URL=postgresql://neondb_owner:…@<test-branch-host>/delf50_ci?sslmode=require \
 *     node scripts/verify-cloud.js
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
const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
const clone = (x) => JSON.parse(JSON.stringify(x));

const records = require(path.join(ROOT, 'api/_lib/records.js'));
const SPEC = records.collections();
let C; // app/sync-core.js (an ES module)
const at = (d) => ({ pos: d.pos, keys: d.keys });

/** A learner state as the app keeps it (app/state.js), with edge cases the column mapping must keep. */
function sampleState() {
  return {
    day: 3, intensity: 'standard', startedAt: '2026-09-26T07:00:00.000Z', onboarded: true,
    reading: { '3:R03-1:0': 1, '3:R03-1:1': 0, '3:R03-2:0': 2 },
    listening: {},
    grammar: {
      '3:negation-01': { day: 3, contentId: 'negation-01', nodeId: 'negation', question: 'Je ___ parle pas.', selectedIndex: 1, correctIndex: 1, correct: true, answeredAt: '2026-09-28T08:05:00.000Z' },
      '3:negation-02': { day: 3, contentId: 'negation-02', nodeId: 'negation', question: 'Il n’a ___ fini.', selectedIndex: 0, correctIndex: 2, correct: false, answeredAt: '2026-09-28T08:06:00.000Z' }
    },
    production: { '3:negation:0': true, '3:negation:1': true },
    writing: [
      { day: 2, contentId: 'W02-1', title: 'Courriel', text: 'Je pense que…', words: 120, at: '2026-09-27T09:15:00.123Z' },
      { day: 3, contentId: 'W03-1', title: 'Essai 2', text: 'Premièrement 😀 "quotes" \\ back', words: 12.5, at: 'not a date' }
    ],
    application: [{ day: 3, contentId: 'A03-1', title: 'Situation', text: 'Madame, …', at: '2026-09-28T08:00:00.000Z' }],
    speaking: [
      { clip: 'clip-a', day: 3, contentId: 'S03-1', title: 'Monologue', sec: 60, at: '2026-09-28T08:10:00.000Z' },
      { clip: null, day: 3, contentId: 'S03-2', title: 'Dialogue', sec: 35, at: '2026-09-28T08:12:00.000Z' }
    ],
    errors: [
      { skill: 'Négation', original: 'ne parle', correct: 'ne parle pas', why: 'ne … pas', at: '2026-09-28T08:20:00.000Z' },
      { skill: 'Négation', original: 'x', correct: 'y', why: 'z', at: '2026-09-28T08:19:00.000Z' },
      { skill: 'Négation', original: 'x', correct: 'y', why: 'z', at: '2026-09-28T08:19:00.000Z' }
    ],
    drafts: { writing: { '3:W03-1': 'brouillon' }, application: {} },
    lexicon: { '3:V03-01': 'known', '3:V03-02': 'again' },
    review: {
      '3:g:2:present-03': { day: 3, kind: 'g', src: 2, contentId: 'present-03', selectedIndex: 1, correct: false, at: '2026-09-28T08:30:00.000Z' },
      '3:v:2:V02-05': { day: 3, kind: 'v', src: 2, contentId: 'V02-05', correct: true, at: '2026-09-28T08:31:00.000Z' }
    },
    remedial: { 41: ['subjonctif', 'hypothesis', 'pc'] }
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
  const docOf = Object.fromEntries(d0.doc.map((o) => [o[0].join('.'), o[1]]));
  check(['reading', 'listening', 'grammar', 'production', 'lexicon', 'review'].every((k) => C.equal(docOf[k], {})) && C.equal(docOf.remedial, S.remedial)
    && ['writing', 'application', 'speaking', 'errors'].every((k) => C.equal(docOf[k], [])) && C.equal(docOf.drafts, { writing: {}, application: {} })
    && docOf.day === 3 && docOf.intensity === 'standard', 'the document holds the settings and empty record containers, never records', docOf);
  check(!d0.ops.listening && d0.ops.writing.set.length === 2 && d0.ops.errors.set.length === 3 && d0.ops.reading.set.length === 3 && d0.ops.production.set.length === 2,
    'a first batch writes every record as its own row');
  check(C.equal(d0.pos.errors, [0, 1, 2]) && new Set(d0.ops.errors.set.map((x) => x[0][0])).size === 3, 'identical list items get distinct keys');
  check(C.equal(d0.keys.errors, d0.ops.errors.set.map((x) => x[0][0])), 'the batch reports the keys its rows are stored under');

  const noop = C.diff(S, at(d0), clone(S), SPEC);
  check(noop.empty, 'an unchanged state produces an empty batch');

  const S2 = clone(S);
  S2.errors.unshift({ skill: 'Lecture', original: 'a', correct: 'b', why: 'c', at: '2026-09-28T09:00:00.000Z' });
  S2.speaking[1].sec = 40;
  S2.writing.splice(0, 1);
  S2.reading['3:R03-2:1'] = 0;
  delete S2.drafts.writing['3:W03-1'];
  S2.day = 4;
  const d1 = C.diff(S, at(d0), S2, SPEC);
  check(d1.ops.errors.set.length === 1 && d1.ops.errors.set[0][2] < 0 && !d1.ops.errors.del.length, 'prepending an error writes one row before the others', d1.ops.errors);
  check(d1.ops.speaking.set.length === 1 && d1.ops.speaking.del.length === 1 && d1.ops.speaking.set[0][2] > d0.pos.speaking[0], 'an edited record replaces its row in place', d1.ops.speaking);
  check(d1.ops.writing.del.length === 1 && !d1.ops.writing.set.length, 'a removed record deletes one row');
  check(C.equal(d1.ops.reading, { set: [[['3:R03-2:1'], 0]], del: [] }) && C.equal(d1.ops.writingDrafts, { set: [], del: [['3:W03-1']] }), 'map changes are per key');
  check(C.equal(d1.doc, [[['day'], 4]]), 'document changes are per field', d1.doc);
  const S3 = clone(S2); S3.errors.reverse();
  const d2 = C.diff(S2, at(d1), S3, SPEC);
  check(C.equal(d2.pos.errors, [0, 1, 2, 3]) && d2.ops.errors.set.length === 4, 'a reordered list is renumbered');

  // Rows stored under other keys (rewritten server-side) are re-keyed, keeping their content and order.
  const foreign = { pos: d0.pos, keys: Object.assign({}, d0.keys, { errors: ['old-a', 'old-b', 'old-c'] }) };
  const rk = C.diff(S, foreign, clone(S), SPEC);
  check(!rk.empty && C.equal(rk.ops.errors, { set: [], del: [], move: [['old-a', d0.keys.errors[0], 0], ['old-b', d0.keys.errors[1], 1], ['old-c', d0.keys.errors[2], 2]] })
    && Object.keys(rk.ops).join() === 'errors', 'rows under foreign keys are renamed once, content and order unchanged', rk.ops);
  check(C.diff(S, at(rk), clone(S), SPEC).empty, 'after re-keying, the state is settled');

  // Column mapping round trip for every collection.
  let exact = true;
  for (const c of SPEC) {
    const v = c.path.reduce((o, k) => o && o[k], S) || {};
    const items = c.kind === 'list' ? v.map((x, i) => [[String(i)], x]) : Object.entries(v).map(([k, x]) => [[k], x]);
    for (const [key, x] of items) {
      const row = JSON.parse(JSON.stringify(records.toRow(records.COLLECTIONS[c.name], key, x, 0)));
      if (!C.equal(records.fromRow(records.COLLECTIONS[c.name], row), x)) { exact = false; results.push(`      ${c.name} ${JSON.stringify(x)}`); }
    }
  }
  check(exact, 'every record maps to columns (+extra) and back exactly');
  const wrow = records.toRow(records.COLLECTIONS.writing, ['k'], S.writing[1], 1);
  check(wrow.word_count === undefined && wrow.extra.words === 12.5 && wrow.extra.at === 'not a date' && wrow.body.startsWith('Premièrement'), 'values of the wrong type stay in extra, the rest are typed columns', wrow);
  const srow = records.toRow(records.COLLECTIONS.speaking, ['k'], S.speaking[0], 0);
  check(srow.clip_id === 'clip-a' && srow.duration_sec === 60 && srow.extra === null, 'a speaking round maps to its columns', srow);
}

// ───────────────────────── infrastructure ──────────────────────────────────

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

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2' };

/** Serves the repository like Vercel: static files, /api/v1/* rewritten to the one function. */
function startApp() {
  const v1 = require(path.join(ROOT, 'api/v1.js'));
  const stats = { sync: [] };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/api/v1/')) {
      req.query = Object.fromEntries(u.searchParams);
      req.query.__route = u.pathname.slice(8);
      if (req.query.__route === 'sync') { const t0 = Date.now(); res.on('finish', () => stats.sync.push(Date.now() - t0)); }
      return v1(req, res);
    }
    const rel = u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname).replace(/^\/+/, '');
    const file = path.join(ROOT, rel);
    if (!/^(index\.html|app\/|course\/|fonts\/)/.test(rel) || !file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, () => resolve({ server, stats, base: `http://localhost:${server.address().port}` })));
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
  r = await A.req('POST', '/sync', { json: { doc: d0.doc, ops: d0.ops, device: 'test', batch: 'b0' } });
  check(r.status === 200 && r.data.rev === 1, 'the first batch commits as revision 1', r.data);
  r = await A.req('GET', '/bootstrap');
  check(C.equal(r.data.state, S), 'bootstrap rebuilds the state exactly from the tables', r.data.state);
  check(C.equal(r.data.positions, d0.pos) && C.equal(r.data.keys, d0.keys), 'list positions and keys come back as written');

  const counts = async () => (await owner.query(`select (select count(*) from delf50.grammar_attempts)::int g, (select count(*) from delf50.error_items)::int e,
    (select count(*) from delf50.writing_submissions)::int w, (select count(*) from delf50.reading_answers)::int ra, (select count(*) from delf50.speaking_attempts)::int sp`)).rows[0];
  const c1 = await counts();
  check(c1.g === 2 && c1.e === 3 && c1.w === 2 && c1.ra === 3 && c1.sp === 2, 'each record is its own row', c1);
  const more = (await owner.query(`select (select count(*) from delf50.grammar_productions where done)::int gp, (select chunk_id || ' ' || mark from delf50.lexicon_marks where day = 3 order by mark_key limit 1) lx,
    (select kind || ' ' || source_day || ' ' || content_id || ' ' || correct from delf50.review_answers order by answer_key limit 1) rv,
    (select node_id || '#' || prompt_index from delf50.grammar_productions order by prod_key limit 1) gpk,
    (select day || ' ' || content_id || ' ' || q_index from delf50.reading_answers order by answer_key limit 1) ra`)).rows[0];
  check(more.gp === 2 && more.lx === 'V03-01 known' && more.rv === 'g 2 present-03 false' && more.gpk === 'negation#0' && more.ra === '3 R03-1 0',
    'output practice, chunk marks, review items and answers are rows with parsed columns', more);
  const typed = (await owner.query(`select body, word_count, created_at, extra from delf50.writing_submissions order by pos`)).rows;
  check(typed[0].word_count === 120 && typed[0].created_at.toISOString() === '2026-09-27T09:15:00.123Z' && typed[0].extra === null, 'writing is stored as typed columns', typed[0]);

  r = await A.req('POST', '/sync', { json: { doc: d0.doc, ops: d0.ops, batch: 'b0' } });
  const c2 = await counts();
  check(r.status === 200 && r.data.rev === 1 && C.equal(c1, c2) && C.equal((await A.req('GET', '/bootstrap')).data.state, S), 'replaying a batch changes nothing, not even the revision', r.data);

  const S2 = clone(S);
  S2.grammar['3:negation-02'] = Object.assign({}, S2.grammar['3:negation-02'], { selectedIndex: 2, correct: true, answeredAt: '2026-09-28T08:30:00.000Z' });
  S2.errors.unshift({ skill: 'Lecture', original: 'a', correct: 'b', why: 'c', at: '2026-09-28T09:00:00.000Z' });
  S2.speaking[1].sec = 40;
  S2.writing.splice(0, 1);
  delete S2.drafts.writing['3:W03-1'];
  S2.day = 4;
  const d1 = C.diff(S, at(d0), S2, SPEC);
  r = await A.req('POST', '/sync', { json: { doc: d1.doc, ops: d1.ops, batch: 'b1' } });
  const b2 = (await A.req('GET', '/bootstrap')).data;
  check(r.data.rev === 2 && C.equal(b2.state, S2) && C.equal(b2.positions, d1.pos) && C.equal(b2.keys, d1.keys), 'incremental batches keep the state exact', b2.state);
  const g = (await owner.query(`select answer_key, selected, correct from delf50.grammar_attempts order by id`)).rows;
  check(g.length === 3 && g[1].correct === false && g[2].correct === true && g[2].selected === 2, 'a changed grammar answer appends a row; the latest is current', g);
  const S3 = clone(S2); delete S3.grammar['3:negation-01'];
  const d2 = C.diff(S2, at(d1), S3, SPEC);
  await A.req('POST', '/sync', { json: { doc: d2.doc, ops: d2.ops } });
  const b3 = (await A.req('GET', '/bootstrap')).data;
  const d3 = C.diff(S3, at(d2), S2, SPEC);
  await A.req('POST', '/sync', { json: { doc: d3.doc, ops: d3.ops } });
  const b4 = (await A.req('GET', '/bootstrap')).data;
  const hist = (await owner.query(`select deleted from delf50.grammar_attempts where answer_key = '3:negation-01' order by id`)).rows;
  check(C.equal(b3.state, S3) && C.equal(b4.state, S2) && C.equal(hist.map((x) => x.deleted), [false, true, false]),
    'removing an answer appends a tombstone, re-adding appends again; nothing is rewritten', hist);
  const S4 = clone(S2); S4.errors.splice(1, 1);
  const d4 = C.diff(S2, at(d3), S4, SPEC);
  await A.req('POST', '/sync', { json: { doc: d4.doc, ops: d4.ops } });
  const b5 = (await A.req('GET', '/bootstrap')).data;
  const er = (await owner.query(`select count(*)::int n, count(resolved_at)::int resolved from delf50.error_items`)).rows[0];
  check(C.equal(b5.state, S4) && er.n === 4 && er.resolved === 1, 'a mastered error leaves the app state but stays in the database as resolved', er);
  const S5 = clone(S4); S5.errors.splice(1, 0, clone(S2.errors[1]));
  const d5 = C.diff(S4, at(d4), S5, SPEC);
  await A.req('POST', '/sync', { json: { doc: d5.doc, ops: d5.ops } });
  const er2 = (await owner.query(`select count(*)::int n, count(resolved_at)::int resolved from delf50.error_items`)).rows[0];
  check(C.equal((await A.req('GET', '/bootstrap')).data.state, S5) && er2.n === 4 && er2.resolved === 0, 'the same error made again reopens its row', er2);

  // Rows rewritten server-side (a data migration changes their content) are re-keyed by the next save.
  await owner.query(`update delf50.error_items set item_key = 'migrated-' || item_key`);
  const bm = (await A.req('GET', '/bootstrap')).data;
  const dm = C.diff(bm.state, { pos: bm.positions, keys: bm.keys }, clone(bm.state), SPEC);
  await A.req('POST', '/sync', { json: { doc: dm.doc, ops: dm.ops } });
  const ba = (await A.req('GET', '/bootstrap')).data;
  const er3 = (await owner.query(`select count(*)::int n, count(*) filter (where resolved_at is null)::int open, count(*) filter (where item_key like 'migrated-%')::int stale from delf50.error_items`)).rows[0];
  check(dm.ops.errors.move.length === 4 && C.equal(ba.state, S5) && C.equal(ba.keys.errors, dm.keys.errors) && C.equal(er3, { n: 4, open: 4, stale: 0 }),
    'rows under migrated keys are renamed by the first save: same rows, now under their content keys', er3);
  const S6 = clone(S5); S6.errors.splice(0, 1);
  const d6 = C.diff(ba.state, { pos: ba.positions, keys: ba.keys }, S6, SPEC);
  await A.req('POST', '/sync', { json: { doc: d6.doc, ops: d6.ops } });
  check(C.equal((await A.req('GET', '/bootstrap')).data.state, S6), 'after re-keying, mastering an error removes exactly that one');
  const rev = await A.req('GET', '/rev');
  check(rev.data.rev === 8, 'rev reports the latest revision', rev.data);

  // Courses (CEFR levels): one account, separate records per course.
  const courses = require(path.join(ROOT, 'api/_lib/courses.js'));
  courses.COURSES['delf-b2-test'] = { level: 'B2', exam: 'DELF', days: 50, title: 'test only' };
  r = await A.req('GET', '/bootstrap?course=nope');
  check(r.status === 400 && r.data.error.code === 'unknown_course', 'an unknown course is refused');
  const explicitB1 = (await A.req('GET', '/bootstrap?course=delf-b1')).data;
  check(explicitB1.course === 'delf-b1' && C.equal(explicitB1.state, S6), 'requests without a course address delf-b1');
  r = await A.req('GET', '/bootstrap?course=delf-b2-test');
  check(r.status === 200 && r.data.state === null && r.data.rev === 0, 'a new course starts empty for the same account');
  const T = sampleState(); T.day = 9; T.writing[0].text = 'Texte de niveau B2';
  const dT = C.diff({}, {}, T, SPEC);
  r = await A.req('POST', '/sync?course=delf-b2-test', { json: { doc: dT.doc, ops: dT.ops, batch: 'b0' } });
  const bT = (await A.req('GET', '/bootstrap?course=delf-b2-test')).data;
  const b1Again = (await A.req('GET', '/bootstrap')).data;
  check(r.data.rev === 1 && C.equal(bT.state, T) && C.equal(b1Again.state, S6) && b1Again.rev === 8,
    'the same keys in two courses never collide; each course keeps its own state and revision', { rev: r.data.rev, b1rev: b1Again.rev });
  const perCourse = (await owner.query(`select course, count(*)::int n from delf50.reading_answers group by course order by course`)).rows;
  check(C.equal(perCourse, [{ course: 'delf-b1', n: 3 }, { course: 'delf-b2-test', n: 3 }]), 'records carry their course', perCourse);
  r = await A.req('GET', '/courses');
  check(r.data.courses.some((c) => c.id === 'delf-b1' && c.level === 'B1') && r.data.enrolled.map((e) => e.course).sort().join() === 'delf-b1,delf-b2-test',
    'the account lists its courses', r.data.enrolled);

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
  const b1 = " where course = 'delf-b1'";
  check((await asUser(noah, 'select * from delf50.error_items')).length === 0 && (await asUser(lea, 'select * from delf50.error_items' + b1 + ' and resolved_at is null')).length === 3
    && (await asUser(noah, 'select * from delf50.lexicon_marks')).length === 0 && (await asUser(lea, 'select * from delf50.lexicon_marks' + b1)).length === 2, 'RLS: rows are visible to their owner only');
  check((await asUser(null, 'select * from delf50.study_state')).length === 0, 'RLS: without a user, nothing is visible');
  let denied = false;
  try { await asUser(noah, `insert into delf50.drafts (user_id, kind, draft_key, body) values ($1, 'writing', 'x', 'y')`, [lea]); } catch (e) { denied = /row-level security/.test(e.message); }
  check(denied, 'RLS: writing a row for another user is refused');
  denied = false;
  try { await asUser(noah, 'select * from neon_auth.session'); } catch (e) { denied = /permission denied/.test(e.message); }
  check(denied, 'the API role cannot read Neon Auth tables');
  for (const sql of ['update delf50.grammar_attempts set correct = false', 'delete from delf50.grammar_attempts', 'delete from delf50.vocabulary_reviews']) {
    denied = false;
    try { await asUser(lea, sql); } catch (e) { denied = /permission denied/.test(e.message); }
    check(denied, `history is insert-only for the API role: ${sql.split(' ').slice(0, 3).join(' ')} is refused`);
  }
  await api.end();

  // Bearer tokens for apps.
  const gs = await A.req('GET', '/auth/get-session');
  const token = gs.headers.get('set-auth-jwt');
  const asBearer = (t) => fetch(base + '/api/v1/rev', { headers: { Authorization: 'Bearer ' + t } }).then((x) => x.status);
  check(token && (await asBearer(token)) === 200, 'a Neon Auth JWT works as a bearer token');
  const forged = token.split('.').slice(0, 2).join('.') + '.' + crypto.randomBytes(64).toString('base64url');
  check((await asBearer(forged)) === 401, 'a JWT with a bad signature is refused');
  const signed = decodeURIComponent(A.cookie.split('=')[1]);
  check((await asBearer(signed.split('.')[0])) === 200 && (await asBearer(signed)) === 200, 'a session token works as a bearer token, plain or signed');

  // Media in R2 (the app uploads in parts of 3.5 MB: app/media.js).
  const clip = crypto.randomBytes(300 * 1024);
  r = await A.req('PUT', `/media/raw?clipId=clip-a&type=audio%2Fwebm&size=${clip.length}&parts=1&part=0`, { body: clip, headers: { 'Content-Type': 'application/octet-stream' } });
  check(r.status === 200 && r.data.status === 'stored', 'a recording uploads through the API in one request', r.data);
  r = await A.req('GET', '/media/raw?clipId=clip-a&part=0', { raw: true });
  check(r.status === 200 && Buffer.compare(r.data, clip) === 0 && r.headers.get('content-type') === 'audio/webm' && r.headers.get('x-parts') === '1', 'it downloads byte-identical, with its part count');
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
  r = await B.req('GET', '/media/raw?clipId=clip-a&part=0', { raw: true });
  check(r.status === 404, 'another learner cannot fetch the recording');
  r = await A.req('GET', '/media/url?clipId=clip-a');
  const direct = await fetch(r.data.urls[0]);
  check(Buffer.compare(Buffer.from(await direct.arrayBuffer()), clip) === 0, 'presigned download URLs work (for apps)');
  const clip2 = crypto.randomBytes(1000);
  r = await A.req('PUT', `/media/raw?course=delf-b2-test&clipId=clip-a&type=audio%2Fwebm&size=${clip2.length}`, { body: clip2, headers: { 'Content-Type': 'application/octet-stream' } });
  const m1 = await A.req('GET', '/media/raw?clipId=clip-a', { raw: true });
  const m2 = await A.req('GET', '/media/raw?course=delf-b2-test&clipId=clip-a', { raw: true });
  check(r.data.status === 'stored' && Buffer.compare(m1.data, clip) === 0 && Buffer.compare(m2.data, clip2) === 0
    && [...s3.objects.keys()].some((k) => k.includes('/delf-b2-test/speaking/clip-a')), 'recordings are stored per course (u/<user>/<course>/…)');
  check(s3.stats.badSig === 0, 'every R2 request was correctly signed');

  // Vocabulary.
  r = await A.req('POST', '/vocab', { json: { lemma: 'néanmoins', definition: 'nevertheless', partOfSpeech: 'adv', level: 'B2' } });
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
  const lv = (await A.req('GET', '/vocab?level=B2')).data.items, lc = (await A.req('GET', '/vocab?level=C1')).data.items;
  check(lv.length === 1 && lv[0].cefr_level === 'B2' && lv[0].course === 'delf-b1' && lc.length === 0, 'words carry their CEFR level and the course they came from', lv[0]);
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

function loadPlaywright() {
  for (const id of ['playwright', 'playwright-core']) { try { return require(id); } catch (e) { /* next */ } }
  return null;
}

async function browserTests(base, owner, s3) {
  section('Browser (the app in Chromium against the API)');
  const pw = loadPlaywright();
  if (!pw) { results.push('  skip: Playwright is not installed (NODE_PATH)'); return; }
  const day = (d) => JSON.parse(fs.readFileSync(path.join(ROOT, `course/days/${String(d).padStart(2, '0')}.json`), 'utf8'));
  const D1 = day(1), course = JSON.parse(fs.readFileSync(path.join(ROOT, 'course/course.json'), 'utf8'));
  const browser = await pw.chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const errors = [];
  const open = async (opts = {}) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 } }, opts));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/status of 401/.test(m.text())) errors.push(m.text()); });
    return { ctx, page };
  };
  const settled = (page) => page.waitForFunction(() => window.__delf50 && window.__delf50.saving().status === 'saved' && !window.__delf50.saving().pending, null, { timeout: 15000 });
  const one = async (sql, p) => (await owner.query(sql, p)).rows[0];

  const { ctx: ctxA, page: A } = await open();
  await A.goto(base);
  await A.waitForSelector('.auth form');
  check(true, 'signed out, the sign-in form is shown');
  await A.click('[data-mode="register"]');
  await A.fill('input[name=name]', 'Camille');
  await A.fill('input[name=email]', 'camille@example.com');
  await A.fill('input[name=password]', 'correct-horse-11');
  await A.click('button[type=submit]');
  await A.waitForSelector('.hero');
  check((await A.textContent('.hero h1')) === D1.title && /Jour 1 sur 50/.test(await A.textContent('.hero .eyebrow')), 'after sign-up, Day 1 opens with its title', await A.textContent('.hero h1'));
  const tiles = await A.$$eval('.mod .mod-count', (xs) => xs.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  check(tiles[0] === `0/ ${course.quotas.standard.grammar} 题`, 'the day shows the standard plan', tiles);

  // Grammar: the due questions, answered with the keyboard (one wrong).
  await A.click('.mod >> nth=0');
  await A.waitForSelector('.qcard');
  const due = course.quotas.standard.grammar, letters = 'abcde';
  for (let i = 0; i < due; i++) {
    const q = D1.grammar[i], pick = i === 2 ? (q.answer + 1) % q.options.length : q.answer;
    await A.waitForSelector(`.dot-q.on >> text="${i + 1}"`);
    await A.keyboard.press(letters[pick]);
    await A.waitForSelector('.feedback');
    if (i < due - 1) await A.keyboard.press('Enter');
  }
  await settled(A);
  const g = await one(`select count(*)::int n, count(*) filter (where correct)::int ok, min(answer_key) k from delf50.grammar_attempts where not deleted`);
  check(g.n === due && g.ok === due - 1 && g.k === '1:present-01', 'every grammar answer is a row under its Day 1 key', g);
  const e = await one(`select count(*)::int n, min(skill) skill from delf50.error_items where resolved_at is null`);
  check(e.n === 1, 'the wrong answer is in the error book', e);

  // Output practice.
  await A.goto(base + '/#/day/1/grammar/production');
  await A.waitForSelector('#production .check');
  await A.click('#production .check >> nth=0');
  await A.click('#production .check >> nth=1');
  await settled(A);
  check((await one(`select count(*)::int n from delf50.grammar_productions where done`)).n === 2, 'output practice is saved per prompt');

  // Reading: every question of the first text.
  await A.goto(base + '/#/day/1/reading/1');
  await A.waitForSelector('.qs');
  for (let i = 0; i < D1.items.reading[0].questions.length; i++) await A.click(`.q >> nth=${i} >> .opt >> nth=${D1.items.reading[0].questions[i].answer}`);
  await A.waitForSelector('.pager-item.on.done');
  await settled(A);
  const ra = await one(`select count(*)::int n, min(content_id) c, min(day) d from delf50.reading_answers`);
  check(ra.n === D1.items.reading[0].questions.length && ra.c === 'R01-1' && ra.d === 1, 'reading answers are saved under the item id', ra);
  check(await A.$$eval('.opt:disabled', (xs) => xs.length) === D1.items.reading[0].questions.reduce((n, q) => n + q.options.length, 0), 'answered questions are locked');

  // Writing: the draft is saved while typing and survives a reload; submitting moves it into the submissions.
  await A.goto(base + '/#/day/1/writing/1');
  await A.waitForSelector('.ed');
  await A.type('.ed', 'Bonjour, je m’appelle Camille et je travaille à Lausanne.', { delay: 5 });
  await settled(A);
  const dr = await one(`select count(*)::int n, min(draft_key) k from delf50.drafts`);
  check(dr.n === 1 && dr.k === '1:W01-1', 'the draft is saved as it is typed', dr);
  await A.reload();
  await A.waitForSelector('.ed');
  check(/Camille/.test(await A.inputValue('.ed')), 'after a reload the draft is back');
  await A.click('[data-act="submit"]');
  await A.waitForSelector('.notice');
  await A.click('[data-act="submit"]');
  await A.waitForSelector('.versions');
  await settled(A);
  const w = await one(`select count(*)::int n, min(word_count) wc, min(content_id) c, (select count(*)::int from delf50.drafts) drafts from delf50.writing_submissions`);
  check(w.n === 1 && w.wc === 9 && w.c === 'W01-1' && w.drafts === 0, 'a short text asks for confirmation, then is submitted with its word count', w);

  // Speaking: a recording goes to R2, then its round is saved.
  await A.goto(base + '/#/day/1/speaking/1');
  await A.click('[data-act="record"]');
  await A.waitForSelector('.recorder.live');
  await A.waitForTimeout(1500);
  await A.click('[data-act="finish"]');
  await A.waitForSelector('.recorder.review audio');
  await A.click('[data-act="keep"]');
  await A.waitForSelector('.round');
  await settled(A);
  const sp = await one(`select count(*)::int n, min(clip_id) clip, min(duration_sec) sec from delf50.speaking_attempts`);
  const stored = await one(`select count(*)::int n from delf50.media_objects where clip_id = $1`, [sp.clip]);
  check(sp.n === 1 && /^clip-/.test(sp.clip) && sp.sec >= 1, 'a recorded round is saved with its clip', sp);
  check(stored.n === 1 && [...s3.objects.keys()].some((k) => k.includes('/speaking/' + sp.clip)), 'the recording is stored in R2', [...s3.objects.keys()]);
  await A.click('[data-act="timer"]');
  await A.waitForTimeout(1100);
  await A.click('[data-act="finish"]');
  await A.waitForFunction(() => document.querySelectorAll('.round').length === 2);
  await settled(A);
  check((await one(`select count(*)::int n from delf50.speaking_attempts where clip_id is null`)).n === 1, 'a timed round without recording is saved too');

  // Chunks: recall from Chinese and a gapped sentence, then self-assess.
  await A.goto(base + '/#/day/1/vocab');
  await A.waitForSelector('.recall .gap');
  check(!(await A.isVisible('.recall-fr')) && (await A.textContent('.recall-zh')) === D1.vocab[0].zh, 'a chunk card first shows the meaning and the gapped sentence');
  await A.keyboard.press(' ');
  await A.waitForSelector('.recall-fr');
  check((await A.textContent('.recall-fr')).includes(D1.vocab[0].fr.slice(0, 4)), 'the answer side shows the chunk');
  await A.keyboard.press('1');
  await A.waitForFunction((id) => !document.querySelector('.recall-fr') && document.querySelector('.chunk-row.on') && document.querySelector('.chunk-row.on').dataset.id !== id, D1.vocab[0].id);
  await A.keyboard.press(' ');
  await A.keyboard.press('2');
  await settled(A);
  const lx = await one(`select string_agg(chunk_id || ':' || mark, ' ' order by chunk_id) m from delf50.lexicon_marks where day = 1`);
  check(lx.m === `${D1.vocab[0].id}:known ${D1.vocab[1].id}:again`, 'each chunk is saved with the learner’s own assessment', lx);

  // Spaced review (Day 1 reviews its own material): a grammar question, then a chunk.
  await A.goto(base + '/#/day/1/review');
  await A.waitForSelector('.spaced .opt');
  await A.click('.spaced .opt >> nth=0');
  await A.waitForSelector('.spaced .feedback');
  await A.keyboard.press('ArrowRight');
  await A.waitForSelector('.spaced .recall .gap');
  await A.keyboard.press(' ');
  await A.keyboard.press('1');
  await settled(A);
  const rv = await one(`select string_agg(kind || source_day, ' ' order by answer_key) k, count(*)::int n from delf50.review_answers where day = 1`);
  check(rv.n === 2 && rv.k === 'g1 v1', 'review items are saved as done on the day, with their source day', rv);

  // Intensity.
  await A.goto(base + '/#/day/1');
  await A.waitForSelector('.hero');
  await A.click('[data-act="intensity"][data-v="light"]');
  await settled(A);
  const lightTiles = await A.$$eval('.mod .mod-count', (xs) => xs.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  check(lightTiles[0] === `${course.quotas.light.grammar}/ ${course.quotas.light.grammar} 题` && (await one(`select doc->>'intensity' i from delf50.study_state`)).i === 'light',
    'a lighter intensity needs fewer questions; answers beyond it still count', lightTiles);

  // Nothing is kept in the browser.
  const local = await A.evaluate(async () => ({ ls: localStorage.length, ss: sessionStorage.length, idb: indexedDB.databases ? (await indexedDB.databases()).length : 0 }));
  check(local.ls === 0 && local.ss === 0 && local.idb === 0, 'nothing is stored in the browser', local);
  const lat = await A.evaluate(() => window.__delf50.saving().latency);
  check(lat.length >= 3 && lat.every(([total]) => total < 3000), `changes reach the server within ${Math.max(...lat.map((x) => x[0]))} ms`, lat);

  // A second device sees everything; a change there reaches the first when it comes back.
  const { ctx: ctxB, page: B } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await B.goto(base);
  await B.fill('input[name=email]', 'camille@example.com');
  await B.fill('input[name=password]', 'correct-horse-11');
  await B.click('button[type=submit]');
  await B.waitForSelector('.hero');
  check(await B.isVisible('.nav') && /今日已完成|今日完成度/.test(await B.textContent('.hero-state')), 'the second device opens the same day');
  await B.goto(base + '/#/day/1/grammar/11');
  await B.waitForSelector('.qcard');
  await B.click(`.opt >> nth=${D1.grammar[10].answer}`);
  await settled(B);
  await A.goto(base + '/#/day/1/grammar/11');
  await A.waitForSelector('.qcard');
  await A.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await A.waitForSelector('.qcard.is-ok', { timeout: 10000 });
  check(true, 'an answer given on another device appears when the page comes back');

  // The error book.
  await A.goto(base + '/#/errors');
  await A.waitForSelector('.err');
  await A.click('[data-act="resolve"]');
  await A.waitForSelector('.empty');
  await settled(A);
  const openErrors = (await one(`select count(*)::int n from delf50.error_items where resolved_at is null`)).n;
  check(openErrors === await A.$$eval('.err', (x) => x.length), 'a mastered error leaves the error book (kept as resolved)');

  // Every page renders.
  for (const [hash, sel] of [['#/progress', '.mastery'], ['#/route', '.tiles'], ['#/archive', '.arc-days'], ['#/archive/1', '.chunks-list'], ['#/guide', '.nodes'], ['#/day/16/listening/1', '.player'], ['#/day/20/review', '.spaced .dots'], ['#/day/45/grammar', '.qcard'], ['#/day/50', '.hero']]) {
    await A.goto(base + '/' + hash);
    const ok = await A.waitForSelector(sel, { timeout: 8000 }).then(() => true, () => false);
    check(ok, `${hash} renders`);
  }
  const lastDayTitle = await A.textContent('.hero h1');
  check(lastDayTitle === day(50).title, 'Day 50 opens with its own material', lastDayTitle);

  // The session ends mid-study: the change waits, and is saved after signing in again.
  await A.goto(base + '/#/day/2/vocab');
  await A.waitForSelector('.recall .gap');
  await settled(A);
  await ctxA.clearCookies(); // the session cookie is gone (expired)
  await A.keyboard.press(' ');
  await A.keyboard.press('1');
  await A.waitForSelector('.auth form', { timeout: 15000 });
  await A.fill('input[name=email]', 'camille@example.com');
  await A.fill('input[name=password]', 'correct-horse-11');
  await A.click('button[type=submit]');
  await A.waitForSelector('.recall');
  await settled(A);
  check((await one(`select count(*)::int n from delf50.lexicon_marks where day = 2`)).n === 1, 'after the session expires, signing in again saves the pending change');

  await A.click('[data-act="account"]');
  await A.click('[data-signout]');
  await A.waitForSelector('.auth form');
  check(true, 'sign-out returns to the sign-in form');
  check(errors.length === 0, 'no page errors', errors.slice(0, 3));
  await ctxA.close(); await ctxB.close(); await browser.close();
}

// ───────────────────────── main ─────────────────────────────────────────────

async function main() {
  C = await import(path.join(ROOT, 'app/sync-core.js'));
  unitTests();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    results.push('\n  skip API section: TEST_DATABASE_URL is not set');
  } else {
    const { Pool } = require('pg');
    const owner = new Pool({ connectionString: url, max: 4 });
    const apiPassword = crypto.randomBytes(24).toString('base64url');
    await owner.query('drop schema if exists delf50 cascade; drop schema if exists neon_auth cascade');
    await owner.query(`create schema neon_auth;
      create table neon_auth."user" (id uuid primary key, email text unique not null, name text);
      create table neon_auth.session (id uuid primary key, token text unique not null, "userId" uuid references neon_auth."user"(id) on delete cascade, "expiresAt" timestamptz not null);
      do $$ begin if not exists (select from pg_roles where rolname = 'delf50_api') then create role delf50_api; end if; end $$;
      alter role delf50_api login password '${apiPassword}'`);
    for (let pass = 0; pass < 2; pass++) { // twice: every migration must be safe to re-run
      for (const f of fs.readdirSync(path.join(ROOT, 'db/migrations')).filter((x) => x.endsWith('.sql')).sort()) {
        await owner.query(fs.readFileSync(path.join(ROOT, 'db/migrations', f), 'utf8'));
      }
    }
    const u = new URL(url); u.username = 'delf50_api'; u.password = apiPassword;
    process.env.API_DATABASE_URL = u.toString();
    // The API uses its production driver (Neon over HTTP), connected as delf50_api;
    // against a plain PostgreSQL (a local run) the same statements go through node-postgres.
    process.env.DATABASE_URL = process.env.API_DATABASE_URL;
    if (!/\.neon\.tech$/.test(u.hostname)) {
      const pool = new Pool({ connectionString: process.env.API_DATABASE_URL, max: 4 });
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
    }
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const creds = { id: 'TESTKEYID', secret: crypto.randomBytes(20).toString('hex') };
    const s3 = await startS3Mock(makeCert(fs.mkdtempSync(path.join(os.tmpdir(), 'delf50-'))), creds);
    const auth = await startAuthMock(owner);
    Object.assign(process.env, { NEON_AUTH_BASE_URL: auth.base, R2_ENDPOINT: `https://127.0.0.1:${s3.port}`, R2_BUCKET: 'delf50-test', R2_ACCESS_KEY_ID: creds.id, R2_SECRET_ACCESS_KEY: creds.secret });
    const app = await startApp();
    try {
      await apiTests(app.base, owner, auth, s3);
      await owner.query('delete from neon_auth."user"; delete from delf50.vocabulary_items');
      await browserTests(app.base, owner, s3);
    } catch (e) {
      check(false, 'suite aborted', e.stack || String(e));
    } finally {
      app.server.close(); s3.server.close(); auth.server.close(); await owner.end();
    }
  }
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} check(s) FAILED.` : '\nAll cloud checks passed.');
  process.exit(failed ? 1 : 0);
}

main();
