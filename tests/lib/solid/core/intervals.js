/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * intervals.js — cc-solid (S2, docs/solid/HANDOFF.md § 5.4): interval arithmetic with outward rounding. DOM-free; imports
 * errors.js, float.js and trig.js.
 *
 * An interval is a plain array [lo, hi], lo ≤ hi: every real value it stands for lies between lo and hi (±Infinity for no
 * bound). Each operation returns an interval holding every exact result: a bound is rounded outward (float.js), and kept as
 * it is only where an error-free transformation proves it exact. So a decision taken on intervals is safe: an interval that
 * excludes zero proves the sign of what it encloses, and "cannot tell" is an answer of its own (sign → null) for the caller
 * to refine or refuse (HANDOFF § 7). The functions trust their arguments to be intervals; iv() checks one. Given
 * intervals, every operation returns an interval: no bound is ever NaN, a lower bound is never +Infinity and an upper
 * bound never −Infinity.
 *
 *   iv(lo, hi = lo) → [lo, hi]   solid.err.bad_input { name: 'interval', why: 'not_an_interval' } unless lo ≤ hi (no NaN),
 *                                 lo < +Infinity and hi > −Infinity (an interval holds at least one real number)
 *   ENTIRE                        [−Infinity, Infinity], frozen
 *   add · sub · mul · div(a, b)   div by an interval holding 0 gives [−Infinity, Infinity]; unbounded ends are allowed
 *                                 everywhere (0 times an unbounded end is 0; ∞ / ∞ is no bound, never NaN)
 *   neg · abs · sqr · sqrt(a)     sqrt keeps the part ≥ 0 (a wholly negative a → bad_input { why: 'negative' })
 *   scale(a, s)                   a · s for a finite number s (anything else: bad_input { name: 'scale', why: 'not_finite' })
 *   sin(a) · cos(a)               the end values widened by trig.ULPS, and ±1 wherever a crest may lie inside, found with an
 *                                 enclosure of π/2; [−1, 1] for wide or far-out intervals (|x| > 1.6e6, width ≥ 7)
 *   hull(a, b) · intersect(a, b) → interval or null · contains(a, x) · width(a) (rounded up) · mid(a) · mag(a) · mig(a)
 *   sign(a) → 1 | −1 | 0 | null   1: every value > 0; −1: every value < 0; 0: a is [0, 0]; null: cannot tell
 */
import { fail } from './errors.js';
import { nextUp, nextDown, addDown, addUp, subDown, subUp, mulDown, mulUp, divDown, divUp, sqrtDown, sqrtUp } from './float.js';
import { HALF_PI, ULPS, sin as dsin, cos as dcos } from './trig.js';

export const ENTIRE = Object.freeze([-Infinity, Infinity]);
const PIO2_DOWN = HALF_PI;                             // the double below π/2
const PIO2_UP = nextUp(HALF_PI);                       // and the one above
const TRIG_RANGE = 1647099;                            // past it an enclosure of m·π/2 is too wide to place a crest
const TRIG_WIDTH = 7;                                  // > 2π: any interval this wide holds both crests

export function iv(lo, hi = lo) {
  if (typeof lo !== 'number' || typeof hi !== 'number' || !(lo <= hi) || lo === Infinity || hi === -Infinity) fail('solid.err.bad_input', { name: 'interval', why: 'not_an_interval' });
  return [lo, hi];
}

export const add = (a, b) => [addDown(a[0], b[0]), addUp(a[1], b[1])];
export const sub = (a, b) => [subDown(a[0], b[1]), subUp(a[1], b[0])];
export const neg = (a) => [-a[1], -a[0]];

// 0 times an unbounded end is 0: an interval's ends are bounds on reals, not infinities to multiply
const mDown = (x, y) => (x === 0 || y === 0 ? 0 : mulDown(x, y));
const mUp = (x, y) => (x === 0 || y === 0 ? 0 : mulUp(x, y));

export function mul(a, b) {
  const [p, q] = a, [r, s] = b;
  return [
    Math.min(mDown(p, r), mDown(p, s), mDown(q, r), mDown(q, s)),
    Math.max(mUp(p, r), mUp(p, s), mUp(q, r), mUp(q, s)),
  ];
}
export function scale(a, s) {
  if (typeof s !== 'number' || !Number.isFinite(s)) fail('solid.err.bad_input', { name: 'scale', why: 'not_finite' });
  if (s >= 0) return [mDown(a[0], s), mUp(a[1], s)];
  return [mDown(a[1], s), mUp(a[0], s)];
}
// A quotient at a corner where both ends are unbounded (∞ / ∞) is no bound at all: division is monotone in each argument,
// so the bounds are the smallest and largest of the other corners. NaN there is left out, never passed on.
const qDown = (x, y) => { const q = divDown(x, y); return q !== q ? Infinity : q; };
const qUp = (x, y) => { const q = divUp(x, y); return q !== q ? -Infinity : q; };
export function div(a, b) {
  const [p, q] = a, [r, s] = b;
  if (r <= 0 && s >= 0) return [-Infinity, Infinity];
  return [
    Math.min(qDown(p, r), qDown(p, s), qDown(q, r), qDown(q, s)),
    Math.max(qUp(p, r), qUp(p, s), qUp(q, r), qUp(q, s)),
  ];
}
export function sqr(a) {
  const [p, q] = a;
  if (p >= 0) return [mDown(p, p), mUp(q, q)];
  if (q <= 0) return [mDown(q, q), mUp(p, p)];
  const m = Math.max(-p, q);
  return [0, mUp(m, m)];
}
export function abs(a) {
  const [p, q] = a;
  if (p >= 0) return [p, q];
  if (q <= 0) return [-q, -p];
  return [0, Math.max(-p, q)];
}
export function sqrt(a) {
  if (a[1] < 0) fail('solid.err.bad_input', { name: 'interval', why: 'negative' });
  return [sqrtDown(Math.max(a[0], 0)), sqrtUp(a[1])];
}

/** Could [lo, hi] hold a point m·π/2 with m ≡ r (mod 4)? Never says no wrongly. */
function holdsQuarter(lo, hi, r) {
  const m0 = Math.floor(lo / PIO2_UP) - 1, m1 = Math.ceil(hi / PIO2_DOWN) + 1;
  for (let m = m0; m <= m1; m++) {
    if ((((m % 4) + 4) % 4) !== r) continue;
    const pl = m >= 0 ? mulDown(m, PIO2_DOWN) : mulDown(m, PIO2_UP);
    const ph = m >= 0 ? mulUp(m, PIO2_UP) : mulUp(m, PIO2_DOWN);
    if (pl <= hi && ph >= lo) return true;
  }
  return false;
}
function widen(x, n, up) { for (let i = 0; i < n; i++) x = up ? nextUp(x) : nextDown(x); return x; }

function wave(a, f, n, top, bottom) {
  const [lo, hi] = a;
  if (!(Math.abs(lo) <= TRIG_RANGE && Math.abs(hi) <= TRIG_RANGE) || hi - lo >= TRIG_WIDTH) return [-1, 1];
  const fl = f(lo), fh = f(hi);
  let mn = widen(Math.min(fl, fh), n, false), mx = widen(Math.max(fl, fh), n, true);
  if (holdsQuarter(lo, hi, top)) mx = 1;
  if (holdsQuarter(lo, hi, bottom)) mn = -1;
  return [Math.max(-1, mn), Math.min(1, mx)];
}
export const sin = (a) => wave(a, dsin, ULPS.sin, 1, 3);   // sin is 1 at (4k+1)·π/2 and −1 at (4k+3)·π/2
export const cos = (a) => wave(a, dcos, ULPS.cos, 0, 2);   // cos is 1 at 4k·π/2 and −1 at (4k+2)·π/2

export const hull = (a, b) => [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
export function intersect(a, b) {
  const lo = Math.max(a[0], b[0]), hi = Math.min(a[1], b[1]);
  return lo <= hi ? [lo, hi] : null;
}
export const contains = (a, x) => a[0] <= x && x <= a[1];
export const width = (a) => subUp(a[1], a[0]);
export function mid(a) {
  const [lo, hi] = a;
  if (lo === -Infinity) return hi === Infinity ? 0 : -Number.MAX_VALUE;
  if (hi === Infinity) return Number.MAX_VALUE;
  const m = 0.5 * lo + 0.5 * hi;                      // no overflow; clamped, since halving a subnormal can round
  return m < lo ? lo : m > hi ? hi : m;
}
export const mag = (a) => Math.max(Math.abs(a[0]), Math.abs(a[1]));
export const mig = (a) => (a[0] <= 0 && a[1] >= 0 ? 0 : Math.min(Math.abs(a[0]), Math.abs(a[1])));
export function sign(a) {
  if (a[0] > 0) return 1;
  if (a[1] < 0) return -1;
  if (a[0] === 0 && a[1] === 0) return 0;
  return null;
}
