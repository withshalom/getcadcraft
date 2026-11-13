/* SPDX-License-Identifier: Apache-2.0 */
import { judge } from '../audit/check.js';
import { m } from '../mesh/m.js';
export const make = () => judge() + m;
