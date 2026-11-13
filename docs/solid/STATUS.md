# engine.solid — status

The source of truth for what is built. Update it at the end of every session (`HANDOFF.md` §16.3).

**Repo:** `withshalom/getlibrarycraft` · **Branch:** `engine/solid` · **Plan:** `HANDOFF.md` v1.2 · **Version:** 0.0.2 · **Last session:** S2 (2026-11-12)

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

### S2 — the math kit (2026-11-12)
Built (the engine, `lib/solid/`):

| File | What it is |
|---|---|
| `core/float.js` | the bits of a double (`fromBits`, `pow2`, `exponent`, `ulp`, `nextUp`/`nextDown`, `ulpDistance`), error-free transformations (TwoSum, Fast2Sum, TwoProduct with Veltkamp's split, `prodExact`), and directed rounding for + − × ÷ √ (down ≤ exact ≤ up, overflow and underflow included, exact results kept) |
| `core/trig.js` | sin, cos, sincos, tan, atan, atan2, asin, acos, exp, log, cbrt from + − × ÷ and √ only: **the same bits in every engine** (D-tr). `ULPS` records the measured bound per function |
| `core/prng.js` | xoshiro128** seeded through MurmurHash3's finaliser: `u32`, `float` (53 bits), `range`, `int` (unbiased), `normal`, `unit3`, `state`/`restorePrng`, `clone` |
| `core/intervals.js` | interval arithmetic rounded outward (tight where an error-free transformation proves a bound exact): + − × ÷, sqr, sqrt, abs, scale, sin and cos with their crests, and `sign` → 1 / −1 / 0 / null ("cannot tell") |
| `math/vec3.js` | 3D vectors; lengths that rescale instead of overflowing; `unit` refuses a zero vector; `angle` by atan2 |
| `math/mat4.js` | affine 4×4, **row-major like cc-nurbs**; rotations, inverse (refuses near-singular), normals; `fromColumnMajor` / `toColumnMajor` / `convertUnits` for three.js and ModelCraft (column-major, metres) |
| `math/frame.js` | placements `{ o, x, y, z }`: from z, z + x, x + y, or a rigid matrix; to and from local coordinates |
| `math/aabb.js` | boxes `{ min, max }` (cc-nurbs' shape) that are **conservative**: `transform` and `inflate` round outward |
| `math/quad.js` | Gauss–Legendre rules 1–64 computed by Newton on the Legendre recurrence; `fixed`; `adaptive` with global error control, deterministic, bounded by `maxDepth` and `maxPieces` |
| `math/roots.js` | `quadratic` (exact-sign discriminant), `cubic` (Kahan's method, then polishing with a compensated Horner residual), `brent`, `newton` kept inside its bracket |
| `math/linalg.js` | LU with partial pivoting (`lu`, `luSolve`, `luSolveT`, `solve`, `solveMany`, `det`, `inverse`), `rcond1` (Hager–Higham), `bandSolve` (banded LU with pivoting), `qr` and `lstsq` (Householder) |
| `core/errors.js` | three new refusals: `solid.err.no_bracket` { fa, fb }, `solid.err.no_convergence` { what, iterations }, `solid.err.singular` { why, size?, column?, rcond? }, with KAD2 codes `REFUSED_NO_BRACKET`, `REFUSED_NO_CONVERGENCE`, `REFUSED_SINGULAR` |
| `index.js` | VERSION 0.0.2; the eleven S2 modules as namespaces, plus `makePrng`; the engine-library header (where the edited copy lives, how hosts and add-ons get it) |

Built (the tools, `tools/solid/`):
- `check-boundaries.mjs`: rule 15, **`trig`** (each of the 15 rules now fires at exactly its 51 marked lines, and nowhere else): no implementation-approximated `Math` function, no `**` / `**=`, no `Math` as a value, `Math[…]` or `globalThis.Math`. New fixtures: `bad/…/math/inexact.js` (nine marked lines), `clean/…/math/maths.js` (look-alikes in comments, strings, templates, keys and members).
- `bigref.mjs`: exact references in BigInt fixed point (320 bits): π by Machin's formula, ln 2 by the atanh series, sin, cos, atan, atan2, asin, acos, exp, log, cbrt, and `ulpsOff`.
- `test-core.mjs` (prng, float, trig, intervals) and `test-math.mjs` (vec3, mat4, frame, aabb, quad, roots, linalg), registered by `test.mjs`.
- `ref/xoshiro128ss.c`: the generator in C; its outputs are written into `test-core.mjs`.

Acceptance (HANDOFF §14, S2), each checked by a named test:

| Criterion | Result | Test |
|---|---|---|
| Property tests pass on 1e5 random cases | **pass**: 1e5 seeded cases each for neighbours, ulp, TwoSum, TwoProduct, four directed operations, sqrt, interval containment, vector identities, quadratics and cubics; 1e4 to 2e4 for rotations, frames, boxes and interval sin/cos; 1.6e5 BigInt-checked trig arguments | `float`, `trig`, `intervals`, `vec3`, `mat4`, `frame`, `aabb`, `roots` |
| Solver residual tests | **pass**: backward error ≤ 8n ulps on 2000 random dense systems; ≤ 16n on 1500 banded systems; Aᵀ z = c by `luSolveT`; least squares' Aᵀ(Ax − b) ≈ 0 on 2000 overdetermined systems | `linalg` |
| Condition-number tests | **pass**: `rcond1` on the inverse Hilbert matrices n = 2…11 against κ₁ computed exactly in BigInt (ratio in [0.9, 3]); on 2000 random matrices never below the true 1/κ₁, never 3× above, exact on 1704 | `linalg` |

Measured (seeded, reproducible):
- **Trig accuracy, largest error in ulps** on 1.6e5 random arguments: sin 0.71, cos 0.73, atan 0.80, exp 0.90, log 0.73, cbrt 0.50, atan2 1.33, asin 1.62, tan 1.77, acos 2.00; next to 2000 multiples of π/2 up to 2^20, sin and cos 0.50. `ULPS` = 1, except tan, atan2, asin 2 and acos 3.
- **The same bits:** 18,000 results of nine functions hash to `0x1cb4c414`, recorded in the test.
- **Speed (Node 22, this sandbox):** sin 37 ns per call (Math.sin 21), cos 38 (20), atan 55 (17), exp 39 (18), log 76 (18). About 27 million sines a second: slower than `Math`, fast enough for S2's users; tuning belongs to S43.
- **The whole suite:** 250 checks in about 6 s, no install, no network.
- **Mutation check:** 20 deliberate faults; **19 caught**. They covered π/2 one bit off, each trig kernel, `addDown`, the PRNG rotation, interval sin crests and mul, box transforms, the textbook discriminant, Brent's bracket, LU and banded pivoting, the transposed solve, Gauss weights, a rotation sign, vector rescaling and both halves of the `trig` rule. The survivor, Veltkamp's splitter 2^27 − 1 instead of 2^27 + 1, is equivalent in practice: it still splits every one of 1e6 doubles into halves of 26 bits.

## Learned
- **The checker found a real fault on its first run.** `core/limits.js` named a local variable `self`, which is a worker global. It was renamed to `budget`. The rules hold engine.solid's own code to account, not just the fixtures.
- **PartCraft's worker loader reads raw text, comments included** (`exact-client.js` `blobModules()`). A usage line such as `import … from './x.js'` in a comment would be fetched as a module, or reported as an import cycle. Hence the `bundler` rule, and why `index.js` documents its usage without a quoted path.
- **That loader only follows certain specifiers:** single-quoted, relative, lower-case `[a-z0-9-]` names ending in `.js`. Hence the `specifier` rule, which matters for S24b, where engine.solid runs in that worker.
- **SolidError follows NurbsError: `(code, vars)`, and the message is the code.** The app words it from its language tables, whose messages use `{placeholders}` filled from `vars` (`app/lang/en.json`).
- **S2: the mutation run found a real gap.** With broken weights, `adaptive` had no cap on its number of pieces and ran for more than ten minutes. It now has `maxPieces` (default 4096) next to `maxDepth`, and always ends with `no_convergence`.
- **S2: an exported function is a tested function.** The transposed solve was internal and a wrong permutation in it went unnoticed; exported as `luSolveT`, it has a residual test of its own.
- **S2: Hager's estimate is exact on most matrices, not all** (1704 of 2000 random ones). The tests check what it guarantees (never below the true 1/κ₁) and what it does in practice (never 3× above).
- **S2: Math.sqrt is fully specified since ECMAScript 2025** (TC39 PR #3345, merged 2024-08-17), so + − × ÷ and √ are what every engine computes alike, and what trig.js is built from.
- **Earlier findings still stand.** Most of M1 already exists in cc-nurbs. The missing layer is exact topology. cc-nurbs' solids and booleans are mesh-based, and KAD2 documents flatten splines.

## Found (for later sessions)
- **cc-field's `detmath.js` is less accurate than it says.** Its comment claims about 1e-15 for |x| < 1e6. Measured against the BigInt reference, `dsin`'s absolute error is 3.3e-16 below 10, 5.7e-14 below 1e3, and 5.8e-11 below 1e6. The reduction multiplies by a full 53-bit 2π, so `n · 2π` is not exact. A Cody–Waite split of 2π with trailing zeros, as in `core/trig.js`, fixes it. The fix belongs in the site's `lib/field/` (owner).
- **cc-nurbs and cc-step are not in the library repo.** S4 onward needs them beside `lib/solid/` (D8). Either synced copies come into this repo before S4, or the engine moves into the site's `lib/` first.
- **Exact bodies for library items.** LibraryCraft's standard parts have `body: null` (a 2D plan only). Once S20–S22 can extrude and revolve, the generators can give them exact solids: a STEP export, and a mesh made from the solid.
- **Splines and conics across the suite (owner, 2026-11-12: "This later").** Check how each app draws and stores splines and conics. Conics are exact as rational quadratic NURBS (ellipse, parabola, hyperbola); CadCraft should have them. S7 (analytic curves) is the natural place.
- **A sync script with `--check`** comes with the first host copy (PartCraft's `solid/`), as cc-nurbs' `tools/nurbs/sync.mjs`.
- **The catalogue entry** for `engine.solid` is drafted in `ENGINE.md`; publishing it is the owner's step.
- **Language-table keys:** the `solid.err.*` codes need keys in `app/lang/*.json` (English first) before the app shows them. That belongs to the first UI-facing session (S24b); `CODES` lists what is needed.
- **`fromEnvelope`** (a worker's reply turned back into an error on the main thread) belongs with the worker protocol (S18 / S24b).
- **This sandbox cannot finish PartCraft's main test file.** `test-partcraft.mjs` stopped 13 minutes in, during the tet FEA section, at more than 3 GB of memory, on 7 GB and 2 cores. This happened on the unchanged code. Before that it reported four failures on the unchanged code: two need ModelCraft in the same checkout (illustrate copies, cc-step in ModelCraft), one is an arc-method key check in `lang/en.json`, and one is `cam-sheets`. CI's runner is where that file should be judged, and CI runs only on pull requests and on `main`.
- **KUBIC's own bugs**, to fix before S36 (review §3.2): K9, an undeclared `nextSolidId`, breaks STL import; K15, network fonts, breaks the offline rule.
- **KARVE's G-code is unsafe.** Label it "preview only" or turn it off (review §4.1). KARVE also cannot read `.kbc` (V1).
- **The KAD repositories' headers still say AGPL.** The sweep belongs in those repositories (`reference/kad/README.md`).

## Next
- **S3, exact predicates** (`lib/solid/math/predicates.js`): `orient2d`, `orient3d`, `incircle`, `insphere` by Shewchuk's adaptive expansions, built on `core/float.js`'s error-free transformations.
  - Acceptance: 0 disagreements with an exact BigInt reference on 1e6 random and adversarial near-degenerate inputs.
- **Owner decisions still open** (`HANDOFF.md` §17.2): D-ccn, D-kad / D-kbc. D3, D-tr, D-name and D-home were settled on 2026-11-12.
- **The pull request** to the library repo's `main` waits until engine.solid is finished (D-home).
