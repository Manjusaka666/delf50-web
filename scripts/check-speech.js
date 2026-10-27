#!/usr/bin/env node
'use strict';
/**
 * Listening read-aloud in real browsers, against the device's real speech
 * engine (not a mock): every tap on the player must start audible speech.
 *
 * The app is served from this checkout with the API mocked (no account, no
 * database); speechSynthesis is the browser's own, only instrumented to log
 * each utterance, whether speak() ran inside the tap, and the engine's start /
 * end / error events.
 *
 *   Chromium: a tap on play speaks inside the tap and is heard (a start event);
 *     the recording plays to the end, back to the start, and again; pause and
 *     resume, next and previous sentence; a tap before the voices are listed;
 *     a voice that cannot be reached (silently drops speech) is replaced by
 *     another and the whole recording is read; with no voice able to speak,
 *     the player stops and says so.
 *   WebKit (Safari's engine, when installed): the app loads, the first
 *     utterance is spoken inside the tap (iOS refuses speech started later),
 *     and the engine starts it.
 *
 * Needs Playwright (from NODE_PATH) and a speech engine with a French voice.
 * On Linux: apt-get install speech-dispatcher speech-dispatcher-espeak-ng
 * espeak-ng pulseaudio; pulseaudio --start; pactl load-module
 * module-null-sink. WebKit is optional (npx playwright install webkit and
 * install-deps webkit); its Linux engine (flite) has no French voice and is
 * slow, so it is only checked for the tap.
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

const TYPES = { '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2' };
function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

// Runs in the page before the app: logs speech, optionally hides the voices for a while or makes them fail.
const instrument = ({ drop, lateVoices }) => `(() => {
  const log = window.__ev = [], t0 = performance.now(), T = () => Math.round(performance.now() - t0);
  let inTap = false;
  addEventListener('click', () => { inTap = true; }, true);
  addEventListener('click', () => { inTap = false; }, false);
  const drop = ${JSON.stringify(drop || null)};
  const speak = speechSynthesis.speak.bind(speechSynthesis);
  speechSynthesis.speak = (u) => {
    const silent = u.volume === 0 || !u.text.trim();
    const e = { kind: 'speak', t: T(), text: u.text, voice: u.voice ? u.voice.name : null, inTap, silent };
    log.push(e);
    if (!silent && drop && (drop === '*' || (u.voice && u.voice.name === drop))) { e.dropped = true; return; }
    for (const k of ['start', 'end', 'error']) u.addEventListener(k, (ev) => log.push({ kind: k, t: T(), text: u.text, error: ev.error }));
    return speak(u);
  };
  if (${lateVoices ? 'true' : 'false'}) { const gv = speechSynthesis.getVoices.bind(speechSynthesis); speechSynthesis.getVoices = () => (performance.now() - t0 < 4000 ? [] : gv()); }
})();`;

async function session(browser, base, opts = {}) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(instrument(opts));
  await ctx.route('**/api/v1/**', (route) => {
    const p = new URL(route.request().url()).pathname.replace('/api/v1/', '');
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (p === 'bootstrap') return json({ user: { id: 'u', email: 'learner@example.com', name: 'Learner' }, course: 'delf-b1', collections: records.collections(), state: { day: 1, intensity: 'high', onboarded: true }, rev: 1, positions: {}, keys: {} });
    if (p === 'settings') return json({ available: true, prefs: { locale: 'zh-CN', voice: opts.voice || null } });
    if (p === 'sync') return json({ rev: 2 });
    if (p === 'rev') return json({ rev: 1 });
    if (p === 'courses') return json({ enrolled: [] });
    return json({});
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}/#/b1/day/${opts.day || 1}/listening/${opts.item || 1}`);
  await page.waitForSelector('.player [data-act=toggle]', { timeout: 15000 });
  if (!opts.lateVoices) await page.waitForTimeout(1000); // the voices are listed
  const ev = () => page.evaluate(() => window.__ev);
  const tap = async (act) => { const n = (await ev()).length; await page.click(`.player [data-act=${act}]`); return n; };
  // The first audible utterance after event n: spoken inside the tap? started, and how soon?
  const heard = async (n, within) => {
    const until = Date.now() + within;
    for (;;) {
      const xs = (await ev()).slice(n), sp = xs.find((x) => x.kind === 'speak' && !x.silent && !x.dropped);
      const st = sp && xs.find((x) => x.kind === 'start' && x.text === sp.text && x.t >= sp.t);
      if (st || Date.now() > until) return { inTap: xs.some((x) => x.kind === 'speak' && x.inTap), start: st ? st.t - xs[0].t : null, voice: sp && sp.voice };
      await page.waitForTimeout(100);
    }
  };
  const state = () => page.evaluate(() => ({ cls: document.querySelector('.player').className, alert: (document.querySelector('.player [role=alert]') || {}).textContent || null }));
  const idle = (ms) => page.waitForFunction(() => document.querySelector('.player').classList.contains('idle'), null, { timeout: ms }).then(() => true, () => false);
  return { ctx, page, errors, ev, tap, heard, state, idle };
}

const words = (s) => (s.match(/[\p{L}\p{N}]+/gu) || []).length;

async function chromium(pw, base) {
  results.push('\nChromium (Chrome’s engine)');
  const browser = await pw.chromium.launch({ channel: 'chromium', args: ['--enable-speech-dispatcher'] });
  try {
    const probe = await browser.newPage();
    // The engine lists its voices a moment after the page loads.
    const fr = await probe.evaluate(() => new Promise((r) => {
      const n = () => speechSynthesis.getVoices().filter((v) => /^fr/i.test(v.lang)).length, until = Date.now() + 5000;
      (function poll() { if (n() || Date.now() > until) r(n()); else setTimeout(poll, 100); })();
    }));
    await probe.close();
    if (!fr) { results.push('  skip: no French voice in this speech engine (see the header for the Linux set-up)'); return; }

    const script = JSON.parse(fs.readFileSync(path.join(ROOT, 'course/days/01.json'), 'utf8')).items.listening[0].script.join(' ');
    let s = await session(browser, base);
    let h = await s.heard(await s.tap('toggle'), 3000);
    check(h.inTap && h.start !== null && h.start < 1500, `a tap on play is heard at once (speech starts inside the tap, ${h.start} ms)`, h);
    const done = await s.idle(60000);
    const said = (await s.ev()).filter((x) => x.kind === 'speak' && !x.silent).map((x) => x.text).join(' ');
    check(done && words(said) === words(script), 'the whole recording is read, then the player is back at the start', { done, said: words(said), script: words(script) });
    h = await s.heard(await s.tap('toggle'), 3000);
    check(h.inTap && h.start !== null, 'played again from the start (DELF plays recordings twice)', h);
    await s.page.waitForTimeout(800);
    await s.tap('toggle'); // pause
    await s.page.waitForTimeout(800);
    h = await s.heard(await s.tap('toggle'), 3000);
    check(h.inTap && h.start !== null, 'pause, then resume: heard again inside the tap', h);
    h = await s.heard(await s.tap('snext'), 3000);
    check(h.start !== null, 'next sentence is heard', h);
    h = await s.heard(await s.tap('sprev'), 3000);
    check(h.start !== null, 'previous sentence is heard', h);
    check(!s.errors.length, 'no page errors', s.errors);
    await s.ctx.close();

    s = await session(browser, base, { lateVoices: true });
    h = await s.heard(await s.tap('toggle'), 4000);
    const unlocked = (await s.ev()).some((x) => x.kind === 'speak' && x.silent && x.inTap);
    check(unlocked && h.start !== null, 'a tap before the voices are listed: speech is opened inside the tap, then heard', { unlocked, h });
    await s.ctx.close();

    // The voice the player would choose: the learner picked it, and it cannot be reached.
    const voice = await (async () => {
      const p = await browser.newPage();
      const v = await p.evaluate(() => new Promise((r) => {
        const until = Date.now() + 5000;
        (function poll() { const x = speechSynthesis.getVoices().find((y) => /^fr-FR/i.test(y.lang)); if (x || Date.now() > until) r(x ? x.name : null); else setTimeout(poll, 100); })();
      }));
      await p.close();
      return v;
    })();
    s = await session(browser, base, { voice, drop: voice });
    h = await s.heard(await s.tap('toggle'), 9000);
    const finished = await s.idle(60000);
    check(h.start !== null && h.voice !== voice && finished && !(await s.state()).alert,
      `the chosen voice cannot be reached: another voice reads the recording (heard after ${h.start} ms)`, { h, finished });
    await s.ctx.close();

    s = await session(browser, base, { drop: '*' });
    await s.tap('toggle');
    const stopped = await s.idle(25000), st = await s.state();
    check(stopped && Boolean(st.alert), 'no voice can speak: the player stops and says so (not a silent “playing”)', st);
    await s.ctx.close();
  } finally { await browser.close(); }
}

async function webkit(pw, base) {
  results.push('\nWebKit (Safari’s engine)');
  let browser;
  try { browser = await pw.webkit.launch(); } catch (e) { results.push('  skip: WebKit is not installed'); return; }
  try {
    const s = await session(browser, base);
    const h = await s.heard(await s.tap('toggle'), 5000);
    check(!s.errors.length, 'the app loads in WebKit (no syntax Safari cannot parse)', s.errors);
    check(h.inTap && h.start !== null, 'the first utterance is spoken inside the tap and the engine starts it (iOS refuses speech started later)', h);
    await s.ctx.close();
  } finally { await browser.close(); }
}

(async () => {
  let pw;
  for (const id of ['playwright', 'playwright-core']) { try { pw = require(id); break; } catch (e) { /* next */ } }
  if (!pw) { console.log('skip: Playwright is not installed (NODE_PATH)'); return; }
  const { server, base } = await serve();
  try {
    await chromium(pw, base);
    await webkit(pw, base);
  } catch (e) {
    check(false, 'run aborted', e.stack || String(e));
  } finally { server.close(); }
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} check(s) FAILED.` : '\nAll speech checks passed.');
  process.exit(failed ? 1 : 0);
})();
