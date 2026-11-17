/* SPDX-License-Identifier: Apache-2.0 */
/**
 * conic.js — parabola and hyperbola arcs as one entity type, `conic`. No DOM; its one import is spline.js, which has none
 * either (bin/test-cadcraft-conic.mjs runs both in Node). Nothing else in the app uses this file yet: it is the kernel the
 * rest of the conic work (drawing, editing, files) is built on, and it is tested on its own.
 *
 * Written from standard analytic geometry (conic sections, the 2 × 2 symmetric eigenproblem) and the rational Bézier form of
 * a conic arc. Nothing is copied from another program or library.
 *
 * ── The entity ───────────────────────────────────────────────────────────────────────────────────────────────────────────
 *   { type: 'conic', kind: 'parabola' | 'hyperbola', cx, cy, ux, uy, vx, vy, t0, t1, …layer, color, linetype, … }
 *
 *   parabola    P(t) = c + t·u + t²·v             t in [t0, t1]
 *   hyperbola   P(t) = c + cosh t·u + sinh t·v    t in [t0, t1]     (u → −u is the other branch)
 *
 * with c = (cx, cy), u = (ux, uy), v = (vx, vy). One entity is one connected arc: a parabola arc, or an arc of one branch of a
 * hyperbola. This form is closed under every affine map P → A·P + b (move, rotate, mirror, uniform and non-uniform scale,
 * shear): the image is the same kind of conic with c' = A·c + b, u' = A·u, v' = A·v and the same t0, t1. So no map needs a
 * special case, and a block inserted with unequal X and Y scale needs none either.
 *
 * ── The numbers people edit ("canonical" values), derived on demand ──────────────────────────────────────────────────────
 *   parabola    axis = v / |v| (the way it opens); focal length f = κ² / (4·|v|) with κ = u × v / |v|; vertex at
 *               t* = −(u·v) / (2·v·v); focus = vertex + f·axis; the sideways coordinate of a point is s = κ·(t − t*).
 *   hyperbola   a² and −b² are the eigenvalues of the symmetric matrix u·uᵀ − v·vᵀ (its determinant is −(u × v)², so one is
 *               always positive and one negative); the transverse axis e is the eigenvector of a², pointing to the branch;
 *               centre c, vertex c + a·e, foci c ± √(a² + b²)·e, eccentricity √(a² + b²) / a. Another conjugate pair (u, v)
 *               of the same hyperbola differs from (a·e, b·n) by a shift φ of the parameter (cosh/sinh addition), so the
 *               canonical parameter is τ = t + φ with φ = asinh((v·e) / a).
 *
 * ── Geometry for everything else: an exact conversion to a rational quadratic spline ─────────────────────────────────────
 *   parabola    one span, an ordinary quadratic Bézier: Q0 = P(t0), Q1 = c + ((t0 + t1) / 2)·u + t0·t1·v, Q2 = P(t1).
 *   hyperbola   spans no wider than SPAN in t; a span [a, b] with h = (b − a) / 2 and tm = (a + b) / 2 has Q0 = P(a),
 *               Q2 = P(b), Q1 = c + (P(tm) − c) / cosh h, weights (1, cosh h, 1). Proof: by the arc's symmetry about tm its
 *               end tangents meet on the axis through P(tm) at Q1, and the middle of the Bézier must be P(tm), which gives
 *               w = cosh h. The spans join in one clamped degree 2 spline with interior knots of multiplicity 2.
 *   Drawing, picking, snaps, plotting and the DWG / DXF SPLINE all come from that spline (spline.js), cached per entity.
 *
 * ── Functions (entities are plain objects, never changed in place) ───────────────────────────────────────────────────────
 *   valid(e)                 → boolean
 *   domain(e) / ends(e)      → [t0, t1] / { start, end }
 *   pointAt(e, t)            → { x, y };  tangentAt(e, t) → { x, y } (not normalised)
 *   parabola({ vertex, angle, f, s0, s1 })                         → entity | null   (angle: the way it opens; s: sideways)
 *   hyperbola({ center, angle, a, b, t0, t1, branch = 1 })         → entity | null   (angle: transverse axis; branch ±1)
 *   canonical(e)             → the numbers above, with the vertex, focus, axis and ends, or null
 *   transform(e, m)          → the image under m = [a, b, c, d, e, f] (geom.js's matrices), or null when m is singular
 *   spans(e)                 → { degree: 2, ctrl, knots, weights | null }   plain data
 *   toSpline(e)              → a spline.js entity with the same curve, or null
 *   points(e, { tol })       → the curve as points (spline.js flattening); cached per entity
 *   closest(e, p)            → { t, x, y, dist }, the nearest point of the arc to p
 *   length(e, ta, tb)        → the arc's length (between two parameters when given): a parabola's from its closed form,
 *                              a hyperbola's by adaptive quadrature; the whole arc's is cached per entity
 *   middle(e)                → { t, x, y }, the point half way along the arc by length; cached per entity
 *   bounds(e)                → { minX, minY, maxX, maxY } of the arc, exactly: its ends and the points where it runs level or upright
 *   fromFivePoints(pts)      → { ok: true, kind: 'ellipse' | 'parabola' | 'hyperbola', entity } | { ok: false, error }
 *                              error: 'points' (not five finite points), 'degenerate' (a pair of lines, repeated or
 *                              collinear points), 'imaginary', 'branches' (points on both branches of a hyperbola),
 *                              'range' (an arc beyond the size limits: a hyperbola past T_MAX, a parabola past 1e12),
 *                              'inaccurate' (the result misses one of the points: five points that lie almost in a line)
 *                              An ellipse comes back as CadCraft's own `ellipse` entity (a full one); a parabola or a
 *                              hyperbola as the arc between the first and last of the five points along the curve.
 *
 * Errors are codes, never words: the commands that use these functions say them in the person's language.
 */
import { fromFile as splineFromFile, points as splinePoints } from './spline.js';

/** A hyperbola is limited to |t| ≤ T_MAX: cosh 20 is about 2.4e8, past which the numbers stop being useful. */
export const T_MAX = 20;
/** The widest hyperbola span in t. Weights are cosh(width / 2), so spans this narrow keep them below 1.55. */
export const SPAN = 1.5;
/** No point of an arc may lie further from the origin than this. */
const COORD_MAX = 1e12;
const TAU = Math.PI * 2;

const fin = (...v) => v.every(Number.isFinite);
const cross = (ax, ay, bx, by) => ax * by - ay * bx;

// ── The entity ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export function valid(e) {
  if (!e || e.type !== 'conic' || (e.kind !== 'parabola' && e.kind !== 'hyperbola')) return false;
  if (!fin(e.cx, e.cy, e.ux, e.uy, e.vx, e.vy, e.t0, e.t1) || !(e.t1 > e.t0)) return false;
  const lu = Math.hypot(e.ux, e.uy), lv = Math.hypot(e.vx, e.vy);
  if (!(lu > 0) || !(lv > 0) || Math.abs(cross(e.ux, e.uy, e.vx, e.vy)) <= 1e-9 * lu * lv) return false;   // u and v must be independent
  const tm = Math.max(Math.abs(e.t0), Math.abs(e.t1));
  if (e.kind === 'hyperbola') {
    if (tm > T_MAX) return false;
    return Math.hypot(e.cx, e.cy) + Math.cosh(tm) * lu + Math.sinh(tm) * lv <= COORD_MAX;
  }
  return Math.hypot(e.cx, e.cy) + tm * lu + tm * tm * lv <= COORD_MAX;
}

export const domain = (e) => [e.t0, e.t1];

export function pointAt(e, t) {
  if (e.kind === 'parabola') return { x: e.cx + t * e.ux + t * t * e.vx, y: e.cy + t * e.uy + t * t * e.vy };
  const ch = Math.cosh(t), sh = Math.sinh(t);
  return { x: e.cx + ch * e.ux + sh * e.vx, y: e.cy + ch * e.uy + sh * e.vy };
}

export function tangentAt(e, t) {
  if (e.kind === 'parabola') return { x: e.ux + 2 * t * e.vx, y: e.uy + 2 * t * e.vy };
  const ch = Math.cosh(t), sh = Math.sinh(t);
  return { x: sh * e.ux + ch * e.vx, y: sh * e.uy + ch * e.vy };
}

export const ends = (e) => ({ start: pointAt(e, e.t0), end: pointAt(e, e.t1) });

// ── Making one from the numbers people type ──────────────────────────────────────────────────────────────────────────────

/** A parabola from its vertex, the angle it opens toward (radians), its focal length f > 0 and the sideways extent s0 … s1. */
export function parabola({ vertex, angle, f, s0, s1 }) {
  if (!vertex || !fin(vertex.x, vertex.y, angle, f, s0, s1) || !(f > 0) || s0 === s1) return null;
  const dx = Math.cos(angle), dy = Math.sin(angle);   // the axis; the sideways direction is the axis turned −90°
  const e = { type: 'conic', kind: 'parabola', cx: vertex.x, cy: vertex.y, ux: dy, uy: -dx, vx: dx / (4 * f), vy: dy / (4 * f), t0: Math.min(s0, s1), t1: Math.max(s0, s1) };
  return valid(e) ? e : null;
}

/** A hyperbola from its centre, the angle of its transverse axis, the semi-axes a, b > 0, the parameter range t0 … t1 and
 *  the branch: 1 is the one on the axis's side, −1 the opposite one. */
export function hyperbola({ center, angle, a, b, t0, t1, branch = 1 }) {
  if (!center || !fin(center.x, center.y, angle, a, b, t0, t1) || !(a > 0) || !(b > 0) || (branch !== 1 && branch !== -1) || t0 === t1) return null;
  const ex = Math.cos(angle), ey = Math.sin(angle);
  const e = { type: 'conic', kind: 'hyperbola', cx: center.x, cy: center.y, ux: branch * a * ex, uy: branch * a * ey, vx: -b * ey, vy: b * ex, t0: Math.min(t0, t1), t1: Math.max(t0, t1) };
  return valid(e) ? e : null;
}

// ── The numbers people edit, from the entity ─────────────────────────────────────────────────────────────────────────────

export function canonical(e) {
  if (!valid(e)) return null;
  const ends2 = ends(e);
  if (e.kind === 'parabola') {
    const lv = Math.hypot(e.vx, e.vy), d = { x: e.vx / lv, y: e.vy / lv }, n = { x: d.y, y: -d.x };
    const kappa = cross(e.ux, e.uy, e.vx, e.vy) / lv;                     // u's sideways part (u = κ·n + (u·d)·d)
    const tStar = -(e.ux * e.vx + e.uy * e.vy) / (2 * lv * lv);
    const f = kappa * kappa / (4 * lv), vertex = pointAt(e, tStar);
    const sa = kappa * (e.t0 - tStar), sb = kappa * (e.t1 - tStar);
    return { kind: 'parabola', vertex, angle: Math.atan2(d.y, d.x), f, focus: { x: vertex.x + f * d.x, y: vertex.y + f * d.y },
      axis: d, normal: n, s0: Math.min(sa, sb), s1: Math.max(sa, sb), tStar, kappa, start: ends2.start, end: ends2.end };
  }
  const m11 = e.ux * e.ux - e.vx * e.vx, m12 = e.ux * e.uy - e.vx * e.vy, m22 = e.uy * e.uy - e.vy * e.vy;   // u·uᵀ − v·vᵀ
  const half = (m11 - m22) / 2, disc = Math.hypot(half, m12), mean = (m11 + m22) / 2;
  const a2 = mean + disc, b2 = -(mean - disc);
  const th = 0.5 * Math.atan2(2 * m12, m11 - m22);                         // the eigenvector of the positive eigenvalue
  let ex = Math.cos(th), ey = Math.sin(th);
  if (e.ux * ex + e.uy * ey < 0) { ex = -ex; ey = -ey; }                   // pointing to the branch
  const a = Math.sqrt(a2), b = Math.sqrt(b2), cf = Math.sqrt(a2 + b2);
  const s = e.vx * -ey + e.vy * ex >= 0 ? 1 : -1;                          // which way the second axis runs
  const n = { x: -ey * s, y: ex * s }, phi = Math.asinh((e.vx * ex + e.vy * ey) / a);
  const centre = { x: e.cx, y: e.cy };
  return { kind: 'hyperbola', center: centre, angle: Math.atan2(ey, ex), a, b, c: cf, eccentricity: cf / a, axis: { x: ex, y: ey }, normal: n, handed: s, phi,
    vertex: { x: e.cx + a * ex, y: e.cy + a * ey }, focus: { x: e.cx + cf * ex, y: e.cy + cf * ey }, otherFocus: { x: e.cx - cf * ex, y: e.cy - cf * ey },
    tau0: e.t0 + phi, tau1: e.t1 + phi, start: ends2.start, end: ends2.end };
}

// ── Affine maps ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The image of a conic under m = [a, b, c, d, e, f] (x' = a·x + c·y + e, y' = b·x + d·y + f, as geom.js's matrices). */
export function transform(e, m) {
  if (!valid(e) || !Array.isArray(m) || m.length < 6 || !m.every(Number.isFinite)) return null;
  const out = { ...e, cx: m[0] * e.cx + m[2] * e.cy + m[4], cy: m[1] * e.cx + m[3] * e.cy + m[5],
    ux: m[0] * e.ux + m[2] * e.uy, uy: m[1] * e.ux + m[3] * e.uy, vx: m[0] * e.vx + m[2] * e.vy, vy: m[1] * e.vx + m[3] * e.vy };
  return valid(out) ? out : null;
}

// ── The exact spline ─────────────────────────────────────────────────────────────────────────────────────────────────────

export function spans(e) {
  if (!valid(e)) return null;
  const P = (t) => pointAt(e, t);
  const n = e.kind === 'hyperbola' ? Math.max(1, Math.ceil((e.t1 - e.t0) / SPAN - 1e-9)) : 1;
  const h = (e.t1 - e.t0) / n;
  const ctrl = [P(e.t0)], weights = [1], knots = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const a = e.t0 + i * h, b = i === n - 1 ? e.t1 : a + h;
    if (e.kind === 'parabola') {
      ctrl.push({ x: e.cx + (a + b) / 2 * e.ux + a * b * e.vx, y: e.cy + (a + b) / 2 * e.uy + a * b * e.vy }); weights.push(1);
    } else {
      const hh = (b - a) / 2, pm = P((a + b) / 2), ch = Math.cosh(hh);
      ctrl.push({ x: e.cx + (pm.x - e.cx) / ch, y: e.cy + (pm.y - e.cy) / ch }); weights.push(ch);
    }
    ctrl.push(i === n - 1 ? P(e.t1) : P(b)); weights.push(1);
    if (i < n - 1) knots.push(i + 1, i + 1);
  }
  knots.push(n, n, n);
  return { degree: 2, ctrl, knots, weights: e.kind === 'hyperbola' ? weights : null };
}

export function toSpline(e) {
  const s = spans(e);
  return s ? splineFromFile({ degree: 2, closed: false, periodic: false, ctrl: s.ctrl, knots: s.knots, weights: s.weights || undefined }) : null;
}

const cache = new WeakMap();   // conic entity object → its spline (entities are replaced, never changed in place, as spline.js's cache assumes)
export function splineOf(e) {
  if (!e || typeof e !== 'object') return null;
  if (cache.has(e)) return cache.get(e);
  const sp = toSpline(e);
  cache.set(e, sp);
  return sp;
}

/** The curve as points no further than tol from it (spline.js's own default, a small share of the arc's size, when 0). */
export function points(e, { tol = 0 } = {}) {
  const sp = splineOf(e);
  return sp ? splinePoints(sp, { tol }) : [];
}

// ── The nearest point of the arc ─────────────────────────────────────────────────────────────────────────────────────────

/** The point of the arc nearest p: { t, x, y, dist }. A scan of the arc, then golden-section refinement around the best sample. */
export function closest(e, p) {
  if (!valid(e) || !p || !fin(p.x, p.y)) return null;
  const f = (t) => { const q = pointAt(e, t); return (q.x - p.x) ** 2 + (q.y - p.y) ** 2; };
  const N = 256, w = e.t1 - e.t0;
  let bi = 0, bf = Infinity;
  for (let i = 0; i <= N; i++) { const v = f(e.t0 + w * i / N); if (v < bf) { bf = v; bi = i; } }
  let lo = e.t0 + w * Math.max(0, bi - 1) / N, hi = e.t0 + w * Math.min(N, bi + 1) / N;
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - g * (hi - lo), x2 = lo + g * (hi - lo), f1 = f(x1), f2 = f(x2);
  for (let k = 0; k < 90; k++) {
    if (f1 < f2) { hi = x2; x2 = x1; f2 = f1; x1 = hi - g * (hi - lo); f1 = f(x1); } else { lo = x1; x1 = x2; f1 = f2; x2 = lo + g * (hi - lo); f2 = f(x2); }
  }
  let t = (lo + hi) / 2;
  const q = pointAt(e, t);
  for (const c of [e.t0, e.t1]) { const qc = pointAt(e, c); if ((qc.x - p.x) ** 2 + (qc.y - p.y) ** 2 < (q.x - p.x) ** 2 + (q.y - p.y) ** 2) { t = c; } }   // an end beats a tie
  const r = pointAt(e, t);
  return { t, x: r.x, y: r.y, dist: Math.hypot(r.x - p.x, r.y - p.y) };
}

// ── Bounds ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The arc's exact extents: its two ends, and where its tangent is horizontal or vertical inside the range. */
export function bounds(e) {
  if (!valid(e)) return null;
  const ts = [e.t0, e.t1];
  for (const [u, v] of [[e.ux, e.vx], [e.uy, e.vy]]) {   // x'(t) = 0, then y'(t) = 0
    let t = null;
    if (e.kind === 'parabola') { if (v !== 0) t = -u / (2 * v); }             // u + 2·t·v = 0
    else if (Math.abs(v) < Math.abs(u)) t = Math.atanh(-v / u);                // u·sinh t + v·cosh t = 0
    if (t !== null && t > e.t0 && t < e.t1) ts.push(t);
  }
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const t of ts) { const p = pointAt(e, t); b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x); b.minY = Math.min(b.minY, p.y); b.maxY = Math.max(b.maxY, p.y); }
  return b;
}

// ── Length ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** ∫ f over [a, b] by adaptive Simpson, to about 1e-13 of its size. */
function integrate(f, a, b) {
  const fa = f(a), fb = f(b), m = (a + b) / 2, fm = f(m), whole = (b - a) / 6 * (fa + 4 * fm + fb);
  const step = (a2, fa2, m2, fm2, b2, fb2, s, depth) => {
    const l = (a2 + m2) / 2, r = (m2 + b2) / 2, fl = f(l), fr = f(r);
    const left = (m2 - a2) / 6 * (fa2 + 4 * fl + fm2), right = (b2 - m2) / 6 * (fm2 + 4 * fr + fb2), d = left + right - s;
    if (depth <= 0 || Math.abs(d) <= 1e-13 * Math.abs(left + right)) return left + right + d / 15;
    return step(a2, fa2, l, fl, m2, fm2, left, depth - 1) + step(m2, fm2, r, fr, b2, fb2, right, depth - 1);
  };
  return step(a, fa, m, fm, b, fb, whole, 40);
}

function rawLength(e, ta, tb) {
  if (e.kind === 'parabola') {
    // in the sideways coordinate s the curve is w = s² / (4f): ∫ √(1 + (s / 2f)²) ds = f·(x·√(1 + x²) + asinh x) with x = s / (2f)
    const lv = Math.hypot(e.vx, e.vy), kappa = cross(e.ux, e.uy, e.vx, e.vy) / lv, tStar = -(e.ux * e.vx + e.uy * e.vy) / (2 * lv * lv), f = kappa * kappa / (4 * lv);
    const F = (t) => { const x = kappa * (t - tStar) / (2 * f); return f * (x * Math.sqrt(1 + x * x) + Math.asinh(x)); };
    return Math.abs(F(tb) - F(ta));
  }
  const speed = (t) => { const d = tangentAt(e, t); return Math.hypot(d.x, d.y); };
  let sum = 0;
  const n = Math.max(1, Math.ceil((tb - ta) / 0.5));   // pieces no wider than 0.5: the speed grows like cosh t
  for (let i = 0; i < n; i++) sum += integrate(speed, ta + (tb - ta) * i / n, ta + (tb - ta) * (i + 1) / n);
  return sum;
}

const measures = new WeakMap();   // conic entity object → { length, middle } (entities are replaced, never changed in place)
const measureOf = (e) => { let m = measures.get(e); if (!m) { m = {}; measures.set(e, m); } return m; };

/** The length of the arc, or of its part between the parameters ta and tb. */
export function length(e, ta = undefined, tb = undefined) {
  if (!valid(e)) return null;
  if (ta === undefined && tb === undefined) { const m = measureOf(e); if (m.length === undefined) m.length = rawLength(e, e.t0, e.t1); return m.length; }
  if (!fin(ta, tb)) return null;
  return rawLength(e, Math.min(ta, tb), Math.max(ta, tb));
}

/** The point half way along the arc by length: { t, x, y }. Bisection on the length, which only grows with t. */
export function middle(e) {
  if (!valid(e)) return null;
  const m = measureOf(e);
  if (!m.middle) {
    const half = length(e) / 2;
    let lo = e.t0, hi = e.t1;
    for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (rawLength(e, e.t0, mid) < half) lo = mid; else hi = mid; }
    const t = (lo + hi) / 2, p = pointAt(e, t);
    m.middle = { t, x: p.x, y: p.y };
  }
  return { ...m.middle };
}

// ── The conic through five points ────────────────────────────────────────────────────────────────────────────────────────

/** The one-dimensional null space of five equations in six unknowns, or null when their rank is below five. */
function nullVector(rows) {
  const m = rows.map((r) => r.slice()), used = new Array(6).fill(false), colOf = [];
  for (let k = 0; k < 5; k++) {
    let best = 0, bi = -1, bj = -1;
    for (let i = k; i < 5; i++) for (let j = 0; j < 6; j++) if (!used[j] && Math.abs(m[i][j]) > best) { best = Math.abs(m[i][j]); bi = i; bj = j; }
    if (best < 1e-10) return null;
    [m[k], m[bi]] = [m[bi], m[k]];
    used[bj] = true; colOf.push(bj);
    const pv = m[k][bj];
    for (let j = 0; j < 6; j++) m[k][j] /= pv;
    for (let i = 0; i < 5; i++) if (i !== k) { const q = m[i][bj]; if (q !== 0) for (let j = 0; j < 6; j++) m[i][j] -= q * m[k][j]; }
  }
  const free = used.findIndex((u) => !u), x = new Array(6).fill(0);
  x[free] = 1;
  for (let k = 0; k < 5; k++) x[colOf[k]] = -m[k][free];
  const len = Math.hypot(...x);
  return x.map((v) => v / len);
}

const DEGENERATE = 1e-10;   // |det| of the unit-norm conic matrix below which the conic is a pair of lines
const PARABOLIC = 1e-9;     // |det| of its quadratic part, relative to that part's size, below which it is a parabola

export function fromFivePoints(pts) {
  if (!Array.isArray(pts) || pts.length !== 5 || !pts.every((p) => p && fin(p.x, p.y))) return { ok: false, error: 'points' };
  // work in a frame of unit size around the points' centre: the answer is mapped back with an affine transform at the end
  const x0 = pts.reduce((s, p) => s + p.x, 0) / 5, y0 = pts.reduce((s, p) => s + p.y, 0) / 5;
  const r = Math.sqrt(pts.reduce((s, p) => s + (p.x - x0) ** 2 + (p.y - y0) ** 2, 0) / 5);
  if (!(r > 0)) return { ok: false, error: 'degenerate' };
  const q = pts.map((p) => ({ x: (p.x - x0) / r, y: (p.y - y0) / r }));
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) if (Math.hypot(q[i].x - q[j].x, q[i].y - q[j].y) < 1e-9) return { ok: false, error: 'degenerate' };
  const x = nullVector(q.map(({ x: px, y: py }) => [px * px, px * py, py * py, px, py, 1]));
  if (!x) return { ok: false, error: 'degenerate' };
  const [A, B, C, D, E, F] = x;
  const dQ = A * C - B * B / 4;
  const M = [[A, B / 2, D / 2], [B / 2, C, E / 2], [D / 2, E / 2, F]];
  const dM = M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  if (Math.abs(dM) < DEGENERATE) return { ok: false, error: 'degenerate' };
  const qn = A * A + B * B / 2 + C * C;
  const back = [r, 0, 0, r, x0, y0];   // the frame's map into the drawing
  let kind, entity;
  if (Math.abs(dQ) <= PARABOLIC * qn) {
    // parabola: A x² + B xy + C y² is λ·(n·p)², with n the unit eigenvector of the one non-zero eigenvalue λ = A + C
    kind = 'parabola';
    const lam = A + C, th = 0.5 * Math.atan2(B, A - C) + (lam >= 0 ? 0 : Math.PI / 2);
    const n = { x: Math.cos(th), y: Math.sin(th) }, d = { x: -n.y, y: n.x };
    const gd = D * d.x + E * d.y, gn = D * n.x + E * n.y;
    if (Math.abs(gd) < 1e-9) return { ok: false, error: 'degenerate' };
    const al = -lam / gd, be = -gn / gd, ga = -F / gd;   // along d: w = α s² + β s + γ, with s the coordinate along n
    const ss = q.map((p) => p.x * n.x + p.y * n.y);
    const ent = { type: 'conic', kind, cx: ga * d.x, cy: ga * d.y, ux: n.x + be * d.x, uy: n.y + be * d.y, vx: al * d.x, vy: al * d.y, t0: Math.min(...ss), t1: Math.max(...ss) };
    entity = transform(ent, back);
  } else {
    // a central conic: centre from Q·c = −(D, E)/2, then λ1·X² + λ2·Y² + F' = 0 along Q's eigenvectors
    const cx = (-D * C / 2 + B * E / 4) / dQ, cy = (-A * E / 2 + B * D / 4) / dQ, F2 = F + (D * cx + E * cy) / 2;
    const mean = (A + C) / 2, disc = Math.hypot((A - C) / 2, B / 2), l1 = mean + disc, l2 = mean - disc, th = 0.5 * Math.atan2(B, A - C);
    const e1 = { x: Math.cos(th), y: Math.sin(th) }, e2 = { x: -e1.y, y: e1.x };
    const ta = -F2 / l1, tb = -F2 / l2;
    if (dQ > 0) {
      kind = 'ellipse';
      if (!(ta > 0 && tb > 0)) return { ok: false, error: 'imaginary' };
      const a1 = Math.sqrt(ta), a2 = Math.sqrt(tb), major = a1 >= a2 ? e1 : e2, ma = Math.max(a1, a2), mi = Math.min(a1, a2);
      entity = { type: 'ellipse', cx: r * cx + x0, cy: r * cy + y0, mx: r * ma * major.x, my: r * ma * major.y, ratio: mi / ma, t0: 0, t1: TAU };
    } else {
      kind = 'hyperbola';
      const first = ta > 0, a = Math.sqrt(first ? ta : tb), b = Math.sqrt(first ? -tb : -ta);
      let ax = first ? e1 : e2;
      const xs = q.map((p) => (p.x - cx) * ax.x + (p.y - cy) * ax.y);
      if (xs.every((v) => v < 0)) ax = { x: -ax.x, y: -ax.y };
      else if (!xs.every((v) => v > 0)) return { ok: false, error: 'branches' };
      const nn = { x: -ax.y, y: ax.x };
      const ts = q.map((p) => Math.asinh(((p.x - cx) * nn.x + (p.y - cy) * nn.y) / b));
      const ent = hyperbola({ center: { x: cx, y: cy }, angle: Math.atan2(ax.y, ax.x), a, b, t0: Math.min(...ts), t1: Math.max(...ts) });   // null past T_MAX
      entity = ent && transform(ent, back);
    }
  }
  if (!entity) return { ok: false, error: kind === 'hyperbola' || kind === 'parabola' ? 'range' : 'degenerate' };
  // an answer that misses one of the five points is refused, not returned: five points that are nearly in a line (an arc whose
  // bulge is under a fraction of a percent of its span) hardly determine a conic, and rounding decides which one comes out
  if (entity.type === 'conic') {
    const tol = 1e-6 * r;
    for (const p of pts) { const c = closest(entity, p); if (!c || c.dist > tol) return { ok: false, error: 'inaccurate' }; }
  } else {
    // an ellipse: the first-order distance of each point from it (|f| / |grad f| for f = X²/a² + Y²/b² − 1), as a conic's is above;
    // a plain residual would let a huge, nearly flat ellipse miss a point by a large distance
    const a = Math.hypot(entity.mx, entity.my), b = a * entity.ratio, ux = entity.mx / a, uy = entity.my / a;
    for (const p of pts) {
      const dx = p.x - entity.cx, dy = p.y - entity.cy, X = dx * ux + dy * uy, Y = -dx * uy + dy * ux;
      const f = (X / a) ** 2 + (Y / b) ** 2 - 1, g = 2 * Math.hypot(X / (a * a), Y / (b * b));
      if (!(g > 0) || !(Math.abs(f) / g <= 1e-6 * r)) return { ok: false, error: 'inaccurate' };
    }
  }
  return { ok: true, kind, entity };
}
