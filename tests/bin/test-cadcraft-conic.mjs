#!/usr/bin/env node
/* SPDX-License-Identifier: Apache-2.0 */
/**
 * test-cadcraft-conic.mjs — the conic kernel (conic.js): parabola and hyperbola arcs.
 *
 *   node bin/test-cadcraft-conic.mjs [--build dev|x.y] [--verbose]
 *
 * The kernel has no DOM and nothing else in the app uses it yet, so these tests are about the mathematics:
 *   - the entity's validity rules, and making one from the numbers people type (vertex, focal length, centre, semi-axes);
 *   - the same numbers read back from the entity, also after affine maps (move, rotate, mirror, unequal scale, shear);
 *   - every affine map giving the image conic exactly: transform(e, m).pointAt(t) == m applied to e.pointAt(t);
 *   - the exact conversion to a rational quadratic spline: the spline's points satisfy the conic's own equation, the spans
 *     are built as documented, and spline.js accepts and evaluates them;
 *   - the nearest point of an arc, against a fine scan;
 *   - the conic through five points: parabola, hyperbola and ellipse found from random points on random conics, and every
 *     refusal (not five points, repeated or collinear points, three collinear, both branches, beyond the range).
 * Random cases come from a seeded generator, so a failure repeats.
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

const K = await load('conic.js');
const S = await load('spline.js');

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { if (cond) { pass++; if (VERBOSE) console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } };
const section = (s) => console.log('\n' + s);
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const nearPt = (p, q, tol = 1e-9) => near(p.x, q.x, tol) && near(p.y, q.y, tol);
const TAU = Math.PI * 2;

// a seeded generator: the same cases every run
let seed = 20261117;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const R = (a, b) => a + (b - a) * rnd();
const det = (ax, ay, bx, by) => ax * by - ay * bx;
const apply = (m, p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
/** How far p is from satisfying the conic's own equation: the point's coordinates in the (u, v) frame must obey the curve's law. */
function implicit(e, p) {
  const dx = p.x - e.cx, dy = p.y - e.cy, D = det(e.ux, e.uy, e.vx, e.vy), X = det(dx, dy, e.vx, e.vy) / D, Y = det(e.ux, e.uy, dx, dy) / D;
  return e.kind === 'parabola' ? Math.abs(Y - X * X) : (X > 0 ? Math.abs(X * X - Y * Y - 1) : 1);   // a hyperbola's arc: the branch of u
}
/** A random affine map: unequal scales, a shear, a rotation, a move; a third of them mirror. */
function randomMap() {
  const a = R(0.3, 3), d = R(0.3, 3), sh = R(-1, 1), r = R(0, TAU), c = Math.cos(r), s = Math.sin(r);
  const m = [a * c, a * s, -d * s + sh * a * c, d * c + sh * a * s, R(-20, 20), R(-20, 20)];
  return rnd() < 0.34 ? [m[0], m[1], -m[2], -m[3], m[4], m[5]] : m;
}
/** The true distance from p to an ellipse (cx, cy, mx, my, ratio): a scan of the angle around p's own direction, then golden-section. */
function ellipseDist(E, p) {
  const a = Math.hypot(E.mx, E.my), b = a * E.ratio, ux = E.mx / a, uy = E.my / a, dx = p.x - E.cx, dy = p.y - E.cy;
  const at = (th) => ({ x: E.cx + a * Math.cos(th) * ux - b * Math.sin(th) * uy, y: E.cy + a * Math.cos(th) * uy + b * Math.sin(th) * ux });
  const f = (th) => { const q = at(th); return (q.x - p.x) ** 2 + (q.y - p.y) ** 2; };
  const th0 = Math.atan2((-dx * uy + dy * ux) / b, (dx * ux + dy * uy) / a);
  let bi = 0, bf = Infinity;
  for (let i = -1000; i <= 1000; i++) { const v = f(th0 + i * 3e-4); if (v < bf) { bf = v; bi = i; } }
  let lo = th0 + (bi - 1) * 3e-4, hi = th0 + (bi + 1) * 3e-4;
  const g = (Math.sqrt(5) - 1) / 2; let x1 = hi - g * (hi - lo), x2 = lo + g * (hi - lo), f1 = f(x1), f2 = f(x2);
  for (let k = 0; k < 90; k++) { if (f1 < f2) { hi = x2; x2 = x1; f2 = f1; x1 = hi - g * (hi - lo); f1 = f(x1); } else { lo = x1; x1 = x2; f1 = f2; x2 = lo + g * (hi - lo); f2 = f(x2); } }
  return Math.sqrt(f((lo + hi) / 2));
}
const randomParabola = () => K.parabola({ vertex: { x: R(-9, 9), y: R(-9, 9) }, angle: R(0, TAU), f: R(0.2, 3), s0: R(-6, -0.5), s1: R(0.5, 6) });
const randomHyperbola = () => K.hyperbola({ center: { x: R(-9, 9), y: R(-9, 9) }, angle: R(0, TAU), a: R(0.5, 4), b: R(0.5, 4), t0: R(-3, -0.2), t1: R(0.2, 3), branch: rnd() < 0.5 ? 1 : -1 });
const randomConic = (kind) => K.transform(kind === 'parabola' ? randomParabola() : randomHyperbola(), randomMap());

section('The entity: what is valid');
{
  const base = { type: 'conic', kind: 'parabola', cx: 0, cy: 0, ux: 1, uy: 0, vx: 0, vy: 0.25, t0: -2, t1: 3 };
  ok(K.valid(base) && K.valid({ ...base, kind: 'hyperbola', t0: -1, t1: 1 }), 'a parabola and a hyperbola with independent u and v are valid');
  const bad = (patch, why) => ok(!K.valid({ ...base, ...patch }), 'not valid: ' + why);
  bad({ type: 'ellipse' }, 'another type'); bad({ kind: 'ellipse' }, 'another kind'); bad({ kind: undefined }, 'no kind');
  bad({ t0: 3, t1: 3 }, 'an empty range'); bad({ t0: 3, t1: -2 }, 'a reversed range');
  bad({ vx: 2, vy: 0 }, 'u and v along one line'); bad({ ux: 0, uy: 0 }, 'u of length zero'); bad({ vx: 0, vy: 0 }, 'v of length zero');
  bad({ cx: NaN }, 'a NaN'); bad({ ux: Infinity }, 'an infinity'); bad({ t1: 1e8 }, 'a parabola reaching past the size limit');
  ok(!K.valid({ ...base, kind: 'hyperbola', t0: -1, t1: K.T_MAX + 0.01 }) && K.valid({ ...base, kind: 'hyperbola', t0: -K.T_MAX, t1: K.T_MAX }), 'a hyperbola is limited to |t| <= T_MAX, and the limit itself is allowed');
  ok(!K.valid(null) && !K.valid(undefined) && !K.valid({}) && !K.valid('x'), 'nothing and nonsense are not valid');
}

section('Making one from the numbers people type, and reading them back');
{
  const p = K.parabola({ vertex: { x: 2, y: -1 }, angle: Math.PI / 2, f: 0.5, s0: 3, s1: -2 });
  const c = K.canonical(p);
  ok(p && c.kind === 'parabola' && nearPt(c.vertex, { x: 2, y: -1 }) && near(c.f, 0.5) && near(c.angle, Math.PI / 2) && near(c.s0, -2) && near(c.s1, 3), 'a parabola opening up with f = 0.5: vertex, angle, focal length and sideways extent read back', JSON.stringify(c));
  ok(nearPt(c.focus, { x: 2, y: -0.5 }), 'its focus is f above the vertex', JSON.stringify(c.focus));
  // y = x² / (4 f) for an upward parabola at the origin: the points are where the law says
  const q = K.parabola({ vertex: { x: 0, y: 0 }, angle: Math.PI / 2, f: 1, s0: -2, s1: 2 });
  ok(nearPt(K.pointAt(q, 2), { x: -2, y: 1 }) || nearPt(K.pointAt(q, 2), { x: 2, y: 1 }), 'f = 1: the point 2 to the side is 1 up (y = x² / 4)', JSON.stringify(K.pointAt(q, 2)));
  const ends = K.ends(q);
  ok(near(Math.abs(ends.start.x), 2) && near(ends.start.y, 1) && near(ends.end.y, 1) && near(ends.start.x, -ends.end.x), 'the two ends are mirror images about the axis', JSON.stringify(ends));
  ok(K.parabola({ vertex: { x: 0, y: 0 }, angle: 0, f: 0, s0: -1, s1: 1 }) === null && K.parabola({ vertex: { x: 0, y: 0 }, angle: 0, f: -1, s0: -1, s1: 1 }) === null && K.parabola({ vertex: { x: 0, y: 0 }, angle: 0, f: 1, s0: 1, s1: 1 }) === null, 'f of zero or less, or an empty extent, makes no parabola');

  const h = K.hyperbola({ center: { x: 1, y: 2 }, angle: 0, a: 3, b: 4, t0: -1, t1: 2 });
  const ch = K.canonical(h);
  ok(h && near(ch.a, 3) && near(ch.b, 4) && near(ch.c, 5) && near(ch.eccentricity, 5 / 3) && near(ch.angle, 0) && near(ch.phi, 0), 'a hyperbola a = 3, b = 4: semi-axes, focal distance 5, eccentricity 5/3, no parameter shift', JSON.stringify(ch));
  ok(nearPt(ch.vertex, { x: 4, y: 2 }) && nearPt(ch.focus, { x: 6, y: 2 }) && nearPt(ch.otherFocus, { x: -4, y: 2 }), 'vertex at centre + a, foci at centre ± 5 along the axis', JSON.stringify([ch.vertex, ch.focus, ch.otherFocus]));
  const hm = K.canonical(K.hyperbola({ center: { x: 0, y: 0 }, angle: 0.3, a: 2, b: 1, t0: -1, t1: 1, branch: -1 }));
  ok(near(hm.a, 2) && near(hm.b, 1) && near(Math.cos(hm.angle), Math.cos(0.3 + Math.PI), 1e-9) && near(Math.sin(hm.angle), Math.sin(0.3 + Math.PI), 1e-9), 'the other branch: the axis points to it, so its angle is turned by half a turn', JSON.stringify(hm));
  ok(K.hyperbola({ center: { x: 0, y: 0 }, angle: 0, a: 0, b: 1, t0: -1, t1: 1 }) === null && K.hyperbola({ center: { x: 0, y: 0 }, angle: 0, a: 1, b: -1, t0: -1, t1: 1 }) === null && K.hyperbola({ center: { x: 0, y: 0 }, angle: 0, a: 1, b: 1, t0: -1, t1: 1, branch: 2 }) === null && K.hyperbola({ center: { x: 0, y: 0 }, angle: 0, a: 1, b: 1, t0: -1, t1: 99 }) === null, 'a or b of zero or less, a branch other than ±1, or a range past T_MAX makes no hyperbola');

  // after any affine map the numbers still describe the same curve: rebuild P(t) from them and compare
  let worst = 0, n = 0;
  for (let k = 0; k < 300; k++) {
    const kind = k % 2 ? 'hyperbola' : 'parabola', e = randomConic(kind), cn = K.canonical(e), t = R(e.t0, e.t1), P = K.pointAt(e, t);
    let Q;
    if (kind === 'parabola') { const s = cn.kappa * (t - cn.tStar), w = s * s / (4 * cn.f); Q = { x: cn.vertex.x + s * cn.normal.x + w * cn.axis.x, y: cn.vertex.y + s * cn.normal.y + w * cn.axis.y }; }
    else { const tau = t + cn.phi; Q = { x: cn.center.x + cn.a * Math.cosh(tau) * cn.axis.x + cn.b * Math.sinh(tau) * cn.normal.x, y: cn.center.y + cn.a * Math.cosh(tau) * cn.axis.y + cn.b * Math.sinh(tau) * cn.normal.y }; }
    worst = Math.max(worst, Math.hypot(P.x - Q.x, P.y - Q.y) / (1 + Math.hypot(P.x, P.y))); n++;
  }
  ok(worst < 1e-8, `${n} random conics under random affine maps: the canonical numbers rebuild the same curve (worst ${worst.toExponential(1)})`);
  // the focus really is the focus: every point is as far from it as from the directrix
  let wf = 0;
  for (let k = 0; k < 100; k++) {
    const e = K.parabola({ vertex: { x: R(-5, 5), y: R(-5, 5) }, angle: R(0, TAU), f: R(0.3, 3), s0: -4, s1: 4 }), cn = K.canonical(e), t = R(e.t0, e.t1), P = K.pointAt(e, t);
    const toDir = (P.x - cn.vertex.x) * cn.axis.x + (P.y - cn.vertex.y) * cn.axis.y + cn.f;   // distance to the directrix, which lies f behind the vertex
    wf = Math.max(wf, Math.abs(Math.hypot(P.x - cn.focus.x, P.y - cn.focus.y) - toDir));
  }
  ok(wf < 1e-9, `parabola: every point is as far from the focus as from the directrix (worst ${wf.toExponential(1)})`);
  let wh = 0;
  for (let k = 0; k < 100; k++) {
    const e = K.hyperbola({ center: { x: R(-5, 5), y: R(-5, 5) }, angle: R(0, TAU), a: R(0.5, 4), b: R(0.5, 4), t0: -2, t1: 2, branch: rnd() < 0.5 ? 1 : -1 }), cn = K.canonical(e), P = K.pointAt(e, R(-2, 2));
    wh = Math.max(wh, Math.abs(Math.abs(Math.hypot(P.x - cn.focus.x, P.y - cn.focus.y) - Math.hypot(P.x - cn.otherFocus.x, P.y - cn.otherFocus.y)) - 2 * cn.a));
  }
  ok(wh < 1e-9, `hyperbola: the two focal distances always differ by 2a (worst ${wh.toExponential(1)})`);
}

section('Affine maps: move, rotate, mirror, unequal scale, shear');
{
  let worst = 0, n = 0, same = 0;
  for (let k = 0; k < 400; k++) {
    const e = randomConic(k % 2 ? 'hyperbola' : 'parabola'), m = randomMap(), e2 = K.transform(e, m);
    if (!e2) continue;
    const t = R(e.t0, e.t1), p = apply(m, K.pointAt(e, t)), q = K.pointAt(e2, t);
    worst = Math.max(worst, Math.hypot(p.x - q.x, p.y - q.y) / (1 + Math.hypot(p.x, p.y))); n++;
    if (e2.kind === e.kind && e2.t0 === e.t0 && e2.t1 === e.t1) same++;
  }
  ok(n === 400 && worst < 1e-11, `${n} random maps: the image's point at t is the map applied to the point at t (worst ${worst.toExponential(1)})`);
  ok(same === n, 'the kind and the parameter range are unchanged by a map');
  const e = randomConic('hyperbola'), m1 = randomMap(), m2 = randomMap();
  const ab = K.transform(K.transform(e, m1), m2), mm = [m2[0] * m1[0] + m2[2] * m1[1], m2[1] * m1[0] + m2[3] * m1[1], m2[0] * m1[2] + m2[2] * m1[3], m2[1] * m1[2] + m2[3] * m1[3], m2[0] * m1[4] + m2[2] * m1[5] + m2[4], m2[1] * m1[4] + m2[3] * m1[5] + m2[5]];
  const direct = K.transform(e, mm), t = R(e.t0, e.t1);
  ok(ab && direct && nearPt(K.pointAt(ab, t), K.pointAt(direct, t), 1e-9), 'two maps one after the other equal their combined map');
  const id = K.transform(e, [1, 0, 0, 1, 0, 0]);
  ok(id && ['cx', 'cy', 'ux', 'uy', 'vx', 'vy', 't0', 't1'].every((f) => id[f] === e[f]), 'the identity map changes nothing');
  ok(K.transform(e, [1, 2, 2, 4, 0, 0]) === null && K.transform(e, [0, 0, 0, 0, 1, 1]) === null, 'a singular map (it flattens the plane) gives nothing');
  ok(K.transform(e, [1, 0, 0]) === null && K.transform(e, [1, 0, 0, 1, NaN, 0]) === null && K.transform(e, null) === null && K.transform(null, [1, 0, 0, 1, 0, 0]) === null, 'a short or non-finite map, or no conic, gives nothing');
  const kept = K.transform({ ...e, layer: 'WALLS', color: 3 }, [2, 0, 0, 2, 1, 1]);
  ok(kept.layer === 'WALLS' && kept.color === 3 && kept.type === 'conic', 'the layer, colour and other fields ride along');
  // a mirror reverses the sideways direction: the canonical handedness of a hyperbola flips, its size does not
  const h = K.hyperbola({ center: { x: 0, y: 0 }, angle: 0, a: 2, b: 1, t0: -1, t1: 1 }), hm = K.transform(h, [1, 0, 0, -1, 0, 0]);
  ok(K.canonical(h).handed === 1 && K.canonical(hm).handed === -1 && near(K.canonical(hm).a, 2) && near(K.canonical(hm).b, 1), 'a mirror flips the hyperbola\'s handedness and keeps a and b');
  const ps = K.transform(K.parabola({ vertex: { x: 0, y: 0 }, angle: Math.PI / 2, f: 1, s0: -2, s1: 2 }), [3, 0, 0, 3, 0, 0]);
  ok(near(K.canonical(ps).f, 3), 'scaling a parabola by 3 scales its focal length by 3');
}

section('The exact spline');
{
  // structure, as documented
  const p = K.parabola({ vertex: { x: 0, y: 0 }, angle: Math.PI / 2, f: 1, s0: -2, s1: 3 }), sp = K.spans(p);
  ok(sp.degree === 2 && sp.ctrl.length === 3 && sp.knots.join() === '0,0,0,1,1,1' && sp.weights === null, 'a parabola: one span, three control points, knots 0,0,0,1,1,1, no weights');
  ok(nearPt(sp.ctrl[0], K.pointAt(p, -2)) && nearPt(sp.ctrl[2], K.pointAt(p, 3)), 'its end control points are the arc\'s ends');
  const h = K.hyperbola({ center: { x: 0, y: 0 }, angle: 0, a: 1, b: 1, t0: -3, t1: 3 }), sh = K.spans(h);
  ok(sh.ctrl.length === 9 && sh.knots.join() === '0,0,0,1,1,2,2,3,3,4,4,4' && sh.weights.length === 9, 'a hyperbola over a range of 6: four spans, 2n + 1 = 9 control points, doubled interior knots');
  ok(sh.weights.every((w, i) => (i % 2 ? near(w, Math.cosh(0.75), 1e-12) : w === 1)), 'its weights are 1 at the joins and cosh(width / 2) between');
  ok(K.spans({ ...h, t0: 0, t1: 1 }).ctrl.length === 3 && K.spans({ ...h, t0: 0, t1: 1.5 }).ctrl.length === 3 && K.spans({ ...h, t0: 0, t1: 1.51 }).ctrl.length === 5, 'a span is at most SPAN wide: 1.5 is one span, a hair more is two');
  const wide = K.spans(K.hyperbola({ center: { x: 0, y: 0 }, angle: 0, a: 1, b: 1, t0: -K.T_MAX, t1: K.T_MAX }));
  ok(wide.ctrl.length === 2 * 27 + 1 && Math.max(...wide.weights) < 1.5, 'the widest hyperbola (|t| = 20) takes 27 spans and no weight reaches 1.5', wide.ctrl.length + ' / ' + Math.max(...wide.weights));
  ok(K.spans({ type: 'conic', kind: 'parabola' }) === null && K.toSpline(null) === null, 'an invalid conic gives no spans and no spline');

  // exactness: every point of the spline satisfies the conic's own equation
  let worst = 0, count = 0, ends = 0, valid = 0;
  for (let k = 0; k < 300; k++) {
    const e = randomConic(k % 2 ? 'hyperbola' : 'parabola'), sl = K.toSpline(e);
    if (!sl) continue;
    if (S.valid(sl) && sl.degree === 2) valid++;
    const [u0, u1] = S.domain(sl);
    for (let i = 0; i <= 80; i++) { worst = Math.max(worst, implicit(e, S.pointAt(sl, u0 + (u1 - u0) * i / 80))); count++; }
    if (nearPt(S.pointAt(sl, u0), K.pointAt(e, e.t0), 1e-9) && nearPt(S.pointAt(sl, u1), K.pointAt(e, e.t1), 1e-9)) ends++;
  }
  ok(valid === 300, 'spline.js accepts all 300 converted conics as degree 2 splines');
  ok(worst < 1e-8, `${count} points of the splines of 300 random conics satisfy the conic's equation (worst ${worst.toExponential(1)})`);
  ok(ends === 300, 'the spline starts and ends exactly where the arc does');
  const wideSpline = K.toSpline(K.hyperbola({ center: { x: 1, y: 1 }, angle: 0.4, a: 1.5, b: 0.7, t0: -K.T_MAX, t1: K.T_MAX })), [w0, w1] = S.domain(wideSpline);
  let ww = 0; for (let i = 0; i <= 2000; i++) { const q = S.pointAt(wideSpline, w0 + (w1 - w0) * i / 2000); ww = Math.max(ww, implicit(K.hyperbola({ center: { x: 1, y: 1 }, angle: 0.4, a: 1.5, b: 0.7, t0: -K.T_MAX, t1: K.T_MAX }), q) / (1 + Math.hypot(q.x, q.y) ** 2)); }
  ok(ww < 1e-12, `the widest hyperbola (|t| = 20, 27 spans) is exact over its whole length (worst relative ${ww.toExponential(1)})`);
}

section('Flattening and the cache');
{
  const e = randomConic('hyperbola'), a = K.points(e), b = K.points(e);
  ok(a.length > 10 && a === b, 'points() flattens the curve, and asking twice for the same entity returns the cached result');
  ok(K.splineOf(e) === K.splineOf(e) && K.splineOf({ ...e }) !== K.splineOf(e), 'the spline is cached per entity object: a changed copy gets its own');
  const fine = K.points(e, { tol: 1e-4 }), coarse = K.points(e, { tol: 1 });
  ok(fine.length > coarse.length && fine.every((p) => implicit(e, p) < 1e-8), 'a tighter tolerance gives more points, and every point lies on the conic');
  ok(nearPt(fine[0], K.pointAt(e, e.t0), 1e-9) && nearPt(fine[fine.length - 1], K.pointAt(e, e.t1), 1e-9), 'the points run from one end of the arc to the other');
  let maxSag = 0;
  for (let i = 0; i + 1 < fine.length; i++) { const mid = { x: (fine[i].x + fine[i + 1].x) / 2, y: (fine[i].y + fine[i + 1].y) / 2 }; maxSag = Math.max(maxSag, K.closest(e, mid).dist); }
  ok(maxSag < 1e-3, `with tol = 1e-4 no chord sits further than 1e-3 from the curve (worst ${maxSag.toExponential(1)})`);
  ok(K.points(null).length === 0 && K.points({ type: 'conic' }).length === 0, 'no points for nothing or an invalid conic');
}

section('The nearest point of an arc');
{
  let onCurve = 0, vsScan = 0, never = 0;
  for (let k = 0; k < 200; k++) {
    const e = randomConic(k % 2 ? 'hyperbola' : 'parabola'), t = R(e.t0, e.t1), on = K.pointAt(e, t);
    onCurve = Math.max(onCurve, K.closest(e, on).dist);
    const off = { x: on.x + R(-3, 3), y: on.y + R(-3, 3) }, cl = K.closest(e, off), W = e.t1 - e.t0;
    let bd = Infinity, bt = e.t0;
    for (let i = 0; i <= 20000; i++) { const tq = e.t0 + W * i / 20000, z = K.pointAt(e, tq), d = Math.hypot(z.x - off.x, z.y - off.y); if (d < bd) { bd = d; bt = tq; } }
    for (let i = 0; i <= 20000; i++) { const tq = Math.min(e.t1, Math.max(e.t0, bt - W / 20000 + 2 * W / 20000 * i / 20000)), z = K.pointAt(e, tq); bd = Math.min(bd, Math.hypot(z.x - off.x, z.y - off.y)); }
    vsScan = Math.max(vsScan, Math.abs(cl.dist - bd)); never = Math.max(never, cl.dist - bd);
  }
  ok(onCurve < 1e-7, `a point on the arc is its own nearest point (worst distance ${onCurve.toExponential(1)})`);
  ok(vsScan < 1e-9 && never < 1e-9, `the nearest point agrees with a fine scan and is never worse than it (worst difference ${vsScan.toExponential(1)})`);
  const e = K.parabola({ vertex: { x: 0, y: 0 }, angle: Math.PI / 2, f: 1, s0: -2, s1: 2 });
  const far = K.closest(e, { x: 50, y: 1 }), c = K.closest(e, { x: 0, y: 5 }), apex = K.closest(e, { x: 0, y: -3 });
  ok(near(far.t, e.t1) || near(far.t, e.t0), 'a point far beyond one end is nearest to that end', JSON.stringify(far));
  ok(nearPt({ x: apex.x, y: apex.y }, { x: 0, y: 0 }, 1e-7) && near(apex.dist, 3, 1e-7), 'a point below the vertex on the axis is nearest to the vertex', JSON.stringify(apex));
  ok(c.dist > 0 && c.dist < 5, 'a point inside the curve has a nearest point on it');
  ok(K.closest(null, { x: 0, y: 0 }) === null && K.closest(e, { x: NaN, y: 0 }) === null && K.closest(e, null) === null, 'no conic, or a point that is not a point, gives nothing');
}

section('The conic through five points');
{
  const sample = (e, n) => Array.from({ length: n }, (_, i) => K.pointAt(e, e.t0 + (i + R(0.1, 0.9)) * (e.t1 - e.t0) / n));
  /** How straight a set of points is: the largest distance of a point from the line through the first and last, over the span. */
  const bulge = (pts) => { const a = pts[0], b = pts[pts.length - 1], L = Math.hypot(b.x - a.x, b.y - a.y); return Math.max(...pts.map((p) => Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / L)) / L; };
  for (const kind of ['parabola', 'hyperbola']) {
    let wrong = 0, worst = 0, sameNumbers = 0, runs = 150;
    for (let k = 0; k < runs; k++) {
      let e, pts;
      do { e = randomConic(kind); pts = sample(e, 5); } while (bulge(pts) < 0.02);   // flatter sets hardly determine a conic: tested separately below
      const r = K.fromFivePoints(pts);
      if (!r.ok || r.kind !== kind || r.entity.type !== 'conic') { wrong++; continue; }
      for (let i = 0; i <= 30; i++) worst = Math.max(worst, implicit(e, K.pointAt(r.entity, r.entity.t0 + (r.entity.t1 - r.entity.t0) * i / 30)));
      const a = K.canonical(e), b = K.canonical(r.entity);
      if (kind === 'parabola' ? near(a.f, b.f, 1e-6) && near(a.angle, b.angle, 1e-6) : near(a.a, b.a, 1e-6) && near(a.b, b.b, 1e-6) && near(a.c, b.c, 1e-6)) sameNumbers++;
    }
    ok(wrong === 0, `${runs} random ${kind}s: five points on the arc give back a ${kind}`, wrong + ' wrong');
    ok(worst < 1e-6, `the fitted ${kind} lies on the original (worst ${worst.toExponential(1)})`);
    ok(sameNumbers === runs, `and has the same ${kind === 'parabola' ? 'focal length and axis' : 'semi-axes and focal distance'}`, sameNumbers + ' of ' + runs);
  }
  // five points lying almost in a line hardly determine a conic: whatever comes back must still pass through all five, or be refused
  let accepted = 0, refused = 0, silentlyWrong = 0;
  for (let k = 0; k < 600; k++) {
    const kind = k % 2 ? 'hyperbola' : 'parabola', base = kind === 'parabola'
      ? K.parabola({ vertex: { x: R(-9, 9), y: R(-9, 9) }, angle: R(0, TAU), f: R(1, 8), s0: -R(0.05, 0.6), s1: R(0.05, 0.6) })
      : K.hyperbola({ center: { x: R(-9, 9), y: R(-9, 9) }, angle: R(0, TAU), a: R(1, 8), b: R(1, 8), t0: -R(0.02, 0.3), t1: R(0.02, 0.3) });
    const pts = sample(K.transform(base, randomMap()), 5), r = K.fromFivePoints(pts);
    if (!r.ok) { refused++; continue; }
    accepted++;
    const E = r.entity, spread = Math.hypot(Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y)));
    const miss = E.type === 'conic' ? Math.max(...pts.map((p) => K.closest(E, p).dist)) : Math.max(...pts.map((p) => ellipseDist(E, p)));
    if (!(miss <= 1e-4 * spread)) silentlyWrong++;
  }
  ok(silentlyWrong === 0 && accepted + refused === 600, `600 nearly straight point sets: ${accepted} answered, ${refused} refused, none answered with a conic that misses a point`, `${silentlyWrong} silently wrong`);
  let bad = 0, axesOff = 0;
  for (let k = 0; k < 120; k++) {
    const ma = R(1, 6), mi = R(0.3, 1) * ma, rot = R(0, TAU), cx = R(-9, 9), cy = R(-9, 9);
    const pts = Array.from({ length: 5 }, (_, i) => { const th = (i + R(0.1, 0.9)) * TAU / 5, x = ma * Math.cos(th), y = mi * Math.sin(th); return { x: cx + x * Math.cos(rot) - y * Math.sin(rot), y: cy + x * Math.sin(rot) + y * Math.cos(rot) }; });
    const r = K.fromFivePoints(pts);
    if (!r.ok || r.kind !== 'ellipse' || r.entity.type !== 'ellipse') { bad++; continue; }
    const E = r.entity, a = Math.hypot(E.mx, E.my);
    if (!(near(a, ma, 1e-8) && near(E.ratio * a, mi, 1e-8) && near(E.cx, cx, 1e-8) && near(E.cy, cy, 1e-8) && E.t0 === 0 && near(E.t1, TAU))) axesOff++;
  }
  ok(bad === 0 && axesOff === 0, '120 random ellipses: five points give back CadCraft\'s own ellipse entity with the same centre, axes and a full sweep', `${bad} wrong kind, ${axesOff} wrong numbers`);

  // exact, hand-checkable cases
  const par = K.fromFivePoints([-2, -1, 0, 1, 2].map((x) => ({ x, y: x * x / 4 })));
  ok(par.ok && par.kind === 'parabola' && near(K.canonical(par.entity).f, 1, 1e-9) && near(K.canonical(par.entity).angle, Math.PI / 2, 1e-9), 'five points on y = x² / 4: a parabola, f = 1, opening up');
  ok(near(K.canonical(par.entity).s0, -2, 1e-9) && near(K.canonical(par.entity).s1, 2, 1e-9), 'spanning from the first to the last of the five points');
  const hyp = K.fromFivePoints([-1, -0.5, 0, 0.5, 1].map((t) => ({ x: 3 * Math.cosh(t), y: 2 * Math.sinh(t) })));
  ok(hyp.ok && hyp.kind === 'hyperbola' && near(K.canonical(hyp.entity).a, 3, 1e-8) && near(K.canonical(hyp.entity).b, 2, 1e-8), 'five points on x² / 9 − y² / 4 = 1: a hyperbola, a = 3, b = 2');
  const circ = K.fromFivePoints([0, 1, 2, 3, 4].map((i) => ({ x: 5 * Math.cos(i * 1.3), y: 5 * Math.sin(i * 1.3) })));
  ok(circ.ok && circ.kind === 'ellipse' && near(circ.entity.ratio, 1, 1e-9) && near(Math.hypot(circ.entity.mx, circ.entity.my), 5, 1e-9), 'five points on a circle: an ellipse with ratio 1 and radius 5');

  // refusals, as codes
  const err = (pts, code, why) => { const r = K.fromFivePoints(pts); ok(!r.ok && r.error === code, 'refused (' + code + '): ' + why, JSON.stringify(r).slice(0, 90)); };
  const five = [-2, -1, 0, 1, 2].map((x) => ({ x, y: x * x / 4 }));
  err(five.slice(0, 4), 'points', 'only four points'); err([...five, { x: 9, y: 9 }], 'points', 'six points'); err(null, 'points', 'nothing');
  err([...five.slice(0, 4), { x: NaN, y: 0 }], 'points', 'a NaN'); err([...five.slice(0, 4), null], 'points', 'a missing point');
  err([...five.slice(0, 4), five[0]], 'degenerate', 'a repeated point');
  err([0, 1, 2, 3, 4].map((i) => ({ x: i, y: 2 * i + 1 })), 'degenerate', 'five collinear points');
  err([0, 1, 2, 3].map((i) => ({ x: i, y: i })).concat([{ x: 5, y: 1 }]), 'degenerate', 'four collinear points and one more');
  err([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 3 }], 'degenerate', 'three collinear: the only conic is a pair of lines');
  err([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }], 'degenerate', 'all the same point');
  err([-2, -1, 1, 2, 3].map((t) => ({ x: (t < 0 ? -1 : 1) * Math.cosh(Math.abs(t) / 2), y: Math.sinh(t / 2) })), 'branches', 'points on both branches of a hyperbola');
  err([-2, -1, 0, 1, 2].map((i) => ({ x: i * 1e13, y: i * i * 1e13 / 4 })), 'range', 'a parabola arc larger than the size limit (1e12)');
  err([-25, -24, 0, 24, 25].map((t) => ({ x: Math.cosh(t), y: Math.sinh(t) })), 'degenerate', 'a hyperbola stretched past |t| = 20 is numerically a pair of lines, so it is refused as degenerate first');
  // order and placement do not matter
  const scrambled = [five[3], five[0], five[4], five[2], five[1]].map((p) => ({ x: p.x + 1e4, y: p.y - 1e4 })), moved = K.fromFivePoints(scrambled);
  ok(moved.ok && moved.kind === 'parabola' && near(K.canonical(moved.entity).f, 1, 1e-6), 'the same five points far from the origin and in any order: the same parabola');
  const tiny = K.fromFivePoints(five.map((p) => ({ x: p.x * 1e-6, y: p.y * 1e-6 })));
  ok(tiny.ok && tiny.kind === 'parabola' && near(K.canonical(tiny.entity).f, 1e-6, 1e-6), 'and at one millionth of the size: f is a millionth');
}

section('The module itself');
{
  const text = fs.readFileSync(path.join(APP, 'conic.js'), 'utf8');
  ok(text.startsWith('/* SPDX-License-Identifier: Apache-2.0 */'), 'starts with the SPDX line');
  const imports = [...text.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
  ok(imports.length === 1 && imports[0] === './spline.js', 'its only import is ./spline.js', JSON.stringify(imports));
  ok(!/\b(document|window|navigator|localStorage|fetch)\b/.test(text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'no DOM, storage or network use outside comments');
  ok(['valid', 'domain', 'pointAt', 'tangentAt', 'ends', 'parabola', 'hyperbola', 'canonical', 'transform', 'spans', 'toSpline', 'splineOf', 'points', 'closest', 'fromFivePoints', 'T_MAX', 'SPAN'].every((n) => n in K), 'it exports what its header lists');
  ok(Object.keys(K).length === 17, 'and nothing else', Object.keys(K).join());
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
