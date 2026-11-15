# engine.solid — status

The source of truth for what is built. Update it at the end of every session (`HANDOFF.md` §16.3).

**Repo:** the site repo (`withshalom/getcadcraft`, a fork of `getcadcraft/cadcraft`) · **Branch:** `engine/solid` · **Plan:** `HANDOFF.md` v1.2 · **Version:** 0.0.15 · **Last session:** S12, Euler operators and builders (2026-11-15); before it S11, the topology data model, the same day; S10, queries (2026-11-14), which closed M1 (splines), S5–S9 the same day, and the relocation to the site repo (2026-11-13)

> **Relocation, 2026-11-13 (D-home superseded):** the engine moved from the library repo (`withshalom/getlibrarycraft`, branch `engine/solid`, kept as it was) to the site repo, beside cc-nurbs.
> - **What moved:** `lib/solid/`, `tools/solid/`, `bin/test-solid.mjs` and `docs/solid/`. In a clone of the site repo they sit under `tests/` (`tests/lib/solid/`, `tests/tools/solid/`, `tests/bin/test-solid.mjs`); `docs/solid/` stays at the top. All 13 commits were replayed with their authors, dates and messages; the files matched the library branch byte for byte before anything was changed.
> - **What changed:** cc-nurbs is canonical beside the engine, so `pins.json`, `sync-nurbs.mjs` and the `pins` test section are gone. A new `tools/solid/sync.mjs` copies `lib/solid/` into each host's `dev/solid/` (partcraft, modelcraft, supercadcraft) and refuses a host with no `nurbs/` beside it. A new `sync` section tests it against temporary folders and checks that both libraries are LF-only. A `.gitattributes` keeps `*.js`, `*.mjs`, `*.json` and `*.md` LF, because Git for Windows otherwise converts them and breaks byte-identity.
> - **Result:** `node bin/test-solid.mjs` from `tests/`: **372 passed, 0 failed** (365 before; the pin checks gave way to the sync checks). The boundary checker reports 0 problems (18 files, 61 imports), and the digest section holds the recorded hashes. Version unchanged at 0.0.8.
> - **Not done:** the browser run (`tools/solid/browser-run.mjs`, needs Playwright) was not rerun from the new place, and the real-Safari check is still the owner's. No sync was run against a real host (the clone has none); the real sync needs the full getcadcraft.com layout. Nothing is pushed and there is no pull request.

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

### S3 — exact predicates (2026-11-12)
Built:

| File | What it is |
|---|---|
| `lib/solid/math/predicates.js` | `orient2d`, `orient3d`, `incircle`, `insphere`, each returning the **exact** sign (+1, −1, 0). A floating-point filter comes first, using Shewchuk's error bounds doubled for margin; when the filter cannot decide, the determinant is computed exactly as an expansion (TwoSum, TwoProduct, Grow-Expansion). Domain: each coordinate is 0 or between 2^-140 and 2^140 in magnitude; anything else is refused (`bad_input`, `out_of_range`) |
| `lib/solid/index.js` | VERSION 0.0.3; `predicates` namespace |
| `tools/solid/test-math.mjs` | the `predicates` section: an exact BigInt determinant for every case |

Acceptance (HANDOFF §14, S3):

| Criterion | Result | Test |
|---|---|---|
| 0 disagreements against a BigInt reference on 1e6 random and adversarial near-degenerate inputs | **0 of 1,560,000**:<br>• orient2d, 1e6: half random, half nudged onto the line, plus Shewchuk's 256 × 256 grid next to (0.5, 0.5);<br>• orient3d, 2.2e5;<br>• incircle, 2.2e5;<br>• insphere, 1.2e5.<br>Each of the last three is half random, half nearly degenerate, plus 2e4 exactly degenerate integer cases. | `predicates` |

Measured:
- **The grid is a real test.** Plain floating point gets 1442 of 4096 signs wrong there; the exact predicate gets none wrong.
- **Speed, random points (Node 22):** orient2d 50 ns, orient3d 54, incircle 47, insphere 107. The exact stage costs about 1.7 µs, and only nearly degenerate inputs reach it.
- **Mutation check:** 9 of 9 caught. The faults: each predicate without its exact stage; a zero error bound; Grow-Expansion dropping error terms; rounded differences or products in the exact stage; insphere's sign flipped or guessed.
- **The whole suite:** 261 checks in about 17 s.

### S4 — basis functions (2026-11-12)
D-ccn2 was settled the way the plan proposed (synced copies), so S4 could start. cc-nurbs now sits beside the engine:

| File | What it is |
|---|---|
| `lib/nurbs/` (20 files) | cc-nurbs, **unedited**: the CadCraft site's canonical `lib/nurbs/` (0.8 SU.747b), byte-identical to PartCraft's `app/nurbs/` at 9ed2e65e |
| `tools/solid/pins.json` | where that copy came from, and the SHA-256 of every file |
| `tools/solid/sync-nurbs.mjs` | `--check` fails on any edited, added or missing file; `--from <canonical> --source "…"` is the only way the copy changes (D8, D-ccn) |
| `lib/solid/geom/basis.js` | the first `geom/` file:<br>• `knots` (checks a knot vector once and returns a frozen record);<br>• `span`, `basis`, `ders`, `one`, `oneDers`, `clampedUniform`;<br>• unchecked `findSpan`, `basisFuns`, `dersBasisFuns` for hot loops.<br>The arithmetic is cc-nurbs' A2.2 and A2.3, called unchanged. |
| `tools/solid/check-boundaries.mjs` | rule 16, **`reach`** (below) |
| `tools/solid/test-geom.mjs` | sections `pins` and `basis` |
| `lib/solid/index.js` | VERSION 0.0.4 (0.0.5 after the bug review below); `basis` namespace |

What engine.solid adds to cc-nurbs' basis:
- **Every input is checked once,** and a bad one gets a typed refusal instead of NaN.
- **Unclamped knot vectors work.** cc-nurbs' `findSpan` returns an empty span at an end of the domain when the knot there repeats (for example `[0,1,1,1,2,3,3,3]`, p = 2, at u = 1), and `basisFuns` then gives NaN. The engine steps to the nearest non-empty span. A test shows cc-nurbs' NaN and the engine's right answer side by side.
- **Knots are compared exactly.** No `KTOL`, so a very short span is still a span.
- **Derivatives above the degree are zero rows.**
- **Limits:** degree ≤ 15 and at most 65,536 knots (HANDOFF §6.6).
- **A range for knots and u:** each is 0 or between 2^-500 and 2^500 in magnitude. Every non-zero knot difference is then a normal double.

Acceptance (HANDOFF §14, S4):

| Criterion | Result | Test |
|---|---|---|
| Partition of unity | Σ N within (7p + 1) u on 1e5 cases; measured worst 13 u | `basis` |
| Non-negativity | every value ≥ 0 exactly, 1e5 cases | `basis` |
| Values (the strong form) | every value within **γ(6p)** of exact Cox–de Boor, relative to itself. The test checks this exactly, in BigInt rationals.<br>• 2e4 cases, degrees 0–15;<br>• knot vectors clamped, unclamped, near-coincident (relative gaps of 6e-8) and widely spaced (ratios up to 1e9).<br>The bound is proved: A2.2 combines only non-negative numbers, with six roundings per degree. Measured worst: 1.74 p·u. | `basis` |
| Derivatives vs high-order finite differences | a fourth-order central difference agrees to 7.9e-7 of scale (2,000 cases, p = 1–6, every order) | `basis` |
| Derivatives (the strong form) | within 4 p²·u of the row's largest value, against exact derivatives (4,000 cases, p = 1–9, every order). Measured worst 0.94, so the bound has about 4× headroom. | `basis` |
| Bézier case equals Bernstein | `[0…0, 1…1]` for degrees 0–15: values to γ(6p) against exact Bernstein, and the first derivatives | `basis` |

Measured:
- **Agrees with cc-nurbs.** On more than 2e4 clamped vectors, `span` equals cc-nurbs' `findSpan`, and `ders(…)[0]` equals `basis(…)` to the bit.
- **Mutation check:** 16 of 16 caught. A fault of only 16 ulps (2^-49) in one value fails the γ(6p) check on its own.
- **Speed, p = 3:** `basis` 187 ns (raw cc-nurbs 163 ns); `span` 111 ns; `ders` with d = 2 is 1.6 µs, mostly allocation in A2.3 (S43); `knots()` on 1,004 knots takes 120 µs, once per vector.
- **Same bits:** 4,000 seeded evaluations hash to 0x98fda410.
- **The whole suite:** 286 checks in about 30 s (317 after the bug review below).

### The `reach` rule, and what it found
- **What the rule does:** a file in `nurbs/` or `step/` that `solid/` imports, and every file it imports in turn, must use only exactly specified arithmetic. That means no `**`, no approximated `Math` function, no `Math.random`, no `Date`, no `import()`.
- **What it found:** of cc-nurbs' 20 files, only `basis.js` passes. Across `curve.js`, `surface.js` and `fit.js` there are just 8 such uses, in two places: `vec.angle()` (`Math.atan2`, `**`) and `curve.arc()` (`Math.cos`, `sin`, `tan`; `circle()` calls it). `surface.js` and `fit.js` are clean themselves and fail only because they import those files. No evaluation, derivative or knot function calls either place, and nothing in curve, surface or fit calls `vec.angle()` at all.
- **Why it matters:** S5 (curves) and S6 (surfaces) cannot import cc-nurbs' curve and surface code without breaking engine.solid's same-bits promise.
- **The owner decided (b)** (D-det, `HANDOFF.md` §17.3). Since the bug review below, the rule judges function by function and there is no `solid-allow: reach` waiver.

### Bug review of S1–S4, and the fixes (2026-11-13, version 0.0.5)
The owner asked for a review of everything built so far, then for every finding to be fixed. Each fix began with a test that failed.

| # | Fault | Fix |
|---|---|---|
| 1 | `intervals.div` returned NaN bounds when both intervals had an unbounded end (∞ / ∞), so `contains` and `intersect` answered wrongly | a corner that is no bound is left out; every operation now returns an interval for every interval (checked on 77 × 77 extreme pairs) |
| 2 | `sin`, `cos` and `tan` were wrong past about 2^45, out of [−1, 1] past 2^55, and NaN past 1e40 | past 2^19 π the reduction is exact: \|x\| · 2/π in whole-number (BigInt) arithmetic with 1216 bits of 2/π, checked against Machin's formula. Within 1 ulp (tan 2) out to the largest double |
| 3 | `quad.adaptive` rescanned every piece on every split: 65,000 pieces took 20 s, and the cap allowed 1,000,000 | the worst piece comes from a heap: the same 65,000 pieces in 0.3 s, the same pieces and bits as the plain search. `maxPieces` is at most 100,000 |
| 4 | `sync-nurbs.mjs --from` emptied `lib/nurbs` and wrote an empty pin set when the source was the copy itself or held no `.js` files; `--check` then passed | everything is checked and read before anything is deleted; a pin set that pins nothing is a problem |
| 5 | `brent` and `newton` could not find a root at 0 with the default `eps = 0` (a tolerance relative to x alone) | no answer is asked to be finer than EPS² of the bracket's size; defaults 500 and 400 iterations |
| 6 | NaN passed silently: `intervals.scale(a, NaN)`, `iv(−∞, −∞)`, `aabb.extend` with a bad point, `aabb.center` of an unbounded box | each is refused or defined: `iv` and `box` refuse a side wholly at infinity, `scale` and `extend` check their argument, `center` returns a point inside |
| 7 | `prng.range(lo, hi)` returned `lo` every time when `hi − lo` overflowed | the ends are blended instead; the usual case keeps its bits |

Gaps closed with them:
- **`reach` is the D-det (b) guard now.** It reads each cc-nurbs file's top-level declarations and follows what the imported names mention, across files. On the real cc-nurbs: `curve.js` has 36 exact exports and 2 that are not (`arc`, `circle`); `vec.js` 13 and 1 (`angle`); all 29 of `surface.js` are exact. `revolve`, `sweep1` and the solid primitives are kept out because they are built on `arc`. The `solid-allow: reach` waiver is gone. The scan also sees `Math` used as a value, `Math[…]` and `globalThis.Math`.
- **`linalg` has limits:** 1024 columns, 65,536 rows, 2^31 multiply-adds (`solid.err.limit { what: 'size' | 'work' }`). Its loops are cubic and take no budget.
- **The `pins` test fails when `pins.json` is missing,** unless the host says it holds the canonical copy (`SOLID_NO_PINS=1`).
- **Docs:** HANDOFF named `maxFaces` and `check()`; the code has `maxEntities`, `step()` and `checkTime()`.

Results:
- **317 checks pass.** Both golden hashes are unchanged (trig 0x1cb4c414, basis 0x98fda410), so nothing that was right before changed its bits.
- **Mutation check:** 32 of 32 caught.
- **Checked and found sound:** `float.js`, `limits.js`, `errors.js`, `tol.js`, `vec3`, `mat4`, `frame`, `linalg`'s arithmetic, `basis.js`, and `predicates.js` (8,000 exactly degenerate cases at the bottom of its domain, all 0).
- **Not reviewed then:** the browser runs; they follow.

### Browser runs (2026-11-13, version 0.0.6)
- **What runs:** `tools/solid/digest.mjs` hashes some 200,000 seeded results in 12 areas (trig at every size of argument, basis, float, intervals, predicates, roots, quadrature, linear algebra, vectors and frames, the generator). It imports nothing, so the same file runs in Node, on a page and in a worker. Its `trig` and `basis` areas are the golden hashes of the tests, call for call.
- **Where:** `node tools/solid/browser-run.mjs` serves the repository locally and opens `tools/solid/browser.html` in each engine through Playwright; the page also starts a module worker. The recorded hashes are in `tools/solid/digests.json`, and the suite's `digest` section holds Node to them.
- **Result: the same bits in every host.** 12 of 12 areas, on the page and in a worker:

| Host | Version | Page | Worker |
|---|---|---|---|
| Node (V8) | 22.23 | same | — |
| Chromium (V8) | 158.0 | same | same |
| Firefox (SpiderMonkey) | 159.0 | same | same |
| WebKit (JavaScriptCore) | 27.2 | same | same |

- **One real difference was found first, and fixed.** `float.bits(x)` returned a NaN's sign and payload, which ECMAScript leaves to the engine: Firefox and WebKit gave other bits than V8. No decision in the engine read them, but it was a public function with host-dependent output. `bits` now gives every NaN the same 64 bits.
- **Still to do by hand:** Playwright's WebKit is Safari's engine, built for Linux, not Safari itself. Before the pull request, open `tools/solid/browser.html` once in Safari on a Mac or an iPhone (served over http) and read the table.
- **The whole suite:** 322 checks (350 after the second review below; 13 areas since then, all the same in the four hosts).

### Second review: code, math and architecture (2026-11-13, version 0.0.7)
The owner asked for rigour: every numerical claim was attacked with independent exact (BigInt) references on inputs chosen to break it, outside the suite. Seven faults; each fix began with a failing test.

| # | Fault | Fix |
|---|---|---|
| 1 | Rounded bounds were on the wrong side when a product inside came within 2^-24 of the largest double (`sqrtUp(MAX)²` below MAX; `divUp`, `divDown`, `mulUp`, `mulDown` likewise): the error term overflowed where the guard said it was safe | outside the middle of the range the operands are brought to [1, 2) first (exact), so the error's sign is exact for every pair of doubles |
| 2 | "An exact result comes back as it is" failed past 2^995 and below 2^-969 (`divDown(x, x)` gave 0.999… for a subnormal x) | the same fix: the bounds are now the two doubles around the exact value, or the value itself, over the whole range (2e5 edge pairs, exact) |
| 3 | `cubic` returned ±Infinity and two wrong roots once \|b/a\| passed about 1e105; `quadratic` lost a root when scaling made a coefficient underflow | a change of variable x = 2^t y (exact) balances the coefficients first; a cubic no such change brings within 2^250 is refused. `quadratic` takes any finite coefficients. A root past the largest double is ±Infinity, by rule |
| 4 | `cubic` lost or split double roots: with whole-number coefficients, 9% of double roots came back as one root, others as a pair 1e-8 apart; two roots 1e-5 apart came back 1e-8 off | the count comes from the discriminant's exact sign (`core/exact.js`); a zero discriminant gives the repeated root as an exact quotient; every other root is certified by a sign change of the cubic within 4 doubles, or found by bisection between the cubic's turning points |
| 5 | Gauss–Legendre end weights were off by up to 762 ulps at order 64 (22 at order 10): a weight depends on its node as 1/(1 − x²) | the last Newton step and the weight are taken in double-double arithmetic: all 2080 nodes and 2080 weights are the doubles nearest the exact values |
| 6 | `brent` on a bracket wider than the largest double blamed the function; `mat4.invert` called a small uniform scaling singular | wide brackets are solved in x/4; the 3×3 part is brought to scale 1 before its condition is judged |
| 7 | `linalg.det` and `mat4.det3` overflowed to Infinity or underflowed to 0, and 0 reads as singular | the product is carried as mantissa and exponent: 0 only for a singular matrix; ±2^-1074 and ±Infinity past the ends |

New: `core/exact.js` (`sumSign`, `sumRatio`: exact signs and quotients of sums of products of doubles, in whole-number arithmetic) and `float.scalb`.

Results:
- **350 checks pass**, 28 more than before. The golden hashes of trig and basis are unchanged.
- **The independent audit scripts,** rerun on the fixed code, find nothing: 300,000 adversarial pairs for the rounded operations, 60,000 near-double cubics (every root within 4 doubles of an exact sign change, most within 1).
- **Browsers:** 13 of 13 areas the same in Node, Chromium 158, Firefox 159 and WebKit 27.2, page and worker. The digest now covers the new paths.
- **Mutation check:** 44 of 50 caught. The six that survive change nothing observable: three only cost speed (the fast path is then never certified), two are equal in exact arithmetic (a tie between two changes of variable; (1 − x)(1 + x) against 1 − x² in 106 bits), and one removes a second defence no input is known to need (the quadratic's discriminant sign, right in doubles on 3 million near-zero cases).
- **Cost:** a cubic takes 2.4 µs (9 µs when two roots are close), a quadratic 0.5 µs, a rounded product and quotient 51 ns together.
- **What held without change:** addition's bounds, the elementary functions (all inside their stated ulps on hard families; acos worst at 2.32 of 3), interval sin and cos (480,000 exact values enclosed), the linear solvers, box transforms, the predicates, immutability of every returned record, and determinism (no hidden clock, randomness, locale or key order).

Two findings were design decisions, not faults. The owner took option A on both the same day, and 0.0.8 builds them:
- **D-size.** A Tolerance now carries `size`, the side of the box the model must fit in (default 1e6 mm, 1 km). `ang` defaults to `lin` / `size` (1e-12) and may not exceed it; `lin` must be at least `size` · 1e-13. `inBox(p, tol)` tests a point. The limit belongs to the tolerance: a larger model declares a larger box with a matching tolerance, and other engines are not bound by it.
- **D-wire.** `toData` / `fromData` on `tol`, `limits`, `frame` and `basis`, and `fromEnvelope` on `errors`: plain, JSON-safe data out, every check again on the way in. Tested through `structuredClone` and JSON.
- **365 checks pass;** the digest hashes are unchanged.

### S5 — curves (2026-11-14, version 0.0.9)
Built (the engine, `lib/solid/`):

| File | What it is |
|---|---|
| `geom/nurbs-curve.js` | NURBS curves as checked, frozen records `{ type: 'nurbs', deg, knots, cvs, w }` — cc-nurbs' plain data, so they pass to cc-nurbs and its STEP and IGES writers as they are. `make` / `isCurve` / `toData` / `fromData` (D-wire); `domain`, `bbox`, `point`, `derivs`, `tangent`, `curvature`, `curvatureVector`, `torsion`, `isClosed`; `insertKnot`, `refine`, `removeKnot`, `decompose`, `elevate`, `reduce`, `split`, `segment`, `reverse`, `reparam`, `transform`, `join`; `deviation` |
| `core/errors.js` | `solid.err.not_within_tolerance` { what, tol, error? } (KAD2 `REFUSED_TOLERANCE`): an approximating operation that cannot stay within the tolerance it was given |
| `index.js` | VERSION 0.0.9; the `nurbsCurve` namespace |

Built (the tools, `tools/solid/`): `test-curve.mjs` (section `curve`); `digest.mjs` gains `genCurveData` and a `curve` area (14 areas); `test-geom.mjs` exports its exact Cox–de Boor reference as `exactBasis` for the curve tests.

What engine.solid adds to cc-nurbs' `curve.js` (whose algorithms it calls: A4.1, A3.2/A4.2, A5.1, A5.8, § 5.3, § 5.5, § 5.6):
- **One check, then trust.** A curve is a record made by `make` only; degree, knots (clamped, interior multiplicity ≤ deg), points, weights and ranges are checked once.
- **No silent clamping.** cc-nurbs moves a parameter outside the domain onto its end; engine.solid refuses it.
- **Knots compared exactly, with cc-nurbs' reading kept consistent.** cc-nurbs treats knots within `KTOL · (b − a)` as one knot. A curve whose distinct knots come that close is refused (`near_knots`), and a parameter that close to a knot means that knot, so the two readings never disagree.
- **Polynomial derivatives directly as Σ N⁽ᵏ⁾ P** (A3.2 on cc-nurbs' A2.3). cc-nurbs runs the rational quotient for every curve; its weight derivatives, zero in exact arithmetic, left rounding noise in the rows above the degree, which are now exactly 0.
- **Curvature and torsion that cannot overflow or underflow:** C′ is brought to [1, 2) by an exact power of two first, and the power is applied last (`float.scalb`). Where C′ = 0 they are refused (`degenerate`), not reported as 0.
- **Elevation reproduces the curve.** The knots elevation adds are removed only while the curve moves less than 2^-40 of its size (cc-nurbs allows 1e-10).
- **Reduction is proved, not estimated.** `deviation(c1, c2)` raises both curves to one degree and refines them to one knot vector; the largest distance between matching control points then bounds the distance between the curves (their difference is a B-spline with those points, and its values are convex combinations of them). `reduce` keeps a result only when that bound is within `tol.fit`, and polynomial curves only (for rational ones no such bound holds).

Acceptance (HANDOFF §14, S5):

| Criterion | Result | Test |
|---|---|---|
| Every shape-preserving op reproduces the curve to ≤ 1e-12 on random curves | **pass** on 400 random curves, rational and not, degrees 1–12, compared point by point at every knot and 24 random parameters, relative to the curve's size. Worst: insertKnot 5.6e-16, refine 5.3e-16, decompose 7.1e-16, split 1.0e-15, segment 1.8e-15, transform 3.9e-16, reverse 1.0e-14, join 1.6e-14, reparam 9.2e-14, elevate 5.8e-13 (the knot-removal step, held to 2^-40 ≈ 9.1e-13) | `curve` |

Also checked:
- **Points against the exact value** (Σ N·w·P / Σ N·w in BigInt rationals): every coordinate within (16p + 8) u of the size of its terms; 7500 coordinates, degrees 1–15; measured worst 0.091 of the bound.
- **Derivatives:** polynomial curves within 8 p² u of the exact derivative (worst 0.165 of it); rational curves agree with the quotient rule done exactly in BigInt (worst 7e-5 of a 1e-9 relative bound).
- **Closed forms:** a quarter circle's curvature is 1/r to 8.9e-16 and κN points at the centre; the twisted cubic's curvature and torsion match theirs to 6.7e-16; a straight line has curvature and torsion exactly 0. With the parameter scaled by 2^±400 (2^±300 for torsion) the answers are the same bits, where the textbook formula failed 88 times.
- **Knot removal keeps its contract:** an inserted knot comes out again with the original knot vector (399 of 400; once, A5.8 declined because rounding near another knot is amplified by 1/α, and the curve came back unchanged); a knot whose removal would move the curve 1e-4 stays at `tol.lin` = 1e-6 and goes at 1e-3.
- **Elevation:** every interior multiplicity rises by exactly t in 224 of 226 polynomial cases; in the other two one added knot stays (the same curve, one knot more); none ever ends below m + t.
- **Every refusal** has a test that throws it (`curve`).

Measured (Node 24, this Windows machine): a degree-3 point 505 ns (2.0 M/s; HANDOFF § 16.2 asks for ≥ 2 M/s; raw cc-nurbs 452 ns); `derivs` with d = 2 about 5.3 µs, most of it A2.3's allocations (S43); curvature 6 µs; elevating a 103-point cubic 6.8 ms; insertKnot 62 µs; `make` with every check 110 µs.

- **Mutation check:** 22 faults. The first run caught 18; each survivor showed a missing test (removal of a knot the curve needs, a join across a real gap, reverse on knots that round, a reduction cc-nurbs gets wrong — below). With those four tests, **22 of 22 caught**.
- **The whole suite:** 426 checks in about 60 s.
- **Browsers:** the digest's new `curve` area is recorded for Node (`digests.json`, 0.0.9). Playwright is not installed on this machine, so Chromium, Firefox and WebKit have not run it yet: `node tools/solid/browser-run.mjs` before the pull request.

### S6 — surfaces (2026-11-14, version 0.0.10)
Built: `geom/nurbs-surface.js` — tensor-product NURBS surfaces as checked, frozen records `{ type: 'nurbs', degU, degV, knotsU, knotsV, cvs, w }` (cc-nurbs' plain data): `make` / `isSurface` / `toData` / `fromData`; `domainU`, `domainV`, `bbox`, `point`, `derivs` (SKL, k + l ≤ d), `normal`, `curvature` { K, H, k1, k2, d1, d2 }, `normalCurvature`; `isoCurve`, `edgeCurve` (curve records of S5); `insertKnot`, `refine`, `elevate`, `split`, `reverse`, `swap`, `reparam`, `transform` per direction; `deviation`. `index.js`: VERSION 0.0.10, the `nurbsSurface` namespace. Tools: `test-surface.mjs` (section `surface`); `digest.mjs` gains `genSurfaceData` and a `surface` area (15 areas).

What engine.solid adds to cc-nurbs' `surface.js` (A4.3, A3.6/A4.4, the row-by-row operations of § 5.2 and § 5.5):
- **The S5 checks, in two directions:** clamped knots per direction, named `knotsU` / `knotsV` in refusals; a rectangular net; at most 2^20 control points.
- **Polynomial partials directly (A3.6 on cc-nurbs' A2.3)**, so every row above a degree is exactly 0.
- **Iso-curves blended directly** (no division by a weight that is 1 to rounding for a polynomial surface); edge curves are the boundary rows themselves.
- **Elevation keeps one knot vector.** Each row is elevated, then the knots elevation added are removed only as far as every row allows (each row is asked first), within 2^-40 of the size. cc-nurbs removes per row and, when the rows disagree, keeps all the knots.
- **Normals that never guess.** Su × Sv after scaling by powers of two. On an edge collapsed to a point (a pole) the normal is the limit from inside the domain, Suv × Sv or Su × Suv with the sign of the inside. Anywhere else, partials that vanish or are parallel within `tol.ang` are refused (`degenerate`); cc-nurbs falls back to `[0, 0, 1]`.
- **A pole is judged as a length, not a ratio:** `|Su| · (b − a)`, the reach of a partial across its domain, against `tol.lin`. The first version compared `|Su|` with `|Sv|` and called an ordinary point of a surface whose u-domain was 1e9 wide (and v-domain 0.02) a pole; the random normal test found it.
- **Curvature in an orthonormal frame of the tangent plane:** the principal curvatures are the eigenvalues of a symmetric 2 × 2, (a + c)/2 ± √(((a − c)/2)² + b²), with no H² − K cancellation (a sphere, umbilic everywhere, keeps k1 = k2 = 1/r to 1e-14). Refused at a pole (it needs a limit not taken here).

Acceptance (HANDOFF §14, S6):

| Criterion | Result | Test |
|---|---|---|
| Same shape-preservation tests as S5 | **pass**, in u and in v, on 120 random surfaces, rational and not, compared on grids with every knot pair, to 1e-12 of the size. Worst: insertKnot 6.5e-16, refine 8.6e-16, elevate 9.3e-16 (3.3e-15 raised by up to 3 in both directions on 60 more), split 9.1e-16, swap 5.3e-16, transform 4.6e-16, reverse 3.8e-15, reparam 2.7e-14 | `surface` |
| Normal orthogonality | **pass:** n · Su, n · Sv and |n| − 1 within 8 u (worst 5.6e-16) on random surfaces, on the side of Su × Sv | `surface` |

Also checked: points within (16(p + q) + 16) u of the exact value in BigInt rationals (worst 0.059 of the bound); polynomial partials against exact ones (worst 4.4e-4 of a 1e-12 relative bound), rational ones against A4.4 done exactly (1.1e-6 of 1e-9); a sphere octant (radius, K, H, k1, k2, the normal at the centre to 7.4e-15; the pole's limit normal (0, 0, −1) for every v), a cylinder and the saddle z = xy against closed forms, Euler's formula for normal curvature; iso-curves against the surface (4.1e-16); deviation against a known perturbation and against sampling; every refusal.

Measured (this machine): a bicubic point 1.37 µs (cc-nurbs 1.31 µs); `derivs` d = 2 12 µs, `normal` 11 µs, `curvature` 14 µs — allocation-bound, S43; elevating a 12 × 12 bicubic net 2.4 ms.

- **Mutation check:** 23 faults; 21 caught at first. The two survivors were missing tests: `reverse` on knots that round (decimals), and a loose removal tolerance in `elevate`, which only shows on a surface where removing an added knot would move a row by more than rounding. A search over 4000 random surfaces found two such surfaces (seed 9); they are now fixtures. **23 of 23 caught.**
- **The whole suite:** 461 checks.
- **Browsers:** the `surface` area is recorded for Node (`digests.json`, 0.0.10); the browser run is pending with the `curve` area.

### S7 — analytic classes and exact conversions (2026-11-14, version 0.0.11)
Built (the engine, `lib/solid/geom/`):

| File | What it is |
|---|---|
| `analytic-curve.js` | `line`, `lineThrough`, `circle`, `ellipse` as frozen records on `math/frame.js` frames (a circle or an ellipse carries a `phase`, so that a reversed ellipse keeps its axes); closed-form `point` and `derivs` (the derivatives of (cos, sin) are a quarter turn each, `cycle`); `tangent` … `torsion` through `diffgeo.js`; `toNurbs` (exact: A7.1 arcs on `core/trig.js`, pieces of at most a quarter turn, knots at the pieces' angles); `reverse` (same domain); `transform` (rigid: the same type; otherwise the exact NURBS image); `bbox`; `isClosed`; `arcNet`; `toData` / `fromData` |
| `analytic-surface.js` | `plane`, `cylinder`, `cone`, `sphere`, `torus`, `revolution` (any curve about an axis), `extrusion` (any curve along a direction), in STEP's parameterisations (ISO 10303-42); closed-form SKL; normals and curvature through `diffgeo.js` (poles and the apex by their limits); `toNurbs` (exact tensor products of arcs and lines; revolution by A8.1 on the profile's own net); `transform`; `bbox`; `toData` / `fromData` (a profile travels as its own data) |
| `curve.js`, `surface.js` | one interface for every curve and every surface (HANDOFF § 6.1, § 6.2): a NURBS record or an analytic one, the same calls |
| `diffgeo.js` | the differential geometry of S5 and S6 (tangent, curvature, torsion; normal with the pole limit, the fundamental forms, principal curvatures, normal curvature), moved out of `nurbs-curve.js` and `nurbs-surface.js` so the analytic shapes share it. Bit-identical: the recorded S6 hashes did not move |
| `index.js` | VERSION 0.0.11; namespaces `analyticCurve`, `analyticSurface`, `curve`, `surface` |

Tools: `test-analytic.mjs` (section `analytic`); `digest.mjs` gains an `analytic` area (16 areas).

Acceptance (HANDOFF §14, S7):

| Criterion | Result | Test |
|---|---|---|
| Converted radius / axis error < 1e-12 | **pass:** every point of `toNurbs` on circle and ellipse arcs (reversed ones included, which carry a phase) satisfies the analytic equation to 1.7e-14; on planes, cylinders, cones, spheres and tori (radius, distance from the axis, height) to 1.8e-14; revolution of a rational profile keeps the profile's height and distance from the axis to 4.4e-15; the same points as the analytic shape at every knot (8e-16) | `analytic` |
| Area of sphere / torus patches vs closed form < 1e-9 relative | **pass:** 5.6e-15 (the converted patches, 24-point Gauss–Legendre per knot span, 12 random patches of each) | `analytic` |

Also checked: points against the textbook formulas evaluated with `Math.sin` / `Math.cos` and Rodrigues' rotation (4.6e-16 of the size); derivatives up to C⁗ and Suu, Suv, Svv against fourth-order central differences (5.2e-11); A7.1's pieces (⌈span / (π/2)⌉, none longer than a quarter turn, weights ≥ cos(π/4)); outward normals and principal curvatures of sphere, torus, cylinder, cone and plane against closed forms (1.1e-15); the sphere's poles and the cone's apex by their limits; reverse (once and twice) and rigid / non-rigid transforms; `toData` / `fromData` through `structuredClone` and JSON for every type.

- **Mutation check:** 25 faults across the four modules. The first run caught 20; the five survivors were five missing tests (third and fourth derivatives, the quarter-turn rule, conversions of curves with a phase, reversing twice, revolution surfaces' derivatives). With them, **25 of 25 caught.**
- **The whole suite:** 483 checks.
- **Browsers:** the `analytic` area is recorded for Node (0.0.11), pending with the `curve` and `surface` areas.

### S8 and S9 — fitting and construction (2026-11-14, version 0.0.12)
Built together, as two modules with one section each:

| File | What it is |
|---|---|
| `geom/fit.js` (S8) | `interpolate` (A9.1 with chord, centripetal or uniform parameters and optional end derivatives), `approximate` (§ 9.4.1, the control-point count raised until every point is within `tol.fit`), `fromSpline` (a KAD / DXF SPLINE: its control form as it is, or its fit points through `interpolate` with the end tangents scaled by the chord length), `params`. On cc-nurbs' `fit.js`; every answer is checked against its data: an interpolation that misses a point by more than `tol.lin` is refused, and an approximation's `error` is the largest distance from each point to the curve's point at its parameter — a bound on its distance to the curve |
| `geom/construct.js` (S9) | `compatible` (one degree and one knot vector, knots merged by value), `ruled`, `loft` (skinning, § 10.3: the v parameters averaged over the columns, A9.1 per column, rational sections through homogeneous columns), `coons` (bilinearly blended, S = Lc + Ld − B, as one exact NURBS for polynomial curves), `interpolateGrid`, `extrude` and `revolve` (analytic surfaces, exact). Each result is checked against what it was built to pass through, within `tol.lin` |
| `index.js` | VERSION 0.0.12; namespaces `fit`, `construct` |

Tools: `test-fit.mjs` (sections `fit` and `construct`); `digest.mjs` gains a `fitting` area (17 areas).

Acceptance (HANDOFF §14, S8 and S9):

| Criterion | Result | Test |
|---|---|---|
| S8: interpolation passes through data to 1e-10 | **pass:** 5.3e-16 of the size on 60 point sets from known shapes (degrees 1–5, all three parameterisations); end derivatives as given | `fit` |
| S8: approximation error ≤ requested fit on a test corpus | **pass:** 30 point sets (helix, wave, cubic, ellipse arc, a nearly straight line with small detail) at 0.1, 0.01 and 0.001 mm; fewer control points than points in all 30; every point's true distance to the curve (dense search, then a ternary search) within the reported error | `fit` |
| S9: skinned surface passes through sections | **pass:** 1.4e-14 on 30 lofts of 2–6 sections, a third rational; the section parameters are the columns' averaged chord parameters | `construct` |
| S9: compatibility refusals typed | **pass:** `near_knots`, `too_few`, `not_a_curve`, `not_an_array`, `repeated`, `corners`, `rational` each thrown by a test | `construct` |

Also checked: `compatible` leaves every curve unchanged (deviation 0 to rounding) on 40 random sets; ruled surfaces' v-lines are segments (rational included); a Coons patch's edges are its four curves and its interior is Lc + Ld − B (1e-12); grid interpolation passes through the grid (3.6e-15); extrude and revolve stay analytic.

Found by search, now fixtures: **cc-nurbs' interpolation can miss its own points** on ill-conditioned data (11 points spaced 1e-4 to 1e4 apart, degree 10: by 1e-4; as a loft through 11 such sections, by 1e-3). Both are refused (`solid.err.not_within_tolerance`) with the error they would have left.

- **Mutation check:** 18 faults; the first run caught 12, and five survivors were missing tests (an ill-conditioned interpolation and loft, the magnitude of a SPLINE's end tangents, the averaging of the loft parameters, every point of an approximation). With them **17 of 18 caught**; the survivor removes the first of two guards against knots that snap to a neighbour in `compatible`, and the second (the knot vectors must come out equal) refuses the same input.
- **The whole suite:** 506 checks.

### S10 — queries (2026-11-14, version 0.0.13)
Built:

| File | What it is |
|---|---|
| `geom/query.js` | for every curve and surface (through `curve.js` / `surface.js`): `closestOnCurve`, `invertCurve`, `closestOnSurface`, `invertSurface`, `length`, `area`, `curveBox`, `surfaceBox` |
| `math/bvh.js` | a bounding-volume hierarchy of boxes: `build` (median splits on the longest side, deterministic), `overlapping`, `nearest` (best-first, pruned by box distance), `boxDistance` |
| `index.js` | VERSION 0.0.13; namespaces `query`, `bvh` |

How the closest point is found (HANDOFF § 6.4, made global):
- **Curves:** each knot span (or eighth of a turn) sampled at 4(p + 2) + 1 points; in every sample interval where g′(t) = 2 C′ · (C − p) goes from − to +, Newton kept inside the interval (`math/roots.js`). Inside a span its own derivative is used at its right end (the evaluator gives the next span's at a knot). The best of all of them, and the ends.
- **Surfaces:** the knot cells sampled at 2(p + 2) × 2(q + 2) points; from the best sample a damped Newton descent, halving a step until the point comes closer; every boundary line and interior knot line searched as a curve; the best polished by alternating whole-line searches, then descended again; and for a NURBS surface, **branch and bound over its Bézier patches**: a patch's net box is a lower bound on its distance (positive weights), patches that cannot beat the best are dropped, the others searched from their middle and cut in four (raw de Casteljau halving, no record checks), up to 3000 patches. (A Gauss–Newton fallback and descents from the twelve best sampled minima came first; the mutation run below showed they no longer did anything.)
- **Tight boxes:** Bézier hulls, a piece split while its hull reaches more than `slack` beyond the box of points on the shape (its corners); the union of the hulls, widened by 4 ulps of the size. The split direction is the one where the net reaches further (a length), never weighted by the parameter widths.
- **Length:** adaptive Gauss–Legendre per span (`math/quad.js`). **Area:** 8- and 16-point Gauss products per knot cell, a cell quartered while they differ by more than its share of `eps`.

Acceptance (HANDOFF §14, S10):

| Criterion | Result | Test |
|---|---|---|
| Closest-point matches brute force on 1e4 random queries | **pass:** never farther than a brute-force search (400 samples, then refined) on 10,000 queries to 100 NURBS curves and 80 arcs (worst 6.0e-16 of the size above it); on surfaces, 1800 queries to 20 random NURBS surfaces (rational, very uneven parameter widths) and 42 analytic ones (spheres, tori, cylinders, cones either way of the apex, planes, extrusions and revolutions of wavy profiles), against a 61 × 61 grid then refined (1.5e-16) | `query` |
| bbox contains dense samples and is within slack | **pass:** 86 curves and surfaces hold every sample and every side's local extreme found by search; each box within its slack (1e-3 of the size) of the shape's own box; 48 of 60 curve boxes tighter than the control net's | `query` |

Also checked: inversion (points on the shape come back within 1e-9; a point off it is refused); lengths of circle arcs (analytic and converted) and segments to 4e-16; areas of sphere, torus and cylinder patches to 1.3e-15, and of sphere patches under a Möbius change of parameter (the same surface, its parameter speed varying several hundredfold) to 6.7e-16, each within its reported error; the BVH against brute force on 300 queries over 500 boxes, by the distance to each box's centre and by the box distance.

What the random tests found on the way (each fixed in the engine, not in the tests):
- the bracket test read a span's derivative from the next span at a knot (degree-1 curves: a sample stood in for the minimum);
- two minima close together hid each other's brackets when only sampled-distance minima were refined;
- Newton's step from a seed headed for a saddle, and halving it never helped (a Gauss–Newton fallback, later superseded: see the mutation run);
- a narrow diagonal valley stalled both the joint step and coordinate searches (the branch and bound);
- a BVH leaf returned all its items without testing their own boxes;
- the box split chose its direction by parameter width × length, and on a surface 28 wide in u and 0.013 in v never split in v.

- **Mutation check:** 18 faults, each run checked first on the unmutated section. The first run caught 14. Two survivors were missing tests and now fail: an area whose parameter speed varies (the Möbius test above) and a nearest-box search whose distance is not a multiple of the box distance. Two showed code that no longer did anything: with branch and bound and the line polish in place, the Gauss–Newton fallback and the descents from the eleven next-best sampled minima changed no answer on 1800 queries and cost time (1200 queries: 38.0 s with them, 34.6 s without); both were removed. A fresh run on the final code (the 16 faults that still apply and two new ones on the simplified search) **caught 16 of 18**. The two survivors are the line polish and the first descent from the best sample: on today's 1260 analytic queries each is covered by the other and by the knot-line searches. They stay, because analytic surfaces have no lower bound yet ("Found").
- **The whole suite:** 518 checks, all passing, on the tree as committed (about 4 minutes on this machine; the `query` section is about 90 s of it).

### S11 — the topology data model (2026-11-15, version 0.0.14)
Built:

| File | What it is |
|---|---|
| `topo/brep.js` | the B-rep as immutable snapshots (§ 8.1, § 8.3): frozen records with stable integer ids in seven tables (vertex, edge, coedge, loop, face, shell, solid). `edit(b, fn)` makes a new snapshot through a draft that adds, changes and removes records, and for the Euler operators (S12) also makes a coedge in no loop yet, builds a loop of existing coedges and relinks a loop; it shares every record it did not touch and checks the structural rules before it returns. `check` (ids, references, back-references, sharing, closed loops, edge ranges, senses, empty solids, orphans); `adjacency` (cached per snapshot); `euler` counts; `toData` / `fromData` (holes and counters kept) |
| `topo/names.js` | persistent names (§ 8.6): FNV-1a in two 32-bit lanes over (operation, inputs, role), each part closed by a separator no part may hold, 64 bits shown as `n` + 16 hexadecimal digits |
| `core/errors.js` | `solid.err.bad_topology` { rule, kind, id } (KAD2 `AUDIT_FAILED`) |
| `index.js` | VERSION 0.0.14; namespaces `brep`, `names` |

Decision **D-store** (§ 8.3, § 17): whole-table copies per edit. Measured: a 1,000-face sheet (V 1066, E 2065, built in 26 ms) takes 100 edits at 3.9 ms each, every edit copying the seven tables and checking every rule — far inside "no visible lag". Chunked tables only if a later benchmark asks for them.

Acceptance (HANDOFF §14, S11):

| Criterion | Result | Test |
|---|---|---|
| 1,000-face body × 100 ops benchmark recorded | **pass:** 3.9 ms per edit (copy and full check) | `topo` |
| round-trip clone equality | **pass:** a cube, and a cube with a face removed, through `structuredClone` and JSON: the same tables, holes and counters | `topo` |

Also checked: a cube's tables, Euler–Poincaré and adjacency (two faces an edge, three edges a vertex, every edge once each way, outward faces); copy-on-write (untouched records are the same objects in both snapshots); ids never reused; every structural rule fires on a cube broken on purpose; the draft's refusals; coedges made, moved and relinked; an edge used twice by one face counted once; a counter behind its table refused; names: the same recipe gives the same name, 20,000 inputs give 20,000 names, and three recorded names hold (a change to the hash would rename everything in every saved model).

Found by its own tests: a coedge listed by two loops was reported as a broken back-reference and never as `shared`, so the more exact rule could not fire; sharing is checked first now. The name hash also hashed the number of inputs, which the separators already make redundant; it went before any name was recorded.

- **Mutation check:** 23 faults in `brep.js` and `names.js` (each rule of `check`, the copy, the freeze, ids, the cache, the counts, the draft's calls, the name hash), the section checked first on the unmutated code: **23 of 23 caught** — 19 by the check written for them, and four because the fault breaks every edit and the section throws.
- **The whole suite:** 542 checks, all passing, on the tree as committed.

### S12 — Euler operators and builders (2026-11-15, version 0.0.15)
Built:

| File | What it is |
|---|---|
| `topo/euler.js` | the Euler operators (M. Mäntylä, *An Introduction to Solid Modeling*, 1988) in this model's terms: `mevvlfs` / `kevvlfs` (this model's loops are never empty, so the smallest shell is a lamina: one edge and the face whose loop runs along it and back), `mev` / `kev` (struts), `semv` / `jekv` (an edge split and joined), `mef` / `kef`, `mekr` / `kemr`, `kfmrh` / `mfkrh`. Each keeps V − E + F − R = 2 (S − G), names coedges where a vertex can come twice in a loop, and returns the new snapshot and the ids it made; geometry is the caller's |
| `topo/build.js` | `polygon` (a lamina by Euler operators), `sweep` (Mäntylä's translational sweep: a strut from each vertex, then the side face of each edge; a face of a solid swept inward makes a pocket), `polyhedron` (sewing by vertex identity; turned outward by its signed volume; each face on the plane of Newell's normal), `sew` (HANDOFF § 8.4's second way: points within tol.lin are one vertex, refused when closeness does not split them cleanly; then `polyhedron`) |
| `index.js` | VERSION 0.0.15; namespaces `euler`, `build` |

Acceptance (HANDOFF §14, S12):

| Criterion | Result | Test |
|---|---|---|
| Euler–Poincaré holds for random op sequences | **pass:** 600 random operations on a growing model (418 made, 124 refused with `bad_input` as they should be): each changed V, E, F, L and S exactly as its table says, and the formula held after every one; 148 operations followed by their inverse gave back the model they started from, up to ids | `euler` |
| box/prism built both ways are equivalent | **pass:** 8 prisms (a rectangle, a hexagon, an L that is not convex, five random convex polygons in random planes; straight and oblique) by Euler sweep and by the polyhedron builder: the same vertices round every face, the same outward normals, the same counts (V = 2n, E = 3n, F = n + 2), the volume area × height | `euler` |

Also checked: a polygon lamina (front through the points, back the other way); a unit cube, and the same given inside out, comes out outward; a square frame of sixteen quadrilaterals is a torus (genus 1); a hole through a block made with Euler operators only (struts and `mef` draw a square on the top, `kemr` leaves it a ring, a sweep down makes a pocket, `kfmrh` opens it into the bottom): V 16, E 24, F 10, R 2, genus 1, every face outward and on its plane, volume (9 − 1) × 2; a cube sewn from six separate faces whose corners are each jittered by up to 0.3 tol.lin; what the defaults keep (the larger tolerance on a join, the parent's surface and sense on a new face, the original face's id through `kef`, the other sense from `mfkrh`); a vertex another shell uses is not removed; every refusal typed (26 of the operators', 23 of the builders').

- **Mutation check:** 23 faults across the operators and the builders (where a strut goes in, which end a kill removes, the order a split puts its halves in, which face a kill keeps, the default senses, the checks on shared vertices, the sweep's planes and order, the builders' refusals), the section checked first on the unmutated code: **23 of 23 caught**. Six of them needed the targeted checks added this session (the defaults and the shared vertex); the random sequence alone did not see them.
- **The whole suite:** 557 checks, all passing, on the tree as committed.

## Learned
- **S12: a random test needs aimed candidates.** Operators picked their arguments from everything in the model, so the ones with narrow preconditions (`jekv` on a split vertex, `kevvlfs` on a bare lamina) succeeded three or four times in 600; drawing three times in four from the candidates they can act on (and still sometimes from anything, so the refusals are tested too) made every operator succeed at least seven times.
- **S11: the order of checks decides which rule can fire.** A coedge listed by two loops broke two rules at once, and the one checked first (back-reference) always won, so `shared` could never be seen; a test that breaks one rule on purpose is how that shows.
- **S10: a survivor can be dead code.** Two faults survived every test added for them: dropping the Gauss–Newton fallback, and descending from one sampled minimum instead of twelve. Each had fixed a real failure before branch and bound and the line polish existed; after them neither changed an answer on 1800 queries, and timing showed both cost time. They were removed, and the file header that described them was rewritten: a mutation run is also how stale code is found.
- **S10: a test can be blind to the fault it is for.** The BVH test's distance was twice the box distance, which makes pruning at half the best distance exact; a distance to each box's centre, not a multiple of the box distance, catches it. The area test's surfaces were so smooth that one 8-point rule per cell met 1e-9; a Möbius change of parameter (the same surface, its weights times c^i) needs the adaptive rule.
- **S10: "global" needs a lower bound.** Sampling, Newton, Gauss–Newton and coordinate searches each failed on some random surface; only a bound that can rule regions out (a Bézier patch's net box) makes the search global. The local methods then serve to tighten the best answer quickly, so the bound prunes early.
- **S10: a referee can be weaker than the claim it judges.** Samples on a wiggly rational surface miss its extremes by more than the slack being tested; the referee's sides had to be pushed out by local search before it could judge a tight box.
- **S10: keep record checks off inner loops.** Branch and bound through checked surface records (every quarter patch made and validated) ran for more than ten minutes; on raw homogeneous nets with de Casteljau halving the same search takes a fraction of a second.
- **S8: a solver's answer must be checked against the question.** A9.1 is well posed, and its matrix still loses digits on data spaced over eight decades; the residual at the data says so in one evaluation per point.
- **S8: a test of a bound needs a referee finer than the bound.** A 2000-sample search over a 100 mm curve is 0.05 mm coarse, and it "found" violations of a 0.001 mm bound that were not there.
- **S9: a test can be too symmetric to see a fault.** Loft columns that all moved by the same amount had the same parameters, so "the first column's" and "the average" agreed; the fixed test moves each column differently.
- **S7: a refactor must keep the bits.** Moving the differential geometry into `diffgeo.js` first changed one `V3.unit(n)` into `n · (1/|n|)`, and the recorded `surface` hash caught the difference; the division came back, and the hashes held.
- **S7: a test whose base fails proves nothing.** One mutation run reported 25 of 25 caught while the unmutated section was throwing; every mutant "failed" for the wrong reason. The base run comes first, every time.
- **S7: an ellipse cannot be reversed by turning its frame.** C(T − s) of an ellipse is an ellipse in the frame (x, −y, −z) at the angle s − T − φ, so the record carries a phase; a circle uses the same rule, with no trig and no rounding of its axes.
- **S6: a ratio of partial derivatives is not geometry.** Whether |Su| is small beside |Sv| depends on how each direction is parameterised; whether |Su| · (b − a) is below tol.lin does not. Random domains of very different widths (1e9 beside 0.02) are what showed it.
- **S6: rounding noise looks like a direction once it is scaled.** On a rational sphere, Sv at the pole is about 1e-16, not 0; scaled to unit size before a cross product it gave a normal at right angles to the true one. Magnitudes are judged before anything is normalised.
- **S6: search for the inputs a mutation needs.** A guard that matters on one input in a hundred survives random tests; a seeded search over thousands of inputs found two surfaces that exercise it, and they became fixtures.
- **S5: an estimate is not a bound.** cc-nurbs' degree reduction estimates the error of the reduced pieces, then removes knots with whatever tolerance is left; the two add up past the tolerance (a fixture in `curve`: asked for 0.1489, estimated 0.0496, moved 0.167). A bound that can be proved (`deviation`: control points of one degree on one knot vector) costs one elevation and a refinement and settles it.
- **S5: the mutation run tests the tests.** Four of 22 faults survived the first run, and each one pointed at an input the tests never drew: a removal that must be declined, a join across a real gap, knots where a + b − b is not a, a reduction that is wrong upstream. Random inputs built from whole numbers and powers of two are exact by design, so they hide rounding; the fixes draw decimals on purpose.
- **S5: two readings of "the same knot" must agree.** cc-nurbs compares knots with a tolerance, engine.solid exactly. Rather than change either, the curve record refuses knots that only one of them would merge, and a parameter that close to a knot is snapped to it.
- **Bug review: a passing suite says only what it was asked.** All seven faults sat in code with passing tests; each lived just outside the inputs the tests drew (unbounded intervals, huge angles, a root at exactly 0, an overflowing width, many pieces). The fixes' tests draw from those edges on purpose.
- **Second review: test the claim, not the code.** The suite checked what the code did on the inputs it was written for. The faults were in what the documentation promised beyond them ("always", "with repeats", "exact results kept"). Each promise now has a test that would fail if it were false, or has been narrowed to what is true.
- **Second review: certify, then trust.** A fast method that is usually right is made rigorous by checking its answer (a sign change within 4 doubles) and falling back to a slow method that cannot miss. The check costs six evaluations.
- **Browser runs: a NaN is not one value in memory.** Every engine agrees on what a NaN does, and none promises which bits it has. A hash over raw bits, or a function that returns them, has to choose one NaN.
- **Bug review: a waiver comment is not a guard.** `solid-allow: reach` accepted a whole import line, so it could not keep three functions out of a file. Reading the file function by function can, and needs no comment to trust.
- **The checker found a real fault on its first run.** `core/limits.js` named a local variable `self`, which is a worker global. It was renamed to `budget`. The rules hold engine.solid's own code to account, not just the fixtures.
- **PartCraft's worker loader reads raw text, comments included** (`exact-client.js` `blobModules()`). A usage line such as `import … from './x.js'` in a comment would be fetched as a module, or reported as an import cycle. Hence the `bundler` rule, and why `index.js` documents its usage without a quoted path.
- **That loader only follows certain specifiers:** single-quoted, relative, lower-case `[a-z0-9-]` names ending in `.js`. Hence the `specifier` rule, which matters for S24b, where engine.solid runs in that worker.
- **SolidError follows NurbsError: `(code, vars)`, and the message is the code.** The app words it from its language tables, whose messages use `{placeholders}` filled from `vars` (`app/lang/en.json`).
- **S4: an exact reference must avoid gcd.** Reducing BigInt fractions after every operation took 89% of the time (45 s). Giving each degree level one common denominator, the product of its knot differences, needs only multiplication and exact division; the same section runs in 9 s. All three versions of the reference gave the same measured maxima.
- **S4: prove the bound where the algorithm allows it.** A2.2 never subtracts, so its error is componentwise and provable (γ(6p)). A2.3 subtracts, so its bound is measured and recorded, as `trig.js`'s ULPS table is.
- **S3: measure the fast path, not only the answers.** The first insphere built arrays and closures on every call (510 ns); written out as scalars it computes the same operations in 107 ns.
- **S3: test exact degeneracy on purpose.** Random and nudged points almost never land exactly on a plane, circle or sphere. Integer points built to do so are what exercise the exact stage in 3D.
- **S2: the mutation run found a real gap.** With broken weights, `adaptive` had no cap on its number of pieces and ran for more than ten minutes. It now has `maxPieces` (default 4096) next to `maxDepth`, and always ends with `no_convergence`.
- **S2: an exported function is a tested function.** The transposed solve was internal and a wrong permutation in it went unnoticed; exported as `luSolveT`, it has a residual test of its own.
- **S2: Hager's estimate is exact on most matrices, not all** (1704 of 2000 random ones). The tests check what it guarantees (never below the true 1/κ₁) and what it does in practice (never 3× above).
- **S2: Math.sqrt is fully specified since ECMAScript 2025** (TC39 PR #3345, merged 2024-08-17), so + − × ÷ and √ are what every engine computes alike, and what trig.js is built from.
- **Earlier findings still stand.** Most of M1 already exists in cc-nurbs. The missing layer is exact topology. cc-nurbs' solids and booleans are mesh-based, and KAD2 documents flatten splines.

## Found (for later sessions)
- **cc-field's `detmath.js` is less accurate than it says.** Its comment claims about 1e-15 for |x| < 1e6. Measured against the BigInt reference, `dsin`'s absolute error is 3.3e-16 below 10, 5.7e-14 below 1e3, and 5.8e-11 below 1e6. The reduction multiplies by a full 53-bit 2π, so `n · 2π` is not exact. A Cody–Waite split of 2π with trailing zeros, as in `core/trig.js`, fixes it. The fix belongs in the site's `lib/field/` (owner).
- **cc-step has drifted between copies.** PartCraft's `app/step/` has a `part21.js` that the site's `lib/step/` lacks, and their `read.js` differs. Which one is canonical has to be settled before cc-step comes beside the engine (S28 or earlier). Only cc-nurbs is here so far.
- **cc-nurbs' unclamped end spans.** `findSpan` returns an empty span at a repeated end knot, and the basis is NaN (S4). engine.solid works around it. The fix belongs in the site's `lib/nurbs/` (D-ccn).
- **Exact bodies for library items.** LibraryCraft's standard parts have `body: null` (a 2D plan only). Once S20–S22 can extrude and revolve, the generators can give them exact solids: a STEP export, and a mesh made from the solid.
- **Splines and conics across the suite (owner, 2026-11-12: "This later").** Check how each app draws and stores splines and conics. Conics are exact as rational quadratic NURBS (ellipse, parabola, hyperbola); CadCraft should have them. S7 (analytic curves) is the natural place.
- **cc-nurbs' `reduce` misses its tolerance (S5).** It checks the reduced pieces against the tolerance, then removes knots with the rest of it, and the two together can exceed it (fixture in `curve`). engine.solid proves its own bound and refuses; the fix belongs in the site's `lib/nurbs/` (D-ccn): check the result as a whole, or give the removal only what the reduction left after a proved bound.
- **Unclamped curves.** engine.solid's curves are clamped (cc-nurbs' functions assume it). A converter from an unclamped or periodic knot vector to a clamped one is S6/S13 work, where periodic surfaces need it.
- **Derivative speed (S43).** Curves: `derivs` with d = 2 about 5 µs, curvature 6 µs. Surfaces: `derivs` d = 2 12 µs, `normal` 11 µs, `curvature` 14 µs. Mostly A2.3's allocations and the record checks; fine for now, slow for meshing (S15–S17 will feel it).
- **A lower bound for closest points on analytic surfaces (S10).** NURBS surfaces are made global by branch and bound; analytic ones (cylinders, cones, spheres, tori, revolutions, extrusions) still rest on samples, a descent, knot-line searches and a polish along the best point's lines. 1260 random queries found no miss, but there is no bound behind it. Closed forms for the quadrics and the torus, and the profile's own global search for revolutions and extrusions (or branch and bound on the exact NURBS forms, with their parameters mapped back), would make every type global; the polish can go then (S10's mutation run: it changes no answer on today's tests).
- **Curvature at a pole (S6).** `curvature` refuses at a collapsed edge; the limit (from the second-order expansion at the pole) is S13's, with the other pole and seam cases.
- **The sync script** (`tools/solid/sync.mjs`, built at the move) has only been run against temporary hosts; the first real run is when PartCraft takes a copy.
- **The catalogue entry** for `engine.solid` is drafted in `ENGINE.md`; publishing it is the owner's step.
- **Language-table keys:** the `solid.err.*` codes need keys in `app/lang/*.json` (English first) before the app shows them. That belongs to the first UI-facing session (S24b); `CODES` lists what is needed.
- **`fromEnvelope`** (a worker's reply turned back into an error on the main thread) belongs with the worker protocol (S18 / S24b).
- **This sandbox cannot finish PartCraft's main test file.** `test-partcraft.mjs` stopped 13 minutes in, during the tet FEA section, at more than 3 GB of memory, on 7 GB and 2 cores. This happened on the unchanged code. Before that it reported four failures on the unchanged code: two need ModelCraft in the same checkout (illustrate copies, cc-step in ModelCraft), one is an arc-method key check in `lang/en.json`, and one is `cam-sheets`. CI's runner is where that file should be judged, and CI runs only on pull requests and on `main`.
- **KUBIC's own bugs**, to fix before S36 (review §3.2): K9, an undeclared `nextSolidId`, breaks STL import; K15, network fonts, breaks the offline rule.
- **KARVE's G-code is unsafe.** Label it "preview only" or turn it off (review §4.1). KARVE also cannot read `.kbc` (V1).
- **The KAD repositories' headers still say AGPL.** The sweep belongs in those repositories (`reference/kad/README.md`).

## Next
- **S13 — trims and pcurves** (HANDOFF §14, M2: pcurves per coedge, periodic seams, poles and degenerate edges, point-in-face with exact predicates; cylinder, sphere, cone and torus bodies construct, seam and pole cases covered by explicit tests). Then S14, the auditor and the primitive corpus: release gate v0.1 ("geometry + topology + auditor").
- **Recognition (NURBS → analytic)** belongs with S7's conversions but is not built: a NURBS curve or surface that is exactly a circle, a cylinder … is not yet told apart. STEP import (S30) needs it; noted for then.
- **Owner decisions still open** (`HANDOFF.md` §17.2): D-ccn, D-kad / D-kbc. Settled: D-size, D-wire (2026-11-13), D-det (b), D-ccn2 (by the move to the site repo, 2026-11-13), D3, D-tr, D-name; D-home superseded by the move.
- **The pull request** to the site repo's `main` waits for the owner's go (D-home).
