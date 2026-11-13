/* SPDX-License-Identifier: Apache-2.0 */
export const near = (d) => d < 1e-9; // expect: epsilon
export const t = 0.00001; // expect: epsilon
export const u = 2.5E-7; // expect: epsilon
export const v = 5e-3; // expect: epsilon
export const fine = [0.001, 1e3, 0.5, 10];
