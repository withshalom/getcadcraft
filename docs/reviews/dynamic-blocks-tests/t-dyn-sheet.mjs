// A contact sheet of the live block, drawn by CadCraft's own plot pipeline (plot.js: modelSheet → displayList → toSvg)
import fs from 'node:fs';
import { buildFront } from './poc-front-pb.mjs';
const D = new URL('./dev/', import.meta.url).href;
const BP = await import(D + 'blockparams.js'); const PL = await import(D + 'plot.js'); const G = await import(D + 'geom.js');
const F = await buildFront('./front.dwg'); const doc = F.doc, bp = F.blk.bp;
const ref = (vals) => { let r = null; for (const [k, v] of Object.entries(vals)) { const x = BP.refSetValue(r, bp, k, String(v)); if (!x.ok) throw new Error(k + ' ' + x.error); r = x.bp; } return r; };
const S = F.states.map((s) => s.name);
const cells = [
  ...S.map((n, i) => ({ label: `${i + 1}. ${n}`, vals: i ? { State: i + 1 } : {} })),
  { label: 'Width 400', vals: { Width: 400 } }, { label: 'Width 900', vals: { Width: 900 } },
  { label: 'Height 500', vals: { Height: 500 } }, { label: 'Height 1200', vals: { Height: 1200 } },
  { label: 'gaps: top 30, right 10, left 30, bottom 10', vals: { GapTop: 30, GapRight: 10, GapLeft: 30, GapBottom: 10 } },
  { label: 'Flip (mirrored about the left edge)', vals: { Flip: 1 } },
  { label: '4. flap, centre at 150', vals: { State: 4, FlapCentre: 150 } },
  { label: '2. right door, MidDist 250', vals: { State: 2, MidDist: 250 } },
];
const DX = 1500, DY = 1500;
doc.change('sheet', () => {
  doc.remove(F.id.id);
  cells.forEach((c, i) => {
    const col = i % 4, row = Math.floor(i / 4), X = col * DX + (c.vals.Flip ? 700 : 0), Y = -row * DY;
    doc.add({ type: 'insert', layer: '0', block: F.name, x: X, y: Y, sx: 1, sy: 1, rot: 0, attrs: { NUMER: String(i + 1) }, ...(Object.keys(c.vals).length ? { bp: ref(c.vals) } : {}) });
    doc.add({ type: 'text', layer: '0', color: 7, x: X + (c.vals.Flip ? -300 : 300), y: Y - 120, h: 55, rot: 0, s: c.label, ha: 'center', va: 'top' });
  });
});
const area = G.emptyBounds(); for (const e of doc.model.values()) { const b = G.entityBounds(e, doc.blocks); if (G.validBounds(b)) { G.growPt(area, b.minX, b.minY); G.growPt(area, b.maxX, b.maxY); } }
for (const l of doc.layers.values()) l.plot = true;   // three of the file's layers are screen-only: print them so the sheet shows what the screen shows
const pad = 250; area.minX -= pad; area.maxX += pad; area.minY -= pad; area.maxY += pad;
const sheet = PL.modelSheet(doc, { area, paper: 'iso-a2', portrait: true });
const list = PL.displayList(doc, sheet, { mono: false });
const svg = PL.toSvg(list, { title: 'Front_Parametryczny_03 as a live PB.1 block' });
fs.mkdirSync('out', { recursive: true }); fs.writeFileSync('out/front-live-sheet.svg', svg.text);
console.log('svg bytes', svg.text.length, 'report', JSON.stringify(svg.report).slice(0, 200), 'scale', sheet.scale.label);
