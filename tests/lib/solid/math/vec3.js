/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * vec3.js — cc-solid (S2, docs/solid/HANDOFF.md § 5.6): points and vectors in 3D as plain [x, y, z] arrays. DOM-free; imports
 * the core only.
 *
 * Every function returns a new array and leaves its arguments alone. Lengths are millimetres, as everywhere in cc-solid.
 * cc-nurbs' vec.js does the same for arrays of any length; these are the 3D versions with the care a kernel needs: lengths
 * that cannot overflow or underflow, a unit vector that refuses a zero vector instead of returning NaN, and angles from
 * atan2, which stay accurate for tiny angles.
 *
 *   add(a, b) · sub(a, b) · scale(a, s) · neg(a) · madd(a, s, b) (a + s·b) · lerp(a, b, t) · mid(a, b)
 *   dot(a, b) · cross(a, b) · triple(a, b, c) (a · (b × c), the signed volume)
 *   len(a) · len2(a) · dist(a, b) · dist2(a, b)   len and dist rescale first when the squares would overflow or underflow
 *   unit(a) → a / |a|        a zero or non-finite vector → solid.err.bad_input { name: 'vector', why: 'zero_length' }
 *   perp(a) → a unit vector at right angles to a: a crossed with the axis it is least along (the same one every time)
 *   angle(a, b) → 0 … π      atan2(|a × b|, a · b); 0 when either is the zero vector
 *   near(a, b, d) → |a − b| ≤ d (d from the Tolerance, e.g. tol.lin) · isVec3(x) → three finite numbers
 */
import { fail } from '../core/errors.js';
import { pow2, exponent } from '../core/float.js';
import { atan2 } from '../core/trig.js';

const SQ_MIN = pow2(-1000);                            // below this a sum of squares has lost precision to underflow

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const neg = (a) => [-a[0], -a[1], -a[2]];
export const madd = (a, s, b) => [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2]];
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mid = (a, b) => [0.5 * a[0] + 0.5 * b[0], 0.5 * a[1] + 0.5 * b[1], 0.5 * a[2] + 0.5 * b[2]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const triple = (a, b, c) => dot(a, cross(b, c));
export const len2 = (a) => a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
export const dist2 = (a, b) => len2(sub(a, b));

function norm3(x, y, z) {
  const s = x * x + y * y + z * z;
  if (s < Infinity && s >= SQ_MIN) return Math.sqrt(s);
  if (s !== s) return NaN;
  const m = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
  if (m === 0 || m === Infinity) return m;
  const k = exponent(m), q = pow2(-k);                 // exact rescaling by a power of two
  const u = x * q, v = y * q, w = z * q;
  return Math.sqrt(u * u + v * v + w * w) * pow2(k);
}
export const len = (a) => norm3(a[0], a[1], a[2]);
export const dist = (a, b) => norm3(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function unit(a) {
  const l = len(a);
  if (!(l > 0) || l === Infinity) fail('solid.err.bad_input', { name: 'vector', why: 'zero_length' });
  return [a[0] / l, a[1] / l, a[2] / l];
}
export function perp(a) {
  const ax = Math.abs(a[0]), ay = Math.abs(a[1]), az = Math.abs(a[2]);
  const o = ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1];
  return unit(cross(a, o));
}
export function angle(a, b) {
  if (len(a) === 0 || len(b) === 0) return 0;
  return atan2(len(cross(a, b)), dot(a, b));
}
export const near = (a, b, d) => dist(a, b) <= d;
export const isVec3 = (x) => Array.isArray(x) && x.length === 3 && x.every((v) => typeof v === 'number' && Number.isFinite(v));
