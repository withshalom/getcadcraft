/* SPDX-License-Identifier: Apache-2.0 */
// a cc-nurbs-like file two imports away from solid/: atan2 differs between engines in the last bits
export const angle = (y, x) => Math.atan2(y, x);
