/**
 * The interface language.
 *
 * Every string the app shows comes from a catalog (i18n/zh-CN.js, i18n/en.js);
 * French course material is never translated, and the learner-language parts
 * of the course (explanations, glosses, guides) come from the course's own
 * translations (course/…/i18n/<locale>/, see content.js).
 *
 * Which language: an explicit ?lang= in the address, else the account's
 * choice (settings), else — for an account that studied before the interface
 * had a choice — Chinese, else the device's preferred languages. The choice is
 * saved in the account, never in the browser.
 *
 * Catalog entries are strings with {name} slots, or functions of the values
 * (for plurals and other grammar).
 */
import zh from './i18n/zh-CN.js';
import en from './i18n/en.js';

export const LOCALES = [
  { id: 'zh-CN', name: '中文', short: '中' },
  { id: 'en', name: 'English', short: 'EN' }
];
const CATALOGS = { 'zh-CN': zh, en };
export const FALLBACK = 'zh-CN';

/** The supported locale for a language tag (zh, zh-Hans-CN, en-GB…), or null. */
export function match(tag) {
  const tg = String(tag || '').toLowerCase();
  if (/^zh(-|_|$)/.test(tg)) return 'zh-CN';
  if (/^en(-|_|$)/.test(tg)) return 'en';
  return null;
}

/** The language asked for in the address (?lang=en), if any. */
export function requested() {
  try { return match(new URLSearchParams(location.search).get('lang')); } catch (e) { return null; }
}

/** The device's first supported language; English for any other (a French or German device). */
export function deviceLocale() {
  const tags = typeof navigator !== 'undefined' ? (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]) : [];
  for (const tag of tags) { const m = match(tag); if (m) return m; }
  return 'en';
}

let locale = requested() || deviceLocale();
const listeners = new Set();

export const getLocale = () => locale;
export const onLocale = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** Switches the interface language (the caller saves it and re-renders). */
export function setLocale(id) {
  if (!CATALOGS[id]) return false;
  const changed = id !== locale;
  locale = id;
  applyDocument();
  if (changed) listeners.forEach((fn) => fn(id));
  return changed;
}

/** <html lang> and the page description follow the language (assistive technology picks its voice from lang). */
export function applyDocument() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  const d = document.querySelector('meta[name="description"]');
  if (d) d.setAttribute('content', t('meta.description'));
}

const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m));

/** The message for a key in the current language (falling back to Chinese, then the key itself). */
export function t(key, vars) {
  const c = CATALOGS[locale];
  let m = c[key];
  if (m === undefined) m = CATALOGS[FALLBACK][key];
  if (m === undefined) return key;
  return typeof m === 'function' ? m(vars || {}) : fill(m, vars);
}
export const has = (key) => key in CATALOGS[locale];

/** For tests and the checks: every catalog's keys. */
export const catalogs = () => CATALOGS;

// ── formatting (Intl), in the device's time zone ──
const cache = new Map();
const fmt = (kind, opts) => {
  const k = `${locale}|${kind}|${JSON.stringify(opts)}`;
  if (!cache.has(k)) cache.set(k, new Intl[kind](locale, opts));
  return cache.get(k);
};

export const fmtDateTime = (iso) => (iso ? fmt('DateTimeFormat', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : '—');
export const fmtNumber = (n) => fmt('NumberFormat', {}).format(n);
/** A list joined the way the language joins lists. */
export const fmtList = (xs, type = 'conjunction') => (typeof Intl.ListFormat === 'function' ? fmt('ListFormat', { style: 'long', type }).format(xs.map(String)) : xs.join(', '));
/** English plural: plural(3, 'question') → "questions"; irregular forms are passed in full. */
export const plural = (n, one, other = one + 's') => (Math.abs(n) === 1 ? one : other);
