/* SPDX-License-Identifier: Apache-2.0 */
import { a } from "./ok.js"; // expect: specifier
import { b as b2 } from './Ok.js'; // expect: specifier
import { readFileSync } from 'node:fs'; // expect: specifier
import { z as z2 } from './ok.mjs'; // expect: specifier
export const spec = [a, b2, readFileSync, z2];
