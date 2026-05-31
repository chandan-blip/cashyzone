'use strict';

// Lightweight Telegram notifier. Posts payment alerts to the dashboard channel
// using the Bot API. Credentials come from the environment:
//   TELEGRAM_BOT_TOKEN       — bot token from @BotFather
//   TELEGRAM_DASH_CHANNEL_ID — chat/channel id to post into (e.g. -100...)
// Sending is best-effort: failures are logged but never block the request.

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHANNEL_ID = process.env.TELEGRAM_DASH_CHANNEL_ID || '';

const enabled = Boolean(BOT_TOKEN && CHANNEL_ID);
if (!enabled) {
  console.warn('[telegram] TELEGRAM_BOT_TOKEN / TELEGRAM_DASH_CHANNEL_ID not set — payment alerts disabled');
}

// Escape the small set of characters that break Telegram HTML parse mode.
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Send a raw HTML message to the dashboard channel. Returns a promise that
// always resolves — errors are swallowed (after logging) so callers can fire
// and forget without try/catch.
async function sendMessage(html) {
  if (!enabled) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHANNEL_ID,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[telegram] sendMessage failed (${res.status}): ${body}`);
    }
  } catch (err) {
    console.error('[telegram] sendMessage error:', err.message);
  }
}

// Notify the channel that a registration fee / GST (or other fee) was paid.
// `kind` is a human label, e.g. "Registration fee" or "GST on withdrawal".
function notifyPayment({ kind, name, utr, amount }) {
  const lines = [
    `💰 <b>${esc(kind)} paid</b>`,
    `Name: <b>${esc(name)}</b>`,
    `UTR: <code>${esc(utr)}</code>`,
    `Amount: <b>₹${esc(amount)}</b>`,
  ];
  // Fire and forget — don't await in the request path.
  void sendMessage(lines.join('\n'));
}

module.exports = { sendMessage, notifyPayment, enabled };
