/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * corpus.js — cc-solid (S14, docs/solid/HANDOFF.md § 11, M2): the primitive corpus, seven closed solids with their exact
 * answers, for the auditor's tests and for every later session's. DOM-free; imports core/, math/, geom/ and topo/ (it makes
 * bodies, it does not judge them: audit.js does not import it).
 *
 *   corpus({ seed, tol }) → [{ name, brep, solid, genus, volume }]   the same bodies for the same seed: random sizes and
 *       placements from the seeded generator (prng.js). `volume` is the closed form.
 *   names: 'box' · 'cylinder' · 'cone' · 'sphere' · 'torus' · 'prism-with-holes' · 'vase'
 *     box              a polyhedron (build.js) with pcurves put on (trim.attach); genus 0, a·b·c
 *     cylinder, cone, sphere, torus   topo/prim.js: seams and poles; genus 0 (the torus 1), πr²h, πr²h/3, 4πr³/3, 2π²Rr²
 *     prism-with-holes a block with two square holes through it, made with Euler operators (two rings on the top and on the bottom,
 *                      so two faces have loops inside their outer one); genus 2, (18 − 2) k² h
 *     vase             a body of revolution: a circular arc turned about an axis (a `revolution` surface, no seam but its
 *                      own), a plane cap each end; its pcurves are straight lines in (u, v). Genus 0, π ∫ r(z)² dz in closed form
 */
import { resolveTol } from '../core/tol.js';
import { sin, cos, asin, TAU } from '../core/trig.js';
import { makePrng } from '../core/prng.js';
import * as V3 from '../math/vec3.js';
import * as Fr from '../math/frame.js';
import * as AC from '../geom/analytic-curve.js';
import * as AS from '../geom/analytic-surface.js';
import * as B from '../topo/brep.js';
import * as E from '../topo/euler.js';
import * as Bu from '../topo/build.js';
import * as P from '../topo/pcurve.js';
import * as Pr from '../topo/prim.js';
import * as Tr from '../topo/trim.js';

const PI = TAU / 2;

function box(g, T) {
  const f = place(g), a = g.range(1, 6), b = g.range(1, 6), c = g.range(1, 6);
  const pts = [[0, 0, 0], [a, 0, 0], [a, b, 0], [0, b, 0], [0, 0, c], [a, 0, c], [a, b, c], [0, b, c]].map((p) => Fr.toWorld(f, p));
  const r = Bu.polyhedron(B.EMPTY, pts, [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], { tol: T });
  return { name: 'box', brep: Tr.attach(r.brep, { tol: T }).brep, solid: r.solid, genus: 0, volume: a * b * c };
}

/** a placement: a random origin, a random axis in the upper hemisphere (so no axis is parallel to a coordinate by accident) */
function place(g) {
  return Fr.frameFromZ([g.range(-5, 5), g.range(-5, 5), g.range(-5, 5)], V3.unit([g.range(-1, 1), g.range(-1, 1), g.range(0.2, 1)]));
}

function prism(g, T) {
  const k = g.range(1, 3), h = g.range(1, 3) * k, o = [g.range(-4, 4), g.range(-4, 4), g.range(-4, 4)];
  const P3 = (x, y, z) => V3.add(o, [x * k, y * k, z]);
  const start = (b, c) => { const co = B.get(b, 'coedge', c), e = B.get(b, 'edge', co.edge); return co.sense > 0 ? e.v0 : e.v1; };
  const along = (b, edge) => B.adjacency(b).coedgesOfEdge.get(edge).find((c) => B.get(b, 'coedge', c).sense > 0);
  const against = (b, edge) => B.adjacency(b).coedgesOfEdge.get(edge).find((c) => B.get(b, 'coedge', c).sense < 0);
  const base = Bu.polygon(B.EMPTY, [P3(0, 0, 0), P3(6, 0, 0), P3(6, 3, 0), P3(0, 3, 0)], { tol: T });
  const blk = Bu.sweep(base.brep, base.front, [0, 0, h], { tol: T });
  let m = blk.brep;
  const top = P3(0, 0, h);
  // a square hole x0 to x0 + 1 (y 1 to 2): struts and mef draw it on the top, kemr leaves it a ring of the top face, it is swept down
  // through the block as a pocket, and kfmrh kills it into the bottom face: a ring there too, and a hole through
  const hole = (x0) => {
    const corner = B.get(m, 'loop', B.get(m, 'face', blk.top).loops[0]).coedges.find((c) => V3.dist(B.get(m, 'vertex', start(m, c)).point, top) === 0);
    const s0 = E.mev(m, corner, P3(x0, 1, h), { tol: T }); m = s0.brep;
    const s1 = E.mev(m, against(m, s0.edge), P3(x0 + 1, 1, h), { tol: T }); m = s1.brep;
    const s2 = E.mev(m, against(m, s1.edge), P3(x0 + 1, 2, h), { tol: T }); m = s2.brep;
    const s3 = E.mev(m, against(m, s2.edge), P3(x0, 2, h), { tol: T }); m = s3.brep;
    const sq = E.mef(m, against(m, s3.edge), along(m, s1.edge), { tol: T }); m = sq.brep;
    m = E.kemr(m, s0.edge, { tol: T }).brep;
    m = Bu.sweep(m, sq.face, [0, 0, -h], { tol: T }).brep;
    m = E.kfmrh(m, sq.face, base.back, { tol: T }).brep;
  };
  hole(1); hole(4);
  const solid = B.ids(m, 'solid')[0];
  return { name: 'prism-with-holes', brep: Tr.attach(m, { tol: T }).brep, solid, genus: 2, volume: (18 - 2) * k * k * h };
}

function vase(g, T) {
  const f = place(g), H = g.range(3, 6), Rc = H * g.range(0.7, 1), c = -0.5 * Rc, a0 = g.range(0.3, 0.9), a1 = g.range(0.3, 0.9);
  const w0 = -Rc * sin(a0), w1 = Rc * sin(a1), z0 = 0, z1 = w1 - w0;               // the arc's height w (from its centre) and the body's z
  const centre = Fr.toWorld(f, [c, 0, -w0]);
  const arc = AC.circle({ frame: Fr.frameFromZX(centre, Fr.dirToWorld(f, [0, -1, 0]), f.x, T), r: Rc, range: [-a0, a1] });
  const [t0, t1] = AC.domain(arc);
  const side = AS.revolution({ profile: arc, axis: { o: f.o, d: f.z }, urange: [0, TAU] });
  const p0 = AC.point(arc, t0), p1 = AC.point(arc, t1);
  const frameAt = (z) => Fr.frameFromZX(V3.madd(f.o, z, f.z), f.z, f.x, T);
  const r0 = c + Rc * cos(a0), r1 = c + Rc * cos(a1);
  const disc = (fr, r) => AS.plane({ frame: fr, urange: [-r * 1.5, r * 1.5], vrange: [-r * 1.5, r * 1.5] });
  const fb = frameAt(z0), ft = frameAt(z1), capB = disc(fb, r0), capT = disc(ft, r1);
  const out = {};
  out.brep = B.edit(B.EMPTY, (d) => {
    const vA = d.vertex(p0), vB = d.vertex(p1);
    const cb = AC.circle({ frame: fb, r: r0 }), ct = AC.circle({ frame: ft, r: r1 });
    const eb = d.edge(cb, 0, TAU, vA, vA), et = d.edge(ct, 0, TAU, vB, vB), es = d.edge(arc, t0, t1, vA, vB);
    const loopSide = d.loop(null, [[eb, 1], [es, 1], [et, -1], [es, -1]], {
      pcurves: [P.uvLine([0, t0], [TAU, t0], 0, TAU), P.uvLine([TAU, t0], [TAU, t1], t0, t1), P.uvLine([0, t1], [TAU, t1], 0, TAU), P.uvLine([0, t0], [0, t1], t0, t1)],
    });
    const loopB = d.loop(null, [[eb, -1]], { pcurves: [P.pcurveOf(capB, cb, 0, TAU, { near: [0, 0], tol: T })] });
    const loopT = d.loop(null, [[et, 1]], { pcurves: [P.pcurveOf(capT, ct, 0, TAU, { near: [0, 0], tol: T })] });
    const fs = d.face(side, 1, [loopSide]), fbm = d.face(capB, -1, [loopB]), ftp = d.face(capT, 1, [loopT]);
    out.shell = d.shell([fs, fbm, ftp]);
    out.solid = d.solid([out.shell]);
  }, T);
  // π ∫ r(w)² dw over w in [w0, w1], r = c + √(Rc² − w²): c² Δw + 2c ∫√ + ∫ (Rc² − w²)
  const root = (w) => 0.5 * (w * Math.sqrt(Rc * Rc - w * w) + Rc * Rc * asin(w / Rc));
  const volume = PI * (c * c * (w1 - w0) + 2 * c * (root(w1) - root(w0)) + (Rc * Rc * (w1 - w0) - (w1 * w1 * w1 - w0 * w0 * w0) / 3));
  return { name: 'vase', brep: out.brep, solid: out.solid, genus: 0, volume };
}
export function corpus({ seed = 1, tol } = {}) {
  const T = resolveTol(tol), g = makePrng(seed), out = [];
  out.push(box(g, T));
  { const f = place(g), r = g.range(1, 4), h = g.range(1, 6), p = Pr.cylinder(B.EMPTY, { frame: f, r, h }, { tol: T }); out.push({ name: 'cylinder', brep: p.brep, solid: p.solid, genus: 0, volume: PI * r * r * h }); }
  { const f = place(g), r = g.range(1, 4), h = g.range(1, 6), p = Pr.cone(B.EMPTY, { frame: f, r, h }, { tol: T }); out.push({ name: 'cone', brep: p.brep, solid: p.solid, genus: 0, volume: (PI * r * r * h) / 3 }); }
  { const f = place(g), r = g.range(1, 4), p = Pr.sphere(B.EMPTY, { frame: f, r }, { tol: T }); out.push({ name: 'sphere', brep: p.brep, solid: p.solid, genus: 0, volume: (4 * PI * r * r * r) / 3 }); }
  { const f = place(g), r = g.range(0.5, 2), R = r + g.range(0.5, 3), p = Pr.torus(B.EMPTY, { frame: f, R, r }, { tol: T }); out.push({ name: 'torus', brep: p.brep, solid: p.solid, genus: 1, volume: 2 * PI * PI * R * r * r }); }
  out.push(prism(g, T));
  out.push(vase(g, T));
  return Object.freeze(out.map((x) => Object.freeze(x)));
}
