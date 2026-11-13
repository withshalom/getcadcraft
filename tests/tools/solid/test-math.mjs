/* SPDX-License-Identifier: Apache-2.0 */
/**
 * test-math.mjs — engine.solid's S2 math-layer tests, registered by test.mjs: vec3, mat4, frame, aabb, quad, roots, linalg.
 *
 * Properties over 1e5 seeded random cases where a property exists (identities, round trips, backward errors), exact BigInt
 * checks where a claim is about rounding (conservative boxes, the Hilbert condition numbers), and known answers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { X, xadd, xmul, xcmp } from './test-core.mjs';

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
    ok(refuses(() => B.box([1, 0, 0], [0, 1, 1]), bad, { why: 'min_above_max' }) && refuses(() => B.fromPoints([[1, 2]]), bad) && refuses(() => B.inflate(b, -1), bad) && refuses(() => B.transform(b, [1]), bad), 'malformed boxes, points, distances and matrices are refused');
    ok(Object.isFrozen(b) && Object.isFrozen(b.min) && Object.isFrozen(B.EMPTY), 'boxes are frozen');
  });

  // ================================================================================================ quad
  section('quad', 'Gauss–Legendre rules 1 to 64, exactness, adaptive integration, refusals', () => {
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
    const f1 = (x) => x * x * x - 2 * x - 5, d1 = (x) => 3 * x * x - 2;
    const b1 = Ro.brent(f1, 2, 3), n1 = Ro.newton(f1, d1, 2, 3);
    ok(Math.abs(b1.x - 2.0945514815423265) <= 4 * EPS * 2.1 && Math.abs(n1.x - 2.0945514815423265) <= 4 * EPS * 2.1 && b1.iterations < 15 && n1.iterations < 10 && Object.isFrozen(b1), `brent and newton: x³ − 2x − 5 = 0 at 2.0945514815423265 (brent ${b1.iterations} steps, newton ${n1.iterations})`);
    const k1 = Ro.brent((x) => T.cos(x) - x, 0, 1, { eps: 1e-6 });
    ok(Math.abs(k1.x - 0.7390851332151607) <= 1e-6, 'brent: cos x = x to the eps asked for');
    const n2 = Ro.newton(T.atan, (x) => 1 / (1 + x * x), -10, 20, { x0: 15 });
    ok(n2.x === 0 || Math.abs(n2.x) <= 4 * EPS, `newton: atan x = 0 from x0 = 15, where plain Newton diverges, by falling back to bisection (${n2.iterations} steps)`);
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
    ok(refuses(() => LA.lstsq([[1, 1], [2, 2], [3, 3]], [1, 2, 3]), 'solid.err.singular', { why: 'rank', column: 1 }) && refuses(() => LA.qr([[1, 2, 3]]), bad, { why: 'shape' }), 'lstsq refuses a rank-deficient matrix; qr refuses more columns than rows');
    ok(LA.norm1([[1, -2], [3, 4]]) === 6 && LA.normInf([[1, -2], [3, 4]]) === 7, 'norm1 and normInf');
  });
}
