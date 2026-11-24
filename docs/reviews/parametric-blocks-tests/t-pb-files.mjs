// Parametric blocks through every file format CadCraft saves: placed at non-default values, saved, opened, compared.
import fs from 'node:fs';
const D = new URL('./dev/', import.meta.url).href;
const { Doc } = await import(D + 'doc.js');
const LP = await import(D + 'libplace.js');
const BP = await import(D + 'blockparams.js');
const { writeDxf, readDxf } = await import(D + 'dxf.js');
const { writeDxf2000 } = await import(D + 'dxf2000.js');
const { textToBinaryDxf } = await import(D + 'dxf-binary.js');
const { dxfTextOf } = await import(D + 'dxf-open.js');
const { saveDwg } = await import(D + 'dwg-save.js');
const { readDwg } = await import(D + 'dwg/read.js');
const { importDwg } = await import(D + 'dwg-import.js');
const items = JSON.parse(fs.readFileSync(new URL('./dev/paramblocks/starter.json', import.meta.url))).items;

const round = (v) => (typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : v);
const norm = (v) => (Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter((k) => !['id', 'bpk', 'handle', 'owner', 'lineweight', 'linetype'].includes(k) && !(k === 'wf' && v[k] === 1)).map((k) => [k, norm(v[k])])) : round(v));
const shape = (ents) => JSON.stringify(ents.map(norm));
/** a drawing with every block placed twice: once at its defaults, once with each parameter moved to another allowed value */
function build(units) {
  const doc = new Doc(); doc.meta.units = units;
  const placed = [];
  doc.change('test', () => {
    items.forEach((item, i) => {
      const r = LP.ensureLibraryBlock(doc, item);
      const name = r?.name || LP.libBlockName(item), blk = doc.blocks.get(name), bp = blk.bp;
      let vals = null;
      for (const p of bp.params) {
        let v = null;
        if (Array.isArray(p.list) && p.list.length > 1) v = p.list[p.list.length - 1];
        else if (Number.isFinite(p.max) && Number.isFinite(p.min)) v = (p.min + p.max) / 2;
        else if (p.kind === 'yesno') v = 1;
        if (v === null) continue;
        const res = BP.refSetValue(vals ? { vals } : null, bp, p.name, String(require_fit(p, v)));
        if (res.ok && res.bp) vals = res.bp.vals;
      }
      for (const [k, bpv] of [[0, null], [1, vals ? { vals } : null]]) {
        const id = doc.add({ type: 'insert', block: name, x: i * 10000, y: k * 10000, sx: 1, sy: 1, rot: k ? 30 : 0, layer: '0', ...(bpv ? { bp: bpv } : {}) });
        placed.push({ name, k, id, item: item.name });
      }
    });
  });
  return { doc, placed };
}
import * as PBm from './dev/paramblock.js';
function require_fit(p, v) { return PBm.fitValue(p, v); }
/** a read drawing ({ entities, blocks, … }) loaded into a Doc the way the app opens one */
function asDoc(d) { if (d instanceof Doc) return d; const x = new Doc(); x.load(d); return x; }
function inserts(doc) { return [...doc.model.values()].filter((e) => e.type === 'insert'); }
function compare(label, a, b) {
  const A = inserts(a), B2 = inserts(b), out = { label, inserts: `${A.length}→${B2.length}`, sameShape: 0, lostValues: 0, notParametric: 0, differ: [] };
  const byPos = (arr) => new Map(arr.map((e) => [Math.round(e.x) + ',' + Math.round(e.y), e]));
  const mb = byPos(B2);
  for (const e of A) {
    const f = mb.get(Math.round(e.x) + ',' + Math.round(e.y));
    if (!f) { out.differ.push('missing at ' + e.x + ',' + e.y); continue; }
    const ba = a.blocks.get(e.block), bb = b.blocks.get(f.block);
    if (!bb) { out.differ.push('no block ' + f.block); continue; }
    if (!BP.isParametric(bb.bp)) out.notParametric++;
    if (JSON.stringify(e.bp?.vals || {}) !== JSON.stringify(f.bp?.vals || {})) out.lostValues++;
    const sa = shape(BP.bpParts(ba, e.bp)), sb = shape(BP.bpParts(bb, f.bp));
    if (sa === sb) out.sameShape++; else if (out.differ.length < 4) out.differ.push(`${e.block} (${e.bp ? 'moved values' : 'defaults'}) differs`);
  }
  console.log(JSON.stringify(out));
}
for (const units of ['millimeters', 'inches']) {
  const { doc } = build(units);
  console.log(`== ${units}: ${inserts(doc).length} parametric references`);
  const tries = [
    ['DXF R12', () => readDxf(writeDxf(doc).text).drawing ?? readDxf(writeDxf(doc).text)],
    ['DXF 2000', () => { const t = writeDxf2000(doc).text; const r = readDxf(t); return r.drawing ?? r; }],
    ['DXF 2000 binary', () => { const t = writeDxf2000(doc).text; const bytes = textToBinaryDxf(t); const back = dxfTextOf(bytes); const r = readDxf(back.text ?? back); return r.drawing ?? r; }],
    ...['2000', '2010', '2018'].map((v) => ['DWG ' + v, () => { const r = saveDwg(doc, { version: v }); const m = readDwg(r.bytes); const d = importDwg(m); return d.drawing ?? d; }]),
  ];
  for (const [label, fn] of tries) {
    try { const back = asDoc(fn()); compare(label, doc, back); } catch (e) { console.log(JSON.stringify({ label, threw: String(e && e.message || e).slice(0, 200) })); }
  }
}
