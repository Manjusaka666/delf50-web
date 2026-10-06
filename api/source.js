'use strict';
/**
 * Serves the app bundle to index.html as /api/source?i=0..12: the parts
 * scripts/build-bundle.js built into build/bundle-parts.js, as they are.
 *
 * Browsers revalidate every load (a 304 while the release is unchanged, so each
 * part is downloaded once per release); Vercel's CDN keeps each part for the
 * lifetime of the deployment (its cache is per deployment).
 */
const crypto = require('crypto');
const BUNDLE = require('../build/bundle-parts.js');

const ETAGS = BUNDLE.parts.map((t) => `"${crypto.createHash('sha256').update(t).digest('base64url').slice(0, 22)}"`);

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  const i = Number(req.query && req.query.i);
  if (!Number.isInteger(i) || i < 0 || i >= BUNDLE.parts.length) {
    res.status(400).send("throw new Error('invalid source index')");
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('Vercel-CDN-Cache-Control', 'max-age=31536000');
  res.setHeader('ETag', ETAGS[i]); // content hash: changes exactly when the part does
  const seen = String((req.headers && req.headers['if-none-match']) || '').split(',').map((x) => x.trim().replace(/^W\//, ''));
  if (seen.includes(ETAGS[i])) { res.statusCode = 304; res.end(); return; }
  res.setHeader('X-DELF50-App', BUNDLE.app);
  res.setHeader('X-DELF50-Build', BUNDLE.buildId);
  res.setHeader('X-DELF50-Source-File', BUNDLE.files[i]);
  res.status(200).send(BUNDLE.parts[i]);
};
