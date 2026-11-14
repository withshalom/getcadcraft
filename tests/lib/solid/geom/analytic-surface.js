/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * analytic-surface.js — cc-solid (S7, docs/solid/HANDOFF.md § 6.2): planes, cylinders, cones, spheres, tori, surfaces of
 * revolution and of linear extrusion that keep their identity. DOM-free; imports core/, math/, the curve modules,
 * nurbs-surface.js and diffgeo.js.
 *
 * As with the analytic curves: a cylinder stays a cylinder (CYLINDRICAL_SURFACE in STEP, the analytic paths in intersection,
 * the radius checked exactly by the auditor), and toNurbs is explicit and exact: tensor products of A7.1 arcs (on
 * core/trig.js) and lines, and for revolution The NURBS Book's A8.1 construction on the profile's own net. The
 * parameterisations are STEP's (ISO 10303-42), so the writer (S29) can name them directly:
 *   { type: 'plane', frame, urange, vrange }            S = o + u x + v y
 *   { type: 'cylinder', frame, r, urange, vrange }      S = o + r (cos u x + sin u y) + v z                    u an angle
 *   { type: 'cone', frame, r, angle, urange, vrange }   S = o + (r + v tan α)(cos u x + sin u y) + v z         α the semi-angle
 *   { type: 'sphere', frame, r, urange, vrange }        S = o + r cos v (cos u x + sin u y) + r sin v z        v ∈ [−π/2, π/2]
 *   { type: 'torus', frame, R, r, urange, vrange }      S = o + (R + r cos v)(cos u x + sin u y) + r sin v z  R > r > 0
 *   { type: 'revolution', profile, axis: { o, d }, urange }   S(u, v) = the profile's C(v) turned by u about the axis (d unit,
 *                                                       right-handed); v ranges over the profile's domain
 *   { type: 'extrusion', profile, d, vrange }           S(u, v) = C(u) + v d (d unit); u ranges over the profile's domain
 * Every angle range spans at most one turn, and |angle| ≤ 2^20. Su × Sv points outward on the closed analytic surfaces
 * (cylinder, cone, sphere, torus) whose frames are right-handed.
 *
 *   plane(…) · cylinder(…) · cone(…) · sphere(…) · torus(…) · revolution(…) · extrusion(…)   (one options object each)
 *   isAnalytic(s) · toData(s) · fromData(d, tol) (decision D-wire; a profile travels as its own data)
 *   domainU(s) · domainV(s) · point(s, u, v) · derivs(s, u, v, d) → SKL (closed forms; d ≤ 32)
 *   normal(s, u, v, tol) · curvature(s, u, v, tol) · normalCurvature(s, u, v, t, tol)   (diffgeo.js: poles by their limit)
 *   toNurbs(s) → an exact nurbs-surface record on the same domain (in an angle direction its parameter agrees with the angle
 *     at every knot, not in between)
 *   transform(s, m, tol) → the same type when m is rigid, else toNurbs(s) transformed · bbox(s) → the box of toNurbs' net
 *
 * Refusals: solid.err.bad_input { name, why }: 'surface' 'not_an_object' | 'not_analytic' | 'unknown_type'; 'frame'
 * 'not_a_frame'; 'r', 'R' 'not_a_number' | 'not_positive' | 'out_of_range'; 'R' 'not_above_r' (a torus with R ≤ r crosses
 * itself); 'angle' 'not_a_number' | 'out_of_range' (a cone's semi-angle must be inside (−π/2, π/2) and not 0); 'urange',
 * 'vrange' 'not_a_range' | 'out_of_range' (also a sphere's v past ±π/2) | 'crosses_apex' (a cone's range through its apex);
 * 'profile' 'not_a_curve'; 'axis', 'd' 'not_a_vector' | 'zero_length'; 'u', 'v' 'not_a_number' | 'out_of_domain'; 'order';
 * 'uv' 'degenerate'; 'direction' 'not_a_vector' | 'not_tangent'; 'matrix' 'not_affine'.
 */
import { fail } from '../core/errors.js';
import { resolveTol } from '../core/tol.js';
import { pow2 } from '../core/float.js';
import { sincos, tan, HALF_PI, TAU } from '../core/trig.js';
import * as V3 from '../math/vec3.js';
import * as M4 from '../math/mat4.js';
import * as F from '../math/frame.js';
import * as CV from './nurbs-curve.js';
import * as AC from './analytic-curve.js';
import * as NSF from './nurbs-surface.js';
import * as DG from './diffgeo.js';

const BAD = 'solid.err.bad_input';
const HI = pow2(500), ANGLE = pow2(20);
const MADE = new WeakSet();
export const TYPES = Object.freeze(['plane', 'cylinder', 'cone', 'sphere', 'torus', 'revolution', 'extrusion']);

const isPlain = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isCount = (x) => typeof x === 'number' && Number.isInteger(x) && x >= 0;
const record = (r) => { const x = Object.freeze(r); MADE.add(x); return x; };
export const isAnalytic = (s) => s !== null && typeof s === 'object' && MADE.has(s);

function positive(x, name, zeroOk = false) {
  if (typeof x !== 'number' || !Number.isFinite(x)) fail(BAD, { name, why: 'not_a_number' });
  if (!(x > 0 || (zeroOk && x === 0))) fail(BAD, { name, why: 'not_positive' });
  if (x > HI) fail(BAD, { name, why: 'out_of_range' });
  return x === 0 ? 0 : x;
}
function frameOf(f) {
  if (!F.isFrame(f)) fail(BAD, { name: 'frame', why: 'not_a_frame' });
  return f;
}
function rangeOf(rg, name, angle) {
  if (!Array.isArray(rg) || rg.length !== 2 || !rg.every((x) => typeof x === 'number' && Number.isFinite(x))) fail(BAD, { name, why: 'not_a_range' });
  const [a, b] = rg;
  if (!(a < b)) fail(BAD, { name, why: 'not_a_range' });
  if (angle && (b - a > TAU || Math.abs(a) > ANGLE || Math.abs(b) > ANGLE)) fail(BAD, { name, why: 'out_of_range' });
  if (!angle && (Math.abs(a) > HI || Math.abs(b) > HI)) fail(BAD, { name, why: 'out_of_range' });
  return Object.freeze([a === 0 ? 0 : a, b === 0 ? 0 : b]);
}
function unitDir(d, name) {
  if (!V3.isVec3(d)) fail(BAD, { name, why: 'not_a_vector' });
  return AC.unitKept(d, name);
}
const isAnyCurve = (c) => CV.isCurve(c) || AC.isAnalytic(c);
const curveOf = (c) => (CV.isCurve(c) ? CV : AC);

// ---------------------------------------------------------------------------------------------------- constructors

export const plane = ({ frame, urange, vrange } = {}) => record({ type: 'plane', frame: frameOf(frame), urange: rangeOf(urange, 'urange', false), vrange: rangeOf(vrange, 'vrange', false) });

export const cylinder = ({ frame, r, urange = [0, TAU], vrange } = {}) => record({ type: 'cylinder', frame: frameOf(frame), r: positive(r, 'r'), urange: rangeOf(urange, 'urange', true), vrange: rangeOf(vrange, 'vrange', false) });

export function cone({ frame, r, angle, urange = [0, TAU], vrange } = {}) {
  const f = frameOf(frame), rr = positive(r, 'r', true);
  if (typeof angle !== 'number' || !Number.isFinite(angle)) fail(BAD, { name: 'angle', why: 'not_a_number' });
  if (!(Math.abs(angle) < HALF_PI) || angle === 0) fail(BAD, { name: 'angle', why: 'out_of_range' });
  const ur = rangeOf(urange, 'urange', true), vr = rangeOf(vrange, 'vrange', false), t = tan(angle);
  // the radius r + v tan α may reach 0 at an end of the range (the apex, a pole), not inside it or past it
  if (rr + vr[0] * t < 0 || rr + vr[1] * t < 0) fail(BAD, { name: 'vrange', why: 'crosses_apex' });
  return record({ type: 'cone', frame: f, r: rr, angle, tanA: t, urange: ur, vrange: vr });
}

export function sphere({ frame, r, urange = [0, TAU], vrange = [-HALF_PI, HALF_PI] } = {}) {
  const vr = rangeOf(vrange, 'vrange', true);
  if (vr[0] < -HALF_PI || vr[1] > HALF_PI) fail(BAD, { name: 'vrange', why: 'out_of_range' });
  return record({ type: 'sphere', frame: frameOf(frame), r: positive(r, 'r'), urange: rangeOf(urange, 'urange', true), vrange: vr });
}

export function torus({ frame, R, r, urange = [0, TAU], vrange = [0, TAU] } = {}) {
  const RR = positive(R, 'R'), rr = positive(r, 'r');
  if (!(RR > rr)) fail(BAD, { name: 'R', why: 'not_above_r' });
  return record({ type: 'torus', frame: frameOf(frame), R: RR, r: rr, urange: rangeOf(urange, 'urange', true), vrange: rangeOf(vrange, 'vrange', true) });
}

export function revolution({ profile, axis, urange = [0, TAU] } = {}) {
  if (!isAnyCurve(profile)) fail(BAD, { name: 'profile', why: 'not_a_curve' });
  if (!isPlain(axis) || !V3.isVec3(axis.o)) fail(BAD, { name: 'axis', why: 'not_a_vector' });
  const ax = Object.freeze({ o: Object.freeze(axis.o.slice()), d: unitDir(axis.d, 'axis') });
  return record({ type: 'revolution', profile, axis: ax, urange: rangeOf(urange, 'urange', true), vrange: Object.freeze(curveOf(profile).domain(profile)) });
}

export function extrusion({ profile, d, vrange } = {}) {
  if (!isAnyCurve(profile)) fail(BAD, { name: 'profile', why: 'not_a_curve' });
  return record({ type: 'extrusion', profile, d: unitDir(d, 'd'), urange: Object.freeze(curveOf(profile).domain(profile)), vrange: rangeOf(vrange, 'vrange', false) });
}

function need(s) {
  if (!isAnalytic(s)) fail(BAD, { name: 'surface', why: 'not_analytic' });
  return s;
}

const curveData = (c) => (CV.isCurve(c) ? { type: 'nurbs', ...CV.toData(c) } : AC.toData(c));
const curveFrom = (d, tol) => (d && d.type === 'nurbs' ? CV.fromData(d) : AC.fromData(d, tol));

export function toData(s) {
  need(s);
  const out = { type: s.type };
  for (const k of ['r', 'R', 'angle']) if (s[k] !== undefined) out[k] = s[k];
  if (s.frame) out.frame = F.toData(s.frame);
  if (s.type === 'revolution') { out.profile = curveData(s.profile); out.axis = { o: s.axis.o.slice(), d: s.axis.d.slice() }; out.urange = s.urange.slice(); return out; }
  if (s.type === 'extrusion') { out.profile = curveData(s.profile); out.d = s.d.slice(); out.vrange = s.vrange.slice(); return out; }
  out.urange = s.urange.slice();
  out.vrange = s.vrange.slice();
  return out;
}

export function fromData(d, tol) {
  if (!isPlain(d)) fail(BAD, { name: 'surface', why: 'not_an_object' });
  const frame = d.frame === undefined ? undefined : F.fromData(d.frame, tol);
  switch (d.type) {
    case 'plane': return plane({ ...d, frame });
    case 'cylinder': return cylinder({ ...d, frame });
    case 'cone': return cone({ ...d, frame });
    case 'sphere': return sphere({ ...d, frame });
    case 'torus': return torus({ ...d, frame });
    case 'revolution': return revolution({ ...d, profile: curveFrom(d.profile, tol) });
    case 'extrusion': return extrusion({ ...d, profile: curveFrom(d.profile, tol) });
    default: return fail(BAD, { name: 'surface', why: 'unknown_type' });
  }
}

// ---------------------------------------------------------------------------------------------------- evaluation

export const domainU = (s) => need(s).urange.slice();
export const domainV = (s) => need(s).vrange.slice();

function params(s, u, v) {
  for (const [name, x, rg] of [['u', u, s.urange], ['v', v, s.vrange]]) {
    if (typeof x !== 'number' || !Number.isFinite(x)) fail(BAD, { name, why: 'not_a_number' });
    if (x < rg[0] || x > rg[1]) fail(BAD, { name, why: 'out_of_domain' });
  }
}

/** x-y combination in the frame: p · x + q · y. */
const xy = (f, p, q) => V3.madd(V3.scale(f.x, p), q, f.y);

/** SKL[k][l], k + l ≤ d, in closed form. */
function skl(s, u, v, d) {
  const f = s.frame, S = [];
  for (let k = 0; k <= d; k++) S.push(new Array(d - k + 1).fill(null).map(() => [0, 0, 0]));
  if (s.type === 'plane') {
    S[0][0] = V3.add(f.o, xy(f, u, v));
    if (d >= 1) { S[1][0] = f.x.slice(); S[0][1] = f.y.slice(); }
    return S;
  }
  if (s.type === 'extrusion') {
    const C = curveOf(s.profile).derivs(s.profile, u, d);
    for (let k = 0; k <= d; k++) S[k][0] = C[k].slice();
    S[0][0] = V3.madd(C[0], v, s.d);
    if (d >= 1) S[0][1] = s.d.slice();
    return S;
  }
  const [su, cu] = sincos(u);
  if (s.type === 'revolution') {
    const a = s.axis.d, C = curveOf(s.profile).derivs(s.profile, v, d);
    for (let l = 0; l <= d; l++) {
      const P = l === 0 ? V3.sub(C[0], s.axis.o) : C[l], par = V3.scale(a, V3.dot(P, a)), perp = V3.sub(P, par), side = V3.cross(a, perp);
      for (let k = 0; k <= d - l; k++) {
        const [p, q] = AC.cycle(k, cu, su), turned = V3.madd(V3.scale(perp, p), q, side);
        S[k][l] = k === 0 ? (l === 0 ? V3.add(V3.add(s.axis.o, par), turned) : V3.add(par, turned)) : turned;
      }
    }
    return S;
  }
  // cylinder, cone, sphere, torus: S = o + ρ(v) (cos u x + sin u y) + ζ(v) z, with ρ and ζ and their v-derivatives below
  let rho, zeta;
  if (s.type === 'cylinder') { rho = (l) => (l === 0 ? s.r : 0); zeta = (l) => (l === 0 ? v : l === 1 ? 1 : 0); }
  else if (s.type === 'cone') { rho = (l) => (l === 0 ? s.r + v * s.tanA : l === 1 ? s.tanA : 0); zeta = (l) => (l === 0 ? v : l === 1 ? 1 : 0); }
  else {
    const [sv, cv] = sincos(v);
    const cyc = (l) => AC.cycle(l, cv, sv);                      // the l-th derivative of (cos v, sin v)
    if (s.type === 'sphere') { rho = (l) => s.r * cyc(l)[0]; zeta = (l) => s.r * cyc(l)[1]; }
    else { rho = (l) => (l === 0 ? s.R : 0) + s.r * cyc(l)[0]; zeta = (l) => s.r * cyc(l)[1]; }
  }
  for (let k = 0; k <= d; k++) {
    const [p, q] = AC.cycle(k, cu, su), radial = xy(f, p, q);
    for (let l = 0; l <= d - k; l++) {
      let x = V3.scale(radial, rho(l));
      if (k === 0) x = V3.madd(x, zeta(l), f.z);
      S[k][l] = k === 0 && l === 0 ? V3.add(f.o, x) : x;
    }
  }
  return S;
}

export function point(s, u, v) {
  need(s);
  params(s, u, v);
  return DG.finite(skl(s, u, v, 0)[0][0], 'point');
}

export function derivs(s, u, v, d = 2) {
  need(s);
  params(s, u, v);
  if (!isCount(d)) fail(BAD, { name: 'order', why: 'not_a_count' });
  if (d > 32) fail(BAD, { name: 'order', why: 'out_of_range' });
  const S = skl(s, u, v, d);
  for (const row of S) for (const x of row) DG.finite(x, 'derivs');
  return S;
}

const dom = (s) => ({ ua: s.urange[0], ub: s.urange[1], va: s.vrange[0], vb: s.vrange[1] });

export function normal(s, u, v, tol) {
  need(s);
  const n = DG.normal(derivs(s, u, v, 1), () => skl(s, u, v, 2), dom(s), u, v, resolveTol(tol));
  if (!n) fail(BAD, { name: 'uv', why: 'degenerate' });
  return n;
}
export const curvature = (s, u, v, tol) => DG.principal(DG.forms(derivs(s, u, v, 2), dom(need(s)), resolveTol(tol)));
export function normalCurvature(s, u, v, t, tol) {
  if (!V3.isVec3(t)) fail(BAD, { name: 'direction', why: 'not_a_vector' });
  return DG.normalCurvature(DG.forms(derivs(s, u, v, 2), dom(need(s)), resolveTol(tol)), t);
}

// ---------------------------------------------------------------------------------------------------- conversions

/** A degree-1 net over [a, b]: knots and the two parameter values. */
const lineNet = ([a, b]) => ({ knots: [a, a, b, b], X: [a, b], w: [1, 1] });

export function toNurbs(s) {
  need(s);
  const f = s.frame;
  const make = (degU, degV, knotsU, knotsV, cvs, w) => NSF.make({ degU, degV, knotsU, knotsV, cvs, w });
  if (s.type === 'plane') {
    const U = lineNet(s.urange), Vn = lineNet(s.vrange);
    return make(1, 1, U.knots, Vn.knots, U.X.map((u) => Vn.X.map((v) => V3.add(f.o, xy(f, u, v)))), null);
  }
  if (s.type === 'extrusion') {
    const Q = CV.isCurve(s.profile) ? s.profile : AC.toNurbs(s.profile), Vn = lineNet(s.vrange);
    return make(Q.deg, 1, Q.knots, Vn.knots, Q.cvs.map((q) => Vn.X.map((v) => V3.madd(q, v, s.d))), Q.w ? Q.w.map((wi) => [wi, wi]) : null);
  }
  const U = AC.arcNet(s.urange[0], s.urange[1]);
  if (s.type === 'revolution') {
    // A8.1: each profile control point turned on the unit circle's net about the axis; weights multiply
    const Q = CV.isCurve(s.profile) ? s.profile : AC.toNurbs(s.profile), a = s.axis.d;
    const cvs = U.X.map(([p, q]) => Q.cvs.map((P) => {
      const rel = V3.sub(P, s.axis.o), par = V3.scale(a, V3.dot(rel, a)), perp = V3.sub(rel, par);
      return V3.add(V3.add(s.axis.o, par), V3.madd(V3.scale(perp, p), q, V3.cross(a, perp)));
    }));
    const w = U.w.map((wu) => Q.cvs.map((_, j) => wu * (Q.w ? Q.w[j] : 1)));
    return make(2, Q.deg, U.knots, Q.knots, cvs, w);
  }
  if (s.type === 'cylinder' || s.type === 'cone') {
    const Vn = lineNet(s.vrange), rho = (v) => (s.type === 'cylinder' ? s.r : s.r + v * s.tanA);
    const cvs = U.X.map(([p, q]) => Vn.X.map((v) => V3.add(f.o, V3.madd(xy(f, rho(v) * p, rho(v) * q), v, f.z))));
    return make(2, 1, U.knots, Vn.knots, cvs, U.w.map((wu) => [wu, wu]));
  }
  // sphere and torus: a profile arc in v (in the frame's radial-height plane) revolved by the arc in u
  const Vn = AC.arcNet(s.vrange[0], s.vrange[1]);
  const prof = Vn.X.map(([c, sn]) => (s.type === 'sphere' ? [s.r * c, s.r * sn] : [s.R + s.r * c, s.r * sn]));
  const cvs = U.X.map(([p, q]) => prof.map(([rad, h]) => V3.add(f.o, V3.madd(xy(f, rad * p, rad * q), h, f.z))));
  return make(2, 2, U.knots, Vn.knots, cvs, U.w.map((wu) => Vn.w.map((wv) => wu * wv)));
}

export function transform(s, m, tol) {
  need(s);
  if (!M4.isAffine(m)) fail(BAD, { name: 'matrix', why: 'not_affine' });
  if (!M4.isRigid(m, tol)) return NSF.transform(toNurbs(s), m);
  const moveCurve = (c) => (CV.isCurve(c) ? CV.transform(c, m) : AC.transform(c, m, tol));
  if (s.type === 'revolution') return revolution({ profile: moveCurve(s.profile), axis: { o: M4.apply(m, s.axis.o), d: M4.applyDir(m, s.axis.d) }, urange: s.urange.slice() });
  if (s.type === 'extrusion') return extrusion({ profile: moveCurve(s.profile), d: M4.applyDir(m, s.d), vrange: s.vrange.slice() });
  const f = s.frame, nf = F.frameFromZX(M4.apply(m, f.o), M4.applyDir(m, f.z), M4.applyDir(m, f.x), tol);
  return fromData({ ...toData(s), frame: F.toData(nf) }, tol);
}

export const bbox = (s) => NSF.bbox(toNurbs(s));
