'use strict';
/**
 * DELF50 cloud API, version 1. One function serves every /api/v1/* path
 * (vercel.json rewrites /api/v1/<route> to /api/v1?__route=<route>), which keeps
 * the deployment inside the Hobby plan's function limit.
 *
 * Auth: HttpOnly cookie for the web app, `Authorization: Bearer` for apps.
 * All responses are JSON unless noted; errors are {error:{code,message,…}}.
 *
 *   GET    health
 *   POST   auth/register      {email,password,displayName?,inviteCode?,client?,transport?}
 *   POST   auth/login         {email,password,client?,transport?}
 *   POST   auth/logout
 *   GET    auth/me
 *   POST   auth/password      {currentPassword,newPassword}
 *   GET    auth/sessions
 *   DELETE auth/sessions/:id
 *   GET    sync/state?have=<rev>          raw document | 204
 *   PUT    sync/state                     raw document (see _lib/state.js)
 *   GET    sync/revisions
 *   GET    sync/revisions/:rev            raw document
 *   POST   sync/restore       {rev,baseRev}
 *   POST   sync/archive                   raw document
 *   GET    sync/archives
 *   GET    sync/archives/:id              raw document
 *   GET    progress/summary
 *   GET    progress/answers|productions|completions?module=&day=
 *   GET    media
 *   POST   media/upload-url   {clipId,contentType,size,kind?,day?,durationSec?}
 *   POST   media/complete     {clipId}
 *   PUT    media/raw?clipId=[&part=&parts=]   raw bytes (≤ 3.5 MB per part)
 *   GET    media/raw?clipId=[&part=]          raw bytes
 *   GET    media/url?clipId=
 *   DELETE media?clipId=
 *   POST   events             {events:[…]}
 *   GET    events?after=&limit=
 */
const db = require('./_lib/db');
const r2 = require('./_lib/r2');
const auth = require('./_lib/auth');
const state = require('./_lib/state');
const media = require('./_lib/media');
const events = require('./_lib/events');
const { HttpError, readJson, send } = require('./_lib/http');

function routeOf(req) {
  const q = req.query && req.query.__route;
  let route = Array.isArray(q) ? q.join('/') : q;
  if (!route) {
    const path = String(req.url || '').split('?')[0];
    const m = path.match(/\/api\/v1\/?(.*)$/);
    route = m ? m[1] : '';
  }
  return String(route).replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
}

function ensureQuery(req) {
  if (req.query) return;
  const u = new URL(req.url || '/', 'http://localhost');
  req.query = Object.fromEntries(u.searchParams.entries());
}

async function dispatch(req, res) {
  ensureQuery(req);
  const seg = routeOf(req);
  const m = req.method;
  const [a, b, c] = seg;

  if (a === 'health' && m === 'GET') {
    let dbOk = false;
    if (db.configured()) {
      try { dbOk = Boolean(await db.one('select 1 as ok')); } catch (e) { dbOk = false; }
    }
    // ?deep=1 also proves the R2 credentials with a signed HEAD (404 = OK).
    let r2Reachable = null;
    if (r2.configured() && req.query.deep === '1') {
      try { await r2.head('_healthcheck/ping'); r2Reachable = true; } catch (e) { r2Reachable = false; }
    }
    const reg = auth.registrationMode();
    return send(res, dbOk ? 200 : 503, {
      ok: dbOk, db: dbOk, r2: r2.configured(), r2Reachable,
      registration: reg.open, inviteRequired: reg.inviteRequired, api: 1
    });
  }

  if (a === 'auth') {
    if (b === 'register' && m === 'POST') return send(res, 201, await auth.register(req, res, await readJson(req)));
    if (b === 'login' && m === 'POST') return send(res, 200, await auth.login(req, res, await readJson(req)));
    if (b === 'logout' && m === 'POST') return send(res, 200, await auth.logout(req, res));
    if (b === 'me' && m === 'GET') {
      const who = await auth.authenticate(req);
      if (!who) throw new HttpError(401, 'unauthenticated', 'Sign in required');
      return send(res, 200, { user: who.user, deviceId: who.deviceId, transport: who.transport });
    }
    const who = await auth.requireAuth(req);
    if (b === 'password' && m === 'POST') return send(res, 200, await auth.changePassword(req, who, await readJson(req)));
    if (b === 'sessions' && !c && m === 'GET') return send(res, 200, await auth.listSessions(who));
    if (b === 'sessions' && c && m === 'DELETE') return send(res, 200, await auth.revokeSession(who, c));
  }

  if (a === 'sync') {
    const who = await auth.requireAuth(req);
    if (b === 'state' && m === 'GET') return state.getState(req, res, who);
    if (b === 'state' && m === 'PUT') return state.putState(req, res, who);
    if (b === 'revisions' && !c && m === 'GET') return state.listRevisions(req, res, who);
    if (b === 'revisions' && c && m === 'GET') return state.getRevision(req, res, who, c);
    if (b === 'restore' && m === 'POST') return state.restore(req, res, who, await readJson(req));
    if (b === 'archive' && m === 'POST') return state.archive(req, res, who);
    if (b === 'archives' && !c && m === 'GET') return state.listArchives(req, res, who);
    if (b === 'archives' && c && m === 'GET') return state.getArchive(req, res, who, c);
  }

  if (a === 'progress' && m === 'GET') {
    const who = await auth.requireAuth(req);
    if (b === 'summary') return events.summary(req, res, who);
    if (b === 'answers' || b === 'productions' || b === 'completions') return events.records(req, res, who, b);
  }

  if (a === 'media') {
    const who = await auth.requireAuth(req);
    if (!b && m === 'GET') return media.list(req, res, who);
    if (!b && m === 'DELETE') return media.remove(req, res, who);
    if (b === 'upload-url' && m === 'POST') return media.uploadUrl(req, res, who, await readJson(req));
    if (b === 'complete' && m === 'POST') return media.complete(req, res, who, await readJson(req));
    if (b === 'raw' && m === 'PUT') return media.proxyUpload(req, res, who);
    if (b === 'raw' && m === 'GET') return media.proxyDownload(req, res, who);
    if (b === 'url' && m === 'GET') return media.downloadUrl(req, res, who);
  }

  if (a === 'events') {
    const who = await auth.requireAuth(req);
    if (m === 'POST') return events.post(req, res, who, await readJson(req, 4 * 1024 * 1024));
    if (m === 'GET') return events.get(req, res, who);
  }

  throw new HttpError(404, 'not_found', `No route for ${m} /api/v1/${seg.join('/')}`);
}

module.exports = async function handler(req, res) {
  try {
    await dispatch(req, res);
  } catch (e) {
    if (res.headersSent) { try { res.end(); } catch (x) { /* already closed */ } return; }
    if (e instanceof HttpError || (e && Number.isInteger(e.status))) {
      send(res, e.status, { error: Object.assign({ code: e.code || 'error', message: e.message }, e.extra || {}) });
      return;
    }
    console.error('[delf50-api]', req.method, req.url, e);
    send(res, 500, { error: { code: 'internal', message: 'Internal server error' } });
  }
};

module.exports.config = { maxDuration: 30 };
