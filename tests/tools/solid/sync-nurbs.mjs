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
 *        first (D-ccn), then come here through this command; nobody edits lib/nurbs/ by hand. Refused, with nothing
 *        changed, when <canonical> is missing, holds no .js files, or is the copy itself (or inside or around it).
 *   import { checkPins, PINS_FILE } from './sync-nurbs.mjs';  checkPins(libDir) → { ok, problems: [string], pins } (pinning no files is a problem)
 *   syncFrom(from, source, { libDir, pinsFile }) → { ok, files } | { ok: false, problem }
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
  if (!Object.values(pins.folders).some((entry) => Object.keys(entry.files).length > 0)) problems.push('pins.json pins no files');
  return { ok: problems.length === 0, problems, pins };
}

const inside = (child, parent) => { const rel = path.relative(parent, child); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); };

/**
 * Replace <libDir>/nurbs with the .js files of `from` and rewrite the pins. Everything is checked and read before
 * anything is deleted, so a refused or failed sync leaves the copy and its pins as they were.
 * → { ok: true, files: count } or { ok: false, problem: string }
 */
export function syncFrom(from, source, { libDir, pinsFile = PINS_FILE }) {
  if (typeof source !== 'string' || source.trim() === '') return { ok: false, problem: '--source is empty: say where the files are from (version, commit)' };
  if (typeof from !== 'string' || !fs.existsSync(from) || !fs.statSync(from).isDirectory()) return { ok: false, problem: `${from} is not a folder` };
  const dst = path.join(libDir, 'nurbs');
  fs.mkdirSync(dst, { recursive: true });
  const a = fs.realpathSync(from), b = fs.realpathSync(dst);
  if (inside(a, b) || inside(b, a)) return { ok: false, problem: `${from} is the copy itself, inside it or around it: --from is the canonical lib/nurbs, somewhere else` };
  const names = jsFiles(from);
  if (names.length === 0) return { ok: false, problem: `${from} holds no .js files` };
  const loaded = names.map((n) => [n, fs.readFileSync(path.join(from, n))]);   // all read before the first delete
  for (const n of jsFiles(dst)) fs.unlinkSync(path.join(dst, n));
  const files = {};
  for (const [n, buf] of loaded) { fs.writeFileSync(path.join(dst, n), buf); files[n] = sha256(buf); }
  const pins = { note: 'Written by tools/solid/sync-nurbs.mjs. Do not edit lib/nurbs/ by hand (D8, D-ccn).', folders: { nurbs: { library: 'cc-nurbs', licence: 'Apache-2.0', source: source.trim(), files } } };
  fs.writeFileSync(pinsFile, JSON.stringify(pins, null, 2) + '\n');
  return { ok: true, files: names.length };
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
  const r = syncFrom(from, source, { libDir: LIB });
  if (!r.ok) { console.log('refused, nothing changed: ' + r.problem); process.exit(1); }
  console.log(`lib/nurbs: ${r.files} files from ${from}; pins.json written`);
}
