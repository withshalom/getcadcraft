/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * predicates.js — cc-solid (S3, docs/solid/HANDOFF.md § 5.4): geometric predicates whose sign is always exact. DOM-free;
 * imports the core only.
 *
 * Meshing, loop nesting, point-in-face and every "which side?" question in the kernel rest on four determinants. Computed
 * in floating point, they give the wrong sign when the points are nearly degenerate, and a wrong sign is how kernels build
 * crossed triangles and inside-out faces. These return the exact sign for every input in their domain.
 *
 *   orient2d(a, b, c)        +1: a, b, c turn counterclockwise; −1: clockwise; 0: collinear
 *   orient3d(a, b, c, d)     +1: d lies below the plane through a, b, c, where a, b, c run counterclockwise seen from
 *                            above (the sign of det[a − d; b − d; c − d]); −1: above; 0: coplanar
 *   incircle(a, b, c, d)     +1: d inside the circle through a, b, c (a, b, c counterclockwise); −1: outside; 0: on it.
 *                            For a, b, c clockwise the sign flips.
 *   insphere(a, b, c, d, e)  +1: e inside the sphere through a, b, c, d (with orient3d(a, b, c, d) > 0); −1: outside;
 *                            0: on it. For orient3d(a, b, c, d) < 0 the sign flips.
 * Points are [x, y] or [x, y, z]. Domain: each coordinate is 0 or has a magnitude from 2^-140 to 2^140 (about 7e-43 to
 * 1.4e42; in millimetres, everything a model holds). Then every product the exact stage forms is a normal double, so no
 * bit is lost to underflow or overflow. Anything else (NaN, ±Infinity, a subnormal, out of range) is refused with
 * solid.err.bad_input { name: 'point', why: 'out_of_range' } rather than answered wrongly.
 *
 * Method (J. R. Shewchuk, "Adaptive precision floating-point arithmetic and fast robust geometric predicates", Discrete &
 * Comput. Geom. 18, 1997): first the determinant in floating point with a forward error bound. Shewchuk's bounds are
 * doubled here, for margin; when |det| beats the bound, its sign is certain. Otherwise the determinant is recomputed exactly
 * as an expansion (a sum of non-overlapping doubles built with TwoSum and TwoProduct), whose largest component carries the
 * sign. Random inputs almost always take the fast path; only nearly degenerate ones pay for exactness.
 */
import { fail } from '../core/errors.js';
import { U, pow2, sumErr, prodErr } from '../core/float.js';

const LO = pow2(-140), HI = pow2(140);
const CCW_BOUND = 2 * (3 + 16 * U) * U;
const O3D_BOUND = 2 * (7 + 56 * U) * U;
const ICC_BOUND = 2 * (10 + 96 * U) * U;
const ISP_BOUND = 2 * (16 + 224 * U) * U;

function check(p, n) {
  if (!Array.isArray(p) || p.length !== n) fail('solid.err.bad_input', { name: 'point', why: 'not_a_point' });
  for (let i = 0; i < n; i++) {
    const v = p[i];
    if (typeof v !== 'number') fail('solid.err.bad_input', { name: 'point', why: 'not_a_point' });
    if (v !== 0) { const a = Math.abs(v); if (!(a >= LO && a <= HI)) fail('solid.err.bad_input', { name: 'point', why: 'out_of_range' }); }
  }
}
const sgn = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);

// ---------------------------------------------------------------------------------------------- expansions
// An expansion is an array of doubles, smallest first, that do not overlap; its value is their exact sum and its sign is
// the sign of its last (largest) non-zero component. Zero components are dropped as they appear.

function diff(a, b) {                                  // a − b exactly, as an expansion
  const s = a - b, e = sumErr(a, -b, s);
  return e === 0 ? [s] : [e, s];
}
function grow(e, b) {                                  // e + b exactly (Shewchuk's Grow-Expansion)
  const h = [];
  let q = b;
  for (const x of e) {
    const s = q + x, err = sumErr(q, x, s);
    if (err !== 0) h.push(err);
    q = s;
  }
  if (q !== 0 || h.length === 0) h.push(q);
  return h;
}
function add(e, f) { let h = e; for (const x of f) h = grow(h, x); return h; }
const neg = (e) => e.map((x) => -x);
const sub = (e, f) => add(e, neg(f));
function scale(e, b) {                                 // e · b exactly
  let h = [0];
  for (const x of e) {
    const p = x * b;
    h = grow(grow(h, prodErr(x, b, p)), p);
  }
  return h;
}
function mul(e, f) { let h = [0]; for (const x of f) h = add(h, scale(e, x)); return h; }
function signOf(e) { for (let i = e.length - 1; i >= 0; i--) if (e[i] !== 0) return e[i] > 0 ? 1 : -1; return 0; }
const lift2 = (x, y) => add(mul(x, x), mul(y, y));
const lift3 = (x, y, z) => add(add(mul(x, x), mul(y, y)), mul(z, z));
/** The 2 × 2 minor x1·y2 − x2·y1, exactly. */
const minor = (x1, y1, x2, y2) => sub(mul(x1, y2), mul(x2, y1));

// ---------------------------------------------------------------------------------------------- the predicates

export function orient2d(a, b, c) {
  check(a, 2); check(b, 2); check(c, 2);
  const detl = (a[0] - c[0]) * (b[1] - c[1]), detr = (a[1] - c[1]) * (b[0] - c[0]);
  const det = detl - detr;
  let sum;
  if (detl > 0) { if (detr <= 0) return sgn(det); sum = detl + detr; }
  else if (detl < 0) { if (detr >= 0) return sgn(det); sum = -detl - detr; }
  else return sgn(det);
  if (Math.abs(det) > CCW_BOUND * sum) return sgn(det);
  return signOf(minor(diff(a[0], c[0]), diff(a[1], c[1]), diff(b[0], c[0]), diff(b[1], c[1])));
}

export function orient3d(a, b, c, d) {
  check(a, 3); check(b, 3); check(c, 3); check(d, 3);
  const adx = a[0] - d[0], bdx = b[0] - d[0], cdx = c[0] - d[0];
  const ady = a[1] - d[1], bdy = b[1] - d[1], cdy = c[1] - d[1];
  const adz = a[2] - d[2], bdz = b[2] - d[2], cdz = c[2] - d[2];
  const bc = bdx * cdy, cb = cdx * bdy, ca = cdx * ady, ac = adx * cdy, ab = adx * bdy, ba = bdx * ady;
  const det = adz * (bc - cb) + bdz * (ca - ac) + cdz * (ab - ba);
  const perm = (Math.abs(bc) + Math.abs(cb)) * Math.abs(adz) + (Math.abs(ca) + Math.abs(ac)) * Math.abs(bdz) + (Math.abs(ab) + Math.abs(ba)) * Math.abs(cdz);
  if (Math.abs(det) > O3D_BOUND * perm) return sgn(det);
  const X = [diff(a[0], d[0]), diff(b[0], d[0]), diff(c[0], d[0])];
  const Y = [diff(a[1], d[1]), diff(b[1], d[1]), diff(c[1], d[1])];
  const Z = [diff(a[2], d[2]), diff(b[2], d[2]), diff(c[2], d[2])];
  const e = add(add(mul(Z[0], minor(X[1], Y[1], X[2], Y[2])), mul(Z[1], minor(X[2], Y[2], X[0], Y[0]))), mul(Z[2], minor(X[0], Y[0], X[1], Y[1])));
  return signOf(e);
}

export function incircle(a, b, c, d) {
  check(a, 2); check(b, 2); check(c, 2); check(d, 2);
  const adx = a[0] - d[0], bdx = b[0] - d[0], cdx = c[0] - d[0];
  const ady = a[1] - d[1], bdy = b[1] - d[1], cdy = c[1] - d[1];
  const bc = bdx * cdy, cb = cdx * bdy, ca = cdx * ady, ac = adx * cdy, ab = adx * bdy, ba = bdx * ady;
  const al = adx * adx + ady * ady, bl = bdx * bdx + bdy * bdy, cl = cdx * cdx + cdy * cdy;
  const det = al * (bc - cb) + bl * (ca - ac) + cl * (ab - ba);
  const perm = (Math.abs(bc) + Math.abs(cb)) * al + (Math.abs(ca) + Math.abs(ac)) * bl + (Math.abs(ab) + Math.abs(ba)) * cl;
  if (Math.abs(det) > ICC_BOUND * perm) return sgn(det);
  const X = [diff(a[0], d[0]), diff(b[0], d[0]), diff(c[0], d[0])];
  const Y = [diff(a[1], d[1]), diff(b[1], d[1]), diff(c[1], d[1])];
  const e = add(add(mul(lift2(X[0], Y[0]), minor(X[1], Y[1], X[2], Y[2])), mul(lift2(X[1], Y[1]), minor(X[2], Y[2], X[0], Y[0]))), mul(lift2(X[2], Y[2]), minor(X[0], Y[0], X[1], Y[1])));
  return signOf(e);
}

export function insphere(a, b, c, d, e) {
  check(a, 3); check(b, 3); check(c, 3); check(d, 3); check(e, 3);
  const aex = a[0] - e[0], bex = b[0] - e[0], cex = c[0] - e[0], dex = d[0] - e[0];
  const aey = a[1] - e[1], bey = b[1] - e[1], cey = c[1] - e[1], dey = d[1] - e[1];
  const aez = a[2] - e[2], bez = b[2] - e[2], cez = c[2] - e[2], dez = d[2] - e[2];
  const p1 = aex * bey, q1 = bex * aey, p2 = bex * cey, q2 = cex * bey, p3 = cex * dey, q3 = dex * cey;
  const p4 = dex * aey, q4 = aex * dey, p5 = aex * cey, q5 = cex * aey, p6 = bex * dey, q6 = dex * bey;
  const ab = p1 - q1, bc = p2 - q2, cd = p3 - q3, da = p4 - q4, ac = p5 - q5, bd = p6 - q6;
  // the 3 × 3 determinants of three of the moved points, expanded along z
  const abc = aez * bc - bez * ac + cez * ab, abd = aez * bd + bez * da + dez * ab;
  const acd = aez * cd + cez * da + dez * ac, bcd = bez * cd - cez * bd + dez * bc;
  const al = aex * aex + aey * aey + aez * aez, bl = bex * bex + bey * bey + bez * bez;
  const cl = cex * cex + cey * cey + cez * cez, dl = dex * dex + dey * dey + dez * dez;
  // det of the 4 × 4 [p − e, |p − e|²], expanded along the lift column
  const det = (dl * abc - cl * abd) + (bl * acd - al * bcd);
  const A = Math.abs;
  const abP = A(p1) + A(q1), bcP = A(p2) + A(q2), cdP = A(p3) + A(q3), daP = A(p4) + A(q4), acP = A(p5) + A(q5), bdP = A(p6) + A(q6);
  const perm = dl * (A(aez) * bcP + A(bez) * acP + A(cez) * abP) + cl * (A(aez) * bdP + A(bez) * daP + A(dez) * abP)
    + bl * (A(aez) * cdP + A(cez) * daP + A(dez) * acP) + al * (A(bez) * cdP + A(cez) * bdP + A(dez) * bcP);
  if (Math.abs(det) > ISP_BOUND * perm) return sgn(det);
  const Q = [a, b, c, d].map((p) => [diff(p[0], e[0]), diff(p[1], e[1]), diff(p[2], e[2])]);
  const mx = (i, j) => minor(Q[i][0], Q[i][1], Q[j][0], Q[j][1]);
  const T3 = (i, j, k) => add(sub(mul(Q[i][2], mx(j, k)), mul(Q[j][2], mx(i, k))), mul(Q[k][2], mx(i, j)));
  const L = Q.map((q) => lift3(q[0], q[1], q[2]));
  const ex = add(sub(mul(L[3], T3(0, 1, 2)), mul(L[2], T3(0, 1, 3))), sub(mul(L[1], T3(0, 2, 3)), mul(L[0], T3(1, 2, 3))));
  return signOf(ex);
}
