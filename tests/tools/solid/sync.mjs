#!/usr/bin/env node
/* SPDX-License-Identifier: Apache-2.0 */
/**
 * sync.mjs — lib/solid (cc-solid, engine.solid) is canonical; each host app carries a byte-identical copy in its
 * dev/solid/ folder, beside dev/nurbs/ (the engine imports cc-nurbs by the relative path ../nurbs/). Run it after every
 * change to lib/solid (nobody edits a copy), and run tools/nurbs/sync.mjs first: a host must have its nurbs/ before it
 * can have solid/. Same idea as tools/nurbs/sync.mjs; the engine has sub-folders, so files are listed recursively.
 *
 *   node tools/solid/sync.mjs [--check] [target …]
 *   targets: partcraft, modelcraft, supercadcraft  (public_html/assets/apps/<app>/dev/solid/)
 *   --check   change nothing; exit 1 and list what differs
 *
 * As a module:
 *   LIB, TARGETS (name → folder), filesOf(dir) → sorted relative paths with "/" separators,
 *   syncTo(dir, { check, lib }) → { problem } | { changed: [path], stale: [path], files }
 *   (changed = missing or different in dir, stale = in dir but not in lib; both are fixed unless check is set)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const LIB = path.join(ROOT, 'lib/solid');
const APPS = path.join(ROOT, 'public_html/assets/apps');
export const TARGETS = {
  partcraft: path.join(APPS, 'partcraft/dev/solid'),
  modelcraft: path.join(APPS, 'modelcraft/dev/solid'),
  supercadcraft: path.join(APPS, 'supercadcraft/dev/solid'),
};

/** Every file under `dir`, as sorted relative paths with "/" separators. */
export function filesOf(dir) {
  const out = [];
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name), rel + e.name + '/');
      else if (e.isFile()) out.push(rel + e.name);
    }
  };
  walk(dir, '');
  return out.sort();
}

function pruneEmpty(root) {
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const sub = path.join(root, e.name);
    pruneEmpty(sub);
    if (fs.readdirSync(sub).length === 0) fs.rmdirSync(sub);
  }
}

export function syncTo(dir, { check = false, lib = LIB } = {}) {
  const target = path.resolve(dir), source = path.resolve(lib);
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) return { problem: `${source} is missing` };
  const want = filesOf(source);
  if (want.length === 0) return { problem: `${source} holds no files` };
  const rel = path.relative(source, target);
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return { problem: `${target} is the engine's own folder or inside it` };
  const beside = path.join(path.dirname(target), 'nurbs');
  if (!fs.existsSync(beside)) return { problem: `${beside} is missing: sync cc-nurbs first (node tools/nurbs/sync.mjs)` };
  const have = fs.existsSync(target) ? filesOf(target) : [];
  const same = (n) => {
    const dst = path.join(target, n);
    return fs.existsSync(dst) && Buffer.compare(fs.readFileSync(path.join(source, n)), fs.readFileSync(dst)) === 0;
  };
  const changed = want.filter((n) => !same(n));
  const stale = have.filter((n) => !want.includes(n));
  if (!check) {
    for (const n of changed) {
      fs.mkdirSync(path.dirname(path.join(target, n)), { recursive: true });
      fs.copyFileSync(path.join(source, n), path.join(target, n));
    }
    for (const n of stale) fs.unlinkSync(path.join(target, n));
    if (fs.existsSync(target)) pruneEmpty(target);
  }
  return { changed, stale, files: want.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const names = args.filter((a) => !a.startsWith('--'));
  let diff = 0, problems = 0;
  for (const name of names.length ? names : Object.keys(TARGETS)) {
    if (!TARGETS[name]) { console.error(name + ': not a target (' + Object.keys(TARGETS).join(', ') + ')'); problems++; continue; }
    const r = syncTo(TARGETS[name], { check });
    if (r.problem) { console.error(name + ': ' + r.problem); problems++; continue; }
    if (r.changed.length || r.stale.length) {
      diff++;
      console.log(name + ': ' + (check ? 'differs' : 'updated') + (r.changed.length ? ' — ' + r.changed.join(', ') : '') + (r.stale.length ? (check ? ' — stale: ' : ' — removed: ') + r.stale.join(', ') : ''));
    } else console.log(name + ': ok (' + r.files + ' files)');
  }
  process.exit(problems || (check && diff) ? 1 : 0);
}
