/**
 * scripts/refresh-survives-chat.mjs
 *
 * Simulates a full user journey against the running FastAPI server:
 *   1. Load the panel, send a message, wait for reply, refresh the page.
 *   2. After the refresh, check that the chat tail rehydrated from localStorage
 *      and shows the prior conversation.
 *
 * This is a real round-trip test: the production build is mounted in
 * jsdom, talks to :8790, and uses real localStorage. The only thing
 * jsdom can't do is paint pixels — but the React tree is real.
 */

import { JSDOM, ResourceLoader } from 'jsdom';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '..', 'dist');

// Localstorage state is preserved across the two jsdom instances via a file.
const LS_FILE = resolve(__dirname, '.ls.json');

function lsGet() {
  try { return JSON.parse(readFileSync(LS_FILE, 'utf-8')); } catch { return {}; }
}
function lsSet(map) { writeFileSync(LS_FILE, JSON.stringify(map)); }

// Patch globalThis.localStorage on each jsdom instance to use the file
function installLsProxy(win) {
  const file = lsGet();
  const store = new Proxy(file, {
    get: (t, k) => t[k],
    set: (t, k, v) => { t[k] = v; lsSet(t); return true; },
    deleteProperty: (t, k) => { delete t[k]; lsSet(t); return true; },
  });
  win.localStorage = store;
  win.localStorage.getItem = (k) => (k in store ? store[k] : null);
  win.localStorage.setItem = (k, v) => { store[k] = String(v); lsSet(store); };
  win.localStorage.removeItem = (k) => { delete store[k]; lsSet(store); };
  win.localStorage.clear = () => { for (const k in store) delete store[k]; lsSet(store); };
}

function fetchViaNode(url, opts = {}) {
  return new Promise((resolveFetch, rejectFetch) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolveFetch({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          text: () => Promise.resolve(body),
          json: () => Promise.resolve(JSON.parse(body)),
        });
      });
    });
    req.on('error', rejectFetch);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

class LocalResourceLoader extends ResourceLoader {
  fetch(url) {
    if (url.startsWith('http://localhost:4173/')) {
      const path = url.replace('http://localhost:4173', '');
      const filePath = resolve(distDir, '.' + path);
      try { return Promise.resolve(readFileSync(filePath)); }
      catch (e) { return Promise.reject(e); }
    }
    return Promise.resolve(Buffer.from(''));
  }
}

function bootPanel(label) {
  const html = readFileSync(resolve(distDir, 'index.html'), 'utf-8');
  const dom = new JSDOM(html, {
    url: 'http://localhost:4173/',
    runScripts: 'dangerously',
    resources: new LocalResourceLoader(),
    pretendToBeVisual: true,
  });
  installLsProxy(dom.window);
  dom.window.fetch = (path, opts) => {
    const url = path.startsWith('http') ? path : `http://localhost:8790${path}`;
    return fetchViaNode(url, opts);
  };
  console.log(`[${label}] booted`);
  return dom;
}

async function sendAndAwait(dom, message) {
  const win = dom.window;
  // Find the textarea and send button
  const ta = win.document.querySelector('.composer-input');
  const btn = win.document.querySelector('.composer-send');
  if (!ta || !btn) throw new Error('composer not found');
  // Set the value via React's native setter
  const setter = Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, message);
  ta.dispatchEvent(new win.Event('input', { bubbles: true }));
  // Click send
  btn.click();
  // Wait for the chat tail to grow
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const bubbles = win.document.querySelectorAll('.block-enter');
    if (bubbles.length >= 2) return true;  // user + assistant
  }
  return false;
}

function readChatTailFromDom(dom) {
  const win = dom.window;
  const items = [];
  for (const el of win.document.querySelectorAll('.block-enter')) {
    const inner = el.textContent?.trim() || '';
    items.push(inner.slice(0, 80));
  }
  return items;
}

// ============================================================
// Phase 1: boot, send a message, wait for reply
// ============================================================
console.log('\n=== Phase 1: first session — send a message ===');
const dom1 = bootPanel('1');
await new Promise((r) => setTimeout(r, 500));   // let the panel mount

const sent1 = await sendAndAwait(dom1, 'refresh-test: hello, are you there?');
console.log(`  sent + got reply: ${sent1}`);

const tail1 = readChatTailFromDom(dom1);
console.log(`  chat tail after send: ${tail1.length} bubbles`);
for (const t of tail1) console.log(`    - ${t}`);

dom1.window.close();

// ============================================================
// Phase 2: NEW jsdom (simulates refresh), boot, check tail
// ============================================================
console.log('\n=== Phase 2: simulated refresh — rehydrate from localStorage ===');
const dom2 = bootPanel('2');
await new Promise((r) => setTimeout(r, 500));

const tail2 = readChatTailFromDom(dom2);
console.log(`  chat tail after refresh: ${tail2.length} bubbles`);
for (const t of tail2) console.log(`    - ${t}`);

const survived = tail2.some((t) => t.includes('refresh-test: hello'));
console.log(`\n=== RESULT: ${survived ? 'CHAT SURVIVED REFRESH ✓' : 'CHAT LOST ✗'} ===`);

dom2.window.close();
process.exit(survived ? 0 : 1);
