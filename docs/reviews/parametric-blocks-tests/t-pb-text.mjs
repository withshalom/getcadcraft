const D = new URL('./dev/', import.meta.url).href;
const { Doc } = await import(D + 'doc.js'); const PBC = await import(D + 'paramblock-cmd.js'); const LP = await import(D + 'libplace.js'); const BP = await import(D + 'blockparams.js'); const G = await import(D + 'geom.js');
for (const [ha, va] of [['center', 'middle'], ['right', 'bottom'], ['left', 'top']]) {
  const doc = new Doc(); doc.meta.units = 'millimeters';
  doc.change('s', () => doc.defineBlock({ name: 'B', base: { x: 0, y: 0 }, entities: [{ type: 'text', layer: '0', x: 50, y: 25, h: 10, rot: 0, s: 'LABEL', ha, va }], bp: { params: [{ name: 'W', expr: '100' }], vis: [], acts: [{ t: 'move', dx: 'W - 100', dy: '0' }] } }));
  const r = PBC.itemFromParamBlock(doc, 'B', { title: 'T', kind: 'symbol', category: 'symbols/annotation' }); r.item.ifc = { class: 'IfcAnnotation', predefined: 'NOTDEFINED' };
  const d2 = new Doc(); d2.meta.units = 'millimeters'; let n2; d2.change('p', () => { n2 = LP.ensureLibraryBlock(d2, { ...r.item, uuid: '00000000-0000-4000-8000-000000000010', version: 1 }).name; });
  const ta = BP.bpParts(doc.blocks.get('B'), null)[0], tb = BP.bpParts(d2.blocks.get(n2), null).find((e) => e.type === 'text');
  const ba = G.entityBounds(ta, doc.blocks), bb = G.entityBounds(tb, d2.blocks);
  console.log(`${(ha + '/' + va).padEnd(14)} text box before ${ba.minX.toFixed(1)},${ba.minY.toFixed(1)}…${ba.maxX.toFixed(1)},${ba.maxY.toFixed(1)}  after ${bb.minX.toFixed(1)},${bb.minY.toFixed(1)}…${bb.maxX.toFixed(1)},${bb.maxY.toFixed(1)}  moved ${((bb.minX + bb.maxX) / 2 - (ba.minX + ba.maxX) / 2).toFixed(1)}, ${((bb.minY + bb.maxY) / 2 - (ba.minY + ba.maxY) / 2).toFixed(1)} mm (text height 10)`);
}
