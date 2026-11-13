/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * index.js — cc-solid, the engine engine.solid: the CadCraft suite's NURBS-based exact solid kernel, its one public entry
 * (docs/solid/HANDOFF.md § 4). DOM-free, no network, no timers, no third-party code: the same results, to the bit, in a
 * page, a Worker and Node.
 *
 * The edited copy is lib/solid/ in the library repo (withshalom/getlibrarycraft, branch engine/solid). Each app that hosts the
 * engine carries a byte-identical copy as solid/ in its build folder; a sync script with --check keeps them in step once the
 * first host takes one. Add-ons name engine.solid in their manifest's needs and import it through the app (the engine:solid/
 * form of the add-on loader), so the app's own copy answers. Callers import this file as a namespace, never a file behind
 * it, so the layers can change. docs/solid/STATUS.md says what is built.
 *
 *   VERSION
 *   errors · tol · limits                    S1: typed refusals, the tolerance policy, budgets
 *   float · trig · prng · intervals          S2 core: the bits of doubles and directed rounding; deterministic elementary
 *                                            functions; the seeded generator; interval arithmetic
 *   vec3 · mat4 · frame · aabb               S2 math: vectors, row-major affine matrices, placements, conservative boxes
 *   quad · roots · linalg                    S2 math: Gauss–Legendre integration; quadratic, cubic, Brent and bracketed
 *                                            Newton; LU, condition estimate, banded LU, QR and least squares
 *   predicates                               S3: orient2d, orient3d, incircle, insphere with exact signs
 *   basis                                    S4: knot vectors, span search, B-spline basis functions and derivatives
 *                                            (on cc-nurbs' A2.1–A2.3, which sits beside the engine as nurbs/)
 *   SolidError · fail · isSolidError · toEnvelope · CODES · DEFAULT_TOL · makeTol · resolveTol · isTol
 *   makeBudget · resolveBudget · isBudget · makePrng
 */
export const VERSION = '0.0.4';

export * as errors from './core/errors.js';
export * as tol from './core/tol.js';
export * as limits from './core/limits.js';
export * as float from './core/float.js';
export * as trig from './core/trig.js';
export * as prng from './core/prng.js';
export * as intervals from './core/intervals.js';
export * as vec3 from './math/vec3.js';
export * as mat4 from './math/mat4.js';
export * as frame from './math/frame.js';
export * as aabb from './math/aabb.js';
export * as quad from './math/quad.js';
export * as roots from './math/roots.js';
export * as linalg from './math/linalg.js';
export * as predicates from './math/predicates.js';
export * as basis from './geom/basis.js';

export { SolidError, fail, isSolidError, toEnvelope, CODES } from './core/errors.js';
export { DEFAULT_TOL, makeTol, resolveTol, isTol } from './core/tol.js';
export { makeBudget, resolveBudget, isBudget } from './core/limits.js';
export { makePrng } from './core/prng.js';
