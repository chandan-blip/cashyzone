'use strict';

const express = require('express');
const pool = require('../db');
const { authRequired } = require('../auth');
const { CURRENCY } = require('../config');
const settings = require('../settings');

const router = express.Router();
router.use(authRequired);

// Current KYC status for the logged-in user. This is the single source of truth
// the frontend uses to decide what to show — it is read fresh from the DB on
// every request, so it survives logout/login.
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM kyc WHERE user_id = ?', [req.user.id]);
    const kyc = rows[0] || null;
    res.json({
      currency: CURRENCY,
      fee: settings.get('kyc_fee'),
      upi: { id: settings.get('upi_id'), name: settings.get('upi_name') },
      // null = not started, otherwise the row's status
      status: kyc ? kyc.status : null,
      // true when the user has submitted the form but not yet paid the fee.
      needsPayment: !!kyc && kyc.status === 'awaiting_payment',
      kyc: kyc
        ? {
            id: kyc.id,
            full_name: kyc.full_name,
            status: kyc.status,
            deposit_id: kyc.deposit_id,
            created_at: kyc.created_at,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

// Submit (or re-submit after rejection) KYC details. Status becomes
// 'awaiting_payment' until the KYC fee is paid.
router.post('/', async (req, res, next) => {
  try {
    const full_name = (req.body.full_name || '').trim();
    const pan = (req.body.pan || '').trim();
    const aadhaar = (req.body.aadhaar || '').trim();
    const bank_account = (req.body.bank_account || '').trim();
    const ifsc = (req.body.ifsc || '').trim();
    const address = (req.body.address || '').trim();

    if (!full_name) return res.status(400).json({ error: 'Full name is required' });
    if (!pan && !aadhaar) {
      return res.status(400).json({ error: 'Please provide PAN or Aadhaar' });
    }

    const [existing] = await pool.query('SELECT * FROM kyc WHERE user_id = ?', [req.user.id]);
    if (existing.length > 0) {
      const cur = existing[0];
      if (cur.status === 'verified') {
        return res.status(409).json({ error: 'Your KYC is already verified' });
      }
      if (cur.status === 'pending') {
        return res.status(409).json({ error: 'Your KYC is already submitted and under review' });
      }
      // awaiting_payment or rejected → update details, reset to awaiting_payment.
      await pool.query(
        `UPDATE kyc SET full_name = ?, pan = ?, aadhaar = ?, bank_account = ?, ifsc = ?, address = ?,
         status = 'awaiting_payment', deposit_id = NULL, reviewed_at = NULL WHERE user_id = ?`,
        [full_name, pan || null, aadhaar || null, bank_account || null, ifsc || null, address || null, req.user.id]
      );
    } else {
      await pool.query(
        `INSERT INTO kyc (user_id, full_name, pan, aadhaar, bank_account, ifsc, address, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'awaiting_payment')`,
        [req.user.id, full_name, pan || null, aadhaar || null, bank_account || null, ifsc || null, address || null]
      );
    }

    res.status(201).json({ status: 'awaiting_payment', needsPayment: true, fee: settings.get('kyc_fee') });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
