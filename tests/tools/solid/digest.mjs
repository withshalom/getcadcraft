/* SPDX-License-Identifier: Apache-2.0 */
/**
 * digest.mjs — cc-solid's "same bits everywhere" check, in a form every host can run: Node, a browser page, a worker.
 * It imports nothing and touches no file, clock or DOM: give it the engine (the namespace of solid/index.js) and it
 * returns one FNV-1a hash per area, over the bits of some thousands of seeded results. Two hosts agree when every hash
 * agrees; tools/solid/digests.json holds the recorded ones.
 *
 *   digest(P) → { version, sections: { name: '0x…' } }
 *   genKnots · genU · degree      the seeded knot-vector generators (test-geom.mjs uses the same ones)
 *
 * The sections 'trig' and 'basis' repeat, call for call, the golden hashes of test-core.mjs and test-geom.mjs, so they
 * are also the recorded 0x1cb4c414 and 0x98fda410.
 */
const dv = new DataView(new ArrayBuffer(8));

function hasher() {
  let hash = 0x811c9dc5;
  const byte = (b) => { hash ^= b & 0xff; hash = Math.imul(hash, 0x01000193) >>> 0; };
  const word = (w) => { for (let k = 0; k < 4; k++) byte(w >>> (8 * k)); };
  const mix = (v) => {
    if (typeof v === 'number') { dv.setFloat64(0, v === v ? v : NaN); word(v === v ? dv.getUint32(0) : 0x7ff80000); word(v === v ? dv.getUint32(4) : 0); }   // one NaN: its payload is the host's own business
    else if (typeof v === 'boolean') byte(v ? 1 : 2);
    else if (typeof v === 'string') { for (let i = 0; i < v.length; i++) word(v.charCodeAt(i)); }
    else if (v === null || v === undefined) byte(3);
    else if (Array.isArray(v)) { byte(4); for (const x of v) mix(x); }
    else { byte(5); for (const k of Object.keys(v).sort()) { mix(k); mix(v[k]); } }
  };
  return { mix, hex: () => '0x' + hash.toString(16).padStart(8, '0') };
}
/** The result of f, or the code it refused with: a refusal is part of the answer and must be the same everywhere. */
const got = (f) => { try { return f(); } catch (e) { return 'refused:' + (e && e.code ? e.code : 'other'); } };

// ---------------------------------------------------------------------------------------------- knot vectors (seeded)
/** A valid knot vector of degree p: whole numbers scaled by a power of two, with repeated knots, sometimes clamped. */
export function genKnots(g, p, mode = ['plain', 'near', 'wide', 'clamped'][g.int(4)]) {
  for (;;) {
    const count = p + 1 + g.int(mode === 'near' ? 4 : 9), len = count + p + 1;
    const sc = 2 ** (g.int(61) - 30);
    const off = mode === 'near' ? (g.int(2) ? 1 : -1) * (2 ** 24 + g.int(1000)) : g.int(1 << 21) - (1 << 20);
    const ints = [];
    let x = 0;
    for (let k = 0; k < len; k++) {
      if (k && g.int(4) === 0) { ints.push(x); continue; }
      x += mode === 'near' ? 1 + g.int(3) : mode === 'wide' ? 1 + g.int(2 ** g.int(31)) : 1 + g.int(1 << 16);
      ints.push(x);
    }
    if (mode === 'clamped' || g.int(3) === 0) {
      for (let i = 0; i < p; i++) ints[i] = ints[p];
      for (let i = len - p; i < len; i++) ints[i] = ints[len - 1 - p];
    }
    for (let k = 1, run = 1; k < len; k++) {   // no value more than p + 1 times
      run = ints[k] === ints[k - 1] ? run + 1 : 1;
      if (run > p + 1) { for (let t = k; t < len; t++) ints[t]++; run = 1; }
    }
    const U = ints.map((v) => (off + v) * sc);
    if (U[p] < U[count]) return U;
  }
}
/** A u in [a, b]: a knot, an end, or any double between. */
export function genU(g, U, p) {
  const n = U.length - p - 2, a = U[p], b = U[n + 1], r = g.int(5);
  if (r === 0) { const c = U.filter((x) => x >= a && x <= b); return c[g.int(c.length)]; }
  if (r === 1) return g.int(2) ? a : b;
  return Math.min(b, Math.max(a, a + (b - a) * g.float()));
}
export const degree = (g) => (g.int(4) === 0 ? g.int(16) : g.int(8));

/**
 * A seeded NURBS curve as plain data (S5): degree 1 … maxDeg, clamped knots on whole numbers scaled by a power of two,
 * interior multiplicities 1 … deg, control points of one size (a power of two between 2^-10 and 2^10), and for a rational
 * curve weights in [1/8, 8]. Only exact operations, so every host builds the same curve.
 */
export function genCurveData(g, { rational = g.int(2) === 1, maxDeg = 7, spans = 1 + g.int(6) } = {}) {
  const p = 1 + g.int(maxDeg), sc = 2 ** (g.int(41) - 20), a = (g.int(2001) - 1000) * sc;
  const U = new Array(p + 1).fill(a);
  let x = a;
  for (let s = 1; s < spans; s++) { x += (1 + g.int(1000)) * sc; const m = 1 + g.int(p); for (let i = 0; i < m; i++) U.push(x); }
  x += (1 + g.int(1000)) * sc;
  for (let i = 0; i <= p; i++) U.push(x);
  const n = U.length - p - 1, S = 2 ** (g.int(21) - 10);
  const cvs = Array.from({ length: n }, () => [g.range(-S, S), g.range(-S, S), g.range(-S, S)]);
  return { deg: p, knots: U, cvs, w: rational ? Array.from({ length: n }, () => g.range(0.125, 8)) : null };
}
/** A seeded NURBS surface as plain data (S6): two knot vectors made as genCurveData's, a net of one size, weights in [1/8, 8]. */
export function genSurfaceData(g, { rational = g.int(2) === 1, maxDeg = 5, spans = 1 + g.int(4) } = {}) {
  const dir = () => {
    const p = 1 + g.int(maxDeg), sc = 2 ** (g.int(41) - 20), a = (g.int(2001) - 1000) * sc, U = new Array(p + 1).fill(a);
    let x = a;
    for (let s = 1; s < spans; s++) { x += (1 + g.int(1000)) * sc; const m = 1 + g.int(p); for (let i = 0; i < m; i++) U.push(x); }
    x += (1 + g.int(1000)) * sc;
    for (let i = 0; i <= p; i++) U.push(x);
    return { p, U };
  };
  const du = dir(), dv = dir(), nu = du.U.length - du.p - 1, nv = dv.U.length - dv.p - 1, S = 2 ** (g.int(21) - 10);
  const cvs = Array.from({ length: nu }, () => Array.from({ length: nv }, () => [g.range(-S, S), g.range(-S, S), g.range(-S, S)]));
  const w = rational ? Array.from({ length: nu }, () => Array.from({ length: nv }, () => g.range(0.125, 8))) : null;
  return { degU: du.p, degV: dv.p, knotsU: du.U, knotsV: dv.U, cvs, w };
}
/** A parameter of the curve's domain [a, b]: a knot, an end, or any double between. */
export function genParam(g, U, p) { return genU(g, U, p); }

// ---------------------------------------------------------------------------------------------------------- the areas
const AREAS = {
  trig(P, { mix }) {                                     // test-core.mjs's golden hash, call for call
    const T = P.trig, h = P.makePrng(99);
    for (let i = 0; i < 2000; i++) {
      const x = h.range(-50, 50), y = h.range(-1, 1), z = h.range(0.001, 1e6);
      mix(T.sin(x)); mix(T.cos(x)); mix(T.atan(x)); mix(T.atan2(y, x)); mix(T.asin(y)); mix(T.acos(y)); mix(T.exp(x)); mix(T.log(z)); mix(T.cbrt(x));
    }
  },
  trigWide(P, { mix }) {                                 // every size of argument, the BigInt reduction included
    const T = P.trig, F = P.float, h = P.makePrng(100);
    for (let i = 0; i < 4000; i++) {
      const x = (h.u32() & 1 ? -1 : 1) * F.pow2(h.int(2046) - 1022) * h.range(1, 2);
      mix(T.sin(x)); mix(T.cos(x)); mix(T.tan(x)); mix(T.sincos(x)); mix(T.atan(x)); mix(T.cbrt(x)); mix(T.atan2(x, h.range(-2, 2)));
      mix(T.log(Math.abs(x))); mix(T.exp(h.range(-745, 710)));
    }
    for (const x of [1e22, 1e300, Number.MAX_VALUE, 1647099, 1647100, 6381956970095103 * F.pow2(797), 5e-324, -0, Infinity, NaN]) { mix(T.sin(x)); mix(T.cos(x)); mix(T.tan(x)); }
  },
  basis(P, { mix }) {                                    // test-geom.mjs's golden hash, call for call
    const B = P.basis, h = P.makePrng(77);
    for (let c = 0; c < 4000; c++) {
      const p = degree(h), U = genKnots(h, p), u = genU(h, U, p), K = B.knots(U, p), r = B.ders(K, u, Math.min(p, 3));
      mix(r.span); for (const row of r.ders) for (const v of row) mix(v);
    }
  },
  basisMore(P, { mix }) {
    const B = P.basis, h = P.makePrng(78);
    for (let c = 0; c < 1500; c++) {
      const p = degree(h), U = genKnots(h, p), u = genU(h, U, p), K = B.knots(U, p), n = U.length - p - 2;
      mix(B.span(K, u)); mix(B.basis(K, u)); const i = h.int(n + 1); mix(B.one(K, i, u)); mix(B.oneDers(K, i, u, Math.min(p, 2)));
    }
    mix(B.clampedUniform(9, 3, -2, 5).U);
  },
  float(P, { mix }) {
    const F = P.float, h = P.makePrng(101);
    const any = () => F.fromBits(h.u32(), h.u32());
    for (let i = 0; i < 6000; i++) {
      const a = i % 3 ? any() : h.range(-1e6, 1e6), b = i % 5 ? any() : h.range(-3, 3);
      for (const f of [F.addDown, F.addUp, F.subDown, F.subUp, F.mulDown, F.mulUp, F.divDown, F.divUp]) mix(f(a, b));
      mix(F.twoSum(a, b)); mix(F.twoProd(a, b)); mix(F.nextUp(a)); mix(F.nextDown(a)); mix(F.ulp(a)); mix(F.bits(a));
      mix(F.sqrtDown(Math.abs(a))); mix(F.sqrtUp(Math.abs(a))); mix(Math.sqrt(Math.abs(b))); mix(a / b); mix(a * b + a);
    }
    for (let i = 0; i < 3000; i++) {                     // the ends of the range: next to MAX, past 2^995, subnormals, x / x
      const top = F.MAX * (1 - h.int(6) * F.pow2(-53)), sub = (1 + h.int(3000)) * Number.MIN_VALUE, big = F.pow2(996 + h.int(27)) * h.range(1, 2), x = any();
      for (const [a, b] of [[top, h.range(0.5, 2)], [Math.sqrt(top), Math.sqrt(top)], [sub, h.range(1, 3)], [sub, sub], [big, F.pow2(-h.int(900)) * h.range(1, 2)], [top, top], [x, x], [sub, big]]) {
        for (const f of [F.mulDown, F.mulUp, F.divDown, F.divUp]) mix(f(a, b));
        mix(F.sqrtDown(Math.abs(a))); mix(F.sqrtUp(Math.abs(a)));
      }
      mix(F.scalb(x, h.int(4401) - 2200)); mix(F.scalb(sub, h.int(2200))); mix(F.scalb(top, -h.int(2200)));
    }
  },
  intervals(P, { mix }) {
    const I = P.intervals, F = P.float, h = P.makePrng(102);
    const one = () => { const p = (h.u32() & 1 ? -1 : 1) * F.pow2(h.int(160) - 80) * h.range(1, 2), q = (h.u32() & 1 ? -1 : 1) * F.pow2(h.int(160) - 80) * h.range(1, 2); const r = h.int(12); return r === 0 ? [-Infinity, Math.max(p, q)] : r === 1 ? [Math.min(p, q), Infinity] : p <= q ? [p, q] : [q, p]; };
    for (let i = 0; i < 4000; i++) {
      const a = one(), b = one();
      mix(I.add(a, b)); mix(I.sub(a, b)); mix(I.mul(a, b)); mix(I.div(a, b)); mix(I.sqr(a)); mix(I.abs(a)); mix(I.hull(a, b)); mix(I.intersect(a, b));
      mix(got(() => I.sqrt(a))); mix(I.scale(a, h.range(-9, 9))); mix(I.mid(a)); mix(I.width(a));
      const t = [h.range(-40, 40), 0]; t[1] = t[0] + h.range(0, 1) * h.range(0, 4);
      mix(I.sin(t)); mix(I.cos(t)); mix(I.sin(a)); mix(I.cos(b));
    }
  },
  predicates(P, { mix }) {                               // far from degenerate, a hair from it, and exactly on it
    const Q = P.predicates, F = P.float, h = P.makePrng(103);
    const pt = (d, s) => Array.from({ length: d }, () => h.range(-s, s));
    for (let i = 0; i < 1500; i++) {
      const s = F.pow2(h.int(40) - 20);
      mix(Q.orient2d(pt(2, s), pt(2, s), pt(2, s))); mix(Q.orient3d(pt(3, s), pt(3, s), pt(3, s), pt(3, s)));
      mix(Q.incircle(pt(2, s), pt(2, s), pt(2, s), pt(2, s))); mix(Q.insphere(pt(3, s), pt(3, s), pt(3, s), pt(3, s), pt(3, s)));
      // a point on the line or plane through the others, then moved by a few ulps: the exact stage decides
      const a = pt(2, 1), b = pt(2, 1), t = h.range(0, 1), c = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      mix(Q.orient2d(a, b, c)); mix(Q.orient2d(a, b, [F.nextUp(c[0]), c[1]])); mix(Q.incircle(a, b, c, [c[0], F.nextDown(c[1])]));
      const k = () => h.int(2001) - 1000, o = [k(), k(), k()], e1 = [k(), k(), k()], e2 = [k(), k(), k()];
      const on = () => { const u = k(), v = k(); return [o[0] + u * e1[0] + v * e2[0], o[1] + u * e1[1] + v * e2[1], o[2] + u * e1[2] + v * e2[2]]; };
      const q = on(); mix(Q.orient3d(on(), on(), on(), q)); mix(Q.orient3d(on(), on(), on(), [q[0], q[1], F.nextUp(q[2])]));
      const cs = [[3, 4, 12], [-3, 4, 12], [4, -12, 3], [12, 3, -4], [-12, -4, -3]].map((v) => [v[0] * s + o[0], v[1] * s + o[1], v[2] * s + o[2]]);
      mix(Q.insphere(...cs));
    }
  },
  roots(P, { mix }) {
    const R = P.roots, T = P.trig, h = P.makePrng(104);
    for (let i = 0; i < 1500; i++) {
      const c = [h.range(-5, 5), h.range(-5, 5), h.range(-5, 5), h.range(-5, 5)];
      mix(got(() => R.quadratic(c[0], c[1], c[2]))); mix(got(() => R.cubic(c[0], c[1], c[2], c[3])));
      const r1 = h.range(-3, 3), r2 = h.range(-3, 3);
      mix(got(() => R.cubic(1, -(2 * r1 + r2), r1 * r1 + 2 * r1 * r2, -r1 * r1 * r2)));     // a double root
    }
    for (let i = 0; i < 300; i++) {
      const k = h.range(0.2, 5), s = h.range(-1, 1);
      const f = (x) => T.exp(k * x) - 2 + s * x, df = (x) => k * T.exp(k * x) + s;
      mix(got(() => R.brent(f, -4, 4))); mix(got(() => R.newton(f, df, -4, 4))); mix(got(() => R.brent((x) => x * x * x - s, -2, 2)));
      mix(got(() => R.brent((x) => T.cos(x) - s * x, 0, 1.5, { eps: 1e-9 })));
    }
    mix(got(() => R.brent((x) => x * x * x, -1, 2))); mix(got(() => R.brent((x) => x * x + 1, -1, 2)));
    const F = P.float, whole = (n) => h.int(2 * n + 1) - n, wide = () => (h.u32() & 1 ? -1 : 1) * F.pow2(h.int(2098) - 1074) * h.range(1, 2);
    for (let i = 0; i < 1500; i++) {                     // repeated roots (decided exactly), every size of coefficient, refusals
      const r1 = whole(100), r2 = i % 3 ? r1 : whole(100), r3 = i % 5 ? whole(100) : r1, m = 1 + h.int(40);
      mix(got(() => R.cubic(m, -m * (r1 + r2 + r3), m * (r1 * r2 + r1 * r3 + r2 * r3), -m * r1 * r2 * r3)));
      mix(got(() => R.quadratic(m, -m * (r1 + r2), m * r1 * r2))); mix(got(() => R.quadratic(wide(), i % 7 ? wide() : 0, i % 11 ? wide() : 0)));
      const e = () => (h.u32() & 1 ? -1 : 1) * F.pow2(h.int(241) - 120) * h.range(1, 2);
      mix(got(() => R.cubic(e(), e(), e(), e()))); mix(got(() => R.cubic(wide(), i % 2 ? 0 : wide(), 0, wide())));
    }
    for (let i = 0; i < 600; i++) {                      // two roots close together: certified, or bracketed between turning points
      const r = h.range(-3, 3), dl = F.pow2(-(8 + h.int(44))) * h.range(1, 2), s = h.range(-3, 3);
      mix(got(() => R.cubic(1, -(2 * r + dl + s), r * (r + dl) + s * (2 * r + dl), -r * (r + dl) * s)));
    }
    mix(got(() => R.cubic(-F.pow2(-240), 9, -6, 1))); mix(got(() => R.cubic(1, -(2 + F.pow2(-50)), 1 + F.pow2(-50), F.pow2(-200))));
    mix(got(() => R.brent((x) => x - 1, -1e308, 1e308))); mix(got(() => R.newton((x) => x - 1, () => 1, -F.MAX, F.MAX)));
  },
  quad(P, { mix }) {
    const Q = P.quad, T = P.trig, h = P.makePrng(105);
    for (let n = 1; n <= Q.MAX_ORDER; n++) { const r = Q.rule(n); mix(Array.from(r.x)); mix(Array.from(r.w)); }
    const show = (r) => (typeof r === 'string' ? r : [r.value, r.error, r.intervals, r.evaluations]);
    for (let i = 0; i < 120; i++) {
      const a = h.range(-2, 0), b = h.range(0.1, 3), k = h.range(1, 60);
      mix(got(() => Q.fixed((x) => T.sin(k * x) + x * x, a, b, 1 + h.int(64))));
      mix(show(got(() => Q.adaptive((x) => T.sin(k * x), a, b, { eps: 1e-10 })))); mix(show(got(() => Q.adaptive((x) => Math.sqrt(Math.abs(x - 0.3)), a, b, { eps: 1e-9 }))));
      mix(show(got(() => Q.adaptive((x) => 1 / (1e-3 + x * x), a, b, { eps: 1e-11 }))));
    }
    mix(show(got(() => Q.adaptive((x) => T.sin(1e5 * x), 0, 1, { eps: 1e-6, maxPieces: 100000, maxDepth: 60 }))));
    mix(show(got(() => Q.adaptive((x) => (x < 0.3 ? 0 : 1), 0, 1, { eps: 1e-14 }))));
  },
  linalg(P, { mix }) {
    const L = P.linalg, h = P.makePrng(106);
    for (let i = 0; i < 300; i++) {
      const n = 1 + h.int(9), A = Array.from({ length: n }, () => Array.from({ length: n }, () => h.range(-4, 4))), b = Array.from({ length: n }, () => h.range(-4, 4));
      if (i % 7 === 0 && n > 1) A[n - 1] = A[0].map((v) => 2 * v);                 // exactly singular
      mix(got(() => L.solve(A, b))); mix(got(() => L.det(A))); mix(got(() => L.rcond1(A))); mix(got(() => L.inverse(A))); mix(L.norm1(A)); mix(L.normInf(A));
      mix(got(() => { const f = L.lu(A); return [Array.from(f.perm), f.sign, L.luSolveT(f, b)]; }));
      const m = n + h.int(6), T2 = Array.from({ length: m }, () => Array.from({ length: n }, () => h.range(-4, 4))), c = Array.from({ length: m }, () => h.range(-4, 4));
      mix(got(() => { const r = L.lstsq(T2, c); return [r.x, r.residual]; }));
      const N = 3 + h.int(30), kl = h.int(3), ku = h.int(3), band = Array.from({ length: N }, () => Array.from({ length: kl + ku + 1 }, (_, j) => (j === kl ? h.range(4, 9) : h.range(-1, 1))));
      mix(got(() => L.bandSolve(band, kl, ku, Array.from({ length: N }, () => h.range(-4, 4)))));
      if (i % 5 === 0) { const sc = P.float.pow2(h.int(1201) - 600); mix(got(() => L.det(A.map((r) => r.map((v) => v * sc))))); }
    }
  },
  exact(P, { mix }) {                                    // whole-number arithmetic: signs and quotients of sums of products
    const E = P.exact, F = P.float, h = P.makePrng(109);
    const x = () => { const k = h.int(4); return k === 0 ? h.int(9) - 4 : k === 1 ? F.pow2(h.int(2098) - 1074) : (h.u32() & 1 ? -1 : 1) * h.range(1, 2) * F.pow2(h.int(k === 2 ? 60 : 2000) - (k === 2 ? 30 : 1000)); };
    const sum = () => Array.from({ length: 1 + h.int(5) }, () => [h.int(61) - 30, ...Array.from({ length: h.int(5) }, x)]);
    for (let i = 0; i < 4000; i++) { const a = sum(), b = sum(); mix(E.sumSign(a)); mix(got(() => E.sumRatio(a, b))); if (i % 4 === 0) mix(E.sumSign([a[0], [-a[0][0], ...a[0].slice(1)]])); }
  },
  space(P, { mix }) {                                    // vectors, matrices, frames and boxes
    const V = P.vec3, M = P.mat4, Fr = P.frame, B = P.aabb, F = P.float, h = P.makePrng(107);
    const v3 = (s = 10) => [h.range(-s, s), h.range(-s, s), h.range(-s, s)];
    for (let i = 0; i < 2000; i++) {
      const a = v3(), b = v3(), c = v3(), ang = h.range(-7, 7);
      mix(V.len(a)); mix(got(() => V.unit(a))); mix(V.perp(a)); mix(V.angle(a, b)); mix(V.triple(a, b, c)); mix(V.dist(a, b)); mix(V.cross(a, b));
      const R = got(() => M.rotation(a, ang)), R2 = got(() => M.rotationAbout(b, c, ang));
      mix(R); mix(R2);
      if (typeof R !== 'string' && typeof R2 !== 'string') {
        const X = M.mul(M.mul(R, M.translation(b)), M.mul(R2, M.scaling([h.range(0.5, 2), h.range(0.5, 2), h.range(0.5, 2)])));
        mix(X); mix(got(() => M.invert(X))); mix(M.apply(X, c)); mix(M.applyDir(X, c)); mix(got(() => M.applyNormal(X, c))); mix(M.det3(X)); mix(got(() => M.isRigid(M.mul(R, R2))));
        mix(B.transform(B.fromPoints([a, b, c]), X)); mix(B.center(B.inflate(B.fromPoints([a, b]), 0.5)));
      }
      const f = got(() => Fr.frameFromZX(a, b, c));
      if (typeof f !== 'string') { mix(Fr.toMatrix(f)); mix(Fr.toWorld(f, c)); mix(Fr.toLocal(f, c)); } else mix(f);
      if (i % 8 === 0 && typeof R !== 'string') { const sc = F.pow2(h.int(2001) - 1000), S = R.map((v, k) => (k < 12 && k % 4 !== 3 ? v * sc : v)); mix(M.det3(S)); mix(got(() => M.invert(S))); mix(got(() => M.applyNormal(S, c))); }
      const box = B.fromPoints([a, b]); mix(B.diagonal(box)); mix(B.size(box)); mix(B.overlaps(box, B.fromPoints([c, v3()])));
    }
  },
  curve(P, { mix }) {                                    // S5: NURBS curves (nurbs-curve.js)
    const C = P.nurbsCurve, h = P.makePrng(110);
    for (let i = 0; i < 400; i++) {
      const c = C.make(genCurveData(h)), [a, b] = C.domain(c), U = c.knots, p = c.deg;
      const u = genParam(h, U, p), m = a + (b - a) * h.float();
      mix(C.point(c, u)); mix(C.derivs(c, u, 3)); mix(got(() => C.curvature(c, u))); mix(got(() => C.torsion(c, u))); mix(got(() => C.tangent(c, u)));
      mix(got(() => C.insertKnot(c, m, 1).cvs)); mix(got(() => C.split(c, m)[1].cvs)); mix(C.reverse(c).knots); mix(C.elevate(c, 1 + h.int(2)).cvs);
      mix(C.decompose(c).map((d) => d.cvs)); mix(got(() => C.removeKnot(C.insertKnot(c, m, 1), m).curve.knots));
      if (!c.w) { mix(got(() => C.deviation(c, C.elevate(c, 1)))); mix(got(() => { const r = C.reduce(C.elevate(c, 1), { fit: 1e-3 }); return [r.error, r.curve.cvs]; })); }
    }
  },
  surface(P, { mix }) {                                  // S6: NURBS surfaces (nurbs-surface.js)
    const S = P.nurbsSurface, h = P.makePrng(111);
    for (let i = 0; i < 150; i++) {
      const s = S.make(genSurfaceData(h)), [ua, ub] = S.domainU(s), [va, vb] = S.domainV(s);
      const u = genParam(h, s.knotsU, s.degU), v = genParam(h, s.knotsV, s.degV), mu = ua + (ub - ua) * h.float(), mv = va + (vb - va) * h.float();
      mix(S.point(s, u, v)); mix(S.derivs(s, u, v, 2)); mix(got(() => S.normal(s, u, v))); mix(got(() => S.curvature(s, mu, mv)));
      mix(S.isoCurve(s, 'u', u).cvs); mix(S.isoCurve(s, 'v', v).cvs); mix(S.edgeCurve(s, 'v1').cvs);
      mix(got(() => S.insertKnot(s, 'u', mu).cvs)); mix(got(() => S.split(s, 'v', mv)[0].cvs)); mix(S.elevate(s, h.int(2) ? 'u' : 'v', 1).cvs);
      mix(S.reverse(s, 'u').knotsU); mix(S.swap(s).cvs);
      if (!s.w) mix(got(() => S.deviation(s, S.elevate(s, 'v', 1))));
    }
  },
  analytic(P, { mix }) {                                 // S7: analytic curves and surfaces, their NURBS forms
    const A = P.analyticCurve, S = P.analyticSurface, Fr = P.frame, h = P.makePrng(112);
    for (let i = 0; i < 60; i++) {
      const f = Fr.frameFromZX([h.range(-9, 9), h.range(-9, 9), h.range(-9, 9)], [h.range(-1, 1), h.range(-1, 1), h.range(0.2, 1)], [1, h.range(-1, 1), 0]);
      const r = h.range(0.5, 9), t0 = h.range(-3, 3), t1 = t0 + h.range(0.3, 6.2), u = t0 + (t1 - t0) * h.float(), v = h.range(0, 4);
      for (const c of [A.circle({ frame: f, r, range: [t0, t1] }), A.ellipse({ frame: f, a: r, b: r / 2 + 0.1, range: [t0, t1] }), A.line({ o: f.o, d: f.x, range: [t0, t1] })]) {
        mix(A.point(c, u)); mix(A.derivs(c, u, 3)); mix(got(() => A.curvature(c, u))); mix(A.toNurbs(c).cvs); mix(A.toNurbs(c).knots); mix(A.reverse(c).phase === undefined ? A.reverse(c).o : A.reverse(c).phase);
      }
      const surfs = [S.cylinder({ frame: f, r, urange: [t0, t1], vrange: [0, 4] }), S.cone({ frame: f, r, angle: 0.3, urange: [t0, t1], vrange: [0, 4] }),
        S.sphere({ frame: f, r, urange: [t0, t1], vrange: [-1, 1.5] }), S.torus({ frame: f, R: r + 2, r, urange: [t0, t1], vrange: [0, 4] }), S.plane({ frame: f, urange: [t0, t1], vrange: [0, 4] })];
      for (const s of surfs) { const vv = Math.min(S.domainV(s)[1], Math.max(S.domainV(s)[0], v - 1)); mix(S.point(s, u, vv)); mix(S.derivs(s, u, vv, 2)); mix(got(() => S.normal(s, u, vv))); mix(got(() => S.curvature(s, u, vv))); mix(S.toNurbs(s).cvs); mix(S.toNurbs(s).w); }
    }
  },
  fitting(P, { mix }) {                                  // S8, S9: interpolation, approximation, construction
    const FI = P.fit, K = P.construct, CV = P.nurbsCurve, NS = P.nurbsSurface, h = P.makePrng(113);
    for (let i = 0; i < 30; i++) {
      const n = 4 + h.int(20), Q = Array.from({ length: n }, (_, k) => [k + h.range(-0.3, 0.3), h.range(-2, 2), h.range(-2, 2)]);
      const r = FI.interpolate(Q, { deg: 1 + h.int(4), param: ['chord', 'centripetal', 'uniform'][h.int(3)] });
      mix(r.curve.cvs); mix(r.curve.knots); mix(r.params); mix(r.error);
      const a = got(() => FI.approximate(Q, { tol: { lin: 1e-6, fit: 0.05 } })); mix(typeof a === 'string' ? a : [a.count, a.error, a.curve.cvs]);
      const c1 = CV.make(genCurveData(h, { rational: h.int(2) === 1, maxDeg: 3 })), c2 = CV.make(genCurveData(h, { rational: false, maxDeg: 3 }));
      mix(got(() => K.compatible([c1, c2]).map((c) => c.knots))); mix(got(() => NS.point(K.ruled(c1, c2), 0.5, 0.5)));
      mix(got(() => { const L = K.loft([c1, CV.transform(c1, P.mat4.translation([0, 0, 3])), CV.transform(c1, P.mat4.translation([1, 0, 6]))]); return [L.params, L.surface.cvs]; }));
      const G = Array.from({ length: 4 + h.int(3) }, (_, k) => Array.from({ length: 3 + h.int(3) }, (_, j) => [k, j, h.range(-1, 1)]));
      mix(got(() => K.interpolateGrid(G).surface.cvs));
    }
  },
  prng(P, { mix }) {
    const g = P.makePrng(108);
    for (let i = 0; i < 5000; i++) { mix(g.u32()); mix(g.float()); mix(g.range(-1e308, 1e308)); mix(g.int(1 + i)); mix(g.normal()); mix(g.unit3()); }
    mix(g.state());
  },
};

export function digest(P) {
  const sections = {};
  for (const [name, run] of Object.entries(AREAS)) { const h = hasher(); run(P, h); sections[name] = h.hex(); }
  return { version: P.VERSION, sections };
}
