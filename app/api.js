/** The DELF50 API (/api/v1). Learning routes address the current course (CEFR level). */
import { t, has } from './i18n.js';

let COURSE = 'delf-b1';
const BASE = '/api/v1';

/** The course every learning request addresses from now on. */
export const useCourse = (id) => { COURSE = id; };

class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

export async function call(method, path, body, { keepalive = false, raw = false } = {}) {
  const init = { method, credentials: 'same-origin', cache: 'no-store', keepalive, headers: {} };
  if (body instanceof Blob) { init.body = body; init.headers['Content-Type'] = 'application/octet-stream'; }
  else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
  const url = BASE + path + (path.startsWith('/auth/') ? '' : (path.includes('?') ? '&' : '?') + 'course=' + COURSE);
  let r;
  try { r = await fetch(url, init); } catch (e) { throw new ApiError(t('api.network'), 0, 'network'); }
  if (raw && r.ok) return r;
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
  if (!r.ok) {
    const err = data && (data.error || data);
    throw new ApiError((err && err.message) || `HTTP ${r.status}`, r.status, err && err.code);
  }
  return data;
}

const ALIAS = { USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'USER_ALREADY_EXISTS' };

/** A message for the learner: the interface language's text for known codes, else the server's message. */
export function errorText(e) {
  if (!e) return t('api.failed');
  if (e.code === 'network') return t('api.network');
  const k = `api.${ALIAS[e.code] || e.code}`;
  return (e.code && has(k)) ? t(k) : e.message || t('api.failed');
}
