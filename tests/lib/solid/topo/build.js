/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * build.js — cc-solid (S12, docs/solid/HANDOFF.md § 8.4, M2): bodies from points, made with the Euler operators or sewn by
 * vertex identity. DOM-free; imports core/, math/, geom/, brep.js and euler.js.
 *
 *   polygon(b, points, { tol }) → { brep, front, back, shell }
 *       a lamina in a new shell: two faces on the polygon's plane, made with Euler operators (mevvlfs, a strut for each
 *       further point, mef to close). front runs through the points in their order, counter-clockwise about its normal
 *       (Newell's); back runs the other way, on the same plane with sense −1
 *   sweep(b, face, vector, { tol }) → { brep, top, sides }
 *       Mäntylä's translational sweep of a polygon face (one loop, straight edges, its vertices distinct): a strut from each
 *       vertex along the vector (mev), then the side face of each edge (mef). The face itself moves to the far end and keeps
 *       its id; `sides` follow its loop. The moved face and the sides get the planes of their loops, sense +1, and a
 *       lamina's shell becomes a solid. A face of a solid swept into it (against its normal) makes a pocket; a lamina's face
 *       swept against its normal would be inside out and is refused
 *   polyhedron(b, points, faces, { tol }) → { brep, shell, solid }
 *       a closed polyhedron sewn by vertex identity: each face a list of point indices (at least three, none twice); an edge
 *       is a pair of indices next to each other in a face and is shared by the two faces that use it. Every edge must be
 *       used twice, once each way; every point used; one connected piece. Turned outward by its signed volume (every face
 *       reversed when it is negative); straight edges; each face on the plane of its points
 *   sew(b, polygons, { tol }) → { brep, shell, solid, vertices }
 *       the same from faces given as their own points (HANDOFF § 8.4: by identity first, by geometry within tolerance
 *       second): points closer than tol.lin are one vertex, placed at the first of them. The closeness must split the points
 *       cleanly — a point near two vertices, or a vertex whose points spread wider than tol.lin, is refused — and a face
 *       whose own points merge is refused; then polyhedron() builds it. `vertices` counts the merged points
 *   The plane of a polygon: Newell's normal (the sum of the fan's cross products from its first point, twice its vector
 *   area), the frame's x along its first edge, every point within tol.lin of it, the range its points' with half their
 *   extent to spare.
 * Refusals: solid.err.bad_input { name, why }: 'points' 'not_points' | 'too_few' | 'short_edge' | 'degenerate' |
 * 'not_planar'; 'faces' 'not_a_list' | 'too_few' | 'not_a_face' | 'not_closed' | 'not_oriented' | 'unused_point' |
 * 'not_connected' | 'flat' | 'short_edge' | 'degenerate' | 'not_planar' | 'ambiguous'; 'face' 'not_one_loop' |
 * 'not_a_polygon'; 'vector' 'not_a_vector' | 'parallel' | 'inside_out' — and what the Euler operators and brep.edit refuse.
 */
import { fail } from '../core/errors.js';
import { resolveTol } from '../core/tol.js';
import * as V3 from '../math/vec3.js';
import * as Fr from '../math/frame.js';
import * as C from '../geom/curve.js';
import * as AC from '../geom/analytic-curve.js';
import * as AS from '../geom/analytic-surface.js';
import * as B from './brep.js';
import * as E from './euler.js';

const BAD = 'solid.err.bad_input';
const no = (name, why) => fail(BAD, { name, why });

/** Newell's normal of a polygon: the sum of its fan's cross products from the first point, twice its vector area. */
function newell(pts) {
  let n = [0, 0, 0];
  for (let k = 1; k + 1 < pts.length; k++) n = V3.add(n, V3.cross(V3.sub(pts[k], pts[0]), V3.sub(pts[k + 1], pts[0])));
  return n;
}

/** The plane of a polygon's points (see the header); `name` is the argument a refusal names. */
function planeOf(pts, T, name) {
  let per = 0;
  for (let k = 0; k < pts.length; k++) {
    const e = V3.dist(pts[k], pts[(k + 1) % pts.length]);
    if (!(e > T.lin)) no(name, 'short_edge');
    per += e;
  }
  const n = newell(pts);
  if (!(V3.len(n) > T.lin * per)) no(name, 'degenerate');              // thinner than tol.lin
  const f = Fr.frameFromZX(pts[0], n, V3.sub(pts[1], pts[0]), T);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of pts) {
    const q = Fr.toLocal(f, p);
    if (Math.abs(q[2]) > T.lin) no(name, 'not_planar');
    u0 = Math.min(u0, q[0]); u1 = Math.max(u1, q[0]); v0 = Math.min(v0, q[1]); v1 = Math.max(v1, q[1]);
  }
  const m = Math.max(u1 - u0, v1 - v0) / 2 + T.lin;
  return AS.plane({ frame: f, urange: [u0 - m, u1 + m], vrange: [v0 - m, v1 + m] });
}

function startOf(b, c) {
  const co = B.get(b, 'coedge', c), e = B.get(b, 'edge', co.edge);
  return co.sense > 0 ? e.v0 : e.v1;
}
const pointsOf = (b, loop) => B.get(b, 'loop', loop).coedges.map((c) => B.get(b, 'vertex', startOf(b, c)).point);
const coedgeOf = (b, edge, sense) => B.adjacency(b).coedgesOfEdge.get(edge).find((c) => B.get(b, 'coedge', c).sense === sense);
const isPoints = (x) => Array.isArray(x) && x.every((p) => V3.isVec3(p));

export function polygon(b, points, { tol } = {}) {
  const T = resolveTol(tol);
  if (!isPoints(points)) no('points', 'not_points');
  if (points.length < 3) no('points', 'too_few');
  const pl = planeOf(points, T, 'points');
  const first = E.mevvlfs(b, points[0], points[1], { surface: pl, sense: -1, tol: T });
  // the loop is a chain out and back; each new point hangs off the coedge that starts at the chain's last vertex
  let cur = first.brep, back = coedgeOf(cur, first.edge, -1);
  for (let i = 2; i < points.length; i++) {
    const r = E.mev(cur, back, points[i], { tol: T });
    cur = r.brep;
    back = coedgeOf(cur, r.edge, -1);
  }
  // close from the last vertex to the first: the new face takes the chain's way out (the points' order), the lamina's
  // first face keeps the way back
  const r = E.mef(cur, back, coedgeOf(cur, first.edge, 1), { surface: pl, sense: 1, tol: T });
  return Object.freeze({ brep: r.brep, front: r.face, back: first.face, shell: first.shell });
}

export function sweep(b, face, vector, { tol } = {}) {
  const T = resolveTol(tol);
  if (!V3.isVec3(vector)) no('vector', 'not_a_vector');
  const F = B.get(b, 'face', face);
  if (F.loops.length !== 1) no('face', 'not_one_loop');
  const loop = F.loops[0], cs = B.get(b, 'loop', loop).coedges.slice(), n = cs.length, base = cs.map((c) => startOf(b, c));
  if (n < 3 || new Set(base).size !== n || cs.some((c) => C.typeOf(B.get(b, 'edge', B.get(b, 'coedge', c).edge).curve) !== 'line')) no('face', 'not_a_polygon');
  const pts = base.map((v) => B.get(b, 'vertex', v).point), nrm = newell(pts), h = V3.dot(vector, nrm) / V3.len(nrm);
  if (!(Math.abs(h) > T.lin)) no('vector', 'parallel');
  const shell = F.shell, solid = shell === null ? null : B.get(b, 'shell', shell).solid;
  if (h < 0 && solid === null) no('vector', 'inside_out');
  // a strut from every vertex; then, edge by edge, the side face cut off the loop (mef from the next strut's end to this
  // one's): the loop that is left is the moved face's
  let cur = b;
  const moved = [];
  for (let i = 0; i < n; i++) {
    const r = E.mev(cur, cs[i], V3.add(pts[i], vector), { tol: T });
    cur = r.brep;
    moved.push(r.vertex);
  }
  const at = (v) => B.get(cur, 'loop', loop).coedges.find((c) => startOf(cur, c) === v);
  const sides = [];
  for (let i = 0; i < n; i++) {
    const r = E.mef(cur, at(moved[(i + 1) % n]), at(moved[i]), { tol: T });
    cur = r.brep;
    sides.push(r.face);
  }
  const placed = [face, ...sides].map((f) => [f, planeOf(pointsOf(cur, B.get(cur, 'face', f).loops[0]), T, 'faces')]);
  cur = B.edit(cur, (d) => {
    for (const [f, pl] of placed) d.set('face', f, { surface: pl, sense: 1 });
    if (shell !== null && solid === null) d.solid([shell]);
  }, T);
  return Object.freeze({ brep: cur, top: face, sides: Object.freeze(sides) });
}

export function polyhedron(b, points, faces, { tol } = {}) {
  const T = resolveTol(tol);
  if (!isPoints(points)) no('points', 'not_points');
  if (!Array.isArray(faces)) no('faces', 'not_a_list');
  if (points.length < 4) no('points', 'too_few');
  if (faces.length < 4) no('faces', 'too_few');
  for (const f of faces) if (!Array.isArray(f) || f.length < 3 || !f.every((i) => Number.isInteger(i) && i >= 0 && i < points.length) || new Set(f).size !== f.length) no('faces', 'not_a_face');
  const key = (a, c) => (a < c ? a + ',' + c : c + ',' + a);
  const uses = new Map();
  faces.forEach((f, fi) => f.forEach((a, k) => {
    const c = f[(k + 1) % f.length], kk = key(a, c);
    if (!uses.has(kk)) uses.set(kk, []);
    uses.get(kk).push([fi, a < c ? 1 : -1]);
  }));
  for (const u of uses.values()) {
    if (u.length !== 2) no('faces', 'not_closed');
    if (u[0][1] === u[1][1]) no('faces', 'not_oriented');
  }
  if (new Set(faces.flat()).size !== points.length) no('faces', 'unused_point');
  // one piece: every face reached from the first through shared edges
  const next = faces.map(() => []), seen = new Set([0]), stack = [0];
  for (const [[f1], [f2]] of uses.values()) { next[f1].push(f2); next[f2].push(f1); }
  while (stack.length) for (const f of next[stack.pop()]) if (!seen.has(f)) { seen.add(f); stack.push(f); }
  if (seen.size !== faces.length) no('faces', 'not_connected');
  // outward: six times the signed volume is the sum over every face's fan of the triple products, about the first point
  const o = points[0], rel = points.map((p) => V3.sub(p, o));
  let vol = 0, size = 0;
  for (const f of faces) for (let k = 1; k + 1 < f.length; k++) vol += V3.triple(rel[f[0]], rel[f[k]], rel[f[k + 1]]);
  for (const p of rel) size = Math.max(size, V3.len(p));
  if (!(Math.abs(vol) > 6 * T.lin * size * size)) no('faces', 'flat');
  const fs = vol > 0 ? faces : faces.map((f) => f.slice().reverse());
  const planes = fs.map((f) => planeOf(f.map((i) => points[i]), T, 'faces'));
  const out = {};
  out.brep = B.edit(b, (d) => {
    const vid = points.map((p) => d.vertex(p)), eid = new Map();
    const use = (a, c) => {
      const kk = key(a, c);
      if (!eid.has(kk)) {
        const [p, q] = a < c ? [a, c] : [c, a], ln = AC.lineThrough(points[p], points[q]);
        eid.set(kk, d.edge(ln, 0, AC.domain(ln)[1], vid[p], vid[q]));
      }
      return [eid.get(kk), a < c ? 1 : -1];
    };
    const ids = fs.map((f, fi) => d.face(planes[fi], 1, [d.loop(null, f.map((a, k) => use(a, f[(k + 1) % f.length])))]));
    out.shell = d.shell(ids);
    out.solid = d.solid([out.shell]);
  }, T);
  return Object.freeze(out);
}

export function sew(b, polygons, { tol } = {}) {
  const T = resolveTol(tol), h = 2 * T.lin;
  if (!Array.isArray(polygons) || !polygons.every((f) => isPoints(f) && f.length >= 3)) no('faces', 'not_a_list');
  // every point seen, in a grid of cells 2 tol.lin wide (a point's neighbours within tol.lin are in the 27 cells around it)
  const reps = [], members = [], cells = new Map(), cell = (p) => p.map((x) => Math.floor(x / h));
  const index = (p) => {
    const [ci, cj, ck] = cell(p), near = new Set();
    for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) for (let e = -1; e <= 1; e++) {
      for (const [q, v] of cells.get(`${ci + a},${cj + c},${ck + e}`) || []) if (V3.dist(q, p) <= T.lin) near.add(v);
    }
    if (near.size > 1) no('faces', 'ambiguous');
    let v;
    if (near.size === 1) {
      v = [...near][0];
      if (!members[v].every((q) => V3.dist(q, p) <= T.lin)) no('faces', 'ambiguous');
    } else { v = reps.length; reps.push(p); members.push([]); }
    members[v].push(p);
    const kk = `${ci},${cj},${ck}`;
    if (!cells.has(kk)) cells.set(kk, []);
    cells.get(kk).push([p, v]);
    return v;
  };
  const faces = polygons.map((f) => f.map(index));
  for (const f of faces) if (new Set(f).size !== f.length) no('faces', 'short_edge');
  const r = polyhedron(b, reps, faces, { tol: T });
  return Object.freeze({ ...r, vertices: reps.length });
}
