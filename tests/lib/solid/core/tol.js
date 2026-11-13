/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * tol.js — cc-solid (S1, docs/solid/HANDOFF.md § 5.2): the one tolerance policy. DOM-free; imports errors.js only.
 *
 * Every cc-solid operation takes one Tolerance and compares with it. No other cc-solid file writes a tolerance as a
 * number: the boundary checker refuses small literals outside this file (its `epsilon` rule). A Tolerance is a frozen
 * object made here and only here, so code can tell a checked one from a look-alike (isTol). Lengths are millimetres,
 * angles radians.
 *
 *   name         default    meaning
 *   lin          1e-6 mm    two points are the same point; a point lies on a curve or a surface
 *   ang          1e-9 rad   two directions are parallel
 *   fit          1e-4 mm    the largest deviation an approximating operation may leave (and must report)
 *   maxEdgeTol   1e-4 mm    the largest local tolerance an edge or a vertex may carry before the auditor reports it
 *   mesh.chord   0.01 mm    tessellation: the largest chord deviation
 *   mesh.angle   0.5°       tessellation: the largest normal deviation (stored in radians)
 *
 *   DEFAULT_TOL                     the values above, as a Tolerance
 *   makeTol(over = {}) → Tolerance  DEFAULT_TOL with `over` laid on top; `mesh` may be given in part. Every value is
 *                                   checked: a finite number inside RANGES, no unknown key, and lin ≤ fit,
 *                                   lin ≤ maxEdgeTol, lin ≤ mesh.chord. Anything else is refused with
 *                                   solid.err.bad_tolerance { name, why, value?, min?, max? }, where `why` is
 *                                   'not_an_object' | 'unknown' | 'not_a_number' | 'out_of_range' | 'below_lin'.
 *   resolveTol(t) → Tolerance       undefined or null → DEFAULT_TOL; a Tolerance → itself; a plain object → makeTol(t)
 *   isTol(t) → boolean              true only for a Tolerance made by makeTol (DEFAULT_TOL included)
 *   RANGES                          { name: [min, max] } — wide on purpose: they catch unit mistakes, not taste
 */
import { fail } from './errors.js';

const DEG = Math.PI / 180;

export const RANGES = Object.freeze({
  lin: Object.freeze([1e-12, 0.1]),
  ang: Object.freeze([1e-15, 0.01]),
  fit: Object.freeze([1e-9, 10]),
  maxEdgeTol: Object.freeze([1e-12, 1]),
  'mesh.chord': Object.freeze([1e-6, 100]),
  'mesh.angle': Object.freeze([1e-6, Math.PI / 2]),
});

const DEFAULTS = Object.freeze({ lin: 1e-6, ang: 1e-9, fit: 1e-4, maxEdgeTol: 1e-4, mesh: Object.freeze({ chord: 0.01, angle: 0.5 * DEG }) });
const TOP_KEYS = Object.freeze(['lin', 'ang', 'fit', 'maxEdgeTol', 'mesh']);
const MESH_KEYS = Object.freeze(['chord', 'angle']);
const MADE = new WeakSet();

const isPlainObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

function value(name, given, fallback) {
  const v = given === undefined ? fallback : given;
  if (typeof v !== 'number' || !Number.isFinite(v)) fail('solid.err.bad_tolerance', { name, why: 'not_a_number' });
  const [min, max] = RANGES[name];
  if (v < min || v > max) fail('solid.err.bad_tolerance', { name, why: 'out_of_range', value: v, min, max });
  return v;
}

function atLeastLin(name, v, lin) {
  if (v < lin) fail('solid.err.bad_tolerance', { name, why: 'below_lin', value: v, min: lin });
}

export function makeTol(over = {}) {
  if (!isPlainObject(over)) fail('solid.err.bad_tolerance', { name: 'tolerance', why: 'not_an_object' });
  for (const k of Object.keys(over)) if (!TOP_KEYS.includes(k)) fail('solid.err.bad_tolerance', { name: k, why: 'unknown' });
  const mesh = over.mesh === undefined ? {} : over.mesh;
  if (!isPlainObject(mesh)) fail('solid.err.bad_tolerance', { name: 'mesh', why: 'not_an_object' });
  for (const k of Object.keys(mesh)) if (!MESH_KEYS.includes(k)) fail('solid.err.bad_tolerance', { name: 'mesh.' + k, why: 'unknown' });

  const lin = value('lin', over.lin, DEFAULTS.lin);
  const ang = value('ang', over.ang, DEFAULTS.ang);
  const fit = value('fit', over.fit, DEFAULTS.fit);
  const maxEdgeTol = value('maxEdgeTol', over.maxEdgeTol, DEFAULTS.maxEdgeTol);
  const chord = value('mesh.chord', mesh.chord, DEFAULTS.mesh.chord);
  const angle = value('mesh.angle', mesh.angle, DEFAULTS.mesh.angle);
  atLeastLin('fit', fit, lin);
  atLeastLin('maxEdgeTol', maxEdgeTol, lin);
  atLeastLin('mesh.chord', chord, lin);

  const t = Object.freeze({ lin, ang, fit, maxEdgeTol, mesh: Object.freeze({ chord, angle }) });
  MADE.add(t);
  return t;
}

export const DEFAULT_TOL = makeTol({});

export const isTol = (t) => t !== null && typeof t === 'object' && MADE.has(t);

export function resolveTol(t) {
  if (t === undefined || t === null) return DEFAULT_TOL;
  if (isTol(t)) return t;
  return makeTol(t);
}
