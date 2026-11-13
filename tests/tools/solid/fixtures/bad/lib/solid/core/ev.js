/* SPDX-License-Identifier: Apache-2.0 */
const a = eval('1'); // expect: eval
const f = new Function('return 1'); // expect: eval
const g = Function('return 2'); // expect: eval
export const ev = [a, f, g];
