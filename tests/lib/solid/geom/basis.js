/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * basis.js — cc-solid (S4, docs/solid/HANDOFF.md § 6, M1): knot vectors, span search, B-spline basis functions and their
 * derivatives. DOM-free; imports core/ and cc-nurbs' basis.js.
 *
 * The arithmetic is cc-nurbs' (decision D8): basisFuns and dersBasisFuns, The NURBS Book (Piegl & Tiller, 2nd ed.) A2.2
 * and A2.3, called unchanged. They use only + − × ÷, so the results are the same bits everywhere. What this file adds is
 * what cc-nurbs leaves to its callers:
 *   - every input is checked once, and a bad one is refused with a typed error instead of returning NaN;
 *   - knot vectors need not be clamped. cc-nurbs' findSpan (A2.1) returns an empty span at an end of the domain when the
 *     knot there repeats (U[p] = U[p+1], or U[n] = U[n+1]), and the basis is then NaN. findSpan here steps to the nearest
 *     non-empty span instead;
 *   - knots are compared exactly. Two knots are one knot only when they are equal (cc-nurbs' KTOL is not used), so a
 *     very short span is a real span, and the basis on it is still exact to rounding;
 *   - derivatives above the degree are zero rows, computed without asking A2.3 for them;
 *   - limits on the degree and the knot count (HANDOFF § 6.6), so hostile data cannot exhaust memory.
 *
 * Conventions (the book's): p = degree, U = knot vector of m + 1 values, n + 1 = number of basis functions (control
 * points), m = n + p + 1. The domain is [a, b] = [U[p], U[n+1]]. Spans are half-open, [U[i], U[i+1]); u = b belongs to
 * the last non-empty span.
 *
 *   LIMITS                         { degree: 15, knots: 65536, order: 32 } — frozen
 *   knots(U, p) → K                checks U and p and returns K, a frozen record:
 *                                    { U (a frozen copy), p, n, a, b, clamped, distinct: [{ u, m }] (frozen) }.
 *                                    Every function below takes K, so the check runs once, not on every evaluation.
 *   isKnots(K)                     true only for a record made by knots()
 *   span(K, u) → i                 the span holding u: p ≤ i ≤ n, U[i] ≤ u < U[i+1] (U[i] < u = U[i+1] at u = b)
 *   basis(K, u) → { span, N }      N[j] = N(span − p + j, p)(u), j = 0 … p (A2.2). Every value is ≥ 0 and they sum to 1.
 *   ders(K, u, d) → { span, ders } ders[k][j] = k-th derivative of N(span − p + j, p) at u, k = 0 … d (A2.3); rows with
 *                                    k > p are zero. The derivative at a knot is the one from the right (left at u = b).
 *   one(K, i, u) → N(i, p)(u)      one basis function, i = 0 … n (0 outside its support)
 *   oneDers(K, i, u, d) → [N(i,p)(u), N'(i,p)(u), …]   its derivatives, k = 0 … d
 *   clampedUniform(count, p, a = 0, b = 1) → U   a clamped knot vector with uniform interior knots (cc-nurbs'), checked
 *   Unchecked, for hot loops over a K already made (no checks, no allocation beyond the result):
 *   findSpan(n, p, u, U) → i       cc-nurbs' A2.1 with the empty-end-span fix above
 *   basisFuns(i, u, p, U), dersBasisFuns(i, u, p, d, U)   cc-nurbs' A2.2 and A2.3, re-exported unchanged (d ≤ p there)
 *
 * Domain: every knot, every u, and a and b in clampedUniform are 0 or between 2^-500 and 2^500 in magnitude. A nonzero
 * difference of two such numbers is then a normal double, so no knot difference is subnormal or overflows.
 * Refusals: solid.err.bad_input { name, why }:
 *   name 'degree'  why 'not_a_count'                       name 'count'  why 'not_a_count' | 'too_few'
 *   name 'knots'   why 'not_an_array' | 'not_a_number' | 'out_of_range' | 'too_short' | 'decreasing' | 'empty_domain'
 *                      | 'multiplicity' (a value repeats more than p + 1 times, so some basis function is zero everywhere)
 *   name 'u'       why 'not_a_number' | 'out_of_range' | 'out_of_domain'
 *   name 'order'   why 'not_a_count' | 'out_of_range'      name 'index'  why 'not_a_count' | 'out_of_range'
 *   name 'a', 'b'  why 'not_a_number' | 'out_of_range' | 'order' (b ≤ a)        name 'knots'  why 'not_knots' (K not made by knots())
 * solid.err.limit { what: 'degree' | 'knots', limit, used }.
 */
import { fail } from '../core/errors.js';
import { pow2 } from '../core/float.js';
import * as NB from '../../nurbs/basis.js';

export const LIMITS = Object.freeze({ degree: 15, knots: 65536, order: 32 });
const LO = pow2(-500), HI = pow2(500);
const MADE = new WeakSet();

const inRange = (x) => x === 0 || (Math.abs(x) >= LO && Math.abs(x) <= HI);
const isCount = (x) => typeof x === 'number' && Number.isInteger(x) && x >= 0;
const isList = (U) => Array.isArray(U) || (ArrayBuffer.isView(U) && !(U instanceof DataView));

function checkDegree(p) {
  if (!isCount(p)) fail('solid.err.bad_input', { name: 'degree', why: 'not_a_count' });
  if (p > LIMITS.degree) fail('solid.err.limit', { what: 'degree', limit: LIMITS.degree, used: p });
}

export function knots(U, p) {
  checkDegree(p);
  if (!isList(U)) fail('solid.err.bad_input', { name: 'knots', why: 'not_an_array' });
  if (U.length > LIMITS.knots) fail('solid.err.limit', { what: 'knots', limit: LIMITS.knots, used: U.length });
  if (U.length < 2 * p + 2) fail('solid.err.bad_input', { name: 'knots', why: 'too_short' });
  const copy = new Array(U.length);
  for (let k = 0; k < U.length; k++) {
    const x = U[k];
    if (typeof x !== 'number' || !Number.isFinite(x)) fail('solid.err.bad_input', { name: 'knots', why: 'not_a_number' });
    if (!inRange(x)) fail('solid.err.bad_input', { name: 'knots', why: 'out_of_range' });
    if (k && x < copy[k - 1]) fail('solid.err.bad_input', { name: 'knots', why: 'decreasing' });
    copy[k] = x === 0 ? 0 : x;   // −0 → 0, so every knot compares and prints the same
  }
  const n = copy.length - p - 2, a = copy[p], b = copy[n + 1];
  if (!(a < b)) fail('solid.err.bad_input', { name: 'knots', why: 'empty_domain' });
  const distinct = [];
  for (const x of copy) {
    const last = distinct[distinct.length - 1];
    if (last && last.u === x) last.m++;
    else distinct.push({ u: x, m: 1 });
  }
  for (const k of distinct) if (k.m > p + 1) fail('solid.err.bad_input', { name: 'knots', why: 'multiplicity' });
  let clamped = true;
  for (let i = 0; i <= p; i++) if (copy[i] !== a || copy[copy.length - 1 - i] !== b) clamped = false;
  const K = Object.freeze({ U: Object.freeze(copy), p, n, a, b, clamped, distinct: Object.freeze(distinct.map((k) => Object.freeze(k))) });
  MADE.add(K);
  return K;
}

export const isKnots = (K) => K !== null && typeof K === 'object' && MADE.has(K);

// ---- plain data, for a worker boundary or a file (decision D-wire: a copy made by postMessage is not a knot record)
export function toData(K) {
  if (!isKnots(K)) fail('solid.err.bad_input', { name: 'knots', why: 'not_knots' });
  return { U: K.U.slice(), p: K.p };
}
export function fromData(d) {
  if (d === null || typeof d !== 'object') fail('solid.err.bad_input', { name: 'knots', why: 'not_knots' });
  return knots(d.U, d.p);
}

function checked(K, u) {
  if (!isKnots(K)) fail('solid.err.bad_input', { name: 'knots', why: 'not_knots' });
  if (typeof u !== 'number' || !Number.isFinite(u)) fail('solid.err.bad_input', { name: 'u', why: 'not_a_number' });
  if (!inRange(u)) fail('solid.err.bad_input', { name: 'u', why: 'out_of_range' });
  if (u < K.a || u > K.b) fail('solid.err.bad_input', { name: 'u', why: 'out_of_domain' });
}
function checkOrder(d) {
  if (!isCount(d)) fail('solid.err.bad_input', { name: 'order', why: 'not_a_count' });
  if (d > LIMITS.order) fail('solid.err.bad_input', { name: 'order', why: 'out_of_range' });
}

/** cc-nurbs' A2.1, then off an empty span at either end of the domain (possible only when the knot there repeats). */
export function findSpan(n, p, u, U) {
  let i = NB.findSpan(n, p, u, U);
  while (i > p && U[i] === U[i + 1]) i--;      // u = b with U[n] = U[n+1]: the last non-empty span
  while (i < n && U[i] === U[i + 1]) i++;      // u = a with U[p] = U[p+1]: the first non-empty span
  return i;
}
export const basisFuns = NB.basisFuns;
export const dersBasisFuns = NB.dersBasisFuns;

export function span(K, u) {
  checked(K, u);
  return findSpan(K.n, K.p, u, K.U);
}

export function basis(K, u) {
  checked(K, u);
  const i = findSpan(K.n, K.p, u, K.U);
  return { span: i, N: NB.basisFuns(i, u, K.p, K.U) };
}

function dersAt(K, i, u, d) {
  const p = K.p, top = d < p ? d : p;
  const D = NB.dersBasisFuns(i, u, p, top, K.U);
  for (let k = top + 1; k <= d; k++) D.push(new Array(p + 1).fill(0));
  return D;
}

export function ders(K, u, d) {
  checked(K, u);
  checkOrder(d);
  const i = findSpan(K.n, K.p, u, K.U);
  return { span: i, ders: dersAt(K, i, u, d) };
}

function checkIndex(K, i) {
  if (!isCount(i)) fail('solid.err.bad_input', { name: 'index', why: 'not_a_count' });
  if (i > K.n) fail('solid.err.bad_input', { name: 'index', why: 'out_of_range' });
}

export function one(K, i, u) {
  checked(K, u);
  checkIndex(K, i);
  const s = findSpan(K.n, K.p, u, K.U);
  if (i < s - K.p || i > s) return 0;
  return NB.basisFuns(s, u, K.p, K.U)[i - s + K.p];
}

export function oneDers(K, i, u, d) {
  checked(K, u);
  checkIndex(K, i);
  checkOrder(d);
  const s = findSpan(K.n, K.p, u, K.U);
  if (i < s - K.p || i > s) return new Array(d + 1).fill(0);
  const D = dersAt(K, s, u, d), j = i - s + K.p;
  return D.map((row) => row[j]);
}

export function clampedUniform(count, p, a = 0, b = 1) {
  checkDegree(p);
  if (!isCount(count)) fail('solid.err.bad_input', { name: 'count', why: 'not_a_count' });
  if (count < p + 1) fail('solid.err.bad_input', { name: 'count', why: 'too_few' });
  if (count + p + 1 > LIMITS.knots) fail('solid.err.limit', { what: 'knots', limit: LIMITS.knots, used: count + p + 1 });
  for (const [name, x] of [['a', a], ['b', b]]) {
    if (typeof x !== 'number' || !Number.isFinite(x)) fail('solid.err.bad_input', { name, why: 'not_a_number' });
    if (!inRange(x)) fail('solid.err.bad_input', { name, why: 'out_of_range' });
  }
  if (!(a < b)) fail('solid.err.bad_input', { name: 'b', why: 'order' });
  const U = NB.clampedUniform(count, p, a, b);
  for (const x of U) if (!inRange(x)) fail('solid.err.bad_input', { name: 'knots', why: 'out_of_range' });
  return U;
}
