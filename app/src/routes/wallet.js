'use strict';

const express = require('express');
const pool = require('../db');
const { authRequired } = require('../auth');
const { CURRENCY } = require('../config');
const settings = require('../settings');
const { creditFirstDepositBonus } = require('../bonus');

const router = express.Router();
router.use(authRequired);

// Wallet overview: balance, transactions, and pending deposit/withdrawal requests.
router.get('/', async (req, res, next) => {
  try {
    const [u] = await pool.query(
      `SELECT balance, auto_mode, created_at,
              total_income, task_completed, total_perchased, task_earning, bonus_money,
              withdrawal, transactions_count
         FROM users WHERE id = ?`,
      [req.user.id]
    );
    const [tx] = await pool.query(
      'SELECT id, type, amount, description, created_at FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 50',
      [req.user.id]
    );
    const [deps] = await pool.query(
      'SELECT id, amount, utr, status, created_at FROM deposits WHERE user_id = ? ORDER BY id DESC LIMIT 20',
      [req.user.id]
    );
    const [wds] = await pool.query(
      'SELECT id, amount, upi_id, status, created_at FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 20',
      [req.user.id]
    );

    // Activity figures come straight from the denormalised counters on the
    // users row (kept in sync as the user transacts).
    const totalIncome = Number(u[0]?.total_income ?? 0);
    const taskEarning = Number(u[0]?.task_earning ?? 0);
    const bonusMoney = Number(u[0]?.bonus_money ?? 0);
    const totalPurchased = Number(u[0]?.total_perchased ?? 0);
    const tasksCompleted = Number(u[0]?.task_completed ?? 0);
    const withdrawal = Number(u[0]?.withdrawal ?? 0);
    const transactionsCount = Number(u[0]?.transactions_count ?? 0);

    // Pending-deposit total has no counter column, so it is still aggregated.
    const [[pendingDep]] = await pool.query(
      "SELECT COALESCE(SUM(amount),0) AS s FROM deposits WHERE user_id = ? AND status = 'pending'",
      [req.user.id]
    );

    res.json({
      currency: CURRENCY,
      balance: u[0]?.balance ?? 0,
      autoMode: !!u[0]?.auto_mode,
      memberSince: u[0]?.created_at ?? null,
      config: {
        gstPercent: settings.get('gst_percent'),
        withdrawMin: settings.get('withdraw_min'),
        withdrawMinTasks: settings.get('withdraw_min_tasks'),
      },
      stats: {
        totalIncome,
        taskIncome: taskEarning,
        bonusIncome: bonusMoney,
        withdrawn: withdrawal,
        tasksCompleted,
        totalPurchases: totalPurchased,
        transactionsCount,
        pendingDeposits: Number(pendingDep.s),
      },
      transactions: tx,
      deposits: deps,
      withdrawals: wds,
    });
  } catch (err) {
    next(err);
  }
});

// UPI payee info shown on the checkout / QR page.
router.get('/upi', (req, res) => {
  res.json({ currency: CURRENCY, upi: { id: settings.get('upi_id'), name: settings.get('upi_name') } });
});

// Submit a deposit request after paying via UPI (provides the UTR / reference no).
// `purpose: 'kyc'` marks this as the KYC fee payment, which links the deposit to
// the user's KYC row. `purpose: 'gst'` marks the 18% GST paid before a withdrawal.
router.post('/deposit', async (req, res, next) => {
  const amount = Number(req.body.amount);
  const utr = (req.body.utr || '').trim();
  const purpose = ['kyc', 'gst'].includes(req.body.purpose) ? req.body.purpose : 'wallet';
  if (!(amount > 0)) return res.status(400).json({ error: 'Amount must be greater than ₹0' });
  if (utr.length < 6) return res.status(400).json({ error: 'Please enter a valid UTR / reference number' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Automation is per-user: the user's auto_mode flag controls instant approval.
    const [au] = await conn.query('SELECT auto_mode FROM users WHERE id = ?', [req.user.id]);
    const userAuto = !!au[0]?.auto_mode;
    const autoDeposit = userAuto;
    const autoKyc = userAuto;

    const note = purpose === 'kyc' ? 'KYC verification fee'
      : purpose === 'gst' ? 'GST on withdrawal'
      : null;
    const depStatus = autoDeposit ? 'approved' : 'pending';
    const [result] = await conn.query(
      'INSERT INTO deposits (user_id, amount, utr, note, status, reviewed_at) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, amount, utr, note, depStatus, autoDeposit ? new Date() : null]
    );

    // Auto-approved deposits credit the wallet + log the ledger entry immediately.
    if (autoDeposit) {
      await conn.query(
        'UPDATE users SET balance = balance + ?, total_income = total_income + ?, transactions_count = transactions_count + 1 WHERE id = ?',
        [amount, amount, req.user.id]
      );
      const desc = purpose === 'kyc' ? `KYC fee (UTR ${utr})`
        : purpose === 'gst' ? `GST payment (UTR ${utr})`
        : `Deposit approved (UTR ${utr})`;
      await conn.query(
        'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
        [req.user.id, 'deposit', amount, desc]
      );
      // Welcome bonus only on a real wallet top-up (not KYC/GST fees).
      if (purpose === 'wallet') {
        await creditFirstDepositBonus(conn, req.user.id);
      }
    }

    if (purpose === 'kyc') {
      const [kycRows] = await conn.query(
        "SELECT id, status FROM kyc WHERE user_id = ? FOR UPDATE",
        [req.user.id]
      );
      if (kycRows.length === 0) {
        await conn.rollback();
        return res.status(400).json({ error: 'Please submit your KYC details first' });
      }
      if (kycRows[0].status !== 'awaiting_payment') {
        await conn.rollback();
        return res.status(409).json({ error: 'KYC fee already submitted' });
      }
      // Link the fee deposit; auto-verify KYC if enabled, else send to review.
      const kycStatus = autoKyc ? 'verified' : 'pending';
      await conn.query(
        'UPDATE kyc SET deposit_id = ?, status = ?, reviewed_at = ? WHERE user_id = ?',
        [result.insertId, kycStatus, autoKyc ? new Date() : null, req.user.id]
      );
    }

    await conn.commit();
    res.status(201).json({ id: result.insertId, status: depStatus, amount, utr, purpose });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// Request a withdrawal. The amount is held from the balance immediately.
router.post('/withdraw', async (req, res, next) => {
  const amount = Number(req.body.amount);
  const upiId = (req.body.upi_id || '').trim();
  const withdrawMin = Number(settings.get('withdraw_min'));
  if (!(amount > 0)) return res.status(400).json({ error: 'Amount must be greater than ₹0' });
  if (!upiId) return res.status(400).json({ error: 'Please enter the UPI ID to receive payment' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query('SELECT balance, auto_mode FROM users WHERE id = ? FOR UPDATE', [req.user.id]);
    const balance = Number(rows[0]?.balance ?? 0);
    const userAuto = !!rows[0]?.auto_mode;
    if (amount > balance) {
      await conn.rollback();
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Policy gates (minimum amount + required completed tasks) are skipped
    // entirely for auto-approve users — they are never blocked.
    if (!userAuto) {
      if (amount < withdrawMin) {
        await conn.rollback();
        return res.status(400).json({ error: `Minimum withdrawal is ₹${withdrawMin}` });
      }
      const minTasks = Number(settings.get('withdraw_min_tasks'));
      const [[done]] = await conn.query(
        "SELECT COUNT(*) AS n FROM task_purchases WHERE user_id = ? AND status = 'completed'",
        [req.user.id]
      );
      if (Number(done.n) < minTasks) {
        await conn.rollback();
        return res.status(403).json({
          error: `Complete at least ${minTasks} tasks before withdrawing (${done.n}/${minTasks} done).`,
          tasksCompleted: Number(done.n),
          tasksRequired: minTasks,
        });
      }
    }

    // Hold the funds now; they are refunded if the admin rejects the request.
    await conn.query('UPDATE users SET balance = balance - ? WHERE id = ?', [amount, req.user.id]);

    const autoWithdraw = userAuto; // per-user automation only
    const wdStatus = autoWithdraw ? 'approved' : 'pending';
    const [result] = await conn.query(
      'INSERT INTO withdrawals (user_id, amount, upi_id, status, reviewed_at) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, amount, upiId, wdStatus, autoWithdraw ? new Date() : null]
    );

    // Auto-approved withdrawals log the payout in the ledger immediately
    // (funds were already deducted above).
    if (autoWithdraw) {
      await conn.query(
        'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
        [req.user.id, 'withdraw', amount, `Withdrawal paid to ${upiId}`]
      );
      await conn.query(
        'UPDATE users SET withdrawal = withdrawal + ?, transactions_count = transactions_count + 1 WHERE id = ?',
        [amount, req.user.id]
      );
    }

    await conn.commit();
    res.status(201).json({ id: result.insertId, status: wdStatus, amount });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

module.exports = router;
