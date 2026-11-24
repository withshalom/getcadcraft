// The lab build's parametric blocks (CadCraft 0.12 PB.1), tested in Node from the build's own modules.
import fs from 'node:fs';
const D = new URL('./dev/', import.meta.url).href;
const { Doc } = await import(D + 'doc.js');
const LP = await import(D + 'libplace.js');
const LI = await import(D + 'libitem.js');
const BP = await import(D + 'blockparams.js');
const PB = await import(D + 'paramblock.js');
const G = await import(D + 'geom.js');
const items = JSON.parse(fs.readFileSync(new URL('./dev/paramblocks/starter.json', import.meta.url))).items;

const fails = [], notes = [];
const fail = (who, what) => fails.push(`${who}: ${what}`);
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
/** every number in an entity list finite, and its bounds */
function geomOf(ents, blocks) {
  const b = G.emptyBounds(); let bad = 0, n = 0;
  const walk = (o) => { if (o && typeof o === 'object') for (const v of Object.values(o)) { if (typeof v === 'number') { n++; if (!Number.isFinite(v)) bad++; } else if (typeof v === 'object') walk(v); } };
  for (const e of ents) { walk(e); try { const eb = G.entityBounds(e, blocks); if (eb && G.validBounds(eb)) { b.minX = Math.min(b.minX, eb.minX); b.minY = Math.min(b.minY, eb.minY); b.maxX = Math.max(b.maxX, eb.maxX); b.maxY = Math.max(b.maxY, eb.maxY); } } catch { bad++; } }
  return { bad, n, count: ents.length, w: b.maxX - b.minX, h: b.maxY - b.minY, b };
}
const sig = (ents) => JSON.stringify(ents.map((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'id').map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v]))));
function makeBlock(units, item) {
  const doc = new Doc(); doc.meta.units = units;
  const r = LP.blockFromItem(doc, item);
  return { doc, blk: r.block, r };
}
const ref = (name, vals) => ({ type: 'insert', block: name, x: 0, y: 0, sx: 1, sy: 1, rot: 0, ...(vals ? { bp: { vals } } : {}) });

let checks = 0;
const t0 = performance.now();
const perBlock = [];
for (const item of items) {
  const who = item.name.replace(/^Parametric /, '');
  const tb = performance.now();
  // 1. the item is valid
  checks++; try { const v = LI.validateItem(item); if (v && v.ok === false) fail(who, 'validateItem: ' + JSON.stringify(v.errors || v).slice(0, 160)); } catch (e) { fail(who, 'validateItem threw ' + e.message); }
  let mm, inch;
  try { mm = makeBlock('millimeters', item); inch = makeBlock('inches', item); } catch (e) { fail(who, 'blockFromItem threw ' + e.message); continue; }
  const bp = mm.blk.bp;
  if (!bp || !BP.isParametric(bp)) { fail(who, 'block is not parametric after placing'); continue; }
  const params = bp.params || [];
  // 2. defaults
  checks++; const d0 = geomOf(BP.bpParts(mm.blk, null), mm.doc.blocks);
  if (d0.bad || !d0.count) fail(who, `defaults: ${d0.count} objects, ${d0.bad} bad numbers`);
  // 3. inch drawing = the same shape / 25.4
  checks++; const di = geomOf(BP.bpParts(inch.blk, null), inch.doc.blocks);
  if (Math.abs(di.w * 25.4 - d0.w) > 1e-6 * Math.max(1, d0.w) || Math.abs(di.h * 25.4 - d0.h) > 1e-6 * Math.max(1, d0.h)) fail(who, `inch vs mm: ${di.w * 25.4}x${di.h * 25.4} vs ${d0.w}x${d0.h}`);
  // 4. every parameter over its range: min, max, steps between, and every list value; then values it must refuse
  const tried = [];
  for (const p of params) {
    const vals = [];
    if (Array.isArray(p.list) && p.list.length) vals.push(...p.list);
    else if (fin(p.min) && fin(p.max)) { const st = fin(p.step) && p.step > 0 ? p.step : (p.max - p.min) / 10; for (let k = 0; k <= 12; k++) vals.push(PB.fitValue(p, p.min + ((p.max - p.min) * k) / 12)); vals.push(p.min, p.max); void st; }
    else if (p.kind === 'yesno') vals.push(0, 1);
    for (const v of vals) {
      checks++;
      const r = BP.refSetValue(null, bp, p.name, String(v));
      if (!r.ok) { fail(who, `${p.name}=${v} (allowed) refused: ${r.error}`); continue; }
      const g = geomOf(BP.bpParts(mm.blk, { vals: r.bp?.vals || {} }), mm.doc.blocks);
      if (g.bad || !g.count) fail(who, `${p.name}=${v}: ${g.count} objects, ${g.bad} bad numbers`);
      tried.push(g);
    }
    // refusals
    const refuse = [];
    if (fin(p.min)) refuse.push(p.min - Math.max(1, Math.abs(p.min)));
    if (fin(p.max)) refuse.push(p.max + Math.max(1, Math.abs(p.max)));
    if (fin(p.step) && p.step > 0 && fin(p.min)) refuse.push(p.min + p.step / 2);
    if (Array.isArray(p.list) && p.list.length) refuse.push(Math.max(...p.list) + 0.5);
    refuse.push('1/0', 'abc', '1e400', 'NaN');
    for (const v of refuse) { checks++; const r = BP.refSetValue(null, bp, p.name, String(v)); if (r.ok) { const g = geomOf(BP.bpParts(mm.blk, { vals: r.bp?.vals || {} }), mm.doc.blocks); fail(who, `${p.name}=${v} accepted (should be refused)${g.bad ? '; and gives ' + g.bad + ' bad numbers' : ''}`); } }
  }
  // 5. values written into a file by hand (no refSetValue: an untrusted reference) — the shape must stay finite
  for (const p of params) for (const v of ['1e300', '-1e300', '0', '-1', '1/0', '999999999']) {
    checks++;
    let g; try { g = geomOf(BP.bpParts(mm.blk, { vals: { [p.name]: v } }), mm.doc.blocks); } catch (e) { fail(who, `forged ${p.name}=${v}: bpParts threw ${e.message}`); continue; }
    if (g.bad) fail(who, `forged ${p.name}=${v}: ${g.bad} non-finite numbers in ${g.count} objects`);
    if (g.count > PB.PB_LIMITS.out) fail(who, `forged ${p.name}=${v}: ${g.count} objects`);
  }
  // 6. grips: positions finite; drag each one far in every direction: the value lands inside its set
  const e0 = ref(mm.blk.name);
  const grips = BP.refGrips(mm.blk, e0);
  for (const g of grips) {
    checks++; if (!fin(g.x) || !fin(g.y)) fail(who, `grip ${g.name} at ${g.x},${g.y}`);
    if (!g.drag) continue;
    for (const to of [{ x: 1e7, y: 1e7 }, { x: -1e7, y: -1e7 }, { x: g.x + 3, y: g.y + 1 }, { x: g.x, y: g.y }, { x: 0, y: 0 }]) {
      checks++;
      let moved; try { moved = BP.refGripMove(mm.blk, e0, g.key, to); } catch (err) { fail(who, `grip ${g.name} drag threw ${err.message}`); continue; }
      if (!moved) continue;
      const pdef = params.find((q) => q.name === g.param), v = BP.resolveBp(bp, moved.bp).values.get(g.param);
      if (pdef && PB.valueSetProblem(pdef, v)) fail(who, `grip ${g.name} dragged to ${to.x},${to.y} gives ${g.param}=${v} outside its set`);
      const gg = geomOf(BP.bpParts(mm.blk, moved.bp), mm.doc.blocks); if (gg.bad) fail(who, `grip ${g.name} drag: bad numbers`);
    }
  }
  // 7. flips twice = the same shape; size-table rows
  for (const g of grips.filter((x) => x.kind === 'flip')) {
    checks++;
    const a = BP.refFlip(null, bp, g.param); const b2 = a.ok ? BP.refFlip(a.bp, bp, g.param) : null;
    if (!a.ok || !b2?.ok) { fail(who, `flip ${g.param}: ${a.error || b2?.error}`); continue; }
    if (sig(BP.bpParts(mm.blk, b2.bp || null)) !== sig(BP.bpParts(mm.blk, null))) fail(who, `flip ${g.param} twice is not the original`);
    if (sig(BP.bpParts(mm.blk, a.bp)) === sig(BP.bpParts(mm.blk, null))) notes.push(`${who}: flip ${g.param} changes nothing at the defaults`);
  }
  for (const tbl of bp.tables || []) for (const row of tbl.rows) {
    checks++;
    const r = BP.refSetTable(null, bp, tbl.name, row.name);
    if (!r.ok) { fail(who, `table ${tbl.name} row ${row.name}: ${r.error}`); continue; }
    const g = geomOf(BP.bpParts(mm.blk, r.bp), mm.doc.blocks); if (g.bad || !g.count) fail(who, `table row ${row.name}: bad`);
    if (BP.refTableRow(bp, r.bp, tbl.name) !== row.name) fail(who, `table ${tbl.name}: row ${row.name} reads back as ${BP.refTableRow(bp, r.bp, tbl.name)}`);
  }
  // 8. determinism of the expansion
  checks++; if (sig(BP.bpParts(mm.blk, null)) !== sig(BP.bpParts(mm.blk, null))) fail(who, 'two expansions differ');
  perBlock.push({ who, params: params.length, grips: grips.length, objects: d0.count, ms: Math.round(performance.now() - tb) });
}
// 9. hostile definitions: cleanDyn must bound them and never throw
const hostile = [
  ['array of a billion', { acts: [{ t: 'array', n: '1e9', dx: '1', dy: '0' }] }],
  ['array × rows', { acts: [{ t: 'array', n: '2000', dx: '1', dy: '0', rows: '2000', rdx: '0', rdy: '1' }] }],
  ['polar of a million', { acts: [{ t: 'polar', n: '1e6', cx: '0', cy: '0', a: '0.0001' }] }],
  ['chain of arrays', { acts: Array.from({ length: 10 }, () => ({ t: 'array', n: '10', dx: '1', dy: '0' })) }],
  ['10,000 actions', { acts: Array.from({ length: 10000 }, () => ({ t: 'move', dx: '1', dy: '0' })) }],
  ['formula 100,000 long', { acts: [{ t: 'move', dx: '1+'.repeat(50000) + '1', dy: '0' }] }],
  ['nested 5,000 deep', { acts: [{ t: 'move', dx: '('.repeat(5000) + '1' + ')'.repeat(5000), dy: '0' }] }],
  ['division by zero', { acts: [{ t: 'scale', s: '1/0', cx: '0', cy: '0' }] }],
  ['not an object', 'x'], ['null', null], ['unknown action', { acts: [{ t: 'explode' }] }],
];
const ents = [{ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { type: 'circle', cx: 5, cy: 5, r: 2 }];
for (const [name, raw] of hostile) {
  checks++;
  const ts = performance.now();
  try {
    const d = PB.cleanDyn(raw, ['W']);
    const res = d ? PB.applyActs(d, ents, new Map([['W', 10]]), BP.BP_OPS) : { parts: ents, problems: [] }; const out = res.parts;
    const ms = performance.now() - ts, n = Array.isArray(out) ? out.length : (out?.entities?.length ?? 0);
    const g = geomOf(Array.isArray(out) ? out : out?.entities || [], new Map());
    notes.push(`hostile "${name}": cleaned to ${d ? (d.acts?.length || 0) + ' actions' : 'nothing'}, ${n} objects out, ${res.problems.length} problems reported, ${Math.round(ms)} ms${g.bad ? ', ' + g.bad + ' BAD numbers' : ''}`);
    if (n > PB.PB_LIMITS.out) fail('hostile', `${name}: ${n} objects`);
    if (ms > 3000) fail('hostile', `${name}: ${Math.round(ms)} ms`);
    if (g.bad) fail('hostile', `${name}: non-finite numbers`);
  } catch (e) { fail('hostile', `${name}: threw ${String(e.message).slice(0, 120)}`); }
}
console.log(`checks ${checks}, failures ${fails.length}, ${Math.round(performance.now() - t0)} ms`);
for (const b of perBlock) console.log(`  ${b.who.padEnd(34)} params ${b.params}  grips ${b.grips}  objects ${b.objects}  ${b.ms} ms`);
for (const f of fails) console.log('FAIL', f);
for (const n of notes) console.log('note', n);
