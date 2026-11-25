// PROOF OF CONCEPT (not production): a ZWCAD/ODA-saved dynamic-block definition that lives in a drawing's model space → a CadCraft PB.1 parametric block.
// Everything here is read from the file by observation (see the advisory); where a layout is not decoded the choice is marked INFERRED.
// Stretch frames and vertex lists are the file's own (decoded); the flip axis and the action order are INFERRED.
// Used with CadCraft's own modules from the public dev build, in Node, no browser.
import fs from 'node:fs';
import { load, reader, hexKey } from './lib-dyn.mjs';
import { points } from './lib-scan.mjs';
import { strings } from './lib-str.mjs';
import { stretchOf } from './lib-stretch.mjs';

const D = new URL('./dev/', import.meta.url).href;
const { importDwg } = await import(D + 'dwg-import.js');
const { Doc } = await import(D + 'doc.js');
const { formatNumber } = await import(D + 'expr.js');

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const num = (v) => formatNumber(r6(v));
const vertsOf = (e) => {
  switch (e.type) {
    case 'poly': return e.pts.map((p) => [p.x, p.y]);
    case 'line': return [[e.x1, e.y1], [e.x2, e.y2]];
    case 'circle': case 'ellipse': return [[e.cx, e.cy]];
    case 'text': case 'point': case 'insert': return [[e.x, e.y]];
    case 'dim': return ['p1', 'p2', 'c', 'loc', 'tp'].filter((k) => e[k]).map((k) => [e[k].x, e[k].y]);
    case 'hatch': return e.loops.flatMap((l) => { const o = []; for (let i = 0; i + 1 < l.length; i += 2) o.push([l[i], l[i + 1]]); return o; });
    default: return [];
  }
};

export async function buildFront(file = './front.dwg', { blockName = 'FRONT_PARAMETRYCZNY' } = {}) {
  const { m, objs } = load(file);
  const ms = m.blocks.find((b) => b.name === '*Model_Space');
  if (!ms || !ms.dynamic) throw new Error('model space is not a dynamic block definition');
  const dyn = ms.dynamic, objOf = (h) => objs.get(hexKey(h));
  const fileEnts = new Set(ms.entities.map((e) => hexKey(e.handle)));
  // an associative hatch follows its boundary objects (the file names them; cc-dwg reads them as loops[].boundary): no action lists the hatch itself
  const hatchOf = new Map();
  for (const e of ms.entities) if (e.type === 'HATCH' && e.associative) for (const l of e.loops || []) for (const b of l.boundary || []) { const bk = hexKey(b); if (!hatchOf.has(bk)) hatchOf.set(bk, new Set()); hatchOf.get(bk).add(hexKey(e.handle)); }

  // ---- 1. what the importer already does for a named dynamic block: every file object converted, hidden ones too
  ms.name = 'FRONT_SRC';
  const drawing = importDwg(m);
  const src = drawing.blocks.find((b) => b.name === 'FRONT_SRC');
  const ents = [], keysOf = new Map();
  src.dyn.h.forEach((h, i) => { const hk = hexKey(h); for (const e of src.dyn.all[i]) { const k = ents.length; ents.push({ ...e, bpk: k }); if (!keysOf.has(hk)) keysOf.set(hk, []); keysOf.get(hk).push(k); } });

  // ---- 2. parameters (observed layouts: a linear parameter's two points sit at bit 114 and 248; labels are the 6th/7th strings)
  const P = new Map();
  for (const p of dyn.params) {
    const o = objOf(p.handle), S = strings(o), pts = points(o), at = (b) => pts.find((q) => q.p === b);
    const d = { ...p, S };
    if (p.kind === 'linear') { const a = at(114), b = at(248); d.p1 = { x: a.x, y: a.y }; d.p2 = { x: b.x, y: b.y }; d.label = S[5]; d.desc = S[6] || ''; d.length = Math.hypot(b.x - a.x, b.y - a.y); }
    else if (p.kind === 'basepoint') { d.pt = { x: at(106).x, y: at(106).y }; }
    else if (p.kind === 'flip') { d.p1 = { x: at(106).x, y: at(106).y }; d.p2 = { x: at(240).x, y: at(240).y }; d.label = S[0]; d.states = [S[3], S[4]]; }
    else if (p.kind === 'point') { d.pt = { x: at(106).x, y: at(106).y }; d.label = S[3]; }
    P.set(p.node, d);
  }
  const base = [...P.values()].find((p) => p.kind === 'basepoint').pt;

  // ---- 3. visibility states (this ODA variant defeats cc-dwg's own decoder: names from the string stream, lists from the handle stream)
  const visO = objOf(dyn.params.find((p) => p.kind === 'visibility').handle);
  const VS = strings(visO), stateNames = VS.slice(3), vh = visO.raw.h.map(([c, h]) => hexKey(h));
  const nAll = fileEnts.size - 1;   // every file entity but the ATTDEF is listed first
  let k = nAll; const states = [];
  for (const name of stateNames) {
    const shown = []; while (k < vh.length && fileEnts.has(vh[k])) { shown.push(vh[k]); k++; if (k < vh.length && !fileEnts.has(vh[k])) break; }
    const active = []; while (k < vh.length && !fileEnts.has(vh[k])) { active.push(vh[k]); k++; }
    states.push({ name, shown, active });
  }
  const allKeys = [...new Set(vh.slice(0, nAll).flatMap((h) => keysOf.get(h) || []))];

  // ---- 4. actions: [entities in the selection][dependents][dependent nodes…][input node][input node]; the second handle list = entities with vertices to move
  const A = dyn.actions.map((a) => {
    const o = objOf(a.handle), r = reader(o.raw); r.pos = 238;
    const nSel = r.BL(), nDep = r.BL(), deps = []; for (let i = 0; i < nDep; i++) deps.push(r.BL());
    const input = r.BL(), refs = o.raw.h.map(([c, h]) => hexKey(h)), S = strings(o);
    return { ...a, S, nSel, deps, input, sel: refs.slice(0, nSel).filter((h) => fileEnts.has(h)), moved: refs.slice(nSel).filter((h) => fileEnts.has(h)), moves: /^Base/.test(S[1] || '') ? 'base' : /^End/.test(S[1] || '') ? 'end' : '' };
  });

  // ---- 5. the PB.1 block
  const NAMES = { Wysokość: 'Height', Szerokość: 'Width', 'Odległość3': 'MidDist', 'F. Góra Luz': 'GapTop', 'F. Prawa Luz': 'GapRight', 'F. Lewa Luz': 'GapLeft', 'F. Dół Luz': 'GapBottom', 'Środek Klapy frontua': 'FlapCentre' };
  const params = [], lin = {};
  for (const p of P.values()) if (p.kind === 'linear') { const nm = NAMES[p.label]; if (!nm) continue; lin[p.node] = { ...p, pb: nm }; params.push({ name: nm, expr: num(p.length), kind: 'length', note: [p.label, p.desc].filter(Boolean).join(' — ') }); }
  const pt = [...P.values()].find((p) => p.kind === 'point');
  params.push({ name: 'MoveX', expr: '0', kind: 'length', note: pt.label + ' (X)' }, { name: 'MoveY', expr: '0', kind: 'length', note: pt.label + ' (Y)' });
  const flipP = [...P.values()].find((p) => p.kind === 'flip');
  params.push({ name: 'Flip', expr: '0', kind: 'yesno', note: flipP.label + ': ' + flipP.states.join(' / ') });
  params.push({ name: 'State', expr: '1', kind: 'count', min: 1, max: states.length, step: 1, note: 'Stan widoczności' });
  const vis = [{ name: 'Visibility', objects: allKeys, expr: 'State', states: states.map((s, i) => ({ name: s.name, when: i + 1, show: [...new Set(s.shown.flatMap((h) => keysOf.get(h) || []))] })) }];

  const ORDER = ['Wysokość', 'Szerokość', 'Odległość3', 'Środek Klapy frontua', 'F. Góra Luz', 'F. Prawa Luz', 'F. Lewa Luz', 'F. Dół Luz'];
  const WHEN = { Height: null, Width: null, MidDist: 'if(State == 8, 0, 1)', FlapCentre: 'State == 4', GapTop: 'if(State == 6, 0, if(State == 7, 0, 1))' };
  WHEN.GapRight = WHEN.GapLeft = WHEN.GapBottom = WHEN.GapTop;
  const acts = [], frames = [];
  const stretches = A.filter((a) => a.kind === 'stretch').map((a) => {
    const inp = a.input === 0 ? null : P.get(a.input) || null;
    let L = inp; if (!L || L.kind !== 'linear') L = [...P.values()].find((p) => p.kind === 'linear' && ORDER.indexOf(p.label) >= 0 && (p.label === a.name || (a.name === 'Rozciągania2' && p.label === 'Odległość3')));
    return { a, L: { ...L, pb: NAMES[L.label] } };
  }).sort((x, y) => ORDER.indexOf(x.L.label) - ORDER.indexOf(y.L.label));
  const done = [];
  for (const { a, L } of stretches) {
    const mov = a.moves === 'base' ? L.p1 : L.p2, fix = a.moves === 'base' ? L.p2 : L.p1, len = Math.hypot(mov.x - fix.x, mov.y - fix.y);
    const ux = Math.round((mov.x - fix.x) / len), uy = Math.round((mov.y - fix.y) / len);   // the direction the moving point travels when the distance grows (axis-aligned here)
    const ai = ux ? 0 : 1, mc = ai ? mov.y : mov.x, sign = ai ? uy : ux, L0 = L.length;
    // the frame the file stores (two corners, raw doubles) along the axis of travel; across it the frame is left open so a vertex an earlier
    // action moved sideways stays in it (PB.1 tests frames on the shape as it is when the action runs; the file's stored vertex lists do not move)
    const so = stretchOf(objOf(a.handle)), fc = so.frame.map((q) => [q.x, q.y][ai]);
    const lo = Math.min(...fc), hi = Math.max(...fc);
    const cands = [];
    a.moved.forEach((h, i) => { for (const key of keysOf.get(h) || []) cands.push({ h, key, type: ents[key].type, idx: so.idx[i] }); });
    const shifts = done.filter((d) => d.ai === ai && mc >= d.lo && mc <= d.hi).map((d) => '(' + d.delta + ')');   // an earlier action already moved these vertices
    const f = (v) => (shifts.length ? `${num(v)} + ${shifts.join(' + ')}` : num(v));
    const delta = `${sign < 0 ? '-' : ''}(${L.pb} - ${num(L0)})`.replace(/^\(/, '(').replace('--', '');
    // across the axis: the file's own extent widened by 10 m (PB.1's frame tolerance is 1e-9 × the largest frame coordinate: ±1e9 would make it 1 mm)
    const oc = so.frame.map((q) => [q.x, q.y][1 - ai]), olo = num(Math.min(...oc) - 10000), ohi = num(Math.max(...oc) + 10000);
    const fr = ai ? { x0: olo, x1: ohi, y0: f(lo), y1: f(hi) } : { x0: f(lo), x1: f(hi), y0: olo, y1: ohi };
    const follow = [...new Set(a.moved.flatMap((h) => [...(hatchOf.get(h) || [])]))];   // hatches bound to a moved object move with it
    const keys = [...new Set([...a.moved, ...follow].flatMap((h) => keysOf.get(h) || []))];
    const act = { t: 'stretch', ...fr, dx: ai ? '0' : delta, dy: ai ? delta : '0', keys };
    if (WHEN[L.pb]) act.when = WHEN[L.pb];
    acts.push(act); done.push({ ai, lo, hi, delta });
    frames.push({ action: a.name, param: L.pb, moves: a.moves, axis: 'xy'[ai], sign, at: mc, band: [r6(lo), r6(hi)], frame: so.frame.map((q) => ({ x: r6(q.x - base.x), y: r6(q.y - base.y) })), shiftedBy: shifts, entities: cands.map((c) => ({ handle: c.h, key: c.key, type: c.type, idx: c.idx })), hatches: follow, multiplier: so.tail.BD1, angleOffset: so.tail.BD2, delta });
  }
  // the move action (state 8: the label text follows the point parameter) and the flip (everything, about the reflection line)
  const mv = A.find((a) => a.kind === 'move');
  acts.push({ t: 'move', dx: 'MoveX', dy: 'MoveY', keys: [...new Set(mv.sel.flatMap((h) => keysOf.get(h) || []))], when: 'State == 8' });
  const fl = A.find((a) => a.kind === 'flip');
  acts.push({ t: 'mirror', x0: num(flipP.p1.x), y0: num(flipP.p1.y), x1: num(flipP.p2.x), y1: num(flipP.p2.y), when: 'Flip' });   // INFERRED: the line through the flip parameter's two points
  const grips = [
    { t: 'linear', name: 'Width', param: 'Width', x: `${num(base.x)} + Width`, y: `${num(base.y)} + Height / 2`, ax: 1, ay: 0 },
    { t: 'linear', name: 'Height', param: 'Height', x: `${num(base.x)} + Width / 2`, y: `${num(base.y)} + Height`, ax: 0, ay: 1 },
    { t: 'flip', name: 'Flip', param: 'Flip', x: num(flipP.p1.x), y: num(flipP.p1.y) },
    // the state is picked by name from a size table whose rows set State: a list grip on the visibility parameter itself is accepted and
    // ignored while the parameter is driven by a formula (PB.1, measured), so the grip opens the table instead
    { t: 'list', name: 'Front type', table: 'Front type', x: num(base.x), y: num(base.y - 430) },
  ];
  const tables = [{ name: 'Front type', cols: ['State'], rows: states.map((s, i) => ({ name: s.name, vals: [String(i + 1)] })) }];
  const bp = { params, vis, acts, grips, tables };

  const doc = new Doc(); doc.meta.units = 'millimeters';
  let id;
  doc.change('poc', () => {
    for (const l of drawing.layers || []) { try { doc.addLayer(l); } catch { /* */ } }
    for (const b of drawing.blocks || []) if (b.name !== 'FRONT_SRC' && b.name !== '_None') doc.defineBlock(b);   // the dimensions' own blocks (*D1…)
    doc.defineBlock({ name: blockName, base: { x: base.x, y: base.y }, entities: ents, attdefs: src.attdefs, bp });
    id = doc.add({ type: 'insert', layer: '0', block: blockName, x: base.x, y: base.y, sx: 1, sy: 1, rot: 0 });
  });
  return { doc, id, name: blockName, bp, blk: doc.blocks.get(blockName), ents, keysOf, states, P, A, frames, base, drawing, src, fileEnts, flipP, pt };
}
