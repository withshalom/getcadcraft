// The dynamic-block layouts this ODA/ZWCAD-saved file uses, read by observation (one sample; LibreDWG's source was not used).
// Prints what each object holds and runs the exactness checks that can be run: the visibility parameter to its last bit and handle,
// and every stretch action's stored vertex lists against what its stored frame selects on CadCraft's converted objects.
import { load, reader, hexKey } from './lib-dyn.mjs';
import { points } from './lib-scan.mjs';
import { strings } from './lib-str.mjs';
import { stretchOf } from './lib-stretch.mjs';
import { buildFront } from './poc-front-pb.mjs';
const file = process.argv[2] || './front.dwg';
const { m, objs } = load(file);
const ms = m.blocks.find((b) => b.name === '*Model_Space'), dyn = ms.dynamic;
const say = (ok, msg, x = '') => console.log((ok ? 'PASS ' : 'FAIL ') + msg + (x ? '  — ' + x : ''));

// 1. the element header every dynamic-block object starts with: BL −1 · BL release · BL maintenance · BL ? · its name (the first string)
const rel = new Map();
for (const o of m.objects.filter((x) => /^BLOCK/.test(x.type))) { const r = reader(o.raw); r.BL(); const k = r.BL() + '/' + r.BL(); rel.set(k, (rel.get(k) || 0) + 1); }
console.log('element headers (release/maintenance → objects):', JSON.stringify(Object.fromEntries(rel)), '— cc-dwg\'s samples say release 27');

// 2. the visibility parameter: cc-dwg's layout, except 18 bits (not 10+) between the name and the grip point when the release is 33
{
  const o = m.objects.find((x) => x.type === 'BLOCKVISIBILITYPARAMETER'), r = reader(o.raw), refs = o.raw.h.map(([, h]) => hexKey(h));
  let k = 0; const take = (n) => { const l = refs.slice(k, k + n); k += n; return l; };
  r.BL(); const release = r.BL(); r.BL(); r.BL(); const name = r.TV();
  if (release === 33) { r.B(); r.B(); r.B(); r.B(); r.BS(); r.BS(); r.BS(); } else { r.B(); r.B(); r.BS(); r.BS(); r.BS(); r.BS(); }
  const point = r.BD3(); r.BS(); r.BS(); const grip = r.BL(); const label = r.TV(); r.TV(); r.B(); r.B();
  const all = take(r.BL()), ns = r.BL(), states = [];
  for (let i = 0; i < ns; i++) { const sn = r.TV(); states.push(`${sn} (${take(r.BL()).length} objects, ${take(r.BL()).length} elements)`); }
  say(r.end - r.pos === 0 && k === refs.length, `visibility "${name}" (${label}), release ${release}: every bit and every handle accounted for`, `${all.length} objects, grip node ${grip}, ${ns} states: ${states.join('; ')}`);
}

// 3. parameters: points (BD3) and strings
for (const p of dyn.params) {
  const o = objs.get(p.handle), S = strings(o), pts = points(o).map((q) => `@${q.p} (${q.x.toFixed(4)}, ${q.y.toFixed(4)})`);
  console.log(`param  node ${String(p.node).padStart(2)} ${p.kind.padEnd(10)} strings ${JSON.stringify(S)}  points ${pts.join(' ')}`);
}

// 4. actions: BL selected · BL dependents · BL node × dependents · BL input node × 2 (then the kind's own data)
const byNode = new Map([...dyn.params, ...dyn.actions].map((x) => [x.node, x]));
for (const a of dyn.actions) {
  const o = objs.get(a.handle), r = reader(o.raw); r.pos = 238;
  const nSel = r.BL(), nDep = r.BL(), deps = []; for (let i = 0; i < nDep; i++) deps.push(r.BL());
  const in1 = r.BL(), in2 = r.BL();
  console.log(`action node ${String(a.node).padStart(2)} ${a.kind.padEnd(8)} "${a.name}" ← ${byNode.get(in1)?.kind} "${byNode.get(in1)?.name}"${in1 === in2 ? '' : ' / ' + in2} | ${nSel} selected, dependents [${deps.map((d) => byNode.get(d)?.name).join(', ')}] | strings ${JSON.stringify(strings(o).slice(1))}`);
}

// 5. stretch actions: the frame (two corners, raw doubles) and the vertex lists; the frame must select exactly the stored vertices
const F = await buildFront(file);
const ptsOf = (e) => (e.type === 'poly' ? e.pts : e.type === 'line' ? [{ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }] : null);
let agree = 0, total = 0;
for (const a of dyn.actions.filter((x) => x.kind === 'stretch')) {
  const s = stretchOf(objs.get(a.handle)), [p, q] = s.frame;
  const lo = { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y) }, hi = { x: Math.max(p.x, q.x), y: Math.max(p.y, q.y) };
  const inside = (v) => v.x >= lo.x && v.x <= hi.x && v.y >= lo.y && v.y <= hi.y;
  s.moved.forEach((h, i) => { const e = F.ents[(F.keysOf.get(h) || [])[0]], pts = e && ptsOf(e); if (!pts) return; total++; if (JSON.stringify(pts.map((v, j) => (inside(v) ? j : -1)).filter((j) => j >= 0)) === JSON.stringify(s.idx[i])) agree++; });
  console.log(`stretch "${a.name}": frame (${(lo.x - F.base.x).toFixed(3)}, ${(lo.y - F.base.y).toFixed(3)}) – (${(hi.x - F.base.x).toFixed(3)}, ${(hi.y - F.base.y).toFixed(3)}) from the base point; ` +
    `${s.moved.length} entities with vertex lists ${JSON.stringify(s.idx)}; then BL ${s.tail.BL}, BD ${s.tail.BD1}, BD ${s.tail.BD2}, ${s.tail.left} bits`);
}
say(agree === total && total > 0, 'each stretch frame selects exactly the vertex lists the file stores (polylines and lines, on CadCraft\'s converted objects)', `${agree} of ${total}`);

// 6. the evaluation graph: nodes and edges (cc-dwg reads the nodes; the edges were not read)
import { graphOf } from './lib-graph.mjs';
{
  const G = graphOf(m.objects.find((o) => o.type === 'ACAD_EVALUATION_GRAPH'));
  let agree = 0; for (const nd of G.nodes) { const ins = G.edges.filter((e) => e.to === nd.i).map((e) => e.id), outs = G.edges.filter((e) => e.from === nd.i).map((e) => e.id); const want = [ins.length ? Math.min(...ins) : -1, ins.length ? Math.max(...ins) : -1, outs.length ? Math.min(...outs) : -1, outs.length ? Math.max(...outs) : -1]; if (JSON.stringify(want) === JSON.stringify(nd.links)) agree++; }
  say(G.left === 0 && agree === G.nodes.length && G.edges.every((e, i) => e.id === i), `evaluation graph: ${G.nodes.length} nodes, ${G.edges.length} edges, every bit read, every node's four edge fields = [first in, last in, first out, last out]`, `${agree} of ${G.nodes.length} nodes agree; edge kinds ${JSON.stringify([...new Set(G.edges.map((e) => e.kind))])}`);
  const T = (i) => objs.get(G.nodes[i].handle).type.replace('BLOCK', '');
  const sum = {}; for (const e of G.edges) { const k = `kind ${e.kind}: ${T(e.from)} → ${T(e.to)}`; sum[k] = (sum[k] || 0) + 1; }
  for (const [k, v] of Object.entries(sum).sort()) console.log(`   ${String(v).padStart(2)} × ${k}`);
}
// 7. grip-location components and grips
{
  const DBR = await import(new URL('./dev/dwg/dynblock-read.js', import.meta.url).href);
  const nodeOf = new Map(DBR.graphNodes(m.objects.find((o) => o.type === 'ACAD_EVALUATION_GRAPH')).map(({ node, handle }) => [handle, node]));
  let ok = 0, n = 0;
  for (const o of m.objects.filter((x) => x.type === 'BLOCKGRIPLOCATIONCOMPONENT')) { const r = reader(o.raw); const f = [r.BL(), r.BL(), r.BL(), r.BL()]; const z = r.BL(); n++; if (z === 0) { const own = r.BL(), par = r.BL(); if (own === nodeOf.get(hexKey(o.handle)) && r.pos === r.end) ok++; } }
  console.log(`grip-location components: ${n}; ${ok} read to their last bit as BL −1 · 33 · 248 · kind (40 coordinate, 70 flip) · 0 · own node · parameter node; the rest ("UpdatedEnd…") carry 64 more bits not understood`);
  for (const o of m.objects.filter((x) => /GRIP$/.test(x.type))) { const q = points(o).find((p) => p.p === 124); console.log(`grip ${hexKey(o.handle).padStart(2)} node ${nodeOf.get(hexKey(o.handle))} ${o.type.padEnd(19)} "${strings(o)[0]}" at (${(q.x - 236788.09440733615).toFixed(3)}, ${(q.y - 74432.24560409508).toFixed(3)}) from the base point`); }
}
// 8. what hangs on the model space record, the other objects, the entities' representation tags, the header
{
  const msr = (m.tables?.blockRecords || []).find((r) => /model_space/i.test(r.name || ''));
  console.log('model space record xdata:', JSON.stringify(msr?.xdata), '| extension dictionary', msr?.extDict, '→', JSON.stringify(objs.get(hexKey(msr?.extDict))?.entries));
  for (const o of m.objects.filter((x) => x.type === 'XRECORD')) console.log(`XRECORD ${hexKey(o.handle)} (owner ${o.owner}): ${JSON.stringify(o.data)}`);
  for (const o of m.objects.filter((x) => x.type === 'DIMASSOC')) console.log(`DIMASSOC ${hexKey(o.handle)}: dimension ${hexKey(o.raw.h[0][1])} → ${o.raw.h.slice(1).map(([, h]) => hexKey(h)).join(', ')}`);
  console.log('entity tags (AcDbBlockRepETag 1071):', ms.entities.map((e) => `${hexKey(e.handle)}=${(e.xdata?.AcDbBlockRepETag || []).find(([c]) => c === 1071)?.[1]}`).join(' '));
  const H = m.header || {}; console.log('header:', JSON.stringify({ version: m.version, maintenance: m.maintenance, codepage: m.codepage, INSUNITS: H.INSUNITS, INSBASE: H.INSBASE, EXTMIN: H.EXTMIN, EXTMAX: H.EXTMAX, MEASUREMENT: H.MEASUREMENT, LUNITS: H.LUNITS, LUPREC: H.LUPREC }), '| reader notes', JSON.stringify(m.report?.notes));
}
