/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * construct.js — cc-solid (S9, docs/solid/HANDOFF.md § 6.5, M1): surfaces from curves, checked. DOM-free; imports core/,
 * math/, the curve and surface modules and cc-nurbs' exact interpolation (fit.js).
 *
 * Sources: The NURBS Book (Piegl & Tiller, 2nd ed.) § 8.3 ruled surfaces, § 10.3 skinning (compatibility by elevation and knot
 * insertion, § 5.5 and A5.4; the v parameters averaged over the columns of the net; A9.1 on every column), and the bilinearly
 * blended Coons patch (S. A. Coons, MIT Project MAC TR-41, 1967): S = Lc + Ld − B. Interpolation is cc-nurbs' (D8).
 * What this file adds to cc-nurbs' construct.js, besides the checks:
 *   - compatibility with exact knots: cc-nurbs merges knot vectors after rounding each knot to 1e-12, which can put two knots
 *     within KTOL of each other; here knots are merged by value, and two that only one reading would merge are refused;
 *   - every result is checked against what it was built to pass through: a loft's iso-curves at the section parameters
 *     against the sections, a Coons patch's edges against its four curves, a grid surface against the grid — within tol.lin,
 *     or refused (solid.err.not_within_tolerance);
 *   - extrude and revolve keep their identity: they return analytic surfaces (analytic-surface.js), exact by construction.
 *
 *   compatible(curves) → NURBS curves on [0, 1] with one degree and one knot vector, each the same curve as given (any curve:
 *     analytic ones through their exact toNurbs)
 *   ruled(a, b) → surface: S(u, 0) = a, S(u, 1) = b, every v-line a straight segment (degree 1 in v)
 *   loft(sections, { deg = 3, param = 'chord', tol }) → { surface, params }: S(u, params[k]) = sections[k] (u on [0, 1])
 *   coons(c0, c1, d0, d1, tol) → surface with S(u, 0) = c0, S(u, 1) = c1, S(0, v) = d0, S(1, v) = d1 (polynomial curves whose
 *     ends meet at the four corners within tol.lin; each reparameterised to [0, 1])
 *   interpolateGrid(Q, { degU = 3, degV = 3, param = 'chord', tol }) → { surface, paramsU, paramsV }: S(u_i, v_j) = Q[i][j]
 *   extrude(curve, vector) → an analytic extrusion · revolve(curve, axis { o, d }, angle = 2π) → an analytic revolution
 *
 * Refusals: solid.err.bad_input { name, why }: 'curves', 'sections' 'not_an_array' | 'too_few' | 'not_a_curve' |
 * 'near_knots' | 'repeated' (two sections at one parameter) | 'weights' (a lofted weight ≤ 0) | 'corners' (a Coons patch whose
 * curves do not meet); 'curve' 'rational' (Coons: polynomial curves only); 'grid' 'not_a_grid' | 'too_few'; 'vector'
 * 'zero_length'; 'angle' 'out_of_range'; solid.err.singular { why: 'matrix' }; solid.err.not_within_tolerance { what:
 * 'loft' | 'coons' | 'grid', tol, error }.
 */
import { fail } from '../core/errors.js';
import { resolveTol } from '../core/tol.js';
import { TAU } from '../core/trig.js';
import * as V3 from '../math/vec3.js';
import * as CV from './nurbs-curve.js';
import * as C from './curve.js';
import * as NSF from './nurbs-surface.js';
import * as AS from './analytic-surface.js';
import { params as nfParams, interpolateMany } from '../../nurbs/fit.js';

const BAD = 'solid.err.bad_input';

function upstream(f) {
  try { return f(); } catch (e) {
    if (e && e.code === 'nurbs.err.fit_singular') fail('solid.err.singular', { why: 'matrix' });
    throw e;
  }
}
function curvesOf(list, name, min) {
  if (!Array.isArray(list)) fail(BAD, { name, why: 'not_an_array' });
  if (list.length < min) fail(BAD, { name, why: 'too_few' });
  for (const c of list) if (!C.isCurve(c)) fail(BAD, { name, why: 'not_a_curve' });
  return list;
}
const mult = (U, x) => { let m = 0; for (const y of U) if (y === x) m++; return m; };

export function compatible(curves) {
  curvesOf(curves, 'curves', 1);
  let list = curves.map((c) => CV.reparam(C.toNurbs(c), 0, 1));
  const p = Math.max(...list.map((c) => c.deg));
  list = list.map((c) => CV.elevate(c, p - c.deg));
  const want = new Map();
  for (const c of list) for (const x of new Set(c.knots)) if (x > 0 && x < 1) want.set(x, Math.max(want.get(x) || 0, mult(c.knots, x)));
  const xs = [...want.keys()].sort((a, b) => a - b);
  list = list.map((c) => {
    let out = c;
    for (const x of xs) {
      const have = mult(out.knots, x);
      if (have < want.get(x)) {
        const next = CV.insertKnot(out, x, want.get(x) - have);
        if (mult(next.knots, x) !== want.get(x)) fail(BAD, { name: 'curves', why: 'near_knots' });   // snapped to a neighbour
        out = next;
      }
    }
    return out;
  });
  const K = list[0].knots;
  for (const c of list) if (c.knots.length !== K.length || c.knots.some((x, i) => x !== K[i])) fail(BAD, { name: 'curves', why: 'near_knots' });
  return Object.freeze(list);
}

const homog = (c, i) => { const q = c.cvs[i], w = c.w ? c.w[i] : 1; return [q[0] * w, q[1] * w, q[2] * w, w]; };

export function ruled(a, b) {
  const [ca, cb] = compatible(curvesOf([a, b], 'curves', 2));
  const rational = ca.w !== null || cb.w !== null;
  return NSF.make({ degU: ca.deg, degV: 1, knotsU: ca.knots, knotsV: [0, 0, 1, 1], cvs: ca.cvs.map((q, i) => [q, cb.cvs[i]]), w: rational ? ca.cvs.map((_, i) => [ca.w ? ca.w[i] : 1, cb.w ? cb.w[i] : 1]) : null });
}

/** The largest distance between two curves on one domain: the deviation bound when both are polynomial, else sampled. */
function apart(c1, c2) {
  if (c1.w === null && c2.w === null) return CV.deviation(c1, c2);
  const [a, b] = CV.domain(c1);
  let e = 0;
  const knots = [...new Set(c1.knots)];
  for (let i = 0; i + 1 < knots.length; i++) for (let k = 0; k <= 8; k++) {
    const u = k === 8 ? knots[i + 1] : knots[i] + (knots[i + 1] - knots[i]) * k / 8;
    if (u >= a && u <= b) e = Math.max(e, V3.dist(CV.point(c1, u), CV.point(c2, u)));
  }
  return e;
}

export function loft(sections, { deg = 3, param = 'chord', tol } = {}) {
  const T = resolveTol(tol);
  const list = compatible(curvesOf(sections, 'sections', 2)), k = list.length, n = list[0].cvs.length, rational = list.some((c) => c.w !== null);
  if (!Number.isInteger(deg) || deg < 1) fail(BAD, { name: 'degree', why: 'not_a_count' });
  // the v parameters: each column's own (chord or centripetal) parameters, averaged over the columns that are not one point
  const v = new Array(k).fill(0);
  let used = 0;
  for (let i = 0; i < n; i++) {
    const col = list.map((c) => c.cvs[i]);
    let len = 0;
    for (let j = 1; j < k; j++) len += V3.dist(col[j], col[j - 1]);
    if (!(len > T.lin)) continue;
    const t = nfParams(col, param);
    for (let j = 0; j < k; j++) v[j] += t[j];
    used++;
  }
  if (used === 0) fail(BAD, { name: 'sections', why: 'repeated' });
  for (let j = 0; j < k; j++) v[j] = j === 0 ? 0 : j === k - 1 ? 1 : v[j] / used;
  for (let j = 1; j < k; j++) if (!(v[j] > v[j - 1])) fail(BAD, { name: 'sections', why: 'repeated' });
  const lists = Array.from({ length: n }, (_, i) => list.map((c) => (rational ? homog(c, i) : c.cvs[i].slice())));
  const r = upstream(() => interpolateMany(lists, v, Math.min(deg, k - 1)));
  const cvs = [], w = rational ? [] : null;
  for (let i = 0; i < n; i++) {
    cvs.push([]);
    if (w) w.push([]);
    for (const q of r.rows[i]) {
      if (!rational) { cvs[i].push([q[0], q[1], q[2]]); continue; }
      if (!(q[3] > 0)) fail(BAD, { name: 'sections', why: 'weights' });
      cvs[i].push([q[0] / q[3], q[1] / q[3], q[2] / q[3]]);
      w[i].push(q[3]);
    }
  }
  const surface = NSF.make({ degU: list[0].deg, degV: r.deg, knotsU: list[0].knots, knotsV: r.knots, cvs, w });
  let error = 0;
  for (let j = 0; j < k; j++) error = Math.max(error, apart(NSF.isoCurve(surface, 'v', v[j]), list[j]));
  if (!(error <= T.lin)) fail('solid.err.not_within_tolerance', { what: 'loft', tol: T.lin, error });
  return Object.freeze({ surface, params: Object.freeze(v) });
}

/** A polynomial NURBS surface brought to degrees (pu, pv) and refined to carry the knots of KU and KV. */
function lift(s, pu, pv, KU, KV) {
  let out = NSF.elevate(NSF.elevate(s, 'u', pu - s.degU), 'v', pv - s.degV);
  for (const [dir, K] of [['u', KU], ['v', KV]]) {
    for (const x of new Set(K)) {
      if (!(x > 0 && x < 1)) continue;
      const have = mult(dir === 'u' ? out.knotsU : out.knotsV, x), need = mult(K, x);
      if (have < need) out = NSF.insertKnot(out, dir, x, need - have);
    }
  }
  return out;
}

export function coons(c0, c1, d0, d1, tol) {
  const T = resolveTol(tol);
  curvesOf([c0, c1, d0, d1], 'curves', 4);
  const [a0, a1] = compatible([c0, c1]), [b0, b1] = compatible([d0, d1]);
  for (const c of [a0, a1, b0, b1]) if (c.w !== null) fail(BAD, { name: 'curve', why: 'rational' });
  const P = (c, t) => CV.point(c, t);
  const corners = [[P(a0, 0), P(b0, 0)], [P(a0, 1), P(b1, 0)], [P(a1, 0), P(b0, 1)], [P(a1, 1), P(b1, 1)]];
  for (const [x, y] of corners) if (!(V3.dist(x, y) <= T.lin)) fail(BAD, { name: 'curves', why: 'corners' });
  const pu = a0.deg, pv = b0.deg, KU = a0.knots, KV = b0.knots;
  const Lc = lift(NSF.make({ degU: pu, degV: 1, knotsU: KU, knotsV: [0, 0, 1, 1], cvs: a0.cvs.map((q, i) => [q, a1.cvs[i]]) }), pu, Math.max(pv, 1), KU, KV);
  const Ld = lift(NSF.make({ degU: 1, degV: pv, knotsU: [0, 0, 1, 1], knotsV: KV, cvs: [b0.cvs.map((q) => q.slice()), b1.cvs.map((q) => q.slice())] }), Math.max(pu, 1), pv, KU, KV);
  const mid = (x, y) => V3.scale(V3.add(x, y), 0.5);
  const B = lift(NSF.make({ degU: 1, degV: 1, knotsU: [0, 0, 1, 1], knotsV: [0, 0, 1, 1], cvs: [[mid(...corners[0]), mid(...corners[2])], [mid(...corners[1]), mid(...corners[3])]] }), Math.max(pu, 1), Math.max(pv, 1), KU, KV);
  const same = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
  if (!same(Lc.knotsU, Ld.knotsU) || !same(Lc.knotsV, Ld.knotsV) || !same(B.knotsU, Lc.knotsU) || !same(B.knotsV, Lc.knotsV)) fail(BAD, { name: 'curves', why: 'near_knots' });
  const cvs = Lc.cvs.map((row, i) => row.map((q, j) => V3.sub(V3.add(q, Ld.cvs[i][j]), B.cvs[i][j])));
  const surface = NSF.make({ degU: Lc.degU, degV: Lc.degV, knotsU: Lc.knotsU, knotsV: Lc.knotsV, cvs });
  let error = 0;
  for (const [edge, c] of [['v0', a0], ['v1', a1], ['u0', b0], ['u1', b1]]) error = Math.max(error, CV.deviation(NSF.edgeCurve(surface, edge), c));
  if (!(error <= T.lin)) fail('solid.err.not_within_tolerance', { what: 'coons', tol: T.lin, error });
  return surface;
}

export function interpolateGrid(Q, { degU = 3, degV = 3, param = 'chord', tol } = {}) {
  const T = resolveTol(tol);
  if (!Array.isArray(Q) || Q.length < 2 || !Array.isArray(Q[0]) || Q[0].length < 2) fail(BAD, { name: 'grid', why: 'too_few' });
  const nu = Q.length, nv = Q[0].length;
  for (const row of Q) {
    if (!Array.isArray(row) || row.length !== nv) fail(BAD, { name: 'grid', why: 'not_a_grid' });
    for (const p of row) if (!V3.isVec3(p)) fail(BAD, { name: 'grid', why: 'not_a_grid' });
  }
  // parameters averaged over the rows and the columns (§ 9.2.5)
  const avg = (lines, count) => {
    const t = new Array(count).fill(0);
    let used = 0;
    for (const line of lines) {
      let len = 0;
      for (let j = 1; j < line.length; j++) len += V3.dist(line[j], line[j - 1]);
      if (!(len > T.lin)) continue;
      nfParams(line, param).forEach((x, j) => { t[j] += x; });
      used++;
    }
    if (used === 0) fail(BAD, { name: 'grid', why: 'not_a_grid' });
    return t.map((x, j) => (j === 0 ? 0 : j === count - 1 ? 1 : x / used));
  };
  const tu = avg(Array.from({ length: nv }, (_, j) => Q.map((r) => r[j])), nu), tv = avg(Q, nv);
  for (const t of [tu, tv]) for (let j = 1; j < t.length; j++) if (!(t[j] > t[j - 1])) fail(BAD, { name: 'grid', why: 'not_a_grid' });
  // u first, for each column j; then v, for each new row i
  const ru = upstream(() => interpolateMany(Array.from({ length: nv }, (_, j) => Q.map((r) => r[j])), tu, degU));
  const R = Array.from({ length: ru.rows[0].length }, (_, i) => ru.rows.map((col) => col[i]));
  const rv = upstream(() => interpolateMany(R, tv, degV));
  const surface = NSF.make({ degU: ru.deg, degV: rv.deg, knotsU: ru.knots, knotsV: rv.knots, cvs: rv.rows });
  let error = 0;
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) error = Math.max(error, V3.dist(NSF.point(surface, tu[i], tv[j]), Q[i][j]));
  if (!(error <= T.lin)) fail('solid.err.not_within_tolerance', { what: 'grid', tol: T.lin, error });
  return Object.freeze({ surface, paramsU: Object.freeze(tu), paramsV: Object.freeze(tv) });
}

export function extrude(curve, vector) {
  if (!V3.isVec3(vector) || !(V3.len(vector) > 0)) fail(BAD, { name: 'vector', why: 'zero_length' });
  return AS.extrusion({ profile: curve, d: vector, vrange: [0, V3.len(vector)] });
}

export function revolve(curve, axis, angle = TAU) {
  if (typeof angle !== 'number' || !(angle > 0) || angle > TAU) fail(BAD, { name: 'angle', why: 'out_of_range' });
  return AS.revolution({ profile: curve, axis, urange: [0, angle] });
}
