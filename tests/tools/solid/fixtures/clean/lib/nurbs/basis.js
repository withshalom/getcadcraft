/* SPDX-License-Identifier: Apache-2.0 */
/** a clean cc-nurbs-like file: ** and Math.atan2 only in comments; Math.sqrt is exact. "Math.sin" in a string. */
import { curve } from './curve.js';
export const basis = (x) => Math.sqrt(x * x) + curve + 'Math.sin'.length;
