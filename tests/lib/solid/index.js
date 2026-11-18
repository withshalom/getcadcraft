/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * index.js — cc-solid, the engine engine.solid: the CadCraft suite's NURBS-based exact solid kernel, its one public entry
 * (docs/solid/HANDOFF.md § 4). DOM-free, no network, no timers, no third-party code: the same results, to the bit, in a
 * page, a Worker and Node.
 *
 * The canonical copy is lib/solid/, beside lib/nurbs/. Each app that hosts the engine carries a byte-identical copy as
 * dev/solid/, beside its dev/nurbs/; tools/solid/sync.mjs (with --check) keeps them in step. Add-ons name engine.solid in
 * their manifest's needs and import it through the app (the engine:solid/ form of the add-on loader), so the app's own copy
 * answers. Callers import this file as a namespace, never a file behind it, so the layers can change.
 * docs/solid/STATUS.md says what is built.
 *
 *   VERSION
 *   errors · tol · limits                    S1: typed refusals, the tolerance policy, budgets
 *   float · trig · prng · intervals          S2 core: the bits of doubles and directed rounding; deterministic elementary
 *                                            functions; the seeded generator; interval arithmetic
 *   exact                                    exact signs and quotients of sums of products of doubles (whole-number arithmetic)
 *   vec3 · mat4 · frame · aabb               S2 math: vectors, row-major affine matrices, placements, conservative boxes
 *   quad · roots · linalg                    S2 math: Gauss–Legendre integration; quadratic, cubic, Brent and bracketed
 *                                            Newton; LU, condition estimate, banded LU, QR and least squares
 *   predicates                               S3: orient2d, orient3d, incircle, insphere with exact signs
 *   basis                                    S4: knot vectors, span search, B-spline basis functions and derivatives
 *                                            (on cc-nurbs' A2.1–A2.3, which sits beside the engine as nurbs/)
 *   nurbsCurve                               S5: NURBS curves as checked records: evaluation, derivatives, curvature,
 *                                            knot insertion and removal, elevation, reduction, split, join, deviation
 *   nurbsSurface                             S6: NURBS surfaces as checked records: evaluation, derivatives, normals
 *                                            (poles by their limit), curvature, iso-curves, the operations per direction
 *   analyticCurve · analyticSurface          S7: lines, circles, ellipses; planes, cylinders, cones, spheres, tori,
 *                                            revolution and extrusion surfaces, with exact conversions to NURBS
 *   curve · surface                          S7: one interface for every curve and every surface, NURBS or analytic
 *   fit · construct                          S8: interpolation and approximation checked against their data;
 *                                            S9: compatibility, ruled, loft, Coons, grids, extrude and revolve
 *   query · bvh                              S10: closest points and inversion (global, by sampling, Newton and branch
 *                                            and bound), length, area, tight boxes; a bounding-volume hierarchy
 *   brep · names                             S11: the B-rep as immutable snapshots (stable ids, copy-on-write edits
 *                                            checked against the structural rules, adjacency); persistent names
 *   euler · build                            S12: the Euler operators; polygons, sweeps, polyhedra and sewing
 *   pcurve · prim · trim                     S13: an edge in its face's (u, v) space, exactly; the cylinder, cone, sphere and torus as
 *                                            solids with their seams and poles; the winding number and point-in-face
 *   SolidError · fail · isSolidError · toEnvelope · CODES · DEFAULT_TOL · makeTol · resolveTol · isTol
 *   makeBudget · resolveBudget · isBudget · makePrng
 */
export const VERSION = '0.0.16';

export * as errors from './core/errors.js';
export * as tol from './core/tol.js';
export * as limits from './core/limits.js';
export * as float from './core/float.js';
export * as trig from './core/trig.js';
export * as prng from './core/prng.js';
export * as intervals from './core/intervals.js';
export * as exact from './core/exact.js';
export * as vec3 from './math/vec3.js';
export * as mat4 from './math/mat4.js';
export * as frame from './math/frame.js';
export * as aabb from './math/aabb.js';
export * as quad from './math/quad.js';
export * as roots from './math/roots.js';
export * as linalg from './math/linalg.js';
export * as predicates from './math/predicates.js';
export * as basis from './geom/basis.js';
export * as nurbsCurve from './geom/nurbs-curve.js';
export * as nurbsSurface from './geom/nurbs-surface.js';
export * as analyticCurve from './geom/analytic-curve.js';
export * as analyticSurface from './geom/analytic-surface.js';
export * as curve from './geom/curve.js';
export * as surface from './geom/surface.js';
export * as fit from './geom/fit.js';
export * as construct from './geom/construct.js';
export * as query from './geom/query.js';
export * as bvh from './math/bvh.js';
export * as brep from './topo/brep.js';
export * as names from './topo/names.js';
export * as euler from './topo/euler.js';
export * as build from './topo/build.js';
export * as pcurve from './topo/pcurve.js';
export * as prim from './topo/prim.js';
export * as trim from './topo/trim.js';

export { SolidError, fail, isSolidError, toEnvelope, CODES } from './core/errors.js';
export { DEFAULT_TOL, makeTol, resolveTol, isTol } from './core/tol.js';
export { makeBudget, resolveBudget, isBudget } from './core/limits.js';
export { makePrng } from './core/prng.js';
