/* SPDX-License-Identifier: Apache-2.0 */
import { b } from '../math/b.js';
import { curve } from '../../nurbs/curve.js';
import { basis } from '../../nurbs/basis.js';
import { geom } from '../../step/geom.js';
import { hyp, twice } from '../../nurbs/mixed.js';
import * as M from '../../nurbs/mixed.js';
// only exact functions are taken from a file that also holds inexact ones
export const c = b + curve + geom + basis(1) + hyp(3, 4) + M.length(3, 4) + twice(1);
