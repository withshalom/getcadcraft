import fs from 'node:fs';
const D = new URL('./dev/', import.meta.url).href;
const { Doc } = await import(D + 'doc.js'); const PBC = await import(D + 'paramblock-cmd.js'); const LP = await import(D + 'libplace.js'); const LI = await import(D + 'libitem.js'); const BP = await import(D + 'blockparams.js'); const G = await import(D + 'geom.js');
const items = JSON.parse(fs.readFileSync(new URL('./dev/paramblocks/starter.json', import.meta.url))).items;
const opts = { title: 'Test', kind: 'symbol', category: 'symbols/annotation', description: '' };
{ // my plate
  const doc = new Doc(); doc.meta.units = 'millimeters';
  doc.change('s', () => doc.defineBlock({ name: 'PL', base: { x: 0, y: 0 }, entities: [{ type: 'poly', layer: '0', pts: [{ x: 0, y: 0, b: 0 }, { x: 100, y: 0, b: 0 }, { x: 100, y: 50, b: 0 }, { x: 0, y: 50, b: 0 }], closed: true }], bp: { params: [{ name: 'W', expr: '100', kind: 'length' }], vis: [], acts: [{ t: 'move', dx: 'W - 100', dy: '0' }] } }));
  const r = PBC.itemFromParamBlock(doc, 'PL', opts); console.log('plate: problems', JSON.stringify(r.problems).slice(0, 400));
}
// every starter block, placed, then exported again with PBEXPORT's function, then placed from that file: the same block?
const round = (v) => (typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : v);
const norm = (v) => (Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter((k) => !['id', 'bpk', 'handle'].includes(k) && !(k === 'wf' && v[k] === 1)).map((k) => [k, norm(v[k])])) : round(v));
let same = 0, diff = [], refused = [];
for (const item of items) {
  const doc = new Doc(); doc.meta.units = 'millimeters'; let name;
  doc.change('p', () => { name = LP.ensureLibraryBlock(doc, item).name; });
  const kind = item.kind, category = item.category;
  const r = PBC.itemFromParamBlock(doc, name, { title: item.name, kind, category, description: item.description || '' });
  // simulate the fix: give the exported item the IFC class the validator asks for, then check it again
  r.item.ifc = item.ifc; const v2 = LI.validateItem(r.item, { partial: true });
  if (!v2.ok) { refused.push(item.name + ' (with ifc): ' + v2.errors.slice(0, 2).join('; ')); continue; }
  const d2 = new Doc(); d2.meta.units = 'millimeters'; let n2;
  d2.change('p', () => { n2 = LP.ensureLibraryBlock(d2, { ...r.item, uuid: '00000000-0000-4000-8000-0000000000' + String(same + diff.length).padStart(2, '0'), version: 1 }).name; });
  const a = doc.blocks.get(name), b = d2.blocks.get(n2);
  const A = JSON.stringify(norm(BP.bpParts(a, null))), B2 = JSON.stringify(norm(BP.bpParts(b, null)));
  if (A === B2) same++; else {
    const pa = BP.bpParts(a, null), pb = BP.bpParts(b, null); let first = '';
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const x = JSON.stringify(norm(pa[i] || {})), y = JSON.stringify(norm(pb[i] || {})); if (x !== y) { first = `object ${i}: ${x.slice(0, 160)} → ${y.slice(0, 160)}`; break; } }
    diff.push(item.name + ' (' + pa.length + '→' + pb.length + ' objects) ' + first);
  }
}
console.log('starter blocks re-exported and placed again: same', same, 'different', diff.length, 'refused', refused.length);
for (const x of refused) console.log('  refused', x.slice(0, 300));
for (const x of diff) console.log('  diff', x.slice(0, 420));
