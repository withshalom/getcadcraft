/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * fit.js — cc-solid (S8, docs/solid/HANDOFF.md § 6.5, M1): curves through or near points, checked. DOM-free; imports core/,
 * math/, nurbs-curve.js and the exact functions of cc-nurbs' fit.js.
 *
 * The algorithms are cc-nurbs' (decision D8), The NURBS Book (Piegl & Tiller, 2nd ed.) § 9.2: chord-length (eq. 9.5),
 * centripetal (9.6) or uniform parameters, averaged knots (9.8), global interpolation A9.1 with end derivatives (§ 9.2.2), and
 * § 9.4.1's least-squares approximation with the ends fixed. What this file adds is the check of the answer against the data:
 *   - interpolate: the curve must pass through every point (and match the end derivatives given) within tol.lin, measured at
 *     each point's own parameter; otherwise the system was too ill-conditioned to trust, and it is refused;
 *   - approximate: the control-point count grows (by half, from deg + 1) until every point is within tol.fit of the curve's
 *     point at that point's parameter. That distance bounds the point's distance to the curve, so `error` is a bound, not a
 *     sample; at the full count the approximation is the interpolation;
 *   - points that coincide one after the other (which make A9.1's matrix singular) are refused with their index.
 *
 *   interpolate(points, { deg = 3, param = 'chord', d0, d1, tol }) → { curve, params, error }   (deg falls to count − 1 when
 *     there are too few points for it; d0, d1 are the first derivatives at the ends, in the parameter of `params` on [0, 1])
 *   approximate(points, { deg = 3, param = 'chord', tol, maxCount }) → { curve, params, error, count }   (error ≤ tol.fit)
 *   fromSpline({ degree, controlPoints, knots, weights, fitPoints, startTangent, endTangent }, tol) → curve — a KAD / DXF
 *     SPLINE: its control form as it is, or its fit-point form through interpolate; a fit form's end tangents are directions,
 *     scaled by the total chord length (the derivative in a chord-length parameter on [0, 1])
 *   params(points, kind) → the parameters cc-nurbs computes, in [0, 1]
 *
 * Refusals: solid.err.bad_input { name, why }: 'points' 'not_an_array' | 'too_few' | 'not_a_point' | 'out_of_range' |
 * 'repeated' (with index); 'param' 'unknown'; 'degree' 'not_a_count'; 'd0', 'd1' 'not_a_vector'; 'spline' 'not_an_object'
 * | 'no_points'; solid.err.limit { what: 'points' | 'degree' }; solid.err.singular { why: 'matrix' } (cc-nurbs' solver gave up);
 * solid.err.not_within_tolerance { what: 'interpolate' | 'approximate', tol, error }.
 */
import { fail } from '../core/errors.js';
import { resolveTol } from '../core/tol.js';
import { pow2 } from '../core/float.js';
import * as V3 from '../math/vec3.js';
import * as CV from './nurbs-curve.js';
import { params as nfParams, interpolate as nfInterpolate, approximate as nfApproximate } from '../../nurbs/fit.js';

const BAD = 'solid.err.bad_input';
const HI = pow2(500);
export const LIMITS = Object.freeze({ points: 65536 - 32, degree: CV.LIMITS.degree });
const KINDS = Object.freeze(['chord', 'centripetal', 'uniform']);

function pointsOf(points, T, min = 2) {
  if (!Array.isArray(points)) fail(BAD, { name: 'points', why: 'not_an_array' });
  if (points.length < min) fail(BAD, { name: 'points', why: 'too_few' });
  if (points.length > LIMITS.points) fail('solid.err.limit', { what: 'points', limit: LIMITS.points, used: points.length });
  const out = points.map((p) => {
    if (!V3.isVec3(p)) fail(BAD, { name: 'points', why: 'not_a_point' });
    if (Math.abs(p[0]) > HI || Math.abs(p[1]) > HI || Math.abs(p[2]) > HI) fail(BAD, { name: 'points', why: 'out_of_range' });
    return [p[0], p[1], p[2]];
  });
  for (let i = 1; i < out.length; i++) if (!(V3.dist(out[i], out[i - 1]) > T.lin)) fail(BAD, { name: 'points', why: 'repeated', index: i });
  return out;
}
function degreeOf(deg) {
  if (!Number.isInteger(deg) || deg < 1) fail(BAD, { name: 'degree', why: 'not_a_count' });
  if (deg > LIMITS.degree) fail('solid.err.limit', { what: 'degree', limit: LIMITS.degree, used: deg });
  return deg;
}
function kindOf(k) {
  if (!KINDS.includes(k)) fail(BAD, { name: 'param', why: 'unknown' });
  return k;
}
function upstream(f) {
  try { return f(); } catch (e) {
    if (e && e.code === 'nurbs.err.fit_singular') fail('solid.err.singular', { why: 'matrix' });
    throw e;
  }
}

export function params(points, kind = 'chord', tol) {
  return Object.freeze(nfParams(pointsOf(points, resolveTol(tol)), kindOf(kind)));
}

/** The largest distance from each point to the curve's point at that point's parameter. */
function residual(c, Q, t) {
  let e = 0;
  for (let i = 0; i < Q.length; i++) e = Math.max(e, V3.dist(CV.point(c, t[i]), Q[i]));
  return e;
}

export function interpolate(points, { deg = 3, param = 'chord', d0, d1, tol } = {}) {
  const T = resolveTol(tol), Q = pointsOf(points, T), kind = kindOf(param);
  degreeOf(deg);
  for (const [name, d] of [['d0', d0], ['d1', d1]]) if (d !== undefined && d !== null && !V3.isVec3(d)) fail(BAD, { name, why: 'not_a_vector' });
  const t = nfParams(Q, kind);
  const curve = CV.make(upstream(() => nfInterpolate(Q, deg, { kind, d0: d0 || null, d1: d1 || null })));
  let error = residual(curve, Q, t);
  const [a, b] = CV.domain(curve);
  // an end derivative's mismatch times the width of the domain is a length, compared like the points
  if (d0) error = Math.max(error, V3.dist(CV.derivs(curve, a, 1)[1], d0) * (b - a));
  if (d1) error = Math.max(error, V3.dist(CV.derivs(curve, b, 1)[1], d1) * (b - a));
  if (!(error <= T.lin)) fail('solid.err.not_within_tolerance', { what: 'interpolate', tol: T.lin, error: Number.isFinite(error) ? error : null });
  return Object.freeze({ curve, params: Object.freeze(t), error });
}

export function approximate(points, { deg = 3, param = 'chord', tol, maxCount } = {}) {
  const T = resolveTol(tol), Q = pointsOf(points, T), kind = kindOf(param);
  degreeOf(deg);
  const n = Q.length, top = maxCount === undefined ? n : Math.min(n, maxCount);
  if (!Number.isInteger(top) || top < 2) fail(BAD, { name: 'maxCount', why: 'not_a_count' });
  const t = nfParams(Q, kind), p = Math.min(deg, top - 1);
  let count = Math.min(top, p + 1), last = null;
  for (;;) {
    const curve = count === n ? interpolate(Q, { deg: p, param: kind, tol: T }).curve : CV.make(upstream(() => nfApproximate(Q, p, count, { kind })));
    const error = residual(curve, Q, t);
    last = { curve, params: Object.freeze(t), error, count };
    if (error <= T.fit) return Object.freeze(last);
    if (count >= top) break;
    count = Math.min(top, Math.max(count + 1, Math.ceil(count * 1.5)));
  }
  return fail('solid.err.not_within_tolerance', { what: 'approximate', tol: T.fit, error: last.error });
}

export function fromSpline(spline, tol) {
  if (spline === null || typeof spline !== 'object' || Array.isArray(spline)) fail(BAD, { name: 'spline', why: 'not_an_object' });
  const { degree = 3, controlPoints, knots, weights, fitPoints, startTangent, endTangent } = spline;
  if (Array.isArray(controlPoints) && controlPoints.length) return CV.make({ deg: degree, knots, cvs: controlPoints, w: weights || null });
  if (!Array.isArray(fitPoints) || fitPoints.length < 2) fail(BAD, { name: 'spline', why: 'no_points' });
  const T = resolveTol(tol), Q = pointsOf(fitPoints, T);
  let L = 0;
  for (let i = 1; i < Q.length; i++) L += V3.dist(Q[i], Q[i - 1]);
  const scaled = (d, name) => {
    if (d === undefined || d === null) return null;
    if (!V3.isVec3(d) || !(V3.len(d) > 0)) fail(BAD, { name, why: 'not_a_vector' });
    return V3.scale(V3.unit(d), L);
  };
  return interpolate(Q, { deg: degree, d0: scaled(startTangent, 'd0'), d1: scaled(endTangent, 'd1'), tol: T }).curve;
}
