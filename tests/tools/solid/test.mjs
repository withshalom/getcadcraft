#!/usr/bin/env node
/* SPDX-License-Identifier: Apache-2.0 */
/**
 * test.mjs — cc-solid (lib/solid/, the engine engine.solid): its tests. Plain Node, no packages, no network.
 *
 *   node tools/solid/test.mjs [--verbose] [--only <section>]      from tests/ (bin/test-solid.mjs runs it too)
 *   SOLID_LIB=<folder holding solid/> overrides where the engine is (default: lib/ in this checkout).
 *
 * Sections, in order (S1: errors, tol, limits, entry, boundaries, worker; S2: test-core.mjs and test-math.mjs):
 *   errors      typed refusals: codes, vars, the envelope, cc-nurbs' errors passing through
 *   tol         the tolerance policy: defaults (HANDOFF § 5.2), overrides, every refusal, ranges, relations
 *   limits      budgets: exact counts, the clock, child budgets that cannot outgrow their parent, every refusal
 *   entry       index.js: the export list, namespaces, no globals added, every file reachable from the entry
 *   boundaries  check-boundaries.mjs: the app is clean, a clean fixture stays clean, and every rule fires on the bad
 *               fixture exactly where its "expect:" comments say (and nowhere else)
 *   worker      cc-solid imported and run inside a worker thread
 *   prng · float · trig · intervals                       (test-core.mjs) the S2 core, exact checks in BigInt (bigref.mjs)
 *   vec3 · mat4 · frame · aabb · quad · roots · linalg    (test-math.mjs) the S2 math layer
 *   predicates                                           (test-math.mjs) S3: exact signs against BigInt
 *   sync · basis                                         (test-geom.mjs) the engine and cc-nurbs are canonical in lib/ and
 *                                                        copied byte for byte to each host (sync.mjs); S4: basis
 *                                                        functions against exact Cox–de Boor in BigInt rationals
 * Exit 1 when anything fails.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const APP = [process.env.SOLID_LIB, path.join(HERE, '../../lib')]
  .find((d) => d && fs.existsSync(path.join(d, 'solid/index.js')));
if (!APP) { console.log('FAIL solid/index.js not found (set SOLID_LIB to the folder that holds solid/)'); process.exit(1); }
const appUrl = (rel) => pathToFileURL(path.join(APP, rel)).href;

let pass = 0, failed = 0;
const ok = (c, m) => { if (c) { pass++; if (VERBOSE) console.log('  ok   ' + m); } else { failed++; console.log('  FAIL ' + m); } };
const sections = [];
const section = (name, title, fn) => sections.push({ name, title, fn });
/** Runs fn; true when it throws an error with this code and (when given) these vars. */
function refuses(fn, code, vars) {
  try { fn(); } catch (e) {
    if (!e || e.code !== code) { if (VERBOSE) console.log('       threw ' + (e && e.code) + ' ' + JSON.stringify(e && e.vars)); return false; }
    if (vars) for (const [k, v] of Object.entries(vars)) if (!Object.is(e.vars[k], v)) { if (VERBOSE) console.log('       vars ' + JSON.stringify(e.vars)); return false; }
    return true;
  }
  return false;
}
const deepFrozen = (x) => x === null || typeof x !== 'object' || (Object.isFrozen(x) && Object.values(x).every(deepFrozen));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const globalsBefore = new Set(Object.getOwnPropertyNames(globalThis));
const P = await import(appUrl('solid/index.js'));
const globalsAdded = Object.getOwnPropertyNames(globalThis).filter((k) => !globalsBefore.has(k));
const E = await import(appUrl('solid/core/errors.js'));
const T = await import(appUrl('solid/core/tol.js'));
const L = await import(appUrl('solid/core/limits.js'));
// cc-nurbs sits beside the engine in the site's lib/ and in every app; in a checkout without it, a NurbsError-shaped stand-in
// checks the pass-through
const NC = fs.existsSync(path.join(APP, 'nurbs/curve.js')) ? await import(appUrl('nurbs/curve.js')) : null;
const B = await import(pathToFileURL(path.join(HERE, 'check-boundaries.mjs')).href);

// ================================================================================================== errors
section('errors', 'typed refusals: codes, vars, the envelope', () => {
  ok(Object.isFrozen(E.CODES) && E.CODES.length >= 4, 'CODES is frozen and lists the S1 codes');
  ok(E.CODES.every((c) => /^solid\.err\.[a-z0-9_]+$/.test(c)), 'every code is solid.err.<lower_snake>');
  ok(['solid.err.no_bracket', 'solid.err.no_convergence', 'solid.err.singular'].every((c) => E.CODES.includes(c)) && E.KAD2_CODES['solid.err.singular'] === 'REFUSED_SINGULAR', 'S2 adds no_bracket, no_convergence and singular, each with its KAD2 code');
  ok(same([...E.CODES].sort(), E.CODES) && new Set(E.CODES).size === E.CODES.length, 'CODES is sorted and has no duplicates');
  ok(['solid.err.bad_input', 'solid.err.bad_tolerance', 'solid.err.internal', 'solid.err.limit'].every((c) => E.CODES.includes(c)), 'bad_input, bad_tolerance, internal and limit are codes');
  ok(same(Object.keys(E.KAD2_CODES).sort(), E.CODES) && Object.values(E.KAD2_CODES).every((c) => /^[A-Z][A-Z0-9_]*$/.test(c)), 'every code has exactly one upper-case KAD2 code (and KAD2_CODES has nothing else)');
  ok(Object.isFrozen(E.KAD2_CODES), 'KAD2_CODES is frozen');

  const e = new E.SolidError('solid.err.limit', { what: 'time', limit: 5, used: 6 });
  ok(e instanceof Error && e instanceof E.SolidError, 'SolidError is an Error');
  ok(e.name === 'SolidError' && e.code === 'solid.err.limit' && e.message === 'solid.err.limit', 'name, code, and the message is the code (no English in the kernel)');
  ok(same(e.vars, { what: 'time', limit: 5, used: 6 }) && Object.isFrozen(e.vars), 'vars are kept, frozen');
  const input = { name: 'x' };
  const e2 = new E.SolidError('solid.err.bad_input', input);
  input.name = 'changed';
  ok(e2.vars.name === 'x', 'vars are a copy: changing the input later does not change the error');
  ok(refuses(() => E.fail('solid.err.bad_input', { name: 'a', why: 'b' }), 'solid.err.bad_input', { name: 'a', why: 'b' }), 'fail() throws the code with its vars');
  ok(refuses(() => E.fail('solid.err.bogus', { x: 1 }), 'solid.err.internal', { reason: 'unknown_code', code: 'solid.err.bogus' }), 'an unknown code becomes solid.err.internal { reason: unknown_code, code }');
  ok(refuses(() => E.fail(42), 'solid.err.internal', { reason: 'unknown_code', code: '42' }), 'a code that is not a string becomes solid.err.internal too');
  ok(new E.SolidError('solid.err.limit').vars && Object.keys(new E.SolidError('solid.err.limit').vars).length === 0, 'vars default to an empty frozen object');

  // cleanVars
  const cv = E.cleanVars({
    n: 1.5, z: 0, neg: -2, b: true, f: false, nul: null, s: 'text', long: 'x'.repeat(300),
    arr: [1, 'a', null, true], tooLong: Array.from({ length: 17 }, (_, i) => i), mixed: [1, {}],
    fn() {}, obj: { a: 1 }, nan: NaN, inf: Infinity, und: undefined, sym: Symbol('s'), big: 2n,
    'bad-name': 1, '1x': 1, ['k'.repeat(65)]: 1,
    get boom() { throw new Error('getter'); },
  });
  ok(same(Object.keys(cv), ['n', 'z', 'neg', 'b', 'f', 'nul', 's', 'long', 'arr']), 'cleanVars keeps finite numbers, booleans, null, strings and short arrays of them, in order');
  ok(cv.long.length === 200, 'cleanVars cuts strings to 200 characters');
  ok(Object.isFrozen(cv) && Object.isFrozen(cv.arr), 'cleanVars freezes the result and its arrays');
  const many = {};
  for (let i = 0; i < 40; i++) many['k' + i] = i;
  ok(Object.keys(E.cleanVars(many)).length === 32, 'cleanVars keeps at most 32 keys');
  ok(same(E.cleanVars(null), {}) && same(E.cleanVars([1, 2]), {}) && same(E.cleanVars('x'), {}), 'cleanVars of a non-object is empty');

  // isSolidError
  ok(E.isSolidError(e), 'isSolidError: a SolidError');
  ok(E.isSolidError({ name: 'SolidError', code: 'solid.err.limit', vars: {} }), "isSolidError: one from another copy of the module (a worker's, a blob URL's)");
  ok(!E.isSolidError({ name: 'SolidError', code: 'solid.err.bogus' }) && !E.isSolidError(new Error('x')) && !E.isSolidError(null) && !E.isSolidError('solid.err.limit'), 'isSolidError: not for unknown codes, plain errors, null or strings');

  // toEnvelope
  const env = E.toEnvelope(e);
  ok(same(env, { code: 'solid.err.limit', vars: { what: 'time', limit: 5, used: 6 } }) && Object.isFrozen(env), 'toEnvelope(SolidError) → { code, vars }, frozen');
  ok(same(JSON.parse(JSON.stringify(env)), env), 'the envelope survives JSON');
  let nurbs = null;
  if (NC) {
    try { NC.cleanCurve({ deg: 99, knots: [], cvs: [] }); } catch (x) { nurbs = x; }
    ok(nurbs instanceof NC.NurbsError, "cc-nurbs' cleanCurve refuses degree 99 with a NurbsError (fixture for the pass-through)");
  } else nurbs = Object.assign(new Error('nurbs.err.degree'), { code: 'nurbs.err.degree', vars: { deg: 99, max: 15 } });
  ok(same(E.toEnvelope(nurbs), { code: nurbs.code, vars: nurbs.vars }) && /^nurbs\.err\./.test(E.toEnvelope(nurbs).code), "a cc-nurbs error passes through with its own code and vars");
  ok(same(E.toEnvelope({ code: 'step.err.size', vars: { max: 1, bad() {} } }), { code: 'step.err.size', vars: { max: 1 } }), "a cc-step error passes through, its vars cleaned");
  const secret = new TypeError('secret /home/user/file');
  const leak = JSON.stringify(E.toEnvelope(secret));
  ok(leak === JSON.stringify({ code: 'solid.err.internal', vars: {} }) && !leak.includes('secret'), 'any other error → solid.err.internal with no message, stack or detail');
  ok([null, undefined, 'x', 3, { code: 'other.err.x' }].every((x) => E.toEnvelope(x).code === 'solid.err.internal'), 'null, undefined, strings, numbers and foreign codes → solid.err.internal');
  const sent = (() => { try { E.fail('solid.err.limit', { what: 'degree', limit: 15, used: 16 }); } catch (e) { return E.fromEnvelope(structuredClone(E.toEnvelope(e))); } })();
  ok(sent instanceof E.SolidError && sent.code === 'solid.err.limit' && same(sent.vars, { what: 'degree', limit: 15, used: 16 }) && E.isSolidError(sent), 'fromEnvelope: a refusal sent across a worker boundary is a SolidError again, with its code and vars');
  const up = E.fromEnvelope({ code: 'nurbs.err.bad_knots', vars: { n: 3, f() {} } });
  ok(up instanceof Error && !(up instanceof E.SolidError) && up.code === 'nurbs.err.bad_knots' && same(up.vars, { n: 3 }) && same(E.toEnvelope(up), { code: 'nurbs.err.bad_knots', vars: { n: 3 } }), 'fromEnvelope: a cc-nurbs or cc-step code keeps its code, with cleaned vars');
  ok([null, 5, {}, { code: 'other.err.x' }, { code: 'solid.err.nope', vars: {} }, { code: 7 }].every((x) => E.fromEnvelope(x).code === 'solid.err.internal'), 'fromEnvelope: anything else is solid.err.internal');
});

// ================================================================================================== tol
section('tol', 'the tolerance policy', () => {
  const D = T.DEFAULT_TOL, t0 = T.makeTol({ lin: 1e-5, fit: 1e-3, mesh: { chord: 0.05 } });
  ok(D.lin === 1e-6 && D.ang === 1e-12 && D.size === 1e6 && D.fit === 1e-4 && D.maxEdgeTol === 1e-4, 'defaults: lin 1e-6 mm, ang 1e-12 rad, size 1e6 mm (a 1 km box), fit 1e-4 mm, maxEdgeTol 1e-4 mm (HANDOFF § 5.2, D-size)');
  ok(D.ang * D.size === D.lin, 'the defaults agree: directions parallel within ang drift apart by exactly lin across the whole box');
  ok(T.makeTol({ lin: 1e-5 }).ang === 1e-5 / 1e6 && T.makeTol({ size: 1e3 }).ang === 1e-6 / 1e3 && T.makeTol({ lin: 1e-5, ang: 1e-13 }).ang === 1e-13 && T.makeTol({ lin: 0.1, size: 1, fit: 10, maxEdgeTol: 1, mesh: { chord: 100 } }).ang === T.RANGES.ang[1], 'ang follows from lin and size when it is not given (lin / size, at most its range); a tighter one may be given');
  ok(refuses(() => T.makeTol({ ang: 1e-9 }), 'solid.err.bad_tolerance', { name: 'ang', why: 'above_lin_over_size', value: 1e-9, max: 1e-12 }) && refuses(() => T.makeTol({ size: 1e7 , ang: 1e-12 }), 'solid.err.bad_tolerance', { name: 'ang', why: 'above_lin_over_size' }), 'refused: an ang that lets parallel directions drift apart by more than lin inside the box');
  ok(refuses(() => T.makeTol({ size: 1e9 }), 'solid.err.bad_tolerance', { name: 'lin', why: 'below_resolution', value: 1e-6, min: 1e9 * 1e-13 }) && T.makeTol({ size: 1e7 }).size === 1e7, 'refused: a box so large that lin is within a few thousand doubles of its far corner (lin ≥ size · 1e-13)');
  ok(T.inBox([5e5, -5e5, 0]) && !T.inBox([5e5 + 1, 0, 0]) && !T.inBox([0, NaN, 0]) && !T.inBox([0, 0]) && !T.inBox([0, 0, Infinity]) && T.inBox([400, 0, 0], T.makeTol({ size: 1e3 })) && !T.inBox([600, 0, 0], T.makeTol({ size: 1e3 })), 'inBox: a point is inside when every coordinate is within size / 2 of the origin');
  const viaClone = T.fromData(structuredClone(T.toData(t0))), viaJson = T.fromData(JSON.parse(JSON.stringify(T.toData(t0))));
  ok(!T.isTol(structuredClone(t0)) && T.isTol(viaClone) && same(viaClone, t0) && same(viaJson, t0) && !T.isTol(T.toData(t0)) && Object.getPrototypeOf(T.toData(t0)) === Object.prototype, 'toData / fromData: a Tolerance crosses a worker boundary (structuredClone) or JSON as plain data and is checked again on arrival; the clone itself is not a Tolerance');
  ok(refuses(() => T.fromData({ ...T.toData(t0), lin: -1 }), 'solid.err.bad_tolerance', { name: 'lin' }) && refuses(() => T.toData({ ...t0 }), 'solid.err.bad_input', { name: 'tolerance', why: 'not_a_tolerance' }), 'fromData checks what arrives; toData takes only a Tolerance');
  ok(D.mesh.chord === 0.01 && D.mesh.angle === 0.5 * Math.PI / 180, 'defaults: mesh.chord 0.01 mm, mesh.angle 0.5° in radians');
  ok(deepFrozen(D) && T.isTol(D), 'DEFAULT_TOL is deeply frozen and is a Tolerance');
  ok(!T.isTol({ ...D, mesh: { ...D.mesh } }) && !T.isTol(null) && !T.isTol(undefined) && !T.isTol(1) && !T.isTol('x'), 'a copy is not a Tolerance (isTol cannot be fooled), nor are other values');
  const t1 = T.makeTol({ lin: 1e-5 });
  ok(t1.lin === 1e-5 && t1.fit === D.fit && t1.mesh.chord === D.mesh.chord && T.isTol(t1) && deepFrozen(t1), 'makeTol overrides one value and keeps the rest; the result is a frozen Tolerance');
  const t2 = T.makeTol({ mesh: { chord: 0.1 } });
  ok(t2.mesh.chord === 0.1 && t2.mesh.angle === D.mesh.angle, 'mesh can be given in part');
  ok(same(T.makeTol({ lin: undefined, mesh: undefined }), D), 'an explicit undefined means the default');
  ok(T.makeTol({}) !== D && same(T.makeTol({}), D), 'makeTol({}) is a new Tolerance with the default values');

  const bad = 'solid.err.bad_tolerance';
  ok([null, [], 5, 'x', true].every((x) => refuses(() => T.makeTol(x), bad, { name: 'tolerance', why: 'not_an_object' })), 'refused: a tolerance that is not an object');
  ok(refuses(() => T.makeTol({ lim: 1e-6 }), bad, { name: 'lim', why: 'unknown' }), 'refused: an unknown key (typo protection)');
  ok(refuses(() => T.makeTol({ mesh: { cord: 0.1 } }), bad, { name: 'mesh.cord', why: 'unknown' }), 'refused: an unknown mesh key');
  ok(refuses(() => T.makeTol({ mesh: 0.1 }), bad, { name: 'mesh', why: 'not_an_object' }) && refuses(() => T.makeTol({ mesh: null }), bad, { name: 'mesh', why: 'not_an_object' }), 'refused: mesh that is not an object');
  ok([NaN, Infinity, -Infinity, '1e-6', null, {}].every((v) => refuses(() => T.makeTol({ lin: v }), bad, { name: 'lin', why: 'not_a_number' })), 'refused: values that are not finite numbers');
  ok(refuses(() => T.makeTol({ lin: 0 }), bad, { name: 'lin', why: 'out_of_range', value: 0, min: T.RANGES.lin[0], max: T.RANGES.lin[1] }), 'refused: lin 0, with value, min and max in vars');
  ok(refuses(() => T.makeTol({ lin: -1e-6 }), bad, { why: 'out_of_range' }) && refuses(() => T.makeTol({ lin: 1 }), bad, { name: 'lin', why: 'out_of_range' }), 'refused: a negative lin, and lin = 1 mm');
  ok(refuses(() => T.makeTol({ mesh: { angle: Math.PI } }), bad, { name: 'mesh.angle', why: 'out_of_range' }), 'refused: a mesh angle beyond 90°');
  ok(refuses(() => T.makeTol({ fit: 1e-7 }), bad, { name: 'fit', why: 'below_lin', value: 1e-7, min: 1e-6 }), 'refused: fit below lin');
  ok(refuses(() => T.makeTol({ maxEdgeTol: 1e-7 }), bad, { name: 'maxEdgeTol', why: 'below_lin' }), 'refused: maxEdgeTol below lin');
  ok(refuses(() => T.makeTol({ lin: 0.05, fit: 0.05, maxEdgeTol: 0.05, mesh: { chord: 0.01 } }), bad, { name: 'mesh.chord', why: 'below_lin' }), 'refused: mesh.chord below lin');

  ok(deepFrozen(T.RANGES) && Object.values(T.RANGES).every(([a, b]) => a > 0 && a < b), 'RANGES is frozen and every range is positive and ordered');
  const val = (t, k) => k.startsWith('mesh.') ? t.mesh[k.slice(5)] : t[k];
  ok(Object.keys(T.RANGES).every((k) => val(D, k) >= T.RANGES[k][0] && val(D, k) <= T.RANGES[k][1]), 'every default sits inside its range');
  // one value at an end of its range, the others moved only as far as the relations (lin ≤ fit, maxEdgeTol, chord) need
  const atEdge = (k, v) => {
    if (k === 'lin') return { lin: v, size: 1, fit: 10, maxEdgeTol: 1, mesh: { chord: 100 } };
    if (k === 'ang') return { ang: v, size: 1, lin: 0.1, fit: 10, maxEdgeTol: 1, mesh: { chord: 100 } };
    if (k === 'size') return { size: v, lin: 0.1, fit: 10, maxEdgeTol: 1, mesh: { chord: 100 } };
    if (k === 'mesh.angle') return { mesh: { angle: v } };
    const lin = Math.min(D.lin, v);
    return k === 'mesh.chord' ? { lin, size: 1, mesh: { chord: v } } : { lin, size: 1, [k]: v };
  };
  const accepted = (k, v) => { try { return val(T.makeTol(atEdge(k, v)), k) === v; } catch { return false; } };
  ok(Object.keys(T.RANGES).every((k) => accepted(k, T.RANGES[k][0]) && accepted(k, T.RANGES[k][1])), 'both ends of every range are accepted');

  ok(T.resolveTol(undefined) === D && T.resolveTol(null) === D, 'resolveTol(undefined | null) → DEFAULT_TOL');
  ok(T.resolveTol(t1) === t1, 'resolveTol(Tolerance) → the same object');
  const r = T.resolveTol({ fit: 1e-3 });
  ok(T.isTol(r) && r.fit === 1e-3, 'resolveTol(plain object) → a checked Tolerance');
  ok(refuses(() => T.resolveTol({ lin: 'big' }), bad, { name: 'lin' }), 'resolveTol refuses what makeTol refuses');
});

// ================================================================================================== limits
section('limits', 'budgets', () => {
  {
    const b0 = L.makeBudget({ maxIterations: 100, maxEntities: 50, clock: null }); b0.step(); b0.step(); b0.entities(7);
    const d0 = L.toData(b0), b1 = L.fromData(JSON.parse(JSON.stringify(d0)), { clock: null }), open = L.toData(L.makeBudget({ clock: null }));
    ok(same(d0, { maxIterations: 98, maxEntities: 43, maxMs: null }) && L.isBudget(b1) && b1.limits.maxIterations === 98 && b1.limits.maxEntities === 43 && same(open, { maxIterations: null, maxEntities: null, maxMs: null }) && L.fromData(open, { clock: null }).limits.maxIterations === Infinity,
      'toData / fromData: a budget crosses a worker boundary as what is left of it (null: no limit, which JSON can carry); the clock stays behind and the receiver gives its own');
    ok(refuses(() => L.toData({}), 'solid.err.bad_input', { name: 'budget', why: 'not_a_budget' }) && refuses(() => L.fromData({ maxIterations: -1 }), 'solid.err.bad_input', { name: 'maxIterations' }) && refuses(() => L.fromData(null), 'solid.err.bad_input', { name: 'budget', why: 'not_a_budget' }), 'fromData checks what arrives; toData takes only a budget');
  }
  const lim = 'solid.err.limit', bad = 'solid.err.bad_input';
  const free = L.makeBudget();
  for (let i = 0; i < 100000; i++) free.step();
  free.entities(5);
  ok(free.used().iterations === 100000 && free.used().entities === 5, 'a budget with no limits counts and never stops');
  ok(free.limits.maxIterations === Infinity && free.limits.maxEntities === Infinity && free.limits.maxMs === Infinity, 'its limits are Infinity');

  const b5 = L.makeBudget({ maxIterations: 5 });
  let steps = 0;
  try { for (;;) { b5.step(); steps++; } } catch (x) { ok(x.code === lim && same(x.vars, { what: 'iterations', limit: 5, used: 6 }), 'maxIterations 5: the 6th step throws { what: iterations, limit: 5, used: 6 }'); }
  ok(steps === 5, 'exactly 5 steps run under maxIterations 5');
  ok(refuses(() => L.makeBudget({ maxIterations: 0 }).step(), lim, { what: 'iterations', limit: 0, used: 1 }), 'maxIterations 0 refuses the first step');
  ok(refuses(() => L.makeBudget({ maxIterations: 10 }).step(11), lim, { used: 11 }), 'step(n) counts n at once');
  const stopAt = () => { const b = L.makeBudget({ maxIterations: 1234 }); let k = 0; try { for (;;) { b.step(k % 3); k++; } } catch { return k; } };
  ok(stopAt() === stopAt(), 'deterministic: the same work stops at the same step every time');
  ok(refuses(() => { const b = L.makeBudget({ maxEntities: 3 }); b.entities(2); b.entities(2); }, lim, { what: 'entities', limit: 3, used: 4 }), 'maxEntities: past the limit throws { what: entities, limit, used }');
  const z = L.makeBudget({ maxIterations: 1 });
  z.step(0); z.step(0);
  ok(z.used().iterations === 0, 'step(0) counts nothing');
  ok([-1, 1.5, '2', NaN, null].every((n) => refuses(() => L.makeBudget().step(n), bad, { name: 'n', why: 'not_a_count' })), 'step(n) refuses n that is not a whole number ≥ 0');
  ok(refuses(() => L.makeBudget().entities(-2), bad, { name: 'n', why: 'not_a_count' }), 'entities(n) refuses a negative n');

  ok([null, [], 5, 'x'].every((o) => refuses(() => L.makeBudget(o), bad, { name: 'budget', why: 'not_an_object' })), 'refused: options that are not an object');
  ok(refuses(() => L.makeBudget({ maxIteration: 5 }), bad, { name: 'maxIteration', why: 'unknown' }), 'refused: an unknown option (typo protection)');
  ok([-1, 1.5, NaN, '5'].every((v) => refuses(() => L.makeBudget({ maxIterations: v }), bad, { name: 'maxIterations', why: 'not_a_count' })), 'refused: maxIterations that is not a whole number ≥ 0');
  ok([0, -5, NaN, '10'].every((v) => refuses(() => L.makeBudget({ maxMs: v }), bad, { name: 'maxMs', why: 'not_a_duration' })), 'refused: maxMs that is not a positive number');
  ok(refuses(() => L.makeBudget({ clock: 'now' }), bad, { name: 'clock', why: 'not_a_function' }), 'refused: a clock that is not a function');
  ok(refuses(() => L.makeBudget({ maxMs: 10, clock: null }), bad, { name: 'clock', why: 'missing' }), 'refused: a deadline with no clock');
  ok([0, 1.5, 2000000].every((v) => refuses(() => L.makeBudget({ checkEvery: v }), bad, { name: 'checkEvery', why: 'out_of_range' })), 'refused: checkEvery outside 1 … 1e6');
  ok(refuses(() => L.makeBudget({ clock: () => NaN }), bad, { name: 'clock', why: 'not_a_number' }), 'refused: a clock that does not return a number');

  // time, on a clock the test controls
  let now = 100, reads = 0;
  const clock = () => { reads++; return now; };
  const bt = L.makeBudget({ maxMs: 50, clock, checkEvery: 10 });
  now = 150;
  bt.checkTime();
  ok(true, 'at exactly the deadline the budget still runs');
  now = 151;
  ok(refuses(() => bt.checkTime(), lim, { what: 'time', limit: 50, used: 51 }), 'past the deadline checkTime throws { what: time, limit: 50, used: 51 } (ms)');
  now = 100;
  const bs = L.makeBudget({ maxMs: 50, clock, checkEvery: 10 });
  now = 1000;
  reads = 0;
  for (let i = 0; i < 9; i++) bs.step();
  ok(reads === 0, 'steps between clock reads do not read the clock (checkEvery 10: 9 steps, no read)');
  ok(refuses(() => bs.step(), lim, { what: 'time' }) && reads === 1, 'the 10th step reads the clock once and throws');
  now = 0;
  const bu = L.makeBudget({ clock });
  now = 7.25;
  ok(same(bu.used(), { iterations: 0, entities: 0, ms: 7.25 }), 'used() → { iterations, entities, ms } on the budget’s own clock');
  const noClock = L.makeBudget({ clock: null });
  noClock.checkTime();
  ok(noClock.used().ms === 0, 'with no clock and no deadline, time is simply not measured');
  const real = L.makeBudget();
  ok(Number.isFinite(real.used().ms) && real.used().ms >= 0, 'by default the clock is performance.now()');

  // child budgets
  const parent = L.makeBudget({ maxIterations: 10 });
  parent.step(4);
  const child = parent.child({ maxIterations: 100 });
  ok(child.limits.maxIterations === 6, 'a child asking for 100 steps gets what is left of its parent (6)');
  child.step(6);
  ok(parent.used().iterations === 10, "a child's steps are counted in its parent");
  ok(refuses(() => child.step(), lim, { what: 'iterations', limit: 6, used: 7 }), 'the child stops at its own limit');
  const p2 = L.makeBudget({ maxIterations: 10 });
  const c2 = p2.child();
  p2.step(5);
  ok(refuses(() => c2.step(6), lim, { what: 'iterations', limit: 10, used: 11 }), 'the parent still stops the work when the child has room left (no child can outgrow its parent)');
  const g = L.makeBudget({ maxEntities: 3 }).child().child();
  ok(refuses(() => g.entities(4), lim, { what: 'entities', limit: 3 }), 'a grandchild is held to the root budget');
  now = 0;
  const pt = L.makeBudget({ maxMs: 50, clock });
  now = 30;
  const ct = pt.child({ maxMs: 100 });
  now = 51;
  ok(refuses(() => ct.checkTime(), lim, { what: 'time', limit: 20, used: 21 }), "a child's deadline is never later than its parent's");
  ok(refuses(() => L.makeBudget().child({ clock }), bad, { name: 'clock', why: 'unknown' }), 'a child cannot bring its own clock');
  ok(refuses(() => L.makeBudget({ clock: null }).child({ maxMs: 5 }), bad, { name: 'clock', why: 'missing' }), 'a child deadline needs a clock');

  ok(L.isBudget(parent) && L.isBudget(child) && !L.isBudget({ step() {} }) && !L.isBudget(null), 'isBudget tells budgets from look-alikes');
  const r1 = L.resolveBudget(), r2 = L.resolveBudget(null);
  ok(L.isBudget(r1) && L.isBudget(r2) && r1 !== r2, 'resolveBudget(undefined | null) → a new unlimited budget each time (no shared counters)');
  ok(L.resolveBudget(parent) === parent && L.resolveBudget({ maxIterations: 2 }).limits.maxIterations === 2, 'resolveBudget(Budget) → itself; (plain object) → makeBudget');
  ok(Object.isFrozen(parent) && Object.isFrozen(parent.limits), 'a budget and its limits are frozen');
});

// ================================================================================================== S2: the math kit
const api = { section, ok, refuses, same, deepFrozen, appUrl, VERBOSE };
await (await import('./test-core.mjs')).register(api);
await (await import('./test-math.mjs')).register(api);
await (await import('./test-geom.mjs')).register(api);

// ================================================================================================== entry
section('entry', 'the public entry', async () => {
  ok(/^\d+\.\d+\.\d+$/.test(P.VERSION), 'VERSION is x.y.z (' + P.VERSION + ')');
  const expected = ['CODES', 'DEFAULT_TOL', 'SolidError', 'VERSION', 'aabb', 'basis', 'errors', 'exact', 'fail', 'float', 'frame', 'intervals', 'isBudget', 'isSolidError', 'isTol', 'limits', 'linalg', 'makeBudget', 'makePrng', 'makeTol', 'mat4', 'predicates', 'prng', 'quad', 'resolveBudget', 'resolveTol', 'roots', 'toEnvelope', 'tol', 'trig', 'vec3'];
  ok(same(Object.keys(P).sort(), [...expected].sort()), 'index.js exports exactly the S1–S4 names (a new export is a deliberate change to this list)');
  ok(P.errors.SolidError === E.SolidError && P.tol.DEFAULT_TOL === T.DEFAULT_TOL && P.limits.makeBudget === L.makeBudget, 'the namespaces are the core modules themselves');
  const mods = { float: 'core/float.js', trig: 'core/trig.js', prng: 'core/prng.js', intervals: 'core/intervals.js', exact: 'core/exact.js', vec3: 'math/vec3.js', mat4: 'math/mat4.js', frame: 'math/frame.js', aabb: 'math/aabb.js', quad: 'math/quad.js', roots: 'math/roots.js', linalg: 'math/linalg.js', predicates: 'math/predicates.js', basis: 'geom/basis.js' };
  let nsOk = true;
  for (const [ns, file] of Object.entries(mods)) { const m = await import(appUrl('solid/' + file)); if (!same(Object.keys(P[ns]).sort(), Object.keys(m).sort()) || !Object.keys(m).every((k) => P[ns][k] === m[k])) nsOk = false; }
  ok(nsOk && P.makePrng === P.prng.makePrng, 'the S2–S4 namespaces are their modules, and makePrng is prng.makePrng');
  ok(P.fail === E.fail && P.makeTol === T.makeTol && P.resolveBudget === L.resolveBudget, 'the named exports are the same functions');
  ok(globalsAdded.length === 0, 'importing cc-solid adds no globals' + (globalsAdded.length ? ' (added: ' + globalsAdded.join(', ') + ')' : ''));
  const { files, imports } = B.checkTree(APP);
  const edges = new Map(files.map((f) => [f, []]));
  for (const im of imports) {
    const to = path.relative(APP, path.resolve(path.dirname(path.join(APP, im.file)), im.spec)).split(path.sep).join('/');
    if (edges.has(to)) edges.get(im.file).push(to);
  }
  const seen = new Set(['solid/index.js']);
  const todo = ['solid/index.js'];
  while (todo.length) for (const t of edges.get(todo.pop()) || []) if (!seen.has(t)) { seen.add(t); todo.push(t); }
  const orphans = files.filter((f) => !seen.has(f));
  ok(orphans.length === 0, 'every file in solid/ is reachable from index.js' + (orphans.length ? ' (not reached: ' + orphans.join(', ') + ')' : ''));
});

// ================================================================================================== boundaries
section('boundaries', 'the architecture rules (check-boundaries.mjs)', () => {
  const real = B.checkTree(APP);
  ok(real.problems.length === 0, `lib/solid passes every rule (${real.files.length} files, ${real.imports.length} imports)` + (real.problems.length ? '\n' + real.problems.map((p) => `       ${p.file}:${p.line} [${p.rule}] ${p.detail}`).join('\n') : ''));
  const clean = B.checkTree(path.join(HERE, 'fixtures/clean/lib'));
  ok(clean.problems.length === 0, 'the clean fixture (comments, strings, templates, regexes, keys and members that only look like violations) passes' + (clean.problems.length ? '\n' + clean.problems.map((p) => `       ${p.file}:${p.line} [${p.rule}] ${p.detail}`).join('\n') : ''));

  const badDir = path.join(HERE, 'fixtures/bad/lib');
  const expected = new Set();
  const visit = (dir) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) { visit(p); continue; }
      const rel = path.relative(badDir, p).split(path.sep).join('/');
      fs.readFileSync(p, 'utf8').split('\n').forEach((text, i) => {
        const m = /expect:\s*([a-z]+(?:\s+[a-z]+)*)/.exec(text);
        if (m) for (const rule of m[1].split(/\s+/)) expected.add(`${rel}:${i + 1}:${rule}`);
      });
    }
  };
  visit(path.join(badDir, 'solid'));
  const bad = B.checkTree(badDir);
  const got = new Set(bad.problems.map((p) => `${p.file}:${p.line}:${p.rule}`));
  const missing = [...expected].filter((x) => !got.has(x)).sort();
  const extra = [...got].filter((x) => !expected.has(x)).sort();
  ok(missing.length === 0, `every expected problem in the bad fixture is reported (${expected.size} expected)` + (missing.length ? '\n       not reported: ' + missing.join('\n       not reported: ') : ''));
  ok(extra.length === 0, 'nothing else is reported' + (extra.length ? '\n       unexpected: ' + extra.join('\n       unexpected: ') : ''));
  const fired = new Set(bad.problems.map((p) => p.rule));
  const quiet = B.RULES.filter((r) => !fired.has(r));
  ok(quiet.length === 0, `every rule (${B.RULES.length}) is proven to fire by the bad fixture` + (quiet.length ? ' (never fired: ' + quiet.join(', ') + ')' : ''));

  const cli = (dir) => spawnSync(process.execPath, [path.join(HERE, 'check-boundaries.mjs'), dir], { encoding: 'utf8' }).status;
  ok(cli(APP) === 0 && cli(path.join(HERE, 'fixtures/clean/lib')) === 0, 'command line: exit 0 on the app and the clean fixture');
  ok(cli(badDir) === 1, 'command line: exit 1 on the bad fixture');

  // D-det (b) on the real cc-nurbs: the exact functions may be imported, arc, circle and angle may not
  if (fs.existsSync(path.join(APP, 'nurbs/curve.js')) && fs.existsSync(path.join(APP, 'nurbs/surface.js'))) {
    const tmp = fs.mkdtempSync(path.join(HERE, '.reach-'));
    try {
      fs.cpSync(path.join(APP, 'nurbs'), path.join(tmp, 'nurbs'), { recursive: true });
      fs.mkdirSync(path.join(tmp, 'solid/geom'), { recursive: true });
      const head = '/* SPDX-License-Identifier: Apache-2.0 */\n';
      fs.writeFileSync(path.join(tmp, 'solid/index.js'), head + "export * from './geom/g.js';\n");
      const tryImport = (line, use) => { fs.writeFileSync(path.join(tmp, 'solid/geom/g.js'), head + line + '\nexport const g = ' + use + ';\n'); return B.checkTree(tmp).problems.map((p) => p.rule); };
      const fine = [
        ["import { point, derivs, insertKnot, split, elevate, closestParam, arcLength, tessellate, line } from '../../nurbs/curve.js';", '[point, derivs, insertKnot, split, elevate, closestParam, arcLength, tessellate, line]'],
        ["import * as C from '../../nurbs/curve.js';", '[C.point, C.derivs, C.bbox]'],
        ["import * as S from '../../nurbs/surface.js';", '[S.cleanSurface, S.insertKnot, S.split]'],
        ["import { dot, cross, norm, len } from '../../nurbs/vec.js';", '[dot, cross, norm, len]'],
      ].filter(([l, u]) => tryImport(l, u).length !== 0).map(([l]) => l);
      const kept = [
        ["import { arc } from '../../nurbs/curve.js';", 'arc'], ["import { circle } from '../../nurbs/curve.js';", 'circle'], ["import { angle } from '../../nurbs/vec.js';", 'angle'],
        ["import * as C from '../../nurbs/curve.js';", 'C.arc'], ["import * as C from '../../nurbs/curve.js';", 'C'], ["import * as V from '../../nurbs/vec.js';", 'V.angle'],
        ["import { point, arc } from '../../nurbs/curve.js';", '[point, arc]'], ["import { revolve } from '../../nurbs/construct.js';", 'revolve'],
      ].filter(([l, u]) => !same(tryImport(l, u), ['reach'])).map(([l, u]) => l + ' ' + u);
      ok(fine.length === 0, 'reach on the real cc-nurbs: the exact curve, surface and vector functions can be imported' + (fine.length ? '\n       refused: ' + fine.join('\n       refused: ') : ''));
      ok(kept.length === 0, 'reach on the real cc-nurbs: arc, circle, angle and what is built on them (revolve) are kept out, by name or through a namespace (D-det (b))' + (kept.length ? '\n       let in: ' + kept.join('\n       let in: ') : ''));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }

  // the tokenizer on its own
  const kinds = (src) => B.tokenize(src).tokens.map((t) => t.t).join(' ');
  ok(kinds('a / b / c') === 'id p id p id', 'tokenizer: a / b / c is two divisions');
  ok(kinds('x = /a\\/b[/]/g.test(y)') === 'id p re p id p id p', 'tokenizer: a regular expression with an escaped slash and a slash in a class');
  ok(kinds('f(1) / 2') === 'id p num p p num' && kinds('return /x/') === 'id re', 'tokenizer: division after ), a regex after return');
  ok(kinds('`a ${ {b: `c ${d}`}.b } e`') === 'p id p id tpl p p id tpl', 'tokenizer: nested template literals and object braces inside ${…}');
  ok(B.tokenize('a\n// one\nb /* two\nthree */ c').comments.get(2).includes('one') && B.tokenize('a\n// one\nb /* two\nthree */ c').tokens.at(-1).line === 4, 'tokenizer: comments are kept by line and line numbers survive block comments');
});

// ================================================================================================== worker
section('worker', 'cc-solid inside a worker thread', async () => {
  const w = new Worker(new URL('./worker-probe.mjs', import.meta.url), { workerData: { entry: appUrl('solid/index.js') } });
  const msg = await new Promise((resolve, reject) => { w.once('message', resolve); w.once('error', reject); });
  await w.terminate();
  ok(msg.version === P.VERSION && same(msg.codes, [...P.CODES]), 'the worker imports the same cc-solid (version and codes)');
  ok(same(msg.tol, P.DEFAULT_TOL), 'DEFAULT_TOL crosses to the main thread unchanged');
  ok(same(msg.refused, { code: 'solid.err.limit', vars: { what: 'iterations', limit: 2, used: 3 } }), "a refusal inside the worker comes back as an envelope");
});

// ================================================================================================== run
console.log(`cc-solid tests — app: ${APP}`);
for (const s of sections) {
  if (ONLY && s.name !== ONLY) continue;
  console.log(`\n== ${s.name}: ${s.title}`);
  const before = failed;
  try { await s.fn(); } catch (e) { failed++; console.log('  FAIL section threw: ' + (e && e.stack || e)); }
  if (!VERBOSE && failed === before) console.log('  ok');
}
if (ONLY && !sections.some((s) => s.name === ONLY)) { console.log(`no section "${ONLY}" (sections: ${sections.map((s) => s.name).join(', ')})`); process.exit(1); }
console.log(`\n${failed ? 'FAILED' : 'OK'} — cc-solid: ${pass} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
