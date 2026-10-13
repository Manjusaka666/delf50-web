'use strict';
/**
 * Account-wide preferences (migration 0007): the interface language, the
 * appearance and the listening voice. One JSON document per account, shared by
 * every course and device.
 *
 *   GET  settings  → {prefs, studied, available}
 *   PUT  settings  {locale?, theme?, voice?, rate?} → {prefs}
 *
 * A PUT merges: keys it does not name are kept, including keys this server
 * does not know (a newer client may have written them), so an older client can
 * never erase a newer one's settings. `studied` says whether the account has
 * any study state: accounts that studied before the interface had a choice of
 * language keep Chinese until they choose. Until the migration has run the
 * settings are reported unavailable instead of failing the app.
 */
const db = require('./db');
const { HttpError } = require('./http');

const LOCALES = ['zh-CN', 'en'];
const THEMES = ['system', 'light', 'dark'];

const FIELDS = {
  locale: (v) => LOCALES.includes(v),
  theme: (v) => THEMES.includes(v),
  // A voice is named by its SpeechSynthesisVoice.voiceURI; null = the best one available.
  voice: (v) => v === null || (typeof v === 'string' && v.length >= 1 && v.length <= 200),
  rate: (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0.5 && v <= 1.5
};

const missingTable = (e) => e && (e.code === '42P01' || /user_settings.*does not exist/.test(String(e.message)));

/** The settings a request may write: known keys with valid values; anything else is a 400. */
function parse(body) {
  const out = {};
  for (const [k, v] of Object.entries(body || {})) {
    if (!FIELDS[k]) continue; // a key this server does not know yet: ignored, never stored over
    if (!FIELDS[k](v)) throw new HttpError(400, 'invalid_field', `${k} has an invalid value`, { field: k });
    out[k] = v;
  }
  if (!Object.keys(out).length) throw new HttpError(400, 'invalid_field', 'Nothing to save');
  return out;
}

async function get(user) {
  try {
    const [rows, studied] = await db.tx(user.id, [
      ['select prefs from delf50.user_settings', []],
      ['select exists (select 1 from delf50.study_state) as studied', []]
    ]);
    return { prefs: rows[0] ? rows[0].prefs : {}, studied: Boolean(studied[0] && studied[0].studied), available: true };
  } catch (e) {
    if (!missingTable(e)) throw e;
    const [studied] = await db.tx(user.id, [['select exists (select 1 from delf50.study_state) as studied', []]]);
    return { prefs: {}, studied: Boolean(studied[0] && studied[0].studied), available: false };
  }
}

async function put(user, body) {
  const patch = parse(body);
  try {
    const [rows] = await db.tx(user.id, [[
      `insert into delf50.user_settings (prefs) values ($1::jsonb)
       on conflict (user_id) do update set prefs = user_settings.prefs || excluded.prefs, updated_at = now()
       returning prefs`, [JSON.stringify(patch)]]]);
    return { prefs: rows[0].prefs };
  } catch (e) {
    if (missingTable(e)) throw new HttpError(503, 'settings_unavailable', 'Settings are not available yet');
    throw e;
  }
}

module.exports = { get, put, parse, LOCALES, THEMES };
