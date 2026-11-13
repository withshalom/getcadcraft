/* SPDX-License-Identifier: Apache-2.0 */
/**
 * browser-run.mjs — cc-solid's "same bits everywhere" check, in real browser engines, unattended.
 *
 *   node tools/solid/browser-run.mjs              serve the repository on a local port, open tools/solid/browser.html in
 *                                                 Chromium, Firefox and WebKit, and compare every area's hash, on the
 *                                                 page and in a worker, with tools/solid/digests.json. Exit 1 on a
 *                                                 difference or an engine that could not run.
 *   node tools/solid/browser-run.mjs --record     recompute digests.json in Node (after a deliberate change of answers)
 *   node tools/solid/browser-run.mjs chromium     only the engines named
 *
 * Needs Playwright, which is not a dependency of this repository: install it anywhere (npm i playwright; npx playwright
 * install) and, if it is not resolvable from here, point SOLID_PLAYWRIGHT at its folder. Playwright's WebKit is the
 * engine of Safari, not Safari itself: for Safari proper, serve the repository and open tools/solid/browser.html there.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '../..');
const FILE = path.join(HERE, 'digests.json');
const args = process.argv.slice(2);

async function nodeDigest() {
  const P = await import(pathToFileURL(path.join(ROOT, 'lib/solid/index.js')).href);
  const { digest } = await import('./digest.mjs');
  return digest(P);
}

if (args.includes('--record')) {
  const r = await nodeDigest();
  fs.writeFileSync(FILE, JSON.stringify({ note: 'Written by tools/solid/browser-run.mjs --record (Node). Every host must compute these: tools/solid/digest.mjs.', ...r }, null, 2) + '\n');
  console.log(`digests.json: ${Object.keys(r.sections).length} areas recorded for cc-solid ${r.version}`);
  process.exit(0);
}

const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.html': 'text/html; charset=utf-8' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/tools/solid/browser.html`;

let pw;
try {
  const where = process.env.SOLID_PLAYWRIGHT ? pathToFileURL(path.join(process.env.SOLID_PLAYWRIGHT, 'index.mjs')).href : 'playwright';
  pw = await import(where);
} catch (e) {
  console.log('Playwright was not found (see the head of this file). The page to open by hand: ' + url);
  server.close();
  process.exit(2);
}

const expected = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const names = Object.keys(expected.sections);
const here = await nodeDigest();
const diff = (got) => (got && got.sections ? names.filter((n) => got.sections[n] !== expected.sections[n]) : names);
let failed = 0;
const line = (who, version, bad, note = '') => { if (bad.length) failed++; console.log(`${bad.length ? 'DIFF' : 'same'}  ${who.padEnd(26)} ${version.padEnd(22)} ${bad.length ? 'differs in: ' + bad.join(', ') : names.length + ' of ' + names.length + ' areas'}${note}`); };
line('Node (this run)', process.version, diff(here));

const wanted = ['chromium', 'firefox', 'webkit'].filter((n) => !args.some((a) => !a.startsWith('--')) || args.includes(n));
for (const name of wanted) {
  let browser;
  try {
    browser = await pw[name].launch();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(url);
    await page.waitForFunction(() => window.__solid && window.__solid.done, null, { timeout: 180000 });
    const r = await page.evaluate(() => window.__solid);
    const version = browser.version();
    if (r.error) { failed++; console.log(`FAIL  ${name.padEnd(26)} ${version.padEnd(22)} ${r.error.split('\n')[0]}`); continue; }
    line(name + ', page', version, diff(r.main), `  (${r.ms} ms)`);
    if (r.worker.error) { failed++; console.log(`FAIL  ${(name + ', worker').padEnd(26)} ${version.padEnd(22)} ${r.worker.error.split('\n')[0]}`); } else line(name + ', worker', version, diff(r.worker));
    if (errors.length) { failed++; console.log('      page errors: ' + errors.join(' | ')); }
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name.padEnd(26)} could not run: ${String(e).split('\n')[0]}`);
  } finally { if (browser) await browser.close(); }
}
server.close();
console.log(failed ? `\n${failed} problem${failed === 1 ? '' : 's'}` : '\nthe same bits in every host');
process.exit(failed ? 1 : 0);
