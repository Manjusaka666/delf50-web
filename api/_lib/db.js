'use strict';
/**
 * Neon over HTTP: every call is one HTTPS round trip, no pool to warm up.
 * `tx(uid, statements)` runs the statements as one transaction for that user:
 * app.user_id is set first, so row-level security scopes every statement.
 */
const { neon } = require('@neondatabase/serverless');

let driver = null;

function get() {
  if (!driver) {
    const url = process.env.DATABASE_URL;
    if (!url) throw Object.assign(new Error('DATABASE_URL is not configured'), { status: 503, code: 'db_not_configured' });
    const sql = neon(url);
    driver = {
      query: (text, params) => sql.query(text, params),
      transaction: (list) => sql.transaction(list.map(([t, p]) => sql.query(t, p)))
    };
  }
  return driver;
}

const query = (text, params = []) => get().query(text, params);

async function tx(uid, statements) {
  const out = await get().transaction([[`select set_config('app.user_id', $1, true)`, [uid]], ...statements]);
  return out.slice(1);
}

module.exports = { query, tx, configured: () => Boolean(driver || process.env.DATABASE_URL), setDriver: (d) => { driver = d; } };
