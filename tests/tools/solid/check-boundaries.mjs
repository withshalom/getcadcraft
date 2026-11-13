#!/usr/bin/env node
/* SPDX-License-Identifier: Apache-2.0 */
/**
 * check-boundaries.mjs — cc-solid's architecture rules (S1; docs/solid/HANDOFF.md § 4.2, § 4.5, § 5.2, § 15), checked
 * over app/solid/. Read-only: it never changes a file.
 *
 *   node tools/solid/check-boundaries.mjs [<folder>]    the folder that holds solid/ (and nurbs/ and step/ when they sit
 *        beside it; default: lib/ in this checkout). Prints each problem; exit 1 if there is any.
 *   import { checkTree, RULES, LAYERS } from './check-boundaries.mjs';
 *   checkTree(dir) → { files, imports, problems: [{ file, line, rule, detail }] }   (file relative to dir, sorted)
 *
 * Rules (rule id in brackets). Everything is read from tokens (comments, strings, template literals and regular
 * expressions are skipped), except [bundler], which reads the raw text on purpose.
 *   [naming]       every name under solid/ is lower-case [a-z0-9-]; every file is .js
 *   [spdx]         every file starts with  /* SPDX-License-Identifier: Apache-2.0 *\/   (the licence of the suite's engines)
 *   [layer]        a file sits in a known layer folder, and imports only from its own layer or lower ones:
 *                  core ← math ← geom ← topo ← {ops, mesh, audit, measure} ← io ← api ← the entry files (index.js)
 *   [audit]        audit/ imports neither ops/ nor mesh/, so the referee cannot share a bug with what it judges
 *   [external]     an import that leaves solid/ goes to nurbs/ or step/ (cc-nurbs, cc-step; decision D8), and only
 *                  from geom or a higher layer; core and math stay self-contained
 *   [specifier]    import specifiers are single-quoted, relative, lower-case [a-z0-9-] names ending in .js — the only
 *                  form PartCraft's worker loader (exact-client.js blobModules) follows
 *   [missing]      the imported file exists
 *   [cycle]        no import cycles (blobModules refuses them); reported on every import of the cycle
 *   [bundler]      text that blobModules' pattern would read as an import (in a comment, say) must be a real import:
 *                  the loader reads raw text and would fetch it
 *   [dynamic]      no import(), import.meta or require()
 *   [global]       no browser, Node or timer globals (window, document, fetch, process, Buffer, setTimeout, console,
 *                  WebAssembly …, also through globalThis); core/limits.js may read performance, api/worker.js may use
 *                  self / postMessage / addEventListener
 *   [determinism]  no Math.random, no Date
 *   [eval]         no eval, no Function constructor
 *   [epsilon]      no tolerance-sized literal (a decimal below 0.001, or any literal with a negative exponent) outside
 *                  core/tol.js; a line that needs one says why in a comment holding  solid-allow: epsilon
 *   [trig]         (S2) no Math function the language leaves "implementation-approximated" (sin, cos, exp, log, pow, atan2,
 *                  hypot, cbrt …), no ** or **= (also approximated), and no Math as a value or Math[…] (which would hide
 *                  the call): those differ in the last bits between engines. core/trig.js computes them from + − × ÷ and √,
 *                  the same everywhere. Math.sqrt, abs, floor, min, max, fround, clz32, imul and the constants stay allowed.
 * A comment holding  solid-allow: global  lets one line use a forbidden global, with the reason in the comment.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LAYERS = Object.freeze(['core', 'math', 'geom', 'topo', ['ops', 'mesh', 'audit', 'measure'], 'io', 'api']);
export const RULES = Object.freeze(['naming', 'spdx', 'layer', 'audit', 'external', 'specifier', 'missing', 'cycle', 'bundler', 'dynamic', 'global', 'determinism', 'eval', 'epsilon', 'trig']);
export const EXTERNAL = Object.freeze({ folders: Object.freeze(['nurbs', 'step']), fromLayer: 'geom' });
export const FORBIDDEN_GLOBALS = Object.freeze([
  'window', 'self', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'indexedDB', 'caches',
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'importScripts', 'postMessage',
  'addEventListener', 'removeEventListener', 'dispatchEvent', 'alert', 'prompt', 'confirm', 'requestAnimationFrame',
  'process', 'require', 'module', 'exports', '__dirname', '__filename', 'Buffer', 'global',
  'setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval', 'clearImmediate',
  'performance', 'crypto', 'console', 'WebAssembly',
]);
export const ALLOWED_GLOBALS = Object.freeze({
  'solid/core/limits.js': Object.freeze(['performance']),
  'solid/api/worker.js': Object.freeze(['self', 'postMessage', 'addEventListener']),
});
export const SPDX = '/* SPDX-License-Identifier: Apache-2.0 */';
// ECMA-262 §21.3.2: the Math functions whose results are "implementation-approximated" (Math.sqrt is exact since ES2025)
export const APPROXIMATED = Object.freeze(['acos', 'acosh', 'asin', 'asinh', 'atan', 'atan2', 'atanh', 'cbrt', 'cos', 'cosh', 'exp', 'expm1',
  'hypot', 'log', 'log10', 'log1p', 'log2', 'pow', 'sin', 'sinh', 'tan', 'tanh']);
const EPSILON_FILE = 'solid/core/tol.js';
const SPECIFIER = /^\.\.?\/(?:\.\.\/)*(?:[a-z0-9-]+\/)*[a-z0-9-]+\.js$/;
// exact-client.js blobModules(): the pattern its loader runs over a module's raw text (comments included)
const BUNDLER = /(?:from|import)\s*\(?\s*'(\.\.?\/(?:(?:\.\.\/)*(?:[a-z0-9-]+\/)*)[a-z0-9-]+\.js)'/g;

const FORBIDDEN = new Set(FORBIDDEN_GLOBALS);
const INEXACT = new Set(APPROXIMATED);
const TIER = new Map();
LAYERS.forEach((l, i) => { for (const n of [].concat(l)) TIER.set(n, i); });
const TOP_TIER = LAYERS.length;   // files directly in solid/ (index.js): the public entry

// ---------------------------------------------------------------------------------------------------- tokens

const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const PUNCT = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.',
  '++', '--', '+=', '-=', '*=', '%=', '&=', '|=', '^=', '**', '<<', '>>'];
const ID_START = /[A-Za-z_$]/;
const ID_PART = /[A-Za-z0-9_$]/;
const NUMBER = /0[xX][0-9a-fA-F_]+n?|0[oO][0-7_]+n?|0[bB][01_]+n?|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?n?/y;

/**
 * JavaScript source → { tokens: [{ t: 'id' | 'num' | 'str' | 'tpl' | 're' | 'p', v, line, q? }], comments: Map(line → text) }.
 * Enough of the language for these rules: comments, strings, template literals with nested ${…}, regular-expression
 * literals told from division by the token before them, numbers (separators, hex, octal, binary, BigInt), identifiers
 * (private #names included) and punctuators.
 */
export function tokenize(src) {
  const tokens = [], comments = new Map();
  const note = (line, text) => comments.set(line, (comments.get(line) || '') + ' ' + text);
  const stack = [];   // '{' for a code brace, '${' for a template expression
  let i = 0, line = 1;
  const n = src.length;
  const push = (t, v, extra) => { const tok = { t, v, line, ...extra }; tokens.push(tok); return tok; };
  const last = () => tokens[tokens.length - 1];
  const regexAllowed = () => {
    const p = last();
    if (!p) return true;
    if (p.t === 'num' || p.t === 'str' || p.t === 'tpl' || p.t === 're') return false;
    if (p.t === 'id') return REGEX_AFTER_WORD.has(p.v);
    return !(p.v === ')' || p.v === ']' || p.v === '++' || p.v === '--');
  };
  // reads a template literal's text from i (just after ` or after the } closing a ${…}); returns true when it stopped at ${
  const templateText = () => {
    while (i < n) {
      const c = src[i];
      if (c === '\\') { if (src[i + 1] === '\n') line++; i += 2; continue; }
      if (c === '`') { i++; push('tpl', ''); return false; }
      if (c === '$' && src[i + 1] === '{') { i += 2; stack.push('${'); return true; }
      if (c === '\n') line++;
      i++;
    }
    return false;
  };
  if (src.startsWith('#!')) { while (i < n && src[i] !== '\n') i++; }
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === ' ' || c === '﻿') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') {
      const s = i;
      while (i < n && src[i] !== '\n') i++;
      note(line, src.slice(s, i));
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const s = i, l0 = line;
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
      i += 2;
      note(l0, src.slice(s, i));
      continue;
    }
    if (c === '\'' || c === '"') {
      const l0 = line;
      let s = i + 1, out = '';
      i++;
      while (i < n && src[i] !== c) {
        if (src[i] === '\\') { out += src.slice(s, i); if (src[i + 1] === '\n') line++; out += src[i + 1] || ''; i += 2; s = i; continue; }
        if (src[i] === '\n') break;   // an unterminated string: stop at the line end
        i++;
      }
      out += src.slice(s, i);
      i++;
      const tok = push('str', out, { q: c });
      tok.line = l0;
      continue;
    }
    if (c === '`') { i++; templateText(); continue; }
    if (c === '{') { stack.push('{'); push('p', '{'); i++; continue; }
    if (c === '}') {
      const top = stack.pop();
      i++;
      if (top === '${') { templateText(); continue; }
      push('p', '}');
      continue;
    }
    if (c === '/' && regexAllowed()) {
      const l0 = line;
      let inClass = false;
      i++;
      while (i < n) {
        const d = src[i];
        if (d === '\\') { i += 2; continue; }
        if (d === '\n') break;
        if (inClass) { if (d === ']') inClass = false; }
        else if (d === '[') inClass = true;
        else if (d === '/') break;
        i++;
      }
      i++;
      while (i < n && ID_PART.test(src[i])) i++;
      const tok = push('re', '');
      tok.line = l0;
      continue;
    }
    if ((c >= '0' && c <= '9') || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      NUMBER.lastIndex = i;
      const m = NUMBER.exec(src);
      const text = m ? m[0] : c;
      i += text.length;
      push('num', text);
      continue;
    }
    if (ID_START.test(c) || (c === '#' && ID_START.test(src[i + 1] || ''))) {
      const s = i;
      i++;
      while (i < n && ID_PART.test(src[i])) i++;
      push('id', src.slice(s, i));
      continue;
    }
    if (c === '\\' && src[i + 1] === 'u') {   // an identifier written with a \u escape: keep it as one unknown name
      const s = i;
      i += 2;
      while (i < n && (ID_PART.test(src[i]) || src[i] === '{' || src[i] === '}' || src[i] === '\\')) i++;
      push('id', src.slice(s, i));
      continue;
    }
    let p = null;
    if (c === '?' && src[i + 1] === '.' && !(src[i + 2] >= '0' && src[i + 2] <= '9')) p = '?.';
    else if (c === '/' && src[i + 1] === '=') p = '/=';
    else for (const q of PUNCT) if (src.startsWith(q, i)) { p = q; break; }
    if (p === null) p = c;
    i += p.length;
    push('p', p);
  }
  return { tokens, comments };
}

/** The value of a number token, or null when it is not a plain decimal (hex, octal, binary, BigInt). */
function decimalValue(text) {
  if (/^0[xXoObB]/.test(text) || text.endsWith('n')) return null;
  const v = Number(text.replace(/_/g, ''));
  return Number.isFinite(v) ? v : null;
}

// ---------------------------------------------------------------------------------------------------- files

function walk(dir, rel, out, problems) {
  let names;
  try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  names.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const d of names) {
    const r = rel + '/' + d.name;
    if (d.isDirectory()) {
      if (!/^[a-z0-9-]+$/.test(d.name)) problems.push({ file: r, line: 1, rule: 'naming', detail: 'folder names are lower-case [a-z0-9-]' });
      walk(path.join(dir, d.name), r, out, problems);
    } else if (!/^[a-z0-9-]+\.js$/.test(d.name)) {
      problems.push({ file: r, line: 1, rule: 'naming', detail: 'only lower-case [a-z0-9-] .js files belong in solid/ (documents go in docs/solid/)' });
    } else out.push(r);
  }
}

/** The layer tier of a file path relative to the app folder ('solid/geom/x.js' → 2), or null for an unknown folder. */
function tierOf(rel) {
  const parts = rel.split('/');
  if (parts[0] !== 'solid') return null;
  if (parts.length === 2) return TOP_TIER;
  return TIER.has(parts[1]) ? TIER.get(parts[1]) : null;
}
const layerName = (rel) => { const parts = rel.split('/'); return parts.length === 2 ? 'entry' : parts[1]; };

// ---------------------------------------------------------------------------------------------------- the check

/** Checks app/solid under `appDir` (the folder holding solid/, nurbs/ and step/). */
export function checkTree(appDir) {
  const problems = [];
  const root = path.join(appDir, 'solid');
  const files = [];
  if (!fs.existsSync(root)) return { files, imports: [], problems: [{ file: 'solid', line: 0, rule: 'missing', detail: 'no solid/ folder in ' + appDir }] };
  walk(root, 'solid', files, problems);
  const add = (file, line, rule, detail) => problems.push({ file, line, rule, detail });
  const imports = [];
  const graph = new Map();   // file → [{ to, line }] (cc-solid files only)

  for (const file of files) {
    const src = fs.readFileSync(path.join(appDir, file), 'utf8');
    const { tokens, comments } = tokenize(src);
    const allowed = (line, what) => (comments.get(line) || '').includes('solid-allow: ' + what);
    const tier = tierOf(file);

    if (!src.startsWith(SPDX)) add(file, 1, 'spdx', 'the first line must be ' + SPDX);
    if (tier === null) add(file, 1, 'layer', `"${file.split('/')[1]}" is not a layer (${LAYERS.flat().join(', ')})`);

    // ----- imports
    const specs = [];
    const real = new Set();
    for (let k = 0; k < tokens.length; k++) {
      const tk = tokens[k], prev = tokens[k - 1], next = tokens[k + 1];
      if (tk.t !== 'id' || (prev && prev.t === 'p' && (prev.v === '.' || prev.v === '?.'))) continue;
      if (tk.v === 'import' && next && next.t === 'p' && (next.v === '(' || next.v === '.')) { add(file, tk.line, 'dynamic', next.v === '(' ? 'import() is not allowed: imports are static' : 'import.meta is not allowed'); continue; }
      if (tk.v === 'require' && next && next.t === 'p' && next.v === '(') { add(file, tk.line, 'dynamic', 'require() is not allowed'); continue; }
      if ((tk.v === 'from' || tk.v === 'import') && next && next.t === 'str') specs.push({ spec: next.v, q: next.q, line: next.line });
    }
    const graphEdges = [];
    for (const s of specs) {
      imports.push({ file, line: s.line, spec: s.spec });
      if (s.q === '\'') real.add(s.spec);
      if (s.q !== '\'' || !SPECIFIER.test(s.spec)) { add(file, s.line, 'specifier', `'${s.spec}' must be a single-quoted relative path of lower-case [a-z0-9-] names ending in .js`); continue; }
      const target = path.relative(appDir, path.resolve(path.dirname(path.join(appDir, file)), s.spec)).split(path.sep).join('/');
      if (!fs.existsSync(path.join(appDir, target))) { add(file, s.line, 'missing', `'${s.spec}' → ${target} does not exist`); continue; }
      if (target.startsWith('solid/')) {
        const tt = tierOf(target);
        if (tier !== null && tt !== null) {
          if (tt > tier) add(file, s.line, 'layer', `${layerName(file)} may not import ${layerName(target)} (${target}): imports go to the same or a lower layer`);
          else if (layerName(file) === 'audit' && (layerName(target) === 'ops' || layerName(target) === 'mesh')) add(file, s.line, 'audit', `audit may not import ${layerName(target)} (${target})`);
        }
        graphEdges.push({ to: target, line: s.line });
      } else {
        const top = target.split('/')[0];
        if (!EXTERNAL.folders.includes(top)) add(file, s.line, 'external', `${target} is outside solid/; only ${EXTERNAL.folders.map((f) => f + '/').join(' and ')} may be imported`);
        else if (tier !== null && tier < TIER.get(EXTERNAL.fromLayer)) add(file, s.line, 'external', `${layerName(file)} may not import ${target}: ${EXTERNAL.folders.join(' and ')} are for ${EXTERNAL.fromLayer} and higher layers`);
      }
    }
    graph.set(file, graphEdges);

    // ----- what the worker loader would read in the raw text
    BUNDLER.lastIndex = 0;
    for (let m = BUNDLER.exec(src); m; m = BUNDLER.exec(src)) {
      if (real.has(m[1])) continue;
      const line = src.slice(0, m.index).split('\n').length;
      add(file, line, 'bundler', `PartCraft's worker loader would read '${m[1]}' here as an import (it reads comments too): reword it`);
    }

    // ----- globals, determinism, eval, epsilon
    for (let k = 0; k < tokens.length; k++) {
      const tk = tokens[k], prev = tokens[k - 1], next = tokens[k + 1];
      if (tk.t === 'num') {
        if (file === EPSILON_FILE || allowed(tk.line, 'epsilon')) continue;
        const v = decimalValue(tk.v);
        if (v !== null && ((v > 0 && v < 1e-3) || /e-/i.test(tk.v))) add(file, tk.line, 'epsilon', `${tk.v}: tolerances come from core/tol.js (or say solid-allow: epsilon on the line, with the reason)`);
        continue;
      }
      if (tk.t === 'p' && (tk.v === '**' || tk.v === '**=')) { add(file, tk.line, 'trig', `${tk.v} is implementation-approximated (it differs between engines): multiply, or use core/trig.js`); continue; }
      if (tk.t !== 'id') continue;
      const member = prev && prev.t === 'p' && (prev.v === '.' || prev.v === '?.');
      if (member) continue;
      const key = next && next.t === 'p' && next.v === ':' && prev && prev.t === 'p' && (prev.v === '{' || prev.v === ',');
      if (key) continue;
      const okHere = (name) => (ALLOWED_GLOBALS[file] || []).includes(name) || allowed(tk.line, 'global');
      if (tk.v === 'globalThis' && next && next.t === 'p') {
        const after = tokens[k + 2];
        if ((next.v === '.' || next.v === '?.') && after && after.t === 'id' && after.v === 'Math') add(file, tk.line, 'trig', 'globalThis.Math hides which Math functions are called: name Math directly (and see core/trig.js)');
        else if ((next.v === '.' || next.v === '?.') && after && after.t === 'id' && FORBIDDEN.has(after.v) && !okHere(after.v)) add(file, tk.line, 'global', `globalThis.${after.v} is not allowed in cc-solid`);
        else if (next.v === '[' && !okHere('globalThis[]')) add(file, tk.line, 'global', 'computed access on globalThis is not allowed');
        continue;
      }
      if (FORBIDDEN.has(tk.v)) { if (!okHere(tk.v)) add(file, tk.line, 'global', `${tk.v} is not allowed in cc-solid (DOM-free, network-free, timer-free, no WebAssembly)`); continue; }
      if (tk.v === 'Math') {
        const dot = next && next.t === 'p' && (next.v === '.' || next.v === '?.'), name = dot && tokens[k + 2] && tokens[k + 2].t === 'id' ? tokens[k + 2].v : null;
        if (name === 'random') add(file, tk.line, 'determinism', 'Math.random is not allowed: cc-solid is deterministic (tests use a seeded generator)');
        else if (name && INEXACT.has(name)) add(file, tk.line, 'trig', `Math.${name} differs between engines in the last bits: use core/trig.js, which gives the same bits everywhere`);
        else if (!dot) add(file, tk.line, 'trig', next && next.t === 'p' && next.v === '[' ? 'computed access on Math hides which function is called' : 'Math used as a value hides which functions are called');
        continue;
      }
      if (tk.v === 'Date') { add(file, tk.line, 'determinism', 'Date is not allowed: cc-solid is deterministic (budgets read their own clock)'); continue; }
      if (tk.v === 'eval') { add(file, tk.line, 'eval', 'eval is not allowed'); continue; }
      if (tk.v === 'Function' && ((next && next.t === 'p' && next.v === '(') || (prev && prev.t === 'id' && prev.v === 'new'))) add(file, tk.line, 'eval', 'the Function constructor is not allowed');
    }
  }

  // ----- import cycles (cc-solid files): report every import that is part of a cycle
  const index = new Map(), low = new Map(), onStack = new Set(), st = [];
  let counter = 0;
  const comps = [];
  const strong = (v) => {   // Tarjan's strongly connected components
    index.set(v, counter); low.set(v, counter); counter++;
    st.push(v); onStack.add(v);
    for (const { to } of graph.get(v) || []) {
      if (!graph.has(to)) continue;
      if (!index.has(to)) { strong(to); low.set(v, Math.min(low.get(v), low.get(to))); }
      else if (onStack.has(to)) low.set(v, Math.min(low.get(v), index.get(to)));
    }
    if (low.get(v) === index.get(v)) {
      const comp = [];
      let w;
      do { w = st.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
      comps.push(comp);
    }
  };
  for (const f of [...graph.keys()].sort()) if (!index.has(f)) strong(f);
  for (const comp of comps) {
    const inComp = new Set(comp);
    for (const f of comp) for (const { to, line } of graph.get(f)) {
      if (inComp.has(to) && (comp.length > 1 || to === f)) add(f, line, 'cycle', `import cycle: ${[...comp].sort().join(' ↔ ')}`);
    }
  }

  problems.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0)));
  return { files, imports, problems };
}

// ---------------------------------------------------------------------------------------------------- command line

function defaultApp() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [process.env.SOLID_LIB, path.join(here, '../../lib')];
  return candidates.find((d) => d && fs.existsSync(path.join(d, 'solid'))) || null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = process.argv[2] ? path.resolve(process.argv[2]) : defaultApp();
  if (!app) { console.log('check-boundaries: no folder with solid/ found (pass it as the first argument)'); process.exit(2); }
  const r = checkTree(app);
  for (const p of r.problems) console.log(`${p.file}:${p.line} [${p.rule}] ${p.detail}`);
  console.log(`cc-solid boundaries: ${r.files.length} files, ${r.imports.length} imports, ${r.problems.length} problem${r.problems.length === 1 ? '' : 's'} (${app})`);
  process.exit(r.problems.length ? 1 : 0);
}
