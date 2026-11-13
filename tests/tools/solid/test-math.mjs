/* SPDX-License-Identifier: Apache-2.0 */
/**
 * test-math.mjs — engine.solid's math-layer tests, registered by test.mjs: vec3, mat4, frame, aabb, quad, roots, linalg (S2),
 * predicates (S3).
 *
 * Properties over 1e5 seeded random cases where a property exists (identities, round trips, backward errors), exact BigInt
 * checks where a claim is about rounding (conservative boxes, the Hilbert condition numbers), and known answers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { X, xadd, xmul, xcmp } from './test-core.mjs';
import * as R from './bigref.mjs';

// cc-nurbs' xform (lib/nurbs/vec.js), as documented: row-major, 16 numbers, the last row ignored. When cc-nurbs sits beside
// the engine, its own function is used instead of this copy of the formula.
const xformDoc = (m, p, w = 1) => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3] * w, m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7] * w, m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11] * w];

const binom = (n, k) => { if (k < 0n || k > n) return 0n; let r = 1n; for (let i = 1n; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
/** The inverse of the n × n Hilbert matrix, exactly (integers), and κ₁ of H as num/den (BigInt). */
function hilbert(n) {
  const N = BigInt(n);
  const inv = [];
  for (let i = 1n; i <= N; i++) {
    const row = [];
    for (let j = 1n; j <= N; j++) {
      const c = binom(i + j - 2n, i - 1n);
      row.push(((i + j) % 2n ? -1n : 1n) * (i + j - 1n) * binom(N + i - 1n, N - j) * binom(N + j - 1n, N - i) * c * c);
    }
    inv.push(row);
  }
  let invNorm = 0n;
  for (let j = 0; j < n; j++) { let s = 0n; for (let i = 0; i < n; i++) s += inv[i][j] < 0n ? -inv[i][j] : inv[i][j]; if (s > invNorm) invNorm = s; }
  let num = 0n, den = 1n;                              // ‖H‖₁ = 1 + 1/2 + … + 1/n (the first column)
  for (let i = 1n; i <= N; i++) { num = num * i + den; den *= i; }
  return { inv, kappaNum: num * invNorm, kappaDen: den };
}

export async function register({ section, ok, refuses, same, appUrl }) {
  const F = await import(appUrl('solid/core/float.js'));
  const T = await import(appUrl('solid/core/trig.js'));
  const P = await import(appUrl('solid/core/prng.js'));
  const L = await import(appUrl('solid/core/limits.js'));
  const V = await import(appUrl('solid/math/vec3.js'));
  const M = await import(appUrl('solid/math/mat4.js'));
  const Fr = await import(appUrl('solid/math/frame.js'));
  const B = await import(appUrl('solid/math/aabb.js'));
  const Q = await import(appUrl('solid/math/quad.js'));
  const Ro = await import(appUrl('solid/math/roots.js'));
  const LA = await import(appUrl('solid/math/linalg.js'));
  const PR = await import(appUrl('solid/math/predicates.js'));
  const nurbsVec = path.join(fileURLToPath(appUrl('nurbs/vec.js')));
  const xform = fs.existsSync(nurbsVec) ? (await import(appUrl('nurbs/vec.js'))).xform : xformDoc;
  const bad = 'solid.err.bad_input', EPS = F.EPS;
  const vec = (g, r = 100) => [g.range(-r, r), g.range(-r, r), g.range(-r, r)];
  const maxAbs = (v) => Math.max(...v.map(Math.abs));

  // ================================================================================================ vec3
  section('vec3', 'vectors: identities over 1e5 cases, safe lengths, refusals', () => {
    const g = P.makePrng(21);
    let unitOk = true, perpOk = true, lagrange = true, sym = true, triple = true, ranged = true;
    for (let i = 0; i < 1e5; i++) {
      const a = vec(g, F.pow2(Math.floor(g.range(-40, 40)))), b = vec(g), c = vec(g);
      const u = V.unit(a);
      if (Math.abs(V.len(u) - 1) > 2 * EPS) unitOk = false;
      const p = V.perp(a);
      if (Math.abs(V.dot(p, u)) > 4 * EPS || Math.abs(V.len(p) - 1) > 2 * EPS) perpOk = false;
      const ab = V.cross(a, b), la = V.len2(a), lb = V.len2(b);
      if (Math.abs(V.len2(ab) + V.dot(a, b) * V.dot(a, b) - la * lb) > 8 * EPS * la * lb) lagrange = false;
      if (V.angle(a, b) !== V.angle(b, a)) sym = false;
      const ang = V.angle(a, b);
      if (!(ang >= 0 && ang <= T.PI)) ranged = false;
      if (V.triple(a, b, c) !== V.dot(a, V.cross(b, c))) triple = false;
    }
    ok(unitOk && perpOk, '|unit(a)| = 1 to 2 ulps; perp(a) is unit and at right angles to a (1e5 vectors over 80 binades; seed 21)');
    ok(lagrange, "Lagrange's identity |a×b|² + (a·b)² = |a|²|b|² to 8 ulps (1e5 pairs)");
    ok(sym && ranged && triple, 'angle is symmetric and in [0, π]; triple is a·(b×c)');
    ok(V.len([1e200, 1e200, 0]) === Math.SQRT2 * 1e200 && Math.abs(V.len([3e-200, 4e-200, 0]) / 5e-200 - 1) <= 2 * EPS && V.len([F.MAX, F.MAX, 0]) === Infinity && V.dist([1e200, 0, 0], [-1e200, 0, 0]) === 2e200, 'lengths and distances neither overflow nor underflow before they must');
    ok(Math.abs(V.angle([1, 0, 0], [1, 1e-10, 0]) / 1e-10 - 1) <= 4 * EPS && V.angle([1, 0, 0], [-1, 0, 0]) === T.PI && V.angle([0, 0, 0], [1, 0, 0]) === 0, 'angle: accurate for a 1e-10 rad angle, π for opposite vectors, 0 with a zero vector');
    ok(refuses(() => V.unit([0, 0, 0]), bad, { name: 'vector', why: 'zero_length' }) && refuses(() => V.unit([NaN, 1, 0]), bad) && refuses(() => V.perp([0, 0, 0]), bad), 'unit and perp refuse a zero or non-finite vector');
    ok(same(V.perp([0, 0, 5]), V.perp([0, 0, 5])) && same(V.add([1, 2, 3], [4, 5, 6]), [5, 7, 9]) && same(V.madd([1, 1, 1], 2, [1, 2, 3]), [3, 5, 7]) && same(V.mid([0, 0, 0], [2, 4, 6]), [1, 2, 3]) && V.near([0, 0, 0], [3, 4, 0], 5) && !V.near([0, 0, 0], [3, 4, 0], 4.999), 'perp is the same every time; add, madd, mid, near');
    ok(V.isVec3([1, 2, 3]) && !V.isVec3([1, 2]) && !V.isVec3([1, 2, Infinity]) && !V.isVec3('abc'), 'isVec3');
  });

  // ================================================================================================ mat4
  section('mat4', 'affine matrices: rotations are rigid, inverses invert, conventions convert, cc-nurbs agrees', () => {
    const g = P.makePrng(22);
    let rigid = true, back = true, axis = true, inv = true, normals = true, interop = true;
    for (let i = 0; i < 1e4; i++) {
      const ax = g.unit3(), th = g.range(-10, 10), R = M.rotation(ax, th);
      if (!M.isRigid(R) || Math.abs(M.det3(R) - 1) > 16 * EPS) rigid = false;
      const I2 = M.mul(R, M.rotation(ax, -th));
      if (!I2.every((v, k) => Math.abs(v - M.IDENTITY[k]) <= 16 * EPS)) back = false;
      if (!M.apply(R, ax).every((v, k) => Math.abs(v - ax[k]) <= 8 * EPS)) axis = false;
      const A = M.mul(M.translation(vec(g, 1e3)), M.mul(R, M.scaling([g.range(0.5, 2), g.range(0.5, 2), g.range(0.5, 2)])));
      const C = M.mul(M.invert(A), A);
      if (!C.every((v, k) => Math.abs(v - M.IDENTITY[k]) <= 1e3 * 64 * EPS)) inv = false;
      const n = g.unit3(), t = V.cross(n, g.unit3());   // a tangent of the plane with normal n
      if (Math.abs(V.dot(M.applyNormal(A, n), M.applyDir(A, t))) > 64 * EPS * V.len(t) * V.len(M.applyNormal(A, n)) * 4) normals = false;
      const p = vec(g, 1e3);
      if (!same(M.apply(A, p), xform(A, p)) || !same(M.applyDir(A, p), xform(A, p, 0))) interop = false;
    }
    ok(rigid && back && axis, 'rotation(axis, θ): rigid, det 1, undone by −θ, axis fixed (1e4 random rotations; seed 22)');
    ok(inv, 'invert(A) · A = I for 1e4 random rotations × scalings × translations');
    ok(normals, 'applyNormal keeps normals at right angles to the moved surface under non-uniform scaling');
    ok(interop, "apply and applyDir agree to the bit with cc-nurbs' xform (row-major, translation in m[3], m[7], m[11])");
    const Rz = M.rotation([0, 0, 1], T.HALF_PI);
    const [s, c] = T.sincos(T.HALF_PI);
    ok(same(Rz, [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), 'rotation about z is [[c, −s, 0], [s, c, 0], [0, 0, 1]] exactly (right-handed)');
    const Ra = M.rotationAbout([1, 2, 3], [0, 0, 1], 1.1);
    ok(M.apply(Ra, [1, 2, 3]).every((v, k) => Math.abs(v - [1, 2, 3][k]) <= 8 * EPS), 'rotationAbout fixes its point');
    const three = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1];   // three.js elements: translation in 12, 13, 14
    const fromThree = M.fromColumnMajor(three);
    ok(same(fromThree, M.translation([10, 20, 30])) && same(M.toColumnMajor(fromThree), three), 'fromColumnMajor / toColumnMajor: a three.js matrix and back, exactly');
    let round = true;
    for (let i = 0; i < 1e3; i++) { const A = M.mul(M.translation(vec(g)), M.rotation(g.unit3(), g.range(-3, 3))); if (!same(M.fromColumnMajor(M.toColumnMajor(A)), A)) round = false; }
    ok(round, 'column-major round trips are exact (1e3 matrices)');
    const Mm = M.mul(M.translation([0.25, -1.5, 3]), M.rotation([0, 1, 0], 0.3)), pm = [0.1, 0.2, 0.3];
    const mm = M.convertUnits(Mm, 1000);
    ok(M.apply(mm, V.scale(pm, 1000)).every((v, k) => Math.abs(v - 1000 * M.apply(Mm, pm)[k]) <= 1e3 * 4 * EPS), 'convertUnits(m, 1000): a ModelCraft matrix in metres moves millimetre points the same way');
    const tinyBig = [1e-300, 1e-160, 1e-110, 3e-20, 7e40, 1e110, 1e200, 1e300].map((sc) => {
      const R0 = M.rotation([1, 2, 3], 0.7), A = R0.map((v, k) => (k < 12 && k % 4 !== 3 ? v * sc : v)), I = M.invert(A), Pp = M.mul(I, A);
      return Pp.every((v, k) => Math.abs(v - M.IDENTITY[k]) <= 16 * EPS) && (sc * sc * sc === 0 ? M.det3(A) === Number.MIN_VALUE : sc * sc * sc === Infinity ? M.det3(A) === Infinity : Math.abs(M.det3(A) / (sc * sc * sc) - 1) <= 16 * EPS) && M.applyNormal(A, [0, 0, 1]).every(Number.isFinite);
    });
    ok(tinyBig.every((v) => v), 'invert, applyNormal and det3 at every scale: a rotation times 1e-300 … 1e300 inverts as well as at scale 1 (the size of a matrix is not its condition)' + (tinyBig.every((v) => v) ? '' : ' (failed at index ' + tinyBig.map((v, k) => (v ? '' : k)).join('') + ')'));
    ok(M.det3(M.scaling(1e-200)) === Number.MIN_VALUE && M.det3(M.scaling([-1e-200, 1e-200, 1e-200])) === -Number.MIN_VALUE && M.det3(M.scaling(1e200)) === Infinity && M.det3(M.scaling([1, 1, 0])) === 0 && M.det3(M.scaling([2, 3, 4])) === 24,
      'det3 is 0 only for a singular matrix: a determinant below the smallest double comes back as ±2^-1074, one past the largest as ±Infinity');
    ok(refuses(() => M.invert(M.scaling(1e-320)), bad, { name: 'matrix', why: 'overflow' }) && refuses(() => M.invert(M.mul(M.scaling(1e-200), M.translation([1e200, 0, 0])).map((v, k) => (k === 3 ? 1e300 : v))), bad, { why: 'overflow' }),
      'invert refuses, as overflow and not as singular, a matrix whose inverse does not fit in doubles');
    ok(refuses(() => M.invert(M.scaling([1, 1, 0])), 'solid.err.singular', { why: 'matrix' }) && refuses(() => M.invert(M.scaling([1, 1, 1e-16])), 'solid.err.singular', { why: 'matrix' }) && refuses(() => M.applyNormal(M.scaling([0, 1, 1]), [1, 0, 0]), 'solid.err.singular'), 'invert and applyNormal refuse singular and nearly singular matrices');
    ok(refuses(() => M.fromColumnMajor([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0]), bad, { why: 'not_affine' }) && refuses(() => M.invert([1, 2]), bad, { why: 'not_a_matrix' }) && refuses(() => M.rotation([0, 0, 0], 1), bad, { why: 'zero_length' }) && refuses(() => M.convertUnits(M.identity(), 0), bad), 'projections, short arrays, a zero axis and a zero unit factor are refused');
    ok(M.isAffine(M.identity()) && !M.isRigid(M.scaling(2)) && !M.isRigid(M.scaling([-1, 1, 1])) && Object.isFrozen(M.IDENTITY), 'isAffine, isRigid (no scalings, no mirrors), IDENTITY frozen');
  });

  // ================================================================================================ frame
  section('frame', 'placements: orthonormal, right-handed, round trips, refusals', () => {
    const g = P.makePrng(23);
    let ortho = true, trip = true, mat = true;
    for (let i = 0; i < 1e4; i++) {
      const f = i % 2 ? Fr.frameFromZX(vec(g, 1e3), g.unit3(), g.unit3()) : Fr.frameFromZ(vec(g, 1e3), vec(g));
      const ax = [f.x, f.y, f.z];
      for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) if (Math.abs(V.dot(ax[p], ax[q]) - (p === q ? 1 : 0)) > 4 * EPS) ortho = false;
      if (Math.abs(V.triple(f.x, f.y, f.z) - 1) > 8 * EPS) ortho = false;
      const pt = vec(g, 1e3);
      if (!Fr.toLocal(f, Fr.toWorld(f, pt)).every((v, k) => Math.abs(v - pt[k]) <= 1e4 * 8 * EPS)) trip = false;
      if (!M.apply(Fr.toMatrix(f), pt).every((v, k) => Math.abs(v - Fr.toWorld(f, pt)[k]) <= 1e4 * 8 * EPS)) mat = false;
    }
    ok(ortho, 'frames are orthonormal to 4 ulps and right-handed (1e4 frames; seed 23)');
    ok(trip && mat, 'toLocal undoes toWorld, and toMatrix moves points as toWorld does');
    const f = Fr.frameFromXY([0, 0, 0], [2, 0, 0], [1, 1, 0]);
    ok(same(f.x, [1, 0, 0]) && same(f.y, [0, 1, 0]) && same(f.z, [0, 0, 1]), 'frameFromXY keeps x and squares y up');
    const back = Fr.frameFromMatrix(Fr.toMatrix(f));
    ok(same(back.x, f.x) && same(back.y, f.y) && same(back.o, f.o), 'frameFromMatrix(toMatrix(f)) is f');
    ok(refuses(() => Fr.frameFromZX([0, 0, 0], [0, 0, 1], [0, 0, -3]), bad, { name: 'x', why: 'parallel' }) && refuses(() => Fr.frameFromZX([0, 0, 0], [0, 0, 1], [1e-12, 0, 1]), bad, { why: 'parallel' }) && refuses(() => Fr.frameFromXY([0, 0, 0], [1, 0, 0], [2, 0, 0]), bad, { name: 'y' }), 'an x (or y) direction parallel to z (or x), within tol.ang, is refused');
    ok(refuses(() => Fr.frameFromMatrix(M.scaling(2)), bad, { why: 'not_rigid' }) && refuses(() => Fr.frameFromZ([0, 0], [0, 0, 1]), bad, { why: 'not_a_vector' }), 'non-rigid matrices and malformed points are refused');
    ok(Fr.isFrame(Fr.WORLD) && Fr.isFrame(f) && !Fr.isFrame({ ...f }) && Object.isFrozen(f) && Object.isFrozen(f.x), 'frames are frozen and branded');
  });

  // ================================================================================================ aabb
  section('aabb', 'boxes: conservative under transforms (exact BigInt check), set operations, outward inflation', () => {
    const g = P.makePrng(24);
    let cons = true, tight = true;
    for (let i = 0; i < 1e4; i++) {
      const lo = vec(g, 1e3), hi = lo.map((v) => v + g.range(0, 100)), b = B.box(lo, hi);
      const m = M.mul(M.translation(vec(g, 1e4)), M.mul(M.rotation(g.unit3(), g.range(-4, 4)), M.scaling([g.range(-3, 3), g.range(0.1, 3), g.range(0.1, 3)])));
      const t = B.transform(b, m);
      for (let k = 0; k < 9; k++) {
        const p = k < 8 ? [k & 1 ? hi[0] : lo[0], k & 2 ? hi[1] : lo[1], k & 4 ? hi[2] : lo[2]] : lo.map((v, j) => v + (hi[j] - v) * g.float());
        for (let r = 0; r < 3; r++) {
          const ex = xadd(xadd(xadd(xmul(X(m[4 * r]), X(p[0])), xmul(X(m[4 * r + 1]), X(p[1]))), xmul(X(m[4 * r + 2]), X(p[2]))), X(m[4 * r + 3]));
          if (!(xcmp(X(t.min[r]), ex) <= 0 && xcmp(X(t.max[r]), ex) >= 0)) cons = false;
        }
      }
      const corners = [];
      for (let k = 0; k < 8; k++) corners.push(M.apply(m, [k & 1 ? hi[0] : lo[0], k & 2 ? hi[1] : lo[1], k & 4 ? hi[2] : lo[2]]));
      const naive = B.fromPoints(corners);
      for (let r = 0; r < 3; r++) if (naive.min[r] - t.min[r] > 1e5 * 16 * EPS || t.max[r] - naive.max[r] > 1e5 * 16 * EPS) tight = false;
    }
    ok(cons, 'transform(b, m) holds the exact image of every corner and of random inner points (1e4 boxes, exact BigInt check; seed 24)');
    ok(tight, 'and it is no looser than rounding requires');
    const pts = [[1, 5, -2], [3, -1, 4], [2, 2, 2]];
    const b = B.fromPoints(pts);
    ok(same(b.min, [1, -1, -2]) && same(b.max, [3, 5, 4]) && pts.every((p) => B.contains(b, p)), 'fromPoints is exact and holds its points');
    ok(B.isEmpty(B.EMPTY) && B.isEmpty(B.fromPoints([])) && same(B.extend(B.EMPTY, [1, 2, 3]).min, [1, 2, 3]) && B.union(B.EMPTY, b) === b && B.isEmpty(B.intersection(b, B.box([10, 10, 10], [11, 11, 11]))), 'the empty box: extend, union and intersection behave');
    ok(B.overlaps(b, B.box([3, 5, 4], [9, 9, 9])) && !B.overlaps(b, B.box([3.0000001, 5, 4], [9, 9, 9])) && B.containsBox(b, B.box([2, 0, 0], [3, 1, 1])) && same(B.size(b), [2, 6, 6]) && same(B.center(b), [2, 2, 1]), 'overlaps (touching counts), containsBox, size, center');
    const inf = B.inflate(B.box([0.1, 0.1, 0.1], [0.2, 0.2, 0.2]), 0.3);
    ok(inf.min.every((v) => xcmp(X(v), xadd(X(0.1), X(-0.3))) <= 0) && inf.max.every((v) => xcmp(X(v), xadd(X(0.2), X(0.3))) >= 0), 'inflate moves each side out by d, rounded outward (exact check)');
    ok(B.diagonal(B.box([0, 0, 0], [3, 4, 12])) >= 13 && B.diagonal(B.box([0, 0, 0], [3, 4, 12])) <= F.nextUp(F.nextUp(13)), 'diagonal is an upper bound, within an ulp or two');
    const unit = B.box([0, 0, 0], [1, 1, 1]), inf3 = [Infinity, Infinity, Infinity], ninf3 = [-Infinity, -Infinity, -Infinity];
    ok([[NaN, 0, 0], [1, 2], [1, 2, 3, 4], ['1', 2, 3], null, undefined].every((p) => refuses(() => B.extend(unit, p), bad, { name: 'point', why: 'not_a_point' })) && same(B.extend(unit, [2, -1, 0.5]).max, [2, 1, 1]), 'extend refuses a point that is not three numbers (no NaN reaches a box)');
    const allBox = B.box(ninf3, inf3), halfBox = B.box([0, -Infinity, 2], [Infinity, 5, 4]);
    ok(same(B.center(allBox), [0, 0, 0]) && same(B.center(halfBox), [Number.MAX_VALUE, -Number.MAX_VALUE, 3]) && same(B.center(unit), [0.5, 0.5, 0.5]) && refuses(() => B.center(B.EMPTY), bad, { name: 'box', why: 'empty' }), 'center: a point inside even for unbounded boxes (never NaN); the empty box has none');
    ok(refuses(() => B.box(inf3, inf3), bad, { name: 'box', why: 'at_infinity' }) && refuses(() => B.box([0, -Infinity, 0], [1, -Infinity, 1]), bad, { why: 'at_infinity' }) && B.box(inf3, ninf3) === B.EMPTY, 'a box with a side wholly at infinity holds no point and is refused');
    ok(refuses(() => B.box([1, 0, 0], [0, 1, 1]), bad, { why: 'min_above_max' }) && refuses(() => B.fromPoints([[1, 2]]), bad) && refuses(() => B.inflate(b, -1), bad) && refuses(() => B.transform(b, [1]), bad), 'malformed boxes, points, distances and matrices are refused');
    ok(Object.isFrozen(b) && Object.isFrozen(b.min) && Object.isFrozen(B.EMPTY), 'boxes are frozen');
  });

  // ================================================================================================ quad
  section('quad', 'Gauss–Legendre rules 1 to 64, exactness, adaptive integration, refusals', () => {
    // the tables against the exact ones: Legendre's recurrence and Newton's method in 320-bit fixed point (bigref's scale)
    {
      const FB = R.F, ONE = R.ONE, fmul = (a, b) => (a * b) >> FB, fdiv = (a, b) => (a << FB) / b;
      const leg = (n, x) => { let p0 = ONE, p1 = x; for (let k = 1; k < n; k++) { const p2 = (BigInt(2 * k + 1) * fmul(x, p1) - BigInt(k) * p0) / BigInt(k + 1); p0 = p1; p1 = p2; } return [p1, fdiv(BigInt(n) * (fmul(x, p1) - p0), fmul(x, x) - ONE)]; };
      let wx = 0, ww = 0, where = '';
      for (let n = 1; n <= 64; n++) {
        const r = Q.rule(n);
        for (let i = 0; i < n; i++) {
          let z = R.fix(r.x[i]);
          for (let it = 0; it < 6; it++) { const [p, d] = leg(n, z); z -= fdiv(p, d); }
          const d = leg(n, z)[1], w = fdiv(2n * ONE, fmul(ONE - fmul(z, z), fmul(d, d)));
          const ux = r.x[i] === 0 ? (z > (1n << 200n) || z < -(1n << 200n) ? 9 : 0) : R.ulpsOff(r.x[i], z), uw = R.ulpsOff(r.w[i], w);
          if (ux > wx) wx = ux; if (uw > ww) { ww = uw; where = `n = ${n}, i = ${i}`; }
        }
      }
      ok(wx <= 0.51 && ww <= 0.51, `every node and weight of rules 1 to 64 is the double nearest the exact one (2080 of each; worst ${wx.toFixed(3)} and ${ww.toFixed(3)} ulps` + (ww > 0.51 ? `, at ${where}` : '') + ')');
    }
    let shape = true, sumw = true, exact = true;
    for (let n = 1; n <= 64; n++) {
      const r = Q.rule(n);
      if (r.n !== n || r.x.length !== n || r.w.length !== n || !Object.isFrozen(r) || !Object.isFrozen(r.x)) shape = false;
      for (let i = 0; i < n; i++) {
        if (!(r.x[i] > -1 && r.x[i] < 1 && r.w[i] > 0) || (i && !(r.x[i] > r.x[i - 1]))) shape = false;
        if (r.x[i] !== -r.x[n - 1 - i] || r.w[i] !== r.w[n - 1 - i]) shape = false;
      }
      const s = r.w.reduce((a, b) => a + b, 0);
      if (Math.abs(s - 2) > 4 * n * EPS) sumw = false;
      for (let k = 2; k <= Math.min(2 * n - 2, 60); k += 2) {
        let q = 0;
        for (let i = 0; i < n; i++) { let xk = 1; for (let j = 0; j < k; j++) xk *= r.x[i]; q += r.w[i] * xk; }
        if (Math.abs(q * (k + 1) / 2 - 1) > 64 * n * EPS) exact = false;
      }
    }
    ok(shape, 'rule(n), n = 1 … 64: nodes ascending inside (−1, 1), symmetric to the bit, positive weights, frozen');
    ok(sumw && exact, 'the weights add up to 2, and each rule integrates x^k exactly (to rounding) for even k up to 2n − 2');
    const r2 = Q.rule(2), r3 = Q.rule(3);
    ok(Q.rule(1).x[0] === 0 && Q.rule(1).w[0] === 2 && Math.abs(r2.x[1] - Math.sqrt(1 / 3)) <= EPS && Math.abs(r2.w[0] - 1) <= 2 * EPS && Math.abs(r3.x[2] - Math.sqrt(0.6)) <= EPS && Math.abs(r3.w[0] - 5 / 9) <= 2 * EPS && Math.abs(r3.w[1] - 8 / 9) <= 2 * EPS && r3.x[1] === 0, 'the known rules: n = 1 (0; 2), n = 2 (±1/√3; 1), n = 3 (0, ±√(3/5); 8/9, 5/9)');
    ok(Q.rule(10) === Q.rule(10), 'rules are computed once and kept');
    ok(Math.abs(Q.fixed(T.sin, 0, T.PI, 12) - 2) <= 4 * EPS && Math.abs(Q.fixed((x) => x ** 19, 0, 1, 10) - 1 / 20) <= 4 * EPS, 'fixed: ∫₀^π sin = 2 to 4 ulps (12 points); x^19 exactly with 10 points');
    const sq = Q.adaptive(Math.sqrt, 0, 1, { eps: 1e-12 });
    ok(Math.abs(sq.value - 2 / 3) <= 1e-12 && sq.error <= 1e-12 && Object.isFrozen(sq), `adaptive: ∫₀¹ √x = 2/3 to 1e-12 despite the singular slope at 0 (${sq.intervals} pieces, ${sq.evaluations} evaluations)`);
    const peak = Q.adaptive((x) => 1 / (1e-4 + (x - 0.3) * (x - 0.3)), 0, 1, { eps: 1e-10 });
    const peakExact = (T.atan(70) + T.atan(30)) * 100;
    ok(Math.abs(peak.value - peakExact) <= 1e-10 * 4, 'adaptive: a sharp peak at 0.3, to 1e-10');
    ok(Q.adaptive(T.cos, 1, 0, { eps: 1e-14 }).value === -Q.adaptive(T.cos, 0, 1, { eps: 1e-14 }).value && Q.adaptive(T.cos, 2, 2, { eps: 1 }).value === 0, 'a > b flips the sign; a = b gives 0');
    ok(same(Q.adaptive(T.exp, -3, 2, { eps: 1e-13 }), Q.adaptive(T.exp, -3, 2, { eps: 1e-13 })), 'the same input gives the same pieces and the same bits');
    ok(refuses(() => Q.adaptive((x) => 1 / Math.sqrt(Math.abs(x - 0.5) + 1e-300), 0, 1, { eps: 1e-15, maxDepth: 6 }), 'solid.err.no_convergence', { what: 'integral' }), 'a piece that would need more than maxDepth halvings → no_convergence');
    ok(refuses(() => Q.adaptive(Math.sqrt, 0, 1, { eps: 1e-14, budget: L.makeBudget({ maxIterations: 3 }) }), 'solid.err.limit', { what: 'iterations' }), 'the budget stops it: solid.err.limit');
    const t0 = performance.now();
    const ends = refuses(() => Q.adaptive((x) => (x < 0.3 ? 0 : 1), 0, 1, { eps: 1e-15 }), 'solid.err.no_convergence') && refuses(() => Q.adaptive((x) => T.sin(1e6 * x), 0, 1, { eps: 1e-12 }), 'solid.err.no_convergence', { what: 'integral' });
    ok(ends && performance.now() - t0 < 5000, 'a jump or a wild oscillation is refused quickly with the default limits (maxDepth 40, maxPieces 4096): it always ends');
    const t1 = performance.now();
    const many = Q.adaptive((x) => T.sin(1e6 * x), 0, 1, { eps: 1e-6, maxPieces: 100000, maxDepth: 60 });
    const manyMs = performance.now() - t1;
    ok(Math.abs(many.value - (1 - T.cos(1e6)) / 1e6) <= 1e-6 && many.error <= 1e-6 && many.intervals > 30000, `adaptive with many pieces: ∫₀¹ sin(1e6 x) to 1e-6 (${many.intervals} pieces)`);
    ok(manyMs < 5000, `and its cost grows with the pieces, not with their square: ${many.intervals} pieces in ${Math.round(manyMs)} ms (the worst piece comes from a heap)`);
    ok(same(many, Q.adaptive((x) => T.sin(1e6 * x), 0, 1, { eps: 1e-6, maxPieces: 100000, maxDepth: 60 })), 'many pieces: the same input gives the same bits');
    // the heap must choose exactly the pieces a plain search for the worst one would (largest error, leftmost of equals)
    const plain = (f, a, b, eps, order = 10) => {
      const r = Q.rule(order), gl = (p, q) => { const c = 0.5 * p + 0.5 * q, h = 0.5 * q - 0.5 * p; let t = 0; for (let i = 0; i < r.n; i++) t += r.w[i] * f(c + h * r.x[i]); return h * t; };
      const mk = (p, q, whole) => { const m = 0.5 * p + 0.5 * q, l = gl(p, m), rr = gl(m, q); return { p, q, m, l, r: rr, value: l + rr, err: Math.abs(l + rr - whole) }; };
      const ps = [mk(a, b, gl(a, b))];
      for (;;) {
        let total = 0, sum = 0, w = 0;
        ps.forEach((pc, i) => { total += pc.err; sum += pc.value; if (pc.err > ps[w].err) w = i; });
        if (total <= eps || total <= 4 * EPS * Math.abs(sum)) return { value: sum, error: total, intervals: ps.length };
        ps.splice(w, 1, mk(ps[w].p, ps[w].m, ps[w].l), mk(ps[w].m, ps[w].q, ps[w].r));
      }
    };
    const shapes = [[Math.sqrt, 0, 1, 1e-11], [(x) => 1 / (1e-4 + (x - 0.3) * (x - 0.3)), 0, 1, 1e-9], [(x) => T.sin(300 * x), 0, 1, 1e-10], [(x) => Math.abs(x - 0.4), 0, 1, 1e-13], [(x) => T.exp(-50 * x) * T.cos(40 * x), 0, 2, 1e-13], [(x) => T.cbrt(x - 0.7), 0, 1, 1e-8]];
    const differ = shapes.map(([f, a, b, eps], i) => { const h = Q.adaptive(f, a, b, { eps }), w = plain(f, a, b, eps); return h.intervals === w.intervals && Object.is(h.value, w.value) && Object.is(h.error, w.error) ? null : `#${i}: ${h.intervals} pieces against ${w.intervals}`; }).filter((x) => x !== null);
    // equal errors: a shape repeated in both halves, seen by the 1-point rule (dyadic nodes), gives exact ties, and the leftmost piece must go first (same calls, in order)
    const step = (x) => Math.sqrt(x < 0.5 ? x : x - 0.5), seenH = [], seenP = [];   // the same shape in each half of [0, 1], to the bit
    const tieH = Q.adaptive((x) => { seenH.push(x); return step(x); }, 0, 1, { eps: 1e-5, order: 1 }), tieP = plain((x) => { seenP.push(x); return step(x); }, 0, 1, 1e-5, 1);
    ok(tieH.intervals === tieP.intervals && tieH.intervals >= 20 && same(seenH, seenP), `of pieces with equal errors the leftmost is halved first: the same ${seenH.length} evaluations in the same order as the plain search`);
    ok(differ.length === 0, `the heap picks the pieces a plain search for the worst would: the same pieces, value and error to the bit on ${shapes.length} integrands` + (differ.length ? ' (' + differ.join('; ') + ')' : ''));
    ok(refuses(() => Q.adaptive(Math.sqrt, 0, 1, { eps: 1e-3, maxPieces: 100001 }), bad, { name: 'maxPieces', why: 'out_of_range' }), 'maxPieces above 100000 is refused');
    ok(refuses(() => Q.rule(0), bad, { name: 'n' }) && refuses(() => Q.rule(65), bad) && refuses(() => Q.fixed(() => NaN, 0, 1), bad, { name: 'f', why: 'not_finite' }) && refuses(() => Q.adaptive(Math.sqrt, 0, 1, {}), bad, { name: 'eps' }) && refuses(() => Q.fixed(1, 0, 1), bad, { why: 'not_a_function' }) && refuses(() => Q.fixed(Math.sqrt, 0, Infinity), bad, { name: 'b' }), 'bad orders, functions, ends and tolerances are refused');
  });

  // ================================================================================================ roots
  section('roots', 'quadratic and cubic: backward errors over 1e5 cases, exact discriminant signs; Brent and bracketed Newton', () => {
    const g = P.makePrng(25);
    const resid = (cs, r) => { let p = 0, s = 0; for (const c of cs) { p = p * r + c; s = s * Math.abs(r) + Math.abs(c); } return [Math.abs(p), s]; };
    let qb = true, qs = true, count = true;
    for (let i = 0; i < 1e5; i++) {
      const sc = F.pow2(Math.floor(g.range(-200, 200)));
      const cs = i % 4 === 0 ? (() => { const p = g.int(41) - 20, q = g.int(41) - 20, a = g.int(20) + 1; return [a * a * sc, 2 * a * p * sc, p * p * sc]; })() : [g.range(-10, 10) * sc, g.range(-10, 10) * sc, g.range(-10, 10) * sc];
      const rs = Ro.quadratic(cs[0], cs[1], cs[2]);
      for (const r of rs) { const [p, s] = resid(cs, r); if (p > 16 * EPS * s) qb = false; }
      if (rs.length === 2 && !(rs[0] <= rs[1])) qs = false;
      const [a, b, c] = cs.map(X);
      const D = xadd(xmul(b, b), xmul({ N: -4n * a.N, E: a.E }, c)), sign = D.N > 0n ? 2 : D.N < 0n ? 0 : 1;
      if (cs[0] !== 0 && !((sign === 0 && rs.length === 0) || (sign === 2 && rs.length === 2 && rs[0] !== rs[1]) || (sign === 1 && rs.length === 2 && rs[0] === rs[1]))) count = false;
    }
    ok(qb, 'quadratic: every root has a residual within 16 ulps of the polynomial\'s size there (1e5 cases over 400 binades, a quarter of them perfect squares; seed 25)');
    ok(count && qs, 'quadratic: no roots, a double root or two roots exactly as the exact (BigInt) discriminant says, ascending');
    ok(same(Ro.quadratic(1, -3, 2), [1, 2]) && same(Ro.quadratic(94906265.625, -189812534, 94906268.375), [1, 94906268.375 / 94906265.625]) && same(Ro.quadratic(F.pow2(1000), -3 * F.pow2(1000), 2 * F.pow2(1000)), [1, 2]) && same(Ro.quadratic(F.pow2(-1060), -3 * F.pow2(-1060), 2 * F.pow2(-1060)), [1, 2]), "quadratic: Kahan's hard case (roots 1 and 1.0000000289…), and coefficients near overflow and underflow");
    ok(same(Ro.quadratic(0, 2, -4), [2]) && same(Ro.quadratic(0, 0, 1), []) && same(Ro.quadratic(1, 0, 1), []) && same(Ro.quadratic(1, -2, 1), [1, 1]) && refuses(() => Ro.quadratic(0, 0, 0), bad, { why: 'all_zero' }) && refuses(() => Ro.quadratic(1, NaN, 0), bad, { why: 'not_finite' }), 'quadratic: linear, no root, a double root; all-zero and NaN refused');
    let cb = true, sep = true;
    for (let i = 0; i < 1e5; i++) {
      let cs;
      if (i % 2) {
        const r = [g.range(-10, 10), g.range(-10, 10), g.range(-10, 10)].sort((p, q) => p - q);
        if (r[1] - r[0] < 0.1 || r[2] - r[1] < 0.1) continue;
        const a = g.range(0.5, 2);
        cs = [a, -a * (r[0] + r[1] + r[2]), a * (r[0] * r[1] + r[0] * r[2] + r[1] * r[2]), -a * r[0] * r[1] * r[2]];
        const got = Ro.cubic(...cs);
        if (got.length !== 3 || !got.every((x, k) => Math.abs(x - r[k]) <= 1e-12 * 100)) sep = false;
      } else cs = [g.range(-10, 10), g.range(-10, 10), g.range(-10, 10), g.range(-10, 10)];
      const rs = Ro.cubic(...cs);
      if (cs[0] !== 0 && rs.length < 1) cb = false;
      for (const r of rs) { const [p, s] = resid(cs, r); if (p > 64 * EPS * s) cb = false; }
    }
    ok(cb, 'cubic: at least one real root, each with a residual within 64 ulps of the polynomial\'s size (1e5 cubics)');
    ok(sep, 'cubic: three separated real roots found to 1e-10 (5e4 cubics built from their roots)');
    ok(same(Ro.cubic(1, -6, 11, -6), [1, 2, 3]) && same(Ro.cubic(1, -3, 3, -1), [1, 1, 1]) && same(Ro.cubic(4, -24, 44, -24), [1, 2, 3]) && same(Ro.cubic(1, -111, 1110, -1000), [1, 10, 100]) && same(Ro.cubic(2, 0, -2, 0), [-1, 0, 1]) && same(Ro.cubic(0, 1, -3, 2), [1, 2]) && same(Ro.cubic(1, 0, 0, -8), [2]), 'cubic: integer roots exactly, a triple root, d = 0, a = 0, one real root');
    // ---- every finite input, checked exactly: the count against the exact discriminant, each root against an exact sign change
    const xk = (k, v) => ({ N: BigInt(k) * v.N, E: v.E }), xsum = (...vs) => vs.reduce((p, q) => xadd(p, q)), sgnX = (v) => (v.N > 0n ? 1 : v.N < 0n ? -1 : 0);
    const xval = (cs, x) => cs.reduce((p, c) => xadd(xmul(p, X(x)), X(c)), { N: 0n, E: 0 });
    const step = (r, n, up) => { for (let k = 0; k < n; k++) r = up ? F.nextUp(r) : F.nextDown(r); return r; };
    // a finite root sits within n doubles of an exact sign change; an infinite one stands for a root past MAX on that side
    const placed = (cs, r, n) => {
      const lead = Math.sign(cs.find((c) => c !== 0)), odd = (cs.length - 1 - cs.findIndex((c) => c !== 0)) % 2 === 1;
      if (r === Infinity) return sgnX(xval(cs, F.MAX)) !== lead;
      if (r === -Infinity) return sgnX(xval(cs, -F.MAX)) !== (odd ? -lead : lead);
      if (sgnX(xval(cs, r)) === 0) return true;
      for (let k = 1; k <= n; k++) {                     // any window up to n doubles each way (two roots may share a wide one)
        const lo = step(r, k, false), hi = step(r, k, true);
        if (!Number.isFinite(lo) || !Number.isFinite(hi) || sgnX(xval(cs, lo)) * sgnX(xval(cs, hi)) <= 0) return true;
      }
      return false;
    };
    const anyCoef = (h, lo, hi) => (h.u32() & 1 ? -1 : 1) * F.pow2(lo + h.int(hi - lo + 1)) * h.range(1, 2);
    const h3 = P.makePrng(2607), qBad = [];
    for (let i = 0; i < 6e4; i++) {
      const fam = i % 3, mk = () => (fam === 0 ? anyCoef(h3, -1074, 1023) : fam === 1 ? anyCoef(h3, -300, 300) : anyCoef(h3, -3, 3));
      const cs = [mk(), i % 11 === 0 ? 0 : mk(), i % 13 === 0 ? 0 : mk()];
      let rs; try { rs = Ro.quadratic(...cs); } catch (e) { qBad.push(`refused ${cs}: ${e.code}`); continue; }
      const [a, b, c] = cs.map(X), sign = sgnX(xsum(xmul(b, b), xk(-4, xmul(a, c))));
      if (rs.length !== (sign < 0 ? 0 : 2)) { qBad.push(`${rs.length} roots, discriminant sign ${sign}: ${cs}`); continue; }
      if (sign === 0 && rs[0] !== rs[1]) qBad.push(`a double root returned as two: ${cs} → ${rs}`);
      if (sign > 0 && !(rs[0] <= rs[1])) qBad.push(`not ascending: ${cs}`);
      if (rs.some((r) => r !== r)) { qBad.push(`NaN: ${cs}`); continue; }
      if (sign > 0 && (fam < 2 || Math.abs(rs[1] - rs[0]) > 1e-3 * Math.abs(rs[1]))) for (const r of rs) if (!placed(cs, r, 4)) qBad.push(`root ${r} of ${cs} is not within 4 doubles of a sign change`);
    }
    ok(qBad.length === 0, 'quadratic, any finite coefficients (subnormal to MAX, zeros among them; 6e4 cases, seed 2607): the count is what the exact discriminant says, a double root comes back as a pair, and each root is within 4 doubles of an exact sign change' + (qBad.length ? `\n       ${qBad.length} wrong, e.g. ${qBad.slice(0, 3).join(' | ')}` : ''));
    const q1 = Ro.quadratic(1e-320, 1, 1), q2 = Ro.quadratic(1e-200, 1e200, 1e-200), q3 = Ro.quadratic(1e-200, 1, 1e-200), q4 = Ro.quadratic(0, 5e-324, 1e308), q5 = Ro.quadratic(1e308, 1e308, -1e308);
    ok(q1[0] === -Infinity && q1[1] === -1 && q2[0] === -Infinity && Object.is(q2[1], -0) && q3.length === 2 && Math.abs(q3[0] / -1e200 - 1) <= 2 * EPS && Math.abs(q3[1] / -1e-200 - 1) <= 2 * EPS && q4[0] === -Infinity && Math.abs(q5[1] - 0.6180339887498949) <= EPS,
      'quadratic at the ends of the range: a root past the largest double comes back as ±Infinity (it exists, and its place in the order is right), one below the smallest as ±0, and the others are unharmed');

    // cubic: whole-number roots, where the coefficients are exact and so is the answer about repeats
    const cBad = [], kinds = ['distinct', 'double', 'triple', 'adjacent', 'large'];
    let cWorst = 0;
    for (let i = 0; i < 5e4; i++) {
      const k = i % 5, S = k === 4 ? 100000 : 100, w = () => h3.int(2 * S + 1) - S;
      let r1 = w(), r2 = w(), r3 = w();
      if (k === 1) r2 = r1; if (k === 2) { r2 = r1; r3 = r1; } if (k === 3) r2 = r1 + 1;
      const m = k === 4 ? 1 : (1 + h3.int(50)) * (h3.u32() & 1 ? 1 : -1), cs = [m, -m * (r1 + r2 + r3), m * (r1 * r2 + r1 * r3 + r2 * r3), -m * r1 * r2 * r3];
      const want = [r1, r2, r3].sort((p, q) => p - q);
      let rs; try { rs = Ro.cubic(...cs); } catch (e) { cBad.push(`refused ${kinds[k]} ${want}: ${e.code}`); continue; }
      if (rs.length !== 3) { cBad.push(`${kinds[k]} roots ${want}: ${rs.length} returned`); continue; }
      const repeated = want[0] === want[1] || want[1] === want[2];
      if (repeated && !rs.every((x, j) => x === want[j])) cBad.push(`repeated whole roots ${want} came back as ${rs}`);
      const err = Math.max(...rs.map((x, j) => Math.abs(x - want[j]) / Math.max(1, Math.abs(want[j]))));
      cWorst = Math.max(cWorst, err);
      if (err > 8 * EPS) cBad.push(`${kinds[k]} roots ${want} came back as ${rs}`);
    }
    ok(cBad.length === 0, `cubic with whole-number roots (5e4 cubics: distinct, double, triple, adjacent, large): always three roots; a double or triple root comes back exactly, as often as it repeats; the rest within 8 EPS (worst ${(cWorst / EPS).toFixed(1)} EPS)` + (cBad.length ? `\n       ${cBad.length} wrong, e.g. ${cBad.slice(0, 3).join(' | ')}` : ''));
    // the count, for any coefficients in the domain, is the exact discriminant's
    const disc = (cs) => { const [a, b, c, d] = cs.map(X), m = xmul; return sgnX(xsum(xk(18, m(m(a, b), m(c, d))), xk(-4, m(m(b, b), m(b, d))), m(m(b, b), m(c, c)), xk(-4, m(a, m(c, m(c, c)))), xk(-27, m(m(a, a), m(d, d))))); };
    const dBad = []; let refusedWide = 0, three = 0, one = 0;
    for (let i = 0; i < 6e4; i++) {
      const fam = i % 3, mk = () => (fam === 0 ? anyCoef(h3, -110, 110) : fam === 1 ? anyCoef(h3, -20, 20) : h3.int(41) - 20);
      const cs = [mk() || 1, mk(), mk(), mk()];
      let rs; try { rs = Ro.cubic(...cs); } catch (e) { if (e.code === 'solid.err.bad_input' && e.vars.why === 'out_of_range' && fam === 0) refusedWide++; else dBad.push(`refused ${cs}: ${e.code}`); continue; }
      const sd = disc(cs);
      if (rs.length !== (sd < 0 ? 1 : 3)) { dBad.push(`${rs.length} roots, discriminant sign ${sd}: ${cs} → ${rs}`); continue; }
      if (sd > 0) three++; else if (sd < 0) one++;
      if (rs.some((r) => !Number.isFinite(r)) || !(rs.length === 1 || (rs[0] <= rs[1] && rs[1] <= rs[2]))) dBad.push(`not finite or not ascending: ${cs} → ${rs}`);
      if (sd < 0 && !placed(cs, rs[0], 16)) dBad.push(`the single root ${rs[0]} of ${cs} is not within 16 doubles of a sign change`);
      if (sd === 0 && !(rs[0] === rs[1] || rs[1] === rs[2])) dBad.push(`discriminant 0 but no repeated root: ${cs} → ${rs}`);
    }
    ok(dBad.length === 0 && three > 5000 && one > 5000, `cubic, 6e4 cubics over 220 binades and small whole numbers: one root or three exactly as the exact discriminant says (${one} and ${three}), a zero discriminant gives a repeated root, a single root is within 16 doubles of an exact sign change; ${refusedWide} too widely scaled were refused` + (dBad.length ? `\n       ${dBad.length} wrong, e.g. ${dBad.slice(0, 3).join(' | ')}` : ''));
    // two roots close together, the hard case for any cubic solver: the coefficients are doubles, and the exact polynomial
    // they stand for decides. Each root must have an exact sign change within 4 doubles of it, on one side or the other.
    const beside = (cs, r, n) => { const s0 = sgnX(xval(cs, r)); if (s0 === 0) return true; for (let k = 1; k <= n; k++) if (sgnX(xval(cs, step(r, k, false))) !== s0 || sgnX(xval(cs, step(r, k, true))) !== s0) return true; return false; };
    const nBad = []; let closeThree = 0, far4 = 0;
    for (let i = 0; i < 3e4; i++) {
      const k = i % 3; let cs;
      if (k === 0) { const r = h3.int(2001) - 1000, dl = F.pow2(-(20 + h3.int(30))), sx = h3.int(2001) - 1000; cs = [1, -(2 * r + dl + sx), r * (r + dl) + sx * (2 * r + dl), -r * (r + dl) * sx]; }
      else if (k === 1) { const r = h3.range(-3, 3), dl = F.pow2(-(8 + h3.int(44))) * h3.range(1, 2), sx = h3.range(-3, 3); cs = [1, -(2 * r + dl + sx), r * (r + dl) + sx * (2 * r + dl), -r * (r + dl) * sx]; }
      else { const r = h3.range(-2, 2), sx = h3.range(-2, 2), e = h3.range(-1, 1) * F.pow2(-h3.int(52)); cs = [1, -(2 * r + sx), r * r + 2 * r * sx - e, -r * r * sx]; }
      const rs = Ro.cubic(...cs), sd = disc(cs);
      if (rs.length !== (sd < 0 ? 1 : 3)) { nBad.push(`${rs.length} roots, discriminant sign ${sd}: ${cs}`); continue; }
      if (sd > 0) closeThree++;
      for (const r of rs) if (sd !== 0 && !beside(cs, r, 4)) { far4++; if (nBad.length < 3) nBad.push(`root ${r} of ${cs}`); }
    }
    ok(nBad.length === 0 && closeThree > 5000, `cubic with two roots close together (3e4 cubics, the pair from 2^-8 down to nothing apart; ${closeThree} with three roots): the count is exact, and every root has an exact sign change within 4 doubles` + (nBad.length ? `\n       ${far4} roots farther; e.g. ${nBad.join(' | ')}` : ''));
    // a pair closer than doubles can separate (1 ± 2^-120), on either side of the third root; and a pair that defeats the
    // fast path beside a root 200 binades smaller, which bisection must reach in its ~70 steps
    const tight1 = Ro.cubic(-F.pow2(-240), 1, -2, 1), tight2 = Ro.cubic(F.pow2(-240), 1, 2, 1), tight3 = Ro.cubic(-F.pow2(-240), -1, 2, -1), tight4 = Ro.cubic(F.pow2(-240), -1, -2, -1);
    ok(same([...tight1], [1, 1, F.pow2(240)]) && same([...tight2], [-F.pow2(240), -1, -1]) && same([...tight3], [-F.pow2(240)]) && same([...tight4], [F.pow2(240)]),
      'cubic: two roots 2^-119 apart beside one at ±2^240 (three real roots, exactly) come back as the pair at ±1 and the far root, on whichever side the pair lies; with the sign that makes the pair complex, the far root alone');
    const oneThird = 0.3333333333333333, tight5 = Ro.cubic(-F.pow2(-240), 9, -6, 1), tight6 = Ro.cubic(F.pow2(-240), 9, 6, 1);
    ok(same([...tight5], [oneThird, oneThird, 9 * F.pow2(240)]) && same([...tight6], [-9 * F.pow2(240), -oneThird, -oneThird]),
      'cubic: the same around ±1/3, which no double lies between: both roots of the pair are reported at the double nearest 1/3');
    const e40 = F.pow2(-50), mixed = [1, -(2 + e40), 1 + e40, F.pow2(-200) * (1 + e40)], mix = Ro.cubic(...mixed);
    ok(mix.length === 3 && Math.abs(mix[0] / -F.pow2(-200) - 1) <= 4 * EPS && mix.every((r) => beside(mixed, r, 4)) && mix[1] < mix[2] && mix[2] - mix[1] < 2 * e40,
      `cubic: roots at −2^-200, 1 and 1 + 2^-50 together: each within 4 doubles of its sign change (${mix.map((r) => r.toExponential(3)).join(', ')})`);
    // scale: a change of variable x → 2^k x and a common factor 2^j move nothing but exponents
    let inv = true;
    for (let i = 0; i < 4000; i++) {
      const cs = [h3.range(0.5, 2), i % 4 === 0 ? 0 : h3.range(-4, 4), h3.range(-4, 4), i % 8 < 2 ? 0 : h3.range(-4, 4)], base = Ro.cubic(...cs), k = h3.int(401) - 200, j = h3.int(401) - 200;
      const moved = Ro.cubic(cs[0] * F.pow2(j - 3 * k), cs[1] * F.pow2(j - 2 * k), cs[2] * F.pow2(j - k), cs[3] * F.pow2(j));
      if (!(moved.length === base.length && moved.every((x, n) => x === base[n] * F.pow2(k)))) inv = false;
    }
    ok(inv, 'cubic: scaling x by 2^k and every coefficient by 2^j (k and j from −200 to 200) scales the roots by 2^k and changes no other bit (4000 cubics, a third with zero coefficients, where two changes of variable tie)');
    const c1 = Ro.cubic(1e-110, 1, -3, 2), c2 = Ro.cubic(1e-200, 0, 0, 1e200), c3 = Ro.cubic(1, 0, 0, -5e-324), c4 = Ro.cubic(5e-324, 1e308, 0, 0);
    ok(c1.length === 3 && Math.abs(c1[0] / -1e110 - 1) <= 4 * EPS && Math.abs(c1[1] - 1) <= 4 * EPS && Math.abs(c1[2] - 2) <= 8 * EPS && c2.length === 1 && Math.abs(c2[0] / -2.1544346900318838e133 - 1) <= 4 * EPS && c3.length === 1 && Math.abs(c3[0] / 1.7031839360032603e-108 - 1) <= 4 * EPS && same([...c4], [-Infinity, 0, 0]),
      'cubic far from scale 1: a leading coefficient of 1e-110 (roots −1e110, 1, 2), x³ = −1e400 and x³ = 5e-324, and a root past the largest double as −Infinity');
    ok(refuses(() => Ro.cubic(1e-150, 1, -3, 2), bad, { name: 'coefficients', why: 'out_of_range' }) && refuses(() => Ro.cubic(1, 1e100, 1, 1e-100), bad, { why: 'out_of_range' }), 'cubic refuses coefficients no power-of-two change of variable brings within 2^250 of each other (roots some 1e75 apart), rather than answer wrongly');
    const near = Ro.cubic(1, -(7 + F.pow2(-26)), 11 + 6 * F.pow2(-26), -5 * (1 + F.pow2(-26)));     // roots 1, 1 + 2^-26, 5: exact coefficients
    ok(near.length === 3 && Math.abs(near[0] - 1) <= F.pow2(-40) && Math.abs(near[1] - (1 + F.pow2(-26))) <= F.pow2(-40) && Math.abs(near[2] - 5) <= 8 * EPS, `cubic: two roots 2^-26 apart are both found (errors ${Math.abs(near[0] - 1).toExponential(1)} and ${Math.abs(near[1] - 1 - F.pow2(-26)).toExponential(1)})`);
    // a bracket wider than the largest double
    const wideB = Ro.brent((x) => x - 1, -1e308, 1e308), wideN = Ro.newton((x) => x - 1, () => 1, -F.MAX, F.MAX), wideS = Ro.brent((x) => (x < -3e307 ? -1 : 1), -F.MAX, F.MAX);
    ok(Math.abs(wideB.x - 1) <= 4 * EPS + 2 * EPS * EPS * 1e308 && wideN.x === 1 && Math.abs(wideS.x / -3e307 - 1) <= 4 * EPS, 'brent and newton on a bracket wider than the largest double (−1e308 to 1e308, −MAX to MAX): no overflow inside');
    const f1 = (x) => x * x * x - 2 * x - 5, d1 = (x) => 3 * x * x - 2;
    const b1 = Ro.brent(f1, 2, 3), n1 = Ro.newton(f1, d1, 2, 3);
    ok(Math.abs(b1.x - 2.0945514815423265) <= 4 * EPS * 2.1 && Math.abs(n1.x - 2.0945514815423265) <= 4 * EPS * 2.1 && b1.iterations < 15 && n1.iterations < 10 && Object.isFrozen(b1), `brent and newton: x³ − 2x − 5 = 0 at 2.0945514815423265 (brent ${b1.iterations} steps, newton ${n1.iterations})`);
    const k1 = Ro.brent((x) => T.cos(x) - x, 0, 1, { eps: 1e-6 });
    ok(Math.abs(k1.x - 0.7390851332151607) <= 1e-6, 'brent: cos x = x to the eps asked for');
    const n2 = Ro.newton(T.atan, (x) => 1 / (1 + x * x), -10, 20, { x0: 15 });
    ok(n2.x === 0 || Math.abs(n2.x) <= 4 * EPS, `newton: atan x = 0 from x0 = 15, where plain Newton diverges, by falling back to bisection (${n2.iterations} steps)`);
    // roots at 0, where a tolerance relative to x alone can never be met (the default eps is 0)
    const cubed = (x) => x * x * x, fifth = (x) => x * x * x * x * x, flat = (x) => (x < 0 ? -1 : 1) * Math.sqrt(Math.abs(x));
    const atZero = [['x/(1+|x|)', (x) => x / (1 + Math.abs(x)), (x) => 1 / ((1 + Math.abs(x)) * (1 + Math.abs(x)))], ['x³', cubed, (x) => 3 * x * x], ['x⁵', fifth, (x) => 5 * x * x * x * x], ['±√|x|', flat, null], ['atan', T.atan, (x) => 1 / (1 + x * x)]];
    const zeroBad = [];
    let zeroIts = 0;
    for (const [name, f, df] of atZero) for (const [lo, hi] of [[-1, 2], [-3e-7, 1e-7], [-1e10, 4e9]]) {
      const floor = 4 * EPS * EPS * Math.max(Math.abs(lo), Math.abs(hi));
      try {
        const b = Ro.brent(f, lo, hi); zeroIts = Math.max(zeroIts, b.iterations);
        if (!(Math.abs(b.x) <= floor)) zeroBad.push(`brent ${name} [${lo}, ${hi}] → ${b.x}`);
        if (df) { const n = Ro.newton(f, df, lo, hi); zeroIts = Math.max(zeroIts, n.iterations); if (!(Math.abs(n.x) <= floor)) zeroBad.push(`newton ${name} [${lo}, ${hi}] → ${n.x}`); }
      } catch (e) { zeroBad.push(`${name} [${lo}, ${hi}] refused: ${e.code}`); }
    }
    ok(zeroBad.length === 0, `brent and newton with the default eps find a root at 0 (simple, triple, quintuple, vertical) to EPS² of the bracket's size (most iterations: ${zeroIts})` + (zeroBad.length ? '\n       ' + zeroBad.join('\n       ') : ''));
    const small = Ro.brent((x) => x - 1e-9, -1, 2), smallN = Ro.newton((x) => x - 1e-9, () => 1, -1, 2), third = Ro.brent((x) => (x - 0.3) * (x - 0.3) * (x - 0.3), -1, 2);
    ok(Math.abs(small.x - 1e-9) <= 4 * EPS * 1e-9 && Math.abs(smallN.x - 1e-9) <= 4 * EPS * 1e-9 && Math.abs(third.x - 0.3) <= 1e-15, 'a small root in a wide bracket keeps its relative accuracy (1e-9 in [−1, 2]), and a triple root at 0.3 is found');
    ok(Ro.brent((x) => x - 1, 1, 5).x === 1 && Ro.newton((x) => x - 5, () => 1, 1, 5).x === 5, 'a root at a bracket end is returned at once');
    ok(refuses(() => Ro.brent(f1, 3, 4), 'solid.err.no_bracket', { fa: 16, fb: 51 }) && refuses(() => Ro.newton(f1, d1, 3, 4), 'solid.err.no_bracket'), 'no sign change → solid.err.no_bracket { fa, fb }');
    ok(refuses(() => Ro.brent(f1, 2, 3, { maxIterations: 2 }), 'solid.err.no_convergence', { what: 'brent', iterations: 2 }) && refuses(() => Ro.newton((x) => x * x * x, (x) => 3 * x * x, -1, 2, { maxIterations: 2 }), 'solid.err.no_convergence', { what: 'newton' }), 'too few iterations → solid.err.no_convergence { what, iterations }');
    ok(refuses(() => Ro.brent(f1, 2, 3, { budget: L.makeBudget({ maxIterations: 4 }) }), 'solid.err.limit'), 'the budget counts evaluations');
    ok(refuses(() => Ro.brent((x) => (x > 2.5 ? NaN : -1), 2, 3), bad, { name: 'f', why: 'not_finite' }) && refuses(() => Ro.brent(f1, 2, 3, { eps: -1 }), bad, { name: 'eps' }) && refuses(() => Ro.newton(f1, d1, 2, 3, { x0: 9 }), bad, { name: 'x0', why: 'outside_bracket' }) && refuses(() => Ro.brent('f', 0, 1), bad), 'bad functions, tolerances and starts are refused');
  });

  // ================================================================================================ linalg
  section('linalg', 'LU, rcond on the Hilbert family (exact κ in BigInt), banded LU, QR and least squares', () => {
    const g = P.makePrng(26);
    const randMat = (m, n) => Array.from({ length: m }, () => Array.from({ length: n }, () => g.range(-1, 1)));
    const mv = (A, x) => A.map((r) => r.reduce((s, v, j) => s + v * x[j], 0));
    const normInfV = (v) => Math.max(0, ...v.map(Math.abs));
    let back = true, invOk = true;
    for (let t = 0; t < 2000; t++) {
      const n = 1 + g.int(12), A = randMat(n, n), b = Array.from({ length: n }, () => g.range(-1, 1));
      const x = LA.solve(A, b), r = b.map((v, i) => v - mv(A, x)[i]);
      if (normInfV(r) > 8 * n * EPS * (LA.normInf(A) * normInfV(x) + normInfV(b))) back = false;
      if (n <= 6 && LA.rcond1(A) > 1e-6) {
        const Ai = LA.inverse(A);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < n; k++) s += Ai[i][k] * A[k][j]; if (Math.abs(s - (i === j ? 1 : 0)) > 1e8 * EPS) invOk = false; }
      }
    }
    ok(back, 'solve: backward error within 8 n ulps of ‖A‖‖x‖ + ‖b‖ (2000 random systems, n ≤ 12; seed 26)');
    ok(invOk, 'inverse(A) · A = I for the well-conditioned ones');
    let rc = true;
    const notes = [];
    for (let n = 2; n <= 11; n++) {
      const h = hilbert(n), A = h.inv.map((r) => r.map(Number));
      const exactRcond = Number(h.kappaDen) / Number(h.kappaNum);
      const est = LA.rcond1(A), ratio = est / exactRcond;
      notes.push(`n=${n} κ₁=${(1 / exactRcond).toExponential(2)} est/true=${ratio.toFixed(3)}`);
      if (!(ratio >= 0.9 && ratio <= 3)) rc = false;
      const b = mv(A, new Array(n).fill(1)), x = LA.solve(A, b), r = b.map((v, i) => v - mv(A, x)[i]);
      if (normInfV(r) > 8 * n * EPS * (LA.normInf(A) * normInfV(x) + normInfV(b))) rc = false;
    }
    ok(rc, 'rcond1 on the inverse Hilbert matrices (integer, exact in doubles; their inverse is the Hilbert matrix, so κ₁ is exact in BigInt), n = 2 … 11: estimate/true in [0.9, 3], and solves stay backward stable');
    if (!rc) console.log('       ' + notes.join('; '));
    const dg = (v, n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? v : 0)));
    ok(LA.det(dg(1e200, 2)) === Infinity && LA.det(dg(-1e200, 3)) === -Infinity && LA.det(dg(1e-200, 2)) === Number.MIN_VALUE && LA.det(dg(-1e-200, 3)) === -Number.MIN_VALUE && LA.det(dg(1e100, 4).map((r, i) => (i < 2 ? r : r.map((v) => v * 1e-200)))) === 1e100 * 1e100 * (1e100 * 1e-200) * (1e100 * 1e-200) && LA.det([[1e-200, 0], [0, 0]]) === 0,
      'det is 0 only when the matrix is singular: a determinant below the smallest double comes back as ±2^-1074, one past the largest as ±Infinity, and factors that only pass through overflow on the way are unharmed');
    let detSame = true;
    for (let i = 0; i < 2000; i++) { const n = 1 + g.int(7), A = Array.from({ length: n }, () => Array.from({ length: n }, () => g.range(-5, 5))), f = LA.lu(A); let d = f.sign; for (let k = 0; k < n; k++) d *= f.lu[k][k]; if (LA.det(A) !== d) detSame = false; }
    ok(detSame, 'det in the ordinary range is the product of the pivots, bit for bit (2000 matrices)');
    ok(LA.det([[2, 0, 0], [0, 3, 0], [0, 0, 4]]) === 24 && LA.det([[0, 1], [1, 0]]) === -1 && LA.det([[1, 2], [2, 4]]) === 0 && LA.rcond1([[1, 2], [2, 4]]) === 0 && LA.rcond1([[5]]) === 1, 'det: diagonal, a swap, singular; rcond1 is 0 for a singular matrix and 1 for a 1 × 1');
    ok(refuses(() => LA.solve([[1, 2], [2, 4]], [1, 2]), 'solid.err.singular', { why: 'pivot', size: 2, column: 1 }) && refuses(() => LA.lu([[0, 0], [0, 1]]), 'solid.err.singular', { column: 0 }), 'singular systems are refused with the column where the pivot vanished');
    ok(refuses(() => LA.solve([[1, 2]], [1]), bad, { why: 'not_square' }) && refuses(() => LA.solve([[1, NaN], [0, 1]], [1, 1]), bad, { why: 'not_finite' }) && refuses(() => LA.solve([[1, 0], [0, 1]], [1]), bad, { name: 'b', why: 'shape' }) && refuses(() => LA.lu([]), bad, { why: 'not_a_matrix' }), 'malformed matrices and right-hand sides are refused');
    const F1 = LA.lu([[1, 2], [3, 4]]);
    ok(Object.isFrozen(F1) && Object.isFrozen(F1.lu[0]) && same(LA.luSolve(F1, [5, 6]), LA.solve([[1, 2], [3, 4]], [5, 6])) && same(LA.solveMany([[2, 0], [0, 4]], [[2, 4], [4, 8]]), [[1, 2], [1, 2]]), 'lu is frozen; luSolve and solveMany agree with solve');
    let tr = true, exactish = 0, lower = true;
    for (let t = 0; t < 2000; t++) {
      const n = 2 + g.int(11), A = randMat(n, n), c = Array.from({ length: n }, () => g.range(-1, 1));
      const Fa = LA.lu(A), z = LA.luSolveT(Fa, c);
      const At = A[0].map((_, j) => A.map((row) => row[j]));
      const r = c.map((v, i) => v - mv(At, z)[i]);
      if (normInfV(r) > 8 * n * EPS * (LA.normInf(At) * normInfV(z) + normInfV(c))) tr = false;
      const exactR = 1 / (LA.norm1(A) * LA.norm1(LA.inverse(A))), est = LA.rcond1(A, Fa);
      if (est < exactR * (1 - 1e-9) || est > 3 * exactR) lower = false;
      if (Math.abs(est / exactR - 1) <= 1e-9) exactish++;
    }
    ok(tr, 'luSolveT solves Aᵀ z = c from the factors of A, backward stable (2000 random systems)');
    ok(lower && exactish >= 1500, `rcond1 never understates 1/κ₁ (it bounds ‖A⁻¹‖₁ from below), is never 3 times too high, and is exact on ${exactish} of 2000 random matrices`);
    let band = true;
    for (let t = 0; t < 1500; t++) {
      const n = 1 + g.int(60), kl = g.int(4), ku = g.int(4);
      const bandRows = Array.from({ length: n }, () => Array.from({ length: kl + ku + 1 }, () => g.range(-1, 1)));
      const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (j >= i - kl && j <= i + ku ? bandRows[i][j - i + kl] : 0)));
      const b = Array.from({ length: n }, () => g.range(-1, 1));
      let x;
      try { x = LA.bandSolve(bandRows, kl, ku, b); } catch (e) { if (e.code !== 'solid.err.singular') band = false; continue; }
      const r = b.map((v, i) => v - mv(A, x)[i]);
      if (normInfV(r) > 16 * n * EPS * (LA.normInf(A) * normInfV(x) + normInfV(b))) band = false;
    }
    ok(band, 'bandSolve: backward stable against the full matrix on 1500 random banded systems (n ≤ 60, up to 3 diagonals each side, pivoting needed)');
    ok(same(LA.bandSolve([[0, 2, 1], [1, 2, 1], [1, 2, 0]], 1, 1, [1, 2, 3]).map((v) => Math.round(v * 1e12) / 1e12), [0.5, 0, 1.5]) && refuses(() => LA.bandSolve([[0, 0, 1], [0, 0, 0]], 1, 1, [1, 2]), 'solid.err.singular', { why: 'pivot' }) && refuses(() => LA.bandSolve([[1, 2]], 1, 1, [1]), bad, { name: 'band', why: 'shape' }) && refuses(() => LA.bandSolve([[1]], -1, 0, [1]), bad, { name: 'bandwidth' }), 'bandSolve: a tridiagonal system, a singular one, malformed storage');
    let ls = true;
    for (let t = 0; t < 2000; t++) {
      const n = 1 + g.int(6), m = n + g.int(6), A = randMat(m, n), b = Array.from({ length: m }, () => g.range(-1, 1));
      const { x, residual } = LA.lstsq(A, b);
      const r = b.map((v, i) => v - mv(A, x)[i]);
      const atr = Array.from({ length: n }, (_, j) => A.reduce((s, row, i) => s + row[j] * r[i], 0));
      const nA = LA.norm1(A);
      if (normInfV(atr) > 64 * m * EPS * nA * (nA * normInfV(x) + normInfV(b))) ls = false;
      if (Math.abs(residual - Math.sqrt(r.reduce((s, v) => s + v * v, 0))) > 64 * m * EPS * (nA * normInfV(x) + normInfV(b))) ls = false;
    }
    ok(ls, 'lstsq: Aᵀ(Ax − b) ≈ 0 and the reported residual is ‖Ax − b‖ (2000 random overdetermined systems)');
    const l1 = LA.lstsq([[1, 0], [0, 1], [1, 1]], [1, 2, 3]);
    ok(Math.abs(l1.x[0] - 1) <= 4 * EPS && Math.abs(l1.x[1] - 2) <= 4 * EPS && l1.residual <= 8 * EPS && Object.isFrozen(l1), 'lstsq: a consistent system is solved, residual 0');
    const eye = (n) => Array.from({ length: n }, (_, i) => { const r = new Array(n).fill(0); r[i] = 1; return r; });
    const tall = (m, n) => Array.from({ length: m }, (_, i) => { const r = new Array(n).fill(0); r[i % n] = 1; return r; });
    const lim = 'solid.err.limit';
    ok(Object.isFrozen(LA.LIMITS) && LA.LIMITS.columns === 1024 && LA.LIMITS.rows === 65536 && LA.LIMITS.work === 2147483648, 'LIMITS: 1024 columns, 65536 rows, 2^31 multiply-adds');
    ok(refuses(() => LA.lu(eye(1025)), lim, { what: 'size', limit: 1024, used: 1025 }) && refuses(() => LA.det(eye(1025)), lim, { what: 'size' }) && refuses(() => LA.rcond1(eye(1025)), lim, { what: 'size' }) && refuses(() => LA.norm1(tall(2, 1025)), lim, { what: 'size' })
      && refuses(() => LA.qr(tall(65537, 1)), lim, { what: 'size', limit: 65536, used: 65537 }) && refuses(() => LA.lstsq(tall(4096, 1024), new Array(4096).fill(0)), lim, { what: 'work', limit: 2147483648, used: 4294967296 }),
    'a matrix past the limits is refused before any work: solid.err.limit { what: \'size\' | \'work\', limit, used }');
    ok(refuses(() => LA.bandSolve(Array.from({ length: 3000 }, () => new Array(2001).fill(1)), 1000, 1000, new Array(3000).fill(1)), lim, { what: 'work' }) && refuses(() => LA.bandSolve([[1]], 0, 1025, [1]), lim, { what: 'size', limit: 1024, used: 1025 }), 'bandSolve: the same limits on its bandwidths and its work');
    ok(same(LA.solve(eye(1024), new Array(1024).fill(3)), new Array(1024).fill(3)), 'the largest allowed dense system (1024 × 1024) is solved');
    ok(refuses(() => LA.lstsq([[1, 1], [2, 2], [3, 3]], [1, 2, 3]), 'solid.err.singular', { why: 'rank', column: 1 }) && refuses(() => LA.qr([[1, 2, 3]]), bad, { why: 'shape' }), 'lstsq refuses a rank-deficient matrix; qr refuses more columns than rows');
    ok(LA.norm1([[1, -2], [3, 4]]) === 6 && LA.normInf([[1, -2], [3, 4]]) === 7, 'norm1 and normInf');
  });

  // ================================================================================================ predicates
  section('predicates', 'exact predicates: the sign of every determinant against BigInt, on random and near-degenerate inputs', () => {
    const g = P.makePrng(31);
    // exact integers: within the domain every coordinate is a multiple of 2^-192
    const I = (v) => { const { m, e } = R.decompose(v); return m << BigInt(e + 192); };
    const sg = (n) => (n > 0n ? 1 : n < 0n ? -1 : 0);
    const o2 = (a, b, c) => { const [ax, ay, bx, by, cx, cy] = [...a, ...b, ...c].map(I); return sg((ax - cx) * (by - cy) - (ay - cy) * (bx - cx)); };
    const det3 = (r) => r[0][0] * (r[1][1] * r[2][2] - r[1][2] * r[2][1]) - r[0][1] * (r[1][0] * r[2][2] - r[1][2] * r[2][0]) + r[0][2] * (r[1][0] * r[2][1] - r[1][1] * r[2][0]);
    const o3 = (a, b, c, d) => { const D = d.map(I); return sg(det3([a, b, c].map((p) => p.map((v, i) => I(v) - D[i])))); };
    const ic = (a, b, c, d) => {
      const D = d.map(I), rows = [a, b, c].map((p) => { const x = I(p[0]) - D[0], y = I(p[1]) - D[1]; return [x, y, x * x + y * y]; });
      return sg(det3(rows));
    };
    const is = (a, b, c, d, e) => {
      const E = e.map(I), rows = [a, b, c, d].map((p) => { const v = p.map((x, i) => I(x) - E[i]); return [...v, v[0] * v[0] + v[1] * v[1] + v[2] * v[2]]; });
      let det = 0n;
      for (let r = 0; r < 4; r++) { const minorRows = rows.filter((_, k) => k !== r).map((row) => row.slice(0, 3)); det += ((r % 2 ? 1n : -1n) * rows[r][3] * det3(minorRows)); }
      return sg(det);
    };
    const nudge = (v) => { let x = v; const k = g.int(7) - 3; for (let i = 0; i < Math.abs(k); i++) x = k > 0 ? F.nextUp(x) : F.nextDown(x); return x; };
    const pt = (n, r = 1000) => Array.from({ length: n }, () => g.range(-r, r));
    let bad = { o2: 0, o3: 0, ic: 0, is: 0 }, zeros = { o2: 0, o3: 0, ic: 0, is: 0 };
    const count = (k, got, want) => { if (got !== want) bad[k]++; if (want === 0) zeros[k]++; };
    const u = F.U;
    for (let i = 0; i < 256; i++) for (let j = 0; j < 256; j++) { const p = [0.5 + i * u, 0.5 + j * u]; count('o2', PR.orient2d(p, [12, 12], [24, 24]), o2(p, [12, 12], [24, 24])); }
    for (let t = 0; t < 1e6 - 65536; t++) {
      const a = pt(2), b = pt(2);
      let c;
      if (t % 2) c = pt(2);
      else { const f = g.float(); c = [nudge(a[0] + f * (b[0] - a[0])), nudge(a[1] + f * (b[1] - a[1]))]; }
      count('o2', PR.orient2d(a, b, c), o2(a, b, c));
    }
    for (let t = 0; t < 2e5; t++) {
      const a = pt(3), b = pt(3), c = pt(3);
      let d;
      if (t % 2) d = pt(3);
      else { const p = g.float(), q = g.float(); d = [0, 1, 2].map((k) => nudge(a[k] + p * (b[k] - a[k]) + q * (c[k] - a[k]))); }
      count('o3', PR.orient3d(a, b, c, d), o3(a, b, c, d));
    }
    for (let t = 0; t < 2e5; t++) {
      const cx = g.range(-100, 100), cy = g.range(-100, 100), rr = g.range(0.01, 100);
      const on = () => { const th = g.range(0, 6.3); return [nudge(cx + rr * T.cos(th)), nudge(cy + rr * T.sin(th))]; };
      const [a, b, c, d] = t % 2 ? [pt(2), pt(2), pt(2), pt(2)] : [on(), on(), on(), on()];
      count('ic', PR.incircle(a, b, c, d), ic(a, b, c, d));
    }
    for (let t = 0; t < 1e5; t++) {
      const ctr = pt(3, 100), rr = g.range(0.01, 100);
      const on = () => { const v = g.unit3(); return v.map((x, k) => nudge(ctr[k] + rr * x)); };
      const ps = t % 2 ? [pt(3), pt(3), pt(3), pt(3), pt(3)] : [on(), on(), on(), on(), on()];
      count('is', PR.insphere(...ps), is(...ps));
    }
    // exactly degenerate cases built from integers: the filter cannot decide them, so they test the exact stage
    const circ = [[5, 0], [4, 3], [3, 4], [0, 5], [-3, 4], [-4, 3], [-5, 0], [-4, -3], [-3, -4], [0, -5], [3, -4], [4, -3]];
    const sphere = [];
    for (const [x, y, z] of [[3, 0, 0], [2, 1, 2], [2, 2, 1], [1, 2, 2]]) for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) for (const [p, q, r] of [[x, y, z], [y, z, x], [z, x, y]]) sphere.push([sx * p, sy * q, sz * r]);
    for (let t = 0; t < 2e4; t++) {
      const a = [g.int(201) - 100, g.int(201) - 100, g.int(201) - 100], b = a.map((v) => v + g.int(41) - 20), c = a.map((v) => v + g.int(41) - 20);
      const pp = g.int(11) - 5, qq = g.int(11) - 5, d = [0, 1, 2].map((k) => a[k] + pp * (b[k] - a[k]) + qq * (c[k] - a[k]));
      count('o3', PR.orient3d(a, b, c, d), o3(a, b, c, d));
      const o = [g.int(2001) - 1000, g.int(2001) - 1000], k = 1 + g.int(50), pick = () => { const q = circ[g.int(12)]; return [o[0] + k * q[0], o[1] + k * q[1]]; };
      const four = [pick(), pick(), pick(), pick()];
      count('ic', PR.incircle(...four), ic(...four));
      const o3c = [g.int(201) - 100, g.int(201) - 100, g.int(201) - 100], sp = () => { const q = sphere[g.int(sphere.length)]; return q.map((v, i) => o3c[i] + v); };
      const five = [sp(), sp(), sp(), sp(), sp()];
      count('is', PR.insphere(...five), is(...five));
    }
    ok(zeros.o3 > 1e4 && zeros.ic > 1e4 && zeros.is > 1e4, `exactly degenerate integer cases reach the exact stage: ${zeros.o3} coplanar, ${zeros.ic} cocircular, ${zeros.is} cospherical`);
    ok(bad.o2 === 0, `orient2d agrees with BigInt on 1e6 cases: half random, half nudged onto the line, and Shewchuk's 256 × 256 grid next to (0.5, 0.5) (${bad.o2} disagreements; ${zeros.o2} exactly collinear; seed 31)`);
    ok(bad.o3 === 0, `orient3d agrees with BigInt on 2.2e5 cases, half nearly coplanar, 2e4 built coplanar from integers (${bad.o3} disagreements; ${zeros.o3} exactly coplanar)`);
    ok(bad.ic === 0, `incircle agrees with BigInt on 2.2e5 cases, half nearly cocircular, 2e4 on integer circles (${bad.ic} disagreements)`);
    ok(bad.is === 0, `insphere agrees with BigInt on 1.2e5 cases, half nearly cospherical, 2e4 on an integer sphere (${bad.is} disagreements)`);
    let naive = 0;
    for (let i = 0; i < 64; i++) for (let j = 0; j < 64; j++) { const p = [0.5 + i * u, 0.5 + j * u]; if (Math.sign((p[0] - 24) * (12 - 24) - (p[1] - 24) * (12 - 24)) !== PR.orient2d(p, [12, 12], [24, 24])) naive++; }
    ok(naive > 0, `the grid is a real test: plain floating point gets ${naive} of 4096 signs wrong there`);
    ok(PR.orient2d([0, 0], [1, 0], [0, 1]) === 1 && PR.orient2d([0, 0], [0, 1], [1, 0]) === -1 && PR.orient2d([0, 0], [1, 1], [2, 2]) === 0, 'orient2d: counterclockwise +1, clockwise −1, collinear 0');
    ok(PR.orient3d([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, -1]) === 1 && PR.orient3d([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]) === -1 && PR.orient3d([0, 0, 0], [1, 0, 0], [0, 1, 0], [3, 7, 0]) === 0, 'orient3d: +1 below the counterclockwise plane, −1 above, 0 on it');
    ok(PR.incircle([5, 0], [0, 5], [-5, 0], [0, 0]) === 1 && PR.incircle([5, 0], [0, 5], [-5, 0], [9, 9]) === -1 && PR.incircle([5, 0], [0, 5], [-5, 0], [3, 4]) === 0 && PR.incircle([5, 0], [-5, 0], [0, 5], [0, 0]) === -1, 'incircle: inside +1, outside −1, exactly on it 0 (3-4-5), and the sign flips for a clockwise triangle');
    const sph = [[3, 0, 0], [0, 3, 0], [0, 0, 3], [2, 1, 2]];
    const ordered = PR.orient3d(...sph) > 0 ? sph : [sph[1], sph[0], sph[2], sph[3]];
    ok(PR.insphere(...ordered, [0, 0, 0]) === 1 && PR.insphere(...ordered, [9, 9, 9]) === -1 && PR.insphere(...ordered, [1, 2, 2]) === 0 && PR.insphere(ordered[1], ordered[0], ordered[2], ordered[3], [0, 0, 0]) === -1, 'insphere: inside +1, outside −1, exactly on it 0 (radius 3, integer points), and the sign flips with orientation');
    ok([[NaN, 0], [Infinity, 1], [Number.MIN_VALUE, 1], [1e50, 0], [F.pow2(-141), 0]].every((p) => refuses(() => PR.orient2d(p, [0, 0], [1, 1]), 'solid.err.bad_input', { name: 'point', why: 'out_of_range' })) && refuses(() => PR.orient3d([0, 0], [0, 0, 0], [1, 0, 0], [0, 1, 0]), 'solid.err.bad_input', { why: 'not_a_point' }) && PR.orient2d([F.pow2(-140), 0], [F.pow2(140), 0], [0, F.pow2(140)]) === 1, 'outside the domain (NaN, ±Infinity, subnormal, beyond 2^±140) the predicates refuse; its edges are accepted');
  });
}
