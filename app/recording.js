/**
 * Listening recordings: pre-generated audio read by native French (France)
 * voices (audio/<level>/<id>.mp3, made by scripts/listening-audio.py), so
 * what the learner hears never depends on the voices of their browser or
 * system. Each recording comes with the time at which each sentence starts
 * (<id>.json), the sentences being the transcript's (speech.segments()):
 * the sentence being heard is highlighted, and the learner can step to the
 * previous or next sentence, repeat one, change the speed, pause and resume.
 *
 * One <audio> element plays every recording; it is started inside the
 * learner's tap (play() is called synchronously from the click), as Safari
 * and Chrome's autoplay rules require.
 */
import { segments, tts } from './speech.js';

export { segments };
export const RATES = [0.8, 0.9, 1, 1.1];

/** id: the recording; state: idle | playing | paused; at: the sentence; total: sentences; error: 'audio' | 'blocked' | null. */
export const rec = { id: null, state: 'idle', at: 0, total: 0, rate: 0.9, error: null };
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(rec));
export const onRecording = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const supported = typeof Audio !== 'undefined';

let media = null, url = null, starts = [], timing = null;

/** The sentence playing at time s. */
function sentenceAt(s) {
  let i = 0;
  while (i + 1 < starts.length && starts[i + 1] <= s + 0.05) i++;
  return i;
}

function element() {
  if (media) return media;
  media = new Audio();
  media.preload = 'auto';
  media.addEventListener('timeupdate', () => {
    if (rec.state !== 'playing' || !starts.length) return;
    const at = sentenceAt(media.currentTime);
    if (at !== rec.at) { rec.at = at; emit(); }
  });
  media.addEventListener('ended', () => { Object.assign(rec, { state: 'idle', at: 0 }); media.currentTime = 0; emit(); });
  media.addEventListener('error', () => { if (rec.state !== 'idle') { Object.assign(rec, { state: 'idle', at: 0, error: 'audio' }); emit(); } });
  return media;
}

/**
 * Makes a recording the current one (when its page opens): its audio starts
 * loading and its sentence times are fetched. base: "audio/b1/L01-1".
 */
export function attach(id, base, paragraphs) {
  const el = element();
  if (rec.id !== id) {
    if (!el.paused) el.pause();
    Object.assign(rec, { id, state: 'idle', at: 0, total: segments(paragraphs).length, error: null, rate: tts.rate });
  }
  if (url !== base) { url = base; load(); }
  emit();
}

/** Loads the current recording and its sentence times. */
function load() {
  const el = element();
  el.src = `${url}.mp3`;
  el.load();
  times();
}

/** Fetches the current recording's sentence times (again, after a network failure). */
function times() {
  const base = url;
  starts = [];
  timing = fetch(`${base}.json`, { cache: 'no-cache' }).then((r) => r.json()).then((j) => { if (url === base) starts = j.t; return j; }).catch(() => null);
}

function start() {
  const el = element();
  el.playbackRate = rec.rate;
  rec.state = 'playing'; rec.error = null;
  emit();
  const p = el.play(); // inside the tap
  if (p && p.catch) p.catch((e) => {
    if (rec.state !== 'playing') return;
    Object.assign(rec, { state: 'idle', error: e && e.name === 'NotAllowedError' ? 'blocked' : 'audio' }); emit();
  });
}

const timeOf = (i) => (starts.length ? starts[Math.max(0, Math.min(starts.length - 1, i))] : 0);

/** Plays the recording from the start, or resumes it where it was paused. */
export function play(id) {
  if (rec.id !== id) return;
  const el = element();
  // What failed to load (a network failure) is loaded again.
  if (el.error) load();
  else if (timing) timing.then((j) => { if (!j && rec.id === id) times(); });
  if (rec.state === 'idle') { el.currentTime = 0; rec.at = 0; }
  start();
}

export function pause() {
  if (rec.state !== 'playing') return;
  element().pause();
  rec.state = 'paused'; emit();
}

export function toggle(id) { if (rec.id === id && rec.state === 'playing') pause(); else play(id); }

export function stop() {
  if (!media) return;
  media.pause();
  if (starts.length || media.readyState) media.currentTime = 0;
  Object.assign(rec, { state: 'idle', at: 0 }); emit();
}

/** Goes to a sentence (playing on from there; from a pause or the end, it plays). */
export function seek(i, id) {
  if (rec.id !== id) return;
  const go = () => {
    const at = Math.max(0, Math.min(rec.total - 1, i));
    element().currentTime = timeOf(at);
    rec.at = at;
  };
  go();
  if (!starts.length && timing) timing.then(() => { if (rec.id === id) go(); });
  if (rec.state !== 'playing') start(); else emit();
}
export const prev = (id) => seek(rec.id === id ? rec.at - 1 : 0, id);
export const next = (id) => seek(rec.id === id ? rec.at + 1 : 0, id);
export const repeat = (id) => seek(rec.id === id ? rec.at : 0, id);

export function setRate(r) {
  rec.rate = r; tts.rate = r; // the same speed for read-aloud (vocabulary)
  if (media) media.playbackRate = r; // the pitch is kept (preservesPitch)
  emit();
}
