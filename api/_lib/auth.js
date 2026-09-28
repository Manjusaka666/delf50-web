'use strict';
/**
 * Accounts and sessions.
 *
 * Passwords: scrypt (N=2^15, r=8, p=1, 32-byte key, 16-byte salt).
 * Sessions:  32 random bytes, base64url. Only SHA-256(token) is stored, so a
 *            database read does not yield usable credentials.
 * Web:       HttpOnly + Secure + SameSite=Lax cookie. State-changing requests
 *            authenticated by cookie must carry X-DELF50-Client, a header a
 *            cross-site form cannot send and a cross-origin fetch cannot send
 *            without a CORS preflight this API never grants.
 * Apps:      `Authorization: Bearer <token>` issued by login with transport=bearer.
 */
const crypto = require('crypto');
const db = require('./db');
const { HttpError, header, parseCookies, clientIp, isSecure, str } = require('./http');

const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const COOKIE = 'delf50_sid';
const SESSION_DAYS = { cookie: 90, bearer: 180 };
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const PLATFORMS = new Set(['web', 'ios', 'android', 'desktop', 'other']);

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 32, SCRYPT, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await new Promise((resolve, reject) => {
    crypto.scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length,
      { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem },
      (err, k) => (err ? reject(err) : resolve(k)));
  });
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

/** A fixed hash so an unknown email costs the same scrypt work as a known one. */
let dummyHash = null;
async function burnPasswordCheck(password) {
  if (!dummyHash) dummyHash = await hashPassword('delf50-timing-equaliser');
  await verifyPassword(password, dummyHash);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest();
const newToken = () => crypto.randomBytes(32).toString('base64url');

function normEmail(email) {
  return str(email, 'email', { max: 254, pattern: EMAIL_RE }).toLowerCase();
}

function validPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 200) {
    throw new HttpError(400, 'weak_password', 'Password must be 8-200 characters', { field: 'password' });
  }
  return pw;
}

function timingSafeStrEq(a, b) {
  const x = sha256(String(a));
  const y = sha256(String(b));
  return crypto.timingSafeEqual(x, y);
}

// ─── rate limiting (persisted, so it holds across function instances) ───────

async function recentFailures(kind, subject, minutes) {
  const row = await db.one(
    `select count(*)::int as n from delf50.auth_attempts
      where kind = $1 and subject = $2 and ok = false and at > now() - make_interval(mins => $3::int)`,
    [kind, subject, minutes]);
  return row ? row.n : 0;
}

async function recordAttempt(kind, subject, ok) {
  await db.query('insert into delf50.auth_attempts (kind, subject, ok) values ($1, $2, $3)', [kind, subject, ok]);
}

async function enforceLimit(kind, subject, max, minutes) {
  if (await recentFailures(kind, subject, minutes) >= max) {
    throw new HttpError(429, 'too_many_attempts', `Too many attempts. Try again in ${minutes} minutes.`);
  }
}

// ─── devices & sessions ─────────────────────────────────────────────────────

function readClient(body, req) {
  const c = (body && typeof body.client === 'object' && body.client) || {};
  const platform = PLATFORMS.has(c.platform) ? c.platform : 'web';
  const deviceId = typeof c.deviceId === 'string' && /^[A-Za-z0-9._:-]{8,128}$/.test(c.deviceId)
    ? c.deviceId : null;
  return {
    platform,
    deviceId,
    name: typeof c.name === 'string' ? c.name.slice(0, 120) : null,
    appVersion: typeof c.appVersion === 'string' ? c.appVersion.slice(0, 40) : null,
    userAgent: String(header(req, 'user-agent') || '').slice(0, 400)
  };
}

async function upsertDevice(userId, client) {
  const clientDeviceId = client.deviceId || `anon-${crypto.randomUUID()}`;
  const row = await db.one(
    `insert into delf50.devices (user_id, client_device_id, platform, name, user_agent, app_version)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (user_id, client_device_id) do update set
       platform = excluded.platform,
       name = coalesce(excluded.name, delf50.devices.name),
       user_agent = excluded.user_agent,
       app_version = coalesce(excluded.app_version, delf50.devices.app_version),
       last_seen_at = now()
     returning id`,
    [userId, clientDeviceId, client.platform, client.name, client.userAgent, client.appVersion]);
  return row.id;
}

function cookieHeader(req, token, maxAgeSec) {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (isSecure(req)) parts.push('Secure');
  return parts.join('; ');
}

async function createSession(req, res, userId, deviceId, transport) {
  const token = newToken();
  const days = SESSION_DAYS[transport];
  await db.query(
    `insert into delf50.sessions (user_id, device_id, token_hash, transport, expires_at, ip, user_agent)
     values ($1, $2, $3, $4, now() + make_interval(days => $5::int), $6, $7)`,
    [userId, deviceId, sha256(token), transport, days, clientIp(req), String(header(req, 'user-agent') || '').slice(0, 400)]);
  if (transport === 'cookie') {
    res.setHeader('Set-Cookie', cookieHeader(req, token, days * 86400));
    return null;
  }
  return token;
}

function clearCookie(req, res) {
  res.setHeader('Set-Cookie', cookieHeader(req, '', 0));
}

/**
 * Resolves the caller. Returns null when unauthenticated. The session's expiry
 * slides forward on use (at most one write per 10 minutes per session).
 */
async function authenticate(req) {
  let token = null;
  let transport = null;
  const authz = header(req, 'authorization');
  if (authz && /^Bearer\s+/i.test(authz)) {
    token = authz.replace(/^Bearer\s+/i, '').trim();
    transport = 'bearer';
  } else {
    const c = parseCookies(req)[COOKIE];
    if (c) { token = c; transport = 'cookie'; }
  }
  if (!token || token.length > 200) return null;

  const row = await db.one(
    `with s as (
       update delf50.sessions s set
         last_seen_at = now(),
         expires_at = greatest(s.expires_at, now() + make_interval(days => case s.transport when 'bearer' then $2::int else $3::int end))
       where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()
         and s.last_seen_at < now() - interval '10 minutes'
       returning s.id
     )
     select s.id as session_id, s.user_id, s.device_id, s.transport,
            u.email, u.display_name, u.role, u.created_at
       from delf50.sessions s
       join delf50.users u on u.id = s.user_id
      where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now() and u.disabled_at is null`,
    [sha256(token), SESSION_DAYS.bearer, SESSION_DAYS.cookie]);
  if (!row || row.transport !== transport) return null;
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    deviceId: row.device_id,
    transport,
    user: { id: row.user_id, email: row.email, displayName: row.display_name, role: row.role, createdAt: row.created_at }
  };
}

/** Cookie-authenticated writes must prove same-origin intent. */
function assertCsrf(req, auth) {
  if (!auth || auth.transport !== 'cookie') return;
  if (req.method === 'GET' || req.method === 'HEAD') return;
  if (!header(req, 'x-delf50-client')) throw new HttpError(403, 'csrf', 'Missing X-DELF50-Client header');
  const origin = header(req, 'origin');
  const host = header(req, 'x-forwarded-host') || header(req, 'host');
  if (origin && host) {
    let o;
    try { o = new URL(origin).host; } catch (e) { o = null; }
    if (o !== host) throw new HttpError(403, 'csrf', 'Cross-origin request rejected');
  }
}

async function requireAuth(req) {
  const auth = await authenticate(req);
  if (!auth) throw new HttpError(401, 'unauthenticated', 'Sign in required');
  assertCsrf(req, auth);
  return auth;
}

// ─── handlers ───────────────────────────────────────────────────────────────

function publicUser(u) {
  return { id: u.id, email: u.email, displayName: u.display_name || u.displayName, role: u.role };
}

async function register(req, res, body) {
  const invite = process.env.DELF50_INVITE_CODE;
  if (!invite) throw new HttpError(403, 'registration_closed', 'Registration is closed');
  const ip = clientIp(req);
  await enforceLimit('register', ip, 10, 60);
  if (typeof body.inviteCode !== 'string' || !timingSafeStrEq(body.inviteCode.trim(), invite)) {
    await recordAttempt('register', ip, false);
    throw new HttpError(403, 'invalid_invite', 'Invalid invite code', { field: 'inviteCode' });
  }
  const emailNorm = normEmail(body.email);
  const displayName = str(body.displayName || body.email.split('@')[0], 'displayName', { max: 60 });
  const password = validPassword(body.password);

  const maxUsers = Number(process.env.DELF50_MAX_USERS || 0);
  const hash = await hashPassword(password);
  // Capacity check and insert run under one advisory lock (delf50.create_user),
  // so concurrent registrations cannot exceed DELF50_MAX_USERS.
  const created = await db.one(
    'select status, id, email, display_name, role from delf50.create_user($1, $2, $3, $4, $5)',
    [body.email.trim(), emailNorm, displayName, hash, maxUsers > 0 ? maxUsers : null]);
  if (created.status === 'full') throw new HttpError(403, 'registration_full', 'The maximum number of accounts has been reached');
  const user = created.status === 'ok' ? created : null;
  await recordAttempt('register', ip, Boolean(user));
  if (!user) throw new HttpError(409, 'email_taken', 'An account with this email already exists', { field: 'email' });

  const client = readClient(body, req);
  const deviceId = await upsertDevice(user.id, client);
  const transport = body.transport === 'bearer' ? 'bearer' : 'cookie';
  const token = await createSession(req, res, user.id, deviceId, transport);
  return { user: publicUser(user), deviceId, token };
}

async function login(req, res, body) {
  const emailNorm = normEmail(body.email);
  if (typeof body.password !== 'string' || !body.password) throw new HttpError(400, 'invalid_field', 'password is required', { field: 'password' });
  const ip = clientIp(req);
  await enforceLimit('login', emailNorm, 8, 15);
  await enforceLimit('login', `ip:${ip}`, 40, 15);

  const user = await db.one(
    'select id, email, display_name, role, password_hash from delf50.users where email_norm = $1 and disabled_at is null',
    [emailNorm]);
  let ok = false;
  if (user) ok = await verifyPassword(body.password, user.password_hash);
  else await burnPasswordCheck(body.password);
  await recordAttempt('login', emailNorm, ok);
  if (!ok) {
    await recordAttempt('login', `ip:${ip}`, false);
    throw new HttpError(401, 'invalid_credentials', 'Email or password is incorrect');
  }

  const client = readClient(body, req);
  const deviceId = await upsertDevice(user.id, client);
  const transport = body.transport === 'bearer' ? 'bearer' : 'cookie';
  const token = await createSession(req, res, user.id, deviceId, transport);
  return { user: publicUser(user), deviceId, token };
}

async function logout(req, res) {
  const auth = await authenticate(req);
  if (auth) {
    assertCsrf(req, auth);
    await db.query('update delf50.sessions set revoked_at = now() where id = $1', [auth.sessionId]);
  }
  clearCookie(req, res);
  return { ok: true };
}

async function changePassword(req, auth, body) {
  await enforceLimit('password', auth.userId, 8, 15);
  const row = await db.one('select password_hash from delf50.users where id = $1', [auth.userId]);
  const ok = row && typeof body.currentPassword === 'string' && await verifyPassword(body.currentPassword, row.password_hash);
  await recordAttempt('password', auth.userId, Boolean(ok));
  if (!ok) throw new HttpError(401, 'invalid_credentials', 'Current password is incorrect', { field: 'currentPassword' });
  const hash = await hashPassword(validPassword(body.newPassword));
  await db.query('update delf50.users set password_hash = $2, updated_at = now() where id = $1', [auth.userId, hash]);
  // Every other session is signed out; this one stays.
  await db.query('update delf50.sessions set revoked_at = now() where user_id = $1 and id <> $2 and revoked_at is null',
    [auth.userId, auth.sessionId]);
  return { ok: true };
}

async function listSessions(auth) {
  const rows = await db.query(
    `select s.id, s.transport, s.created_at, s.last_seen_at, s.expires_at,
            d.platform, d.name as device_name, d.user_agent
       from delf50.sessions s left join delf50.devices d on d.id = s.device_id
      where s.user_id = $1 and s.revoked_at is null and s.expires_at > now()
      order by s.last_seen_at desc`, [auth.userId]);
  return { sessions: rows.map((r) => ({ ...r, current: r.id === auth.sessionId })) };
}

async function revokeSession(auth, id) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(400, 'invalid_field', 'Invalid session id');
  await db.query('update delf50.sessions set revoked_at = now() where id = $1 and user_id = $2 and revoked_at is null', [id, auth.userId]);
  return { ok: true };
}

module.exports = {
  authenticate, requireAuth, assertCsrf, register, login, logout, changePassword, listSessions, revokeSession,
  hashPassword, verifyPassword, COOKIE
};
