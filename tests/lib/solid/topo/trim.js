/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * trim.js — cc-solid (S13, docs/solid/HANDOFF.md § 7 ring I-1 and § 8.5, M2): a face's trim in its own (u, v) space: whether
 * a point is in, on or out of it, decided with exact predicates. DOM-free; imports core/, math/, geom/, brep.js and pcurve.js.
 *
 * A loop is read from its coedges' pcurves (pcurve.js) into pieces, in the order the loop runs:
 *   { kind: 'seg', a, b }                             a straight piece from a = [u, v] to b
 *   { kind: 'arc', c, r, qx, qy, a, b }               a piece of a circle that stays in one quadrant about c (qx, qy = ±1:
 *                                                     the signs of u − c.u and v − c.v on it), so v runs one way along it
 * Pieces join end to end: a piece starts where the one before it ends (the pcurves of a periodic surface's seam are a period
 * apart, and a builder has put each at its own turn, so the loop is closed in (u, v)), and the last ends where the first starts.
 * A circle is cut at the points where it turns (the multiples of a quarter turn about its centre, taken exactly).
 *
 * The winding number of a loop about a point q counts how often the loop goes round q: a ray from q along +u meets pieces
 * that run up (+1) or down (−1) in v, counted when q is to the left of the piece. The meeting test is exact: for a segment it
 * is orient2d (math/predicates.js); for an arc it is the sign of (u − c.u)² + (v − c.v)² − r², summed exactly (core/exact.js).
 * A piece covers the v from its lower end up to, not including, its upper end, so a ray through a corner counts once.
 *
 * A face on a periodic surface (a cylinder's, a sphere's, a torus's) is read in the turn its loops lie in: a point's angle
 * is taken a whole number of periods from the loops' own lowest. A loop is the face's boundary in the face's sense σ: its
 * pieces run counter-clockwise about the face's normal, so a point in the face has total winding σ, one outside has 0 (a hole's
 * loop runs the other way and cancels the outer one inside it).
 *
 *   degenerate(b, { tol }) → [edge id]               the edges whose curve stays at one point (the poles): Euler–Poincaré counts
 *                                                    edges without them, V − (E − D) + F − R = 2 (S − G)
 *   uvLoop(b, loop, { tol }) → [piece]               the loop's pieces in (u, v), in loop order, joined end to end
 *   winding(pieces, q) → integer | null              the winding number of a closed loop about q = [u, v]; null when q is exactly on it
 *   classify(b, face, q, { tol }) → 'in' | 'on' | 'out'   q = [u, v] against the face's trim; 'on' within tol.lin of a loop
 *   attach(b, { tol }) → { brep, made, skipped }     a pcurve on every coedge that has none, for the pairs pcurve.js knows (a
 *                                                    polyhedron's faces from build.js); skipped lists [coedge id, why] for the rest
 * Refusals: solid.err.bad_input { name, why }: 'b' 'not_a_brep'; 'q' 'not_a_pair'; 'face' 'unknown'; 'loop' 'unknown'.
 * solid.err.not_supported { what: 'loop', why }: 'no_pcurve' (a coedge without one: attach first), 'open_in_uv' (the loop does not
 * close in (u, v): a face on a periodic surface bounded by circles alone, with no seam), 'kind' (a pcurve that is not a line,
 * a polyline or a circle). solid.err.bad_topology { rule: 'orientation', kind: 'face', id }: the total winding at a point is
 * neither 0 nor σ, so the loops are inside out or overlap.
 */
import { fail } from '../core/errors.js';
import { resolveTol } from '../core/tol.js';
import { sumSign } from '../core/exact.js';
import { EPS, pow2 } from '../core/float.js';
import { sincos, atan2, TAU, HALF_PI } from '../core/trig.js';
import { orient2d } from '../math/predicates.js';
import * as V3 from '../math/vec3.js';
import * as C from '../geom/curve.js';
import * as NC from '../geom/nurbs-curve.js';
import * as AC from '../geom/analytic-curve.js';
import * as B from './brep.js';
import * as P from './pcurve.js';

const BAD = 'solid.err.bad_input', NOT = 'solid.err.not_supported';
const SLACK = pow2(12) * EPS;                                                         // about 1e-12: an angle this close to a quarter turn is on it
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isPair = (q) => Array.isArray(q) && q.length === 2 && q.every(isNum);

export function degenerate(b, { tol } = {}) {
  const T = resolveTol(tol);
  return B.ids(b, 'edge').filter((id) => { const e = B.get(b, 'edge', id); return e.v0 === e.v1 && P.isPoint(e.curve, T); });
}

// ---- pieces
const flip = (p) => (p.kind === 'seg' ? { kind: 'seg', a: p.b, b: p.a } : { ...p, a: p.b, b: p.a });

/** A circle's pieces, cut where it turns: ψ = the angle about the centre in (u, v), taken exactly at the quarter turns. */
function arcs(c, t0, t1) {
  const f = c.frame, s = f.z[2] > 0 ? 1 : -1, psi0 = atan2(f.x[1], f.x[0]), cu = f.o[0], cv = f.o[1], r = c.r, q = HALF_PI;
  const a = psi0 + s * (t0 + c.phase), b = psi0 + s * (t1 + c.phase), lo = Math.min(a, b), hi = Math.max(a, b);
  const cuts = [];
  for (let k = Math.floor(lo / q) + 1; k * q < hi; k++) if (k * q - lo > SLACK && hi - k * q > SLACK) cuts.push(k * q);
  if (s < 0) cuts.reverse();                                                       // ψ falls along the edge
  const at = (ang) => {
    const k = Math.round(ang / q);
    if (Math.abs(k * q - ang) <= SLACK) return [cu + r * [1, 0, -1, 0][((k % 4) + 4) % 4], cv + r * [0, 1, 0, -1][((k % 4) + 4) % 4]];   // on an axis: exact
    const [si, co] = sincos(ang);
    return [cu + r * co, cv + r * si];
  };
  const all = [a, ...cuts, b], out = [];
  for (let i = 0; i + 1 < all.length; i++) {
    const [si, co] = sincos((all[i] + all[i + 1]) / 2);
    out.push({ kind: 'arc', c: [cu, cv], r, qx: co > 0 ? 1 : -1, qy: si > 0 ? 1 : -1, a: at(all[i]), b: at(all[i + 1]) });
  }
  return out;
}

function piecesOf(pc, t0, t1) {
  if (AC.isAnalytic(pc) && pc.type === 'circle') return arcs(pc, t0, t1);
  if (NC.isCurve(pc)) {
    const d = NC.toData(pc);
    if (d.deg === 1 && d.w === null) {                                             // a polyline: one piece a span
      const p = d.cvs.map((q) => [q[0], q[1]]), out = [];
      for (let i = 0; i + 1 < p.length; i++) if (p[i][0] !== p[i + 1][0] || p[i][1] !== p[i + 1][1]) out.push({ kind: 'seg', a: p[i], b: p[i + 1] });
      return out;
    }
  }
  return fail(NOT, { what: 'loop', why: 'kind' });
}

export function uvLoop(b, loop, { tol } = {}) {
  const T = resolveTol(tol);
  if (!B.isBrep(b)) fail(BAD, { name: 'b', why: 'not_a_brep' });
  const L = B.get(b, 'loop', loop), out = [];
  for (const id of L.coedges) {
    const co = B.get(b, 'coedge', id), e = B.get(b, 'edge', co.edge);
    if (co.pcurve === null) fail(NOT, { what: 'loop', why: 'no_pcurve' });
    let ps = piecesOf(co.pcurve, e.t0, e.t1);
    if (co.sense < 0) ps = ps.reverse().map(flip);
    for (const p of ps) out.push(p);
  }
  // end to end: each piece starts where the one before ends (they agree within tol.lin or the loop is not closed in (u, v))
  for (let i = 0; i < out.length; i++) {
    const prev = out[(i + out.length - 1) % out.length];
    if (!(norm(out[i].a[0] - prev.b[0], out[i].a[1] - prev.b[1]) <= T.lin)) fail(NOT, { what: 'loop', why: 'open_in_uv' });
  }
  for (let i = 1; i < out.length; i++) out[i] = { ...out[i], a: out[i - 1].b };
  if (out.length) out[0] = { ...out[0], a: out[out.length - 1].b };
  return out;
}

// ---- the winding number
const sq = (x) => [1, x, x], cross = (x, y) => [-2, x, y];
/** the sign of (qu − cu)² + (qv − cv)² − r², exactly */
const power = (q, c, r) => sumSign([sq(q[0]), cross(q[0], c[0]), sq(c[0]), sq(q[1]), cross(q[1], c[1]), sq(c[1]), [-1, r, r]]);

/** +1 or −1 when the ray from q along +u meets the piece (up or down), 0 when it does not, null when q is on the piece */
function meets(p, q) {
  const lo = Math.min(p.a[1], p.b[1]), hi = Math.max(p.a[1], p.b[1]);
  if (p.kind === 'seg') {
    const o = orient2d(p.a, p.b, q);
    if (o === 0 && Math.min(p.a[0], p.b[0]) <= q[0] && q[0] <= Math.max(p.a[0], p.b[0]) && lo <= q[1] && q[1] <= hi) return null;
    if (!(lo <= q[1] && q[1] < hi)) return 0;
    return p.a[1] < p.b[1] ? (o > 0 ? 1 : 0) : (o < 0 ? -1 : 0);
  }
  const pw = power(q, p.c, p.r), dx = q[0] - p.c[0], sx = Math.sign(dx);
  if (pw === 0 && lo <= q[1] && q[1] <= hi && (sx === p.qx || sx === 0)) return null;
  if (!(lo <= q[1] && q[1] < hi)) return 0;
  const left = p.qx > 0 ? (sx < 0 || pw < 0) : (sx < 0 && pw > 0);                 // q is left of the arc where the ray meets it
  return left ? (p.a[1] < p.b[1] ? 1 : -1) : 0;
}

export function winding(pieces, q) {
  if (!Array.isArray(pieces)) fail(BAD, { name: 'pieces', why: 'not_a_list' });
  if (!isPair(q)) fail(BAD, { name: 'q', why: 'not_a_pair' });
  let w = 0;
  for (const p of pieces) {
    const m = meets(p, q);
    if (m === null) return null;
    w += m;
  }
  return w;
}

// ---- distance, for 'on'
const norm = (x, y) => V3.len([x, y, 0]);
function nearSeg(p, q) {
  const dx = p.b[0] - p.a[0], dy = p.b[1] - p.a[1], l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((q[0] - p.a[0]) * dx + (q[1] - p.a[1]) * dy) / l2)) : 0;
  return norm(q[0] - p.a[0] - t * dx, q[1] - p.a[1] - t * dy);
}
function nearArc(p, q) {
  const dx = q[0] - p.c[0], dy = q[1] - p.c[1], d = norm(dx, dy);
  const ends = Math.min(norm(q[0] - p.a[0], q[1] - p.a[1]), norm(q[0] - p.b[0], q[1] - p.b[1]));
  if (!(d > 0) || Math.sign(dx) * p.qx < 0 || Math.sign(dy) * p.qy < 0) return ends;
  const v = p.c[1] + (p.r * dy) / d;                                                // where the radius through q meets the circle
  return Math.min(p.a[1], p.b[1]) <= v && v <= Math.max(p.a[1], p.b[1]) ? Math.abs(d - p.r) : ends;
}
const nearPiece = (p, q) => (p.kind === 'seg' ? nearSeg(p, q) : nearArc(p, q));

// ---- a face
/** q's angle, a whole number of periods from the loops' own lowest (so a seam's two sides, u = 0 and u = 2π, are both the face's edge) */
function wrapped(q, loops, per) {
  const out = q.slice();
  for (const k of [0, 1]) {
    if (per[k === 0 ? 'u' : 'v'] === null) continue;
    let lo = Infinity;
    for (const ps of loops) for (const p of ps) lo = Math.min(lo, p.a[k], p.b[k], ...(p.kind === 'arc' ? [p.c[k] - p.r] : []));
    out[k] = lo + (((q[k] - lo) % TAU) + TAU) % TAU;
  }
  return out;
}

export function classify(b, face, q, { tol } = {}) {
  const T = resolveTol(tol);
  if (!B.isBrep(b)) fail(BAD, { name: 'b', why: 'not_a_brep' });
  if (!isPair(q)) fail(BAD, { name: 'q', why: 'not_a_pair' });
  if (!B.ids(b, 'face').includes(face)) fail(BAD, { name: 'face', why: 'unknown' });
  const F = B.get(b, 'face', face), loops = F.loops.map((l) => uvLoop(b, l, { tol: T })), p = wrapped(q, loops, P.periods(F.surface));
  for (const ps of loops) for (const piece of ps) if (nearPiece(piece, p) <= T.lin) return 'on';
  let w = 0;
  for (const ps of loops) {
    const m = winding(ps, p);
    if (m === null) return 'on';
    w += m;
  }
  if (w === 0) return 'out';
  if (w === F.sense) return 'in';
  return fail('solid.err.bad_topology', { rule: 'orientation', kind: 'face', id: face });
}

// ---- pcurves for a body that has none
export function attach(b, { tol } = {}) {
  const T = resolveTol(tol);
  if (!B.isBrep(b)) fail(BAD, { name: 'b', why: 'not_a_brep' });
  const made = [], skipped = [], fields = new Map();
  for (const fid of B.ids(b, 'face')) {
    const F = B.get(b, 'face', fid), per = P.periods(F.surface), periodic = per.u !== null || per.v !== null;
    for (const lid of F.loops) {
      for (const cid of B.get(b, 'loop', lid).coedges) {
        const co = B.get(b, 'coedge', cid), e = B.get(b, 'edge', co.edge);
        if (co.pcurve !== null) continue;
        if (periodic) { skipped.push([cid, 'periodic']); continue; }                  // a seam's turn needs the loop's own walk: the builders do it
        try { fields.set(cid, P.pcurveOf(F.surface, e.curve, e.t0, e.t1, { tol: T })); made.push(cid); } catch (x) {
          if (x.code !== NOT) throw x;
          skipped.push([cid, x.vars.why]);
        }
      }
    }
  }
  const out = B.edit(b, (d) => { for (const [cid, pc] of fields) d.set('coedge', cid, { pcurve: pc }); }, T);
  return Object.freeze({ brep: out, made: Object.freeze(made), skipped: Object.freeze(skipped) });
}
