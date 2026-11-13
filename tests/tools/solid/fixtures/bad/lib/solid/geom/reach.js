/* SPDX-License-Identifier: Apache-2.0 */
import { near } from '../../nurbs/near.js'; // expect: reach
import { angle } from '../../nurbs/deep.js'; // solid-allow: reach — a fixture: an accepted import is not reported
export const r = near(1, 2) + angle(1, 2);
