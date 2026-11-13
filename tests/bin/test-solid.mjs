#!/usr/bin/env node
/* SPDX-License-Identifier: Apache-2.0 */
/**
 * test-solid.mjs — engine.solid (cc-solid, lib/solid/; docs/solid/HANDOFF.md): runs tools/solid/test.mjs on lib/solid/, the
 * edited copy. Plain Node: no packages, no network, no browser. Same name and place as the site's bin/test-<name>.mjs, so the
 * engine can move into the site's lib/ with its tests unchanged.
 *
 *   node bin/test-solid.mjs [--verbose] [--only <section>]
 */
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r = spawnSync(process.execPath, [path.join(REPO, 'tools/solid/test.mjs'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, SOLID_LIB: path.join(REPO, 'lib') },
});
process.exit(r.status ?? 1);
