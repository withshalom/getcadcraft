// With a model open, click every toolbar button and record uncaught errors and error messages; run with WebGL on and off, then compare.
// The point: the data-only mode (no WebGL 2) must not make any button throw that works with WebGL.
//
//   node smoke-buttons.cjs [BASE=http://127.0.0.1:8000/] [IFC=fixtures/ifc/wall-precision-legacy.ifc]
//
// A button is "fine" when clicking it raises no uncaught error and no red status message. Buttons that need hardware (VR) report their own message in both modes.
const { chromium } = require('playwright');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:8000/').replace(/\/?$/, '/');
const FIXTURE = path.resolve(process.argv[3] || 'fixtures/ifc/wall-precision-legacy.ifc');

async function run(label, args) {
  const b = await chromium.launch({ args });
  const pg = await b.newPage({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
  let errs = [];
  pg.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));
  pg.on('filechooser', (fc) => fc.setFiles([]).catch(() => {}));
  pg.on('dialog', (d) => d.dismiss().catch(() => {}));
  await pg.goto(`${BASE}?lang=en`, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForSelector('#bc-file', { state: 'attached', timeout: 60000 });
  await pg.waitForTimeout(2500);
  await pg.setInputFiles('#bc-file', FIXTURE);
  await pg.waitForFunction(() => /^Opened /.test(document.querySelector('.bc-status')?.textContent || ''), null, { timeout: 60000 });
  await pg.waitForTimeout(1500);
  errs = [];
  const SEL = '[data-toolbar] button, [data-toolbar] [role=button]';
  const names = await pg.evaluate((sel) => [...document.querySelectorAll(sel)].map((e, i) => ({ i, text: (e.textContent || e.getAttribute('aria-label') || e.title || '').trim().replace(/\s+/g, ' ').slice(0, 28), dis: e.disabled })), SEL);
  const results = [];
  for (const n of names) {
    if (n.dis) { results.push({ ...n, skipped: 'disabled' }); continue; }
    const before = errs.length;
    await pg.evaluate(([sel, i]) => { const e = [...document.querySelectorAll(sel)][i]; if (e && !e.disabled) e.click(); }, [SEL, n.i]).catch((e) => errs.push('click: ' + String(e).slice(0, 80)));
    await pg.waitForTimeout(350);
    const st = await pg.evaluate(() => { const s = document.querySelector('.bc-status'); return { err: !!s?.classList.contains('is-error'), text: (s?.textContent || '').trim().slice(0, 100) }; });
    results.push({ ...n, uncaught: errs.slice(before), statusError: st.err ? st.text : null });
    await pg.keyboard.press('Escape').catch(() => {});   // put the stage back: close any open dialog or menu
    await pg.evaluate(() => { document.querySelectorAll('dialog[open]').forEach((d) => d.close?.()); });
  }
  await b.close();
  return { label, results, total: errs.length };
}

(async () => {
  const on = await run('webgl on', []);
  const off = await run('webgl off', ['--disable-3d-apis']);
  // the same button, the same kind of outcome (a message that differs only in length is the same outcome)
  const kind = (r) => (r.skipped ? 'skip' : r.uncaught.length ? 'THROWS' : r.statusError ? 'error:' + r.statusError.slice(0, 30) : 'ok');
  let differ = 0;
  on.results.forEach((r, i) => { const a = kind(r), b = kind(off.results[i]); if (a !== b) { differ++; console.log('DIFF  ', (r.text || '#' + r.i).padEnd(28), 'on:', a, '| off:', b, off.results[i].uncaught[0] || ''); } });
  const fine = (x) => x.results.filter((r) => !r.skipped && !r.uncaught.length && !r.statusError).length;
  console.log(`buttons clicked: ${on.results.filter((r) => !r.skipped).length} (of ${on.results.length}); fine with WebGL on: ${fine(on)}, fine with WebGL off: ${fine(off)}; differing outcomes: ${differ}`);
  console.log('uncaught total: on', on.total, '| off', off.total);
  process.exit(differ || off.total ? 1 : 0);
})().catch((e) => { console.error('FAILED to run:', e.message.slice(0, 300)); process.exit(2); });
