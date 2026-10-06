/**
 * The learner's state and its live saving.
 *
 * The state is loaded from the server before anything renders. Every change is
 * diffed against the last server-confirmed state and sent as fine-grained
 * changes within 60–300 ms, one request in flight; a failed request is retried
 * with backoff, and a replayed batch keeps the server revision (batch id = hash
 * of the changes). Nothing is kept in browser storage.
 */
import { call } from './api.js';
import { diff, hash } from './sync-core.js';
import { normalize } from './state.js';

const DEBOUNCE_MS = 60, MAX_WAIT_MS = 300;
const clone = (v) => JSON.parse(JSON.stringify(v));

export const store = { S: null, user: null, status: 'loading', savedAt: null, error: null };

let acked = {}, at = { pos: {}, keys: {} }, spec = [], rev = 0;
let dirty = false, inflight = false, timer = 0, dirtySince = 0, failures = 0, retryTimer = 0, uploads = 0;
const latency = [];
const changeListeners = new Set(), statusListeners = new Set(), authListeners = new Set();

export const onChange = (fn) => changeListeners.add(fn);
export const onStatus = (fn) => statusListeners.add(fn);
export const onAuthRequired = (fn) => authListeners.add(fn);

function setStatus(s) {
  store.status = s;
  statusListeners.forEach((fn) => fn(s));
}
const settledStatus = () => (failures ? 'error' : dirty || inflight || uploads ? 'saving' : 'saved');

/** Loads the account's state. Throws the API error (401 when signed out). */
export async function bootstrap() {
  const b = await call('GET', '/bootstrap');
  store.user = b.user;
  spec = b.collections;
  rev = b.rev;
  at = { pos: b.positions || {}, keys: b.keys || {} };
  acked = b.state ? clone(b.state) : {};
  store.S = normalize(b.state);
  failures = 0;
  setStatus('saved');
  schedule(); // anything the server holds in another shape (or under other keys) is written back in this one
  return store;
}

/** Applies a change to the state and saves it; re-renders unless `quiet` (e.g. a draft being typed). */
export function commit(fn, { quiet = false } = {}) {
  const out = fn(store.S);
  if (!quiet) changeListeners.forEach((l) => l());
  schedule();
  return out;
}

/** Re-renders the current view without changing the state (view-only toggles). */
export const refresh = () => changeListeners.forEach((l) => l());

function schedule() {
  dirty = true;
  if (!dirtySince) dirtySince = Date.now();
  clearTimeout(timer);
  timer = setTimeout(flush, Math.max(0, Math.min(DEBOUNCE_MS, MAX_WAIT_MS - (Date.now() - dirtySince))));
}

function batch(snapshot) {
  const d = diff(acked, at, snapshot, spec);
  return { d, body: { doc: d.doc, ops: d.ops, device: 'web', batch: hash(JSON.stringify([d.doc, d.ops])) } };
}

export function flush() {
  clearTimeout(timer);
  if (inflight || !dirty || !store.S) return;
  const snapshot = clone(store.S), since = dirtySince || Date.now(), t0 = Date.now();
  dirty = false; dirtySince = 0;
  const { d, body } = batch(snapshot);
  if (d.empty) { acked = snapshot; at = { pos: d.pos, keys: d.keys }; setStatus(settledStatus()); return; }
  inflight = true;
  setStatus('saving');
  call('POST', '/sync', body).then((r) => {
    acked = snapshot; at = { pos: d.pos, keys: d.keys }; rev = r.rev;
    failures = 0; store.error = null; store.savedAt = new Date();
    latency.push([Date.now() - since, Date.now() - t0]); if (latency.length > 50) latency.shift();
  }, (e) => {
    dirty = true; failures++; store.error = e;
    if (e.status === 401) authListeners.forEach((fn) => fn(e));
  }).finally(() => {
    inflight = false;
    if (failures) {
      setStatus('error');
      clearTimeout(retryTimer);
      if (store.error && store.error.status !== 401) retryTimer = setTimeout(flush, Math.min(15000, 500 * 2 ** failures));
    } else if (dirty) flush();
    else setStatus(settledStatus());
  });
}

/** Recordings being uploaded count as unsaved work. */
export function trackUpload(promise) {
  uploads++; setStatus('saving');
  return promise.finally(() => { uploads--; setStatus(settledStatus()); });
}

const hasUnsaved = () => dirty || inflight || uploads > 0;

// Last chance when the page goes away: the same batch, with keepalive (idempotent).
addEventListener('pagehide', () => {
  if (!store.S || !(dirty || inflight)) return;
  try { call('POST', '/sync', batch(clone(store.S)).body, { keepalive: true }).catch(() => {}); } catch (e) { /* too large for keepalive */ }
});
addEventListener('beforeunload', (e) => { if (hasUnsaved()) { e.preventDefault(); e.returnValue = ''; } });

// Another device may have saved meanwhile: reload the state when the page comes back.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { flush(); return; }
  if (!store.S || hasUnsaved()) return;
  call('GET', '/rev').then((r) => {
    if (r.rev === rev || hasUnsaved()) return;
    bootstrap().then(refresh, () => {});
  }, () => {});
});

/** For tests and support: the saving state at a glance. */
window.__delf50 = { saving: () => ({ status: store.status, rev, pending: dirty, inflight, uploads, failures, latency: latency.slice() }), flush };
