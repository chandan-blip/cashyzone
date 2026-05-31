'use strict';

const express = require('express');
const pool = require('../db');
const { authRequired, optionalAuth } = require('../auth');
const settings = require('../settings');

const tasks = require('../data/tasks.json');
const byId = new Map(tasks.map((t) => [t.id, t]));

const router = express.Router();

// Reward = task price × the admin-configured multiplier (default 3×).
function rewardFor(price) {
  return Math.round(Number(price) * Number(settings.get('task_reward_multiplier')));
}

// Character-level accuracy between the source and the typed text (0..1).
function accuracy(source, typed) {
  const a = (source || '').trim();
  const b = (typed || '').trim();
  if (!a.length) return 0;
  let match = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) if (a[i] === b[i]) match++;
  // Penalise length mismatch so padding/truncating can't game the score.
  return match / Math.max(a.length, b.length);
}

// Normalise a cell value for comparison (case/space/comma-insensitive).
function norm(v) {
  return String(v == null ? '' : v).toLowerCase().replace(/,/g, '').replace(/\s+/g, ' ').trim();
}

// Short summary line shown on the task list card.
function summaryFor(t) {
  if (t.type === 'excel') {
    const total = t.steps.reduce((n, s) => n + s.rows.length, 0);
    return `${total} records · ${t.steps.length} batches`;
  }
  if (t.type === 'form') return `${t.records.length} entries · form`;
  return `${(t.text || '').length} characters`;
}

// Verify an excel-filter task: for every batch, the rows the user entered must
// match (as a set) the rows whose filter column equals the target value.
function verifyExcel(task, answers) {
  if (!Array.isArray(answers) || answers.length !== task.steps.length) return false;
  const cols = task.outputColumns.map((c) => c.key);
  for (let s = 0; s < task.steps.length; s++) {
    const expected = task.steps[s].rows
      .filter((r) => norm(r[task.filter.column]) === norm(task.filter.value))
      .map((r) => cols.map((k) => norm(r[k])).join('|'))
      .sort();
    const got = Array.isArray(answers[s]) ? answers[s] : [];
    const gotSer = got
      .map((row) => cols.map((_, j) => norm((row || [])[j])).join('|'))
      .filter((ser) => ser.replace(/\|/g, '').length > 0) // drop fully-empty rows
      .sort();
    if (gotSer.length !== expected.length) return false;
    for (let i = 0; i < expected.length; i++) if (gotSer[i] !== expected[i]) return false;
  }
  return true;
}

// Verify a form task: every record's fields must match the source record.
function verifyForm(task, answers) {
  if (!Array.isArray(answers) || answers.length !== task.records.length) return false;
  const keys = task.fields.map((f) => f.key);
  for (let i = 0; i < task.records.length; i++) {
    const exp = task.records[i];
    const got = answers[i] || {};
    for (const k of keys) if (norm(got[k]) !== norm(exp[k])) return false;
  }
  return true;
}

// List all tasks (without the full text). Includes the user's per-task status:
//   'none' (not bought) | 'purchased' (bought, can attempt) | 'completed'.
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    let statusById = new Map();
    if (req.user) {
      const [rows] = await pool.query(
        'SELECT task_id, status FROM task_purchases WHERE user_id = ?',
        [req.user.id]
      );
      statusById = new Map(rows.map((r) => [r.task_id, r.status]));
    }
    res.json(
      tasks.map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category,
        price: t.price,
        reward: rewardFor(t.price),
        type: t.type || 'text',
        summary: summaryFor(t),
        status: statusById.get(t.id) || 'none',
        completed: statusById.get(t.id) === 'completed',
        purchased: statusById.has(t.id),
      }))
    );
  } catch (err) {
    next(err);
  }
});

// Full task detail (includes the text to type) + the user's status for it.
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const task = byId.get(Number(req.params.id));
    if (!task) return res.status(404).json({ error: 'Task not found' });

    let status = 'none';
    let progress = null;
    if (req.user) {
      const [rows] = await pool.query(
        'SELECT status, progress FROM task_purchases WHERE user_id = ? AND task_id = ?',
        [req.user.id, task.id]
      );
      if (rows.length) {
        status = rows[0].status;
        if (rows[0].progress) { try { progress = JSON.parse(rows[0].progress); } catch { progress = null; } }
      }
    }
    res.json({ ...task, reward: rewardFor(task.price), status, completed: status === 'completed', purchased: status !== 'none', progress });
  } catch (err) {
    next(err);
  }
});

// Save the user's in-progress answers so they survive refresh / logout.
router.post('/:id/progress', authRequired, async (req, res, next) => {
  try {
    const task = byId.get(Number(req.params.id));
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const payload = JSON.stringify(req.body || {});
    if (payload.length > 60000) return res.status(413).json({ error: 'Progress too large' });
    const [r] = await pool.query(
      "UPDATE task_purchases SET progress = ? WHERE user_id = ? AND task_id = ? AND status = 'purchased'",
      [payload, req.user.id, task.id]
    );
    res.json({ ok: r.affectedRows > 0 });
  } catch (err) {
    next(err);
  }
});

// Buy a task: pay its price from the wallet, which unlocks attempting it.
router.post('/:id/buy', authRequired, async (req, res, next) => {
  const task = byId.get(Number(req.params.id));
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Already bought?
    const [existing] = await conn.query(
      'SELECT id FROM task_purchases WHERE user_id = ? AND task_id = ? FOR UPDATE',
      [req.user.id, task.id]
    );
    if (existing.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'You have already bought this task' });
    }

    // Enough balance?
    const [u] = await conn.query('SELECT balance FROM users WHERE id = ? FOR UPDATE', [req.user.id]);
    const balance = Number(u[0]?.balance ?? 0);
    if (balance < task.price) {
      await conn.rollback();
      return res.status(400).json({
        error: `Insufficient balance. This task costs ₹${task.price} — add money to your wallet first.`,
        price: task.price,
        balance,
      });
    }

    await conn.query(
      'UPDATE users SET balance = balance - ?, total_perchased = total_perchased + ?, transactions_count = transactions_count + 1 WHERE id = ?',
      [task.price, task.price, req.user.id]
    );
    await conn.query(
      'INSERT INTO task_purchases (user_id, task_id, price, reward, status) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, task.id, task.price, task.reward, 'purchased']
    );
    await conn.query(
      'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
      [req.user.id, 'purchase', task.price, `Bought task: ${task.title}`]
    );

    const [u2] = await conn.query('SELECT balance FROM users WHERE id = ?', [req.user.id]);
    await conn.commit();
    res.status(201).json({ status: 'purchased', price: task.price, reward: task.reward, balance: u2[0].balance });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// Claim a task: must be bought first. Verify the typed text, then credit 3x reward.
router.post('/:id/claim', authRequired, async (req, res, next) => {
  const task = byId.get(Number(req.params.id));
  if (!task) return res.status(404).json({ error: 'Task not found' });

  // Verify the submission according to the task type.
  if (task.type === 'excel') {
    if (!verifyExcel(task, req.body.answers)) {
      return res.status(400).json({ error: 'Some entered rows do not match. Please re-check every batch.' });
    }
  } else if (task.type === 'form') {
    if (!verifyForm(task, req.body.answers)) {
      return res.status(400).json({ error: 'Some entered details do not match. Please re-check each student.' });
    }
  } else {
    const need = Number(settings.get('min_typing_accuracy'));
    const score = accuracy(task.text, req.body.typed);
    if (score < need) {
      return res.status(400).json({
        error: `Text does not match closely enough (${Math.round(score * 100)}% accurate, need ${Math.round(need * 100)}%).`,
        accuracy: score,
      });
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT * FROM task_purchases WHERE user_id = ? AND task_id = ? FOR UPDATE',
      [req.user.id, task.id]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(403).json({ error: 'Please buy this task before attempting it.' });
    }
    if (rows[0].status === 'completed') {
      await conn.rollback();
      return res.status(409).json({ error: 'You have already completed this task' });
    }

    // Credit the reward that was locked in when the task was bought.
    const reward = Number(rows[0].reward);
    await conn.query(
      "UPDATE task_purchases SET status = 'completed', completed_at = NOW(), progress = NULL WHERE id = ?",
      [rows[0].id]
    );
    await conn.query(
      'UPDATE users SET balance = balance + ?, task_completed = task_completed + 1, task_earning = task_earning + ?, total_income = total_income + ?, transactions_count = transactions_count + 1 WHERE id = ?',
      [reward, reward, reward, req.user.id]
    );
    await conn.query(
      'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
      [req.user.id, 'earning', reward, `Task reward: ${task.title}`]
    );

    const [u] = await conn.query('SELECT balance FROM users WHERE id = ?', [req.user.id]);
    await conn.commit();
    res.json({ reward, balance: u[0].balance });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

module.exports = router;
