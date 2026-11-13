/* SPDX-License-Identifier: Apache-2.0 */
/** clean itself (only ** inside this comment, and Math.sqrt): what it imports is not */
import { angle } from './deep.js';
export const near = (y, x) => Math.sqrt(x * x + y * y) + angle(y, x);
