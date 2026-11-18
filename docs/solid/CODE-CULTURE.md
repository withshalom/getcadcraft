# CadCraft code culture

How CadCraft code is built and named, so that engine.solid reads like the rest of the studio's work. It was written by
reading the code, not by guessing: the numbers below were counted on 2026-11-17 over `app/*.js` (244 files, about 69,000
lines), `tests/lib/nurbs/` and `tests/lib/field/`, and the repository's own `CONTRIBUTING.md`, `BUILDING.md`,
`TRADEMARKS.md`, `PROVENANCE.md` and pull request template.

Each rule says where it comes from:

- **Observed**: the code does this, counted or read.
- **Written**: a contributing or building document says so.
- **Engine**: engine.solid's own choice, made for a reason given here.

Ideas from the owner's earlier work are inspiration for how to solve the 3D problem. No names and no code from that work
live in this codebase, and this document is the reference instead: when two ways to name or lay out something are
possible, pick the one the CadCraft code already uses.

## 1. The theme

**Plain and exact.** The code and its words say what a thing is and what it does, in the fewest plain words, and they
say what is not built or not proven (`not built yet`, `preview only`, `Spec gap: …`). Nothing is promised that a test
does not check. (Observed: file headers, `PROVENANCE.md`; Written: `CONTRIBUTING.md`.)

**The Craft family.** The apps are named for their work, with the suffix `Craft`: CadCraft, BimCraft, ModelCraft,
MarkupCraft, TakeoffCraft, CivilCraft, DetailCraft, PartCraft, and the desktop shell CadCraft Studio and SuperCad Studio.
(Written: `TRADEMARKS.md`.) New names follow it: a short word for the work, then `Craft`.

**Engines.** Shared libraries that every app can host are *engines*: id `engine.<name>`, library `cc-<name>`, folder
`lib/<name>/`, error codes `<name>.err.*`, error class `<Name>Error`. Today: `engine.nurbs` (cc-nurbs, `nurbs.err.*`,
`NurbsError`), `engine.field` (cc-field, `FieldError`), and `engine.solid` (cc-solid, `solid.err.*`, `SolidError`); also
cc-step, cc-acis, cc-dwg and others. (Observed: `tests/lib/*`; Written: the engine pages on getcadcraft.com.)

**Other products' names** appear only to say what a format or workflow is compatible with, in plain text, never in a
title, heading, product name or identifier. (Written: `CONTRIBUTING.md`, `TRADEMARKS.md`.)

**Commands** are short upper-case words in the drafting tradition: `ALIGN`, `SPLINE`, `PEDIT`, `XCLIP`. (Observed:
`app/commands.js`, `app/*-cmd.js`.) The command's words for people are language keys, never literals in the code.

## 2. Architecture

### 2.1 The repository

| Path | What | Source |
|---|---|---|
| `app/` | the app: plain ES modules, `ui.inc`, `settings.inc`, `manifest.json`, `help/`, `lang/` | Written (`BUILDING.md`) |
| `devshell/` | local server, page renderer, edition packer, library versions | Written |
| `tests/bin/` | the runners: `test-<name>.mjs`, run by `npm test` | Observed |
| `tests/lib/<name>/` | an engine's canonical copy | Observed |
| `tests/tools/<name>/` | that engine's tools and tests: `sync.mjs`, `test*.mjs`, fixtures | Observed |
| `fixtures/` | the files tests use, made for testing | Written |
| `docs/<name>/` | an engine's documents | Engine |

There is nothing to compile and no package for the app: Node 20.19 or newer, and a browser. A library comes only from
the versioned folders listed in `THIRD_PARTY.md`. No CDN, no tracking, no network call the user did not ask for.
(Written: `BUILDING.md`, `CONTRIBUTING.md`.)

### 2.2 Modules

- **Plain ES modules, relative imports** (`'./geom.js'`), static only. (Observed: all of `app/`.)
- **Named exports.** 1,917 export lines, 4 default. Use `export function`, `export const`, `export class`. (Observed.)
- **No DOM in the logic.** The 62 modules that say it begin `No DOM: bin/test-<name>.mjs runs it in Node.` The DOM, the
  host and the panels are separate modules, so the logic is tested in Node. (Observed.)
- **One concern a file, and the suffix says its role:**
  `-cmd.js` registers commands (25 files) · `-ui.js` panels and dialogs (16) · `-file.js` reading and writing files
  (3) · `-cad.js` CadCraft's side of a shared library, as far as the names show (`cloud-cad.js`, `laser-cad.js`; 5 files, inferred) · `-core.js` the shared part (2) ·
  `-shared.js`, `-client.js`, `-three.js` likewise. A command module and its logic module share a stem:
  `align.js` and `align-ui.js`. (Observed.)
- **The host seam.** Logic asks its host for what it needs (`print`, `prompt`, `preview`, `openFile`, …) through an
  object the app supplies and a stub supplies in tests. Logic never reaches for the page. (Observed: `commands.js`.)
- **Plain data.** Entities, curves and surfaces are plain objects (`{ type: 'hatch', loops, … }`,
  `{ deg, knots, cvs, w }`). An operation returns a new value and changes nothing in place. (Observed: `app/hatch.js`,
  `lib/nurbs/curve.js` header: "Every operation returns a new curve; nothing is changed in place".)

### 2.3 Engines

- **One canonical copy** in `lib/<name>/`. Each host carries a **byte-identical copy**, made by `tools/<name>/sync.mjs`
  and checked with `--check`. A host never edits its copy. (Observed: `tools/nurbs`, `tools/field`; Engine: cc-solid.)
- **One public entry**, `index.js`, which re-exports the names a caller may use. Callers do not import a file behind it.
  (Observed: `lib/field/index.js`.)
- **Standalone.** An engine imports only its own files and the engines below it, never app code. (Observed.)
- **DOM-free and offline.** The same results in a page, a worker and Node. (Written: engine pages.)

### 2.4 Errors

- An error carries a **code and details**, and no English: `new NurbsError('nurbs.err.degree', { max })`.
  The code is the language key the app words it with; `vars` fill the `{placeholders}`. (Observed:
  `lib/nurbs/curve.js`; Engine: `SolidError(code, vars)`.)
- Codes are `<lib>.err.<snake_case>`.
- An engine file that carries no words starts with `/* i18n-ignore-file: … */`. (across `app/` and cc-nurbs, 30 files write it with an em dash and 17 with a colon; engine.solid uses the colon, as cc-nurbs does.)
- An engine **refuses rather than returns a quiet wrong answer**; an app module may return `null` for "cannot". (Observed
  in both; Engine: the refusal is the rule for cc-solid.)

### 2.5 Words people read

Every word a person reads goes through the language files: `t('key')` in JavaScript, `Lang::e('key')` in `ui.inc`, the
text in `app/lang/en.json` (8,232 keys). Plain text, sentence case. (Written: `CONTRIBUTING.md`.)

- Keys are `<area>.<thing>[.<detail>]`, lower case, dots between parts, underscores inside a part:
  `props.err.int`, `cmd.snapword.of`, `param.value_cannot_driven_equation`. (Observed.)
- Fills are `{name}`: `"{n} MB in one value"`. Plurals follow CLDR (`one`, `other`, …). (Observed; Written.)
- A module's keys share its area: `hatch.pat.<name>`, `units.area.imperial`, `xclip.vertex`. (Observed.)

### 2.6 Tests

- Runners are `tests/bin/test-<name>.mjs` (a shebang, the SPDX line, a header that lists what is covered, and
  `--verbose` and `--only`), and every one runs under `npm test`. (Observed.)
- A test states what it claims in one sentence, and the claim is the check. Tests use only files in `fixtures/` or data
  they generate; randomness comes from a seeded generator whose seed is printed on a failure. (Written; Engine.)
- A change comes with a test for what changed. (Written: the pull request template.)

### 2.7 Provenance and licence

- **Line 1 of every file is the SPDX line, `Apache-2.0`**: all 244 app files and every cc-nurbs and cc-field file. Of the
  272 JavaScript files 0.10 added, 216 write it as `/* … */` and 55 as `// …`; engine.solid keeps the block form. A file that follows another project's published algorithm closely names both licences there, and
  `THIRD_PARTY.md` credits it. (Observed; Written.)
- Nothing is copied from proprietary CAD software, its SDKs or file-format libraries, or ported from GPL, LGPL or MPL
  code. Readers are written from published specifications; other implementations are black boxes in tests only. Where the
  specification is silent, the answer found by experiment is written down as `Spec gap: …`. (Written: `PROVENANCE.md`.)
- Algorithms are cited by book and number: `The NURBS Book, A2.2`. (Observed: `lib/nurbs`; Engine: `PROVENANCE.md` row
  per file.)

## 3. Naming

| Thing | Rule | Examples |
|---|---|---|
| Files | lower-case, hyphens, `.js` (`.mjs` for scripts and tests) | `hatch-assoc.js`, `test-cadcraft-props.mjs` |
| Folders | lower-case, one word where it can be | `lib/nurbs`, `tests/tools/solid` |
| Functions | `camelCase`, a verb for an action, a noun for a value | `alignMatrix`, `hatchLines`, `pointAt`, `fitSpline` |
| Conversions | `to<X>`, `from<X>`, `<x>To<Y>` | `toNurbs`, `fromData`, `toUcs`, `vecToWorld` |
| Tests of a state | `is<X>`, `has<X>` | `isClosed`, `isRational`, `validBounds` |
| Classes | `PascalCase`, errors end in `Error` | `Doc`, `Grid`, `FieldError`, `NurbsError` |
| Constants | `UPPER_SNAKE`, frozen when they are tables | `SIDES`, `PATTERNS`, `MAX_SOLIDS`, `LUNITS` |
| Helpers kept inside a file | not exported, short, lower-case | `clampU`, `finite3` |
| Options | one object, last; a tolerance as `tol` | `points(e, { tol })`, `alignMoves(doc, ids, { side, to })` |
| Accuracy targets | `eps` is an algorithm's own numerical accuracy target (integration, root finding); `tol` is the geometric Tolerance record. Both may appear in one options object | `length(c, { eps, tol })` (engine.solid) |
| Matrices | an `m` prefix in the app's geometry, row-major 4×4 in the engines | `mMul`, `mTranslate`; `m[3], m[7], m[11]` |
| Language keys | `<area>.<thing>[.<detail>]` | `props.err.int` |
| Error codes | `<lib>.err.<snake_case>` | `nurbs.err.knots_order`, `solid.err.bad_input` |
| Engine ids | `engine.<name>`; library `cc-<name>` | `engine.solid`, `cc-solid` |
| Commands | upper-case words | `ALIGN`, `SPLINEDIT` |

**Units and shapes.** The drafting app keeps points as `{ x, y }` in drawing units and takes typed angles in
degrees and keeps them in radians (a hatch's `pangle`). The engines keep points as `[x, y, z]` and angles in radians; engine.solid works in
millimetres, right-handed, Z up, and the app converts at the boundary. (Observed: `app/geom.js`, `lib/nurbs`; Engine.)

## 4. Code style

- Two-space indent, no tabs (none in `app/`), single-quoted strings (none double-quoted in the sampled files),
  semicolons, `const` by default. (Observed.)
- Lines are not capped by a tool: 13% of `app/` lines pass 120 columns. Keep to 120 where it costs nothing; engine.solid's
  files are at 10%. (Observed; Engine.)
- A **file header** is the documentation: the file name and what it is for, whether it is DOM-free, where its tests are,
  then the API, one line each, with `→` for what comes back (212 of 244 app files). Write it as you would explain it to
  the next person who opens the file. (Observed.)
- Comments say **why** or cite the source; the code says what. A track or session tag in brackets, such as
  `(0.7 D7.10)`, says when a piece arrived. (Observed.)
- Words in comments, messages and documents: plain text, sentence case, no hype, no emoji, one claim per sentence.

## 5. How engine.solid follows this, and where it differs on purpose

| | engine.solid | Why |
|---|---|---|
| SPDX line, Apache-2.0, provenance row per file | follows | Written |
| Kebab-case files, named exports, one `index.js`, no default exports | follows | Observed |
| `SolidError(code, vars)`, codes `solid.err.*`, no English text | follows cc-nurbs | Observed |
| `tests/lib/solid`, `tests/tools/solid`, `tests/bin/test-solid.mjs`, `tools/solid/sync.mjs` | follows | Observed |
| Header with the API, `→` for results | follows | Observed |
| Points as `[x, y, z]`, matrices row-major, same shapes as cc-nurbs | follows cc-nurbs | values pass between them unchanged |
| Records frozen, every input checked, a typed refusal instead of `null` | differs | a solid kernel must not return a quiet wrong body |
| Elementary functions of its own (`core/trig.js`), `Math.sin` and `**` refused by a checker rule | differs | the same bits in every engine |
| An import-boundary checker (`check-boundaries.mjs`, 16 rules) | differs | a kernel grows for 40 sessions; a rule that fails the build is the one that lasts |
| Every number is tested against an exact reference | differs | the engine's claim is exactness |

## 6. What 0.10 added to the pattern

Read on 2026-11-17, after the merge: 272 new JavaScript files in `app/` and `tests/lib/`, among them the new engines
`classify`, `modelaudit`, `sweptpath`, `lod` and `quantities`. They keep every rule above and show seven habits more
clearly.

1. **The header says where the work came from.** 81 carry a track tag such as `(0.10 BK.94)`, 85 name their session
   (`session bk-content-10`), and some name the decision (`owner decision 2026-11-11`). engine.solid's equivalent is
   `(S13, docs/solid/HANDOFF.md § 8.5)`: a session and a plan section.
2. **`host-free` is the newer word for `No DOM`** (189 of 272 say one or the other). A shared module also says who carries
   its copy; 44 write the same sentence: `<App> carries a byte-identical copy in <app>/dev/<lib>/ (tools/<lib>/sync.mjs)`.
3. **Data, never code.** Tables, limits and formats are data: a frozen constant (`PACK_LIMITS`, `INTERFACE_LIMITS`), a
   self-describing format `{ format: 'cadcraft-<thing>', version: 1, … }` named by a constant (`PACK_FORMAT`), and a
   reader (`readPack`, `readDefaults`) that cleans what it takes and refuses what it cannot use. A limit says when it is
   a starting value and not a standard.
4. **Two ways to fail, by who is asking.** Code that reads what people or files hand it returns a result,
   `{ ok: false, error: 'many' }`, with a short lower-case word (34 new files). Geometry engines throw a coded error
   (25 files throw, 6 define an error class), as cc-nurbs does. engine.solid is a geometry engine and throws; what it
   reads from a file (STEP, S28 on) is input, and should return the result form first.
5. **Audits advise.** A rule set returns findings in the shared Problems shape and blocks nothing:
   `{ code, severity: 'warning' | 'note', msg: { key, vars }, text, about: [{ kind, id, label }], source: { name } }`,
   inside `{ problems, summary: [{ set, checked, found }] }`, capped, and every finding can be accepted with a reason.
   The auditor (S14) uses this shape for its findings; the engine's refusals stay refusals.
6. **A host-free library carries its own English and takes a translator.** `words(key, vars)` holds the sentences and a
   host passes `t` to replace them (`auditProblems(input, { t })`); the file says so in an `i18n-ignore-file` or an
   `i18n-ignore-start … i18n-ignore-end` note that always gives its reason (68 files). engine.solid has no words at all,
   which is the cleaner case.
7. **Small, dense and forgiving.** Modules are short (`sweptpath/geom.js` is 91 lines; an `index.js` is a handful of
   `export` lines), names are short (`inPoly`, `segsCross`, `distPointSeg`, `polyArea`), a line averages 66 columns
   (engine.solid 53), and `?.` and `??` are everywhere (24 per 1,000 lines). Checks on people's input are soft where a
   refusal would get in the way (`codeLooksRight`: "a code is never refused for its shape"); an engine that builds solids
   is where the strict ones belong.

A short comment that says *why* sits at the end of the line it explains (`// a pack says where its table comes from`); a
section is a divider of dashes and a word (`// ---- packs`); a function that does one thing has one sentence above it, with
an example in it.

## 7. A new file, checked

1. Line 1 is the SPDX line, line 2 the `i18n-ignore-file` note if the file holds no words.
2. A header says what the file is, what it imports from, and lists its API with `→`.
3. The name is lower-case with hyphens; its role is in the suffix if it has one.
4. Exports are named; helpers stay inside.
5. Failures throw `SolidError` with a `solid.err.*` code and plain `vars`.
6. A test claims what it does, in a sentence, and the file's row in `PROVENANCE.md` says where it comes from.
7. No other product's name appears in a title, heading, product name or identifier.
