/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * quad.js — cc-solid (S2, docs/solid/HANDOFF.md § 5.6): numerical integration by Gauss–Legendre rules. DOM-free; imports the
 * core only.
 *
 * Arc length, area, volume and mass properties (S10, measure/) are integrals of smooth functions over parameter intervals.
 * An n-point Gauss–Legendre rule is exact for polynomials up to degree 2n − 1. The nodes and weights are computed here, not
 * typed in: Newton's method on the Legendre polynomial P_n, evaluated by its three-term recurrence, from the classical
 * starting values cos(π (i − ¼) / (n + ½)); then w = 2 / ((1 − x²) P_n′(x)²). Every engine computes the same tables.
 *
 *   MAX_ORDER                       64
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
 *       always ends; each halving also counts one step of the budget (solid.err.limit when it runs out).
 * f must return finite numbers (anything else: solid.err.bad_input { name: 'f', why: 'not_finite' }); a > b integrates
 * backwards (the sign flips).
 */
import { fail } from '../core/errors.js';
import { EPS } from '../core/float.js';
import { cos, PI } from '../core/trig.js';
import { resolveBudget } from '../core/limits.js';

export const MAX_ORDER = 64;
const RULES = new Map();

function legendre(n, x) {                              // → [P_n(x), P_n′(x)]
  let p0 = 1, p1 = x;
  for (let k = 1; k < n; k++) { const p2 = ((2 * k + 1) * x * p1 - k * p0) / (k + 1); p0 = p1; p1 = p2; }
  return [p1, (n * (x * p1 - p0)) / (x * x - 1)];
}

function compute(n) {
  const x = new Array(n), w = new Array(n);
  for (let i = 1; i <= Math.floor(n / 2); i++) {      // the positive roots, largest first; the rest by symmetry
    let z = cos((PI * (i - 0.25)) / (n + 0.5));
    let dp = 0;
    for (let it = 0; it < 100; it++) {
      const [p, d] = legendre(n, z);
      const dz = p / d;
      z -= dz;
      dp = d;
      if (Math.abs(dz) <= 2 * EPS * Math.abs(z)) { dp = legendre(n, z)[1]; break; }
    }
    const wi = 2 / ((1 - z * z) * dp * dp);
    x[n - i] = z; x[i - 1] = -z;
    w[n - i] = wi; w[i - 1] = wi;
  }
  if (n % 2) {                                         // the middle node is 0
    const m = (n - 1) / 2, d = legendre(n, 0)[1];
    x[m] = 0; w[m] = 2 / (d * d);
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
  if (!Number.isInteger(maxPieces) || maxPieces < 1 || maxPieces > 1000000) fail('solid.err.bad_input', { name: 'maxPieces', why: 'out_of_range' });
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
  const pieces = [piece(lo, hi, 0)];                   // kept in order along [lo, hi]
  for (;;) {
    let total = 0, sum = 0, worst = 0;
    for (let i = 0; i < pieces.length; i++) {
      total += pieces[i].err; sum += pieces[i].value;
      if (pieces[i].err > pieces[worst].err) worst = i;   // the first of equals: the same choice every time
    }
    if (total <= eps || total <= 4 * EPS * Math.abs(sum)) {
      let value = 0;
      for (const pc of pieces) value += pc.value;      // left to right
      return Object.freeze({ value: sgn * value, error: total, intervals: pieces.length, evaluations });
    }
    const w = pieces[worst];
    if (w.depth + 1 > maxDepth || pieces.length >= maxPieces) fail('solid.err.no_convergence', { what: 'integral', iterations: splits });
    bud.step();
    splits++;
    pieces.splice(worst, 1, piece(w.p, w.m, w.depth + 1, w.left), piece(w.m, w.q, w.depth + 1, w.right));
  }
}
