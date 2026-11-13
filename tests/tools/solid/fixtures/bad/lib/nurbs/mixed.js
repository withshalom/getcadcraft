/* SPDX-License-Identifier: Apache-2.0 */
// a cc-nurbs-like file with exact and inexact functions side by side: [reach] judges each function by what it reaches
const half = (x) => x ** 0.5;
export const hyp = (x, y) => Math.sqrt(x * x + y * y);
export const root = (x) => half(x);
export function turn(a) { return Math.cos(a); }
export function hidden(a) { const { sin } = Math; return sin(a); }
export function keyed(a) { return Math['tan'](a); }
export function wide(a) { return globalThis.Math.exp(a); }
export { hyp as length };
import * as D from './deep.js';
const { exact } = D;
export const twice = (x) => exact(x) + exact(x);
