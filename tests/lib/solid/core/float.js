/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * float.js — cc-solid (S2, docs/solid/HANDOFF.md § 5.4): the bits of a double, error-free transformations and directed
 * rounding. DOM-free; imports nothing.
 *
 * Every JavaScript engine computes + − × ÷ the same way (IEEE 754 binary64, round to nearest, ties to even), and since
 * ECMAScript 2025 also Math.sqrt (correctly rounded). Whatever in cc-solid must give the same bits in every engine is built
 * from those operations, and this file holds the pieces: the neighbours and gaps of doubles, the exact error of a sum and of
 * a product, and results rounded down or up, so that an enclosure always holds the true value.
 *
 *   EPS            2^-52, the gap above 1           U     2^-53, the unit roundoff: |fl(a ∘ b) − a ∘ b| ≤ U · |a ∘ b|
 *   MIN_NORMAL     2^-1022                          MAX   the largest double
 *   fromBits(hi, lo) → double · bits(x) → [hi, lo]     a double's 64 bits as two unsigned 32-bit halves
 *                                                      (every NaN reads as [0x7ff80000, 0]: its payload differs by engine)
 *   pow2(k) → 2^k exactly, for a whole k (0 below 2^-1074, Infinity above 2^1023; NaN when k is not whole)
 *   scalb(x, k) → x · 2^k for any whole k, with no power of two leaving the doubles on the way: exact whenever x · 2^k is
 *                 a double, rounded once (to nearest) where it is subnormal, ±Infinity past the largest
 *   exponent(x) → e with 2^e ≤ |x| < 2^(e+1) (subnormals included; −Infinity for 0, NaN for ±Infinity and NaN)
 *   ulp(x) → the gap between |x| and the next double away from zero (2^-1074 for 0 and subnormals, Infinity for ±Infinity)
 *   nextUp(x), nextDown(x) → the next double up / down (nextUp(MAX) = Infinity, nextUp(±0) = 2^-1074; NaN stays NaN)
 *   ulpDistance(a, b) → how many doubles separate a and b (0 for a === b and for +0 against −0; exact below 2^53)
 *   sumErr(a, b, s) → e      a + b = s + e exactly, for s = a + b (Knuth's TwoSum: any magnitudes, finite s)
 *   fastSumErr(a, b, s) → e  the same when |a| ≥ |b| (Dekker's Fast2Sum)
 *   prodErr(a, b, p) → e     a · b = p + e exactly, for p = a · b (Dekker's TwoProduct with Veltkamp's split), whenever
 *   prodExact(a, b, p)       says so: |a|, |b| ≤ 2^995 and 2^-969 ≤ |p| ≤ 2^1023 (no overflow inside the split, no
 *                            underflow in the error). Outside that, use the directed operations, which rescale first.
 *   twoSum(a, b) → [s, e] · twoProd(a, b) → [p, e]   the same as pairs, where clarity matters more than speed
 *   addDown/addUp · subDown/subUp · mulDown/mulUp · divDown/divUp · sqrtDown/sqrtUp
 *                            the result rounded toward −∞ / +∞, for every pair of doubles: down ≤ exact ≤ up, and the two
 *                            are the doubles on either side of the exact result, or both equal to it when it is a double
 *                            (operands next to MAX or subnormal included; past MAX the bounds are ±MAX and ±Infinity).
 */

const F64 = new Float64Array(1);
const U32 = new Uint32Array(F64.buffer);
const LITTLE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
const HI = LITTLE ? 1 : 0, LO = LITTLE ? 0 : 1;

export function fromBits(hi, lo) { U32[HI] = hi >>> 0; U32[LO] = lo >>> 0; return F64[0]; }
export function bits(x) {
  if (x !== x) return [0x7ff80000, 0];                   // one NaN: ECMAScript leaves a NaN's sign and payload to the engine
  F64[0] = x;
  return [U32[HI], U32[LO]];
}

export const EPS = Number.EPSILON;
export const U = EPS / 2;
export const MAX = Number.MAX_VALUE;
export const MIN_NORMAL = fromBits(0x00100000, 0);
const TINY = Number.MIN_VALUE;                         // 2^-1074
const SPLIT = 134217729;                               // 2^27 + 1, Veltkamp's splitter for 53-bit doubles
const SPLIT_SAFE = fromBits(0x7E200000, 0);             // 2^995: below it, SPLIT · x cannot overflow
const PROD_SAFE = fromBits(0x03600000, 0);              // 2^-969: above it, a product's error is a normal double
const PROD_TOP = fromBits(0x7FE00000, 0);               // 2^1023: up to it, the split's partial products (a hair above p) stay finite

export function pow2(k) {
  if (!Number.isInteger(k)) return NaN;
  if (k > 1023) return Infinity;
  if (k >= -1022) return fromBits((k + 1023) << 20, 0);
  if (k < -1074) return 0;
  const b = k + 1074;                                  // a subnormal: one mantissa bit
  return b >= 32 ? fromBits(1 << (b - 32), 0) : fromBits(0, (1 << b) >>> 0);
}

export function exponent(x) {
  F64[0] = x;
  const e = (U32[HI] >>> 20) & 0x7ff;
  if (e === 0x7ff) return NaN;
  if (e !== 0) return e - 1023;
  const hi = U32[HI] & 0xfffff, lo = U32[LO];
  if (hi === 0 && lo === 0) return -Infinity;
  return (hi !== 0 ? 63 - Math.clz32(hi) : 31 - Math.clz32(lo)) - 1074;
}

export function ulp(x) {
  F64[0] = x;
  const e = (U32[HI] >>> 20) & 0x7ff;
  if (e === 0x7ff) return x !== x ? NaN : Infinity;
  return e === 0 ? TINY : pow2(e - 1075);
}

export function nextUp(x) {
  if (x !== x || x === Infinity) return x;
  if (x === 0) return TINY;
  F64[0] = x;
  let hi = U32[HI], lo = U32[LO];
  if (x > 0) { lo = (lo + 1) >>> 0; if (lo === 0) hi = (hi + 1) >>> 0; }
  else { if (lo === 0) hi = (hi - 1) >>> 0; lo = (lo - 1) >>> 0; }
  U32[HI] = hi; U32[LO] = lo;
  return F64[0];
}
export const nextDown = (x) => -nextUp(-x);

function ordered(x) {
  F64[0] = x;
  const hi = U32[HI], lo = U32[LO];
  return hi >>> 31 ? [-(hi & 0x7fffffff), -lo] : [hi, lo];
}
export function ulpDistance(a, b) {
  if (a !== a || b !== b) return NaN;
  const [ah, al] = ordered(a), [bh, bl] = ordered(b);
  return Math.abs((ah - bh) * 4294967296 + (al - bl));
}

// ---------------------------------------------------------------------------------------------- error-free transformations

export function sumErr(a, b, s) { const bb = s - a; return (a - (s - bb)) + (b - bb); }
export function fastSumErr(a, b, s) { return b - (s - a); }
export function prodErr(a, b, p) {
  let t = SPLIT * a;
  const ah = t - (t - a), al = a - ah;
  t = SPLIT * b;
  const bh = t - (t - b), bl = b - bh;
  return ((ah * bh - p) + ah * bl + al * bh) + al * bl;
}
export function prodExact(a, b, p) {
  const ap = Math.abs(p);
  return ap >= PROD_SAFE && ap <= PROD_TOP && Math.abs(a) <= SPLIT_SAFE && Math.abs(b) <= SPLIT_SAFE;
}
export function twoSum(a, b) { const s = a + b; return [s, sumErr(a, b, s)]; }
export function twoProd(a, b) { const p = a * b; return [p, prodErr(a, b, p)]; }

// ---------------------------------------------------------------------------------------------- directed rounding

// Overflow of finite operands: the exact result is finite, so the bound on the near side is ±MAX.
const overDown = (r, finite) => (r === Infinity && finite ? MAX : r);
const overUp = (r, finite) => (r === -Infinity && finite ? -MAX : r);

export function addDown(a, b) {
  const s = a + b;
  if (s !== s) return s;
  if (s === Infinity || s === -Infinity) return overDown(s, Number.isFinite(a) && Number.isFinite(b));
  const e = sumErr(a, b, s);
  return e < 0 || e !== e ? nextDown(s) : s;
}
export function addUp(a, b) {
  const s = a + b;
  if (s !== s) return s;
  if (s === Infinity || s === -Infinity) return overUp(s, Number.isFinite(a) && Number.isFinite(b));
  const e = sumErr(a, b, s);
  return e > 0 || e !== e ? nextUp(s) : s;
}
export const subDown = (a, b) => addDown(a, -b);
export const subUp = (a, b) => addUp(a, -b);

export function scalb(x, k) {
  if (x === 0 || x !== x || x === Infinity || x === -Infinity) return x;
  const e = exponent(x), n = e + k;                    // the result is m · 2^n with m = x · 2^-e in ±[1, 2), exactly
  const m = e < -1022 ? x * pow2(60) * pow2(-e - 60) : x * pow2(-e);
  return n >= -1022 ? m * pow2(n) : m * pow2(-1000) * pow2(n + 1000);   // the one product that can round is the last
}
const signOf = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);

/**
 * The sign of the exact a · b − p, for finite non-zero a and b and a finite non-zero p = fl(a · b): −1, 0 or 1, always
 * exact. In the middle of the range prodErr gives the error itself. Outside it (an operand past 2^995, a product next
 * to MAX or below 2^-969) the operands are first brought to [1, 2) by powers of two, which is exact: a · b is then
 * (p1 + e1) · 2^K with p1 + e1 an exact product, and p · 2^-K is exact too. Their difference d = p1 − p · 2^-K is a
 * multiple of p1's last place and is not 0 only when p is subnormal; |e1| is at most half that place, so d decides when
 * it is not 0, and e1 when it is.
 */
function prodErrSign(a, b, p) {
  if (prodExact(a, b, p)) return signOf(prodErr(a, b, p));
  const ka = exponent(a), kb = exponent(b);
  const a1 = scalb(a, -ka), b1 = scalb(b, -kb), p1 = a1 * b1;
  const d = p1 - scalb(p, -(ka + kb));
  return d !== 0 ? signOf(d) : signOf(prodErr(a1, b1, p1));
}
export function mulDown(a, b) {
  const p = a * b;
  if (p !== p) return p;
  if (p === Infinity || p === -Infinity) return overDown(p, Number.isFinite(a) && Number.isFinite(b));
  if (p === 0) return a === 0 || b === 0 ? p : (a < 0) !== (b < 0) ? -TINY : 0;
  return prodErrSign(a, b, p) < 0 ? nextDown(p) : p;
}
export function mulUp(a, b) {
  const p = a * b;
  if (p !== p) return p;
  if (p === Infinity || p === -Infinity) return overUp(p, Number.isFinite(a) && Number.isFinite(b));
  if (p === 0) return a === 0 || b === 0 ? p : (a < 0) !== (b < 0) ? -0 : TINY;
  return prodErrSign(a, b, p) > 0 ? nextUp(p) : p;
}

/**
 * For a finite non-zero q = fl(a / b), a and b finite and non-zero: the sign of (a / b − q), always exact. It is the sign
 * of a − q · b, turned by the sign of b. With q and b brought to [1, 2) (exact), q · b is p1 + e1 exactly, and a scaled the
 * same way is within a factor 2 of p1 even when q is subnormal, so their difference is exact (Sterbenz).
 */
function quotErrSign(a, b, q) {
  const p = q * b;
  let r;
  if (prodExact(q, b, p)) r = (a - p) - prodErr(q, b, p);
  else {
    const kq = exponent(q), kb = exponent(b);
    const q1 = scalb(q, -kq), b1 = scalb(b, -kb), p1 = q1 * b1;
    r = (scalb(a, -(kq + kb)) - p1) - prodErr(q1, b1, p1);
  }
  if (r === 0) return 0;
  return (r > 0) === (b > 0) ? 1 : -1;
}
export function divDown(a, b) {
  const q = a / b;
  if (q !== q) return q;
  if (q === Infinity || q === -Infinity) return overDown(q, Number.isFinite(a) && Number.isFinite(b) && b !== 0);
  if (q === 0) return a === 0 || !Number.isFinite(b) ? q : (a < 0) !== (b < 0) ? -TINY : 0;
  return quotErrSign(a, b, q) < 0 ? nextDown(q) : q;
}
export function divUp(a, b) {
  const q = a / b;
  if (q !== q) return q;
  if (q === Infinity || q === -Infinity) return overUp(q, Number.isFinite(a) && Number.isFinite(b) && b !== 0);
  if (q === 0) return a === 0 || !Number.isFinite(b) ? q : (a < 0) !== (b < 0) ? -0 : TINY;
  return quotErrSign(a, b, q) > 0 ? nextUp(q) : q;
}

/** For s = fl(√a), a finite and positive: the sign of (√a − s), that of a − s², always exact (as quotErrSign). */
function sqrtErrSign(a, s) {
  const p = s * s;
  let r;
  if (prodExact(s, s, p)) r = (a - p) - prodErr(s, s, p);
  else {
    const k = exponent(s), s1 = scalb(s, -k), p1 = s1 * s1;
    r = (scalb(a, -2 * k) - p1) - prodErr(s1, s1, p1);
  }
  return signOf(r);
}
function sqrtDir(a, up) {
  const s = Math.sqrt(a);
  if (s !== s || s === 0 || s === Infinity) return s;
  const e = sqrtErrSign(a, s);
  if (up) return e > 0 ? nextUp(s) : s;
  return e < 0 ? nextDown(s) : s;
}
export const sqrtDown = (a) => sqrtDir(a, false);
export const sqrtUp = (a) => sqrtDir(a, true);
