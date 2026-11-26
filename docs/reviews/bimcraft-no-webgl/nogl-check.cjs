// BimCraft with no WebGL 2: does an IFC still open, does the app say why, and does everything that is not the 3D picture keep working?
// Runs against whatever build is served at BASE (the repo's dev shell, or a deployed dev build) in three browser conditions and prints PASS / FAIL. Exit 1 on any FAIL.
//
//   node nogl-check.cjs [BASE=http://127.0.0.1:8000/] [IFC=fixtures/ifc/wall-precision-legacy.ifc] [IFC2=fixtures/ifc/site-masses.ifc]
//
// conditions:  WebGL on (control)
//              WebGL really off: Chromium --disable-3d-apis (to the page: a privacy build with WebGL disabled)
//              WebGL 1 on, WebGL 2 off (simulated: getContext('webgl2') returns null and fires webglcontextcreationerror)
// needs:       Node 20+, Playwright with Chromium, and BimCraft's own markup: #bc-file, .bc-status(.is-error), [data-canvas] (+ its .viewer), [data-canvas-wrap], [data-empty],
//              [data-nogl], [data-tree] .bc-tree-name, [data-plan-canvas], a button labelled "Plan".
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = (process.argv[2] || 'http://127.0.0.1:8000/').replace(/\/?$/, '/');
const IFC = path.resolve(process.argv[3] || 'fixtures/ifc/wall-precision-legacy.ifc');
const IFC2 = path.resolve(process.argv[4] || path.join(path.dirname(IFC), 'site-masses.ifc'));
const FILES = [IFC, ...(fs.existsSync(IFC2) && IFC2 !== IFC ? [IFC2] : [])];

const WEBGL2_OFF = () => {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (type === 'webgl2' || type === 'experimental-webgl2') { this.dispatchEvent(Object.assign(new Event('webglcontextcreationerror'), { statusMessage: 'WebGL 2 is off here (simulated)' })); return null; }
    return orig.call(this, type, ...rest);
  };
};

async function run(label, { args = [], sim = false }) {
  const b = await chromium.launch({ args });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 820 } });
  if (sim) await ctx.addInitScript(WEBGL2_OFF);
  const pg = await ctx.newPage();
  const uncaught = [];
  pg.on('pageerror', (e) => uncaught.push(String(e).slice(0, 160)));
  await pg.goto(`${BASE}?lang=en`, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForSelector('#bc-file', { state: 'attached', timeout: 60000 });
  await pg.waitForTimeout(2500);
  const gl = await pg.evaluate(() => ({ webgl: !!document.createElement('canvas').getContext('webgl'), webgl2: !!document.createElement('canvas').getContext('webgl2') }));
  const files = [];
  for (const f of FILES) {
    const name = path.basename(f);
    await pg.setInputFiles('#bc-file', f);
    await pg.waitForFunction((n) => (document.querySelector('.bc-status')?.textContent || '').includes('Opened ' + n) || !!document.querySelector('.bc-status.is-error'), name, { timeout: 60000 }).catch(() => {});
    await pg.waitForTimeout(1500);
    files.push(await pg.evaluate((n) => {
      const st = document.querySelector('.bc-status'), v = document.querySelector('[data-canvas]')?.viewer;
      return { name: n, opened: (st?.textContent || '').includes('Opened ' + n), isError: !!document.querySelector('.bc-status.is-error'), status: (st?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 220), viewer: !!v, noGL: v ? v.noGL : null, wrapHidden: document.querySelector('[data-canvas-wrap]')?.hidden, emptyHidden: document.querySelector('[data-empty]')?.hidden, notices: document.querySelectorAll('[data-nogl]').length };
    }, name));
  }
  const r = { label, gl, files, uncaught };
  if (files.every((f) => f.opened)) {
    r.tree = await pg.evaluate(() => document.querySelectorAll('[data-tree] .bc-tree-name').length);
    r.pick = await pg.evaluate(() => { const v = document.querySelector('[data-canvas]').viewer; const ids = Array.from(v.layers.get(0).batches[0].elems.ids); v.onPick(ids[0]); return ids.length; });
    await pg.waitForTimeout(1200);
    r.propsFilled = await pg.evaluate(() => !document.body.innerText.includes('Click an element in the model to see its properties.'));
    await pg.evaluate(() => [...document.querySelectorAll('button')].find((x) => /^Plan$/.test((x.textContent || '').trim()))?.click());
    await pg.waitForTimeout(1500);
    r.plan = await pg.evaluate(() => { const c = document.querySelector('[data-plan-canvas]'); if (!c || !c.width) return null; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const bg = [d[0], d[1], d[2]]; let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 40) n++; return n; });
    r.orbit = await pg.evaluate(() => { const v = document.querySelector('[data-canvas]').viewer; try { v.controls.dispatchEvent({ type: 'change' }); v.render(); v.resize?.(); v.view?.('top'); return 'ok'; } catch (e) { return 'threw: ' + e.message; } });
    r.stub = await pg.evaluate(() => {   // every renderer call the viewer and the point-cloud layer (pointcloud-three.js pick) make is answered
      const v = document.querySelector('[data-canvas]').viewer;
      const names = ['render', 'setSize', 'setPixelRatio', 'getPixelRatio', 'getRenderTarget', 'setRenderTarget', 'getClearColor', 'setClearColor', 'getClearAlpha', 'clear', 'readRenderTargetPixels'];
      return { noDraw: !!v.renderer.isNoDraw, missing: names.filter((n) => typeof v.renderer[n] !== 'function'), props: ['localClippingEnabled', 'clippingPlanes', 'domElement'].filter((p) => !(p in v.renderer)) };
    });
    r.contract = await pg.evaluate(async () => {   // a plain `new Viewer3D(canvas)` must still throw (the family editor's preview relies on that); { allowNoGL: true } carries on
      const url = [...document.scripts].map((s) => s.src).concat(performance.getEntriesByType('resource').map((e) => e.name)).find((u) => /\/viewer3d\.js/.test(u));
      if (!url) return { error: 'viewer3d.js url not found' };
      const { Viewer3D } = await import(url);
      const mk = () => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;left:-9999px;width:200px;height:150px'; const c = document.createElement('canvas'); d.append(c); document.body.append(d); return c; };
      const o = {};
      try { new Viewer3D(mk()); o.plain = 'created'; } catch (e) { o.plain = 'threw: ' + String(e.message).slice(0, 70); }
      try { const v = new Viewer3D(mk(), { allowNoGL: true }); o.optin = v.noGL === '' ? 'created, WebGL' : 'created, noGL: ' + String(v.noGL).slice(0, 60); } catch (e) { o.optin = 'threw: ' + String(e.message).slice(0, 70); }
      return o;
    });
  }
  await b.close();
  return r;
}

(async () => {
  const on = await run('WebGL on', {});
  const off = await run('WebGL off', { args: ['--disable-3d-apis'] });
  const gl1 = await run('WebGL 2 off', { sim: true });
  let failed = 0;
  const say = (ok, m, x = '') => { if (!ok) failed++; console.log((ok ? 'PASS ' : 'FAIL ') + m + (x ? '  — ' + x : '')); };
  for (const r of [on, off, gl1]) for (const f of r.files) console.log(`${r.label.padEnd(12)} webgl=${r.gl.webgl} webgl2=${r.gl.webgl2} ${f.name.padEnd(26)} opened=${String(f.opened).padEnd(5)} error=${String(f.isError).padEnd(5)} viewer=${String(f.viewer).padEnd(5)} noGL=${JSON.stringify(f.noGL)} notices=${f.notices} | ${f.status.slice(0, 100)}`);
  console.log('');
  say(on.files.every((f) => f.opened && !f.isError && !f.noGL && f.notices === 0), 'WebGL on: every IFC opens with a real renderer and no notice');
  for (const r of [off, gl1]) {
    say(r.files.every((f) => f.opened && !f.isError), `${r.label}: every IFC still opens, one after another`, r.files.filter((f) => !f.opened).map((f) => f.status.slice(0, 90)).join(' | '));
    say(r.files.every((f) => f.notices === 1 && !!f.noGL), `${r.label}: one notice on the 3D area, however many files are opened; the browser's reason is kept`, JSON.stringify(r.files[0].noGL));
    say(r.files.every((f) => f.opened || !(f.wrapHidden === false && f.emptyHidden === false)), `${r.label}: a failed open would leave the stage as it was (not "3D area shown" AND "open a model" card up)`, r.files.map((f) => `wrapHidden=${f.wrapHidden} emptyHidden=${f.emptyHidden}`).join(' / '));
  }
  const ok2 = [off, gl1].every((r) => r.files.every((f) => f.opened));
  say(ok2 && off.tree === on.tree && gl1.tree === on.tree && on.tree > 0, 'the tree lists the same nodes with and without WebGL', ok2 ? `${off.tree} / ${gl1.tree} / ${on.tree}` : 'no model open');
  say(ok2 && off.propsFilled && gl1.propsFilled && on.propsFilled, 'picking an element fills the Properties panel with and without WebGL');
  say(ok2 && off.plan > 100 && off.plan === on.plan && gl1.plan === on.plan, 'the 2D plan draws identically with and without WebGL', ok2 ? `${off.plan} / ${gl1.plan} / ${on.plan} line pixels` : 'no model open');
  say(ok2 && off.orbit === 'ok' && gl1.orbit === 'ok', 'render, resize and view changes on the blank view do not throw');
  say(ok2 && off.stub.noDraw && !off.stub.missing.length && !off.stub.props.length && gl1.stub.noDraw && on.stub && !on.stub.noDraw, 'the draw-nothing renderer answers every call the viewer and the point-cloud layer make; with WebGL on the real one is used', ok2 ? JSON.stringify(off.stub) : 'no model open');
  say(ok2 && /threw/.test(off.contract.plain) && /noGL/.test(off.contract.optin) && /created/.test(on.contract.plain) && /created, WebGL/.test(on.contract.optin), 'the opt-in: a plain new Viewer3D still throws without WebGL 2; allowNoGL carries on; with WebGL on both make a real renderer', ok2 ? JSON.stringify(off.contract) : 'no model open');
  say(![on, off, gl1].some((r) => r.uncaught.length), 'no uncaught errors in any condition', [on, off, gl1].flatMap((r) => r.uncaught).join(' | '));
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FAILED to run:', e.message.slice(0, 300)); process.exit(2); });
