'use strict';

const settings = require('./settings');

// Credit the one-time first-deposit welcome bonus, if the user hasn't had it yet.
// Must be called inside an open transaction (`conn`). Idempotent: a user can only
// ever receive a single 'bonus' transaction, so calling it again is a no-op.
async function creditFirstDepositBonus(conn, userId) {
  const bonus = Number(settings.get('deposit_bonus'));
  if (!(bonus > 0)) return false;

  const [[b]] = await conn.query(
    "SELECT COUNT(*) AS n FROM transactions WHERE user_id = ? AND type = 'bonus'",
    [userId]
  );
  if (b.n > 0) return false; // already received the welcome bonus

  await conn.query(
    'UPDATE users SET balance = balance + ?, bonus_money = bonus_money + ?, total_income = total_income + ?, transactions_count = transactions_count + 1 WHERE id = ?',
    [bonus, bonus, bonus, userId]
  );
  await conn.query(
    "INSERT INTO transactions (user_id, type, amount, description) VALUES (?, 'bonus', ?, 'Welcome bonus (first deposit)')",
    [userId, bonus]
  );
  return true;
}

module.exports = { creditFirstDepositBonus };
