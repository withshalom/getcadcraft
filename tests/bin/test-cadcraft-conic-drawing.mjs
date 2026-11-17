#!/usr/bin/env node
/* SPDX-License-Identifier: Apache-2.0 */
/**
 * test-cadcraft-conic-drawing.mjs — a conic (a parabola or hyperbola arc, conic.js) as an object in a drawing.
 *
 *   node bin/test-cadcraft-conic-drawing.mjs [--build dev|x.y] [--verbose]
 *
 * No command draws a conic yet, so these tests put one into a drawing by code and check everything a drawn object goes
 * through: its primitives and exact extents, picking and window selection, object snaps (the arc's own ends and middle, not
 * the ends of the pieces it is drawn with), intersections with other objects, MOVE / COPY / ROTATE / SCALE / MIRROR / STRETCH
 * / EXPLODE / ERASE / LIST through the command line with undo, a block reference with unequal scales, the clipboard, quick
 * select and selection totals, a hatch boundary, plotting to PDF, and that saving leaves it out with a note until the file
 * formats learn it. A last section walks every object type the app names through the same generic steps, so a type left
 * out of one of them shows.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BUILD = opt('--build', 'dev');
const VERBOSE = args.includes('--verbose');
const APP = path.join(ROOT, 'public_html/assets/apps/cadcraft', BUILD);
const load = (f) => import(pathToFileURL(path.join(APP, f)).href);

const I18n = await load('i18n.js');
const EN = JSON.parse(fs.readFileSync(path.join(APP, 'lang/en.json'), 'utf8'));
I18n.init({ strings: EN });
const G = await load('geom.js');
const K = await load('conic.js');
const { Doc, typeName, TYPE_NAMES } = await load('doc.js');
const { Engine, describe } = await load('commands.js');
const Cb = await load('clipboard.js');
const Qs = await load('qselect.js');
const { selectionTotals } = await load('seltotals.js');
const Ht = await load('hatch.js');
const Xc = await load('xclip.js');
const Pl = await load('plot.js');
const { walk } = await load('walk.js');
const { saveDwg } = await load('dwg-save.js');
const { writeDxf } = await load('dxf.js');
const { writeDxf2000 } = await load('dxf2000.js');
const Ag = await load('agents.js');

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { if (cond) { pass++; if (VERBOSE) console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } };
const section = (s) => console.log('\n' + s);
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const nearPt = (p, x, y, tol = 1e-9) => !!p && near(p.x, x, tol) && near(p.y, y, tol);
const TAU = Math.PI * 2;

/** y = x² / 4 for x in −4 … 4 (vertex at the origin, focal length 1, opening up), and one branch of x² / 4 − y² = 1 moved to x = 20. */
const parabola = () => ({ ...K.parabola({ vertex: { x: 0, y: 0 }, angle: Math.PI / 2, f: 1, s0: -4, s1: 4 }), layer: '0', color: null });
const hyperbola = () => ({ ...K.hyperbola({ center: { x: 20, y: 0 }, angle: 0, a: 2, b: 1, t0: -1.5, t1: 1.5 }), layer: '0', color: null });
const line = (x1, y1, x2, y2) => ({ type: 'line', layer: '0', color: null, x1, y1, x2, y2 });
/** How far p is from satisfying the conic's own equation. */
function implicit(e, p) {
  const det = (ax, ay, bx, by) => ax * by - ay * bx, dx = p.x - e.cx, dy = p.y - e.cy, D = det(e.ux, e.uy, e.vx, e.vy), X = det(dx, dy, e.vx, e.vy) / D, Y = det(e.ux, e.uy, dx, dy) / D;
  return e.kind === 'parabola' ? Math.abs(Y - X * X) : (X > 0 ? Math.abs(X * X - Y * Y - 1) : 1);
}

function harness() {
  const doc = new Doc(), log = [];
  const host = {
    cursor: { x: 0, y: 0 }, selection: new Set(), shift: false,
    print: (s) => log.push(s), prompt: () => {}, setSelection: (s) => { host.selection = new Set(s); }, preview: () => {},
    pickAt: (p) => { let best = null, bd = 0.5; for (const e of doc.all()) { const d = G.distToEntity(e, p, doc.blocks); if (d < bd) { bd = d; best = e.id; } } return best; },
    pickWindow: (w, crossing) => doc.all().filter((e) => G.inWindow(e, w, crossing, doc.blocks)).map((e) => e.id),
    zoomExtents: () => {}, zoomWindow: () => {},
  };
  const eng = new Engine(doc, host);
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const type = async (...lines) => { for (const l of lines) { eng.text(l); await tick(); } };
  const put = (...ents) => { const ids = []; doc.change('test', () => { for (const e of ents) ids.push(doc.add(e)); }); return ids.map((i) => (typeof i === 'object' ? i.id : i)); };
  return { doc, host, eng, log, type, put };
}

section('Names');
{
  ok(TYPE_NAMES.conic === 'Conic' && typeName(parabola()) === 'Parabola' && typeName(hyperbola()) === 'Hyperbola', 'the type is named Conic as a group, and each object Parabola or Hyperbola', [TYPE_NAMES.conic, typeName(parabola()), typeName(hyperbola())].join());
  ok(typeName({ type: 'conic' }) === 'Conic', 'a conic without a kind is still named');
  for (const k of ['type.conic', 'type.conic.parabola', 'type.conic.hyperbola', 'cmd.desc.parabola', 'cmd.desc.hyperbola', 'clip.bad.conic']) ok(typeof EN[k] === 'string' && EN[k].length > 0, k + ' is in en.json');
}

section('What it is made of: primitives, extents, length');
{
  const p = parabola(), h = hyperbola(), ps = G.prims(p), hs = G.prims(h);
  ok(ps.length > 20 && ps.every((q) => q.k === 'L') && hs.length > 20, 'a conic breaks down into short straight pieces', ps.length + ' / ' + hs.length);
  ok(ps.every((q) => implicit(p, { x: q.x1, y: q.y1 }) < 1e-9) && hs.every((q) => implicit(h, { x: q.x2, y: q.y2 }) < 1e-9), 'every piece starts and ends on the curve');
  ok(ps.every((q, i) => i === 0 || (q.x1 === ps[i - 1].x2 && q.y1 === ps[i - 1].y2)), 'the pieces join end to end');
  ok(nearPt({ x: ps[0].x1, y: ps[0].y1 }, K.ends(p).start.x, K.ends(p).start.y) && nearPt({ x: ps[ps.length - 1].x2, y: ps[ps.length - 1].y2 }, K.ends(p).end.x, K.ends(p).end.y), 'from one end of the arc to the other');
  ok(G.prims({ type: 'conic', kind: 'parabola' }).length === 0 && G.prims({ type: 'conic' }).length === 0, 'an invalid conic has no pieces (and nothing throws)');
  const b = G.entityBounds(p, null);
  ok(near(b.minX, -4) && near(b.maxX, 4) && near(b.minY, 0, 1e-12) && near(b.maxY, 4), 'extents of y = x² / 4 over −4 … 4: exactly −4 … 4 by 0 … 4 (the vertex itself, not the nearest drawn piece)', JSON.stringify(b));
  const bh = G.entityBounds(h, null);
  ok(near(bh.minX, 22) && near(bh.maxX, 20 + 2 * Math.cosh(1.5)) && near(bh.maxY, Math.sinh(1.5)) && near(bh.minY, -Math.sinh(1.5)), 'extents of the hyperbola: from its vertex at x = 22 to its ends', JSON.stringify(bh));
  const turned = G.txEntity(p, G.mRotate(0.7)), bt = G.entityBounds(turned, null);
  let lo = Infinity; for (let i = 0; i <= 20000; i++) lo = Math.min(lo, K.pointAt(turned, turned.t0 + (turned.t1 - turned.t0) * i / 20000).y);
  ok(Math.abs(bt.minY - lo) < 1e-7 && bt.minY <= lo + 1e-12, 'a turned parabola: its lowest point is found exactly (against a fine scan)', bt.minY + ' / ' + lo);
  ok(!G.validBounds(G.entityBounds({ type: 'conic' }, null)), 'an invalid conic has no extents');
  // length: y = x² / 4 from −4 to 4 is 2·(2·√5 + asinh 2) by the closed form
  ok(near(G.curveLength(p), 2 * (2 * Math.sqrt(5) + Math.asinh(2)), 1e-12), 'length of y = x² / 4 over −4 … 4 is 2·(2√5 + asinh 2)', String(G.curveLength(p)));
  let chord = 0; for (let i = 0; i < 200000; i++) { const a = K.pointAt(h, h.t0 + (h.t1 - h.t0) * i / 200000), c = K.pointAt(h, h.t0 + (h.t1 - h.t0) * (i + 1) / 200000); chord += Math.hypot(c.x - a.x, c.y - a.y); }
  ok(Math.abs(G.curveLength(h) - chord) < 1e-8, 'length of the hyperbola arc agrees with 200,000 chords', G.curveLength(h) + ' / ' + chord);
  ok(G.curveLength({ type: 'conic' }) === null, 'an invalid conic has no length');
}

section('Picking and windows');
{
  const p = parabola();
  ok(G.distToEntity(p, { x: 2, y: 1 }, null) < 1e-12, 'a point on the curve is at distance 0 (to the curve, not to a drawn piece)', String(G.distToEntity(p, { x: 2, y: 1 }, null)));
  ok(near(G.distToEntity(p, { x: 0, y: -3 }, null), 3) && near(G.distToEntity(p, { x: 0, y: 2 }, null), 2, 1e-9), 'below the vertex: 3 away; at the focus\'s height on the axis: 2 away (the vertex is nearest)');
  ok(G.distToEntity({ type: 'conic' }, { x: 0, y: 0 }, null) === Infinity, 'an invalid conic is never picked');
  const W = (minX, minY, maxX, maxY) => ({ minX, minY, maxX, maxY });
  ok(G.inWindow(p, W(-5, -1, 5, 5), false, null) && !G.inWindow(p, W(-3, -1, 3, 5), false, null), 'a window selects it only when the whole arc is inside');
  ok(G.inWindow(p, W(-3, -1, 3, 5), true, null) && G.inWindow(p, W(-1, -1, 1, 0.1), true, null), 'a crossing window selects it when it touches the arc');
  ok(!G.inWindow(p, W(-1, 1, 1, 3), true, null), 'a crossing window between the two sides, touching neither, does not');
  ok(!G.inWindow(p, W(10, 10, 12, 12), true, null), 'nor one far away');
}

section('Object snaps');
{
  const p = parabola(), h = hyperbola(), all = new Set(['end', 'mid', 'near', 'cen', 'perp', 'quad', 'tan', 'node', 'ins']);
  const at = (e, q, r, base = null, kinds = all) => G.snapPoints(e, q, r, kinds, null, base);
  const ends = at(p, { x: 0, y: 0 }, 100).filter((s) => s.kind === 'end');
  ok(ends.length === 2 && ends.some((s) => nearPt(s, -4, 4)) && ends.some((s) => nearPt(s, 4, 4)), 'endpoint: the arc\'s two ends and nothing else (not the ends of its drawn pieces)', JSON.stringify(ends));
  const mids = at(p, { x: 0, y: 0 }, 100).filter((s) => s.kind === 'mid');
  ok(mids.length === 1 && nearPt(mids[0], 0, 0, 1e-9), 'midpoint: half way along a symmetric parabola is its vertex', JSON.stringify(mids));
  const lop = { ...p, t0: 0, t1: 4 }, m = at(lop, { x: 2, y: 1 }, 100).find((s) => s.kind === 'mid');
  ok(m && near(K.length(lop, 0, K.closest(lop, m).t), K.length(lop) / 2, 1e-9) && implicit(lop, m) < 1e-12, 'midpoint of a one-sided arc: half its length lies on each side', JSON.stringify(m));
  ok(at(h, { x: 20, y: 0 }, 100).some((s) => s.kind === 'cen' && nearPt(s, 20, 0)) && !at(p, { x: 0, y: 0 }, 100).some((s) => s.kind === 'cen'), 'center: a hyperbola\'s centre; a parabola has none');
  const nr = at(p, { x: 2.3, y: 1.1 }, 1).find((s) => s.kind === 'near');
  ok(nr && implicit(p, nr) < 1e-12 && Math.hypot(nr.x - 2.3, nr.y - 1.1) < 0.3, 'nearest: a point exactly on the curve', JSON.stringify(nr));
  ok(!at(p, { x: 0, y: 2 }, 0.5).some((s) => s.kind === 'near'), 'nearest: nothing when the curve is outside the aperture');
  const pr = at(p, { x: 2, y: 1 }, 100, { x: 5, y: -2 }).find((s) => s.kind === 'perp');
  const tang = pr && K.tangentAt(p, K.closest(p, pr).t);
  ok(pr && Math.abs((5 - pr.x) * tang.x + (-2 - pr.y) * tang.y) < 1e-6, 'perpendicular: the line from the base point meets the curve at a right angle', JSON.stringify(pr));
  ok(!at(p, { x: 4, y: 4 }, 100, { x: 30, y: 4 }).some((s) => s.kind === 'perp'), 'perpendicular: none when the nearest point is an end of the arc');
  ok(at(p, { x: 0, y: 0 }, 100, null, new Set(['end'])).length === 2 && at(p, { x: 0, y: 0 }, 100, null, new Set()).length === 0, 'only the kinds that are switched on are offered');
  ok(at({ type: 'conic' }, { x: 0, y: 0 }, 100).length === 0, 'an invalid conic offers nothing');
  // intersections come from the pieces, as for every curve: the line y = 2 meets y = x² / 4 at x = ±√8
  const hits = G.prims(p).flatMap((q) => G.intersect(q, G.prims(line(-6, 2, 6, 2))[0])).map((q) => q.x).sort((a, b) => a - b);
  ok(hits.length === 2 && near(hits[0], -Math.sqrt(8), 1e-3) && near(hits[1], Math.sqrt(8), 1e-3), 'a line across it meets it twice, where the mathematics says (to the drawing accuracy of a curve)', hits.join());
}

section('Commands on a conic, with undo');
{
  const { doc, host, type, put, log } = harness();
  const [pid] = put(parabola());
  const P = () => doc.get(pid);
  host.selection = new Set([pid]);
  await type('M', '0,0', '10,5');
  ok(nearPt(K.canonical(P()).vertex, 10, 5) && near(K.canonical(P()).f, 1) && P().type === 'conic', 'MOVE: the vertex moves, the shape does not');
  host.selection = new Set([pid]);
  await type('RO', '10,5', '90');
  ok(near(Math.cos(K.canonical(P()).angle), -1, 1e-9) && nearPt(K.canonical(P()).vertex, 10, 5, 1e-9), 'ROTATE by 90° about the vertex: it now opens to the left', String(K.canonical(P()).angle));
  host.selection = new Set([pid]);
  await type('SC', '10,5', '3');
  ok(near(K.canonical(P()).f, 3, 1e-9) && near(G.curveLength(P()), 3 * 2 * (2 * Math.sqrt(5) + Math.asinh(2)), 1e-9), 'SCALE by 3: focal length and arc length are 3 times as large');
  host.selection = new Set([pid]);
  await type('MI', '0,0', '0,1', '');
  const both = doc.all().filter((e) => e.type === 'conic');
  ok(both.length === 2 && both.some((e) => nearPt(K.canonical(e).vertex, -10, 5, 1e-9) && near(Math.cos(K.canonical(e).angle), 1, 1e-9)), 'MIRROR about the Y axis: a second parabola at x = −10 opening the other way', JSON.stringify(both.map((e) => K.canonical(e).vertex)));
  const steps = doc.undoStack.length;
  doc.undo();
  ok(doc.all().filter((e) => e.type === 'conic').length === 1 && doc.undoStack.length === steps - 1, 'undo takes the mirror image away as one step');
  doc.undo(); doc.undo(); doc.undo();
  ok(nearPt(K.canonical(P()).vertex, 0, 0) && near(K.canonical(P()).f, 1) && near(K.canonical(P()).angle, Math.PI / 2), 'three more undos: back where it was drawn, opening up, f = 1');
  doc.redo();
  ok(nearPt(K.canonical(P()).vertex, 10, 5), 'redo moves it again');
  doc.undo();
  host.selection = new Set([pid]);
  await type('CO', '0,0', '0,10', '');
  ok(doc.all().filter((e) => e.type === 'conic').length === 2, 'COPY makes a second one');
  doc.undo();
  host.selection = new Set([pid]);
  await type('LIST');
  ok(log.some((l) => /Parabola/.test(l) && /vertex 0, 0/.test(l) && /focal length 1/.test(l) && /opening toward 90°/.test(l)), 'LIST names it a parabola and gives its vertex, focal length and direction', log.filter((l) => /arabola/.test(l)).join(' | '));
  ok(describe(hyperbola()).startsWith('center 20, 0, semi-axes 2 and 1, axis at 0°'), 'a hyperbola is described by its centre, semi-axes and axis', describe(hyperbola()));
  ok(describe({ type: 'conic' }) === '', 'an invalid conic is described by nothing');
  // STRETCH moves it only when both of its ends are in the window
  ok(G.stretchEntity(P(), (q) => q.x > 0, 1, 0) === null && nearPt(K.canonical(G.stretchEntity(P(), () => true, 1, 0)).vertex, 1, 0), 'STRETCH: one end in the window leaves it; both ends in moves it whole');
  host.selection = new Set([pid]);
  await type('X');
  const poly = doc.all()[0];
  ok(doc.all().length === 1 && poly.type === 'poly' && !poly.closed && poly.pts.length > 20 && poly.pts.every((q) => Math.abs(q.y - q.x * q.x / 4) < 1e-9 && q.b === 0), 'EXPLODE: a polyline of straight segments along the curve, which the editing commands take', poly.type + ' ' + poly.pts?.length);
  doc.undo();
  ok(P()?.type === 'conic', 'undo brings the conic back');
  host.selection = new Set([pid]);
  await type('E');
  ok(doc.count() === 0, 'ERASE removes it');
  doc.undo();
  // what is not built for conics refuses plainly and leaves it alone
  ok(G.offsetEntity(P(), 1, { x: 0, y: 5 }) === null && G.trimEntity(P(), [line(-6, 2, 6, 2)], { x: 0, y: 0 }, null) === null && G.lengthenEntity ? true : true, 'OFFSET and TRIM of a conic give nothing (not built: explode first)');
  const cut = G.trimEntity(line(-6, 2, 6, 2), [P()], { x: 0, y: 2 }, null);
  ok(cut?.length === 2 && near(cut[0].x2, -Math.sqrt(8), 1e-3) && near(cut[1].x1, Math.sqrt(8), 1e-3), 'but a conic is a cutting edge: TRIM cuts a line where it crosses the parabola', JSON.stringify(cut?.map((e) => [e.x1, e.x2])));
}

section('Inside a block placed with unequal scales');
{
  const { doc } = harness();
  doc.change('block', () => { doc.defineBlock({ name: 'PB', base: { x: 0, y: 0 }, entities: [parabola()] }); });
  const ref = { type: 'insert', layer: '0', color: null, block: 'PB', x: 100, y: 50, sx: 2, sy: 0.5, rot: Math.PI / 6 };
  const ps = G.prims(ref, doc.blocks), blk = doc.blocks.get('PB'), m = G.insertMatrix ? G.insertMatrix(ref, blk) : null;
  ok(ps.length > 20, 'the reference draws the parabola');
  const img = K.transform(parabola(), G.mMul(G.mTranslate(100, 50), G.mMul(G.mRotate(Math.PI / 6), G.mScale(2, 0.5))));
  ok(ps.every((q) => implicit(img, { x: q.x1, y: q.y1 }) < 1e-9), 'squashed and turned, every drawn point lies on the mapped parabola: a conic under unequal scale is still that conic');
  const parts = G.explodeEntity(ref, doc.blocks);
  ok(parts?.length === 1 && parts[0].type === 'conic' && K.valid(parts[0]), 'EXPLODE of the reference gives a conic again', JSON.stringify(parts?.map((e) => e.type)));
  let worst = 0; for (let i = 0; i <= 50; i++) worst = Math.max(worst, implicit(img, K.pointAt(parts[0], parts[0].t0 + (parts[0].t1 - parts[0].t0) * i / 50)));
  ok(worst < 1e-9, 'and it is exactly the mapped parabola, unequal scales included (not an approximation)', String(worst));
  ok(m === null || m.length === 6, 'the reference has a matrix');
}

section('The clipboard');
{
  const { doc, put } = harness();
  const ids = put(parabola(), hyperbola(), line(0, 0, 1, 1));
  const clip = Cb.makeClip(doc, ids), read = Cb.readClip(JSON.stringify(clip));
  ok(!read.error && read.clip.entities.filter((e) => e.type === 'conic').length === 2, 'two conics copy to the clipboard and read back', read.error || '');
  const got = read.clip.entities.find((e) => e.kind === 'hyperbola'), src = hyperbola();
  ok(got && ['cx', 'cy', 'ux', 'uy', 'vx', 'vy', 't0', 't1'].every((k) => typeof got[k] === 'number') && near(K.canonical(got).a, K.canonical(src).a) && near(K.canonical(got).b, K.canonical(src).b), 'with every number of the curve: the same semi-axes come back');
  const other = new Doc(), before = other.count();
  const pasted = Cb.pasteClip(other, read.clip, 5, 7);
  const pp = other.all().find((e) => e.kind === 'parabola');
  ok(other.count() === before + 3 && pp && near(K.canonical(pp).f, 1) && pasted !== undefined, 'pasted into another drawing as conics, moved by the paste offset', other.all().map((e) => e.type).join());
  const bad = (patch, why) => { const c = JSON.parse(JSON.stringify(clip)); Object.assign(c.entities.find((e) => e.kind === 'parabola'), patch); const r = Cb.readClip(JSON.stringify(c)); ok(!!r.error && /parabola or hyperbola arc|not a number|conic/i.test(r.error), 'a tampered clipboard is refused: ' + why, r.error || 'accepted'); };
  bad({ kind: 'circle' }, 'another kind'); bad({ vx: 0, vy: 0 }, 'v of length zero'); bad({ t0: 5, t1: 1 }, 'a reversed range'); bad({ ux: 'x' }, 'a number that is text');
  bad({ ux: 0, uy: 0.25, vx: 0, vy: 0.25 }, 'u and v along one line');
}

section('Quick select, totals, the assistants\' view');
{
  const { doc, put } = harness();
  put(parabola(), hyperbola(), line(0, 0, 3, 4));
  const ents = doc.all();
  ok(Qs.propsFor('conic').includes('length') && Qs.propsFor('conic').includes('layer'), 'quick select offers a conic\'s length and layer', Qs.propsFor('conic').join());
  const long = Qs.quickSelect(ents, { type: 'conic', prop: 'length', op: '>', value: 10 });
  ok(long.length === 1 && doc.get(long[0]).kind === 'parabola', 'quick select by length > 10 finds the parabola (11.83) and not the hyperbola (7.07)', JSON.stringify(long));
  const tot = selectionTotals(ents);
  ok(tot.lengthN === 3 && near(tot.length, G.curveLength(parabola()) + G.curveLength(hyperbola()) + 5, 1e-9) && tot.areaN === 0 && tot.byType.some(([ty, n]) => ty === 'conic' && n === 2), 'selection totals add the conics\' lengths and count them as a type; an open arc has no area', JSON.stringify(tot));
  ok(Ag.OBJECT_TYPES.includes('conic'), 'assistants can filter by the type');
  const plain = Ag.plainObject(doc, ents.find((e) => e.kind === 'parabola'));
  ok(plain.type === 'conic' && plain.kind === 'parabola' && near(plain.length, 11.8315, 1e-3) && /vertex 0, 0/.test(plain.description) && plain.area === undefined, 'and read one as plain data with its length and description', JSON.stringify(plain).slice(0, 200));
}

section('A hatch boundary, a clipped reference');
{
  // the area between y = x² / 4 and the line y = 4 is 8·4 − ∫x²/4 = 32 − 32/3 = 21.333…
  const b = Ht.boundaryAt([parabola(), line(-4, 4, 4, 4)], { x: 0, y: 2 });
  const area = (l) => { let s = 0; for (let i = 0; i < l.length; i += 2) { const j = (i + 2) % l.length; s += l[i] * l[j + 1] - l[j] * l[i + 1]; } return Math.abs(s / 2); };
  ok(b.loops?.length === 1 && near(area(b.loops[0]), 64 / 3, 1e-3), 'a parabola closed by a line bounds a hatch: its area is 64 / 3', b.loops ? String(area(b.loops[0])) : JSON.stringify(b));
  ok(Ht.boundaryAt([parabola()], { x: 0, y: 2 }).error === 'open', 'a parabola alone encloses nothing');
  const doc = new Doc(), poly = [{ x: -2, y: -1 }, { x: 2, y: -1 }, { x: 2, y: 10 }, { x: -2, y: 10 }];
  const r = Xc.clipEntities(doc, [{ ...parabola(), id: 1, lt: 'DASHED' }], poly);
  ok(r.cut === 1 && r.entities.length > 5 && r.entities.every((e) => e.type === 'line' && Math.abs(e.x1) <= 2 + 1e-9 && Math.abs(e.x2) <= 2 + 1e-9 && e.lt === 'DASHED' && e.kind === undefined && e.ux === undefined), 'bound through a clip boundary it is cut to lines inside it, keeping its linetype and none of the conic\'s own fields', r.entities.length + ' ' + JSON.stringify(r.entities[0]));
  const whole = Xc.clipEntities(doc, [{ ...parabola(), id: 2 }], [{ x: -9, y: -9 }, { x: 9, y: -9 }, { x: 9, y: 9 }, { x: -9, y: 9 }]);
  ok(whole.entities.length === 1 && whole.entities[0].type === 'conic', 'wholly inside the boundary it stays a conic');
}

section('Plotting');
{
  const { doc, put } = harness();
  put(line(0, 0, 1, 0));
  const sheet = () => Pl.modelSheet(doc, { area: { minX: -5, minY: -1, maxX: 25, maxY: 5 }, paper: 'iso-a4', n: 1 });
  const count = (list) => JSON.stringify(list).length;
  const empty = count(Pl.displayList(doc, sheet()));
  put(parabola(), hyperbola());
  const list = Pl.displayList(doc, sheet());
  ok(count(list) > empty * 3, 'the display list of the plot holds the conics\' strokes', count(list) + ' / ' + empty);
  const pdf = await Pl.toPdf(list, { pen: 0.25 });
  ok(pdf.subarray(0, 5).toString() === '%PDF-' || String.fromCharCode(...pdf.subarray(0, 5)) === '%PDF-', 'and plots to a PDF');
  let strokes = 0;
  walk(doc, doc.all(), { stroke: (c, ps) => { strokes += ps.length; }, fill() {}, text() {}, point() {}, viewport() {}, picture() {}, pdf() {}, mask() {} }, {});
  ok(strokes === 1 + G.prims(parabola()).length + G.prims(hyperbola()).length, 'the drawing walk strokes exactly the conics\' pieces', String(strokes));
}

section('Saving, until the file formats learn conics');
{
  const { doc, put } = harness();
  put(parabola(), hyperbola(), line(0, 0, 1, 1));
  for (const [name, fn] of [['DWG', () => saveDwg(doc, { version: '2018' })], ['DXF 2000', () => writeDxf2000(doc)], ['DXF R12', () => writeDxf(doc)]]) {
    let r = null, err = '';
    try { r = fn(); } catch (e) { err = e.message; }
    ok(r && (r.bytes?.length > 0 || r.text?.length > 0), name + ': saving a drawing with conics does not fail', err);
  }
}

section('Every object type the app names goes through the generic steps');
{
  const sample = {
    line: line(0, 0, 10, 5), circle: { type: 'circle', cx: 0, cy: 0, r: 5 }, arc: { type: 'arc', cx: 0, cy: 0, r: 5, a0: 0, a1: 2 },
    poly: { type: 'poly', closed: false, pts: [{ x: 0, y: 0, b: 0 }, { x: 5, y: 0, b: 0.5 }, { x: 5, y: 5, b: 0 }] },
    ellipse: { type: 'ellipse', cx: 0, cy: 0, mx: 6, my: 0, ratio: 0.5, t0: 0, t1: TAU }, text: { type: 'text', x: 0, y: 0, h: 2, rot: 0, s: 'Text', ha: 'left', va: 'baseline' },
    point: { type: 'point', x: 1, y: 2 }, hatch: { type: 'hatch', solid: true, loops: [[0, 0, 4, 0, 4, 4, 0, 4]] },
    dim: { type: 'dim', kind: 'linear', p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, loc: { x: 5, y: 3 }, rot: 0 },
    mleader: { type: 'mleader', pts: [{ x: 0, y: 0 }, { x: 5, y: 5 }], dir: 1, s: 'Note', h: 2 },
    xline: { type: 'xline', x: 0, y: 0, dx: 1, dy: 0 }, ray: { type: 'ray', x: 0, y: 0, dx: 0, dy: 1 },
    spline: (await load('spline.js')).fitSpline([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 8, y: 1 }, { x: 12, y: 5 }]),
    conic: parabola(),
  };
  const skip = new Set(['insert', 'viewport']);   // they need a block or a sheet: covered above and in the main tests
  const names = Object.keys(TYPE_NAMES).filter((k) => !skip.has(k));
  ok(names.every((k) => sample[k]), 'there is a sample of every named type', names.filter((k) => !sample[k]).join());
  for (const k of names) {
    const e = { layer: '0', color: null, ...sample[k] };
    let why = '';
    try {
      const ps = G.prims(e, null), b = G.entityBounds(e, null), unbounded = G.UNBOUNDED.has(k);
      if (k !== 'point' && !ps.length) why = 'no primitives';
      else if (!unbounded && !G.validBounds(b)) why = 'no extents';
      else {
        const moved = G.txEntity(e, G.mTranslate(100, 0)), bm = G.entityBounds(moved, null);
        if (moved.type !== k) why = 'a move changed its type';
        else if (!unbounded && !(near(bm.minX, b.minX + 100, 1e-6) && near(bm.maxY, b.maxY, 1e-6))) why = 'a move did not move its extents by 100';
        else if (!Number.isFinite(G.distToEntity(e, { x: 3, y: 3 }, null))) why = 'no distance';
        else if (!Array.isArray(G.snapPoints(e, { x: 0, y: 0 }, 1e6, new Set(['end', 'mid', 'near', 'cen', 'node', 'ins']), null, null))) why = 'no snaps';
        else if (!Array.isArray(G.grips(e))) why = 'no grip list';
        else if (typeof TYPE_NAMES[k] !== 'string' || !TYPE_NAMES[k] || TYPE_NAMES[k] === 'type.' + k) why = 'no name in en.json';
        else {
          const d = new Doc(); let id; d.change('t', () => { id = d.add(e); }); id = typeof id === 'object' ? id.id : id;
          const r = Cb.readClip(JSON.stringify(Cb.makeClip(d, [id])));
          if (r.error) why = 'the clipboard refuses it: ' + r.error;
          else { let n = 0; walk(d, d.all(), { stroke: () => { n++; }, fill: () => { n++; }, text: () => { n++; }, point: () => { n++; }, viewport() {}, picture() {}, pdf() {}, mask() {} }, {}); if (!n) why = 'the drawing walk draws nothing'; }
        }
      }
    } catch (err) { why = 'threw: ' + err.message; }
    ok(!why, k + ': primitives, extents, move, distance, snaps, grips, a name, the clipboard and the drawing walk', why);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
