/* SPDX-License-Identifier: Apache-2.0 */
/**
 * worker-probe.mjs — started by test.mjs in a worker_threads Worker: imports cc-solid inside the worker, runs a budget
 * until it refuses, and posts what it saw back. This shows the kernel runs off the main thread as it is.
 */
import { parentPort, workerData } from 'node:worker_threads';

const P = await import(workerData.entry);
let refused = null;
try {
  const b = P.makeBudget({ maxIterations: 2 });
  for (;;) b.step();
} catch (e) {
  refused = P.toEnvelope(e);
}
parentPort.postMessage({ version: P.VERSION, codes: [...P.CODES], tol: P.DEFAULT_TOL, refused });
