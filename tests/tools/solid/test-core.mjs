/* SPDX-License-Identifier: Apache-2.0 */
/**
 * test-core.mjs — engine.solid's S2 core tests, registered by test.mjs: prng, float, trig, intervals.
 *
 * Exact answers come from BigInt (bigref.mjs and the dyadic helpers below). Random inputs come from cc-solid's own
 * generator, which the prng section checks first against the C reference (ref/xoshiro128ss.c); every random check names
 * its seed when it fails.
 */
import * as R from './bigref.mjs';

// ---- exact dyadic rationals: { N, E } stands for N · 2^E
export const X = (x) => { const { m, e } = R.decompose(x); return { N: m, E: e }; };
const align = (a, b) => { const E = Math.min(a.E, b.E); return [a.N << BigInt(a.E - E), b.N << BigInt(b.E - E), E]; };
export const xadd = (a, b) => { const [p, q, E] = align(a, b); return { N: p + q, E }; };
export const xsub = (a, b) => { const [p, q, E] = align(a, b); return { N: p - q, E }; };
export const xmul = (a, b) => ({ N: a.N * b.N, E: a.E + b.E });
export const xcmp = (a, b) => { const [p, q] = align(a, b); return p < q ? -1 : p > q ? 1 : 0; };
/** lo ≤ exact ≤ hi, where ±Infinity bounds always hold. */
export const encloses = (lo, hi, ex) => (lo === -Infinity || (Number.isFinite(lo) && xcmp(X(lo), ex) <= 0)) && (hi === Infinity || (Number.isFinite(hi) && xcmp(X(hi), ex) >= 0));

// first outputs of tools/solid/ref/xoshiro128ss.c (cc -O2; run 2026-11-12)
const C_REF = [
  [0, [0x92ca2f0e, 0x3cd6e3f3, 0x1b147dcc, 0x4c081dbf], [3809008728, 1133695204, 53579671, 2891528803, 139681546, 2203266335], 2998873314],
  [1, [0x96a0f96b, 0x12bc8390, 0x971e9964, 0x79adc7e7], [2442144158, 3238099751, 3819917871, 2104621829, 2021136066, 4223536128], 187170770],
  [42, [0x3805ea2c, 0xeb5cd984, 0x1327aacb, 0xc5ba443d], [2837322924, 544945897, 479756282, 3500138142, 339756180, 113173290], 3822185902],
  [2026, [0xdce4c433, 0x38fe1e01, 0x1e35a029, 0x36aea6c2], [1436751614, 742089593, 1736781944, 1312845263, 2711517162, 3597559494], 3736138171],
  [4294967295, [0x36deb503, 0xfc2fb9b6, 0x2994c1b5, 0x6a06e134], [835879718, 1921286648, 2356205009, 1885780724, 980451116, 1053911718], 2032509366],
];
// FNV-1a over the bits of sin, cos, atan, atan2, asin, acos, exp, log, cbrt on 2000 inputs from seed 99 (see "the same bits")
const GOLDEN = 0x1cb4c414;

export async function register({ section, ok, refuses, same, appUrl }) {
  const F = await import(appUrl('solid/core/float.js'));
  const T = await import(appUrl('solid/core/trig.js'));
  const P = await import(appUrl('solid/core/prng.js'));
  const I = await import(appUrl('solid/core/intervals.js'));
  const bad = 'solid.err.bad_input';

  /** Any double with a biased exponent in [lo, hi] (0: subnormals and zero; 2046: the top binade), either sign. */
  const anyDouble = (g, lo = 0, hi = 2046) => F.fromBits(((g.u32() & 0x80000000) | ((lo + g.int(hi - lo + 1)) << 20) | (g.u32() & 0xfffff)) >>> 0, g.u32());
  const moderate = (g) => anyDouble(g, 1023 - 80, 1023 + 80);
  const logUniform = (g, e0, e1) => (g.u32() & 1 ? -1 : 1) * F.pow2(Math.floor(g.range(e0, e1))) * g.range(1, 2);
  const isPow2 = (x, k) => { const { m, e } = R.decompose(x); return k - e >= 0 && m === 1n << BigInt(k - e); };

  // ================================================================================================ prng
  section('prng', 'the seeded generator: the C reference, ranges, uniformity, state, refusals', () => {
    for (const [seed, st, first, millionth] of C_REF) {
      const g = P.makePrng(seed);
      const okState = same([...g.state()], st);
      const out = [];
      for (let i = 0; i < 6; i++) out.push(g.u32());
      for (let i = 6; i < 999999; i++) g.u32();
      ok(okState && same(out, first) && g.u32() === millionth, `seed ${seed}: the state, the first six outputs and the millionth match ref/xoshiro128ss.c`);
    }
    const g = P.makePrng(7);
    let floats = true;
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 1e5; i++) {
      const f = g.float();
      if (!(f >= 0 && f < 1 && Number.isInteger(f * 9007199254740992))) floats = false;
      counts[g.int(10)]++;
    }
    const chi2 = counts.reduce((s, c) => s + (c - 1e4) * (c - 1e4) / 1e4, 0);
    ok(floats, 'float(): 1e5 draws in [0, 1), each a multiple of 2^-53 (seed 7)');
    ok(chi2 < 27.88, `int(10): 1e5 draws pass a chi-square test at 0.1 % (χ² = ${chi2.toFixed(2)}, 9 degrees of freedom; seed 7)`);
    let s1 = 0, s2 = 0, units = true, ranged = true;
    for (let i = 0; i < 1e5; i++) {
      const z = g.normal(); s1 += z; s2 += z * z;
      const u = g.unit3(), n = Math.sqrt(u[0] * u[0] + u[1] * u[1] + u[2] * u[2]);
      if (Math.abs(n - 1) > 4 * F.EPS) units = false;
      const r = g.range(-3, 5);
      if (!(r >= -3 && r < 5)) ranged = false;
    }
    const mean = s1 / 1e5, variance = s2 / 1e5 - mean * mean;
    ok(Math.abs(mean) < 0.02 && Math.abs(variance - 1) < 0.02, `normal(): mean ${mean.toFixed(4)}, variance ${variance.toFixed(4)} over 1e5 draws (seed 7)`);
    ok(units && ranged, 'unit3() is unit to 4 ulps and range(-3, 5) stays in [-3, 5), 1e5 draws each');
    const c = g.clone(), st = g.state(), r1 = [g.u32(), g.u32()];
    ok(same([c.u32(), c.u32()], r1) && same([P.restorePrng([...st]).u32()], [r1[0]]), 'clone() and restorePrng(state()) continue the same sequence');
    const big = P.makePrng(5), ref = big.clone();
    ok([0, 1, 2].every(() => big.int(4294967296) === ref.u32()) && P.makePrng(5).int(1) === 0, 'int(2^32) is u32() itself; int(1) is 0');
    ok([-1, 4294967296, 1.5, '1', NaN, undefined].every((s) => refuses(() => P.makePrng(s), bad, { name: 'seed', why: 'not_a_seed' })), 'makePrng refuses seeds that are not whole numbers in [0, 2^32)');
    ok(refuses(() => P.restorePrng([0, 0, 0, 0]), bad, { why: 'all_zero' }) && refuses(() => P.restorePrng([1, 2, 3]), bad, { why: 'not_a_state' }), 'restorePrng refuses the all-zero state and malformed states');
    const wide = P.makePrng(5), M = Number.MAX_VALUE;
    let wideOk = true, lowHalf = 0;
    const seenWide = new Set();
    for (let i = 0; i < 1e4; i++) {
      const x = wide.range(-1e308, 1e308), y = wide.range(-M, M), z = wide.range(-M, 1);
      if (!(x >= -1e308 && x < 1e308 && y >= -M && y < M && z >= -M && z < 1)) wideOk = false;
      if (y < 0) lowHalf++;
      seenWide.add(x);
    }
    ok(wideOk && seenWide.size > 9990 && lowHalf > 4700 && lowHalf < 5300, `range over a width that overflows (−1e308 to 1e308, −MAX to MAX) still spreads over [lo, hi) (${seenWide.size} distinct of 1e4; ${lowHalf} below 0)`);
    ok(refuses(() => g.int(0), bad, { name: 'n' }) && refuses(() => g.int(2.5), bad) && refuses(() => g.range(1, 1), bad, { why: 'not_an_interval' }) && refuses(() => g.range(0, Infinity), bad), 'int and range refuse bad arguments');
    ok(P.isPrng(g) && P.isPrng(c) && !P.isPrng({ ...g }) && Object.isFrozen(g) && Object.isFrozen(g.state()), 'generators are frozen and branded (a copy is not one)');
  });

  // ================================================================================================ float
  section('float', 'bits, neighbours, error-free transformations, directed rounding (checked exactly in BigInt)', () => {
    ok(F.EPS === Number.EPSILON && F.U === Number.EPSILON / 2 && isPow2(F.MIN_NORMAL, -1022) && F.MAX === Number.MAX_VALUE, 'EPS, U, MIN_NORMAL, MAX');
    let good = true;
    for (let k = -1074; k <= 1023; k++) { const p = F.pow2(k); if (!(isPow2(p, k) && F.exponent(p) === k)) good = false; }
    ok(good && F.pow2(-1075) === 0 && F.pow2(1024) === Infinity && Number.isNaN(F.pow2(0.5)), 'pow2(k) is exactly 2^k for every k from -1074 to 1023, and exponent() gives k back');
    ok(F.exponent(0) === -Infinity && Number.isNaN(F.exponent(Infinity)) && F.exponent(3) === 1 && F.exponent(-0.75) === -1 && F.exponent(Number.MIN_VALUE) === -1074, 'exponent of 0, Infinity, 3, -0.75 and the smallest subnormal');
    const g = P.makePrng(11);
    let nb = true, ul = true;
    for (let i = 0; i < 1e5; i++) {
      const x = anyDouble(g, 0, 2045);
      if (x === 0) continue;
      const u = F.nextUp(x), d = F.nextDown(x);
      if (!(u > x && d < x && F.ulpDistance(x, u) === 1 && F.ulpDistance(d, x) === 1 && F.nextDown(u) === x && F.nextUp(d) === x)) nb = false;
      const ax = Math.abs(x);
      if (F.ulp(x) !== F.nextUp(ax) - ax) ul = false;
    }
    ok(nb, 'nextUp and nextDown step to the very next double, both ways, over 1e5 doubles of every binade (seed 11)');
    ok(ul && isPow2(F.ulp(F.MAX), 971) && F.ulp(0) === Number.MIN_VALUE && F.ulp(Infinity) === Infinity, 'ulp(x) is the gap above |x| (1e5 doubles), 2^971 at MAX, 2^-1074 at 0');
    ok(F.nextUp(F.MAX) === Infinity && F.nextUp(Infinity) === Infinity && F.nextUp(-Infinity) === -F.MAX && F.nextDown(-Infinity) === -Infinity && F.nextUp(0) === Number.MIN_VALUE && F.nextUp(-0) === Number.MIN_VALUE && Number.isNaN(F.nextUp(NaN)), 'neighbours at the ends: MAX, ±Infinity, ±0, NaN');
    ok(F.ulpDistance(0, -0) === 0 && F.ulpDistance(-Number.MIN_VALUE, Number.MIN_VALUE) === 2 && F.ulpDistance(1, 2) === 4503599627370496, 'ulpDistance across zero and over a binade');

    let sums = true, fast = true, prods = true, unsafe = 0;
    for (let i = 0; i < 1e5; i++) {
      const a = anyDouble(g, 0, 2045), b = i % 2 ? moderate(g) : anyDouble(g, 0, 2045);
      const s = a + b;
      if (Number.isFinite(s)) {
        const e = F.sumErr(a, b, s);
        if (xcmp(xadd(X(a), X(b)), xadd(X(s), X(e))) !== 0) sums = false;
        const [p, q] = Math.abs(a) >= Math.abs(b) ? [a, b] : [b, a];
        if (xcmp(xadd(X(p), X(q)), xadd(X(s), X(F.fastSumErr(p, q, s)))) !== 0) fast = false;
      }
      const c = moderate(g), d = moderate(g), pr = c * d;
      if (F.prodExact(c, d, pr)) { if (xcmp(xmul(X(c), X(d)), xadd(X(pr), X(F.prodErr(c, d, pr)))) !== 0) prods = false; } else unsafe++;
    }
    ok(sums && fast, 'sumErr and fastSumErr: a + b = s + e exactly, 1e5 pairs of every binade (seed 11)');
    ok(prods && unsafe === 0, 'prodErr: a · b = p + e exactly whenever prodExact holds, 1e5 pairs');
    ok(!F.prodExact(F.pow2(1000), 2, F.pow2(1001)) && !F.prodExact(F.pow2(-500), F.pow2(-500), 0) && F.prodExact(3, 7, 21), 'prodExact says no where the split would overflow or the error underflow');
    ok(same(F.twoSum(1, F.pow2(-60)), [1, F.pow2(-60)]) && same(F.twoProd(1 + F.EPS, 1 + F.EPS), [1 + 2 * F.EPS, F.pow2(-104)]), 'twoSum and twoProd as pairs');

    const ops = [
      ['add', F.addDown, F.addUp, (a, b) => a + b, (a, b) => xadd(X(a), X(b))],
      ['sub', F.subDown, F.subUp, (a, b) => a - b, (a, b) => xsub(X(a), X(b))],
      ['mul', F.mulDown, F.mulUp, (a, b) => a * b, (a, b) => xmul(X(a), X(b))],
    ];
    for (const [name, down, up, op, exact] of ops) {
      let enc = true, tight = true, keeps = true;
      for (let i = 0; i < 1e5; i++) {
        const a = i % 3 ? moderate(g) : anyDouble(g), b = i % 5 ? moderate(g) : anyDouble(g);
        const lo = down(a, b), hi = up(a, b), r = op(a, b);
        if (!encloses(lo, hi, exact(a, b))) enc = false;
        if (Number.isFinite(r) && !((lo === r || lo === F.nextDown(r)) && (hi === r || hi === F.nextUp(r)))) tight = false;
        if (Number.isFinite(r) && r !== 0 && xcmp(X(r), exact(a, b)) === 0 && !(lo === r && hi === r)) keeps = false;
      }
      ok(enc && tight && keeps, `${name}Down ≤ exact ≤ ${name}Up, at most one ulp from the rounded result, and both equal to it when it is exact (1e5 pairs, overflow and subnormals included)`);
    }
    let dv = true, dt = true;
    for (let i = 0; i < 1e5; i++) {
      const a = moderate(g), b = moderate(g);
      const lo = F.divDown(a, b), hi = F.divUp(a, b), q = a / b;
      const lb = xmul(X(lo), X(b)), hb = xmul(X(hi), X(b)), ea = X(a);
      if (!(b > 0 ? xcmp(lb, ea) <= 0 && xcmp(hb, ea) >= 0 : xcmp(lb, ea) >= 0 && xcmp(hb, ea) <= 0)) dv = false;
      if (!((lo === q || lo === F.nextDown(q)) && (hi === q || hi === F.nextUp(q)))) dt = false;
    }
    ok(dv && dt && F.divDown(1, 4) === 0.25 && F.divUp(1, 4) === 0.25 && F.divDown(1, 3) < F.divUp(1, 3), 'divDown ≤ a/b ≤ divUp (checked as products, 1e5 pairs), tight, and exact quotients kept');
    let sq = true;
    for (let i = 0; i < 1e5; i++) {
      const a = Math.abs(anyDouble(g, 1, 2045));
      const lo = F.sqrtDown(a), hi = F.sqrtUp(a), ea = X(a);
      const s = Math.sqrt(a);
      if (!(xcmp(xmul(X(lo), X(lo)), ea) <= 0 && xcmp(xmul(X(hi), X(hi)), ea) >= 0 && (lo === s || lo === F.nextDown(s)) && (hi === s || hi === F.nextUp(s)) && (lo === s || hi === s))) sq = false;
    }
    ok(sq && F.sqrtDown(4) === 2 && F.sqrtUp(4) === 2 && F.sqrtDown(F.pow2(-1000)) === F.pow2(-500), 'sqrtDown² ≤ a ≤ sqrtUp², each the rounded root or its neighbour, one of them the rounded root (1e5 values of every binade, subnormals included); exact roots kept');
    ok(F.addDown(F.MAX, F.MAX) === F.MAX && F.addUp(F.MAX, F.MAX) === Infinity && F.mulDown(F.pow2(-600), F.pow2(-600)) === 0 && F.mulUp(F.pow2(-600), F.pow2(-600)) === Number.MIN_VALUE && F.mulUp(-F.pow2(-600), F.pow2(-600)) === 0, 'overflow and underflow land on the right side');
  });

  // ================================================================================================ trig
  section('trig', 'deterministic elementary functions: within ULPS of the exact value (BigInt), special values, the same bits', () => {
    ok(T.PI === Math.PI && T.HALF_PI === Math.PI / 2 && T.TAU === 2 * Math.PI && T.DEG === Math.PI / 180, 'PI, HALF_PI, TAU, DEG');
    ok(T.PI === R.nearestDouble(R.PI) && T.HALF_PI === R.nearestDouble(R.PIO2), 'PI and HALF_PI are the doubles nearest π and π/2 (π from Machin\'s formula in BigInt)');
    ok(Object.isFrozen(T.ULPS) && Object.values(T.ULPS).every((n) => Number.isInteger(n) && n >= 1 && n <= 3), 'ULPS is frozen, 1 to 3 ulps per function');
    const g = P.makePrng(13);
    const N = 10000;
    const tanRef = (x) => (R.sinRef(x) << R.F) / R.cosRef(x);
    const families = [
      ['sin', T.sin, R.sinRef, () => g.range(-10, 10)], ['sin', T.sin, R.sinRef, () => g.range(-1.6e6, 1.6e6)], ['sin', T.sin, R.sinRef, () => logUniform(g, -30, 20)],
      ['cos', T.cos, R.cosRef, () => g.range(-10, 10)], ['cos', T.cos, R.cosRef, () => g.range(-1.6e6, 1.6e6)], ['cos', T.cos, R.cosRef, () => logUniform(g, -30, 20)],
      ['tan', T.tan, tanRef, () => g.range(-1.5, 1.5)],
      ['atan', T.atan, R.atanRef, () => logUniform(g, -30, 30)],
      ['asin', T.asin, R.asinRef, () => g.range(-1, 1)], ['acos', T.acos, R.acosRef, () => g.range(-1, 1)],
      ['acos', T.acos, R.acosRef, () => 1 - F.pow2(-Math.floor(g.range(1, 52)))],
      ['log', T.log, R.logRef, () => Math.abs(logUniform(g, -1000, 1000))], ['log', T.log, R.logRef, () => g.range(0.5, 2)],
      ['cbrt', T.cbrt, R.cbrtRef, () => logUniform(g, -300, 300)],
    ];
    const worst = {};
    for (const [name, f, ref, gen] of families) for (let i = 0; i < N; i++) {
      const x = gen(), u = R.ulpsOff(f(x), ref(x));
      if (!(u <= (worst[name] || 0))) worst[name] = u;
    }
    for (let i = 0; i < N; i++) {
      const y = g.range(-5, 5), x = g.range(-5, 5), u = R.ulpsOff(T.atan2(y, x), R.atan2Ref(y, x));
      if (!(u <= (worst.atan2 || 0))) worst.atan2 = u;
      for (const x2 of [g.range(-700, 700), g.range(-2, 2)]) {
        const { m, k } = R.expRef(x2), v = R.ulpsOff(T.exp(x2) * F.pow2(-k), m);
        if (!(v <= (worst.exp || 0))) worst.exp = v;
      }
    }
    const report = Object.entries(worst).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ');
    ok(Object.entries(worst).every(([k, v]) => v <= T.ULPS[k]), `within ULPS on ${16 * N} random arguments (largest errors in ulps: ${report}; seed 13)`);
    let hard = 0;
    for (let i = 0; i < 2000; i++) {
      const n = BigInt(1 + g.int(1048575)), x0 = R.nearestDouble(n * R.PIO2);
      for (const x of [x0, F.nextUp(x0), F.nextDown(x0)]) hard = Math.max(hard, R.ulpsOff(T.sin(x), R.sinRef(x)), R.ulpsOff(T.cos(x), R.cosRef(x)));
    }
    ok(hard <= 1, `sin and cos next to 2000 multiples of π/2 up to 2^20 (where reduction loses the most): largest error ${hard.toFixed(2)} ulps`);
    // every finite argument, not only the ones a model uses: the reduction must stay exact out to the largest double
    const TWO_OVER_PI_BITS = (2n << (R.PI_BIG_BITS + 1216n)) / R.piBig();
    ok(T.TWO_OVER_PI_1216 === TWO_OVER_PI_BITS, 'the 1216 bits of 2/π that the large-argument reduction uses are those of 2/π from Machin\'s formula');
    let far = 0, farTan = 0, inRange = true;
    const farCheck = (x) => {
      const [sr, cr] = R.sincosRefAny(x), s = T.sin(x), c = T.cos(x), sc = T.sincos(x);
      if (!(Math.abs(s) <= 1 && Math.abs(c) <= 1 && Object.is(sc[0], s) && Object.is(sc[1], c))) inRange = false;
      const u = Math.max(R.ulpsOff(s, sr), R.ulpsOff(c, cr));
      if (!(u <= far)) far = u;
      const t = R.ulpsOff(T.tan(x), (sr << R.F) / cr);
      if (!(t <= farTan)) farTan = t;
    };
    for (let i = 0; i < 20000; i++) farCheck(logUniform(g, 20, 1023));
    for (let i = 0; i < 3000; i++) {                     // next to multiples of π/2 far past 2^20
      const n = (BigInt(g.u32()) << BigInt(g.int(21))) | 1n, x0 = R.nearestDouble(n * R.PIO2);
      for (const x of [x0, F.nextUp(x0), F.nextDown(x0), -x0]) farCheck(x);
    }
    const famous = [1e22, -1e22, 1e40, 1e300, F.pow2(45), F.pow2(55), F.pow2(120), F.pow2(1023), Number.MAX_VALUE, -Number.MAX_VALUE, 1647099, 1647100, F.nextUp(1647099),
      6381956970095103 * F.pow2(797), 5.319372648326541e+255, 0.5 * 16367173 * F.pow2(72)];
    for (const x of famous) farCheck(x);
    ok(inRange, 'sin and cos stay in [−1, 1] for every finite argument, and sincos is [sin, cos] to the bit');
    ok(far <= T.ULPS.sin && farTan <= T.ULPS.tan, `sin, cos and tan out to the largest double: 2e4 random arguments from 2^20 to 2^1024, 1.2e4 next to multiples of π/2, the hardest known double (6381956970095103 · 2^797) and ${famous.length - 1} more; largest errors ${far.toFixed(2)} and ${farTan.toFixed(2)} ulps`);
    ok(T.sin(1e22) === -0.8522008497671888 && T.cos(1e22) === 0.523214785395139, 'sin(1e22) and cos(1e22) are the correctly rounded values');
    let tiny = true;
    for (let i = 0; i < 1e4; i++) { const x = logUniform(g, -1074, -28); if (!(T.sin(x) === x && T.tan(x) === x && T.atan(x) === x && T.cos(x) === 1 && T.asin(x) === x)) tiny = false; }
    ok(tiny, 'below 2^-27: sin, tan, atan and asin give x itself and cos gives 1 (1e4 arguments)');
    const specials = [
      [T.sin(-0), -0], [T.sin(0), 0], [T.cos(0), 1], [T.sin(Infinity), NaN], [T.cos(NaN), NaN], [T.atan(Infinity), T.HALF_PI], [T.atan(-0), -0],
      [T.atan2(0, -0), Math.PI], [T.atan2(-0, -0), -Math.PI], [T.atan2(-0, 0), -0], [T.atan2(1, 0), T.HALF_PI], [T.atan2(-1, -0), -T.HALF_PI],
      [T.atan2(Infinity, -Infinity), 3 * Math.PI / 4], [T.atan2(-Infinity, Infinity), -Math.PI / 4], [T.atan2(1, -Infinity), Math.PI],
      [T.asin(1), T.HALF_PI], [T.asin(2), NaN], [T.acos(1), 0], [T.acos(-1), Math.PI], [T.acos(0), T.HALF_PI],
      [T.exp(0), 1], [T.exp(-Infinity), 0], [T.exp(Infinity), Infinity], [T.exp(710), Infinity], [T.exp(-746), 0], [T.exp(NaN), NaN],
      [T.log(1), 0], [T.log(0), -Infinity], [T.log(-1), NaN], [T.log(Infinity), Infinity], [T.log(Number.MIN_VALUE), -744.4400719213812],
      [T.cbrt(-27), -3], [T.cbrt(64), 4], [T.cbrt(-0), -0], [T.cbrt(-Infinity), -Infinity],
    ];
    const bad2 = specials.map(([got, want], i) => (Object.is(got, want) ? null : i)).filter((i) => i !== null);
    ok(bad2.length === 0, `special values: signed zeros, infinities, NaN, the ends of exp and log, exact cube roots (${specials.length} cases)` + (bad2.length ? ' (wrong: ' + bad2.join(', ') + ')' : ''));
    let pyth = true, pairs = true;
    for (let i = 0; i < 1e5; i++) {
      const x = i % 2 ? g.range(-100, 100) : logUniform(g, -20, 20);
      const s = T.sin(x), c = T.cos(x), sc = T.sincos(x);
      if (Math.abs(s * s + c * c - 1) > 4 * F.EPS) pyth = false;
      if (!(Object.is(sc[0], s) && Object.is(sc[1], c) && Object.is(T.tan(x), s / c))) pairs = false;
    }
    ok(pyth, 'sin² + cos² is 1 to 4 ulps on 1e5 arguments');
    ok(pairs, 'sincos is [sin, cos] to the bit, and tan is sin/cos (1e5 arguments)');
    const h = P.makePrng(99);
    let hash = 0x811c9dc5;
    const mix = (v) => { for (const w of R.bitsOf(v)) for (let k = 0; k < 4; k++) { hash ^= (w >>> (8 * k)) & 0xff; hash = Math.imul(hash, 0x01000193) >>> 0; } };
    for (let i = 0; i < 2000; i++) {
      const x = h.range(-50, 50), y = h.range(-1, 1), z = h.range(0.001, 1e6);
      mix(T.sin(x)); mix(T.cos(x)); mix(T.atan(x)); mix(T.atan2(y, x)); mix(T.asin(y)); mix(T.acos(y)); mix(T.exp(x)); mix(T.log(z)); mix(T.cbrt(x));
    }
    ok(hash === GOLDEN, `the same bits: 18,000 results hash to 0x${hash.toString(16).padStart(8, '0')} (recorded 0x${GOLDEN.toString(16).padStart(8, '0')}); a change here means trig.js changed its answers`);
  });

  // ================================================================================================ intervals
  section('intervals', 'interval arithmetic: every exact result inside (BigInt), exact cases kept tight, crests found', () => {
    ok(same(I.iv(1, 2), [1, 2]) && same(I.iv(3), [3, 3]) && same(I.iv(-Infinity, Infinity), [-Infinity, Infinity]), 'iv makes intervals');
    ok([[2, 1], [NaN, 1], [0, NaN], ['0', 1]].every(([a, b]) => refuses(() => I.iv(a, b), bad, { name: 'interval', why: 'not_an_interval' })), 'iv refuses lo > hi, NaN and non-numbers');
    ok(Object.isFrozen(I.ENTIRE) && same(I.ENTIRE, [-Infinity, Infinity]), 'ENTIRE is frozen');
    const g = P.makePrng(17);
    const pick = (a) => { const t = g.int(4); return t === 0 ? a[0] : t === 1 ? a[1] : a[0] + (a[1] - a[0]) * g.float(); };
    const randIv = () => { const p = moderate(g), q = moderate(g); return p <= q ? [p, q] : [q, p]; };
    let enc = { add: true, sub: true, mul: true, div: true, sqr: true, sqrt: true, abs: true, scale: true };
    for (let i = 0; i < 1e5; i++) {
      const a = randIv(), b = randIv(), x = pick(a), y = pick(b), s = moderate(g);
      if (!(x >= a[0] && x <= a[1] && y >= b[0] && y <= b[1])) continue;
      const A = I.add(a, b), S = I.sub(a, b), M = I.mul(a, b), Q = I.sqr(a), Sc = I.scale(a, s);
      if (!encloses(A[0], A[1], xadd(X(x), X(y)))) enc.add = false;
      if (!encloses(S[0], S[1], xsub(X(x), X(y)))) enc.sub = false;
      if (!encloses(M[0], M[1], xmul(X(x), X(y)))) enc.mul = false;
      if (!encloses(Q[0], Q[1], xmul(X(x), X(x)))) enc.sqr = false;
      if (!encloses(Sc[0], Sc[1], xmul(X(x), X(s)))) enc.scale = false;
      const Ab = I.abs(a); if (!(Ab[0] <= Math.abs(x) && Math.abs(x) <= Ab[1])) enc.abs = false;
      if (!(b[0] <= 0 && b[1] >= 0)) {
        const D = I.div(a, b);
        const lo = xmul(X(D[0]), X(y)), hi = xmul(X(D[1]), X(y)), ex = X(x);
        if (!(y > 0 ? xcmp(lo, ex) <= 0 && xcmp(hi, ex) >= 0 : xcmp(lo, ex) >= 0 && xcmp(hi, ex) <= 0)) enc.div = false;
      }
      const pa = [Math.abs(a[0]), Math.abs(a[1])].sort((p, q) => p - q), r = pick(pa), Sq = I.sqrt(pa);
      if (!(xcmp(xmul(X(Sq[0]), X(Sq[0])), X(r)) <= 0 && xcmp(xmul(X(Sq[1]), X(Sq[1])), X(r)) >= 0)) enc.sqrt = false;
    }
    const failed = Object.entries(enc).filter(([, v]) => !v).map(([k]) => k);
    ok(failed.length === 0, 'add, sub, mul, div, sqr, sqrt, abs and scale hold the exact result for points of their arguments, 1e5 random cases each (seed 17)' + (failed.length ? ' (failed: ' + failed.join(', ') + ')' : ''));
    let waves = true;
    for (let i = 0; i < 2e4; i++) {
      const c = g.range(-50, 50), w = i % 3 ? g.range(0, 0.5) : g.range(0, 7), a = [c, c + w], x = pick(a);
      const Sn = I.sin(a), Cs = I.cos(a), sx = R.sinRef(x), cx = R.cosRef(x);
      const inFix = (iv, v) => (iv[0] === -1 || R.fix(iv[0]) <= v) && (iv[1] === 1 || R.fix(iv[1]) >= v);
      if (!(inFix(Sn, sx) && inFix(Cs, cx))) waves = false;
    }
    ok(waves, 'sin and cos of an interval hold sin and cos (exact, BigInt) of points inside it, 2e4 intervals up to 7 wide');
    ok(same(I.add([1, 1], [2, 2]), [3, 3]) && same(I.mul([0.5, 0.5], [4, 4]), [2, 2]) && same(I.sqrt([4, 9]), [2, 3]) && same(I.div([1, 1], [4, 4]), [0.25, 0.25]), 'exact operations stay points: no needless widening');
    const third = I.div([1, 1], [3, 3]);
    ok(third[1] === F.nextUp(third[0]) && (third[0] === 1 / 3 || third[1] === 1 / 3), '1/3 is enclosed by two neighbouring doubles, one of them the rounded quotient');
    ok(I.sin([0, Math.PI])[1] === 1 && I.sin([0, Math.PI])[0] <= 0 && I.cos([-0.1, 0.1])[1] === 1 && I.sin([3, 3.5])[1] < 1 && I.cos([Math.PI - 0.1, Math.PI + 0.1])[0] === -1, 'crests inside an interval reach ±1, and only those');
    ok(same(I.sin([0, 7]), [-1, 1]) && same(I.cos([2e6, 2e6 + 1]), [-1, 1]), 'wide or far-out intervals give [-1, 1]');
    ok(same(I.div([1, 2], [-1, 1]), [-Infinity, Infinity]) && same(I.mul([0, 0], [-Infinity, Infinity]), [0, 0]), 'division by an interval holding 0 is unbounded; 0 times an unbounded interval is 0');
    const inf = Infinity;
    const unb = [
      [[0, inf], [1, inf], [0, inf]], [[1, inf], [1, inf], [0, inf]], [[-inf, inf], [1, inf], [-inf, inf]], [[-inf, -1], [2, inf], [-inf, 0]],
      [[-inf, 0], [-inf, -1], [0, inf]], [[1, 2], [4, inf], [0, 0.5]], [[-inf, inf], [-inf, -2], [-inf, inf]], [[3, inf], [-inf, -1], [-inf, 0]],
      [[-2, inf], [1, 4], [-2, inf]], [[-inf, 6], [2, 3], [-inf, 3]],
    ];
    const unbBad = unb.filter(([a, b, want]) => { const d = I.div(a, b); return !(d[0] === want[0] && d[1] === want[1]); }).map(([a, b]) => `[${a}]/[${b}]`);
    ok(unbBad.length === 0, `division with unbounded ends: no NaN, and the tightest bounds (${unb.length} cases)` + (unbBad.length ? ' (wrong: ' + unbBad.join(' ') + ')' : ''));
    ok(I.contains(I.div([0, inf], [1, inf]), 5) && same(I.intersect(I.div([0, inf], [1, inf]), [0, 10]), [0, 10]), 'an unbounded quotient still answers contains and intersect');
    let unbEnc = true;
    for (let i = 0; i < 2e4; i++) {
      const a = randIv(), b = randIv();
      if (b[0] <= 0 && b[1] >= 0) continue;
      const k = g.int(4);
      if (k & 1) { if (g.u32() & 1) a[0] = -inf; else a[1] = inf; }
      if (k & 2) { if (b[0] > 0) b[1] = inf; else b[0] = -inf; }
      const D = I.div(a, b), T2 = I.div([Number.isFinite(a[0]) ? a[0] : -1e300, Number.isFinite(a[1]) ? a[1] : 1e300], [Number.isFinite(b[0]) ? b[0] : -1e300, Number.isFinite(b[1]) ? b[1] : 1e300]);
      if (!(D[0] <= T2[0] && D[1] >= T2[1])) unbEnc = false;      // NaN bounds fail here too
    }
    ok(unbEnc, 'division with random unbounded ends encloses the quotient of every bounded part (2e4 cases)');
    ok([[-inf, -inf], [inf, inf], [inf], [-inf]].every((a) => refuses(() => I.iv(...a), bad, { name: 'interval', why: 'not_an_interval' })), 'iv refuses an interval that is only an infinity: it holds no real number');
    ok([NaN, inf, -inf, '2', undefined].every((s) => refuses(() => I.scale([1, 2], s), bad, { name: 'scale', why: 'not_finite' })) && same(I.scale([1, 2], -2), [-4, -2]), 'scale refuses a factor that is not a finite number');
    ok(refuses(() => I.sqrt([-2, -1]), bad, { why: 'negative' }) && same(I.sqrt([-1, 4]), [0, 2]), 'sqrt keeps the part ≥ 0 and refuses a wholly negative interval');
    ok(I.sign([1, 2]) === 1 && I.sign([-2, -1]) === -1 && I.sign([0, 0]) === 0 && I.sign([-1, 1]) === null && I.sign([0, 1]) === null, 'sign: certain, zero, or null when it cannot tell');
    ok(same(I.hull([1, 2], [4, 5]), [1, 5]) && same(I.intersect([1, 3], [2, 5]), [2, 3]) && I.intersect([1, 2], [3, 4]) === null && I.contains([1, 2], 2) && !I.contains([1, 2], 3), 'hull, intersect, contains');
    ok(I.width([1, 1 + F.EPS]) === F.EPS && I.mid([1, 3]) === 2 && I.mid([-Infinity, Infinity]) === 0 && I.mid([Number.MIN_VALUE, Number.MIN_VALUE]) === Number.MIN_VALUE && I.mag([-3, 2]) === 3 && I.mig([-3, 2]) === 0 && I.mig([2, 5]) === 2, 'width, mid (inside, even for subnormals), mag, mig');
  });
}
