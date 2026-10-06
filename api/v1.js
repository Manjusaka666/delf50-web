'use strict';
/**
 * DELF50 API v1. One function serves every /api/v1/* path (vercel.json
 * rewrites /api/v1/<route> to /api/v1?__route=<route>).
 *
 * Identity: Neon Auth. Web uses its session cookie (set through the auth
 * proxy below); apps send `Authorization: Bearer <JWT | session token>`.
 * Errors are {error:{code,message}}.
 *
 * Courses: learning routes take `?course=<id>` (see _lib/courses.js); without
 * it they address the default course, delf-b1. Accounts span all courses.
 *
 *   GET        health[?deep=1]
 *   *          auth/<neon-auth route>   e.g. sign-up/email, sign-in/email, get-session, sign-out, token
 *   GET        courses                  {courses, enrolled: [{course, rev, updatedAt}]}
 *   GET        bootstrap                {user, course, state, rev, positions, keys, collections}
 *   POST       sync                     {doc, ops, device, batch} → {rev}
 *   GET        rev                      {rev}
 *   GET|DELETE media[?clipId=]
 *   PUT|GET    media/raw?clipId=…       POST media/upload-url · POST media/complete · GET media/url
 *   GET|POST|DELETE vocab · POST vocab/review
 */
const db = require('./_lib/db');
const r2 = require('./_lib/r2');
const session = require('./_lib/session');
const records = require('./_lib/records');
const media = require('./_lib/media');
const vocab = require('./_lib/vocab');
const courses = require('./_lib/courses');
const { HttpError, readJson, send } = require('./_lib/http');

function route(req) {
  if (!req.query) req.query = Object.fromEntries(new URL(req.url || '/', 'http://x').searchParams);
  const q = req.query.__route;
  const r = Array.isArray(q) ? q.join('/') : q || (String(req.url || '').split('?')[0].match(/\/api\/v1\/?(.*)$/) || [])[1] || '';
  return String(r).replace(/^\/+|\/+$/g, '');
}

async function dispatch(req, res) {
  const path = route(req);
  const m = req.method;

  if (path.startsWith('auth/')) return session.proxy(req, res, path.slice(5));

  if (path === 'health' && m === 'GET') {
    let ok = false;
    try { ok = (await db.query('select 1 as ok'))[0].ok === 1; } catch (e) { ok = false; }
    let r2ok = null;
    if (r2.configured() && req.query.deep === '1') {
      try { await r2.head('_healthcheck/ping'); r2ok = true; } catch (e) { r2ok = false; }
    }
    return send(res, ok ? 200 : 503, { ok, db: ok, auth: Boolean(process.env.NEON_AUTH_BASE_URL), r2: r2.configured(), r2Reachable: r2ok, api: 1 });
  }

  const user = await session.requireUser(req);
  const course = courses.courseOf(req.query.course);

  if (path === 'courses' && m === 'GET') {
    const [rows] = await db.tx(user.id, [['select course, rev, updated_at from delf50.study_state order by updated_at desc', []]]);
    return send(res, 200, { courses: courses.list(), enrolled: rows.map((r) => ({ course: r.course, rev: Number(r.rev), updatedAt: r.updated_at })) });
  }
  if (path === 'bootstrap' && m === 'GET') {
    return send(res, 200, Object.assign({ user, course, collections: records.collections() }, await records.bootstrap(user, course)));
  }
  if (path === 'sync' && m === 'POST') return send(res, 200, await records.sync(user, await readJson(req, 4 * 1024 * 1024), course));
  if (path === 'rev' && m === 'GET') {
    const [rows] = await db.tx(user.id, [['select rev from delf50.study_state where course = $1', [course]]]);
    return send(res, 200, { rev: rows[0] ? Number(rows[0].rev) : 0 });
  }

  if (path === 'media' && m === 'GET') return media.list(req, res, user, course);
  if (path === 'media' && m === 'DELETE') return media.remove(req, res, user, course);
  if (path === 'media/raw' && m === 'PUT') return media.proxyUpload(req, res, user, course);
  if (path === 'media/raw' && m === 'GET') return media.proxyDownload(req, res, user, course);
  if (path === 'media/url' && m === 'GET') return media.downloadUrl(req, res, user, course);
  if (path === 'media/upload-url' && m === 'POST') return media.uploadUrl(req, res, user, await readJson(req), course);
  if (path === 'media/complete' && m === 'POST') return media.complete(req, res, user, await readJson(req), course);

  // Vocabulary is one deck across courses; `course` records where a word was added.
  if (path === 'vocab' && m === 'GET') return vocab.list(req, res, user);
  if (path === 'vocab' && m === 'POST') return vocab.add(req, res, user, await readJson(req), course);
  if (path === 'vocab' && m === 'DELETE') return vocab.remove(req, res, user);
  if (path === 'vocab/review' && m === 'POST') return vocab.review(req, res, user, await readJson(req));

  throw new HttpError(404, 'not_found', `No route for ${m} /api/v1/${path}`);
}

module.exports = async function handler(req, res) {
  try {
    await dispatch(req, res);
  } catch (e) {
    if (res.headersSent) { try { res.end(); } catch (x) { /* closed */ } return; }
    if (e && Number.isInteger(e.status)) {
      send(res, e.status, { error: Object.assign({ code: e.code || 'error', message: e.message }, e.extra || {}) });
      return;
    }
    console.error('[delf50-api]', req.method, req.url, e);
    send(res, 500, { error: { code: 'internal', message: 'Internal server error' } });
  }
};

module.exports.config = { maxDuration: 30 };
