/** The DELF50 API (/api/v1). Learning routes address one course. */

const COURSE = 'delf-b1';
const BASE = '/api/v1';

class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

export async function call(method, path, body, { keepalive = false, raw = false } = {}) {
  const init = { method, credentials: 'same-origin', cache: 'no-store', keepalive, headers: {} };
  if (body instanceof Blob) { init.body = body; init.headers['Content-Type'] = 'application/octet-stream'; }
  else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
  const url = BASE + path + (path.startsWith('/auth/') ? '' : (path.includes('?') ? '&' : '?') + 'course=' + COURSE);
  let r;
  try { r = await fetch(url, init); } catch (e) { throw new ApiError('无法连接服务器，请检查网络。', 0, 'network'); }
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

const AUTH_ERRORS = {
  INVALID_EMAIL_OR_PASSWORD: '邮箱或密码不正确。',
  USER_ALREADY_EXISTS: '该邮箱已注册，请直接登录。',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: '该邮箱已注册，请直接登录。',
  PASSWORD_TOO_SHORT: '密码至少 8 位。',
  INVALID_EMAIL: '邮箱格式不正确。',
  EMAIL_NOT_VERIFIED: '请先完成邮箱验证。'
};

export const errorText = (e) => (e && e.code === 'network' ? e.message : (e && AUTH_ERRORS[e.code]) || (e && e.message) || '操作失败，请重试。');
