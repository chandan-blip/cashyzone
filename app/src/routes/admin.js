'use strict';

const express = require('express');
const pool = require('../db');
const { adminRequired } = require('../auth');
const settings = require('../settings');
const { creditFirstDepositBonus } = require('../bonus');

const router = express.Router();
router.use(adminRequired);

// Read all admin-editable settings (with definitions for the form).
router.get('/settings', (req, res) => {
  res.json({ settings: settings.describe() });
});

// Update one or more settings.
router.put('/settings', async (req, res, next) => {
  try {
    const values = req.body && typeof req.body === 'object' ? req.body : {};
    await settings.update(values);
    res.json({ ok: true, settings: settings.describe() });
  } catch (err) {
    next(err);
  }
});

// Dashboard summary counters. Counts cover only non-auto users (auto_mode = 0)
// — the manually-managed accounts the admin actually reviews.
router.get('/stats', async (req, res, next) => {
  try {
    const [[totalUsers]] = await pool.query('SELECT COUNT(*) AS n FROM users WHERE auto_mode = 0');
    const [[todayUsers]] = await pool.query(
      'SELECT COUNT(*) AS n FROM users WHERE auto_mode = 0 AND DATE(created_at) = CURDATE()'
    );
    const [[totalDeposits]] = await pool.query(
      'SELECT COUNT(*) AS n FROM deposits d JOIN users u ON u.id = d.user_id WHERE u.auto_mode = 0'
    );
    const [[todayDeposits]] = await pool.query(
      'SELECT COUNT(*) AS n FROM deposits d JOIN users u ON u.id = d.user_id WHERE u.auto_mode = 0 AND DATE(d.created_at) = CURDATE()'
    );
    res.json({
      todayUsers: todayUsers.n,
      todayDeposits: todayDeposits.n,
      totalUsers: totalUsers.n,
      totalDeposits: totalDeposits.n,
    });
  } catch (err) {
    next(err);
  }
});

// All users.
router.get('/users', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, balance, is_admin, auto_mode,
              total_income, task_completed, total_perchased, task_earning, bonus_money,
              withdrawal, transactions_count,
              created_at
         FROM users ORDER BY id DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Toggle a user's per-user automation (auto-approve deposits/withdrawals + auto KYC).
router.post('/users/:id/auto', async (req, res, next) => {
  try {
    const enabled = req.body.enabled === true || req.body.enabled === 'true' ? 1 : 0;
    const [result] = await pool.query('UPDATE users SET auto_mode = ? WHERE id = ?', [enabled, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true, auto_mode: enabled });
  } catch (err) {
    next(err);
  }
});

// Deposit requests (optionally filter by status).
router.get('/deposits', async (req, res, next) => {
  try {
    const { status } = req.query;
    const params = [];
    let sql =
      `SELECT d.*, u.name, u.email FROM deposits d JOIN users u ON u.id = d.user_id`;
    if (status) { sql += ' WHERE d.status = ?'; params.push(status); }
    sql += ' ORDER BY d.id DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Approve a deposit: credit the user's balance and log the transaction.
router.post('/deposits/:id/approve', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM deposits WHERE id = ? FOR UPDATE', [req.params.id]);
    if (rows.length === 0) { await conn.rollback(); return res.status(404).json({ error: 'Deposit not found' }); }
    const dep = rows[0];
    if (dep.status !== 'pending') { await conn.rollback(); return res.status(409).json({ error: 'Already reviewed' }); }

    await conn.query("UPDATE deposits SET status = 'approved', reviewed_at = NOW() WHERE id = ?", [dep.id]);
    // Credit the wallet but NOT Total Income — only transfers count as income.
    await conn.query(
      'UPDATE users SET balance = balance + ?, transactions_count = transactions_count + 1 WHERE id = ?',
      [dep.amount, dep.user_id]
    );
    await conn.query(
      'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
      [dep.user_id, 'deposit', dep.amount, `Deposit approved (UTR ${dep.utr})`]
    );
    // First-deposit welcome bonus — only on real wallet deposits (KYC/GST fees
    // carry a `note`, so they are excluded).
    if (!dep.note) {
      await creditFirstDepositBonus(conn, dep.user_id);
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// Reject a deposit: nothing was credited, just mark it.
router.post('/deposits/:id/reject', async (req, res, next) => {
  try {
    const [result] = await pool.query(
      "UPDATE deposits SET status = 'rejected', reviewed_at = NOW() WHERE id = ? AND status = 'pending'",
      [req.params.id]
    );
    if (result.affectedRows === 0) return res.status(409).json({ error: 'Not found or already reviewed' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Withdrawal requests (optionally filter by status).
router.get('/withdrawals', async (req, res, next) => {
  try {
    const { status } = req.query;
    const params = [];
    let sql =
      `SELECT w.*, u.name, u.email FROM withdrawals w JOIN users u ON u.id = w.user_id`;
    if (status) { sql += ' WHERE w.status = ?'; params.push(status); }
    sql += ' ORDER BY w.id DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Approve a withdrawal: funds were already held on request, just log it.
router.post('/withdrawals/:id/approve', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM withdrawals WHERE id = ? FOR UPDATE', [req.params.id]);
    if (rows.length === 0) { await conn.rollback(); return res.status(404).json({ error: 'Withdrawal not found' }); }
    const wd = rows[0];
    if (wd.status !== 'pending') { await conn.rollback(); return res.status(409).json({ error: 'Already reviewed' }); }

    await conn.query("UPDATE withdrawals SET status = 'approved', reviewed_at = NOW() WHERE id = ?", [wd.id]);
    await conn.query(
      'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
      [wd.user_id, 'withdraw', wd.amount, `Withdrawal paid to ${wd.upi_id}`]
    );
    await conn.query(
      'UPDATE users SET withdrawal = withdrawal + ?, transactions_count = transactions_count + 1 WHERE id = ?',
      [wd.amount, wd.user_id]
    );
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// Reject a withdrawal: refund the held amount back to the user's balance.
router.post('/withdrawals/:id/reject', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM withdrawals WHERE id = ? FOR UPDATE', [req.params.id]);
    if (rows.length === 0) { await conn.rollback(); return res.status(404).json({ error: 'Withdrawal not found' }); }
    const wd = rows[0];
    if (wd.status !== 'pending') { await conn.rollback(); return res.status(409).json({ error: 'Already reviewed' }); }

    await conn.query("UPDATE withdrawals SET status = 'rejected', reviewed_at = NOW() WHERE id = ?", [wd.id]);
    await conn.query('UPDATE users SET balance = balance + ? WHERE id = ?', [wd.amount, wd.user_id]);
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// KYC requests (optionally filter by status). Includes the linked fee deposit.
router.get('/kyc', async (req, res, next) => {
  try {
    const { status } = req.query;
    const params = [];
    let sql = `SELECT k.*, u.name, u.email, d.amount AS fee_amount, d.utr AS fee_utr, d.status AS fee_status
               FROM kyc k JOIN users u ON u.id = k.user_id
               LEFT JOIN deposits d ON d.id = k.deposit_id`;
    if (status) { sql += ' WHERE k.status = ?'; params.push(status); }
    sql += ' ORDER BY k.id DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Verify a KYC. Also approves the linked fee deposit (credits it like any deposit).
router.post('/kyc/:id/verify', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM kyc WHERE id = ? FOR UPDATE', [req.params.id]);
    if (rows.length === 0) { await conn.rollback(); return res.status(404).json({ error: 'KYC not found' }); }
    const kyc = rows[0];
    if (kyc.status !== 'pending') { await conn.rollback(); return res.status(409).json({ error: 'Not awaiting review' }); }

    // Approve the linked fee deposit (if still pending) and credit it.
    if (kyc.deposit_id) {
      const [deps] = await conn.query("SELECT * FROM deposits WHERE id = ? FOR UPDATE", [kyc.deposit_id]);
      if (deps.length && deps[0].status === 'pending') {
        const dep = deps[0];
        await conn.query("UPDATE deposits SET status = 'approved', reviewed_at = NOW() WHERE id = ?", [dep.id]);
        await conn.query(
          'UPDATE users SET balance = balance + ?, transactions_count = transactions_count + 1 WHERE id = ?',
          [dep.amount, dep.user_id]
        );
        await conn.query(
          'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
          [dep.user_id, 'deposit', dep.amount, `KYC fee (UTR ${dep.utr})`]
        );
      }
    }

    await conn.query("UPDATE kyc SET status = 'verified', reviewed_at = NOW() WHERE id = ?", [kyc.id]);
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// Reject a KYC: the user must re-submit (and pay again if needed).
router.post('/kyc/:id/reject', async (req, res, next) => {
  try {
    const [result] = await pool.query(
      "UPDATE kyc SET status = 'rejected', reviewed_at = NOW() WHERE id = ? AND status = 'pending'",
      [req.params.id]
    );
    if (result.affectedRows === 0) return res.status(409).json({ error: 'Not found or already reviewed' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
