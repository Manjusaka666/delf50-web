/** DELF50 · app shell: sign-in gate, routing, navigation and rendering. */
import { call, errorText, useCourse } from './api.js';
import { store, bootstrap, commit, onChange, onStatus, onAuthRequired, flush, whenSaved } from './store.js';
import { loadCourse, getCourse, currentLevel, levelOf, LEVELS } from './course.js';
import { setDay } from './state.js';
import { html, icon, fmtDateTime, matisse, setLabels } from './ui.js';
import { t, LOCALES, getLocale, setLocale, applyDocument } from './i18n.js';
import { prefs, loadSettings, resolveLocale, chooseLocale, save, applyTheme, THEMES } from './settings.js';
import * as speech from './speech.js';
import { dayView } from './views/day.js';
import { grammarView } from './views/grammar.js';
import { textView } from './views/text.js';
import { writeView } from './views/write.js';
import { speakView } from './views/speak.js';
import { errorsView } from './views/errors.js';
import { vocabView } from './views/vocab.js';
import { spacedView } from './views/spaced.js';
import { progressView } from './views/progress.js';
import { archiveView } from './views/archive.js';
import { routeView } from './views/route.js';
import { guideView } from './views/guide.js';

const app = document.getElementById('app');

const ROUTES = [
  [/^\/day\/(\d+)$/, (m) => dayView(+m[1])],
  [/^\/day\/(\d+)\/grammar(?:\/(\d+|production))?$/, (m) => grammarView(+m[1], m[2] === 'production' ? 'production' : m[2] ? +m[2] : null)],
  [/^\/day\/(\d+)\/(reading|listening)\/(\d+)$/, (m) => textView(+m[1], m[2], +m[3])],
  [/^\/day\/(\d+)\/(writing|application)\/(\d+)$/, (m) => writeView(+m[1], m[2], +m[3])],
  [/^\/day\/(\d+)\/speaking\/(\d+)$/, (m) => speakView(+m[1], +m[2])],
  [/^\/day\/(\d+)\/vocab$/, (m) => vocabView(+m[1])],
  [/^\/day\/(\d+)\/review$/, (m) => spacedView(+m[1])],
  [/^\/errors$/, () => errorsView()],
  [/^\/progress$/, () => progressView()],
  [/^\/archive(?:\/(\d+))?$/, (m) => archiveView(m[1] ? +m[1] : null)],
  [/^\/route$/, () => routeView()],
  [/^\/guide$/, () => guideView()]
];

// [id, href, active on, shown in the compact tab bar]: the tab bar keeps five destinations (HIG); the guide is in settings there.
const NAV = [
  ['today', () => `#/day/${store.S.day}`, /^\/day\//, true],
  ['route', () => '#/route', /^\/route/, true],
  ['review', () => '#/errors', /^\/errors/, true],
  ['progress', () => '#/progress', /^\/progress/, true],
  ['archive', () => '#/archive', /^\/archive/, true],
  ['guide', () => '#/guide', /^\/guide/, false]
];

let current = null, currentPath = null, renderToken = 0, switching = null;

// Routes carry the level: #/b2/day/3. A path without one (an in-app link, an old bookmark) stays in the current level.
const LEVEL_RE = /^\/(b1|b2|c1)(?=\/|$)/;
const byCode = (code) => LEVELS.find((l) => l.level.toLowerCase() === code);
const prefix = () => '/' + currentLevel().level.toLowerCase();

/** Opens a course: its material (in the interface language) and the learner's records in it. */
async function openCourse(id) {
  useCourse(id);
  await Promise.all([loadCourse(id), bootstrap()]);
  setLabels(getCourse().labels);
}

/**
 * Switches the interface language: the course material is reloaded in it (its
 * translation laid over the French) and the page redrawn. The records are not
 * touched — they are the same in every language.
 */
async function changeLocale(id, { persist = true } = {}) {
  if (id === getLocale()) return;
  if (!store.S) { chooseLocale(id); return; } // before sign-in: saved once signed in
  setLocale(id);
  if (persist) save({ locale: id }).then((ok) => { if (!ok) settingsNotice(t('settings.saveFailed')); });
  await loadCourse(currentLevel().id);
  setLabels(getCourse().labels);
  const sheetOpen = Boolean(app.querySelector('[data-sheet] .sheet'));
  if (current && current.unmount) current.unmount();
  current = null; currentPath = null;
  shell();
  await route();
  if (sheetOpen) { opener = app.querySelector('.avatar'); accountSheet(); }
}

/** The course to open at sign-in: the level in the address, else the one studied last, else B1. */
async function firstCourse() {
  const path = (location.hash || '').replace(/^#/, ''), m = LEVEL_RE.exec(path);
  if (m && byCode(m[1]).root) return byCode(m[1]).id;
  if (path && path !== '/') return 'delf-b1';
  const r = await call('GET', '/courses');
  const last = r.enrolled.find((e) => levelOf(e.course) && levelOf(e.course).root);
  return last ? last.course : 'delf-b1';
}

/** Switches level once every change of the current one is saved (while saving fails, the level stays). */
function switchCourse(id) {
  if (!switching) switching = (async () => {
    const root = app.querySelector('#view');
    await whenSaved();
    if (root) root.innerHTML = splash();
    if (current && current.unmount) current.unmount();
    current = null; currentPath = null;
    await openCourse(id);
    shell();
  })().finally(() => { switching = null; });
  return switching;
}

const status = (s) => (s ? t(`status.${s}`) : '');
const splash = () => `<div class="splash" aria-busy="true" aria-label="${t('splash.loading')}"><span class="brand-mark big">D50</span></div>`;

function shell() {
  app.innerHTML = String(html`
    <a class="skip" href="#view">${t('shell.skip')}</a>
    <header class="topbar">
      <a class="brand" href="#${prefix()}/day/${store.S.day}" aria-label="${t('shell.home')}"><span class="brand-mark">D50</span><span class="brand-word">DELF<span>50</span></span></a>
      <nav class="lvl-switch" aria-label="${t('shell.levels')}">${LEVELS.map((l) => (l.root
        ? html`<a href="#/${l.level.toLowerCase()}" class="${l.id === currentLevel().id ? 'on' : ''}" ${l.id === currentLevel().id ? 'aria-current="true"' : ''}>${l.level}</a>`
        : html`<span class="soon" title="${t('shell.soonTitle', { level: l.level })}" aria-disabled="true">${l.level}<small>${t('shell.soon')}</small></span>`))}</nav>
      <div class="topbar-end">
        <span class="sync" data-sync aria-live="polite"></span>
        <button class="avatar" type="button" data-act="account" aria-label="${t('shell.account')}" aria-haspopup="dialog">${(store.user.name || store.user.email || '?').slice(0, 1).toUpperCase()}</button>
      </div>
    </header>
    <nav class="nav" aria-label="${t('nav.main')}">
      ${NAV.map(([id, , , compact]) => html`<a class="nav-item ${compact ? '' : 'wide-only'}" data-nav="${id}" href="#">${icon(id)}<span>${t(`nav.${id}`)}</span></a>`)}
    </nav>
    <main id="view" class="view" tabindex="-1"></main>
    <div class="sheet-host" data-sheet></div>`);
  syncChip(store.status);
}

function syncChip(s) {
  const el = app.querySelector('[data-sync]');
  if (el) el.innerHTML = String(html`<i class="dot ${s}"></i><span>${status(s)}</span>`);
}

function navState(path) {
  for (const [id, href, re] of NAV) {
    const a = app.querySelector(`[data-nav="${id}"]`);
    if (!a) continue;
    a.href = '#' + prefix() + href().slice(1);
    a.classList.toggle('on', re.test(path));
    if (re.test(path)) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
}

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Continuity across repaints of the same page: an element marked data-key
 * whose data-state changed is marked `fresh` (only fresh elements animate, so
 * a repaint never replays old feedback), and a changed --f (a progress value)
 * glides from its old value.
 */
function snapshot(root) {
  const m = new Map();
  for (const el of root.querySelectorAll('[data-key]')) m.set(el.dataset.key, { state: el.dataset.state, f: el.style.getPropertyValue('--f') });
  return m;
}
function settle(root, before) {
  if (reduceMotion.matches) return;
  const glide = [];
  for (const el of root.querySelectorAll('[data-key]')) {
    const o = before.get(el.dataset.key);
    if (!o) continue;
    if (o.state !== el.dataset.state) el.classList.add('fresh');
    const f = el.style.getPropertyValue('--f');
    if (o.f !== '' && f !== '' && o.f !== f) { el.style.setProperty('--f', o.f); glide.push([el, f]); }
  }
  if (glide.length) { void root.offsetWidth; requestAnimationFrame(() => glide.forEach(([el, f]) => el.style.setProperty('--f', f))); }
}

function paint(view, keepScroll) {
  const root = app.querySelector('#view');
  if (!root) return; // the sign-in form is showing
  const y = scrollY, before = keepScroll ? snapshot(root) : null;
  root.innerHTML = String(view.render());
  if (before) settle(root, before);
  if (view.mount) view.mount(root);
  if (keepScroll) scrollTo(0, y);
}

async function route() {
  if (!app.querySelector('#view')) return;
  let path = (location.hash || '').replace(/^#/, '');
  const lv = LEVEL_RE.exec(path);
  if (lv) {
    path = path.slice(lv[0].length);
    const target = byCode(lv[1]);
    if (!target.root) { location.hash = `#${prefix()}/day/${store.S.day}`; return; }
    if (target.id !== currentLevel().id) {
      const from = currentLevel();
      try { await switchCourse(target.id); } catch (e) {
        // Unsaved work keeps the learner in the current level; a level that fails to load shows the error.
        if (currentLevel() === from && currentPath) { history.replaceState(null, '', `#${prefix()}${currentPath}`); return; }
        const v = errorView(e); current = v; currentPath = null; paint(v); return;
      }
    }
  }
  if (!path || path === '/') path = `/day/${store.S.day}`;
  if (location.hash !== `#${prefix()}${path}`) history.replaceState(null, '', `#${prefix()}${path}`);
  const hit = ROUTES.map(([re, make]) => [re.exec(path), make]).find(([m]) => m);
  if (!hit) { location.hash = `#${prefix()}/day/${store.S.day}`; return; }
  const token = ++renderToken;
  const dayParam = /^\/day\/(\d+)/.exec(path);
  if (dayParam && +dayParam[1] !== store.S.day && +dayParam[1] >= 1 && +dayParam[1] <= getCourse().days) commit((S) => setDay(S, +dayParam[1]), { quiet: true });
  let view;
  try { view = await hit[1](hit[0]); } catch (e) { view = errorView(e); }
  if (token !== renderToken) return;
  if (current && current.unmount) current.unmount();
  const samePage = currentPath === path;
  current = view; currentPath = path;
  document.title = view.title ? `${view.title} · DELF50` : 'DELF50';
  navState(path);
  const swap = () => { paint(view, samePage); if (!samePage) { scrollTo(0, 0); app.querySelector('#view').focus({ preventScroll: true }); } };
  // A new page cross-fades in where the browser can (View Transitions); the same page repaints in place.
  if (!samePage && document.startViewTransition && !reduceMotion.matches && document.visibilityState === 'visible') document.startViewTransition(swap);
  else swap();
}

function errorView(e) {
  return { title: t('error.title'), render: () => html`<section class="page narrow"><p class="eyebrow">Erreur</p><h1 class="display-s">${t('error.heading')}</h1><p class="lead">${errorText(e)}</p><button class="btn" data-act="reload">${t('error.reload')}</button></section>`, actions: { reload: () => location.reload() } };
}

// ── events: one delegated listener for every view ──
function delegate() {
  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !app.contains(el)) return;
    const act = el.dataset.act;
    if (act === 'account') { e.preventDefault(); return accountSheet(); }
    if (act === 'close-sheet') { e.preventDefault(); return closeSheet(); }
    const fn = current && current.actions && current.actions[act];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  app.addEventListener('input', (e) => {
    const el = e.target.closest('[data-input]');
    const fn = el && current && current.inputs && current.inputs[el.dataset.input];
    if (fn) fn(el, e);
  });
  app.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    const fn = el && current && current.changes && current.changes[el.dataset.change];
    if (fn) fn(el, e);
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheet();
    if (e.key === 'Tab' && trapFocus(e)) return;
    if (app.querySelector('[data-sheet] .sheet')) return; // a dialog is open: the page's shortcuts wait
    if (current && current.keys && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) current.keys(e);
  });
}

// ── account and settings (a modal sheet: focus moves in, stays in, and returns) ──
let opener = null;
function closeSheet() {
  const h = app.querySelector('[data-sheet]');
  if (!h || !h.firstElementChild) return;
  h.innerHTML = '';
  speech.stop();
  if (opener && document.contains(opener)) opener.focus();
  opener = null;
}
function trapFocus(e) {
  const sheet = app.querySelector('[data-sheet] .sheet');
  if (!sheet) return false;
  const f = [...sheet.querySelectorAll('button:not(:disabled), select, [href], input, [tabindex]:not([tabindex="-1"])')];
  if (!f.length) return false;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); return true; }
  if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); return true; }
  if (!sheet.contains(document.activeElement)) { e.preventDefault(); first.focus(); return true; }
  return false;
}
function settingsNotice(text) {
  const n = app.querySelector('[data-settings-notice]');
  if (n) { n.textContent = text; n.hidden = !text; }
}

function voicePicker() {
  if (!speech.supported) return html`<p class="muted small">${t('player.unsupported')}</p>`;
  const vs = speech.frenchVoices();
  if (!vs.length) return html`<p class="muted small">${t('settings.voiceNone')}</p>`;
  return html`<div class="voice-row">
      <select data-voice aria-label="${t('settings.voice')}">
        <option value="" ${prefs.voice ? '' : 'selected'}>${t('settings.voiceAuto')}</option>
        ${vs.map((v) => html`<option value="${v.uri}" ${prefs.voice === v.uri ? 'selected' : ''}>${v.name} · ${v.lang}${v.quality === 'high' ? ` · ${t('settings.voiceQuality')}` : ''}</option>`)}
      </select>
      <button class="btn ghost small" type="button" data-preview>${icon('play')} ${t('settings.voicePreview')}</button>
    </div>
    <p class="muted small">${t('settings.voiceNote')}</p>`;
}

function accountSheet() {
  const h = app.querySelector('[data-sheet]');
  if (!opener) opener = document.activeElement;
  const seg = (name, options, value) => html`<div class="seg" role="radiogroup" aria-label="${name}">${options.map(([v, label, lang]) =>
    html`<button type="button" role="radio" aria-checked="${v === value}" class="${v === value ? 'on' : ''}" data-v="${v}" ${lang ? html`lang="${lang}"` : ''}>${label}</button>`)}</div>`;
  h.innerHTML = String(html`
    <div class="sheet-backdrop" data-act="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="acct-title">
      <p class="eyebrow">Compte · Réglages</p>
      <h2 id="acct-title" class="display-xs" tabindex="-1">${store.user.name || t('account.learner')}</h2>
      <dl class="kv">
        <dt>${t('account.email')}</dt><dd>${store.user.email}</dd>
        <dt>${t('account.course')}</dt><dd>${getCourse().title}</dd>
        <dt>${t('account.save')}</dt><dd>${status(store.status)}${store.savedAt ? ` · ${fmtDateTime(store.savedAt.toISOString())}` : ''}</dd>
        <dt>${t('account.started')}</dt><dd>${store.S.startedAt ? fmtDateTime(store.S.startedAt) : t('account.notStarted')}</dd>
      </dl>
      ${store.status === 'error' && store.error ? html`<p class="notice bad">${errorText(store.error)}</p>` : ''}
      <section class="settings">
        <div class="setting" data-setting="locale"><p class="label">${t('settings.language')}</p>
          ${seg(t('settings.language'), LOCALES.map((l) => [l.id, l.name, l.id]), getLocale())}
          <p class="muted small">${t('settings.languageNote')}</p></div>
        <div class="setting" data-setting="theme"><p class="label">${t('settings.appearance')}</p>
          ${seg(t('settings.appearance'), THEMES.map((k) => [k, t(`settings.theme.${k}`)]), prefs.theme)}</div>
        <div class="setting"><p class="label">${t('settings.voice')}</p><div data-voices>${voicePicker()}</div></div>
        <p class="notice bad" data-settings-notice hidden></p>
      </section>
      <a class="sheet-link wide-hidden" href="#${prefix()}/guide" data-guide>${icon('guide')}<span>${t('guide.title')}</span>${icon('right')}</a>
      <div class="row gap">
        <button class="btn ghost" data-act="close-sheet">${t('account.close')}</button>
        <button class="btn" data-signout>${t('account.signOut')}</button>
      </div>
    </div>`);
  const sheet = h.querySelector('.sheet');
  sheet.querySelector('#acct-title').focus();
  sheet.querySelector('[data-setting="locale"]').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) changeLocale(b.dataset.v); });
  sheet.querySelector('[data-setting="theme"]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b || b.dataset.v === prefs.theme) return;
    save({ theme: b.dataset.v }).then((ok) => { if (!ok) settingsNotice(t('settings.saveFailed')); });
    b.parentElement.querySelectorAll('[data-v]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
  });
  const wireVoices = () => {
    const sel = sheet.querySelector('[data-voice]'), pre = sheet.querySelector('[data-preview]');
    if (sel) sel.addEventListener('change', () => {
      speech.configure({ voice: sel.value || null });
      save({ voice: sel.value || null }).then((ok) => { if (!ok) settingsNotice(t('settings.saveFailed')); });
      speech.preview(sel.value, t('settings.voiceSample'));
    });
    if (pre) pre.addEventListener('click', () => speech.preview(sel ? sel.value : '', t('settings.voiceSample')));
  };
  wireVoices();
  sheet.querySelector('[data-guide]').addEventListener('click', () => { opener = null; closeSheet(); });
  // Chrome lists its voices a moment after the page loads.
  const off = speech.onVoices(() => { const box = sheet.querySelector('[data-voices]'); if (!document.contains(sheet)) { off(); return; } box.innerHTML = String(voicePicker()); wireVoices(); });
  h.querySelector('[data-signout]').addEventListener('click', async (e) => {
    e.target.disabled = true;
    flush();
    try { await call('POST', '/auth/sign-out', {}); } catch (x) { /* signed out either way */ }
    location.reload();
  });
}

// ── sign-in gate ──
function authScreen(message, mode = 'login', resume = false) {
  const reg = mode === 'register';
  const typed = Object.fromEntries([...app.querySelectorAll('.auth form input')].map((i) => [i.name, i.value]));
  app.innerHTML = String(html`
    <div class="auth">
      <div class="auth-lang seg" role="radiogroup" aria-label="${t('auth.language')}">${LOCALES.map((l) => html`<button type="button" role="radio" lang="${l.id}" aria-checked="${l.id === getLocale()}" class="${l.id === getLocale() ? 'on' : ''}" data-locale="${l.id}">${l.name}</button>`)}</div>
      <section class="auth-art" aria-hidden="true">
        <p class="eyebrow light">DELF B1 · B2 · 50 jours</p>
        <p class="auth-quote"><em>Cinquante jours</em><br>pour parler, lire,<br>écouter et écrire<br>au niveau visé.</p>
        ${matisse(50)}
      </section>
      <section class="auth-panel">
        <div class="auth-box">
          <span class="brand-mark big">D50</span>
          <h1 class="display-s">${reg ? t('auth.create') : t('auth.welcome')}</h1>
          <p class="lead">${reg ? t('auth.leadRegister') : t('auth.leadLogin')}</p>
          <div class="seg" role="tablist" aria-label="${t('auth.mode')}">
            <button type="button" role="tab" aria-selected="${!reg}" class="${reg ? '' : 'on'}" data-mode="login">${t('auth.login')}</button>
            <button type="button" role="tab" aria-selected="${reg}" class="${reg ? 'on' : ''}" data-mode="register">${t('auth.register')}</button>
          </div>
          <form class="form" novalidate>
            ${reg ? html`<label class="field"><span>${t('auth.name')}</span><input name="name" maxlength="60" autocomplete="nickname" placeholder="${t('auth.namePh')}" value="${typed.name || ''}"></label>` : ''}
            <label class="field"><span>${t('auth.email')}</span><input name="email" type="email" autocomplete="username" required placeholder="you@example.com" value="${typed.email || ''}"></label>
            <label class="field"><span>${t('auth.password')}${reg ? t('auth.passwordMin') : ''}</span><input name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required minlength="8"></label>
            ${message ? html`<p class="notice bad" role="alert">${message}</p>` : ''}
            <button class="btn wide" type="submit">${reg ? t('auth.submitRegister') : t('auth.submitLogin')}</button>
          </form>
        </div>
      </section>
    </div>`);
  app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => authScreen('', b.dataset.mode, resume)));
  app.querySelectorAll('[data-locale]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.locale === getLocale()) return;
    chooseLocale(b.dataset.locale);
    authScreen('', mode, resume);
    const again = app.querySelector(`[data-locale="${b.dataset.locale}"]`);
    if (again) again.focus();
  }));
  const form = app.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form).entries());
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = t('auth.wait');
    const body = { email: String(f.email || '').trim(), password: String(f.password || '') };
    if (reg) body.name = String(f.name || '').trim() || body.email.split('@')[0];
    try {
      await call('POST', `/auth/${reg ? 'sign-up/email' : 'sign-in/email'}`, body);
      // The same learner again (an expired session): keep the unsaved work and save it now.
      if (resume && store.user && store.user.email === body.email) { shell(); route(); flush(); return; }
      await start();
    } catch (err) { authScreen(errorText(err), mode, resume); }
  });
  const first = app.querySelector('.auth form input');
  if (first && !app.querySelector('.auth-lang :focus')) first.focus();
}

function fatal(e) {
  app.innerHTML = String(html`<div class="fatal"><p class="eyebrow">Connexion</p><h1 class="display-s">${t('fatal.heading')}</h1><p class="lead">${t('fatal.lead')}</p><p class="notice bad">${errorText(e)}</p><button class="btn" data-retry>${t('fatal.retry')}</button></div>`);
  app.querySelector('[data-retry]').addEventListener('click', () => start());
}

async function start() {
  app.innerHTML = splash();
  try {
    // The language decides which translation of the material loads, so the settings come first (with the course choice).
    const [settings, id] = await Promise.all([loadSettings(), firstCourse()]);
    resolveLocale(settings);
    speech.configure({ voice: prefs.voice, rate: prefs.rate });
    await openCourse(id);
  } catch (e) {
    if (e.status === 401) return authScreen();
    return fatal(e);
  }
  shell();
  route();
}

let started = false;
onStatus((s) => syncChip(s));
onChange(() => { if (current && store.S) { paint(current, true); navState(currentPath); } });
onAuthRequired(() => authScreen(t('auth.expired'), 'login', true));
// The listening speed follows the learner to every device.
let rateTimer = 0;
speech.onSpeech((x) => { if (store.S && x.rate !== prefs.rate) { clearTimeout(rateTimer); rateTimer = setTimeout(() => save({ rate: x.rate }), 800); } });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
addEventListener('hashchange', () => { if (store.S) route(); });
if (!started) { started = true; applyDocument(); delegate(); start(); }
