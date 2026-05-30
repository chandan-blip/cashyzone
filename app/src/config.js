'use strict';

// App-wide constants. Currency is INR everywhere.
module.exports = {
  CURRENCY: 'INR',

  // Hardcoded UPI payee shown on the deposit checkout QR.
  // Change these to your real UPI details.
  UPI: {
    id: 'cashyzone@upi',
    name: 'CashyZone',
  },

  // Admin account auto-created by the migration.
  ADMIN: {
    name: 'Admin',
    email: 'admin@cashyzone.com',
    password: 'admin123',
  },

  // Min characters of the source text that must match to claim a typing task.
  MIN_TYPING_ACCURACY: 0.97,

  // One-time KYC verification fee (INR). A user must submit KYC details AND pay
  // this fee before they can withdraw.
  KYC_FEE: 999,
};
