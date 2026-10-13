/**
 * Course translations (pure; shared by the app and the checks).
 *
 * A course's material is French plus explanations, glosses and guides written
 * for the learner in Chinese. A translation (course/…/i18n/<locale>/…) mirrors
 * the material's shape with only those learner-language strings:
 *
 *   object  → the keys to translate               {"canDo": "…", "vocab": {…}}
 *   list of records with an id → an object by id  {"V01-01": {"zh": "…", "exZh": "…"}}
 *   any other list → the same positions, null where nothing changes
 *
 * localize() lays a translation over the material. It only ever replaces a
 * string that contains Chinese, so French material — stems, options, answer
 * keys, texts, scripts — cannot be changed by a translation, whatever it says.
 * The replaced originals stay reachable through canonical(), so what the app
 * records (e.g. an error's explanation) is the same in every language.
 */

const BASE = Symbol('canonical');
const HAN = /[\u3400-\u9fff\uf900-\ufaff]/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Whether a string is learner-language text (Chinese) that a translation may replace. */
export const translatable = (s) => typeof s === 'string' && HAN.test(s);

export function localize(base, tr) {
  if (tr == null) return base;
  if (typeof base === 'string') return translatable(base) && typeof tr === 'string' && tr.trim() ? tr : base;
  if (Array.isArray(base)) {
    if (Array.isArray(tr)) return base.map((x, i) => localize(x, tr[i]));
    if (isObj(tr)) return base.map((x) => (isObj(x) && x.id != null && tr[x.id] != null ? localize(x, tr[x.id]) : x));
    return base;
  }
  if (!isObj(base) || !isObj(tr)) return base;
  let out = null, orig = null;
  for (const k of Object.keys(tr)) {
    if (!Object.prototype.hasOwnProperty.call(base, k)) continue;
    const v = localize(base[k], tr[k]);
    if (v === base[k]) continue;
    if (!out) out = Object.assign({}, base);
    out[k] = v;
    if (typeof base[k] === 'string') (orig || (orig = {}))[k] = base[k];
  }
  if (!out) return base;
  // An enumerable symbol: copied by Object.assign and spreads, never serialized.
  out[BASE] = Object.assign({}, base[BASE], orig);
  return out;
}

/** A field as the course wrote it, whatever the interface language. */
export const canonical = (o, k) => (o && o[BASE] && Object.prototype.hasOwnProperty.call(o[BASE], k) ? o[BASE][k] : o ? o[k] : undefined);

/**
 * Where a translation does not fit its material: keys the material lacks,
 * strings that are not learner-language text, translations still in Chinese.
 * Returns {problems: [path, what][], strings, translated} — the counts give the coverage.
 */
export function audit(base, tr, path = '') {
  const res = { problems: [], strings: 0, translated: 0 };
  const walk = (b, x, p) => {
    if (typeof b === 'string') {
      if (!translatable(b)) { if (x != null) res.problems.push([p, 'not learner-language text']); return; }
      res.strings++;
      if (x == null) return;
      if (typeof x !== 'string' || !x.trim()) res.problems.push([p, 'empty or not a string']);
      else if (HAN.test(x)) res.problems.push([p, 'still in Chinese']);
      else res.translated++;
      return;
    }
    if (Array.isArray(b)) {
      if (x == null) { b.forEach((y, i) => walk(y, null, `${p}[${i}]`)); return; }
      if (Array.isArray(x)) {
        if (x.length > b.length) res.problems.push([p, `${x.length} entries for ${b.length}`]);
        b.forEach((y, i) => walk(y, x[i], `${p}[${i}]`));
      } else if (isObj(x)) {
        const ids = new Set(b.filter(isObj).map((y) => String(y.id)));
        for (const k of Object.keys(x)) if (!ids.has(k)) res.problems.push([`${p}.${k}`, 'no such id']);
        b.forEach((y, i) => walk(y, isObj(y) ? x[y.id] : null, `${p}.${isObj(y) && y.id != null ? y.id : '[' + i + ']'}`));
      } else res.problems.push([p, 'expected a list or an object by id']);
      return;
    }
    if (isObj(b)) {
      if (x != null && !isObj(x)) { res.problems.push([p, 'expected an object']); return; }
      if (x) for (const k of Object.keys(x)) if (!Object.prototype.hasOwnProperty.call(b, k)) res.problems.push([`${p}.${k}`, 'no such key']);
      for (const k of Object.keys(b)) walk(b[k], x ? x[k] : null, p ? `${p}.${k}` : k);
      return;
    }
    if (x != null) res.problems.push([p, 'not text']);
  };
  walk(base, tr, path);
  return res;
}
