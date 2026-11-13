/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * aabb.js — cc-solid (S2, docs/solid/HANDOFF.md § 6.4): axis-aligned bounding boxes that are conservative: a box computed
 * here always holds the exact set it bounds, rounding included. DOM-free; imports the core.
 *
 * A box is frozen { min: [x, y, z], max: [x, y, z] }, the shape cc-nurbs' bbox returns, so the two mix. The empty box has
 * min +Infinity and max −Infinity, so extending it by a point gives that point. Culling (a BVH, clash tests, picking) may
 * then skip whatever a box misses without ever skipping something it should have found.
 *
 *   EMPTY · isEmpty(b) · box(min, max) (checked: finite or infinite numbers, min ≤ max per axis, or the empty box)
 *   fromPoints(points) (exact: no arithmetic) · extend(b, p) · union(a, b) · intersection(a, b) (EMPTY when they miss)
 *   inflate(b, d) (each side moved out by d ≥ 0, rounded outward) · transform(b, m) (the box of the moved box, mat4 m)
 *   contains(b, p) · containsBox(a, b) · overlaps(a, b) (closed boxes: touching counts)
 *   center(b) · size(b) (rounded up) · diagonal(b) (rounded up)
 * Bad arguments are solid.err.bad_input { name, why }.
 */
import { fail } from '../core/errors.js';
import { addDown, addUp, subUp, mulDown, mulUp, nextUp } from '../core/float.js';

const make = (min, max) => Object.freeze({ min: Object.freeze(min), max: Object.freeze(max) });
export const EMPTY = make([Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]);
export const isEmpty = (b) => !(b.min[0] <= b.max[0] && b.min[1] <= b.max[1] && b.min[2] <= b.max[2]);

const isCoord = (v) => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && x === x);
export function box(min, max) {
  if (!isCoord(min) || !isCoord(max)) fail('solid.err.bad_input', { name: 'box', why: 'not_a_box' });
  if (min.every((v) => v === Infinity) && max.every((v) => v === -Infinity)) return EMPTY;
  if (!(min[0] <= max[0] && min[1] <= max[1] && min[2] <= max[2])) fail('solid.err.bad_input', { name: 'box', why: 'min_above_max' });
  return make(min.slice(), max.slice());
}

export function fromPoints(points) {
  if (!Array.isArray(points)) fail('solid.err.bad_input', { name: 'points', why: 'not_an_array' });
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    if (!isCoord(p)) fail('solid.err.bad_input', { name: 'points', why: 'not_a_point' });
    for (let i = 0; i < 3; i++) { if (p[i] < min[i]) min[i] = p[i]; if (p[i] > max[i]) max[i] = p[i]; }
  }
  return min[0] === Infinity ? EMPTY : make(min, max);
}
export function extend(b, p) {
  return make([Math.min(b.min[0], p[0]), Math.min(b.min[1], p[1]), Math.min(b.min[2], p[2])],
    [Math.max(b.max[0], p[0]), Math.max(b.max[1], p[1]), Math.max(b.max[2], p[2])]);
}
export function union(a, b) {
  if (isEmpty(a)) return b;
  if (isEmpty(b)) return a;
  return make([0, 1, 2].map((i) => Math.min(a.min[i], b.min[i])), [0, 1, 2].map((i) => Math.max(a.max[i], b.max[i])));
}
export function intersection(a, b) {
  const min = [0, 1, 2].map((i) => Math.max(a.min[i], b.min[i])), max = [0, 1, 2].map((i) => Math.min(a.max[i], b.max[i]));
  return min[0] <= max[0] && min[1] <= max[1] && min[2] <= max[2] ? make(min, max) : EMPTY;
}
export function inflate(b, d) {
  if (typeof d !== 'number' || !(d >= 0)) fail('solid.err.bad_input', { name: 'd', why: 'not_a_distance' });
  if (isEmpty(b)) return EMPTY;
  return make(b.min.map((v) => addDown(v, -d)), b.max.map((v) => addUp(v, d)));
}

/** The box of m applied to every point of b: for each row, the translation plus the extreme of each term, all rounded out. */
export function transform(b, m) {
  if (!Array.isArray(m) || m.length !== 16 || !m.every((x) => typeof x === 'number' && Number.isFinite(x))) fail('solid.err.bad_input', { name: 'matrix', why: 'not_a_matrix' });
  if (isEmpty(b)) return EMPTY;
  const min = [0, 0, 0], max = [0, 0, 0];
  for (let r = 0; r < 3; r++) {
    let lo = m[4 * r + 3], hi = m[4 * r + 3];
    for (let c = 0; c < 3; c++) {
      const k = m[4 * r + c];
      if (k === 0) continue;                           // 0 · an unbounded side is 0
      const p = k > 0 ? b.min[c] : b.max[c], q = k > 0 ? b.max[c] : b.min[c];
      lo = addDown(lo, mulDown(k, p));
      hi = addUp(hi, mulUp(k, q));
    }
    min[r] = lo; max[r] = hi;
  }
  return make(min, max);
}

export const contains = (b, p) => b.min[0] <= p[0] && p[0] <= b.max[0] && b.min[1] <= p[1] && p[1] <= b.max[1] && b.min[2] <= p[2] && p[2] <= b.max[2];
export const containsBox = (a, b) => isEmpty(b) || (contains(a, b.min) && contains(a, b.max));
export const overlaps = (a, b) => a.min[0] <= b.max[0] && b.min[0] <= a.max[0] && a.min[1] <= b.max[1] && b.min[1] <= a.max[1] && a.min[2] <= b.max[2] && b.min[2] <= a.max[2];
export const center = (b) => [0, 1, 2].map((i) => 0.5 * b.min[i] + 0.5 * b.max[i]);
export const size = (b) => (isEmpty(b) ? [0, 0, 0] : [0, 1, 2].map((i) => subUp(b.max[i], b.min[i])));
export function diagonal(b) {
  const [x, y, z] = size(b);
  return nextUp(Math.sqrt(addUp(addUp(mulUp(x, x), mulUp(y, y)), mulUp(z, z))));
}
