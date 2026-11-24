// every parametric block, at its defaults and at its largest values, placed rotated: the exploded coordinates as bits
export async function run(starterText) {
  const D = new URL('./dev/', import.meta.url).href;
  const { Doc } = await import(D + 'doc.js'); const LP = await import(D + 'libplace.js'); const BP = await import(D + 'blockparams.js'); const PB = await import(D + 'paramblock.js'); const G = await import(D + 'geom.js');
  const items = JSON.parse(starterText).items, out = {};
  const dv = new DataView(new ArrayBuffer(8));
  for (const item of items) {
    const doc = new Doc(); doc.meta.units = 'millimeters'; let name; doc.change('p', () => { name = LP.ensureLibraryBlock(doc, item).name; });
    const blk = doc.blocks.get(name), bp = blk.bp; let ref = null;
    for (const p of bp.params) { const v = Array.isArray(p.list) && p.list.length ? Math.max(...p.list) : Number.isFinite(p.max) ? p.max : null; if (v !== null) { const r = BP.refSetValue(ref, bp, p.name, String(PB.fitValue(p, v))); if (r.ok) ref = r.bp; } }
    let h = 0x811c9dc5 >>> 0, nums = 0;
    for (const vals of [null, ref]) {
      const ins = { type: 'insert', layer: '0', block: name, x: 123.456, y: -78.9, sx: 1, sy: 1, rot: 0.7, ...(vals ? { bp: vals } : {}) };
      for (const e of G.explodeEntity(ins, doc.blocks)) for (const v of Object.values(e)) { if (typeof v !== 'number') continue; dv.setFloat64(0, v); for (let i = 0; i < 8; i++) { h ^= dv.getUint8(i); h = Math.imul(h, 0x01000193) >>> 0; } nums++; }
    }
    out[item.name] = h.toString(16) + ':' + nums;
  }
  return out;
}
