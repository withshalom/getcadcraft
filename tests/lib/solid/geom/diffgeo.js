/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * diffgeo.js — cc-solid (S7, docs/solid/HANDOFF.md § 6.1, § 6.2): the differential geometry of curves and surfaces, from
 * their derivatives, for every kind of curve and surface (NURBS and analytic). DOM-free; imports core/ and math/vec3.js.
 * Moved here in S7 from nurbs-curve.js (S5) and nurbs-surface.js (S6), unchanged in what it computes.
 *
 * Curves, from [C, C', C'', C'''] at one parameter:
 *   tangent(D) → C' / |C'| · curvature(D) → |C' × C''| / |C'|³ · curvatureVector(D) → κ N · torsion(D)
 *   C' is first brought by an exact power of two to a largest component in [1, 2), and the power is applied last, so none
 *   of them overflows or underflows on the way. Where C' = 0 they are refused: { name: 'u', why: 'degenerate' }. torsion
 *   is 0 where C' × C'' = 0 (no osculating plane).
 * Surfaces, from SKL (∂^(k+l) S / ∂u^k ∂v^l, k + l ≤ 1 or 2) at one (u, v), with the domain [ua, ub] × [va, vb]:
 *   normal(D1, second, dom, u, v, T) → unit normal or null. Su × Sv after scaling, unless one partial's reach across the
 *     domain (|Su| · (ub − ua), |Sv| · (vb − va)) is within tol.lin: then (u, v) is on an edge collapsed to a point (a pole)
 *     when it sits on that edge, and the normal is the limit from inside the domain (Suv × Sv or Su × Suv, with the sign of
 *     the inside; `second()` gives the second derivatives); next to a pole but not on it, the cross product still decides.
 *     null: no normal there (zero or parallel partials).
 *   forms(D2, dom, T) → { n, e1, e2, a, b, c }: the second fundamental form [[a, b], [b, c]] in an orthonormal frame e1 = Su /
 *     |Su|, e2 ⟂ e1 of the tangent plane, n = e1 × e2 on the side of Su × Sv. Refused where there is no normal or at a pole:
 *     { name: 'uv', why: 'degenerate' }.
 *   principal(F) → { K, H, k1, k2, d1, d2 }: the eigenvalues of the symmetric form, (a + c)/2 ± √(((a − c)/2)² + b²), with no
 *     H² − K cancellation; k1 ≥ k2; d1, d2 the principal directions in 3-D (e1 at an umbilic), signed against n.
 *   normalCurvature(F, t) → the normal curvature along t (projected onto the tangent plane); t along n is refused
 *     ({ name: 'direction', why: 'not_tangent' }).
 *   Every answer that does not fit in doubles: { name, why: 'overflow' }.
 */
import { fail } from '../core/errors.js';
import { exponent, scalb } from '../core/float.js';
import * as V3 from '../math/vec3.js';

const BAD = 'solid.err.bad_input';

export function finite(v, name) {
  for (const x of v) if (!Number.isFinite(x)) fail(BAD, { name, why: 'overflow' });
  return v;
}

/** v brought by an exact power of two to a largest component in [1, 2): v = t · 2^k; null for the zero vector. */
export function scaled(v) {
  const m = Math.max(Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]));
  if (m === 0) return null;
  const k = exponent(m);
  return { t: [scalb(v[0], -k), scalb(v[1], -k), scalb(v[2], -k)], k };
}

// ---------------------------------------------------------------------------------------------------- curves

function firstScaled(d1) {
  const s = scaled(d1);
  if (!s) fail(BAD, { name: 'u', why: 'degenerate' });
  return s;
}

export function tangent(D) { return V3.unit(firstScaled(D[1]).t); }

export function curvature(D) {
  const { t, k } = firstScaled(D[1]), l = V3.len(t);
  // |C' × C''| / |C'|³ = |t × C''| / (2^(2k) · |t|³): every factor finite, the power of two applied last
  const x = V3.len(V3.cross(t, D[2])) / (l * l * l);
  return finite([scalb(x, -2 * k)], 'curvature')[0];
}

export function curvatureVector(D) {
  const { t, k } = firstScaled(D[1]), T = V3.unit(t), l = V3.len(t);
  const n = V3.scale(V3.madd(D[2], -V3.dot(D[2], T), T), 1 / (l * l));
  return finite(n.map((x) => scalb(x, -2 * k)), 'curvatureVector');
}

export function torsion(D) {
  const { t, k } = firstScaled(D[1]);
  const x = V3.cross(t, D[2]), q = V3.len(x);
  if (q === 0) return 0;
  const xs = V3.scale(x, 1 / q);
  return finite([scalb(V3.dot(xs, D[3]) / q, -k)], 'torsion')[0];
}

// ---------------------------------------------------------------------------------------------------- surfaces

/** Whether each partial is, as a length across the domain, no more than tol.lin. */
function flat(dom, Su, Sv, T) {
  return [!(V3.len(Su) * (dom.ub - dom.ua) > T.lin), !(V3.len(Sv) * (dom.vb - dom.va) > T.lin)];
}

function crossUnit(Su, Sv, T) {
  const su = scaled(Su), sv = scaled(Sv);
  if (!su || !sv) return null;
  const n = V3.cross(su.t, sv.t), l = V3.len(n);
  return l > T.ang * V3.len(su.t) * V3.len(sv.t) ? V3.scale(n, 1 / l) : null;
}

export function normal(D1, second, dom, u, v, T) {
  const Su = D1[1][0], Sv = D1[0][1], [flatU, flatV] = flat(dom, Su, Sv, T);
  if (flatU && flatV) return null;
  const onPole = (flatU && (v === dom.va || v === dom.vb)) || (flatV && (u === dom.ua || u === dom.ub));
  if (!onPole) return crossUnit(Su, Sv, T);
  const suv = scaled(second()[1][1]);
  if (!suv) return null;
  if (flatU) {
    // S(u, v0) is one point for all u: near v0 + h, Su ≈ h Suv, so Su × Sv ≈ h (Suv × Sv); h > 0 at v = va, h < 0 at vb
    const sv = scaled(Sv), side = v === dom.va ? 1 : -1;
    if (!sv) return null;
    const m = V3.cross(suv.t, sv.t), l = V3.len(m);
    return l > T.ang * V3.len(suv.t) * V3.len(sv.t) ? V3.scale(m, side / l) : null;
  }
  // flatV: S(u0, v) is one point for all v: near u0 + h, Sv ≈ h Suv, so Su × Sv ≈ h (Su × Suv); h > 0 at u = ua
  const su = scaled(Su), side = u === dom.ua ? 1 : -1;
  if (!su) return null;
  const m = V3.cross(su.t, suv.t), l = V3.len(m);
  return l > T.ang * V3.len(su.t) * V3.len(suv.t) ? V3.scale(m, side / l) : null;
}

export function forms(D, dom, T) {
  const Su = D[1][0], Sv = D[0][1], [flatU, flatV] = flat(dom, Su, Sv, T);
  if (flatU || flatV) fail(BAD, { name: 'uv', why: 'degenerate' });
  const su = scaled(Su).t, sv = scaled(Sv).t, n0 = V3.cross(su, sv);
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

export function principal({ n, e1, e2, a, b, c }) {
  const h = (a + c) / 2, q = (a - c) / 2, r = Math.sqrt(q * q + b * b);
  const k1 = h + r, k2 = h - r;
  // the eigenvector for k1: (b, k1 − a) or (k1 − c, b), whichever is longer; at an umbilic (r = 0) any direction: e1
  let x = b, y = k1 - a;
  const x2 = k1 - c, y2 = b;
  if (x2 * x2 + y2 * y2 > x * x + y * y) { x = x2; y = y2; }
  const d1 = r === 0 || (x === 0 && y === 0) ? e1 : V3.unit(V3.madd(V3.scale(e1, x), y, e2));
  return Object.freeze({ K: a * c - b * b, H: h, k1, k2, d1, d2: V3.cross(n, d1) });
}

export function normalCurvature({ e1, e2, a, b, c }, t) {
  if (!V3.isVec3(t)) fail(BAD, { name: 'direction', why: 'not_a_vector' });
  const x = V3.dot(t, e1), y = V3.dot(t, e2), l2 = x * x + y * y;
  if (!(l2 > 0)) fail(BAD, { name: 'direction', why: 'not_tangent' });
  return (a * x * x + 2 * b * x * y + c * y * y) / l2;
}
