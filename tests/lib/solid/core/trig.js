/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * trig.js — cc-solid (S2, docs/solid/HANDOFF.md § 5.5, decision D-tr): sine, cosine, arctangent, exp, log and cube root from
 * + − × ÷ and √ only, so that every engine gives the same bits. DOM-free; imports float.js only.
 *
 * ECMAScript leaves Math.sin, Math.exp and the rest "implementation-approximated": Node, Chrome, Firefox and Safari may
 * differ in the last bits, and a kernel whose decisions hang on those bits would build different solids in different
 * browsers. The suite already chose determinism for its fields (cc-field's detmath.js); cc-solid does the same, and aims at
 * the accuracy of a good libm. The boundary checker's `trig` rule keeps the rest of cc-solid off Math.sin and **.
 *
 *   PI, HALF_PI, TAU     the doubles nearest π, π/2 and 2π          DEG   π/180 (degrees → radians)
 *   sin(x) · cos(x) · sincos(x) → [sin, cos] · tan(x)
 *   atan(x) · atan2(y, x) · asin(x) · acos(x)
 *   exp(x) · log(x) · cbrt(x)
 *   ULPS                 { name: n } — each function is within n ulps of the exact value (for sin and cos: |x| ≤ 1.6e6).
 *                        Measured by tests/tools/solid against an exact BigInt reference, on random and on hard arguments.
 *                        intervals.js widens by these. Beyond 1.6e6 sin and cos are still the same bits everywhere, but
 *                        their error grows with |x| (an angle that large has no meaning in a model).
 * Special values follow ECMAScript: sin(±0) = ±0, atan2's signed zeros and quadrants, exp(−Infinity) = 0, log(0) = −Infinity,
 * log of a negative number and asin/acos outside [−1, 1] are NaN.
 *
 * Methods (textbook, written from the mathematics; the constants are exact bit patterns, checked by the tests against π and
 * ln 2 computed from Machin's formula and the atanh series in BigInt):
 *   sin, cos   Cody–Waite reduction by π/2 in four parts (three of 33 bits, so n · part is exact for n < 2^20), carried as a
 *              double-double; Taylor polynomials on [−π/4, π/4] with the low part's first-order term.
 *   atan       reduction at 7/16, 11/16, 19/16 and 39/16 to |t| ≤ 7/16 around atan ½, π/4, atan 3/2 and π/2 (each a
 *              double-double), then the Taylor series of atan.
 *   asin, acos through atan2 with an accurately formed 1 − x²; exp by k·ln 2 + r and Taylor; log by 2 atanh((m−1)/(m+1));
 *   cbrt by Newton's method with an exact last residual.
 */
import { fromBits, exponent, pow2, sumErr, prodErr } from './float.js';

export const PI = Math.PI;
export const HALF_PI = PI / 2;
export const TAU = PI * 2;
export const DEG = PI / 180;

export const ULPS = Object.freeze({ sin: 1, cos: 1, tan: 2, atan: 1, atan2: 2, asin: 2, acos: 3, exp: 1, log: 1, cbrt: 1 });

const PIO4 = PI / 4;
const PIO2_1 = fromBits(0x3FF921FB, 0x54400000);       // π/2 in four parts: 33 bits,
const PIO2_2 = fromBits(0x3DD0B461, 0x1A600000);       // 33 bits,
const PIO2_3 = fromBits(0x3BA3198A, 0x2E000000);       // 33 bits,
const PIO2_4 = fromBits(0x397B839A, 0x252049C1);       // and the rest, rounded
const TWO_OVER_PI = fromBits(0x3FE45F30, 0x6DC9C883);
const PI_LO = fromBits(0x3CA1A626, 0x33145C07);        // π − PI
const PIO2_LO = fromBits(0x3C91A626, 0x33145C07);      // π/2 − HALF_PI
const PIO4_LO = fromBits(0x3C81A626, 0x33145C07);      // π/4 − PIO4
const ATAN_HALF = fromBits(0x3FDDAC67, 0x0561BB4F), ATAN_HALF_LO = fromBits(0x3C7A2B7F, 0x222F65E2);
const ATAN_3_2 = fromBits(0x3FEF730B, 0xD281F69B), ATAN_3_2_LO = fromBits(0x3C700788, 0x7AF0CBBD);
const LN2_HI = fromBits(0x3FE62E42, 0xFEE00000);       // ln 2: 32 bits (k · LN2_HI is exact for |k| < 2^21),
const LN2_LO = fromBits(0x3DEA39EF, 0x35793C76);       // and the rest
const INV_LN2 = fromBits(0x3FF71547, 0x652B82FE);
const FAST_LIMIT = 1647099;                            // below 2^19 π: n = round(2x/π) ≤ 2^20, so n · PIO2_k is exact
const THREE_PIO4 = PIO2_LO + PIO4_LO + HALF_PI + PIO4;

// Taylor coefficients, each 1/n! correctly rounded (n! is exact in a double up to 22!)
const FACT = [1];
for (let n = 1; n <= 22; n++) FACT.push(FACT[n - 1] * n);
const S3 = -1 / FACT[3], S5 = 1 / FACT[5], S7 = -1 / FACT[7], S9 = 1 / FACT[9], S11 = -1 / FACT[11], S13 = 1 / FACT[13],
  S15 = -1 / FACT[15], S17 = 1 / FACT[17];
const C4 = 1 / FACT[4], C6 = -1 / FACT[6], C8 = 1 / FACT[8], C10 = -1 / FACT[10], C12 = 1 / FACT[12], C14 = -1 / FACT[14],
  C16 = 1 / FACT[16];
const E = [];                                          // E[k] = 1/k!, k = 2 … 14 (exp)
for (let k = 2; k <= 14; k++) E[k] = 1 / FACT[k];
const A = [];                                          // A[k] = (−1)^k / (2k+1), k = 1 … 25 (atan)
for (let k = 1; k <= 25; k++) A[k] = (k % 2 ? -1 : 1) / (2 * k + 1);
const L = [];                                          // L[k] = 2 / (2k+1), k = 1 … 12 (log: the atanh series)
for (let k = 1; k <= 12; k++) L[k] = 2 / (2 * k + 1);

// ------------------------------------------------------------------------------------------------ sin, cos

let RH = 0, RL = 0;                                    // the reduced argument, as hi + lo

/** x → n (whole) with x = n·π/2 + RH + RL, |RH + RL| ≤ π/4 (a hair more where n's rounding lands it). */
function reduce(x) {
  const n = Math.floor(x * TWO_OVER_PI + 0.5);
  let s1, e1, s2, e2;
  if (Math.abs(x) <= FAST_LIMIT) {
    const t = x - n * PIO2_1;                          // exact: n·PIO2_1 is exact and close to x
    const b = n * PIO2_2, c = n * PIO2_3;              // exact
    s1 = t - b; e1 = sumErr(t, -b, s1);
    s2 = s1 - c; e2 = sumErr(s1, -c, s2);
    const lo = (e1 + e2) - n * PIO2_4;
    RH = s2 + lo; RL = sumErr(s2, lo, RH);
    return n;
  }
  // past FAST_LIMIT the products are no longer exact: carry their errors too (still + − × ÷ only)
  let p = n * PIO2_1;
  const t = x - p;
  let lo = -prodErr(n, PIO2_1, p);
  p = n * PIO2_2; s1 = t - p; e1 = sumErr(t, -p, s1); lo += e1 - prodErr(n, PIO2_2, p);
  p = n * PIO2_3; s2 = s1 - p; e2 = sumErr(s1, -p, s2); lo += e2 - prodErr(n, PIO2_3, p);
  lo -= n * PIO2_4;
  RH = s2 + lo; RL = sumErr(s2, lo, RH);
  return n;
}

function sinK(h, l) {
  const z = h * h;
  const p = z * (S3 + z * (S5 + z * (S7 + z * (S9 + z * (S11 + z * (S13 + z * (S15 + z * S17)))))));
  return h + (h * p + l * (1 - 0.5 * z));
}
function cosK(h, l) {
  const z = h * h;
  const ez = prodErr(h, h, z);                         // h² = z + ez exactly
  const q = z * z * (C4 + z * (C6 + z * (C8 + z * (C10 + z * (C12 + z * (C14 + z * C16))))));
  const hz = 0.5 * z;
  const w = 1 - hz;
  return w + ((((1 - w) - hz) - 0.5 * ez) + (q - h * l));
}

export function sin(x) {
  if (x !== x || x === Infinity || x === -Infinity) return NaN;
  if (Math.abs(x) <= PIO4) return x === 0 ? x : sinK(x, 0);
  const q = reduce(x) & 3;
  return q === 0 ? sinK(RH, RL) : q === 1 ? cosK(RH, RL) : q === 2 ? -sinK(RH, RL) : -cosK(RH, RL);
}
export function cos(x) {
  if (x !== x || x === Infinity || x === -Infinity) return NaN;
  if (Math.abs(x) <= PIO4) return cosK(x, 0);
  const q = reduce(x) & 3;
  return q === 0 ? cosK(RH, RL) : q === 1 ? -sinK(RH, RL) : q === 2 ? -cosK(RH, RL) : sinK(RH, RL);
}
export function sincos(x) {
  if (x !== x || x === Infinity || x === -Infinity) return [NaN, NaN];
  if (Math.abs(x) <= PIO4) return [x === 0 ? x : sinK(x, 0), cosK(x, 0)];
  const q = reduce(x) & 3;
  const s = sinK(RH, RL), c = cosK(RH, RL);
  return q === 0 ? [s, c] : q === 1 ? [c, -s] : q === 2 ? [-s, -c] : [-c, s];
}
export function tan(x) {
  const [s, c] = sincos(x);
  return s / c;
}

// ------------------------------------------------------------------------------------------------ atan, atan2, asin, acos

function atanK(t) {                                    // |t| ≤ 7/16: t + t³·(A1 + t²·(A2 + …))
  const z = t * t;
  let s = A[25];
  for (let k = 24; k >= 1; k--) s = s * z + A[k];
  return t + t * (z * s);
}
/** atan of |x| (x not NaN), in [0, π/2]. */
function atanAbs(ax) {
  if (ax < 0.4375) return atanK(ax);
  if (ax < 0.6875) return ATAN_HALF + (atanK((2 * ax - 1) / (2 + ax)) + ATAN_HALF_LO);
  if (ax < 1.1875) return PIO4 + (atanK((ax - 1) / (ax + 1)) + PIO4_LO);
  if (ax < 2.4375) return ATAN_3_2 + (atanK((ax - 1.5) / (1 + 1.5 * ax)) + ATAN_3_2_LO);
  if (ax === Infinity) return HALF_PI;
  return HALF_PI + (atanK(-1 / ax) + PIO2_LO);
}
export function atan(x) {
  if (x !== x) return NaN;
  const r = atanAbs(Math.abs(x));
  return x < 0 || (x === 0 && 1 / x < 0) ? -r : r;
}
export function atan2(y, x) {
  if (x !== x || y !== y) return NaN;
  const negY = y < 0 || (y === 0 && 1 / y < 0);
  const negX = x < 0 || (x === 0 && 1 / x < 0);
  const ay = Math.abs(y), ax = Math.abs(x);
  let r;
  if (ay === 0) r = negX ? PI : 0;
  else if (ax === Infinity) r = ay === Infinity ? (negX ? THREE_PIO4 : PIO4) : negX ? PI : 0;
  else if (ay === Infinity || ax === 0) r = HALF_PI;
  else {
    const ex = exponent(ay) - exponent(ax);
    if (ex > 60) r = HALF_PI + PIO2_LO;                // atan(huge) = π/2 to the last bit
    else if (ex < -60 && !negX) r = ay / ax;           // atan(tiny) = tiny
    else {
      r = atanAbs(ay / ax);
      if (negX) r = PI - (r - PI_LO);
      return negY ? -r : r;
    }
    if (negX) r = PI - (r - PI_LO);
  }
  return negY ? -r : r;
}
export function asin(x) {
  if (x !== x || x > 1 || x < -1) return NaN;
  const ax = Math.abs(x);
  let d;                                               // 1 − x², formed accurately
  if (ax < 0.5) { const p = ax * ax; d = (1 - p) - prodErr(ax, ax, p); }
  else d = (1 - ax) * (1 + ax);                        // 1 − ax is exact here
  return atan2(x, Math.sqrt(d));
}
export function acos(x) {
  if (x !== x || x > 1 || x < -1) return NaN;
  return 2 * atan2(Math.sqrt(1 - x), Math.sqrt(1 + x));
}

// ------------------------------------------------------------------------------------------------ exp, log, cbrt

export function exp(x) {
  if (x !== x) return NaN;
  if (x > 709.8) return Infinity;
  if (x < -745.2) return 0;
  const k = Math.floor(x * INV_LN2 + 0.5);
  const hi = x - k * LN2_HI;                           // exact
  const lo = k * LN2_LO;
  const r = hi - lo;
  const rl = sumErr(hi, -lo, r);                       // hi − lo = r + rl exactly
  let s = E[14];
  for (let j = 13; j >= 2; j--) s = s * r + E[j];
  const p = r + (r * r) * s;                           // e^r − 1
  const y = 1 + (p + rl * (1 + p));
  if (k > 1020) return y * pow2(k - 60) * pow2(60);
  if (k < -1020) return (y * pow2(k + 60)) * pow2(-60); // one rounding, into the subnormal range
  return y * pow2(k);
}

export function log(x) {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  let e = exponent(x);
  let m = e < -1022 ? x * pow2(-e - 60) * pow2(60) : x * pow2(-e);   // m in [1, 2), exactly
  if (m > Math.SQRT2) { m *= 0.5; e += 1; }
  const f = m - 1;                                     // exact
  const s = f / (2 + f);
  const z = s * s;
  let R = L[12];
  for (let k = 11; k >= 1; k--) R = R * z + L[k];
  R *= z;                                              // log(1+f) = f − f²/2 + s·(f²/2 + R)
  const hfsq = 0.5 * f * f;
  return e * LN2_HI - ((hfsq - (s * (hfsq + R) + e * LN2_LO)) - f);
}

export function cbrt(x) {
  if (x === 0 || x !== x || x === Infinity || x === -Infinity) return x;
  const a = Math.abs(x);
  const q = Math.floor(exponent(a) / 3);
  const m = q < -340 ? a * pow2(-3 * q - 60) * pow2(60) : a * pow2(-3 * q);   // m in [1, 8), exactly
  let y = 1 + (m - 1) * 0.142857;                      // the chord from (1, 1) to (8, 2)
  for (let i = 0; i < 6; i++) y -= (y * y * y - m) / (3 * y * y);
  const y2 = y * y, e2 = prodErr(y, y, y2);            // the last residual y³ − m, formed exactly
  const y3 = y * y2, e3 = prodErr(y, y2, y3);
  const res = ((y3 - m) + e3) + y * e2;
  y -= res / (3 * y2);
  const r = y * pow2(q);
  return x < 0 ? -r : r;
}
