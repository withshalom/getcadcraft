/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * nurbs-curve.js — cc-solid (S5, docs/solid/HANDOFF.md § 6.1, § 6.3, M1): NURBS curves as checked, frozen records.
 * DOM-free; imports core/, math/, basis.js and the exact functions of cc-nurbs' curve.js.
 *
 * The algorithms are cc-nurbs' (decision D8), The NURBS Book (Piegl & Tiller, 2nd ed.): evaluation A4.1, derivatives A3.2
 * with A4.2, knot insertion A5.1, removal A5.8, Bézier decomposition § 5.3, degree elevation § 5.5 and reduction § 5.6.
 * They use only + − × ÷ and √, so every result is the same bits in every host (decision D-det (b): cc-nurbs' arc and circle
 * are not used; the boundary checker's reach rule keeps them out). What this file adds is what a kernel needs around them:
 *   - a curve is a frozen record made here and only here (isCurve), checked once: degree, knots, points and weights;
 *   - a parameter outside the domain is refused (cc-nurbs clamps it silently);
 *   - knots are compared exactly. cc-nurbs reads two knots closer than KTOL · (b − a) as one knot, so a curve whose distinct
 *     knots come that close is refused ('near_knots'), and a parameter given that close to a knot means that knot: the
 *     two readings then always agree;
 *   - degree elevation removes the knots it had to add only while the curve stays put to rounding (cc-nurbs allows a
 *     relative 1e-10), so elevation reproduces the curve;
 *   - degree reduction is accepted only when deviation() proves the result within tol.fit (cc-nurbs' own estimate does
 *     not count the knots removed afterwards);
 *   - curvature and torsion are scaled so that they neither overflow nor underflow, and a zero first derivative is a
 *     refusal, not a curvature of 0.
 *
 * A curve record: { type: 'nurbs', deg, knots, cvs, w } — cc-nurbs' plain data, frozen all the way down, so it passes to
 * cc-nurbs (and to its STEP and IGES writers) as it is. Clamped knots only; w is null for a polynomial curve (all weights 1).
 *
 *   LIMITS                         { degree: 15, knots: 65536, order: 32, coordinate: 2^500, weight: [2^-500, 2^500] }
 *   make(data) → curve             checks { deg, knots, cvs: [[x, y, z]], w } and returns the frozen record (fromData too)
 *   isCurve(c) · toData(c) → plain, JSON-safe data (decision D-wire) · fromData(d) → curve (every check again)
 *   domain(c) → [a, b] · isRational(c) · bbox(c) → { min, max } (the control points' box, which holds the curve)
 *   point(c, u) · derivs(c, u, d) → [C, C', …, C^(d)] (d ≤ 32; above the degree of a polynomial curve, zero)
 *   tangent(c, u) → unit C' · curvature(c, u) · curvatureVector(c, u) (κ N) · torsion(c, u) (0 where C' × C'' = 0)
 *   isClosed(c, tol) → |C(a) − C(b)| ≤ tol.lin
 *   insertKnot(c, u, r = 1) · refine(c, [u …]) · removeKnot(c, u, { num = 1, tol }) → { curve, removed } (moves ≤ tol.lin)
 *   decompose(c) → [Bézier curves, one per non-empty span] · elevate(c, t = 1) · reduce(c, tol) → { curve, error }
 *   split(c, u) → [left, right] · segment(c, a, b) · reverse(c) (same domain) · reparam(c, a, b) · transform(c, m)
 *   join([curves], tol) → { curve, gap }   end to start, C0, each next curve turned round when needed; gap ≤ tol.lin
 *   deviation(c1, c2) → e                  for polynomial curves on the same domain: max |c1(u) − c2(u)| ≤ e (to rounding).
 *                                          Both are raised to one degree and refined to one knot vector; e is then the
 *                                          largest distance between matching control points (the difference is a B-spline
 *                                          with those points, and B-spline values are convex combinations of them).
 *
 * Refusals: solid.err.bad_input { name, why }:
 *   'curve'   'not_an_object' | 'not_a_curve' | 'rational' (deviation, reduce: polynomial curves only)
 *   'degree'  'not_a_count'          'cvs' 'not_an_array' | 'too_few' | 'not_a_point' | 'out_of_range'
 *   'knots'   what basis.knots refuses, and 'count' | 'not_clamped' | 'multiplicity' (an interior knot more than deg times)
 *             | 'near_knots'
 *   'weights' 'count' | 'not_a_number' | 'not_positive' | 'out_of_range'
 *   'u' (or 'a', 'b')  'not_a_number' | 'out_of_domain' | 'not_interior' | 'not_a_knot' | 'degenerate' (C' = 0 there)
 *   'order', 'r', 'num', 't'  'not_a_count' | 'out_of_range';   'r' also 'multiplicity' (more than deg copies)
 *   'matrix'  'not_affine'           'curves' 'not_an_array' | 'empty' | 'gap' (with index) | 'domain' | 'near_knots'
 *   any answer that does not fit in doubles: { name, why: 'overflow' }
 * solid.err.limit { what: 'degree' | 'knots', limit, used } · solid.err.not_within_tolerance { what: 'reduce', tol, error? }
 */
import { fail } from '../core/errors.js';
import { resolveTol } from '../core/tol.js';
import { pow2, exponent, scalb } from '../core/float.js';
import * as V3 from '../math/vec3.js';
import { isAffine } from '../math/mat4.js';
import * as B from './basis.js';
import { KTOL } from '../../nurbs/basis.js';
import * as NC from '../../nurbs/curve.js';

const HI = pow2(500), WLO = pow2(-500);
export const LIMITS = Object.freeze({ degree: B.LIMITS.degree, knots: B.LIMITS.knots, order: B.LIMITS.order, coordinate: HI, weight: Object.freeze([WLO, HI]) });
const BAD = 'solid.err.bad_input';
const REMOVE_REL = pow2(-40);        // elevate: a knot added by elevation is removed when the curve moves less than this × size
const MADE = new WeakSet();
const KN = new WeakMap();            // curve → its knot record (basis.knots)

const isPlain = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isList = (U) => Array.isArray(U) || (ArrayBuffer.isView(U) && !(U instanceof DataView));
const isCount = (x) => typeof x === 'number' && Number.isInteger(x) && x >= 0;

// ---------------------------------------------------------------------------------------------------- the record

export function make(data) {
  if (!isPlain(data)) fail(BAD, { name: 'curve', why: 'not_an_object' });
  const p = data.deg;
  if (!Number.isInteger(p) || p < 1) fail(BAD, { name: 'degree', why: 'not_a_count' });
  if (p > LIMITS.degree) fail('solid.err.limit', { what: 'degree', limit: LIMITS.degree, used: p });
  const P = data.cvs;
  if (!Array.isArray(P)) fail(BAD, { name: 'cvs', why: 'not_an_array' });
  if (P.length < p + 1) fail(BAD, { name: 'cvs', why: 'too_few' });
  if (P.length + p + 1 > LIMITS.knots) fail('solid.err.limit', { what: 'knots', limit: LIMITS.knots, used: P.length + p + 1 });
  if (isList(data.knots) && data.knots.length !== P.length + p + 1) fail(BAD, { name: 'knots', why: 'count' });
  const K = B.knots(data.knots, p);
  if (!K.clamped) fail(BAD, { name: 'knots', why: 'not_clamped' });
  const D = K.distinct, near = 2 * KTOL * (K.b - K.a);
  for (let i = 1; i + 1 < D.length; i++) if (D[i].m > p) fail(BAD, { name: 'knots', why: 'multiplicity' });
  for (let i = 1; i < D.length; i++) if (D[i].u - D[i - 1].u <= near) fail(BAD, { name: 'knots', why: 'near_knots' });

  const cvs = new Array(P.length);
  for (let i = 0; i < P.length; i++) {
    const q = P[i];
    if (!V3.isVec3(q)) fail(BAD, { name: 'cvs', why: 'not_a_point' });
    if (Math.abs(q[0]) > HI || Math.abs(q[1]) > HI || Math.abs(q[2]) > HI) fail(BAD, { name: 'cvs', why: 'out_of_range' });
    cvs[i] = Object.freeze([q[0], q[1], q[2]]);
  }
  let w = null;
  if (data.w !== undefined && data.w !== null) {
    const W = data.w;
    if (!isList(W) || W.length !== P.length) fail(BAD, { name: 'weights', why: 'count' });
    let ones = true;
    for (let i = 0; i < W.length; i++) {
      const v = W[i];
      if (typeof v !== 'number' || !Number.isFinite(v)) fail(BAD, { name: 'weights', why: 'not_a_number' });
      if (!(v > 0)) fail(BAD, { name: 'weights', why: 'not_positive' });
      if (v < WLO || v > HI) fail(BAD, { name: 'weights', why: 'out_of_range' });
      if (v !== 1) ones = false;
    }
    if (!ones) w = Object.freeze(Array.from(W));
  }
  const c = Object.freeze({ type: 'nurbs', deg: p, knots: K.U, cvs: Object.freeze(cvs), w });
  MADE.add(c);
  KN.set(c, K);
  return c;
}

export const isCurve = (c) => c !== null && typeof c === 'object' && MADE.has(c);
export const fromData = (d) => make(d);
export function toData(c) {
  need(c);
  return { deg: c.deg, knots: c.knots.slice(), cvs: c.cvs.map((q) => q.slice()), w: c.w ? c.w.slice() : null };
}

function need(c, name = 'curve') {
  if (!isCurve(c)) fail(BAD, { name, why: 'not_a_curve' });
  return KN.get(c);
}

/** u checked: a finite number inside [a, b]. */
function param(K, u, name = 'u') {
  if (typeof u !== 'number' || !Number.isFinite(u)) fail(BAD, { name, why: 'not_a_number' });
  if (u < K.a || u > K.b) fail(BAD, { name, why: 'out_of_domain' });
  return u;
}

/** The knot that u means: an existing knot within 2 · KTOL · (b − a) of u, else u itself. */
function snap(K, u) {
  const near = 2 * KTOL * (K.b - K.a);
  let best = u, gap = Infinity;
  for (const k of K.distinct) { const d = Math.abs(k.u - u); if (d <= near && d < gap) { best = k.u; gap = d; } }
  return best;
}
const multiplicity = (K, u) => { for (const k of K.distinct) if (k.u === u) return k.m; return 0; };

function interior(K, u, name = 'u') {
  param(K, u, name);
  const s = snap(K, u);
  if (!(s > K.a && s < K.b)) fail(BAD, { name, why: 'not_interior' });
  return s;
}

function finite(v, name) {
  for (const x of v) if (!Number.isFinite(x)) fail(BAD, { name, why: 'overflow' });
  return v;
}

// ---------------------------------------------------------------------------------------------------- queries

export function domain(c) { const K = need(c); return [K.a, K.b]; }
export const isRational = (c) => { need(c); return c.w !== null; };

export function bbox(c) {
  need(c);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const q of c.cvs) for (let i = 0; i < 3; i++) { if (q[i] < min[i]) min[i] = q[i]; if (q[i] > max[i]) max[i] = q[i]; }
  return Object.freeze({ min: Object.freeze(min), max: Object.freeze(max) });
}

export function point(c, u) {
  const K = need(c);
  param(K, u);
  return finite(NC.point(c, u), 'point');
}

export function derivs(c, u, d = 2) {
  const K = need(c);
  param(K, u);
  if (!isCount(d)) fail(BAD, { name: 'order', why: 'not_a_count' });
  if (d > LIMITS.order) fail(BAD, { name: 'order', why: 'out_of_range' });
  // A polynomial curve: C^(k) = Σ N^(k) P directly (A3.2 on cc-nurbs' A2.3), so rows above the degree are exactly 0.
  // cc-nurbs' derivs runs the rational quotient (A4.2) for every curve, and its weight derivatives, 0 in exact arithmetic,
  // leave rounding noise in those rows.
  const D = c.w === null ? polyDerivs(K, c.cvs, u, d) : NC.derivs(c, u, d);
  for (const v of D) finite(v, 'derivs');
  return D;
}

function polyDerivs(K, cvs, u, d) {
  const p = K.p, i = B.findSpan(K.n, p, u, K.U), top = d < p ? d : p, N = B.dersBasisFuns(i, u, p, top, K.U), out = [];
  for (let k = 0; k <= d; k++) {
    if (k > top) { out.push([0, 0, 0]); continue; }
    let x = 0, y = 0, z = 0;
    for (let j = 0; j <= p; j++) { const q = cvs[i - p + j], f = N[k][j]; x += f * q[0]; y += f * q[1]; z += f * q[2]; }
    out.push([x, y, z]);
  }
  return out;
}

/** C' brought by an exact power of two to a largest component in [1, 2): C' = t · 2^k. Refuses C' = 0. */
function scaled(d1) {
  const m = Math.max(Math.abs(d1[0]), Math.abs(d1[1]), Math.abs(d1[2]));
  if (m === 0) fail(BAD, { name: 'u', why: 'degenerate' });
  const k = exponent(m);
  return { t: [scalb(d1[0], -k), scalb(d1[1], -k), scalb(d1[2], -k)], k };
}

export function tangent(c, u) {
  const d1 = derivs(c, u, 1)[1];
  return V3.unit(scaled(d1).t);
}

export function curvature(c, u) {
  const [, d1, d2] = derivs(c, u, 2);
  const { t, k } = scaled(d1), l = V3.len(t);
  // |C' × C''| / |C'|³ = |t × C''| / (2^(2k) · |t|³): every factor stays finite, the power of two is applied last
  const x = V3.len(V3.cross(t, d2)) / (l * l * l);
  return finite([scalb(x, -2 * k)], 'curvature')[0];
}

export function curvatureVector(c, u) {
  const [, d1, d2] = derivs(c, u, 2);
  const { t, k } = scaled(d1), T = V3.unit(t), l = V3.len(t);
  // κN = (C'' − (C''·T) T) / |C'|² = (C'' − (C''·T) T) / (|t|² · 2^(2k))
  const n = V3.scale(V3.madd(d2, -V3.dot(d2, T), T), 1 / (l * l));
  return finite(n.map((x) => scalb(x, -2 * k)), 'curvatureVector');
}

export function torsion(c, u) {
  const [, d1, d2, d3] = derivs(c, u, 3);
  const { t, k } = scaled(d1);
  // (C' × C'') · C''' / |C' × C''|² = (t × C'') · C''' / (2^k · |t × C''|²)
  const x = V3.cross(t, d2), q = V3.len(x);
  if (q === 0) return 0;
  const xs = V3.scale(x, 1 / q);
  return finite([scalb(V3.dot(xs, d3) / q, -k)], 'torsion')[0];
}

export function isClosed(c, tol) {
  const K = need(c), T = resolveTol(tol);
  return V3.dist(NC.point(c, K.a), NC.point(c, K.b)) <= T.lin;
}

// ---------------------------------------------------------------------------------------------------- knots

export function insertKnot(c, u, r = 1) {
  const K = need(c);
  if (!isCount(r)) fail(BAD, { name: 'r', why: 'not_a_count' });
  const s = interior(K, u);
  if (r === 0) return c;
  if (multiplicity(K, s) + r > c.deg) fail(BAD, { name: 'r', why: 'multiplicity' });
  return make(NC.insertKnot(c, s, r));
}

export function refine(c, X) {
  need(c);
  if (!isList(X)) fail(BAD, { name: 'knots', why: 'not_an_array' });
  if (X.length > LIMITS.knots) fail('solid.err.limit', { what: 'knots', limit: LIMITS.knots, used: X.length });
  let out = c;
  for (const u of X) out = insertKnot(out, u, 1);
  return out;
}

export function removeKnot(c, u, { num = 1, tol } = {}) {
  const K = need(c), T = resolveTol(tol);
  if (!isCount(num) || num < 1) fail(BAD, { name: 'num', why: 'not_a_count' });
  const s = interior(K, u);
  const m = multiplicity(K, s);
  if (m === 0) fail(BAD, { name: 'u', why: 'not_a_knot' });
  const r = NC.removeKnot(c, s, Math.min(num, m), T.lin);
  return Object.freeze({ curve: r.removed ? make(r.curve) : c, removed: r.removed });
}

export function decompose(c) {
  need(c);
  return Object.freeze(NC.decompose(c).map(make));
}

function size(c) {
  const b = bbox(c), d = V3.dist(b.min, b.max);
  return d > 0 ? d : Math.max(Math.abs(b.min[0]), Math.abs(b.min[1]), Math.abs(b.min[2]), 1);
}

export function elevate(c, t = 1) {
  const K = need(c);
  if (!isCount(t)) fail(BAD, { name: 't', why: 'not_a_count' });
  if (t === 0) return c;
  if (c.deg + t > LIMITS.degree) fail('solid.err.limit', { what: 'degree', limit: LIMITS.degree, used: c.deg + t });
  let out = NC.elevate(c, t, { removeKnots: false });
  const tol = REMOVE_REL * size(c);
  for (const k of K.distinct.slice(1, -1)) out = NC.removeKnot(out, k.u, c.deg - k.m, tol).curve;
  return make(out);
}

export function reduce(c, tol) {
  need(c);
  const T = resolveTol(tol);
  if (c.w !== null) fail(BAD, { name: 'curve', why: 'rational' });
  if (c.deg < 2) fail(BAD, { name: 'degree', why: 'out_of_range' });
  const r = NC.reduce(c, T.fit);
  if (!r) fail('solid.err.not_within_tolerance', { what: 'reduce', tol: T.fit });
  const out = make(r.curve), e = deviation(c, out);
  if (!(e <= T.fit)) fail('solid.err.not_within_tolerance', { what: 'reduce', tol: T.fit, error: e });
  return Object.freeze({ curve: out, error: e });
}

// ---------------------------------------------------------------------------------------------------- pieces

export function split(c, u) {
  const K = need(c);
  const s = interior(K, u);
  return Object.freeze(NC.split(c, s).map(make));
}

export function segment(c, a, b) {
  const K = need(c);
  param(K, a, 'a');
  param(K, b, 'b');
  const sa = snap(K, a), sb = snap(K, b);
  if (!(sa < sb)) fail(BAD, { name: 'b', why: 'out_of_domain' });
  let out = c;
  if (sb < K.b) out = split(out, sb)[0];
  if (sa > K.a) out = split(out, sa)[1];
  return out;
}

export function reverse(c) {
  const K = need(c), r = NC.reverse(c), U = r.knots, a = K.a, b = K.b, p = c.deg, m = U.length - 1;
  // knots a + b − x, with the ends set to a and b exactly (a + b − b is not always a in doubles)
  for (let i = 0; i <= m; i++) { const x = a + (b - c.knots[m - i]); U[i] = x < a ? a : x > b ? b : x; }
  for (let i = 0; i <= p; i++) { U[i] = a; U[m - i] = b; }
  return make(r);
}

export function reparam(c, a = 0, b = 1) {
  need(c);
  for (const [name, x] of [['a', a], ['b', b]]) {
    if (typeof x !== 'number' || !Number.isFinite(x)) fail(BAD, { name, why: 'not_a_number' });
  }
  if (!(a < b)) fail(BAD, { name: 'b', why: 'out_of_domain' });
  return make(NC.reparam(c, a, b));
}

export function transform(c, m) {
  need(c);
  if (!isAffine(m)) fail(BAD, { name: 'matrix', why: 'not_affine' });
  return make(NC.transform(c, m));
}

export function join(curves, tol) {
  const T = resolveTol(tol);
  if (!Array.isArray(curves)) fail(BAD, { name: 'curves', why: 'not_an_array' });
  if (curves.length === 0) fail(BAD, { name: 'curves', why: 'empty' });
  curves.forEach((c) => need(c));
  if (curves.length === 1) return Object.freeze({ curve: curves[0], gap: 0 });
  let r;
  try { r = NC.join(curves, T.lin); } catch (e) {
    if (e && e.code === 'nurbs.err.join_gap') fail(BAD, { name: 'curves', why: 'gap', index: e.vars && e.vars.index });
    throw e;
  }
  const out = make(r);
  // the largest gap that was closed: between consecutive ends, whichever way round they were joined
  let gap = 0;
  const ends = curves.map((c) => { const K = KN.get(c); return [NC.point(c, K.a), NC.point(c, K.b)]; });
  for (let i = 1; i < ends.length; i++) {
    const [p0, p1] = ends[i - 1], [q0, q1] = ends[i];
    gap = Math.max(gap, Math.min(V3.dist(p1, q0), V3.dist(p1, q1), V3.dist(p0, q0), V3.dist(p0, q1)));
  }
  return Object.freeze({ curve: out, gap });
}

// ---------------------------------------------------------------------------------------------------- deviation

/** c refined so that it has at least the multiplicities in `want` ([{ u, m }]); the knot values are copied exactly. */
function refineTo(c, want) {
  let out = c;
  for (const k of want) {
    const K = KN.get(out);
    if (!(k.u > K.a && k.u < K.b)) continue;
    const have = multiplicity(K, k.u);
    if (have < k.m) {
      if (snap(K, k.u) !== k.u) fail(BAD, { name: 'curves', why: 'near_knots' });
      out = make(NC.insertKnot(out, k.u, k.m - have));
    }
  }
  return out;
}

export function deviation(c1, c2) {
  const K1 = need(c1), K2 = need(c2);
  if (c1.w !== null || c2.w !== null) fail(BAD, { name: 'curve', why: 'rational' });
  if (K1.a !== K2.a || K1.b !== K2.b) fail(BAD, { name: 'curves', why: 'domain' });
  const p = Math.max(c1.deg, c2.deg);
  let e1 = elevate(c1, p - c1.deg), e2 = elevate(c2, p - c2.deg);
  const merged = new Map();
  for (const K of [KN.get(e1), KN.get(e2)]) for (const k of K.distinct) merged.set(k.u, Math.max(merged.get(k.u) || 0, k.m));
  const want = [...merged.entries()].sort((x, y) => x[0] - y[0]).map(([u, m]) => ({ u, m }));
  e1 = refineTo(e1, want);
  e2 = refineTo(e2, want);
  const U1 = e1.knots, U2 = e2.knots;
  if (U1.length !== U2.length || U1.some((x, i) => x !== U2[i])) fail(BAD, { name: 'curves', why: 'near_knots' });
  let e = 0;
  for (let i = 0; i < e1.cvs.length; i++) e = Math.max(e, V3.dist(e1.cvs[i], e2.cvs[i]));
  return e;
}
