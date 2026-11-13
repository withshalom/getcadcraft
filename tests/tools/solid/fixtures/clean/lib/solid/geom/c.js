/* SPDX-License-Identifier: Apache-2.0 */
import { b } from '../math/b.js';
import { curve } from '../../nurbs/curve.js';
import { basis } from '../../nurbs/basis.js';
import { geom } from '../../step/geom.js';
export const c = b + curve + geom + basis(1);
