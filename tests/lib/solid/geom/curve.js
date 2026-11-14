/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * curve.js — cc-solid (S7, docs/solid/HANDOFF.md § 6.1): one interface for every curve, NURBS (nurbs-curve.js) or analytic
 * (analytic-curve.js: line, circle, ellipse). DOM-free; imports the two curve modules. The interface of § 6.1: domain, point,
 * derivs, tangent, curvature, reversed, transformed, bbox, closed, toNurbs, type.
 *
 *   isCurve(c) · typeOf(c) → 'nurbs' | 'line' | 'circle' | 'ellipse'
 *   domain(c) · point(c, t) · derivs(c, t, d) · tangent · curvature · curvatureVector · torsion
 *   toNurbs(c) (a NURBS curve is itself) · reverse(c) (same domain, C'(s) = C(t0 + t1 − s)) · transform(c, m, tol) ·
 *   bbox(c) · isClosed(c, tol) · toData(c) → plain data with its `type` · fromData(d, tol)
 * A record made by neither module is refused: solid.err.bad_input { name: 'curve', why: 'not_a_curve' }.
 */
import { fail } from '../core/errors.js';
import * as CV from './nurbs-curve.js';
import * as AC from './analytic-curve.js';

function kind(c) {
  if (CV.isCurve(c)) return CV;
  if (AC.isAnalytic(c)) return AC;
  return fail('solid.err.bad_input', { name: 'curve', why: 'not_a_curve' });
}

export const isCurve = (c) => CV.isCurve(c) || AC.isAnalytic(c);
export const typeOf = (c) => { kind(c); return c.type; };
export const domain = (c) => kind(c).domain(c);
export const point = (c, t) => kind(c).point(c, t);
export const derivs = (c, t, d) => kind(c).derivs(c, t, d);
export const tangent = (c, t) => kind(c).tangent(c, t);
export const curvature = (c, t) => kind(c).curvature(c, t);
export const curvatureVector = (c, t) => kind(c).curvatureVector(c, t);
export const torsion = (c, t) => kind(c).torsion(c, t);
export const toNurbs = (c) => (kind(c) === CV ? c : AC.toNurbs(c));
export const reverse = (c) => kind(c).reverse(c);
export const transform = (c, m, tol) => (kind(c) === CV ? CV.transform(c, m) : AC.transform(c, m, tol));
export const bbox = (c) => kind(c).bbox(c);
export const isClosed = (c, tol) => kind(c).isClosed(c, tol);
export const toData = (c) => (kind(c) === CV ? { type: 'nurbs', ...CV.toData(c) } : AC.toData(c));
export const fromData = (d, tol) => (d !== null && typeof d === 'object' && d.type === 'nurbs' ? CV.fromData(d) : AC.fromData(d, tol));
