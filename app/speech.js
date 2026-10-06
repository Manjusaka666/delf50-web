/** French text-to-speech for listening scripts: sentence by sentence, with pause and speed. */
const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
export const supported = Boolean(synth);
export const RATES = [0.8, 0.9, 1];

const listeners = new Set();
export const tts = { id: null, state: 'idle', rate: 0.9, at: 0, total: 0 };
const emit = () => listeners.forEach((fn) => fn(tts));
export const onSpeech = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

let queue = [], token = 0;
const voice = () => {
  const vs = synth.getVoices().filter((v) => /^fr(-|_|$)/i.test(v.lang));
  return vs.find((v) => /fr-FR/i.test(v.lang) && v.localService) || vs.find((v) => /fr-FR/i.test(v.lang)) || vs[0] || null;
};
const sentences = (paragraphs) => paragraphs.map((p) => String(p).replace(/<[^>]+>/g, ' ')).join(' ')
  .match(/[^.!?…]+(?:[.!?…]+[»"]?|$)/g).map((s) => s.trim()).filter(Boolean);

function speakFrom(i, t) {
  if (t !== token) return;
  if (i >= queue.length) { tts.state = 'idle'; tts.at = 0; emit(); return; }
  tts.at = i;
  const u = new SpeechSynthesisUtterance(queue[i]);
  u.lang = 'fr-FR'; u.rate = tts.rate;
  const v = voice(); if (v) u.voice = v;
  u.onend = () => speakFrom(i + 1, t);
  u.onerror = (e) => { if (e.error !== 'interrupted' && e.error !== 'canceled') { tts.state = 'idle'; emit(); } };
  synth.speak(u);
  emit();
}

export function play(id, paragraphs) {
  if (!synth) return;
  if (tts.id === id && tts.state === 'paused') { synth.resume(); tts.state = 'playing'; emit(); return; }
  synth.cancel();
  queue = sentences(paragraphs);
  Object.assign(tts, { id, state: 'playing', at: 0, total: queue.length });
  speakFrom(0, ++token);
}
export function pause() { if (synth && tts.state === 'playing') { synth.pause(); tts.state = 'paused'; emit(); } }
export function stop() { if (!synth) return; token++; synth.cancel(); Object.assign(tts, { state: 'idle', at: 0 }); emit(); }
export function setRate(r) {
  tts.rate = r;
  if (synth && tts.state !== 'idle') { const at = tts.at; synth.cancel(); tts.state = 'playing'; speakFrom(at, ++token); }
  else emit();
}
