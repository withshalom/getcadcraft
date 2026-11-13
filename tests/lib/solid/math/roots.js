/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * roots.js — cc-solid (S2, docs/solid/HANDOFF.md § 5.6): real roots of quadratics and cubics, and of functions on a bracket.
 * DOM-free; imports the core only.
 *
 *   quadratic(a, b, c) → frozen real roots of a x² + b x + c, ascending, for any finite coefficients
 *       None or two (a double root is [r, r]); one for the linear case a = 0; a = b = c = 0 (every x a root) is refused:
 *       solid.err.bad_input { name: 'coefficients', why: 'all_zero' }. The count is exact: where b² − 4ac is too close to 0
 *       for doubles to tell, its sign is taken in whole-number arithmetic (core/exact.js), so a double root is never lost
 *       or split by rounding. The discriminant is formed with error-free products (Kahan, "On the cost of floating-point
 *       computation without extra-precise arithmetic", 2004) and the roots come from q = −(b + sign(b)√D)/2 as q/a and c/q,
 *       so neither loses digits to cancellation: each is within 4 doubles of an exact sign change. Coefficients of any
 *       size are first balanced by powers of two (exact). A root past the largest double comes back as ±Infinity (it
 *       exists, and its place in the order is right) and one below the smallest as ±0.
 *   cubic(a, b, c, d) → frozen real roots of a x³ + b x² + c x + d, ascending: one, or three with repeats
 *       The count is exact too: the sign of the discriminant 18abcd − 4b³d + b²c² − 4ac³ − 27a²d² is certain (in doubles
 *       with an error bound, else whole-number). Negative: one real root. Zero: a triple root, or a double and a single
 *       one, each an exact quotient of the coefficients rounded once, so (x − 1)²(x − 2) gives [1, 1, 2] and nothing else.
 *       Otherwise the roots come first from Kahan's method ("To solve a real cubic equation", 1986): one root by a Newton
 *       iteration that cannot overshoot, started outside the roots from the inflection point; then the deflated
 *       quadratic; then Newton steps on the cubic itself. They are returned only if certified: the cubic, evaluated as if
 *       in twice the precision (compensated Horner), must change sign within 4 doubles of each, in the right order. If not
 *       (two roots close together defeat deflation), each root is found by bisection in its own bracket, between the
 *       turning points of the cubic. Either way every root returned has a sign change of the cubic within 4 doubles.
 *       Domain: a change of variable x = 2^t y (exact) is chosen to bring the non-zero coefficients as close together as
 *       it can; if they then still span more than 2^250 (roots some 1e75 apart, or a leading coefficient that far below
 *       the rest), the iteration could overflow, and the cubic is refused rather than answered wrongly:
 *       solid.err.bad_input { name: 'coefficients', why: 'out_of_range' }. a = 0 is the quadratic.
 *   brent(f, lo, hi, { eps = 0, maxIterations = 500, budget }) → frozen { x, fx, iterations }
 *       Brent's method ("Algorithms for Minimization without Derivatives", 1973, ch. 4): bisection, secant and inverse
 *       quadratic steps, never leaving the bracket. x is within eps + 4·EPS·|x| + 2·EPS²·max(|lo|, |hi|) of a root of f
 *       (or f(x) = 0 exactly). The last term is what lets a root at 0 be found with eps = 0: relative to x alone, no
 *       tolerance could ever be met there. It is far below one ulp of anything near the bracket's ends. A bracket of any
 *       width is allowed, the whole range of doubles included.
 *   newton(f, df, lo, hi, { x0, eps = 0, maxIterations = 400, budget }) → frozen { x, fx, iterations }
 *       Newton's method kept inside the bracket: a step that would leave it, or that does not halve the error fast enough,
 *       is replaced by bisection, so it converges whenever brent would, and quadratically near a simple root.
 * Both refuse: f(lo) and f(hi) of the same sign → solid.err.no_bracket { fa, fb }; no answer in maxIterations →
 * solid.err.no_convergence { what: 'brent' | 'newton', iterations }; f or df not finite → solid.err.bad_input { name, why }.
 * Each evaluation counts one step of the budget.
 */
import { fail } from '../core/errors.js';
import { EPS, exponent, nextDown, nextUp, pow2, prodErr, scalb, sumErr } from '../core/float.js';
import { sumRatio, sumSign } from '../core/exact.js';
import { cbrt } from '../core/trig.js';
import { resolveBudget } from '../core/limits.js';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const sorted = (r) => Object.freeze(r.sort((p, q) => p - q));
function finite(cs) { for (const c of cs) if (!isNum(c)) fail('solid.err.bad_input', { name: 'coefficients', why: 'not_finite' }); }
const mantissa = (x) => scalb(x, -exponent(x));        // x ≠ 0 → ±[1, 2), exactly

const NEAR = 16 * EPS;     // a difference this small beside its terms is not trusted: its sign is then taken exactly
const FAR = 120;           // b² this many binades above 4ac: 4ac is below its last bit, and b itself might overflow when squared
const SPREAD = 250;        // a cubic's coefficients within 2^250 of each other: nothing in the iteration can overflow

// ---------------------------------------------------------------------------------------------- quadratic

/** √(c / a) for positive doubles, with no overflow or underflow on the way. */
function sqrtRatio(c, a) {
  let k = exponent(c) - exponent(a), m = mantissa(c) / mantissa(a);   // c / a = m · 2^k, m in (½, 2)
  if (k & 1) { m *= 2; k -= 1; }
  return scalb(Math.sqrt(m), k / 2);
}

/** a x² + b x + c with a, b, c within some 2^62 of each other (c in [1, 2)): [] or two roots, equal for a double root. */
function quadCore(a, b, c) {
  const bb = b * b, ac4 = 4 * a * c;
  let D = (bb - ac4) + (prodErr(b, b, bb) - prodErr(4 * a, c, ac4));   // b² − 4ac, nearly exact (Kahan)
  if (Math.abs(D) <= NEAR * (bb + Math.abs(ac4))) {                    // too close to rest on rounding: ask exactly. (With
    const s = sumSign([[1, b, b], [-4, a, c]]);                        // a, b, c balanced as here, no input is known where
    if (s < 0) return [];                                              // D's own sign differs; this is the second defence.)
    if (!(D > 0)) D = 0;                                               // (an exact double root has D = 0 already)
  } else if (D < 0) return [];
  const s = Math.sqrt(D);                                              // with D = 0, q/a and c/q are the same quotient −b/(2a)
  const q = -0.5 * (b >= 0 ? b + s : b - s);
  return [q / a, c / q];
}

/**
 * The real roots of a x² + b x + c for any finite doubles with a ≠ 0: [] or two (equal for a double root), in no order.
 * The size of b² against 4ac is read off the exponents. Where b² is more than 2^120 times 4ac, the latter cannot reach
 * its last bit, and the roots are the single quotients −b/a and −c/b. Otherwise x = 2^t y, with t
 * chosen to bring a and c to the same exponent, and a common factor (all powers of two: exact) put all three within some
 * 2^62 of 1, where quadCore's products can neither overflow nor underflow. A root past the largest double comes out
 * ±Infinity and one below the smallest ±0, by ordinary rounding.
 */
function quadAny(a, b, c) {
  if (c === 0) return b === 0 ? [0, 0] : [0, -b / a];
  const opposite = (a < 0) !== (c < 0);
  const twoByRoot = () => { if (!opposite) return []; const r = sqrtRatio(Math.abs(c), Math.abs(a)); return [-r, r]; };
  if (b === 0) return twoByRoot();
  const ea = exponent(a), ec = exponent(c), gap = 2 * exponent(b) - ea - ec;
  if (gap > FAR) return [-b / a, -c / b];               // (b far below √(ac) needs no case: its square just vanishes)
  const t = Math.floor((ec - ea) / 2);
  return quadCore(scalb(a, 2 * t - ec), scalb(b, t - ec), scalb(c, -ec)).map((y) => scalb(y, t));
}

export function quadratic(a, b, c) {
  finite([a, b, c]);
  if (a === 0) {
    if (b === 0) { if (c === 0) fail('solid.err.bad_input', { name: 'coefficients', why: 'all_zero' }); return Object.freeze([]); }
    return Object.freeze([-c / b]);
  }
  return sorted(quadAny(a, b, c));
}

// ---------------------------------------------------------------------------------------------- cubic

function evaluate(a, b, c, d, x) {                     // → [Q(x), Q′(x), b1, c2] with Q(x) = (a x² + b1 x + c2)(x − root) + Q(x)
  const q0 = a * x, b1 = q0 + b, c2 = b1 * x + c;
  return [c2 * x + d, (q0 + b1) * x + c2, b1, c2];
}

/** The sign of the discriminant 18abcd − 4b³d + b²c² − 4ac³ − 27a²d², exactly: in doubles when that is safe, else whole. */
function discSign(a, b, c, d) {
  const t1 = 18 * a * b * c * d, t2 = 4 * b * b * b * d, t3 = b * b * c * c, t4 = 4 * a * c * c * c, t5 = 27 * a * a * d * d;
  const D = t1 - t2 + t3 - t4 - t5, size = Math.abs(t1) + Math.abs(t2) + Math.abs(t3) + Math.abs(t4) + Math.abs(t5);
  if (Math.abs(D) > NEAR * size) return D > 0 ? 1 : -1;
  return sumSign([[18, a, b, c, d], [-4, b, b, b, d], [1, b, b, c, c], [-4, a, c, c, c], [-27, a, a, d, d]]);
}

/** The roots when the discriminant is exactly 0, each an exact quotient rounded once: a triple root, or a double and a single. */
function repeated(a, b, c, d) {
  if (sumSign([[1, b, b], [-3, a, c]]) === 0) { const r = sumRatio([[-1, b]], [[3, a]]); return [r, r, r]; }
  const two = sumRatio([[9, a, d], [-1, b, c]], [[2, b, b], [-6, a, c]]);
  return [two, two, sumRatio([[4, a, b, c], [-9, a, a, d], [-1, b, b, b]], [[1, a, b, b], [-3, a, a, c]])];
}

const WINDOW = 4;          // a root is certified when Q changes sign within this many doubles of it
const signAt = (a, b, c, d, x) => { const v = cubicAt(a, b, c, d, x); return v > 0 ? 1 : v < 0 ? -1 : 0; };

/**
 * Are these the roots? Q is evaluated as if in twice the precision (cubicAt) a few doubles to each side of every root:
 * left of the first it must have the sign Q has at −∞, and the sign must flip across each root in turn. Anything else (a
 * root off by more than the window, one root reported twice, a pair too close to separate) says no, and the caller
 * brackets instead.
 */
function certified(a, b, c, d, roots) {
  let want = a > 0 ? -1 : 1;
  for (const r of roots) {
    let lo = r, hi = r;
    for (let k = 0; k < WINDOW; k++) { lo = nextDown(lo); hi = nextUp(hi); }
    const sl = signAt(a, b, c, d, lo), sh = signAt(a, b, c, d, hi);
    if ((sl !== want && sl !== 0) || (sh !== -want && sh !== 0)) return false;
    want = -want;
  }
  return true;
}

/** A double strictly between lo < hi that halves their distance in exponent first, then in value: ≤ ~70 steps end to end. */
function between(lo, hi) {
  if (lo < 0 && hi > 0) return 0;
  const neg = hi <= 0, p = neg ? -hi : lo, q = neg ? -lo : hi;       // 0 ≤ p < q
  let m;
  if (p === 0) m = scalb(q, -Math.max(1, (exponent(q) + 1075) >> 1));
  else if (q > 4 * p) m = pow2((exponent(p) + exponent(q) + 1) >> 1);
  else m = p + 0.5 * (q - p);
  return neg ? -m : m;
}
/** The sign change of Q between lo and hi, where Q has the sign `slo` at lo and the other at hi: to neighbouring doubles. */
function bisect(a, b, c, d, lo, hi, slo) {
  for (let i = 0; i < 200; i++) {
    const m = between(lo, hi);
    if (!(m > lo && m < hi)) break;                      // neighbours: nothing lies between
    const sm = signAt(a, b, c, d, m);
    if (sm === 0) return m;
    if (sm === slo) lo = m; else hi = m;
  }
  return Math.abs(cubicAt(a, b, c, d, lo)) <= Math.abs(cubicAt(a, b, c, d, hi)) ? lo : hi;
}

/**
 * The roots by bracketing, when the fast path could not be certified. All real roots lie within B = 1 + max|b, c, d| / |a|
 * of 0 (Cauchy). One real root: the one sign change in [−B, B]. Three: Q′ has two zeros t1 < t2 (the turning points), and
 * the roots lie one below t1, one between, one above t2, so each has its own bracket. Where Q at a turning point does not
 * show the sign it must have, two roots are closer to it than doubles can separate, and both are reported there.
 */
function bracketed(a, b, c, d, three) {
  const sa = a > 0 ? 1 : -1, B = 1 + Math.max(Math.abs(b), Math.abs(c), Math.abs(d)) / Math.abs(a);
  if (!three) return [bisect(a, b, c, d, -B, B, -sa)];
  const turning = quadAny(3 * a, 2 * b, c).sort((p, q) => p - q), mid = -b / (3 * a);
  const t1 = turning.length ? turning[0] : mid, t2 = turning.length ? turning[1] : mid;
  const up = signAt(a, b, c, d, t1) === sa, down = signAt(a, b, c, d, t2) === -sa;   // Q rises to t1, falls to t2 (for a > 0)
  const r1 = up ? bisect(a, b, c, d, -B, t1, -sa) : t1;
  const r3 = down ? bisect(a, b, c, d, t2, B, -sa) : t2;
  const r2 = up && down ? bisect(a, b, c, d, t1, t2, sa) : up ? t2 : down ? t1 : Math.min(t2, Math.max(t1, mid));
  return [r1, r2, r3];
}

/**
 * a x³ + b x² + c x + d with a ≠ 0, the largest |coefficient| in [1, 2) and no other below 2^-250 unless it is 0.
 * The discriminant's exact sign fixes the count. Kahan's iteration and the deflated quadratic then give the roots quickly;
 * they are kept only if certified(), else found again by bracketing, which cannot miss.
 */
function cubicCore(a, b, c, d) {
  const sign = discSign(a, b, c, d);
  if (sign === 0) return repeated(a, b, c, d);
  let x, b1, c2;
  if (d === 0) { x = 0; b1 = b; c2 = c; }
  else {
    x = -(b / a) / 3;
    let q, dq;
    [q, dq, b1, c2] = evaluate(a, b, c, d, x);
    let t = q / a;
    let r = cbrt(Math.abs(t));
    const s = t < 0 ? -1 : 1;
    t = -dq / a;
    if (t > 0) r = 1.324718 * Math.max(r, Math.sqrt(t));   // the plastic number: a start beyond every root
    let x0 = x - s * r;
    if (x0 !== x) {
      let n = 0;
      do {
        x = x0;
        [q, dq, b1, c2] = evaluate(a, b, c, d, x);
        x0 = dq === 0 ? x : x - (q / dq) / (1 + 5 * EPS);   // a hair short of a full step, so it never overshoots
        if (++n > 1000) fail('solid.err.no_convergence', { what: 'cubic', iterations: n });
      } while (s * x0 > s * x);
      if (Math.abs(a) * x * x > Math.abs(d / x)) { c2 = -d / x; b1 = (c2 - c) / x; }   // the better-conditioned deflation
    }
  }
  const fast = sign < 0 ? [x] : [x, ...quadAny(a, b1, c2)];                   // (the quadratic may miss a close pair)
  const roots = fast.map((r) => polish(a, b, c, d, r)).sort((p, q) => p - q);
  return roots.length === (sign < 0 ? 1 : 3) && certified(a, b, c, d, roots) ? roots : bracketed(a, b, c, d, sign > 0);
}

export function cubic(a, b, c, d) {
  finite([a, b, c, d]);
  if (a === 0) return quadratic(b, c, d);
  // x = 2^t y turns the coefficients' exponents e_i into e_i + (3 − i) t. The spread between the largest and the smallest
  // is smallest at a t where two of them meet, so those are the only candidates.
  const cs = [a, b, c, d], es = cs.map((v) => (v === 0 ? null : exponent(v)));
  const spread = (t) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 4; i++) if (es[i] !== null) { const e = es[i] + (3 - i) * t; if (e < lo) lo = e; if (e > hi) hi = e; }
    return [hi - lo, hi];
  };
  let t = 0, least = Infinity;
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    if (es[i] === null || es[j] === null) continue;
    const meet = (es[j] - es[i]) / (j - i);
    for (const k of [Math.floor(meet), Math.ceil(meet)]) { const w = spread(k)[0]; if (w < least || (w === least && k < t)) { least = w; t = k; } }
  }
  if (least === Infinity) return Object.freeze([0, 0, 0]);                    // a x³ alone
  if (least > SPREAD) fail('solid.err.bad_input', { name: 'coefficients', why: 'out_of_range' });
  const top = spread(t)[1];
  const y = cs.map((v, i) => (v === 0 ? 0 : mantissa(v) * pow2(es[i] + (3 - i) * t - top)));   // exact: all within 2^-250 … 2
  return sorted(cubicCore(y[0], y[1], y[2], y[3]).map((r) => scalb(r, t)));
}

/** Q(x) by the compensated Horner scheme (Graillat, Langlois and Louvet, 2005): as if evaluated in twice the precision. */
function cubicAt(a, b, c, d, x) {
  let s = a, e = 0;
  for (const k of [b, c, d]) {
    const p = s * x, t = p + k;
    e = e * x + (prodErr(s, x, p) + sumErr(p, k, t));
    s = t;
  }
  return s + e;
}
/** Up to two Newton steps on the cubic itself, each kept only when it lowers |Q(r)|: deflation leaves an ulp or two. */
function polish(a, b, c, d, r) {
  let x = r;
  for (let i = 0; i < 2; i++) {
    const p = cubicAt(a, b, c, d, x), dp = (3 * a * x + 2 * b) * x + c;
    if (p === 0 || dp === 0) break;
    const y = x - p / dp;
    if (!(Math.abs(cubicAt(a, b, c, d, y)) < Math.abs(p))) break;
    x = y;
  }
  return x;
}

const BRENT_ITERATIONS = 500, NEWTON_ITERATIONS = 400;   // enough for a quintuple root at 0 (linear convergence) with eps = 0
function needFn(f, name) { if (typeof f !== 'function') fail('solid.err.bad_input', { name, why: 'not_a_function' }); }
function value(f, x, name = 'f') {
  const v = f(x);
  if (!isNum(v)) fail('solid.err.bad_input', { name, why: 'not_finite' });
  return v;
}
function checkOpts(lo, hi, eps, maxIterations) {
  if (!isNum(lo) || !isNum(hi)) fail('solid.err.bad_input', { name: 'bracket', why: 'not_a_number' });
  if (!isNum(eps) || eps < 0) fail('solid.err.bad_input', { name: 'eps', why: 'not_a_tolerance' });
  if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 100000) fail('solid.err.bad_input', { name: 'maxIterations', why: 'out_of_range' });
}
// A tolerance relative to x alone can never be met at a root at 0. So no answer is asked to be finer than EPS² of the
// bracket's size: far below any double near the bracket's ends, and enough to end the search at 0.
const finest = (lo, hi) => EPS * EPS * Math.max(Math.abs(lo), Math.abs(hi));
const done = (x, fx, iterations) => Object.freeze({ x, fx, iterations });
const noBracket = (fa, fb) => fail('solid.err.no_bracket', { fa, fb });

// A bracket that reaches past 2^1021 is solved in t = x / 4, so that no difference or midpoint inside can overflow. The
// ends map back to themselves exactly, even where dividing a subnormal end by 4 rounds.
const WIDE = pow2(1021);
const isWide = (lo, hi) => isNum(lo) && isNum(hi) && (Math.abs(lo) > WIDE || Math.abs(hi) > WIDE);
const quarter = (lo, hi) => { const tl = lo / 4, th = hi / 4; return [tl, th, (t) => (t === tl ? lo : t === th ? hi : 4 * t)]; };

export function brent(f, lo, hi, { eps = 0, maxIterations = BRENT_ITERATIONS, budget } = {}) {
  needFn(f, 'f'); checkOpts(lo, hi, eps, maxIterations);
  if (isWide(lo, hi)) {
    const [tl, th, back] = quarter(lo, hi), r = brent((t) => f(back(t)), tl, th, { eps: eps / 4, maxIterations, budget });
    return done(back(r.x), r.fx, r.iterations);
  }
  const bud = resolveBudget(budget);
  let a = lo, b = hi, fa = value(f, a), fb = value(f, b);
  bud.step(2);
  if (fa === 0) return done(a, 0, 0);
  if (fb === 0) return done(b, 0, 0);
  if ((fa > 0) === (fb > 0)) noBracket(fa, fb);
  let c = a, fc = fa, d = b - a, e = d;
  const floor = finest(lo, hi);
  for (let it = 1; it <= maxIterations; it++) {
    if ((fb > 0) === (fc > 0)) { c = a; fc = fa; d = b - a; e = d; }      // keep the root between b and c
    if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }   // b is the best so far
    const tol = 2 * EPS * Math.abs(b) + 0.5 * eps + floor;
    const m = 0.5 * (c - b);
    if (Math.abs(m) <= tol || fb === 0) return done(b, fb, it);
    if (Math.abs(e) < tol || Math.abs(fa) <= Math.abs(fb)) { d = m; e = m; }   // bisection
    else {
      const s = fb / fa;
      let p, q;
      if (a === c) { p = 2 * m * s; q = 1 - s; }                                // secant
      else {                                                                     // inverse quadratic interpolation
        const qa = fa / fc, r = fb / fc;
        p = s * (2 * m * qa * (qa - r) - (b - a) * (r - 1));
        q = (qa - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q; else p = -p;
      if (2 * p < Math.min(3 * m * q - Math.abs(tol * q), Math.abs(e * q))) { e = d; d = p / q; }
      else { d = m; e = m; }                                                     // the step was not good enough
    }
    a = b; fa = fb;
    b += Math.abs(d) > tol ? d : m > 0 ? tol : -tol;
    fb = value(f, b);
    bud.step();
  }
  return fail('solid.err.no_convergence', { what: 'brent', iterations: maxIterations });
}

export function newton(f, df, lo, hi, { x0, eps = 0, maxIterations = NEWTON_ITERATIONS, budget } = {}) {
  needFn(f, 'f'); needFn(df, 'df'); checkOpts(lo, hi, eps, maxIterations);
  if (isWide(lo, hi)) {
    const [tl, th, back] = quarter(lo, hi);
    const r = newton((t) => f(back(t)), (t) => 4 * df(back(t)), tl, th, { x0: x0 === undefined ? undefined : x0 === lo ? tl : x0 === hi ? th : x0 / 4, eps: eps / 4, maxIterations, budget });
    return done(back(r.x), r.fx, r.iterations);
  }
  const bud = resolveBudget(budget);
  const fl = value(f, lo), fh = value(f, hi);
  bud.step(2);
  if (fl === 0) return done(lo, 0, 0);
  if (fh === 0) return done(hi, 0, 0);
  if ((fl > 0) === (fh > 0)) noBracket(fl, fh);
  let xl = fl < 0 ? lo : hi, xh = fl < 0 ? hi : lo;                              // f(xl) < 0 < f(xh)
  let x = x0 === undefined ? 0.5 * lo + 0.5 * hi : x0;
  if (!isNum(x) || x < Math.min(lo, hi) || x > Math.max(lo, hi)) fail('solid.err.bad_input', { name: 'x0', why: 'outside_bracket' });
  let fx = value(f, x), dfx = value(df, x, 'df');
  bud.step();
  if (fx === 0) return done(x, 0, 0);
  let step = Math.abs(hi - lo), last = step;
  const floor = finest(lo, hi);
  for (let it = 1; it <= maxIterations; it++) {
    const leaves = ((x - xh) * dfx - fx) * ((x - xl) * dfx - fx) > 0;          // the Newton step lands outside [xl, xh]
    const slow = Math.abs(2 * fx) > Math.abs(last * dfx);                         // or would not halve the last step
    last = step;
    if (leaves || slow) { step = 0.5 * (xh - xl); x = xl + step; }
    else { step = fx / dfx; x -= step; }
    if (Math.abs(step) <= 0.5 * eps + 2 * EPS * Math.abs(x) + floor) return done(x, value(f, x), it);
    fx = value(f, x); dfx = value(df, x, 'df');
    bud.step();
    if (fx === 0) return done(x, 0, it);
    if (fx < 0) xl = x; else xh = x;
  }
  return fail('solid.err.no_convergence', { what: 'newton', iterations: maxIterations });
}
