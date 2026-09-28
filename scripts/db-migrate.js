#!/usr/bin/env node
'use strict';
/**
 * Applies db/migrations/*.sql in name order, each once, each in a transaction.
 *
 *   DATABASE_URL=postgresql://… node scripts/db-migrate.js [--status]
 *
 * Every migration file is itself idempotent, so re-running one is harmless;
 * delf50.schema_migrations records which have run.
 */
const fs = require('fs');
const path = require('path');
const { Pool, neonConfig } = require('@neondatabase/serverless');

if (typeof WebSocket !== 'function') {
  console.error('This script needs a runtime with a global WebSocket (Node.js 22 or newer).');
  process.exit(2);
}
neonConfig.webSocketConstructor = WebSocket;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL is required'); process.exit(2); }
  const dir = path.join(__dirname, '..', 'db', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query('create schema if not exists delf50');
    await pool.query('create table if not exists delf50.schema_migrations (version text primary key, applied_at timestamptz not null default now())');
    const done = new Set((await pool.query('select version from delf50.schema_migrations')).rows.map((r) => r.version));
    for (const f of files) {
      const version = f.replace(/\.sql$/, '');
      if (done.has(version)) { console.log(`  = ${version}`); continue; }
      if (process.argv.includes('--status')) { console.log(`  · ${version} (pending)`); continue; }
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
        await client.query('insert into delf50.schema_migrations (version) values ($1) on conflict do nothing', [version]);
        await client.query('commit');
        console.log(`  + ${version}`);
      } catch (e) {
        await client.query('rollback').catch(() => {});
        throw new Error(`${f}: ${e.message}`);
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
