'use strict';
/**
 * Serves the runtime bundle to index.html as /api/source?i=0..12.
 *
 * The response contract is unchanged from previous releases: the same 13 indices,
 * the same execution order, and index 12 carrying the full layer stack. Only the
 * origin of the code changed — it is now read from build/bundle-parts.js, which is
 * generated from the repository by scripts/build-bundle.js and shipped inside the
 * deployment. Nothing here touches the network, so a page load no longer depends on
 * GitHub availability, on the unauthenticated GitHub API rate budget, or on
 * hand-maintained commit pins.
 *
 * v202 is intentionally appended after the generated bundle as a small independent
 * integrity layer. This avoids rebuilding or re-identifying any historical corpus
 * item while allowing completed grammar evidence to remain immutable.
 */
const crypto = require('crypto');
const RELEASE = require('../release-meta.js');
const BUNDLE = require('../build/bundle-parts.js');
const GRAMMAR_INTEGRITY = require('../v202-grammar-integrity.js');

// Browsers revalidate every load (a 304 when unchanged, so the ~600 KB bundle
// is downloaded once per release); Vercel's CDN keeps each part for the
// lifetime of the deployment (its cache is per deployment).
const CACHE_CONTROL = 'public, max-age=0, must-revalidate';
const CDN_CACHE_CONTROL = 'max-age=31536000';

const HEADERS = {
  'X-DELF50-App': RELEASE.app,
  'X-DELF50-Schema': String(RELEASE.schema),
  'X-DELF50-Content': RELEASE.content,
  'X-DELF50-Build': BUNDLE.buildId,
  'X-DELF50-Bundle-Origin': 'deployment-local-v1',
  'X-DELF50-Archive': 'history-evidence-v2',
  'X-DELF50-Navigation': 'demand-aware',
  'X-DELF50-Grammar-Guides': '36',
  'X-DELF50-Day-Routing': RELEASE.route,
  'X-DELF50-Reading-Alignment': 'curriculum-day-aware-v2',
  'X-DELF50-Listening-Alignment': 'curriculum-day-aware-v1',
  'X-DELF50-Output-Alignment': 'curriculum-day-aware-v1',
  'X-DELF50-Lifecycle': 'completion-lock-v1',
  'X-DELF50-Grammar-UI': 'demand-allocation-history-v2',
  'X-DELF50-Grammar-History': 'exact-answer-additive-v1',
  'X-DELF50-Grammar-Integrity': 'grammar-integrity-history-v1',
  'X-DELF50-Student-UI': 'student-question-clean-v5',
  'X-DELF50-Replacement-Routing': 'replacement-completion-lock-v1',
  'X-DELF50-Student-Content': RELEASE.inputQuality,
  'X-DELF50-History-Policy': 'started-completed-content-immutable',
  'X-DELF50-History-Content': 'versioned-rehydrate-v1',
  'X-DELF50-Startup': 'parallel-retry-v1',
  'X-DELF50-Curriculum': 'v17-canonical-v1',
  'X-DELF50-Grammar-Route': '50day-roadmap-v2',
  'X-DELF50-Grammar-Scope': 'FEI-B1+CEFR-inventory',
  'X-DELF50-Input-Quality': RELEASE.inputQuality,
  'X-DELF50-Student-Input-Metadata': 'hidden-v3',
  'X-DELF50-Input-QA': 'cross-modal-similarity+leak-audit-v4',
  'X-DELF50-Input-Sources': 'FEI-B1+authored-corpus-v1',
  'X-DELF50-No-Repeat-Audit': 'authored-uniqueness-v1',
  'X-DELF50-Volume': '8h-50d-core-v1',
  'X-DELF50-Source-Seeds': String(BUNDLE.seeds.length),
  'X-DELF50-Source-Families': String(BUNDLE.seedFamilies)
};

/** Assembled once per warm instance; the strings are immutable for a deployment. */
let cachedSources = null;
let etags = null;

function buildSources() {
  const sources = BUNDLE.base.slice();
  const last = sources.length - 1;

  const releaseBootstrap = `globalThis.__DELF50_RELEASE=${JSON.stringify(RELEASE)};`;
  const seedBootstrap = `globalThis.__DELF50_SOURCE_SEEDS_V181=${JSON.stringify(BUNDLE.seeds)};`;
  const splice = BUNDLE.seedSpliceIndex;
  const ordered = [releaseBootstrap]
    .concat(BUNDLE.layers.slice(0, splice))
    .concat([seedBootstrap])
    .concat(BUNDLE.layers.slice(splice))
    .concat([GRAMMAR_INTEGRITY]);

  const boot = `if(typeof S!=='undefined'){S.version='${RELEASE.app}';if(S.meta172){S.meta172.appVersion='${RELEASE.app}';S.meta172.contentVersion='${RELEASE.content}';S.meta172.studentUi='student-question-clean-v5';S.meta172.replacementRouting='replacement-completion-lock-v1';S.meta172.studentContent='${RELEASE.inputQuality}';S.meta172.historyPolicy='started-completed-content-immutable';S.meta172.grammarIntegrity='grammar-integrity-history-v1';S.meta172.grammarHistory='exact-answer-additive-v1';}}if(typeof render==='function')render();`;

  sources[last] = `/* DELF50_BUNDLE App=${RELEASE.app} Schema=${RELEASE.schema} Content=${RELEASE.content} Build=${BUNDLE.buildId} | deployment-local bundle + v202 grammar integrity */\n`
    + sources[last] + '\n;\n' + ordered.join('\n;\n') + '\n;\n' + boot;

  return sources;
}

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  const i = Number(req.query && req.query.i);
  if (!Number.isInteger(i) || i < 0 || i >= BUNDLE.base.length) {
    res.status(400).send("throw new Error('invalid source index')");
    return;
  }
  try {
    if (!cachedSources) {
      cachedSources = buildSources();
      etags = cachedSources.map((t) => `"${crypto.createHash('sha256').update(t).digest('base64url').slice(0, 22)}"`);
    }
    const text = cachedSources[i];
    res.setHeader('Cache-Control', CACHE_CONTROL);
    res.setHeader('Vercel-CDN-Cache-Control', CDN_CACHE_CONTROL);
    res.setHeader('ETag', etags[i]); // content hash: changes exactly when the part does
    const seen = String((req.headers && req.headers['if-none-match']) || '').split(',').map((x) => x.trim().replace(/^W\//, ''));
    if (seen.includes(etags[i])) { res.statusCode = 304; res.end(); return; }
    for (const [k, v] of Object.entries(HEADERS)) res.setHeader(k, v);
    res.setHeader('X-DELF50-Source-File', BUNDLE.baseFiles[i]);
    res.status(200).send(text);
  } catch (e) {
    // Never serve a truncated bundle: a clean throw keeps index.html in its
    // static fallback, which leaves stored progress untouched.
    res.status(500).send(`throw new Error(${JSON.stringify('DELF50 source load failed: ' + (e && e.message || e))})`);
  }
};
