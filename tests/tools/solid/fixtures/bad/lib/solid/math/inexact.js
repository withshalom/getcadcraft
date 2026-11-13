/* SPDX-License-Identifier: Apache-2.0 */
export const a = (x) => Math.sin(x) + Math.cos(x);                   // expect: trig
export const b = (x) => x ** 2;                                      // expect: trig
export function c(x) { let y = x; y **= 3; return y; }               // expect: trig
export const M = Math;                                               // expect: trig
export const d = (k, x) => Math[k](x);                               // expect: trig
export const e = (x) => globalThis.Math.atan2(x, 1);                 // expect: trig
export const f = (x) => Math.hypot(x, x) + Math?.pow(x, 3);          // expect: trig
export const { exp } = Math;                                         // expect: trig
export const g = (x) => Math.random() * x;                           // expect: determinism
export const ok = (x) => Math.sqrt(Math.abs(x)) + Math.floor(x) + Math.max(x, 1) + Math.fround(x) + Math.imul(x, 3) + Math.PI + Math.SQRT2;
