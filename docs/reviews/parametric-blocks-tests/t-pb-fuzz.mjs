// Untrusted Library item files: 3000 mutations of the 20 shipped items through what the Library panel and Place run
import fs from 'node:fs';
const D = new URL('./dev/', import.meta.url).href;
const { Doc } = await import(D + 'doc.js'); const LP = await import(D + 'libplace.js'); const LI = await import(D + 'libitem.js'); const BP = await import(D + 'blockparams.js'); const G = await import(D + 'geom.js');
const CL = await import(D + 'clipboard.js');
const items = JSON.parse(fs.readFileSync(new URL('./dev/paramblocks/starter.json', import.meta.url))).items;
let s0 = 12345; const rnd = () => { s0 = (s0 * 1664525 + 1013904223) >>> 0; return s0 / 4294967296; }; const pick = (a) => a[Math.floor(rnd() * a.length)];
const NASTY = [null, undefined, NaN, Infinity, -Infinity, 1e308, -1e308, 0, -1, 1e-320, '', 'x', '1/0', '(((', 'W*W*W*W*W*W*W*W', '1e999', '__proto__', { __proto__: { polluted: 1 } }, [], [[[]]], {}, true, 'a'.repeat(5000), 2 ** 31, -0];
const paths = (o, p = [], out = []) => { if (o && typeof o === 'object') for (const k of Object.keys(o)) { out.push([...p, k]); if (out.length < 4000) paths(o[k], [...p, k], out); } return out; };
const setAt = (o, p, v) => { let x = o; for (let i = 0; i < p.length - 1; i++) x = x[p[i]]; if (v === undefined) delete x[p[p.length - 1]]; else x[p[p.length - 1]] = v; };
let STAGE = '';
const where = new Map();
const stats = { mutations: 0, refused: 0, placed: 0, threw: [], nonFinite: [], slow: [], polluted: 0 };
for (let n = 0; n < 3000; n++) {
  const item = JSON.parse(JSON.stringify(pick(items)));
  const ps = paths(item).filter((p) => p[0] === 'dynamic' || p[0] === 'plan' || rnd() < 0.1);
  for (let m = 0, k = 1 + Math.floor(rnd() * 4); m < k; m++) { const p = pick(ps); try { setAt(item, p, pick(NASTY)); } catch { /* path gone */ } }
  stats.mutations++;
  const t0 = performance.now();
  try {
    STAGE = 'validateItem'; const v = LI.validateItem(item, { partial: true });
    STAGE = 'itemProblem'; const why = LP.itemProblem(item);
    if (!v.ok || why) { stats.refused++; continue; }
    const doc = new Doc(); doc.meta.units = rnd() < 0.5 ? 'millimeters' : 'inches';
    STAGE = 'place (ensureLibraryBlock)'; let name; doc.change('p', () => { name = LP.ensureLibraryBlock(doc, { ...item, uuid: '00000000-0000-4000-8000-' + String(n).padStart(12, '0') }).name; });
    const blk = doc.blocks.get(name);
    STAGE = 'bpParts'; const parts = BP.bpParts(blk, null);
    STAGE = 'grips'; const grips = blk.bp ? BP.refGrips(blk, { type: 'insert', block: name, x: 0, y: 0, sx: 1, sy: 1, rot: 0 }) : [];
    for (const g of grips) if (g.drag) BP.refGripMove(blk, { type: 'insert', block: name, x: 0, y: 0, sx: 1, sy: 1, rot: 0, bp: null }, g.key, { x: g.x + 1e6, y: g.y - 1e6 });
    if (parts.some((e) => Object.values(e).some((x) => typeof x === 'number' && !Number.isFinite(x)))) stats.nonFinite.push(item.name + ' #' + n);
    stats.placed++;
    // and through the clipboard: copy, as text, read back
    const ins = { type: 'insert', layer: '0', block: name, x: 0, y: 0, sx: 1, sy: 1, rot: 0 };
    let id; doc.change('i', () => { id = doc.add(ins).id ?? [...doc.model.values()].pop().id; });
    STAGE = 'clipboard'; const rc = CL.readClip(JSON.stringify(CL.makeClip(doc, [[...doc.model.values()].pop().id])));
    void rc;
  } catch (e) { const fr = String(e.stack || '').split('\n').find((l) => l.includes('/dev/')) || ''; const key = STAGE + ' @ ' + (fr.match(/dev\/([^)]+)/) || [, '?'])[1]; where.set(key, (where.get(key) || 0) + 1); stats.threw.push(`#${n} ${item.name}: ${String(e && e.message || e).slice(0, 140)}`); }
  const ms = performance.now() - t0; if (ms > 500) stats.slow.push(`#${n} ${Math.round(ms)} ms`);
  if ({}.polluted) stats.polluted++;
}
console.log(JSON.stringify({ mutations: stats.mutations, refused: stats.refused, placed: stats.placed, threw: stats.threw.length, nonFinite: stats.nonFinite.length, slow: stats.slow.length, prototypePolluted: stats.polluted }));
for (const [k, n] of where) console.log('  threw', n, 'times in', k);
for (const x of stats.nonFinite.slice(0, 5)) console.log('  non-finite', x);
for (const x of stats.slow.slice(0, 5)) console.log('  slow', x);
