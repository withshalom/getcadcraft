/* SPDX-License-Identifier: Apache-2.0 */
// Math.sin(x), 2 ** 3 and Math[k] in a comment are only words
export const words = 'Math.cos(x) ** 2 and Math.pow';
export const tpl = (x) => `Math.exp(${x}) ** 2`;
export const keys = { Math: 1, sin: 2, pow: 3 };
export const members = (q) => q.Math.sin(1) + q.pow(2, 3) + q.exp;
export const allowed = (x) => Math.sqrt(x) + Math.abs(x) + Math.floor(x) + Math.ceil(x) + Math.round(x) + Math.trunc(x) +
  Math.sign(x) + Math.min(x, 1) + Math.max(x, 1) + Math.fround(x) + Math.clz32(x) + Math.imul(x, 3) + Math.PI + Math.E + Math.SQRT2;
export const product = (x) => x * x * x;
