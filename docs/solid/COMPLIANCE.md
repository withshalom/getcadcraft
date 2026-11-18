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
| Shared by every app and SuperCad Studio | one canonical copy (`lib/solid/`, beside `lib/nurbs/`); hosts carry byte-identical copies as `dev/solid/` | `tools/solid/sync.mjs [--check]`; the `sync` tests (copy, drift, repair, refusals, LF-only, same hosts as cc-nurbs) | checked (first real host run: when PartCraft takes a copy) |
| Id `engine.<name>`; add-ons name it in `needs` | `engine.solid`; folder `solid/` fits the loader's `engine:<name>/<path>` pattern `[a-z][a-z0-9-]{0,40}` | `ENGINE.md` | checked |
| A catalogue page: what it computes, methods and standards, limits, hosts, licence, status | drafted | `ENGINE.md` | owner publishes |
| Version | `VERSION` in `index.js` | `entry` test: x.y.z | enforced |

## 2. Add-on review rules that apply to an engine

Source: getcadcraft.com › Build an add-on › Upload and review.

| Rule | How it is met | Evidence | Status |
|---|---|---|---|
| Loads nothing from outside its own folder | static imports only, all relative, and only into `solid/`, `nurbs/` or `step/` | checker rules `dynamic`, `external`, `specifier`, `missing` | enforced |
| What it loads from cc-nurbs or cc-step is same-bits too | every file reached through an import, to the end | checker rule `reach` (S4) | enforced |
| engine.solid never edits cc-nurbs (D8) | the engine only imports it, and the `reach` rule judges every function it takes. Since the move (2026-11-13) cc-nurbs is canonical beside the engine, so the old hash pins are gone and an edit to `lib/nurbs/` is no longer caught by this suite: it is a convention (decided 2026-11-17, D-ccn: a defect in cc-nurbs gets its own small upstream pull request with a failing test first, and the engine drops its workaround after it merges), and host copies are kept equal by `tools/nurbs/sync.mjs --check` | checker rule `reach`; `sync` section (LF-only, same hosts) | checked |
| Talks to no server | no `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, workers or `importScripts` | checker rule `global` | enforced |
| A licence the suite can sign | Apache-2.0 | rule `spdx` | enforced |
| Package size: at most 200 files, 5 MB unpacked | 33 files, about 350 KB (S12); cc-nurbs, which hosts already carry, sits beside it | measured at each session close | checked |
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
| Same input, same output, in every engine | only exactly specified arithmetic; own elementary functions | checker rules `trig` and `reach`; golden hashes; `digest` in 20 areas: the first 13 the same in Node, Chromium, Firefox and WebKit, page and worker (2026-11-13); the `curve` (S5), `surface` (S6), `analytic` (S7), `fitting` (S8–S9), `query` (S10), `topo` (S11) and `euler` (S12) areas recorded in Node, browsers to be run (no Playwright on this machine); Safari proper by hand before the PR | enforced (Node); browsers: before the PR |
| No hidden randomness or clock | no `Math.random`, no `Date`; budgets read an injected clock | checker rule `determinism` | enforced |
| No `eval` or `Function` | — | checker rule `eval` | enforced |
| Tolerances in one place | `core/tol.js` only | checker rule `epsilon` | enforced |
| Geometric decisions never take a wrong sign | exact predicates; outside their domain they refuse | `predicates` tests (BigInt, 1.56e6 cases); mutation run | enforced |
| Every long loop is bounded | budgets; iteration caps; the integrator's `maxDepth` and `maxPieces` (its cost grows as pieces · log pieces); size and work limits in `linalg`; (S10) branch and bound stops at `LIMITS.patches`, boxes and areas refuse past `LIMITS.pieces` (`solid.err.limit`), descents stop at 100 steps | `limits`, `quad`, `roots` and `linalg` tests (refusals and limits) | enforced |
| No quiet wrong answers | typed refusals; no NaN results from solvers; root counts from exact discriminant signs; cubic roots certified by a sign change; rounded bounds exact over the whole range of doubles; (S5) a curve parameter outside its domain is refused, not clamped; an approximation is kept only within a proved bound (`deviation`), else `solid.err.not_within_tolerance`; (S6) a surface normal is the true limit at a pole and refused where there is none, never a default direction; (S8–S9) every fit and every constructed surface is checked against the data or curves it was built from, and refused when it misses them by more than its tolerance | each refusal has a test that throws it; the second review's exact tests (`float`, `exact`, `roots`, `quad`); `curve` (including a reduction cc-nurbs accepts wrongly); `surface` (the pole of a sphere, a folded patch); (S13) a pcurve is certified against its edge and refused as `not_supported` when the edge is not one of the surface's lines or crosses a pole, a point is never called in or out within tol.lin of a loop (`on`), and a face whose loops come out inside out is refused (`bad_topology`) | enforced |
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
| Owner's earlier code | when it is used, a provenance row names the source and lines; stale AGPL headers are not carried over | `PROVENANCE.md` (none taken so far) | checked |

## 7. Repository and process

| Rule | Status |
|---|---|
| Work on branch `engine/solid`; `main` untouched | checked: in the site repo `engine/solid` branches from `main` at fec32b76, which no session changes (the library repo's branch and `main` at a02421e are kept as they were) |
| No pull request until the owner says engine.solid is finished (D-home, now the site repo) | owner |
| One complete, tested build per session; `STATUS.md`, `PROVENANCE.md` and `HANDOFF.md` updated at the close | checked each session |
| A mutation run at each close (deliberate faults must fail the suite) | checked: S2 caught 19 of 20, and the survivor is equivalent in practice; S3 caught 9 of 9; S4 caught 16 of 16; S5 caught 22 of 22 (18 at first; the four survivors became four new tests); S6 caught 23 of 23 (21 at first; the survivors became new tests, two of them inputs found by a seeded search); S7 caught 25 of 25 (20 at first; five new tests), each run checked first on the unmutated code; S8–S9 caught 17 of 18 (12 at first; the survivor is masked by a second guard for the same condition); S10 caught 16 of 18 on the final code (14 at first; two survivors became tests, two showed dead code, which was removed; the two that remain cover each other on analytic surfaces, which have no lower bound yet); S11 caught 23 of 23; S12 caught 23 of 23 |
| Commits name their session and carry the attribution lines | checked |

## 8. The upstream's contribution rules (getcadcraft, read 2026-11-15)

Sources: the organisation's `getcadcraft/.github` (`CONTRIBUTING.md`, issue templates), and `getcadcraft/cadcraft`'s
`CONTRIBUTING.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/workflows/test.yml`, `BUILDING.md` and `THIRD_PARTY.md`.
The other seven app repos carry the same guide and template with their own names; `language-packs` and `mcp` have their own
(translations; the tools' rules), and `addons` and `library` add licence rules for add-ons and library items.

| Rule | Where | engine.solid | Status |
|---|---|---|---|
| Anything larger than a fix starts with an issue, so the approach is agreed first | org and app `CONTRIBUTING.md` | none is open; the engine is far larger than a fix, so a proposal issue (scope, layout under `tests/`, how hosts take copies) comes before the pull request | owner, before the PR |
| A branch in a fork, a pull request against `main`; the template's checklist; a maintainer reviews and merges (`main` has no branch protection or required checks) | app `CONTRIBUTING.md`, PR template, GitHub API | branch `engine/solid` in `withshalom/getcadcraft`; the checklist's five items are the rows below | before the PR |
| `npm test` passes, with a test for what changed; tests use only files in `fixtures/` | app `CONTRIBUTING.md`, PR template | `tests/bin/test-solid.mjs` runs under `npm test` (every test in `tests/bin`, `BUILDING.md`); the engine's tests draw their data from seeds and read only the checker's `tests/tools/solid/fixtures/` | checked (Node 26) |
| CI: `npm test -- --oracles` on Linux, Node 22, Python 3.12, 30 minutes for the whole run; `BUILDING.md` asks for Node 20.19 or newer | `.github/workflows/test.yml`, `BUILDING.md` | the engine needs Node only; its suite takes about 4 minutes on this machine | **to run on Node 22 and 20.19 before the PR** |
| Words people read go through the language files, in plain text and sentence case | app `CONTRIBUTING.md`, PR template | the engine has no words: refusals are `solid.err.*` codes, worded by the app | keys due at S24b |
| A self-contained build: relative imports, libraries only from the versioned folders in `THIRD_PARTY.md`, no CDN, no tracking, no network calls | app `CONTRIBUTING.md` | rules `external`, `specifier`, `dynamic` and `global`; no third-party library (cc-nurbs is the site's own) | enforced |
| No new library, or one named in the pull request with its permissive licence | PR template, app `CONTRIBUTING.md` | none | checked |
| Nothing copied from proprietary CAD software, its SDKs or file-format libraries; nothing ported from GPL, LGPL or MPL code; readers from published specifications, other implementations as black boxes only | org and app `CONTRIBUTING.md`, PR template | § 6; `PROVENANCE.md`, a row per file | checked |
| Apache-2.0, and the right to contribute it | org and app `CONTRIBUTING.md`, PR template | rule `spdx`; the owner's own work | enforced |
| Other products' names only to say what a format or workflow is compatible with, in plain text, never in a title, heading or product name | app `CONTRIBUTING.md` | `docs/solid/` headings reviewed 2026-11-15: one heading named the ACIS kernel and now names the SAT/SAB format; the rest name the site's own libraries | checked |
| Help pages compiled by `build-help.php`; translations by the language-file rules | app `CONTRIBUTING.md`, `language-packs` | the engine adds no help pages and no words | not applicable |
| Security problems are reported privately (`cadcraft-cpp`, `cadcraft-rust` `SECURITY.md`) | those repositories | the engine opens no files from strangers yet; the readers (S28 onward) take the same care | later |

## 9. Known gaps

- **The sync script's first real run.** `tools/solid/sync.mjs` is built and tested on temporary hosts; it runs for real when PartCraft takes a copy (S24b), after cc-nurbs' own sync.
- **Browser digests for the S5–S12 areas.** Node's hashes of the `curve`, `surface`, `analytic`, `fitting`, `query`, `topo` and `euler` areas are recorded; `node tools/solid/browser-run.mjs` (Playwright) has to confirm them in Chromium, Firefox and WebKit before the pull request.
- **cc-step beside the engine.** Its copies have drifted; settle which is canonical first. cc-nurbs is here (S4).
- **D-det (decided (b)).** cc-nurbs' `arc`, `circle` and `angle` are not same-bits; S5 imports only the exact functions (`nurbs-curve.js` passes `reach`), and the checker keeps those three out, function by function. Exact circles, arcs and surfaces of revolution are engine.solid's own, on `core/trig.js` (S7: `analytic-curve.js`, `analytic-surface.js`). Option (a), deterministic trig upstream, is open for later investigation.
- **Language-table keys for `solid.err.*`.** Due at S24b.
- **The catalogue entry.** Drafted in `ENGINE.md`; the owner publishes it.
- **Safari itself.** The digest gives the same bits in Node, Chromium, Firefox and WebKit (`STATUS.md`). WebKit there is Safari's engine built for Linux; one run of `tools/solid/browser.html` in Safari proper comes before the pull request.
- **The upstream's CI versions.** The suite has run on Node 26 only; the upstream's CI uses Node 22 and its `BUILDING.md` allows 20.19 (§ 8).
- **The proposal issue.** The upstream asks for an issue before any large pull request (§ 8); it is the owner's to open.
