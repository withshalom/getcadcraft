// Parametric references through everyday edits: copy and paste between drawings, INSERT from a file, EXPLODE, undo/redo, the largest sizes.
import fs from 'node:fs';
const D = new URL('./dev/', import.meta.url).href;
const { Doc } = await import(D + 'doc.js');
const LP = await import(D + 'libplace.js'); const BP = await import(D + 'blockparams.js'); const PB = await import(D + 'paramblock.js'); const G = await import(D + 'geom.js');
const CL = await import(D + 'clipboard.js'); const BC = await import(D + 'blockcopy.js');
const { writeDxf2000 } = await import(D + 'dxf2000.js'); const { readDxf } = await import(D + 'dxf.js');
const items = JSON.parse(fs.readFileSync(new URL('./dev/paramblocks/starter.json', import.meta.url))).items;
const say = (ok, m, x = '') => console.log((ok ? 'PASS ' : 'FAIL ') + m + (x ? '  — ' + x : ''));
const box = (e, blocks) => { const b = G.entityBounds(e, blocks); return G.validBounds(b) ? { w: b.maxX - b.minX, h: b.maxY - b.minY } : null; };
const table = items.find((i) => /table, rectangular/.test(i.name));
function drawing(units) {
  const doc = new Doc(); doc.meta.units = units; let name, id;
  doc.change('place', () => {
    name = LP.ensureLibraryBlock(doc, table).name;
    const bp = doc.blocks.get(name).bp, W = bp.params[0];
    const r = BP.refSetValue(null, bp, W.name, String(PB.fitValue(W, W.max)));
    id = doc.add({ type: 'insert', layer: '0', block: name, x: 0, y: 0, sx: 1, sy: 1, rot: 0, bp: r.bp });
  });
  const ins = [...doc.model.values()].find((x) => x.type === 'insert');
  return { doc, name, id: ins.id };
}
// ---- copy and paste into another drawing
for (const [from, to] of [['millimeters', 'millimeters'], ['millimeters', 'inches']]) {
  const A = drawing(from), e = A.doc.get(A.id), before = box(e, A.doc.blocks);
  const B = new Doc(); B.meta.units = to;
  for (const via of ['in memory', 'as clipboard text']) {
    const clip0 = CL.makeClip(A.doc, [A.id]);
    const rc = via === 'in memory' ? { clip: clip0 } : CL.readClip(JSON.stringify(clip0)); if (!rc.clip) { say(false, 'readClip refused the clip', rc.error); continue; } const clip = rc.clip;
    const B2 = new Doc(); B2.meta.units = to;
    let ids = [];
    try { B2.change('paste', () => { const r = CL.pasteClip(B2, clip, 0, 0); ids = r?.ids || r || []; }); } catch (err) { say(false, `paste ${from} → ${to} (${via})`, 'threw ' + err.message); continue; }
    const pasted = [...B2.model.values()].find((x) => x.type === 'insert');
    const blk = pasted && B2.blocks.get(pasted.block);
    const after = pasted ? box(pasted, B2.blocks) : null, k = to === 'inches' && from === 'millimeters' ? 25.4 : 1;
    say(!!blk && BP.isParametric(blk.bp), `paste ${from} → ${to} (${via}): the block is still parametric`, blk ? 'bp ' + (blk.bp ? Object.keys(blk.bp).join(',') : 'none') : 'no block');
    say(!!after && Math.abs(after.w * k - before.w) < 1e-6 * before.w, `paste ${from} → ${to} (${via}): the reference keeps its size`, `before ${before.w.toFixed(1)} × ${before.h.toFixed(1)} mm; after ${after ? (after.w * k).toFixed(1) + ' × ' + (after.h * k).toFixed(1) : '-'} mm${pasted ? ', its values ' + JSON.stringify(pasted.bp?.vals || {}) + ', scale ' + pasted.sx : ''}`);
  }
}
// ---- INSERT a block from another drawing's file (the INSERT command's copy)
{
  const A = drawing('millimeters'), src = readDxf(writeDxf2000(A.doc).text);
  const B = new Doc(); B.meta.units = 'millimeters';
  let name;
  B.change('insert', () => { const plan = BC.planCopy(B, src, { block: A.name }); name = BC.applyCopy(B, src, plan, 'rename').name; });
  const blk = B.blocks.get(name);
  say(!!blk && BP.isParametric(blk.bp), 'INSERT from a DXF file: the block comes in parametric', blk ? 'bp ' + (blk.bp ? Object.keys(blk.bp).join(',') : 'none') : 'no block');
}
// ---- EXPLODE: the pieces are the reference's own shape at its values, not the default shape
{
  const A = drawing('millimeters'), e = A.doc.get(A.id);
  const parts = G.explodeEntity(e, A.doc.blocks).filter((x) => x.type !== 'attdef' && x.type !== 'text');
  const b = G.emptyBounds(); for (const p of parts) { const eb = G.entityBounds(p, A.doc.blocks); if (G.validBounds(eb)) { G.growPt(b, eb.minX, eb.minY); G.growPt(b, eb.maxX, eb.maxY); } }
  const want = box(e, A.doc.blocks);
  say(Math.abs((b.maxX - b.minX) - want.w) < 1e-6 * want.w, 'EXPLODE gives the reference\'s current shape', `exploded ${(b.maxX - b.minX).toFixed(1)} wide; the reference ${want.w.toFixed(1)}`);
}
// ---- undo and redo of a value change
{
  const A = drawing('millimeters'), e = A.doc.get(A.id), bp = A.doc.blocks.get(A.name).bp, W = bp.params[0];
  const w0 = box(e, A.doc.blocks).w;
  const r = BP.refSetValue(e.bp, bp, W.name, String(PB.fitValue(W, W.min)));
  A.doc.change('W', () => A.doc.update(A.id, { ...e, bp: r.bp }));
  const w1 = box(A.doc.get(A.id), A.doc.blocks).w; A.doc.undo(); const w2 = box(A.doc.get(A.id), A.doc.blocks).w; A.doc.redo(); const w3 = box(A.doc.get(A.id), A.doc.blocks).w;
  say(w1 !== w0 && w2 === w0 && w3 === w1, 'a value change is one undo step, and redo brings it back', `${w0.toFixed(0)} → ${w1.toFixed(0)}; undo ${w2.toFixed(0)}; redo ${w3.toFixed(0)}`);
}
// ---- every block at the largest value of every parameter at once (and the smallest): objects, time
{
  let worst = { ms: 0 }, maxObjects = { n: 0 };
  for (const item of items) {
    const doc = new Doc(); doc.meta.units = 'millimeters'; let name; doc.change('p', () => { name = LP.ensureLibraryBlock(doc, item).name; });
    const blk = doc.blocks.get(name), bp = blk.bp;
    for (const end of ['max', 'min']) {
      let ref = null;
      for (const p of bp.params) { const v = Array.isArray(p.list) && p.list.length ? (end === 'max' ? Math.max(...p.list) : Math.min(...p.list)) : Number.isFinite(p[end]) ? p[end] : null; if (v === null) continue; const r = BP.refSetValue(ref, bp, p.name, String(PB.fitValue(p, v))); if (r.ok) ref = r.bp; }
      const t0 = performance.now(); const parts = BP.bpParts(blk, ref); const ms = performance.now() - t0;
      if (ms > worst.ms) worst = { ms, who: item.name, end, n: parts.length };
      if (parts.length > maxObjects.n) maxObjects = { n: parts.length, who: item.name, end };
      const bad = parts.some((x) => Object.values(x).some((v) => typeof v === 'number' && !Number.isFinite(v)));
      if (bad) say(false, `${item.name} at every ${end}: non-finite numbers`);
    }
  }
  say(worst.ms < 50, 'every block at the largest and smallest values of all its parameters at once expands quickly', `slowest ${worst.ms.toFixed(1)} ms (${worst.who}, all at ${worst.end}, ${worst.n} objects); most objects ${maxObjects.n} (${maxObjects.who}, ${maxObjects.end})`);
}
