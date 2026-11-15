/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * bvh.js — cc-solid (S10, docs/solid/HANDOFF.md § 6.4): a bounding-volume hierarchy of axis-aligned boxes, for culling in
 * closest-point searches, picking and intersection. DOM-free; imports the core and aabb.js.
 *
 * Built once, top down: a node's items are split at the median of their boxes' centres along the longest side of the node's
 * box (ties kept in input order, so the same input gives the same tree), until a node holds at most `leaf` items. A tree is
 * frozen and holds only boxes and the caller's item numbers 0 … n − 1.
 *
 *   build(boxes, { leaf = 4 } = {}) → tree      boxes: frozen aabb boxes ({ min, max }); empty boxes are refused
 *   overlapping(tree, box) → [item …]          every item whose box overlaps `box` (closed boxes), ascending
 *   nearest(tree, p, distance) → { item, d }   the item with the least distance(item, p), visiting nodes in order of their
 *                                              box's distance to p and skipping any farther than the best so far; distance
 *                                              must never be less than the box distance (the item lies in its box)
 *   boxDistance(box, p) → the distance from p to the box (0 inside)
 * Refusals: solid.err.bad_input { name: 'boxes', why: 'not_an_array' | 'empty' | 'not_a_box' }, { name: 'leaf' }.
 */
import { fail } from '../core/errors.js';
import * as B from './aabb.js';

const BAD = 'solid.err.bad_input';
const MADE = new WeakSet();

export function boxDistance(b, p) {
  let s = 0;
  for (let i = 0; i < 3; i++) {
    const d = p[i] < b.min[i] ? b.min[i] - p[i] : p[i] > b.max[i] ? p[i] - b.max[i] : 0;
    s += d * d;
  }
  return Math.sqrt(s);
}

export function build(boxes, { leaf = 4 } = {}) {
  if (!Array.isArray(boxes)) fail(BAD, { name: 'boxes', why: 'not_an_array' });
  if (boxes.length === 0) fail(BAD, { name: 'boxes', why: 'empty' });
  if (!Number.isInteger(leaf) || leaf < 1 || leaf > 64) fail(BAD, { name: 'leaf', why: 'out_of_range' });
  for (const b of boxes) if (!b || !Array.isArray(b.min) || !Array.isArray(b.max) || B.isEmpty(b)) fail(BAD, { name: 'boxes', why: 'not_a_box' });
  const centre = boxes.map((b) => [0, 1, 2].map((i) => (b.min[i] + b.max[i]) / 2));
  const make = (items) => {
    let box = B.EMPTY;
    for (const i of items) box = B.union(box, boxes[i]);
    if (items.length <= leaf) return Object.freeze({ box, items: Object.freeze(items.slice()) });
    const ext = [0, 1, 2].map((i) => box.max[i] - box.min[i]), axis = ext[0] >= ext[1] && ext[0] >= ext[2] ? 0 : ext[1] >= ext[2] ? 1 : 2;
    const sorted = items.slice().sort((a, b) => centre[a][axis] - centre[b][axis] || a - b), half = sorted.length >> 1;
    return Object.freeze({ box, left: make(sorted.slice(0, half)), right: make(sorted.slice(half)) });
  };
  const tree = Object.freeze({ root: make(boxes.map((_, i) => i)), count: boxes.length, boxes: Object.freeze(boxes.slice()) });
  MADE.add(tree);
  return tree;
}

function need(t) {
  if (!MADE.has(t)) fail(BAD, { name: 'tree', why: 'not_a_tree' });
  return t;
}

export function overlapping(tree, box) {
  need(tree);
  const out = [], stack = [tree.root];
  while (stack.length) {
    const n = stack.pop();
    if (!B.overlaps(n.box, box)) continue;
    if (n.items) { for (const i of n.items) if (B.overlaps(tree.boxes[i], box)) out.push(i); continue; }
    stack.push(n.left, n.right);
  }
  return out.sort((a, b) => a - b);
}

export function nearest(tree, p, distance) {
  need(tree);
  let best = { item: -1, d: Infinity };
  const visit = (n) => {
    if (boxDistance(n.box, p) > best.d) return;
    if (n.items) {
      for (const i of n.items) { const d = distance(i, p); if (d < best.d || (d === best.d && i < best.item)) best = { item: i, d }; }
      return;
    }
    const dl = boxDistance(n.left.box, p), dr = boxDistance(n.right.box, p);
    if (dl <= dr) { visit(n.left); visit(n.right); } else { visit(n.right); visit(n.left); }
  };
  visit(tree.root);
  return Object.freeze(best);
}
