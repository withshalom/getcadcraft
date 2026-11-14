/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * errors.js — cc-solid (S1, docs/solid/HANDOFF.md § 4.6): typed refusals. DOM-free, import-free.
 *
 * cc-solid never hands back a quietly wrong result. It returns what was asked for, or it throws a SolidError whose
 * `code` says why. The code is a key of the app's language table (`solid.err.*`), and `vars` holds the values that
 * key's message shows in its {placeholders}. No English text lives in the kernel: the app words the code, exactly as it
 * words cc-nurbs' NurbsError (code, vars), whose errors pass through cc-solid unchanged.
 *
 *   SolidError(code, vars)      `code` one of CODES (anything else is cc-solid's own bug and becomes
 *                                  solid.err.internal { reason: 'unknown_code', code }); `vars` a frozen copy that
 *                                  keeps only JSON-safe values (cleanVars). The message is the code itself.
 *   fail(code, vars) → never       throws SolidError(code, vars)
 *   isSolidError(e)             also true for one made by another copy of this module (a worker's, a blob URL's)
 *   CODES                          every code cc-solid throws, frozen and sorted. Each needs a key in the app's language
 *                                  table before the app shows it.
 *   KAD2_CODES                     code → the upper-case code KAD2's EngineError uses (HANDOFF § 4.6), for the KAD2
 *                                  adapter; every code in CODES has one.
 *   toEnvelope(e) → { code, vars } plain, frozen JSON for a worker reply or an adapter:
 *                                  a SolidError → its code and vars; a cc-nurbs or cc-step error (code 'nurbs.err.*' or
 *                                  'step.err.*') → its code and cleaned vars; anything else, which can only be a bug,
 *                                  → { code: 'solid.err.internal', vars: {} }, so no message, stack or internals leave
 *                                  the kernel.
 *   fromEnvelope(env) → Error       the way back, on the other side of a worker boundary: a SolidError for a solid.err.*
 *                                  code; a plain Error carrying { code, vars } for a cc-nurbs or cc-step code; anything
 *                                  else → SolidError solid.err.internal
 *   cleanVars(x) → frozen object   x's own enumerable keys (at most 32, names like identifiers, up to 64 characters) whose
 *                                  values are finite numbers, booleans, null, strings (cut to 200 characters) or arrays of
 *                                  at most 16 such values; everything else is left out, and a getter that throws is
 *                                  skipped.
 *
 * Codes (the vars each one carries):
 *   solid.err.bad_input       an argument is missing, of the wrong type, out of range or unknown — { name, why }; also an
 *                             answer that does not fit in doubles — { name, why: 'overflow' }
 *   solid.err.bad_tolerance   a tolerance value cannot be used — { name, why, value?, min?, max? }
 *   solid.err.internal        cc-solid's own bug — { reason? } (the details stay out of the envelope)
 *   solid.err.limit           a budget ran out — { what: 'iterations' | 'entities' | 'time', limit, used }; (S4) or
 *                             a representation limit was passed — { what: 'degree' | 'knots', limit, used }; or a
 *                             matrix is too large to factor — { what: 'size' | 'work', limit, used }
 *   solid.err.no_bracket      (S2) a root finder was given ends where f has the same sign — { fa, fb } (finite values only)
 *   solid.err.no_convergence  (S2) an iteration stopped before it met its tolerance — { what, iterations }
 *   solid.err.not_within_tolerance  (S5) an approximating operation cannot stay within the tolerance it was given —
 *                             { what (the operation, e.g. 'reduce'), tol, error? (the deviation it would have left) }
 *   solid.err.singular        (S2) a matrix cannot be solved — { why: 'pivot' | 'rank' | 'matrix', size?, column?, rcond? }
 * Later sessions add codes here, each with its KAD2 code, a test that throws it, and its language-table key.
 */

export const CODES = Object.freeze([
  'solid.err.bad_input',
  'solid.err.bad_tolerance',
  'solid.err.internal',
  'solid.err.limit',
  'solid.err.no_bracket',
  'solid.err.no_convergence',
  'solid.err.not_within_tolerance',
  'solid.err.singular',
].sort());

export const KAD2_CODES = Object.freeze({
  'solid.err.bad_input': 'BAD_INPUT',
  'solid.err.bad_tolerance': 'REFUSED_TOLERANCE',
  'solid.err.internal': 'INTERNAL',
  'solid.err.limit': 'LIMIT',
  'solid.err.no_bracket': 'REFUSED_NO_BRACKET',
  'solid.err.no_convergence': 'REFUSED_NO_CONVERGENCE',
  'solid.err.not_within_tolerance': 'REFUSED_TOLERANCE',
  'solid.err.singular': 'REFUSED_SINGULAR',
});

const KNOWN = new Set(CODES);
const UPSTREAM = /^(?:nurbs|step)\.err\.[a-z0-9_]+$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const MAX_VARS = 32, MAX_STRING = 200, MAX_ARRAY = 16;

function cleanValue(v) {
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') return v.length > MAX_STRING ? v.slice(0, MAX_STRING) : v;
  return undefined;
}

export function cleanVars(x) {
  const out = {};
  if (!x || typeof x !== 'object' || Array.isArray(x)) return Object.freeze(out);
  let keys;
  try { keys = Object.keys(x); } catch { return Object.freeze(out); }
  let kept = 0;
  for (const k of keys) {
    if (kept >= MAX_VARS) break;
    if (!NAME.test(k)) continue;
    let v;
    try { v = x[k]; } catch { continue; }
    if (Array.isArray(v)) {
      if (v.length > MAX_ARRAY) continue;
      const a = v.map(cleanValue);
      if (a.some((e) => e === undefined)) continue;
      out[k] = Object.freeze(a);
      kept++;
      continue;
    }
    const c = cleanValue(v);
    if (c === undefined) continue;
    out[k] = c;
    kept++;
  }
  return Object.freeze(out);
}

export class SolidError extends Error {
  constructor(code, vars) {
    const known = KNOWN.has(code);
    const c = known ? code : 'solid.err.internal';
    super(c);
    this.name = 'SolidError';
    this.code = c;
    this.vars = known ? cleanVars(vars) : cleanVars({ reason: 'unknown_code', code: String(code) });
  }
}

export const fail = (code, vars) => { throw new SolidError(code, vars); };

export function isSolidError(e) {
  if (e instanceof SolidError) return true;
  return !!e && typeof e === 'object' && e.name === 'SolidError' && typeof e.code === 'string' && KNOWN.has(e.code);
}

export function toEnvelope(e) {
  if (isSolidError(e)) return Object.freeze({ code: e.code, vars: e instanceof SolidError ? e.vars : cleanVars(e.vars) });
  if (!!e && typeof e === 'object' && typeof e.code === 'string' && UPSTREAM.test(e.code)) return Object.freeze({ code: e.code, vars: cleanVars(e.vars) });
  return Object.freeze({ code: 'solid.err.internal', vars: Object.freeze({}) });
}

export function fromEnvelope(env) {
  const code = env && typeof env === 'object' ? env.code : undefined;
  if (typeof code === 'string' && KNOWN.has(code)) return new SolidError(code, env.vars);
  if (typeof code === 'string' && UPSTREAM.test(code)) { const e = new Error(code); e.code = code; e.vars = cleanVars(env.vars); return e; }
  return new SolidError('solid.err.internal', {});
}
