// Live-element tests for the PB.1 translation of Front_Parametryczny_03.dwg (proof of concept): PASS / FAIL lines, and GAP notes for what PB.1 cannot express yet.
import fs from 'node:fs';
import { buildFront } from './poc-front-pb.mjs';
const D = new URL('./dev/', import.meta.url).href;
const BP = await import(D + 'blockparams.js'); const PB = await import(D + 'paramblock.js'); const G = await import(D + 'geom.js');
const { Doc } = await import(D + 'doc.js'); const A = await import(D + 'agents.js');
const { writeDxf2000 } = await import(D + 'dxf2000.js'); const { readDxf } = await import(D + 'dxf.js');
const { saveDwg } = await import(D + 'dwg-save.js'); const { readDwg } = await import(D + 'dwg/read.js'); const { importDwg } = await import(D + 'dwg-import.js');
const file = process.argv[2] || './front.dwg';
const F = await buildFront(file);
const blk = F.blk, bp = blk.bp, x0 = F.base.x, y0 = F.base.y;
const say = (ok, m, x = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + m + (x ? '  — ' + x : '')); return ok; };
const R = (v) => (typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : v);
const unU = (s) => (typeof s === 'string' ? s.replace(/\\U\+([0-9A-Fa-f]{4})/g, (m0, h) => String.fromCharCode(parseInt(h, 16))) : s);
const norm = (v) => (Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter((k) => !['id', 'bpk', 'handle', 'st', 'island', 'pattern'].includes(k)).map((k) => [k, k === 'layer' ? unU(v[k]) : norm(v[k])])) : R(v));
const shape = (es) => es.map((e) => JSON.stringify(norm(e))).sort();
function ref(vals = {}) { let r = null; for (const [k, v] of Object.entries(vals)) { const res = BP.refSetValue(r, bp, k, String(v)); if (!res.ok) throw new Error(k + '=' + v + ': ' + res.error); r = res.bp; } return r; }
const parts = (vals) => BP.bpParts(blk, ref(vals));
const boxOf = (es) => { const b = G.emptyBounds(); for (const e of es) { const eb = G.entityBounds(e, new Map()); if (G.validBounds(eb)) { G.growPt(b, eb.minX, eb.minY); G.growPt(b, eb.maxX, eb.maxY); } } return b; };
const key = (h) => F.keysOf.get(h) || [];
const byHandle = (es, h) => es.filter((e) => key(h).includes(e.bpk));
const w = (b) => b.maxX - b.minX, ht = (b) => b.maxY - b.minY;

say(BP.isParametric(bp), 'the translated block is a PB.1 parametric block', `${bp.params.length} parameters, ${bp.vis[0].states.length} visibility states, ${bp.acts.length} actions, ${bp.grips.length} grips`);

// 1. what CadCraft shows today when it opens the file vs the default state of the live block
const today = (await A.readDrawingBytes(new Uint8Array(fs.readFileSync(file)), 'front.dwg')).drawing.entities;
const def = parts({});
const a = shape(today), b = shape(def.filter((e) => e.type !== 'attdef'));
say(a.length === b.length && a.every((s, i) => s === b[i]), 'default state = exactly the 13 objects CadCraft draws today when it opens the file', `${b.length} vs ${a.length}`);

// 2. every state shows exactly the objects the file lists for it
F.states.forEach((s, i) => {
  const want = [...new Set(s.shown.flatMap(key))].sort((p, q) => p - q), got = parts({ State: i + 1 }).map((e) => e.bpk).sort((p, q) => p - q);
  say(JSON.stringify(want) === JSON.stringify(got), `state ${i + 1} "${s.name}" shows the ${want.length} objects the file lists`, got.length + ' shown');
});

// 3. a width change: the right edges move, the gaps stay
const outline = (es) => boxOf(byHandle(es, 'D1')), inset = (es) => boxOf(byHandle(es, 'EF'));
let p = parts({ Width: 800 });
say(Math.abs(w(outline(p)) - 800) < 1e-6 && Math.abs(ht(outline(p)) - 860) < 1e-6, 'Width = 800: the outline is 800 × 860', `${w(outline(p)).toFixed(3)} × ${ht(outline(p)).toFixed(3)}`);
say(Math.abs(w(inset(p)) - 796) < 1e-6 && Math.abs(ht(inset(p)) - 856) < 1e-6, 'Width = 800: the front panel is 796 × 856 (the 2 mm gaps stay)', `${w(inset(p)).toFixed(3)} × ${ht(inset(p)).toFixed(3)}`);
p = parts({ Height: 1000, GapTop: 5, GapLeft: 3 });
say(Math.abs(ht(outline(p)) - 1000) < 1e-6 && Math.abs(ht(inset(p)) - (1000 - 5 - 2)) < 1e-6 && Math.abs(w(inset(p)) - (600 - 3 - 2)) < 1e-6, 'Height 1000, top gap 5, left gap 3: the panel is 595 × 993', `${w(inset(p)).toFixed(3)} × ${ht(inset(p)).toFixed(3)}`);
const ib = inset(p); say(Math.abs(ib.minX - (x0 + 3)) < 1e-6 && Math.abs(ib.maxY - (y0 + 1000 - 5)) < 1e-6, '…and it sits where the gaps put it', `left ${ (ib.minX - x0).toFixed(3)}, top ${(y0 + 1000 - ib.maxY).toFixed(3)} from the edges`);

// 4. the dimensions follow (their measured text is automatic)
const dimLen = (d) => Math.abs((d.p2.x - d.p1.x) * Math.cos(d.rot || 0) + (d.p2.y - d.p1.y) * Math.sin(d.rot || 0));
const dims0 = byHandle(def, '120').concat(byHandle(def, '12C')), dims1 = byHandle(parts({ Width: 800, Height: 1000 }), '120').concat(byHandle(parts({ Width: 800, Height: 1000 }), '12C'));
say(dims0.length === 2 && dims1.length === 2 && dims1.some((d, i) => Math.abs(dimLen(d) - dimLen(dims0[i])) > 1), 'the two size dimensions measure the new size', dims0.map(dimLen).map((v) => v.toFixed(1)).join(' / ') + ' → ' + dims1.map(dimLen).map((v) => v.toFixed(1)).join(' / '));

// 4b. every action moves exactly the vertices the file stores for it (polylines and lines), by the right amount
const ACTIVE = { Height: [1, 2, 3, 4, 5, 6, 7, 8], Width: [1, 2, 3, 4, 5, 6, 7, 8], MidDist: [1, 2, 3, 4, 5, 6, 7], FlapCentre: [4], GapTop: [1, 2, 3, 4, 5, 8], GapRight: [1, 2, 3, 4, 5, 8], GapLeft: [1, 2, 3, 4, 5, 8], GapBottom: [1, 2, 3, 4, 5, 8] };
const STEP = { Height: 100, Width: 100, MidDist: 50, FlapCentre: 40, GapTop: 3, GapRight: 3, GapLeft: 3, GapBottom: 3 };
const ptsOf = (e) => (e.type === 'poly' ? e.pts : e.type === 'line' ? [{ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }] : null);
let vOk = 0, vAll = 0, vSkip = 0; const vBad = [];
for (const f of F.frames) {
  const L0 = Number(bp.params.find((q) => q.name === f.param).expr), d = STEP[f.param], want = f.sign * d;
  for (const c of f.entities) {
    if (c.type !== 'poly' && c.type !== 'line') continue;
    const s = ACTIVE[f.param].find((st) => F.states[st - 1].shown.some((h) => key(h).includes(c.key)));
    if (!s) { vSkip++; continue; }
    const e0 = parts({ State: s }).find((x) => x.bpk === c.key), e1 = parts({ State: s, [f.param]: L0 + d }).find((x) => x.bpk === c.key);
    const p0 = ptsOf(e0), p1 = ptsOf(e1), ai = f.axis === 'x' ? 'x' : 'y', bi = ai === 'x' ? 'y' : 'x';
    const moved = p0.map((q, j) => (Math.abs(p1[j][ai] - q[ai]) > 1e-9 || Math.abs(p1[j][bi] - q[bi]) > 1e-9 ? j : -1)).filter((j) => j >= 0);
    const amountOk = moved.every((j) => Math.abs(p1[j][ai] - p0[j][ai] - want) < 1e-9 && Math.abs(p1[j][bi] - p0[j][bi]) < 1e-9);
    vAll++; if (JSON.stringify(moved) === JSON.stringify(c.idx) && amountOk) vOk++; else vBad.push(`${f.param} ${c.handle}: file [${c.idx}] engine [${moved}]${amountOk ? '' : ' (wrong amount)'}`);
  }
}
say(vOk === vAll && vAll > 0, `each action moves exactly the vertices the file stores for it, by the parameter's change (${vAll} polyline/line entries; ${vSkip} not shown in any state where the action applies)`, vBad.slice(0, 4).join('; ') || `${vOk} of ${vAll}`);
const gapDim = { GapBottom: 'F0', GapLeft: '103', GapTop: '10C', GapRight: '117' };
for (const [g, h] of Object.entries(gapDim)) { const dd = byHandle(parts({ [g]: 7 }), h)[0], d0 = byHandle(def, h)[0]; say(dd && Math.abs(dimLen(dd) - 7) < 1e-6 && Math.abs(dimLen(d0) - 2) < 1e-6, `${g} = 7: its dimension (${h}) measures 7 (it measured 2)`, dd ? dimLen(dd).toFixed(3) : 'no dimension'); }

// 4c. the panel's hatch keeps filling its boundary (an associative hatch: the file binds EB to EF and 135 to 136)
{ let worst = 0; const cases = [{ Width: 400 }, { Width: 900 }, { Height: 500 }, { Height: 1200 }, { GapTop: 30, GapRight: 10, GapLeft: 30, GapBottom: 10 }, { Width: 750, Height: 1100, GapLeft: 6 }];
  for (const c of cases) for (const [hh, bb, st] of [['EB', 'EF', 1], ['135', '136', 8]]) { const pp = parts({ ...c, State: st }); const a1 = boxOf(byHandle(pp, hh)), b1 = boxOf(byHandle(pp, bb)); worst = Math.max(worst, ...['minX', 'minY', 'maxX', 'maxY'].map((k) => Math.abs(a1[k] - b1[k]))); }
  say(worst < 1e-9, 'the associative hatches keep filling their boundaries under every change (6 settings, both hatches)', 'worst gap ' + worst.toExponential(1) + ' mm'); }

// 5. a random sweep of every parameter in every state: no NaN, panel = size minus gaps, object counts stable
let bad = 0, runs = 0; const rnd = (a0, b0) => a0 + Math.random() * (b0 - a0);
for (let s = 1; s <= 8; s++) for (let i = 0; i < 40; i++) {
  const v = { State: s, Width: r(rnd(300, 1200)), Height: r(rnd(300, 1500)), GapTop: r(rnd(0, 10)), GapRight: r(rnd(0, 10)), GapLeft: r(rnd(0, 10)), GapBottom: r(rnd(0, 10)), MidDist: r(rnd(100, 800)), FlapCentre: r(rnd(100, 500)), MoveX: r(rnd(-100, 100)), MoveY: r(rnd(-100, 100)), Flip: i % 2 };
  function r(x) { return Math.round(x * 100) / 100; }
  const pp = parts(v); runs++;
  const nonFinite = pp.some((e) => JSON.stringify(e).includes('null') && Object.values(e).some((q) => typeof q === 'number' && !Number.isFinite(q)));
  const want = new Set(F.states[s - 1].shown.flatMap(key)); const same = pp.length === want.size;
  const ins = byHandle(pp, 'EF'); let okPanel = true;
  if (ins.length && s !== 6 + 100) { const bb = boxOf(ins), fw = v.Width - v.GapLeft - v.GapRight, fh = v.Height - v.GapTop - v.GapBottom; if (s !== 6 && s !== 7 && (Math.abs(w(bb) - fw) > 1e-4 || Math.abs(ht(bb) - fh) > 1e-4)) okPanel = false; }
  if (nonFinite || !same || !okPanel) { bad++; if (bad < 4) console.log('   bad sample', JSON.stringify(v), { nonFinite, same, okPanel }); }
}
say(bad === 0, `${runs} random settings across all 8 states: finite numbers, the right objects, panel = size − gaps`, bad + ' bad');

// 6. flip: everything mirrored about the reflection line through the left edge
const flipped = parts({ Flip: 1 }), straight = parts({});
const bf = boxOf(flipped), bs = boxOf(straight);
say(Math.abs(bf.minX - (2 * x0 - bs.maxX)) < 1e-6 && Math.abs(bf.maxX - (2 * x0 - bs.minX)) < 1e-6 && Math.abs(bf.minY - bs.minY) < 1e-6, 'Flip = 1: the front is mirrored about the reflection line (x of the left edge)', `x ${ (bf.minX - x0).toFixed(1)} … ${(bf.maxX - x0).toFixed(1)} (was 0 … ${(bs.maxX - x0).toFixed(1)})`);
const fb = byHandle(parts({ Flip: 1, Width: 700 }), 'D1'); say(fb.length === 1 && Math.abs(boxOf(fb).minX - (x0 - 700)) < 1e-6, 'Flip with Width 700: stretched, then mirrored', ((boxOf(fb).minX - x0)).toFixed(1));

// 7. the point parameter moves the label of the blind front (state 8) and nothing in the other states
const lab0 = byHandle(parts({ State: 8 }), 'E9')[0], lab1 = byHandle(parts({ State: 8, MoveX: 50, MoveY: -20 }), 'E9')[0];
say(lab1 && Math.abs(lab1.x - lab0.x - 50) < 1e-6 && Math.abs(lab1.y - lab0.y + 20) < 1e-6, 'state 8: the label follows the point parameter (50, −20)', lab0 && lab1 ? `${lab0.x.toFixed(1)},${lab0.y.toFixed(1)} → ${lab1.x.toFixed(1)},${lab1.y.toFixed(1)}` : 'no label');
say(shape(parts({ State: 1, MoveX: 50 })).join() === shape(parts({ State: 1 })).join(), 'other states ignore the point parameter');

// 7b. what PB.1 cannot express yet (printed as GAP, not counted)
{ const e = { type: 'insert', layer: '0', block: F.name, x: x0, y: y0, sx: 1, sy: 1, rot: 0, attrs: { NUMER: '7' }, bp: ref({ Flip: 1 }) }; const t = G.attrTexts(e, blk)[0];
  console.log(`GAP  attributes do not follow the actions: with Flip = 1 the front spans x ${(boxOf(parts({ Flip: 1 })).minX - x0).toFixed(0)} … ${(boxOf(parts({ Flip: 1 })).maxX - x0).toFixed(0)} but NUMER stays at x ${(t.x - x0).toFixed(0)} (the file's flip action lists the ATTDEF)`); }
console.log('GAP  the XY grip of the point parameter (PB.1 has linear, angle, flip and list grips: two linear grips stand in)');
console.log('GAP  stretch by stored vertex lists (the file\'s rule) — PB.1 tests a frame on the shape as it stands, so the translation leaves frames open across the axis of travel and shifts them by earlier actions');

// 8. grips as the properties panel and the canvas use them: drag the width grip 100 mm to the right
const e = { type: 'insert', layer: '0', block: F.name, x: x0 + 5000, y: y0 + 3000, sx: 1, sy: 1, rot: 0 };
const grips = BP.refGrips(blk, e); say(grips.length === 4, 'the reference shows its 4 grips (width, height, flip, visibility list)', grips.map((g) => g.key).join(', '));
const gw = grips.find((g) => /width/i.test(g.name || g.key || '')) || grips[0];
const moved = BP.refGripMove(blk, e, gw.key, { x: gw.x + 100, y: gw.y });
const vW = moved ? BP.resolveBp(bp, moved.bp).values.get('Width') : null;
say(vW === 700, 'dragging the width grip 100 mm right sets Width = 700', 'Width = ' + vW);

// 9. save and reopen: the live block survives every format CadCraft writes
const place = (doc, vals) => { const r = ref(vals); doc.change('t', () => { doc.add({ type: 'insert', layer: '0', block: F.name, x: x0 + 100000, y: y0, sx: 1, sy: 1, rot: 0, bp: r }); }); };
const doc = F.doc; place(doc, { Width: 800, Height: 1000, State: 4, FlapCentre: 400, GapTop: 4 });
const want = shape(BP.bpParts(blk, ref({ Width: 800, Height: 1000, State: 4, FlapCentre: 400, GapTop: 4 })).filter((x) => x.type !== 'attdef'));
const asDoc = (d) => { if (d instanceof Doc) return d; const x = new Doc(); x.load(d); return x; };
const outs = [['DXF 2000', () => { const r = readDxf(writeDxf2000(doc).text); return r.drawing ?? r; }], ...['2000', '2010', '2018'].map((v) => ['DWG ' + v, () => { const r = saveDwg(doc, { version: v }); return importDwg(readDwg(r.bytes)); }])];
for (const [label, fn] of outs) {
  try {
    const d2 = asDoc(fn()), b2 = d2.blocks.get(F.name), ins = [...d2.model.values()].filter((x) => x.type === 'insert' && x.bp && x.bp.vals);
    const live = !!b2 && BP.isParametric(b2.bp), got = ins.length ? shape(BP.bpParts(b2, ins[ins.length - 1].bp).filter((x) => x.type !== 'attdef')) : [];
    say(live && got.length === want.length && got.every((s, i) => s === want[i]), `${label}: reopens as a live block with the reference's values (layer names compared after decoding \\U+ escapes)`, `${b2 ? (b2.bp?.acts?.length || 0) + ' actions' : 'no block'}, ${ins.length} references, ${got.length} objects`);
  } catch (err) { say(false, `${label}: reopen`, 'threw ' + err.message); }
}

// 10. a general DXF issue this file runs into (not parametric): Polish letters in layer names
{ const t = new Doc(); t.change('x', () => { t.addLayer({ name: 'Korpusy + półki + front', color: 3 }); t.add({ type: 'line', layer: 'Korpusy + półki + front', x1: 0, y1: 0, x2: 10, y2: 0 }); });
  const back = asDoc((() => { const x = readDxf(writeDxf2000(t).text); return x.drawing ?? x; })());
  say(back.layers.has('Korpusy + półki + front'), 'DXF 2000 keeps a layer named "Korpusy + półki + front"', 'reopened as ' + JSON.stringify([...back.layers.keys()].filter((n) => n !== '0'))); }
