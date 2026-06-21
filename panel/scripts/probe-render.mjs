/**
 * scripts/probe-render.mjs — diagnostic, see what jsdom actually renders.
 */
import { JSDOM, ResourceLoader } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '..', 'dist');
const html = readFileSync(resolve(distDir, 'index.html'), 'utf-8');

class LocalResourceLoader extends ResourceLoader {
  fetch(url) {
    if (url.startsWith('http://localhost:4173/')) {
      const path = url.replace('http://localhost:4173', '');
      const filePath = resolve(distDir, '.' + path);
      try { return Promise.resolve(readFileSync(filePath)); }
      catch (e) { console.log('RESOURCE MISS:', path, e.message); return Promise.resolve(Buffer.from('')); }
    }
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

win.fetch = (path, opts) => new Promise((resolve, reject) => {
  const url = path.startsWith('http') ? path : `http://localhost:8790${path}`;
  const u = new URL(url);
  const req = http.request({
    hostname: u.hostname, port: u.port, path: u.pathname + u.search,
    method: opts?.method || 'GET', headers: opts?.headers || {},
  }, (res) => {
    const chunks = [];
    res.on('data', c => chunks.push(c));
    res.on('end', () => resolve({
      ok: res.statusCode >= 200 && res.statusCode < 300,
      status: res.statusCode,
      text: () => Promise.resolve(Buffer.concat(chunks).toString('utf-8')),
      json: () => Promise.resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))),
    }));
  });
  req.on('error', reject);
  if (opts?.body) req.write(opts.body);
  req.end();
});

win.addEventListener('error', e => console.log('WIN ERROR:', e.message));
win.addEventListener('unhandledrejection', e => console.log('UNHANDLED REJ:', e.reason?.message));

await new Promise(r => setTimeout(r, 5000));

const root = win.document.getElementById('root');
console.log('root.children:', root?.childElementCount);
console.log('root.innerHTML.length:', root?.innerHTML.length);
console.log('root snippet (first 500):', root?.innerHTML.slice(0, 500));
console.log('all .block elements:', win.document.querySelectorAll('.block').length);
console.log('all .composer elements:', win.document.querySelectorAll('.composer').length);
console.log('all .sidebar elements:', win.document.querySelectorAll('.sidebar').length);

dom.window.close();
