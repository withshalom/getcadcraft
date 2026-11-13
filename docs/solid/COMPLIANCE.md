# engine.solid — compliance

Every rule engine.solid has to meet, where the rule comes from, and the evidence that it is met. A rule marked
**enforced** has an automatic check in `node bin/test-solid.mjs` that fails the build when it is broken. **Checked**
means a test or a review step covers it. **Owner** means the step is the owner's to take.

## 1. The suite's engine conventions

Source: getcadcraft.com › Build an add-on › Engines and the engine pages (`engine.nurbs`, `engine.field`); the add-on
loader in PartCraft's `app/addons.js`.

| Rule | How engine.solid meets it | Evidence | Status |
|---|---|---|---|
| Our own code, Apache-2.0 | every file starts with `/* SPDX-License-Identifier: Apache-2.0 */` | checker rule `spdx` | enforced |
| DOM-free JavaScript | no `window`, `document`, `navigator`, storage or DOM events | checker rule `global` (42 names, also through `globalThis`) | enforced |
| Runs in workers | no main-thread-only API | `worker` test: the engine runs unchanged in a worker thread | enforced |
| Shared by every app and SuperCad Studio | one edited copy; hosts carry byte-identical copies as `solid/` | `ARCHITECTURE.md` §7; a sync script with `--check` comes with the first host | checked (sync script: with the first host) |
| Id `engine.<name>`; add-ons name it in `needs` | `engine.solid`; folder `solid/` fits the loader's `engine:<name>/<path>` pattern `[a-z][a-z0-9-]{0,40}` | `ENGINE.md` | checked |
| A catalogue page: what it computes, methods and standards, limits, hosts, licence, status | drafted | `ENGINE.md` | owner publishes |
| Version | `VERSION` in `index.js` | `entry` test: x.y.z | enforced |

## 2. Add-on review rules that apply to an engine

Source: getcadcraft.com › Build an add-on › Upload and review.

| Rule | How it is met | Evidence | Status |
|---|---|---|---|
| Loads nothing from outside its own folder | static imports only, all relative, and only into `solid/`, `nurbs/` or `step/` | checker rules `dynamic`, `external`, `specifier`, `missing` | enforced |
| Talks to no server | no `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, workers or `importScripts` | checker rule `global` | enforced |
| A licence the suite can sign | Apache-2.0 | rule `spdx` | enforced |
| Package size: at most 200 files, 5 MB unpacked | 16 files, about 115 KB (S3) | measured at each session close | checked |
| A published version never changes | each session commits a new version; nothing is rewritten | git history on `engine/solid` | checked |

## 3. The suite's library practice

| Rule | How it is met | Evidence | Status |
|---|---|---|---|
| Canonical `lib/<name>/`, copied byte for byte, `--check` fails on drift | `lib/solid/` is the edited copy; the layout matches the site's (`lib/`, `tools/<name>/`, `bin/test-<name>.mjs`) | `ARCHITECTURE.md` §7 | checked |
| Header in each file: SPDX; i18n-ignore with its reason; what the file is (session, plan section); what it imports; an API list | every file in `lib/solid/` | review; `spdx` rule for the first line | checked |
| `index.js` says where the edited copy lives and how hosts get it | yes | `lib/solid/index.js` header | checked |
| Words through language tables only | no English text in the engine; errors are `solid.err.*` codes with `vars` | `errors` tests (the message is the code) | enforced |
| Language-table keys before the app shows a code | `CODES` lists every code | `STATUS.md` Found, due at the first UI-facing session (S24b) | owner / S24b |

## 4. Running inside the apps

| Rule | Source | How it is met | Status |
|---|---|---|---|
| Import specifiers the worker loader follows: single-quoted, relative, lower-case, `.js` | PartCraft `exact-client.js` `blobModules()` | checker rule `specifier` | enforced |
| No text the loader would mistake for an import, comments included | same (it reads raw text) | checker rule `bundler` | enforced |
| No import cycles | same (it refuses them) | checker rule `cycle` (Tarjan's algorithm) | enforced |
| No globals added on import | apps share one global scope | `entry` test | enforced |
| Units at the boundary: mm and radians inside | apps differ (ModelCraft: metres) | `mat4.convertUnits`; `mat4` test | checked |
| Matrix order at the boundary | three.js and ModelCraft are column-major | `fromColumnMajor`, `toColumnMajor`; bit-for-bit test against cc-nurbs' `xform` | checked |

## 5. Determinism and safety

| Rule | How it is met | Evidence | Status |
|---|---|---|---|
| Same input, same output, in every engine | only exactly specified arithmetic; own elementary functions | checker rule `trig`; golden hash of 18,000 results | enforced |
| No hidden randomness or clock | no `Math.random`, no `Date`; budgets read an injected clock | checker rule `determinism` | enforced |
| No `eval` or `Function` | — | checker rule `eval` | enforced |
| Tolerances in one place | `core/tol.js` only | checker rule `epsilon` | enforced |
| Geometric decisions never take a wrong sign | exact predicates; outside their domain they refuse | `predicates` tests (BigInt, 1.56e6 cases); mutation run | enforced |
| Every long loop is bounded | budgets; iteration caps; the integrator's `maxDepth` and `maxPieces` | `limits`, `quad` and `roots` tests (refusals and limits) | enforced |
| No quiet wrong answers | typed refusals; no NaN results from solvers | each refusal has a test that throws it | enforced |
| Nothing leaks out of an error | `toEnvelope` strips messages and stacks from unknown errors | `errors` test | enforced |

## 6. Licence, copyright and clean room

Source: `HANDOFF.md` §15; the owner's direction (D5, D6).

| Rule | How it is met | Evidence | Status |
|---|---|---|---|
| The owner holds all rights; new files are Apache-2.0 | every file | rule `spdx` | enforced |
| Algorithms from books, papers and standards, never from another kernel's source | each module cites its sources | `PROVENANCE.md`, a row per file | checked |
| Constants computed, not copied | the π/2 parts, atan values and ln 2 come from BigInt | `bigref.mjs`; the `trig` tests | checked |
| Other kernels only as black-box oracles, never shipped | none in the repository | review; the `external` rule keeps them out of imports | enforced |
| Third-party test corpora not committed | none so far | review | checked |
| The library repo's items keep their own licences | the engine does not touch `items/`; the README states the engine's licence separately | `README.md` | checked |
| Owner's earlier code (KAD family) | when it is used, a provenance row names the snapshot and lines; stale AGPL headers are not carried over | `PROVENANCE.md` (no KAD code taken so far) | checked |

## 7. Repository and process

| Rule | Status |
|---|---|
| Work on branch `engine/solid`; `main` untouched | checked: `main` is at a02421e |
| No pull request until the owner says engine.solid is finished (D-home) | owner |
| One complete, tested build per session; `STATUS.md`, `PROVENANCE.md` and `HANDOFF.md` updated at the close | checked each session |
| A mutation run at each close (deliberate faults must fail the suite) | checked: S2 caught 19 of 20, and the survivor is equivalent in practice; S3 caught 9 of 9 |
| Commits name their session and carry the attribution lines | checked |

## 8. Known gaps

- **The sync script with `--check`.** It comes with the first host copy (PartCraft).
- **cc-nurbs and cc-step beside the engine.** S4 needs them (D-ccn2).
- **Language-table keys for `solid.err.*`.** Due at S24b.
- **The catalogue entry.** Drafted in `ENGINE.md`; the owner publishes it.
- **A browser run of the golden hash.** Node is checked today; Chromium, Firefox and Safari come before the pull request.
