/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * surface.js — cc-solid (S7, docs/solid/HANDOFF.md § 6.2): one interface for every surface, NURBS (nurbs-surface.js) or
 * analytic (analytic-surface.js: plane, cylinder, cone, sphere, torus, revolution, extrusion). DOM-free; imports the two
 * surface modules. The interface of § 6.2: domains, point, derivs, normal, transformed, bbox, toNurbs, type.
 *
 *   isSurface(s) · typeOf(s) → 'nurbs' | 'plane' | 'cylinder' | 'cone' | 'sphere' | 'torus' | 'revolution' | 'extrusion'
 *   domainU(s) · domainV(s) · point(s, u, v) · derivs(s, u, v, d) · normal(s, u, v, tol) · curvature(s, u, v, tol) ·
 *   normalCurvature(s, u, v, t, tol) · toNurbs(s) (a NURBS surface is itself) · transform(s, m, tol) · bbox(s) ·
 *   toData(s) → plain data with its `type` · fromData(d, tol)
 * A record made by neither module is refused: solid.err.bad_input { name: 'surface', why: 'not_a_surface' }.
 */
import { fail } from '../core/errors.js';
import * as NSF from './nurbs-surface.js';
import * as AS from './analytic-surface.js';

function kind(s) {
  if (NSF.isSurface(s)) return NSF;
  if (AS.isAnalytic(s)) return AS;
  return fail('solid.err.bad_input', { name: 'surface', why: 'not_a_surface' });
}

export const isSurface = (s) => NSF.isSurface(s) || AS.isAnalytic(s);
export const typeOf = (s) => { kind(s); return s.type; };
export const domainU = (s) => kind(s).domainU(s);
export const domainV = (s) => kind(s).domainV(s);
export const point = (s, u, v) => kind(s).point(s, u, v);
export const derivs = (s, u, v, d) => kind(s).derivs(s, u, v, d);
export const normal = (s, u, v, tol) => kind(s).normal(s, u, v, tol);
export const curvature = (s, u, v, tol) => kind(s).curvature(s, u, v, tol);
export const normalCurvature = (s, u, v, t, tol) => kind(s).normalCurvature(s, u, v, t, tol);
export const toNurbs = (s) => (kind(s) === NSF ? s : AS.toNurbs(s));
export const transform = (s, m, tol) => (kind(s) === NSF ? NSF.transform(s, m) : AS.transform(s, m, tol));
export const bbox = (s) => kind(s).bbox(s);
export const toData = (s) => (kind(s) === NSF ? { type: 'nurbs', ...NSF.toData(s) } : AS.toData(s));
export const fromData = (d, tol) => (d !== null && typeof d === 'object' && d.type === 'nurbs' ? NSF.fromData(d) : AS.fromData(d, tol));
