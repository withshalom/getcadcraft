// PBEXPORT's item (with the IFC class added, as a fix would) placed back: what survives?
const D = new URL('./dev/', import.meta.url).href;
const { Doc } = await import(D + 'doc.js'); const PBC = await import(D + 'paramblock-cmd.js'); const LP = await import(D + 'libplace.js'); const LI = await import(D + 'libitem.js'); const BP = await import(D + 'blockparams.js'); const G = await import(D + 'geom.js');
const rect = (x0, y0, x1, y1) => ({ type: 'poly', layer: '0', pts: [{ x: x0, y: y0, b: 0 }, { x: x1, y: y0, b: 0 }, { x: x1, y: y1, b: 0 }, { x: x0, y: y1, b: 0 }], closed: true });
const bp = { params: [{ name: 'W', expr: '100', kind: 'length' }], vis: [], acts: [{ t: 'stretch', x0: '90', y0: '-10', x1: '210', y1: '60', dx: 'W - 100', dy: '0' }] };
const cases = [
  ['centred label', { base: { x: 0, y: 0 }, entities: [rect(0, 0, 100, 50), { type: 'text', layer: '0', x: 50, y: 25, h: 5, rot: 0, s: 'PLATE', ha: 'center', va: 'middle' }] }],
  ['right-aligned label, width factor 0.8', { base: { x: 0, y: 0 }, entities: [rect(0, 0, 100, 50), { type: 'text', layer: '0', x: 95, y: 5, h: 5, rot: 0, s: 'R', ha: 'right', va: 'bottom', wf: 0.8 }] }],
  ['base point at 20,10', { base: { x: 20, y: 10 }, entities: [rect(20, 10, 120, 60)] }],
  ['ellipse', { base: { x: 0, y: 0 }, entities: [rect(0, 0, 100, 50), { type: 'ellipse', layer: '0', cx: 50, cy: 25, rx: 20, ry: 10, rot: 0, a0: 0, a1: Math.PI * 2 }] }],
  ['spline', { base: { x: 0, y: 0 }, entities: [rect(0, 0, 100, 50), { type: 'spline', layer: '0', degree: 3, cps: [{ x: 10, y: 10 }, { x: 30, y: 40 }, { x: 60, y: 5 }, { x: 90, y: 40 }], knots: [0, 0, 0, 0, 1, 1, 1, 1] }] }],
  ['hatch', { base: { x: 0, y: 0 }, entities: [rect(0, 0, 100, 50), { type: 'hatch', layer: '0', pattern: 'SOLID', loops: [[{ x: 10, y: 10 }, { x: 40, y: 10 }, { x: 40, y: 40 }, { x: 10, y: 40 }]] }] }],
  ['mtext', { base: { x: 0, y: 0 }, entities: [rect(0, 0, 100, 50), { type: 'mtext', layer: '0', x: 5, y: 45, h: 4, w: 60, s: 'two\\Plines' }] }],
  ['polyline with widths', { base: { x: 0, y: 0 }, entities: [{ ...rect(0, 0, 100, 50), w0: 2, w1: 2, width: 2 }] }],
  ['coloured on its own layer', { base: { x: 0, y: 0 }, entities: [{ ...rect(0, 0, 100, 50), layer: 'A-FURN', color: 3 }] }],
];
const bounds = (ents, blocks) => { const b = G.emptyBounds(); for (const e of ents) { const eb = G.entityBounds(e, blocks); if (G.validBounds(eb)) { G.growPt(b, eb.minX, eb.minY); G.growPt(b, eb.maxX, eb.maxY); } } return b; };
const fmt = (b) => G.validBounds(b) ? `${b.minX.toFixed(1)},${b.minY.toFixed(1)}…${b.maxX.toFixed(1)},${b.maxY.toFixed(1)}` : 'none';
for (const [name, blk] of cases) {
  const doc = new Doc(); doc.meta.units = 'millimeters';
  doc.change('s', () => { doc.addLayer?.({ name: 'A-FURN', color: 3 }); doc.defineBlock({ name: 'B', ...blk, bp }); });
  const r = PBC.itemFromParamBlock(doc, 'B', { title: 'T', kind: 'symbol', category: 'symbols/annotation' });
  r.item.ifc = { class: 'IfcAnnotation', predefined: 'NOTDEFINED' };
  const v = LI.validateItem(r.item, { partial: true });
  if (!v.ok) { console.log(name.padEnd(36), 'REFUSED', v.errors.slice(0, 1).join('')); continue; }
  const d2 = new Doc(); d2.meta.units = 'millimeters'; let n2;
  d2.change('p', () => { n2 = LP.ensureLibraryBlock(d2, { ...r.item, uuid: '00000000-0000-4000-8000-000000000009', version: 1 }).name; });
  const a = doc.blocks.get('B'), b = d2.blocks.get(n2);
  // compare relative to each block's own base point (what a placed reference shows at its insertion point)
  const rel = (blkx, ents) => { const bb = bounds(ents.filter((e) => e.type !== 'attdef'), new Map()); const o = blkx.base || { x: 0, y: 0 }; return G.validBounds(bb) ? { minX: bb.minX - o.x, minY: bb.minY - o.y, maxX: bb.maxX - o.x, maxY: bb.maxY - o.y } : bb; };
  for (const w of [100, 180]) {
    const ra = BP.refSetValue(null, a.bp, 'W', String(w)), rb = BP.refSetValue(null, b.bp, 'W', String(w));
    const pa = BP.bpParts(a, ra.bp), pb = BP.bpParts(b, rb.bp);
    const ka = pa.map((e) => e.type).join(','), kb = pb.filter((e) => e.type !== 'attdef').map((e) => e.type).join(',');
    const A = rel(a, pa), B2 = rel(b, pb);
    const sameBox = ['minX', 'minY', 'maxX', 'maxY'].every((k) => Math.abs(A[k] - B2[k]) < 1e-6);
    const texts = pa.filter((e) => e.type === 'text').map((e) => `${e.ha}/${e.va}${e.wf ? ' wf ' + e.wf : ''}`).join(' ') + ' → ' + pb.filter((e) => e.type === 'text').map((e) => `${e.ha}/${e.va}${e.wf ? ' wf ' + e.wf : ''}`).join(' ');
    console.log(`${(name + ' W=' + w).padEnd(42)} ${sameBox && ka === kb ? 'SAME' : 'DIFFERS'}  objects ${ka} → ${kb}  box ${fmt(A)} → ${fmt(B2)}${pa.some((e) => e.type === 'text') ? '  text ' + texts : ''}${w === 100 && r.skipped ? '  (export said: ' + r.skipped + ' skipped)' : ''}${w === 100 && blk.entities[0].layer === 'A-FURN' ? '  layer ' + pa[0].layer + '/' + pa[0].color + ' → ' + pb[0].layer + '/' + pb[0].color : ''}${w === 100 && blk.entities[0].width ? '  width ' + JSON.stringify([pa[0].width, pa[0].w0]) + ' → ' + JSON.stringify([pb[0].width, pb[0].w0]) : ''}`);
  }
}
