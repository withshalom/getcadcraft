/* SPDX-License-Identifier: Apache-2.0 */
/**
 * test-curve.mjs — engine.solid's S5 tests (geom/nurbs-curve.js), registered by test.mjs: section `curve`.
 *
 * The answers come from somewhere the engine cannot reach:
 *   - points: the exact value Σ N·w·P / Σ N·w in BigInt rationals (the basis by test-geom.mjs' exact Cox–de Boor), held to
 *     a first-order rounding bound (16p + 8) u relative to the size of the terms;
 *   - derivatives of polynomial curves: exact, to a recorded bound; of rational curves: the quotient rule (A4.2) done
 *     exactly, to a loose relative bound (a formula mistake is many orders of magnitude above it);
 *   - shape-preserving operations (insertion, refinement, removal of an inserted knot, decomposition, elevation, split,
 *     segment, reverse, reparameterisation, transform, join): the curve before and after, compared point by point at every
 *     knot and at random parameters, to 1e-12 of the curve's size (HANDOFF § 14, S5);
 *   - curvature and torsion: closed forms (a quarter circle, a twisted cubic, a line), and invariance under a change of
 *     parameter scale by 2^±400, where the textbook formula overflows or underflows;
 *   - deviation(): a known perturbation, and the sampled distance, which it must never undercut.
 */
import * as R from './bigref.mjs';
import { exactBasis } from './test-geom.mjs';
import { genCurveData, genParam } from './digest.mjs';

const U53 = 2 ** -53;
const bl = (x) => (x < 0n ? -x : x).toString(2).length;
/** a fraction { n, d } (d > 0, not reduced) → the nearest-ish double */
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
/** Σ_j (ns[j] / den) · ws[j] · xs[j], exactly */
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

/** The exact C^(k)(u), k = 0 … d, for a curve record (rational or not): [[fx, fy, fz] …] as fractions. */
function exactDerivs(c, u, d) {
  const p = c.deg, U = c.knots, { s, D } = exactBasis(U, p, u, d);
  const idx = Array.from({ length: p + 1 }, (_, j) => s - p + j);
  const w = idx.map((i) => (c.w ? c.w[i] : 1)), ones = idx.map(() => 1);
  const A = [], W = [];
  for (let k = 0; k <= d; k++) {
    const ns = D[k].map((f) => f.n), den = D[k][0].d;
    A.push([0, 1, 2].map((ax) => combo(ns, den, w, idx.map((i) => c.cvs[i][ax]))));
    W.push(combo(ns, den, w, ones));
  }
  const CK = [];
  for (let k = 0; k <= d; k++) {
    const v = A[k].slice();
    for (let i = 1; i <= k; i++) for (let ax = 0; ax < 3; ax++) v[ax] = fsub(v[ax], fscale(fmul(W[i], CK[k - i][ax]), binom(k, i)));
    CK.push(v.map((x) => fdiv(x, W[0])));
  }
  return { CK, D, idx, w };
}

export async function register({ section, ok, refuses, same, deepFrozen, appUrl }) {
  const P = await import(appUrl('solid/index.js'));
  const C = await import(appUrl('solid/geom/nurbs-curve.js'));
  const NCm = await import(appUrl('nurbs/curve.js'));          // cc-nurbs itself, for the S5 finding about its reduce
  const M = P.mat4, V = P.vec3;
  const BAD = 'solid.err.bad_input';

  section('curve', 'S5: NURBS curves — exact evaluation, shape-preserving operations, curvature, deviation, refusals', () => {
    const g = P.makePrng(501);
    const make = (opts) => C.make(genCurveData(g, opts));
    const sizeOf = (c) => Math.max(...c.cvs.map((q) => Math.max(Math.abs(q[0]), Math.abs(q[1]), Math.abs(q[2]))));
    const params = (c, k = 24) => {
      const [a, b] = C.domain(c), us = [...new Set(c.knots)];
      for (let i = 0; i < k; i++) us.push(a + (b - a) * g.float());
      return us;
    };
    /** max |A(u) − B(map(u))| over the samples, divided by size(A) */
    const gap = (A, B, map = (u) => u, us = params(A)) => {
      let e = 0;
      for (const u of us) e = Math.max(e, V.dist(C.point(A, u), C.point(B, map(u))));
      return e / sizeOf(A);
    };

    // ---------------------------------------------------------------------------------------- the record
    const c0 = C.make({ deg: 2, knots: [0, 0, 0, 1, 2, 2, 2], cvs: [[0, 0, 0], [1, 1, 0], [2, 0, 1], [3, 1, 1]], w: [1, 1, 1, 1] });
    ok(C.isCurve(c0) && deepFrozen(c0) && c0.type === 'nurbs' && c0.w === null && same(C.domain(c0), [0, 2]), 'make: a frozen record; weights all 1 are a polynomial curve (w null); the domain is [knots[p], knots[n+1]]');
    ok(!C.isCurve({ ...c0 }) && !C.isCurve(null) && !C.isCurve(C.toData(c0)), 'isCurve: a copy or plain data is not a curve');
    const back = C.fromData(structuredClone(C.toData(c0))), back2 = C.fromData(JSON.parse(JSON.stringify(C.toData(c0))));
    ok(C.isCurve(back) && same(back, c0) && same(back2, c0) && !Object.isFrozen(C.toData(c0)), 'toData / fromData: a curve crosses a worker boundary or JSON as plain data and is checked again (D-wire)');
    const rat = make({ rational: true });
    ok(C.isRational(rat) && Array.isArray(rat.w) && Object.isFrozen(rat.w) && !C.isRational(c0), 'isRational');

    // refusals of make
    const base = { deg: 2, knots: [0, 0, 0, 0.5, 1, 1, 1], cvs: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] };
    const bad = (over, vars, code = BAD) => refuses(() => C.make({ ...base, ...over }), code, vars);
    ok([null, 3, [], 'x'].every((x) => refuses(() => C.make(x), BAD, { name: 'curve', why: 'not_an_object' })), 'refused: a curve that is not an object');
    ok([0, 1.5, '2', -1].every((d) => bad({ deg: d }, { name: 'degree', why: 'not_a_count' })) && bad({ deg: 16, cvs: new Array(17).fill([0, 0, 0]), knots: [...new Array(17).fill(0), ...new Array(17).fill(1)] }, { what: 'degree', limit: 15, used: 16 }, 'solid.err.limit'), 'refused: a degree that is not a whole number ≥ 1, and degree 16 (limit 15)');
    ok(bad({ cvs: 'x' }, { name: 'cvs', why: 'not_an_array' }) && bad({ cvs: [[0, 0, 0], [1, 0, 0]] }, { name: 'cvs', why: 'too_few' }), 'refused: control points that are not an array, or fewer than deg + 1');
    ok(bad({ knots: [0, 0, 0, 1, 1, 1] }, { name: 'knots', why: 'count' }) && bad({ knots: [0, 0, 0.1, 0.5, 1, 1, 1] }, { name: 'knots', why: 'not_clamped' }), 'refused: a knot count that does not match, an unclamped vector');
    ok(bad({ knots: [0, 0, 0, 0.5, 0.5, 0.5, 1], cvs: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] }, { name: 'knots' }) && C.make({ deg: 2, knots: [0, 0, 0, 0.5, 0.5, 1, 1, 1], cvs: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 2, 0]] }).deg === 2 && bad({ knots: [0, 0, 0, 0.5, 0.5, 0.5, 1, 1, 1], cvs: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0]] }, { name: 'knots', why: 'multiplicity' }), 'refused: an interior knot more than deg times (the curve would break apart); deg times is a C0 joint and accepted');
    ok(bad({ knots: [0, 0, 0, 0.5, 0.5 + 2 ** -45, 1, 1, 1], cvs: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 2, 0]] }, { name: 'knots', why: 'near_knots' }), "refused: two distinct knots closer than cc-nurbs' KTOL reads as one (near_knots)");
    ok(bad({ cvs: [[0, 0, 0], [1, 0], [1, 1, 0], [0, 1, 0]] }, { name: 'cvs', why: 'not_a_point' }) && bad({ cvs: [[0, 0, NaN], [1, 0, 0], [1, 1, 0], [0, 1, 0]] }, { name: 'cvs', why: 'not_a_point' }) && bad({ cvs: [[2 ** 501, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] }, { name: 'cvs', why: 'out_of_range' }), 'refused: a control point that is not three finite numbers, or one past 2^500');
    ok(bad({ w: [1, 1, 1] }, { name: 'weights', why: 'count' }) && bad({ w: [1, 1, 'x', 1] }, { name: 'weights', why: 'not_a_number' }) && bad({ w: [1, 0, 1, 1] }, { name: 'weights', why: 'not_positive' }) && bad({ w: [1, -2, 1, 1] }, { name: 'weights', why: 'not_positive' }) && bad({ w: [1, 2 ** -501, 1, 1] }, { name: 'weights', why: 'out_of_range' }), 'refused: weights of the wrong count, not numbers, not positive, or out of range');
    ok(bad({ knots: [0, 0, 0, NaN, 1, 1, 1] }, { name: 'knots', why: 'not_a_number' }) && bad({ knots: [0, 0, 0, 0.7, 0.5, 1, 1] }, { name: 'knots' }), "refused: what basis.knots refuses (a NaN knot, a decreasing vector)");

    // ---------------------------------------------------------------------------------------- evaluation against the exact value
    let worstPt = 0, ptBad = 0, ptCases = 0;
    for (let i = 0; i < 2500; i++) {
      const c = make({ maxDeg: i % 10 === 0 ? 15 : 7 }), u = genParam(g, c.knots, c.deg), x = C.point(c, u);
      const { CK, D, idx, w } = exactDerivs(c, u, 0);
      const W = idx.reduce((s, ii, j) => s + toNum(D[0][j]) * w[j], 0);
      for (let ax = 0; ax < 3; ax++) {
        const S = idx.reduce((s, ii, j) => s + Math.abs(toNum(D[0][j]) * w[j] * c.cvs[ii][ax]), 0) / W;
        const e = Math.abs(toNum(fsub(frac(x[ax]), CK[0][ax])));
        const ratio = S > 0 ? e / ((16 * c.deg + 8) * U53 * S) : e === 0 ? 0 : Infinity;
        worstPt = Math.max(worstPt, ratio);
        if (!(ratio <= 1)) ptBad++;
        ptCases++;
      }
    }
    ok(ptBad === 0, `point: every coordinate within (16p + 8) u of the exact Σ N·w·P / Σ N·w, relative to the size of its terms (${ptCases} coordinates, degrees 1–15, rational and not; worst ${worstPt.toFixed(3)} of the bound)`);

    let worstD = 0, dBad = 0, worstRD = 0, rdBad = 0;
    for (let i = 0; i < 1200; i++) {
      const rational = i % 2 === 1, c = make({ rational, maxDeg: 6 }), u = genParam(g, c.knots, c.deg), d = Math.min(3, c.deg + 1);
      const got = C.derivs(c, u, d), { CK, D, idx, w } = exactDerivs(c, u, d);
      for (let k = 1; k <= d; k++) for (let ax = 0; ax < 3; ax++) {
        const e = Math.abs(toNum(fsub(frac(got[k][ax]), CK[k][ax])));
        if (!rational) {
          const S = idx.reduce((s, ii, j) => s + Math.abs(toNum(D[k][j]) * c.cvs[ii][ax]), 0) + idx.reduce((s, ii, j) => s + Math.abs(toNum(D[k][j])), 0) * Math.abs(toNum(CK[0][ax]));
          const r = S > 0 ? e / (8 * c.deg * c.deg * U53 * S) : e === 0 ? 0 : Infinity;
          worstD = Math.max(worstD, r);
          if (!(r <= 1)) dBad++;
        } else {
          const W0 = D[0].reduce((s, f, j) => s + toNum(f) * w[j], 0);
          const S = Math.abs(toNum(CK[k][ax])) + idx.reduce((s, ii, j) => s + Math.abs(toNum(D[k][j]) * w[j]) * (Math.abs(c.cvs[ii][ax]) + sizeOf(c)), 0) / W0 * 64 ** k;
          const r = e / (1e-9 * S);
          worstRD = Math.max(worstRD, r);
          if (!(r <= 1)) rdBad++;
        }
      }
    }
    ok(dBad === 0, `derivs, polynomial curves: every C^(k) within 8 p² u of the exact derivative, relative to the size of its terms (600 curves, k ≤ 3; worst ${worstD.toFixed(3)} of the bound)`);
    ok(rdBad === 0, `derivs, rational curves: the quotient rule (A4.2) agrees with the exact one done in BigInt (600 curves, k ≤ 3; worst ${worstRD.toExponential(2)} of a 1e-9 relative bound)`);
    {
      const c = make({ rational: false, maxDeg: 3 }), u = C.domain(c)[0], D9 = C.derivs(c, u, 9);
      ok(D9.length === 10 && D9.slice(c.deg + 1).every((v) => v.every((x) => x === 0)), 'derivs above the degree of a polynomial curve are zero');
    }

    // ---------------------------------------------------------------------------------------- shape-preserving operations
    const REL = 1e-12;
    const worst = {};
    const note = (name, e) => { worst[name] = Math.max(worst[name] || 0, e); };
    let multOk = 0, multAll = 0, multNever = true, decompOk = true, splitJoin = 0, removeOk = 0, removeIn = true, ends = true;
    for (let i = 0; i < 400; i++) {
      const c = make({ maxDeg: i % 8 === 0 ? 12 : 6 }), [a, b] = C.domain(c), p = c.deg;
      const inside = () => { for (;;) { const u = a + (b - a) * g.float(); if (u > a && u < b) return u; } };
      // insertion and refinement
      const u1 = inside(), ins = C.insertKnot(c, u1, 1 + g.int(p));
      note('insertKnot', gap(c, ins));
      const X = Array.from({ length: 1 + g.int(6) }, inside).sort((x, y) => x - y);
      note('refine', gap(c, C.refine(c, X)));
      // an inserted knot removed again: the same knots, and the curve moves no more than tol.lin (A5.8's contract). In exact
      // arithmetic the knot always comes out; in doubles A5.8 divides by α, which is small next to another knot, so now and
      // then it declines (removed 0, the curve unchanged) rather than move the curve more than it can prove.
      const u2 = inside(), once = C.insertKnot(c, u2), r = C.removeKnot(once, u2);
      if (r.removed === 1 && same(r.curve.knots, c.knots)) removeOk++;
      if (r.removed === 1 && gap(c, r.curve) * sizeOf(c) > P.DEFAULT_TOL.lin) removeIn = false;
      if (r.removed === 0 && r.curve !== once) removeIn = false;
      // Bézier decomposition: one piece per non-empty span, each the curve on its span
      const pieces = C.decompose(c), spans = new Set(c.knots).size - 1;
      if (pieces.length !== spans) decompOk = false;
      for (const piece of pieces) {
        const [pa, pb] = C.domain(piece);
        if (piece.knots.length !== 2 * (p + 1)) decompOk = false;
        note('decompose', gap(piece, c, (u) => u, [pa, pb, pa + (pb - pa) * g.float(), pa + (pb - pa) * g.float()]));
      }
      // degree elevation: the same curve, and each interior knot's multiplicity up by t
      const t = 1 + g.int(Math.min(3, 15 - p)), el = C.elevate(c, t);
      note('elevate', gap(c, el));
      if (!c.w) {
        const mult = (U, x) => U.filter((v) => v === x).length;
        multAll++;
        const inner = [...new Set(c.knots)].slice(1, -1);
        if (el.deg === p + t && inner.every((x) => mult(el.knots, x) === mult(c.knots, x) + t)) multOk++;
        if (!inner.every((x) => mult(el.knots, x) >= mult(c.knots, x) + t && mult(el.knots, x) <= p + t)) multNever = false;
      }
      // split, segment, reverse, reparameterisation, transform
      const us = inside(), [L, Rt] = C.split(c, us), [La, Lb] = C.domain(L), [Ra, Rb] = C.domain(Rt);
      note('split', Math.max(gap(L, c), gap(Rt, c)));
      if (!(La === a && Lb === us && Ra === us && Rb === b)) ends = false;
      const s0 = inside(), s1 = inside(), lo = Math.min(s0, s1), hi = Math.max(s0, s1);
      if (lo < hi) note('segment', gap(C.segment(c, lo, hi), c));
      const rv = C.reverse(c);
      note('reverse', gap(c, rv, (u) => Math.min(b, a + (b - u))));
      if (!same(C.domain(rv), [a, b])) ends = false;
      const na = g.range(-5, 5), nb = na + g.range(0.5, 9), rp = C.reparam(c, na, nb);
      note('reparam', gap(c, rp, (u) => Math.min(nb, na + (u - a) * ((nb - na) / (b - a)))));
      const T = M.mul(M.translation([g.range(-9, 9), g.range(-9, 9), g.range(-9, 9)]), M.rotation([g.range(-1, 1), g.range(-1, 1), 1], g.range(-3, 3)));
      const tc = C.transform(c, T);
      let te = 0;
      for (const u of params(c, 8)) te = Math.max(te, V.dist(C.point(tc, u), M.apply(T, C.point(c, u))));
      note('transform', te / (sizeOf(c) + 20));
      // join the two halves of a split back: the joint lies on the curve, each half keeps its shape (linear reparameterisation)
      const j = C.join([L, Rt]), J = j.curve, [Ja, Jb] = C.domain(J);
      const jk = J.knots[L.knots.length - 2];          // join keeps L's knots (reparameterised) but its last, then R's
      if (jk > Ja && jk < Jb && j.gap === 0) {
        const cl = (x) => Math.min(b, Math.max(a, x));
        const left = (s) => cl(a + (s - Ja) / (jk - Ja) * (us - a)), right = (s) => cl(us + (s - jk) / (Jb - jk) * (b - us));
        const sL = [Ja, jk, Ja + (jk - Ja) * g.float()], sR = [jk, Jb, jk + (Jb - jk) * g.float()];
        note('join', Math.max(gap(J, c, left, sL), gap(J, c, right, sR)));
        splitJoin++;
      }
    }
    const names = ['insertKnot', 'refine', 'decompose', 'elevate', 'split', 'segment', 'reverse', 'reparam', 'transform', 'join'];
    const over = names.filter((n) => !(worst[n] <= REL));
    ok(over.length === 0, `every shape-preserving operation reproduces the curve to 1e-12 of its size, on 400 random curves, rational and not, degrees 1–12 (worst: ${names.map((n) => n + ' ' + (worst[n] || 0).toExponential(1)).join(', ')})` + (over.length ? ' — over: ' + over.join(', ') : ''));
    ok(decompOk, 'decompose: one Bézier piece (2(p + 1) knots) per non-empty span');
    ok(removeOk >= 390 && removeIn, `removeKnot: a knot just inserted comes out again with the original knot vector (${removeOk} of 400), never moving the curve more than tol.lin; when it cannot prove that, it declines and returns the curve unchanged`);
    ok(multNever, 'elevate: no interior knot ends below m + t (which would change the curve) or above p + t');
    ok(ends, 'split keeps [a, u] and [u, b] exactly; reverse keeps the domain [a, b] exactly');
    ok(multAll > 0 && multOk >= 0.95 * multAll, `elevate: degree p + t, and the knots elevation adds are removed again, so each interior multiplicity goes up by exactly t (polynomial curves: ${multOk} of ${multAll}; the rest keep a knot that rounding would not let go: the same curve, one knot more)`);
    ok(splitJoin > 300, `join: the halves of a split, joined again, are the curve, each half reparameterised linearly (${splitJoin} joins)`);

    // near-knot parameters mean the knot (the two readings of "the same knot" agree)
    {
      const c = C.make({ deg: 3, knots: [0, 0, 0, 0, 0.5, 1, 1, 1, 1], cvs: [[0, 0, 0], [1, 2, 0], [2, -1, 0], [3, 1, 0], [4, 0, 0]] });
      const k = C.insertKnot(c, 0.5 + 2 ** -44);
      ok(same(k.knots, [0, 0, 0, 0, 0.5, 0.5, 1, 1, 1, 1]) && gap(c, k) <= REL, 'insertKnot: a parameter within KTOL of a knot raises that knot\'s multiplicity, the knot value kept exactly');
      ok(refuses(() => C.insertKnot(c, 2 ** -44), BAD, { name: 'u', why: 'not_interior' }) && refuses(() => C.insertKnot(c, 0), BAD, { name: 'u', why: 'not_interior' }) && refuses(() => C.insertKnot(c, 0.5, 3), BAD, { name: 'r', why: 'multiplicity' }) && C.insertKnot(c, 0.5, 2).knots.filter((x) => x === 0.5).length === 3, 'insertKnot refuses an end (or a parameter within KTOL of one) and more than deg copies; deg copies is fine');
      ok(refuses(() => C.removeKnot(c, 0.3), BAD, { name: 'u', why: 'not_a_knot' }) && C.removeKnot(c, 0.5).removed === 0 && C.removeKnot(c, 0.5).curve === c, 'removeKnot: a parameter that is no knot is refused; a knot the curve needs stays (removed 0, the same curve)');
      ok(refuses(() => C.split(c, 1), BAD, { name: 'u', why: 'not_interior' }) && refuses(() => C.segment(c, 0.6, 0.6), BAD, { name: 'b' }) && refuses(() => C.reparam(c, 1, 1), BAD, { name: 'b' }), 'split at an end, an empty segment and an empty reparameterisation are refused');
    }

    // ---------------------------------------------------------------------------------------- reduction and deviation
    let redOk = 0, redAll = 0, devOk = true, devExact = true, devSamples = true;
    for (let i = 0; i < 120; i++) {
      const c = make({ rational: false, maxDeg: 6 }), el = C.elevate(c, 1), r = C.reduce(el, { fit: 1e-4 * sizeOf(c) < 1e-6 ? 1e-6 : Math.min(10, 1e-4 * sizeOf(c)) });
      redAll++;
      if (r.curve.deg === c.deg && r.error <= 1e-9 * sizeOf(c)) redOk++;
      // a known perturbation: one control point moved by δ, the same knots: the bound is exactly |δ|
      const k = g.int(c.cvs.length), dv = [g.range(-1, 1) * sizeOf(c), g.range(-1, 1) * sizeOf(c), g.range(-1, 1) * sizeOf(c)];
      const moved = C.make({ ...C.toData(c), cvs: c.cvs.map((q, j) => (j === k ? V.add(q, dv) : q.slice())) });
      const dev = C.deviation(c, moved), dl = V.len(dv);
      if (!(Math.abs(dev - dl) <= 4 * U53 * (dl + sizeOf(c)))) devExact = false;
      // the bound is never below the sampled distance, also after one curve was refined and elevated
      const other = C.elevate(C.refine(moved, [C.domain(c)[0] + (C.domain(c)[1] - C.domain(c)[0]) * 0.37]), 1), dev2 = C.deviation(c, other);
      for (const u of params(c, 16)) if (V.dist(C.point(c, u), C.point(other, u)) > dev2 * (1 + 1e-12) + 1e-13 * sizeOf(c)) devSamples = false;
      if (!(dev2 <= dev * (1 + 1e-9) + 1e-12 * sizeOf(c))) devOk = false;
    }
    ok(redOk === redAll, `reduce: an elevated curve comes back to its degree with a proved deviation of rounding size (${redOk} of ${redAll})`);
    ok(devExact, 'deviation: one control point moved by δ gives exactly |δ| (to rounding)');
    ok(devSamples && devOk, 'deviation: never below the distance found by sampling, and unchanged when one curve is refined and elevated (the same curve)');
    {
      const cubic = C.make({ deg: 3, knots: [0, 0, 0, 0, 1, 1, 1, 1], cvs: [[0, 0, 0], [1, 3, 0], [2, -3, 0], [3, 0, 0]] });
      ok(refuses(() => C.reduce(cubic, { fit: 1e-4 }), 'solid.err.not_within_tolerance', { what: 'reduce', tol: 1e-4 }), 'reduce: a true cubic cannot become a quadratic within 1e-4: refused (solid.err.not_within_tolerance)');
      const loose = C.reduce(cubic, { lin: 1e-3, fit: 10, maxEdgeTol: 1, mesh: { chord: 1 } });
      let seen = 0;
      for (let k = 0; k <= 200; k++) seen = Math.max(seen, V.dist(C.point(cubic, k / 200), C.point(loose.curve, k / 200)));
      ok(loose.curve.deg === 2 && loose.error <= 10 && seen <= loose.error * (1 + 1e-12), `reduce within a loose tolerance: the reported error is a bound on what sampling sees (${seen.toFixed(4)} ≤ ${loose.error.toFixed(4)})`);
      ok(refuses(() => C.reduce(rat), BAD, { name: 'curve', why: 'rational' }) && refuses(() => C.deviation(rat, rat), BAD, { name: 'curve', why: 'rational' }) && refuses(() => C.reduce(C.make({ deg: 1, knots: [0, 0, 1, 1], cvs: [[0, 0, 0], [1, 0, 0]] })), BAD, { name: 'degree' }), 'reduce and deviation take polynomial curves only; reduce needs degree ≥ 2');
      ok(refuses(() => C.deviation(cubic, C.reparam(cubic, 0, 2)), BAD, { name: 'curves', why: 'domain' }), 'deviation needs the same domain');
      // found in S5: cc-nurbs' reduce estimates the error of the reduced pieces, then removes knots with what is left of the
      // tolerance, and the two add up past it. Here it accepts 0.1489 with an estimate of 0.0496; the curve moves 0.167.
      const found = C.make({ deg: 2, knots: [0, 0, 0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1, 1, 1], cvs: [[0, -0.0114, 0.0633], [0.1, 0.0024, 0.024], [0.2, 0.0661, -0.0847], [0.3, -0.0039, -0.0692], [0.4, -0.0118, -0.0833], [0.5, 0.0517, -0.0048], [0.6, -0.0031, 0.0272], [0.7, 0.0271, -0.028], [0.8, -0.0598, -0.0602], [0.9, -0.0785, 0.0058]] });
      const theirs = NCm.reduce(found, 0.1489), tolF = { lin: 1e-6, fit: 0.1489 };
      ok(theirs && theirs.error < 0.1489 && C.deviation(found, C.make(theirs.curve)) > 0.1489 && refuses(() => C.reduce(found, tolF), 'solid.err.not_within_tolerance', { what: 'reduce', tol: 0.1489 }), "reduce refuses what it cannot prove: cc-nurbs' reduce accepts this curve within 0.1489 (its estimate 0.0496) but the result moves 0.167; deviation() sees it, and engine.solid refuses with the error it would have left");
    }
    // the tolerance contract of removeKnot, on a knot the curve really needs: removal is declined when it would move the curve
    // more than tol.lin, accepted when it moves it less
    {
      const plain = C.make({ deg: 3, knots: [0, 0, 0, 0, 1, 1, 1, 1], cvs: [[0, 0, 0], [1, 2, 0], [2, -1, 1], [3, 1, 0]] });
      const withKnot = C.insertKnot(plain, 0.5), k = 2;                         // control point 2 lives on both sides of 0.5
      const bump = (d) => C.make({ ...C.toData(withKnot), cvs: withKnot.cvs.map((q, j) => (j === k ? [q[0], q[1] + d, q[2]] : q.slice())) });
      const big = C.removeKnot(bump(1e-4), 0.5), small = C.removeKnot(bump(1e-9), 0.5);
      let moved = 0;
      for (let i = 0; i <= 100; i++) moved = Math.max(moved, V.dist(C.point(bump(1e-9), i / 100), C.point(small.curve, i / 100)));
      ok(big.removed === 0 && big.curve.knots.length === withKnot.knots.length && small.removed === 1 && moved <= P.DEFAULT_TOL.lin, `removeKnot: a knot whose removal would move the curve 1e-4 stays (tol.lin is 1e-6); one that moves it ${moved.toExponential(1)} goes`);
      const loose = C.removeKnot(bump(1e-4), 0.5, { tol: { lin: 1e-3, fit: 1e-3, maxEdgeTol: 1e-3, mesh: { chord: 0.01 } } });
      ok(loose.removed === 1, 'removeKnot: with tol.lin = 1e-3 the same knot goes');
    }
    // reverse keeps the domain exactly also where (a + b) − b ≠ a, or a + (b − a) < b, in doubles
    {
      let all = true;
      for (const [a, b] of [[0.1, 0.7], [0.2, 0.9], [0.4, 1.7]]) {
        const mid1 = a + (b - a) / 3, mid2 = a + 2 * (b - a) / 3;
        const c = C.make({ deg: 2, knots: [a, a, a, mid1, mid2, b, b, b], cvs: [[0, 0, 0], [1, 1, 0], [2, 0, 0], [3, 2, 0], [4, 0, 1]] });
        const rv = C.reverse(c);
        if (!(same(C.domain(rv), [a, b]) && V.dist(C.point(rv, a), C.point(c, b)) <= 1e-15 && V.dist(C.point(rv, b), C.point(c, a)) <= 1e-15)) all = false;
      }
      ok(all && (0.1 + 0.7) - 0.7 !== 0.1 && 0.2 + (0.9 - 0.2) < 0.9, 'reverse keeps [a, b] exactly where (a + b) − b ≠ a or a + (b − a) < b in doubles, and swaps the ends');
    }
    // join reports the largest gap it closed
    {
      const l1 = C.make({ deg: 1, knots: [0, 0, 1, 1], cvs: [[0, 0, 0], [1, 0, 0]] }), l2 = C.make({ deg: 1, knots: [0, 0, 1, 1], cvs: [[1, 5e-7, 0], [2, 0, 0]] });
      const j = C.join([l1, l2]);
      ok(Math.abs(j.gap - 5e-7) <= 1e-15 && j.curve.deg === 1, `join: a gap of 5e-7 (below tol.lin) is closed and reported (${j.gap.toExponential(3)})`);
    }

    // ---------------------------------------------------------------------------------------- curvature and torsion
    {
      const r = 3.5, h = Math.SQRT1_2;
      const arc = C.make({ deg: 2, knots: [0, 0, 0, 1, 1, 1], cvs: [[r, 0, 0], [r, r, 0], [0, r, 0]], w: [1, h, 1] });
      let ke = 0, ce = 0, te = 0, ne = 0;
      for (let k = 0; k <= 50; k++) {
        const u = k / 50, x = C.point(arc, u), kv = C.curvatureVector(arc, u), kap = C.curvature(arc, u);
        ke = Math.max(ke, Math.abs(kap * r - 1));
        ce = Math.max(ce, V.len(V.add(x, V.scale(kv, 1 / (kap * kap)))) / r);         // x + N/κ is the centre (the origin)
        te = Math.max(te, Math.abs(C.torsion(arc, u)));
        ne = Math.max(ne, Math.abs(V.len(C.tangent(arc, u)) - 1));
        ce = Math.max(ce, Math.abs(V.len(x) - r) / r);
      }
      ok(ke <= 1e-14 && ce <= 1e-14 && te === 0 && ne <= 4 * U53, `curvature of a quarter circle (rational quadratic) is 1/r, κN points at the centre, torsion of a plane curve is 0, tangents are unit (worst κ·r − 1: ${ke.toExponential(1)})`);
      const tw = C.make({ deg: 3, knots: [0, 0, 0, 0, 1, 1, 1, 1], cvs: [[0, 0, 0], [1 / 3, 0, 0], [2 / 3, 1 / 3, 0], [1, 1, 1]] });
      let kk = 0, tt = 0;
      for (let k = 0; k <= 40; k++) {
        const t = k / 40, q = 36 * t ** 4 + 36 * t * t + 4, sp = 1 + 4 * t * t + 9 * t ** 4;
        kk = Math.max(kk, Math.abs(C.curvature(tw, t) / (Math.sqrt(q) / sp ** 1.5) - 1));
        tt = Math.max(tt, Math.abs(C.torsion(tw, t) / (12 / q) - 1));
      }
      ok(kk <= 1e-13 && tt <= 1e-13, `the twisted cubic (t, t², t³): curvature and torsion match their closed forms (worst relative ${Math.max(kk, tt).toExponential(1)})`);
      const line = C.make({ deg: 3, knots: [0, 0, 0, 0, 0.4, 1, 1, 1, 1], cvs: [[0, 0, 0], [1, 0, 0], [1.5, 0, 0], [4, 0, 0], [5, 0, 0]] });
      ok([0, 0.2, 0.4, 0.9, 1].every((u) => C.curvature(line, u) === 0 && C.torsion(line, u) === 0 && same(C.curvatureVector(line, u), [0, 0, 0])), 'a straight line: curvature 0, torsion 0, curvature vector 0, exactly');
      // the same curve with its parameter squeezed or stretched by a power of two: C' reaches 2^±400 (curvature) or 2^±300
      // (torsion, which needs C'''), where the textbook |C'|³ or |C' × C''|² overflows or underflows
      let inv = 0, naiveFails = 0;
      for (const [sc, what] of [[2 ** -400, 'k'], [2 ** 400, 'k'], [2 ** -300, 't'], [2 ** 300, 't']]) {
        for (let rep = 0; rep < 4; rep++) {
          const c = make({ rational: rep % 2 === 0, maxDeg: 5 }), [a, b] = C.domain(c), s = C.reparam(c, a * sc, b * sc);
          if (c.deg < 3 && what === 't') continue;
          for (let k = 0; k <= 10; k++) {
            const u = a + (b - a) * k / 10, us = Math.min(b * sc, Math.max(a * sc, a * sc + (u - a) * ((b * sc - a * sc) / (b - a))));
            let k1, k2;
            try { k1 = C.curvature(c, u); k2 = C.curvature(s, us); } catch { continue; }    // a cusp of the random curve
            if (k1 === 0) { if (k2 !== 0) inv = Infinity; continue; }                 // a straight piece: 0 both ways
            if (what === 'k') {
              inv = Math.max(inv, Math.abs(k2 - k1) / k1);
              const [, d1, d2] = C.derivs(s, us, 2), naive = V.len(V.cross(d1, d2)) / V.len(d1) ** 3;
              if (!(Math.abs(naive - k1) <= 1e-6 * k1)) naiveFails++;
            } else {
              const t1 = C.torsion(c, u), t2 = C.torsion(s, us);
              inv = Math.max(inv, Math.abs(t2 - t1) / (Math.abs(t1) + k1));
            }
          }
        }
      }
      ok(inv <= 1e-9 && naiveFails > 0, `curvature and torsion do not change when the parameter is scaled by 2^±400 (2^±300 for torsion), where the textbook formula fails (${naiveFails} times here); worst relative change ${inv.toExponential(1)}`);
      const cusp = C.make({ deg: 3, knots: [0, 0, 0, 0, 1, 1, 1, 1], cvs: [[0, 0, 0], [0, 0, 0], [1, 1, 0], [2, 0, 0]] });
      ok(refuses(() => C.tangent(cusp, 0), BAD, { name: 'u', why: 'degenerate' }) && refuses(() => C.curvature(cusp, 0), BAD, { name: 'u', why: 'degenerate' }) && refuses(() => C.torsion(cusp, 0), BAD, { name: 'u', why: 'degenerate' }) && C.curvature(cusp, 0.5) > 0, 'where C\' = 0 the tangent, curvature and torsion are refused (degenerate), not reported as 0');
      ok(C.isClosed(C.make({ deg: 2, knots: [0, 0, 0, 1, 1, 1], cvs: [[0, 0, 0], [1, 1, 0], [0, 0, 0]] })) && !C.isClosed(arc), 'isClosed: the ends meet within tol.lin');
    }

    // ---------------------------------------------------------------------------------------- the other refusals
    {
      const c = C.make(base);
      ok([0.5 - 1, 1.5, NaN, '0.5', Infinity].every((u) => refuses(() => C.point(c, u), BAD, { name: 'u' })), 'point refuses a parameter outside [a, b] or not a finite number (cc-nurbs would clamp it)');
      ok(refuses(() => C.derivs(c, 0.5, 33), BAD, { name: 'order', why: 'out_of_range' }) && refuses(() => C.derivs(c, 0.5, -1), BAD, { name: 'order', why: 'not_a_count' }), 'derivs refuses an order past 32 or not a count');
      ok([C.point, C.domain, C.bbox, C.reverse, C.decompose].every((f) => refuses(() => f({ ...c }, 0.5), BAD, { name: 'curve', why: 'not_a_curve' })), 'every function refuses a record not made by make (a copy is not a curve)');
      ok(refuses(() => C.transform(c, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1]), BAD, { name: 'matrix', why: 'not_affine' }), 'transform refuses a matrix that is not affine');
      const far = C.make({ deg: 1, knots: [0, 0, 1, 1], cvs: [[10, 0, 0], [11, 0, 0]] });
      ok(refuses(() => C.join([c, far]), BAD, { name: 'curves', why: 'gap', index: 1 }) && refuses(() => C.join([]), BAD, { name: 'curves', why: 'empty' }) && refuses(() => C.join('x'), BAD, { name: 'curves', why: 'not_an_array' }) && C.join([c]).curve === c, 'join refuses a gap above tol.lin (with the index), an empty list and a non-list; one curve is itself');
      ok(refuses(() => C.insertKnot(c, 0.5, 1.5), BAD, { name: 'r', why: 'not_a_count' }) && refuses(() => C.removeKnot(c, 0.5, { num: 0 }), BAD, { name: 'num' }) && refuses(() => C.elevate(c, -1), BAD, { name: 't' }) && refuses(() => C.elevate(c, 14), 'solid.err.limit', { what: 'degree', limit: 15, used: 16 }), 'counts are checked, and elevation past degree 15 is the degree limit');
      ok(C.insertKnot(c, 0.25, 0) === c && C.elevate(c, 0) === c, 'inserting 0 copies or elevating by 0 returns the same curve');
      const bb = C.bbox(rat);
      let inside = true;
      for (const u of params(rat, 64)) { const x = C.point(rat, u); for (let ax = 0; ax < 3; ax++) if (x[ax] < bb.min[ax] || x[ax] > bb.max[ax]) inside = false; }
      ok(inside && deepFrozen(bb), 'bbox: the control points\' box holds every point of the curve (positive weights: the convex hull)');
    }
  });
}
