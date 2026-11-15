/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * brep.js — cc-solid (S11, docs/solid/HANDOFF.md § 8, M2): the boundary representation as immutable snapshots. DOM-free;
 * imports core/, math/ and geom/ (curve.js, surface.js).
 *
 * Entities (§ 8.1), each a frozen record with a stable integer id in its own table:
 *   vertex  { id, point: [x, y, z], tol }
 *   edge    { id, curve, t0, t1, v0, v1, tol }      the curve on [t0, t1] (inside its domain, t0 < t1), from vertex v0 at C(t0)
 *                                                   to v1 at C(t1); a closed edge (a full circle) has v0 = v1
 *   coedge  { id, edge, sense, loop, pcurve }       an edge used by one loop: sense +1 along the edge, −1 against it;
 *                                                   pcurve the edge in the face's (u, v) space (S13), null until then
 *   loop    { id, face, coedges: [id …] }           ordered: each coedge starts where the one before it ends, round the loop
 *   face    { id, surface, sense, loops: [id …], shell }   the first loop is the outer one; sense +1: the face's normal is
 *                                                   the surface's, −1: the opposite
 *   shell   { id, faces: [id …], solid }            solid null for a shell on its own (a sheet, or a closed shell not
 *                                                   made into a solid)
 *   solid   { id, shells: [id …] }                  the first shell is the outer one, the others are voids
 * Every record may also carry `name`, a persistent name (topo/names.js), and `tol` on vertices and edges is a local
 * tolerance (tolerant modelling, § 8.2: at least tol.lin; imported data may need more, and the auditor reports the most).
 *
 * A snapshot (§ 8.3): { tables: { vertex, edge, coedge, loop, face, shell, solid }, next: { … } } — each table a frozen
 * array indexed by id, with `undefined` where a record was removed. Ids are never reused: `next` counts up per table, so
 * an id names one entity for the life of a model and its history. An edit makes a new snapshot that shares every record
 * it did not touch (the tables are copied, the records are not), so earlier snapshots stay valid: undo for free, and safe to
 * hand to a worker or a cache. Decision D-store (§ 17.2): whole-table copies per edit, measured in S11 (STATUS: a 1,000-face
 * body takes a hundred edits in a few milliseconds each); chunked tables only if a benchmark asks for them.
 *
 *   EMPTY · isBrep(b) · edit(b, fn) → new snapshot: fn(draft) adds, changes and removes; the result is checked (check below)
 *     and frozen; a refusal inside fn or in the check leaves b as it was
 *   draft: vertex(point, { tol, name }) → id · edge(curve, t0, t1, v0, v1, { tol, name }) → id ·
 *          coedge(edge, sense, { pcurve }) → id (in no loop yet: S12, for the Euler operators) ·
 *          loop(face | null, [use …], { pcurves }) → id, each use [edge, sense] (a coedge made with it) or a coedge's id (that
 *          coedge moved into it) · relink(loop, [coedge …]) (the loop's coedges replaced, each pointed at it) ·
 *          face(surface, sense, [loop …], { name }) → id (sets the loops' face) · shell([face …]) → id (sets the faces' shell) ·
 *          solid([shell …]) → id (sets the shells' solid) · set(kind, id, { field: value }) · remove(kind, id) · get(kind, id)
 *          Records may disagree while fn runs (a coedge moved, its old loop not yet relinked); the check at the end decides.
 *   get(b, kind, id) → record (refused when there is none) · ids(b, kind) → ascending ids · count(b, kind)
 *   check(b) → the structural rules, refused at the first broken one (solid.err.bad_topology { rule, kind, id }):
 *     every id a record refers to exists; back-references agree (a loop's coedges name that loop, a face's loops that face, a
 *     shell's faces that shell, a solid's shells that solid); a coedge is in one loop, a loop in one face, a face in one
 *     shell, a shell in at most one solid; each loop is closed in its vertices (coedge i ends where coedge i + 1 starts);
 *     an edge's [t0, t1] lies inside its curve's domain with t0 < t1; senses are ±1; records are where their id says.
 *     Geometric agreement (vertices on curves, edges on surfaces) is the auditor's (S14).
 *   adjacency(b) → (cached per snapshot) { coedgesOfEdge, edgesOfVertex, faceOfCoedge, facesOfEdge } as Maps id → ids
 *   euler(b) → { V, E, F, L, S, R } counts, with R = L − F (inner loops, rings) · toData(b) / fromData(d, tol) (D-wire)
 * Refusals: solid.err.bad_input { name, why } for arguments; solid.err.bad_topology { rule, kind, id } for a model that breaks
 * a structural rule.
 */
import { fail } from '../core/errors.js';
import { resolveTol } from '../core/tol.js';
import * as V3 from '../math/vec3.js';
import * as C from '../geom/curve.js';
import * as SF from '../geom/surface.js';

const BAD = 'solid.err.bad_input';
export const KINDS = Object.freeze(['vertex', 'edge', 'coedge', 'loop', 'face', 'shell', 'solid']);
const MADE = new WeakSet();
const ADJ = new WeakMap();

function freezeSnapshot(tables, next) {
  const t = {};
  for (const k of KINDS) t[k] = Object.freeze(tables[k]);
  const b = Object.freeze({ tables: Object.freeze(t), next: Object.freeze({ ...next }) });
  MADE.add(b);
  return b;
}

export const EMPTY = freezeSnapshot(Object.fromEntries(KINDS.map((k) => [k, []])), Object.fromEntries(KINDS.map((k) => [k, 0])));
export const isBrep = (b) => b !== null && typeof b === 'object' && MADE.has(b);

function need(b) {
  if (!isBrep(b)) fail(BAD, { name: 'brep', why: 'not_a_brep' });
  return b;
}
function kindOf(kind) {
  if (!KINDS.includes(kind)) fail(BAD, { name: 'kind', why: 'unknown' });
  return kind;
}
const isId = (x) => Number.isInteger(x) && x >= 0;

export function get(b, kind, id) {
  need(b);
  kindOf(kind);
  const r = isId(id) ? b.tables[kind][id] : undefined;
  if (!r) fail(BAD, { name: kind, why: 'no_such_id' });
  return r;
}
export function ids(b, kind) {
  need(b);
  const out = [];
  b.tables[kindOf(kind)].forEach((r, i) => { if (r) out.push(i); });
  return out;
}
export const count = (b, kind) => ids(b, kind).length;

// ---------------------------------------------------------------------------------------------------- the draft

function makeDraft(b, T) {
  const tables = {}, next = { ...b.next };
  for (const k of KINDS) tables[k] = b.tables[k].slice();
  const put = (kind, rec) => { tables[kind][rec.id] = Object.freeze(rec); return rec.id; };
  const fresh = (kind) => next[kind]++;
  const have = (kind, id) => isId(id) && !!tables[kind][id];
  const getD = (kind, id) => { if (!have(kindOf(kind), id)) fail(BAD, { name: kind, why: 'no_such_id' }); return tables[kind][id]; };
  const tolOf = (tol, name) => {
    if (tol === undefined) return T.lin;
    if (typeof tol !== 'number' || !(tol >= T.lin) || !Number.isFinite(tol)) fail(BAD, { name, why: 'below_lin' });
    return tol;
  };
  const nameOf = (n) => {
    if (n === undefined || n === null) return undefined;
    if (typeof n !== 'string' || n.length === 0 || n.length > 200) fail(BAD, { name: 'name', why: 'not_a_name' });
    return n;
  };
  const withName = (rec, n) => { const nm = nameOf(n); if (nm !== undefined) rec.name = nm; return rec; };
  return {
    vertex(point, { tol, name } = {}) {
      if (!V3.isVec3(point)) fail(BAD, { name: 'point', why: 'not_a_point' });
      return put('vertex', withName({ id: fresh('vertex'), point: Object.freeze(point.slice()), tol: tolOf(tol, 'tol') }, name));
    },
    edge(curve, t0, t1, v0, v1, { tol, name } = {}) {
      if (!C.isCurve(curve)) fail(BAD, { name: 'curve', why: 'not_a_curve' });
      const [a, b2] = C.domain(curve);
      if (!(typeof t0 === 'number' && typeof t1 === 'number' && a <= t0 && t0 < t1 && t1 <= b2)) fail(BAD, { name: 'range', why: 'out_of_domain' });
      getD('vertex', v0); getD('vertex', v1);
      return put('edge', withName({ id: fresh('edge'), curve, t0, t1, v0, v1, tol: tolOf(tol, 'tol') }, name));
    },
    coedge(edge, sense, { pcurve } = {}) {
      getD('edge', edge);
      if (sense !== 1 && sense !== -1) fail(BAD, { name: 'sense', why: 'not_a_sense' });
      if (pcurve !== null && pcurve !== undefined && !C.isCurve(pcurve)) fail(BAD, { name: 'pcurve', why: 'not_a_curve' });
      return put('coedge', { id: fresh('coedge'), edge, sense, loop: null, pcurve: pcurve || null });
    },
    loop(face, uses, { pcurves } = {}) {
      if (face !== null) getD('face', face);
      if (!Array.isArray(uses) || uses.length === 0) fail(BAD, { name: 'coedges', why: 'empty' });
      const id = fresh('loop'), list = [];
      uses.forEach((u, i) => {
        if (isId(u)) { put('coedge', { ...getD('coedge', u), loop: id }); list.push(u); return; }    // a coedge moved here
        if (!Array.isArray(u) || u.length !== 2) fail(BAD, { name: 'coedges', why: 'not_a_use' });
        const [e, sense] = u;
        getD('edge', e);
        if (sense !== 1 && sense !== -1) fail(BAD, { name: 'sense', why: 'not_a_sense' });
        const pc = pcurves ? pcurves[i] : null;
        if (pc !== null && pc !== undefined && !C.isCurve(pc)) fail(BAD, { name: 'pcurve', why: 'not_a_curve' });
        list.push(put('coedge', { id: fresh('coedge'), edge: e, sense, loop: id, pcurve: pc || null }));
      });
      put('loop', { id, face, coedges: Object.freeze(list) });
      return id;
    },
    face(surface, sense, loops, { name } = {}) {
      if (!SF.isSurface(surface)) fail(BAD, { name: 'surface', why: 'not_a_surface' });
      if (sense !== 1 && sense !== -1) fail(BAD, { name: 'sense', why: 'not_a_sense' });
      if (!Array.isArray(loops)) fail(BAD, { name: 'loops', why: 'not_an_array' });
      const id = fresh('face');
      for (const l of loops) { const L = getD('loop', l); put('loop', { ...L, face: id }); }
      put('face', withName({ id, surface, sense, loops: Object.freeze(loops.slice()), shell: null }, name));
      return id;
    },
    shell(faces) {
      if (!Array.isArray(faces)) fail(BAD, { name: 'faces', why: 'not_an_array' });
      const id = fresh('shell');
      for (const f of faces) { const F = getD('face', f); put('face', { ...F, shell: id }); }
      put('shell', { id, faces: Object.freeze(faces.slice()), solid: null });
      return id;
    },
    solid(shells) {
      if (!Array.isArray(shells) || shells.length === 0) fail(BAD, { name: 'shells', why: 'empty' });
      const id = fresh('solid');
      for (const s of shells) { const S = getD('shell', s); put('shell', { ...S, solid: id }); }
      put('solid', { id, shells: Object.freeze(shells.slice()) });
      return id;
    },
    set(kind, id, fields) {
      const r = getD(kind, id);
      if (fields === null || typeof fields !== 'object') fail(BAD, { name: 'fields', why: 'not_an_object' });
      if ('id' in fields) fail(BAD, { name: 'id', why: 'read_only' });
      const out = { ...r, ...fields };
      for (const k of ['coedges', 'loops', 'faces', 'shells']) if (Array.isArray(out[k])) out[k] = Object.freeze(out[k].slice());
      if (Array.isArray(out.point)) out.point = Object.freeze(out.point.slice());
      put(kind, out);
      return id;
    },
    relink(loop, coedges) {
      const L = getD('loop', loop);
      if (!Array.isArray(coedges) || coedges.length === 0) fail(BAD, { name: 'coedges', why: 'empty' });
      for (const c of coedges) { const r = getD('coedge', c); if (r.loop !== loop) put('coedge', { ...r, loop }); }
      put('loop', { ...L, coedges: Object.freeze(coedges.slice()) });
      return loop;
    },
    remove(kind, id) { getD(kind, id); tables[kind][id] = undefined; },
    get: (kind, id) => getD(kind, id),
    has: (kind, id) => have(kindOf(kind), id),
    _done: () => ({ tables, next }),
  };
}

export function edit(b, fn, tol) {
  need(b);
  if (typeof fn !== 'function') fail(BAD, { name: 'fn', why: 'not_a_function' });
  const T = resolveTol(tol), d = makeDraft(b, T);
  fn(d);
  const { tables, next } = d._done();
  const out = freezeSnapshot(tables, next);
  check(out);
  return out;
}

// ---------------------------------------------------------------------------------------------------- the rules

function broken(rule, kind, id) { return fail('solid.err.bad_topology', { rule, kind, id }); }

export function check(b) {
  need(b);
  const T = b.tables, has = (kind, id) => isId(id) && !!T[kind][id];
  T.vertex.forEach((v, id) => { if (v && v.id !== id) broken('id', 'vertex', id); });
  T.edge.forEach((e, id) => {
    if (!e) return;
    if (e.id !== id) broken('id', 'edge', id);
    if (!has('vertex', e.v0) || !has('vertex', e.v1)) broken('reference', 'edge', id);
    const [a, bb] = C.domain(e.curve);
    if (!(a <= e.t0 && e.t0 < e.t1 && e.t1 <= bb)) broken('range', 'edge', id);
  });
  const coedgeUse = new Map(), loopUse = new Map(), faceUse = new Map(), shellUse = new Map();
  T.loop.forEach((l, id) => {
    if (!l) return;
    if (l.id !== id) broken('id', 'loop', id);
    if (l.coedges.length === 0) broken('empty', 'loop', id);
    for (const c of l.coedges) {
      if (!has('coedge', c)) broken('reference', 'loop', id);
      if (coedgeUse.has(c)) broken('shared', 'coedge', c);          // before back_reference: a coedge in two loops is shared
      if (T.coedge[c].loop !== id) broken('back_reference', 'coedge', c);
      coedgeUse.set(c, id);
    }
    // closed in its vertices: each coedge ends where the next one starts
    const ends = l.coedges.map((c) => { const co = T.coedge[c], e = T.edge[co.edge]; return co.sense > 0 ? [e.v0, e.v1] : [e.v1, e.v0]; });
    for (let i = 0; i < ends.length; i++) if (ends[i][1] !== ends[(i + 1) % ends.length][0]) broken('open_loop', 'loop', id);
    if (l.face !== null) { if (!has('face', l.face)) broken('reference', 'loop', id); }
  });
  T.coedge.forEach((c, id) => {
    if (!c) return;
    if (c.id !== id) broken('id', 'coedge', id);
    if (!has('edge', c.edge)) broken('reference', 'coedge', id);
    if (c.sense !== 1 && c.sense !== -1) broken('sense', 'coedge', id);
    if (!coedgeUse.has(id)) broken('orphan', 'coedge', id);
  });
  T.face.forEach((f, id) => {
    if (!f) return;
    if (f.id !== id) broken('id', 'face', id);
    if (f.sense !== 1 && f.sense !== -1) broken('sense', 'face', id);
    for (const l of f.loops) {
      if (!has('loop', l)) broken('reference', 'face', id);
      if (T.loop[l].face !== id) broken('back_reference', 'loop', l);
      if (loopUse.has(l)) broken('shared', 'loop', l);
      loopUse.set(l, id);
    }
    if (f.shell !== null && !has('shell', f.shell)) broken('reference', 'face', id);
  });
  T.loop.forEach((l, id) => { if (l && l.face !== null && !loopUse.has(id)) broken('back_reference', 'loop', id); });
  T.shell.forEach((s, id) => {
    if (!s) return;
    if (s.id !== id) broken('id', 'shell', id);
    for (const f of s.faces) {
      if (!has('face', f)) broken('reference', 'shell', id);
      if (T.face[f].shell !== id) broken('back_reference', 'face', f);
      if (faceUse.has(f)) broken('shared', 'face', f);
      faceUse.set(f, id);
    }
    if (s.solid !== null && !has('solid', s.solid)) broken('reference', 'shell', id);
  });
  T.face.forEach((f, id) => { if (f && f.shell !== null && !faceUse.has(id)) broken('back_reference', 'face', id); });
  T.solid.forEach((so, id) => {
    if (!so) return;
    if (so.id !== id) broken('id', 'solid', id);
    if (so.shells.length === 0) broken('empty', 'solid', id);
    for (const s of so.shells) {
      if (!has('shell', s)) broken('reference', 'solid', id);
      if (T.shell[s].solid !== id) broken('back_reference', 'shell', s);
      if (shellUse.has(s)) broken('shared', 'shell', s);
      shellUse.set(s, id);
    }
  });
  T.shell.forEach((s, id) => { if (s && s.solid !== null && !shellUse.has(id)) broken('back_reference', 'shell', id); });
  return true;
}

// ---------------------------------------------------------------------------------------------------- derived data

export function adjacency(b) {
  need(b);
  if (ADJ.has(b)) return ADJ.get(b);
  const T = b.tables, coedgesOfEdge = new Map(), edgesOfVertex = new Map(), faceOfCoedge = new Map(), facesOfEdge = new Map();
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  T.edge.forEach((e, id) => { if (!e) return; push(edgesOfVertex, e.v0, id); if (e.v1 !== e.v0) push(edgesOfVertex, e.v1, id); });
  T.coedge.forEach((c, id) => {
    if (!c) return;
    push(coedgesOfEdge, c.edge, id);
    const l = T.loop[c.loop];
    if (l && l.face !== null) { faceOfCoedge.set(id, l.face); const f = facesOfEdge.get(c.edge) || []; if (!f.includes(l.face)) f.push(l.face); facesOfEdge.set(c.edge, f); }
  });
  const freezeMap = (m) => { for (const [k, v] of m) if (Array.isArray(v)) m.set(k, Object.freeze(v)); return m; };
  const out = Object.freeze({ coedgesOfEdge: freezeMap(coedgesOfEdge), edgesOfVertex: freezeMap(edgesOfVertex), faceOfCoedge, facesOfEdge: freezeMap(facesOfEdge) });
  ADJ.set(b, out);
  return out;
}

export function euler(b) {
  need(b);
  const V = count(b, 'vertex'), E = count(b, 'edge'), F = count(b, 'face'), L = count(b, 'loop'), S = count(b, 'shell');
  return Object.freeze({ V, E, F, L, S, R: L - F });
}

// ---------------------------------------------------------------------------------------------------- plain data

export function toData(b) {
  need(b);
  const T = b.tables, out = { next: { ...b.next } };
  out.vertex = T.vertex.map((v) => v && { ...v, point: v.point.slice() });
  out.edge = T.edge.map((e) => e && { ...e, curve: C.toData(e.curve) });
  out.coedge = T.coedge.map((c) => c && { ...c, pcurve: c.pcurve ? C.toData(c.pcurve) : null });
  out.loop = T.loop.map((l) => l && { ...l, coedges: l.coedges.slice() });
  out.face = T.face.map((f) => f && { ...f, surface: SF.toData(f.surface), loops: f.loops.slice() });
  out.shell = T.shell.map((s) => s && { ...s, faces: s.faces.slice() });
  out.solid = T.solid.map((s) => s && { ...s, shells: s.shells.slice() });
  for (const k of KINDS) out[k] = out[k].map((r) => (r === undefined ? null : r));
  return out;
}

export function fromData(d, tol) {
  if (d === null || typeof d !== 'object') fail(BAD, { name: 'brep', why: 'not_an_object' });
  const tables = {}, next = {};
  for (const k of KINDS) {
    if (!Array.isArray(d[k])) fail(BAD, { name: k, why: 'not_an_array' });
    const n = d.next && Number.isInteger(d.next[k]) ? d.next[k] : d[k].length;
    if (n < d[k].length) fail(BAD, { name: 'next', why: 'out_of_range' });
    next[k] = n;
  }
  const geo = (fn, x, name) => { try { return fn(x, tol); } catch (e) { return fail(BAD, { name, why: 'not_valid' }); } };
  tables.vertex = d.vertex.map((v) => (v ? Object.freeze({ ...v, point: Object.freeze(v.point.slice()) }) : undefined));
  tables.edge = d.edge.map((e) => (e ? Object.freeze({ ...e, curve: geo(C.fromData, e.curve, 'curve') }) : undefined));
  tables.coedge = d.coedge.map((c) => (c ? Object.freeze({ ...c, pcurve: c.pcurve ? geo(C.fromData, c.pcurve, 'pcurve') : null }) : undefined));
  tables.loop = d.loop.map((l) => (l ? Object.freeze({ ...l, coedges: Object.freeze(l.coedges.slice()) }) : undefined));
  tables.face = d.face.map((f) => (f ? Object.freeze({ ...f, surface: geo(SF.fromData, f.surface, 'surface'), loops: Object.freeze(f.loops.slice()) }) : undefined));
  tables.shell = d.shell.map((s) => (s ? Object.freeze({ ...s, faces: Object.freeze(s.faces.slice()) }) : undefined));
  tables.solid = d.solid.map((s) => (s ? Object.freeze({ ...s, shells: Object.freeze(s.shells.slice()) }) : undefined));
  const b = freezeSnapshot(tables, next);
  check(b);
  return b;
}
