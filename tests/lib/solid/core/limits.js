/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * limits.js — cc-solid (S1, docs/solid/HANDOFF.md § 13.3): budgets. DOM-free; imports errors.js only.
 *
 * JavaScript cannot stop a running function from outside. So every cc-solid loop that can run long counts its work
 * against a Budget, and stops itself when the budget runs out with solid.err.limit { what, limit, used }. In a
 * Worker the host can also end the whole worker.
 *
 * Iteration and entity counts are exact and deterministic: the same input always stops at the same place. Time is the
 * one exception (a slower machine stops sooner), so it is reported as what: 'time', and it is off unless maxMs is given.
 * This is the only cc-solid file that reads a clock.
 *
 *   makeBudget({ maxIterations, maxEntities, maxMs, clock, checkEvery } = {}) → Budget
 *       maxIterations, maxEntities  whole numbers ≥ 0, or Infinity (the default: no limit)
 *       maxMs                        milliseconds > 0, or Infinity (the default: no deadline)
 *       clock                        () → milliseconds. Default: performance.now() where it exists; null means none.
 *                                    A finite maxMs with no clock is refused: solid.err.bad_input { name: 'clock' }.
 *       checkEvery                   counted steps between clock reads (default 1024; a whole number from 1 to 1e6)
 *   budget.step(n = 1)        counts n iterations; past maxIterations it throws { what: 'iterations', limit, used }.
 *                             It reads the clock after every `checkEvery` counted steps.
 *   budget.entities(n = 1)    counts n created entities (faces, edges, triangles …); past maxEntities it throws
 *                             { what: 'entities', limit, used }
 *   budget.checkTime()        reads the clock now; past the deadline it throws { what: 'time', limit, used } (ms)
 *   budget.used() → { iterations, entities, ms }
 *   budget.limits             { maxIterations, maxEntities, maxMs } as asked for (frozen)
 *   budget.child({ maxIterations, maxEntities, maxMs } = {}) → Budget
 *                             a budget for one part of the work. Its limits are the smaller of what is asked for and
 *                             what is left of this budget, its deadline is never later than this one's, and everything it
 *                             counts is counted here too. So a child can never let work run past its parent's limits.
 *   isBudget(b) · resolveBudget(b) → Budget   undefined or null → a new budget with no limits; a Budget → itself;
 *                             a plain object → makeBudget(b)
 * Bad arguments are refused with solid.err.bad_input { name, why }, where `why` is 'not_an_object' | 'unknown' |
 * 'not_a_count' | 'not_a_duration' | 'not_a_function' | 'missing' | 'not_a_number' | 'out_of_range'.
 */
import { fail } from './errors.js';

const KEYS = Object.freeze(['maxIterations', 'maxEntities', 'maxMs', 'clock', 'checkEvery']);
const CHILD_KEYS = Object.freeze(['maxIterations', 'maxEntities', 'maxMs']);
const CHECK_EVERY = 1024;
const MAX_CHECK_EVERY = 1000000;
const MADE = new WeakSet();
const DEADLINE = new WeakMap();   // budget → its absolute deadline on its clock (Infinity: none)

const isPlainObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const ms3 = (x) => Math.round(x * 1000) / 1000;

function count(name, v) {
  if (v === undefined || v === Infinity) return Infinity;
  if (!Number.isInteger(v) || v < 0) fail('solid.err.bad_input', { name, why: 'not_a_count' });
  return v;
}

function duration(name, v) {
  if (v === undefined || v === Infinity) return Infinity;
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) fail('solid.err.bad_input', { name, why: 'not_a_duration' });
  return v;
}

function defaultClock() {
  const p = globalThis.performance;
  return p && typeof p.now === 'function' ? () => p.now() : null;
}

function read(clock) {
  const t = clock();
  if (typeof t !== 'number' || !Number.isFinite(t)) fail('solid.err.bad_input', { name: 'clock', why: 'not_a_number' });
  return t;
}

function checkKeys(opts, allowed) {
  if (!isPlainObject(opts)) fail('solid.err.bad_input', { name: 'budget', why: 'not_an_object' });
  for (const k of Object.keys(opts)) if (!allowed.includes(k)) fail('solid.err.bad_input', { name: k, why: 'unknown' });
}

function create(limits, clock, checkEvery, parent) {
  let iterations = 0, entities = 0, sinceCheck = 0;
  const start = clock ? read(clock) : 0;
  const own = limits.maxMs === Infinity ? Infinity : start + limits.maxMs;
  const deadline = parent ? Math.min(own, DEADLINE.get(parent)) : own;

  function timeUp() {
    const now = read(clock);
    if (now > deadline) fail('solid.err.limit', { what: 'time', limit: ms3(deadline - start), used: ms3(now - start) });
  }

  function step(n = 1) {
    if (!Number.isInteger(n) || n < 0) fail('solid.err.bad_input', { name: 'n', why: 'not_a_count' });
    iterations += n;
    if (iterations > limits.maxIterations) fail('solid.err.limit', { what: 'iterations', limit: limits.maxIterations, used: iterations });
    if (parent) parent.step(n);
    if (deadline !== Infinity) {
      sinceCheck += n;
      if (sinceCheck >= checkEvery) { sinceCheck = 0; timeUp(); }
    }
  }

  function addEntities(n = 1) {
    if (!Number.isInteger(n) || n < 0) fail('solid.err.bad_input', { name: 'n', why: 'not_a_count' });
    entities += n;
    if (entities > limits.maxEntities) fail('solid.err.limit', { what: 'entities', limit: limits.maxEntities, used: entities });
    if (parent) parent.entities(n);
  }

  function checkTime() {
    if (deadline !== Infinity) timeUp();
  }

  function used() {
    return Object.freeze({ iterations, entities, ms: clock ? ms3(read(clock) - start) : 0 });
  }

  function child(opts = {}) {
    checkKeys(opts, CHILD_KEYS);
    const maxMs = duration('maxMs', opts.maxMs);
    if (maxMs !== Infinity && !clock) fail('solid.err.bad_input', { name: 'clock', why: 'missing' });
    const lim = {
      maxIterations: Math.min(count('maxIterations', opts.maxIterations), limits.maxIterations - iterations),
      maxEntities: Math.min(count('maxEntities', opts.maxEntities), limits.maxEntities - entities),
      maxMs,
    };
    return create(lim, clock, checkEvery, budget);
  }

  const budget = Object.freeze({ step, entities: addEntities, checkTime, used, child, limits: Object.freeze({ ...limits }) });
  MADE.add(budget);
  DEADLINE.set(budget, deadline);
  return budget;
}

export function makeBudget(opts = {}) {
  checkKeys(opts, KEYS);
  const limits = {
    maxIterations: count('maxIterations', opts.maxIterations),
    maxEntities: count('maxEntities', opts.maxEntities),
    maxMs: duration('maxMs', opts.maxMs),
  };
  const clock = opts.clock === undefined ? defaultClock() : opts.clock;
  if (clock !== null && typeof clock !== 'function') fail('solid.err.bad_input', { name: 'clock', why: 'not_a_function' });
  if (limits.maxMs !== Infinity && !clock) fail('solid.err.bad_input', { name: 'clock', why: 'missing' });
  const every = opts.checkEvery === undefined ? CHECK_EVERY : opts.checkEvery;
  if (!Number.isInteger(every) || every < 1 || every > MAX_CHECK_EVERY) fail('solid.err.bad_input', { name: 'checkEvery', why: 'out_of_range' });
  return create(limits, clock, every, null);
}

export const isBudget = (b) => b !== null && typeof b === 'object' && MADE.has(b);

export function resolveBudget(b) {
  if (b === undefined || b === null) return makeBudget();
  if (isBudget(b)) return b;
  return makeBudget(b);
}
