/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * quad.js — cc-solid (S2, docs/solid/HANDOFF.md § 5.6): numerical integration by Gauss–Legendre rules. DOM-free; imports the
 * core only.
 *
 * Arc length, area, volume and mass properties (S10, measure/) are integrals of smooth functions over parameter intervals.
 * An n-point Gauss–Legendre rule is exact for polynomials up to degree 2n − 1. The nodes and weights are computed here, not
 * typed in: Newton's method on the Legendre polynomial P_n, evaluated by its three-term recurrence, from the classical
 * starting values cos(π (i − ¼) / (n + ½)); then w = 2 / ((1 − x²) P_n′(x)²). The last step and the weight are taken in
 * double-double arithmetic (106 bits), because a weight next to ±1 is hundreds of times more sensitive than its node: every
 * node and weight of rules 1 to 64 is the double nearest the exact value. Every engine computes the same tables.
 *
 *   MAX_ORDER                       64            MAX_PIECES   100000 (the most maxPieces may be)
 *   rule(n) → frozen { n, x, w }    nodes ascending in (−1, 1), symmetric to the last bit, and their weights; n from 1 to 64
 *                                   (else solid.err.bad_input { name: 'n', why: 'out_of_range' }); computed once, then kept
 *   fixed(f, a, b, n = 10)          the n-point rule on [a, b]: (b − a)/2 · Σ w f(midpoint + half-width · x)
 *   adaptive(f, a, b, { eps, order = 10, maxDepth = 40, maxPieces = 4096, budget } ) → frozen { value, error, intervals, evaluations }
 *       Global error control: each piece's error is estimated by how far the rule on its halves moves from the rule on the
 *       whole, and the piece with the largest estimate (the first, among equals) is halved, until the estimates add up to
 *       eps (an absolute target, from the caller's Tolerance) or to a few ulps of the result. So an end singularity such as
 *       √x at 0 costs a handful of halvings there and none elsewhere, and the same input gives the same pieces every time.
 *       A piece that would need more than maxDepth halvings, or more than maxPieces pieces in all (a jump, a wild
 *       oscillation, a broken f), → solid.err.no_convergence { what: 'integral', iterations } (the halvings done), so it
 *       always ends; each halving also counts one step of the budget (solid.err.limit when it runs out). The worst piece
 *       comes from a heap, so the cost grows as pieces · log(pieces).
 * f must return finite numbers (anything else: solid.err.bad_input { name: 'f', why: 'not_finite' }); a > b integrates
 * backwards (the sign flips).
 */
import { fail } from '../core/errors.js';
import { EPS, prodErr, sumErr } from '../core/float.js';
import { cos, PI } from '../core/trig.js';
import { resolveBudget } from '../core/limits.js';

export const MAX_ORDER = 64;
export const MAX_PIECES = 100000;
const RULES = new Map();

function legendre(n, x) {                              // → [P_n(x), P_n′(x)]
  let p0 = 1, p1 = x;
  for (let k = 1; k < n; k++) { const p2 = ((2 * k + 1) * x * p1 - k * p0) / (k + 1); p0 = p1; p1 = p2; }
  return [p1, (n * (x * p1 - p0)) / (x * x - 1)];
}

// Double-double arithmetic: a number as [hi, lo], an unevaluated sum of two doubles that carries some 106 bits (Dekker
// 1971). A weight depends on its node as 1 / (1 − x²): next to ±1, half an ulp in the node is hundreds of ulps in the
// weight. So the last Newton step, and the weight, are taken with the node to 106 bits, and only then rounded.
const ddD = (x) => [x, 0];
function ddAdd(a, b) { const s = a[0] + b[0], e = sumErr(a[0], b[0], s) + (a[1] + b[1]), h = s + e; return [h, sumErr(s, e, h)]; }
const ddNeg = (a) => [-a[0], -a[1]];
function ddMul(a, b) { const p = a[0] * b[0], e = prodErr(a[0], b[0], p) + (a[0] * b[1] + a[1] * b[0]), h = p + e; return [h, sumErr(p, e, h)]; }
function ddDiv(a, b) {
  const q1 = a[0] / b[0];
  let r = ddAdd(a, ddNeg(ddMul(b, ddD(q1))));
  const q2 = r[0] / b[0];
  r = ddAdd(r, ddNeg(ddMul(b, ddD(q2))));
  const q3 = r[0] / b[0], h = q1 + q2;
  return ddAdd([h, sumErr(q1, q2, h)], ddD(q3));
}
function legendreDD(n, x) {                            // → [P_n(x), P_n′(x)], x and both results double-doubles
  let p0 = ddD(1), p1 = x;
  for (let k = 1; k < n; k++) {
    const p2 = ddDiv(ddAdd(ddMul(ddD(2 * k + 1), ddMul(x, p1)), ddNeg(ddMul(ddD(k), p0))), ddD(k + 1));
    p0 = p1; p1 = p2;
  }
  return [p1, ddDiv(ddMul(ddD(n), ddAdd(ddMul(x, p1), ddNeg(p0))), ddAdd(ddMul(x, x), ddD(-1)))];
}

function compute(n) {
  const x = new Array(n), w = new Array(n), ONE = ddD(1);
  for (let i = 1; i <= Math.floor(n / 2); i++) {      // the positive roots, largest first; the rest by symmetry
    let z = cos((PI * (i - 0.25)) / (n + 0.5));
    for (let it = 0; it < 100; it++) {                 // to the last bit of a double,
      const [p, d] = legendre(n, z);
      const dz = p / d;
      z -= dz;
      if (Math.abs(dz) <= 2 * EPS * Math.abs(z)) break;
    }
    let Z = ddD(z), dP;
    for (let it = 0; it < 2; it++) { const [p, d] = legendreDD(n, Z); Z = ddAdd(Z, ddNeg(ddDiv(p, d))); }   // then to 106 bits
    dP = legendreDD(n, Z)[1];
    const W = ddDiv(ddD(2), ddMul(ddMul(ddAdd(ONE, ddNeg(Z)), ddAdd(ONE, Z)), ddMul(dP, dP)));           // 2 / ((1 − x)(1 + x) P′²)
    x[n - i] = Z[0]; x[i - 1] = -Z[0];
    w[n - i] = W[0]; w[i - 1] = W[0];
  }
  if (n % 2) {                                         // the middle node is 0
    const m = (n - 1) / 2, d = legendreDD(n, ddD(0))[1];
    x[m] = 0; w[m] = ddDiv(ddD(2), ddMul(d, d))[0];
  }
  return Object.freeze({ n, x: Object.freeze(x), w: Object.freeze(w) });
}

export function rule(n) {
  if (!Number.isInteger(n) || n < 1 || n > MAX_ORDER) fail('solid.err.bad_input', { name: 'n', why: 'out_of_range' });
  let r = RULES.get(n);
  if (!r) { r = compute(n); RULES.set(n, r); }
  return r;
}

function needFn(f) { if (typeof f !== 'function') fail('solid.err.bad_input', { name: 'f', why: 'not_a_function' }); }
function needEnds(a, b) {
  if (typeof a !== 'number' || !Number.isFinite(a)) fail('solid.err.bad_input', { name: 'a', why: 'not_a_number' });
  if (typeof b !== 'number' || !Number.isFinite(b)) fail('solid.err.bad_input', { name: 'b', why: 'not_a_number' });
}
function apply(f, r, a, b) {
  const c = 0.5 * a + 0.5 * b, h = 0.5 * b - 0.5 * a;
  let s = 0;
  for (let i = 0; i < r.n; i++) {
    const v = f(c + h * r.x[i]);
    if (typeof v !== 'number' || !Number.isFinite(v)) fail('solid.err.bad_input', { name: 'f', why: 'not_finite' });
    s += r.w[i] * v;
  }
  return h * s;
}

export function fixed(f, a, b, n = 10) {
  needFn(f); needEnds(a, b);
  return apply(f, rule(n), a, b);
}

export function adaptive(f, a, b, { eps, order = 10, maxDepth = 40, maxPieces = 4096, budget } = {}) {
  needFn(f); needEnds(a, b);
  if (typeof eps !== 'number' || !(eps > 0) || eps === Infinity) fail('solid.err.bad_input', { name: 'eps', why: 'not_a_tolerance' });
  if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 200) fail('solid.err.bad_input', { name: 'maxDepth', why: 'out_of_range' });
  if (!Number.isInteger(maxPieces) || maxPieces < 1 || maxPieces > MAX_PIECES) fail('solid.err.bad_input', { name: 'maxPieces', why: 'out_of_range' });
  const r = rule(order), bud = resolveBudget(budget);
  if (a === b) return Object.freeze({ value: 0, error: 0, intervals: 0, evaluations: 0 });
  const sgn = a < b ? 1 : -1, lo = Math.min(a, b), hi = Math.max(a, b);
  let evaluations = 0, splits = 0;
  const piece = (p, q, depth, whole) => {
    const m = 0.5 * p + 0.5 * q;
    if (whole === undefined) { whole = apply(f, r, p, q); evaluations += r.n; }
    const left = apply(f, r, p, m), right = apply(f, r, m, q);
    evaluations += 2 * r.n;
    return { p, q, m, depth, left, right, value: left + right, err: Math.abs(left + right - whole) };
  };
  // The pieces live in a heap with the worst on top (largest error; of equals, the leftmost: the same choice every time),
  // so a split costs log(pieces), not a pass over all of them. The running totals drift by rounding, so they only say when
  // to look: every decision to stop or to refuse is taken on totals summed afresh, left to right along [lo, hi].
  const worse = (x, y) => x.err > y.err || (x.err === y.err && x.p < y.p);
  const heap = [piece(lo, hi, 0)];
  const down = (i) => {
    const x = heap[i];
    for (;;) {
      let c = 2 * i + 1;
      if (c >= heap.length) break;
      if (c + 1 < heap.length && worse(heap[c + 1], heap[c])) c++;
      if (!worse(heap[c], x)) break;
      heap[i] = heap[c]; i = c;
    }
    heap[i] = x;
  };
  const up = (i) => {
    const x = heap[i];
    while (i > 0) { const q = (i - 1) >> 1; if (!worse(x, heap[q])) break; heap[i] = heap[q]; i = q; }
    heap[i] = x;
  };
  let total = heap[0].err, sum = heap[0].value, exactAt = 1;
  const recount = () => {
    total = 0; sum = 0;
    for (const pc of heap.slice().sort((x, y) => x.p - y.p)) { total += pc.err; sum += pc.value; }
    exactAt = heap.length;
  };
  const met = () => total <= eps || total <= 4 * EPS * Math.abs(sum);
  for (;;) {
    if (met() || heap.length >= 2 * exactAt) {
      recount();
      if (met()) return Object.freeze({ value: sgn * sum, error: total, intervals: heap.length, evaluations });
    }
    const w = heap[0];
    if (w.depth + 1 > maxDepth || heap.length >= maxPieces) {
      if (exactAt !== heap.length) { recount(); if (met()) return Object.freeze({ value: sgn * sum, error: total, intervals: heap.length, evaluations }); }
      fail('solid.err.no_convergence', { what: 'integral', iterations: splits });
    }
    bud.step();
    splits++;
    const l = piece(w.p, w.m, w.depth + 1, w.left), r = piece(w.m, w.q, w.depth + 1, w.right);
    total += (l.err + r.err) - w.err; sum += (l.value + r.value) - w.value;
    heap[0] = l; down(0);
    heap.push(r); up(heap.length - 1);
  }
}
