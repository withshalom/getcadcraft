/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * query.js — cc-solid (S10, docs/solid/HANDOFF.md § 6.4, M1): closest points, inversion, tight boxes, length and area, for
 * every curve and surface (NURBS or analytic, through curve.js and surface.js). DOM-free; imports core/, math/ and geom/.
 *
 * Closest point (§ 6.4: "coarse sampling of Bézier-decomposed spans, then damped Newton with bracketing fallback", made
 * global):
 *   - a curve is cut at its knots (an analytic curve into pieces of at most an eighth of a turn); each piece is sampled at
 *     4(p + 2) + 1 points, and in every sample interval where the derivative of the squared distance, g'(t) =
 *     2 C'(t) · (C(t) − p), goes from − to +, Newton runs kept inside it (math/roots.js). The answer is the best of all of
 *     them and of the samples (the ends of the domain among them).
 *   - a surface is sampled on every knot cell (every angle piece) at 2(p + 2) × 2(q + 2) points; from the best sample a
 *     damped Newton descent on ((S − p)·Su, (S − p)·Sv) = 0 runs, halving a step until the point comes closer, clamped to
 *     the domain; every boundary line and interior knot line is searched as a curve (as above); the best is polished by
 *     alternating searches along its whole u-line and v-line, then descended once more. A NURBS surface then gets branch and
 *     bound over its Bézier patches: a patch's net box is a lower bound on its distance (positive weights), so a patch that
 *     cannot beat the best is dropped and any other is searched from its middle and cut in four, up to LIMITS.patches.
 *     (S10's mutation run: a Gauss–Newton fallback and descents from the twelve best sampled minima, both from before the
 *     bound and the polish, no longer changed any answer and cost time; they went.)
 * The point returned is always the shape's own point at the parameters returned, so its distance is never below the true
 * minimum; the tests hold it to a brute-force search.
 * Tight boxes (§ 6.4: "tight via Bézier control hulls + subdivision to a requested slack"): the Bézier pieces' control hulls
 * hold the shape (positive weights); a piece whose hull reaches further than `slack` beyond the box of points actually on the
 * shape (the pieces' corners) is split in two, and its middle point joins that box, until no piece does. The answer is the
 * union of the hulls, widened by four ulps of the size against rounding in the splits: it holds the shape and lies within
 * slack of its true box.
 *
 *   closestOnCurve(c, p, tol) → { t, point, d } · invertCurve(c, p, tol) → t (refused when p is farther than tol.lin)
 *   closestOnSurface(s, p, tol) → { u, v, point, d } · invertSurface(s, p, tol) → [u, v]
 *   length(c, { a, b, eps }) → { value, error } (adaptive Gauss–Legendre per knot span; eps absolute, default tol.lin)
 *   area(s, { eps, tol }) → { value, error } (Gauss–Legendre products on every knot cell, halved where 8 and 16 points
 *     disagree; untrimmed surfaces: trimmed faces come with topology, S13 and S24)
 *   curveBox(c, { slack, tol }) · surfaceBox(s, { slack, tol }) → { min, max }   (slack default: max(tol.lin, 2^-20 · size))
 *
 * Refusals: solid.err.bad_input { name, why }: 'curve' 'not_a_curve'; 'surface' 'not_a_surface'; 'point' 'not_a_point';
 * 'p' 'not_on_curve' | 'not_on_surface' (inversion); 'slack', 'eps' 'not_positive'; 'a', 'b' 'out_of_domain';
 * solid.err.limit { what: 'pieces', limit, used } when a box or an area needs more than LIMITS.pieces pieces.
 */
import { fail } from '../core/errors.js';
import { resolveTol } from '../core/tol.js';
import { EPS, pow2, nextDown } from '../core/float.js';
import { PI } from '../core/trig.js';
import * as V3 from '../math/vec3.js';
import * as BX from '../math/aabb.js';
import * as Q from '../math/quad.js';
import { newton } from '../math/roots.js';
import * as C from './curve.js';
import * as SF from './surface.js';
import * as CV from './nurbs-curve.js';
import * as NSF from './nurbs-surface.js';

const BAD = 'solid.err.bad_input';
export const LIMITS = Object.freeze({ pieces: 200000, patches: 3000 });

/** The distance from p to a box { min, max } (0 inside). */
function boxDist(b, p) {
  let s = 0;
  for (let i = 0; i < 3; i++) { const d = p[i] < b.min[i] ? b.min[i] - p[i] : p[i] > b.max[i] ? p[i] - b.max[i] : 0; s += d * d; }
  return Math.sqrt(s);
}

/** A binary min-heap of { key, item }; equal keys leave in the order they came (a sequence number breaks ties). */
class Heap {
  constructor() { this.a = []; this.seq = 0; }
  get size() { return this.a.length; }
  less(i, j) { const x = this.a[i], y = this.a[j]; return x.key < y.key || (x.key === y.key && x.n < y.n); }
  push(key, item) {
    const a = this.a;
    a.push({ key, item, n: this.seq++ });
    for (let i = a.length - 1; i > 0;) { const up = (i - 1) >> 1; if (!this.less(i, up)) break; [a[i], a[up]] = [a[up], a[i]]; i = up; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.less(l, m)) m = l;
        if (r < a.length && this.less(r, m)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Raw Bézier patches for the searches: homogeneous nets H[i][j] = [wx, wy, wz, w] with their parameter ranges. Halving one
 * is de Casteljau at the middle (midpoints only: exact scalings by ½ and one rounding per sum, weights stay positive), with
 * none of the record checks a surface record would cost.
 */
function rawPatches(n) {
  return patches(n).map((q) => ({
    H: q.cvs.map((row, i) => row.map((P, j) => { const w = q.w ? q.w[i][j] : 1; return [P[0] * w, P[1] * w, P[2] * w, w]; })),
    u0: q.knotsU[0], u1: q.knotsU[q.knotsU.length - 1], v0: q.knotsV[0], v1: q.knotsV[q.knotsV.length - 1],
  }));
}
function halve(P) {
  const L = [P[0]], R = [P[P.length - 1]];
  let cur = P;
  while (cur.length > 1) {
    const next = [];
    for (let i = 0; i + 1 < cur.length; i++) { const a = cur[i], b = cur[i + 1]; next.push([0.5 * a[0] + 0.5 * b[0], 0.5 * a[1] + 0.5 * b[1], 0.5 * a[2] + 0.5 * b[2], 0.5 * a[3] + 0.5 * b[3]]); }
    L.push(next[0]);
    R.push(next[next.length - 1]);
    cur = next;
  }
  return [L, R.reverse()];
}
function rawSplit(q, dir) {
  const nu = q.H.length, nv = q.H[0].length;
  if (dir === 'u') {
    const A = Array.from({ length: nu }, () => []), B = Array.from({ length: nu }, () => []);
    for (let j = 0; j < nv; j++) { const [l, r] = halve(q.H.map((row) => row[j])); l.forEach((x, i) => A[i].push(x)); r.forEach((x, i) => B[i].push(x)); }
    const um = (q.u0 + q.u1) / 2;
    return [{ H: A, u0: q.u0, u1: um, v0: q.v0, v1: q.v1 }, { H: B, u0: um, u1: q.u1, v0: q.v0, v1: q.v1 }];
  }
  const A = [], B = [];
  for (const row of q.H) { const [l, r] = halve(row); A.push(l); B.push(r); }
  const vm = (q.v0 + q.v1) / 2;
  return [{ H: A, u0: q.u0, u1: q.u1, v0: q.v0, v1: vm }, { H: B, u0: q.u0, u1: q.u1, v0: vm, v1: q.v1 }];
}
function rawHull(q) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const row of q.H) for (const h of row) for (let k = 0; k < 3; k++) { const x = h[k] / h[3]; if (x < min[k]) min[k] = x; if (x > max[k]) max[k] = x; }
  return { min, max };
}
const rawCorner = (q, i, j) => { const h = q.H[i][j]; return [h[0] / h[3], h[1] / h[3], h[2] / h[3]]; };

function pointOf(p) {
  if (!V3.isVec3(p)) fail(BAD, { name: 'point', why: 'not_a_point' });
  return p;
}
function needCurve(c) { if (!C.isCurve(c)) fail(BAD, { name: 'curve', why: 'not_a_curve' }); return c; }
function needSurface(s) { if (!SF.isSurface(s)) fail(BAD, { name: 'surface', why: 'not_a_surface' }); return s; }

/** The breaks of a parameter direction: distinct knots for NURBS; pieces of at most π/4 for an angle; the ends otherwise. */
function breaks(lo, hi, knots, angle) {
  if (knots) return [...new Set(knots)].filter((x) => x >= lo && x <= hi);
  const n = angle ? Math.max(1, Math.ceil((hi - lo) / (PI / 4))) : 1, out = [lo];
  for (let k = 1; k < n; k++) out.push(lo + (hi - lo) * k / n);
  out.push(hi);
  return out;
}
const curveBreaks = (c) => {
  const [a, b] = C.domain(c);
  return breaks(a, b, c.type === 'nurbs' ? c.knots : null, c.type === 'circle' || c.type === 'ellipse');
};
const curveDegree = (c) => (c.type === 'nurbs' ? c.deg : c.type === 'line' ? 1 : 4);
const ANGLE_U = new Set(['cylinder', 'cone', 'sphere', 'torus', 'revolution']), ANGLE_V = new Set(['sphere', 'torus']);
function surfaceBreaks(s) {
  const [ua, ub] = SF.domainU(s), [va, vb] = SF.domainV(s);
  const profile = s.type === 'revolution' ? s.profile : s.type === 'extrusion' ? s.profile : null;
  const bu = s.type === 'nurbs' ? breaks(ua, ub, s.knotsU, false) : s.type === 'extrusion' ? curveBreaks(profile) : breaks(ua, ub, null, ANGLE_U.has(s.type));
  const bv = s.type === 'nurbs' ? breaks(va, vb, s.knotsV, false) : s.type === 'revolution' ? curveBreaks(profile) : breaks(va, vb, null, ANGLE_V.has(s.type));
  const pu = s.type === 'nurbs' ? s.degU : s.type === 'extrusion' ? curveDegree(profile) : s.type === 'plane' ? 1 : 4;
  const pv = s.type === 'nurbs' ? s.degV : s.type === 'revolution' ? curveDegree(profile) : s.type === 'plane' || s.type === 'cylinder' || s.type === 'cone' || s.type === 'extrusion' ? 1 : 4;
  return { bu, bv, pu, pv };
}

// ---------------------------------------------------------------------------------------------------- one dimension

/**
 * The parameter in [lo, hi] (with the given breaks) where a point-valued function F(t) → [P, P', P''] comes nearest to p;
 * Pt(t) is the shape's own point (the one returned, so a caller evaluating it gets the same bits). Returns { t, point, d }.
 */
function closest1(F, Pt, p, br, deg) {
  let best = null;
  const take = (t) => { const P0 = Pt(t), d = V3.dist(P0, p); if (!best || d < best.d || (d === best.d && t < best.t)) best = { t, point: P0, d }; };
  const m = 4 * (deg + 2) + 1;
  for (let k = 0; k + 1 < br.length; k++) {
    const a = br[k], b = br[k + 1], ts = [], ds = [];
    // inside a piece its own derivatives: at an interior knot the evaluator gives the next piece's, so the end is read
    // one double before it (the derivative is continuous inside the piece, so that is the piece's own to rounding)
    const last = k + 2 === br.length, bIn = last ? b : nextDown(b), Fi = (t) => F(t < bIn ? t : bIn);
    const gp = (t) => { const D = Fi(t); return 2 * V3.dot(D[1], V3.sub(D[0], p)); };
    const gpp = (t) => { const D = Fi(t); return 2 * (V3.dot(D[2], V3.sub(D[0], p)) + V3.dot(D[1], D[1])); };
    for (let i = 0; i <= m; i++) { const t = i === m ? b : a + (b - a) * i / m; ts.push(t); ds.push(V3.dist(F(t)[0], p)); take(t); }
    // every sample interval where g' goes from − to + holds a minimum of the distance: Newton, kept inside it. (A local
    // minimum of the sampled distances is not enough: two minima close together hide each other's brackets.)
    const gs = ts.map(gp);
    for (let i = 0; i < m; i++) {
      if (!(gs[i] < 0 && gs[i + 1] > 0)) continue;
      const x0 = ds[i] <= ds[i + 1] ? ts[i] : ts[i + 1];
      try { take(newton(gp, gpp, ts[i], ts[i + 1], { x0 }).x); } catch { /* the samples stand */ }
    }
  }
  return best;
}

export function closestOnCurve(c, p, tol) {
  needCurve(c);
  pointOf(p);
  resolveTol(tol);
  return Object.freeze(closest1((t) => C.derivs(c, t, 2), (t) => C.point(c, t), p, curveBreaks(c), curveDegree(c)));
}

export function invertCurve(c, p, tol) {
  const T = resolveTol(tol), r = closestOnCurve(c, p, T);
  if (!(r.d <= T.lin)) fail(BAD, { name: 'p', why: 'not_on_curve' });
  return r.t;
}

// ---------------------------------------------------------------------------------------------------- surfaces

export function closestOnSurface(s, p, tol) {
  needSurface(s);
  pointOf(p);
  resolveTol(tol);
  const [ua, ub] = SF.domainU(s), [va, vb] = SF.domainV(s), { bu, bv, pu, pv } = surfaceBreaks(s);
  const at = (u, v) => SF.point(s, u, v);
  let best = null;
  const take = (u, v, P0) => { const d = V3.dist(P0, p); if (!best || d < best.d) best = { u, v, point: P0, d }; };
  // samples on every cell
  const us = [], vs = [];
  const fill = (br, n, out) => { for (let k = 0; k + 1 < br.length; k++) for (let i = k ? 1 : 0; i <= n; i++) out.push(i === n ? br[k + 1] : br[k] + (br[k + 1] - br[k]) * i / n); };
  fill(bu, 2 * (pu + 2), us);
  fill(bv, 2 * (pv + 2), vs);
  let si = 0, sj = 0, sd = Infinity;                                       // the best sample (the first of equals)
  for (let i = 0; i < us.length; i++) for (let j = 0; j < vs.length; j++) { const d = V3.dist(at(us[i], vs[j]), p); if (d < sd) { sd = d; si = i; sj = j; } }
  // Newton's step on the gradient of |S − p|² / 2, halved until the point comes closer; it stops where no halving helps
  const descend = (u0, v0) => {
    let u = u0, v = v0, P0 = at(u, v), d = V3.dist(P0, p);
    take(u, v, P0);
    for (let it = 0; it < 100; it++) {
      const S = SF.derivs(s, u, v, 2), r = V3.sub(S[0][0], p), Su = S[1][0], Sv = S[0][1];
      const f = V3.dot(r, Su), g = V3.dot(r, Sv);
      const a11 = V3.dot(Su, Su) + V3.dot(r, S[2][0]), a12 = V3.dot(Su, Sv) + V3.dot(r, S[1][1]), a22 = V3.dot(Sv, Sv) + V3.dot(r, S[0][2]);
      const det = a11 * a22 - a12 * a12;
      if (!(Math.abs(det) > 0)) break;
      let du = -(a22 * f - a12 * g) / det, dv = -(a11 * g - a12 * f) / det, moved = false;
      for (let h = 0; h < 40; h++) {
        const un = Math.min(ub, Math.max(ua, u + du)), vn = Math.min(vb, Math.max(va, v + dv)), Pn = at(un, vn), dn = V3.dist(Pn, p);
        if (dn < d) { moved = un !== u || vn !== v; u = un; v = vn; P0 = Pn; d = dn; break; }
        du /= 2; dv /= 2;
      }
      take(u, v, P0);
      if (!moved) break;
    }
  };
  descend(us[si], vs[sj]);
  // a line of the surface as a curve: fixedU → the v-line at u = value, else the u-line at v = value
  const edge = (fixedU, value) => closest1(fixedU
    ? (t) => { const S = SF.derivs(s, value, t, 2); return [S[0][0], S[0][1], S[0][2]]; }
    : (t) => { const S = SF.derivs(s, t, value, 2); return [S[0][0], S[1][0], S[2][0]]; },
  fixedU ? (t) => at(value, t) : (t) => at(t, value), p, fixedU ? bv : bu, fixedU ? pv : pu);
  // the four boundary lines and every interior knot line (a valley of the distance can run along a kink of the surface,
  // where Newton's step from either side cannot settle on it)
  for (const [fixedU, value] of [...bu.map((x) => [true, x]), ...bv.map((x) => [false, x])]) {
    const r = edge(fixedU, value);
    if (fixedU) take(value, r.t, r.point); else take(r.t, value, r.point);
  }
  // polish the best: alternating searches along its u-line and v-line, each over the whole line (a narrow valley, or one
  // pressed against an edge, stalls a joint step but not these), then a last descent
  for (let round = 0; round < 24; round++) {
    const before = best.d;
    const ru = edge(false, best.v);
    take(ru.t, best.v, ru.point);
    const rv = edge(true, best.u);
    take(best.u, rv.t, rv.point);
    if (!(best.d < before)) break;
  }
  descend(best.u, best.v);
  // a NURBS surface: branch and bound over its Bézier patches. A patch's net box is a lower bound on its distance to p
  // (positive weights: the patch lies in its net's hull), so a patch whose bound cannot beat the best by more than a hair is
  // dropped, and any other is searched from its middle and cut in four. This is what finds a narrow valley the samples
  // straddle; it stops at LIMITS.patches patches (then the descents above stand).
  if (s.type === 'nurbs') {
    const size = V3.dist(...Object.values(NSF.bbox(s))) || 1, hair = (d) => 4 * EPS * size + d * pow2(-30);
    const heap = new Heap();
    for (const q of rawPatches(s)) heap.push(boxDist(rawHull(q), p), q);
    let pops = 0;
    while (heap.size && pops < LIMITS.patches) {
      const { key: lb, item: q } = heap.pop();
      if (lb >= best.d - hair(best.d)) break;
      pops++;
      const um = (q.u0 + q.u1) / 2, vm = (q.v0 + q.v1) / 2;
      if (V3.dist(at(um, vm), p) < best.d) descend(um, vm);         // a full descent only where the patch's middle is better
      if (!(um > q.u0 && um < q.u1 && vm > q.v0 && vm < q.v1)) continue;
      for (const half of rawSplit(q, 'u')) for (const quarter of rawSplit(half, 'v')) {
        const b = boxDist(rawHull(quarter), p);
        if (b < best.d - hair(best.d)) heap.push(b, quarter);
      }
    }
  }
  return Object.freeze(best);
}

export function invertSurface(s, p, tol) {
  const T = resolveTol(tol), r = closestOnSurface(s, p, T);
  if (!(r.d <= T.lin)) fail(BAD, { name: 'p', why: 'not_on_surface' });
  return [r.u, r.v];
}

// ---------------------------------------------------------------------------------------------------- length and area

export function length(c, { a, b, eps, tol } = {}) {
  needCurve(c);
  const T = resolveTol(tol), [ca, cb] = C.domain(c), lo = a === undefined ? ca : a, hi = b === undefined ? cb : b;
  for (const [name, x] of [['a', lo], ['b', hi]]) if (typeof x !== 'number' || !(x >= ca && x <= cb)) fail(BAD, { name, why: 'out_of_domain' });
  const e = eps === undefined ? T.lin : eps;
  if (!(e > 0)) fail(BAD, { name: 'eps', why: 'not_positive' });
  if (lo === hi) return Object.freeze({ value: 0, error: 0 });
  const [x0, x1] = lo < hi ? [lo, hi] : [hi, lo], br = curveBreaks(c).filter((x) => x > x0 && x < x1), cuts = [x0, ...br, x1];
  let value = 0, error = 0;
  for (let k = 0; k + 1 < cuts.length; k++) {
    const r = Q.adaptive((t) => V3.len(C.derivs(c, t, 1)[1]), cuts[k], cuts[k + 1], { eps: e / (cuts.length - 1) });
    value += r.value;
    error += r.error;
  }
  return Object.freeze({ value, error });
}

export function area(s, { eps, tol } = {}) {
  needSurface(s);
  const T = resolveTol(tol), e = eps === undefined ? T.lin : eps;
  if (!(e > 0)) fail(BAD, { name: 'eps', why: 'not_positive' });
  const { bu, bv } = surfaceBreaks(s), r8 = Q.rule(8), r16 = Q.rule(16);
  const cellArea = (u0, u1, v0, v1, rule) => {
    const hu = (u1 - u0) / 2, hv = (v1 - v0) / 2, mu = (u0 + u1) / 2, mv = (v0 + v1) / 2;
    let A = 0;
    for (let i = 0; i < rule.n; i++) for (let j = 0; j < rule.n; j++) {
      const D = SF.derivs(s, mu + hu * rule.x[i], mv + hv * rule.x[j], 1);
      A += rule.w[i] * rule.w[j] * V3.len(V3.cross(D[1][0], D[0][1]));
    }
    return A * hu * hv;
  };
  let value = 0, error = 0, pieces = 0;
  const cells = [];
  for (let i = 0; i + 1 < bu.length; i++) for (let j = 0; j + 1 < bv.length; j++) cells.push([bu[i], bu[i + 1], bv[j], bv[j + 1], 0]);
  const share = e / Math.max(1, cells.length);
  while (cells.length) {
    const [u0, u1, v0, v1, depth] = cells.pop();
    if (++pieces > LIMITS.pieces) fail('solid.err.limit', { what: 'pieces', limit: LIMITS.pieces, used: pieces });
    const a8 = cellArea(u0, u1, v0, v1, r8), a16 = cellArea(u0, u1, v0, v1, r16), d = Math.abs(a16 - a8);
    if (d <= share * pow2(-2 * depth) || depth >= 12) { value += a16; error += d; continue; }     // a quarter of the share per halving
    const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
    cells.push([u0, um, v0, vm, depth + 1], [um, u1, v0, vm, depth + 1], [u0, um, vm, v1, depth + 1], [um, u1, vm, v1, depth + 1]);
  }
  return Object.freeze({ value, error });
}

// ---------------------------------------------------------------------------------------------------- tight boxes

function hull(cvs) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const q of cvs) for (let i = 0; i < 3; i++) { if (q[i] < min[i]) min[i] = q[i]; if (q[i] > max[i]) max[i] = q[i]; }
  return { min, max };
}
const beyond = (h, box, slack) => [0, 1, 2].some((i) => h.min[i] < box.min[i] - slack || h.max[i] > box.max[i] + slack);
const grow = (box, p) => { for (let i = 0; i < 3; i++) { if (p[i] < box.min[i]) box.min[i] = p[i]; if (p[i] > box.max[i]) box.max[i] = p[i]; } };
function finish(hulls, size) {
  let box = BX.EMPTY;
  for (const h of hulls) box = BX.union(box, BX.box(h.min, h.max));
  return BX.inflate(box, 4 * EPS * size);
}
function slackOf(slack, T, h) {
  const size = V3.dist(h.min, h.max);
  const s = slack === undefined ? Math.max(T.lin, size * pow2(-20)) : slack;
  if (!(s > 0)) fail(BAD, { name: 'slack', why: 'not_positive' });
  return { s, size: Math.max(size, Math.abs(h.min[0]), Math.abs(h.max[0]), Math.abs(h.min[1]), Math.abs(h.max[1]), Math.abs(h.min[2]), Math.abs(h.max[2])) };
}

export function curveBox(c, { slack, tol } = {}) {
  needCurve(c);
  const T = resolveTol(tol), n = C.toNurbs(c), { s, size } = slackOf(slack, T, hull(n.cvs));
  let pieces = [...CV.decompose(n)];
  const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const q of pieces) { grow(box, q.cvs[0]); grow(box, q.cvs[q.cvs.length - 1]); }
  const done = [];
  let count = pieces.length;
  while (pieces.length) {
    const q = pieces.pop(), h = hull(q.cvs);
    if (!beyond(h, box, s)) { done.push(h); continue; }
    const [a, b] = CV.domain(q), m = (a + b) / 2;
    if (!(m > a && m < b)) { done.push(h); continue; }
    const [l, r] = CV.split(q, m);
    grow(box, l.cvs[l.cvs.length - 1]);
    pieces.push(l, r);
    if (++count > LIMITS.pieces) fail('solid.err.limit', { what: 'pieces', limit: LIMITS.pieces, used: count });
  }
  return finish(done, size);
}

/** A NURBS surface's Bézier patches: every interior knot raised to full multiplicity, then the net cut per cell. */
function patches(n) {
  let s = n;
  for (const dir of ['u', 'v']) {
    const K = dir === 'u' ? s.knotsU : s.knotsV, p = dir === 'u' ? s.degU : s.degV;
    for (const x of new Set(K)) {
      const [a, b] = dir === 'u' ? NSF.domainU(s) : NSF.domainV(s);
      if (!(x > a && x < b)) continue;
      const have = (dir === 'u' ? s.knotsU : s.knotsV).filter((y) => y === x).length;
      if (have < p) s = NSF.insertKnot(s, dir, x, p - have);
    }
  }
  const pu = s.degU, pv = s.degV, ku = [...new Set(s.knotsU)], kv = [...new Set(s.knotsV)], out = [];
  for (let a = 0; a + 1 < ku.length; a++) for (let b = 0; b + 1 < kv.length; b++) {
    const cvs = [], w = s.w ? [] : null;
    for (let i = 0; i <= pu; i++) { cvs.push(s.cvs[a * pu + i].slice(b * pv, b * pv + pv + 1)); if (w) w.push(s.w[a * pu + i].slice(b * pv, b * pv + pv + 1)); }
    out.push(NSF.make({ degU: pu, degV: pv, knotsU: [...new Array(pu + 1).fill(ku[a]), ...new Array(pu + 1).fill(ku[a + 1])], knotsV: [...new Array(pv + 1).fill(kv[b]), ...new Array(pv + 1).fill(kv[b + 1])], cvs, w }));
  }
  return out;
}

export function surfaceBox(s, { slack, tol } = {}) {
  needSurface(s);
  const T = resolveTol(tol), n = SF.toNurbs(s), { s: sl, size } = slackOf(slack, T, hull(n.cvs.flat()));
  const pieces = rawPatches(n);
  const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const corners = (q) => { const nu = q.H.length - 1, nv = q.H[0].length - 1; for (const [i, j] of [[0, 0], [0, nv], [nu, 0], [nu, nv]]) grow(box, rawCorner(q, i, j)); };
  for (const q of pieces) corners(q);
  const done = [];
  let count = pieces.length;
  while (pieces.length) {
    const q = pieces.pop(), h = rawHull(q);
    if (!beyond(h, box, sl)) { done.push(h); continue; }
    // split along the direction in which the net reaches further (its longest control polygon that way): a length, so the
    // widths of the two parameter ranges, which may differ by any factor, play no part
    const nu = q.H.length, nv = q.H[0].length;
    let extU = 0, extV = 0;
    for (let j = 0; j < nv; j++) { let l = 0; for (let i = 1; i < nu; i++) l += V3.dist(rawCorner(q, i, j), rawCorner(q, i - 1, j)); extU = Math.max(extU, l); }
    for (let i = 0; i < nu; i++) { let l = 0; for (let j = 1; j < nv; j++) l += V3.dist(rawCorner(q, i, j), rawCorner(q, i, j - 1)); extV = Math.max(extV, l); }
    const [A, B] = rawSplit(q, extU >= extV ? 'u' : 'v');
    corners(A); corners(B);
    pieces.push(A, B);
    if (++count > LIMITS.pieces) fail('solid.err.limit', { what: 'pieces', limit: LIMITS.pieces, used: count });
  }
  return finish(done, size);
}
