/* SPDX-License-Identifier: Apache-2.0 */
import { read } from '../io/x.js';
// The one file that may talk to the worker host.
export function serve() { addEventListener('message', () => self.postMessage(read())); }
