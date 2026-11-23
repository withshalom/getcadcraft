/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its findings are codes (the app words them). */
/**
 * audit.js — cc-solid (S14, docs/solid/HANDOFF.md § 11, M2): the auditor, the independent referee of a B-rep. DOM-free;
 * imports core/, math/, geom/ and topo/ — never ops/ or mesh/, so it cannot share a bug with what it judges (checker rule
 * `audit`). It reads a snapshot and changes nothing, and it advises: a finding blocks nothing (docs/solid/CODE-CULTURE.md § 6),
 * the engine's refusals stay refusals.
 *
 *   audit(b, { tol, samples, genus, volume }) → { ok, problems, summary, stats, capped }
 *     problems  the suite's Problems shape: { code, severity: 'warning' | 'note', msg: { key, vars }, about: [{ kind, id, label }],
 *               source: { name } }. A warning says the body is wrong; a note says something could not be judged or is only
 *               worth knowing. `code` and `msg.key` are the same string, FINDINGS lists them all (the app words them, S24b)
 *     ok        no warning (notes do not count)
 *     summary   [{ set: 'topology' | 'geometry' | 'solid' | 'tolerance', checked, found }]
 *     stats     counts; per shell { chi, genus, closed, volume }; the worst measured gaps; the largest vertex and edge tolerance
 *     capped    true when more than LIMIT problems were found and the list was cut (summary still counts them all)
 *     samples   points checked along each coedge (2 to 64, default 8); genus: the genus every closed shell must have (a number,
 *               or { shellId: genus }); volume: false to skip the volume of each shell
 *   FINDINGS · LIMIT
 *   loopArea(pieces) → the area of a closed loop of trim.js pieces in (u, v), positive counter-clockwise (Green's theorem)
 *   piecesMeet(p, q, slack) → whether two pieces (segments judged exactly, arcs in floats) share a point
 *
 * Topology (every one needs only the tables; a snapshot's structural rules were checked when it was made, brep.js check)
 *   orphan_vertex · orphan_edge · orphan_face · face_without_loop · free_shell (note) ·
 *   open_edge (a warning in a solid's shell, a note in a sheet) · non_manifold_edge (three or more coedges) ·
 *   edge_same_direction (an edge two faces use the same way: orientation not consistent) · degenerate_use (a pole's edge not
 *   used once) · disconnected_shell · euler (V − (E − D) + F − R = 2 (1 − genus) per closed shell, D the poles' edges: the
 *   result must be an even number, at most 2, and the genus the one asked for)
 * Geometry
 *   vertex_off_edge (a vertex further than its tolerance from its edge's end) · edge_off_surface (an edge's points, sampled,
 *   against the closest point of each face's surface) · pcurve_off_edge (a pcurve put through its surface against its edge) ·
 *   pcurve_out_of_domain · loop_open_uv · loop_unreadable (note: no pcurve, or one that is not a line, a polyline or a circle) ·
 *   loop_orientation (the outer loop not counter-clockwise about the face's normal) · loop_nesting (a hole not inside the outer
 *   loop, a hole not running the other way, holes overlapping) · loop_self_intersect (pieces of a face's loops cross or touch,
 *   not next to each other) · tolerance (a vertex or edge tolerance above tol.maxEdgeTol)
 * Solid
 *   volume_sign (the outer shell not positive, a void not negative: inside out) · volume_nonpositive · void_outside (a void
 *   shell's points outside the outer shell's boxes: a necessary test only) · volume_skipped (note)
 * The volume of a closed shell is the divergence theorem, ∬ p · n dA / 3, with each face integrated in its own (u, v) by
 * Green's theorem: round the boundary of its loops, G(u, v) = ∫ f du by Gauss–Legendre, so the trim is exact and no mesh is
 * made. It is accurate for the analytic surfaces (smooth integrands); for a NURBS surface with interior knots it is a
 * measurement, reported in stats, never exact. A face with no pcurves, or with loops that do not read, has no volume: the
 * shell's volume is skipped with a note. Not here yet: a face/face crossing test (§ 11 calls it optional and expensive).
 */
import { fail, isSolidError } from '../core/errors.js';
import { resolveTol } from '../core/tol.js';
import { atan2, cos, sin, TAU, PI } from '../core/trig.js';
import { orient2d } from '../math/predicates.js';
import * as V3 from '../math/vec3.js';
import * as Q from '../math/quad.js';
import * as C from '../geom/curve.js';
import * as SF from '../geom/surface.js';
import * as QY from '../geom/query.js';
import * as B from '../topo/brep.js';
import * as P from '../topo/pcurve.js';
import * as Tr from '../topo/trim.js';

const BAD = 'solid.err.bad_input';
export const LIMIT = 200;
const SOURCE = Object.freeze({ name: 'engine.solid audit' });

export const FINDINGS = Object.freeze([
  'orphan_vertex', 'orphan_edge', 'orphan_face', 'face_without_loop', 'free_shell',
  'open_edge', 'non_manifold_edge', 'edge_same_direction', 'degenerate_use', 'disconnected_shell', 'euler',
  'vertex_off_edge', 'edge_off_surface', 'pcurve_off_edge', 'pcurve_out_of_domain', 'loop_open_uv', 'loop_unreadable',
  'loop_orientation', 'loop_nesting', 'loop_self_intersect', 'tolerance',
  'volume_sign', 'volume_nonpositive', 'void_outside', 'volume_skipped',
].map((k) => 'solid.audit.' + k).sort());

// ---------------------------------------------------------------------------------------------------- (u, v) helpers

const sgn = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
const norm2 = (x, y) => Math.sqrt(x * x + y * y);

/** the middle of a piece */
function midOf(p) {
  if (p.kind === 'seg') return [0.5 * p.a[0] + 0.5 * p.b[0], 0.5 * p.a[1] + 0.5 * p.b[1]];
  const x = (p.a[0] - p.c[0]) / p.r + (p.b[0] - p.c[0]) / p.r, y = (p.a[1] - p.c[1]) / p.r + (p.b[1] - p.c[1]) / p.r, l = norm2(x, y);
  return [p.c[0] + (p.r * x) / l, p.c[1] + (p.r * y) / l];
}
/** the turn of an arc's angle from a to b, in (−π, π] */
function turn(p) {
  const d = atan2(p.b[1] - p.c[1], p.b[0] - p.c[0]) - atan2(p.a[1] - p.c[1], p.a[0] - p.c[0]);
  return d > PI ? d - TAU : d <= -PI ? d + TAU : d;
}
/** ½ ∮ (u dv − v du) round a loop: its area, positive counter-clockwise in (u, v) */
export function loopArea(pieces) {
  let s = 0;
  for (const p of pieces) {
    if (p.kind === 'seg') s += p.a[0] * p.b[1] - p.b[0] * p.a[1];
    else s += p.r * p.r * turn(p) + p.c[0] * (p.b[1] - p.a[1]) - p.c[1] * (p.b[0] - p.a[0]);
  }
  return 0.5 * s;
}
const lengthOf = (p) => (p.kind === 'seg' ? norm2(p.b[0] - p.a[0], p.b[1] - p.a[1]) : p.r * Math.abs(turn(p)));

/** whether q (on the piece's circle) lies on the arc */
function onArc(p, q, slack) {
  const ax = p.a[0] - p.c[0], ay = p.a[1] - p.c[1], bx = p.b[0] - p.c[0], by = p.b[1] - p.c[1], qx = q[0] - p.c[0], qy = q[1] - p.c[1];
  const w = sgn(ax * by - ay * bx), eps = slack * p.r;
  return w * (ax * qy - ay * qx) >= -eps && w * (qx * by - qy * bx) >= -eps;
}
/** whether two pieces share a point (the callers skip pieces next to each other). Segments are judged exactly; arcs in floats. */
export function piecesMeet(p, q, slack) {
  if (p.kind === 'arc' && q.kind === 'seg') return piecesMeet(q, p, slack);
  if (p.kind === 'seg' && q.kind === 'seg') {
    const o1 = orient2d(p.a, p.b, q.a), o2 = orient2d(p.a, p.b, q.b), o3 = orient2d(q.a, q.b, p.a), o4 = orient2d(q.a, q.b, p.b);
    if (o1 * o2 < 0 && o3 * o4 < 0) return true;
    const within = (a, b, x) => Math.min(a[0], b[0]) <= x[0] && x[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= x[1] && x[1] <= Math.max(a[1], b[1]);
    return (o1 === 0 && within(p.a, p.b, q.a)) || (o2 === 0 && within(p.a, p.b, q.b)) || (o3 === 0 && within(q.a, q.b, p.a)) || (o4 === 0 && within(q.a, q.b, p.b));
  }
  if (p.kind === 'seg') {                                   // a segment and an arc
    const dx = p.b[0] - p.a[0], dy = p.b[1] - p.a[1], fx = p.a[0] - q.c[0], fy = p.a[1] - q.c[1];
    const A = dx * dx + dy * dy, Bq = 2 * (fx * dx + fy * dy), Cq = fx * fx + fy * fy - q.r * q.r, disc = Bq * Bq - 4 * A * Cq;
    if (!(A > 0) || disc < 0) return false;
    const root = Math.sqrt(disc);
    return [(-Bq - root) / (2 * A), (-Bq + root) / (2 * A)].some((s) => s >= 0 && s <= 1 && onArc(q, [p.a[0] + s * dx, p.a[1] + s * dy], slack));
  }
  const dx = q.c[0] - p.c[0], dy = q.c[1] - p.c[1], d = norm2(dx, dy);          // two arcs
  if (!(d > 0) || d > p.r + q.r || d < Math.abs(p.r - q.r)) return false;
  const a = (p.r * p.r - q.r * q.r + d * d) / (2 * d), h2 = p.r * p.r - a * a, h = h2 > 0 ? Math.sqrt(h2) : 0;
  const mx = p.c[0] + (a * dx) / d, my = p.c[1] + (a * dy) / d;
  return [[mx + (h * dy) / d, my - (h * dx) / d], [mx - (h * dy) / d, my + (h * dx) / d]].some((x) => onArc(p, x, slack) && onArc(q, x, slack));
}

// ---------------------------------------------------------------------------------------------------- the audit

/** the k-th of n + 1 even steps along an edge, the ends exactly the edge's own (rounding must not step outside its curve's domain) */
const along = (E, k, n) => (k === 0 ? E.t0 : k === n ? E.t1 : E.t0 + ((E.t1 - E.t0) * k) / n);
const label = (kind, id) => Object.freeze({ kind, id, label: kind + '#' + id });

export function audit(b, { tol, samples = 8, genus, volume = true } = {}) {
  if (!B.isBrep(b)) fail(BAD, { name: 'b', why: 'not_a_brep' });
  const T = resolveTol(tol);
  if (!Number.isInteger(samples) || samples < 2 || samples > 64) fail(BAD, { name: 'samples', why: 'out_of_range' });
  if (genus !== undefined && !((Number.isInteger(genus) && genus >= 0) || (genus !== null && typeof genus === 'object' && Object.values(genus).every((g) => Number.isInteger(g) && g >= 0)))) fail(BAD, { name: 'genus', why: 'not_a_genus' });

  const problems = [], sums = { topology: [0, 0], geometry: [0, 0], solid: [0, 0], tolerance: [0, 0] };
  let capped = false;
  const looked = (set, n = 1) => { sums[set][0] += n; };
  const found = (set, code, about, vars = {}, severity = 'warning') => {
    sums[set][1]++;
    if (problems.length >= LIMIT) { capped = true; return; }
    const key = 'solid.audit.' + code;
    problems.push(Object.freeze({ code: key, severity, msg: Object.freeze({ key, vars: Object.freeze(vars) }), about: Object.freeze(about), source: SOURCE }));
  };

  // ---- the tables, read once
  const ids = Object.fromEntries(B.KINDS.map((k) => [k, B.ids(b, k)]));
  const rec = (k, id) => B.get(b, k, id);
  const stats = { vertices: ids.vertex.length, edges: ids.edge.length, faces: ids.face.length, shells: ids.shell.length, solids: ids.solid.length, shellStats: {}, maxVertexGap: 0, maxSurfaceGap: 0, maxPcurveGap: 0, maxVertexTol: 0, maxEdgeTol: 0 };

  const degenerate = new Set(Tr.degenerate(b, { tol: T }));
  const uses = new Map(), faceOfCoedge = new Map();
  for (const id of ids.coedge) {
    const co = rec('coedge', id);
    if (!uses.has(co.edge)) uses.set(co.edge, []);
    uses.get(co.edge).push(co);
    const lp = rec('loop', co.loop);
    faceOfCoedge.set(id, lp.face);
  }
  const shellOfFace = (f) => rec('face', f).shell;
  const inSolid = (shell) => shell !== null && rec('shell', shell).solid !== null;
  const usedVertex = new Set();
  for (const id of ids.edge) { const e = rec('edge', id); usedVertex.add(e.v0); usedVertex.add(e.v1); }

  // ---- topology: orphans and empty things
  for (const id of ids.vertex) { looked('topology'); if (!usedVertex.has(id)) found('topology', 'orphan_vertex', [label('vertex', id)]); }
  for (const id of ids.edge) { looked('topology'); if (!uses.has(id)) found('topology', 'orphan_edge', [label('edge', id)]); }
  for (const id of ids.face) {
    looked('topology');
    const F = rec('face', id);
    if (F.shell === null || F.shell === undefined) found('topology', 'orphan_face', [label('face', id)]);
    if (F.loops.length === 0) found('topology', 'face_without_loop', [label('face', id)]);
  }
  for (const id of ids.shell) { looked('topology'); if (rec('shell', id).solid === null) found('topology', 'free_shell', [label('shell', id)], {}, 'note'); }

  // ---- topology: how each edge is used
  const shellEdges = new Map(ids.shell.map((s) => [s, new Set()]));
  for (const id of ids.edge) {
    const cs = uses.get(id) || [];
    looked('topology');
    for (const co of cs) { const s = shellOfFace(faceOfCoedge.get(co.id)); if (shellEdges.has(s)) shellEdges.get(s).add(id); }
    if (cs.length === 0) continue;
    if (degenerate.has(id)) {
      if (cs.length !== 1) found('topology', 'degenerate_use', [label('edge', id)], { uses: cs.length });
      continue;
    }
    if (cs.length === 1) {
      const solid = inSolid(shellOfFace(faceOfCoedge.get(cs[0].id)));
      found('topology', 'open_edge', [label('edge', id)], {}, solid ? 'warning' : 'note');
    } else if (cs.length > 2) found('topology', 'non_manifold_edge', [label('edge', id)], { uses: cs.length });
    else if (cs[0].sense === cs[1].sense) found('topology', 'edge_same_direction', [label('edge', id)]);
  }

  // ---- topology: each shell's Euler–Poincaré number and its connection
  const closedShell = new Map();
  for (const s of ids.shell) {
    looked('topology');
    const S = rec('shell', s), es = [...shellEdges.get(s)];
    const closed = es.every((e) => (degenerate.has(e) ? uses.get(e).length === 1 : uses.get(e).length === 2));
    closedShell.set(s, closed);
    const vs = new Set(), D = es.filter((e) => degenerate.has(e)).length;
    for (const e of es) { const E = rec('edge', e); vs.add(E.v0); vs.add(E.v1); }
    let R = 0;
    for (const f of S.faces) R += Math.max(0, rec('face', f).loops.length - 1);
    const chi = vs.size - (es.length - D) + S.faces.length - R;
    stats.shellStats[s] = { chi, genus: closed && chi % 2 === 0 ? (2 - chi) / 2 : null, closed, volume: null };
    if (closed) {
      const want = typeof genus === 'number' ? genus : genus && genus[s] !== undefined ? genus[s] : undefined;
      if (chi % 2 !== 0 || chi > 2) found('topology', 'euler', [label('shell', s)], { chi });
      else if (want !== undefined && (2 - chi) / 2 !== want) found('topology', 'euler', [label('shell', s)], { chi, genus: (2 - chi) / 2, want });
    }
    // faces joined by the edges they share (a pole's edge joins nothing): one piece, or the shell is several bodies
    const root = new Map(S.faces.map((f) => [f, f]));
    const find = (f) => { while (root.get(f) !== f) { root.set(f, root.get(root.get(f))); f = root.get(f); } return f; };
    for (const e of es) {
      if (degenerate.has(e)) continue;
      const fs = [...new Set(uses.get(e).map((c) => faceOfCoedge.get(c.id)))].filter((f) => root.has(f));
      for (let i = 1; i < fs.length; i++) root.set(find(fs[i]), find(fs[0]));
    }
    const parts = new Set(S.faces.map(find)).size;
    if (parts > 1) found('topology', 'disconnected_shell', [label('shell', s)], { parts });
  }

  // ---- tolerance
  for (const id of ids.vertex) { looked('tolerance'); const t = rec('vertex', id).tol; stats.maxVertexTol = Math.max(stats.maxVertexTol, t); if (t > T.maxEdgeTol) found('tolerance', 'tolerance', [label('vertex', id)], { tol: t, max: T.maxEdgeTol }); }
  for (const id of ids.edge) { looked('tolerance'); const t = rec('edge', id).tol; stats.maxEdgeTol = Math.max(stats.maxEdgeTol, t); if (t > T.maxEdgeTol) found('tolerance', 'tolerance', [label('edge', id)], { tol: t, max: T.maxEdgeTol }); }

  // ---- geometry: vertices on their edges
  const at = (e, t) => C.point(e.curve, t);
  for (const id of ids.edge) {
    const E = rec('edge', id);
    looked('geometry');
    for (const [end, v, t] of [[0, E.v0, E.t0], [1, E.v1, E.t1]]) {
      const V = rec('vertex', v), gap = V3.dist(at(E, t), V.point), allowed = Math.max(T.lin, V.tol, E.tol);
      stats.maxVertexGap = Math.max(stats.maxVertexGap, gap);
      if (!(gap <= allowed)) found('geometry', 'vertex_off_edge', [label('edge', id), label('vertex', v)], { end, gap, allowed });
    }
  }

  // ---- geometry: coedges on their faces' surfaces, and their pcurves
  const wrap = (s, uv) => {                                      // a periodic parameter is read in the surface's own turn
    const per = P.periods(s), du = SF.domainU(s), dv = SF.domainV(s);
    const w = (x, p, d) => (p ? x - p * Math.floor((x - d[0]) / p) : x);
    const u = w(uv[0], per.u, du), v = w(uv[1], per.v, dv);
    return [u, v, per, du, dv];
  };
  for (const id of ids.coedge) {
    const co = rec('coedge', id), E = rec('edge', co.edge), face = faceOfCoedge.get(id), S = rec('face', face).surface;
    const allowed = Math.max(T.lin, E.tol);
    looked('geometry', 2);
    // each (edge, face) pair against the surface once: a seam's second coedge is the same edge on the same face
    const first = (uses.get(co.edge) || []).find((c) => faceOfCoedge.get(c.id) === face);
    if (first && first.id === id) {
      let worst = 0;
      for (let k = 0; k <= samples; k++) {
        const t = along(E, k, samples);
        worst = Math.max(worst, QY.closestOnSurface(S, at(E, t), T).d);
      }
      stats.maxSurfaceGap = Math.max(stats.maxSurfaceGap, worst);
      if (!(worst <= allowed)) found('geometry', 'edge_off_surface', [label('edge', co.edge), label('face', face)], { gap: worst, allowed });
    }
    if (co.pcurve === null || co.pcurve === undefined) continue;
    let worst = 0, outside = false;
    for (let k = 0; k <= samples; k++) {
      const t = along(E, k, samples), uv = C.point(co.pcurve, t), [u, v, per, du, dv] = wrap(S, uv);
      const slack = T.lin;
      if ((!per.u && (u < du[0] - slack || u > du[1] + slack)) || (!per.v && (v < dv[0] - slack || v > dv[1] + slack))) { outside = true; break; }
      let q;
      try { q = SF.point(S, Math.min(Math.max(u, du[0]), du[1]), Math.min(Math.max(v, dv[0]), dv[1])); } catch (e) { if (isSolidError(e)) { outside = true; break; } throw e; }
      worst = Math.max(worst, V3.dist(q, at(E, t)));
    }
    if (outside) { found('geometry', 'pcurve_out_of_domain', [label('coedge', id), label('face', face)]); continue; }
    stats.maxPcurveGap = Math.max(stats.maxPcurveGap, worst);
    if (!(worst <= allowed)) found('geometry', 'pcurve_off_edge', [label('coedge', id), label('face', face)], { gap: worst, allowed });
  }

  // ---- geometry: each face's loops in (u, v)
  const faceInfo = new Map();                                    // face → { pieces: [per loop], o } for the volume
  for (const f of ids.face) {
    const F = rec('face', f);
    if (F.loops.length === 0) continue;
    looked('geometry');
    const S = F.surface;
    let pieces;
    try { pieces = F.loops.map((l) => Tr.uvLoop(b, l, { tol: T })); } catch (e) {
      if (!isSolidError(e) || e.code !== 'solid.err.not_supported') throw e;
      if (e.vars.why === 'open_in_uv') found('geometry', 'loop_open_uv', [label('face', f)]);
      else found('geometry', 'loop_unreadable', [label('face', f)], { why: e.vars.why }, 'note');
      continue;
    }
    if (pieces.some((p) => p.length === 0)) continue;
    const areas = pieces.map(loopArea), o = sgn(areas[0]);
    if (o !== 0 && o !== F.sense) found('geometry', 'loop_orientation', [label('face', f)], { sense: F.sense });
    // holes: inside the outer loop, running the other way, apart from each other
    for (let i = 1; i < pieces.length; i++) {
      const pt = midOf(pieces[i][0]), w = Tr.winding(pieces[0], pt);
      if (sgn(areas[i]) !== -o) found('geometry', 'loop_nesting', [label('face', f), label('loop', F.loops[i])], { why: 'direction' });
      else if (w !== o) found('geometry', 'loop_nesting', [label('face', f), label('loop', F.loops[i])], { why: w === null ? 'touches' : 'outside' });
      for (let j = 1; j < pieces.length; j++) {
        if (j === i) continue;
        const wj = Tr.winding(pieces[j], pt);
        if (wj !== 0) found('geometry', 'loop_nesting', [label('face', f), label('loop', F.loops[i]), label('loop', F.loops[j])], { why: 'overlap' });
      }
    }
    // pieces that cross or touch without being next to each other
    const flat = pieces.flatMap((ps, li) => ps.map((p, pi) => ({ p, li, pi, n: ps.length })));
    let crossed = 0;
    for (let i = 0; i < flat.length && crossed === 0; i++) for (let j = i + 1; j < flat.length; j++) {
      const A = flat[i], Bp = flat[j];
      if (A.li === Bp.li && (Bp.pi - A.pi === 1 || (A.pi === 0 && Bp.pi === A.n - 1))) continue;
      if (piecesMeet(A.p, Bp.p, T.lin)) { crossed++; break; }
    }
    if (crossed) found('geometry', 'loop_self_intersect', [label('face', f)]);
    faceInfo.set(f, { pieces, o });
  }

  // ---- solid: the volume of each closed shell
  if (volume) {
    const sumFaces = (S, faces, O) => {
      let total = 0;
      for (const f of faces) {
        const info = faceInfo.get(f), F = rec('face', f);
        const surf = F.surface;
        if (!info || info.o === 0) return null;
        let ub = Infinity;
        for (const ps of info.pieces) for (const p of ps) ub = Math.min(ub, p.a[0], p.b[0]);
        const integrand = (u, v) => {
          const [uu, vv] = wrap(surf, [u, v]), sk = SF.derivs(surf, uu, vv, 1);
          return V3.dot(V3.sub(sk[0][0], O), V3.cross(sk[1][0], sk[0][1])) / 3;
        };
        const span = (fn, a, bb, per) => {                        // Gauss–Legendre on pieces about `per` long
          if (a === bb) return 0;
          const lo = Math.min(a, bb), hi = Math.max(a, bb), n = Math.min(16, Math.max(1, Math.ceil((hi - lo) / per)));
          let s = 0;
          for (let i = 0; i < n; i++) s += Q.fixed(fn, lo + ((hi - lo) * i) / n, lo + ((hi - lo) * (i + 1)) / n, 12);
          return a < bb ? s : -s;
        };
        const G = (u, v) => span((x) => integrand(x, v), ub, u, 1);
        let flux = 0;
        for (const ps of info.pieces) for (const p of ps) {
          if (p.kind === 'seg') {
            const dv = p.b[1] - p.a[1];
            if (dv !== 0) flux += span((s) => G(p.a[0] + s * (p.b[0] - p.a[0]), p.a[1] + s * dv) * dv, 0, 1, 1 / Math.max(1, lengthOf(p)));
          } else {
            const t0 = atan2(p.a[1] - p.c[1], p.a[0] - p.c[0]), d = turn(p);
            flux += arcFlux(G, p, t0, d);
          }
        }
        total += F.sense * info.o * flux;
      }
      return total;
    };
    for (const s of ids.shell) {
      const S = rec('shell', s);
      if (!closedShell.get(s)) continue;
      looked('solid');
      const vs = new Set();
      for (const f of S.faces) for (const l of rec('face', f).loops) for (const cid of rec('loop', l).coedges) { const E = rec('edge', rec('coedge', cid).edge); vs.add(E.v0); vs.add(E.v1); }
      let O = [0, 0, 0];
      for (const v of vs) O = V3.add(O, rec('vertex', v).point);
      O = V3.scale(O, 1 / Math.max(1, vs.size));
      const vol = sumFaces(S, S.faces, O);
      if (vol === null) { found('solid', 'volume_skipped', [label('shell', s)], {}, 'note'); continue; }
      stats.shellStats[s].volume = vol;
    }
    for (const id of ids.solid) {
      const So = rec('solid', id);
      looked('solid');
      let total = 0, all = true;
      So.shells.forEach((s, i) => {
        const v = stats.shellStats[s] ? stats.shellStats[s].volume : null;
        if (v === null) { all = false; return; }
        total += v;
        if (i === 0 ? !(v > 0) : !(v < 0)) found('solid', 'volume_sign', [label('solid', id), label('shell', s)], { volume: v, expected: i === 0 ? 'positive' : 'negative' });
      });
      if (all && So.shells.length && !(total > 0)) found('solid', 'volume_nonpositive', [label('solid', id)], { volume: total });
      // a void's points inside the outer shell's boxes: necessary, not sufficient
      if (So.shells.length > 1) {
        const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
        for (const f of rec('shell', So.shells[0]).faces) { const bx = SF.bbox(rec('face', f).surface); for (let k = 0; k < 3; k++) { box.min[k] = Math.min(box.min[k], bx.min[k]); box.max[k] = Math.max(box.max[k], bx.max[k]); } }
        for (const s of So.shells.slice(1)) {
          let outside = false;
          for (const f of rec('shell', s).faces) for (const l of rec('face', f).loops) for (const cid of rec('loop', l).coedges) {
            const E = rec('edge', rec('coedge', cid).edge);
            for (const t of [E.t0, 0.5 * E.t0 + 0.5 * E.t1, E.t1]) { const p = at(E, t); for (let k = 0; k < 3; k++) if (p[k] < box.min[k] - T.lin || p[k] > box.max[k] + T.lin) outside = true; }
          }
          if (outside) found('solid', 'void_outside', [label('solid', id), label('shell', s)]);
        }
      }
    }
  }

  const summary = Object.entries(sums).map(([set, [checked, n]]) => Object.freeze({ set, checked, found: n }));
  return Object.freeze({ ok: problems.every((p) => p.severity !== 'warning'), problems: Object.freeze(problems), summary: Object.freeze(summary), stats: Object.freeze({ ...stats, shellStats: Object.freeze(Object.fromEntries(Object.entries(stats.shellStats).map(([k, v]) => [k, Object.freeze(v)]))) }), capped });
}

/** the flux integral round an arc: ∫ G(u, v) dv with u = cu + r cos θ, v = cv + r sin θ, dv = r cos θ dθ, θ from t0 through d */
function arcFlux(G, p, t0, d) {
  const n = Math.min(16, Math.max(1, Math.ceil(Math.abs(d) * p.r)));
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = t0 + (d * i) / n, bb = t0 + (d * (i + 1)) / n;
    s += Q.fixed((th) => { const x = p.c[0] + p.r * cos(th), y = p.c[1] + p.r * sin(th); return G(x, y) * p.r * cos(th); }, Math.min(a, bb), Math.max(a, bb), 12) * (a < bb ? 1 : -1);
  }
  return s;
}
