'use strict';

// Dynamic, admin-editable settings backed by the `settings` table, with an
// in-memory cache so reads are synchronous after startup. Static values that
// should never change at runtime (DB creds, JWT secret, admin seed) stay in
// config.js / .env — only the knobs below are admin-controlled.
const pool = require('./db');

// key -> { default, label, type, group }. `type` drives parsing + the admin form.
const DEFS = {
  upi_id:             { default: 'cashyzone@upi', type: 'string', group: 'Payments', label: 'UPI ID (payee)' },
  upi_name:           { default: 'CashyZone',     type: 'string', group: 'Payments', label: 'UPI payee name' },
  telegram_url:       { default: 'https://t.me/cashyzone', type: 'string', group: 'Support', label: 'Telegram support link', public: true },
  kyc_fee:            { default: 999,             type: 'number', group: 'Fees',     label: 'KYC verification fee (₹)' },
  gst_percent:        { default: 18,              type: 'number', group: 'Fees',     label: 'GST on withdrawal (%)', public: true },
  deposit_bonus:      { default: 489,             type: 'number', group: 'Fees',     label: 'First-deposit bonus (₹)' },
  min_typing_accuracy:{ default: 0.97,            type: 'number', group: 'Tasks',    label: 'Min typing accuracy (0–1)' },
  task_reward_multiplier: { default: 3,           type: 'number', group: 'Tasks',    label: 'Task reward multiplier (×)' },
  withdraw_min:       { default: 7500,            type: 'number', group: 'Fees',     label: 'Minimum withdrawal (₹)' },
  withdraw_min_tasks: { default: 3,               type: 'number', group: 'Fees',     label: 'Tasks required to withdraw' },
};

const cache = new Map();

function parse(type, raw) {
  if (raw === null || raw === undefined) return null;
  if (type === 'number') return Number(raw);
  if (type === 'boolean') return raw === true || raw === 'true' || raw === '1' || raw === 1;
  return String(raw);
}

// Load all settings into the cache (call once at startup). Missing rows fall
// back to the coded default.
async function load() {
  const [rows] = await pool.query('SELECT `key`, `value` FROM settings');
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  for (const [key, def] of Object.entries(DEFS)) {
    const raw = stored.has(key) ? stored.get(key) : def.default;
    cache.set(key, parse(def.type, raw));
  }
}

// Synchronous read from cache (falls back to default if not loaded yet).
function get(key) {
  if (cache.has(key)) return cache.get(key);
  return DEFS[key] ? parse(DEFS[key].type, DEFS[key].default) : undefined;
}

// All current values as a plain object.
function all() {
  const out = {};
  for (const key of Object.keys(DEFS)) out[key] = get(key);
  return out;
}

// Only the settings flagged `public: true` — safe to expose without auth.
function publicValues() {
  const out = {};
  for (const [key, def] of Object.entries(DEFS)) if (def.public) out[key] = get(key);
  return out;
}

// Definitions + current values, for the admin UI.
function describe() {
  return Object.entries(DEFS).map(([key, def]) => ({
    key, label: def.label, type: def.type, group: def.group, value: get(key),
  }));
}

// Persist one or more settings and refresh the cache.
async function update(values) {
  for (const [key, val] of Object.entries(values)) {
    if (!DEFS[key]) continue; // ignore unknown keys
    const clean = parse(DEFS[key].type, val);
    await pool.query(
      'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
      [key, String(clean)]
    );
    cache.set(key, clean);
  }
}

module.exports = { DEFS, load, get, all, publicValues, describe, update };
