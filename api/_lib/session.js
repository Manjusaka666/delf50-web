'use strict';
/**
 * Identity comes from Neon Auth only.
 *
 * Web: /api/v1/auth/* is proxied to the Neon Auth endpoint, so its session
 * cookie is first-party to this site. The cookie's token (value before the
 * signature) resolves to a user through delf50.session_user(), cached per
 * instance for SESSION_TTL_MS.
 * Apps: `Authorization: Bearer <JWT>` (EdDSA, verified against Neon Auth's
 * JWKS) or `Bearer <session token>`.
 */
const crypto = require('crypto');
const db = require('./db');
const { HttpError, readRaw, header, parseCookies, isSecure } = require('./http');

const COOKIE = '__Secure-neon-auth.session_token';
const SESSION_TTL_MS = 60 * 1000;
const cache = new Map();
let jwks = null;

const authBase = () => {
  const base = process.env.NEON_AUTH_BASE_URL;
  if (!base) throw new HttpError(503, 'auth_not_configured', 'NEON_AUTH_BASE_URL is not configured');
  return base.replace(/\/+$/, '');
};

function siteOrigin(req) {
  return `${isSecure(req) ? 'https' : 'http'}://${header(req, 'x-forwarded-host') || header(req, 'host')}`;
}

/** Forwards one Neon Auth call; cookies and the JWT header come back unchanged. */
async function proxy(req, res, path) {
  const search = String(req.url || '').split('?')[1];
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readRaw(req, 64 * 1024);
  const headers = { origin: header(req, 'origin') || siteOrigin(req) };
  for (const h of ['content-type', 'cookie', 'user-agent', 'x-forwarded-for']) if (header(req, h)) headers[h] = header(req, h);
  const r = await fetch(`${authBase()}/${path}${search ? '?' + search.replace(/(^|&)__route=[^&]*/g, '').replace(/^&/, '') : ''}`, { method: req.method, headers, body: body && body.length ? body : undefined });
  const cookies = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
  if (r.headers.get('set-auth-jwt')) res.setHeader('set-auth-jwt', r.headers.get('set-auth-jwt'));
  if (path === 'sign-out') cache.delete(tokenOf(req));
  res.statusCode = r.status;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json');
  res.end(Buffer.from(await r.arrayBuffer()));
}

function tokenOf(req) {
  const auth = header(req, 'authorization');
  if (auth && /^Bearer /i.test(auth)) return auth.slice(7).trim();
  const c = parseCookies(req)[COOKIE];
  return c ? c.split('.')[0] : null;
}

const b64 = (s) => Buffer.from(s, 'base64url');

async function verifyJwt(token) {
  const [h, p, s] = token.split('.');
  const head = JSON.parse(b64(h));
  const claims = JSON.parse(b64(p));
  if (!jwks || !jwks.keys.some((k) => k.kid === head.kid)) {
    jwks = await (await fetch(`${authBase()}/.well-known/jwks.json`)).json();
  }
  const jwk = jwks.keys.find((k) => k.kid === head.kid);
  const ok = jwk && head.alg === 'EdDSA' &&
    crypto.verify(null, Buffer.from(`${h}.${p}`), crypto.createPublicKey({ key: jwk, format: 'jwk' }), b64(s));
  if (!ok || !(claims.exp * 1000 > Date.now()) || claims.iss !== new URL(authBase()).origin) return null;
  return { id: claims.sub, email: claims.email || null, name: claims.name || null };
}

/** The signed-in user, or null. */
async function identify(req) {
  const token = tokenOf(req);
  if (!token) return null;
  const hit = cache.get(token);
  if (hit && hit.until > Date.now()) return hit.user;
  let user;
  if (token.split('.').length === 3) user = await verifyJwt(token).catch(() => null);
  else user = (await db.query('select * from delf50.session_user($1)', [token]))[0] || null;
  if (user) cache.set(token, { user, until: Date.now() + SESSION_TTL_MS });
  else cache.delete(token);
  return user;
}

async function requireUser(req) {
  const user = await identify(req);
  if (!user) throw new HttpError(401, 'unauthenticated', 'Sign in required');
  return user;
}

module.exports = { proxy, identify, requireUser, COOKIE };
