/* SPDX-License-Identifier: Apache-2.0 */
const r = Math.random(); // expect: determinism
const d = Date.now(); // expect: determinism
const e = new Date(); // expect: determinism
export const det = [r, d, e];
