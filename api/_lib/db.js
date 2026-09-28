'use strict';
/**
 * Neon over HTTP. Each query is one HTTPS round trip and needs no connection
 * pool, which suits short-lived functions. Multi-statement atomicity lives in
 * SQL functions (delf50.push_state), so no interactive transaction is needed.
 */
const { neon } = require('@neondatabase/serverless');

let client = null;

function sql() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw Object.assign(new Error('DATABASE_URL is not configured'), { status: 503, code: 'db_not_configured' });
    client = neon(url);
  }
  return client;
}

/** Runs one parameterised statement and returns its rows. */
async function query(text, params) {
  return sql().query(text, params || []);
}

async function one(text, params) {
  const rows = await query(text, params);
  return rows[0] || null;
}

module.exports = { query, one, configured: () => Boolean(process.env.DATABASE_URL) };
