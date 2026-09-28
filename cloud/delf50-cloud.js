/*!
 * DELF50 Cloud · account + automatic learning-record sync.
 *
 * A self-contained layer loaded by index.html before the app bundle. It does not
 * call into or change any app code. It observes the app's own persistence:
 *
 *   localStorage['delf50_v12_state']   the whole learning state (Schema 2)
 *   IndexedDB 'delf50_audio_v1'.clips  speaking recordings
 *
 * and mirrors them to the account in Neon (state) and Cloudflare R2 (audio).
 *
 * Guarantees
 *  - Local-first: the app keeps reading and writing localStorage exactly as
 *    before. Signed out, offline or with the API down, nothing changes for it.
 *  - Exact: the document is synced as the exact text the app wrote; both ends
 *    verify its SHA-256, so what one device pushes is byte-identical on the next.
 *  - No silent loss: a push is a compare-and-swap on the server revision. When
 *    two devices diverge, the three-way merge below keeps every answer, record,
 *    draft and counter increment from both sides; a local copy that is replaced
 *    is archived on the server first; every head revision is kept in history.
 *  - Remote state reaches the app only through localStorage before the app
 *    boots (the bundle download waits for the first pull, max GATE_MS) or via a
 *    page reload at a safe moment, so the app always starts from a document it
 *    wrote itself and runs its own migrations on it.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (W) {
  'use strict';

  // ───────────────────────── pure core (also used by tests) ─────────────────

  var MISSING = { missing: true };
  var hasOwn = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var isPlain = function (v) { return v !== null && typeof v === 'object' && !Array.isArray(v); };
  var ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

  /** Keys whose numeric values are event counters: concurrent increments add up. */
  var COUNTER_KEYS = new Set(['attempts', 'correct', 'count', 'totalSec', 'a', 'c', 'grammar', 'grammarProd',
    'application', 'listening', 'reading', 'writing', 'speaking', 'vocab', 'review', 'actions']);

  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
      return true;
    }
    if (Array.isArray(b)) return false;
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var j = 0; j < ka.length; j++) if (!hasOwn(b, ka[j]) || !deepEqual(a[ka[j]], b[ka[j]])) return false;
    return true;
  }

  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (isPlain(v)) return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }

  function countSigs(arr) {
    var m = new Map();
    for (var i = 0; i < arr.length; i++) { var s = stable(arr[i]); m.set(s, (m.get(s) || 0) + 1); }
    return m;
  }

  /**
   * Multiset three-way merge. Per distinct item: removals by either side are
   * applied once, additions by both sides are de-duplicated (the same record on
   * both sides is the same event). Order follows `ours`, then items only
   * `theirs` has; arrays of timestamped records are kept in their time order.
   */
  function mergeArray(b, o, t) {
    var cb = countSigs(b), co = countSigs(o), ct = countSigs(t);
    var target = new Map();
    var sigs = new Set([].concat(Array.from(cb.keys()), Array.from(co.keys()), Array.from(ct.keys())));
    sigs.forEach(function (s) {
      var nb = cb.get(s) || 0, no = co.get(s) || 0, nt = ct.get(s) || 0;
      var n = nb - Math.max(0, nb - no, nb - nt) + Math.max(0, no - nb, nt - nb);
      target.set(s, n);
    });
    var out = [];
    var emitted = new Map();
    function take(x) {
      var s = stable(x);
      var e = emitted.get(s) || 0;
      if (e < (target.get(s) || 0)) { out.push(x); emitted.set(s, e + 1); }
    }
    o.forEach(take);
    t.forEach(take);
    var timed = out.length > 1 && out.every(function (x) { return isPlain(x) && typeof x.at === 'string' && ISO_RE.test(x.at); });
    if (timed) {
      var asc = o.length < 2 || !(isPlain(o[0]) && isPlain(o[o.length - 1])) || String(o[0].at) <= String(o[o.length - 1].at);
      out = out.map(function (x, i) { return { x: x, i: i }; })
        .sort(function (p, q) { return p.x.at === q.x.at ? p.i - q.i : ((p.x.at < q.x.at) === asc ? -1 : 1); })
        .map(function (p) { return p.x; });
    }
    return out;
  }

  function mergeValue(b, o, t, key, ctx) {
    var hasBase = b !== MISSING;
    if (hasBase && deepEqual(b, o)) return t;
    if (hasBase && deepEqual(b, t)) return o;
    // Both sides changed. Identical changes are the same event, except for
    // counters: two devices each counting one answer from the same base are
    // two answers. So objects are walked even when equal, to reach counters.
    if (isPlain(o) && isPlain(t)) return !hasBase && deepEqual(o, t) ? o : mergeObject(isPlain(b) ? b : {}, o, t, ctx);
    if (typeof o === 'number' && typeof t === 'number' && COUNTER_KEYS.has(key)) {
      if (typeof b !== 'number') return o === t ? o : o + t;
      var sum = b + (o - b) + (t - b);
      return sum >= 0 ? sum : Math.max(o, t);
    }
    if (deepEqual(o, t)) return o;
    if (Array.isArray(o) && Array.isArray(t)) return mergeArray(Array.isArray(b) ? b : [], o, t);
    if (typeof o === 'string' && typeof t === 'string' && /At$/.test(key) && ISO_RE.test(o) && ISO_RE.test(t)) {
      if (/^(first|started|created)/i.test(key)) return o < t ? o : t;
      return o > t ? o : t;
    }
    return ctx.oursNewer ? o : t;
  }

  function mergeObject(b, o, t, ctx) {
    var out = {};
    var keys = Object.keys(o);
    Object.keys(t).forEach(function (k) { if (!hasOwn(o, k)) keys.push(k); });
    keys.forEach(function (k) {
      var inB = hasOwn(b, k), inO = hasOwn(o, k), inT = hasOwn(t, k);
      if (inO && inT) out[k] = mergeValue(inB ? b[k] : MISSING, o[k], t[k], k, ctx);
      else if (inO) { if (!(inB && deepEqual(b[k], o[k]))) out[k] = o[k]; }
      else if (!(inB && deepEqual(b[k], t[k]))) out[k] = t[k];
    });
    return out;
  }

  /**
   * Three-way merge of two learning states. `base` is the last state both
   * sides agreed on (undefined when there is none: two independent histories).
   * Scalars both sides changed differently resolve to the side saved last.
   */
  function merge3(base, ours, theirs) {
    var ctx = { oursNewer: String((ours && ours.lastSavedAt) || '') > String((theirs && theirs.lastSavedAt) || '') };
    return mergeValue(base === undefined ? MISSING : base, ours, theirs, '', ctx);
  }

  function merge3Text(baseText, oursText, theirsText) {
    var base = baseText == null ? undefined : JSON.parse(baseText);
    return JSON.stringify(merge3(base, JSON.parse(oursText), JSON.parse(theirsText)));
  }

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }

  /** Summary used to decide whether a local document holds real learning. */
  function summarize(S) {
    S = isPlain(S) ? S : {};
    var g = S.grammar || {}, r = S.reading || {}, l = S.listening || {};
    var w = S.writing || {}, a = S.application || {}, sp = S.speaking || {};
    var days = isPlain(S.dayHistory171) ? Object.keys(S.dayHistory171).length : 0;
    var drafts = 0;
    if (isPlain(S.drafts171)) Object.keys(S.drafts171).forEach(function (k) { if (isPlain(S.drafts171[k])) drafts += Object.keys(S.drafts171[k]).length; });
    var s = {
      grammar: num(g.attempts), reading: num(r.attempts), listening: num(l.attempts),
      writing: num(w.count), application: num(a.count), speaking: num(sp.count),
      errors: Array.isArray(S.errors) ? S.errors.length : 0, drafts: drafts, days: days,
      tasks: isPlain(S.taskDone) ? Object.keys(S.taskDone).filter(function (k) { return S.taskDone[k]; }).length : 0,
      startedAt: S.startedAt || null, lastSavedAt: S.lastSavedAt || null, selectedDay: S.selectedDay || 1
    };
    s.evidence = Boolean(s.startedAt) || s.grammar + s.reading + s.listening + s.writing + s.application + s.speaking + s.errors + s.drafts + s.tasks > 0;
    return s;
  }

  /**
   * The document minus bookkeeping the app rewrites on every start (timestamps,
   * version stamps, meta172). Two documents with the same semantic text hold
   * the same learning; only a semantic change is worth a push or a reload.
   * The exact text is still what gets synced.
   */
  function semanticText(text) {
    var v = typeof text === 'string' ? JSON.parse(text) : text;
    function strip(x) {
      if (Array.isArray(x)) return x.map(strip);
      if (!isPlain(x)) return x;
      var out = {};
      Object.keys(x).forEach(function (k) { if (k !== 'at' && !/At$/.test(k)) out[k] = strip(x[k]); });
      return out;
    }
    var s = strip(v);
    if (isPlain(s)) { delete s.version; delete s.meta172; }
    return stable(s);
  }

  var CORE = { semanticText: semanticText, merge3: merge3, merge3Text: merge3Text, mergeArray: mergeArray, deepEqual: deepEqual, stable: stable, summarize: summarize };

  if (!W || !W.document || !W.localStorage || W.__DELF50_CLOUD) return CORE;

  // ───────────────────────── browser layer ─────────────────────────────────

  var STATE_KEY = 'delf50_v12_state';
  var META_KEY = 'delf50_cloud_meta_v1';
  var DEVICE_KEY = 'delf50_cloud_device_v1';
  var INTRO_KEY = 'delf50_cloud_intro_v1';
  var RELOADS_KEY = 'delf50_cloud_reloads';
  var API = '/api/v1';
  var CLOUD_DB = 'delf50_cloud_v1';
  var AUDIO_DB = 'delf50_audio_v1';
  var GATE_MS = 8000;
  var PUSH_DEBOUNCE_MS = 2500;
  var PUSH_MAX_WAIT_MS = 15000;
  var PULL_INTERVAL_MS = 60000;
  var MEDIA_INTERVAL_MS = 120000;

  var D = W.document;
  var LS = W.localStorage;
  var proto = W.Storage && W.Storage.prototype;
  var rawGet = proto.getItem, rawSet = proto.setItem, rawRemove = proto.removeItem;
  var realFetch = W.fetch.bind(W);
  var subtle = W.crypto && W.crypto.subtle;

  function lsGet(k) { try { return rawGet.call(LS, k); } catch (e) { return null; } }
  function lsSet(k, v) { try { rawSet.call(LS, k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { rawRemove.call(LS, k); } catch (e) { /* unavailable */ } }
  function nowIso() { return new Date().toISOString(); }
  function uuid() {
    if (W.crypto && W.crypto.randomUUID) return W.crypto.randomUUID();
    var b = new Uint8Array(16); W.crypto.getRandomValues(b);
    return Array.from(b, function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  }

  function readMeta() {
    try { var m = JSON.parse(lsGet(META_KEY) || 'null'); if (isPlain(m)) return m; } catch (e) { /* reset */ }
    return { v: 1, userId: null, user: null, loggedIn: false, rev: 0, hash: null, syncedAt: null };
  }
  function writeMeta(m) { lsSet(META_KEY, JSON.stringify(m)); }
  function patchMeta(p) { var m = readMeta(); Object.keys(p).forEach(function (k) { m[k] = p[k]; }); writeMeta(m); return m; }

  function deviceId() {
    var id = lsGet(DEVICE_KEY);
    if (!id || !/^[A-Za-z0-9._:-]{8,128}$/.test(id)) { id = 'web-' + uuid(); lsSet(DEVICE_KEY, id); }
    return id;
  }

  function deviceName() {
    var ua = (W.navigator && W.navigator.userAgent) || '';
    var os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '设备';
    var br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '浏览器';
    return os + ' · ' + br;
  }

  function release() { var r = W.__DELF50_RELEASE || {}; return r.app || null; }

  async function sha256(text) {
    var buf = await subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  }

  var semCache = { text: null, hash: null };
  async function semHash(text) {
    if (text == null) return null;
    if (semCache.text === text) return semCache.hash;
    var h;
    try { h = await sha256(semanticText(text)); } catch (e) { h = await sha256(text); }
    semCache = { text: text, hash: h };
    return h;
  }

  async function gzip(text) {
    var bytes = new TextEncoder().encode(text);
    if (typeof W.CompressionStream !== 'function') return { body: bytes, encoding: 'identity' };
    try {
      var stream = new Blob([bytes]).stream().pipeThrough(new W.CompressionStream('gzip'));
      return { body: new Uint8Array(await new Response(stream).arrayBuffer()), encoding: 'gzip' };
    } catch (e) {
      return { body: bytes, encoding: 'identity' };
    }
  }

  // ── IndexedDB (sync bases and parked documents; not the app's database) ──

  function idbOpen(name, version, upgrade) {
    return new Promise(function (resolve, reject) {
      if (!W.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      var req = W.indexedDB.open(name, version);
      req.onupgradeneeded = function () { upgrade(req.result); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () { reject(new Error('IndexedDB blocked')); };
    });
  }
  var cloudDbP = null;
  function cloudDb() {
    if (!cloudDbP) cloudDbP = idbOpen(CLOUD_DB, 1, function (db) { if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv'); })
      .catch(function (e) { cloudDbP = null; throw e; });
    return cloudDbP;
  }
  function idbReq(db, store, mode, fn) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(store, mode);
      var r = fn(tx.objectStore(store));
      tx.oncomplete = function () { resolve(r && r.result); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error || new Error('aborted')); };
    });
  }
  async function kvGet(k) { try { return await idbReq(await cloudDb(), 'kv', 'readonly', function (s) { return s.get(k); }); } catch (e) { return undefined; } }
  async function kvPut(k, v) { try { await idbReq(await cloudDb(), 'kv', 'readwrite', function (s) { return s.put(v, k); }); return true; } catch (e) { return false; } }
  async function kvDel(k) { try { await idbReq(await cloudDb(), 'kv', 'readwrite', function (s) { return s.delete(k); }); } catch (e) { /* ignore */ } }

  // The app's audio store, opened exactly as the app opens it (same version and
  // upgrade), so it is never created in a shape the app would not recognise.
  var audioDbP = null;
  function audioDb() {
    if (!audioDbP) audioDbP = idbOpen(AUDIO_DB, 1, function (db) { if (!db.objectStoreNames.contains('clips')) db.createObjectStore('clips', { keyPath: 'id' }); })
      .catch(function (e) { audioDbP = null; throw e; });
    return audioDbP;
  }

  // ── engine state ──

  var E = {
    status: 'idle', detail: '', busy: false, again: false,
    pushTimer: null, firstDirtyAt: 0, retryMs: 0, retryTimer: null,
    decision: null, reload: null, reloadTimer: null, suppressAppWrites: false, lastSyncAt: null,
    media: { state: 'idle', uploaded: 0, pending: 0, downloaded: 0, error: null }, mediaRunning: false, mediaAt: 0, mediaPromise: null, mediaAgain: false,
    listeners: [], trace: []
  };

  function trace(msg) { E.trace.push(new Date().toISOString().slice(11, 23) + ' ' + msg); if (E.trace.length > 60) E.trace.shift(); }

  function setStatus(status, detail) {
    E.status = status; E.detail = detail || '';
    E.listeners.forEach(function (fn) { try { fn(); } catch (e) { /* ui */ } });
  }

  function isBooted() { return Boolean(W.__DELF50_BOOT && W.__DELF50_BOOT.status === 'ready'); }

  // ── observe the app's writes (never alters them) ──

  proto.setItem = function (k, v) {
    var mine = false;
    try { mine = this === LS && k === STATE_KEY; } catch (e) { mine = false; }
    if (mine && E.suppressAppWrites) return undefined;
    var r = rawSet.call(this, k, v);
    if (mine) onLocalWrite();
    return r;
  };
  proto.removeItem = function (k) {
    var mine = false;
    try { mine = this === LS && k === STATE_KEY; } catch (e) { mine = false; }
    if (mine && E.suppressAppWrites) return undefined;
    var r = rawRemove.call(this, k);
    if (mine) onLocalWrite();
    return r;
  };

  function onLocalWrite() {
    var m = readMeta();
    if (!m.loggedIn || E.decision || E.reload) return;
    if (!E.firstDirtyAt) E.firstDirtyAt = Date.now();
    var wait = Math.min(PUSH_DEBOUNCE_MS, Math.max(0, PUSH_MAX_WAIT_MS - (Date.now() - E.firstDirtyAt)));
    clearTimeout(E.pushTimer);
    E.pushTimer = setTimeout(function () { E.firstDirtyAt = 0; sync('push'); }, wait);
    if (E.status === 'synced') setStatus('dirty');
  }

  // ── startup gate: the bundle download waits for the first pull ──

  var gateOpen = false, gateResolve;
  var gate = new Promise(function (r) { gateResolve = r; });
  function openGate() { if (!gateOpen) { gateOpen = true; gateResolve(); } }
  W.fetch = function (input, init) {
    var p = realFetch(input, init);
    if (gateOpen) return p;
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (/\/api\/source\?/.test(url)) return p.then(function (r) { return gate.then(function () { return r; }); });
    return p;
  };

  // ── HTTP ──

  function ApiError(status, body) {
    var e = new Error((body && body.error && body.error.message) || ('HTTP ' + status));
    e.status = status; e.code = body && body.error && body.error.code; e.body = body; return e;
  }

  async function call(method, path, opts) {
    opts = opts || {};
    var headers = Object.assign({ 'X-DELF50-Client': 'web' }, opts.headers || {});
    var body = opts.body;
    if (opts.json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.json); }
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, opts.timeout || 20000) : null;
    var r;
    try {
      r = await realFetch(API + path, { method: method, headers: headers, body: body, credentials: 'same-origin', cache: 'no-store', keepalive: Boolean(opts.keepalive), signal: ctrl && ctrl.signal });
    } catch (e) {
      var ne = new Error('network'); ne.status = 0; ne.network = true; throw ne;
    } finally { if (timer) clearTimeout(timer); }
    if (opts.raw) return r;
    var data = null;
    var ct = r.headers.get('content-type') || '';
    if (ct.indexOf('application/json') >= 0) { try { data = await r.json(); } catch (e) { data = null; } }
    if (!r.ok && !(opts.okStatuses && opts.okStatuses.indexOf(r.status) >= 0)) throw ApiError(r.status, data);
    return { status: r.status, data: data, headers: r.headers };
  }

  function handleAuthLoss(e) {
    if (e && e.status === 401) {
      patchMeta({ loggedIn: false });
      setStatus('expired', '登录已过期，请重新登录；学习记录仍保存在本机。');
      return true;
    }
    return false;
  }

  // ── state sync ──

  async function getRemote(haveRev) {
    var r = await call('GET', '/sync/state' + (haveRev != null ? '?have=' + haveRev : ''), { raw: true });
    if (r.status === 401) throw ApiError(401, null);
    if (r.status !== 200 && r.status !== 204) throw ApiError(r.status, null);
    var out = { rev: Number(r.headers.get('X-DELF50-Rev') || 0), hash: r.headers.get('X-DELF50-Hash') || null, text: null };
    if (r.status === 200) {
      out.text = await r.text();
      if (await sha256(out.text) !== out.hash) throw new Error('云端数据校验失败（hash mismatch）');
    }
    return out;
  }

  async function putRemote(text, hash, baseRev, reason, keepalive) {
    var z = await gzip(text);
    var r = await call('PUT', '/sync/state', {
      body: z.body, keepalive: keepalive && z.body.byteLength < 60000, okStatuses: [409],
      headers: { 'Content-Type': 'application/octet-stream', 'X-DELF50-Encoding': z.encoding, 'X-DELF50-Hash': hash, 'X-DELF50-Base-Rev': String(baseRev), 'X-DELF50-Reason': reason }
    });
    return r.data;
  }

  async function archiveRemote(text, reason) {
    var z = await gzip(text);
    await call('POST', '/sync/archive', {
      body: z.body,
      headers: { 'Content-Type': 'application/octet-stream', 'X-DELF50-Encoding': z.encoding, 'X-DELF50-Hash': await sha256(text), 'X-DELF50-Reason': reason }
    });
  }

  /** Records `text` as the agreed base at server revision `rev`. */
  async function setBase(userId, rev, hash, text) {
    await kvPut('base:' + userId, { rev: rev, hash: hash, text: text });
    patchMeta({ rev: rev, hash: hash, sem: await semHash(text), syncedAt: nowIso() });
    E.lastSyncAt = Date.now();
  }

  async function baseFor(meta) {
    if (!meta.userId || !meta.rev) return null;
    var b = await kvGet('base:' + meta.userId);
    return b && b.rev === meta.rev && b.hash === meta.hash && typeof b.text === 'string' ? b.text : null;
  }

  function withLock(fn) {
    if (W.navigator && W.navigator.locks && W.navigator.locks.request) return W.navigator.locks.request('delf50-cloud-sync', fn);
    return fn();
  }

  /**
   * One sync pass. mode 'push' tries a direct CAS write first (one request);
   * mode 'pull' asks the server for news first. Both end in the same state.
   */
  function sync(mode, opts) {
    opts = opts || {};
    if (E.busy) { E.again = true; return Promise.resolve(); }
    var m = readMeta();
    if (!m.loggedIn || !subtle) return Promise.resolve();
    if (E.decision || E.reload) return Promise.resolve();
    E.busy = true;
    clearTimeout(E.retryTimer);
    return withLock(function () { return syncInner(mode, opts); })
      .then(function () { E.retryMs = 0; })
      .catch(function (e) {
        if (handleAuthLoss(e)) return;
        if (e && e.network) setStatus('offline', '网络不可用，已保存在本机，恢复后自动同步。');
        else setStatus('error', (e && e.message) || String(e));
        E.retryMs = Math.min(E.retryMs ? E.retryMs * 2 : 5000, 300000);
        E.retryTimer = setTimeout(function () { sync('pull'); }, E.retryMs);
      })
      .then(function () {
        E.busy = false;
        if (E.again) { E.again = false; setTimeout(function () { sync('push'); }, 50); }
        else scheduleMedia(false);
      });
  }

  async function syncInner(mode, opts) {
    for (var attempt = 0; attempt < 6; attempt++) {
      var m = readMeta();
      if (!m.loggedIn) return;
      var local = lsGet(STATE_KEY);
      var localHash = local == null ? null : await sha256(local);

      if (mode === 'push') {
        if (await unchanged(m, local, localHash)) { setStatus('synced'); return; }
        setStatus('syncing');
        var res = await putRemote(local, localHash, m.rev || 0, (m.rev || 0) === 0 ? 'claim' : 'push', opts.keepalive);
        trace('push base=' + (m.rev || 0) + ' -> ' + (res && res.status) + ' ' + (res && res.rev));
        if (res && res.status !== 'conflict') { await setBase(m.userId, res.rev, localHash, local); continue; }
        mode = 'pull';
        continue;
      }

      setStatus('syncing');
      var remote = await getRemote(m.rev || 0);
      trace('pull have=' + (m.rev || 0) + ' got=' + remote.rev + (remote.text === null ? ' (none)' : ' (doc)'));
      if (remote.text === null) {
        // 204: the head is still our base — or the account has no document yet
        // (new account, or a server reset), in which case ours is claimed.
        if (remote.rev !== (m.rev || 0)) patchMeta({ rev: 0, hash: null });
        mode = 'push';
        continue;
      }
      await reconcile(m, remote, local, localHash);
      return;
    }
    throw new Error('同步未能收敛，稍后自动重试');
  }

  /** True when the local document holds nothing the base does not. */
  async function unchanged(m, local, localHash) {
    if (local == null || localHash === m.hash) return true;
    return Boolean(m.sem) && (await semHash(local)) === m.sem;
  }

  /** The server moved past our base. Decide how the two documents meet. */
  async function reconcile(m, remote, local, localHash) {
    trace('reconcile base=' + m.rev + ' remote=' + remote.rev);
    if (local != null && localHash === remote.hash) { await setBase(m.userId, remote.rev, remote.hash, remote.text); setStatus('synced'); return; }
    if (local == null) return adopt(m, remote, null);
    var remoteSem = await semHash(remote.text);
    var clean = await unchanged(m, local, localHash);
    if (m.sem && remoteSem === m.sem) {
      // The other side only restamped bookkeeping: move the base, keep the page.
      await setBase(m.userId, remote.rev, remote.hash, remote.text);
      if (clean) { setStatus('synced'); return; }
      E.again = true;
      return;
    }
    if ((await semHash(local)) === remoteSem) {
      // Same learning on both sides, different stamps: nothing to load.
      await setBase(m.userId, remote.rev, remote.hash, remote.text);
      setStatus('synced');
      return;
    }
    if (clean) return adopt(m, remote, null);
    var baseText = await baseFor(m);
    if (baseText != null) {
      return applyRemote(m, remote, function (latestLocal) { return merge3Text(baseText, latestLocal, remote.text); }, 'merged');
    }
    var localSummary = summarize(safeParse(local));
    if (!localSummary.evidence) return adopt(m, remote, null);
    // Two histories without a common ancestor: the learner decides.
    E.decision = { remote: remote, local: local, localHash: localHash, localSummary: localSummary, remoteSummary: summarize(safeParse(remote.text)) };
    setStatus('decision', '本机和云端各有一份学习记录，请选择如何处理。');
    View.openDecision();
  }

  function safeParse(t) { try { return JSON.parse(t); } catch (e) { return null; } }

  async function adopt(m, remote, archiveReason) {
    var local = lsGet(STATE_KEY);
    if (archiveReason && local != null) await archiveRemote(local, archiveReason);
    return applyRemote(m, remote, function () { return remote.text; }, 'adopted');
  }

  /**
   * Puts a document derived from the server head into the app. Before boot this
   * is a plain localStorage write; after boot it happens right before a reload,
   * recomputed from the newest local text so nothing typed meanwhile is lost.
   */
  async function applyRemote(m, remote, compute, kind) {
    trace('apply ' + kind + ' rev=' + remote.rev + (isBooted() ? ' (reload)' : ' (pre-boot)'));
    await kvPut('base:' + m.userId, { rev: remote.rev, hash: remote.hash, text: remote.text });
    if (!isBooted()) {
      var text = compute(lsGet(STATE_KEY));
      lsSet(STATE_KEY, text);
      patchMeta({ rev: remote.rev, hash: remote.hash, sem: await semHash(remote.text), syncedAt: nowIso() });
      setStatus(kind === 'merged' ? 'dirty' : 'synced');
      if (kind === 'merged') E.again = true;
      return;
    }
    E.reload = { remote: remote, compute: compute, kind: kind };
    setStatus('reload', kind === 'merged' ? '已合并其他设备的学习记录，页面将刷新以载入。' : '其他设备有新的学习记录，页面将刷新以载入。');
    tryReload();
  }

  function busyEditing() {
    // `UI` is the app's own global (recording state lives there).
    try { if (typeof UI !== 'undefined' && UI && UI.recording) return true; } catch (e) { /* not booted */ }
    var a = D.activeElement;
    return Boolean(a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /text|search|email|number/.test(a.type))) && !(a.closest && a.closest('.dc-root')));
  }

  function reloadAllowed() {
    var list = [];
    try { list = JSON.parse(W.sessionStorage.getItem(RELOADS_KEY) || '[]'); } catch (e) { list = []; }
    var t = Date.now();
    list = list.filter(function (x) { return t - x < 120000; });
    if (list.length >= 3) return false;
    list.push(t);
    try { W.sessionStorage.setItem(RELOADS_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
    return true;
  }

  function tryReload(force) {
    var job = E.reload;
    if (!job) return;
    if (!job.sem) { semHash(job.remote.text).then(function (h) { job.sem = h; tryReload(force); }); return; }
    if (!force && busyEditing()) {
      clearTimeout(E.reloadTimer);
      E.reloadTimer = setTimeout(tryReload, 3000);
      return;
    }
    if (!reloadAllowed()) {
      setStatus('error', '自动刷新过于频繁，已暂停。请手动刷新页面。');
      return;
    }
    E.suppressAppWrites = true;
    var text = job.compute(lsGet(STATE_KEY));
    lsSet(STATE_KEY, text);
    patchMeta({ rev: job.remote.rev, hash: job.remote.hash, sem: job.sem, syncedAt: nowIso() });
    W.location.reload();
  }

  async function resolveDecision(choice) {
    var d = E.decision;
    if (!d) return;
    var m = readMeta();
    setStatus('syncing');
    try {
      if (choice === 'cloud') {
        E.decision = null;
        await adopt(m, d.remote, 'replaced-by-cloud');
      } else if (choice === 'local') {
        var cur = lsGet(STATE_KEY);
        var h = await sha256(cur);
        var r = await putRemote(cur, h, d.remote.rev, 'adopt');
        E.decision = null;
        if (r.status === 'conflict') { await sync('pull'); return; }
        await setBase(m.userId, r.rev, h, cur);
        setStatus('synced');
      } else if (choice === 'merge') {
        var latest = lsGet(STATE_KEY);
        await archiveRemote(latest, 'pre-merge-local');
        E.decision = null;
        await applyRemote(m, d.remote, function (l) { return merge3Text(null, l, d.remote.text); }, 'merged');
      }
    } catch (e) {
      E.decision = E.decision || d;
      if (!handleAuthLoss(e)) setStatus('decision', '操作失败：' + (e.message || e) + '。请重试。');
    }
  }

  // ── accounts ──

  function clientInfo() { return { platform: 'web', deviceId: deviceId(), name: deviceName(), appVersion: release() }; }

  async function afterSignIn(user) {
    var m = readMeta();
    var owner = m.userId;
    var local = lsGet(STATE_KEY);
    if (owner && owner !== user.id) {
      // This browser holds another learner's document: set it aside untouched.
      if (local != null) await kvPut('parked:' + owner, { text: local, meta: m, at: nowIso() });
      var parked = await kvGet('parked:' + user.id);
      var next = parked ? parked.text : null;
      var meta = parked ? Object.assign({}, parked.meta) : { v: 1, rev: 0, hash: null, syncedAt: null };
      meta.userId = user.id; meta.user = user; meta.loggedIn = true;
      if (parked) await kvDel('parked:' + user.id);
      return swapLocal(next, meta);
    }
    if (!owner) {
      var p = await kvGet('parked:' + user.id);
      if (p && !summarize(safeParse(local)).evidence) {
        var pm = Object.assign({}, p.meta, { userId: user.id, user: user, loggedIn: true });
        await kvDel('parked:' + user.id);
        return swapLocal(p.text, pm);
      }
      writeMeta({ v: 1, userId: user.id, user: user, loggedIn: true, rev: 0, hash: null, syncedAt: null });
    } else {
      patchMeta({ user: user, loggedIn: true });
    }
    await sync('pull');
  }

  function swapLocal(text, meta) {
    var running = isBooted();
    if (running) E.suppressAppWrites = true;
    if (text == null) lsDel(STATE_KEY); else lsSet(STATE_KEY, text);
    writeMeta(meta);
    if (running) { W.location.reload(); return new Promise(function () {}); }
    return sync('pull');
  }

  async function signIn(kind, fields) {
    var body = Object.assign({}, fields, { client: clientInfo() });
    var r = await call('POST', '/auth/' + kind, { json: body });
    await afterSignIn(r.data.user);
    return r.data.user;
  }

  async function signOut(removeLocal) {
    var m = readMeta();
    if (m.loggedIn) {
      try { await sync('push'); } catch (e) { /* reported by status */ }
    }
    var local = lsGet(STATE_KEY);
    var dirty = local != null && !(await unchanged(readMeta(), local, await sha256(local)));
    try { await call('POST', '/auth/logout', {}); } catch (e) { /* cookie is cleared server-side when reachable */ }
    patchMeta({ loggedIn: false });
    if (removeLocal) {
      if (dirty && local != null && m.userId) await kvPut('parked:' + m.userId, { text: local, meta: readMeta(), at: nowIso() });
      var running = isBooted();
      if (running) E.suppressAppWrites = true;
      lsDel(STATE_KEY);
      writeMeta({ v: 1, userId: null, user: null, loggedIn: false, rev: 0, hash: null, syncedAt: null });
      if (running) { W.location.reload(); return; }
    }
    setStatus('anon');
  }

  // ── media (speaking recordings ⇄ R2) ──

  function audioAll() {
    return audioDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var out = [];
        var tx = db.transaction('clips', 'readonly');
        var req = tx.objectStore('clips').openCursor();
        req.onsuccess = function () { var c = req.result; if (c) { out.push({ id: c.value.id, size: c.value.blob ? c.value.blob.size : 0 }); c.continue(); } };
        tx.oncomplete = function () { resolve(out); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function audioGet(id) { return audioDb().then(function (db) { return idbReq(db, 'clips', 'readonly', function (s) { return s.get(id); }); }); }
  function audioPut(rec) { return audioDb().then(function (db) { return idbReq(db, 'clips', 'readwrite', function (s) { return s.put(rec); }); }); }

  function speakingRecords() {
    var S = safeParse(lsGet(STATE_KEY));
    var recs = S && S.speaking && Array.isArray(S.speaking.records) ? S.speaking.records : [];
    var map = new Map();
    recs.forEach(function (r) { if (r && typeof r.id === 'string') map.set(r.id, r); });
    return map;
  }

  async function uploadClip(id, clip, rec) {
    var blob = clip.blob;
    var type = blob.type || 'audio/webm';
    var body = { clipId: id, contentType: type, size: blob.size, kind: 'speaking_recording' };
    if (rec && Number.isInteger(rec.day)) body.day = rec.day;
    if (rec && Number.isFinite(rec.sec)) body.durationSec = Math.round(rec.sec);
    var r = (await call('POST', '/media/upload-url', { json: body })).data;
    if (r.status === 'stored') return;
    var direct = false;
    try {
      var put = await realFetch(r.upload.url, { method: 'PUT', body: blob, headers: r.upload.headers });
      direct = put.ok;
    } catch (e) { direct = false; }
    if (direct) {
      await call('POST', '/media/complete', { json: { clipId: id } });
      return;
    }
    if (blob.size > r.proxy.maxBytes) throw new Error('录音过大且无法直传 R2（请检查存储桶 CORS 设置）');
    await call('PUT', '/media/raw?clipId=' + encodeURIComponent(id), { body: blob, headers: { 'Content-Type': type }, timeout: 60000 });
  }

  async function downloadClip(id, rec) {
    var blob = null;
    try {
      var u = (await call('GET', '/media/url?clipId=' + encodeURIComponent(id))).data;
      var r = await realFetch(u.url);
      if (r.ok) blob = await r.blob();
    } catch (e) { blob = null; }
    if (!blob) {
      var p = await call('GET', '/media/raw?clipId=' + encodeURIComponent(id), { raw: true, timeout: 60000 });
      if (!p.ok) throw ApiError(p.status, null);
      blob = await p.blob();
    }
    var at = rec && rec.at ? Date.parse(rec.at) : Date.now();
    await audioPut({ id: id, blob: blob, at: isFinite(at) ? at : Date.now() });
  }

  function scheduleMedia(force) {
    if (!force && Date.now() - E.mediaAt < MEDIA_INTERVAL_MS) return;
    setTimeout(function () { mediaSync().catch(function () { /* recorded */ }); }, force ? 0 : 1500);
  }

  /** One media pass at a time; a call during a pass waits for it plus one more pass. */
  function mediaSync() {
    if (E.mediaPromise) { E.mediaAgain = true; return E.mediaPromise; }
    E.mediaPromise = mediaPass().then(function () {
      E.mediaPromise = null;
      if (E.mediaAgain) { E.mediaAgain = false; return mediaSync(); }
    });
    return E.mediaPromise;
  }

  async function mediaPass() {
    var m = readMeta();
    if (!m.loggedIn || !W.indexedDB) return;
    E.mediaRunning = true;
    E.mediaAt = Date.now();
    try {
      var list = (await call('GET', '/media')).data;
      if (!list.r2) { E.media = { state: 'off', uploaded: 0, pending: 0, downloaded: 0, error: null }; return; }
      var stored = new Set(list.media.filter(function (x) { return x.status === 'stored'; }).map(function (x) { return x.clipId; }));
      var local = await audioAll();
      var localIds = new Set(local.map(function (x) { return x.id; }));
      var recs = speakingRecords();
      var toUp = local.filter(function (x) { return x.size > 0 && !stored.has(x.id) && /^[A-Za-z0-9._-]{1,120}$/.test(x.id); });
      var toDown = Array.from(stored).filter(function (id) { return !localIds.has(id) && recs.has(id); });
      E.media = { state: toUp.length || toDown.length ? 'running' : 'done', uploaded: stored.size, pending: toUp.length, downloaded: 0, error: null };
      setStatus(E.status, E.detail);
      for (var i = 0; i < toUp.length; i++) {
        var clip = await audioGet(toUp[i].id);
        if (!clip || !clip.blob) continue;
        await uploadClip(toUp[i].id, clip, recs.get(toUp[i].id));
        E.media.uploaded++; E.media.pending--;
        setStatus(E.status, E.detail);
      }
      for (var j = 0; j < toDown.length; j++) {
        await downloadClip(toDown[j], recs.get(toDown[j]));
        E.media.downloaded++;
      }
      E.media.state = 'done';
    } catch (e) {
      if (!handleAuthLoss(e)) E.media.error = (e && e.message) || String(e);
      E.media.state = 'error';
    } finally {
      E.mediaRunning = false;
      setStatus(E.status, E.detail);
    }
  }

  // ───────────────────────── UI ─────────────────────────────────────────────

  var CSS = [
    '.dc-root{--dc-brand:var(--brand,#0b6b58);--dc-ink:var(--ink,#18332d);--dc-muted:var(--muted,#6c7d78);--dc-line:var(--line,#dfe9e5);--dc-card:var(--card,#fff);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:var(--dc-ink)}',
    '.dc-chip{position:fixed;top:max(8px,env(safe-area-inset-top));right:10px;z-index:60;display:flex;align-items:center;gap:6px;border:1px solid var(--dc-line);background:rgba(255,255,255,.96);border-radius:999px;padding:6px 11px;font-size:11px;font-weight:750;color:var(--dc-ink);cursor:pointer;box-shadow:0 4px 16px rgba(20,60,50,.08);max-width:62vw}',
    '.dc-chip span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.dc-dot{width:8px;height:8px;border-radius:50%;background:#a9b5b1;flex:none}',
    '.dc-dot.ok{background:#2f8f6f}.dc-dot.busy{background:#d4a017}.dc-dot.bad{background:#c0463f}.dc-dot.info{background:#2e5f8a}',
    '.dc-mask{position:fixed;inset:0;z-index:70;background:rgba(15,35,30,.38);display:flex;align-items:flex-start;justify-content:center;padding:max(16px,env(safe-area-inset-top)) 16px 16px;overflow:auto}',
    '.dc-panel{width:min(440px,100%);background:var(--dc-card);border-radius:18px;padding:18px;box-shadow:0 20px 60px rgba(10,40,30,.25);margin-top:6vh}',
    '.dc-panel h3{margin:0 0 4px;font-size:17px}.dc-sub{font-size:12px;color:var(--dc-muted);line-height:1.6;margin:0 0 12px}',
    '.dc-tabs{display:flex;gap:6px;margin:0 0 12px}.dc-tabs button{flex:1;border:1px solid var(--dc-line);background:#fff;border-radius:10px;padding:8px;font-weight:700;cursor:pointer;color:var(--dc-ink)}.dc-tabs button.on{background:var(--dc-brand);border-color:var(--dc-brand);color:#fff}',
    '.dc-field{display:block;margin:0 0 10px;font-size:12px;color:var(--dc-muted)}.dc-field input{display:block;width:100%;box-sizing:border-box;margin-top:4px;border:1px solid var(--dc-line);border-radius:11px;padding:10px 11px;font-size:15px;color:var(--dc-ink);background:#fff}',
    '.dc-btn{border:0;background:var(--dc-brand);color:#fff;font-weight:800;border-radius:12px;padding:11px 14px;cursor:pointer;font-size:13px}.dc-btn.sec{background:#fff;color:var(--dc-ink);border:1px solid var(--dc-line)}.dc-btn.warn{background:#8a5a12}.dc-btn:disabled{opacity:.5;cursor:default}',
    '.dc-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}.dc-row .dc-btn{flex:1}',
    '.dc-msg{font-size:12px;line-height:1.6;border-radius:10px;padding:9px 11px;margin:10px 0 0}.dc-msg.bad{background:#fbefee;color:#7c403d}.dc-msg.good{background:#e8f5ef;color:#225d49}.dc-msg.info{background:#edf5fb;color:#2e5f8a}',
    '.dc-kv{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:12px;margin:8px 0}.dc-kv b{font-weight:700;color:var(--dc-muted)}',
    '.dc-cmp{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}.dc-cmp div{border:1px solid var(--dc-line);border-radius:12px;padding:10px;font-size:11px;line-height:1.7}.dc-cmp h4{margin:0 0 4px;font-size:13px}',
    '.dc-rev{max-height:220px;overflow:auto;border:1px solid var(--dc-line);border-radius:12px;margin-top:8px}.dc-rev div{display:flex;justify-content:space-between;gap:8px;padding:8px 10px;border-bottom:1px solid var(--dc-line);font-size:11px}.dc-rev div:last-child{border-bottom:0}',
    '.dc-x{float:right;border:0;background:transparent;font-size:20px;line-height:1;cursor:pointer;color:var(--dc-muted)}',
    '.dc-check{display:flex;gap:8px;align-items:flex-start;font-size:12px;color:var(--dc-muted);margin-top:10px}',
    '@media(max-width:640px){.dc-chip{top:max(6px,env(safe-area-inset-top));right:8px;padding:5px 9px}.dc-cmp{grid-template-columns:1fr}}'
  ].join('');

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtTime(iso) { if (!iso) return '—'; var d = new Date(iso); return isFinite(d) ? d.toLocaleString() : '—'; }
  function errText(e) {
    var map = {
      invalid_credentials: '邮箱或密码不正确。', too_many_attempts: '尝试次数过多，请 15 分钟后再试。', email_taken: '该邮箱已注册，请直接登录。',
      invalid_invite: '邀请码不正确。', registration_closed: '暂未开放注册。', registration_full: '账号数量已达上限。',
      weak_password: '密码至少 8 位。', invalid_field: '请检查填写内容。', db_not_configured: '服务器尚未配置数据库。'
    };
    if (e && e.network) return '无法连接服务器，请检查网络。';
    return (e && map[e.code]) || (e && e.message) || '操作失败';
  }

  var View = (function () {
    var host, chip, mask;
    var view = { tab: 'login', msg: null };

    function ensureHost() {
      if (host) return;
      var st = D.createElement('style'); st.textContent = CSS; D.head.appendChild(st);
      host = D.createElement('div'); host.className = 'dc-root';
      D.body.appendChild(host);
      chip = D.createElement('button'); chip.type = 'button'; chip.className = 'dc-chip'; chip.setAttribute('aria-label', '账号与云同步');
      chip.addEventListener('click', function () { openPanel(); });
      host.appendChild(chip);
      renderChip();
    }

    function chipState() {
      var m = readMeta();
      if (E.status === 'decision') return ['info', '需要选择同步方式'];
      if (E.status === 'reload') return ['info', '载入新进度…'];
      if (!m.loggedIn) return E.status === 'expired' ? ['bad', '登录已过期'] : ['', '登录 · 云端保存'];
      var name = (m.user && m.user.displayName) || '已登录';
      if (E.status === 'syncing') return ['busy', name + ' · 同步中'];
      if (E.status === 'dirty') return ['busy', name + ' · 待同步'];
      if (E.status === 'offline') return ['bad', name + ' · 离线'];
      if (E.status === 'error') return ['bad', name + ' · 同步异常'];
      return ['ok', name + ' · 已同步'];
    }

    function renderChip() {
      if (!chip) return;
      var s = chipState();
      chip.innerHTML = '<i class="dc-dot ' + s[0] + '"></i><span>☁ ' + esc(s[1]) + '</span>';
      if (mask && view.kind === 'account') renderPanel();
    }

    function close() { if (mask) { mask.remove(); mask = null; } }

    function openShell(html) {
      close();
      mask = D.createElement('div'); mask.className = 'dc-mask';
      mask.innerHTML = '<div class="dc-panel" role="dialog" aria-modal="true">' + html + '</div>';
      mask.addEventListener('click', function (e) { if (e.target === mask && view.kind !== 'decision') close(); });
      host.appendChild(mask);
      var x = mask.querySelector('[data-dc="close"]'); if (x) x.addEventListener('click', close);
      return mask;
    }

    function openPanel() {
      ensureHost();
      view.kind = readMeta().loggedIn ? 'account' : 'auth';
      if (E.status === 'decision') { openDecision(); return; }
      renderPanel();
    }

    function renderPanel() {
      if (view.kind === 'auth') return renderAuth();
      return renderAccount();
    }

    function msgHtml() { return view.msg ? '<div class="dc-msg ' + view.msg[0] + '">' + esc(view.msg[1]) + '</div>' : ''; }

    function renderAuth() {
      var reg = view.tab === 'register';
      var m = readMeta();
      openShell(
        '<button class="dc-x" data-dc="close" aria-label="关闭">×</button><h3>' + (reg ? '注册账号' : '登录') + '</h3>' +
        '<p class="dc-sub">登录后，答题、写作、口语录音与每日进度会自动保存到云端，换设备也能继续学习。不登录也可照常使用，数据仅保存在本机。</p>' +
        (E.status === 'expired' ? '<div class="dc-msg info">登录已过期。重新登录后，本机未上传的学习记录会自动补传。</div>' : '') +
        '<div class="dc-tabs"><button type="button" data-dc="tab-login" class="' + (reg ? '' : 'on') + '">登录</button><button type="button" data-dc="tab-register" class="' + (reg ? 'on' : '') + '">注册</button></div>' +
        '<form data-dc="form" novalidate>' +
        '<label class="dc-field">邮箱<input name="email" type="email" autocomplete="username" required value="' + esc((m.user && m.user.email) || '') + '"></label>' +
        (reg ? '<label class="dc-field">昵称<input name="displayName" maxlength="60" autocomplete="nickname"></label>' : '') +
        '<label class="dc-field">密码' + (reg ? '（至少 8 位）' : '') + '<input name="password" type="password" autocomplete="' + (reg ? 'new-password' : 'current-password') + '" required minlength="' + (reg ? 8 : 1) + '"></label>' +
        (reg ? '<label class="dc-field">邀请码<input name="inviteCode" autocomplete="off" required></label>' : '') +
        '<button class="dc-btn" style="width:100%" type="submit">' + (reg ? '注册并开始同步' : '登录并同步') + '</button></form>' + msgHtml()
      );
      mask.querySelector('[data-dc="tab-login"]').addEventListener('click', function () { view.tab = 'login'; view.msg = null; renderAuth(); });
      mask.querySelector('[data-dc="tab-register"]').addEventListener('click', function () { view.tab = 'register'; view.msg = null; renderAuth(); });
      var form = mask.querySelector('[data-dc="form"]');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = {}; Array.prototype.forEach.call(form.elements, function (el) { if (el.name) fd[el.name] = el.value; });
        var btn = form.querySelector('button[type="submit"]'); btn.disabled = true; btn.textContent = '请稍候…';
        signIn(reg ? 'register' : 'login', fd).then(function () {
          if (E.decision) { openDecision(); return; }
          view.msg = ['good', reg ? '注册成功，已开始同步。' : '登录成功，已开始同步。'];
          view.kind = 'account';
          if (mask) renderAccount();
        }).catch(function (err) {
          view.msg = ['bad', errText(err)];
          renderAuth();
        });
      });
      var first = form.querySelector('input'); if (first && !first.value) first.focus();
    }

    function renderAccount() {
      var m = readMeta();
      var md = E.media;
      var mediaText = md.state === 'off' ? '服务器未配置 R2，录音仅保存在本机'
        : md.state === 'error' ? '上传出错：' + md.error
          : md.state === 'running' ? '正在同步（已存 ' + md.uploaded + '，待传 ' + md.pending + '）'
            : md.state === 'done' ? '已备份 ' + md.uploaded + ' 段' : '等待检查';
      var statusText = { synced: '已同步', syncing: '同步中…', dirty: '有改动，稍后自动上传', offline: '离线（本机已保存）', error: '异常', reload: '正在载入新进度', decision: '需要选择', expired: '登录已过期', idle: '等待中', anon: '未登录' }[E.status] || E.status;
      openShell(
        '<button class="dc-x" data-dc="close" aria-label="关闭">×</button><h3>' + esc((m.user && m.user.displayName) || '账号') + '</h3>' +
        '<p class="dc-sub">' + esc((m.user && m.user.email) || '') + '</p>' +
        '<div class="dc-kv"><b>同步状态</b><span>' + esc(statusText) + '</span>' +
        '<b>最近同步</b><span>' + esc(fmtTime(m.syncedAt)) + '</span>' +
        '<b>云端版本</b><span>#' + esc(m.rev || 0) + '</span>' +
        '<b>口语录音</b><span>' + esc(mediaText) + '</span>' +
        '<b>本设备</b><span>' + esc(deviceName()) + '</span></div>' +
        (E.detail && (E.status === 'error' || E.status === 'offline') ? '<div class="dc-msg bad">' + esc(E.detail) + '</div>' : '') +
        msgHtml() +
        '<div class="dc-row"><button class="dc-btn" data-dc="sync">立即同步</button><button class="dc-btn sec" data-dc="history">历史版本</button></div>' +
        '<div data-dc="hist"></div>' +
        '<label class="dc-check"><input type="checkbox" data-dc="wipe"> 退出时从本设备移除学习记录（云端保留；共用电脑时勾选）</label>' +
        '<div class="dc-row"><button class="dc-btn sec" data-dc="logout">退出登录</button></div>'
      );
      view.msg = null;
      mask.querySelector('[data-dc="sync"]').addEventListener('click', function () { sync('pull').then(function () { scheduleMedia(true); }); });
      mask.querySelector('[data-dc="history"]').addEventListener('click', loadHistory);
      mask.querySelector('[data-dc="logout"]').addEventListener('click', function (e) {
        var wipe = mask.querySelector('[data-dc="wipe"]').checked;
        e.target.disabled = true; e.target.textContent = '正在上传并退出…';
        signOut(wipe).then(function () { view.kind = 'auth'; view.msg = ['good', '已退出登录。']; renderAuth(); });
      });
    }

    function loadHistory() {
      var box = mask && mask.querySelector('[data-dc="hist"]');
      if (!box) return;
      box.innerHTML = '<div class="dc-msg info">正在读取…</div>';
      call('GET', '/sync/revisions').then(function (r) {
        var list = r.data.revisions || [];
        var cur = readMeta().rev;
        box.innerHTML = '<div class="dc-rev">' + (list.length ? list.map(function (x) {
          return '<div><span>#' + x.rev + ' · ' + esc(fmtTime(x.createdAt)) + ' · ' + esc(x.device || '') + ' · ' + esc({ push: '自动', merge: '合并', claim: '首次上传', adopt: '采用本机', restore: '恢复' }[x.reason] || x.reason) + '</span>' +
            (x.rev === cur ? '<b>当前</b>' : '<button class="dc-btn sec" style="padding:4px 8px;font-size:11px" data-rev="' + x.rev + '">恢复</button>') + '</div>';
        }).join('') : '<div>暂无历史</div>') + '</div>';
        Array.prototype.forEach.call(box.querySelectorAll('[data-rev]'), function (b) {
          b.addEventListener('click', function () { restoreRevision(Number(b.getAttribute('data-rev'))); });
        });
      }).catch(function (e) { box.innerHTML = '<div class="dc-msg bad">' + esc(errText(e)) + '</div>'; });
    }

    function restoreRevision(rev) {
      if (!W.confirm('恢复到版本 #' + rev + '？当前记录会保留在历史中，可再次恢复。')) return;
      var m = readMeta();
      sync('push').then(function () {
        var cur = readMeta();
        return call('POST', '/sync/restore', { json: { rev: rev, baseRev: cur.rev }, okStatuses: [409] });
      }).then(function (r) {
        if (r.status === 409) { view.msg = ['bad', '云端刚有更新，请再试一次。']; renderAccount(); return; }
        return getRemote(null).then(function (remote) {
          return applyRemote(readMeta(), remote, function () { return remote.text; }, 'adopted');
        });
      }).catch(function (e) { view.msg = ['bad', errText(e)]; renderAccount(); });
      return m;
    }

    function openDecision() {
      ensureHost();
      var d = E.decision; if (!d) return;
      view.kind = 'decision';
      function col(title, s) {
        return '<div><h4>' + title + '</h4>语法 ' + s.grammar + ' 题 · 阅读 ' + s.reading + ' 题 · 听力 ' + s.listening + ' 题<br>写作 ' + s.writing + ' · 应用 ' + s.application + ' · 口语 ' + s.speaking + '<br>学习天数 ' + s.days + ' · 错题 ' + s.errors + '<br>最后保存 ' + esc(fmtTime(s.lastSavedAt)) + '</div>';
      }
      openShell(
        '<h3>选择学习记录</h3><p class="dc-sub">本设备有登录前保存的学习记录，云端账号里也已有记录，二者没有共同的同步起点。请选择处理方式——被替换的一份会先完整存档到云端，不会丢失。</p>' +
        '<div class="dc-cmp">' + col('本设备', d.localSummary) + col('云端账号', d.remoteSummary) + '</div>' +
        '<div class="dc-row"><button class="dc-btn" data-dc="merge">合并两份（两台设备各自学了不同内容时）</button></div>' +
        '<div class="dc-row"><button class="dc-btn sec" data-dc="cloud">使用云端记录</button><button class="dc-btn sec" data-dc="local">使用本设备记录</button></div>' +
        '<p class="dc-sub" style="margin-top:10px">选择之前，同步会暂停；学习记录仍照常保存在本机。</p>'
      );
      ['merge', 'cloud', 'local'].forEach(function (k) {
        mask.querySelector('[data-dc="' + k + '"]').addEventListener('click', function (e) {
          Array.prototype.forEach.call(mask.querySelectorAll('.dc-btn'), function (b) { b.disabled = true; });
          e.target.textContent = '处理中…';
          resolveDecision(k).then(function () { if (!E.decision) close(); else openDecision(); });
        });
      });
    }

    function intro() {
      var m = readMeta();
      if (m.loggedIn || lsGet(INTRO_KEY)) return;
      lsSet(INTRO_KEY, nowIso());
      view.kind = 'auth'; view.tab = 'login'; view.msg = null;
      renderAuth();
    }

    E.listeners.push(renderChip);
    return { mount: ensureHost, openPanel: openPanel, openDecision: openDecision, intro: intro, close: close };
  })();

  // ───────────────────────── boot ───────────────────────────────────────────

  function watchBoot() {
    var t0 = Date.now();
    (function poll() {
      var b = W.__DELF50_BOOT;
      if (b && (b.status === 'ready' || b.status === 'error')) {
        onBooted();
        return;
      }
      if (Date.now() - t0 > 120000) { onBooted(); return; }
      setTimeout(poll, 150);
    })();
  }

  function onBooted() {
    View.mount();
    var m = readMeta();
    if (m.loggedIn) {
      if (E.decision) View.openDecision();
      sync('push');
    } else {
      // A cookie may still be valid (e.g. site data partly cleared): pick it up quietly.
      call('GET', '/auth/me', { okStatuses: [401] }).then(function (r) {
        if (r.status === 200 && r.data && r.data.user) return afterSignIn(r.data.user);
        setStatus(E.status === 'expired' ? 'expired' : 'anon');
        setTimeout(View.intro, 1200);
      }).catch(function () { setStatus('anon'); });
    }
    D.addEventListener('visibilitychange', function () {
      if (D.visibilityState === 'hidden') { if (readMeta().loggedIn) sync('push', { keepalive: true }); }
      else sync('pull');
    });
    W.addEventListener('online', function () { sync('pull'); });
    W.addEventListener('focus', function () { if (E.reload) tryReload(); });
    D.addEventListener('focusout', function () { if (E.reload) setTimeout(tryReload, 300); });
    W.addEventListener('storage', function (e) { if (e.key === META_KEY) setStatus(readMeta().loggedIn ? E.status : 'anon'); });
    setInterval(function () { if (D.visibilityState !== 'hidden') sync('pull'); }, PULL_INTERVAL_MS);
  }

  function start() {
    deviceId();
    var m = readMeta();
    watchBoot();
    if (!m.loggedIn || !subtle) { openGate(); setStatus(m.loggedIn ? 'error' : 'anon', subtle ? '' : '当前浏览器环境不支持加密校验，云同步已停用。'); return; }
    var timer = setTimeout(openGate, (W.navigator && W.navigator.onLine === false) ? 0 : GATE_MS);
    sync('pull').then(function () { clearTimeout(timer); openGate(); }, function () { clearTimeout(timer); openGate(); });
  }

  var API_OBJ = Object.assign({}, CORE, {
    status: function () { return { trace: E.trace.slice(), status: E.status, detail: E.detail, meta: readMeta(), media: E.media, booted: isBooted(), decision: Boolean(E.decision), reload: Boolean(E.reload) }; },
    syncNow: function () { return sync('pull'); },
    syncMedia: function () { return mediaSync(); },
    open: function () { View.openPanel(); }
  });
  W.__DELF50_CLOUD = API_OBJ;

  try { start(); } catch (e) { openGate(); if (W.console) W.console.error('[delf50-cloud]', e); }
  return API_OBJ;
});
