/** Recordings: stored in R2 through the API, in parts of at most 3.5 MB. */
import { call } from './api.js';
import { trackUpload } from './store.js';

const PART = 3.5 * 1024 * 1024;
const cache = new Map();

async function uploadOnce(id, blob) {
  const n = Math.max(1, Math.ceil(blob.size / PART));
  const q = `/media/raw?clipId=${encodeURIComponent(id)}&type=${encodeURIComponent(blob.type || 'audio/webm')}&size=${blob.size}&parts=${n}&part=`;
  for (let i = 0; i < n; i++) await call('PUT', q + i, blob.slice(i * PART, (i + 1) * PART));
  if (n > 1) await call('POST', '/media/complete', { clipId: id, parts: n });
}

/** Uploads a clip, retrying until it is stored; resolves once it is. */
export function upload(id, blob) {
  cache.set(id, blob);
  return trackUpload(new Promise((resolve) => {
    let tries = 0;
    const attempt = () => uploadOnce(id, blob).then(resolve, () => setTimeout(attempt, Math.min(15000, 1000 * 2 ** tries++)));
    attempt();
  }));
}

/** The clip, or null when it is not stored (anymore). */
export async function download(id) {
  if (cache.has(id)) return cache.get(id);
  const q = `/media/raw?clipId=${encodeURIComponent(id)}&part=`;
  let first;
  try { first = await call('GET', q + 0, undefined, { raw: true }); } catch (e) { if (e.status === 404 || e.status === 409) return null; throw e; }
  const n = Number(first.headers.get('X-Parts')) || 1, type = first.headers.get('Content-Type') || 'audio/webm';
  const parts = [await first.blob()];
  for (let i = 1; i < n; i++) parts.push(await (await call('GET', q + i, undefined, { raw: true })).blob());
  const blob = new Blob(parts, { type });
  cache.set(id, blob);
  return blob;
}

export const newClipId = () => 'clip-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
