import { createRequire } from 'node:module';
const require = createRequire('/opt/node-tools/node_modules/'); const { chromium } = require('playwright');
const b = await chromium.launch(); const pg = await b.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await pg.goto('http://127.0.0.1:8132/probe.html');
const r = await pg.evaluate(async () => { const m = await import('/bh-pb.mjs'); const t = await (await fetch('/dev/paramblocks/starter.json')).text(); return m.run(t); }).catch((e) => ({ error: String(e).slice(0, 300) }));
console.log(JSON.stringify(r)); if (errs.length) console.error(errs); await b.close();
