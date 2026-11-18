/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * prim.js — cc-solid (S13, docs/solid/HANDOFF.md § 8.5, M2): the four curved primitives as solids, built whole, seams and
 * poles included. DOM-free; imports core/, math/, geom/, brep.js and pcurve.js.
 *
 * Each is one closed shell on analytic surfaces (they keep their identity: a cylinder is a cylinder, for STEP and for the
 * auditor), every coedge carries its pcurve (pcurve.js), and each face sits outward (sense +1; a cap facing against its plane's
 * normal has sense −1). Their one non-planar face is a rectangle in (u, v) with the periodic seam and the poles in its loop:
 *   seam   an edge a loop uses twice, once up (at u = 2π) and once down (at u = 0), with two pcurves; so the edge has two
 *          coedges in one loop, with senses +1 and −1
 *   pole   a degenerate edge, whose 3D curve stays at one point (pcurve.js pointCurve) and whose pcurve runs along the pole in
 *          (u, v), one coedge; it joins a vertex to itself, and is no place two faces meet, so Euler–Poincaré counts the edges
 *          without it (trim.js degenerate)
 *
 *   cylinder(b, { frame, r, h }, { tol }) → { brep, solid, shell, side, bottom, top, edges: { bottom, top, seam } }
 *       the axis the frame's z from its origin up to h; the seam at u = 0, along the frame's x. 2 vertices, 3 edges, 3 faces
 *   cone(b, { frame, r, h }, { tol }) → { brep, solid, shell, side, base, edges: { base, seam, apex } }
 *       base radius r at the origin, apex at h on the axis; the apex edge is the pole. 2 vertices, 2 edges (and the pole), 2 faces
 *   sphere(b, { frame, r }, { tol }) → { brep, solid, shell, face, edges: { seam, south, north } }
 *       the poles on the axis, the seam a half meridian along the frame's x. 2 vertices, 1 edge (and 2 poles), 1 face
 *   torus(b, { frame, R, r }, { tol }) → { brep, solid, shell, face, edges: { major, minor } }
 *       a tube of radius r round a circle of radius R > r; one vertex on the frame's x, two edges (a parallel and a meridian,
 *       each used twice in the one loop), 1 face; genus 1
 * Refusals: solid.err.bad_input { name, why }: 'b' 'not_a_brep'; 'frame' 'not_a_frame'; 'r', 'R', 'h' 'not_a_number' |
 * 'not_positive' | 'out_of_range'; 'R' 'not_above_r' — and what brep.edit and the surface constructors refuse.
 */
import { fail } from '../core/errors.js';
import { resolveTol } from '../core/tol.js';
import { pow2, nextUp } from '../core/float.js';
import { TAU, HALF_PI, atan, tan } from '../core/trig.js';
import * as V3 from '../math/vec3.js';
import * as Fr from '../math/frame.js';
import * as AC from '../geom/analytic-curve.js';
import * as AS from '../geom/analytic-surface.js';
import * as B from './brep.js';
import * as P from './pcurve.js';

const BAD = 'solid.err.bad_input', HI = pow2(500);

function dim(x, name) {
  if (typeof x !== 'number' || !Number.isFinite(x)) fail(BAD, { name, why: 'not_a_number' });
  if (!(x > 0)) fail(BAD, { name, why: 'not_positive' });
  if (x > HI) fail(BAD, { name, why: 'out_of_range' });
  return x;
}
function start(b, frame) {
  if (!B.isBrep(b)) fail(BAD, { name: 'b', why: 'not_a_brep' });
  if (!Fr.isFrame(frame)) fail(BAD, { name: 'frame', why: 'not_a_frame' });
}
const at = (f, h) => V3.madd(f.o, h, f.z);                                           // the origin moved h along the axis
const slid = (f, h, T) => Fr.frameFromZX(at(f, h), f.z, f.x, T);
/** a frame whose x is the axis's x and whose circle runs in the plane of the axis: round the circle's centre c, θ = 0 along x, π/2 along z */
const meridian = (f, c, T) => Fr.frameFromZX(c, V3.neg(f.y), f.x, T);
/** a cap's plane, with half the disc's radius to spare (as build.js does for a polygon): rounding never puts its rim outside the plane's range */
const disc = (f, r) => AS.plane({ frame: f, urange: [-r - r / 2, r + r / 2], vrange: [-r - r / 2, r + r / 2] });

export function cylinder(b, { frame, r, h } = {}, { tol } = {}) {
  start(b, frame);
  const T = resolveTol(tol);
  dim(r, 'r'); dim(h, 'h');
  const side = AS.cylinder({ frame, r, urange: [0, TAU], vrange: [0, h] }), top = slid(frame, h, T);
  const bottomCap = disc(frame, r), topCap = disc(top, r);
  const a = V3.madd(frame.o, r, frame.x), out = {};
  out.brep = B.edit(b, (d) => {
    const vA = d.vertex(a), vB = d.vertex(V3.madd(a, h, frame.z));
    const cb = AC.circle({ frame, r }), ct = AC.circle({ frame: top, r }), cs = AC.line({ o: a, d: frame.z, range: [0, h] });
    const eb = d.edge(cb, 0, TAU, vA, vA), et = d.edge(ct, 0, TAU, vB, vB), es = d.edge(cs, 0, h, vA, vB);
    const pc = (s, c, t1, near) => P.pcurveOf(s, c, 0, t1, { near, tol: T });
    const loopSide = d.loop(null, [[eb, 1], [es, 1], [et, -1], [es, -1]], {
      pcurves: [pc(side, cb, TAU, [0, 0]), pc(side, cs, h, [TAU, 0]), pc(side, ct, TAU, [0, h]), pc(side, cs, h, [0, 0])],
    });
    const loopBottom = d.loop(null, [[eb, -1]], { pcurves: [pc(bottomCap, cb, TAU, [0, 0])] });
    const loopTop = d.loop(null, [[et, 1]], { pcurves: [pc(topCap, ct, TAU, [0, 0])] });
    out.side = d.face(side, 1, [loopSide]);
    out.bottom = d.face(bottomCap, -1, [loopBottom]);
    out.top = d.face(topCap, 1, [loopTop]);
    out.shell = d.shell([out.side, out.bottom, out.top]);
    out.solid = d.solid([out.shell]);
    out.edges = Object.freeze({ bottom: eb, top: et, seam: es });
  }, T);
  return Object.freeze(out);
}

export function cone(b, { frame, r, h } = {}, { tol } = {}) {
  start(b, frame);
  const T = resolveTol(tol);
  dim(r, 'r'); dim(h, 'h');
  // the radius r + v tan α falls to 0 at v = h; rounding may leave it a hair below 0 there, which the surface refuses, so the
  // angle is moved towards 0 by an ulp or two until it does not (the apex's radius is then at most a few ulps of r)
  let angle = atan(-r / h);
  for (let k = 0; k < 8 && r + h * tan(angle) < 0; k++) angle = nextUp(angle);
  const side = AS.cone({ frame, r, angle, urange: [0, TAU], vrange: [0, h] }), base = disc(frame, r);
  const a = V3.madd(frame.o, r, frame.x), apex = at(frame, h), out = {};
  out.brep = B.edit(b, (d) => {
    const vA = d.vertex(a), vT = d.vertex(apex);
    const cb = AC.circle({ frame, r }), cs = AC.lineThrough(a, apex), L = AC.domain(cs)[1], cp = P.pointCurve(apex, 0, TAU);
    const eb = d.edge(cb, 0, TAU, vA, vA), es = d.edge(cs, 0, L, vA, vT), ep = d.edge(cp, 0, TAU, vT, vT);
    const pc = (c, t1, near) => P.pcurveOf(side, c, 0, t1, { near, tol: T });
    const loopSide = d.loop(null, [[eb, 1], [es, 1], [ep, -1], [es, -1]], {
      pcurves: [pc(cb, TAU, [0, 0]), pc(cs, L, [TAU, 0]), P.uvLine([0, h], [TAU, h], 0, TAU), pc(cs, L, [0, 0])],
    });
    const loopBase = d.loop(null, [[eb, -1]], { pcurves: [P.pcurveOf(base, cb, 0, TAU, { near: [0, 0], tol: T })] });
    out.side = d.face(side, 1, [loopSide]);
    out.base = d.face(base, -1, [loopBase]);
    out.shell = d.shell([out.side, out.base]);
    out.solid = d.solid([out.shell]);
    out.edges = Object.freeze({ base: eb, seam: es, apex: ep });
  }, T);
  return Object.freeze(out);
}

export function sphere(b, { frame, r } = {}, { tol } = {}) {
  start(b, frame);
  const T = resolveTol(tol);
  dim(r, 'r');
  const face = AS.sphere({ frame, r, urange: [0, TAU], vrange: [-HALF_PI, HALF_PI] }), out = {};
  const south = V3.madd(frame.o, -r, frame.z), north = V3.madd(frame.o, r, frame.z);
  out.brep = B.edit(b, (d) => {
    const vS = d.vertex(south), vN = d.vertex(north);
    const cm = AC.circle({ frame: meridian(frame, frame.o, T), r, range: [-HALF_PI, HALF_PI] });
    const es = d.edge(cm, -HALF_PI, HALF_PI, vS, vN), ps = d.edge(P.pointCurve(south, 0, TAU), 0, TAU, vS, vS), pn = d.edge(P.pointCurve(north, 0, TAU), 0, TAU, vN, vN);
    const seam = (near) => P.pcurveOf(face, cm, -HALF_PI, HALF_PI, { near, tol: T });
    const loop = d.loop(null, [[ps, 1], [es, 1], [pn, -1], [es, -1]], {
      pcurves: [P.uvLine([0, -HALF_PI], [TAU, -HALF_PI], 0, TAU), seam([TAU, -HALF_PI]), P.uvLine([0, HALF_PI], [TAU, HALF_PI], 0, TAU), seam([0, -HALF_PI])],
    });
    out.face = d.face(face, 1, [loop]);
    out.shell = d.shell([out.face]);
    out.solid = d.solid([out.shell]);
    out.edges = Object.freeze({ seam: es, south: ps, north: pn });
  }, T);
  return Object.freeze(out);
}

export function torus(b, { frame, R, r } = {}, { tol } = {}) {
  start(b, frame);
  const T = resolveTol(tol);
  dim(R, 'R'); dim(r, 'r');
  if (!(R > r)) fail(BAD, { name: 'R', why: 'not_above_r' });
  const face = AS.torus({ frame, R, r, urange: [0, TAU], vrange: [0, TAU] }), out = {};
  const p = V3.madd(frame.o, R + r, frame.x);
  out.brep = B.edit(b, (d) => {
    const v = d.vertex(p);
    const cj = AC.circle({ frame, r: R + r }), cn = AC.circle({ frame: meridian(frame, V3.madd(frame.o, R, frame.x), T), r });
    const ej = d.edge(cj, 0, TAU, v, v), en = d.edge(cn, 0, TAU, v, v);
    const pc = (c, near) => P.pcurveOf(face, c, 0, TAU, { near, tol: T });
    const loop = d.loop(null, [[ej, 1], [en, 1], [ej, -1], [en, -1]], { pcurves: [pc(cj, [0, 0]), pc(cn, [TAU, 0]), pc(cj, [0, TAU]), pc(cn, [0, 0])] });
    out.face = d.face(face, 1, [loop]);
    out.shell = d.shell([out.face]);
    out.solid = d.solid([out.shell]);
    out.edges = Object.freeze({ major: ej, minor: en });
  }, T);
  return Object.freeze(out);
}
