#!/usr/bin/env node
'use strict';
/**
 * Listening in real browsers: every tap on the player must play the
 * recording — pre-generated audio read by native French (France) voices
 * (audio/<level>/<id>.mp3, scripts/listening-audio.py) — and never the
 * browser's or the system's own voices.
 *
 * The app is served from this checkout with the API mocked (no account, no
 * database). The page's <audio> element and speechSynthesis are only
 * instrumented to log what happens.
 *
 *   Chromium (Chrome's engine), and WebKit (Safari's engine) when installed:
 *     a tap on play starts the recording inside the tap and its time moves
 *     on; nothing is read by speechSynthesis; the recording plays to the end
 *     and the player is back at the start; it plays again; pause holds the
 *     time and resume goes on; next / previous / a sentence of the
 *     transcript go to that sentence's start; the highlighted sentence is
 *     the one being heard; the speed changes the playback rate.
 *
 * Needs Playwright (from NODE_PATH); WebKit is optional (npx playwright
 * install webkit, and install-deps webkit). No speech engine is needed.
 *
 * Run: node scripts/check-speech.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
// The API's record spec, without its database driver (not needed here).
const dbPath = path.join(ROOT, 'api/_lib/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };
const records = require(path.join(ROOT, 'api/_lib/records.js'));

const results = [];
let failed = 0;
const check = (ok, label, detail) => {
  if (!ok) failed++;
  results.push(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
};

const TYPES = { '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    const size = fs.statSync(f).size, type = TYPES[path.extname(f)] || 'application/octet-stream';
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (range) { // as a CDN serves audio: byte ranges, so that the browser can seek
      const start = range[1] ? Number(range[1]) : 0, end = range[2] ? Number(range[2]) : size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      fs.createReadStream(f, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': size });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

// Runs in the page before the app: logs the audio element and any read-aloud.
const instrument = `(() => {
  const log = window.__ev = [];
  if (window.speechSynthesis) { const speak = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = (u) => { log.push({ kind: 'speechSynthesis', text: u.text }); return speak(u); }; }
  let inTap = false;
  addEventListener('click', () => { inTap = true; }, true);
  addEventListener('click', () => { inTap = false; }, false);
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (!this.__logged) { this.__logged = true; this.addEventListener('ended', () => log.push({ kind: 'ended' })); }
    window.__media = this; log.push({ kind: 'play', inTap, src: this.currentSrc || this.src }); return play.call(this);
  };
})();`;

async function session(browser, base, level, day, item) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(instrument);
  await ctx.route('**/api/v1/**', (route) => {
    const p = new URL(route.request().url()).pathname.replace('/api/v1/', '');
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (p === 'bootstrap') return json({ user: { id: 'u', email: 'learner@example.com', name: 'Learner' }, course: level === 'b2' ? 'delf-b2' : 'delf-b1', collections: records.collections(), state: { day: 1, intensity: 'high', onboarded: true }, rev: 1, positions: {}, keys: {} });
    if (p === 'settings') return json({ available: true, prefs: { locale: 'zh-CN' } });
    if (p === 'sync') return json({ rev: 2 });
    if (p === 'rev') return json({ rev: 1 });
    if (p === 'courses') return json({ enrolled: [] });
    return json({});
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}/#/${level}/day/${day}/listening/${item}`);
  await page.waitForSelector('.player [data-act=toggle]', { timeout: 15000 });
  const media = () => page.evaluate(() => { const m = window.__media; return m ? { t: m.currentTime, paused: m.paused, rate: m.playbackRate, src: m.currentSrc, ended: m.ended } : null; });
  const ui = () => page.evaluate(() => { const now = document.querySelector('[data-script] .s.now'); return { cls: document.querySelector('.player').className, now: now ? now.dataset.s : null, alert: (document.querySelector('.player [role=alert]') || {}).textContent || null }; });
  const tap = (act) => page.click(`.player [data-act=${act}]`);
  const advancing = async (ms = 1500) => { const a = await media(); await page.waitForTimeout(ms); const b = await media(); return Boolean(a && b && !b.paused && b.t > a.t + 0.3); };
  return { ctx, page, errors, media, ui, tap, advancing };
}

async function run(name, browser, base) {
  results.push(`\n${name}`);
  const timing = (level, id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'audio', level, id + '.json'), 'utf8'));

  // A short monologue (B1 Day 1), played to the end and again.
  let s = await session(browser, base, 'b1', 1, 1);
  await s.tap('toggle');
  const first = (await s.page.evaluate(() => window.__ev)).find((x) => x.kind === 'play');
  check(first && first.inTap && /\/audio\/b1\/L01-1\.mp3$/.test(first.src), 'a tap on play starts the recording audio/b1/L01-1.mp3, inside the tap', first);
  const t0 = Date.now();
  await s.page.waitForFunction(() => window.__media && window.__media.currentTime > 0.05, null, { timeout: 4000 }).catch(() => {});
  const latency = Date.now() - t0;
  check(latency < 4000 && await s.advancing(), `the recording is playing (heard ${latency} ms after the tap; its time moves on)`, await s.media());
  const done = await s.page.waitForFunction(() => document.querySelector('.player').classList.contains('idle'), null, { timeout: 30000 }).then(() => true, () => false);
  const ended = (await s.page.evaluate(() => window.__ev)).some((x) => x.kind === 'ended');
  check(done && ended && (await s.media()).t < 0.5, 'it plays to the end, and the player is back at the start', await s.ui());
  await s.tap('toggle');
  // Some engines (WebKit on Linux) take a moment to start again after the end.
  await s.page.waitForFunction(() => window.__media && window.__media.currentTime > 0.2, null, { timeout: 4000 }).catch(() => {});
  check(await s.advancing(1000) && (await s.media()).t < 5, 'played again from the start (DELF plays recordings twice)', await s.media());
  check(!(await s.page.evaluate(() => window.__ev)).some((x) => x.kind === 'speechSynthesis'), 'nothing is read by the browser’s or the system’s voices');
  check(!s.errors.length, 'no page errors', s.errors);
  await s.ctx.close();

  // A dialogue (B1 Day 23, item 3): pause / resume, sentences, transcript, speed.
  const T = timing('b1', 'L23-3');
  s = await session(browser, base, 'b1', 23, 3);
  await s.tap('toggle');
  await s.page.waitForTimeout(1200);
  await s.tap('toggle'); // pause
  const held = await s.media(); await s.page.waitForTimeout(800); const still = await s.media();
  check(held.paused && Math.abs(still.t - held.t) < 0.05, 'pause holds the recording', { held, still });
  await s.tap('toggle'); // resume
  check(await s.advancing(800) && (await s.media()).t >= held.t, 'resume goes on from there', await s.media());
  await s.tap('snext');
  let m = await s.media();
  check(m.t >= T.t[1] - 0.05 && m.t < T.t[1] + 1, `next sentence: the recording goes to sentence 2 (${T.t[1]} s)`, m);
  await s.tap('snext'); await s.tap('sprev');
  m = await s.media();
  check(m.t >= T.t[1] - 0.05 && m.t < T.t[1] + 1, 'previous sentence: back to sentence 2', m);
  await s.page.click('[data-act=script]');
  await s.page.click('[data-script] [data-s="5"]');
  m = await s.media();
  check(m.t >= T.t[5] - 0.05 && m.t < T.t[5] + 1 && !m.paused, `a sentence of the transcript plays from its start (${T.t[5]} s)`, m);
  await s.page.waitForTimeout(600);
  check((await s.ui()).now === '5', 'the highlighted sentence is the one being heard', await s.ui());
  await s.page.click('.player [data-act=rate][data-r="0.8"]');
  check(Math.abs((await s.media()).rate - 0.8) < 1e-6, 'the speed changes the playback rate (0.8×)', await s.media());
  check(!(await s.page.evaluate(() => window.__ev)).some((x) => x.kind === 'speechSynthesis') && !s.errors.length, 'no read-aloud and no page errors in a dialogue', s.errors);
  await s.ctx.close();

  // The browser cuts every script into the same sentences as its recording was timed on (Intl.Segmenter differs
  // between engines; a different cut would highlight the wrong sentence).
  const all = [];
  for (const [level, dir] of [['b1', 'course/days'], ['b2', 'course/b2/days']]) {
    for (const f of fs.readdirSync(path.join(ROOT, dir)).filter((x) => /^\d+\.json$/.test(x))) {
      for (const it of JSON.parse(fs.readFileSync(path.join(ROOT, dir, f), 'utf8')).items.listening) {
        const j = path.join(ROOT, 'audio', level, it.id + '.json');
        if (fs.existsSync(j)) all.push({ key: `${level}:${it.id}`, script: it.script, texts: JSON.parse(fs.readFileSync(j, 'utf8')).texts });
      }
    }
  }
  s = await session(browser, base, 'b1', 1, 1);
  const differ = await s.page.evaluate(async (all) => {
    const { segments } = await import('/app/speech.js');
    return all.filter((x) => JSON.stringify(segments(x.script).map((y) => y.text)) !== JSON.stringify(x.texts)).map((x) => x.key);
  }, all);
  check(all.length === 350 && !differ.length, `this browser cuts all ${all.length} scripts into exactly the recordings’ sentences`, differ.slice(0, 5));
  await s.ctx.close();

  // The network fails while the recording loads: the player says so, and the next tap loads it again and plays.
  s = await session(browser, base, 'b1', 1, 1);
  let aborted = 0;
  await s.page.route('**/audio/b1/L01-2.mp3', (route) => (aborted++ < 2 ? route.abort('failed') : route.continue()));
  await s.page.click('.pager a >> nth=1').catch(() => s.page.goto(`${base}/#/b1/day/1/listening/2`));
  await s.page.waitForFunction(() => location.hash.endsWith('/listening/2'));
  await s.page.waitForSelector('.player [data-act=toggle]');
  await s.page.waitForTimeout(800);
  await s.tap('toggle');
  const told = await s.page.waitForSelector('.player [role=alert]', { timeout: 5000 }).then(() => true, () => false);
  await s.tap('toggle');
  await s.page.waitForFunction(() => window.__media && window.__media.currentTime > 0.3, null, { timeout: 6000 }).catch(() => {});
  check(aborted >= 2 && told && await s.advancing(800), 'a recording that failed to load twice (network): the player says so, and the next tap loads it again and plays', { aborted, told, m: await s.media() });
  await s.ctx.close();

  // B2 has its own recordings (same item ids as B1).
  s = await session(browser, base, 'b2', 50, 3);
  await s.tap('toggle');
  const b2 = (await s.page.evaluate(() => window.__ev)).find((x) => x.kind === 'play');
  check(b2 && /\/audio\/b2\/L50-3\.mp3$/.test(b2.src) && await s.advancing(), 'a B2 page plays the B2 recording (audio/b2/L50-3.mp3)', b2);
  await s.ctx.close();
}

(async () => {
  let pw;
  for (const id of ['playwright', 'playwright-core']) { try { pw = require(id); break; } catch (e) { /* next */ } }
  if (!pw) { console.log('skip: Playwright is not installed (NODE_PATH)'); return; }
  const { server, base } = await serve();
  try {
    const chromium = await pw.chromium.launch({ args: ['--autoplay-policy=user-gesture-required'] });
    try { await run('Chromium (Chrome’s engine)', chromium, base); } finally { await chromium.close(); }
    let webkit = null;
    try { webkit = await pw.webkit.launch(); } catch (e) { results.push('\nWebKit (Safari’s engine)\n  skip: WebKit is not installed'); }
    if (webkit) try { await run('WebKit (Safari’s engine)', webkit, base); } finally { await webkit.close(); }
  } catch (e) {
    check(false, 'run aborted', e.stack || String(e));
  } finally { server.close(); }
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} check(s) FAILED.` : '\nAll listening checks passed.');
  process.exit(failed ? 1 : 0);
})();
