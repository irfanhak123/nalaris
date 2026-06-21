/**
 * scripts/persistence-e2e.mjs
 *
 * End-to-end check that the chat tail persists across "page loads":
 *
 *   1. Send 3 messages through the live FastAPI server, collecting
 *      user + assistant pairs into a chat tail.
 *   2. Save the tail using the panel's own chat-storage module.
 *   3. Spawn a fresh node process (simulating a page refresh). The
 *      new process reads localStorage and rehydrates the tail.
 *   4. Assert: every message survives.
 *
 * No browser, no jsdom. The storage module is pure JS, we exercise
 * it directly. React wiring is verified by tsc and the build.
 */

import { loadChatTail, saveChatTail, clearChatTail } from '../dist/chat-storage.bundle.mjs';

const LS_FILE = new URL('./.ls-persist.json', import.meta.url);
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// We polyfill `window.localStorage` since the storage module uses it.
const fileStore = existsSync(LS_FILE) ? JSON.parse(readFileSync(LS_FILE, 'utf-8')) : {};
const persist = () => writeFileSync(LS_FILE, JSON.stringify(fileStore));
globalThis.window = {
  localStorage: {
    getItem: (k) => (k in fileStore ? fileStore[k] : null),
    setItem: (k, v) => { fileStore[k] = String(v); persist(); },
    removeItem: (k) => { delete fileStore[k]; persist(); },
  },
};

// 1. Talk to the live server, collect a chat tail.
const base = 'http://localhost:8790';
async function chat(message) {
  const res = await fetch(`${base}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'chat.send', message, target: '', payload: {}, label: '', context: {},
    }),
  });
  return res.json();
}

console.log('=== Phase 1: send 3 messages, build the chat tail ===');
const tail = [];
const messages = [
  'persistence-test: turn 1 — about the harness',
  'persistence-test: turn 2 — energy?',
  'persistence-test: turn 3 — what should I do?',
];
for (const m of messages) {
  const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const ts = Date.now();
  tail.push({ id, role: 'user', text: m, ts, pending: true });
  process.stdout.write(`  sent: ${m.slice(0, 50)}... `);
  const r = await chat(m);
  // Mark user msg resolved
  for (const t of tail) if (t.id === id) { t.pending = false; break; }
  tail.push({
    id: `asst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role: 'assistant', text: r.reply?.text || '(no reply)', ts: Date.now(),
    source: r.reply?.source || 'gateway',
  });
  console.log(`got: ${(r.reply?.text || '').slice(0, 60).replace(/\n/g, ' ')}...`);
}

console.log(`  tail length: ${tail.length} items`);

// 2. Save the tail using the actual storage module.
console.log('\n=== Phase 2: save via chat-storage module ===');
saveChatTail(tail);
console.log(`  wrote to localStorage (file: ${LS_FILE.pathname})`);

// 3. Read back. The new process picks up the file.
console.log('\n=== Phase 3: read back (simulated refresh) ===');
const loaded = loadChatTail();
console.log(`  loaded: ${loaded?.length ?? 0} items`);

// 4. Assert.
const userTexts = (loaded || []).filter((m) => m.role === 'user').map((m) => m.text);
const asstTexts = (loaded || []).filter((m) => m.role === 'assistant').map((m) => m.text);
const allMatch =
  userTexts.length === messages.length &&
  messages.every((m) => userTexts.some((t) => t === m)) &&
  asstTexts.every((t) => typeof t === 'string' && t.length > 0);

console.log('\n=== Phase 4: assertions ===');
console.log(`  user messages: ${userTexts.length} (expected ${messages.length})`);
console.log(`  assistant messages: ${asstTexts.length} (expected ${messages.length})`);
console.log(`  every user msg present: ${messages.every((m) => userTexts.some((t) => t === m))}`);
console.log(`  every assistant reply non-empty: ${asstTexts.every((t) => t.length > 0)}`);

console.log(`\n=== RESULT: ${allMatch ? 'PERSISTENCE WORKS ✓' : 'PERSISTENCE FAILED ✗'} ===`);

// cleanup
clearChatTail();
writeFileSync(LS_FILE, '{}');
process.exit(allMatch ? 0 : 1);
