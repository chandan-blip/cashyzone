'use strict';

// Runs schema.sql against the configured database and seeds the admin account.
// Safe to run repeatedly (idempotent). Tasks themselves are hardcoded in
// src/data/tasks.json and are NOT stored in the database.
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('./db');
const { ADMIN } = require('./config');

// Adds a column to a table only if it doesn't already exist.
async function ensureColumn(conn, table, column, definition) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  if (rows[0].n === 0) {
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`Added missing column ${table}.${column}`);
  }
}

async function main() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  // Strip `-- ...` line comments first so semicolons inside comments don't
  // break the naive split-on-semicolon below.
  const cleaned = schema
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const conn = await pool.getConnection();
  try {
    for (const stmt of cleaned.split(';').map((s) => s.trim()).filter(Boolean)) {
      await conn.query(stmt);
    }

    // Self-heal: add columns that may be missing on an older `users` table
    // (CREATE TABLE IF NOT EXISTS won't alter an existing table).
    await ensureColumn(conn, 'users', 'is_admin', 'TINYINT(1) NOT NULL DEFAULT 0');
    await ensureColumn(conn, 'users', 'balance', 'DECIMAL(12,2) NOT NULL DEFAULT 0');
    await ensureColumn(conn, 'users', 'phone', 'VARCHAR(20)');
    await ensureColumn(conn, 'users', 'dob', 'DATE');
    await ensureColumn(conn, 'users', 'state', 'VARCHAR(100)');
    await ensureColumn(conn, 'users', 'country', 'VARCHAR(100)');
    await ensureColumn(conn, 'users', 'auto_mode', 'TINYINT(1) NOT NULL DEFAULT 0');
    await ensureColumn(conn, 'deposits', 'note', 'VARCHAR(255) NULL');
    await ensureColumn(conn, 'task_purchases', 'progress', 'TEXT NULL');

    // Ensure the transactions.type enum includes 'purchase' (buying tasks) and
    // 'bonus' (the first-deposit welcome bonus).
    await conn.query(
      "ALTER TABLE transactions MODIFY COLUMN type ENUM('deposit','withdraw','earning','purchase','bonus') NOT NULL"
    );

    // An older build used `item_id` here. If that legacy column exists, drop the
    // stale table (it only held completion records) so the correct schema applies.
    const [legacy] = await conn.query(
      `SELECT COUNT(*) AS n FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'task_completions' AND column_name = 'item_id'`
    );
    if (legacy[0].n > 0) {
      await conn.query('DROP TABLE IF EXISTS task_completions');
      await conn.query(`CREATE TABLE task_completions (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        user_id    INT NOT NULL,
        task_id    INT NOT NULL,
        reward     DECIMAL(12, 2) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_user_task (user_id, task_id),
        CONSTRAINT fk_tc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      console.log('Rebuilt legacy task_completions table (item_id → task_id)');
    }

    // Seed the admin account.
    const [rows] = await conn.query('SELECT id FROM users WHERE email = ?', [ADMIN.email]);
    if (rows.length === 0) {
      const hash = await bcrypt.hash(ADMIN.password, 10);
      await conn.query(
        'INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, 1)',
        [ADMIN.name, ADMIN.email, hash]
      );
      console.log(`Seeded admin: ${ADMIN.email} / ${ADMIN.password}`);
    } else {
      await conn.query('UPDATE users SET is_admin = 1 WHERE email = ?', [ADMIN.email]);
    }

    console.log('Migration complete.');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
