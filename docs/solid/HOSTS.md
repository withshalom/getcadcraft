# engine.solid — the hosts: an architecture audit of PartCraft and ModelCraft

Written 2026-11-24, at the owner's request ("audit the architecture across both PartCraft and ModelCraft first, to see
whether we have the architecture we want before building on it"), after the owner's direction D-host: **build for both
hosts at the same time, with one uniform build.** This replaces the first version of this page (2026-11-23), which was
written from a quick read and contained errors; § 6 lists what was wrong in it.

Everything marked **measured** was run in this session; everything marked **read** comes from the code only.

## 1. Verdict

**The engine's own architecture holds for both hosts. The plan around it does not yet.** The layers, the exact predicates,
the plain-data forms, the typed refusals and the rule that the engine knows no host all survived contact with both apps:
the engine loads from each host's own dev server, in the page and in a module worker, and gives bit-identical answers there
and in Node (§ 2). What the audit found wrong is in the sequence and in three assumptions the plan made about the hosts:

| | Finding | Consequence | Change |
|---|---|---|---|
| **F1** | **PartCraft cannot run a feature history on the engine before Booleans exist.** Every PartCraft feature after the first is an add, cut or common applied to the body (`brep.js:815`, `kernel.js` header); its exact stack is about 3,900 lines in 15 files with about 220 OpenCascade call sites (in the ten files that make them) from ten families (prism, revolve, box, Boolean, face from wire, draft, thru-sections, thick solid, pipe shell, fillet). Booleans are S40–S42 in the plan: 28 sessions away. | "PartCraft first" cannot mean "PartCraft switches kernels early". ModelCraft can get value from M3 and M4 (exact meshes, NURBS solids built in the Surfaces panel); PartCraft cannot get a working regeneration until the Booleans, fillet, shell and loft/sweep exist. | **Split M9: analytic Booleans (planes, cylinders, cones, spheres, tori) come right after M5; general NURBS Booleans stay last** (decision D-order, § 5). |
| **F2** | **The "ExactKernel adapter" is not an adapter.** PartCraft's features are written on OpenCascade, not on an interface. `ExactKernel` is a worker protocol (`regen`, `step`, `stepInfo`, `drawing`, plus extra ops); its `regenerateBrep` is where the work is. | The integration is a new feature interpreter, `regenerateSolid(part, P)`, that returns the same plain-data result as `regenerateBrep`, built on engine operations, feature by feature. It can start small (a skipped feature already reports a reason) and be checked against OpenCascade as a test oracle, which PartCraft's own suite already fetches. | PartCraft's adapter is built **progressively with each milestone**, with a coverage table (§ 4), not once at the end. |
| **F3** | **PartCraft's world is Y up; ModelCraft's and the engine's is Z up.** PartCraft's own `vec.js` says so, and `brep.js` carries `Y_TO_Z` / `Z_TO_Y`. ModelCraft is metres, Z up, column-major, with a 1 µm tolerance. | Two boundary conversions (axes and units), not one. | The engine carries **one tested axis converter** (`mat4.yUpToZUp` and back) beside `convertUnits`; both adapters use it (R7). |
| **F4** | **Names.** PartCraft saves readable references in the part file (`f3.side:L7`, `…@f2#1`; `NAME_RE` in `brep.js`) and keeps them alive through every Boolean, fillet and shell by OpenCascade's own Modified / Generated / IsDeleted history. The engine's names are opaque 64-bit hashes (`names.js`) and its operations return no history. | A part saved today must still resolve after the kernel changes; with opaque names it cannot, and fillets and Booleans could not keep names at all. | **Every operation returns a history record** (`modified`, `generated`, `deleted` per entity) **and a readable `role`** for each new entity (R11). Not built yet; it shapes S20 onward. |
| **F5** | **The audit is too slow to run on every operation.** `HANDOFF.md` § 9 says every operation self-audits. **Measured:** a full audit costs 130–540 ms a body on the corpus, 40–160 ms even with two samples and no volume. PartCraft's mesh kernel rebuilds a 750-feature part in 3 s: 4 ms a feature. | An interactive regeneration cannot afford it. | **Tiered audit** (`level: 'topology' | 'fast' | 'full'`): the topology tier on every operation, the rest on demand, in tests and on import (R12). |
| **F6** | **The two hosts keep the same data in different places.** The patch set lives in `part.studies.nurbs` in PartCraft and in `addons.nurbs` (the `docData` hook) in ModelCraft. | One format, two slots. | One format (R6); each adapter names its slot. |
| **F7** | **The repos' "uniform build" tools cannot run in the repos.** `tools/nurbs/sync.mjs`, `lang.mjs` and `test-mount.mjs` write to the private monorepo's paths (`public_html/assets/apps/<app>/dev`); the cross-app byte-identity checks (illustrate, view cube) fail in a per-app clone (**measured**: 2 failures in PartCraft's main test, both layout-dependent). | Uniformity across three public repos has no mechanism today. | R1 to R4: one host tool that knows the three real layouts. |
| **F8** | **Where does the shared command UI live?** The Surfaces panel (`nurbs-ui`, byte copies in both hosts) is the one place both hosts already show NURBS solids, with an `engine` field per command (`'manifold'`). | Extending it means changing cc-nurbs and nurbs-ui, which D-ccn says go upstream; a host-specific UI per app breaks uniformity. | Decision D-ui (§ 5). |
| **F9** | **Two worker interfaces, one shape.** PartCraft: ops `(args, ctx = { oc, progress, transfer })` in a registry (`worker-ops.js`, `addOps`). ModelCraft: pool jobs `(args, ctx = { progress, cancelled, scratch, shared })` run by module URL and function name (`compute/pool.js`). | The shape is the same: a pure function of plain data and typed arrays. | R5 is confirmed, not just proposed: **one job table** `(args, ctx)`, two adapters of tens of lines. |

## 2. What was verified, and how

| Check | Result |
|---|---|
| **The engine in each host's own server** (**measured**): `lib/solid` copied to `app/solid/`, the host's `devshell/serve.mjs` started, headless Chromium, the engine imported from `/assets/apps/<app>/dev/solid/index.js`, the corpus audited in the page and in a module worker | **both hosts:** version 0.0.17, 50 namespaces, all seven corpus bodies audit clean, volumes **identical to the last digit** to Node's (box 41.165670513245914, sphere 36.38175532455003, prism with holes 502.31239029616063); the worker gives the same; no page errors. The copy was removed afterwards; nothing was committed to either host |
| **PartCraft's worker loader** (**measured**): the regular expression `exact-client.js` uses to follow imports (single-quoted, relative, lower-case) against every import in the engine | **237 of 237** specifiers match; the engine already satisfies the stricter loader |
| **ModelCraft's tests** (**measured**, `devshell/test.mjs`, vendor libraries fetched) | `test-modelcraft.mjs`: **1,402 passed, 0 failed** (17 s); the optional copyleft oracles are skipped, as designed |
| **PartCraft's tests** (**measured**, same, with `--oracles`, which fetches OpenCascade as a test-only black box) | `test-partcraft-frame` 27, `test-partcraft-params` 139, `test-partcraft-sw` 117 (2 skipped), `test-craftscript` 538 (1 skipped): **all pass**. The main file's result is recorded in § 7 |
| **cc-nurbs in the three repos** (**measured**) | all 20 files byte-identical in the CadCraft repo's `tests/lib/nurbs/`, PartCraft's `app/nurbs/` and ModelCraft's `app/nurbs/` |
| **The shared shell** (**measured**): the two `app/` trees compared by hash | 2,018 paths in both; 393 identical (243 of them `.js`); 18 shared `.js` files differ (`vec.js`, `view3d.js`, `agents.js`, `workspaces.js`, `shell-mount.js`, `live.js`, `tree-ui.js`, `ui-util.js`, `undo-hook.js` and add-on files); about 430 `.js` files are each app's own. `addons.js`, the loader that resolves `engine:<name>/<path>`, is **identical** in both |
| **The edition** (**read**) | `edition.mjs` walks everything under `app/`, so an `app/solid/` folder needs no registration there |

## 3. The two hosts, side by side (read unless marked)

| | PartCraft | ModelCraft |
|---|---|---|
| Is | parametric parts: constrained sketches, a feature history, STEP, drawings with GD&T, FEA, CAM | mesh and push/pull modelling (half-edge meshes, sculpt, subdivision, UVs), the Surfaces panel, 3D-print tools |
| Units, axes | mm, **Y up** | **metres, Z up**, 4×4 column-major, tolerance 1 µm |
| Today's solids | the mesh kernel (`kernel.js`, manifold-3d) builds every part; the exact kernel is **off** (OpenCascade left in 0.4: LGPL) and its features say "not built yet" | manifold-3d (`solids.js`, 127 lines); NURBS solids' Booleans, fillet and thicken run on triangles (`engine: 'manifold'` in `nurbs/tools.js`) |
| History | the part *is* a feature list; regeneration is a pure function of it; sketches are solved first | a model of definitions; every edit is one undo step; meshes undo by deltas |
| Exact backend | `regenerateBrep(part, oc)` → `{ exact, results, mesh, stats, faces, edges, candidates, … }` (`mesh`: `positions`, `indices`, `triFeature`, `triFace`, `edgeSegs`, `segEdge`) | none: bodies are triangles; exact solids live only in the patch set |
| Worker seam | `exact-client.js` + `brep-worker.js`, `compute-worker.js`; ops `(args, ctx)` in `worker-ops.js`; modules linked as blobs | `compute/pool.js`: module workers run exported functions |
| Where exact data is saved | `part.studies.nurbs` | `addons.nurbs` through `docData.forAddon` |
| Persistent references | readable names in the file, kept by OpenCascade's history | none for meshes |
| AI/script tools | `agents.js` (489 lines) | `agents.js` (360 lines); both import shared tool modules (`render-tools`, `look-tools`, `photo-tools`) |
| STEP | `app/step/` (cc-step); out is **faceted** while the exact kernel is off (`agents.js`: "STEP is faceted") | no cc-step; STEP/IGES only for the patch set |

## 4. What PartCraft needs from the engine, by feature

PartCraft's feature list, and where the engine plan has it. **No PartCraft feature after the first can run without a
Boolean** (the exceptions are the base extrude and revolve themselves):

| PartCraft | OpenCascade call | Engine session | Needs a Boolean |
|---|---|---|---|
| sketch | (the host's own solver) | S19 profile | no |
| extrude, revolve | `MakePrism`, `MakeRevol` | S20, S21 | to add or cut: yes |
| hole, patterns, mirror, combine, move/scale body, path pattern | `Fuse`, `Cut`, `Common` | S23, S40–S42 | yes |
| loft, sweep | `ThruSections`, `MakePipeShell` | S22 | to add or cut: yes |
| fillet, chamfer | `MakeFillet` | S38 | yes (it edits a body) |
| shell | `MakeThickSolid` | S37 | yes |
| draft | `DraftAngle` | S39 | yes |
| rib, sheet metal, thread | compositions of the above | none yet | yes |
| surface features (form, patch, stitch, thicken, offset, extend, trim, gordon) | (cc-nurbs) | partly S9, S37 | partly |
| import (STEP) | STEP reader | S28–S31 | no |
| measure, drawings, flat pattern | `GProp`, hidden-line, … | S24, S26 | no |

So the Boolean is the hinge for PartCraft. For ModelCraft the first value is earlier: exact meshes of NURBS solids (M3) and
solids made in the Surfaces panel (M4: extrude, revolve, sweep, loft), then its own existing Boolean, fillet and thicken
commands moving off triangles (M8, M9).

## 5. Refinements and the decisions that are the owner's

**Refinements** (what to build, with their sessions; R1–R4 are plumbing and need no decision):

| | Refinement | When |
|---|---|---|
| R1 | `tools/solid/hosts.mjs`: sync and `--check` for the three repos by their real layouts (`tests/lib/solid` here; `app/solid` and `tests/lib/solid` in a host), LF only | before S15 |
| R2 | one manifest (`tests/tools/solid/manifest.json`): version, SHA-256 of every file, the digest hash; read by every repo's check, so "uniform" is a failing test when two copies differ | before S15 |
| R3 | `tools/solid/lang.mjs <host>`: the `solid.err.*` and `solid.audit.*` keys, English and an es-MX draft, as `tools/nurbs/lang.mjs` does | before S15 |
| R4 | `tools/solid/test-mount.mjs <host>`: loads the host's own copy, audits the corpus through it, compares the digest, checks the keys (the probe of § 2, kept as a test) | before S15 |
| R5 | `api/jobs.js` with S18: a frozen table `{ name: (args, ctx) → plain data }`, and the two adapters | S18 |
| R6 | one persistence format `{ format: 'cadcraft-solid', version: 1, bodies: [toData …] }`; each adapter names its slot | with the first saved body (M4) |
| R7 | axis converters `mat4.yUpToZUp` / `zUpToYUp` in the engine; a host contract test with a PartCraft-like fake (mm, Y up) and a ModelCraft-like fake (m, Z up, column-major) | before S15 |
| R8 | a neutral `profile` (S19) with two adapters (a PartCraft sketch; a ModelCraft face's loops) | S19 |
| R9 | cc-step in both hosts, one canonical copy; today only `read.js`'s import line differs (`../ifc/step.js` against `./part21.js`) and ModelCraft has none | start of M6 |
| R10 | the session protocol gains: manifest rewritten, both hosts' mount checks run, each host's own tests run (they do run here, § 2) | now |
| R11 | **every operation returns `history` and `role`s** (F4), and `names.js` keeps the readable role beside the hash | S20 onward; the shape is fixed now |
| R12 | **tiered audit** (F5) | with R-tier work at the start of M3 |
| R13 | a **PartCraft coverage table** kept in `STATUS.md`: each PartCraft feature, supported / partly / not yet by the engine, and the parity test against OpenCascade for the ones that are | each milestone |
| R14 | the engine's own tolerance is 1 nm (`lin` 1e-6 mm); ModelCraft's model works to 1 µm: the ModelCraft adapter passes `tol.lin` ≥ 1e-3 mm when it turns faces into profiles | with S19 |

**Decisions for the owner.** None is taken yet:

- **D-order — where do the Booleans go?** (F1) **A:** keep the plan (M9 last; PartCraft switches kernels at S42). **B (recommended):** split M9: **analytic Booleans** (the five analytic surface kinds, from S25–S27's analytic intersections) right after M5, **general NURBS Booleans** last. PartCraft's cuts are planes, cylinders and the like, so B puts a working PartCraft regeneration in reach about 10 sessions earlier than A, at the cost of doing the intersection work before STEP.
- **D-ui — the shared command layer.** **A (recommended):** a new shared library, `solid-ui` (a panel and a session over engine bodies), shipped as byte copies like `nurbs-ui`; cc-nurbs and nurbs-ui stay untouched, so D-ccn holds and the two hosts show the same thing. **B:** add `engine: 'solid'` to cc-nurbs' commands and nurbs-ui: one panel, but an upstream change to three libraries. **C:** each host builds its own UI (not uniform).
- **D-bridge — one data model or two for NURBS solids.** The patch set (`doc.solids`: faces as surface ids) and the engine's B-rep are two models of the same thing. **A (recommended):** the engine's B-rep is canonical for bodies it builds; a converter both ways (`fromPatchSet`, `toPatchSet`) keeps the Surfaces panel working on them. **B:** make the engine read and write only the patch set.
- **The M3 questions asked at the end of S14** (triangulator, precision, file writers, the dev viewer) are still open and are now taken **after** this audit's decisions, since D-order moves the meshing work's priority.

## 6. What was wrong in the first version of this page

- It said PartCraft is "millimetres, Z up". **It is Y up** (F3).
- It treated the PartCraft integration as "a thin adapter" behind `ExactKernel`. **It is a feature interpreter** (F2).
- It said `cc-acis` `cdt.js` and cc-step `tess.js` would both break the same-bits rule. **`cdt.js` uses only + − × ÷** and is deterministic; its weakness is epsilon thresholds, not determinism (corrected in place before this rewrite).
- It said neither host's tests had been run. **Both were run** (§ 2).
- It listed the sync, lang and mount tools as ready patterns. **They write to the monorepo's paths** and do not run in the repos (F7).

## 7. Not verified

- The main `test-partcraft.mjs` (a long file; it stalled on memory in this sandbox before): its result is in `STATUS.md` if it finished.
- Whether the **private monorepo's build** (`AppBuilds`: the import map's `?v=` links) needs a line for a new `solid/` folder. The dev servers work without one (§ 2), the browser edition packs all of `app/`, but the monorepo's own pack step was not seen.
- **Firefox and WebKit**: the host probe ran in Chromium only.
- ModelCraft's and PartCraft's full app pages were not loaded with the engine mounted; only the engine was loaded from their servers.
- The downloaded-engine package route in `addons.js` (`engineResolver`, version ranges) is read, not exercised.
