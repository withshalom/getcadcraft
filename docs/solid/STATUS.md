# engine.solid — status

The source of truth for what is built. Update it at the end of every session (`HANDOFF.md` §16.3).

**Repo:** `withshalom/getlibrarycraft` · **Branch:** `engine/solid` · **Plan:** `HANDOFF.md` v1.2 · **Version:** 0.0.1 · **Last session:** S1 (2026-11-12)

> **Moved, 2026-11-12 (D-home, D-name):** S0 and S1 were built in the PartCraft fork (`withshalom/getpartcraft`, branch `partcore`, commit 34a1df2a) under the name PartCore. They now live here as engine.solid. Paths below are the new ones; S1's results were measured there, and are measured again here under "After the move".

## Done

### S0 — audit and review (2026-11-12)
- PartCraft's cc-nurbs, cc-step and cc-acis were read; the audit table is in `REVIEW-2026-11-12.md` §2. cc-nurbs'
  tests: 173 of 174 pass; the one failure is the monorepo sync check, which needs the CadCraft monorepo layout.
- KUBIC.html and KARVE.html were reviewed (review §3–§4).
- The plan was revised to v1.1 (review §5, P1–P16).
- The KAD-family reference snapshots are under `reference/kad/` in the PartCraft fork (branch `knot/kad-reference`).

### S1 — scaffold and ground rules (2026-11-12)
Built:

| File | What it is |
|---|---|
| `lib/solid/index.js` | the one public entry (VERSION, the core namespaces and their main names) |
| `lib/solid/core/errors.js` | `SolidError(code, vars)` and `fail`. Codes are `solid.err.*` i18n keys (bad_input, bad_tolerance, internal, limit). Also `cleanVars`, `toEnvelope` (cc-nurbs and cc-step errors pass through; anything else becomes `internal` with no detail) and `KAD2_CODES`. |
| `lib/solid/core/tol.js` | the tolerance policy (HANDOFF §5.2): `DEFAULT_TOL`, `makeTol` (every value checked: ranges, unknown keys, lin ≤ fit / maxEdgeTol / mesh.chord), `resolveTol`, `isTol` (cannot be fooled by a copy) |
| `lib/solid/core/limits.js` | budgets (HANDOFF §13.3): exact iteration and entity counts, an optional deadline on an injectable clock, and child budgets that can never outgrow their parent |
| `tools/solid/check-boundaries.mjs` | the architecture checker: 14 rules (below), a comment-, string-, template- and regex-aware tokenizer, a command line that exits 1 on any problem |
| `tools/solid/fixtures/` | `clean/`, legal code that only looks suspicious, which must pass; `bad/`, every rule broken, with an `expect:` comment on each line that must be reported |
| `tools/solid/test.mjs`, `worker-probe.mjs` | the test runner (the suite's style: sections, `--only`, `--verbose`); a worker-thread probe |
| `bin/test-solid.mjs` | runs the tests on `lib/solid/` (in the PartCraft fork it was `tests/bin/test-partcore.mjs`, so `npm test` ran them on the devshell mirror's copy) |

The checker's rules:
- `naming`, `spdx`
- `layer` (core ← math ← geom ← topo ← {ops, mesh, audit, measure} ← io ← api ← index.js)
- `audit` (audit imports neither ops nor mesh)
- `external` (only `nurbs/` and `step/`, and only from geom up)
- `specifier`, `missing`, `cycle`
- `bundler` (raw text that PartCraft's worker loader would mistake for an import)
- `dynamic`, `global`, `determinism`, `eval`
- `epsilon` (tolerance-sized literals only in `core/tol.js`)

Acceptance (HANDOFF Appendix A), each checked by a named test:

| Criterion | Result | Test |
|---|---|---|
| `node tools/solid/test.mjs` passes on a clean checkout, no `npm install` | **114 passed, 0 failed** (6 sections) | the whole runner |
| `npm test -- --only test-partcore.mjs` passes through PartCraft's devshell | **pass** (0.4 s), run on the mirror's app copy (in the PartCraft fork) | `tests/bin/test-partcore.mjs` there |
| A fixture that breaks a boundary makes the checker exit non-zero | **exit 1** on `fixtures/bad/` and exit 0 on the app and `fixtures/clean/`. Each of the 14 rules fires at exactly its 42 marked lines, and nowhere else. | `boundaries`: "command line: exit 1 on the bad fixture", "every expected problem … is reported", "nothing else is reported", "every rule (14) is proven to fire" |
| `window` or `fetch` in engine.solid fails the scan | **reported** at `bad/lib/solid/core/glob.js` lines 2–3 (with `process`, `globalThis.document`, `setTimeout`, `console`, `WebAssembly`, `performance`, …) | same |
| A bare `1e-9` outside `core/tol.js` fails the epsilon lint | **reported** at `bad/lib/solid/core/eps.js` line 2 (`0.001` and `1e3` are not) | same |
| `STATUS.md` has Done / Learned / Found / Next | this file | — |

Also checked:
- **Mutation check:** ten deliberate faults each made the suite fail.
  - In the core: a wrong default, a dropped tolerance relation, an off-by-one budget, a child budget that ignores its parent, no string cut, an error message leaking into an envelope, a forbidden global in the app.
  - In the checker itself: a forgotten rule, a disabled audit rule, regular expressions misread as division.
- **The rest of PartCraft's suite, with the kernel present** (PartCraft fork, devshell, `--oracles`):
  - `test-craftscript` 540 passed; `test-partcraft-params` 139 passed; `test-partcraft-sw` 119 passed, 1 skipped.
  - No existing file was changed.

After the move (library repo, 2026-11-12):
- `node bin/test-solid.mjs`: **113 passed, 0 failed**. One check fewer than in the PartCraft fork: cc-nurbs is not in this repo, so the pass-through of a real `NurbsError` uses a stand-in of the same shape (the real one returns when cc-nurbs sits beside the engine, S4).
- `node tools/solid/check-boundaries.mjs`: 0 problems; each rule still fires on exactly its marked lines.

## Learned
- **The checker found a real fault on its first run.** `core/limits.js` named a local variable `self`, which is a worker global. It was renamed to `budget`. The rules hold engine.solid's own code to account, not just the fixtures.
- **PartCraft's worker loader reads raw text, comments included** (`exact-client.js` `blobModules()`). A usage line such as `import … from './x.js'` in a comment would be fetched as a module, or reported as an import cycle. Hence the `bundler` rule, and why `index.js` documents its usage without a quoted path.
- **That loader only follows certain specifiers:** single-quoted, relative, lower-case `[a-z0-9-]` names ending in `.js`. Hence the `specifier` rule, which matters for S24b, where engine.solid runs in that worker.
- **SolidError follows NurbsError: `(code, vars)`, and the message is the code.** The app words it from its language tables, whose messages use `{placeholders}` filled from `vars` (`app/lang/en.json`).
- **Earlier findings still stand.** Most of M1 already exists in cc-nurbs. The missing layer is exact topology. cc-nurbs' solids and booleans are mesh-based, and KAD2 documents flatten splines.

## Found (for later sessions)
- **Language-table keys:** the `solid.err.*` codes need keys in `app/lang/*.json` (English first) before the app shows them. That belongs to the first UI-facing session (S24b); `CODES` lists what is needed.
- **`fromEnvelope`** (a worker's reply turned back into an error on the main thread) belongs with the worker protocol (S18 / S24b).
- **This sandbox cannot finish PartCraft's main test file.** `test-partcraft.mjs` stopped 13 minutes in, during the tet FEA section, at more than 3 GB of memory, on 7 GB and 2 cores. This happened on the unchanged code. Before that it reported four failures on the unchanged code: two need ModelCraft in the same checkout (illustrate copies, cc-step in ModelCraft), one is an arc-method key check in `lang/en.json`, and one is `cam-sheets`. CI's runner is where that file should be judged, and CI runs only on pull requests and on `main`.
- **KUBIC's own bugs**, to fix before S36 (review §3.2): K9, an undeclared `nextSolidId`, breaks STL import; K15, network fonts, breaks the offline rule.
- **KARVE's G-code is unsafe.** Label it "preview only" or turn it off (review §4.1). KARVE also cannot read `.kbc` (V1).
- **The KAD repositories' headers still say AGPL.** The sweep belongs in those repositories (`reference/kad/README.md`).

## Next
- **S2 — the math kit** (`lib/solid/math/`): vec3, mat4, frames, aabb, Gauss–Legendre tables, root finders (Newton with brackets, Brent), LU / banded / QR solvers, intervals, a seeded PRNG and the trig shim. cc-nurbs' `vec.js` covers the vector basics; S2 adds the rest.
  - Acceptance: property tests over 1e5 random cases; solver residual and condition-number tests.
- **Owner decisions still open** (`HANDOFF.md` §17.2): D3, D-ccn, D-kad / D-kbc, D-tr.
