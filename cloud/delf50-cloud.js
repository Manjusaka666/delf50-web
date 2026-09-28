/*!
 * DELF50 Cloud: sign-in and live saving of every learning record.
 *
 * Loaded by index.html before the app bundle; it does not change any app
 * code. The app keeps calling localStorage / IndexedDB as before, but:
 *  - `delf50_*` localStorage keys live in memory only. The learning state is
 *    loaded from the server before the app starts (the bundle waits), and
 *    each save is diffed against the last server-confirmed state and sent as
 *    fine-grained changes within ~60–300 ms (one request in flight).
 *  - The recordings database (delf50_audio_v1) is served by the API: a saved
 *    clip is uploaded to R2 at once, a played clip is fetched from it.
 * Nothing is kept in the browser beyond the page's lifetime.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (W) {
  'use strict';

  // ───────── change detection (pure; also used by the tests) ─────────

  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var isObj = function (v) { return v !== null && typeof v === 'object' && !Array.isArray(v); };

  function equal(a, b) {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var i = 0; i < ka.length; i++) if (!has(b, ka[i]) || !equal(a[ka[i]], b[ka[i]])) return false;
    return true;
  }

  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (isObj(v)) return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }

  /** 53-bit string hash (cyrb53), base 36. */
  function hash(s) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  /** A list item's identity: its content plus its occurrence among equals. */
  function itemKeys(list) {
    var seen = {};
    return list.map(function (x) { var h = hash(stable(x)); seen[h] = (seen[h] || 0) + 1; return h + '.' + seen[h]; });
  }

  function getPath(o, p) {
    for (var i = 0; i < p.length; i++) { if (!isObj(o)) return undefined; o = o[p[i]]; }
    return o;
  }

  /**
   * S without the record collections (those are rows, not document). A
   * two-level map keeps its first level as an empty skeleton.
   */
  function docView(S, spec) {
    var out = Object.assign({}, S);
    spec.forEach(function (c) {
      var o = out, last = c.path[c.path.length - 1];
      for (var i = 0; i < c.path.length - 1; i++) {
        if (!isObj(o[c.path[i]])) return;
        o = o[c.path[i]] = Object.assign({}, o[c.path[i]]);
      }
      if (c.kind === 'map2' && isObj(o[last])) {
        var sk = {};
        Object.keys(o[last]).forEach(function (m) { sk[m] = isObj(o[last][m]) ? {} : o[last][m]; });
        o[last] = sk;
      } else delete o[last];
    });
    return out;
  }

  function diffDoc(a, b, path, out) {
    Object.keys(a).forEach(function (k) { if (!has(b, k)) out.push([path.concat(k)]); });
    Object.keys(b).forEach(function (k) {
      if (isObj(a[k]) && isObj(b[k])) diffDoc(a[k], b[k], path.concat(k), out);
      else if (!has(a, k) || !equal(a[k], b[k])) out.push([path.concat(k), b[k]]);
    });
    return out;
  }

  function diffMap(A, B, prefix, ch) {
    Object.keys(A).forEach(function (k) { if (!has(B, k)) ch.del.push(prefix.concat(k)); });
    Object.keys(B).forEach(function (k) { if (!has(A, k) || !equal(A[k], B[k])) ch.set.push([prefix.concat(k), B[k]]); });
  }

  /** Keyed list diff; positions of kept items never move, new ones go between. */
  function diffList(A, posA, B, ch) {
    var kA = itemKeys(A), kB = itemKeys(B), at = {};
    kA.forEach(function (k, i) { at[k] = posA[i]; });
    var pos = kB.map(function (k) { return has(at, k) ? at[k] : null; });
    var ok = posA.length === A.length, last = -Infinity;
    for (var j = 0; ok && j < B.length; j++) {
      if (pos[j] === null) {
        var n = j + 1; while (n < B.length && pos[n] === null) n++;
        var hi = n < B.length ? pos[n] : Infinity;
        pos[j] = last === -Infinity ? (hi === Infinity ? j : hi - 1) : (hi === Infinity ? last + 1 : (last + hi) / 2);
        if (!(pos[j] > last && pos[j] < hi)) ok = false;
        ch.set.push([[kB[j]], B[j], pos[j]]);
      } else if (!(pos[j] > last)) ok = false;
      last = pos[j];
    }
    var keep = {};
    kB.forEach(function (k) { keep[k] = 1; });
    if (!ok) { // order changed: renumber everything
      ch.set = kB.map(function (k, i) { return [[k], B[i], i]; });
      pos = kB.map(function (k, i) { return i; });
    }
    kA.forEach(function (k) { if (!keep[k]) ch.del.push([k]); });
    return pos;
  }

  /**
   * The change batch from confirmed state `a` (list positions `posA`) to `b`.
   * Returns {doc, ops, pos, empty}.
   */
  function diff(a, posA, b, spec) {
    var doc = diffDoc(docView(a, spec), docView(b, spec), [], []);
    var ops = {}, pos = {}, empty = !doc.length;
    spec.forEach(function (c) {
      var A = getPath(a, c.path), B = getPath(b, c.path), ch = { set: [], del: [] };
      if (c.kind === 'list') {
        A = Array.isArray(A) ? A : []; B = Array.isArray(B) ? B : [];
        pos[c.name] = equal(A, B) && (posA[c.name] || []).length === A.length ? posA[c.name] : diffList(A, posA[c.name] || [], B, ch);
      } else {
        A = isObj(A) ? A : {}; B = isObj(B) ? B : {};
        if (c.kind === 'map2') {
          Object.keys(A).forEach(function (m) { if (!isObj(B[m])) diffMap(isObj(A[m]) ? A[m] : {}, {}, [m], ch); });
          Object.keys(B).forEach(function (m) { diffMap(isObj(A[m]) ? A[m] : {}, isObj(B[m]) ? B[m] : {}, [m], ch); });
        } else diffMap(A, B, [], ch);
      }
      if (ch.set.length || ch.del.length) { ops[c.name] = ch; empty = false; }
    });
    return { doc: doc, ops: ops, pos: pos, empty: empty };
  }

  var CORE = { diff: diff, docView: docView, itemKeys: itemKeys, equal: equal, stable: stable };
  if (!W || !W.document || W.__DELF50_CLOUD) return CORE;

  // ───────── browser layer ─────────

  var D = W.document;
  var API = '/api/v1';
  var STATE_KEY = 'delf50_v12_state';
  var AUDIO_DB = 'delf50_audio_v1';
  var DEBOUNCE_MS = 60, MAX_WAIT_MS = 300;
  var PART_BYTES = 3.5 * 1024 * 1024;
  var realFetch = W.fetch.bind(W);

  var E = {
    user: null, spec: [], rev: 0, ready: false,
    acked: {}, ackedText: null, pos: {},
    inflight: false, timer: 0, dirtySince: 0, failures: 0, retry: 0,
    uploads: 0, savedAt: null, status: 'loading', error: null, latency: []
  };

  // ── memory-only storage for the app's keys ──

  var mem = new Map();
  var LS = null;
  try { LS = W.localStorage; } catch (e) { LS = null; }
  var SP = W.Storage && W.Storage.prototype;
  if (SP) {
    var rawGet = SP.getItem, rawSet = SP.setItem, rawDel = SP.removeItem;
    var mine = function (s, k) { return s === LS && typeof k === 'string' && k.indexOf('delf50_') === 0; };
    SP.getItem = function (k) { return mine(this, k) ? (mem.has(k) ? mem.get(k) : null) : rawGet.call(this, k); };
    SP.setItem = function (k, v) {
      if (!mine(this, k)) return rawSet.call(this, k, v);
      mem.set(k, String(v));
      if (k === STATE_KEY) changed();
    };
    SP.removeItem = function (k) { return mine(this, k) ? void mem.delete(k) : rawDel.call(this, k); };
    // Earlier versions kept data in the browser; the account is now the only copy.
    try {
      for (var i = LS.length - 1; i >= 0; i--) { var k = LS.key(i); if (k && k.indexOf('delf50_') === 0) rawDel.call(LS, k); }
      ['delf50_cloud_v1', AUDIO_DB].forEach(function (n) { W.indexedDB.deleteDatabase(n); });
    } catch (e) { /* storage unavailable */ }
  }

  // ── HTTP ──

  function call(method, path, body, opts) {
    opts = opts || {};
    var init = { method: method, credentials: 'same-origin', keepalive: Boolean(opts.keepalive), headers: {} };
    if (body instanceof Blob) { init.body = body; init.headers['Content-Type'] = 'application/octet-stream'; }
    else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
    return realFetch(API + path, init).then(function (r) {
      if (opts.raw && r.ok) return r;
      return r.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (e) { data = null; }
        if (!r.ok) {
          var err = new Error((data && ((data.error && data.error.message) || data.message)) || ('HTTP ' + r.status));
          err.status = r.status; err.code = data && ((data.error && data.error.code) || data.code);
          throw err;
        }
        return data;
      });
    });
  }

  // ── live saving ──

  function changed() {
    if (!E.ready) return;
    if (!E.dirtySince) E.dirtySince = Date.now();
    clearTimeout(E.timer);
    E.timer = setTimeout(flush, Math.max(0, Math.min(DEBOUNCE_MS, MAX_WAIT_MS - (Date.now() - E.dirtySince))));
  }

  function pending() {
    var text = mem.get(STATE_KEY);
    return text !== undefined && text !== E.ackedText;
  }

  function batchFor(text) {
    var next = JSON.parse(text);
    var d = diff(E.acked, E.pos, next, E.spec);
    return { next: next, d: d, body: { doc: d.doc, ops: d.ops, device: 'web' } };
  }

  function flush() {
    clearTimeout(E.timer);
    if (E.inflight || !E.ready || !pending()) return;
    var text = mem.get(STATE_KEY), b = batchFor(text), t0 = Date.now(), since = E.dirtySince || t0;
    E.dirtySince = 0;
    if (b.d.empty) { E.acked = b.next; E.ackedText = text; E.pos = b.d.pos; return; }
    E.inflight = true; setStatus('saving');
    call('POST', '/sync', b.body).then(function (r) {
      E.acked = b.next; E.ackedText = text; E.pos = b.d.pos; E.rev = r.rev;
      E.failures = 0; E.savedAt = new Date(); E.latency.push([Date.now() - since, Date.now() - t0]);
      if (E.latency.length > 50) E.latency.shift();
    }, function (e) {
      E.failures++;
      E.error = e;
      if (e.status === 401) { E.ready = false; View.login('登录已过期，请重新登录；未保存的内容会在登录后自动保存。'); }
    }).then(function () {
      E.inflight = false;
      if (E.failures) {
        setStatus('error');
        clearTimeout(E.retry);
        if (E.ready) E.retry = setTimeout(flush, Math.min(15000, 500 * Math.pow(2, E.failures)));
      } else if (pending()) flush();
      else setStatus(E.uploads ? 'saving' : 'saved');
    });
  }

  // Last chance when the page goes away: the same batch, sent with keepalive
  // (idempotent, so racing an in-flight request is harmless).
  W.addEventListener('pagehide', function () {
    if (!E.ready || !pending()) return;
    try { call('POST', '/sync', batchFor(mem.get(STATE_KEY)).body, { keepalive: true }).catch(function () {}); } catch (e) { /* too large for keepalive */ }
  });
  W.addEventListener('beforeunload', function (e) {
    if (E.ready && (pending() || E.inflight || E.uploads)) { e.preventDefault(); e.returnValue = ''; }
  });
  // Another device may have saved meanwhile: reload onto the server's state.
  D.addEventListener('visibilitychange', function () {
    if (D.visibilityState === 'hidden') { flush(); return; }
    if (!E.ready || pending() || E.inflight) return;
    call('GET', '/rev').then(function (r) { if (r.rev !== E.rev && !pending() && !E.inflight) W.location.reload(); }, function () {});
  });

  // ── recordings: the app's IndexedDB store, served from R2 ──

  var clips = new Map();

  function fire(target, name, value) { setTimeout(function () { if (typeof target[name] === 'function') target[name]({ target: target, type: name }); }, 0); }

  function uploadOnce(id, blob) {
    var n = Math.max(1, Math.ceil(blob.size / PART_BYTES));
    var q = '/media/raw?clipId=' + encodeURIComponent(id) + '&type=' + encodeURIComponent(blob.type || 'audio/webm') + '&size=' + blob.size + '&parts=' + n + '&part=';
    var p = Promise.resolve();
    for (var i = 0; i < n; i++) (function (i) { p = p.then(function () { return call('PUT', q + i, blob.slice(i * PART_BYTES, (i + 1) * PART_BYTES)); }); })(i);
    return n > 1 ? p.then(function () { return call('POST', '/media/complete', { clipId: id, parts: n }); }) : p;
  }

  /** Settles after the first attempt either way; a failed clip keeps retrying. */
  function upload(id, blob) {
    E.uploads++; setStatus('saving');
    var tries = 0;
    return new Promise(function (settle) {
      (function attempt() {
        uploadOnce(id, blob).then(function () {
          E.uploads--; settle();
          setStatus(E.failures ? 'error' : (E.uploads || E.inflight ? 'saving' : 'saved'));
        }, function (e) {
          E.error = e; settle(); setStatus('error');
          setTimeout(attempt, Math.min(15000, 1000 * Math.pow(2, tries++)));
        });
      })();
    });
  }

  function download(id) {
    if (clips.has(id)) return Promise.resolve(clips.get(id));
    var q = '/media/raw?clipId=' + encodeURIComponent(id) + '&part=';
    return call('GET', q + 0, undefined, { raw: true }).then(function (r) {
      var n = Number(r.headers.get('X-Parts')) || 1, type = r.headers.get('Content-Type') || 'audio/webm', parts = [r.blob()];
      for (var i = 1; i < n; i++) parts.push(call('GET', q + i, undefined, { raw: true }).then(function (x) { return x.blob(); }));
      return Promise.all(parts).then(function (b) { var blob = new Blob(b, { type: type }); clips.set(id, blob); return blob; });
    }, function (e) { if (e.status === 404 || e.status === 409) return null; throw e; });
  }

  var audioDb = {
    objectStoreNames: { contains: function () { return true; } },
    createObjectStore: function () {},
    close: function () {},
    transaction: function () {
      var tx = { error: null };
      tx.objectStore = function () {
        return {
          put: function (rec) {
            clips.set(rec.id, rec.blob);
            var req = { result: rec.id };
            upload(rec.id, rec.blob).then(function () { fire(req, 'onsuccess'); fire(tx, 'oncomplete'); });
            return req;
          },
          get: function (id) {
            var req = { result: undefined, error: null };
            download(id).then(function (blob) {
              req.result = blob ? { id: id, blob: blob } : undefined;
              fire(req, 'onsuccess'); fire(tx, 'oncomplete');
            }, function (e) { req.error = tx.error = e; fire(req, 'onerror'); fire(tx, 'onerror'); });
            return req;
          }
        };
      };
      return tx;
    }
  };

  if (W.indexedDB) {
    var realOpen = W.indexedDB.open.bind(W.indexedDB);
    W.indexedDB.open = function (name, version) {
      if (name !== AUDIO_DB) return realOpen(name, version);
      var req = { result: audioDb, error: null };
      fire(req, 'onsuccess');
      return req;
    };
  }

  // ── start: the app bundle waits until the account's state is loaded ──

  var openGate, gate = new Promise(function (r) { openGate = r; });
  W.fetch = function (input, init) {
    var p = realFetch(input, init);
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    return /\/api\/source\?/.test(url) ? p.then(function (r) { return gate.then(function () { return r; }); }) : p;
  };

  function load() {
    setStatus('loading');
    return call('GET', '/bootstrap').then(function (b) {
      var resumed = Boolean(E.user); // signed in again after the session expired mid-study
      if (resumed && E.user.id !== b.user.id) { W.location.reload(); return; }
      E.user = b.user; E.spec = b.collections; E.rev = b.rev; E.pos = b.positions || {};
      E.acked = b.state || {};
      E.ackedText = b.state ? JSON.stringify(b.state) : null;
      if (!resumed && b.state) mem.set(STATE_KEY, E.ackedText);
      E.ready = true; E.failures = 0;
      setStatus('saved');
      View.close();
      openGate();
      if (pending()) flush(); // saves made while signed out (session expiry)
      call('GET', '/auth/get-session').catch(function () {}); // keeps the session fresh
    }, function (e) {
      if (e.status === 401) View.login();
      else View.fatal(e);
    });
  }

  // ── UI ──

  var CSS = [
    '.dc-chip{position:fixed;top:max(8px,env(safe-area-inset-top));right:10px;z-index:60;display:flex;align-items:center;gap:6px;border:1px solid var(--line,#dfe9e5);background:rgba(255,255,255,.96);border-radius:999px;padding:6px 11px;font:750 11px -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:var(--ink,#18332d);cursor:pointer;box-shadow:0 4px 16px rgba(20,60,50,.08);max-width:62vw}',
    '.dc-chip span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dc-dot{width:8px;height:8px;border-radius:50%;background:#a9b5b1;flex:none}',
    '.dc-dot.saved{background:#2f8f6f}.dc-dot.saving{background:#d4a017}.dc-dot.error{background:#c0463f}',
    '.dc-mask{position:fixed;inset:0;z-index:70;background:rgba(15,35,30,.38);display:flex;align-items:flex-start;justify-content:center;padding:max(16px,env(safe-area-inset-top)) 16px 16px;overflow:auto;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:var(--ink,#18332d)}',
    '.dc-panel{width:min(420px,100%);background:#fff;border-radius:18px;padding:18px;box-shadow:0 20px 60px rgba(10,40,30,.25);margin-top:8vh}',
    '.dc-panel h3{margin:0 0 4px;font-size:17px}.dc-sub{font-size:12px;color:var(--muted,#6c7d78);line-height:1.6;margin:0 0 12px}',
    '.dc-tabs{display:flex;gap:6px;margin:0 0 12px}.dc-tabs button{flex:1;border:1px solid var(--line,#dfe9e5);background:#fff;border-radius:10px;padding:8px;font-weight:700;cursor:pointer}.dc-tabs button.on{background:var(--brand,#0b6b58);border-color:var(--brand,#0b6b58);color:#fff}',
    '.dc-field{display:block;margin:0 0 10px;font-size:12px;color:var(--muted,#6c7d78)}.dc-field input{display:block;width:100%;box-sizing:border-box;margin-top:4px;border:1px solid var(--line,#dfe9e5);border-radius:11px;padding:10px 11px;font-size:15px}',
    '.dc-btn{width:100%;border:0;background:var(--brand,#0b6b58);color:#fff;font-weight:800;border-radius:12px;padding:11px 14px;cursor:pointer;font-size:13px;margin-top:4px}.dc-btn.sec{background:#fff;color:inherit;border:1px solid var(--line,#dfe9e5)}.dc-btn:disabled{opacity:.5}',
    '.dc-msg{font-size:12px;line-height:1.6;border-radius:10px;padding:9px 11px;margin:10px 0 0;background:#fbefee;color:#7c403d}',
    '.dc-kv{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:12px;margin:8px 0 12px}.dc-kv b{color:var(--muted,#6c7d78)}'
  ].join('');

  var TZ = 'Europe/Zurich';
  function fmt(d) { try { return d.toLocaleString('zh-CN', { timeZone: TZ, hour12: false }); } catch (e) { return d.toLocaleString(); } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function errText(e) {
    var map = {
      INVALID_EMAIL_OR_PASSWORD: '邮箱或密码不正确。', USER_ALREADY_EXISTS: '该邮箱已注册，请直接登录。',
      USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: '该邮箱已注册，请直接登录。', PASSWORD_TOO_SHORT: '密码至少 8 位。',
      INVALID_EMAIL: '邮箱格式不正确。', EMAIL_NOT_VERIFIED: '请先完成邮箱验证。'
    };
    if (e && !e.status) return '无法连接服务器，请检查网络后重试。';
    return (e && map[e.code]) || (e && e.message) || '操作失败';
  }

  function setStatus(s) { E.status = s; View.chip(); }

  var View = (function () {
    var chip, mask, tab = 'login';

    function mount() {
      if (chip || !D.body) return;
      var st = D.createElement('style'); st.textContent = CSS; D.head.appendChild(st);
      chip = D.createElement('button'); chip.type = 'button'; chip.className = 'dc-chip';
      chip.addEventListener('click', function () { if (E.user) account(); });
      D.body.appendChild(chip);
    }

    function chipView() {
      mount();
      if (!chip) return;
      var text = { loading: '正在载入学习记录…', saving: '保存中…', saved: '已保存', error: '保存失败 · 自动重试中', signedout: '请登录' }[E.status] || '';
      chip.innerHTML = '<i class="dc-dot ' + E.status + '"></i><span>' + (E.user ? esc(E.user.name || E.user.email) + ' · ' : '') + text + '</span>';
    }

    function close() { if (mask) { mask.remove(); mask = null; } }

    function shell(html, dismissable) {
      mount(); close();
      mask = D.createElement('div'); mask.className = 'dc-mask';
      mask.innerHTML = '<div class="dc-panel" role="dialog" aria-modal="true">' + html + '</div>';
      if (dismissable) mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
      D.body.appendChild(mask);
      return mask;
    }

    function login(msg) {
      setStatus('signedout');
      var reg = tab === 'register';
      var m = shell('<h3>' + (reg ? '注册' : '登录') + ' DELF50</h3>' +
        '<p class="dc-sub">登录后开始学习。答题、写作、口语录音、错题、草稿和每日进度都会实时保存到你的账号，换设备登录即可继续。</p>' +
        '<div class="dc-tabs"><button type="button" data-t="login" class="' + (reg ? '' : 'on') + '">登录</button><button type="button" data-t="register" class="' + (reg ? 'on' : '') + '">注册</button></div>' +
        '<form novalidate>' +
        (reg ? '<label class="dc-field">昵称<input name="name" maxlength="60" autocomplete="nickname"></label>' : '') +
        '<label class="dc-field">邮箱<input name="email" type="email" autocomplete="username" required></label>' +
        '<label class="dc-field">密码' + (reg ? '（至少 8 位）' : '') + '<input name="password" type="password" autocomplete="' + (reg ? 'new-password' : 'current-password') + '" required></label>' +
        '<button class="dc-btn" type="submit">' + (reg ? '注册并开始学习' : '登录') + '</button></form>' +
        (msg ? '<div class="dc-msg">' + esc(msg) + '</div>' : ''));
      Array.prototype.forEach.call(m.querySelectorAll('[data-t]'), function (b) {
        b.addEventListener('click', function () { tab = b.getAttribute('data-t'); login(); });
      });
      var form = m.querySelector('form');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var f = {}; Array.prototype.forEach.call(form.elements, function (el) { if (el.name) f[el.name] = el.value.trim(); });
        var btn = form.querySelector('button'); btn.disabled = true; btn.textContent = '请稍候…';
        var body = { email: f.email, password: f.password };
        if (reg) body.name = f.name || f.email.split('@')[0];
        call('POST', '/auth/' + (reg ? 'sign-up/email' : 'sign-in/email'), body).then(load, function (err) { login(errText(err)); });
      });
    }

    function account() {
      var m = shell('<h3>账号</h3><div class="dc-kv"><b>账号</b><span>' + esc(E.user.email) + '</span>' +
        '<b>状态</b><span>' + esc({ saving: '保存中…', saved: '全部已保存', error: '保存失败，自动重试中' }[E.status] || '') + '</span>' +
        '<b>最近保存</b><span>' + (E.savedAt ? esc(fmt(E.savedAt)) : '—') + '</span></div>' +
        (E.status === 'error' && E.error ? '<div class="dc-msg">' + esc(errText(E.error)) + '</div>' : '') +
        '<button class="dc-btn sec" data-a="out">退出登录</button>', true);
      m.querySelector('[data-a="out"]').addEventListener('click', function (e) {
        e.target.disabled = true;
        flush();
        call('POST', '/auth/sign-out', {}).then(null, function () {}).then(function () { E.ready = false; W.location.reload(); });
      });
    }

    function fatal(e) {
      var m = shell('<h3>暂时无法载入学习记录</h3><p class="dc-sub">为保证每条记录都保存到账号，载入成功后才会开始学习。</p><div class="dc-msg">' + esc(errText(e)) + '</div><button class="dc-btn" data-a="retry">重试</button>');
      m.querySelector('[data-a="retry"]').addEventListener('click', function () { close(); load(); });
    }

    return { chip: chipView, login: login, close: close, fatal: fatal };
  })();

  var API_OBJ = Object.assign({}, CORE, {
    state: function () { return { status: E.status, user: E.user, rev: E.rev, ready: E.ready, pending: pending(), inflight: E.inflight, uploads: E.uploads, latency: E.latency.slice(), savedAt: E.savedAt }; },
    flush: flush
  });
  W.__DELF50_CLOUD = API_OBJ;

  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', function () { View.chip(); });
  load();
  return API_OBJ;
});
