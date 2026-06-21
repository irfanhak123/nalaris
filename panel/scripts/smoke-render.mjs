/**
 * scripts/smoke-render.mjs
 *
 * Loads the production build into a jsdom environment, polls /blocks
 * from the running FastAPI server, mounts the app, and dumps the
 * resulting HTML. Confirms the panel renders real data end-to-end.
 *
 * Run with:  node scripts/smoke-render.mjs
 */

import { JSDOM, ResourceLoader } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '..', 'dist');

// 1. Read the built HTML
const html = readFileSync(resolve(distDir, 'index.html'), 'utf-8');

// 2. Track which assets to load
const jsAssets = [];
const cssAssets = [];
const re = /(?:src|href)="(\/assets\/[^"]+)"/g;
let m;
while ((m = re.exec(html))) {
  if (m[1].endsWith('.js')) jsAssets.push(m[1]);
  else if (m[1].endsWith('.css')) cssAssets.push(m[1]);
}
console.log('JS assets:', jsAssets);
console.log('CSS assets:', cssAssets);

// 3. Stub the proxy: serve the JS/CSS from the dist dir, but have the
//    app's fetch() calls go to the real FastAPI server.
class LocalResourceLoader extends ResourceLoader {
  fetch(url, options) {
    if (url.startsWith('http://localhost:4173/')) {
      const path = url.replace('http://localhost:4173', '');
      const filePath = resolve(distDir, '.' + path);
      try {
        const buf = readFileSync(filePath);
        return Promise.resolve(buf);
      } catch (e) {
        return Promise.reject(e);
      }
    }
    // Block all other external resources (we don't need them).
    return Promise.resolve(Buffer.from(''));
  }
}

const dom = new JSDOM(html, {
  url: 'http://localhost:4173/',
  runScripts: 'dangerously',
  resources: new LocalResourceLoader(),
  pretendToBeVisual: true,
});

const win = dom.window;

// 4. Polyfill fetch to point at the real FastAPI server
win.fetch = (path, opts) => {
  const url = path.startsWith('http') ? path : `http://localhost:8790${path}`;
  return import('node:http').then(({ request }) => new Promise((resolveFetch, rejectFetch) => {
    const u = new URL(url);
    const req = request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: opts?.method || 'GET',
      headers: opts?.headers || {},
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolveFetch({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: res.statusMessage,
          text: () => Promise.resolve(body),
          json: () => Promise.resolve(JSON.parse(body)),
        });
      });
    });
    req.on('error', rejectFetch);
    if (opts?.body) req.write(opts.body);
    req.end();
  }));
};

// 5. Wait for the bundle to execute and the panel to render. The polling
//    loop fires every 5s; we give it 6s and then dump the result.
await new Promise((r) => setTimeout(r, 6000));

// 6. Dump the rendered DOM
const root = win.document.getElementById('root');
const html_out = root ? root.innerHTML : '(no #root)';
console.log('\n=== RENDERED HTML (root) ===');
console.log(html_out.substring(0, 4000));
console.log('...');
console.log('=== END ===\n');

console.log('Root child count:', root?.childElementCount);
console.log('Sidebar present:', html_out.includes('sidebar'));
console.log('Header present:', html_out.includes('header'));
console.log('Composer present:', html_out.includes('composer'));
console.log('One-thing block:', html_out.includes('one-thing') || html_out.includes('ONE thing'));
console.log('Greeting rendered:', html_out.includes('Evening, laptophp') || html_out.includes('Good morning') || html_out.includes('Afternoon') || html_out.includes('Midday') || html_out.includes('Late night'));
console.log('Question rendered:', html_out.includes('Question') || html_out.includes('EL4044') || html_out.includes('Calendar is unreachable'));
console.log('Calendar offline chip:', html_out.includes('Calendar offline') || html_out.includes('calendar-down') || html_out.includes('caldown'));

dom.window.close();
