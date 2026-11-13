/* SPDX-License-Identifier: Apache-2.0 */
const m = await import('./ok.js'); // expect: dynamic bundler
const u = import.meta.url; // expect: dynamic
const fs = require('fs'); // expect: dynamic global
export const dyn = [m, u, fs];
