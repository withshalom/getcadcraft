// serve this folder first: python3 -m http.server 8133 --bind 127.0.0.1
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const pg = await b.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await pg.goto('http://127.0.0.1:8133/probe.html');
  const r = await pg.evaluate(async () => { const m = await import('/bh-dyn.mjs'); const j = await (await fetch('/front-block.json')).json(); return m.run(j, '/dev/'); }).catch((e) => ({ error: String(e) }));
  console.log(JSON.stringify(r)); if (errs.length) console.error(errs); await b.close(); })();
