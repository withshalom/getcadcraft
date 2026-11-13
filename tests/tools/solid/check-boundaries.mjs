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
 *   [reach]        (S4) whatever solid/ takes from nurbs/ or step/ keeps the same exactness, followed to the end: no **,
 *                  no implementation-approximated Math function, no Math as a value or Math[…], no Math.random, no Date,
 *                  no import() or require(). Judged function by function: an import by name ({ a, b }, or N.a through
 *                  import * as N) reaches the top-level declarations those names mention, and what those mention, across
 *                  files. So the exact functions of a file can be imported while its inexact ones (cc-nurbs' arc, circle
 *                  and angle: decision D-det (b)) cannot; const { a } = N counts as N.a. A namespace passed on as a value,
 *                  an import for effect, or an export the reading cannot place counts as the whole file. Reported on the
 *                  solid/ import line. There is no waiver comment: the fix is to import less, or upstream (D-ccn).
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
export const RULES = Object.freeze(['naming', 'spdx', 'layer', 'audit', 'external', 'specifier', 'missing', 'cycle', 'bundler', 'dynamic', 'global', 'determinism', 'eval', 'epsilon', 'trig', 'reach']);
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
const OPENERS = new Set(['{', '(', '[']), CLOSERS = new Set(['}', ')', ']']);
const DECLARES = new Set(['const', 'let', 'var']);

/**
 * One module, read for [reach]: its top-level declarations ("chunks"), what each one uses that is not the same bits
 * everywhere, and which names each one mentions. A reading, not a parser: where it cannot tell, it errs towards "reaches"
 * (an unknown export means the whole file; code before the first declaration counts for every function of the file).
 * → { chunks: [{ names, uses, refs, members, nsValue }], local: name → chunk, exports: name → { local } | { from, name } |
 *     { whole }, named: id → { file, name }, spaces: id → file, imports: [{ line, file, names, ns, bare }], pre: uses,
 *     members: [[id, name]], nsValue: Set(id) } — files are app-relative, null when outside the app or inside solid/.
 */
export function analyse(appDir, rel) {
  const { tokens } = tokenize(fs.readFileSync(path.join(appDir, rel), 'utf8'));
  const target = (spec) => {
    if (!SPECIFIER.test(spec)) return null;
    const to = path.relative(appDir, path.resolve(path.dirname(path.join(appDir, rel)), spec)).split(path.sep).join('/');
    return !to.startsWith('..') && !to.startsWith('solid/') && fs.existsSync(path.join(appDir, to)) ? to : null;
  };
  const isP = (tk, v) => !!tk && tk.t === 'p' && tk.v === v;
  const isId = (tk, v) => !!tk && tk.t === 'id' && (v === undefined || tk.v === v);
  const afterDot = (k) => k > 0 && tokens[k - 1].t === 'p' && (tokens[k - 1].v === '.' || tokens[k - 1].v === '?.');

  // where top-level statements start
  const starts = [];
  let depth = 0;
  for (let k = 0; k < tokens.length; k++) {
    const tk = tokens[k], prev = tokens[k - 1], next = tokens[k + 1];
    if (tk.t === 'p' && OPENERS.has(tk.v)) { depth++; continue; }
    if (tk.t === 'p' && CLOSERS.has(tk.v)) { depth--; continue; }
    if (depth !== 0 || tk.t !== 'id' || afterDot(k)) continue;
    const led = isId(prev) && (prev.v === 'export' || prev.v === 'default' || prev.v === 'async');
    if (tk.v === 'export' || (tk.v === 'import' && !(isP(next, '(') || isP(next, '.')))) { starts.push(k); continue; }
    if (DECLARES.has(tk.v) && !led) { starts.push(k); continue; }
    const fn = tk.v === 'function' || tk.v === 'class' || (tk.v === 'async' && isId(next, 'function'));
    if (fn && !led && (!prev || isP(prev, ';') || isP(prev, '}') || prev.t === 'str')) starts.push(k);
  }

  const m = { chunks: [], local: new Map(), exports: new Map(), named: new Map(), spaces: new Map(), imports: [], pre: [], members: [], nsValue: new Set() };
  const usesIn = (from, to) => {
    const out = [];
    for (let k = from; k < to; k++) {
      const tk = tokens[k], next = tokens[k + 1];
      if (tk.t === 'p' && (tk.v === '**' || tk.v === '**=')) { out.push({ line: tk.line, what: tk.v }); continue; }
      if (tk.t !== 'id') continue;
      if (tk.v === 'Math') {                             // also globalThis.Math: any Math counts
        const name = next && next.t === 'p' && (next.v === '.' || next.v === '?.') && isId(tokens[k + 2]) ? tokens[k + 2].v : null;
        if (name === null) out.push({ line: tk.line, what: 'Math used as a value (hides which functions are called)' });
        else if (name === 'random' || INEXACT.has(name)) out.push({ line: tk.line, what: 'Math.' + name });
        continue;
      }
      if (afterDot(k)) continue;
      if ((tk.v === 'import' && (isP(next, '(') || isP(next, '.'))) || (tk.v === 'require' && isP(next, '('))) { out.push({ line: tk.line, what: tk.v === 'require' ? 'require()' : next.v === '(' ? 'import()' : 'import.meta' }); continue; }
      if (tk.v === 'Date') out.push({ line: tk.line, what: 'Date' });
    }
    return out;
  };
  m.pre = usesIn(0, starts.length ? starts[0] : tokens.length);

  // const { a, b: c } = N at j (N a namespace import) → the names taken from N: [a, b]; null when j is not that
  const taken = (j) => {
    if (!isP(tokens[j - 1], '=') || !isP(tokens[j - 2], '}')) return null;
    const after = tokens[j + 1];
    if (after && after.t === 'p' && after.v !== ';' && after.v !== ',') return null;
    const keys = [];
    let i = j - 3;
    for (; i >= 0 && !isP(tokens[i], '{'); i--) {
      const q = tokens[i];
      if (q.t === 'p' && q.v !== ',' && q.v !== ':') return null;          // nested patterns, defaults, rest: not read
      if (q.t === 'id' && !isP(tokens[i - 1], ':')) keys.push(q.v);
    }
    return i >= 0 ? keys : null;
  };

  // a clause { a, b as c } starting at the '{' at k → [[a, a], [b, c]] and the index after its '}'
  const clause = (k) => {
    const pairs = [];
    let j = k + 1;
    while (j < tokens.length && !isP(tokens[j], '}')) {
      if (tokens[j].t === 'id' || tokens[j].t === 'str') {
        const a = tokens[j].v;
        if (isId(tokens[j + 1], 'as') && tokens[j + 2]) { pairs.push([a, tokens[j + 2].v]); j += 3; continue; }
        pairs.push([a, a]);
      }
      j++;
    }
    return [pairs, j + 1];
  };

  for (let c = 0; c < starts.length; c++) {
    const s = starts[c], e = c + 1 < starts.length ? starts[c + 1] : tokens.length;
    const head = tokens[s];
    if (head.v === 'import') {
      let j = s + 1;
      const im = { line: head.line, file: null, names: [], ns: null, bare: false };
      const binds = [];
      while (j < e && tokens[j].t !== 'str') {
        const tk = tokens[j];
        if (isP(tk, '*') && isId(tokens[j + 1], 'as') && isId(tokens[j + 2])) { im.ns = tokens[j + 2].v; j += 3; continue; }
        if (isP(tk, '{')) { const [pairs, after] = clause(j); for (const [a, b2] of pairs) binds.push([b2, a]); j = after; continue; }
        if (tk.t === 'id' && tk.v !== 'from') binds.push([tk.v, 'default']);
        j++;
      }
      if (j < e) { im.file = target(tokens[j].v); im.line = tokens[j].line; }
      im.bare = binds.length === 0 && im.ns === null;
      for (const [id, name] of binds) { m.named.set(id, { file: im.file, name }); im.names.push(name); }
      if (im.ns !== null) m.spaces.set(im.ns, im.file);
      m.imports.push(im);
      continue;
    }
    let k = s, exported = false, isDefault = false;
    if (head.v === 'export') {
      exported = true; k++;
      if (isP(tokens[k], '{') || isP(tokens[k], '*')) {            // export { … } [from], export * [as ns] from
        let pairs = [], j = k, star = false, ns = null;
        if (isP(tokens[k], '{')) [pairs, j] = clause(k);
        else { star = true; j = k + 1; if (isId(tokens[j], 'as') && tokens[j + 1]) { ns = tokens[j + 1].v; j += 2; } }
        const src = isId(tokens[j], 'from') && tokens[j + 1] && tokens[j + 1].t === 'str' ? tokens[j + 1] : null;
        const file = src ? target(src.v) : null;
        if (src) m.imports.push({ line: src.line, file, names: pairs.map(([a]) => a), ns: null, bare: star });
        if (star && ns !== null) m.exports.set(ns, { whole: file });
        for (const [a, b2] of pairs) m.exports.set(b2, src ? { from: file, name: a } : { local: a });
        if (!star || ns !== null) continue;
        continue;                                        // export * from: its names are not listed, so asking for one reads the whole file
      }
      if (isId(tokens[k], 'default')) { isDefault = true; k++; }
    }
    const names = [];
    let t = tokens[k];
    if (isId(t, 'async')) { k++; t = tokens[k]; }
    if (isId(t, 'function') || isId(t, 'class')) {
      let j = k + 1;
      if (isP(tokens[j], '*')) j++;
      if (isId(tokens[j]) && tokens[j].v !== 'extends') names.push(tokens[j].v);
    } else if (t && t.t === 'id' && DECLARES.has(t.v)) {
      let d = 0, binding = true;
      for (let j = k + 1; j < e; j++) {
        const tk = tokens[j];
        if (binding) {
          if (tk.t === 'id') { names.push(tk.v); binding = false; continue; }
          if (isP(tk, '{') || isP(tk, '[')) {             // a pattern: every name inside it (more than are bound, never fewer)
            let dd = 0;
            for (; j < e; j++) { const q = tokens[j]; if (q.t === 'p' && OPENERS.has(q.v)) dd++; else if (q.t === 'p' && CLOSERS.has(q.v)) { dd--; if (dd === 0) break; } else if (q.t === 'id') names.push(q.v); }
            binding = false; continue;
          }
        }
        if (tk.t === 'p' && OPENERS.has(tk.v)) d++;
        else if (tk.t === 'p' && CLOSERS.has(tk.v)) d--;
        else if (d === 0 && isP(tk, ',')) binding = true;
      }
    }
    if (isDefault) names.push('default');
    const ch = { names, uses: usesIn(s, e), refs: new Set(), members: [], nsValue: new Set() };
    for (let j = k; j < e; j++) {
      const tk = tokens[j];
      if (tk.t !== 'id' || afterDot(j)) continue;
      ch.refs.add(tk.v);
      const dot = tokens[j + 1] && tokens[j + 1].t === 'p' && (tokens[j + 1].v === '.' || tokens[j + 1].v === '?.') && isId(tokens[j + 2]);
      const keys = m.spaces.has(tk.v) ? taken(j) : null;
      if (dot) ch.members.push([tk.v, tokens[j + 2].v]);
      else if (keys) for (const key of keys) ch.members.push([tk.v, key]);
      else ch.nsValue.add(tk.v);
    }
    const idx = m.chunks.length;
    m.chunks.push(ch);
    for (const nm of names) { if (!m.local.has(nm)) m.local.set(nm, idx); if (exported) m.exports.set(nm, { local: nm }); }
  }
  // the names a namespace import is asked for, anywhere in the file; and namespaces used whole (passed on, indexed)
  for (let j = 0; j < tokens.length; j++) {
    const tk = tokens[j];
    if (tk.t !== 'id' || afterDot(j) || !m.spaces.has(tk.v)) continue;
    if (isId(tokens[j - 1], 'as')) continue;             // its own declaration
    const dot = tokens[j + 1] && tokens[j + 1].t === 'p' && (tokens[j + 1].v === '.' || tokens[j + 1].v === '?.') && isId(tokens[j + 2]);
    const keys = taken(j);
    if (dot) m.members.push([tk.v, tokens[j + 2].v]);
    else if (keys) for (const key of keys) m.members.push([tk.v, key]);
    else m.nsValue.add(tk.v);
  }
  return m;
}

export function checkTree(appDir) {
  const problems = [];
  const root = path.join(appDir, 'solid');
  const files = [];
  if (!fs.existsSync(root)) return { files, imports: [], problems: [{ file: 'solid', line: 0, rule: 'missing', detail: 'no solid/ folder in ' + appDir }] };
  walk(root, 'solid', files, problems);
  const add = (file, line, rule, detail) => problems.push({ file, line, rule, detail });
  const imports = [];
  const graph = new Map();   // file → [{ to, line }] (cc-solid files only)
  const externals = [];      // [reach]: { file, line, target } for every import that leaves solid/ correctly

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
        else externals.push({ file, line: s.line, target });
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

  // ----- [reach]: what each import into nurbs/ or step/ can run, function by function, followed to the end
  const modules = new Map();
  const load = (rel) => {
    if (!modules.has(rel)) modules.set(rel, analyse(appDir, rel));
    return modules.get(rel);
  };
  for (const ex of externals) {
    const from = load(ex.file);
    const stmts = from.imports.filter((im) => im.line === ex.line && im.file === ex.target);
    const seenChunks = new Set(), touched = new Set(), hits = [];
    const queue = [];
    const visit = (file, k) => { const key = file + '#' + k; if (!seenChunks.has(key)) { seenChunks.add(key); touched.add(file); queue.push([file, k]); } };
    const whole = (file) => { const m = load(file); touched.add(file); m.chunks.forEach((_, k) => visit(file, k)); };
    const resolve = (file, name, guard = new Set()) => {
      if (file === null) return;
      const key = file + ':' + name;
      if (guard.has(key)) return;
      guard.add(key);
      const m = load(file), e = m.exports.get(name);
      if (e && e.local !== undefined) { if (m.local.has(e.local)) visit(file, m.local.get(e.local)); else if (m.named.has(e.local)) resolve(m.named.get(e.local).file, m.named.get(e.local).name, guard); else whole(file); return; }
      if (e && e.whole !== undefined) { if (e.whole !== null) whole(e.whole); return; }
      if (e) { resolve(e.from, e.name, guard); return; }
      whole(file);                                       // not an export this reading understands (or export *): the whole file
    };
    let names = [], everything = stmts.length === 0;
    for (const st of stmts) {
      if (st.bare) everything = true;
      names.push(...st.names);
      if (st.ns !== null) { if (from.nsValue.has(st.ns)) everything = true; for (const [x, y] of from.members) if (x === st.ns) names.push(y); }
    }
    names = [...new Set(names)];
    if (everything) whole(ex.target); else for (const nm of names) resolve(ex.target, nm);
    while (queue.length) {
      const [file, k] = queue.shift(), m = load(file), ch = m.chunks[k];
      for (const u of ch.uses) hits.push(`${file}:${u.line} ${u.what}`);
      for (const id of ch.refs) {
        if (m.local.has(id)) visit(file, m.local.get(id));
        else if (m.named.has(id)) resolve(m.named.get(id).file, m.named.get(id).name);
        else if (m.spaces.has(id) && ch.nsValue.has(id) && m.spaces.get(id) !== null) whole(m.spaces.get(id));
      }
      for (const [x, y] of ch.members) if (m.spaces.has(x) && !m.local.has(x)) resolve(m.spaces.get(x), y);
    }
    for (const file of touched) for (const u of load(file).pre) hits.push(`${file}:${u.line} ${u.what}`);
    if (hits.length) {
      hits.sort();
      const what = everything ? 'the whole file' : names.join(', ');
      add(ex.file, ex.line, 'reach', `${ex.target} (${what}) reaches ${hits.length} use${hits.length === 1 ? '' : 's'} in ${touched.size} file${touched.size === 1 ? '' : 's'} that are not the same bits everywhere (first: ${hits.slice(0, 3).join(', ')}); import by name only the functions that stay exact, or fix it upstream (D-ccn)`);
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
