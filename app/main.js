/** DELF50 · app shell: sign-in gate, routing, navigation and rendering. */
import { call, errorText } from './api.js';
import { store, bootstrap, commit, onChange, onStatus, onAuthRequired, flush } from './store.js';
import { loadCourse } from './course.js';
import { setDay } from './state.js';
import { html, raw, icon, esc, fmtDateTime, matisse } from './ui.js';
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

const NAV = [
  ['today', '今日', () => `#/day/${store.S.day}`, /^\/day\//],
  ['route', '路线', () => '#/route', /^\/route/],
  ['review', '错题', () => '#/errors', /^\/errors/],
  ['progress', '进度', () => '#/progress', /^\/progress/],
  ['archive', '档案', () => '#/archive', /^\/archive/],
  ['guide', '指南', () => '#/guide', /^\/guide/]
];

let current = null, currentPath = null, renderToken = 0;

const STATUS = { loading: '载入中', saving: '保存中', saved: '已保存', error: '保存失败 · 自动重试' };

function shell() {
  app.innerHTML = String(html`
    <a class="skip" href="#view">跳到内容</a>
    <header class="topbar">
      <a class="brand" href="#/day/${store.S.day}" aria-label="DELF50 首页"><span class="brand-mark">D50</span><span class="brand-word">DELF<span>50</span></span></a>
      <div class="topbar-end">
        <span class="sync" data-sync aria-live="polite"></span>
        <button class="avatar" type="button" data-act="account" aria-label="账号">${(store.user.name || store.user.email || '?').slice(0, 1).toUpperCase()}</button>
      </div>
    </header>
    <nav class="nav" aria-label="主导航">
      ${NAV.map(([id, label]) => html`<a class="nav-item" data-nav="${id}" href="#">${icon(id)}<span>${label}</span></a>`)}
    </nav>
    <main id="view" class="view" tabindex="-1"></main>
    <div class="sheet-host" data-sheet></div>`);
  syncChip(store.status);
}

function syncChip(s) {
  const el = app.querySelector('[data-sync]');
  if (el) el.innerHTML = String(html`<i class="dot ${s}"></i><span>${STATUS[s] || ''}</span>`);
}

function navState(path) {
  for (const [id, , href, re] of NAV) {
    const a = app.querySelector(`[data-nav="${id}"]`);
    if (!a) continue;
    a.href = href();
    a.classList.toggle('on', re.test(path));
    if (re.test(path)) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
}

function paint(view, keepScroll) {
  const root = app.querySelector('#view');
  if (!root) return; // the sign-in form is showing
  const y = scrollY;
  root.innerHTML = String(view.render());
  if (view.mount) view.mount(root);
  if (keepScroll) scrollTo(0, y);
}

async function route() {
  if (!app.querySelector('#view')) return;
  const path = (location.hash || '').replace(/^#/, '') || `/day/${store.S.day}`;
  if (!location.hash) { history.replaceState(null, '', `#${path}`); }
  const hit = ROUTES.map(([re, make]) => [re.exec(path), make]).find(([m]) => m);
  if (!hit) { location.hash = `#/day/${store.S.day}`; return; }
  const token = ++renderToken;
  const dayParam = /^\/day\/(\d+)/.exec(path);
  if (dayParam && +dayParam[1] !== store.S.day && +dayParam[1] >= 1 && +dayParam[1] <= 50) commit((S) => setDay(S, +dayParam[1]), { quiet: true });
  let view;
  try { view = await hit[1](hit[0]); } catch (e) { view = errorView(e); }
  if (token !== renderToken) return;
  if (current && current.unmount) current.unmount();
  const samePage = currentPath === path;
  current = view; currentPath = path;
  document.title = view.title ? `${view.title} · DELF50` : 'DELF50';
  navState(path);
  const swap = () => { paint(view, samePage); if (!samePage) { scrollTo(0, 0); app.querySelector('#view').focus({ preventScroll: true }); } };
  swap();
}

function errorView(e) {
  return { title: '出错了', render: () => html`<section class="page narrow"><p class="eyebrow">Erreur</p><h1 class="display-s">页面暂时无法载入</h1><p class="lead">${errorText(e)}</p><button class="btn" data-act="reload">重新载入</button></section>`, actions: { reload: () => location.reload() } };
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
    if (current && current.keys && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) current.keys(e);
  });
}

// ── account ──
function closeSheet() { const h = app.querySelector('[data-sheet]'); if (h) h.innerHTML = ''; }
function accountSheet() {
  const h = app.querySelector('[data-sheet]');
  h.innerHTML = String(html`
    <div class="sheet-backdrop" data-act="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="acct-title">
      <p class="eyebrow">Compte</p>
      <h2 id="acct-title" class="display-xs">${store.user.name || '学习者'}</h2>
      <dl class="kv">
        <dt>邮箱</dt><dd>${store.user.email}</dd>
        <dt>保存</dt><dd>${STATUS[store.status] || ''}${store.savedAt ? ` · ${fmtDateTime(store.savedAt.toISOString())}` : ''}</dd>
        <dt>开始学习</dt><dd>${store.S.startedAt ? fmtDateTime(store.S.startedAt) : '尚未开始'}</dd>
      </dl>
      ${store.status === 'error' && store.error ? html`<p class="notice bad">${errorText(store.error)}</p>` : ''}
      <div class="row gap">
        <button class="btn ghost" data-act="close-sheet">关闭</button>
        <button class="btn" data-signout>退出登录</button>
      </div>
    </div>`);
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
  app.innerHTML = String(html`
    <div class="auth">
      <section class="auth-art" aria-hidden="true">
        <p class="eyebrow light">DELF B1 · 50 jours</p>
        <p class="auth-quote"><em>Cinquante jours</em><br>pour parler, lire,<br>écouter et écrire<br>au niveau B1.</p>
        ${matisse(50)}
      </section>
      <section class="auth-panel">
        <div class="auth-box">
          <span class="brand-mark big">D50</span>
          <h1 class="display-s">${reg ? '创建账号' : '欢迎回来'}</h1>
          <p class="lead">${reg ? '注册后即可开始 50 天 B1 冲刺。所有作答、写作和录音都实时保存在你的账号中，换设备登录即可继续。' : '登录后继续你的 50 天 B1 冲刺。'}</p>
          <div class="seg" role="tablist">
            <button type="button" role="tab" aria-selected="${!reg}" class="${reg ? '' : 'on'}" data-mode="login">登录</button>
            <button type="button" role="tab" aria-selected="${reg}" class="${reg ? 'on' : ''}" data-mode="register">注册</button>
          </div>
          <form class="form" novalidate>
            ${reg ? html`<label class="field"><span>昵称</span><input name="name" maxlength="60" autocomplete="nickname" placeholder="怎么称呼你"></label>` : ''}
            <label class="field"><span>邮箱</span><input name="email" type="email" autocomplete="username" required placeholder="you@example.com"></label>
            <label class="field"><span>密码${reg ? '（至少 8 位）' : ''}</span><input name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required minlength="8"></label>
            ${message ? html`<p class="notice bad" role="alert">${message}</p>` : ''}
            <button class="btn wide" type="submit">${reg ? '注册并开始学习' : '登录'}</button>
          </form>
        </div>
      </section>
    </div>`);
  app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => authScreen('', b.dataset.mode, resume)));
  const form = app.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form).entries());
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = '请稍候…';
    const body = { email: String(f.email || '').trim(), password: String(f.password || '') };
    if (reg) body.name = String(f.name || '').trim() || body.email.split('@')[0];
    try {
      await call('POST', `/auth/${reg ? 'sign-up/email' : 'sign-in/email'}`, body);
      // The same learner again (an expired session): keep the unsaved work and save it now.
      if (resume && store.user && store.user.email === body.email) { shell(); route(); flush(); return; }
      await start();
    } catch (err) { authScreen(errorText(err), mode, resume); }
  });
  const first = app.querySelector('input');
  if (first) first.focus();
}

function fatal(e) {
  app.innerHTML = String(html`<div class="fatal"><p class="eyebrow">Connexion</p><h1 class="display-s">暂时无法载入学习记录</h1><p class="lead">为保证每条记录都保存到账号，载入成功后才会开始学习。</p><p class="notice bad">${errorText(e)}</p><button class="btn" data-retry>重试</button></div>`);
  app.querySelector('[data-retry]').addEventListener('click', () => start());
}

async function start() {
  app.innerHTML = '<div class="splash" aria-busy="true"><span class="brand-mark big">D50</span></div>';
  try {
    await Promise.all([loadCourse(), bootstrap()]);
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
onAuthRequired(() => authScreen('登录已过期，请重新登录；未保存的内容会在登录后自动保存。', 'login', true));
addEventListener('hashchange', () => { if (store.S) route(); });
if (!started) { started = true; delegate(); start(); }
