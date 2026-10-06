/**
 * Change detection between two learner states (pure; shared by the app and the tests).
 *
 * The state S has two parts: records, which the server keeps as rows (the
 * collections in api/_lib/records.js), and the small remainder, kept as one
 * document. diff() turns "server-confirmed state → current state" into one
 * batch of fine-grained changes:
 *   doc: [[path, value] | [path]]                      set / delete in the document
 *   ops: {name: {set: [[key, value, pos?]], del: [key], move?: [[from, to, pos]]}}
 */

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function equal(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!has(b, k) || !equal(a[k], b[k])) return false;
  return true;
}

function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (isObj(v)) return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}

/** 53-bit string hash (cyrb53), base 36. */
export function hash(s) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** A list record's identity: its content plus its occurrence among equals. */
function itemKeys(list) {
  const seen = {};
  return list.map((x) => { const h = hash(stable(x)); seen[h] = (seen[h] || 0) + 1; return h + '.' + seen[h]; });
}

const getPath = (o, p) => p.reduce((x, k) => (isObj(x) ? x[k] : undefined), o);

/** S with each collection emptied; the empty container stays, so its presence round-trips. */
function docView(S, spec) {
  const out = Object.assign({}, S);
  for (const c of spec) {
    let o = out;
    const last = c.path[c.path.length - 1];
    let ok = true;
    for (const k of c.path.slice(0, -1)) {
      if (!isObj(o[k])) { ok = false; break; }
      o = o[k] = Object.assign({}, o[k]);
    }
    if (!ok) continue;
    if (c.kind === 'list') { if (Array.isArray(o[last])) o[last] = []; } else if (isObj(o[last])) o[last] = {};
  }
  return out;
}

function diffDoc(a, b, path, out) {
  for (const k of Object.keys(a)) if (!has(b, k)) out.push([path.concat(k)]);
  for (const k of Object.keys(b)) {
    if (isObj(a[k]) && isObj(b[k])) diffDoc(a[k], b[k], path.concat(k), out);
    else if (!has(a, k) || !equal(a[k], b[k])) out.push([path.concat(k), b[k]]);
  }
  return out;
}

function diffMap(A, B, ch) {
  for (const k of Object.keys(A)) if (!has(B, k)) ch.del.push([k]);
  for (const k of Object.keys(B)) if (!has(A, k) || !equal(A[k], B[k])) ch.set.push([[k], B[k]]);
}

/**
 * Keyed list diff; positions of kept records never move, new ones go between.
 * `keysA` are the server's keys of A's rows: a row stored under any other key
 * than its content's (e.g. rewritten server-side) is renamed by this diff.
 */
function diffList(A, posA, keysA, B, ch) {
  const kA = keysA && keysA.length === A.length ? keysA : itemKeys(A), kB = itemKeys(B), at = {};
  kA.forEach((k, i) => { at[k] = posA[i]; });
  let pos = kB.map((k) => (has(at, k) ? at[k] : null));
  let ok = posA.length === A.length, last = -Infinity;
  for (let j = 0; ok && j < B.length; j++) {
    if (pos[j] === null) {
      let n = j + 1; while (n < B.length && pos[n] === null) n++;
      const hi = n < B.length ? pos[n] : Infinity;
      pos[j] = last === -Infinity ? (hi === Infinity ? j : hi - 1) : (hi === Infinity ? last + 1 : (last + hi) / 2);
      if (!(pos[j] > last && pos[j] < hi)) ok = false;
      ch.set.push([[kB[j]], B[j], pos[j]]);
    } else if (!(pos[j] > last)) ok = false;
    last = pos[j];
  }
  const keep = new Set(kB);
  if (!ok) { // order changed: renumber everything
    ch.set = kB.map((k, i) => [[k], B[i], i]);
    pos = kB.map((k, i) => i);
  }
  // A record that is only stored under another key (e.g. rewritten server-side) is renamed, not deleted and re-added.
  const old = new Set(kA), byKey = new Map(kA.map((k, i) => [k, A[i]])), move = [];
  for (const k of kA) {
    if (keep.has(k)) continue;
    const j = ch.set.findIndex((x) => !old.has(x[0][0]) && equal(x[1], byKey.get(k)));
    if (j < 0) { ch.del.push([k]); continue; }
    move.push([k, ch.set[j][0][0], ch.set[j][2]]);
    ch.set.splice(j, 1);
  }
  if (move.length) ch.move = move;
  return pos;
}

/**
 * The change batch from confirmed state `a` to `b`: {doc, ops, pos, keys, empty}.
 * `at` = {pos, keys} of a's list rows on the server; the result has b's.
 */
export function diff(a, at, b, spec) {
  const doc = diffDoc(docView(a, spec), docView(b, spec), [], []);
  const ops = {}, pos = {}, keys = {};
  let empty = !doc.length;
  for (const c of spec) {
    let A = getPath(a, c.path), B = getPath(b, c.path);
    const ch = { set: [], del: [] };
    if (c.kind === 'list') {
      A = Array.isArray(A) ? A : []; B = Array.isArray(B) ? B : [];
      const pA = (at.pos || {})[c.name] || [], kA = (at.keys || {})[c.name];
      keys[c.name] = itemKeys(B);
      pos[c.name] = equal(A, B) && pA.length === A.length && equal(kA || keys[c.name], keys[c.name]) ? pA : diffList(A, pA, kA, B, ch);
    } else diffMap(isObj(A) ? A : {}, isObj(B) ? B : {}, ch);
    if (ch.set.length || ch.del.length || ch.move) { ops[c.name] = ch; empty = false; }
  }
  return { doc, ops, pos, keys, empty };
}
