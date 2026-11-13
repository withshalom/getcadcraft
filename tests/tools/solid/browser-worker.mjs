/* SPDX-License-Identifier: Apache-2.0 */
// browser-worker.mjs — the digest inside a module worker: cc-solid must compute the same bits off the main thread.
import * as P from '../../lib/solid/index.js';
import { digest } from './digest.mjs';
try { self.postMessage({ ok: true, result: digest(P) }); } catch (e) { self.postMessage({ ok: false, error: String(e && e.stack ? e.stack : e) }); }
