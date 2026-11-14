# engine.solid — the NURBS-based pure-JavaScript solid kernel of the CadCraft suite
## Handoff · CadCraft™ Studio / SuperCad / KADsuite (Data Design Group)

> **Name:** `engine.solid`, named as the suite's engines are (owner, 2026-11-12): the library is cc-solid, its folder `solid/`, its error codes `solid.err.*`, its error class `SolidError`. Earlier names: the placeholder KNOT (branches `knot/dev` and `knot/kad-reference` in the PartCraft fork) and PartCore (branch `partcore` there, where S1 was built).
>
> **Status of this document:** the plan. **Building has started:** S0 (audit), S1 (scaffold), S2 (math kit), S3 (exact predicates) and S4 (basis functions) are done. What is built is recorded in `docs/solid/STATUS.md`, not here. Everything not yet built is a proposal for the owner to confirm, change or reject. Where I am inferring rather than reading something in your repositories, it says so.
>
> **Version 1.2 (2026-11-12):**
> - **Home (D-home, superseded 2026-11-13):** the site repo, beside cc-nurbs, on branch `engine/solid`. The engine is in `lib/solid/`, its tools in `tools/solid/` (run by `bin/test-solid.mjs`), these documents in `docs/solid/`; in a clone of the site repo those folders sit under `tests/` (`tests/lib/solid/` and so on). It was first built in the library repo `withshalom/getlibrarycraft`, branch `engine/solid`, and its history was carried over commit by commit. A pull request follows once engine.solid is finished; the owner then authorizes it for the apps that need it, and each of them carries a byte-identical copy (`solid/` in its build folder), as with every engine.
> - **An engine like the others** (getcadcraft.com › Build an add-on › Engines): Apache-2.0, DOM-free JavaScript run in workers, shared by every app and SuperCad Studio. Add-ons name it in their manifest's `needs` (`engine.solid`) and import `engine:solid/…`; an app with its own copy needs no download.
> - **Built on what the suite has:** it sits on cc-nurbs and cc-step (D8) instead of rewriting them. They sit beside it in the site's `lib/` and in every host app.
> - **Sources:** the KAD-family snapshots stay in the PartCraft fork (`withshalom/getpartcraft`, branch `knot/kad-reference`, also contained in `partcore`). Paths `reference/kad/…` below refer there.
> - **v1.0 → v1.1:** `docs/solid/REVIEW-2026-11-12.md` lists every change (P1–P16); sections that changed carry a **v1.1** note. **v1.1 → v1.2:** renamed (D-name) and moved (D-home); later v1.2 notes say what else changed.
>
> **Written:** 2026-11-12 · **Owner / sole copyright holder:** Shalom (`withshalom`) · **Licence for new kernel files:** Apache-2.0, the licence of the suite's engines (see §15)

---

## 0. How to use this handoff

This file is meant to be dropped into a fresh session (or given to a collaborator) so work can start without the planning conversation.

1. Read §1 (decisions), §2 (constraints) and §16 (session protocol).
2. Open §14 (roadmap) and take the next unchecked session. **One session = one complete, tested build.** Each has acceptance criteria.
3. Never start a session without reading `docs/solid/STATUS.md` on branch `engine/solid` of the site repo. That file, not this one, is the source of truth for what is built.
4. Anything that changes a decision in §1 gets appended to the decision log in §17 and to `STATUS.md`.

Section map: 1 Decisions · 2 Goals and constraints · 3 What your repos tell us · 4 Architecture · 5 Numerics · 6 Geometry · 7 Intersection · 8 Topology · 9 Modeling operations · 10 Meshing · 11 Audit · 12 File formats · 13 Integration · 14 Roadmap · 15 Licence and provenance · 16 Verification strategy and session protocol · 17 Risks, open decisions, decision log · 18 References · Appendix A first-session (S1) brief · Appendix B glossary.

---

## 1. Decisions captured in the planning session

| # | Decision | Source |
|---|---|---|
| D1 | The 3D kernel is **NURBS-based** and written in **pure JavaScript**. No Rust, no WebAssembly in the kernel, no OpenCascade dependency. | You, this session |
| D2 | **Everything must run offline.** No network, no CDN, no cloud service, no lazy-fetched module. "Local" means offline. **v1.2, made precise:** the engine is local and embedded as the core. No CAD function depends on a web-loaded service. The suite around it may use cloud services (accounts, sync, the library); the kernel never needs them, and each host carries its own copy. | You, earlier; refined 2026-11-12 |
| D3 | ~~No booleans in the kernel's core scope.~~ **v1.2: booleans are in scope, but not dominant.** Profile and feature construction stays the main route; exact NURBS booleans (M9) are planned beside it, so both can be used. Without them, splines and conics would be out of reach. | You, 2026-11-12 |
| D4 | The kernel is built by you and me, **one complete build per session, one step at a time.** | You, earlier |
| D5 | Code written for KAD, KAD2, KADsuite and the rest is **MIT/Apache** and you hold full copyright discretion. AGPL text still sitting in file headers is to be ignored. | You, this session |
| D6 | OpenCascade (and SMLib, etc.) may be used **only as test oracles**, never as source to copy. PartCraft already works this way (its exact kernel is opt-in and off by default). | PartCraft practice |
| D7 | ~~**v1.1:** PartCore is built **in the PartCraft fork** (`withshalom/getpartcraft`), on branch `partcore`. The code goes in `app/partcore/`, tests in `tests/tools/partcore/` run by `tests/bin/test-partcore.mjs`, and docs in `docs/partcore/`.~~ Superseded by D-home. | Owner, 2026-11-12 |
| D-home | ~~**v1.2:** engine.solid is built **in the library repo** (`withshalom/getlibrarycraft`), on branch `engine/solid`: the engine in `lib/solid/`, its tools in `tools/solid/` run by `bin/test-solid.mjs`, docs in `docs/solid/`. A pull request follows once engine.solid is finished; the owner then authorizes it for the apps that need it.~~ **Superseded 2026-11-13:** the home is the site repo's `lib/solid/`, beside `lib/nurbs/`; `tools/solid/sync.mjs` copies it byte for byte into each host's `dev/solid/`. A pull request still waits for the owner's go, and the owner still authorizes each app. | Owner, 2026-11-12; moved 2026-11-13 |
| D8 | **v1.1:** engine.solid **builds on cc-nurbs, cc-step and cc-acis** and does not rewrite them. It imports `app/nurbs/` and `app/step/` read-only, because those are byte-identical copies of the monorepo's canonical libraries. | Review §2 |

### How I read D3 ("we don't want booleans")

I am reading this as: *do not build the kernel around mesh/CSG booleans (the manifold-style approach, or the narrow box-only booleans I found in `solid-kernel`), and do not make booleans a v1 deliverable.* The kernel's core is **NURBS geometry + B-rep topology + solids made by profile operations** (extrude, revolve, sweep, loft, skin) with validation, meshing and STEP.

That reading has a consequence you should confirm, because it affects KUBIC:

- **What works without booleans:** prismatic parts whose full outline is sketched (holes as inner loops), revolved parts with grooves in the profile, swept and lofted bodies, transforms, patterns, offsets of whole bodies, measurement, sections and projections, STEP/mesh export.
- **What does not, without some form of face-vs-face intersection:** cutting a pocket or hole into an *existing* body, push/pull *into* material, fusing two overlapping bodies, intersecting bodies, fillets/chamfers (these need intersections but not booleans).
- **KUBIC's card on the KADsuite page says "push/pull and booleans".** Either that copy changes, or milestone M9 (optional NURBS booleans, §14) is eventually scheduled. The architecture in this plan keeps that door open (the same surface/surface intersection that sections and fillets need is what booleans would need) but nothing is built for it before M9.

**Please confirm or correct D3.** If you meant "no booleans, ever, in any form", delete M9 and I will note which KUBIC features must be redefined.

**v1.2, settled (owner, 2026-11-12):** "Booleans are fine as well, they just shouldn't be dominant. We should be able to map both." M9 is planned, not optional. Everything above about building the core without booleans first still holds: M9 comes after the intersection rings it needs.

**v1.1, made concrete:** PartCraft's cc-nurbs already has solids and booleans, but they are mesh booleans. `solid.boolean` sews faces by tessellation and hands them to manifold-3d, and `blend.fillet` is applied through it. engine.solid's core **never calls `solid.boolean` or manifold**. Those stay available to PartCraft as the existing mesh route, outside engine.solid.

---

## 2. Goals, non-goals, hard constraints

### Goals
1. A **pure-JS, zero-dependency, offline** B-rep kernel: NURBS and analytic geometry, trimmed faces, valid solids.
2. **Runs identically** in a browser tab, a Worker and Node (same rule KAD2's engine follows: no DOM, no network, no `eval`, no dynamic import).
3. **Honesty over approximation.** Operations either produce a body that passes the independent auditor, or refuse with a typed, machine-readable error. They never return a quietly-wrong body. (Borrowed from `solid-kernel`'s design, which I judged the best idea in that project.)
4. **Provenance and persistent naming** for faces and edges, so dimensions, constraints and scripts (KUBIC, KRAFT/SKAD) survive re-computation.
5. A STEP (ISO 10303-21) **writer first, then reader**, so SuperCad can finally replace its STEP stub and PartCraft can retire mesh-only STEP.
6. **Watertight tessellation** for display, STL/glTF/3MF export and fabrication (KAM, KARVE).
7. Plugs into KAD2 through the interfaces KAD2 already has (backend registry, commands, capabilities, transactions), not around them.

### Non-goals (for v1.0)
- Booleans on general NURBS bodies. **v1.2:** in scope (D3), after the v1.0 core, in M9.
- Parametric constraint solving, sketch solver, feature-tree history (those live in KUBIC/PartCraft; the kernel provides the stable names they need).
- Assemblies/mates, PMI, rendering materials, kinematics.
- Subdivision surfaces, T-splines, point clouds, mesh repair.
- Performance parity with Parasolid/ACIS/OCCT. Target is "fast enough for single parts of a few thousand faces in a Worker."

### Hard constraints
- JavaScript only (ES modules; JSDoc types allowed; no TypeScript compile step, no bundler needed to run).
- No third-party runtime dependencies. **v1.1:** in-repo PartCraft libraries (cc-nurbs `app/nurbs/`, cc-step `app/step/`) are allowed; manifold-3d and OpenCascade are not. Dev tooling must be optional (plain `node` test scripts, as PartCraft's are).
- Geometry in **millimetres**, angles in **radians**, right-handed, Z-up (matches KAD2: `.kad` stores mm; CadScene uses radians).
- Deterministic: same inputs produce the same body and the same IDs.
- Bounded: every parser and every operation has explicit size/iteration limits, reported as `LIMIT` errors (KAD2 convention).

---

## 3. What your repositories tell us

I read the original KAD, KAD2 and KADsuite. Findings that shape this plan:

### KAD (1.x, `withshalom/kad`, single 24,570-line `index.html`)
- **2D only.** The object store (`GeoMemory`) has lines, points, polylines (with bulge), Bézier paths, circles, arcs, hatches. No 3D entities.
- **A STEP stub already exists** (around lines 14526–14600): `STEP_KERNEL_CHOSEN = false`, `loadStepKernel()` rejects with "no STEP kernel has been selected yet", pinned to nothing. The only STEP path sketched is *planar cross-section import* (`stepChainEdges`, 1e-3 mm). This kernel is what fills that gap.
- **SKAD** (the scripting interpreter) emits "3D needs KRAFT" in three places. KRAFT is the planned 3D handler; the kernel should expose a script-friendly command surface for it.
- A `PLANES` / `UCS_PLANES_ACTIVE=false` mechanism and `PartLibrary` exist: sketch-plane frames and parts are already concepts.

### KAD2 (`withshalom/KAD2`, plain single-file build, 357,984 bytes)
I read the built single file; the `src/` tree was not in the clone, so layout conventions below are inferred from the embedded module map (`src/engine/...`).
- **Engine/UI separation enforced by a boundary checker**; engine has no DOM/network/eval/dynamic imports. This is exactly the rule the kernel should adopt.
- **42 validated commands**, frozen results, **capability sessions** (`doc.read`, `doc.write`, `history`, `io.import`, `io.export`, `admin`), budgets, dry runs, proposals. 
- **Transactions with delta undo/redo.** Immutable-ish records are the norm.
- **Error type**: `EngineError(code, message, details)` with stable codes, `fail()`, and an `errorEnvelope`. The kernel should reuse the same shape.
- **`FormatRegistry.registerBackend({id, formats, read(data,opts)→CadScene, write(view,opts)})`**, with `registerBackend` requiring the `admin` capability and a note that backends belong in a Worker. `FORMATS` already lists `step` and `dwg`. This is the STEP integration point.
- **CadScene** is the shared semantic model for DXF/DWG/STEP readers. Its `SPLINE` entity carries `{degree, closed, ctrl:[[x,y,w]], knots, fit}` and `ELLIPSE` carries `{c, major, ratio, a0, a1}`, so profile curves map to kernel curves almost one-to-one. Its `SOLID` type is the DXF 2D filled quad, not a 3D solid.
  - **v1.1 correction:** the CadScene speaks NURBS, but **the KAD2 document does not.** `io/cad/resolve.js` keeps a spline exact only when it is a non-rational cubic Bézier chain (it becomes `BEZIER`). Every other spline is sampled into a polyline. So the KAD2 adapter must read profiles from the CadScene or from `BEZIER`, never from the flattened polyline.
- **Kinds registry**: every entity type is `{type, fields, clean, prims, xf, grips, describe, ...}`, and `prims` reduces everything to lines and arcs (Béziers are flattened). 3D bodies do not fit that 2D `prims` contract; they need their own model (see §13).
- **`.kad` passthrough limits:** unknown top-level keys are carried but capped at `MAX_PASSTHROUGH_KEYS = 32` and `MAX_PASSTHROUGH_BYTES = 1 << 20` (1 MiB). B-reps will exceed 1 MiB quickly, so bodies need a dedicated, versioned section with its own limit, not the passthrough.
- **Rounding:** geometry is stored at 1e-6 (`R6`), angles at 1e-8. **The kernel must not apply `R6` to its own data**: rounding rational weights such as √2/2 to six places destroys exact circles at the scale of the kernel's own tolerance.
- **End-to-end chaining already exists:** `ops/modify.js` `join(entities, tol = 1e-4)` chains lines, arcs and open polylines that meet end to end into polylines (with bulge) and flags closure. It does *not* handle Béziers/splines, loop nesting (holes), orientation or self-intersection, and it rounds output with `R6`. (`kernel/hatch.js` is the hatch *pattern* generator, not a loop finder.) So S19 can reuse the chaining idea, but nesting, orientation, spline support and validity checking are new work.
- `ext.planes` plus `mergePlanes` already exist for sketch-plane frames.
- Module headers still say AGPL-3.0-or-later. Per D5 I treated them as MIT/Apache; one sweep session updates them (§15).

### KADsuite (suite landing page)
- **KUBIC** (Beta, card hidden): "3D solid modeler for fabrication, sketching to solid with push/pull and booleans, exporting STL and STEP." Primary consumer. See D3 conflict note.
- **KAM** (nesting / G-code) and **KARVE** (lathe/mill) benefit directly from sections, revolve and watertight meshes. **KONSTRUCT** and the rest are later consumers.

### KUBIC (`reference/kad/kubic/KUBIC.html`) — v1.1
- **What it is:** a Canvas2D 3D sketcher with a Z-up camera, sketching on XY at Z = 0. Tools: line, 3-point arc, rectangle, circle, polygon, line-line fillet, offset and extrude. Files: `.kbc` and binary STL.
- **No B-rep.** A "solid" is `{ base: polygon, height }`, a prism.
- **The card overstates it.** There are no push/pull and no booleans in the code.
- **Kernel-fixable faults K1–K8** (review §3.1): circles faceted; arcs ignored, so filleted outlines cannot be extruded; one line loop only; no holes; inside-out solids from clockwise outlines and negative heights; fan-triangulated concave caps in STL; inch units not round-tripped.
- **Its own bugs K9–K15:** STL import throws on an undeclared `nextSolidId`; network fonts break the offline rule.

### KARVE (`reference/kad/karve/KARVE.html`) — v1.1
- **What it is:** a lathe/mill front end with a material table and an operation list.
- **Its G-code is a placeholder and must not be run** (review §4.1). The moves are fixed rather than computed from geometry, mm/rev feeds are written under `G94`, inch mode is unconverted, radius/diameter mode is unset, and the `G76` / `G83` words do not match the LinuxCNC dialect it claims.
- **It cannot read KUBIC's files.** It expects `.kbe` with lower-case types; KUBIC writes `.kbc` with upper-case ones.

### PartCraft — audited 2026-11-12 (S0), v1.1
Full detail is in review §2. In short:
- **cc-nurbs** (`app/nurbs/`, 6,816 lines, Apache-2.0, Piegl & Tiller cited by algorithm number): S4–S9 are done. Basis functions, curves, surfaces, knot operations, degree elevation/reduction, fitting, and extrude / revolve / loft / sweep / Gordon / Coons / offset surfaces all exist.
  - Trims are polygons in (u, v).
  - Solids are faces sewn by tessellation, with booleans and fillets through manifold-3d.
  - STEP export writes `MANIFOLD_SOLID_BREP` with `POLYLINE` edges.
  - Test status: 173 of 174 pass; the one failure is a monorepo sync check.
- **cc-step** (`app/step/`):
  - a Part 21 index and parser (S28 done)
  - evaluators and inverses for every AP203/214/242 geometry entity, analytic surfaces included
  - a B-rep → triangles reader with shared edges, seams and poles
- **cc-acis** (`tests/lib/acis/`, test copy): an SAT/SAB reader with analytic surfaces and its own constrained Delaunay triangulation.
- **Other parts of PartCraft:** `kernel.js` (manifold mesh kernel), the opt-in OpenCascade route (`exact-client.js` / `brep-worker.js`, `k.call('regen', { part })`), a sketcher (`sketch*.js`), and a CAM stack (`cam-*.js`).

**Implication (v1.1):** engine.solid's own work is the **exact B-rep layer**: shared exact edges with pcurves, exact trims, Euler-valid topology, an independent auditor, exact STEP edges and analytic surface identity, with no mesh booleans. The first consumers are:
1. PartCraft's exact-kernel seam (`ExactKernel`), which turns on the "Not built yet" exact features
2. KUBIC's extrude and STL
3. a STEP writer with exact edges
4. KAD2's `step` backend

All four are served by the boolean-free core.

---

## 4. Architecture

### 4.1 Repository

~~v1.0: a separate repository `withshalom/knot`.~~ ~~v1.1 (D7): in the PartCraft fork.~~ **v1.2 (D-home): in the library repo, as an engine.**
- **Code:** `lib/solid/` in `withshalom/getlibrarycraft`, developed on branch `engine/solid`. That is the shape of the site's `lib/<name>/`, so the engine can move there unchanged.
- **Same rules as every engine** (cc-nurbs, cc-field): DOM-free, no third-party imports, runs in a page, a Worker and Node.
- **Allowed imports:** its own files, and `../nurbs/` and `../step/` (D8) from `geom/` up: the folders that sit beside `solid/` in the site's `lib/` and in every app's build folder.
- **Hosts:** each app that needs it (PartCraft first, then ModelCraft, CadCraft's 3D tab, BimCraft, SuperCad Studio) carries a byte-identical copy as `solid/` in its build folder, kept in step by a `sync.mjs [--check]` script like cc-nurbs'. KAD2, KUBIC and KRAFT take the same copy. An add-on that needs it names `engine.solid` and imports `engine:solid/…`: the app's own copy answers, so nothing is downloaded and nothing depends on a network (D2).
- **Dependency direction:** apps, their workers and add-ons may import engine.solid. engine.solid never imports app code.

### 4.2 Layers and the one-way import rule

```
core  ←  math  ←  geom  ←  topo  ←  { ops, mesh, audit, measure }  ←  io  ←  api
```

A module may import only from layers to its left. `audit` additionally **must not import `ops` or `mesh`**, so the validator cannot share bugs with the code it judges. A boundary checker (`tools/check-boundaries.mjs`, modelled on KAD2's) runs in CI and has its own test that a deliberate violation fails.

### 4.3 Layout

**v1.2:** the tree below lives at `lib/solid/` (in place of `src/`) in the library repo.
- **Docs:** `docs/solid/` holds `HANDOFF.md` (this file), `STATUS.md`, `PROVENANCE.md` and the reviews.
- **Tests:** `tools/solid/`, run by `bin/test-solid.mjs` (the site's `bin/test-<name>.mjs` pattern). No packages, no install.
- **Licence:** Apache-2.0: the SPDX header on every file, and the library repo's `LICENSE` for its tools. No per-folder licence files.
- **`geom/` wraps cc-nurbs** instead of re-implementing it. `geom/nurbs/` re-exports `app/nurbs/basis.js`, `curve.js`, `surface.js`, `fit.js` and `construct.js`, and adds only what they lack: analytic classes, exact conversions and interval bounds.
- **`io/step/` builds on `app/step/`.**

```
solid/   (v1.0 layout, kept for the module split; read src/ as lib/solid/)
  package.json            type:module, zero dependencies
  LICENSE-MIT  LICENSE-APACHE  NOTICE  PROVENANCE.md  STATUS.md  HANDOFF.md
  src/
    index.js              the single public entry (KAD2 style)
    core/                 errors, tol, limits, ids, freeze, prng, intervals, trig
    math/                 vec3, mat4, frame, aabb, quad (Gauss), roots, linalg, predicates
    geom/
      nurbs/              basis, eval, ops (insert/remove/elevate/split), fit, skin, sweep
      curve/              line, circle, ellipse, nurbsCurve, polyline, registry
      surface/            plane, cylinder, cone, sphere, torus, extrusion, revolution, nurbsSurface
      query/              closest, invert, bbox, curvature, length
      intersect/          curveCurve, curveSurface, planeSurface, analytic, surfaceSurface
    topo/                 model, store, euler, build, orient, names, index
    ops/                  profile, extrude, revolve, sweep, loft, transform, pattern, offset ...
    mesh/                 discretize, faceMesh, weld, normals, export/{stl,obj,glb,3mf}
    audit/                topology, geometry, mesh checks (independent)
    measure/              mass, distance, section
    io/                   step/{part21,entities,reader,writer,heal}, sat/, dxf3d/
    api/                  commands, validate, capabilities, worker
  test/                   unit/ property/ oracle/ corpus/ perf/
  tools/                  check-boundaries.mjs  bench.mjs  build-single-file.mjs  oracle-run.mjs
```

### 4.4 Language and typing
Plain ES modules. Type information as **JSDoc** with optional `// @ts-check` and an *optional* `tsc --noEmit --checkJs` dev script. It is still JavaScript, nothing needs compiling, and it catches the numeric-array mix-ups that otherwise cost sessions.

### 4.5 Runtime environments
- Works in Node (≥ 20), Chromium/Firefox/Safari, and Workers. No `window`, `document`, `fetch`, `process`, `require`, `Buffer` in `src/` (checked).
- Heavy operations run in a Worker via `api/worker.js` using transferable typed arrays (§10). The Worker host is the *only* module that touches `postMessage`.
- Build outputs mirror KAD2: multi-file ESM for development, an optional single-file build for embedding. No bundler needed to *run* it.

### 4.6 API shape (KAD2-compatible)
- **Functions are pure** and return new immutable values (frozen).
- **Failure = thrown `EngineError`** with stable codes. Kernel-specific codes:
  `REFUSED_OPEN_PROFILE`, `REFUSED_SELF_INTERSECTING_PROFILE`, `REFUSED_DEGENERATE_SWEEP`, `REFUSED_INCOMPATIBLE_SECTIONS`, `REFUSED_TOLERANCE`, `REFUSED_NOT_SUPPORTED` (e.g. an intersection configuration not handled yet), `AUDIT_FAILED`, `LIMIT`, `BAD_INPUT`; **v1.2 (S2):** `REFUSED_NO_BRACKET`, `REFUSED_NO_CONVERGENCE`, `REFUSED_SINGULAR`.
- **v1.1, PartCraft's convention:**
  - **Inside PartCraft:** engine.solid throws a `SolidError` shaped like cc-nurbs' `NurbsError`. Its `code` is an i18n key (`solid.err.open_profile`, `solid.err.self_intersecting_profile`, …, `solid.err.limit`) that the app turns into words, plus `vars` (D-err). engine.solid itself carries no English text.
  - **At the KAD2 adapter:** the same refusals are mapped to KAD2's `EngineError(code, message, details)`, with the upper-case codes above.
  - **cc-nurbs errors pass through unchanged.** A `NurbsError` thrown underneath keeps its `nurbs.err.*` code.
- **Every constructive op returns** `{ body, report }` where `report` lists tolerances achieved, approximations made (with error bounds), and provenance IDs created.
- **The `api/` layer** exposes the same contract KAD2 commands use: named command, strict argument schema, required capability, frozen JSON result. KAD2's `validate.js` vocabulary (`num`, `int`, `str`, `bool`, `arr`, `obj`, `pt`, ...) is the model.
- **Immutability and undo:** bodies are immutable snapshots; unchanged faces/edges are shared by reference between versions. This makes KAD2-style delta undo/redo almost free and makes caching and Worker transfer safe.

---

## 5. Numerics: the part that decides whether the kernel is trustworthy

### 5.1 Representation
- ~~v1.0: all geometry in `Float64Array`s (struct-of-arrays).~~ **v1.1:** curves and surfaces use **cc-nurbs' plain data** at every boundary:
  - curve: `{ deg, knots, cvs: [[x,y,z]], w | null }`
  - surface: `{ degU, degV, knotsU, knotsV, cvs[i][j], w | null }`

  That way they pass between engine.solid and cc-nurbs (and its STEP / IGES writers) without conversion. Typed arrays are used only inside hot loops, and only when a benchmark (§16.2) shows the need. Mesh output stays in typed arrays (§10).
- Knot vectors clamped (open uniform ends) by default; periodic geometry is represented as clamped + `periodic` metadata, converted internally. Domain is whatever the knots say; never silently renormalized.
- Geometry objects are **frozen value objects**; operations return new ones.

### 5.2 Tolerance policy (one module, `core/tol.js`)
A single `Tolerance` object travels with every operation. Defaults (to be tuned by benchmark; these are starting hypotheses):

| Name | Default | Meaning |
|---|---|---|
| `lin` | 1e-6 mm | two points are the same / a point lies on a curve or surface |
| `ang` | 1e-12 rad (lin / size) | two directions are parallel |
| `fit` | 1e-4 mm | max deviation allowed when an operation must approximate (interpolation, offset, STEP import fit-up) |
| `mesh.chord` | 0.01 mm | tessellation chord deviation |
| `mesh.angle` | 0.5° | tessellation normal deviation |
| `maxEdgeTol` | 1e-4 mm | largest tolerance a tolerant edge/vertex may carry before the auditor flags it |

Rules: no hard-coded `1e-9` anywhere else in `src/` (lint-checked). Comparisons use `tol`. Edges and vertices may carry their own local tolerance (tolerant modelling, needed for imported STEP), and the auditor reports the maximum.

### 5.3 Coordinates
- Double precision gives about 2e-10 mm resolution at ±1e6 mm, comfortably below `lin`. Beyond roughly ±1e7 mm (10 km), precision erodes.
- **Local-frame lifting:** every body carries a `placement` (rigid transform). Geometry is stored in the body's local coordinates, and world = placement × local. This handles survey-scale coordinates (CivilCraft/SiteCraft-type data) and makes instancing and patterns share geometry with different placements. (Idea shared with `opencadkernel`'s local frames.)

### 5.4 Robustness
- **Exact/adaptive predicates** (`orient2d`, `orient3d`, `incircle`) following Shewchuk's adaptive-precision scheme, implemented from the paper (public-domain algorithm) with expansion arithmetic on doubles. Used in: point-in-polygon on trimmed-face loops, constrained Delaunay, mesh orientation tests, loop nesting. Tested against a `BigInt` rational reference on adversarial near-degenerate inputs (BigInt only in tests).
- **Interval arithmetic** (`core/intervals.js`) for conservative root bracketing in intersections and for "definitely inside / definitely outside / ambiguous" decisions; ambiguity → refine or refuse.
- **Never compare floats with `===`** except where the algorithm is exact by construction.

### 5.5 Determinism
- Same input → same output and same IDs on one machine and Node version. Iteration order is defined by arrays and sorted keys, never by `Map` insertion order of externally-derived keys, hash-iteration, or `Date`/`Math.random`.
- **Cross-engine caveat:** the ECMAScript spec allows `Math.sin`, `Math.cos`, `Math.exp`, `Math.pow` etc. to differ in the last bits between engines. For goldens we compare within tolerance or hash after rounding. All transcendental calls go through `core/trig.js` so an fdlibm-style port can be swapped in later if bit-exact cross-browser behaviour is ever required (decision D-tr in §17).
- **v1.2 (S2, D-tr settled):** bit-exact from the start. `core/trig.js` computes sin, cos, tan, atan, atan2, asin, acos, exp, log and cbrt from + − × ÷ and √ only, which ECMAScript specifies exactly (√ since ES2025). Every engine gives the same bits; a golden hash in the tests guards them. Accuracy is measured against a BigInt reference: within 1 ulp for sin, cos, atan, exp, log and cbrt, 2 for tan, atan2 and asin, 3 for acos. cc-field made the same choice for its fields (`detmath.js`). The boundary checker's `trig` rule refuses `Math.sin` and the like, and `**`, everywhere else in the engine.
- Randomized tests use a seeded PRNG (`core/prng.js`), seed printed on failure.

### 5.6 Linear algebra needed (small, in-house)
LU with partial pivoting, banded solvers for B-spline interpolation, QR / normal-equation least squares, Newton with damped steps and bracketing fallbacks, Brent root finding, Gauss–Legendre tables (various orders) for integration. No external math library.

---

## 6. Geometry layer (`geom/`)

### 6.1 Curves
Every curve implements one interface: `domain()`, `point(t)`, `derivs(t, n)`, `tangent(t)`, `curvature(t)`, `reversed()`, `transformed(M)`, `bbox()`, `isClosed()`, `isPeriodic()`, `toNurbs()`, `type`.

| Class | Notes |
|---|---|
| `Line` | parametrized by length from origin; infinite or bounded |
| `Circle`, `Ellipse` | analytic identity kept (fast paths, exact STEP output); `toNurbs()` gives exact rational quadratics (Piegl & Tiller ch. 7) |
| `NurbsCurve` | degree p, knots, homogeneous control points, `rational` flag |
| `Polyline` | helper only, converted to degree-1 NURBS for kernel use |
| `OffsetCurve`, `IsoCurve`, `ProjectedCurve` | derived curves, added when needed (offset: S37; iso: S6) |

**Analytic identity matters.** When a circle arrives from STEP as `CIRCLE`, it stays a `Circle`. The writer emits `CIRCLE`, not a 9-point NURBS, intersection code takes the analytic fast path, and the auditor can check radius exactly. Conversion to NURBS is explicit and exact, never a silent approximation.

### 6.2 Surfaces
Interface: `domainU()`, `domainV()`, `point(u,v)`, `derivs(u,v,n)`, `normal(u,v)`, `isPeriodicU/V()`, `poles()` (degenerate points), `transformed(M)`, `bbox()`, `toNurbs()`, `type`.

`Plane`, `Cylinder`, `Cone`, `Sphere`, `Torus`, `SurfaceOfRevolution`, `SurfaceOfLinearExtrusion`, `NurbsSurface` (degreeU/degreeV, knotsU/knotsV, nu×nv net, rational flag). Same rule: analytic identity retained, exact `toNurbs()`.

### 6.3 NURBS algorithms (clean-room from the literature, Piegl & Tiller *The NURBS Book* 2nd ed., plus Farin, de Boor)
Implemented in `geom/nurbs/`:
- Knot spans and basis functions, and their derivatives (ch. 2–3)
- Rational curve and surface evaluation, derivatives of rational forms (ch. 4)
- Knot insertion, refinement, **removal**, **degree elevation and reduction**, splitting, Bézier decomposition, reversal, joining (ch. 5)
- Point inversion and projection, closed/periodic handling (ch. 6)
- Conics, circles, surfaces of revolution as NURBS (ch. 7)
- Ruled, skinned (loft), swept, Coons patches (ch. 8, 10)
- Global interpolation and least-squares approximation, with tolerance-driven fit (ch. 9)

Chapter numbers are from memory of the 2nd edition; verify against your copy. **Do not copy code from any other kernel.** Algorithms come from the books and papers in §18.

**v1.1: almost all of this list already exists in cc-nurbs**, cited by algorithm number in each file:
- **Already there:** basis A2.1–A2.3; curve A4.1, A3.2/A4.2, A5.1, A5.8, elevation (§ 5.5), reduction (§ 5.6) and A7.1 circles; surface A4.3, A3.6/A4.4; fitting A9.1 and § 9.4.1; surfaces of revolution A8.1; skinning § 10.3; sweeps § 10.4; Gordon and Coons surfaces.
- **What engine.solid adds:**
  - analytic curve and surface *classes* that keep their identity (cc-nurbs is NURBS-only; cc-step's `geom.js` and cc-acis' `geom.js` already evaluate the analytic forms)
  - exact conversions in both directions
  - interval and bounding tools for intersection (§7)
  - property tests run against cc-nurbs from engine.solid's side

  Nothing in `app/nurbs/` is edited (D8).

### 6.4 Queries (`geom/query/`)
- **Closest point / point inversion** on curves and surfaces: coarse sampling of Bézier-decomposed spans, then damped Newton with bracketing fallback. Return all local minima on request.
- **Bounding boxes**: tight via Bézier control hulls + subdivision to a requested slack; cheap loose bounds from the control polygon.
- **Length and area** by adaptive Gauss–Legendre.
- **Curvature, torsion, normal curvature** for meshing and for sweep frames.
- **BVH over spans/faces** (`aabb` tree) used by closest-point, mesh picking and intersection culling.

### 6.5 Fitting and construction (`geom/nurbs/fit`, `skin`, `sweep`)
Global curve interpolation (chord-length and centripetal parametrization; clamped, natural and tangent end conditions), least-squares approximation to a tolerance, surface interpolation, skinning with **compatibility** (common degree, unified knot vectors, point count), ruled surfaces, Coons/bilinear patches, sweeps with frame laws (Frenet, rotation-minimizing, fixed, guide-rail), twist and scale laws. KAD's SPLINE `fit`-point form converts through the interpolation routine; its `ctrl`+`knots` form maps directly.

### 6.6 Representation limits
`MAX_CTRL_POINTS` per curve/surface, `MAX_DEGREE = 15` default, `MAX_KNOTS`; violations are `LIMIT` errors. Without caps a hostile STEP file can exhaust memory (KAD2's reader caps everything for the same reason).

---

## 7. Intersection and projection (`geom/intersect/`)

Intersection is the hardest part of any kernel. It is also needed far earlier than booleans: profile validation, planar sections, projections, STEP healing, offsets, fillets. The plan builds it **in rings, each useful on its own**.

| Ring | Capability | Method | First needed by |
|---|---|---|---|
| I-0 | 2D curve–curve (planar profiles) | analytic (line/arc) exact; NURBS via Bézier clipping or subdivision with interval bracketing | S19 profile validation |
| I-1 | Point classification in trimmed domains | 2D winding with exact predicates | S13 topology |
| I-2 | Plane–surface, line–surface, curve–surface | analytic fast paths; NURBS: subdivision + Newton polish | S25/S26 sections and projection |
| I-3 | Analytic–analytic surface pairs (plane/cylinder/cone/sphere/torus) | closed forms where they exist; classify and fall to I-4 otherwise | S27 |
| I-4 | General NURBS surface–surface | find seed points by recursive bbox/interval subdivision, march along the curve with step control (predictor-corrector), detect and handle loops, branches, tangential contact, boundary exits; fit result as a NURBS curve plus pcurves | S27, later fillets/offsets, optional M9 |

Policy for hard cases: **detect and refuse rather than guess.** Tangential/near-tangential contact, coincident surfaces, singular points and self-intersections not handled return `REFUSED_NOT_SUPPORTED` with the parameter location, and the operation upstream propagates the refusal. Each refusal that a real user model hits becomes a regression test and a backlog item. This is how the kernel grows reliably without a long period of silent wrong answers.

Validation of intersection results: every point on a returned curve is projected back onto both surfaces and the residual must be below `tol.lin`; the check is a debug assertion in tests and a configurable audit in production.

---

## 8. Topology (`topo/`)

### 8.1 Entities
Vertex → Edge (3D curve + parameter range) → **Coedge** (an edge used by one loop, with orientation and a **pcurve**: the edge as a 2D curve in the face surface's (u,v) space) → Loop (ordered, closed coedges) → Face (surface + outer loop + inner loops + sense) → Shell → Solid (outer shell + void shells). A `Body` is a set of solids/shells/wires plus a `placement`.

I recommend the **coedge (radial-edge-lite) form** rather than half-edges because trimmed NURBS faces need a pcurve per edge-use and it maps directly to STEP's `ORIENTED_EDGE` / `EDGE_LOOP` / `FACE_BOUND`.

### 8.2 Tolerant modeling
Vertices and edges carry a local tolerance (≥ `tol.lin`). Imported data (STEP) rarely matches exactly, so the kernel does not insist on bit-equality between neighbours; it insists they agree within the larger of the two tolerances, and the auditor reports the worst. Newly constructed geometry uses `tol.lin` throughout.

### 8.3 Data structure
Frozen records referenced by **stable integer IDs** in typed tables (`vertices`, `edges`, `coedges`, `loops`, `faces`, `shells`, `solids`). A `Brep` snapshot is immutable; an operation builds a new snapshot reusing unchanged records. Adjacency (edge→faces, vertex→edges) is a lazily built, cached derived index (`WeakMap` keyed by snapshot). 

Decision to verify by benchmark in S11: **copy-on-write at table-chunk granularity vs full `Map` copy per op.** Start with the simplest thing that meets "1,000-face body, 100 ops, no visible lag"; chunking only if it fails.

### 8.4 Constructing valid topology
`topo/euler.js` provides Euler operators (make-vertex-edge, make-edge-face, kill-…, split/merge) that preserve the Euler–Poincaré invariant; high-level builders (`topo/build.js`) assemble from loops of curves. Builders match shared edges **by identity first, by geometry-within-tolerance second** (sewing), and orient shells consistently (outward normals via divergence-theorem volume sign).

### 8.5 Trimmed-surface subtleties handled up front (S13)
Periodic surfaces and **seam edges** (a cylinder's seam is used twice in one loop), **poles** and degenerate edges (sphere/cone apex, revolve on the axis), faces whose (u,v) domain crosses the periodic cut, tiny edges, loops that touch themselves at a vertex. Leaving these for later is the usual way kernels go wrong; each gets an explicit test body in the primitive corpus (box, cylinder, cone, sphere, torus, prism with holes, revolved vase, swept pipe, lofted blend).

**v1.1:** two existing pieces handle part of this already:
- **cc-nurbs `trim.js`** keeps trims as **polygons** in (u, v). They stay, for display and area.
- **cc-step `tess.js`** and **cc-acis `tess.js`** already unwrap periodic directions and split poles when meshing.

What is missing everywhere is an **exact** trim: a pcurve per coedge, so loops are curves rather than samples. That is S13's new work. The existing seam and pole handling is the reference for its tests.

### 8.6 Provenance and persistent names (`topo/names.js`)
Every face, edge and vertex gets a **deterministic ID derived from (operation, op input IDs, role)**, e.g. `extrude/<profileEdgeId>/side` or `extrude/<profileId>/cap-end`, hashed (non-cryptographic 64-bit or SHA-256 via a pure-JS implementation; no `crypto` dependency) into a short stable string. Consequences: re-running the same recipe yields the same names; downstream references (dimensions, mates, SKAD scripts addressing "the top face") survive edits that preserve topology; splits and merges record `derivedFrom` lists so a lookup can follow history. The report from each op lists the names created, modified and removed.

---

## 9. Modeling operations (`ops/`) — the boolean-free core

All operations: validate inputs → build → **self-audit** (auditor on the result) → return `{body, report}` or throw a typed refusal.

| Op | Behaviour | Notes |
|---|---|---|
| **Profile → face** (`ops/profile`) | assemble loops from curves in a sketch frame, find nesting (outer/holes) with exact point-in-loop, check closure and self-intersection (ring I-0), orient, build a planar trimmed face | accepts lines, arcs, circles, ellipses, NURBS/SPLINE, cubic Béziers, bulge polylines (the CadScene/KAD kinds); chaining follows the idea of KAD2's `join`, extended to splines, nesting and validity checks |
| **Extrude** | straight, symmetric, two-sided, up-to-distance, with optional draft/taper; side faces are planes/cylinders/extrusion surfaces/ruled NURBS; caps are the profile face and its translate | analytic side surfaces whenever the profile segment is analytic |
| **Revolve** | partial/full about any axis in the sketch plane; surfaces of revolution with analytic specialization (cylinder, cone, sphere, torus) | pole/seam handling is the main risk |
| **Sweep** | profile along path, frame laws (Frenet, rotation-minimizing, fixed, guide-rail), twist/scale, optional caps | refuses at cusps and where the frame degenerates |
| **Loft / skin** | through ≥ 2 section curves with compatibility enforcement, optional guide curves, caps | uses the skinning routines (§6.5) |
| **Ruled and patch surfaces** | between two curves; bilinear/Coons patch | surface bodies (open shells) are supported alongside solids |
| **Transform / mirror / pattern / instance** | rigid and similarity transforms are placement changes (no geometry copy); non-uniform scale and shear convert to NURBS; mirror flips orientation correctly | linear/polar patterns share geometry |
| **Mass properties and measurement** | area, volume, centroid, inertia via Gauss quadrature on trimmed faces + divergence theorem; min distance between entities; bounding boxes | independent of tessellation; the mesh auditor compares the two |
| **Section** | plane through body → 2D wire(s) | ring I-2; the first useful intersection feature (§12, §13) |
| **Offset / thicken / shell (whole body)** | offset surfaces approximated within `tol.fit` with an error bound; refuse on local self-intersection | later (M8) |
| **Fillet / chamfer / draft** | rolling-ball fillets between two faces; chamfers; draft angles | needs ring I-4; M8 |
| **Face split / imprint (no classification)** | split a face by a curve; a building block for local edits | M8, a stepping stone toward M9 |

What deliberately does **not** exist before M9: classify-and-merge of two bodies (union/subtract/intersect), and cutting into an existing body.

---

## 10. Meshing (`mesh/`)

Goal: **watertight, orientable, parameter-aware** meshes for display, STL/3MF/glTF export and CAM, fast enough to run in a Worker.

1. **Edge discretization first, once per edge, shared by both neighbouring faces.** This is what makes the result watertight; faces never discretize their own boundaries independently. Subdivision is adaptive by chord deviation and normal deviation (`mesh.chord`, `mesh.angle`), with curvature-based refinement and a minimum segment count for closed curves.
2. **Face meshing.** Planar faces: constrained Delaunay triangulation of the (exactly-oriented) boundary loops with holes, then optional refinement. Curved faces: mesh in (u,v) space with the same constrained triangulation plus interior grid/refinement driven by surface curvature, mapped to 3D; seams and poles are handled by the topology rules from §8.5.
3. **Normals** come from analytic surface derivatives (not averaged), with a crease-angle option for flat shading of planar faces.
4. **Output** indexed typed arrays: `positions: Float32Array`, `normals`, `indices: Uint32Array`, `faceIds` (per triangle, for picking), plus **edge polylines** with edge IDs for crisp edge rendering. Transferable between threads.
5. **Exporters:** STL (binary + ASCII), OBJ, glTF 2.0 / GLB, 3MF (optional, ZIP-store written in pure JS).
6. **Mesh auditor:** closed manifold (every edge used by exactly two triangles), consistent orientation, no degenerate triangles above threshold, mesh volume vs B-rep volume within the chord-deviation bound.

A small **dev viewer** (single HTML page, minimal WebGL, no dependencies) lands in S18 so every later session can show its result visually without involving any app.

**v1.1, starting points already in the repo:**
- cc-step `tess.js`: edge points once per edge, shared by both faces; ear clipping plus Delaunay flips in (u, v).
- cc-acis `cdt.js`: a constrained Delaunay triangulation.
- cc-nurbs `surface.tessellate`: curvature-bounded parameter lines with analytic normals.

S15–S17 adapt these to engine.solid's topology rather than starting from nothing. PartCraft's viewport can show engine.solid meshes directly, so the stand-alone dev viewer (S18) is optional.

---

## 11. Audit (`audit/`) — the independent referee

The auditor is a separate module with a deliberately narrow import list (`core`, `math`, `geom`, `topo`; **never `ops` or `mesh`**). Every constructive operation runs it on its output; every test runs it on every corpus body; users can run it on imports.

Checks (initial list, grows with bugs found):
- **Topology:** Euler–Poincaré holds; every coedge pairs with exactly one opposite coedge (closed shells); loops closed within tolerance; no dangling/orphaned entities; shell orientation consistent; each face's loops nest correctly.
- **Geometry:** each edge lies on both adjacent surfaces within `tol` (sampled + extrema); each pcurve maps to the edge curve within `tol`; vertices lie on their edges; face boundary loops do not self-intersect in (u,v); domain/periodicity consistency; surface normals non-degenerate.
- **Solid:** volume positive and consistent with the sign by shell orientation; inner shells enclosed by the outer shell; no face/face crossing for primitive-only bodies (full self-intersection test is an expensive optional mode).
- **Tolerance report:** max vertex/edge tolerance reached; any exceeding `maxEdgeTol` is a finding, not silently accepted.
- **Result type:** `{ ok, findings:[{code, severity, entityIds, detail}], stats }`.

An operation that produces `ok:false` throws `AUDIT_FAILED` (with the findings) *to the developer*, and in release mode converts to a typed refusal for the user. The model is never handed a failing body.

---

## 12. File formats (`io/`) — all pure JS, all offline

### 12.1 STEP (ISO 10303-21), writer first
**v1.1, what exists:**
- **Parser:** `app/step/part21.js` is a one-pass index plus a lazy parameter parser, complex instances included. It is the S28 parser.
- **Evaluators:** `app/step/geom.js` evaluates and inverts every geometry entity S30 needs.
- **Reader:** `app/step/read.js` reads B-reps, but only to triangles.
- **Writer:** cc-nurbs' `step.js` already writes `MANIFOLD_SOLID_BREP` / `CLOSED_SHELL` with shared edges and vertices, but its edge curves are `POLYLINE` and its faces are all B-spline.

engine.solid's work is therefore:
- **S29:** exact edge curves and analytic faces, extending cc-nurbs' writer. The extension lives in `lib/solid/io/step/` and calls into it; cc-nurbs itself is not edited.
- **S30:** build B-rep topology from cc-step's index and evaluators instead of triangles.

The bullets below keep v1.0's entity lists as the target.

**Why writer first:** the first thing KUBIC users need is to *export* a part they just modelled; the writer has no ambiguity to resolve, and its output can be validated by re-reading it with our own reader and by OpenCascade as an oracle (devshell only).

- **Part 21 tokenizer/parser** (S28): streaming, bounded (max entities, max nesting, max string length), fuzzed. Produces an instance graph; no geometry knowledge.
- **Writer** (S29): AP214 first, then AP242 geometry subset. Emits analytic entities when the kernel object is analytic (`PLANE`, `CYLINDRICAL_SURFACE`, `CONICAL_SURFACE`, `SPHERICAL_SURFACE`, `TOROIDAL_SURFACE`, `LINE`, `CIRCLE`, `ELLIPSE`), NURBS as `B_SPLINE_CURVE_WITH_KNOTS` / `B_SPLINE_SURFACE_WITH_KNOTS` (+ `RATIONAL_…` complex entities), topology as `VERTEX_POINT` → `EDGE_CURVE` → `ORIENTED_EDGE` → `EDGE_LOOP` → `FACE_OUTER_BOUND`/`FACE_BOUND` → `ADVANCED_FACE` → `CLOSED_SHELL` → `MANIFOLD_SOLID_BREP`, inside `ADVANCED_BREP_SHAPE_REPRESENTATION`, with `SI_UNIT` length context and a stated uncertainty. Names and colours (`STYLED_ITEM`) later.
- **Reader** (S30): the same entity set in reverse, plus `SURFACE_OF_REVOLUTION`, `SURFACE_OF_LINEAR_EXTRUSION`, `TRIMMED_CURVE`, `SURFACE_CURVE`/`SEAM_CURVE`/`PCURVE`, `BREP_WITH_VOIDS`, `OPEN_SHELL`/surface models, units via `CONVERSION_BASED_UNIT`, flattened assembly occurrences via `NEXT_ASSEMBLY_USAGE_OCCURRENCE` with `ITEM_DEFINED_TRANSFORMATION`. Everything outside this list is *counted and reported as skipped* (the CadScene `skipped` convention), never silently dropped.
- **Healing** (S31): gaps within the file's stated uncertainty, missing pcurves (computed by projection), flipped orientations, sliver edges, duplicate vertices. Output includes a healing report; anything beyond tolerance is refused.
- **Corpus** (S32): public STEP test sets (NIST's public CAx test files; check redistribution terms before committing any) kept out of the repo and fetched manually by the developer into a local `corpus/` folder for oracle runs. The repo itself ships only small hand-made and generated STEP files. This keeps the repo offline-clean and licence-clean.

### 12.2 Mesh formats
STL, OBJ, GLB, optional 3MF writers (S17). STL/OBJ readers as mesh-only utilities, no B-rep reconstruction.

### 12.3 ACIS SAT/SAB (optional S33)
DWG (and DXF `3DSOLID`/`BODY`/`REGION`) embed ACIS data. A pure-JS SAT reader that lifts ACIS analytic surfaces and NURBS into the kernel would let SuperCad display and measure DWG solids with no vendor library. The binary SAB form and the exact record layouts need verification against Spatial's published format documentation before committing to this session; treat it as optional and unscoped until then. Writing SAT is not planned.

**v1.1:** that reader exists. cc-acis (`tests/lib/acis/`, canonical in the monorepo's `lib/acis`) reads SAT and SAB, across versions, into topology and geometry: planes, cones, cylinders, spheres, tori and B-spline surfaces; lines, ellipses and B-spline intcurves. It has its own spec-gap notes. S33 becomes **lifting cc-acis' model into engine.solid topology** instead of triangles. That is much smaller, and it no longer waits on verifying the format.

### 12.4 DXF/DWG interplay
Kernel output reaches 2D drawings only through **derived 2D geometry** (sections and projections, §13). `3DFACE`, `MESH`, `SURFACE` entities from DXF are read as meshes/surfaces by an adapter, not as B-reps.

---

## 13. Integration with KAD2, KUBIC, KRAFT, PartCraft, KARVE

### 13.1 KAD2: the `step` backend
KAD2's `FormatRegistry.registerBackend({id, formats:['step'], read, write})` is the seam. The kernel ships an adapter module (outside `src/`, in `adapters/kad2/`) that:
- **read:** STEP → kernel bodies → returns a `CadScene` containing the *2D projection or planar sections* the user asked for (for drawing) **and** hands the bodies to the document's body store (below). This replaces KAD 1's `stepChainEdges` planar-cross-section stub and ends `STEP_KERNEL_CHOSEN = false`.
- **write:** bodies → STEP.
- Runs in a Worker; `registerBackend` needs KAD2's `admin` capability, which the app grants itself at startup (backends are code, not user content).

### 13.2 A 3D document model that does not break the 2D engine
KAD2's entity kinds reduce everything to lines/arcs for picking/snap/render in 2D. 3D bodies do not belong in that registry in v1. Plan:
- **Bodies live in their own versioned collection** in the document model (`doc.bodies`), with immutable snapshots, undo via the existing transaction machinery (one transaction = one body change).
- **2D drawings see bodies only through derived entities:** `body.section` and `body.project` write ordinary KAD entities (lines, arcs, splines/béziers) onto a chosen layer, tagged with the source body ID so they can be refreshed.
- **`.kad` serialization:** bodies go in a **dedicated top-level key with its own size policy** (e.g. 64 MiB configurable cap, optionally storing STEP text or a compact JSON of the kernel's snapshot). KAD2's passthrough cap (32 keys, 1 MiB) is too small and *older KAD2 builds would silently drop larger bodies on re-save*. **Open decision D-kad:** (a) bump `.kad` to version 2 so old readers refuse instead of drop, or (b) keep v1 and make old readers detect-and-refuse any unknown `bodies` key they can't carry.
- Kernel geometry is **not rounded** with `R6` (§3). The `.kad` writer serializes with round-trip precision (17 significant digits) for kernel data only.

### 13.3 Commands and capabilities
New command family, same schema/capability machinery as the existing 42:

| Command | Capability | Notes |
|---|---|---|
| `body.fromProfile`, `body.extrude`, `body.revolve`, `body.sweep`, `body.loft` | `doc.write` | arguments reference entity IDs or inline profiles; dry-run supported |
| `body.transform`, `body.pattern`, `body.delete` | `doc.write` | |
| `body.measure`, `body.massProps`, `body.audit` | `doc.read` | |
| `body.section`, `body.project` | `doc.write` | writes derived 2D entities |
| `body.tessellate` | `doc.read` | returns transferable buffers |
| `body.importStep`, `body.exportStep` | `io.import` / `io.export` | |

**Budgets:** JavaScript cannot preempt a running function, so every kernel entry point accepts a `budget` (`maxMs`, `maxEntities`, `maxIterations`) checked cooperatively in loops via `core/limits.js`, throwing `LIMIT`. In a Worker the host can additionally terminate a runaway job. This is what makes it safe to expose the kernel to KAD2's AI/cloud capability sessions.

### 13.4 KUBIC
**v1.1, what the code is today** (review §3): extrude-only prisms. S36's KUBIC target is concrete:
1. Replace `findLoops` with engine.solid's profile builder. It reads KUBIC's `Sketch` objects unchanged: `LINE`, `ARC {startA, endA, ccw}`, `CIRCLE`, `POLYLINE {pts, closed}`.
2. Replace `doExtrude` / `solidFaces` with `body.extrude`.
3. Replace `exportSTL` with engine.solid's mesh exporter.
4. Add a `bodies` section to `.kbc`.
5. Add STEP export.

This fixes K1–K8. K9–K15 are KUBIC's own bugs, to fix in KUBIC.

The kernel is KUBIC's solid engine. Mapping of KUBIC's promised features:
- sketch → solid (extrude/revolve/sweep/loft): **M4**
- STL and STEP export: **M3 (STL), M6 (STEP)**
- push/pull **outward** on a planar face: expressible as a local face-extrude with a refusal when the new prism would hit existing geometry (no classification needed, bbox/mesh clash test); scheduled in **M8** as a boolean-free local op
- push/pull **into** material, hole/pocket cut, union/subtract/intersect: **M9** (v1.2: planned, D3); until then KUBIC offers them only through sketch-based alternatives (draw the hole in the profile) or does not offer them

### 13.5 KRAFT and SKAD
SKAD's "3D needs KRAFT" messages become real: KRAFT is a thin script layer over the `body.*` commands. The kernel's stable face/edge names (§8.6) are what let a script say "the top face of the extrusion" and stay valid after parameters change.

### 13.6 PartCraft
PartCraft's `ExactKernel` interface (`app/exact-client.js`) already lets an exact kernel be switched on and off. Plan: an adapter implementing that same interface on top of engine.solid, so the OpenCascade module and engine.solid are interchangeable behind the same toggle, and **OpenCascade becomes purely an oracle** in the devshell test run (`--oracles`). The interface itself will be read in S36 (not re-read in this planning session).

**v1.1:**
- **The seam:** `ExactKernel` starts `brep-worker.js` in a Worker, assembled from blob modules, and is called as `k.call('regen', { part })`. engine.solid's adapter is a worker that answers the same messages. With PartCraft as engine.solid's home, this is the **first** integration, not the last: it is what turns on PartCraft's "Not built yet" exact-B-rep features (`PROVENANCE.md`).
- **Move it earlier:** S36's PartCraft part should be pulled forward to right after the v0.5 gate (M4), ahead of STEP.
- **Also first in line:** PartCraft's own sketcher (`sketch*.js`) is engine.solid's first profile source, before KUBIC.

### 13.7 KARVE and KAM
KARVE (lathe/mill) gets revolve/section/offset; KAM (nesting, G-code) gets planar sections and flattened outlines of planar faces. Neither requires new kernel features beyond M4/M5; they just consume the commands.

**v1.1:** KARVE's own G-code is a placeholder and must not be run on a machine (review §4.1). PartCraft already has a CAM stack (`cam-*.js`). The sensible route is:

engine.solid geometry (turned half-sections, planar sections) → PartCraft CAM toolpaths → KARVE as the lathe/mill front end.

KARVE's material table and operation list are worth keeping.

---

## 14. Roadmap — one session, one complete build

Legend: ☐ not started, ☑ done. Each session ends with passing tests, updated `STATUS.md`, and a commit (see §16). "Accept" lists the minimum acceptance tests.

### v1.1 re-scope — what each session becomes now that PartCraft has cc-nurbs, cc-step and cc-acis

| Session | v1.1 status | What is left |
|---|---|---|
| S0 | **done** (2026-11-12) | review §2 is the audit table |
| S1 | **done** (2026-11-12) | `lib/solid/` (index, core/errors, core/tol, core/limits), the 14-rule boundary checker with its fixtures, `tools/solid/test.mjs`, `bin/test-solid.mjs`; see `STATUS.md` |
| S2 | **done** (2026-11-12) | `core/float`, `trig`, `prng`, `intervals`; `math/vec3`, `mat4`, `frame`, `aabb`, `quad`, `roots`, `linalg`; the `trig` rule; see `STATUS.md` |
| S3 | **done** (2026-11-12) | `math/predicates.js`: orient2d, orient3d, incircle, insphere; 0 disagreements with BigInt on 1.56e6 cases; see `STATUS.md` |
| S4 | **done** (2026-11-12) | `geom/basis.js` on cc-nurbs' `basis.js`; exact Cox–de Boor tests; the unclamped-end fix; see `STATUS.md` |
| S5–S6 | **exists** (`curve.js`, `surface.js`) | engine.solid-side property tests against cc-nurbs; wrappers only. **v1.3:** `curve.js` and `surface.js` are not same-bits, so D-det comes first |
| S7 | new | analytic classes plus exact conversions. cc-step `geom.js` and cc-acis `geom.js` evaluate the analytic forms and are the reference |
| S8 | **exists** (`fit.js`) | adapters only: KAD SPLINE (fit or control form) and KUBIC / PartCraft sketch curves |
| S9 | **exists** (`construct.js`) | engine.solid-side tests |
| S10 | partial | closest point, bounding boxes, length and area exist; interval bounds and a BVH are new |
| S11–S12 | new | the core: topology model, stable IDs, Euler operators, builders, sewing **by identity** |
| S13 | new | exact pcurve trims (cc-nurbs' polygon trims stay, for display) |
| S14 | new | auditor plus corpus; cc-nurbs' box / cylinder / sphere are cross-checks |
| S15–S16 | adapt | from cc-step `tess.js` and cc-acis `cdt.js` |
| S17 | adapt | check PartCraft's existing exporters first; KUBIC's STL writer is the format reference, not the triangulation |
| S18 | optional | PartCraft's viewport can show engine.solid meshes |
| S19 | new | profile builder; inputs are PartCraft's sketch, KUBIC's `Sketch`, KAD2's CadScene |
| S20–S22 | new as B-rep ops | surfaces come from `construct.js` (`extrude`, `revolve`, `sweep1/2`, `loft`) |
| **S24b** | new, **moved up** | PartCraft `ExactKernel` adapter (worker answering `regen`) right after the v0.5 gate; was part of S36 |
| S28 | **exists** (`app/step/part21.js`) | caps and fuzzing only |
| S29 | extend | cc-nurbs `step.js` writes `MANIFOLD_SOLID_BREP` with `POLYLINE` edges; engine.solid writes exact edges and analytic faces |
| S30 | new on existing parts | topology from cc-step's index and `geom.js` |
| S33 | lift | cc-acis model → engine.solid topology |
| S36 | smaller | KUBIC (§13.4), KRAFT, then KAD2 (S34–S35); PartCraft already done in S24b |
| S37 | partial | cc-nurbs `construct.offset` (surface offset) exists; bodies and thickening are new |
| S38 | partial | cc-nurbs `blend.rollingBall` geometry exists; trimming the faces **without** `solid.boolean` is new |
| all others | as v1.0 | |

Below is the v1.0 roadmap, kept as written. Read each row together with the table above.

### M0 — Ground (S0–S3)
| ☐ | Session | Build | Accept |
|---|---|---|---|
| ☑ | **S0** | *Audit and decisions (no kernel code)*: read PartCraft `app/step/` and `app/nurbs/` and the `ExactKernel` interface; decide reuse vs rewrite per module; confirm D3, repo name, D-kad, D-tr (§17) | written audit table in `STATUS.md`; each reusable module has a provenance/licence note |
| ☑ | **S1** | Repo scaffold: `package.json` (zero deps), LICENSE-MIT/APACHE/NOTICE, `PROVENANCE.md`, `STATUS.md`, `core/errors.js` (KAD2 shape), `core/tol.js`, `core/limits.js`, `tools/check-boundaries.mjs`, `node --test` runner, CI workflow | `npm test` green; boundary checker fails a deliberately violating fixture; no-hard-coded-epsilon lint works |
| ☑ | **S2** | Math kit: `vec3`, `mat4`, `frame`, `aabb`, Gauss–Legendre tables, root finders, LU/banded/QR solvers, intervals, seeded PRNG, `trig` shim | property tests pass (1e5 random cases); solver residual and condition-number tests |
| ☑ | **S3** | Adaptive exact predicates (`orient2d/3d`, `incircle`) | 0 disagreements vs BigInt reference on 1e6 random + adversarial near-degenerate inputs |

### M1 — Splines (S4–S10)
| ☐ | Session | Build | Accept |
|---|---|---|---|
| ☑ | **S4** | Knot vectors, span search, basis functions and derivatives | partition of unity, non-negativity, derivatives vs high-order finite differences, Bézier case equals Bernstein |
| ☐ | **S5** | `NurbsCurve`: eval/derivs/tangent/curvature, knot insertion/refinement/removal, degree elevation/reduction, split, Bézier decomposition, reverse, join | every shape-preserving op reproduces the curve to ≤ 1e-12 on random curves |
| ☐ | **S6** | `NurbsSurface`: eval/partials/normal, iso-curves, same shape ops in U and V, swap UV, split | same shape-preservation tests; normal orthogonality |
| ☐ | **S7** | Analytic classes and exact conversions: `Line`, `Circle`, `Ellipse`, `Plane`, `Cylinder`, `Cone`, `Sphere`, `Torus`, revolution/extrusion surfaces ↔ NURBS | converted radius/axis error < 1e-12; area of sphere/torus patches vs closed form < 1e-9 relative |
| ☐ | **S8** | Fitting I: global interpolation (chord/centripetal), end conditions, least-squares approximation to tolerance; KAD SPLINE `fit`→control-point path | interpolation passes through data to 1e-10; approximation error ≤ requested `fit` on a test corpus |
| ☐ | **S9** | Construction: ruled, skinning with compatibility, Coons/bilinear patches, surface interpolation | skinned surface passes through sections; compatibility refusals typed |
| ☐ | **S10** | Queries: closest point/inversion (curves, surfaces), tight bboxes, length/area, BVH | closest-point matches brute force on 1e4 random queries; bbox contains dense samples and is within slack |

### M2 — Topology (S11–S14)
| ☐ | Session | Build | Accept |
|---|---|---|---|
| ☐ | **S11** | Topology data model, stable IDs, immutable snapshots, adjacency index; chunking decision by benchmark | 1,000-face body × 100 ops benchmark recorded; round-trip clone equality |
| ☐ | **S12** | Euler operators, loop/face/shell builders, sewing, orientation | Euler–Poincaré holds for random op sequences; box/prism built both ways are equivalent |
| ☐ | **S13** | Trimming, pcurves, periodic seams, poles/degenerate edges, point-in-face with exact predicates | cylinder/sphere/cone/torus test bodies construct; seam and pole cases covered by explicit tests |
| ☐ | **S14** | Auditor v1 (topology + geometry checks) and the **primitive corpus** (box, cylinder, cone, sphere, torus, prism with holes, revolved vase) | auditor passes the corpus and fails ≥ 20 deliberately corrupted bodies (each check is proven to fire) |

**Release gate v0.1:** "geometry + topology + auditor". Library only.

### M3 — Mesh (S15–S18)
| ☐ | Session | Build | Accept |
|---|---|---|---|
| ☐ | **S15** | Edge discretization (adaptive, shared) | chord/angle bounds met on random curves; closed curves min segments |
| ☐ | **S16** | Face meshing: planar constrained Delaunay with holes; curved faces in (u,v) with refinement | no inverted triangles; chord deviation within bound; seams/poles correct |
| ☐ | **S17** | Watertight solid meshing, normals, exporters (STL/OBJ/GLB, optional 3MF), mesh auditor | every corpus body: closed manifold, consistent orientation, mesh volume within bound of B-rep volume |
| ☐ | **S18** | Worker host (`api/worker.js`) with transferable buffers; single-page dev viewer | corpus renders; tessellating the corpus in the Worker does not block the main thread |

### M4 — Solid construction, no booleans (S19–S24)
| ☐ | Session | Build | Accept |
|---|---|---|---|
| ☐ | **S19** | Profile → face (loop assembly, nesting, orientation, holes) including ring I-0 (2D curve–curve) for self-intersection checks; CadScene/KAD entity adapter | open/self-intersecting profiles refused with locating details; hatch-like nested loops resolved; bulge polylines and Béziers accepted |
| ☐ | **S20** | Extrude (straight, symmetric, two-sided, to-distance, draft/taper) with provenance names | audited valid for a 200-profile fuzz set; analytic sides stay analytic; names stable across re-runs |
| ☐ | **S21** | Revolve (partial/full) with poles/seams | cylinder/cone/sphere/torus produced by revolve are identical (within `tol`) to the S14 primitives |
| ☐ | **S22** | Sweep (frame laws, twist/scale, caps) and loft solids | pipe of known radius has exact volume within 1e-6 relative; refusals at cusps |
| ☐ | **S23** | Transform, mirror, pattern, instances; placement frames; geometry sharing | mirror flips orientation correctly (audit); 10,000 instances share geometry (memory test) |
| ☐ | **S24** | Mass properties and measurement (area, volume, centroid, inertia, min distance, bbox) | closed-form agreement on primitives to 1e-9 relative; mesh vs B-rep consistency |

**Release gate v0.5 — "Generative kernel":** sketch to solid, validate, mesh, measure. Usable by KUBIC for prismatic/revolved/swept parts.

### M5 — Intersection I (S25–S27)
| ☐ | Session | Build | Accept |
|---|---|---|---|
| ☐ | **S25** | Curve–surface, line–surface, plane–surface (analytic fast paths + NURBS) | residual ≤ `tol.lin`; compared with dense sampling; tangent cases typed-refused |
| ☐ | **S26** | Planar **section** of a body → 2D wires; planar **projection/silhouette** → 2D curves; KAD entity output | section areas equal mass-properties cross-sections; works on the primitive corpus + S20–S22 bodies |
| ☐ | **S27** | Analytic–analytic surface pairs and general NURBS surface–surface marching with typed refusals | residual ≤ `tol.lin` on a pair corpus; every refusal case has a regression fixture |

### M6 — STEP (S28–S33)
| ☐ | Session | Build | Accept |
|---|---|---|---|
| ☐ | **S28** | Part 21 tokenizer/parser and instance graph | fuzzed (1e5 mutated inputs): no crash, no hang, bounded memory; limits typed |
| ☐ | **S29** | STEP **writer** (AP214, then AP242 geometry subset) | own reader (S30) round-trips the corpus; OpenCascade oracle reads it with equal area/volume (devshell) |
| ☐ | **S30** | STEP **reader** geometry/topology → kernel | corpus models audit-clean or refused with typed reasons; units correct |
| ☐ | **S31** | Healing and sewing for imports | files with gaps ≤ stated uncertainty heal; report generated; > tolerance refused |
| ☐ | **S32** | Conformance corpus run + AP242 extras (names, colours) | pass-rate table in `STATUS.md`; every failure classified |
| ☐ | **S33** | *(optional)* ACIS SAT reader for DWG/DXF solids | only after the format is verified; display + measure of DWG solids |

**Release gate v0.8 — "Exchange":** STEP in/out.

### M7 — Integration (S34–S36)
| ☐ | Session | Build | Accept |
|---|---|---|---|
| ☐ | **S34** | KAD2 `step` backend, `doc.bodies` collection, `.kad` bodies section (decision D-kad), Worker hosting | open a STEP file in KAD2, see its section/projection in 2D, save/reload `.kad` with bodies intact; old-reader behaviour per D-kad |
| ☐ | **S35** | `body.*` commands, schemas, capabilities, cooperative budgets, dry-run/proposal support | command reference regenerates; capability-restricted session cannot write; budget overrun yields `LIMIT` |
| ☐ | **S36** | KUBIC adapter, KRAFT script hooks, PartCraft `ExactKernel` adapter | KUBIC extrude→STL/STEP end-to-end; PartCraft toggle swaps kernels; oracle comparison runs |

**Release gate v1.0-beta.**

### M8 — Advanced, still boolean-free (S37–S39)
| ☐ | Session | Build | Accept |
|---|---|---|---|
| ☐ | **S37** | Offset curves/surfaces, thicken, whole-body shell (approximation within `tol.fit`, refuse on local self-intersection) | offset error bound reported; thickened prism volumes match closed forms |
| ☐ | **S38** | Fillet and chamfer (rolling ball between two faces, constant radius), using ring I-4 | fillet radius deviation ≤ `tol.fit`; corner cases refused with locations |
| ☐ | **S39** | Face split/imprint; draft; **push/pull outward** on planar faces with clash refusal | KUBIC push-out works on corpus; clash detected and refused |

### M9 — NURBS booleans (S40–S42) — v1.2: planned (D3 settled: in scope, not dominant)
| ☐ | Session | Build | Accept |
|---|---|---|---|
| ☐ | **S40** | Face classification and imprinting (intersection curves from ring I-4, split faces, inside/outside labelling with exact predicates) | classification agrees with a point-membership oracle on random points |
| ☐ | **S41** | Union / intersect / subtract on NURBS B-reps | audit-clean results on a boolean corpus; every refusal typed; OCCT oracle comparison of volumes |
| ☐ | **S42** | Robust fallbacks and tolerance escalation; coincident-face and tangent cases | adversarial corpus pass-rate target agreed with the owner before starting |

### M10 — Hardening and 1.0 (S43–S44)
| ☐ | Session | Build | Accept |
|---|---|---|---|
| ☐ | **S43** | Performance pass (allocation profiling, scratch buffers, BVH use, Worker pool) | benchmark targets in §16.2 met or revised with evidence |
| ☐ | **S44** | Fuzz sweep, docs generated from code, API freeze, licence/NOTICE audit | v1.0 tag; generated reference up to date; no unsupported-claim in README |

**Effort realism.** M0–M4 (S1–S24) are well-trodden territory with clear acceptance tests. S25–S27 (intersection) and S38 (fillets) carry the real uncertainty. M9 is where every kernel project in history spends the most time; keeping it last (v1.2: planned, no longer optional) is the biggest risk reduction in this plan. A "session" is one build, not a fixed number of hours.

---

## 15. Licence and provenance

**Your code (D5).** KAD, KAD2, KADsuite and siblings are yours and are reissued MIT/Apache. The copies I read still carry `SPDX-License-Identifier: AGPL-3.0-or-later` headers and AGPL/trademark text in places. As instructed, I treated that as stale and did not weigh it. One housekeeping session (can run any time, not blocking) should still sweep those headers to the actual licence so downstream users, contributors and licence scanners see the same thing you do. Suggested header for new kernel files:

~~v1.0 suggested `MIT OR Apache-2.0`.~~ **v1.1:** new kernel files use PartCraft's first line, Apache-2.0 (PartCraft's `LICENSE` and `NOTICE`: Copyright The Data Design Group, Inc.). **v1.2:** that is also the licence of every engine (getcadcraft.com › Engines) and of the library repo's scripts; the library's items keep their own licences, item by item:

```js
/* SPDX-License-Identifier: Apache-2.0 */
```

Apache-2.0 also carries the explicit patent grant that suits a geometry kernel. If engine.solid is later published on its own under MIT as well, that is the owner's choice to make then. This is not legal advice.

**KAD snapshots** (`reference/kad/`) keep their stale `AGPL-3.0-or-later` headers byte-for-byte, so they still match their sources (`MANIFEST.json`). The owner, as sole author, has reissued that code (`reference/kad/README.md`). When engine.solid takes code from a snapshot:
- the new file gets the Apache-2.0 line above
- `docs/solid/PROVENANCE.md` records the snapshot and line range

The header sweep belongs in the KAD repositories themselves.

**Clean-room rule for the kernel (so the copyright stays unambiguously yours):**
1. Algorithms come from **books, papers and standards** (§18), not from other kernels' source.
2. Other kernels (OpenCascade, SMLib/USD BRep, `solid-kernel`, `opencadkernel`, `verb-nurbs`, `truck`, etc.) are **black-box oracles in tests only**; do not read or paste their source while implementing the corresponding module. Re-check each one's licence before you let it anywhere near the repo.
3. `PROVENANCE.md` records, per module: which book/paper section it implements, which oracle (if any) validated it, and the session date. Modules reused from PartCraft get a provenance line stating origin.
4. Test corpora from third parties (NIST, etc.) are **not committed**; they are fetched locally by the developer, and `corpus/README` states each source and its terms.
5. The repo stays free of generated or vendored third-party code in `src/`. `NOTICE` lists anything that is ever added.

---

## 16. Verification strategy and session protocol

### 16.1 Verification layers
| Layer | What | Where |
|---|---|---|
| Unit | one function, known answers | `test/unit/` (`node --test`, no framework) |
| Property | random inputs from a seeded PRNG; invariants (partition of unity, shape-preserving ops, Euler–Poincaré, round trips) | `test/property/` |
| Closed-form identities | sphere/torus areas and volumes, circle radius, pipe volume | `test/unit/identities/` |
| Corpus + auditor | every constructed body is run through `audit/` | `test/corpus/` |
| Oracle comparison | opt-in (`npm run test:oracles`), developer machine only: compare area/volume/bbox/point-on-surface/STEP read-back against OpenCascade (and others if wanted) | `test/oracle/`, `tools/oracle-run.mjs` |
| Fuzz | mutated STEP/Part 21, random profiles, random op sequences | `test/fuzz/` |
| Determinism | hash of rounded outputs for fixed seeds; run on two Node versions | CI |
| Architecture | boundary checker, no-forbidden-globals scan, no-hard-coded-epsilon lint | CI |
| Browser | Worker host + dev viewer under Chromium (same approach as KAD2's 40 Chromium checks) | CI (optional job) |
| Benchmarks | per-op timing and allocation tracked over time | `tools/bench.mjs` |

Oracle assets (OpenCascade wasm etc.) are **never committed** and never loaded by any app path; they exist in the devshell like PartCraft's `oracles` vendor area.

**v1.2 (S2), what is in place:** exact references in BigInt for anything about rounding (`tools/solid/bigref.mjs`); a C program as a second implementation of the generator; a golden hash of results for the same bits everywhere; seeded property tests that print their seed; and a mutation run each session, where deliberate faults must make the suite fail. `docs/solid/TESTING.md` explains the method.

### 16.2 Performance targets (hypotheses to be replaced by measured values)
- Degree-3 curve evaluation: ≥ 2 million points/s single-threaded in Node.
- Extrude a 1,000-segment profile including audit: < 100 ms.
- Tessellate a 5,000-face body at default tolerance in a Worker: < 2 s.
- Audit a 5,000-face body: < 1 s.
- Parse 10 MB of STEP text: < 3 s.

### 16.3 Session protocol (one complete build per session)
**Start**
1. Read `STATUS.md` (what is built, what failed, what is next) and the session's row in §14.
2. State the session's acceptance criteria back before coding.

**Build** — tests first where the answer is known; keep the diff to the session's scope; anything that turns out to be a different session's job goes into `STATUS.md` "Found" instead of being absorbed.

**Gates (all must pass to close the session)**
- **v1.2:** `node bin/test-solid.mjs` (unit + property + corpus + audit). Before the pull request, and whenever a host takes a new copy: that host's own tests with the copy in place (PartCraft's `npm test`, then ModelCraft's and the others').
- boundary check, forbidden-globals scan, epsilon lint
- the session's acceptance tests, listed by name in `STATUS.md`
- benchmark recorded if the session touches a hot path

**Close**
- Update `STATUS.md` (Done / Learned / Found / Next), `PROVENANCE.md` (sources used), `HANDOFF.md` if a decision changed (and §17's log).
- Commit with a message that names the session (e.g. `S5: NurbsCurve ops — insertion, removal, elevation`).
- Report to the owner: what now works, what refuses (with the typed code), what is next.
- **Never push or open a pull request without the owner's go-ahead.**

---

## 17. Risks, open decisions, decision log

### 17.1 Risk register
| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Surface/surface intersection robustness | High | rings I-0…I-4; detect-and-refuse; every real failure becomes a fixture; interval bracketing; residual check on every result |
| R2 | Seams, poles, periodic domains in trimmed faces | High | handled in S13 before any op depends on them; explicit corpus |
| R3 | Tolerance inconsistency across modules | High | single `Tolerance` object; epsilon lint; tolerant edges; auditor reports worst tolerance |
| R4 | STEP in the wild is varied and messy | High | reader counts and reports skipped entities; healing session; real-file corpus run; refusal over guess |
| R5 | Pure-JS performance | Medium | typed arrays, scratch buffers, BVH culling, Worker, cooperative budgets; targets in §16.2 revised by measurement |
| R6 | Scope creep into booleans | Medium | M9 comes last (v1.2: planned, D3); all boolean-adjacent work is expressed as separate, useful ops |
| R7 | KUBIC marketing promises booleans | Medium | **v1.2:** D3 decided and M9 scheduled; until M9, KUBIC's copy should say booleans are coming |
| R8 | `.kad` compatibility when bodies are added | Medium | D-kad decision before S34 |
| R9 | Cross-engine `Math.*` differences | ~~Low–Med~~ **v1.2: closed** | `core/trig.js` computes its own functions, bit-exact everywhere; goldens hash exact bits (S2) |
| R10 | Bus factor (one maintainer) | Medium | `STATUS.md`, this handoff, tests as documentation, generated docs |
| R11 | Licence contamination from reading other kernels | Medium | clean-room rule (§15), `PROVENANCE.md` |
| R12 | Browser memory limits on big bodies | Medium | limits and caps everywhere; immutable sharing; Worker memory budget; streaming parse |
| R13 | **v1.1:** engine.solid depends on cc-nurbs / cc-step, which are synced copies of monorepo libraries; an upstream change can break engine.solid, and a local fix breaks the byte-identical rule | Medium | import read-only (D8); engine.solid's tests exercise every cc-nurbs function it uses; fixes go upstream (D-ccn) |
| R14 | **v1.1:** KUBIC and KARVE are prototypes with real bugs (review §3–§4); integrating early exposes users to them | Medium | fix K9–K15 and V1–V5 in the apps before S36; label KARVE's G-code "preview only" |

### 17.2 Open decisions (to settle in S0 unless noted)
| ID | Question | My lean |
|---|---|---|
| D3 | Confirm "no booleans" reading (§1) | **resolved (v1.2):** booleans in scope, not dominant; M9 planned |
| D-repo | Repo name and location | **resolved (v1.2, D-home; moved 2026-11-13):** first the library repo, now the site repo, `lib/solid/`, branch `engine/solid` |
| D-ccn | **v1.1:** when engine.solid needs a change in cc-nurbs or cc-step, does it go to the monorepo's canonical copy first, or may PartCraft's copy diverge for a while? | canonical first; engine.solid works around gaps in its own files meanwhile |
| D-lic | **v1.1:** header for engine.solid files | **resolved:** `Apache-2.0`, as PartCraft |
| D-name | **v1.1:** KUBE vs KUBIC | KUBIC is current (owner, 2026-11-12); nothing new says KUBE |
| D-kbc | **v1.1:** how `.kbc` carries bodies (as D-kad for `.kad`) | same answer as D-kad |
| D-kad | How `.kad` carries bodies (v2 bump vs v1 + detect-and-refuse) | v2 bump is cleaner; decide before S34 |
| D-tr | Own fdlibm-style `sin/cos/exp/pow` or accept `Math.*` | **resolved (v1.2, S2):** own functions from + − × ÷ and √, bit-exact everywhere (§5.5) |
| D-det | **decided (b), 2026-11-12; (a) kept for later investigation.** (b): S5–S6 import only the cc-nurbs functions that are exact (+ − × ÷, √), and a checker guard keeps `arc`, `circle` and `angle` out. Circles come from engine.solid's own code on `core/trig.js` (S7). Original question, **v1.3 (S4):** cc-nurbs' `vec.js`, `curve.js`, `surface.js` and `fit.js` use `Math.atan2`, `sin`, `cos`, `tan` and `**`, which differ between engines in the last bits. How does engine.solid use them without losing the same bits (§5)? | (b) import under `solid-allow: reach` with the functions used listed and checked to be + − × ÷ only, now; (a) deterministic trig upstream in the site's `lib/nurbs/` when the owner agrees; not (c), own evaluators (against D8) |
| D-ccn2 | **v1.2 — taken as proposed at S4 (2026-11-12):** how cc-nurbs and cc-step come to sit beside the engine in the library repo before S4 (D8). cc-nurbs was a pinned copy in `lib/nurbs/` (`tools/solid/sync-nurbs.mjs`, `pins.json`). **Settled 2026-11-13 by the second option:** the engine moved into the site repo, where cc-nurbs is canonical beside it; the pins and `sync-nurbs.mjs` are gone. cc-step waits: its two copies have drifted (`STATUS.md`) | synced copies, as `tools/shapes/` is; or move the engine into the site's `lib/` first |
| D-size | **decided (A), 2026-11-13: a 1 km box with `ang` 1e-12 by default; the box belongs to the Tolerance, so a larger model declares a larger box with a matching tolerance, and other engines (CivilCraft, BimCraft) are not bound by it. Built in 0.0.8.** v1.4 (second review): the model's size box. `lin` 1e-6 mm and `ang` 1e-9 rad agree only out to 1,000 mm (two directions parallel within `ang` drift apart by more than `lin` beyond that), and no maximum extent is declared. Choose a box and make the two tolerances consistent inside it. Before S5 fixes how parallelism and coincidence are compared | a 1 km box (±5e5 mm) with `ang` = 1e-12, the ratio Parasolid uses (1e-8 m, 1e-11 rad, 1 km); doubles resolve 1e-10 mm there |
| D-wire | **decided (A), 2026-11-13: plain-data forms (`toData` / `fromData`) for every record. Built in 0.0.8.** v1.4 (second review): how checked records cross a worker boundary. Tolerances, budgets, frames and knot vectors are recognised by a private registry, so a `postMessage` copy, or a record from a second loaded copy of the engine, is not recognised. Curves, surfaces and topology will follow the same pattern. Before S5 defines the curve record | every record type gets a plain-data form and a checked way back (`toData` / `fromData`), tested by a round trip through `structuredClone`; nothing but plain data crosses a boundary |
| D-store | Copy-on-write granularity for B-rep tables | decide by S11 benchmark |
| D-ts | Ship optional `tsc --checkJs` dev script | yes, strictly optional |
| D-ap | AP242 scope (geometry only, or names/colours/PMI) | geometry + names + colours; PMI out |
| D-sat | ACIS SAT reader (S33) | optional; verify format documentation first |
| D-view | Dev viewer inside the kernel repo or only inside apps | inside the kernel repo, single HTML, no deps |
| D-unit | Kernel units fixed at mm, or configurable | fixed mm; apps convert at the boundary (as KAD2 does) |

### 17.3 Decision log
Append entries as `YYYY-MM-DD · ID · decision · reason · who`.

- 2026-11-12 · D1–D6 · see §1 · planning session · owner
- 2026-11-12 · D-id · reuse of KAD2 `EngineError` shape, capability vocabulary, and `registerBackend` seam for the kernel API · consistency with the engine the kernel plugs into · proposed
- 2026-11-12 · D7 · PartCore is built in the PartCraft fork (`withshalom/getpartcraft`), branch `partcore` · owner's direction · owner
- 2026-11-12 · D8 · build on cc-nurbs / cc-step / cc-acis; never edit `app/nurbs/` in place · S0 audit (review §2) · proposed
- 2026-11-12 · D-lic · engine.solid files are Apache-2.0 · PartCraft's licence · proposed
- 2026-11-12 · D-id (amended) · inside PartCraft, `solid.err.*` i18n codes in cc-nurbs' style; KAD2's `EngineError` only at the KAD2 adapter · PartCraft convention · proposed
- 2026-11-12 · D-kname · the kernel is named **PartCore**; it is built on branch `partcore`, in `app/partcore/` · owner's direction · owner
- 2026-11-12 · D-err (S1) · `SolidError(code, vars)`, as cc-nurbs' `NurbsError(code, vars)`: `vars` (not `details`) are the values the app's message puts in its `{placeholders}` · PartCraft's language tables use `{name}` placeholders · S1
- 2026-11-12 · D-spec (S1) · import specifiers in `lib/solid/` are single-quoted, relative, lower-case `[a-z0-9-]` names ending in `.js` · `exact-client.js` `blobModules()` only follows imports written that way, and S24b runs engine.solid in that worker · S1
- 2026-11-12 · D-name · renamed **engine.solid**: library cc-solid, folder `solid/`, codes `solid.err.*`, class `SolidError` · named as the suite's engines are (getcadcraft.com › Build an add-on › Engines; cc-nurbs → engine.nurbs, cc-field → engine.field) · owner
- 2026-11-12 · D-home · built in the library repo `withshalom/getlibrarycraft`, branch `engine/solid` (`lib/solid/`, `tools/solid/`, `bin/test-solid.mjs`, `docs/solid/`); a pull request once engine.solid is finished; the owner then authorizes it for the apps that need it · owner's direction · owner
- 2026-11-13 · D-home **superseded** · the home is the site repo: canonical `lib/solid/` beside `lib/nurbs/`, `tools/solid/sync.mjs` copying it into each host's `dev/solid/`; cc-nurbs is canonical beside the engine, so the pins and `sync-nurbs.mjs` are gone (D-ccn2 settled); the commits came over with their history; a `.gitattributes` keeps sources LF so byte-identity holds on Windows; D-size (A) and D-wire (A) unchanged; no pull request until the owner says go · owner's request · owner
- 2026-11-12 · D3 · booleans are in scope, but not dominant; M9 planned · "we should be able to map both. Otherwise we're limited and can't handle splines or conic" · owner
- 2026-11-12 · D2 (refined) · the engine is local and embedded; no CAD function depends on a web-loaded service; cloud services around it are fine · "We're building a local application with cloud services possibilities" · owner
- 2026-11-12 · D-eng · engine.solid follows the suite's engine conventions (getcadcraft.com › Build an add-on › Engines): Apache-2.0, DOM-free, workers, an id `engine.<name>`, a catalogue page (`ENGINE.md` drafts it), one edited copy and byte-identical host copies · the documented pattern for shared libraries · S2
- 2026-11-12 · D-tr · elementary functions computed from + − × ÷ and √, bit-exact in every engine, measured against BigInt · determinism of topology decisions; cc-field's precedent · S2
- 2026-11-12 · D-mat (S2) · matrices row-major, translation in m[3], m[7], m[11], as cc-nurbs; converters for column-major and metres (three.js, ModelCraft) · curves and surfaces transform without conversion · S2
- 2026-11-12 · D-prng (S2) · xoshiro128**, seeded through MurmurHash3's finaliser; checked against a C program · small, fast in 32-bit JavaScript, well studied · S2
- 2026-11-12 · D-ccn2 (S4) · cc-nurbs beside the engine as an unedited copy of the site's canonical `lib/nurbs/` in `lib/nurbs/`, pinned by SHA-256 (`tools/solid/pins.json`, `sync-nurbs.mjs`); cc-step later, its copies having drifted · the plan's proposed option, taken to start S4 on the owner's "Build step4" · proposed (owner may reverse)
- 2026-11-12 · D-det (decided) · (b): import only the exact cc-nurbs functions; guard `arc`, `circle`, `angle` in the checker; exact circles from engine.solid's own trig in S7 · compromise: keeps D8 and cc-nurbs untouched, at the cost of a guard · owner ("We'll go with (b)"). Investigate (a), deterministic trig upstream in the site's `lib/nurbs/`, later · raised: cc-nurbs' curve, surface, fit and vec code is not same-bits (the new `reach` rule); S5 needs a choice (§17.2) · determinism (§5) vs D8 · open
- 2026-11-13 · D-size, D-wire (opened) · the second review (code, math, architecture) found seven faults, fixed in 0.0.7, and two design gaps: no size box with consistent `lin` and `ang`, and checked records that do not survive a worker boundary. Both wait for the owner, before S5.
- 2026-11-13 · D-size, D-wire (decided) · the owner took option A on both. D-size: `size` joins the Tolerance (default 1e6 mm), `ang` defaults to `lin` / `size` (1e-12) and may not exceed it, `lin` ≥ `size` · 1e-13. The limit applies to engine.solid at the declared tolerance only. D-wire: `toData` / `fromData` on tol, limits, frame and basis; `fromEnvelope` on errors.

---

## 18. References

**Geometry and NURBS**
- L. Piegl, W. Tiller, *The NURBS Book*, 2nd ed., Springer, 1997.
- G. Farin, *Curves and Surfaces for CAGD: A Practical Guide*.
- C. de Boor, *A Practical Guide to Splines*.
- J. Hoschek, D. Lasser, *Fundamentals of Computer Aided Geometric Design*.
- N. M. Patrikalakis, T. Maekawa, *Shape Interrogation for Computer Aided Design and Manufacturing*, Springer, 2002 (intersection, offsets, projection).

**Solid modelling and topology**
- M. Mäntylä, *An Introduction to Solid Modeling*, 1988.
- C. M. Hoffmann, *Geometric and Solid Modeling: An Introduction*, Morgan Kaufmann, 1989.
- A. A. G. Requicha, "Representations for Rigid Solids: Theory, Methods, and Systems", *ACM Computing Surveys*, 1980.
- K. Weiler, "Edge-Based Data Structures for Solid Modeling in Curved-Surface Environments", *IEEE CG&A*, 1985 (radial-edge family; background for the coedge form).

**Robustness and meshing**
- J. R. Shewchuk, "Adaptive Precision Floating-Point Arithmetic and Fast Robust Geometric Predicates", *Discrete & Computational Geometry* 18, 1997.
- J. R. Shewchuk, "Triangle: Engineering a 2D Quality Mesh Generator and Delaunay Triangulator", 1996 (constrained Delaunay concepts).

**Standards**
- ISO 10303-21 (clear-text encoding), ISO 10303-42 (geometric and topological representation), ISO 10303-214 and -242 (application protocols).

**Surveyed for context only (oracles or design inspiration, not sources):** OpenCascade, SMLib/USD BRep, `solid-kernel`, `opencadkernel`, `verb-nurbs`, `truck`/`monstertruck`, `brepkit`, `BREP.io`, `brepjs`, `meshStep`. Re-check each licence and current status before relying on any of them; I have not verified their present state in this session beyond what the earlier survey found.

---

## Appendix A — Session S1 brief (ready to execute)

**Goal:** an empty-but-enforced kernel folder: structure, rules, tests and CI exist; no geometry yet.

**v1.1, in the PartCraft fork on branch `partcore`** (as built there; v1.2 shows the paths where the files now live, in the library repo). PartCraft already has `package.json`, `LICENSE`, `NOTICE` and CI (`.github/workflows/test.yml`, which runs `npm test -- --oracles` on pull requests and on `main`), so S1 creates only:
```
lib/solid/index.js              the single public entry
lib/solid/core/errors.js        SolidError (code = 'solid.err.*' i18n key, details), fail(), and envelope() for the KAD2 adapter
lib/solid/core/tol.js           Tolerance factory + defaults (§5.2)
lib/solid/core/limits.js        budgets: deadline / iterations / entities, cooperative step() and checkTime()
tools/solid/test.mjs      the engine.solid test runner (plain node, like tests/tools/nurbs/test.mjs)
tools/solid/check-boundaries.mjs   layer rules + forbidden globals + epsilon lint over lib/solid/
tools/solid/fixtures/     deliberately violating files for the checker's own tests
bin/test-solid.mjs        so `npm test` (and CI) runs engine.solid's tests
docs/solid/STATUS.md            Done / Learned / Found / Next
docs/solid/PROVENANCE.md        per module: source (book, paper, snapshot + lines), oracle, session
```
Allowed imports in `lib/solid/`: its own files, `../nurbs/*.js` and `../step/*.js` (D8). The boundary checker enforces this.

v1.0's file list, for reference:
```
package.json  LICENSE-MIT  LICENSE-APACHE  NOTICE  PROVENANCE.md  STATUS.md  HANDOFF.md
src/index.js  src/core/errors.js  src/core/tol.js  src/core/limits.js
tools/check-boundaries.mjs  .github/workflows/ci.yml  test/unit/core.test.mjs  test/architecture/boundaries.test.mjs
```

**`core/errors.js`** (same contract as KAD2's, rewritten here so the repo is self-contained). **v1.1:** in PartCraft the class is `SolidError`, its `code` is a `solid.err.*` i18n key (cc-nurbs' `NurbsError` is the model), and `errorEnvelope` is what the KAD2 adapter uses to produce KAD2's `EngineError`:
```js
export class EngineError extends Error {
  constructor(code, message, details) {
    super(message); this.name = 'EngineError'; this.code = code;
    if (details !== undefined) this.details = details;
  }
}
export const fail = (code, message, details) => { throw new EngineError(code, message, details); };
export function errorEnvelope(e) {
  if (e instanceof EngineError) {
    const out = { code: e.code, message: e.message };
    if (e.details !== undefined) out.details = e.details;
    return out;
  }
  return { code: 'INTERNAL', message: 'The kernel hit an unexpected error.' };
}
```

**`core/tol.js`** (defaults from §5.2):
```js
export const DEFAULT_TOL = Object.freeze({
  lin: 1e-6, ang: 1e-9, fit: 1e-4, maxEdgeTol: 1e-4,
  mesh: Object.freeze({ chord: 0.01, angle: (0.5 * Math.PI) / 180 }),
});
export const makeTol = (over = {}) => Object.freeze({ ...DEFAULT_TOL, ...over,
  mesh: Object.freeze({ ...DEFAULT_TOL.mesh, ...(over.mesh || {}) }) });
```

**Boundary rules** encoded in `tools/check-boundaries.mjs` as data:
```js
export const LAYERS = ['core','math','geom','topo',['ops','mesh','audit','measure'],'io','api'];
// a module may import from earlier layers or its own directory only;
// audit may not import ops or mesh; src/ may not reference window, document, fetch, process,
// require, Buffer, eval, or dynamic import().
```

**Acceptance (S1)**
- **v1.1:** `node tools/solid/test.mjs` passes on a clean checkout with no `npm install`, and `npm test -- --only test-solid` passes through the devshell.
- A fixture file that violates a boundary makes `node tools/solid/check-boundaries.mjs <app folder>` exit non-zero (tested). **v1.1:** no `npm run check` script: PartCraft's `package.json` is left as it is, and the checker runs inside `test.mjs`.
- A fixture with `window` or `fetch` in `src/` fails the scan (tested).
- A fixture with a bare `1e-9` literal outside `core/tol.js` fails the epsilon lint (tested).
- `STATUS.md` has sections Done / Learned / Found / Next, filled in.

**Out of scope for S1:** any geometry, any math beyond what errors/tol/limits need.

---

## Appendix B — Glossary

- **B-rep (boundary representation):** a solid described by its bounding faces, edges and vertices.
- **NURBS:** Non-Uniform Rational B-Spline; one representation for free-form curves/surfaces and, exactly, for conics and quadrics.
- **Knot vector:** the non-decreasing parameter sequence that defines a B-spline's basis functions.
- **Trimmed face:** a face whose boundary is a set of curves drawn in the parameter space of an underlying (usually rectangular) surface.
- **Coedge:** one use of an edge by one loop, with orientation and a pcurve.
- **pcurve:** an edge expressed as a 2D curve in a surface's (u,v) space.
- **Seam:** where a periodic surface (cylinder, sphere, torus) wraps; the seam edge is used twice in one loop.
- **Pole:** a point where a surface parametrization collapses (sphere/cone apex).
- **Tolerant modelling:** vertices/edges carry a local tolerance so slightly mismatched neighbours can still form a valid shell.
- **Typed refusal:** a stable error code that says exactly why the kernel declined, instead of returning an approximate or invalid result.
- **Oracle (test):** an independent implementation used only to compare answers in tests.
- **Ring (intersection):** a layer of intersection capability that is useful by itself (§7).


