/* SPDX-License-Identifier: Apache-2.0 */
/**
 * test-surface.mjs — engine.solid's S6 tests (geom/nurbs-surface.js), registered by test.mjs: section `surface`.
 *
 * The answers come from somewhere the engine cannot reach:
 *   - points: the exact Σ Σ N·N·w·P / Σ Σ N·N·w in BigInt rationals (both directions' basis by test-geom.mjs' exact
 *     Cox–de Boor), held to a first-order rounding bound relative to the size of the terms;
 *   - partial derivatives (k + l ≤ 2): exact, the rational ones by A4.4's quotient rule done in BigInt;
 *   - shape-preserving operations per direction (insertion, refinement, elevation, split, reverse, swap, reparameterisation,
 *     transform), compared point by point on a grid with every knot pair, to 1e-12 of the surface's size (HANDOFF § 14, S6);
 *   - normal orthogonality (HANDOFF § 14, S6): n · Su = n · Sv = 0 and |n| = 1 to rounding, oriented as Su × Sv;
 *   - closed forms: a sphere octant (rational biquadratic: K = 1/r², an umbilic everywhere, the pole's normal is the
 *     limit), a cylinder, the saddle z = xy; Euler's formula for normal curvature;
 *   - iso-curves and edges against the surface itself; deviation() against a known perturbation and against sampling.
 */
import * as R from './bigref.mjs';
import { exactBasis } from './test-geom.mjs';
import { genSurfaceData, genParam } from './digest.mjs';

const U53 = 2 ** -53;
const bl = (x) => (x < 0n ? -x : x).toString(2).length;
function toNum(a) {
  if (a.n === 0n) return 0;
  const s = bl(a.n) - bl(a.d) - 60;
  const q = s >= 0 ? a.n / (a.d << BigInt(s)) : (a.n << BigInt(-s)) / a.d;
  return Number(q) * 2 ** s;
}
const frac = (x) => { const { m, e } = R.decompose(x); return e >= 0 ? { n: m << BigInt(e), d: 1n } : { n: m, d: 1n << BigInt(-e) }; };
const fsub = (a, b) => ({ n: a.n * b.d - b.n * a.d, d: a.d * b.d });
const fmul = (a, b) => ({ n: a.n * b.n, d: a.d * b.d });
const fdiv = (a, b) => (b.n < 0n ? { n: -a.n * b.d, d: a.d * -b.n } : { n: a.n * b.d, d: a.d * b.n });
const fscale = (a, k) => ({ n: a.n * BigInt(k), d: a.d });
function combo(ns, den, ws, xs) {
  const parts = xs.map((x, j) => { const a = R.decompose(x), b = R.decompose(ws[j]); return { m: a.m * b.m, e: a.e + b.e }; });
  let E = Infinity;
  for (const q of parts) if (q.m !== 0n && q.e < E) E = q.e;
  if (E === Infinity) return { n: 0n, d: 1n };
  let s = 0n;
  parts.forEach((q, j) => { if (q.m !== 0n) s += ns[j] * (q.m << BigInt(q.e - E)); });
  return E >= 0 ? { n: s << BigInt(E), d: den } : { n: s, d: den << BigInt(-E) };
}
const binom = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };

/** Exact SKL[k][l] (k + l ≤ d) for a surface record, as fractions; with the terms' sizes for the bounds. */
function exactSKL(s, u, v, d) {
  const bu = exactBasis(s.knotsU, s.degU, u, d), bv = exactBasis(s.knotsV, s.degV, v, d);
  const iu = Array.from({ length: s.degU + 1 }, (_, a) => bu.s - s.degU + a), iv = Array.from({ length: s.degV + 1 }, (_, b) => bv.s - s.degV + b);
  const A = [], W = [];
  for (let k = 0; k <= d; k++) {
    A.push([]); W.push([]);
    for (let l = 0; l <= d - k; l++) {
      const ns = [], ws = [], xs = [[], [], []];
      for (let a = 0; a <= s.degU; a++) for (let b = 0; b <= s.degV; b++) {
        ns.push(bu.D[k][a].n * bv.D[l][b].n);
        ws.push(s.w ? s.w[iu[a]][iv[b]] : 1);
        for (let ax = 0; ax < 3; ax++) xs[ax].push(s.cvs[iu[a]][iv[b]][ax]);
      }
      const den = bu.D[k][0].d * bv.D[l][0].d;
      A[k].push(xs.map((x) => combo(ns, den, ws, x)));
      W[k].push(combo(ns, den, ws, ws.map(() => 1)));
    }
  }
  // A4.4, exactly
  const S = [];
  for (let k = 0; k <= d; k++) {
    S.push([]);
    for (let l = 0; l <= d - k; l++) {
      let p = A[k][l].slice();
      for (let j = 1; j <= l; j++) p = p.map((x, ax) => fsub(x, fscale(fmul(W[0][j], S[k][l - j][ax]), binom(l, j))));
      for (let i = 1; i <= k; i++) {
        p = p.map((x, ax) => fsub(x, fscale(fmul(W[i][0], S[k - i][l][ax]), binom(k, i))));
        for (let j = 1; j <= l; j++) p = p.map((x, ax) => fsub(x, fscale(fmul(W[i][j], S[k - i][l - j][ax]), binom(k, i) * binom(l, j))));
      }
      S[k].push(p.map((x) => fdiv(x, W[0][0])));
    }
  }
  return { S, bu, bv, iu, iv };
}

export async function register({ section, ok, refuses, same, deepFrozen, appUrl }) {
  const P = await import(appUrl('solid/index.js'));
  const S = await import(appUrl('solid/geom/nurbs-surface.js'));
  const C = P.nurbsCurve, M = P.mat4, V = P.vec3;
  const BAD = 'solid.err.bad_input';

  section('surface', 'S6: NURBS surfaces — exact evaluation, shape-preserving operations, normals and poles, curvature, refusals', () => {
    const g = P.makePrng(601);
    const make = (opts) => S.make(genSurfaceData(g, opts));
    const sizeOf = (s) => Math.max(...s.cvs.flat().map((q) => Math.max(Math.abs(q[0]), Math.abs(q[1]), Math.abs(q[2]))));
    const grid = (s, k = 5) => {
      const [ua, ub] = S.domainU(s), [va, vb] = S.domainV(s);
      const us = [...new Set(s.knotsU)], vs = [...new Set(s.knotsV)];
      for (let i = 0; i < k; i++) { us.push(ua + (ub - ua) * g.float()); vs.push(va + (vb - va) * g.float()); }
      const out = [];
      for (const u of us) for (const v of vs) out.push([u, v]);
      return out;
    };
    const gap = (A, Bs, map = (u, v) => [u, v], pts = grid(A)) => {
      let e = 0;
      for (const [u, v] of pts) { const [x, y] = map(u, v); e = Math.max(e, V.dist(S.point(A, u, v), S.point(Bs, x, y))); }
      return e / sizeOf(A);
    };

    // ---------------------------------------------------------------------------------------- the record and its refusals
    const base = { degU: 1, degV: 2, knotsU: [0, 0, 1, 1], knotsV: [0, 0, 0, 1, 1, 1], cvs: [[[0, 0, 0], [0, 1, 0], [0, 2, 1]], [[1, 0, 0], [1, 1, 1], [1, 2, 0]]] };
    const s0 = S.make({ ...base, w: [[1, 1, 1], [1, 1, 1]] });
    ok(S.isSurface(s0) && deepFrozen(s0) && s0.w === null && same(S.domainU(s0), [0, 1]) && same(S.domainV(s0), [0, 1]) && !S.isSurface({ ...s0 }), 'make: a deeply frozen record; weights all 1 make a polynomial surface; a copy is not a surface');
    ok(S.isSurface(S.fromData(structuredClone(S.toData(s0)))) && same(S.fromData(JSON.parse(JSON.stringify(S.toData(s0)))), s0), 'toData / fromData: a surface crosses a worker boundary or JSON as plain data (D-wire)');
    const bad = (over, vars, code = BAD) => refuses(() => S.make({ ...base, ...over }), code, vars);
    ok([null, 1, []].every((x) => refuses(() => S.make(x), BAD, { name: 'surface', why: 'not_an_object' })) && bad({ degU: 0 }, { name: 'degU', why: 'not_a_count' }) && bad({ degV: 2.5 }, { name: 'degV', why: 'not_a_count' }), 'refused: not an object; a degree that is not a whole number ≥ 1');
    ok(bad({ cvs: 3 }, { name: 'cvs', why: 'not_an_array' }) && bad({ cvs: [base.cvs[0]] }, { name: 'cvs', why: 'too_few' }) && bad({ cvs: [base.cvs[0], base.cvs[1].slice(0, 2)] }, { name: 'cvs', why: 'not_a_grid' }) && bad({ cvs: [[[0, 0, 0], [0, 1, 0], [0, 2]], base.cvs[1]] }, { name: 'cvs', why: 'not_a_point' }), 'refused: a net that is not an array, too small, ragged, or holding a non-point');
    const row = new Array(1025).fill([0, 0, 0]);
    ok(refuses(() => S.make({ degU: 1, degV: 1, knotsU: [], knotsV: [], cvs: new Array(1025).fill(row) }), 'solid.err.limit', { what: 'points', limit: 1048576, used: 1025 * 1025 }), 'refused: more than 2^20 control points (the limit)');
    ok(bad({ knotsU: [0, 0, 1] }, { name: 'knotsU', why: 'count' }) && bad({ knotsV: [0, 0, 0.2, 0.9, 1, 1] }, { name: 'knotsV', why: 'not_clamped' }) && bad({ knotsU: [0, 0, NaN, 1] }, { name: 'knotsU' }) && bad({ knotsV: [0, 0, 0, 1, 1, 0.5] }, { name: 'knotsV' }), 'refused: knot vectors of the wrong count, unclamped, not numbers or decreasing, named by their direction');
    ok(bad({ degV: 1, knotsV: [0, 0, 0.5, 0.5 + 2 ** -45, 1, 1], cvs: base.cvs.map((r) => [...r, [9, 9, 9]]) }, { name: 'knotsV', why: 'near_knots' }) && bad({ degV: 1, knotsV: [0, 0, 0.5, 0.5, 1, 1], cvs: base.cvs.map((r) => [...r, [9, 9, 9]]) }, { name: 'knotsV', why: 'multiplicity' }), 'refused: near knots, and an interior knot more than deg times');
    ok(bad({ w: [[1, 1, 1]] }, { name: 'weights', why: 'count' }) && bad({ w: [[1, 1], [1, 1, 1]] }, { name: 'weights', why: 'not_a_grid' }) && bad({ w: [[1, 0, 1], [1, 1, 1]] }, { name: 'weights', why: 'not_positive' }) && bad({ w: [[1, 'x', 1], [1, 1, 1]] }, { name: 'weights', why: 'not_a_number' }) && bad({ w: [[1, 2 ** 501, 1], [1, 1, 1]] }, { name: 'weights', why: 'out_of_range' }), 'refused: a weight net of the wrong shape, a zero, a non-number or out of range');

    // ---------------------------------------------------------------------------------------- exact evaluation
    let worstPt = 0, ptBad = 0, n = 0;
    for (let i = 0; i < 700; i++) {
      const s = make({ maxDeg: i % 7 === 0 ? 9 : 4 }), u = genParam(g, s.knotsU, s.degU), v = genParam(g, s.knotsV, s.degV), x = S.point(s, u, v);
      const { S: E, bu, bv, iu, iv } = exactSKL(s, u, v, 0);
      let W = 0;
      const terms = [0, 0, 0];
      for (let a = 0; a <= s.degU; a++) for (let b = 0; b <= s.degV; b++) {
        const f = toNum(bu.D[0][a]) * toNum(bv.D[0][b]) * (s.w ? s.w[iu[a]][iv[b]] : 1);
        W += f;
        for (let ax = 0; ax < 3; ax++) terms[ax] += Math.abs(f * s.cvs[iu[a]][iv[b]][ax]);
      }
      for (let ax = 0; ax < 3; ax++) {
        const e = Math.abs(toNum(fsub(frac(x[ax]), E[0][0][ax]))), Sz = terms[ax] / W, p = s.degU + s.degV;
        const r = Sz > 0 ? e / ((16 * p + 16) * U53 * Sz) : e === 0 ? 0 : Infinity;
        worstPt = Math.max(worstPt, r);
        if (!(r <= 1)) ptBad++;
        n++;
      }
    }
    ok(ptBad === 0, `point: every coordinate within (16(p + q) + 16) u of the exact value, relative to the size of its terms (${n} coordinates; worst ${worstPt.toFixed(3)} of the bound)`);

    let dBad = 0, worstD = 0, rBad = 0, worstR = 0;
    for (let i = 0; i < 300; i++) {
      const rational = i % 2 === 1, s = make({ rational, maxDeg: 4 }), u = genParam(g, s.knotsU, s.degU), v = genParam(g, s.knotsV, s.degV);
      const got = S.derivs(s, u, v, 2), { S: E } = exactSKL(s, u, v, 2);
      const big = Math.max(...[0, 1, 2].flatMap((k) => [0, 1, 2].filter((l) => k + l <= 2).flatMap((l) => E[k][l].map((x) => Math.abs(toNum(x))))));
      for (let k = 0; k <= 2; k++) for (let l = 0; l <= 2 - k; l++) for (let ax = 0; ax < 3; ax++) {
        if (k + l === 0) continue;
        const e = Math.abs(toNum(fsub(frac(got[k][l][ax]), E[k][l][ax])));
        const r = e / ((rational ? 1e-9 : 1e-12) * (big + sizeOf(s)));
        if (rational) { worstR = Math.max(worstR, r); if (!(r <= 1)) rBad++; } else { worstD = Math.max(worstD, r); if (!(r <= 1)) dBad++; }
      }
    }
    ok(dBad === 0, `derivs, polynomial surfaces (A3.6): Su, Sv, Suu, Suv, Svv against the exact values, within 1e-12 of the largest (150 surfaces; worst ${worstD.toExponential(2)} of it)`);
    ok(rBad === 0, `derivs, rational surfaces (A4.4): the same against A4.4 done exactly in BigInt, within 1e-9 (150 surfaces; worst ${worstR.toExponential(2)} of it)`);
    {
      const s = make({ rational: false, maxDeg: 2 }), D = S.derivs(s, S.domainU(s)[0], S.domainV(s)[1], 6);
      ok(D.length === 7 && D.every((row, k) => row.length === 7 - k && row.every((x, l) => (k > s.degU || l > s.degV ? x.every((c) => c === 0) : true))), 'derivs: SKL is triangular (k + l ≤ d), and for a polynomial surface every row above a degree is exactly 0');
    }

    // ---------------------------------------------------------------------------------------- shape-preserving operations
    const REL = 1e-12, worst = {};
    const note = (name, e) => { worst[name] = Math.max(worst[name] || 0, e); };
    let multOk = 0, multAll = 0, normOk = true, normWorst = 0, isoWorst = 0, edgeOk = true;
    for (let i = 0; i < 120; i++) {
      const s = make({ maxDeg: 4 }), [ua, ub] = S.domainU(s), [va, vb] = S.domainV(s);
      const inU = () => { for (;;) { const t = ua + (ub - ua) * g.float(); if (t > ua && t < ub) return t; } };
      const inV = () => { for (;;) { const t = va + (vb - va) * g.float(); if (t > va && t < vb) return t; } };
      const dir = g.int(2) ? 'u' : 'v', inside = dir === 'u' ? inU : inV, K = dir === 'u' ? s.knotsU : s.knotsV, p = dir === 'u' ? s.degU : s.degV;
      note('insertKnot', gap(s, S.insertKnot(s, dir, inside(), 1 + g.int(p))));
      note('refine', gap(s, S.refine(s, dir, [inside(), inside()].sort((x, y) => x - y))));
      const t = 1 + g.int(Math.min(3, 15 - p)), el = S.elevate(s, dir, t);
      note('elevate', gap(s, el));
      if (!s.w) {
        multAll++;
        const KE = dir === 'u' ? el.knotsU : el.knotsV, mult = (U, x) => U.filter((y) => y === x).length;
        if ([...new Set(K)].slice(1, -1).every((x) => mult(KE, x) === mult(K, x) + t)) multOk++;
      }
      const at = inside(), [A, Bp] = S.split(s, dir, at);
      note('split', Math.max(gap(A, s), gap(Bp, s)));
      const rv = S.reverse(s, dir), clampU = (x) => Math.min(ub, x), clampV = (x) => Math.min(vb, x);
      note('reverse', gap(s, rv, (u, v) => (dir === 'u' ? [clampU(ua + (ub - u)), v] : [u, clampV(va + (vb - v))])));
      note('swap', gap(s, S.swap(s), (u, v) => [v, u]));
      const na = g.range(-3, 3), nb = na + g.range(1, 5), nc = g.range(-3, 3), nd = nc + g.range(1, 5), rp = S.reparam(s, [na, nb], [nc, nd]);
      note('reparam', gap(s, rp, (u, v) => [Math.min(nb, na + (u - ua) * ((nb - na) / (ub - ua))), Math.min(nd, nc + (v - va) * ((nd - nc) / (vb - va)))]));
      const T = M.mul(M.translation([g.range(-9, 9), g.range(-9, 9), g.range(-9, 9)]), M.rotation([g.range(-1, 1), 1, g.range(-1, 1)], g.range(-3, 3)));
      const ts = S.transform(s, T);
      let te = 0;
      for (const [u, v] of grid(s, 2)) te = Math.max(te, V.dist(S.point(ts, u, v), M.apply(T, S.point(s, u, v))));
      note('transform', te / (sizeOf(s) + 20));
      // normals: orthogonal to both partials, unit, and on the side of Su × Sv
      for (const [u, v] of grid(s, 2)) {
        let nn;
        try { nn = S.normal(s, u, v); } catch { continue; }                   // a degenerate point of a random net
        const D = S.derivs(s, u, v, 1), Su = D[1][0], Sv = D[0][1];
        const e = Math.max(Math.abs(V.dot(nn, Su)) / V.len(Su), Math.abs(V.dot(nn, Sv)) / V.len(Sv), Math.abs(V.len(nn) - 1));
        normWorst = Math.max(normWorst, e);
        if (!(e <= 8 * U53) || !(V.dot(nn, V.cross(Su, Sv)) > 0)) normOk = false;
      }
      // iso-curves are the surface's own lines; edges are its boundary rows exactly
      const tu = genParam(g, s.knotsU, s.degU), tv = genParam(g, s.knotsV, s.degV), cu = S.isoCurve(s, 'u', tu), cv = S.isoCurve(s, 'v', tv);
      for (const [u, v] of grid(s, 2)) {
        isoWorst = Math.max(isoWorst, V.dist(C.point(cu, v), S.point(s, tu, v)) / sizeOf(s), V.dist(C.point(cv, u), S.point(s, u, tv)) / sizeOf(s));
      }
      for (const [e, fixed] of [['u0', [ua, null]], ['u1', [ub, null]], ['v0', [null, va]], ['v1', [null, vb]]]) {
        const ec = S.edgeCurve(s, e);
        for (const [u, v] of grid(s, 1)) {
          const uu = fixed[0] ?? u, vv = fixed[1] ?? v, tt = fixed[0] !== null ? v : u;
          if (!(V.dist(C.point(ec, tt), S.point(s, uu, vv)) <= 4 * U53 * sizeOf(s))) edgeOk = false;
        }
      }
    }
    const names = ['insertKnot', 'refine', 'elevate', 'split', 'reverse', 'swap', 'reparam', 'transform'];
    const over = names.filter((k) => !(worst[k] <= REL));
    ok(over.length === 0, `every shape-preserving operation, in u and in v, reproduces the surface to 1e-12 of its size (120 random surfaces, rational and not; worst: ${names.map((k) => k + ' ' + (worst[k] || 0).toExponential(1)).join(', ')})` + (over.length ? ' — over: ' + over.join(', ') : ''));
    ok(multOk >= 0.95 * multAll, `elevate: every row stays on one knot vector, and the added knots are removed (polynomial surfaces: multiplicity up by exactly t in ${multOk} of ${multAll})`);
    {
      // heavier elevation: higher degrees, raised by up to 3 in both directions, many interior knots
      let heavy = 0;
      for (let i = 0; i < 60; i++) {
        const s = make({ maxDeg: 6, spans: 3 + g.int(3) }), tu = 1 + g.int(Math.min(3, 15 - s.degU)), tv = 1 + g.int(Math.min(3, 15 - s.degV));
        heavy = Math.max(heavy, gap(s, S.elevate(S.elevate(s, 'u', tu), 'v', tv)));
      }
      ok(heavy <= REL, `elevate: raised by up to 3 in u and then in v on 60 surfaces of degree up to 6, still the surface to 1e-12 (worst ${heavy.toExponential(1)})`);
      // two surfaces (found by search, seed 9) where removing a knot that elevation added would move some row by more than
      // rounding: the knot stays, and the surface is unchanged
      const g9 = P.makePrng(9), kept = [];
      for (let i = 0; i <= 59; i++) {
        const d = genSurfaceData(g9, { rational: false, maxDeg: 7, spans: 2 + g9.int(5) });
        g9.int(3);
        if (i === 37) kept.push([d, 'u', 2]);
        if (i === 59) kept.push([d, 'v', 1]);
      }
      let keptOk = true;
      for (const [d, dir, t] of kept) {
        const s = S.make(d), el = S.elevate(s, dir, t), K = dir === 'u' ? s.knotsU : s.knotsV, KE = dir === 'u' ? el.knotsU : el.knotsV;
        const mult = (U, x) => U.filter((y) => y === x).length;
        if (![...new Set(K)].slice(1, -1).some((x) => mult(KE, x) > mult(K, x) + t) || !(gap(s, el) <= REL)) keptOk = false;
      }
      ok(kept.length === 2 && keptOk, 'elevate keeps an added knot when removing it would move a row by more than rounding (two surfaces found by search): the surface is unchanged');
      // reverse keeps the domain where the knot values round (a + (b − a) < b in doubles)
      let ends = true;
      for (const [a, b] of [[0.2, 0.9], [0.4, 1.7], [0.1, 0.7]]) {
        const m1 = a + (b - a) / 3, m2 = a + 2 * (b - a) / 3;
        const s = S.make({ degU: 2, degV: 1, knotsU: [a, a, a, m1, m2, b, b, b], knotsV: [a, a, b, b], cvs: [0, 1, 2, 3, 4].map((i) => [[i, 0, i % 2], [i, 1, 0]]) });
        for (const dir of ['u', 'v']) {
          const rv = S.reverse(s, dir);
          if (!(same(S.domainU(rv), [a, b]) && same(S.domainV(rv), [a, b]))) ends = false;
          const back = dir === 'u' ? S.point(rv, a, a) : S.point(rv, a, a), there = dir === 'u' ? S.point(s, b, a) : S.point(s, a, b);
          if (!(V.dist(back, there) <= 1e-15)) ends = false;
        }
      }
      ok(ends, 'reverse keeps [a, b] exactly where the knot values round, in u and in v, and swaps the ends');
    }
    ok(normOk, `normal: orthogonal to Su and Sv and of length 1 to 8 u, and on the side of Su × Sv (worst ${normWorst.toExponential(1)})`);
    ok(isoWorst <= 1e-14 && edgeOk, `isoCurve(s, dir, t) is the surface's line at that parameter (worst ${isoWorst.toExponential(1)} of the size); edgeCurve is the boundary row`);

    // ---------------------------------------------------------------------------------------- closed forms
    {
      const r = 2.5, h = Math.SQRT1_2;
      const mer = [[r, 0], [r, r], [0, r]], rot = [[1, 0], [1, 1], [0, 1]], wq = [1, h, 1];
      const sph = S.make({ degU: 2, degV: 2, knotsU: [0, 0, 0, 1, 1, 1], knotsV: [0, 0, 0, 1, 1, 1], cvs: mer.map(([x, z]) => rot.map(([c, sn]) => [x * c, x * sn, z])), w: wq.map((a) => wq.map((b) => a * b)) });
      let er = 0, eK = 0, eH = 0, en = 0, edirs = 0;
      for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
        const u = i / 8, v = j / 8, x = S.point(sph, u, v);
        er = Math.max(er, Math.abs(V.len(x) - r) / r);
        if (u === 1) continue;                                                       // the pole: no curvature there
        const k = S.curvature(sph, u, v), nn = S.normal(sph, u, v);
        eK = Math.max(eK, Math.abs(k.K * r * r - 1));
        eH = Math.max(eH, Math.abs(k.H * r - 1), Math.abs(k.k1 * r - 1), Math.abs(k.k2 * r - 1));
        en = Math.max(en, V.len(V.add(nn, V.scale(x, 1 / r))));                        // inward: n = −x / r
        edirs = Math.max(edirs, Math.abs(V.dot(k.d1, k.d2)), Math.abs(V.dot(k.d1, nn)));
      }
      const pole = [0, 0.3, 0.77, 1].map((v) => S.normal(sph, 1, v));
      ok(er <= 4 * U53 && eK <= 1e-14 && eH <= 1e-14 && en <= 1e-14 && edirs <= 1e-15, `a sphere octant (rational biquadratic): every point at radius r, K = 1/r², k1 = k2 = H = 1/r (an umbilic everywhere), the normal points to the centre (worst ${Math.max(er, eK, eH, en).toExponential(1)})`);
      ok(pole.every((nn) => V.dist(nn, [0, 0, -1]) <= 1e-15), 'the pole, where the edge u = 1 collapses to a point: the normal is the limit from inside, (0, 0, −1), for every v');
      ok(refuses(() => S.curvature(sph, 1, 0.5), BAD, { name: 'uv', why: 'degenerate' }), 'curvature at the pole is refused (it needs a limit this file does not take)');
      // near the pole the normal turns continuously into the limit
      ok(V.dist(S.normal(sph, 1 - 1e-7, 0.4), S.normal(sph, 1, 0.4)) <= 1e-6, 'just inside the pole the normal is next to the limit');
      const cyl = S.make({ degU: 2, degV: 1, knotsU: [0, 0, 0, 1, 1, 1], knotsV: [0, 0, 1, 1], cvs: [[[r, 0, 0], [r, 0, 4]], [[r, r, 0], [r, r, 4]], [[0, r, 0], [0, r, 4]]], w: [[1, 1], [h, h], [1, 1]] });
      let ec = 0;
      for (let i = 0; i <= 6; i++) for (let j = 0; j <= 4; j++) {
        const k = S.curvature(cyl, i / 6, j / 4), axis = Math.abs(k.d2[2]) > Math.abs(k.d1[2]) ? k.d2 : k.d1;
        ec = Math.max(ec, Math.abs(k.K), Math.abs(Math.abs(k.H) - 1 / (2 * r)), Math.abs(Math.max(Math.abs(k.k1), Math.abs(k.k2)) - 1 / r), Math.min(Math.abs(k.k1), Math.abs(k.k2)), 1 - Math.abs(axis[2]));
      }
      ok(ec <= 1e-14, `a cylinder: K = 0, |H| = 1/(2r), principal curvatures 1/r and 0, the zero one along the axis (worst ${ec.toExponential(1)})`);
      const sad = S.make({ degU: 1, degV: 1, knotsU: [0, 0, 1, 1], knotsV: [0, 0, 1, 1], cvs: [[[0, 0, 0], [0, 1, 0]], [[1, 0, 0], [1, 1, 1]]] });
      let es = 0, eu = 0;
      for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
        const x = i / 6, y = j / 6, q = 1 + x * x + y * y, k = S.curvature(sad, x, y);
        es = Math.max(es, Math.abs(k.K + 1 / (q * q)) * q * q, Math.abs(k.H + x * y / q ** 1.5) * q);
        // Euler: the normal curvature along cos θ d1 + sin θ d2 is k1 cos² θ + k2 sin² θ
        const th = g.range(0, 3.14), dirn = V.add(V.scale(k.d1, Math.cos(th)), V.scale(k.d2, Math.sin(th)));
        eu = Math.max(eu, Math.abs(S.normalCurvature(sad, x, y, dirn) - (k.k1 * Math.cos(th) ** 2 + k.k2 * Math.sin(th) ** 2)));
      }
      ok(es <= 1e-14 && eu <= 1e-14, `the saddle z = xy (bilinear): K = −1/(1 + x² + y²)², H = −xy/(1 + x² + y²)^{3/2}; Euler's formula for normal curvature (worst ${Math.max(es, eu).toExponential(1)})`);
      const flat = S.make({ degU: 1, degV: 1, knotsU: [0, 0, 1, 1], knotsV: [0, 0, 1, 1], cvs: [[[0, 0, 0], [0, 0, 0]], [[1, 0, 0], [1, 1, 0]]] });
      ok(same(S.normal(flat, 0, 0.5), [0, 0, 1]) && same(S.normal(flat, 0, 0), [0, 0, 1]) && same(S.normal(flat, 0.5, 0.5), [0, 0, 1]), 'a triangle as a bilinear patch with one edge collapsed (u = 0): the normal there is the limit, the same as inside');
      const fold = S.make({ degU: 1, degV: 1, knotsU: [0, 0, 1, 1], knotsV: [0, 0, 1, 1], cvs: [[[0, 0, 0], [1, 0, 0]], [[1, 0, 0], [2, 0, 0]]] });
      ok(refuses(() => S.normal(fold, 0.5, 0.5), BAD, { name: 'uv', why: 'degenerate' }) && refuses(() => S.normalCurvature(sad, 0.5, 0.5, S.normal(sad, 0.5, 0.5)), BAD, { name: 'direction', why: 'not_tangent' }) && refuses(() => S.normalCurvature(sad, 0.5, 0.5, [1, 0]), BAD, { name: 'direction', why: 'not_a_vector' }), 'refused: a normal where Su ∥ Sv inside the domain (no guess); a normal curvature along the normal itself, or a non-vector');
    }

    // ---------------------------------------------------------------------------------------- deviation
    {
      let exact = true, sampled = true;
      for (let i = 0; i < 40; i++) {
        const s = make({ rational: false, maxDeg: 3 }), d = S.toData(s), ii = g.int(d.cvs.length), jj = g.int(d.cvs[0].length);
        const dv = [g.range(-1, 1), g.range(-1, 1), g.range(-1, 1)].map((x) => x * sizeOf(s));
        d.cvs[ii][jj] = V.add(d.cvs[ii][jj], dv);
        const moved = S.make(d), dev = S.deviation(s, moved);
        if (!(Math.abs(dev - V.len(dv)) <= 8 * U53 * (V.len(dv) + sizeOf(s)))) exact = false;
        const other = S.elevate(S.refine(moved, 'u', [S.domainU(s)[0] + (S.domainU(s)[1] - S.domainU(s)[0]) * 0.41]), 'v', 1), dev2 = S.deviation(s, other);
        for (const [u, v] of grid(s, 3)) if (V.dist(S.point(s, u, v), S.point(other, u, v)) > dev2 * (1 + 1e-12) + 1e-13 * sizeOf(s)) sampled = false;
      }
      ok(exact && sampled, 'deviation: one control point moved by δ gives |δ|; the bound is never below what sampling sees, after refinement and elevation too');
      ok(refuses(() => S.deviation(make({ rational: true }), make({ rational: false })), BAD, { name: 'surface', why: 'rational' }) && refuses(() => S.deviation(s0, S.reparam(s0, [0, 2], [0, 1])), BAD, { name: 'surfaces', why: 'domain' }), 'deviation takes polynomial surfaces on one domain');
    }

    // ---------------------------------------------------------------------------------------- the other refusals
    ok([[-1, 0.5], [0.5, 1.5], [NaN, 0.5], [0.5, 'x']].every(([u, v]) => refuses(() => S.point(s0, u, v), BAD, { why: Number.isFinite(u) && Number.isFinite(v) ? 'out_of_domain' : 'not_a_number' })), 'point refuses (u, v) outside the domain or not finite numbers (cc-nurbs would clamp them)');
    ok(refuses(() => S.derivs(s0, 0.5, 0.5, 33), BAD, { name: 'order' }) && refuses(() => S.isoCurve(s0, 'w', 0.5), BAD, { name: 'dir', why: 'not_a_direction' }) && refuses(() => S.edgeCurve(s0, 'u2'), BAD, { name: 'edge', why: 'not_an_edge' }) && refuses(() => S.isoCurve(s0, 'u', 2), BAD, { name: 't', why: 'out_of_domain' }), 'refused: an order past 32, a direction that is not u or v, an edge that is not u0 u1 v0 v1, an iso parameter outside the domain');
    ok(refuses(() => S.insertKnot(s0, 'v', 0), BAD, { name: 't', why: 'not_interior' }) && refuses(() => S.insertKnot(s0, 'u', 0.5, 2), BAD, { name: 'r', why: 'multiplicity' }) && refuses(() => S.split(s0, 'u', 1), BAD, { name: 't', why: 'not_interior' }) && refuses(() => S.elevate(s0, 'v', 14), 'solid.err.limit', { what: 'degree' }) && refuses(() => S.transform(s0, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1]), BAD, { name: 'matrix', why: 'not_affine' }), 'refused: insertion or split at an end, more copies than the degree, elevation past 15, a matrix that is not affine');
    ok(S.insertKnot(s0, 'u', 0.5, 0) === s0 && S.elevate(s0, 'u', 0) === s0 && same(S.insertKnot(S.insertKnot(s0, 'v', 0.5), 'v', 0.5 + 2 ** -44).knotsV, [0, 0, 0, 0.5, 0.5, 1, 1, 1]), 'inserting 0 copies or elevating by 0 returns the surface; a parameter within KTOL of a knot means that knot');
    ok([S.point, S.normal, S.bbox, S.swap].every((f) => refuses(() => f({ ...s0 }, 0.5, 0.5), BAD, { name: 'surface', why: 'not_a_surface' })), 'every function refuses a record not made by make');
    {
      const s = make({ rational: true }), bb = S.bbox(s);
      let inside = true;
      for (const [u, v] of grid(s, 3)) { const x = S.point(s, u, v); for (let ax = 0; ax < 3; ax++) if (x[ax] < bb.min[ax] || x[ax] > bb.max[ax]) inside = false; }
      ok(inside, 'bbox: the net\'s box holds the surface (positive weights: the convex hull)');
    }
  });
}
