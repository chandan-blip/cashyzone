'use strict';

// Generates 50 data-entry typing tasks (~500 chars each) into src/data/tasks.json.
// Run once: node scripts/gen-tasks.js
const fs = require('fs');
const path = require('path');

const topics = [
  'customer support', 'inventory records', 'medical transcription', 'legal filing',
  'banking ledger', 'e-commerce catalog', 'survey responses', 'shipping manifest',
  'real estate listing', 'insurance claim', 'HR onboarding', 'invoice processing',
  'library catalog', 'travel booking', 'school admission', 'utility billing',
  'product review', 'meeting minutes', 'research abstract', 'tax document',
];

const sentences = [
  'Please enter the following text exactly as shown, preserving punctuation, spacing and capitalisation.',
  'Accuracy matters more than speed, so re-read each line before moving to the next field in the form.',
  'The reward is credited to your wallet only when the typed text matches the original character for character.',
  'Data entry operators must avoid auto-correct and copy-paste, typing every word manually for verification.',
  'This record is part of a larger batch and will be cross-checked against the source document by a reviewer.',
  'Maintain a steady rhythm, keep your fingers on the home row, and double-check numbers and special symbols.',
  'Once submitted, the entry is locked and cannot be edited, so confirm the spelling of every proper noun.',
  'Treat each task as a real production job where quality directly affects the payout you receive in rupees.',
];

function buildText(i) {
  const topic = topics[i % topics.length];
  let text = `Task ${i + 1} — ${topic} batch. `;
  let k = i;
  while (text.length < 480) {
    text += sentences[k % sentences.length] + ' ';
    k++;
  }
  return text.trim().slice(0, 500);
}

// Tiered buy-in prices starting at ₹499. Reward on completion is always 3x.
const prices = [499, 999, 1999, 2999, 4999];

const tasks = Array.from({ length: 150 }, (_, i) => {
  const price = prices[i % prices.length];
  return {
    id: i + 1,
    title: `${topics[i % topics.length].replace(/\b\w/g, (c) => c.toUpperCase())} Entry #${i + 1}`,
    category: 'Data Entry',
    price,            // amount paid from wallet to unlock the task
    reward: price * 3, // credited on completion (net +2x profit)
    text: buildText(i),
  };
});

const out = path.join(__dirname, '..', 'src', 'data', 'tasks.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(tasks, null, 2));
console.log(`Wrote ${tasks.length} tasks to ${out}`);
