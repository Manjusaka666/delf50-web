/**
 * Account-wide preferences: interface language, appearance and the listening
 * voice (GET/PUT /api/v1/settings). They live in the account, so they follow
 * the learner to every device; nothing is kept in the browser.
 */
import { call } from './api.js';
import { getLocale, setLocale, requested } from './i18n.js';

export const THEMES = ['system', 'light', 'dark'];
export const prefs = { locale: null, theme: 'system', voice: null, rate: 0.9 };
const listeners = new Set();
export const onPrefs = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

let available = true, chosen = null;

/** A language picked before signing in (on the sign-in screen); saved to the account once signed in. */
export function chooseLocale(id) { chosen = id; setLocale(id); }

/** Loads the account's settings; throws when signed out (401), otherwise never fails the app. */
export async function loadSettings() {
  let r;
  try { r = await call('GET', '/settings'); } catch (e) {
    if (e.status === 401) throw e;
    return null;
  }
  available = r.available !== false;
  const p = r.prefs || {};
  if (THEMES.includes(p.theme)) prefs.theme = p.theme;
  if (typeof p.voice === 'string' || p.voice === null) prefs.voice = p.voice;
  if (typeof p.rate === 'number') prefs.rate = p.rate;
  prefs.locale = typeof p.locale === 'string' ? p.locale : null;
  applyTheme();
  return r;
}

/**
 * The interface language once signed in: a language asked for in the address
 * (this visit only), else one just chosen on the sign-in screen (then saved),
 * else the account's, else Chinese for an account that studied before there
 * was a choice, else the device's (already current).
 */
export function resolveLocale(r) {
  const ask = requested();
  if (ask) return setLocale(ask);
  if (chosen) {
    const c = chosen;
    chosen = null;
    if (c !== prefs.locale) save({ locale: c });
    return setLocale(c);
  }
  if (prefs.locale) return setLocale(prefs.locale);
  if (r && r.studied) return setLocale('zh-CN');
  return setLocale(getLocale());
}

/** Applies and saves settings; resolves false when the account could not store them (they still apply now). */
export async function save(patch) {
  Object.assign(prefs, patch);
  if ('theme' in patch) applyTheme();
  listeners.forEach((fn) => fn(prefs));
  if (!available) return false;
  try { await call('PUT', '/settings', patch); return true; } catch (e) { return false; }
}

/** The appearance: the system's, or a fixed light or dark one (the CSS reads data-theme). */
export function applyTheme() {
  const root = document.documentElement;
  if (prefs.theme === 'light' || prefs.theme === 'dark') root.dataset.theme = prefs.theme;
  else delete root.dataset.theme;
  // The browser chrome: each meta keeps its own scheme under "system", both follow a fixed theme.
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    const dark = prefs.theme === 'system' ? /dark/.test(m.media) : prefs.theme === 'dark';
    m.setAttribute('content', dark ? '#15201a' : '#f5f2eb');
  }
}
