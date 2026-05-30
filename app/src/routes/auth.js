'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { signToken, authRequired } = require('../auth');

const router = express.Router();

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, balance: u.balance, is_admin: !!u.is_admin, created_at: u.created_at };
}

// Register a new account.
router.post('/register', async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    const phone = (req.body.phone || '').trim();
    const dob = (req.body.dob || '').trim() || null; // expects YYYY-MM-DD
    const state = (req.body.state || '').trim();
    const country = (req.body.country || '').trim();

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (phone && !/^[0-9+\-\s]{6,20}$/.test(phone)) {
      return res.status(400).json({ error: 'Please enter a valid phone number' });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, phone, dob, state, country) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, email, hash, phone || null, dob, state || null, country || null]
    );
    const user = { id: result.insertId, name, email, balance: 0, is_admin: 0 };
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    next(err);
  }
});

// Log in.
router.post('/login', async (req, res, next) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';

    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid email or password' });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// Current logged-in user (with fresh balance).
router.get('/me', authRequired, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: publicUser(rows[0]) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
