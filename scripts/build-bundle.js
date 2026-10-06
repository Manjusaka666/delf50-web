#!/usr/bin/env node
'use strict';
/**
 * Builds build/bundle-parts.js from the working tree.
 *
 * Why this exists: api/source.js used to assemble the runtime bundle by fetching
 * ~26 files from raw.githubusercontent.com plus one unauthenticated api.github.com
 * directory listing on every cold request. That made every page load depend on
 * GitHub availability, on the 60 req/hour unauthenticated API budget shared across
 * Vercel egress IPs, and on commit hashes that are pinned by hand and can drift
 * away from the repository. The bundle is now built from the checked-in files and
 * shipped with the deployment, so a page load touches no third-party host.
 *
 * The output is the 13 finished parts index.html requests as /api/source?i=0..12;
 * api/source.js serves them as they are and scripts/verify.js boots the same ones.
 *
 * Run: node scripts/build-bundle.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'build', 'bundle-parts.js');

/** The 13 entries index.html requests as /api/source?i=0..12, in execution order. */
const BASE_FILES = [
  'base/data-a.js', 'base/data-b1.js', 'base/data-b2.js',
  'base/app-a1.js', 'base/app-a2.js', 'base/app-a3.js', 'base/app-b.js',
  'v13-p1.js', 'v13-p2.js', 'v13-p3.js', 'v13-p4.js', 'v13-p5.js', 'v15-patch.js'
];

/**
 * Layers appended to the last base file, in execution order, after the release
 * bootstrap; the seed bootstrap is spliced in just before v181, which reads it.
 */
const LAYERS = [
  'v16-depth.js',
  'v17-pedagogy.js',
  'v171-user-manual.js',
  'v172-compat-architecture.js',
  'v173-learning-archive.js',
  'content/grammar-guides-v174.js',
  'v174-navigation.js',
  'v176-day2-lifecycle-ui.js',
  'v177-global-unique-routing.js',
  'v180-authoritative-volume.js',
  'v178-full-question-audit.js',
  // --- the seed bootstrap is spliced in here, before v181 reads it ---
  'v181-source-driven-content.js',
  'v182-demand-allocation.js',
  'v182-student-ui-polish.js',
  'v183-student-ui-cleanup.js',
  'v184-replacement-completion-lock.js',
  'v186-nondestructive-pedagogy.js',
  'v188-full-curriculum-bank.js',
  'v189-input-quality.js',
  // (v199-authentic-materials was deliberately left out of the chain and has been
  // removed from the repository, together with the other unused v14/v185 files.)
  'content/corpus-v200.js',
  'content/corpus-v200-d03.js',
  'content/corpus-v200-d04-d09.js',
  'content/corpus-v200-d10-d14.js',
  'content/corpus-v200-d15-d20.js',
  'content/corpus-v200-d21-d25.js',
  'content/corpus-v200-d26-d30.js',
  'content/corpus-v200-d31-d35.js',
  'content/corpus-v200-d36-d40.js',
  'content/corpus-v200-d41-d45.js',
  'content/corpus-v200-d46-d50.js',
  'v200-corpus-materials.js',
  'v201-day-navigation-and-legacy-text.js',
  'v198-release-ui.js',
  'v202-grammar-integrity.js',
  'v203-release-state.js'
];
const SEED_SPLICE_INDEX = LAYERS.indexOf('v181-source-driven-content.js');

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) throw new Error(`missing source file: ${rel}`);
  const text = fs.readFileSync(abs, 'utf8');
  if (text.trim().length < 20) throw new Error(`suspiciously empty source: ${rel}`);
  return text;
}

/**
 * `top` collides with the global `window.top` in browsers, so the historical loader
 * renamed it. Applied to the base files only, exactly as before.
 */
function renameTop(text) {
  return text.replace(/\btop(?=\s*\()/g, 'pageTop').replace(/\btop\s*=\s*function/g, 'pageTop=function');
}

function buildBase() {
  return BASE_FILES.map((file) => renameTop(read(file)));
}

/** Validates and flattens content/seeds-v181/*.json. Fails the build on any breach. */
function buildSeeds() {
  const dir = path.join(ROOT, 'content', 'seeds-v181');
  const names = fs.readdirSync(dir).filter((n) => /\.json$/i.test(n)).sort();
  if (names.length !== 18) throw new Error(`seed family count ${names.length}, expected 18`);

  const familyIds = new Set(), seedIds = new Set(), facts = new Set(), seeds = [];
  for (const name of names) {
    const family = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    if (!family || !family.familyId || !Array.isArray(family.items) || family.items.length !== 10) {
      throw new Error(`${name} invalid: needs familyId and exactly 10 items`);
    }
    if (familyIds.has(family.familyId)) throw new Error(`duplicate family ${family.familyId}`);
    familyIds.add(family.familyId);
    for (const item of family.items) {
      if (!item || !item.sourceSeedId || !item.angle || !item.factFr ||
          !Array.isArray(item.functions) || !Array.isArray(item.lexicon)) {
        throw new Error(`invalid seed in ${family.familyId}`);
      }
      if (seedIds.has(item.sourceSeedId)) throw new Error(`duplicate seed ${item.sourceSeedId}`);
      seedIds.add(item.sourceSeedId);
      const fact = String(item.factFr).toLowerCase().replace(/\s+/g, ' ').trim();
      if (facts.has(fact)) throw new Error(`duplicate seed fact ${item.sourceSeedId}`);
      facts.add(fact);
      seeds.push({
        ...item,
        familyId: family.familyId, authority: family.authority, url: family.url,
        licence: family.licence, verifiedAt: family.verifiedAt, theme: family.theme
      });
    }
  }
  if (seeds.length !== 180) throw new Error(`seed count ${seeds.length}, expected 180`);
  return { seeds, families: names.length };
}

function main() {
  const release = require(path.join(ROOT, 'release-meta.js'));
  const base = buildBase();
  const layers = LAYERS.map(read);
  const { seeds, families } = buildSeeds();

  // Fail early rather than shipping a bundle the browser cannot parse.
  for (let i = 0; i < base.length; i++) new Function(base[i]);
  for (let i = 0; i < layers.length; i++) {
    try { new Function(layers[i]); }
    catch (e) { throw new Error(`syntax error in ${LAYERS[i]}: ${e.message}`); }
  }

  const stack = [`globalThis.__DELF50_RELEASE=${JSON.stringify(release)};`]
    .concat(layers.slice(0, SEED_SPLICE_INDEX))
    .concat([`globalThis.__DELF50_SOURCE_SEEDS_V181=${JSON.stringify(seeds)};`])
    .concat(layers.slice(SEED_SPLICE_INDEX));
  const parts = base.slice();
  const last = parts.length - 1;
  parts[last] = `/* DELF50 App=${release.app} Content=${release.content} (${seeds.length} seeds in ${families} families) */\n`
    + base[last] + '\n;\n' + stack.join('\n;\n');

  const body = JSON.stringify({ app: release.app, files: BASE_FILES, parts });
  const buildId = crypto.createHash('sha256').update(body).digest('hex').slice(0, 12);
  const kb = (Buffer.byteLength(body) / 1024).toFixed(0);

  // --check verifies the committed bundle matches the sources, so a content edit
  // can never ship without the rebuild that carries it into the deployment.
  if (process.argv.includes('--check')) {
    let current = null;
    try { current = require(OUT).buildId; } catch (e) { /* not built yet */ }
    if (current !== buildId) {
      console.error(`build/bundle-parts.js is stale (has ${current || 'nothing'}, sources need ${buildId}). Run: node scripts/build-bundle.js`);
      process.exit(1);
    }
    console.log(`build/bundle-parts.js is up to date — buildId ${buildId}`);
    return;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `'use strict';\n// Generated by scripts/build-bundle.js — do not edit by hand.\nmodule.exports = Object.freeze(Object.assign(${body}, {buildId: ${JSON.stringify(buildId)}}));\n`);

  console.log(`build/bundle-parts.js written — ${base.length} parts, ${layers.length} layers, ${seeds.length} seeds in ${families} families, ${kb} KB, buildId ${buildId}`);
}

main();
