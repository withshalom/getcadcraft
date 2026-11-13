/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * roots.js — cc-solid (S2, docs/solid/HANDOFF.md § 5.6): real roots of quadratics and cubics, and of functions on a bracket.
 * DOM-free; imports the core only.
 *
 *   quadratic(a, b, c) → frozen roots of a x² + b x + c, ascending, each as often as it repeats ([r, r] for a double root)
 *       The coefficients are first scaled by a power of two (exact), the discriminant is formed with error-free products, so
 *       it keeps its sign and size when b² and 4ac nearly cancel (Kahan, "On the cost of floating-point computation without
 *       extra-precise arithmetic", 2004), and the roots come from q = −(b + sign(b)√D)/2 as q/a and c/q, so neither loses
 *       digits to cancellation. a = 0 is the linear case; a = b = c = 0 (every x a root) is refused:
 *       solid.err.bad_input { name: 'coefficients', why: 'all_zero' }.
 *   cubic(a, b, c, d) → frozen real roots of a x³ + b x² + c x + d, ascending, with repeats
 *       Kahan's method ("To solve a real cubic equation", 1986): one real root by a Newton iteration that cannot overshoot,
 *       started outside the roots from the inflection point; then the deflated quadratic, by quadratic() above; then each
 *       root polished by Newton steps on the cubic itself, kept only where they lower the residual.
 *   brent(f, lo, hi, { eps = 0, maxIterations = 500, budget }) → frozen { x, fx, iterations }
 *       Brent's method ("Algorithms for Minimization without Derivatives", 1973, ch. 4): bisection, secant and inverse
 *       quadratic steps, never leaving the bracket. x is within eps + 4·EPS·|x| + 2·EPS²·max(|lo|, |hi|) of a root of f
 *       (or f(x) = 0 exactly). The last term is what lets a root at 0 be found with eps = 0: relative to x alone, no
 *       tolerance could ever be met there. It is far below one ulp of anything near the bracket's ends.
 *   newton(f, df, lo, hi, { x0, eps = 0, maxIterations = 400, budget }) → frozen { x, fx, iterations }
 *       Newton's method kept inside the bracket: a step that would leave it, or that does not halve the error fast enough,
 *       is replaced by bisection, so it converges whenever brent would, and quadratically near a simple root.
 * Both refuse: f(lo) and f(hi) of the same sign → solid.err.no_bracket { fa, fb }; no answer in maxIterations →
 * solid.err.no_convergence { what: 'brent' | 'newton', iterations }; f or df not finite → solid.err.bad_input { name, why }.
 * Each evaluation counts one step of the budget.
 */
import { fail } from '../core/errors.js';
import { EPS, exponent, pow2, prodErr, sumErr } from '../core/float.js';
import { cbrt } from '../core/trig.js';
import { resolveBudget } from '../core/limits.js';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const sorted = (r) => Object.freeze(r.sort((p, q) => p - q));

/** The coefficients times the power of two that brings the largest |coefficient| into [1, 2): exact, roots unchanged. */
function scaled(cs) {
  let m = 0;
  for (const c of cs) { if (!isNum(c)) fail('solid.err.bad_input', { name: 'coefficients', why: 'not_finite' }); m = Math.max(m, Math.abs(c)); }
  if (m === 0) return cs;
  const k = -exponent(m), h = k >> 1;                  // in two steps, so 2^k itself never overflows or underflows
  return cs.map((c) => c * pow2(h) * pow2(k - h));
}

function quad(a, b, c) {                               // a ≠ 0, coefficients already scaled
  const bb = b * b, ac4 = 4 * a * c;
  const D = (bb - ac4) + (prodErr(b, b, bb) - prodErr(4 * a, c, ac4));   // b² − 4ac, nearly exact
  if (D < 0) return [];
  if (D === 0) { const r = -b / (2 * a); return [r, r]; }
  const s = Math.sqrt(D);
  const q = -0.5 * (b >= 0 ? b + s : b - s);
  return [q / a, c / q];
}

export function quadratic(a, b, c) {
  [a, b, c] = scaled([a, b, c]);
  if (a === 0) {
    if (b === 0) { if (c === 0) fail('solid.err.bad_input', { name: 'coefficients', why: 'all_zero' }); return Object.freeze([]); }
    return Object.freeze([-c / b]);
  }
  return sorted(quad(a, b, c));
}

function evaluate(a, b, c, d, x) {                     // → [Q(x), Q′(x), b1, c2] with Q(x) = (a x² + b1 x + c2)(x − root) + Q(x)
  const q0 = a * x, b1 = q0 + b, c2 = b1 * x + c;
  return [c2 * x + d, (q0 + b1) * x + c2, b1, c2];
}

export function cubic(a, b, c, d) {
  [a, b, c, d] = scaled([a, b, c, d]);
  if (a === 0) return quadratic(b, c, d);
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
  return sorted([x, ...quad(a, b1, c2)].map((r) => polish(a, b, c, d, r)));
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

export function brent(f, lo, hi, { eps = 0, maxIterations = BRENT_ITERATIONS, budget } = {}) {
  needFn(f, 'f'); checkOpts(lo, hi, eps, maxIterations);
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
