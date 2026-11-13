#!/usr/bin/env node
/* SPDX-License-Identifier: Apache-2.0 */
/**
 * sync-nurbs.mjs — engine.solid builds on cc-nurbs (decision D8) and never edits it in place. cc-nurbs is canonical in the
 * CadCraft site's lib/nurbs/; this repo carries a byte-identical copy in lib/nurbs/, beside lib/solid/, the way every host
 * app carries one (D-ccn2). tools/solid/pins.json records where the copy came from and the SHA-256 of every file, so an
 * edit in place fails the tests (`pins` section) instead of drifting quietly.
 *
 *   node tools/solid/sync-nurbs.mjs --check
 *        change nothing; exit 1 and list every file that differs from its pin, is missing, or is not pinned
 *   node tools/solid/sync-nurbs.mjs --from <canonical lib/nurbs> --source "<where it is from: version, commit>"
 *        replace lib/nurbs/ with the canonical folder's .js files and rewrite pins.json. Fixes go to the canonical copy
 *        first (D-ccn), then come here through this command; nobody edits lib/nurbs/ by hand.
 *   import { checkPins, PINS_FILE } from './sync-nurbs.mjs';  checkPins(libDir) → { ok, problems: [string], pins }
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PINS_FILE = path.join(HERE, 'pins.json');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const jsFiles = (dir) => fs.readdirSync(dir).filter((n) => n.endsWith('.js')).sort();

export function checkPins(libDir, pinsFile = PINS_FILE) {
  const pins = JSON.parse(fs.readFileSync(pinsFile, 'utf8'));
  const problems = [];
  for (const [folder, entry] of Object.entries(pins.folders)) {
    const dir = path.join(libDir, folder);
    if (!fs.existsSync(dir)) { problems.push(`${folder}/ is missing`); continue; }
    const have = new Set(jsFiles(dir));
    for (const [name, hash] of Object.entries(entry.files)) {
      if (!have.has(name)) { problems.push(`${folder}/${name} is missing`); continue; }
      have.delete(name);
      if (sha256(fs.readFileSync(path.join(dir, name))) !== hash) problems.push(`${folder}/${name} differs from its pin (edited in place?)`);
    }
    for (const name of have) problems.push(`${folder}/${name} is not pinned`);
  }
  return { ok: problems.length === 0, problems, pins };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const LIB = path.join(HERE, '../../lib');
  const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
  if (args.includes('--check')) {
    const r = checkPins(LIB);
    for (const p of r.problems) console.log(p);
    console.log(`pins: ${r.ok ? 'ok' : r.problems.length + ' problem' + (r.problems.length === 1 ? '' : 's')} (${Object.keys(r.pins.folders).join(', ')})`);
    process.exit(r.ok ? 0 : 1);
  }
  const from = opt('--from'), source = opt('--source');
  if (!from || !source) { console.log('usage: sync-nurbs.mjs --check | --from <canonical lib/nurbs> --source "<version, commit>"'); process.exit(2); }
  const dst = path.join(LIB, 'nurbs');
  fs.mkdirSync(dst, { recursive: true });
  for (const n of jsFiles(dst)) fs.unlinkSync(path.join(dst, n));
  const files = {};
  for (const n of jsFiles(from)) { const b = fs.readFileSync(path.join(from, n)); fs.writeFileSync(path.join(dst, n), b); files[n] = sha256(b); }
  const pins = { note: 'Written by tools/solid/sync-nurbs.mjs. Do not edit lib/nurbs/ by hand (D8, D-ccn).', folders: { nurbs: { library: 'cc-nurbs', licence: 'Apache-2.0', source, files } } };
  fs.writeFileSync(PINS_FILE, JSON.stringify(pins, null, 2) + '\n');
  console.log(`lib/nurbs: ${Object.keys(files).length} files from ${from}; pins.json written`);
}
