/**
 * French read aloud with the Web Speech API (speechSynthesis): listening
 * scripts, chunks and their examples, in the device's own voices.
 *
 * On-device voices come first. A network voice (Chrome's "Google français",
 * Edge's online voices) needs its provider's servers — Google's cannot be
 * reached from mainland China — and when it cannot speak it is silent: it
 * reports an error, or never starts. A voice that fails is set aside for the
 * session and the same sentence is read again by the next voice; when no
 * voice can read, the player says so (tts.error) instead of running silently.
 *
 * The first utterance is spoken inside the learner's tap (iOS drops any
 * speech started outside a gesture, and every utterance after it).
 *
 * A script is read sentence by sentence (segments(), shared with the
 * transcript so the sentence being read can be highlighted):
 *   · dialogue turns ("— …") alternate between two French voices when the
 *     device has two (else the second speaker is pitched lower), with a short
 *     pause at each change of speaker and of paragraph;
 *   · pause stops at the current sentence and resumes from its start — the
 *     engines' own pause() is unreliable (Chrome, Android) — and the learner
 *     can step to the previous or next sentence or repeat one;
 *   · the best voice is chosen when the voices arrive (voiceschanged); a
 *     learner's choice (settings) wins; engines that stall are nudged on.
 */
const synth = typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined' ? speechSynthesis : null;
export const supported = Boolean(synth);
export const RATES = [0.8, 0.9, 1, 1.1];

const listeners = new Set(), voiceListeners = new Set();
/**
 * id: what is being read; state: idle | playing | paused; at: the sentence; total: sentences; speakers: voices in use;
 * error: why the last reading stopped — 'voice' (no voice on this device could read) or 'blocked' (the browser refused speech).
 */
export const tts = { id: null, state: 'idle', rate: 0.9, at: 0, total: 0, speakers: 1, error: null };
const emit = () => listeners.forEach((fn) => fn(tts));
export const onSpeech = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const onVoices = (fn) => { voiceListeners.add(fn); return () => voiceListeners.delete(fn); };

// ── voices ──
let chosen = null; // a voiceURI from settings, or null for the best one
const failed = new Set(); // voiceURIs that could not speak in this session
const NOVELTY = /\b(grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley|bad news|bells|boing|bubbles|cellos|jester|organ|trinoids|whisper|zarvox|albert|bahh|superstar|wobble)\b/i;

/** Whether a voice is synthesised on a server (it is silent when the server cannot be reached). */
const online = (v) => v.localService === false;

/** How good a voice is likely to sound for DELF listening (higher is better); on-device voices before network ones. */
export function score(v) {
  const lang = String(v.lang || '').replace('_', '-');
  if (!/^fr(-|$)/i.test(lang)) return -Infinity;
  let s = /^fr-FR$/i.test(lang) ? 100 : 60; // the exam's standard French first; Canadian, Swiss, Belgian next
  const n = String(v.name || '');
  if (/premium/i.test(n)) s += 60;
  else if (/natural|neural/i.test(n)) s += 55;
  else if (/enhanced|amélioré|améliorée/i.test(n)) s += 45;
  if (online(v)) s -= 120; // a network voice only when the device has no French voice of its own
  if (NOVELTY.test(n)) s -= 80;
  if (v.default) s += 2;
  return s;
}

/** The quality label shown next to a voice. */
const quality = (v) => (/premium|natural|neural|enhanced|amélioré/i.test(v.name) ? 'high' : 'standard');

/** The device's French voices, best first: {uri, name, lang, quality, online}. */
export function frenchVoices() {
  if (!synth) return [];
  const seen = new Set();
  return synth.getVoices().filter((v) => score(v) > -Infinity && !seen.has(v.voiceURI) && seen.add(v.voiceURI))
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))
    .map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang, quality: quality(v), online: online(v) }));
}

/** The voices for the two speakers of a dialogue: the chosen (or best) one, then the best other one; never one that failed. */
function cast() {
  const all = synth ? synth.getVoices() : [];
  const fr = all.filter((v) => score(v) > -Infinity && !failed.has(v.voiceURI)).sort((a, b) => score(b) - score(a));
  const first = (chosen && fr.find((v) => v.voiceURI === chosen)) || fr[0] || null;
  // The second speaker: another good voice, preferably of the same French as the first — never a network voice
  // beside an on-device one (it may be silent); with one voice only, the second speaker is pitched lower instead.
  const others = fr.filter((v) => first && v.voiceURI !== first.voiceURI && v.name !== first.name && !NOVELTY.test(v.name) && (online(first) || !online(v)));
  const second = others.find((v) => first && v.lang === first.lang) || others[0] || null;
  return [first, second];
}

/** Whether the device can read French with a French voice (else the engine falls back to another language's voice). */
export const hasFrench = () => frenchVoices().length > 0;

export function configure({ voice, rate } = {}) {
  if (voice !== undefined) chosen = voice || null;
  if (typeof rate === 'number' && rate > 0) tts.rate = rate;
  emit();
}

if (synth) {
  const changed = () => voiceListeners.forEach((fn) => fn(frenchVoices()));
  if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', changed);
  else synth.onvoiceschanged = changed;
}

/** Resolves once the engine has listed its voices (Chrome lists them asynchronously), or after a second. */
function voicesReady() {
  if (!synth || synth.getVoices().length) return Promise.resolve();
  return new Promise((resolve) => {
    const off = onVoices(() => { off(); resolve(); });
    setTimeout(() => { off(); resolve(); }, 1000);
  });
}

// ── text → sentences ──
const TURN = /^\s*[—–-]\s+/;
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('fr', { granularity: 'sentence' }) : null;

function split(text) {
  const raw = segmenter ? [...segmenter.segment(text)].map((s) => s.segment.trim())
    : (text.match(/[^.!?…]+(?:[.!?…]+[»"]?|$)/g) || []).map((s) => s.trim());
  // A fragment with nothing to say (« ». » left after a quoted question) belongs to the sentence before it:
  // read alone it is silence, and some engines never report its end.
  const out = [];
  raw.filter(Boolean).forEach((s) => { if (out.length && !/[\p{L}\p{N}]/u.test(s)) out[out.length - 1] += ' ' + s; else out.push(s); });
  return out;
}

/**
 * A sentence as the utterances it is spoken in: long sentences are cut at
 * their clause punctuation (else between words) into parts of about
 * MAX_PART characters, since network voices (Chrome's Google voices) stop
 * after some 15 seconds of speech and never report the end. Pure.
 */
const MAX_PART = 140;
export function parts(text) {
  if (text.length <= MAX_PART + 30) return [text];
  // No lookbehind: Safari before 16.4 cannot parse one, and the whole app would not load.
  const pieces = text.replace(/([,;:)])\s+/g, '$1\n').replace(/\s+(?=[—–]\s)/g, '\n').split('\n');
  const out = [];
  for (const p of pieces) {
    const last = out.length - 1;
    if (last >= 0 && out[last].length + 1 + p.length <= MAX_PART) out[last] += ' ' + p;
    else out.push(p);
  }
  // A clause still too long is cut between words.
  return out.flatMap((p) => {
    if (p.length <= MAX_PART + 30) return [p];
    const words = p.split(' '), cut = [];
    for (const w of words) {
      if (cut.length && cut[cut.length - 1].length + 1 + w.length <= MAX_PART) cut[cut.length - 1] += ' ' + w;
      else cut.push(w);
    }
    return cut;
  });
}

/**
 * A script as the sentences it is read in: [{text, para, turn, speaker, first}].
 * Paragraphs hold one or more turns (lines); a turn opening with a dash is a
 * new speaker in a dialogue, alternating between two voices; other turns are
 * the narrator's. `first` marks a turn's first sentence. Pure; the transcript
 * is drawn from the same segments.
 */
export function segments(paragraphs) {
  const out = [];
  let k = 0;
  (paragraphs || []).forEach((p, para) => {
    String(p).replace(/<[^>]+>/g, ' ').split(/\n+/).forEach((line, turn) => {
      const dialogue = TURN.test(line);
      const speaker = dialogue ? k++ % 2 : 0;
      split(line.replace(TURN, '').replace(/\s+/g, ' ')).forEach((text, i) => out.push({ text, para, turn, speaker, dialogue, first: i === 0 }));
    });
  });
  return out;
}

// ── reading ──
let queue = [], token = 0, timer = 0, keepAlive = 0, watchdog = 0;
// The utterance being spoken: held here so that it cannot be garbage-collected
// before it ends (Chrome then never fires its end, and the reading stalls).
let speaking = null;
// Whether this engine reports the start of an utterance (null until seen), and whether speech was unlocked by a tap.
let reportsStart = null, unlocked = false;
const START_WAIT = 5000; // a voice that has not started after this long is not going to
// Voices that failed in a row in this reading: after three, the cause is not the voice (speech blocked, engine down).
let misses = 0;
const MAX_MISSES = 3;

function clearTimers() { clearTimeout(timer); clearInterval(keepAlive); clearTimeout(watchdog); }

/** The pause before a sentence: longer at a new paragraph or speaker, so turns can be told apart. */
function gap(i) {
  if (i <= 0 || i >= queue.length) return 0;
  const a = queue[i - 1], b = queue[i];
  if (b.para !== a.para) return 550;
  if (b.turn !== a.turn) return 380;
  return 0;
}

/** Stops reading because nothing can be heard: the player shows why. The next tap tries every voice again. */
function halt(why) {
  token++; clearTimers(); speaking = null; failed.clear();
  Object.assign(tts, { state: 'idle', at: 0, error: why }); emit();
}

/** Reads sentence i, after `wait` ms — at once (inside the learner's tap, or the previous sentence's end) when there is no pause. */
function speakAt(i, t, wait = 0) {
  clearTimers();
  if (t !== token) return;
  if (i >= queue.length) { speaking = null; Object.assign(tts, { state: 'idle', at: 0 }); emit(); return; }
  tts.at = i; tts.state = 'playing'; emit();
  if (wait > 0) timer = setTimeout(() => speakPart(i, parts(queue[i].text), 0, t), wait);
  else speakPart(i, parts(queue[i].text), 0, t);
}

/**
 * Speaks part k of sentence i, then the next part, then the next sentence. A
 * voice that reports an error, ends without having spoken, or does not start
 * is set aside and the same part is read by the next voice; with no voice
 * left (or after three voices in a row), the reading stops and says why.
 */
function speakPart(i, list, k, t) {
  clearTimers();
  if (t !== token) return;
  const s = queue[i], text = list[k], [a, b] = cast();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR';
  u.rate = tts.rate;
  const v = s.speaker === 1 && b ? b : a;
  if (v) { u.voice = v; u.lang = v.lang; }
  if (s.speaker === 1 && !b) u.pitch = 0.82; // one voice only: the second speaker a little lower
  const expect = (text.length / (13 * tts.rate)) * 1000, t0 = Date.now();
  let done = false, started = false;
  const next = () => {
    if (done || t !== token) return;
    done = true;
    if (k + 1 < list.length) speakPart(i, list, k + 1, t);
    else speakAt(i + 1, t, gap(i + 1));
  };
  const fail = () => {
    if (done || t !== token) return;
    done = true; clearTimers();
    if (!v || ++misses >= MAX_MISSES) { halt('voice'); return; }
    failed.add(v.voiceURI);
    synth.cancel();
    timer = setTimeout(() => speakPart(i, list, k, t), 60);
  };
  u.onstart = () => { started = true; reportsStart = true; misses = 0; };
  u.onend = () => {
    // Ended without a start, far sooner than the text can be read: nothing was heard.
    if (!started && /[\p{L}\p{N}]/u.test(text) && Date.now() - t0 < expect * 0.25) { fail(); return; }
    if (!started && reportsStart === null) reportsStart = false;
    next();
  };
  u.onerror = (e) => {
    const why = e && e.error;
    if (why === 'interrupted' || why === 'canceled') return;
    if (why === 'not-allowed') { done = true; halt('blocked'); return; }
    if (why === 'text-too-long' || why === 'invalid-argument') { next(); return; }
    fail();
  };
  speaking = u;
  if (synth.paused) synth.resume();
  synth.speak(u);
  // Network voices (Chrome's Google voices) stop after ~15 s unless nudged; any engine may never report the end.
  if (v && online(v)) keepAlive = setInterval(() => { if (synth.speaking && !synth.paused) { synth.pause(); synth.resume(); } }, 10000);
  const giveUp = t0 + expect * 4 + 10000;
  watchdog = setTimeout(function check() {
    if (t !== token || done) return;
    const elapsed = Date.now() - t0;
    // A voice that has not started (an unreachable network voice, speech the browser dropped) is set aside.
    if (!started && reportsStart !== false) {
      if (elapsed >= START_WAIT) fail(); else watchdog = setTimeout(check, 500);
      return;
    }
    // An engine that never reports the end, or still says it is speaking long after it should have finished, is moved on.
    if (elapsed < expect * 2 + 4000 || (synth.speaking && Date.now() < giveUp)) { watchdog = setTimeout(check, 1000); return; }
    if (synth.speaking) { synth.cancel(); watchdog = setTimeout(next, 60); return; }
    next();
  }, 500);
}

/**
 * iOS speaks only when speech starts inside a tap — and once one utterance was
 * dropped, it drops every later one. When the reading must wait (the voices
 * are not listed yet, or another utterance is being cancelled), a silent
 * utterance spoken now, inside the tap, opens speech for the page.
 */
function unlock() {
  if (unlocked) return;
  unlocked = true;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  // The best voice, not the engine's default: a default network voice that cannot be reached would hold up the queue.
  const [v] = cast();
  u.lang = v ? v.lang : 'fr-FR';
  if (v) u.voice = v;
  synth.speak(u);
}

function restart(i) {
  token++;
  clearTimers();
  tts.error = null; misses = 0;
  const busy = synth.speaking || synth.pending;
  synth.cancel();
  const t = token;
  if (!busy && synth.getVoices().length) { unlocked = true; speakAt(i, t, 0); return; } // at once, inside the tap
  // Some engines drop an utterance queued in the same tick as cancel(); Chrome lists its voices a moment after the page loads.
  unlock();
  voicesReady().then(() => speakAt(i, t, 60));
}

/** Reads a script (or resumes it where it was paused). */
export function play(id, paragraphs) {
  if (!synth) return;
  if (tts.id === id && tts.state === 'paused') { tts.state = 'playing'; restart(tts.at); return; }
  queue = segments(paragraphs);
  Object.assign(tts, { id, state: 'playing', at: 0, total: queue.length, speakers: queue.some((s) => s.speaker === 1) ? 2 : 1 });
  emit();
  restart(0);
}

/** Pauses at the current sentence; play() resumes from its start. */
export function pause() {
  if (!synth || tts.state !== 'playing') return;
  token++; clearTimers(); synth.cancel();
  tts.state = 'paused'; emit();
}

export function toggle(id, paragraphs) { if (tts.id === id && tts.state === 'playing') pause(); else play(id, paragraphs); }

export function stop() {
  if (!synth) return;
  token++; clearTimers(); synth.cancel();
  Object.assign(tts, { state: 'idle', at: 0 }); emit();
}

/** Goes to a sentence of the script being read (playing on, or ready to play from there when paused). */
export function seek(i, id, paragraphs) {
  if (!synth) return;
  if (tts.id !== id || !queue.length) { if (!paragraphs) return; queue = segments(paragraphs); Object.assign(tts, { id, total: queue.length, speakers: queue.some((s) => s.speaker === 1) ? 2 : 1 }); }
  const at = Math.max(0, Math.min(queue.length - 1, i));
  tts.at = at;
  if (tts.state === 'idle') tts.state = 'playing';
  if (tts.state === 'playing') restart(at); else emit();
}
export const prev = (id, ps) => seek(tts.id === id ? tts.at - 1 : 0, id, ps);
export const next = (id, ps) => seek(tts.id === id ? tts.at + 1 : 0, id, ps);
export const repeat = (id, ps) => seek(tts.id === id ? tts.at : 0, id, ps);

export function setRate(r) {
  tts.rate = r;
  if (synth && tts.state === 'playing') restart(tts.at); else emit();
}

/** Reads a sample with a given voice (settings). */
export function preview(uri, text) {
  if (!synth) return;
  stop();
  unlocked = true;
  const u = new SpeechSynthesisUtterance(text);
  const v = synth.getVoices().find((x) => x.voiceURI === uri) || cast()[0];
  u.lang = v ? v.lang : 'fr-FR'; if (v) u.voice = v; u.rate = tts.rate;
  synth.speak(u);
}
