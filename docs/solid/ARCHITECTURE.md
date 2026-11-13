# engine.solid — architecture

What the engine is, how it is put together, and why each choice was made. `HANDOFF.md` is the plan; `STATUS.md` says
what is built; `TESTING.md` says how it is checked; `COMPLIANCE.md` maps each rule the engine must follow to the evidence
that it does.

## 1. What it is

engine.solid (library **cc-solid**, folder `solid/`) is the CadCraft suite's exact solid kernel: NURBS and analytic
geometry, B-rep topology, solids, meshing and STEP, in plain JavaScript. It is an **engine** in the suite's sense
(getcadcraft.com › Build an add-on › Engines): one shared library that every app and SuperCad Studio can host, and that
add-ons can build on.

| | |
|---|---|
| Id | `engine.solid` |
| Library | cc-solid (compare cc-nurbs → engine.nurbs, cc-field → engine.field) |
| Edited copy | `lib/solid/` in `withshalom/getlibrarycraft`, branch `engine/solid` |
| Host copies | `solid/` in each host app's build folder, byte-identical (a `sync.mjs --check` comes with the first host) |
| Errors | `SolidError(code, vars)`, codes `solid.err.*` |
| Licence | Apache-2.0 |
| Version | `VERSION` in `index.js` (0.0.2 after S2) |

**Why an engine, not an app feature.** Every 3D app in the suite (PartCraft, ModelCraft, CadCraft's 3D tab, BimCraft,
SuperCad) needs exact solids. None has them today: they use mesh kernels and manifold booleans. Built once as an engine,
the same exact core serves them all, the way cc-nurbs already serves ModelCraft and PartCraft. Each app keeps its own way
of working (push/pull, feature history, BIM objects) on top of it.

## 2. Where it runs, and why it needs nothing else

- **Everywhere the same:** a page, a Worker, Node, and the desktop app. The engine uses no DOM, network, timers or
  globals, so it does not care which.
- **Embedded, offline by construction (D2).** Each host carries its own copy. An add-on that needs the engine names
  `engine.solid` in its manifest. The add-on loader (`app/addons.js`, `externalFor`) resolves `engine:solid/…` to a
  downloaded engine package when one matches, or else to the app's own copy. With an own copy, nothing is ever fetched,
  so no CAD function depends on a web service. Cloud services elsewhere in the suite (accounts, sync, the library) are
  fine; the kernel never calls them.
- **In workers:** heavy work runs off the main thread. Import specifiers are written the one way PartCraft's worker
  loader (`exact-client.js` `blobModules()`) follows: single-quoted, relative, lower-case, ending in `.js`. Its raw-text
  scan is also why comments never quote an import path.

## 3. Layers

```
core  ←  math  ←  geom  ←  topo  ←  { ops, mesh, audit, measure }  ←  io  ←  api  ←  index.js
```

A file imports only from its own layer or layers to its left. `audit` never imports `ops` or `mesh`, so the referee
cannot share a bug with what it judges. Only `geom` and above may import outside the engine, and only `../nurbs/` and
`../step/` (cc-nurbs, cc-step; D8). The boundary checker enforces all of this on every run.

| Layer | Holds | Built |
|---|---|---|
| `core/` | `errors` (typed refusals) · `tol` (the one tolerance policy) · `limits` (work budgets) · `float` (bits, error-free transformations, directed rounding) · `trig` (deterministic elementary functions) · `prng` (seeded generator) · `intervals` (outward-rounded intervals) | S1, S2 |
| `math/` | `vec3` · `mat4` · `frame` · `aabb` · `quad` · `roots` · `linalg` · `predicates` (S3) | S2, S3 |
| `geom/` | curves and surfaces: wraps cc-nurbs, adds analytic classes, exact conversions, interval bounds, intersection rings | S4–S10, S25–S27 |
| `topo/` | vertices, edges, coedges with pcurves, loops, faces, shells, solids; stable ids; Euler operators | S11–S13 |
| `ops/` | profile → face, extrude, revolve, sweep, loft, transforms, later offsets, fillets, booleans (M9) | S19–S23, M8, M9 |
| `mesh/` · `audit/` · `measure/` | watertight tessellation · the independent auditor · mass properties | S14–S17, S24 |
| `io/` | STEP read/write on cc-step, mesh formats | S28–S33 |
| `api/` | commands, argument schemas, the worker host | S18, S35 |

**Why layers enforced by a tool.** A kernel grows for 40+ sessions. Without a checked import rule, the referee ends up
calling the code it checks, and low layers start depending on high ones. A rule that fails the build is the only rule
that lasts.

## 4. Contracts every module keeps

### 4.1 Data is plain
- Points and vectors: `[x, y, z]`. Matrices: 16 numbers, **row-major**, translation in `m[3], m[7], m[11]`.
- Boxes: `{ min, max }`. Curves and surfaces: cc-nurbs' own objects.
- All of these are the same shapes cc-nurbs uses, so values pass between the two libraries, and across a worker
  boundary, with no conversion.
- Results that are records (factorizations, frames, boxes, root reports) are frozen. Plain vectors come back as new
  arrays.
- **Why row-major:** cc-nurbs' `xform` reads matrices that way, and the tests check `mat4.apply` against it to the bit.
  three.js and ModelCraft keep matrices column-major and in metres. `fromColumnMajor`, `toColumnMajor` and
  `convertUnits` convert at the boundary, which keeps the engine itself on one convention (D-mat).

### 4.2 Millimetres and radians
The engine works in millimetres, radians, right-handed and Z up. Apps convert at the boundary; ModelCraft's metres are
`convertUnits(m, 1000)`.

### 4.3 Refusal, never a quiet wrong answer
- Every failure throws `SolidError(code, vars)`. The code is a `solid.err.*` key that the app words from its language
  table; `vars` fill the message's placeholders. The engine holds no English text.
- Codes so far: `bad_input`, `bad_tolerance`, `internal`, `limit`, `no_bracket`, `no_convergence`, `singular`. Each maps
  to an upper-case KAD2 code for the KAD2 adapter.
- `toEnvelope` turns any error into plain JSON for a worker reply. Unknown errors become `internal` with no message, so
  no stack or path leaves the engine.
- **Why:** a CAD kernel that returns a slightly wrong solid is worse than one that says "cannot do this here". A typed
  refusal can be tested, translated, logged and acted on.

### 4.4 One tolerance policy
`core/tol.js` is the only file that may write a tolerance-sized number; the `epsilon` rule enforces it. Defaults:

| `lin` | `ang` | `fit` | `maxEdgeTol` | `mesh.chord` | `mesh.angle` |
|---|---|---|---|---|---|
| 1e-6 mm | 1e-9 rad | 1e-4 mm | 1e-4 mm | 0.01 mm | 0.5° |

Each value is range-checked, and the relations between them (`lin` ≤ `fit` and the like) are checked too. Numerical
thresholds that are not geometric tolerances are written as multiples of `float.EPS`.

**Why:** inconsistent tolerances between modules are the most common way kernels produce invalid topology (R3).

### 4.5 Budgets
- JavaScript cannot stop a function from outside. So every long loop counts against a budget (`core/limits.js`):
  iterations, entities, and optionally time.
- When a budget runs out, the loop throws `solid.err.limit`. A child budget can never outlive its parent.
- Counts are exact, so the same input stops at the same place. Time is the one exception, and it is off by default.

## 5. Determinism — the same bits everywhere

A kernel decides topology from comparisons. If two browsers compute a sine one bit apart, they can make different
decisions and build different solids from the same file. So:

- **Arithmetic:**
  - Only operations ECMAScript specifies exactly: + − × ÷ (IEEE 754, round to nearest), and `Math.sqrt` (fully
    specified since ES2025).
  - Exact helpers: `floor`, `abs`, `min`, `max`, `fround`, `imul` and `clz32`.
- **Elementary functions** are computed in `core/trig.js` from those operations (D-tr). Not `Math.sin` or `**`: those are
  "implementation-approximated" and may differ between engines. The `trig` rule refuses them everywhere in the engine.
  cc-field took the same route (`detmath.js`); cc-solid adds:
  - Cody–Waite reduction in four parts, carried as a double-double;
  - constants computed from π in BigInt and checked there;
  - measured error bounds (`ULPS`).
- **No `Math.random`, no `Date`.** Randomness comes from `core/prng.js` (xoshiro128**, seeded), and clocks only from a
  budget's injected clock.
- **Ordered iteration.** Arrays and sorted keys only, never hash order of outside data. The adaptive integrator halves
  "the first of the worst" pieces, so its pieces are the same every run.
- **Guarded by tests:** a golden hash of 18,000 trig results fails on any changed bit.

**Cost, measured:** sin about 37 ns per call against 21 ns for `Math.sin`, still about 27 million a second. That is the
price of identical results in every browser. Tuning comes in S43.

## 6. Robust numerics

| Need | Mechanism | Why this one |
|---|---|---|
| Know the exact error of a sum or product | TwoSum, Fast2Sum, TwoProduct (`float.js`) | exact, cheap, no wider type needed |
| Bounds that always hold | directed rounding from the sign of the exact error; outward-rounded intervals; conservative boxes | "definitely inside / outside / cannot tell" decisions (S3, S25–S27) must never be wrong, only undecided |
| Decide orientation exactly | Shewchuk's adaptive predicates (S3) on the same error-free transformations | exact sign at the cost of only a little extra work |
| Polynomial roots that keep their digits | the quadratic with an exact-sign discriminant; Kahan's cubic; compensated-Horner polishing | textbook formulas lose every digit on near-double roots (Kahan's example: 1 and 1.0000000289…) |
| Root of a function | Brent's method; Newton kept inside its bracket | guaranteed convergence; quadratic speed near simple roots |
| Linear systems | LU with partial pivoting; banded LU for B-spline interpolation; Householder least squares; Hager–Higham condition estimate | backward stable; banded storage keeps fitting O(n); the estimate costs a few solves, and never makes a matrix look worse than it is |
| Integrals (length, area, volume) | Gauss–Legendre rules, computed, not typed in; global adaptive refinement with depth and piece caps | exact for polynomials up to degree 2n − 1; handles end singularities; always ends |

## 7. Packaging and the suite

- **One edited copy, many byte-identical copies.** This is the suite's library model: canonical `lib/<name>/`, copied
  by `tools/<name>/sync.mjs` into each app, with `--check` failing on drift. It applies to cc-nurbs, shapes and
  entourage today. engine.solid follows it, so a fix lands once and every host gets the same bits.
- **Layout:** `lib/solid/` (the engine), `tools/solid/` (checker, tests, references) and `bin/test-solid.mjs`. That is
  the site's own pattern (`lib/<name>`, `tools/<name>`, `bin/test-<name>.mjs`), so the engine can move into the site's
  monorepo without changing a path.
- **Imports outside the engine:** cc-nurbs and cc-step only (D8), and only once `geom/` exists. They are not in the
  library repo yet; S4 needs them beside the engine (D-ccn2).
- **Size today:** 15 files, about 106 KB, well within the add-on package limit of 200 files and 5 MB.

## 8. Decisions and their reasons

| ID | Decision | Reason |
|---|---|---|
| D1 | NURBS-based, pure JavaScript; no Rust, no WebAssembly, no OpenCascade dependency | the suite is JavaScript; one language to read, test and ship |
| D2 | Local and embedded; no CAD function depends on a web service | apps must work offline; cloud is optional around the core |
| D3 | Booleans in scope, not dominant; feature construction first, exact booleans in M9 | both routes are needed, or splines and conics are out of reach; booleans are the hardest part, so they come last |
| D6 | Other kernels only as black-box oracles | clean copyright; the owner holds all rights |
| D8 | Build on cc-nurbs and cc-step, never edit them in place | they already do most of the spline work; fixes go upstream |
| D-name | `engine.solid` / cc-solid / `solid/` / `solid.err.*` / `SolidError` | the suite's engine naming |
| D-home | Built in the library repo, branch `engine/solid`; pull request when finished | the owner authorizes it for each app from one place |
| D-eng | Follow the engine conventions and catalogue format | the documented pattern for shared libraries |
| D-tr | Own elementary functions, bit-exact | determinism of topology decisions (§5) |
| D-mat | Row-major matrices, converters at the boundary | cc-nurbs' convention; one convention inside |
| D-prng | xoshiro128** seeded through MurmurHash3's finaliser | small, fast in 32-bit JavaScript, well studied, no bad seeds |
| D-err | `SolidError(code, vars)` like `NurbsError` | the apps' language tables fill `{placeholders}` from `vars` |
| D-spec | Import specifiers in the worker loader's form | the engine must run inside PartCraft's worker |

The full log, with dates and who decided, is in `HANDOFF.md` §17.3.
