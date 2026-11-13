/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * exact.js — cc-solid (docs/solid/HANDOFF.md § 5.3): exact answers about small sums of products of doubles. DOM-free;
 * imports errors.js and float.js only.
 *
 * Some decisions cannot be left to rounding: whether a discriminant is positive, zero or negative decides how many roots
 * exist, and at an exact zero the root itself is a quotient that cancels to nothing in doubles. A double is a whole number
 * times a power of two, so a sum of products of doubles is one too, and whole-number (BigInt) arithmetic gives it with no
 * rounding at all, for every finite double, subnormal or next to the largest. That costs microseconds, so callers ask here
 * only when a floating-point estimate with an error bound cannot tell (math/roots.js); math/predicates.js keeps its own
 * faster expansions for its four determinants.
 *
 * A "sum" is an array of terms; a term is [k, x1, x2, …]: the whole number k (|k| < 2^53) times the doubles x1 · x2 · …
 *
 *   sumSign(sum) → −1 | 0 | 1       the sign of the exact value
 *   sumRatio(num, den) → double     the exact num / den, rounded to nearest (ties to even); ±Infinity past the largest
 *                                   double; within one double of exact where the result is subnormal
 * A term that holds NaN or ±Infinity, or a k that is not a whole number: solid.err.bad_input { name: 'sum', why:
 * 'not_finite' }. A den that is exactly 0: solid.err.bad_input { name: 'den', why: 'zero' }.
 */
import { fail } from './errors.js';
import { bits, scalb } from './float.js';

/** x = m · 2^e exactly, m a whole number (BigInt). */
function parts(x) {
  const [hi, lo] = bits(x), ex = (hi >>> 20) & 0x7ff;
  const frac = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  const m = ex === 0 ? frac : frac | (1n << 52n);
  return [hi >>> 31 ? -m : m, ex === 0 ? -1074 : ex - 1075];
}

/** The exact value of a sum as N · 2^E. */
function total(sum) {
  if (!Array.isArray(sum)) fail('solid.err.bad_input', { name: 'sum', why: 'not_finite' });
  const ns = [], es = [];
  let E = Infinity;
  for (const term of sum) {
    if (!Array.isArray(term) || !Number.isInteger(term[0])) fail('solid.err.bad_input', { name: 'sum', why: 'not_finite' });
    let n = BigInt(term[0]), e = 0;
    for (let i = 1; i < term.length; i++) {
      const x = term[i];
      if (typeof x !== 'number' || !Number.isFinite(x)) fail('solid.err.bad_input', { name: 'sum', why: 'not_finite' });
      const [m, ex] = parts(x);
      n *= m; e += ex;
    }
    if (n !== 0n) { ns.push(n); es.push(e); if (e < E) E = e; }
  }
  let N = 0n;
  for (let i = 0; i < ns.length; i++) N += ns[i] << BigInt(es[i] - E);
  return [N, N === 0n ? 0 : E];
}

export function sumSign(sum) {
  const N = total(sum)[0];
  return N > 0n ? 1 : N < 0n ? -1 : 0;
}

const length = (n) => n.toString(2).length;

export function sumRatio(num, den) {
  const [N1, E1] = total(num), [N2, E2] = total(den);
  if (N2 === 0n) fail('solid.err.bad_input', { name: 'den', why: 'zero' });
  if (N1 === 0n) return 0;
  const neg = (N1 < 0n) !== (N2 < 0n), a = N1 < 0n ? -N1 : N1, b = N2 < 0n ? -N2 : N2;
  // The quotient as a whole number of 66 or 67 bits times a power of two, its last bit set when anything was cut off:
  // then the one rounding below (BigInt to Number: to nearest, ties to even, by the language) is the only rounding.
  const s = Math.max(0, 66 + length(b) - length(a)), top = a << BigInt(s);
  let q = top / b, cut = q * b !== top, k = E1 - E2 - s;
  const extra = length(q) - 67;
  if (extra > 0) { if ((q & ((1n << BigInt(extra)) - 1n)) !== 0n) cut = true; q >>= BigInt(extra); k += extra; }
  if (cut) q |= 1n;
  const r = scalb(Number(q), k);
  return neg ? -r : r;
}
