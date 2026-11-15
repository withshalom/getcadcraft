/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * euler.js — cc-solid (S12, docs/solid/HANDOFF.md § 8.4, M2): the Euler operators, on brep.js snapshots. DOM-free; imports
 * core/, math/, geom/ and brep.js.
 *
 * Each operator changes the counts so that the Euler–Poincaré formula keeps holding,
 *     V − E + F − R = 2 (S − G)          R = L − F, the rings (inner loops); G the genus, summed over the shells
 * — M. Mäntylä's operator set (An Introduction to Solid Modeling, 1988) in this model's terms. A loop here is a
 * non-empty closed sequence of coedges, so there is no loop of a lone vertex: the smallest shell is a lamina, one edge and
 * the face whose one loop runs along it and back (mevvlfs, where Mäntylä starts from one vertex with mvfs), and a dangling
 * edge (a strut) is two coedges of one edge, one right after the other. Where a vertex can appear in a loop more than once,
 * an operator names coedges (Mäntylä's half-edges): "at c" is at the vertex where coedge c starts, in c's loop.
 *
 *   operator                                                    V   E   F   L   S   G     undone by
 *   mevvlfs(b, p0, p1, o) → { brep, v0, v1, edge, loop, face, shell }
 *                                                              +2  +1  +1  +1  +1         kevvlfs(b, shell)
 *       a new shell: the edge v0 → v1 and a face (o.surface and o.sense, else a plane through the edge and +1) whose one
 *       loop runs along the edge and back
 *   mev(b, c, point, o) → { brep, vertex, edge }               +1  +1                     kev(b, edge)
 *       a strut from the start of c to a new vertex at point, in c's loop just before c
 *   semv(b, edge, t) → { brep, vertex, edge }                  +1  +1                     jekv(b, vertex)
 *       the edge split at t inside its range: it keeps [t0, t], the new edge takes [t, t1] on the same curve, and every
 *       coedge of the edge gets its partner next to it
 *   mef(b, ca, cb, o) → { brep, edge, loop, face }                 +1  +1  +1             kef(b, edge)
 *       an edge from the start of ca to the start of cb (two coedges of one loop of a face) cuts the loop in two: ca …
 *       stays with the face, closed by the new edge's coedge against it; cb … is the loop of a new face (o.surface and
 *       o.sense, else the face's own), closed by the coedge along it, in the face's shell
 *   kef(b, edge, { keep }) → { brep }                              −1  −1  −1
 *       the edge between two faces of one shell removed and its two loops joined: the face holding the coedge against the
 *       edge stays (or `keep`), the other goes, and its other loops become rings of the one that stays
 *   mekr(b, ca, cb, o) → { brep, edge }                            +1      −1 (R −1)      kemr(b, edge)
 *       an edge from the start of ca to the start of cb, in two loops of one face, joins them into ca's loop (which takes
 *       the outer place when cb's loop held it)
 *   kemr(b, edge) → { brep, ring }                                 −1      +1 (R +1)
 *       an edge used twice in one loop, the two uses not next to each other, removed: the coedges after its coedge along
 *       it, up to the one against it, become a new ring of the face
 *   kfmrh(b, kill, keep) → { brep, ring }                              −1     (R +1)  +1  mfkrh(b, face, ring, o)
 *       the face `kill` (one loop) removed and its loop made a ring of `keep`, in the same shell: a hole through the body
 *   mfkrh(b, face, ring, o) → { brep, face }                           +1     (R −1)  −1
 *       a ring of the face made the one loop of a new face in its shell (o.surface and o.sense, else the face's surface
 *       and the other sense)
 *   kevvlfs(b, shell) → { brep }                               −2  −1  −1  −1  −1
 *       a lamina shell removed: one face, its one loop the two coedges of one edge, whose vertices nothing else uses
 *   Options (o): curve (the new edge on this curve record over its whole domain, else the line between its vertices),
 *   surface, sense, tol (for brep.edit).
 *
 * Geometry is the caller's: the operators keep the topology right and leave the shape to whoever calls them, so a sequence
 * can build the topology first and place the surfaces after (build.js's sweep does). They make no pcurves (S13), and an
 * edge whose coedges carry pcurves is not split or joined.
 *
 * Refusals: solid.err.bad_input { name, why }: 'coedges' 'same_coedge' | 'not_in_one_loop' | 'same_loop' |
 * 'not_in_one_face' | 'same_vertex'; 'loop' 'not_in_a_face'; 'edge' 'not_a_strut' | 'lamina' | 'not_two_faces' |
 * 'same_loop' | 'same_face' | 'two_shells' | 'empty_loop' | 'not_twice_in_loop' | 'adjacent' | 'has_pcurves'; 't'
 * 'out_of_range'; 'vertex' 'not_two_edges' | 'not_a_split'; 'faces' 'same_face' | 'two_shells'; 'face' 'not_one_loop';
 * 'ring' 'not_a_ring'; 'shell' 'not_a_lamina'; 'keep' 'not_on_edge'; 'curve' 'not_a_curve' — and whatever brep.edit
 * refuses (an id that names nothing: { name: kind, why: 'no_such_id' }).
 */
import { fail } from '../core/errors.js';
import * as V3 from '../math/vec3.js';
import * as Fr from '../math/frame.js';
import * as C from '../geom/curve.js';
import * as AC from '../geom/analytic-curve.js';
import * as AS from '../geom/analytic-surface.js';
import * as B from './brep.js';

const BAD = 'solid.err.bad_input';
const no = (name, why) => fail(BAD, { name, why });

/** The vertices a coedge runs from and to. */
function ends(d, c) {
  const co = d.get('coedge', c), e = d.get('edge', co.edge);
  return co.sense > 0 ? [e.v0, e.v1] : [e.v1, e.v0];
}
const startOf = (d, c) => ends(d, c)[0];

/** c's loop as a list of coedges, turned to start with c. */
function from(d, c) {
  const cs = d.get('loop', d.get('coedge', c).loop).coedges, i = cs.indexOf(c);
  return [...cs.slice(i), ...cs.slice(0, i)];
}

/** A new edge va → vb: on the curve given, over its whole domain, else the line between the two vertices. */
function edgeOf(d, va, vb, curve) {
  if (curve !== undefined) {
    if (!C.isCurve(curve)) no('curve', 'not_a_curve');
    const [a, b] = C.domain(curve);
    return d.edge(curve, a, b, va, vb);
  }
  if (va === vb) no('coedges', 'same_vertex');
  const ln = AC.lineThrough(d.get('vertex', va).point, d.get('vertex', vb).point);
  return d.edge(ln, 0, AC.domain(ln)[1], va, vb);
}

/** A plane through p0 and p1 for a lamina given no surface (its normal is vec3.perp of the edge, the same every time). */
function planeAlong(p0, p1) {
  const x = V3.sub(p1, p0), L = V3.len(x);
  return AS.plane({ frame: Fr.frameFromZX(p0, V3.perp(x), x), urange: [-L, 2 * L], vrange: [-L, L] });
}

function joinShell(d, parent, face) {
  if (parent.shell === null) return;
  d.set('shell', parent.shell, { faces: [...d.get('shell', parent.shell).faces, face] });
  d.set('face', face, { shell: parent.shell });
}
function leaveShell(d, F) {
  if (F.shell !== null) d.set('shell', F.shell, { faces: d.get('shell', F.shell).faces.filter((f) => f !== F.id) });
}
function noPcurves(d, uses) {
  for (const c of uses) if (d.get('coedge', c).pcurve !== null) no('edge', 'has_pcurves');
}

// ---------------------------------------------------------------------------------------------------- shells and struts

export function mevvlfs(b, p0, p1, { curve, surface, sense = 1, tol } = {}) {
  const out = {};
  out.brep = B.edit(b, (d) => {
    out.v0 = d.vertex(p0);
    out.v1 = d.vertex(p1);
    out.edge = edgeOf(d, out.v0, out.v1, curve);
    out.loop = d.loop(null, [[out.edge, 1], [out.edge, -1]]);
    out.face = d.face(surface === undefined ? planeAlong(p0, p1) : surface, sense, [out.loop]);
    out.shell = d.shell([out.face]);
  }, tol);
  return Object.freeze(out);
}

export function kevvlfs(b, shell, { tol } = {}) {
  const adj = B.adjacency(b);
  return Object.freeze({
    brep: B.edit(b, (d) => {
      const S = d.get('shell', shell);
      const F = S.faces.length === 1 ? d.get('face', S.faces[0]) : null;
      const L = F && F.loops.length === 1 ? d.get('loop', F.loops[0]) : null;
      const cs = L && L.coedges.length === 2 ? L.coedges.map((c) => d.get('coedge', c)) : null;
      const E = cs && cs[0].edge === cs[1].edge ? d.get('edge', cs[0].edge) : null;
      if (S.solid !== null || !E || E.v0 === E.v1 || adj.coedgesOfEdge.get(E.id).length !== 2 || adj.edgesOfVertex.get(E.v0).length !== 1 || adj.edgesOfVertex.get(E.v1).length !== 1) no('shell', 'not_a_lamina');
      for (const c of L.coedges) d.remove('coedge', c);
      d.remove('loop', L.id);
      d.remove('face', F.id);
      d.remove('shell', shell);
      d.remove('edge', E.id);
      d.remove('vertex', E.v0);
      d.remove('vertex', E.v1);
    }, tol),
  });
}

export function mev(b, c, point, { curve, tol } = {}) {
  const out = {};
  out.brep = B.edit(b, (d) => {
    const L = d.get('loop', d.get('coedge', c).loop), i = L.coedges.indexOf(c);
    out.vertex = d.vertex(point);
    out.edge = edgeOf(d, startOf(d, c), out.vertex, curve);
    const along = d.coedge(out.edge, 1), against = d.coedge(out.edge, -1);
    d.relink(L.id, [...L.coedges.slice(0, i), along, against, ...L.coedges.slice(i)]);
  }, tol);
  return Object.freeze(out);
}

export function kev(b, edge, { tol } = {}) {
  const adj = B.adjacency(b);
  return Object.freeze({
    brep: B.edit(b, (d) => {
      const E = d.get('edge', edge), uses = adj.coedgesOfEdge.get(edge) || [];
      if (uses.length !== 2 || E.v0 === E.v1) no('edge', 'not_a_strut');
      const [a, z] = uses, loop = d.get('coedge', a).loop;
      if (d.get('coedge', z).loop !== loop) no('edge', 'not_a_strut');
      const cs = d.get('loop', loop).coedges, k = cs.length, i = cs.indexOf(a), j = cs.indexOf(z);
      if (k === 2) no('edge', 'lamina');
      const first = (i + 1) % k === j ? a : (j + 1) % k === i ? z : null;
      if (first === null) no('edge', 'not_a_strut');
      const far = ends(d, first)[1];                     // the strut runs out to `far` and back
      if (adj.edgesOfVertex.get(far).length !== 1) no('edge', 'not_a_strut');
      d.relink(loop, cs.filter((x) => x !== a && x !== z));
      d.remove('coedge', a);
      d.remove('coedge', z);
      d.remove('edge', edge);
      d.remove('vertex', far);
    }, tol),
  });
}

// ---------------------------------------------------------------------------------------------------- splitting edges

export function semv(b, edge, t, { tol } = {}) {
  const adj = B.adjacency(b), out = {};
  out.brep = B.edit(b, (d) => {
    const E = d.get('edge', edge), uses = adj.coedgesOfEdge.get(edge) || [];
    if (!(typeof t === 'number' && E.t0 < t && t < E.t1)) no('t', 'out_of_range');
    noPcurves(d, uses);
    out.vertex = d.vertex(C.point(E.curve, t), { tol: E.tol });
    out.edge = d.edge(E.curve, t, E.t1, out.vertex, E.v1, { tol: E.tol });
    d.set('edge', edge, { t1: t, v1: out.vertex });
    for (const c of uses) {
      // along the edge the new half comes after the old; against it, before
      const co = d.get('coedge', c), L = d.get('loop', co.loop), i = L.coedges.indexOf(c), at = co.sense > 0 ? i + 1 : i;
      d.relink(L.id, [...L.coedges.slice(0, at), d.coedge(out.edge, co.sense), ...L.coedges.slice(at)]);
    }
  }, tol);
  return Object.freeze(out);
}

export function jekv(b, vertex, { tol } = {}) {
  const adj = B.adjacency(b), out = {};
  out.brep = B.edit(b, (d) => {
    d.get('vertex', vertex);
    const es = adj.edgesOfVertex.get(vertex) || [];
    if (es.length !== 2) no('vertex', 'not_two_edges');
    let [e1, e2] = es.map((e) => d.get('edge', e));
    if (e1.v1 !== vertex) [e1, e2] = [e2, e1];
    if (!(e1.v1 === vertex && e2.v0 === vertex && e1.v0 !== vertex && e2.v1 !== vertex && e1.curve === e2.curve && e1.t1 === e2.t0)) no('vertex', 'not_a_split');
    const u1 = adj.coedgesOfEdge.get(e1.id) || [], u2 = adj.coedgesOfEdge.get(e2.id) || [];
    if (u1.length !== u2.length) no('vertex', 'not_a_split');
    noPcurves(d, [...u1, ...u2]);
    for (const c2 of u2) {
      // each coedge of e2 must sit next to one of e1 with the same sense: after it along the edge, before it against
      const co = d.get('coedge', c2), L = d.get('loop', co.loop), k = L.coedges.length, i = L.coedges.indexOf(c2);
      const nb = d.get('coedge', L.coedges[co.sense > 0 ? (i - 1 + k) % k : (i + 1) % k]);
      if (nb.edge !== e1.id || nb.sense !== co.sense) no('vertex', 'not_a_split');
      d.relink(L.id, L.coedges.filter((x) => x !== c2));
      d.remove('coedge', c2);
    }
    d.set('edge', e1.id, { t1: e2.t1, v1: e2.v1, tol: Math.max(e1.tol, e2.tol) });
    d.remove('edge', e2.id);
    d.remove('vertex', vertex);
    out.edge = e1.id;
  }, tol);
  return Object.freeze(out);
}

// ---------------------------------------------------------------------------------------------------- faces

export function mef(b, ca, cb, { curve, surface, sense, tol } = {}) {
  const out = {};
  out.brep = B.edit(b, (d) => {
    if (ca === cb) no('coedges', 'same_coedge');
    const A = d.get('coedge', ca), Bc = d.get('coedge', cb);
    if (A.loop !== Bc.loop) no('coedges', 'not_in_one_loop');
    const L = d.get('loop', A.loop);
    if (L.face === null) no('loop', 'not_in_a_face');
    const F = d.get('face', L.face);
    out.edge = edgeOf(d, startOf(d, ca), startOf(d, cb), curve);
    const along = d.coedge(out.edge, 1), against = d.coedge(out.edge, -1);
    const seq = from(d, ca), j = seq.indexOf(cb);
    d.relink(L.id, [...seq.slice(0, j), against]);
    out.loop = d.loop(null, [...seq.slice(j), along]);
    out.face = d.face(surface === undefined ? F.surface : surface, sense === undefined ? F.sense : sense, [out.loop]);
    joinShell(d, F, out.face);
  }, tol);
  return Object.freeze(out);
}

export function kef(b, edge, { keep, tol } = {}) {
  const adj = B.adjacency(b);
  return Object.freeze({
    brep: B.edit(b, (d) => {
      d.get('edge', edge);
      const uses = adj.coedgesOfEdge.get(edge) || [];
      if (uses.length !== 2) no('edge', 'not_two_faces');
      let [c1, c2] = uses.map((c) => d.get('coedge', c));
      if (c1.loop === c2.loop) no('edge', 'same_loop');
      const faceOf = (c) => d.get('loop', c.loop).face;
      if (faceOf(c1) === null || faceOf(c2) === null) no('loop', 'not_in_a_face');
      if (faceOf(c1) === faceOf(c2)) no('edge', 'same_face');
      // c1 is the coedge whose face stays: the one against the edge, or the one in `keep`
      if (keep === undefined ? c1.sense > 0 && c2.sense < 0 : faceOf(c2) === keep) [c1, c2] = [c2, c1];
      if (keep !== undefined && faceOf(c1) !== keep) no('keep', 'not_on_edge');
      const L1 = d.get('loop', c1.loop), L2 = d.get('loop', c2.loop), F1 = d.get('face', L1.face), F2 = d.get('face', L2.face);
      if (F1.shell !== F2.shell) no('edge', 'two_shells');
      if (L1.coedges.length + L2.coedges.length === 2) no('edge', 'empty_loop');
      d.relink(L1.id, [...from(d, c1.id).slice(1), ...from(d, c2.id).slice(1)]);
      d.remove('coedge', c1.id);
      d.remove('coedge', c2.id);
      d.remove('edge', edge);
      const moved = F2.loops.filter((l) => l !== L2.id);
      for (const l of moved) d.set('loop', l, { face: F1.id });
      d.set('face', F1.id, { loops: [...F1.loops, ...moved] });
      d.remove('loop', L2.id);
      leaveShell(d, F2);
      d.remove('face', F2.id);
    }, tol),
  });
}

// ---------------------------------------------------------------------------------------------------- rings and holes

export function mekr(b, ca, cb, { curve, tol } = {}) {
  const out = {};
  out.brep = B.edit(b, (d) => {
    const A = d.get('coedge', ca), Bc = d.get('coedge', cb);
    if (A.loop === Bc.loop) no('coedges', 'same_loop');
    const La = d.get('loop', A.loop), Lb = d.get('loop', Bc.loop);
    if (La.face === null || La.face !== Lb.face) no('coedges', 'not_in_one_face');
    const F = d.get('face', La.face);
    out.edge = edgeOf(d, startOf(d, ca), startOf(d, cb), curve);
    const along = d.coedge(out.edge, 1), against = d.coedge(out.edge, -1);
    d.relink(La.id, [...from(d, ca), along, ...from(d, cb), against]);
    d.remove('loop', Lb.id);
    const rest = F.loops.filter((l) => l !== Lb.id);
    d.set('face', F.id, { loops: F.loops[0] === Lb.id ? [La.id, ...rest.filter((l) => l !== La.id)] : rest });
  }, tol);
  return Object.freeze(out);
}

export function kemr(b, edge, { tol } = {}) {
  const adj = B.adjacency(b), out = {};
  out.brep = B.edit(b, (d) => {
    d.get('edge', edge);
    const uses = adj.coedgesOfEdge.get(edge) || [];
    if (uses.length !== 2) no('edge', 'not_twice_in_loop');
    let [p, m] = uses.map((c) => d.get('coedge', c));
    if (p.loop !== m.loop) no('edge', 'not_twice_in_loop');
    if (p.sense < m.sense) [p, m] = [m, p];
    const L = d.get('loop', p.loop);
    if (L.face === null) no('loop', 'not_in_a_face');
    const seq = from(d, p.id), j = seq.indexOf(m.id), ring = seq.slice(1, j), rest = seq.slice(j + 1);
    if (ring.length === 0 || rest.length === 0) no('edge', 'adjacent');
    d.relink(L.id, rest);
    d.remove('coedge', p.id);
    d.remove('coedge', m.id);
    d.remove('edge', edge);
    out.ring = d.loop(L.face, ring);
    d.set('face', L.face, { loops: [...d.get('face', L.face).loops, out.ring] });
  }, tol);
  return Object.freeze(out);
}

export function kfmrh(b, kill, keep, { tol } = {}) {
  const out = {};
  out.brep = B.edit(b, (d) => {
    if (kill === keep) no('faces', 'same_face');
    const K = d.get('face', kill), F = d.get('face', keep);
    if (K.loops.length !== 1) no('face', 'not_one_loop');
    if (K.shell !== F.shell) no('faces', 'two_shells');
    out.ring = K.loops[0];
    d.set('loop', out.ring, { face: keep });
    d.set('face', keep, { loops: [...F.loops, out.ring] });
    leaveShell(d, K);
    d.remove('face', kill);
  }, tol);
  return Object.freeze(out);
}

export function mfkrh(b, face, ring, { surface, sense, tol } = {}) {
  const out = {};
  out.brep = B.edit(b, (d) => {
    const F = d.get('face', face);
    if (F.loops.indexOf(ring) < 1) no('ring', 'not_a_ring');
    d.set('face', face, { loops: F.loops.filter((l) => l !== ring) });
    out.face = d.face(surface === undefined ? F.surface : surface, sense === undefined ? -F.sense : sense, [ring]);
    joinShell(d, F, out.face);
  }, tol);
  return Object.freeze(out);
}
