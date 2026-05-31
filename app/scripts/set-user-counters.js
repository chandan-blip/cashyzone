'use strict';

// Manually set the activity counters for a single user by id.
//
// Usage (from the app/ folder):
//   node scripts/set-user-counters.js --id=5 --task_completed=10 --task_earning=3000
//   node scripts/set-user-counters.js --id=5 --bonus_money=500 --transactions_count=12
//   node scripts/set-user-counters.js --id=5 --total_perchased=1500
//
// Only the fields you pass are changed; the rest are left untouched.
require('dotenv').config();

const pool = require('../src/db');

// Columns this script is allowed to set (whitelist guards against typos/SQLi).
const ALLOWED = [
  'task_completed',
  'total_perchased',
  'task_earning',
  'bonus_money',
  'transactions_count',
];

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--([a-z_]+)=(.+)$/.exec(a);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const id = Number(args.id);
  if (!Number.isInteger(id) || id <= 0) {
    console.error('Error: pass a valid user id, e.g. --id=5');
    process.exit(1);
  }

  const sets = [];
  const params = [];
  for (const col of ALLOWED) {
    if (args[col] === undefined) continue;
    const val = Number(args[col]);
    if (Number.isNaN(val)) {
      console.error(`Error: ${col} must be a number, got "${args[col]}"`);
      process.exit(1);
    }
    sets.push(`\`${col}\` = ?`);
    params.push(val);
  }

  if (sets.length === 0) {
    console.error(`Error: pass at least one field to set. Allowed: ${ALLOWED.join(', ')}`);
    process.exit(1);
  }

  params.push(id);
  try {
    const [res] = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = ?`,
      params
    );
    if (res.affectedRows === 0) {
      console.error(`No user found with id ${id}`);
      process.exit(1);
    }
    const [[row]] = await pool.query(
      `SELECT id, name, email, ${ALLOWED.join(', ')} FROM users WHERE id = ?`,
      [id]
    );
    console.log('Updated user counters:');
    console.table([row]);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
