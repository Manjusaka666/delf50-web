#!/usr/bin/env node
'use strict';
/**
 * Live smoke test against real infrastructure: runs the API in-process against
 * DATABASE_URL (the delf50_api role) and NEON_AUTH_BASE_URL, signs up two
 * throwaway accounts (use a test branch), and checks exact round trips,
 * latency, JWTs, RLS isolation, vocabulary and sign-out.
 *
 *   DATABASE_URL=… NEON_AUTH_BASE_URL=… node scripts/smoke-live.js
 */
const http = require('http');
const v1 = require('../api/v1.js');
const C = require('../cloud/delf50-cloud.js');
const records = require('../api/_lib/records.js');
const SPEC = records.collections();
const out = [];
const check = (ok, label, d) => out.push(`${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 400) : ''}`);
const ORIGIN = 'http://localhost:3000';

function client(base) {
  let cookie = '';
  async function req(method, p, json, headers = {}) {
    const h = Object.assign({ origin: ORIGIN }, headers);
    if (cookie) h.cookie = cookie;
    if (json !== undefined) h['content-type'] = 'application/json';
    const t0 = performance.now();
    const r = await fetch(base + '/api/v1' + p, { method, headers: h, body: json === undefined ? undefined : JSON.stringify(json) });
    for (const c of r.headers.getSetCookie()) cookie = /Max-Age=0/.test(c) ? '' : c.split(';')[0];
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch (e) { data = text; }
    return { status: r.status, data, headers: r.headers, ms: performance.now() - t0 };
  }
  return { req, get cookie() { return cookie; } };
}

(async () => {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    req.query = Object.fromEntries(u.searchParams); req.query.__route = u.pathname.slice(8);
    v1(req, res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const A = client(base);
    let r = await A.req('GET', '/health');
    check(r.status === 200 && r.data.db === true, 'health: database reachable as delf50_api', r.data);
    const email = `smoke-${Date.now()}@example.com`;
    r = await A.req('POST', '/auth/sign-up/email', { email, password: 'Smoke-test-pass-9', name: 'Smoke' });
    check(r.status === 200 && /__Secure-neon-auth\.session_token=/.test(A.cookie), 'Neon Auth sign-up through the proxy sets the session cookie', { status: r.status, data: r.data });
    r = await A.req('GET', '/bootstrap');
    check(r.status === 200 && r.data.state === null && r.data.user.email === email, 'bootstrap resolves the Neon Auth session to the user', r.data);
    const now = () => new Date().toISOString();
    const S = { selectedDay: 1, reading: { attempts: 1, answers: { '1:r1:0': 2 } }, writing: { count: 1, records: [{ day: 1, title: 'T', text: 'Bonjour', words: 1, at: now() }] },
      errors: [{ skill: 'g', original: 'a', correct: 'b', why: 'c', at: now() }], grammarReview202: { '1:G1': { day: 1, contentId: 'G1', selectedIndex: 0, correctIndex: 0, correct: true, answeredAt: now() } },
      contentProgress172: { completed: { reading: { r1: { day: 1 } }, writing: {} } }, drafts171: { writing: { k: 'draft' } } };
    let d = C.diff({}, {}, S, SPEC);
    r = await A.req('POST', '/sync', { doc: d.doc, ops: d.ops });
    check(r.status === 200 && r.data.rev === 1, 'first sync commits', r.data);
    r = await A.req('GET', '/bootstrap');
    check(C.equal(r.data.state, S), 'bootstrap rebuilds the state exactly', r.data.state);
    let prev = S, pos = d.pos; const ms = [];
    for (let i = 0; i < 15; i++) {
      const next = JSON.parse(JSON.stringify(prev));
      next.reading.answers[`1:r1:${i + 1}`] = i % 4; next.reading.attempts++; next.lastSavedAt = now();
      d = C.diff(prev, pos, next, SPEC);
      r = await A.req('POST', '/sync', { doc: d.doc, ops: d.ops });
      ms.push(Math.round(r.ms)); prev = next; pos = d.pos;
    }
    ms.sort((a, b) => a - b);
    check(ms[ms.length - 1] < 500, `sync round trip p50 ${ms[7]} ms, max ${ms[14]} ms`, ms);
    r = await A.req('GET', '/bootstrap');
    check(C.equal(r.data.state, prev), 'after 15 saves the database holds exactly the latest state');
    const b = []; for (let i = 0; i < 5; i++) b.push(Math.round((await A.req('GET', '/bootstrap')).ms));
    out.push(`     bootstrap ${b.join('/')} ms`);

    const gs = await A.req('GET', '/auth/get-session');
    const jwt = gs.headers.get('set-auth-jwt');
    const bearer = async (t) => (await fetch(base + '/api/v1/rev', { headers: { authorization: 'Bearer ' + t } })).status;
    check(jwt && (await bearer(jwt)) === 200, 'Neon Auth JWT (EdDSA, JWKS) works as a bearer token', { jwt: Boolean(jwt), status: gs.status });
    if (jwt) check((await bearer(jwt.slice(0, -4) + 'AAAA')) === 401, 'a tampered JWT is refused');

    const B = client(base);
    await B.req('POST', '/auth/sign-up/email', { email: 'b-' + email, password: 'Smoke-test-pass-9', name: 'B' });
    r = await B.req('GET', '/bootstrap');
    check(r.status === 200 && r.data.state === null, 'a second account sees none of the first account\'s records (RLS)');
    r = await B.req('POST', '/vocab', { lemma: 'toutefois', definition: 'however' });
    const rv = r.data.item ? await B.req('POST', '/vocab/review', { vocabularyId: r.data.item.id, rating: 4 }) : { data: {} };
    check(r.status === 201 && rv.data.item && rv.data.item.interval_days === 1, 'vocabulary add + review', { add: r.data, review: rv.data });

    const old = A.cookie;
    r = await A.req('POST', '/auth/sign-out', {});
    const after = await fetch(base + '/api/v1/bootstrap', { headers: { cookie: old } });
    check(r.status === 200 && after.status === 401, 'sign-out revokes the session', { s: r.status, after: after.status, data: r.data });
  } catch (e) { out.push('FAIL aborted: ' + (e.stack || e)); }
  server.close();
  console.log(out.join('\n'));
  process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
})();
