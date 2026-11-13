/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * index.js — cc-solid, the NURBS-based solid kernel for PartCraft: its one public entry (docs/solid/HANDOFF.md § 4).
 * DOM-free, no network, no timers, no third-party code; it runs the same in a page, a Worker and Node.
 *
 * S1 holds the ground rules only: typed errors, the tolerance policy and budgets. Geometry and topology arrive one
 * session at a time; docs/solid/STATUS.md says what is built. Callers import this file as a namespace (cc-solid),
 * never a file inside it, so the layers behind it can change.
 *
 *   cc-solid.VERSION
 *   cc-solid.errors · cc-solid.tol · cc-solid.limits          the core modules, as namespaces
 *   cc-solid.SolidError · fail · isSolidError · toEnvelope · CODES
 *   cc-solid.DEFAULT_TOL · makeTol · resolveTol · isTol
 *   cc-solid.makeBudget · resolveBudget · isBudget
 */
export const VERSION = '0.0.1';

export * as errors from './core/errors.js';
export * as tol from './core/tol.js';
export * as limits from './core/limits.js';

export { SolidError, fail, isSolidError, toEnvelope, CODES } from './core/errors.js';
export { DEFAULT_TOL, makeTol, resolveTol, isTol } from './core/tol.js';
export { makeBudget, resolveBudget, isBudget } from './core/limits.js';
