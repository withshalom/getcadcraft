// What the CadCraft dev build does today with a drawing whose model space IS a dynamic block definition
// (Front_Parametryczny_03.dwg, saved by an ODA-based program): read, open, save, INSERT › File. Measured, nothing changed.
import fs from 'node:fs';
import { load } from './lib-dyn.mjs';
const D = new URL('./dev/', import.meta.url).href;
const A = await import(D + 'agents.js'); const { Doc } = await import(D + 'doc.js'); const BC = await import(D + 'blockcopy.js');
const G = await import(D + 'geom.js'); const BP = await import(D + 'blockparams.js'); const DB = await import(D + 'dwg/dynblock-read.js');
const { saveDwg } = await import(D + 'dwg-save.js'); const { readDwg } = await import(D + 'dwg/read.js'); const { writeDxf2000 } = await import(D + 'dxf2000.js');
const file = process.argv[2] || './front.dwg', bytes = new Uint8Array(fs.readFileSync(file));
const isDyn = (o) => /^BLOCK|^ACAD_EVALUATION_GRAPH$/.test(o.type);

// 1. what cc-dwg's reader sees
const { m } = load(file);
const ms = m.blocks.find((b) => b.name === '*Model_Space'), nDyn = m.objects.filter(isDyn).length;
console.log(`read: model space holds ${ms.entities.length} objects (${ms.entities.filter((e) => e.invisible).length} hidden); ` +
  `dynamic definition on the model space record: ${ms.dynamic ? `${ms.dynamic.params.length} parameters, ${ms.dynamic.actions.length} actions` : 'none'}; ${nDyn} dynamic-block objects in the file`);
const vp = ms.dynamic?.params.find((p) => p.kind === 'visibility');
let why = ''; try { DB.visibilityOf(m.objects.find((o) => o.type === 'BLOCKVISIBILITYPARAMETER')); } catch (e) { why = e.message; }
console.log(`read: visibility parameter "${vp?.name}" ${vp?.undecoded ? `NOT decoded (cc-dwg visibilityOf: "${why}")` : 'decoded'}`);

// 2. open (as the app does: readDrawingBytes → Doc.load)
const { drawing } = await A.readDrawingBytes(bytes, 'Front_Parametryczny_03.dwg');
const doc = new Doc(); doc.load(drawing);
console.log(`open: ${doc.model.size} objects; open report ${JSON.stringify(drawing.report)}`);

// 3. save it again, unchanged
for (const v of ['2018', '2013', '2000']) {
  const r = saveDwg(doc, { version: v }), m2 = readDwg(r.bytes), ms2 = m2.blocks.find((b) => b.name === '*Model_Space');
  console.log(`save DWG ${v}: ${ms2.entities.length} objects (${ms2.entities.filter((e) => e.invisible).length} hidden), dynamic definition ${ms2.dynamic ? 'kept' : 'GONE'}, ` +
    `${m2.objects.filter(isDyn).length} of ${nDyn} dynamic-block objects; save notes ${JSON.stringify(r.report?.notes || [])}`);
}
const dx = writeDxf2000(doc).text;
console.log(`save DXF 2000: dynamic-block objects in the file: ${/ACAD_EVALUATION_GRAPH|BLOCKSTRETCHACTION|BLOCKVISIBILITYPARAMETER/.test(dx) ? 'some' : 'none'}`);

// 4. INSERT › File (the whole drawing as a block), placed at 0,0 in an empty drawing
const host = new Doc(); host.meta.units = 'millimeters';
let name;
host.change('INSERT', () => {
  const plan = BC.planCopy(host, drawing, { whole: 'Front_Parametryczny_03.dwg' });
  name = BC.applyCopy(host, drawing, plan, 'rename').name;
  host.add({ type: 'insert', layer: '0', block: name, x: 0, y: 0, sx: 1, sy: 1, rot: 0 });
});
const blk = host.blocks.get(name), ins = [...host.model.values()].find((e) => e.type === 'insert'), b = G.entityBounds(ins, host.blocks);
console.log(`INSERT › File: block "${name}" with ${blk.entities.length} objects, base ${JSON.stringify(blk.base)}, parametric ${BP.isParametric(blk.bp)}, dynamic data ${!!blk.dyn}; ` +
  `placed at 0,0 the front lands at x ${b.minX.toFixed(1)}…${b.maxX.toFixed(1)}, y ${b.minY.toFixed(1)}…${b.maxY.toFixed(1)} mm`);
