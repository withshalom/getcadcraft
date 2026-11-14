/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * analytic-curve.js — cc-solid (S7, docs/solid/HANDOFF.md § 6.1): lines, circles and ellipses that keep their identity.
 * DOM-free; imports core/, math/, nurbs-curve.js and diffgeo.js.
 *
 * A circle that arrives as a circle stays one: its STEP is CIRCLE, its intersections take the analytic fast path, the
 * auditor can check its radius exactly. Conversion to NURBS is explicit and exact (toNurbs), never a silent approximation.
 * The arcs are The NURBS Book's A7.1 (rational quadratics, at most a quarter turn each), built here on core/trig.js:
 * cc-nurbs' arc and circle use Math.sin and Math.cos, which are not the same bits everywhere (decision D-det (b)).
 *
 * Records (frozen; frames are math/frame.js frames):
 *   { type: 'line', o, d, range: [t0, t1] }                C(t) = o + t d, d a unit vector (t is arc length)
 *   { type: 'circle', frame, r, phase, range: [t0, t1] }   C(t) = o + r cos(t + phase) x + r sin(t + phase) y
 *   { type: 'ellipse', frame, a, b, phase, range }         C(t) = o + a cos(t + phase) x + b sin(t + phase) y
 * (o, x, y the frame's origin and axes; a circle or ellipse runs counter-clockwise about z; phase is 0 unless the curve
 * was reversed, which is how a reversed ellipse keeps its axes.)
 *
 *   line({ o, d, range }) · lineThrough(p, q) (range [0, |q − p|]) · circle({ frame, r, range = [0, 2π], phase = 0 })
 *   ellipse({ frame, a, b, range = [0, 2π], phase = 0 }) · isAnalytic(c) · toData(c) · fromData(d) (decision D-wire)
 *   domain(c) · point(c, t) · derivs(c, t, d) → [C, C', …] (closed forms) · tangent · curvature · curvatureVector · torsion
 *   toNurbs(c) → an exact nurbs-curve record on the same domain. A line keeps its parameter. An arc is cut into equal pieces
 *     of at most a quarter turn, with knots at their angles, so the NURBS curve passes the same points at every break
 *     (in between its parameter is not the angle: no rational parameterisation of a circle is)
 *   reverse(c) → the same curve the other way on the same domain: C'(s) = C(t0 + t1 − s)
 *   transform(c, m) → the same type when m is rigid (mat4.isRigid within tol.ang), else toNurbs(c) transformed (affine
 *     images of NURBS are exact)
 *   bbox(c) → the box of toNurbs(c)'s control points, which holds the curve · isClosed(c, tol) → |C(t0) − C(t1)| ≤ tol.lin
 *   arcNet(t0, t1) → { knots, X: [[cos, sin] …], w } the unit circle's A7.1 net over [t0, t1] (middle points carry 1 / cos(δ/2))
 *
 * Refusals: solid.err.bad_input { name, why }: 'curve' 'not_an_object' | 'not_analytic' | 'unknown_type'; 'o', 'd', 'p', 'q'
 * 'not_a_vector' | 'out_of_range' | 'zero_length' | 'same_point'; 'frame' 'not_a_frame'; 'r', 'a', 'b' 'not_a_number' |
 * 'not_positive' | 'out_of_range'; 'range' 'not_a_range' | 'out_of_range' (an arc longer than one turn, or an angle past
 * 2^20); 'phase' 'not_a_number' | 'out_of_range'; 't' 'not_a_number' | 'out_of_domain'; 'order' 'not_a_count' |
 * 'out_of_range'; 'matrix' 'not_affine'; where C' = 0: { name: 'u', why: 'degenerate' }.
 */
import { fail } from '../core/errors.js';
import { resolveTol } from '../core/tol.js';
import { pow2, EPS } from '../core/float.js';
import { sincos, cos, PI, HALF_PI, TAU } from '../core/trig.js';
import * as V3 from '../math/vec3.js';
import * as M4 from '../math/mat4.js';
import * as F from '../math/frame.js';
import * as CV from './nurbs-curve.js';
import * as DG from './diffgeo.js';

const BAD = 'solid.err.bad_input';
const HI = pow2(500), ANGLE = pow2(20);
const MADE = new WeakSet();
export const TYPES = Object.freeze(['line', 'circle', 'ellipse']);

const isPlain = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isCount = (x) => typeof x === 'number' && Number.isInteger(x) && x >= 0;
const record = (r) => { const x = Object.freeze(r); MADE.add(x); return x; };
export const isAnalytic = (c) => c !== null && typeof c === 'object' && MADE.has(c);

function vec(p, name) {
  if (!V3.isVec3(p)) fail(BAD, { name, why: 'not_a_vector' });
  if (Math.abs(p[0]) > HI || Math.abs(p[1]) > HI || Math.abs(p[2]) > HI) fail(BAD, { name, why: 'out_of_range' });
  return Object.freeze([p[0], p[1], p[2]]);
}
function positive(x, name) {
  if (typeof x !== 'number' || !Number.isFinite(x)) fail(BAD, { name, why: 'not_a_number' });
  if (!(x > 0)) fail(BAD, { name, why: 'not_positive' });
  if (x > HI) fail(BAD, { name, why: 'out_of_range' });
  return x;
}
function frameOf(f) {
  if (!F.isFrame(f)) fail(BAD, { name: 'frame', why: 'not_a_frame' });
  return f;
}
/** [t0, t1] with t0 < t1; for an angle range also t1 − t0 ≤ 2π and |t| ≤ 2^20. */
function rangeOf(rg, angle) {
  if (!Array.isArray(rg) || rg.length !== 2 || !rg.every((x) => typeof x === 'number' && Number.isFinite(x))) fail(BAD, { name: 'range', why: 'not_a_range' });
  const [t0, t1] = rg;
  if (!(t0 < t1)) fail(BAD, { name: 'range', why: 'not_a_range' });
  if (angle && (t1 - t0 > TAU || Math.abs(t0) > ANGLE || Math.abs(t1) > ANGLE)) fail(BAD, { name: 'range', why: 'out_of_range' });
  if (!angle && (Math.abs(t0) > HI || Math.abs(t1) > HI)) fail(BAD, { name: 'range', why: 'out_of_range' });
  return Object.freeze([t0, t1]);
}
function phaseOf(p) {
  if (typeof p !== 'number' || !Number.isFinite(p)) fail(BAD, { name: 'phase', why: 'not_a_number' });
  if (Math.abs(p) > ANGLE) fail(BAD, { name: 'phase', why: 'out_of_range' });
  return p === 0 ? 0 : p;
}

// ---------------------------------------------------------------------------------------------------- constructors

/**
 * A unit direction: d / |d|, or d as it is when |d| is already 1 within 4 ulps. Dividing a unit vector by its own length
 * again can move a last bit, and a direction that comes back from toData must come back the same.
 */
export function unitKept(d, name) {
  const l = V3.len(d);
  if (!(l > 0)) fail(BAD, { name, why: 'zero_length' });
  return Object.freeze(Math.abs(l - 1) <= 4 * EPS ? [d[0], d[1], d[2]] : V3.unit(d));
}

export function line({ o, d, range } = {}) {
  const oo = vec(o, 'o'), dd = vec(d, 'd');
  return record({ type: 'line', o: oo, d: unitKept(dd, 'd'), range: rangeOf(range, false) });
}

export function lineThrough(p, q) {
  const pp = vec(p, 'p'), qq = vec(q, 'q'), L = V3.dist(pp, qq);
  if (!(L > 0)) fail(BAD, { name: 'q', why: 'same_point' });
  return line({ o: pp, d: V3.sub(qq, pp), range: [0, L] });
}

export function circle({ frame, r, range = [0, TAU], phase = 0 } = {}) {
  return record({ type: 'circle', frame: frameOf(frame), r: positive(r, 'r'), phase: phaseOf(phase), range: rangeOf(range, true) });
}

export function ellipse({ frame, a, b, range = [0, TAU], phase = 0 } = {}) {
  return record({ type: 'ellipse', frame: frameOf(frame), a: positive(a, 'a'), b: positive(b, 'b'), phase: phaseOf(phase), range: rangeOf(range, true) });
}

function need(c) {
  if (!isAnalytic(c)) fail(BAD, { name: 'curve', why: 'not_analytic' });
  return c;
}

export function toData(c) {
  need(c);
  if (c.type === 'line') return { type: 'line', o: c.o.slice(), d: c.d.slice(), range: c.range.slice() };
  const base = { type: c.type, frame: F.toData(c.frame), phase: c.phase, range: c.range.slice() };
  return c.type === 'circle' ? { ...base, r: c.r } : { ...base, a: c.a, b: c.b };
}
export function fromData(d, tol) {
  if (!isPlain(d)) fail(BAD, { name: 'curve', why: 'not_an_object' });
  if (d.type === 'line') return line(d);
  if (d.type === 'circle') return circle({ ...d, frame: F.fromData(d.frame, tol) });
  if (d.type === 'ellipse') return ellipse({ ...d, frame: F.fromData(d.frame, tol) });
  return fail(BAD, { name: 'curve', why: 'unknown_type' });
}

// ---------------------------------------------------------------------------------------------------- evaluation

export const domain = (c) => need(c).range.slice();

function param(c, t) {
  if (typeof t !== 'number' || !Number.isFinite(t)) fail(BAD, { name: 't', why: 'not_a_number' });
  if (t < c.range[0] || t > c.range[1]) fail(BAD, { name: 't', why: 'out_of_domain' });
  return t;
}

/** The k-th derivative of (cos, sin) at an angle whose (cos, sin) is (co, si): the turn by k quarter turns, exactly. */
export function cycle(k, co, si) {
  switch (k & 3) {
    case 0: return [co, si];
    case 1: return [-si, co];
    case 2: return [-co, -si];
    default: return [si, -co];
  }
}

/** A circle's or an ellipse's point or derivative from the cycled (cos, sin) pair. */
function conic(c, k, co, si) {
  const f = c.frame, A = c.type === 'circle' ? c.r : c.a, Bv = c.type === 'circle' ? c.r : c.b, [p, q] = cycle(k, co, si);
  const v = V3.madd(V3.scale(f.x, A * p), Bv * q, f.y);
  return k === 0 ? V3.add(f.o, v) : v;
}

export function point(c, t) {
  need(c);
  param(c, t);
  if (c.type === 'line') return DG.finite(V3.madd(c.o, t, c.d), 'point');
  const [si, co] = sincos(t + c.phase);
  return DG.finite(conic(c, 0, co, si), 'point');
}

export function derivs(c, t, d = 2) {
  need(c);
  param(c, t);
  if (!isCount(d)) fail(BAD, { name: 'order', why: 'not_a_count' });
  if (d > 32) fail(BAD, { name: 'order', why: 'out_of_range' });
  const out = [];
  if (c.type === 'line') {
    for (let k = 0; k <= d; k++) out.push(k === 0 ? V3.madd(c.o, t, c.d) : k === 1 ? c.d.slice() : [0, 0, 0]);
  } else {
    const [si, co] = sincos(t + c.phase);
    for (let k = 0; k <= d; k++) out.push(conic(c, k, co, si));
  }
  for (const v of out) DG.finite(v, 'derivs');
  return out;
}

export const tangent = (c, t) => DG.tangent(derivs(c, t, 1));
export const curvature = (c, t) => DG.curvature(derivs(c, t, 2));
export const curvatureVector = (c, t) => DG.curvatureVector(derivs(c, t, 2));
export const torsion = (c, t) => DG.torsion(derivs(c, t, 3));

export function isClosed(c, tol) {
  need(c);
  return V3.dist(point(c, c.range[0]), point(c, c.range[1])) <= resolveTol(tol).lin;
}

// ---------------------------------------------------------------------------------------------------- conversions

export function arcNet(t0, t1) {
  const span = t1 - t0, n = span <= HALF_PI ? 1 : span <= PI ? 2 : span <= 1.5 * PI ? 3 : 4, dt = span / n;
  const w1 = cos(dt / 2), knots = [t0, t0, t0], X = [], w = [];
  const at = (k) => (k === n ? t1 : t0 + k * dt);
  for (let k = 0; k < n; k++) {
    const a = at(k), [sa, ca] = sincos(a), [sm, cm] = sincos(a + dt / 2);
    X.push([ca, sa], [cm / w1, sm / w1]);
    w.push(1, w1);
    if (k > 0) knots.push(a, a);
  }
  const [se, ce] = sincos(t1);
  X.push([ce, se]);
  w.push(1);
  knots.push(t1, t1, t1);
  return { knots, X, w };
}

export function toNurbs(c) {
  need(c);
  const [t0, t1] = c.range;
  if (c.type === 'line') return CV.make({ deg: 1, knots: [t0, t0, t1, t1], cvs: [point(c, t0), point(c, t1)] });
  // the net in the curve's own angle (t + phase), knots back in t
  const net = arcNet(t0 + c.phase, t1 + c.phase), f = c.frame, A = c.type === 'circle' ? c.r : c.a, Bv = c.type === 'circle' ? c.r : c.b;
  const knots = net.knots.map((x, i) => (i <= 2 ? t0 : i >= net.knots.length - 3 ? t1 : x - c.phase));
  const cvs = net.X.map(([p, q]) => V3.add(f.o, V3.madd(V3.scale(f.x, A * p), Bv * q, f.y)));
  return CV.make({ deg: 2, knots, cvs, w: net.w });
}

export function reverse(c) {
  need(c);
  const [t0, t1] = c.range, T = t0 + t1;
  if (c.type === 'line') return line({ o: V3.madd(c.o, T, c.d), d: V3.scale(c.d, -1), range: [t0, t1] });
  // C'(s) = C(T − s): cos(T − s + φ) = cos(s − T − φ) and sin(T − s + φ) = −sin(s − T − φ): the frame (x, −y, −z), phase −T − φ
  const f = c.frame, nf = F.fromData({ o: f.o.slice(), x: f.x.slice(), y: V3.scale(f.y, -1), z: V3.scale(f.z, -1) });
  const base = { frame: nf, range: [t0, t1], phase: -T - c.phase };
  return c.type === 'circle' ? circle({ ...base, r: c.r }) : ellipse({ ...base, a: c.a, b: c.b });
}

export function transform(c, m, tol) {
  need(c);
  if (!M4.isAffine(m)) fail(BAD, { name: 'matrix', why: 'not_affine' });
  if (!M4.isRigid(m, tol)) return CV.transform(toNurbs(c), m);
  if (c.type === 'line') return line({ o: M4.apply(m, c.o), d: M4.applyDir(m, c.d), range: c.range.slice() });
  const f = c.frame, nf = F.frameFromZX(M4.apply(m, f.o), M4.applyDir(m, f.z), M4.applyDir(m, f.x), tol);
  const base = { frame: nf, range: c.range.slice(), phase: c.phase };
  return c.type === 'circle' ? circle({ ...base, r: c.r }) : ellipse({ ...base, a: c.a, b: c.b });
}

export const bbox = (c) => CV.bbox(toNurbs(c));
