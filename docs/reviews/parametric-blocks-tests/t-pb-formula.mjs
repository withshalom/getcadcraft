import fs from 'node:fs';
const D = new URL('./dev/', import.meta.url).href;
const { Doc } = await import(D + 'doc.js'); const LP = await import(D + 'libplace.js'); const BP = await import(D + 'blockparams.js'); const PB = await import(D + 'paramblock.js');
const items = JSON.parse(fs.readFileSync(new URL('./dev/paramblocks/starter.json', import.meta.url))).items;
let ok = 0, bad = [];
for (const item of items) {
  const doc = new Doc(); doc.meta.units = 'millimeters'; const blk = LP.blockFromItem(doc, item).block, bp = blk.bp, ps = bp.params.filter((p) => !p.list && p.kind !== 'yesno');
  const who = item.name.replace('Parametric ', '');
  for (const p of ps) {
    const v0 = BP.resolveBp(bp, null).values.get(p.name);
    // the same value written as a formula, with units, and as a sum of itself
    for (const f of [`${v0} + 0`, `(${v0} * 2) / 2`, `${v0}mm`, `${v0 / 25.4}in`]) {
      const r = BP.refSetValue(null, bp, p.name, f);
      const v = r.ok ? BP.resolveBp(bp, r.bp).values.get(p.name) : null;
      if (r.ok && Math.abs(v - v0) <= 1e-9 * Math.max(1, Math.abs(v0))) ok++; else if (!(r.ok === false && /step/.test(r.error) && f.endsWith('in'))) bad.push(`${who} ${p.name} = ${f}: ${r.ok ? 'gives ' + v + ' not ' + v0 : r.error}`);
    }
    // a loop: this parameter defined by itself
    const loop = BP.refSetValue(null, bp, p.name, `${p.name} + 1`);
    if (loop.ok) bad.push(`${who} ${p.name} = ${p.name} + 1 accepted`); else ok++;
  }
  // two parameters defined by each other
  if (ps.length >= 2) {
    const [a, b] = ps, r1 = BP.refSetValue(null, bp, a.name, b.name), r2 = r1.ok ? BP.refSetValue(r1.bp, bp, b.name, a.name) : { ok: false };
    if (r1.ok && r2.ok) bad.push(`${who}: ${a.name} = ${b.name} and ${b.name} = ${a.name} both accepted`); else ok++;
  }
}
console.log('formula checks passed', ok, 'problems', bad.length); for (const b of bad.slice(0, 30)) console.log('  ', b);
