/* SPDX-License-Identifier: Apache-2.0 */
// The one file that may read the clock.
const p = globalThis.performance;
export const now = () => (p ? p.now() : 0);
