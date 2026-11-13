/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * mat4.js — cc-solid (S2, docs/solid/HANDOFF.md § 5.3): affine transforms as 4×4 matrices, row-major, as cc-nurbs keeps them.
 * DOM-free; imports the core and vec3.js.
 *
 * A matrix is 16 numbers, row by row: m[0 … 3] is the first row, and m[3], m[7], m[11] hold the translation. cc-nurbs' xform
 * reads matrices this way, so a cc-solid matrix goes straight to curve.transform and surface.transform. The last row is
 * [0, 0, 0, 1]: rigid motions, scalings, mirrors and shears, never projections. three.js and ModelCraft keep the same matrix
 * column-major and (ModelCraft) in metres: fromColumnMajor / toColumnMajor change the order, convertUnits the unit.
 *
 *   IDENTITY (frozen) · identity()
 *   translation(v) · scaling(s | [sx, sy, sz]) · rotation(axis, angle) (right-handed, about a line through the origin)
 *   rotationAbout(point, axis, angle) · fromBasis(origin, x, y, z) (columns x, y, z, then the origin)
 *   mul(a, b) → a · b (b acts first) · apply(m, p) (a point) · applyDir(m, v) (a direction: no translation)
 *   applyNormal(m, n) → (L⁻¹)ᵀ n for the 3×3 part L (the normal of the moved surface, not made unit)
 *   det3(m) (of L) · invert(m) · isAffine(m) (16 finite numbers, last row exactly 0 0 0 1)
 *   isRigid(m, tol) (L orthonormal and right-handed within tol.ang, a dimensionless bound)
 *   fromColumnMajor(a) · toColumnMajor(m) · convertUnits(m, f) (f = 1000: a ModelCraft matrix in metres → mm)
 * invert and applyNormal refuse a 3×3 part that is singular, or so close to it that its ∞-norm condition number passes
 * 1 / (16 EPS) ≈ 2.8e14, with solid.err.singular { why: 'matrix', rcond }. The condition number is not the size: det3,
 * invert and applyNormal first bring the 3×3 part to scale 1 by a power of two, so a matrix in any unit (a rotation times
 * 1e-300 as much as times 1e300) is treated as at scale 1. det3 is 0 only for a singular part: a determinant below the
 * smallest double comes back as ±2^-1074, one past the largest as ±Infinity. An inverse that does not fit in doubles is
 * solid.err.bad_input { name: 'matrix', why: 'overflow' }. The builders, invert, applyNormal and the converters check their
 * arguments (solid.err.bad_input { name, why }); mul, apply, applyDir and det3 are hot paths and trust theirs.
 */
import { fail } from '../core/errors.js';
import { EPS, exponent, pow2, scalb } from '../core/float.js';
import { sincos } from '../core/trig.js';
import { resolveTol } from '../core/tol.js';
import { unit, isVec3 } from './vec3.js';

const RCOND_MIN = 16 * EPS;

export const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
export const identity = () => IDENTITY.slice();

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isMat = (m) => Array.isArray(m) && m.length === 16 && m.every(isNum);
export const isAffine = (m) => isMat(m) && m[12] === 0 && m[13] === 0 && m[14] === 0 && m[15] === 1;
function needMat(m, name = 'matrix') {
  if (!isMat(m)) fail('solid.err.bad_input', { name, why: 'not_a_matrix' });
  if (!(m[12] === 0 && m[13] === 0 && m[14] === 0 && m[15] === 1)) fail('solid.err.bad_input', { name, why: 'not_affine' });
}
function needVec(v, name) { if (!isVec3(v)) fail('solid.err.bad_input', { name, why: 'not_a_vector' }); }

export function translation(v) {
  needVec(v, 'v');
  return [1, 0, 0, v[0], 0, 1, 0, v[1], 0, 0, 1, v[2], 0, 0, 0, 1];
}
export function scaling(s) {
  const [x, y, z] = typeof s === 'number' ? [s, s, s] : Array.isArray(s) ? s : [];
  if (!isVec3([x, y, z])) fail('solid.err.bad_input', { name: 's', why: 'not_a_scale' });
  return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
}
export function rotation(axis, angle) {
  needVec(axis, 'axis');
  if (!isNum(angle)) fail('solid.err.bad_input', { name: 'angle', why: 'not_a_number' });
  const [x, y, z] = unit(axis);
  const [s, c] = sincos(angle);
  const t = 1 - c;
  return [
    t * x * x + c, t * x * y - s * z, t * x * z + s * y, 0,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x, 0,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c, 0,
    0, 0, 0, 1,
  ];
}
export function rotationAbout(point, axis, angle) {
  needVec(point, 'point');
  return mul(translation(point), mul(rotation(axis, angle), translation([-point[0], -point[1], -point[2]])));
}
export function fromBasis(o, x, y, z) {
  needVec(o, 'origin'); needVec(x, 'x'); needVec(y, 'y'); needVec(z, 'z');
  return [x[0], y[0], z[0], o[0], x[1], y[1], z[1], o[1], x[2], y[2], z[2], o[2], 0, 0, 0, 1];
}

export function mul(a, b) {
  const r = new Array(16);
  for (let i = 0; i < 3; i++) {
    const a0 = a[4 * i], a1 = a[4 * i + 1], a2 = a[4 * i + 2], a3 = a[4 * i + 3];
    r[4 * i] = a0 * b[0] + a1 * b[4] + a2 * b[8];
    r[4 * i + 1] = a0 * b[1] + a1 * b[5] + a2 * b[9];
    r[4 * i + 2] = a0 * b[2] + a1 * b[6] + a2 * b[10];
    r[4 * i + 3] = a0 * b[3] + a1 * b[7] + a2 * b[11] + a3;
  }
  r[12] = 0; r[13] = 0; r[14] = 0; r[15] = 1;
  return r;
}
export const apply = (m, p) => [
  m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
  m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
  m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
];
export const applyDir = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[4] * v[0] + m[5] * v[1] + m[6] * v[2],
  m[8] * v[0] + m[9] * v[1] + m[10] * v[2],
];

// The 3×3 part with its largest |entry| brought into [1, 2) by a power of two (exact, but for entries more than 2^1000
// below the largest, which cannot matter): products of entries then neither overflow nor underflow, whatever the unit.
function scaled3(m) {
  let top = 0;
  for (const k of PART) { const v = Math.abs(m[k]); if (v > top) top = v; }
  if (top === 0) return null;
  const e = exponent(top), f = e >= -1022 && e <= 1022 ? pow2(-e) : 0;
  return { e, a: PART.map((k) => (f !== 0 ? m[k] * f : scalb(m[k], -e))) };
}
const PART = Object.freeze([0, 1, 2, 4, 5, 6, 8, 9, 10]);
const det9 = (a) => a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);

export function det3(m) {
  const s = scaled3(m);
  if (s === null) return 0;
  const d = det9(s.a), r = scalb(d, 3 * s.e);
  return r === 0 && d !== 0 ? (d > 0 ? Number.MIN_VALUE : -Number.MIN_VALUE) : r;   // 0 is kept for singular matrices
}

/** The inverse of L (the 3×3 part, as 9 numbers row by row), refused when L is singular or nearly so. */
function inverse3(m) {
  const s = scaled3(m);
  if (s === null) fail('solid.err.singular', { why: 'matrix', rcond: 0 });
  const a = s.a;
  const c00 = a[4] * a[8] - a[5] * a[7], c01 = a[5] * a[6] - a[3] * a[8], c02 = a[3] * a[7] - a[4] * a[6];
  const det = a[0] * c00 + a[1] * c01 + a[2] * c02;
  const inv = [
    c00, a[2] * a[7] - a[1] * a[8], a[1] * a[5] - a[2] * a[4],
    c01, a[0] * a[8] - a[2] * a[6], a[2] * a[3] - a[0] * a[5],
    c02, a[1] * a[6] - a[0] * a[7], a[0] * a[4] - a[1] * a[3],
  ].map((v) => v / det);
  const rowSum = (r, i) => Math.abs(r[i]) + Math.abs(r[i + 1]) + Math.abs(r[i + 2]);
  const nL = Math.max(rowSum(a, 0), rowSum(a, 3), rowSum(a, 6));
  const nI = Math.max(rowSum(inv, 0), rowSum(inv, 3), rowSum(inv, 6));
  const rcond = 1 / (nL * nI);                         // of the scaled part: the condition number does not depend on the unit
  if (!(det !== 0 && Number.isFinite(nI) && rcond >= RCOND_MIN)) fail('solid.err.singular', { why: 'matrix', rcond: Number.isFinite(rcond) ? rcond : 0 });
  return inv.map((v) => scalb(v, -s.e));               // may be ±Infinity for a very small matrix: the callers refuse that
}
/** v, or a refusal when the inverse of a very small matrix does not fit in doubles. */
function finite(v) {
  for (const x of v) if (!Number.isFinite(x)) fail('solid.err.bad_input', { name: 'matrix', why: 'overflow' });
  return v;
}
export function invert(m) {
  needMat(m);
  const i = inverse3(m);
  const t = [m[3], m[7], m[11]];
  return finite([
    i[0], i[1], i[2], -(i[0] * t[0] + i[1] * t[1] + i[2] * t[2]),
    i[3], i[4], i[5], -(i[3] * t[0] + i[4] * t[1] + i[5] * t[2]),
    i[6], i[7], i[8], -(i[6] * t[0] + i[7] * t[1] + i[8] * t[2]),
    0, 0, 0, 1,
  ]);
}
export function applyNormal(m, n) {
  needMat(m); needVec(n, 'n');
  const i = inverse3(m);                               // (L⁻¹)ᵀ n: the columns of L⁻¹ dotted with n
  return finite([i[0] * n[0] + i[3] * n[1] + i[6] * n[2], i[1] * n[0] + i[4] * n[1] + i[7] * n[2], i[2] * n[0] + i[5] * n[1] + i[8] * n[2]]);
}

export function isRigid(m, tol) {
  if (!isAffine(m)) return false;
  const t = resolveTol(tol);
  const c = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]];
  for (let i = 0; i < 3; i++) for (let j = i; j < 3; j++) {
    const d = c[i][0] * c[j][0] + c[i][1] * c[j][1] + c[i][2] * c[j][2];
    if (Math.abs(d - (i === j ? 1 : 0)) > t.ang) return false;
  }
  return det3(m) > 0;
}

export function fromColumnMajor(a) {
  if (!isMat(a)) fail('solid.err.bad_input', { name: 'matrix', why: 'not_a_matrix' });
  const m = new Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) m[4 * r + c] = a[4 * c + r];
  needMat(m);
  return m;
}
export function toColumnMajor(m) {
  needMat(m);
  const a = new Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) a[4 * c + r] = m[4 * r + c];
  return a;
}
export function convertUnits(m, f) {
  needMat(m);
  if (!isNum(f) || !(f > 0)) fail('solid.err.bad_input', { name: 'f', why: 'not_a_factor' });
  const r = m.slice();
  r[3] *= f; r[7] *= f; r[11] *= f;
  return r;
}
