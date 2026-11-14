/* SPDX-License-Identifier: Apache-2.0 */
/**
 * test-geom.mjs — engine.solid's geometry-layer tests, registered by test.mjs: sync (the engine and cc-nurbs are canonical
 * here and are copied byte for byte into each host) and basis (S4: knot vectors, spans, basis functions and derivatives).
 *
 * The reference is exact. Every knot and every u is a double, so every basis value and derivative is a rational number,
 * and the Cox–de Boor recursion computes it exactly in BigInt fractions. Values are compared against it with a proved
 * bound: A2.2 combines only non-negative numbers, six roundings per degree, so each value is within γ(6p) of the truth
 * relative to itself. Derivatives (A2.3) subtract, so their error is measured against the row's largest value and held
 * to a recorded bound (DERS_C), the way trig.js's ULPS table is.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from './bigref.mjs';
import { TARGETS, filesOf, syncTo } from './sync.mjs';
import { TARGETS as NURBS_TARGETS } from '../nurbs/sync.mjs';
import { genKnots, genU, degree, digest } from './digest.mjs';   // the generators live there so a browser can run them too

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UR = 2 ** -53;                       // the unit roundoff
const TINY = 2 ** -1000;                   // below this a value may have underflowed: compared absolutely
const DERS_C = 4;                          // derivatives: |error| ≤ DERS_C · p² · u · max_j |exact|  (measured max below)
const GOLDEN_BASIS = 0x98fda410;           // the same bits: the hash of 4,000 seeded evaluations (recorded at S4)

// ---------------------------------------------------------------------------------------------- exact rationals
const babs = (a) => (a < 0n ? -a : a);
const gcd = (a, b) => { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; };
const Q = (n, d = 1n) => { if (d < 0n) { n = -n; d = -d; } if (n === 0n) return ZERO; const g = gcd(n, d); return { n: n / g, d: d / g }; };
const ZERO = { n: 0n, d: 1n }, ONE = { n: 1n, d: 1n };
const qd = (x) => { const { m, e } = R.decompose(x); return e >= 0 ? Q(m << BigInt(e)) : Q(m, 1n << BigInt(-e)); };
const qsub = (a, b) => (b.n === 0n ? a : Q(a.n * b.d - b.n * a.d, a.d * b.d));
const qmul = (a, b) => (a.n === 0n || b.n === 0n ? ZERO : Q(a.n * b.n, a.d * b.d));
const qcmp = (a, b) => { const t = a.n * b.d - b.n * a.d; return t > 0n ? 1 : t < 0n ? -1 : 0; };
const qscale = (a, k) => Q(a.n * BigInt(k), a.d);              // a · k for a whole k
const bl = (x) => babs(x).toString(2).length;
const qnum = (a) => { if (a.n === 0n) return 0; const s = bl(a.n) - bl(a.d) - 60; const q = s >= 0 ? a.n / (a.d << BigInt(s)) : (a.n << BigInt(-s)) / a.d; return Number(q) * 2 ** s; };
const qbinom = (n, k) => { let r = 1n; for (let i = 1; i <= k; i++) r = (r * BigInt(n - k + i)) / BigInt(i); return r; };

/** The span by a linear scan (independent of A2.1): U[i] ≤ u < U[i+1], or the last non-empty span at u = b. */
function scanSpan(U, p, u) {
  const n = U.length - p - 2;
  for (let i = p; i <= n; i++) if (U[i] <= u && u < U[i + 1]) return i;
  for (let i = n; i >= p; i--) if (U[i] < U[i + 1]) return i;
  return -1;
}

/**
 * Exact Cox–de Boor: D[k][j] = k-th derivative of N(s − p + j, p) at u, k = 0 … d, as fractions { n, d } (not reduced).
 * Knots and u are scaled by one power of two to whole numbers (t = u · 2^S): the basis does not change, and a k-th
 * derivative in u is the one in t times 2^(kS). Every entry of a degree level shares one denominator, the product of all
 * earlier levels' non-zero knot differences, so the recursion needs only whole-number multiplication and exact division
 * by one knot difference: no gcd (which made this reference 30 times slower).
 */
function exact(U, p, u, d) {
  const s = scanSpan(U, p, u), m = U.length - 1;
  const parts = [...U, u].map(R.decompose), E = Math.min(...parts.map((x) => x.e));
  const q = parts.slice(0, -1).map(({ m: mm, e }) => mm << BigInt(e - E)), t = parts.at(-1).m << BigInt(parts.at(-1).e - E);
  let X = Array.from({ length: d + 1 }, () => new Array(m + 2).fill(0n)), den = 1n;
  X[0][s] = 1n;
  for (let deg = 1; deg <= p; deg++) {
    let P = 1n;
    for (let j = s - deg; j <= s + 1; j++) { const df = q[j + deg] - q[j]; if (df !== 0n) P *= df; }
    const nxt = Array.from({ length: d + 1 }, () => new Array(m + 2).fill(0n));
    for (let j = s - deg; j <= s; j++) {
      const d1 = q[j + deg] - q[j], d2 = q[j + deg + 1] - q[j + 1];
      const c1 = d1 === 0n ? 0n : P / d1, c2 = d2 === 0n ? 0n : P / d2;
      nxt[0][j] = (t - q[j]) * X[0][j] * c1 + (q[j + deg + 1] - t) * X[0][j + 1] * c2;
      for (let k = 1; k <= d; k++) nxt[k][j] = BigInt(deg) * (X[k - 1][j] * c1 - X[k - 1][j + 1] * c2);
    }
    X = nxt;
    den *= P;
  }
  const D = X.map((row, k) => row.slice(s - p, s + 1).map((n) => {
    const sh = BigInt(-E * k);                    // 2^(kS), S = −E
    return sh >= 0n ? { n: n << sh, d: den } : { n, d: den << -sh };
  }));
  return { s, D };
}
/** The exact reference, shared with the curve and surface tests: exactBasis(U, p, u, d) → { s, D } as exact() above. */
export const exactBasis = (U, p, u, d) => exact(U, p, u, d);

/** |x − r| for a double x and a fraction r, as a fraction (not reduced). */
function diff(x, r) {
  const { m, e } = R.decompose(x);
  const n = e >= 0 ? (m << BigInt(e)) * r.d - r.n : m * r.d - (r.n << BigInt(-e)), dd = e >= 0 ? r.d : r.d << BigInt(-e);
  return { n: n < 0n ? -n : n, d: dd };
}
/** The proved bound for a basis value: |x − t| ≤ γ(6p) t, i.e. err · (2^53 − 6p) ≤ 6p · t; below TINY, |x − t| ≤ TINY. */
const withinGamma = (x, t, p) => {
  const err = diff(x, t);
  return qcmp({ n: err.n * ((1n << 53n) - BigInt(6 * p)), d: err.d }, { n: t.n * BigInt(6 * p), d: t.d }) <= 0 || qcmp(err, qd(TINY)) <= 0;
};

export async function register({ section, ok, refuses, same, appUrl }) {
  const P = await import(appUrl('solid/index.js'));
  const B = await import(appUrl('solid/geom/basis.js'));
  const NB = await import(appUrl('nurbs/basis.js'));
  const APP = path.dirname(path.dirname(fileURLToPath(appUrl('solid/index.js'))));

  // ============================================================================================== sync
  section('sync', 'lib/solid and lib/nurbs are canonical here; each host carries byte-identical copies (tools/solid/sync.mjs)', () => {
    const solidDir = path.join(APP, 'solid'), nurbsDir = path.join(APP, 'nurbs');   // APP is lib/: it holds solid/ and nurbs/
    ok(fs.existsSync(solidDir) && fs.existsSync(nurbsDir), 'the engine and cc-nurbs sit side by side in lib/ (the engine imports ../nurbs/)');

    // line endings: a copy that was checked out with CRLF is not byte-identical to its canonical file
    const withCR = [];
    for (const [dir, label] of [[solidDir, 'solid'], [nurbsDir, 'nurbs']]) {
      for (const n of filesOf(dir)) if (fs.readFileSync(path.join(dir, n)).includes(13)) withCR.push(label + '/' + n);
    }
    ok(withCR.length === 0, 'every file of lib/solid and lib/nurbs uses LF only (a CRLF checkout breaks byte-identity: set core.autocrlf=false or keep .gitattributes)' + (withCR.length ? ' — CR in: ' + withCR.slice(0, 5).join(', ') + (withCR.length > 5 ? ' …' : '') : ''));

    // every host the engine syncs to is a host that gets cc-nurbs, and the engine is never copied somewhere it cannot import it from
    const nurbsHosts = Object.keys(NURBS_TARGETS);
    const orphans = Object.keys(TARGETS).filter((t) => !nurbsHosts.includes(t));
    ok(Object.keys(TARGETS).length > 0 && orphans.length === 0, 'every solid target is also a cc-nurbs target' + (orphans.length ? ' (not: ' + orphans.join(', ') + ')' : ''));
    ok(Object.keys(TARGETS).every((t) => path.basename(TARGETS[t]) === 'solid' && path.basename(path.dirname(TARGETS[t])) === 'dev' && path.dirname(TARGETS[t]) === path.dirname(NURBS_TARGETS[t].dir)), 'each target is <app>/dev/solid, next to the same app\'s dev/nurbs');

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-solid-sync-'));
    try {
      const dev = path.join(tmp, 'dev'), host = path.join(dev, 'solid');
      fs.mkdirSync(path.join(dev, 'nurbs'), { recursive: true });
      const want = filesOf(solidDir);
      ok(want.length > 0 && want.every((n) => !n.startsWith('/') && !n.includes('\\')) && want.some((n) => n.includes('/')), 'the file list is recursive, relative, with "/" separators (' + want.length + ' files)');

      const dry = syncTo(host, { check: true });
      ok(dry.changed.length === want.length && dry.stale.length === 0 && !fs.existsSync(host), 'check on a host without solid/ lists every file and creates nothing');
      const first = syncTo(host);
      const copied = filesOf(host);
      ok(first.files === want.length && JSON.stringify(copied) === JSON.stringify(want) && want.every((n) => Buffer.compare(fs.readFileSync(path.join(solidDir, n)), fs.readFileSync(path.join(host, n))) === 0), 'sync copies every file, byte for byte, sub-folders included');
      const again = syncTo(host, { check: true });
      ok(again.changed.length === 0 && again.stale.length === 0, 'a second check finds nothing to do');

      // drift: an edited file, a deleted file, an extra file and an extra folder
      const victim = want.find((n) => n.endsWith('index.js')) || want[0], gone = want.find((n) => n !== victim && n.includes('/'));
      fs.appendFileSync(path.join(host, victim), '\n');
      fs.rmSync(path.join(host, gone));
      fs.mkdirSync(path.join(host, 'extra'), { recursive: true });
      fs.writeFileSync(path.join(host, 'extra', 'x.js'), '');
      const before = filesOf(host);
      const drift = syncTo(host, { check: true });
      ok(drift.changed.includes(victim) && drift.changed.includes(gone) && drift.stale.includes('extra/x.js') && JSON.stringify(filesOf(host)) === JSON.stringify(before), 'check reports an edited, a deleted and an extra file, and changes nothing');
      const fix = syncTo(host);
      ok(fix.changed.length === 2 && fix.stale.length === 1 && JSON.stringify(filesOf(host)) === JSON.stringify(want) && !fs.existsSync(path.join(host, 'extra')), 'sync repairs all three and removes the emptied folder');

      // refusals leave everything as it was
      const lone = path.join(tmp, 'lone', 'solid');
      fs.mkdirSync(path.dirname(lone), { recursive: true });
      const noNurbs = syncTo(lone);
      ok(/nurbs/.test(noNurbs.problem || '') && !fs.existsSync(lone), 'a host with no nurbs/ beside it is refused, and nothing is created');
      const inside = syncTo(path.join(solidDir, 'nested'), { lib: solidDir });
      const self = syncTo(solidDir, { lib: solidDir });
      ok(inside.problem && self.problem && !fs.existsSync(path.join(solidDir, 'nested')), 'the engine is never synced into itself');
      const empty = path.join(tmp, 'empty');
      fs.mkdirSync(empty);
      ok(syncTo(host, { lib: empty }).problem && syncTo(host, { lib: path.join(tmp, 'absent') }).problem && JSON.stringify(filesOf(host)) === JSON.stringify(want), 'an empty or missing source is refused, and the host keeps its files');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  // ============================================================================================== basis
  section('basis', 'knot vectors, spans, basis functions and derivatives against exact Cox–de Boor (BigInt rationals)', () => {
    const g = P.makePrng(41);

    // ----- spans: 1e5 cases, against a linear scan, and against cc-nurbs on clamped vectors
    let spanBad = 0, vsNurbs = 0, clampedCases = 0, nonneg = 0, unity = 0, sameBits = 0, maxPU = 0;
    for (let c = 0; c < 1e5; c++) {
      const p = degree(g), U = genKnots(g, p), u = genU(g, U, p), K = B.knots(U, p);
      const i = B.span(K, u);
      if (i !== scanSpan(U, p, u) || !(U[i] < U[i + 1]) || i < p || i > K.n) spanBad++;
      if (K.clamped) { clampedCases++; if (NB.findSpan(K.n, p, u, U) !== i) vsNurbs++; }
      const { N } = B.basis(K, u);
      if (N.length !== p + 1 || N.some((v) => !(v >= 0))) nonneg++;
      let sum = 0;
      for (const v of N) sum += v;
      const e = Math.abs(sum - 1) / UR;
      if (e > maxPU) maxPU = e;
      if (e > 7 * p + 1) unity++;
      if (c % 10 === 0) { const D = B.ders(K, u, 1).ders[0]; if (!D.every((v, j) => Object.is(v, N[j]))) sameBits++; }
    }
    ok(spanBad === 0, `span: p ≤ i ≤ n, U[i] ≤ u < U[i+1] (the last non-empty span at u = b), equal to a linear scan (1e5 cases)` + (spanBad ? ` — ${spanBad} wrong` : ''));
    ok(vsNurbs === 0 && clampedCases > 2e4, `span equals cc-nurbs' findSpan on every clamped vector (${clampedCases} cases)`);
    ok(nonneg === 0, 'basis: p + 1 values, every one ≥ 0 exactly (1e5 cases)');
    ok(unity === 0, `basis: they sum to 1 within (7p + 1) u — measured worst ${maxPU.toFixed(2)} u (1e5 cases)`);
    ok(sameBits === 0, 'ders(…)[0] is basis(…) to the bit (A2.3 and A2.2 do the same arithmetic; 1e4 cases)');

    // ----- values against the exact recursion, with the proved bound |N̂ − N| ≤ γ(6p) N
    let valBad = 0, worst = 0, worstP = 0;
    for (let c = 0; c < 2e4; c++) {
      const p = degree(g), U = genKnots(g, p), u = genU(g, U, p), K = B.knots(U, p);
      const { span, N } = B.basis(K, u), ex = exact(U, p, u, 0);
      if (span !== ex.s) { valBad++; continue; }
      for (let j = 0; j <= p; j++) {
        const t = ex.D[0][j];
        if (!withinGamma(N[j], t, p)) valBad++;
        if (t.n !== 0n && qcmp(t, qd(TINY)) > 0) { const err = diff(N[j], t), r = qnum({ n: err.n * t.d, d: err.d * t.n }) / UR / Math.max(1, p); if (r > worst) { worst = r; worstP = p; } }
      }
    }
    ok(valBad === 0, `basis: every value within γ(6p) of exact, relative to itself (2e4 cases, degrees 0–15) — measured worst ${worst.toFixed(2)} p·u (p = ${worstP})` + (valBad ? ` — ${valBad} outside` : ''));

    // ----- derivatives against the exact recursion
    let derBad = 0, derWorst = 0, aboveP = 0;
    for (let c = 0; c < 4000; c++) {
      const p = 1 + g.int(9), U = genKnots(g, p), u = genU(g, U, p), K = B.knots(U, p), d = p + 1;
      const D = B.ders(K, u, d).ders, ex = exact(U, p, u, d);
      if (D.length !== d + 1 || D[d].some((v) => v !== 0)) aboveP++;
      for (let k = 1; k <= p; k++) {
        let Mn = 0;
        for (const t of ex.D[k]) Mn = Math.max(Mn, Math.abs(qnum(t)));
        if (Mn === 0) { if (D[k].some((v) => v !== 0)) derBad++; continue; }
        for (let j = 0; j <= p; j++) {
          const r = qnum(diff(D[k][j], ex.D[k][j])) / (UR * p * p * Mn);
          if (r > derWorst) derWorst = r;
          if (!(r <= DERS_C)) derBad++;
        }
      }
    }
    ok(aboveP === 0, 'ders: d + 1 rows, and the rows above the degree are exactly zero');
    ok(derBad === 0, `ders: |error| ≤ ${DERS_C} p² u · max |row| against exact derivatives (4,000 cases, p = 1–9, every order) — measured worst ${derWorst.toFixed(3)}` + (derBad ? ` — ${derBad} outside` : ''));

    // ----- the Bézier case: clamped [0 … 0, 1 … 1] gives the Bernstein polynomials (and their derivatives)
    let bern = 0;
    for (let p = 0; p <= 15; p++) {
      const U = [...new Array(p + 1).fill(0), ...new Array(p + 1).fill(1)], K = B.knots(U, p);
      for (let c = 0; c < 64; c++) {
        const u = c === 0 ? 0 : c === 1 ? 1 : g.float(), uq = qd(u), w = qsub(ONE, uq);
        const { N } = B.basis(K, u), D = B.ders(K, u, 1).ders;
        const pow = (x, e) => { let r = ONE; for (let t = 0; t < e; t++) r = qmul(r, x); return r; };
        const bq = (i, q) => (i < 0 || i > q ? ZERO : qmul(Q(qbinom(q, i)), qmul(pow(uq, i), pow(w, q - i))));
        for (let i = 0; i <= p; i++) {
          if (!withinGamma(N[i], bq(i, p), p)) bern++;
          if (p >= 1) {   // B'(i,p) = p (B(i−1,p−1) − B(i,p−1))
            const td = qscale(qsub(bq(i - 1, p - 1), bq(i, p - 1)), p);
            if (Math.abs(D[1][i] - qnum(td)) > DERS_C * p * p * UR * p * 2) bern++;
          }
        }
      }
    }
    ok(bern === 0, 'the Bézier case equals the Bernstein polynomials exactly to γ(6p), and their first derivatives (degrees 0–15, 64 points each)');

    // ----- derivatives against a fourth-order central difference inside a span
    let fd = 0, fdWorst = 0;
    for (let c = 0; c < 2000; c++) {
      const p = 1 + g.int(6), U = genKnots(g, p, g.int(2) ? 'plain' : 'clamped'), K = B.knots(U, p);
      const spans = []; for (let i = p; i <= K.n; i++) if (U[i] < U[i + 1]) spans.push(i);
      const s = spans[g.int(spans.length)], h0 = U[s + 1] - U[s], h = h0 / 64, u = U[s] + h0 * (0.25 + 0.5 * g.float());
      for (let k = 1; k <= p; k++) {
        const f = (x) => B.ders(K, x, k - 1).ders[k - 1], D = B.ders(K, u, k).ders[k];
        const a1 = f(u + h), b1 = f(u - h), a2 = f(u + 2 * h), b2 = f(u - 2 * h);
        let scale = 0; for (const v of D) scale = Math.max(scale, Math.abs(v));
        let low = 0; for (const v of f(u)) low = Math.max(low, Math.abs(v));
        for (let j = 0; j <= p; j++) {
          const est = (8 * (a1[j] - b1[j]) - (a2[j] - b2[j])) / (12 * h);
          const r = Math.abs(est - D[j]) / (scale + low / h);
          if (r > fdWorst) fdWorst = r;
          if (!(r <= 1e-5)) fd++;
        }
      }
    }
    ok(fd === 0, `ders agree with a fourth-order central difference of the order below (2,000 cases, p = 1–6, every order) — worst ${fdWorst.toExponential(2)} of scale`);

    // ----- one basis function at a time, and the unclamped-end fix
    let ones = 0;
    for (let c = 0; c < 5000; c++) {
      const p = degree(g), U = genKnots(g, p), u = genU(g, U, p), K = B.knots(U, p), { span, N } = B.basis(K, u), D = B.ders(K, u, 2).ders;
      for (let i = 0; i <= K.n; i++) {
        const want = i >= span - p && i <= span ? N[i - span + p] : 0, v = B.one(K, i, u), vd = B.oneDers(K, i, u, 2);
        const wd = i >= span - p && i <= span ? D.map((r) => r[i - span + p]) : [0, 0, 0];
        if (!Object.is(v, want) || !same(vd, wd)) ones++;
      }
    }
    ok(ones === 0, 'one and oneDers equal the matching entries of basis and ders, and 0 outside the support (5,000 cases, every index)');
    const UU = [0, 1, 1, 1, 2, 3, 3, 3], KU = B.knots(UU, 2), iN = NB.findSpan(4, 2, 1, UU);
    ok(UU[iN] === UU[iN + 1] && NB.basisFuns(iN, 1, 2, UU).every(Number.isNaN), 'cc-nurbs alone: an unclamped vector repeated at the start of the domain gives an empty span and NaN (the gap S4 closes)');
    ok(same(B.basis(KU, 1), { span: 3, N: [1, 0, 0] }) && same(B.basis(KU, 3).N, [0, 0, 1]) && !KU.clamped, 'engine.solid: the same vector gives the first and last non-empty spans and the right values at both ends');

    // ----- records, inputs, refusals
    const src = [0, 0, 0.5, 1, 1], K1 = B.knots(src, 1);
    src[2] = 9;
    ok(Object.isFrozen(K1) && Object.isFrozen(K1.U) && Object.isFrozen(K1.distinct) && K1.U[2] === 0.5 && B.isKnots(K1) && !B.isKnots({ ...K1 }), 'knots() keeps a frozen copy; only records it made are accepted');
    ok(same(B.knots(new Float64Array([0, 0, 1, 1]), 1).U, [0, 0, 1, 1]) && Object.is(B.knots([-0, -0, 1, 1], 1).U[0], 0), 'a Float64Array is accepted; −0 becomes 0');
    ok(same(B.knots([0, 0, 0, 1, 1, 2, 2, 2], 2).distinct, [{ u: 0, m: 3 }, { u: 1, m: 2 }, { u: 2, m: 3 }]) && B.knots([0, 0, 1, 1], 1).clamped, 'distinct knots with their multiplicities; clamped is detected');
    ok(same(B.clampedUniform(5, 2, 0, 3), NB.clampedUniform(5, 2, 0, 3)) && B.knots(B.clampedUniform(16, 15), 15).p === 15, 'clampedUniform is cc-nurbs\', checked; degree 15 works');
    const bi = (fn, name, why) => refuses(fn, 'solid.err.bad_input', { name, why });
    const Kc = B.knots([0, 0, 0, 1, 2, 2, 2], 2);
    ok(bi(() => B.knots([0, 0, 1, 1], 1.5), 'degree', 'not_a_count') && bi(() => B.knots([0, 0, 1, 1], -1), 'degree', 'not_a_count')
      && refuses(() => B.knots(new Array(40).fill(0), 16), 'solid.err.limit', { what: 'degree', limit: 15, used: 16 })
      && refuses(() => B.knots(new Float64Array(65537), 1), 'solid.err.limit', { what: 'knots', limit: 65536, used: 65537 }), 'refused: a degree that is not a whole number ≥ 0; degree 16 and 65,537 knots are over the limits');
    ok(bi(() => B.knots('0011', 1), 'knots', 'not_an_array') && bi(() => B.knots([0, 0, 1], 1), 'knots', 'too_short') && bi(() => B.knots([0, 0, NaN, 1], 1), 'knots', 'not_a_number')
      && bi(() => B.knots([0, 0, '1', 1], 1), 'knots', 'not_a_number') && bi(() => B.knots([0, 0, 2 ** 501, 2 ** 502], 1), 'knots', 'out_of_range') && bi(() => B.knots([0, 1e-200, 1, 1], 1), 'knots', 'out_of_range')
      && bi(() => B.knots([0, 1, 0.5, 2], 1), 'knots', 'decreasing') && bi(() => B.knots([0, 1, 1, 2], 1), 'knots', 'empty_domain') && bi(() => B.knots([0, 0, 0, 1, 1, 1, 2, 2], 1), 'knots', 'multiplicity'),
    'refused: not an array, too short, not a number, out of range (huge or subnormal-near), decreasing, an empty domain, a knot repeated more than p + 1 times');
    const Kd = B.fromData(structuredClone(B.toData(Kc))), Kj = B.fromData(JSON.parse(JSON.stringify(B.toData(Kc))));
    ok(!B.isKnots(structuredClone(Kc)) && B.isKnots(Kd) && same(Kd, Kc) && same(Kj, Kc) && same(Object.keys(B.toData(Kc)), ['U', 'p']) && bi(() => B.fromData({ U: [0, 1, 0, 1], p: 1 }), 'knots', 'decreasing') && bi(() => B.fromData(5), 'knots', 'not_knots') && bi(() => B.toData({ ...Kc }), 'knots', 'not_knots'),
      'toData / fromData: a knot vector crosses a worker boundary or JSON as { U, p } and is checked again on arrival');
    ok(bi(() => B.span({ ...Kc }, 1), 'knots', 'not_knots') && bi(() => B.span(Kc, NaN), 'u', 'not_a_number') && bi(() => B.basis(Kc, -1e-9), 'u', 'out_of_domain') && bi(() => B.basis(Kc, 2 + 1e-9), 'u', 'out_of_domain')
      && bi(() => B.basis(Kc, 1e-300), 'u', 'out_of_range') && bi(() => B.ders(Kc, 1, 1.5), 'order', 'not_a_count') && bi(() => B.ders(Kc, 1, 33), 'order', 'out_of_range')
      && bi(() => B.one(Kc, 4, 1), 'index', 'out_of_range') && bi(() => B.oneDers(Kc, -1, 1, 1), 'index', 'not_a_count'),
    'refused: a record not made by knots(), u not a number, outside [a, b] or out of range, an order not a whole number or above 32, an index outside 0 … n');
    ok(bi(() => B.clampedUniform(2, 2), 'count', 'too_few') && bi(() => B.clampedUniform(2.5, 1), 'count', 'not_a_count') && bi(() => B.clampedUniform(4, 2, 1, 1), 'b', 'order')
      && bi(() => B.clampedUniform(4, 2, NaN, 1), 'a', 'not_a_number') && bi(() => B.clampedUniform(4, 2, 0, 2 ** 600), 'b', 'out_of_range')
      && refuses(() => B.clampedUniform(65536, 3), 'solid.err.limit', { what: 'knots' }), 'clampedUniform refuses too few points, a bad count, b ≤ a, a non-number, out-of-range ends and too many knots');

    // ----- the same bits everywhere
    const h = P.makePrng(77);
    let hash = 0x811c9dc5;
    const mix = (v) => { for (const w of R.bitsOf(v)) for (let k = 0; k < 4; k++) { hash ^= (w >>> (8 * k)) & 0xff; hash = Math.imul(hash, 0x01000193) >>> 0; } };
    for (let c = 0; c < 4000; c++) {
      const p = degree(h), U = genKnots(h, p), u = genU(h, U, p), K = B.knots(U, p), r = B.ders(K, u, Math.min(p, 3));
      mix(r.span); for (const row of r.ders) for (const v of row) mix(v);
    }
    ok(hash === GOLDEN_BASIS, `the same bits: 4,000 seeded evaluations hash to 0x${hash.toString(16).padStart(8, '0')} (recorded 0x${GOLDEN_BASIS.toString(16).padStart(8, '0')}); a change here means the basis changed its answers`);
  });

  // ============================================================================================== digest
  section('digest', 'the same bits everywhere: the hashes every host must compute (tools/solid/digests.json; browsers: browser-run.mjs)', () => {
    const file = path.join(HERE, 'digests.json'), want = JSON.parse(fs.readFileSync(file, 'utf8')), now = digest(P);
    const names = Object.keys(now.sections), off = names.filter((n) => now.sections[n] !== want.sections[n]);
    ok(want.version === P.VERSION, `digests.json was recorded for this version (${want.version}; cc-solid is ${P.VERSION})`);
    ok(off.length === 0 && Object.keys(want.sections).length === names.length, `Node computes the ${names.length} recorded hashes` + (off.length ? ' (differs: ' + off.join(', ') + '; after a deliberate change: node tools/solid/browser-run.mjs --record, then the browsers again)' : ''));
    ok(now.sections.trig === '0x1cb4c414' && now.sections.basis === '0x' + GOLDEN_BASIS.toString(16), 'its trig and basis areas are the golden hashes of the trig and basis tests');
    const again = digest(P);
    ok(names.every((n) => again.sections[n] === now.sections[n]), 'a second run in the same process gives the same hashes (no state carried over)');
  });
}
