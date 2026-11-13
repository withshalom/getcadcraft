/* SPDX-License-Identifier: Apache-2.0 */
import { near } from '../../nurbs/near.js'; // expect: reach
import * as D from '../../nurbs/deep.js'; // expect: reach
import { hyp, length } from '../../nurbs/mixed.js';
import { root } from '../../nurbs/mixed.js'; // expect: reach
import { turn as t } from '../../nurbs/mixed.js'; // expect: reach
import { hidden } from '../../nurbs/mixed.js'; // expect: reach
import { keyed } from '../../nurbs/mixed.js'; // expect: reach
import { wide } from '../../nurbs/mixed.js'; // expect: reach
import * as M from '../../nurbs/mixed.js'; // expect: reach
import * as M2 from '../../nurbs/mixed.js';
import { angle } from '../../nurbs/deep.js'; // solid-allow: reach is no waiver any more // expect: reach
export const r = near(1, 2) + D.angle(1, 2) + hyp(1, 2) + length(1, 2) + root(2) + t(1) + hidden(1) + keyed(1) + wide(1) + Object.keys(M).length + M2.hyp(1, 2) + angle(1, 2);
