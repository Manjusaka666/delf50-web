#!/usr/bin/env node
'use strict';
/**
 * Checks the interface languages:
 *
 *   1. The interface catalogs (app/i18n/*.js) have the same keys, every entry
 *      renders, and the English one contains no Chinese. No Chinese appears in
 *      the app's code outside the Chinese catalog (the language's own name in
 *      the switcher aside), so no string can bypass the catalogs.
 *   2. Each course's translations (<root>/i18n/<locale>/…, laid over the
 *      material by app/content.js): every file of the course has one; each
 *      translated string replaces a Chinese one at a path that exists; it is
 *      not Chinese any more; and it keeps what must not change — every French
 *      word with an accent, every number and every <b>/<i> of the original.
 *      With --report, the coverage of each course and file group is printed.
 *
 * Run: node scripts/check-i18n.js [--report]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const COURSES = ['course', 'course/b2'];
const LOCALES = ['en'];
const HAN = /[㐀-鿿豈-﫿]/;
const report = process.argv.includes('--report');

const failures = [];
const fail = (where, what) => failures.push(`${where}: ${what}`);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

// French words with an accent (they are quoted material: a translation keeps them as they are).
const FRENCH = /[A-Za-zÀ-ÿœŒæÆ’'-]*[À-ÿœŒæÆ][A-Za-zÀ-ÿœŒæÆ-]*/g;
// Numbers, except a Chinese month number (3月 → “March”), which English writes as a word.
const NUM = /\d+(?:[.,]\d+)?(?![\d月])/g;
const TAGS = /<\/?(?:b|i)>|<br\s*\/?>/g;
const bag = (s, re) => (String(s).match(re) || []).reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
const missing = (a, b) => [...a].filter(([k, n]) => (b.get(k) || 0) < n).map(([k]) => k);

/** What a translation of `base` must keep. */
function fidelity(where, base, tr) {
  const lostFr = missing(bag(base, FRENCH), bag(tr, FRENCH));
  if (lostFr.length) fail(where, `French dropped or changed: ${lostFr.join(', ')}`);
  const lostNum = missing(bag(base, NUM), bag(tr, NUM));
  if (lostNum.length) fail(where, `numbers dropped: ${lostNum.join(', ')}`);
  const lostTag = missing(bag(base, TAGS), bag(tr, TAGS));
  if (lostTag.length) fail(where, `markup dropped: ${lostTag.join(' ')}`);
}

/** Walks a translation with its material, pairing each translated string with the original. */
function pairs(base, tr, p, out) {
  if (tr == null) return out;
  if (typeof base === 'string') { if (typeof tr === 'string') out.push([p, base, tr]); return out; }
  if (Array.isArray(base)) {
    if (Array.isArray(tr)) base.forEach((x, i) => pairs(x, tr[i], `${p}[${i}]`, out));
    else if (tr && typeof tr === 'object') base.forEach((x) => { if (x && x.id != null) pairs(x, tr[x.id], `${p}.${x.id}`, out); });
    return out;
  }
  if (base && typeof base === 'object' && tr && typeof tr === 'object') for (const k of Object.keys(tr)) if (k in base) pairs(base[k], tr[k], p ? `${p}.${k}` : k, out);
  return out;
}

async function main() {
  const content = await import(path.join(ROOT, 'app/content.js'));

  // ── 1. interface catalogs ──
  const i18n = await import(path.join(ROOT, 'app/i18n.js'));
  const cats = i18n.catalogs(), ids = Object.keys(cats);
  const keys = ids.map((id) => new Set(Object.keys(cats[id])));
  for (let i = 1; i < ids.length; i++) {
    const a = [...keys[0]].filter((k) => !keys[i].has(k)), b = [...keys[i]].filter((k) => !keys[0].has(k));
    if (a.length || b.length) fail(`catalog ${ids[i]}`, `keys differ from ${ids[0]}: missing ${a.join(', ') || '—'}; extra ${b.join(', ') || '—'}`);
  }
  const sample = { n: 2, total: 5, done: 1, target: 6, answered: 3, right: 2, known: 1, again: 1, min: 120, d: 3, level: 'B2', keys: 'A / B',
    list: ['Présent', 'Subjonctif'], days: ['Jour 3', 'Jour 1'], name: 'DELF B1', title: 'DELF B1', state: 'ok', optional: true, chunk: true, at: 1, h: 6.5, t: '1 Oct' };
  for (const id of ids) {
    for (const [k, v] of Object.entries(cats[id])) {
      const out = typeof v === 'function' ? v(sample) : v;
      if (typeof out !== 'string') fail(`catalog ${id}.${k}`, 'does not render to text');
      const ref = cats[ids[0]][k];
      if (typeof v === 'string' && typeof ref === 'string') {
        const slots = (x) => (x.match(/\{\w+\}/g) || []).sort().join();
        if (slots(v) !== slots(ref)) fail(`catalog ${id}.${k}`, `slots ${slots(v) || '—'} differ from ${ids[0]}'s ${slots(ref) || '—'}`);
      }
      if (id !== 'zh-CN' && HAN.test(out) && !/^(settings\.voiceSample)$/.test(k)) fail(`catalog ${id}.${k}`, 'contains Chinese');
    }
  }
  const files = fs.readdirSync(path.join(ROOT, 'app'), { recursive: true }).filter((f) => f.endsWith('.js') && f !== path.join('i18n', 'zh-CN.js'));
  for (const f of files) {
    fs.readFileSync(path.join(ROOT, 'app', f), 'utf8').split('\n').forEach((line, i) => {
      if (!HAN.test(line)) return;
      if (f === 'i18n.js' && /id: 'zh-CN', name: '中文', short: '中'/.test(line)) return; // the language's own name
      fail(`app/${f}:${i + 1}`, 'Chinese outside the Chinese catalog');
    });
  }

  // ── 2. course translations ──
  const lines = [];
  for (const dir of COURSES) {
    const base = path.join(ROOT, dir);
    const course = readJson(path.join(base, 'course.json')), nodes = readJson(path.join(base, 'grammar.json'));
    const groups = {
      course: ['course.json'],
      grammar: ['grammar.json'],
      questions: nodes.map((n) => `questions/${n.id}.json`),
      days: Array.from({ length: course.days }, (_, i) => `days/${String(i + 1).padStart(2, '0')}.json`)
    };
    for (const loc of LOCALES) {
      const trDir = path.join(base, 'i18n', loc);
      const known = new Set(Object.values(groups).flat());
      if (fs.existsSync(trDir)) {
        for (const f of fs.readdirSync(trDir, { recursive: true }).filter((x) => x.endsWith('.json'))) {
          if (!known.has(f.split(path.sep).join('/'))) fail(`${dir}/i18n/${loc}/${f}`, 'no such course file');
        }
      }
      for (const [group, list] of Object.entries(groups)) {
        let strings = 0, translated = 0;
        for (const f of list) {
          const material = readJson(path.join(base, f)), trFile = path.join(trDir, f), where = `${dir}/i18n/${loc}/${f}`;
          if (!fs.existsSync(trFile)) { fail(where, 'missing'); strings += content.audit(material, null).strings; continue; }
          let tr;
          try { tr = readJson(trFile); } catch (e) { fail(where, `invalid JSON: ${e.message}`); continue; }
          const a = content.audit(material, tr);
          strings += a.strings; translated += a.translated;
          for (const [p, what] of a.problems) fail(`${where} ${p}`, what);
          if (a.translated < a.strings) {
            const untranslated = [];
            (function walk(b, x, p) {
              if (typeof b === 'string') { if (content.translatable(b) && (x == null)) untranslated.push(p); return; }
              if (Array.isArray(b)) { b.forEach((y, i) => walk(y, Array.isArray(x) ? x[i] : x && y && y.id != null ? x[y.id] : null, `${p}[${i}]`)); return; }
              if (b && typeof b === 'object') for (const k of Object.keys(b)) walk(b[k], x ? x[k] : null, `${p}.${k}`);
            })(material, tr, '');
            fail(where, `${a.strings - a.translated} untranslated: ${untranslated.slice(0, 4).join(', ')}${untranslated.length > 4 ? '…' : ''}`);
          }
          for (const [p, b, x] of pairs(material, tr, '', [])) if (content.translatable(b) && !HAN.test(x)) fidelity(`${where} ${p}`, b, x);
        }
        lines.push(`  ${dir.padEnd(10)} ${loc}  ${group.padEnd(10)} ${String(translated).padStart(5)} / ${String(strings).padEnd(5)} ${strings ? Math.floor((100 * translated) / strings) : 100}%`);
      }
    }
  }

  if (report) console.log('Course translations\n' + lines.join('\n'));
  if (failures.length) {
    console.log(`Interface languages: ${failures.length} problem(s)\n` + failures.slice(0, 60).map((f) => '  ' + f).join('\n') + (failures.length > 60 ? `\n  … ${failures.length - 60} more` : ''));
    process.exit(1);
  }
  console.log(`Interface languages: catalogs ${ids.join(' · ')} complete; course translations (${LOCALES.join(', ')}) complete and faithful`);
}

main().catch((e) => { console.error(e); process.exit(1); });
