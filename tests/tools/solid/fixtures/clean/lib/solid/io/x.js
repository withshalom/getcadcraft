/* SPDX-License-Identifier: Apache-2.0 */
import { make } from '../ops/make.js';
import { geom } from '../../step/geom.js';
export const read = () => make() + geom;
