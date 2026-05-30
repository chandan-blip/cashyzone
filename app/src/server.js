'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const pool = require('./db');
const settings = require('./settings');
const authRouter = require('./routes/auth');
const walletRouter = require('./routes/wallet');
const tasksRouter = require('./routes/tasks');
const adminRouter = require('./routes/admin');
const kycRouter = require('./routes/kyc');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check — also confirms DB connectivity.
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'up' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'down', error: err.message });
  }
});

// Public, unauthenticated settings (e.g. Telegram support link for the footer).
app.get('/api/public-settings', (req, res) => {
  res.json(settings.publicValues());
});

app.use('/api/auth', authRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/kyc', kycRouter);
app.use('/api/admin', adminRouter);

// Central error handler.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Load admin-editable settings into cache before accepting traffic.
settings.load()
  .then(() => console.log('Settings loaded.'))
  .catch((err) => console.error('Settings load failed (using defaults):', err.message))
  .finally(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`cashyzone listening on http://0.0.0.0:${PORT}`);
    });
  });
