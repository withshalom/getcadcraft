/* SPDX-License-Identifier: Apache-2.0 */
/**
 * bigref.mjs — exact references for cc-solid's tests (S2). Test-only: the kernel itself never uses BigInt.
 *
 * Elementary functions in BigInt fixed point (F fractional bits), written from the textbook series: Machin's formula for π,
 * the Taylor series of sin, cos, exp and atan, the atanh series for ln 2 and log, and integer square and cube roots by
 * Newton's method. Good to far below 2^-250, which makes the error of core/trig.js measurable in units in the last place
 * (ulps) on every argument the tests try.
 *
 *   F, ONE                      fractional bits, and 1 in fixed point
 *   decompose(x) → { m, e }     a finite double as m · 2^e exactly (m a BigInt)
 *   fix(x)                      a double in fixed point (exact for |x| ≥ 2^-F·2^52)
 *   PI, PIO2, LN2               the constants in fixed point
 *   sinRef(x), cosRef(x), atanRef(x), atan2Ref(y, x), asinRef(x), acosRef(x), logRef(x), cbrtRef(x)   → fixed point
 *   expRef(x) → { m, k }        exp(x) = m · 2^k, m in fixed point (so the reference needs no huge or tiny range)
 *   ulpsOff(y, ref)             |y − ref| in units in the last place of y (a Number)
 *   nearestDouble(V)            the double nearest to the fixed-point value V (ties to even)
 *   topBits(V, b)               the double holding V's first b significant bits (truncated)
 *   bitsOf(x) → [hi, lo]        a double's two 32-bit halves
 */
export const F = 320n;
export const ONE = 1n << F;
const dv = new DataView(new ArrayBuffer(8));

export function bitsOf(x) { dv.setFloat64(0, x); return [dv.getUint32(0), dv.getUint32(4)]; }
const fromBits = (hi, lo) => { dv.setUint32(0, hi >>> 0); dv.setUint32(4, lo >>> 0); return dv.getFloat64(0); };

export function decompose(x) {
  if (!Number.isFinite(x)) throw new Error('decompose: not finite');
  const [hi, lo] = bitsOf(x);
  const neg = hi >>> 31 === 1;
  const ex = (hi >>> 20) & 0x7ff;
  let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e;
  if (ex === 0) e = -1074; else { m |= 1n << 52n; e = ex - 1075; }
  return { m: neg ? -m : m, e };
}
export function fix(x) {
  const { m, e } = decompose(x);
  const s = BigInt(e) + F;
  return s >= 0n ? m << s : m / (1n << -s);
}
const bitLength = (n) => (n < 0n ? -n : n).toString(2).length;
const mul = (a, b) => (a * b) >> F;
const div = (a, b) => (a << F) / b;
const fdiv = (a, b) => { const q = a / b; return a % b !== 0n && (a < 0n) !== (b < 0n) ? q - 1n : q; };

export function isqrt(n) {
  if (n < 0n) throw new Error('isqrt of a negative');
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(bitLength(n) / 2));
  for (;;) { const y = (x + n / x) >> 1n; if (y >= x) return x; x = y; }
}
export function icbrt(n) {
  if (n < 0n) return -icbrt(-n);
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(bitLength(n) / 3) + 1);
  for (;;) { const y = (2n * x + n / (x * x)) / 3n; if (y >= x) break; x = y; }
  while (x * x * x > n) x--;
  while ((x + 1n) * (x + 1n) * (x + 1n) <= n) x++;
  return x;
}
const sqrtFix = (a) => isqrt(a << F);

function atanSeries(x) {   // Σ (−1)^k x^(2k+1) / (2k+1), |x| < 1
  const x2 = mul(x, x);
  let sum = 0n, p = x, k = 0n;
  while (p !== 0n) { const t = p / (2n * k + 1n); sum += k % 2n === 0n ? t : -t; p = mul(p, x2); k++; }
  return sum;
}
function atanhSeries(x) {  // Σ x^(2k+1) / (2k+1), |x| < 1
  const x2 = mul(x, x);
  let sum = 0n, p = x, k = 0n;
  while (p !== 0n) { sum += p / (2n * k + 1n); p = mul(p, x2); k++; }
  return sum;
}
export const PI = 16n * atanSeries(ONE / 5n) - 4n * atanSeries(ONE / 239n);
export const PIO2 = PI >> 1n;
export const LN2 = 2n * atanhSeries(ONE / 3n);

function atanFix(x) {
  if (x < 0n) return -atanFix(-x);
  if (x > ONE) return PIO2 - atanFix(div(ONE, x));
  let k = 0n;
  while (x > ONE >> 3n) { x = div(x, ONE + sqrtFix(ONE + mul(x, x))); k++; }   // atan x = 2 atan(x / (1 + √(1 + x²)))
  return atanSeries(x) << k;
}
function sinTaylor(r) { const r2 = mul(r, r); let s = 0n, t = r, k = 1n; while (t !== 0n) { s += t; t = -mul(t, r2) / ((k + 1n) * (k + 2n)); k += 2n; } return s; }
function cosTaylor(r) { const r2 = mul(r, r); let s = 0n, t = ONE, k = 0n; while (t !== 0n) { s += t; t = -mul(t, r2) / ((k + 1n) * (k + 2n)); k += 2n; } return s; }
function sincosFix(X) {
  const n = fdiv(2n * X + PIO2, 2n * PIO2);
  const r = X - n * PIO2;
  const s = sinTaylor(r), c = cosTaylor(r);
  switch (Number(((n % 4n) + 4n) % 4n)) {
    case 0: return [s, c];
    case 1: return [c, -s];
    case 2: return [-s, -c];
    default: return [-c, s];
  }
}
// sin and cos of ANY finite double, however large. sincosFix reduces with π to F bits, which is too few past about 2^200;
// this one reduces exactly with π to 1500 bits (Machin again), then uses the same series.
const GB = 1500n;
let PIO2_BIG = null;
function atanInvBig(q) {     // atan(1/q) to GB bits
  let t = (1n << GB) / q, s = 0n, k = 0n;
  const q2 = q * q;
  while (t !== 0n) { const u = t / (2n * k + 1n); s += k % 2n === 0n ? u : -u; t /= q2; k++; }
  return s;
}
export function piBig() { return 16n * atanInvBig(5n) - 4n * atanInvBig(239n); }   // π · 2^1500, to a few units
export const PI_BIG_BITS = GB;
export function sincosRefAny(x) {
  if (PIO2_BIG === null) PIO2_BIG = piBig() >> 1n;
  const { m, e } = decompose(x);
  const X = m << (BigInt(e) + GB);                       // exact: e ≥ −1074
  const n = fdiv(2n * X + PIO2_BIG, 2n * PIO2_BIG);
  const r = (X - n * PIO2_BIG) >> (GB - F);
  const s = sinTaylor(r), c = cosTaylor(r);
  switch (Number(((n % 4n) + 4n) % 4n)) {
    case 0: return [s, c];
    case 1: return [c, -s];
    case 2: return [-s, -c];
    default: return [-c, s];
  }
}
export const sinRef = (x) => sincosFix(fix(x))[0];
export const cosRef = (x) => sincosFix(fix(x))[1];
export const atanRef = (x) => atanFix(fix(x));
export function atan2Ref(y, x) {
  const Y = fix(y), X = fix(x);
  if (X > 0n) return atanFix(div(Y, X));
  if (X < 0n) return Y >= 0n ? atanFix(div(Y, X)) + PI : atanFix(div(Y, X)) - PI;
  return Y > 0n ? PIO2 : -PIO2;
}
export function asinRef(x) { const X = fix(x); return atanFix(div(X, sqrtFix(ONE - mul(X, X)))); }
export function acosRef(x) { return PIO2 - asinRef(x); }
export function expRef(x) {
  const X = fix(x);
  const k = fdiv(2n * X + LN2, 2n * LN2);
  const r = X - k * LN2;
  let s = 0n, t = ONE, n = 1n;
  while (t !== 0n) { s += t; t = mul(t, r) / n; n++; }
  return { m: s, k: Number(k) };
}
export function logRef(x) {
  const { m, e } = decompose(x);
  if (m <= 0n) throw new Error('logRef needs x > 0');
  const L = bitLength(m) - 1;
  const mant = m << (F - BigInt(L));                     // in [1, 2)
  const E = BigInt(e + L);
  return E * LN2 + 2n * atanhSeries(div(mant - ONE, mant + ONE));
}
export function cbrtRef(x) {
  const { m, e } = decompose(x);
  const shift = BigInt(e) + 3n * F;
  if (shift < 0n) throw new Error('cbrtRef: x too small for this reference');
  return icbrt(m << shift);
}

/** |y − ref| in units in the last place of y (y a normal double, |y| ≥ 2^-(F-60)). */
export function ulpsOff(y, ref) {
  const ex = (bitsOf(y)[0] >>> 20) & 0x7ff;
  const ulpExp = ex === 0 ? -1074 : ex - 1075;           // ulp(y) = 2^ulpExp
  const s = BigInt(ulpExp) + F;
  if (s < 0n) throw new Error('ulpsOff: y too small for this reference');
  const ulp = 1n << s;
  let d = fix(y) - ref;
  if (d < 0n) d = -d;
  return Number((d << 20n) / ulp) / 1048576;
}

/** The double nearest to V (ties to even), for |V| in the normal range. */
export function nearestDouble(V) {
  if (V === 0n) return 0;
  const neg = V < 0n;
  let a = neg ? -V : V;
  const L = bitLength(a);
  let shift = BigInt(L - 53);
  let T;
  if (shift > 0n) {
    T = a >> shift;
    const rem = a - (T << shift), half = 1n << (shift - 1n);
    if (rem > half || (rem === half && (T & 1n) === 1n)) T++;
    if (bitLength(T) > 53) { T >>= 1n; shift++; }
  } else { T = a << -shift; }
  const ex = Number(shift) + 52 - Number(F);               // value = T · 2^(shift − F), T in [2^52, 2^53)
  const biased = ex + 1023;
  if (biased <= 0 || biased >= 2047) throw new Error('nearestDouble: out of the normal range');
  const frac = T - (1n << 52n);
  return (neg ? -1 : 1) * fromBits((biased << 20) | Number(frac >> 32n), Number(frac & 0xffffffffn));
}
/** The double holding V's first b significant bits (truncated toward zero), V > 0. */
export function topBits(V, b) {
  const L = bitLength(V);
  const shift = BigInt(L - b);
  const T = V >> shift;
  return nearestDouble(T << shift);
}
