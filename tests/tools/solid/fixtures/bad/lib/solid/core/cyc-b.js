/* SPDX-License-Identifier: Apache-2.0 */
import { a } from './cyc-a.js'; // expect: cycle
export const b = 2 + a;
