/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * linalg.js — cc-solid (S2, docs/solid/HANDOFF.md § 5.6): dense and banded linear algebra on arrays of rows, the way cc-nurbs
 * keeps matrices (vec.js solve). DOM-free; imports the core only.
 *
 * A matrix is an array of rows (A[i][j]), a vector a plain array. Nothing changes its arguments. Solutions are new arrays;
 * factorizations are frozen. A system that cannot be solved is refused with solid.err.singular, never answered with NaN or
 * huge numbers:
 *   why 'pivot'  a pivot was exactly 0 (lu, solve, inverse, bandSolve)                       { why, size, column }
 *   why 'rank'   lstsq: a diagonal entry of R fell to max(m, n) · EPS · max |R_kk| or below    { why, size, column }
 * A system that can be solved, but only badly, is the caller's call: rcond1 says how badly, cheaply.
 *
 *   lu(A) → frozen { n, lu, perm, sign }   Gaussian elimination with partial pivoting: row i of PA is row perm[i] of A;
 *                                           L (unit, strictly below the diagonal) and U (on and above it) packed in lu
 *   luSolve(F, b) → x · luSolveT(F, c) → z with Aᵀ z = c (same factors) · solve(A, b) → x
 *   solveMany(A, B) → X (B and X arrays of rows with k columns)
 *   det(A) (0 when singular) · inverse(A) · norm1(A) (largest column sum) · normInf(A) (largest row sum)
 *   rcond1(A, F?) → an estimate of 1 / (‖A‖₁ ‖A⁻¹‖₁), 0 for a singular A. ‖A⁻¹‖₁ is estimated from a few solves with A
 *                                           and Aᵀ (Hager 1984, with Higham's safeguards, 1988): never above the true norm,
 *                                           so the estimate never makes A look worse than it is, and it is seldom off by more
 *                                           than a factor of 3.
 *   bandSolve(band, kl, ku, b) → x          A n × n with kl diagonals below and ku above, in band storage:
 *                                           band[i][k] = A[i][i − kl + k], k = 0 … kl + ku (cells outside A are ignored).
 *                                           Partial pivoting; the fill-in widens U to kl + ku above (as LAPACK's gbsv does).
 *                                           Work and memory O(n · kl · (kl + ku)) and O(n · (2 kl + ku)).
 *   qr(A) → frozen { m, n, r, v, beta }     Householder QR, m ≥ n: r is the n × n upper triangle, v and beta the reflectors
 *   lstsq(A, b) → frozen { x, residual }    x minimising ‖A x − b‖₂ (residual is that minimum), from qr
 *   LIMITS                                  frozen { columns: 1024, rows: 65536, work: 2^31 }. These loops are cubic and take
 *                                           no budget, so the size is capped instead: more columns (or a wider band, or more
 *                                           right-hand sides) than `columns`, more rows than `rows`, or more multiply-adds
 *                                           than `work` (rows · columns² dense; n · (kl + 1) · (kl + ku + 1) banded) →
 *                                           solid.err.limit { what: 'size' | 'work', limit, used }, before any work is done.
 * Malformed arguments are solid.err.bad_input { name: 'matrix' | 'b' | 'band' | 'bandwidth', why: 'not_a_matrix' | 'shape' |
 * 'not_square' | 'not_finite' | 'out_of_range' }.
 */
import { fail } from '../core/errors.js';
import { EPS } from '../core/float.js';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

export const LIMITS = Object.freeze({ columns: 1024, rows: 65536, work: 2147483648 });
function checkSize(rows, columns, work) {
  if (columns > LIMITS.columns) fail('solid.err.limit', { what: 'size', limit: LIMITS.columns, used: columns });
  if (rows > LIMITS.rows) fail('solid.err.limit', { what: 'size', limit: LIMITS.rows, used: rows });
  if (work > LIMITS.work) fail('solid.err.limit', { what: 'work', limit: LIMITS.work, used: work });
}

function checkMatrix(A, square = true) {
  if (!Array.isArray(A) || A.length === 0 || !Array.isArray(A[0]) || A[0].length === 0) fail('solid.err.bad_input', { name: 'matrix', why: 'not_a_matrix' });
  const m = A.length, n = A[0].length;
  checkSize(m, n, m * n * n);                            // before any pass over the entries
  for (const row of A) {
    if (!Array.isArray(row) || row.length !== n) fail('solid.err.bad_input', { name: 'matrix', why: 'shape' });
    if (!row.every(isNum)) fail('solid.err.bad_input', { name: 'matrix', why: 'not_finite' });
  }
  if (square && m !== n) fail('solid.err.bad_input', { name: 'matrix', why: 'not_square' });
  return [m, n];
}
function checkVector(b, n, name = 'b') {
  if (!Array.isArray(b) || b.length !== n) fail('solid.err.bad_input', { name, why: 'shape' });
  if (!b.every(isNum)) fail('solid.err.bad_input', { name, why: 'not_finite' });
}

/** Elimination with partial pivoting; on an exactly zero pivot: refuse, or (det) return null. */
function factor(A, refuse) {
  const n = A.length;
  const M = A.map((r) => r.slice());
  const perm = Array.from({ length: n }, (_, i) => i);
  let sign = 1;
  for (let c = 0; c < n; c++) {
    let p = c, best = Math.abs(M[c][c]);
    for (let r = c + 1; r < n; r++) { const v = Math.abs(M[r][c]); if (v > best) { best = v; p = r; } }
    if (best === 0) { if (refuse) fail('solid.err.singular', { why: 'pivot', size: n, column: c }); return null; }
    if (p !== c) { const t = M[c]; M[c] = M[p]; M[p] = t; const q = perm[c]; perm[c] = perm[p]; perm[p] = q; sign = -sign; }
    const row = M[c], piv = row[c];
    for (let r = c + 1; r < n; r++) {
      const R = M[r], f = R[c] / piv;
      R[c] = f;
      if (f !== 0) for (let j = c + 1; j < n; j++) R[j] -= f * row[j];
    }
  }
  return { n, lu: M, perm, sign };
}

export function lu(A) {
  checkMatrix(A);
  const F = factor(A, true);
  return Object.freeze({ n: F.n, lu: Object.freeze(F.lu.map((r) => Object.freeze(r))), perm: Object.freeze(F.perm), sign: F.sign });
}

export function luSolve(F, b) {
  const { n, lu: M, perm } = F;
  checkVector(b, n);
  const x = new Array(n);
  for (let i = 0; i < n; i++) {                        // L y = P b
    let s = b[perm[i]];
    const R = M[i];
    for (let j = 0; j < i; j++) s -= R[j] * x[j];
    x[i] = s;
  }
  for (let i = n - 1; i >= 0; i--) {                   // U x = y
    let s = x[i];
    const R = M[i];
    for (let j = i + 1; j < n; j++) s -= R[j] * x[j];
    x[i] = s / R[i];
  }
  return x;
}
/** Aᵀ z = c from the same factors: Aᵀ = Uᵀ Lᵀ P, so Uᵀ w = c, Lᵀ u = w, then z[perm[i]] = u[i]. */
export function luSolveT(F, c) {
  const { n, lu: M, perm } = F;
  checkVector(c, n, 'c');
  const w = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = c[i];
    for (let j = 0; j < i; j++) s -= M[j][i] * w[j];
    w[i] = s / M[i][i];
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = w[i];
    for (let j = i + 1; j < n; j++) s -= M[j][i] * w[j];
    w[i] = s;
  }
  const z = new Array(n);
  for (let i = 0; i < n; i++) z[perm[i]] = w[i];
  return z;
}

export const solve = (A, b) => luSolve(lu(A), b);
export function solveMany(A, B) {
  const F = lu(A), n = F.n;
  if (!Array.isArray(B) || B.length !== n) fail('solid.err.bad_input', { name: 'b', why: 'shape' });
  const k = Array.isArray(B[0]) ? B[0].length : -1;
  checkSize(n, k, n * n * k);
  if (!(k > 0) || !B.every((r) => Array.isArray(r) && r.length === k && r.every(isNum))) fail('solid.err.bad_input', { name: 'b', why: 'shape' });
  const X = Array.from({ length: n }, () => new Array(k));
  for (let j = 0; j < k; j++) {
    const x = luSolve(F, B.map((r) => r[j]));
    for (let i = 0; i < n; i++) X[i][j] = x[i];
  }
  return X;
}
export function inverse(A) {
  const [n] = checkMatrix(A);
  return solveMany(A, Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
}
export function det(A) {
  checkMatrix(A);
  const F = factor(A, false);
  if (!F) return 0;
  let d = F.sign;
  for (let i = 0; i < F.n; i++) d *= F.lu[i][i];
  return d;
}
export function norm1(A) {
  const [m, n] = checkMatrix(A, false);
  let best = 0;
  for (let j = 0; j < n; j++) { let s = 0; for (let i = 0; i < m; i++) s += Math.abs(A[i][j]); if (s > best) best = s; }
  return best;
}
export function normInf(A) {
  checkMatrix(A, false);
  let best = 0;
  for (const row of A) { let s = 0; for (const v of row) s += Math.abs(v); if (s > best) best = s; }
  return best;
}

const sum1 = (v) => { let s = 0; for (const x of v) s += Math.abs(x); return s; };

/** Hager's lower bound for ‖A⁻¹‖₁, with Higham's safeguards: five rounds at most, stop when the signs repeat or the estimate
 * stops growing, and a last try with the vector (1, −(1 + 1/(n−1)), 1 + 2/(n−1), …). */
function invNorm1(F) {
  const n = F.n;
  if (n === 1) return 1 / Math.abs(F.lu[0][0]);
  let x = new Array(n).fill(1 / n), est = 0, signs = null;
  for (let k = 0; k < 5; k++) {
    const y = luSolve(F, x), e = sum1(y);
    const s = y.map((v) => (v >= 0 ? 1 : -1));
    if (k > 0 && (e <= est || s.every((v, i) => v === signs[i]))) { est = Math.max(est, e); break; }
    est = e; signs = s;
    const z = luSolveT(F, s);
    let j = 0, zmax = Math.abs(z[0]), ztx = 0;
    for (let i = 0; i < n; i++) { ztx += z[i] * x[i]; if (Math.abs(z[i]) > zmax) { zmax = Math.abs(z[i]); j = i; } }
    if (zmax <= ztx) break;
    x = new Array(n).fill(0);
    x[j] = 1;
  }
  const alt = Array.from({ length: n }, (_, i) => (i % 2 ? -1 : 1) * (1 + i / (n - 1)));
  return Math.max(est, (2 * sum1(luSolve(F, alt))) / (3 * n));
}
export function rcond1(A, F) {
  checkMatrix(A);
  const f = F || factor(A, false);
  if (!f) return 0;
  const a = norm1(A);
  return a === 0 ? 0 : 1 / (a * invNorm1(f));
}

export function bandSolve(band, kl, ku, b) {
  if (!Number.isInteger(kl) || kl < 0 || !Number.isInteger(ku) || ku < 0) fail('solid.err.bad_input', { name: 'bandwidth', why: 'out_of_range' });
  if (!Array.isArray(band) || band.length === 0) fail('solid.err.bad_input', { name: 'band', why: 'not_a_matrix' });
  const n = band.length, w = kl + ku + 1, W = 2 * kl + ku + 1;
  checkSize(n, Math.max(kl, ku), n * (kl + 1) * w);
  for (const row of band) {
    if (!Array.isArray(row) || row.length !== w) fail('solid.err.bad_input', { name: 'band', why: 'shape' });
    if (!row.every(isNum)) fail('solid.err.bad_input', { name: 'band', why: 'not_finite' });
  }
  checkVector(b, n);
  // M[i][j − i + kl] = A[i][j] for j from i − kl to i + kl + ku (the last kl columns for fill-in)
  const M = band.map((row, i) => {
    const r = new Array(W).fill(0);
    for (let k = 0; k < w; k++) { const j = i - kl + k; if (j >= 0 && j < n) r[k] = row[k]; }
    return r;
  });
  const x = b.slice();
  for (let c = 0; c < n; c++) {
    const rmax = Math.min(n - 1, c + kl), cmax = Math.min(n - 1, c + kl + ku);
    let p = c, best = Math.abs(M[c][kl]);
    for (let r = c + 1; r <= rmax; r++) { const v = Math.abs(M[r][c - r + kl]); if (v > best) { best = v; p = r; } }
    if (best === 0) fail('solid.err.singular', { why: 'pivot', size: n, column: c });
    if (p !== c) {
      for (let j = c; j <= cmax; j++) { const t = M[c][j - c + kl]; M[c][j - c + kl] = M[p][j - p + kl]; M[p][j - p + kl] = t; }
      const t = x[c]; x[c] = x[p]; x[p] = t;
    }
    const piv = M[c][kl];
    for (let r = c + 1; r <= rmax; r++) {
      const f = M[r][c - r + kl] / piv;
      if (f === 0) continue;
      for (let j = c; j <= cmax; j++) M[r][j - r + kl] -= f * M[c][j - c + kl];
      x[r] -= f * x[c];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i];
    const jmax = Math.min(n - 1, i + kl + ku);
    for (let j = i + 1; j <= jmax; j++) s -= M[i][j - i + kl] * x[j];
    x[i] = s / M[i][kl];
  }
  return x;
}

export function qr(A) {
  const [m, n] = checkMatrix(A, false);
  if (m < n) fail('solid.err.bad_input', { name: 'matrix', why: 'shape' });
  const R = A.map((r) => r.slice());
  const V = [], beta = [];
  for (let k = 0; k < n; k++) {
    let sc = 0;
    for (let i = k; i < m; i++) sc = Math.max(sc, Math.abs(R[i][k]));
    if (sc === 0) { V.push(null); beta.push(0); continue; }   // a zero column: R[k][k] stays 0, and lstsq refuses it
    let s2 = 0;
    for (let i = k; i < m; i++) { const t = R[i][k] / sc; s2 += t * t; }
    const norm = sc * Math.sqrt(s2), x0 = R[k][k];
    const alpha = x0 > 0 ? -norm : norm;                // the sign that avoids cancellation in v[0]
    const v = [];
    for (let i = k; i < m; i++) v.push(R[i][k]);
    v[0] -= alpha;
    const bt = 1 / (norm * (norm + Math.abs(x0)));      // 2 / vᵀv, since vᵀv = 2 |α| (|α| + |x0|)
    for (let j = k + 1; j < n; j++) {
      let s = 0;
      for (let i = k; i < m; i++) s += v[i - k] * R[i][j];
      s *= bt;
      for (let i = k; i < m; i++) R[i][j] -= s * v[i - k];
    }
    R[k][k] = alpha;
    for (let i = k + 1; i < m; i++) R[i][k] = 0;
    V.push(Object.freeze(v));
    beta.push(bt);
  }
  return Object.freeze({ m, n, r: Object.freeze(R.slice(0, n).map((row) => Object.freeze(row))), v: Object.freeze(V), beta: Object.freeze(beta) });
}

export function lstsq(A, b) {
  const F = qr(A), { m, n } = F;
  checkVector(b, m);
  const y = b.slice();
  for (let k = 0; k < n; k++) {                        // y = Qᵀ b
    const v = F.v[k];
    if (!v) continue;
    let s = 0;
    for (let i = k; i < m; i++) s += v[i - k] * y[i];
    s *= F.beta[k];
    for (let i = k; i < m; i++) y[i] -= s * v[i - k];
  }
  let dmax = 0;
  for (let k = 0; k < n; k++) dmax = Math.max(dmax, Math.abs(F.r[k][k]));
  const floor = Math.max(m, n) * EPS * dmax;
  for (let k = 0; k < n; k++) if (!(Math.abs(F.r[k][k]) > floor)) fail('solid.err.singular', { why: 'rank', size: n, column: k });
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let j = i + 1; j < n; j++) s -= F.r[i][j] * x[j];
    x[i] = s / F.r[i][i];
  }
  let res = 0;
  for (let i = n; i < m; i++) res += y[i] * y[i];
  return Object.freeze({ x: Object.freeze(x), residual: Math.sqrt(res) });
}
