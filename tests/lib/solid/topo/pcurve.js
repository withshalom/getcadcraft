/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * pcurve.js — cc-solid (S13, docs/solid/HANDOFF.md § 8.5, M2): an edge as a curve in its face's (u, v) space, exactly. DOM-free;
 * imports core/, math/ and geom/ (curve.js, surface.js); it knows no B-rep, so topo/brep.js and the builders can both use it.
 *
 * A pcurve is a curve record (geom/curve.js) in the plane z = 0, a point [u, v, 0], on the same parameter as its edge's curve:
 * pcurve(t) = (u, v) of curve(t) for t in the edge's [t0, t1], in the edge's own direction (a coedge of sense −1 walks it
 * backwards). This is STEP's PCURVE. For the analytic pairs below it is a straight line in (u, v) or a circle, never a fit:
 * the surface's own parameters (STEP's, ISO 10303-42) run linearly with an angle or a length along these edges.
 *
 *   plane      × line | circle (its axis along the plane's)           a line | a circle in the plane's (u, v)
 *   cylinder   × circle (round the axis) | line (along the axis)       a line: v constant, u an angle | u constant, v a length
 *   cone       × circle (round the axis) | line (along a generator)    likewise
 *   sphere     × circle (a parallel) | circle (a meridian)             a line: v constant | u constant, v an angle
 *   torus      × circle (a parallel) | circle (a meridian)             a line: v constant | u constant, v an angle
 * An edge may end at a pole (a sphere's, a cone's apex) and may not cross one: there u jumps, and the pair is refused.
 * Every pcurve is certified before it is returned: four points of it, put through the surface, must meet the edge's own
 * points within tol.lin. A pair that is none of the above, or a curve that is not one of the surface's own lines, is refused.
 *
 *   periods(s) → { u, v }              the period of each parameter (2π), or null: the plane and the NURBS surfaces have none,
 *                                      the torus has two, the others one (u)
 *   uvOf(s, p, { near, tol }) → [u, v] the parameters of a point on the surface, by closed forms (plane, cylinder, cone, sphere,
 *                                      torus). Each angle is taken as the 2π turn nearest near = [u, v] (default: the middle of
 *                                      the surface's range); at a pole u is near[0]
 *   pcurveOf(s, c, t0, t1, { near, tol }) → a curve record   the edge's pcurve (above); near unwraps the angles as in uvOf, and
 *                                      the pcurve starts at the turn of its own u nearest near[0]
 *   pointCurve(p, t0, t1) → a curve record   a curve that stays at p: the 3D curve of a degenerate edge, a pole
 *   uvLine(a, b, t0, t1) → a curve record   the straight pcurve from a = [u, v] at t0 to b at t1 (a pole edge has no points to read it from)
 *   isPoint(c, tol) → boolean          whether a curve stays within tol.lin of one point (a degenerate edge's)
 * Refusals: solid.err.bad_input { name, why }: 's' 'not_a_surface'; 'c' 'not_a_curve'; 'range' 'out_of_domain'; 'p' 'not_a_point';
 * 'near' 'not_a_pair'. solid.err.not_supported { what: 'surface' | 'pcurve', why }: 'surface' why 'unknown_type' (uvOf on a
 * surface without a closed form); 'pcurve' why 'not_isoline' (the pair is none of the above, or the edge is not one of the
 * surface's lines); 'off_surface' (the edge is a line of the surface but runs outside its (u, v) range: a meridian over a pole goes
 * past v = ±π/2, and a start on another turn of the angle is outside the range too).
 */
import { fail } from '../core/errors.js';
import { resolveTol } from '../core/tol.js';
import { EPS, pow2 } from '../core/float.js';
import { atan2, TAU } from '../core/trig.js';
import * as V3 from '../math/vec3.js';
import * as Fr from '../math/frame.js';
import * as C from '../geom/curve.js';
import * as AC from '../geom/analytic-curve.js';
import * as SF from '../geom/surface.js';
import * as NC from '../geom/nurbs-curve.js';

const BAD = 'solid.err.bad_input', NOT = 'solid.err.not_supported';
const SNAP = pow2(32) * EPS;                                                          // about 1e-6: a slope this close to 0, ±1 is that slope
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

function surface(s) {
  if (!SF.isSurface(s)) fail(BAD, { name: 's', why: 'not_a_surface' });
  return s;
}

export function periods(s) {
  const t = SF.typeOf(surface(s));
  return Object.freeze({ u: t === 'plane' || t === 'extrusion' || t === 'nurbs' ? null : TAU, v: t === 'torus' ? TAU : null });
}

// ---- parameters of a point
/** a, taken as the turn of 2π nearest ref */
const turn = (a, ref) => a + TAU * Math.round((ref - a) / TAU);
const pair = (near, name) => {
  if (!Array.isArray(near) || near.length !== 2 || !near.every(isNum)) fail(BAD, { name, why: 'not_a_pair' });
  return near;
};
const middle = (r) => (r[0] + r[1]) / 2;

export function uvOf(s, p, { near = null, tol } = {}) {
  const T = resolveTol(tol), type = SF.typeOf(surface(s));
  if (!V3.isVec3(p)) fail(BAD, { name: 'p', why: 'not_a_point' });
  const ref = near === null ? [middle(SF.domainU(s)), middle(SF.domainV(s))] : pair(near, 'near');
  if (type === 'plane') {
    const q = Fr.toLocal(s.frame, p);
    return [q[0], q[1]];
  }
  if (!['cylinder', 'cone', 'sphere', 'torus'].includes(type)) fail(NOT, { what: 'surface', why: 'unknown_type' });
  const q = Fr.toLocal(s.frame, p), rho = V3.len([q[0], q[1], 0]);
  const u = rho > T.lin ? turn(atan2(q[1], q[0]), ref[0]) : ref[0];             // on the axis (a pole): u is free
  if (type === 'cylinder' || type === 'cone') return [u, q[2]];
  if (type === 'sphere') return [u, atan2(q[2], rho)];
  return [u, turn(atan2(q[2], rho - s.R), ref[1])];
}

// ---- pcurves
const line2 = (t0, t1, a, b) => NC.make({ deg: 1, knots: [t0, t0, t1, t1], cvs: [[a[0], a[1], 0], [b[0], b[1], 0]] });
const dist2 = (a, b) => V3.dist([a[0], a[1], 0], [b[0], b[1], 0]);

/** x inside the range r, or taken to its end when it overshoots by no more than d; null when it is further out */
const into = (r, x, d) => (x < r[0] ? (r[0] - x <= d ? r[0] : null) : x > r[1] ? (x - r[1] <= d ? r[1] : null) : x);
/** a value that rounding left a hair off an end of the range is that end (so a seam is at 0 and 2π, a cap's rim at 0 and h) */
const ended = (r, x) => (Math.abs(x - r[0]) <= pow2(8) * EPS * Math.max(1, Math.abs(x)) ? r[0] : Math.abs(x - r[1]) <= pow2(8) * EPS * Math.max(1, Math.abs(x)) ? r[1] : x);

function certify(s, c, pc, t0, t1, T) {
  for (const k of [0, 1, 2, 3]) {
    const t = k === 3 ? t1 : t0 + ((t1 - t0) * k) / 3, uv = C.point(pc, t);
    const u = into(SF.domainU(s), uv[0], T.lin), v = into(SF.domainV(s), uv[1], T.lin);
    if (u === null || v === null) fail(NOT, { what: 'pcurve', why: 'off_surface' });
    if (!(V3.dist(SF.point(s, u, v), C.point(c, t)) <= T.lin)) fail(NOT, { what: 'pcurve', why: 'not_isoline' });
  }
  return pc;
}

/** The slope of a parameter that runs with the curve: a turn per radian (0, ±1), or, along a line, a length (0, ±1, or ± the line's z). */
function snap(x, extra) {
  let best = null;
  for (const k of [0, 1, -1, ...(extra === undefined ? [] : [extra, -extra])]) if (best === null || Math.abs(x - k) < Math.abs(x - best)) best = k;
  return Math.abs(x - best) <= SNAP ? best : null;
}

function planar(s, c, t0, t1, T) {
  const ct = C.typeOf(c);
  if (ct === 'line') return line2(t0, t1, uvOf(s, C.point(c, t0), { tol: T }), uvOf(s, C.point(c, t1), { tol: T }));
  if (ct !== 'circle') fail(NOT, { what: 'pcurve', why: 'not_isoline' });
  const f = c.frame, z = V3.dot(f.z, s.frame.z);
  if (!(Math.abs(Math.abs(z) - 1) <= T.ang)) fail(NOT, { what: 'pcurve', why: 'not_isoline' });   // the circle's plane is the plane's
  const o = Fr.toLocal(s.frame, f.o), x = Fr.dirToLocal(s.frame, f.x), sg = z > 0 ? 1 : -1;
  const frame = Fr.frameFromZX([o[0], o[1], 0], [0, 0, sg], [x[0], x[1], 0], T);
  return AC.circle({ frame, r: c.r, phase: c.phase, range: c.range.slice() });
}

export function pcurveOf(s, c, t0, t1, { near = null, tol } = {}) {
  const T = resolveTol(tol), type = SF.typeOf(surface(s));
  if (!C.isCurve(c)) fail(BAD, { name: 'c', why: 'not_a_curve' });
  const [d0, d1] = C.domain(c);
  if (!(isNum(t0) && isNum(t1) && d0 <= t0 && t0 < t1 && t1 <= d1)) fail(BAD, { name: 'range', why: 'out_of_domain' });
  if (near !== null) pair(near, 'near');
  if (type === 'plane') return certify(s, c, planar(s, c, t0, t1, T), t0, t1, T);
  if (!['cylinder', 'cone', 'sphere', 'torus'].includes(type)) fail(NOT, { what: 'pcurve', why: 'not_isoline' });
  // two points a quarter and a half way along, away from the ends (an end may be a pole, where u is free), give the slopes;
  // the start is walked back from the first of them
  const ta = t0 + (t1 - t0) / 4, tb = t0 + (t1 - t0) / 2;
  const a = uvOf(s, C.point(c, ta), { near, tol: T }), b = uvOf(s, C.point(c, tb), { near: a, tol: T });
  const zDir = C.typeOf(c) === 'line' ? Fr.dirToLocal(s.frame, c.d)[2] : undefined;
  const du = snap((b[0] - a[0]) / (tb - ta)), dv = snap((b[1] - a[1]) / (tb - ta), zDir);
  if (du === null || dv === null) fail(NOT, { what: 'pcurve', why: 'not_isoline' });
  let u0 = a[0] - du * (ta - t0);
  if (near !== null) u0 = turn(u0, near[0]);
  const v0 = a[1] - dv * (ta - t0), dt = t1 - t0, du0 = SF.domainU(s), dv0 = SF.domainV(s);
  const from = [ended(du0, u0), ended(dv0, v0)], to = [ended(du0, u0 + du * dt), ended(dv0, v0 + dv * dt)];
  return certify(s, c, line2(t0, t1, from, to), t0, t1, T);
}

// ---- a pole's edge
export function uvLine(a, b, t0, t1) {
  if (!(Array.isArray(a) && a.length === 2 && a.every(isNum) && Array.isArray(b) && b.length === 2 && b.every(isNum))) fail(BAD, { name: 'uv', why: 'not_a_pair' });
  if (!(isNum(t0) && isNum(t1) && t0 < t1)) fail(BAD, { name: 'range', why: 'not_a_range' });
  return line2(t0, t1, a, b);
}

export function pointCurve(p, t0, t1) {
  if (!V3.isVec3(p)) fail(BAD, { name: 'p', why: 'not_a_point' });
  if (!(isNum(t0) && isNum(t1) && t0 < t1)) fail(BAD, { name: 'range', why: 'not_a_range' });
  return NC.make({ deg: 1, knots: [t0, t0, t1, t1], cvs: [p.slice(), p.slice()] });
}

export function isPoint(c, tol) {
  if (!C.isCurve(c)) fail(BAD, { name: 'c', why: 'not_a_curve' });
  const b = C.bbox(c);
  return V3.dist(b.min, b.max) <= resolveTol(tol).lin;
}
