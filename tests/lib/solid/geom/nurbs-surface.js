/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * nurbs-surface.js — cc-solid (S6, docs/solid/HANDOFF.md § 6.2, § 6.3, M1): tensor-product NURBS surfaces as checked,
 * frozen records. DOM-free; imports core/, math/, basis.js, nurbs-curve.js and the exact functions of cc-nurbs' surface.js
 * and curve.js.
 *
 * The algorithms are The NURBS Book's (Piegl & Tiller, 2nd ed.): evaluation A4.3; derivatives A3.6 (polynomial, computed
 * here on cc-nurbs' A2.3 so the rows above a degree are exactly 0) and A4.4 (rational, cc-nurbs' derivs); a surface operation
 * in one direction is the curve operation on every row of the net with the same knots (§ 5.2, § 5.5), done by cc-nurbs'
 * insertKnot, split and elevate; iso-curves blend rows of the net by the other direction's basis (§ 3.4, § 4.5). Every one
 * of them uses only + − × ÷ and √ (decision D-det (b): all of cc-nurbs' surface.js passes the reach rule). What this file adds:
 *   - one check, then trust: degrees, both knot vectors (clamped, interior multiplicity ≤ deg, no two knots that cc-nurbs'
 *     KTOL would merge), a rectangular net of points and weights, limits;
 *   - parameters outside the domain are refused, not clamped; a parameter within KTOL of a knot means that knot;
 *   - elevation keeps every row on one knot vector: the knots elevation adds are removed only as far as every row allows,
 *     and only while each row moves less than 2^-40 of the surface's size;
 *   - the normal is Su × Sv, made unit after scaling by powers of two. On an edge of the domain that has collapsed to a point
 *     (a pole: there |Su| · (b − a), or |Sv| · (d − c), the reach of that partial across the domain, is within tol.lin), it is
 *     the limit from inside the domain, Suv × Sv or Su × Suv, with the sign of the inside. Anywhere else a vanishing or
 *     parallel pair of partials is refused ('degenerate'); cc-nurbs returns a guess ([0, 0, 1]) when its limits fail;
 *   - curvature from the first and second fundamental forms in an orthonormal frame of the tangent plane, where the
 *     principal curvatures are the eigenvalues of a symmetric 2 × 2 matrix: (a + c)/2 ± √(((a − c)/2)² + b²). No H² − K
 *     cancellation, so near an umbilic they keep their digits. Refused where the normal is degenerate (at a pole the
 *     curvature needs a limit this file does not take);
 *   - deviation(s1, s2): a proved bound between polynomial surfaces on one domain, as nurbs-curve.js' deviation.
 *
 * A surface record: { type: 'nurbs', degU, degV, knotsU, knotsV, cvs, w } — cc-nurbs' plain data, frozen all the way down
 * (cvs[i][j] = [x, y, z], i along u, j along v; w[i][j] or null for a polynomial surface).
 *
 *   LIMITS                         { degree: 15, knots: 65536, order: 32, points: 2^20, coordinate: 2^500, weight }
 *   make(data) → surface           (fromData too) · isSurface(s) · toData(s) → plain data (decision D-wire)
 *   domainU(s) · domainV(s) → [a, b] · isRational(s) · bbox(s) → { min, max } (the net's box, which holds the surface)
 *   point(s, u, v) · derivs(s, u, v, d) → SKL[k][l] = ∂^(k+l)S / ∂u^k ∂v^l, k + l ≤ d (d ≤ 32)
 *   normal(s, u, v, tol) → unit normal (the limit at a pole) · curvature(s, u, v) → { K, H, k1, k2, d1, d2 } (k1 ≥ k2,
 *     principal directions in 3-D, signed against normal) · normalCurvature(s, u, v, t) (t a 3-D direction, projected
 *     onto the tangent plane)
 *   isoCurve(s, dir, t) → curve (dir 'u': u = t, a curve in v; 'v': v = t, a curve in u) · edgeCurve(s, 'u0' | 'u1' | 'v0' | 'v1')
 *   insertKnot(s, dir, t, r = 1) · refine(s, dir, [t …]) · elevate(s, dir, t = 1) · split(s, dir, t) → [first, second]
 *   reverse(s, dir) (same domain) · swap(s) (u and v exchanged) · reparam(s, [a, b], [c, d]) · transform(s, m)
 *   deviation(s1, s2) → e: max |s1(u, v) − s2(u, v)| ≤ e for polynomial surfaces on the same domain
 *
 * Refusals: solid.err.bad_input { name, why }:
 *   'surface' 'not_an_object' | 'not_a_surface' | 'rational' (deviation)       'degU', 'degV' 'not_a_count'
 *   'cvs'     'not_an_array' | 'too_few' | 'not_a_grid' | 'not_a_point' | 'out_of_range'
 *   'knotsU', 'knotsV'  what basis.knots refuses, and 'count' | 'not_clamped' | 'multiplicity' | 'near_knots'
 *   'weights' 'count' | 'not_a_grid' | 'not_a_number' | 'not_positive' | 'out_of_range'
 *   'u', 'v' (or 't')   'not_a_number' | 'out_of_domain' | 'not_interior'      'dir' 'not_a_direction'   'edge' 'not_an_edge'
 *   'uv'      'degenerate' (no normal there: Su and Sv parallel or zero inside the domain, or at a corner where both vanish)
 *   'direction' 'not_a_vector' | 'not_tangent'        'order', 'r', 't' 'not_a_count' | 'out_of_range'; 'r' 'multiplicity'
 *   'matrix' 'not_affine'      'surfaces' 'domain' | 'near_knots'      any answer that does not fit in doubles: 'overflow'
 * solid.err.limit { what: 'degree' | 'knots' | 'points', limit, used }
 */
import { fail, isSolidError } from '../core/errors.js';
import { resolveTol } from '../core/tol.js';
import { pow2, exponent, scalb } from '../core/float.js';
import * as V3 from '../math/vec3.js';
import { isAffine } from '../math/mat4.js';
import * as B from './basis.js';
import * as CV from './nurbs-curve.js';
import { KTOL } from '../../nurbs/basis.js';
import * as NC from '../../nurbs/curve.js';
import * as NS from '../../nurbs/surface.js';

const HI = pow2(500), WLO = pow2(-500);
export const LIMITS = Object.freeze({ degree: B.LIMITS.degree, knots: B.LIMITS.knots, order: B.LIMITS.order, points: 1048576, coordinate: HI, weight: Object.freeze([WLO, HI]) });
const BAD = 'solid.err.bad_input';
const REMOVE_REL = pow2(-40);
const MADE = new WeakSet();
const KN = new WeakMap();            // surface → { KU, KV }

const isPlain = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isList = (U) => Array.isArray(U) || (ArrayBuffer.isView(U) && !(U instanceof DataView));
const isCount = (x) => typeof x === 'number' && Number.isInteger(x) && x >= 0;

// ---------------------------------------------------------------------------------------------------- the record

function degree(p, name) {
  if (!Number.isInteger(p) || p < 1) fail(BAD, { name, why: 'not_a_count' });
  if (p > LIMITS.degree) fail('solid.err.limit', { what: 'degree', limit: LIMITS.degree, used: p });
}

/** basis.knots with the direction's name, and the curve rules: clamped, interior multiplicity ≤ p, no near knots. */
function knotsFor(U, p, count, name) {
  if (isList(U) && U.length !== count + p + 1) fail(BAD, { name, why: 'count' });
  let K;
  try { K = B.knots(U, p); } catch (e) {
    if (isSolidError(e) && e.code === BAD) fail(BAD, { ...e.vars, name });
    throw e;
  }
  if (!K.clamped) fail(BAD, { name, why: 'not_clamped' });
  const D = K.distinct, near = 2 * KTOL * (K.b - K.a);
  for (let i = 1; i + 1 < D.length; i++) if (D[i].m > p) fail(BAD, { name, why: 'multiplicity' });
  for (let i = 1; i < D.length; i++) if (D[i].u - D[i - 1].u <= near) fail(BAD, { name, why: 'near_knots' });
  return K;
}

export function make(data) {
  if (!isPlain(data)) fail(BAD, { name: 'surface', why: 'not_an_object' });
  const pu = data.degU, pv = data.degV;
  degree(pu, 'degU');
  degree(pv, 'degV');
  const P = data.cvs;
  if (!Array.isArray(P)) fail(BAD, { name: 'cvs', why: 'not_an_array' });
  if (P.length < pu + 1) fail(BAD, { name: 'cvs', why: 'too_few' });
  if (!Array.isArray(P[0])) fail(BAD, { name: 'cvs', why: 'not_a_grid' });
  const nv = P[0].length;
  if (nv < pv + 1) fail(BAD, { name: 'cvs', why: 'too_few' });
  if (P.length * nv > LIMITS.points) fail('solid.err.limit', { what: 'points', limit: LIMITS.points, used: P.length * nv });
  for (const row of P) if (!Array.isArray(row) || row.length !== nv) fail(BAD, { name: 'cvs', why: 'not_a_grid' });
  const KU = knotsFor(data.knotsU, pu, P.length, 'knotsU'), KV = knotsFor(data.knotsV, pv, nv, 'knotsV');

  const cvs = P.map((row) => Object.freeze(row.map((q) => {
    if (!V3.isVec3(q)) fail(BAD, { name: 'cvs', why: 'not_a_point' });
    if (Math.abs(q[0]) > HI || Math.abs(q[1]) > HI || Math.abs(q[2]) > HI) fail(BAD, { name: 'cvs', why: 'out_of_range' });
    return Object.freeze([q[0], q[1], q[2]]);
  })));
  let w = null;
  if (data.w !== undefined && data.w !== null) {
    const W = data.w;
    if (!Array.isArray(W) || W.length !== P.length) fail(BAD, { name: 'weights', why: 'count' });
    let ones = true;
    const rows = W.map((row) => {
      if (!isList(row) || row.length !== nv) fail(BAD, { name: 'weights', why: 'not_a_grid' });
      return Object.freeze(Array.from(row, (v) => {
        if (typeof v !== 'number' || !Number.isFinite(v)) fail(BAD, { name: 'weights', why: 'not_a_number' });
        if (!(v > 0)) fail(BAD, { name: 'weights', why: 'not_positive' });
        if (v < WLO || v > HI) fail(BAD, { name: 'weights', why: 'out_of_range' });
        if (v !== 1) ones = false;
        return v;
      }));
    });
    if (!ones) w = Object.freeze(rows);
  }
  const s = Object.freeze({ type: 'nurbs', degU: pu, degV: pv, knotsU: KU.U, knotsV: KV.U, cvs: Object.freeze(cvs), w });
  MADE.add(s);
  KN.set(s, { KU, KV });
  return s;
}

export const isSurface = (s) => s !== null && typeof s === 'object' && MADE.has(s);
export const fromData = (d) => make(d);
export function toData(s) {
  need(s);
  return { degU: s.degU, degV: s.degV, knotsU: s.knotsU.slice(), knotsV: s.knotsV.slice(), cvs: s.cvs.map((r) => r.map((q) => q.slice())), w: s.w ? s.w.map((r) => r.slice()) : null };
}

function need(s, name = 'surface') {
  if (!isSurface(s)) fail(BAD, { name, why: 'not_a_surface' });
  return KN.get(s);
}

function param(K, x, name) {
  if (typeof x !== 'number' || !Number.isFinite(x)) fail(BAD, { name, why: 'not_a_number' });
  if (x < K.a || x > K.b) fail(BAD, { name, why: 'out_of_domain' });
  return x;
}
function snap(K, x) {
  const near = 2 * KTOL * (K.b - K.a);
  let best = x, gap = Infinity;
  for (const k of K.distinct) { const d = Math.abs(k.u - x); if (d <= near && d < gap) { best = k.u; gap = d; } }
  return best;
}
const multiplicity = (K, x) => { for (const k of K.distinct) if (k.u === x) return k.m; return 0; };
function interior(K, x, name) {
  param(K, x, name);
  const s = snap(K, x);
  if (!(s > K.a && s < K.b)) fail(BAD, { name, why: 'not_interior' });
  return s;
}
function direction(dir) {
  if (dir !== 'u' && dir !== 'v') fail(BAD, { name: 'dir', why: 'not_a_direction' });
  return dir;
}
function finite(v, name) {
  for (const x of v) if (!Number.isFinite(x)) fail(BAD, { name, why: 'overflow' });
  return v;
}

// ---------------------------------------------------------------------------------------------------- queries

export function domainU(s) { const { KU } = need(s); return [KU.a, KU.b]; }
export function domainV(s) { const { KV } = need(s); return [KV.a, KV.b]; }
export const isRational = (s) => { need(s); return s.w !== null; };

export function bbox(s) {
  need(s);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const row of s.cvs) for (const q of row) for (let i = 0; i < 3; i++) { if (q[i] < min[i]) min[i] = q[i]; if (q[i] > max[i]) max[i] = q[i]; }
  return Object.freeze({ min: Object.freeze(min), max: Object.freeze(max) });
}

function size(s) {
  const b = bbox(s), d = V3.dist(b.min, b.max);
  return d > 0 ? d : Math.max(Math.abs(b.min[0]), Math.abs(b.min[1]), Math.abs(b.min[2]), 1);
}

export function point(s, u, v) {
  const { KU, KV } = need(s);
  param(KU, u, 'u');
  param(KV, v, 'v');
  return finite(NS.point(s, u, v), 'point');
}

export function derivs(s, u, v, d = 2) {
  const { KU, KV } = need(s);
  param(KU, u, 'u');
  param(KV, v, 'v');
  if (!isCount(d)) fail(BAD, { name: 'order', why: 'not_a_count' });
  if (d > LIMITS.order) fail(BAD, { name: 'order', why: 'out_of_range' });
  const S = s.w === null ? polyDerivs(s, KU, KV, u, v, d) : NS.derivs(s, u, v, d);
  for (const row of S) for (const x of row) finite(x, 'derivs');
  return S;
}

/** A3.6: SKL[k][l] = Σ_r Σ_s N^(k)_r(u) N^(l)_s(v) P, rows above either degree exactly 0. */
function polyDerivs(s, KU, KV, u, v, d) {
  const pu = KU.p, pv = KV.p, du = d < pu ? d : pu, dv = d < pv ? d : pv;
  const iu = B.findSpan(KU.n, pu, u, KU.U), iv = B.findSpan(KV.n, pv, v, KV.U);
  const Nu = B.dersBasisFuns(iu, u, pu, du, KU.U), Nv = B.dersBasisFuns(iv, v, pv, dv, KV.U);
  const S = [];
  for (let k = 0; k <= d; k++) {
    const row = [];
    const temp = [];
    if (k <= du) for (let b = 0; b <= pv; b++) {
      let x = 0, y = 0, z = 0;
      for (let a = 0; a <= pu; a++) { const q = s.cvs[iu - pu + a][iv - pv + b], f = Nu[k][a]; x += f * q[0]; y += f * q[1]; z += f * q[2]; }
      temp.push([x, y, z]);
    }
    for (let l = 0; l <= d - k; l++) {
      if (k > du || l > dv) { row.push([0, 0, 0]); continue; }
      let x = 0, y = 0, z = 0;
      for (let b = 0; b <= pv; b++) { const q = temp[b], f = Nv[l][b]; x += f * q[0]; y += f * q[1]; z += f * q[2]; }
      row.push([x, y, z]);
    }
    S.push(row);
  }
  return S;
}

/** v scaled by an exact power of two to a largest component in [1, 2); null for the zero vector. */
function scaled(x) {
  const m = Math.max(Math.abs(x[0]), Math.abs(x[1]), Math.abs(x[2]));
  if (m === 0) return null;
  const k = exponent(m);
  return [scalb(x[0], -k), scalb(x[1], -k), scalb(x[2], -k)];
}

/**
 * Whether each partial is, as a length, no more than tol.lin: |Su| · (b − a) is how far the u-line through (u, v) would
 * reach across the whole domain at that rate, in millimetres. A pole has 0 there (or rounding noise: on a rational surface a
 * partial that vanishes in exact arithmetic comes out as noise, which scaled to unit size would look like a direction). The
 * lengths are compared with tol.lin, not with each other: the ratio |Su| / |Sv| depends on how each direction happens to be
 * parameterised, and a domain 1e9 wide beside one 0.02 wide is still an ordinary surface.
 */
function flat(KU, KV, Su, Sv, T) {
  return [!(V3.len(Su) * (KU.b - KU.a) > T.lin), !(V3.len(Sv) * (KV.b - KV.a) > T.lin)];
}

/** Su × Sv made unit after scaling by powers of two, or null when the partials are zero or parallel within tol.ang. */
function crossUnit(Su, Sv, T) {
  const su = scaled(Su), sv = scaled(Sv);
  if (!su || !sv) return null;
  const n = V3.cross(su, sv), l = V3.len(n);
  return l > T.ang * V3.len(su) * V3.len(sv) ? V3.scale(n, 1 / l) : null;
}

/** The unit normal from the partials, or the limit at a pole, or null where there is none. */
function normalAt(s, KU, KV, u, v, D1, T) {
  const Su = D1[1][0], Sv = D1[0][1], [flatU, flatV] = flat(KU, KV, Su, Sv, T);
  if (flatU && flatV) return null;
  const onPole = (flatU && (v === KV.a || v === KV.b)) || (flatV && (u === KU.a || u === KU.b));
  // off a collapsed edge the cross product decides, also next to one (where a partial is short but not noise)
  if (!onPole) return crossUnit(Su, Sv, T);
  // on an edge collapsed to a point (a pole): the limit from inside the domain
  const su = scaled(Su), sv = scaled(Sv);
  const D2 = s.w === null ? polyDerivs(s, KU, KV, u, v, 2) : NS.derivs(s, u, v, 2), Suv = D2[1][1];
  const suv = scaled(Suv);
  if (!suv) return null;
  if (flatU) {
    // S(u, v0) is one point for all u: near v0 + h, Su ≈ h Suv, so Su × Sv ≈ h (Suv × Sv); h > 0 at v = a, h < 0 at v = b
    const side = v === KV.a ? 1 : v === KV.b ? -1 : 0;
    const m = side ? V3.cross(suv, sv) : null;
    return m && V3.len(m) > T.ang * V3.len(suv) * V3.len(sv) ? V3.scale(m, side / V3.len(m)) : null;
  }
  // flatV: S(u0, v) is one point for all v: near u0 + h, Sv ≈ h Suv, so Su × Sv ≈ h (Su × Suv); h > 0 at u = a
  const side = u === KU.a ? 1 : u === KU.b ? -1 : 0;
  const m = side ? V3.cross(su, suv) : null;
  return m && V3.len(m) > T.ang * V3.len(su) * V3.len(suv) ? V3.scale(m, side / V3.len(m)) : null;
}

export function normal(s, u, v, tol) {
  const { KU, KV } = need(s);
  const T = resolveTol(tol);
  const D1 = derivs(s, u, v, 1), n = normalAt(s, KU, KV, u, v, D1, T);
  if (!n) fail(BAD, { name: 'uv', why: 'degenerate' });
  return n;
}

/** The forms in an orthonormal frame e1, e2 of the tangent plane: { n, e1, e2, a, b, c } with II = [[a, b], [b, c]]. */
function frameForms(s, u, v, tol) {
  const { KU, KV } = need(s);
  const T = resolveTol(tol);
  const D = derivs(s, u, v, 2), Su = D[1][0], Sv = D[0][1], [flatU, flatV] = flat(KU, KV, Su, Sv, T);
  if (flatU || flatV) fail(BAD, { name: 'uv', why: 'degenerate' });
  const su = scaled(Su), sv = scaled(Sv), n0 = V3.cross(su, sv);
  if (!(V3.len(n0) > T.ang * V3.len(su) * V3.len(sv))) fail(BAD, { name: 'uv', why: 'degenerate' });
  const n = V3.unit(n0);
  // e1 = α Su, e2 = β Su + γ Sv
  const lSu = V3.len(Su), e1 = V3.scale(Su, 1 / lSu), proj = V3.dot(Sv, e1), perp = V3.madd(Sv, -proj, e1), lp = V3.len(perp);
  const e2 = V3.scale(perp, 1 / lp), alpha = 1 / lSu, beta = -proj / (lSu * lp), gamma = 1 / lp;
  const L = V3.dot(D[2][0], n), M = V3.dot(D[1][1], n), N = V3.dot(D[0][2], n);
  const a = alpha * alpha * L, b = alpha * (beta * L + gamma * M), c = beta * beta * L + 2 * beta * gamma * M + gamma * gamma * N;
  finite([a, b, c], 'curvature');
  return { n, e1, e2, a, b, c };
}

export function curvature(s, u, v, tol) {
  const { n, e1, e2, a, b, c } = frameForms(s, u, v, tol);
  const h = (a + c) / 2, q = (a - c) / 2, r = Math.sqrt(q * q + b * b);
  const k1 = h + r, k2 = h - r;
  // the eigenvector for k1: (b, k1 − a) or (k1 − c, b), whichever is longer; at an umbilic (r = 0) any direction: e1
  let x = b, y = k1 - a;
  const x2 = k1 - c, y2 = b;
  if (x2 * x2 + y2 * y2 > x * x + y * y) { x = x2; y = y2; }
  const d1 = r === 0 || (x === 0 && y === 0) ? e1 : V3.unit(V3.madd(V3.scale(e1, x), y, e2));
  const d2 = V3.cross(n, d1);
  return Object.freeze({ K: a * c - b * b, H: h, k1, k2, d1, d2 });
}

export function normalCurvature(s, u, v, t, tol) {
  if (!V3.isVec3(t)) fail(BAD, { name: 'direction', why: 'not_a_vector' });
  const { e1, e2, a, b, c } = frameForms(s, u, v, tol);
  const x = V3.dot(t, e1), y = V3.dot(t, e2), l2 = x * x + y * y;
  if (!(l2 > 0)) fail(BAD, { name: 'direction', why: 'not_tangent' });
  return (a * x * x + 2 * b * x * y + c * y * y) / l2;
}

// ---------------------------------------------------------------------------------------------------- iso-curves

export function isoCurve(s, dir, t) {
  const { KU, KV } = need(s);
  direction(dir);
  const K = dir === 'u' ? KU : KV, O = dir === 'u' ? KV : KU;
  param(K, t, 't');
  const p = K.p, i = B.findSpan(K.n, p, t, K.U), N = B.basisFuns(i, t, p, K.U);
  const count = dir === 'u' ? s.cvs[0].length : s.cvs.length;
  const at = (a, j) => (dir === 'u' ? [i - p + a, j] : [j, i - p + a]);
  const cvs = [], w = s.w ? [] : null;
  for (let j = 0; j < count; j++) {
    let x = 0, y = 0, z = 0, ww = 0;
    for (let a = 0; a <= p; a++) {
      const [r, c] = at(a, j), q = s.cvs[r][c], wi = s.w ? s.w[r][c] : 1, f = N[a] * wi;
      x += f * q[0]; y += f * q[1]; z += f * q[2]; ww += f;
    }
    if (w) { cvs.push([x / ww, y / ww, z / ww]); w.push(ww); } else cvs.push([x, y, z]);
  }
  return CV.make({ deg: O.p, knots: O.U, cvs, w });
}

export function edgeCurve(s, edge) {
  const { KU, KV } = need(s);
  const nu = s.cvs.length, nv = s.cvs[0].length;
  let cvs, w, deg, knots;
  if (edge === 'u0' || edge === 'u1') {
    const i = edge === 'u0' ? 0 : nu - 1;
    cvs = s.cvs[i]; w = s.w ? s.w[i] : null; deg = KV.p; knots = KV.U;
  } else if (edge === 'v0' || edge === 'v1') {
    const j = edge === 'v0' ? 0 : nv - 1;
    cvs = s.cvs.map((r) => r[j]); w = s.w ? s.w.map((r) => r[j]) : null; deg = KU.p; knots = KU.U;
  } else fail(BAD, { name: 'edge', why: 'not_an_edge' });
  return CV.make({ deg, knots, cvs, w });
}

// ---------------------------------------------------------------------------------------------------- knots and pieces

export function insertKnot(s, dir, t, r = 1) {
  const { KU, KV } = need(s);
  direction(dir);
  if (!isCount(r)) fail(BAD, { name: 'r', why: 'not_a_count' });
  const K = dir === 'u' ? KU : KV, x = interior(K, t, 't');
  if (r === 0) return s;
  if (multiplicity(K, x) + r > K.p) fail(BAD, { name: 'r', why: 'multiplicity' });
  return make(NS.insertKnot(s, dir, x, r));
}

export function refine(s, dir, X) {
  need(s);
  direction(dir);
  if (!isList(X)) fail(BAD, { name: 'knots', why: 'not_an_array' });
  if (X.length > LIMITS.knots) fail('solid.err.limit', { what: 'knots', limit: LIMITS.knots, used: X.length });
  let out = s;
  for (const t of X) out = insertKnot(out, dir, t, 1);
  return out;
}

/** The net's rows along dir as homogeneous point lists: dir 'v' → each row i (a curve in v); 'u' → each column j. */
function rowsOf(s, dir) {
  const H = (i, j) => { const q = s.cvs[i][j], w = s.w ? s.w[i][j] : 1; return [q[0] * w, q[1] * w, q[2] * w, w]; };
  const nu = s.cvs.length, nv = s.cvs[0].length;
  if (dir === 'v') return Array.from({ length: nu }, (_, i) => Array.from({ length: nv }, (_, j) => H(i, j)));
  return Array.from({ length: nv }, (_, j) => Array.from({ length: nu }, (_, i) => H(i, j)));
}
function fromRows(s, dir, deg, knots, rows) {
  // rows of homogeneous points, all on `knots`; back to a surface record
  const nr = rows.length, nc = rows[0].length;
  const at = dir === 'v' ? (i, j) => rows[i][j] : (i, j) => rows[j][i];
  const nu = dir === 'v' ? nr : nc, nv = dir === 'v' ? nc : nr;
  const cvs = [], w = [];
  let ones = true;
  for (let i = 0; i < nu; i++) {
    cvs.push([]); w.push([]);
    for (let j = 0; j < nv; j++) { const q = at(i, j); cvs[i].push([q[0] / q[3], q[1] / q[3], q[2] / q[3]]); w[i].push(q[3]); if (q[3] !== 1) ones = false; }
  }
  const out = dir === 'v'
    ? { degU: s.degU, degV: deg, knotsU: s.knotsU, knotsV: knots, cvs, w: ones || s.w === null ? null : w }
    : { degU: deg, degV: s.degV, knotsU: knots, knotsV: s.knotsV, cvs, w: ones || s.w === null ? null : w };
  if (s.w === null) for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const q = at(i, j); out.cvs[i][j] = [q[0], q[1], q[2]]; }
  return make(out);
}

export function elevate(s, dir, t = 1) {
  const { KU, KV } = need(s);
  direction(dir);
  if (!isCount(t)) fail(BAD, { name: 't', why: 'not_a_count' });
  if (t === 0) return s;
  const K = dir === 'u' ? KU : KV;
  if (K.p + t > LIMITS.degree) fail('solid.err.limit', { what: 'degree', limit: LIMITS.degree, used: K.p + t });
  const polynomial = s.w === null;
  // every row elevated with cc-nurbs (no knots removed yet), as a curve; for a polynomial surface the rows are polynomial
  let curves = rowsOf(s, dir).map((row) => {
    const c = polynomial ? { deg: K.p, knots: K.U, cvs: row.map((q) => [q[0], q[1], q[2]]), w: null } : NC.fromH(K.p, K.U, row);
    return NC.elevate(c, t, { removeKnots: false });
  });
  // remove the knots elevation added, as far as every row allows: first ask each row how many copies it can lose, then take
  // that many from all of them, so they stay on one knot vector
  const tol = REMOVE_REL * size(s);
  for (const k of K.distinct.slice(1, -1)) {
    const want = K.p - k.m;
    if (want <= 0) continue;
    let can = want;
    for (const c of curves) { can = Math.min(can, NC.removeKnot(c, k.u, want, tol).removed); if (can === 0) break; }
    if (can > 0) curves = curves.map((c) => NC.removeKnot(c, k.u, can, tol).curve);
  }
  const knots = curves[0].knots;
  for (const c of curves) if (c.knots.length !== knots.length || c.knots.some((x, i) => x !== knots[i])) fail('solid.err.internal', { reason: 'elevate_rows' });
  const rows = curves.map((c) => (polynomial ? c.cvs.map((q) => [q[0], q[1], q[2], 1]) : NC.hcvs(c)));
  return fromRows(s, dir, K.p + t, knots, rows);
}

export function split(s, dir, t) {
  const { KU, KV } = need(s);
  direction(dir);
  const K = dir === 'u' ? KU : KV, x = interior(K, t, 't');
  const parts = NS.split(s, dir, x);
  if (!parts[0] || !parts[1]) fail('solid.err.internal', { reason: 'split_rows' });
  return Object.freeze(parts.map(make));
}

export function reverse(s, dir) {
  const { KU, KV } = need(s);
  direction(dir);
  const K = dir === 'u' ? KU : KV, a = K.a, b = K.b, p = K.p, U = K.U, m = U.length - 1;
  const R = new Array(m + 1);
  for (let i = 0; i <= m; i++) { const x = a + (b - U[m - i]); R[i] = x < a ? a : x > b ? b : x; }
  for (let i = 0; i <= p; i++) { R[i] = a; R[m - i] = b; }
  const nu = s.cvs.length, nv = s.cvs[0].length;
  const src = dir === 'u' ? (i, j) => [nu - 1 - i, j] : (i, j) => [i, nv - 1 - j];
  const cvs = s.cvs.map((row, i) => row.map((_, j) => { const [r, c] = src(i, j); return s.cvs[r][c].slice(); }));
  const w = s.w ? s.w.map((row, i) => row.map((_, j) => { const [r, c] = src(i, j); return s.w[r][c]; })) : null;
  return make(dir === 'u' ? { degU: s.degU, degV: s.degV, knotsU: R, knotsV: s.knotsV, cvs, w } : { degU: s.degU, degV: s.degV, knotsU: s.knotsU, knotsV: R, cvs, w });
}

export function swap(s) {
  need(s);
  return make(NS.swap(s));
}

export function reparam(s, [a, b] = [0, 1], [c, d] = [0, 1]) {
  need(s);
  for (const [name, x] of [['u', a], ['u', b], ['v', c], ['v', d]]) if (typeof x !== 'number' || !Number.isFinite(x)) fail(BAD, { name, why: 'not_a_number' });
  if (!(a < b)) fail(BAD, { name: 'u', why: 'out_of_domain' });
  if (!(c < d)) fail(BAD, { name: 'v', why: 'out_of_domain' });
  return make(NS.reparam(s, [a, b], [c, d]));
}

export function transform(s, m) {
  need(s);
  if (!isAffine(m)) fail(BAD, { name: 'matrix', why: 'not_affine' });
  return make(NS.transform(s, m));
}

// ---------------------------------------------------------------------------------------------------- deviation

function refineDir(s, dir, want) {
  let out = s;
  for (const k of want) {
    const { KU, KV } = KN.get(out), K = dir === 'u' ? KU : KV;
    if (!(k.u > K.a && k.u < K.b)) continue;
    const have = multiplicity(K, k.u);
    if (have < k.m) {
      if (snap(K, k.u) !== k.u) fail(BAD, { name: 'surfaces', why: 'near_knots' });
      out = make(NS.insertKnot(out, dir, k.u, k.m - have));
    }
  }
  return out;
}
function union(K1, K2) {
  const merged = new Map();
  for (const K of [K1, K2]) for (const k of K.distinct) merged.set(k.u, Math.max(merged.get(k.u) || 0, k.m));
  return [...merged.entries()].sort((x, y) => x[0] - y[0]).map(([u, m]) => ({ u, m }));
}

export function deviation(s1, s2) {
  const A = need(s1), Bk = need(s2);
  if (s1.w !== null || s2.w !== null) fail(BAD, { name: 'surface', why: 'rational' });
  if (A.KU.a !== Bk.KU.a || A.KU.b !== Bk.KU.b || A.KV.a !== Bk.KV.a || A.KV.b !== Bk.KV.b) fail(BAD, { name: 'surfaces', why: 'domain' });
  const pu = Math.max(s1.degU, s2.degU), pv = Math.max(s1.degV, s2.degV);
  let e1 = elevate(elevate(s1, 'u', pu - s1.degU), 'v', pv - s1.degV);
  let e2 = elevate(elevate(s2, 'u', pu - s2.degU), 'v', pv - s2.degV);
  for (const dir of ['u', 'v']) {
    const k1 = KN.get(e1), k2 = KN.get(e2), want = union(dir === 'u' ? k1.KU : k1.KV, dir === 'u' ? k2.KU : k2.KV);
    e1 = refineDir(e1, dir, want);
    e2 = refineDir(e2, dir, want);
  }
  const same = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
  if (!same(e1.knotsU, e2.knotsU) || !same(e1.knotsV, e2.knotsV)) fail(BAD, { name: 'surfaces', why: 'near_knots' });
  let e = 0;
  for (let i = 0; i < e1.cvs.length; i++) for (let j = 0; j < e1.cvs[0].length; j++) e = Math.max(e, V3.dist(e1.cvs[i][j], e2.cvs[i][j]));
  return e;
}
