# Review: the Exact Solids kernel in the PartCraft 0.12 lab build (KRN.1)

Reviewed 2026-11-24 for the owner. Subject: the exact solid kernel in the lab (`dev`) build of PartCraft 0.12, delivered as the
**Exact Solids add-on** on the shared kernel contract (`lib/kernel`), the CadCraft solid engine (cc-nurbs 0.12) and NVIDIA
SMLib (WebAssembly). The review covers what the solution does, how it is built, where it fails, and the STEP-import
boundary. A comparison with engine.solid is made only where engine.solid already solves a problem this solution has (§ 8).

## 0. How the review was done

- **Code under test:** the lab build's own files, fetched from `getcadcraft.com/assets/apps/partcraft/dev/` (the `dev` build's
  static assets are served publicly; the lab *page* `/lab/partcraft` needs a signed-in session). The worker's whole module
  graph was mirrored (114 files) by following its imports, plus `addons/exact-solids/` and `/assets/vendor/smlib/current/`
  (`smlib.mjs`, `smlib.wasm`, `LICENSE`, `SOURCE.txt`). ModelCraft's `dev` build was checked for the same files.
- **The lab access token was not used for any test.** No route accepted it (bearer header, query string, cookie) and no
  documented way to present it was found; everything below runs on the public `dev` assets, so none of it depends on it.
- **Harness:** Node 22 runs the lab's `krn-build.js` with the registry set up exactly as `krn-worker.js` does (the `nurbs`
  engine; the `smlib` engine registered and loaded on first use). Every part is built three times:
  - **the lab kernel** (`buildExact`)
  - **OpenCascade** through PartCraft's own `regenerateBrep` (`brep.js`, the exact kernel PartCraft had until 0.4), as a
    black-box oracle: test-only, fetched by PartCraft's own `devshell/fetch-vendor.mjs --oracles`
  - **the mesh kernel** (`kernel.js` on manifold-3d 3.5.4)

  Every exact result is also written to STEP by the lab kernel (the worker's own `step` op, replicated) and **read back by
  OpenCascade**. Closed forms and high-precision quadrature settle disagreements.
- **Coverage:** 73 hand-written parts, 31 STEP files, determinism and naming checks, scaling runs, a Node-against-Chromium
  bit comparison, and a randomized run (§ 5).
- **Not exercised:** the lab page UI, ModelCraft's Surfaces-panel path (`surfaces.js`) beyond confirming its files,
  Firefox and WebKit, real industrial STEP files (none in the repos' fixtures), assemblies with joints.

## 1. Verdict

**The architecture is right and most of the geometry is excellent.** On everything it chooses to build, the kernel agrees
with OpenCascade to about 1e-16 and is **more accurate than OpenCascade** on curved intersections. It refuses what it
cannot build instead of producing something approximate and calling it exact, it writes STEP that OpenCascade reads back as
the same solid, and it is delivered the way shared engines should be: one contract, pluggable engines, one add-on, byte-
identical in both hosts.

It is **not yet safe to rely on for two things**, and has a handful of narrower defects:

| # | Severity | Finding |
|---|---|---|
| F1 | **High** | A loft between sections of different kinds (a square to a circle) gives a **wrong solid** (volume 3982.9; OpenCascade 8891.6; the true value cannot be below 6032) and it is accepted, labelled only `approximate` |
| F2 | **High** (latent) | The STEP reader returns a **wrong solid for a surface of revolution** (`vase.step`: 1381.3 against OpenCascade's 33,292.9), labelled `approximate`, not refused. Not reachable from the UI today because import is not routed to the kernel; it becomes reachable the day it is |
| F3 | Medium | **Pattern-copy face names collapse after any SMLib feature**: `f4.wall:p9@f5#1`, `…#2` become `f4.wall:p9@f5` twice, so references to one copy become ambiguous (`krn-build.js:62`) |
| F4 | Medium | An **impossible fillet** (radius 50 on a 30 mm block) becomes a whole-part fallback instead of a feature error; the mesh kernel then builds a body of volume 13,844.9 from it. OpenCascade reports `round_no_fit` and keeps the body |
| F5 | Medium | STEP **assemblies lose instances**: a part placed twice reads as one (2 solids instead of 3) |
| F6 | Medium | STEP **surface of linear extrusion** is refused with a misleading cause (`step_empty`) |
| F7 | Medium | **Coverage holes force a whole-part fallback** on common geometry: a hole exactly tangent to a face or to another hole (`tangent`), bodies touching along an edge (`topology`), spline profiles (`spline_side`), countersink deeper than allowed (`csink_depth`), and `seam` cases found by fuzzing |
| F8 | Low | **Not bit-identical across JavaScript engines**: Node and Chromium agree on volume and area, but tessellation and centroids differ in the last bits |
| F9 | Low/Perf | Build time grows about **quadratically with hole count** (900 holes: 35 s; the mesh kernel 4.4 s) |

## 2. Architecture

### 2.1 The pieces

| Layer | Files | Lines | What it is |
|---|---|---|---|
| Kernel contract (`lib/kernel` → `kernel/`) | `index.js` | 155 | `CONTRACT = 1`; a registry (`register`, `pick(need)`, `explain`, `transfer`); engine shape (`ready`, `primitive`, `boolean`, `tessellate`, `measure`, `faces`, `edges`, `toStep`, `fromStep`, `exportSolid`, `importSolid`, `dispose`, optional `feature`, `transform`); capability levels `none / approximate / exact`; result methods `approximate / surface / exact`; hand-over between engines by fidelity (`krn.*` exact data → STEP → triangles), reporting what was tried |
| `nurbs` engine | `kernel/engine-nurbs.js`, `kernel/shapes.js` | 649 | wraps cc-nurbs as handed in (the host's own copy): exact topology, exact Booleans, exact measure, STEP in and out, rigid and mirror transforms, extrude and revolve as features |
| cc-nurbs 0.12 | `nurbs/` (26 files) | 11,559 (+4,745 since 0.11) | new: `brep.js` (exact topology, measure by line integrals, Euler–Poincaré check), `analytic.js` (plane, cylinder, cone, sphere, torus with closed-form maps), `exact.js`, `sbool.js` (exact Booleans), `ssi.js` (surface–surface intersection), `freeform.js` |
| `smlib` engine | `kernel-smlib/` (4 files) | 1,311 | wraps NVIDIA SMLib (from `usd-brep` v1.0.2, Apache-2.0, compiled to WebAssembly with `-ffp-contract=off`, single-threaded, 4.7 MB) for fillets with corner blends, variable fillets, chamfers, shells, sweeps and lofts; loaded only when a feature needs it |
| PartCraft host | `krn-host.js` 56, `krn-worker.js` 126, `krn-build.js` 1,197, `krn-tools.js` 67 | 1,446 | the worker behind PartCraft's existing `ExactKernel` seam (`exact-client.js`, the same seam OpenCascade used), and the feature-history interpreter on the contract |
| The add-on | `addons/exact-solids/` (`main.js`, `surfaces.js`, `addon.json`, `lang/`) | 211 + words | a switch (`window.ccExactSolids`, event `cc-exact-solids`); the Surfaces panel's Booleans, fillets, chamfers and shells through the contract; the refusal vocabulary (`WHY`: 66 codes) and their words |

### 2.2 How it is delivered (the plug-in pattern)

- **One add-on, two hosts.** `main.js` and `surfaces.js` are **byte-identical** in PartCraft's and ModelCraft's `dev` builds,
  and so are `kernel/index.js`, `kernel/engine-nurbs.js`, `kernel-smlib/index.js` and `nurbs/brep.js`. The two `addon.json`
  files differ only in `apps`.
- **Off by default** (`"default": "off"`); off, nothing is fetched, no worker is made, and the host is the app it was.
- **The engines never import their host.** `engine-nurbs` takes cc-nurbs as an argument; `smlib` takes a loader; the host
  decides what to hand in. The contract imports nothing outside its folder.
- **Capability-based selection.** A caller asks the registry for an engine that meets a need (`{ boolean, exact, surfaces }`)
  instead of naming one; a solid crosses engines by the best format both sides speak.
- **Honesty is part of the contract.** Every result carries `method` (`exact`, `surface`, `approximate`) and `why`; anything
  the contract cannot build becomes a named `Fallback` and the whole part is rebuilt on the mesh kernel, with the status line
  saying so. `addon.json` carries a plain statement of what is and is not exact.
- **PartCraft keeps its seam.** The kernel sits behind `ExactKernel` with the same messages (`init`, `regen`, `step`), so the
  page code that consumed OpenCascade's results consumes these unchanged, including the face-name scheme
  (`<feature>.side:<curve>`, `@<pattern>#<i>`, `.blend:<k>`): **names matched OpenCascade's** in the cases compared (a box's
  faces and edges, hole walls, pattern copies), except F3.
- **Rebuild speed.** Checkpoints of the history keyed by a hash of the features; pattern copies batched into one Boolean.

### 2.3 Assessment of the architecture

Strengths: the contract is small and engine-neutral; engines are swappable and composable (SMLib only where cc-nurbs lacks a
feature, with exact hand-over, no triangles in between); the refusal/fallback discipline is consistent; licences are clean
(SMLib Apache-2.0 with its build recorded in `SOURCE.txt`; OpenCascade only as a test oracle). It is the right template for
every engine in the suite.

Weaknesses:

- **Fallback is all-or-nothing per part.** One unsupported feature anywhere sends the whole part to the mesh kernel (F7), so
  coverage gaps are felt far beyond the feature that causes them.
- **"Approximate" is used for two different things:** "made of fitted geometry, within tolerance" and "something went wrong
  but we kept it". F1 and F2 are the second, labelled as the first. Nothing independently checks a result before it is accepted.
- **Error vs. fallback.** A user mistake inside an otherwise supported feature (F4) is routed as "the kernel cannot", which
  hands bad input to a weaker kernel.
- **Engine-specific naming leaks into the host** (`stripSmlib` in `krn-build.js`, F3).

## 3. What works (measured)

| Area | Cases | Result |
|---|---|---|
| Extrudes (blind, mid-plane, two directions, taper), revolves (full, partial, to tube, sphere, torus, cone), L-shapes, 64-gons, sketches on the top and right planes | 17 | all exact; volume against OpenCascade **≤ 6e-16** relative, against closed forms ≤ 6e-16; STEP read back by OpenCascade: one closed solid, same volume |
| Booleans: through and blind cuts, flush notch, boss, breakout of a side, coaxial equal-radius cut, cut exactly through, a 1e-6 mm sliver, face-contact union, cylinder × cylinder, sphere − box | 25 | all exact where built; ≤ 1.4e-15 against OpenCascade |
| Holes: simple, counterbore, countersink, tapped (drill size); linear and circular patterns; 10 × 10 grid; mirror of features and of the body | (in the above) | exact, ≤ 3e-15 |
| SMLib: fillet one edge, all 12 edges (corner spheres), cylinder rim, after holes; chamfer one / all / two distances; shell open top; draft 3°; straight sweep; loft square→square and circle→circle | 14 + 5 | exact and equal to OpenCascade to ≤ 3e-15; variable fillet honestly `approximate` and closer to the rolling-ball model (23,969.954 against 23,969.956) than OpenCascade (23,969.160) |
| Hostile input: zero and negative depth, open profile, zero-length edge, tiny circle (all feature errors, same as the other kernels); 1 µm box, 100 m box, 1 µm wall, collinear points, nested rings (exact) | 14 | correct |
| Unsupported features (sheet metal, rib, combine) | 3 | named fallback `feature_type` |
| **Accuracy beyond OpenCascade** | 2 | equal cylinders crossing: **3e-16** from 16/3 r³ (OpenCascade 1.1e-12); r10 × r6 crossing: **9e-16** from a 200,000-step reference (OpenCascade 6.5e-11) |
| **Robustness beyond OpenCascade** | 1 | a countersink hole that makes **OpenCascade hang for more than 60 s** is refused by the lab kernel in 22 ms (`csink_depth`) |
| Determinism within one engine | 2 parts in one process, 1 across processes | identical volumes, areas and mesh coordinates; names identical up to the sketch ids |
| Rebuilds and memory | 2 × 120 full rebuilds | memory plateaus (no leak trend): without SMLib RSS 167 MB after 60 and 173 MB after 120 rebuilds (82 ms each); with an SMLib fillet 220 then 223 MB (290 ms each); checkpoints stay at 4–5. Freeing the checkpoints does not return memory to the system (normal for a WebAssembly heap) |

## 4. Failures in detail

**F1 — Loft between unlike sections accepted wrong.** Square 20 × 20 at z = 0 to circle r = 8 at z = 30, `loft` with two
sketch sections. Lab: `smlib/approximate`, V = 3982.93, 6 faces. OpenCascade: V = 8891.63, 7 faces. Any loft between these
sections encloses at least the smaller section's area times the height (201 × 30 = 6032), so 3982.9 is impossible: the
section correspondence twists the side. Square→square (7000.000) and circle→circle (5497.787) are exact and right. *Fix
direction:* reject (or reparameterise) sections whose curve counts differ; validate any `approximate` result against an
independent bound (enclosed volume between the sections) before accepting it.

**F2 — STEP surface of revolution read wrong.** `fixtures/step/vase.step` (two planes and a SURFACE_OF_REVOLUTION over a
B-spline profile): `fromStep` returns one solid, `approximate`, V = 1381.31; OpenCascade V = 33,292.91. A 24× error accepted.
*Fix direction:* convert SURFACE_OF_REVOLUTION (and SURFACE_OF_LINEAR_EXTRUSION, F6) to exact NURBS before building the
face, and refuse a read whose measured volume disagrees with its own tessellation beyond the tolerance.

**F3 — Pattern names collapse after SMLib.** A hole patterned three times: before a fillet the walls are `f4.wall:p9`,
`f4.wall:p9@f5#1`, `f4.wall:p9@f5#2` (OpenCascade the same). After a fillet elsewhere on the part: `f4.wall:p27`,
`f4.wall:p27@f5`, `f4.wall:p27@f5`. Cause: `krn-build.js:62`
`stripSmlib = (n) => n.replace(/#\d+$/, '')…` removes SMLib's split-face suffix (`kernel-smlib/rows.js:27` writes
`base + '#' + k`) but PartCraft's own pattern suffix has the same form. *Fix:* give SMLib's split pieces a suffix the host
does not use (or strip only names SMLib itself suffixed).

**F4 — Impossible input becomes a fallback.** Fillet r = 50 on one vertical edge of a 40 × 30 × 20 block: lab →
`Fallback(fillet_failed)` → mesh kernel builds V = 13,844.9 (no error). OpenCascade: feature error `round_no_fit`, body
unchanged (24,000). A shell thicker than the part takes the same path (the mesh kernel happens to report that one). *Fix:*
when the failure is the input's (radius larger than the faces allow, thickness larger than the body), report a feature
error as the other kernels do.

**F5 — Assembly instances lost.** `assembly.step` and `step-plate-and-pegs.step` (a plate and a peg placed twice): lab
reads 2 solids (40,000 + 2,356.19); OpenCascade 3 (total 44,712.39). The second NEXT_ASSEMBLY_USAGE_OCCURRENCE of the same
product is dropped.

**F6 — Surface of linear extrusion refused, misworded.** `extrusion.step`: `krn.err.failed` cause `nurbs.err.step_empty`
(the file is not empty: OpenCascade reads one solid, 24,338.5).

**F7 — Whole-part fallbacks on common geometry.** Hole tangent to a side face (B5, `tangent`); adjacent pattern holes exactly
touching (`tangent`); two boxes sharing an edge (B22, `topology`); a closed spline profile (A14, `spline_side`); a
countersink deeper than its hole allows (`csink_depth`); `seam` (from the fuzz run). OpenCascade builds the tangent hole,
the edge contact, the spline profile and the `seam` case; on the countersink it hangs. (The touching pattern holes were not
built on OpenCascade.)

**F8 — Cross-engine bits.** Four parts (cylinder, torus, crossed cylinders, circular hole pattern) built in Node and in
headless Chromium: volume and area bit-identical; mesh coordinates differ in all four; centroids differ in two (at about
1e-16 relative). cc-nurbs and the contract make 148 calls to `Math.sin`, `cos`, `atan2`, `tan`, `exp`, `pow` and the like, whose
last bits vary by engine. Matters for anything hashed or compared across machines (live and teamwork sessions, caches,
stored pick points), not for display.

**F9 — Scaling with holes.** 200 × 200 × 10 plate, n × n through holes ⌀2:

| holes | lab | mesh kernel | OpenCascade |
|---|---|---|---|
| 100 | 2.1 s | 0.6 s | 3.5 s |
| 400 | 9.6 s | 2.0 s | 23.2 s |
| 900 | 35.1 s (650 MB) | 4.4 s | not run |

Volumes equal OpenCascade's to 1e-16. Faster than OpenCascade, but roughly quadratic; the planar face carrying every hole
loop is the likely cost.

**Outside the kernel:** a 10 mm rectangle sketched 1 km from the origin fails in PartCraft's profile detection
(`profile_branches`) on all three kernels.

## 5. The randomized run (fuzz)

Randomized parts from a seeded generator (seeds 7 and 42, 120 parts each): a block of random size with one to six random
features on its top face (round cuts blind or through, rectangular pockets, round bosses, simple / counterbore / countersink
holes, sometimes patterned), placed so they often overlap, break out of the sides or touch. Each part was built by the lab
kernel and by OpenCascade (in a worker with a 20 s limit); every fourth was also written to STEP and read back.

| | seed 7 | seed 42 | total |
|---|---|---|---|
| built by both | 93 | 81 | **174** |
| volumes agree to 1e-9 | 93 | 81 | **174 (100 %)** |
| mismatches, crashes, validity disagreements | 0 | 0 | **0** |
| lab fallbacks | 27 (csink_depth 22, solid_open 4, seam 1) | 39 (csink_depth 35, solid_open 2, seam 1, sliver 1) | 66 |
| **OpenCascade hung (> 20 s)** | 22 | 35 | **57**, all on parts the lab kernel refused in milliseconds (`csink_depth`) |
| STEP read back as more than one solid | 4 | 1 | 5: same volume to 1e-15; the parts have a boss or cut that leaves a separate piece, so two solids is right |

So: where both kernels build, they agree every time; the lab kernel never crashed; its most common fallback
(`csink_depth`, countersinks the generator made too deep for the part) is exactly the input that hangs OpenCascade.

## 6. The STEP-import boundary: is it artificial, and what would it take?

**Mostly artificial.** The `nurbs` engine already declares `stepRead: 'exact'` and implements `fromStep` (cc-nurbs
`readStep`). The only reason a PartCraft import does not reach the exact kernel is that `import` is missing from
`KRN_BUILT`, so `krn-build.js:997` throws `Fallback(feature_type)` (and `addon.json` lists "imported bodies" as not built).

What the reader does today, on PartCraft's own fixture corpus (other programs' files) and on OpenCascade-written files:

| Files | Result |
|---|---|
| boxes in AP203, AP214, AP242 and inches; boss; plate with 4 holes; cone; frustum; sphere; torus; a box with 12 rounds and 8 spherical corners; a W-beam with cut ends (20 faces); OpenCascade-written box, cylinder, box with hole; 11 of the lab kernel's own files | **exact**, volume equal to OpenCascade's (to 1e-12 or better) |
| loft with a B-spline face | `surface`, volume within 6e-7 of OpenCascade's |
| vase (surface of revolution) | **wrong** (F2) |
| extrusion (surface of linear extrusion) | refused, misworded (F6) |
| two assemblies | one instance lost (F5) |

And an imported solid **keeps working on the exact kernel**: cutting a cylinder through the imported box, boss, plate, loft
and W-beam gave exact (and, for the loft, `surface`) results in 30–560 ms.

**Development needed, in order:**

1. **Route the feature** (small: about one session). In `krn-build.js`: an `import` case that calls the `nurbs` engine's
   `fromStep(f.step)`, turns Z-up files to PartCraft's Y up with the contract's `transform` (as the `step` op already does
   the other way), names the faces `<feature>.face:<i>` in file order so references made on OpenCascade-era files still
   resolve (to verify: that the reader keeps file order), joins it with `op`, and falls back only when the read is not
   `exact` or `surface`. Add `import` to `KRN_BUILT`; update the `honesty` text.
2. **Gate correctness before routing** (small): refuse an `approximate` read (that alone turns F2 into a fallback instead of
   a wrong part), and word `step_empty` correctly.
3. **Swept surfaces** (medium: one to two sessions): SURFACE_OF_REVOLUTION and SURFACE_OF_LINEAR_EXTRUSION as exact NURBS
   (or as their own surface kinds) in the reader, with tests against OpenCascade.
4. **Assemblies** (medium): every NEXT_ASSEMBLY_USAGE_OCCURRENCE with its placement; decide whether an import of several
   solids becomes one body or several (PartCraft's `new_body` is itself a fallback today).
5. **Real-world robustness** (unknown, potentially the largest): files from commercial CAD with tolerant edges, gaps,
   slivers, unsewn faces and thousands of faces. Nothing in the repos tests this; it needs a corpus first, then healing and
   sewing (cc-nurbs has `sew` for its own needs).
6. **ModelCraft:** the same `fromStep` through the Surfaces panel's import (its STEP in is cc-nurbs' already); small once 1–2 exist.

So: clean single-part files with analytic and B-spline faces could import exactly after steps 1–2, which are small; full
parity with a commercial reader is steps 3–5.

## 7. Recommendations

1. Fix F1 and F2 before anything else: they are the only cases found where the kernel hands back a wrong solid.
2. Fix F3 (a one-line naming conflict) and F4 (route input errors as feature errors).
3. Route STEP import (§ 6 steps 1–2).
4. Reduce whole-part fallbacks (F7): tangent contact first (it is common), then edge contact, then spline profiles.
5. Add an independent validity check for `approximate` results (closedness, orientation, a volume bound) before they are
   accepted.
6. Keep OpenCascade as a CI oracle: the comparisons in this review found F1, F4 and F5 and showed where the lab kernel is
   better.

## 8. Where engine.solid already solves a problem this solution has

Only two, and only as building blocks; engine.solid has no STEP reader and no Booleans yet.

1. **Bit-identical results across JavaScript engines (F8).** engine.solid computes its elementary functions from + − × ÷ and
   √ only (`core/trig.js`, measured against a 320-bit BigInt reference: ≤ 1 ulp for sin, cos, atan, exp, log, cbrt; ≤ 3 for
   the rest), and checks 22 hashed areas of its results in Node and in Chromium (page and worker) on every release. Its
   tessellation and measures would therefore not differ between machines. Offering it to cc-nurbs would be an upstream
   change to cc-nurbs (the owner's D-ccn rule) and moves other apps' bits, so it starts with an issue.
2. **Exact surfaces of revolution and linear extrusion with exact volumes (F2, F6).** engine.solid has both as surface
   kinds (`geom/analytic-surface.js`: `revolution`, `extrusion`, each with an exact NURBS conversion, the revolution by
   *The NURBS Book* A8.1 on the profile's own net), and its auditor integrates their faces exactly: the corpus vase (a
   circular arc revolved) agrees with its closed-form volume to 4e-16. That is the piece the reader needs for step 3 of § 6.

## 9. Reproducing

The harness is in this session's scratchpad (`lab/h.mjs`, `suite.mjs`, `fuzz.mjs`, `t-import.mjs`, `t-loft.mjs`,
`t-names.mjs`, `t-det.mjs`, `t-grid.mjs`, `bh.mjs`); it needs the mirrored `dev/` files, the SMLib vendor files, and
PartCraft's `devshell/vendor` with `--oracles`. It could become a test file in the PartCraft repository; whether to open a pull
request is left to the owner after this review.

## 10. Architecture: this solution or engine.solid?

This solution's architecture is the better one to build on: an engine-neutral contract, engines chosen by capability,
exact hand-over between engines, delivery as an add-on byte-identical in every host, and the host's existing seam kept.
engine.solid is stronger in its foundations (bit-identical arithmetic across engines, exact predicates for topological
decisions, swept surface kinds with exact measures, an independent mutation-tested auditor) but has no host integration and
no Booleans. Recommendation: engine.solid stops as a separate kernel; its strengths go in as contributions to this stack
(upstream issues first, per D-ccn), or as one more engine behind the contract. The owner decides before any pull request.
