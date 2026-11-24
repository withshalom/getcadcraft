# engine.solid — session handoff (build paused 2026-11-24)

The building session is paused after S14 and the host audit. This page is for whoever (the owner, or the next session)
picks it up: where everything stands, every architectural decision made so far, and the decisions that must be taken
before building continues. Longer detail: `STATUS.md` (what is built), `HOSTS.md` (the audit), `HANDOFF.md` (the plan and
the full decision log, § 17), `CHECKLIST.md`.

## 1. State at the pause

| | |
|---|---|
| Engine | engine.solid **0.0.17**, S0–S14 done: numerics, splines, topology, trims and pcurves, the auditor and its corpus |
| Where | `withshalom/getcadcraft`, branch `claude/gracious-rubin-bp03o8` (the engine, merged with upstream 0.11.0), last commit `d8d93af2`, pushed. `engine/solid` holds the older history and is untouched |
| Tests | `node bin/test-solid.mjs` from `tests/`: **616 passed, 0 failed** (Node 22.23), about 2 min 45 s; boundary checker 38 files, 237 imports, 0 problems; digests in 22 areas agree between Node and Chromium (page and worker) |
| Mutation | `audit/audit.js`: 56 of 56 faults caught (39 of 46 at first; the survivors became tests) |
| Hosts | PartCraft: branch `claude/gracious-rubin-bp03o8` pushed, upstream 0.11.0 merged, **no engine code in it**. ModelCraft (`withshalom/getmodelcraft`): a read-only clone only; this session cannot push there until it is attached with push access. Nothing was committed to either host |
| Running | nothing. The background test runs were stopped |
| Not finished | PartCraft's main `test-partcraft.mjs` stalls in the mesh-kernel section (memory) as it did before; it was stopped, so its result is unknown; the two failures seen before it stalled are layout-dependent (a cross-app byte-identity check; one language-key check) |

**To resume:** `cd getcadcraft/tests && node bin/test-solid.mjs`; read `STATUS.md` → Next, then this page § 4. Host tests:
`node devshell/test.mjs --offline --oracles --only <file>` after `node devshell/fetch-vendor.mjs --oracles` (ModelCraft:
1,402 pass; PartCraft's four smaller files 27 / 139 / 117 / 538 pass).

## 2. Architectural decisions made to date

Status: **owner** = decided by the owner; **built** = implemented and tested; **proposed** = mine, awaiting the owner.

### Scope and home
| ID | Decision | Status |
|---|---|---|
| D1–D6, D2 | the planning-session goals; the engine is local and embedded, no CAD function depends on a web service, cloud services around it are fine (`HANDOFF.md` § 1) | owner |
| D3 | **booleans in scope but not dominant; planned as M9** ("we should be able to map both … otherwise we can't handle splines or conics") | owner |
| D-name | named **engine.solid** (library cc-solid, folder `solid/`, codes `solid.err.*`, class `SolidError`) | owner |
| D-home | the **site repo** (the CadCraft repo's `tests/lib/solid/` here, `lib/solid/` in the monorepo) is the one canonical home; each host carries a byte-identical copy; confirmed 2026-11-17 after considering PartCraft as home and rejecting it | owner |
| D-lic / D-eng | Apache-2.0, an id `engine.<name>`, DOM-free, runs in workers, a catalogue page (drafted, unpublished) | owner / built |
| D-ccn | **cc-nurbs and cc-step are not edited on this branch**; a defect found in either goes upstream as one small pull request with a failing test first | owner |
| D-ccn2 | cc-nurbs sits beside the engine, canonical, no pins | owner (by the move) |
| D-host | **build for PartCraft and ModelCraft together, one uniform build** (2026-11-23) | owner |
| Process | one branch (`engine/solid`, then this session's branch); no pull request until the owner says the engine is finished; one complete tested build per session with `STATUS.md`, `PROVENANCE.md`, `HANDOFF.md` updated; a mutation run at each close; clean room (books, papers, standards; other kernels only as black-box oracles) | owner |

### Numerics and determinism
| ID | Decision | Status |
|---|---|---|
| D-tr | elementary functions from + − × ÷ and √ only; **the same bits in every browser and in Node**; checked against BigInt | owner, built |
| D-det (b) | import only the exact cc-nurbs functions; a checker rule keeps `arc`, `circle`, `angle` out; engine circles come from its own trig | owner, built |
| D-size | a 1 km model box by default, `lin` 1e-6 mm, `ang` 1e-12, `lin` ≥ `size` · 1e-13; the box belongs to the tolerance | owner, built |
| D-prng | xoshiro128** seeded through MurmurHash3's finaliser | built |
| D-mat, D-unit | matrices row-major like cc-nurbs; **millimetres, radians, right-handed, Z up inside**; hosts convert at the boundary | built |
| S3 | geometric decisions use **exact predicates** (orient2d/3d, incircle, insphere) and refuse outside their domain; no epsilon decides a topology question | built |

### Data, errors and structure
| ID | Decision | Status |
|---|---|---|
| D-err | `SolidError(code, vars)`, codes `solid.err.*`, `vars` fill the app's `{placeholders}`; the engine has **no words** | built |
| D-wire | every record has a plain-data form (`toData` / `fromData`), because tolerances, budgets, frames and bodies cross worker boundaries | owner, built (B-rep included) |
| D-store | B-rep as **immutable snapshots**, whole-table copies per edit (3.9 ms on a 1,000-face body), every structural rule checked at each edit | built |
| D-spec | import specifiers are single-quoted, relative, lower-case, `.js` (the worker loaders need it); no cycles | built, enforced |
| Layers | `core ← math ← geom ← topo ← {ops, mesh, audit, measure} ← io ← api ← index`; the auditor imports neither ops nor mesh; 16 boundary rules in a tokenizer-aware checker | built |
| Persistent names | deterministic hash of (operation, input names, role) | built; **to be extended** (§ 3, D-hist) |
| S14 | the auditor **advises** (findings in the suite's Problems shape, never blocks); a finding code exists only if a body can fire it (four were removed); the volume is the divergence theorem with each face integrated in its own (u, v) by Green's theorem (no mesh); the surface's normal is always Su × Sv, so the face sense decides the loop direction; `ok` means no warning (notes do not count) | built |

### From the audit (2026-11-24) — facts, not yet decisions
PartCraft is **Y up** (mm); ModelCraft is **Z up, metres, column-major, 1 µm**; PartCraft's every feature after the first is an
add, cut or common (so the Booleans are its hinge) over ~10 OpenCascade families; its saved references survive edits by
OpenCascade's Modified / Generated / IsDeleted history; a full audit costs 130–540 ms a body (PartCraft rebuilds at
~4 ms a feature); both hosts share an identical add-on loader (`engine:<name>/<path>`), identical cc-nurbs and nurbs-ui, and
different worker seams of the same shape `(args, ctx)`. The engine loads from both hosts' dev servers, in page and worker,
bit-identical to Node.

## 3. Decisions needed before building continues

Each has a recommendation; none is taken. **The three audit decisions come first, because they set the order of M3 onward.**

| ID | Question | Options | Recommendation |
|---|---|---|---|
| **D-order** | Where do the Booleans go? | **A** keep M9 last (PartCraft cannot switch before S42) · **B** split: *analytic* Booleans (plane, cylinder, cone, sphere, torus) right after M5, general NURBS Booleans last · **C** all of M9 right after M5 | **B** |
| **D-ui** | Where does the shared command UI for engine bodies live? | **A** a new `solid-ui` library, byte copies in both hosts, cc-nurbs and nurbs-ui untouched · **B** extend cc-nurbs and nurbs-ui (an `engine: 'solid'` option; upstream changes to three libraries) · **C** each host its own | **A** |
| **D-bridge** | One data model or two for NURBS solids (the Surfaces patch set against the engine's B-rep)? | **A** B-rep canonical, converters both ways · **B** the engine reads and writes only the patch set | **A** |
| **D-hist** | Operations return a `history` (modified / generated / deleted per entity) and a readable `role` for each new entity, and names keep the role beside the hash (PartCraft's references need it) | adopt now (shape fixed before S20) · defer | adopt now |
| **D-tier** | A tiered audit (`topology` on every operation, `fast` and `full` on demand) instead of "every operation self-audits" (`HANDOFF.md` § 9) | adopt · keep the full audit everywhere | adopt |
| **D-order-M3** | The four M3 questions: **triangulator** (own, on exact predicates · adapt cc-acis `cdt.js`, deterministic but epsilon-based · own, starting from `cdt.js`'s structure); **mesh precision** (Float64 inside, Float32 out · Float32 only); **file writers** (engine STL/OBJ/GLB for headless use · meshes only · plus 3MF); **dev viewer** (small, keep · drop · defer to after M4) | | own on exact predicates · Float64/Float32 · small writers, no 3MF · keep, small |
| **D-slot / R6** | One persistence format `{ format: 'cadcraft-solid', version: 1, bodies }`; the slot is host-specific (`part.studies.solid`; `docData` key `solid`) | confirm at the first saved body (M4) | confirm then |
| **D-access** | ModelCraft is read-only for this session. Build in it means attaching it with push access, and a branch of its own (as PartCraft has) | grant · build only in PartCraft and the CadCraft repo until later | grant |
| **D-cc-step** | One canonical cc-step in both hosts (today: ModelCraft has none; PartCraft's differs by one import line) | decide at the start of M6 | later |
| **D-s42** | The adversarial pass-rate target for the general Booleans | agree before S42 | later |

## 4. Next build steps, once D-order, D-ui and D-bridge are decided

1. **Plumbing, no decision needed** (`HOSTS.md` R1–R4, R7, R10): `tools/solid/hosts.mjs` (sync and `--check` by the three repos' real layouts), a manifest with SHA-256 per file and the digest hash, `tools/solid/lang.mjs` (words for `solid.err.*` and `solid.audit.*`), `tools/solid/test-mount.mjs` (the probe used in the audit, kept as a test), `mat4.yUpToZUp` / `zUpToYUp` with a two-fake-host contract test, and the session protocol gaining "both hosts' mount checks".
2. The tiered audit and the history/role shape (if adopted), before any operation calls them.
3. **M3 — meshing**: S15 edge discretization (shared by both faces; chord and angle bounds), S16 face meshing, S17 watertight meshes and the mesh auditor, S18 the worker job table `(args, ctx)` with its two adapters (PartCraft `addOps`; ModelCraft pool) and the dev viewer if kept. Release gate v0.1.
4. **M4** construction (profile → face, extrude, revolve, sweep, loft, transforms, mass properties), with a host adapter for each host after it (release gate v0.5), then M5 intersection, then the Booleans per D-order, then STEP.
5. At every session close: tests, a mutation run, `STATUS.md`, `PROVENANCE.md`, the **PartCraft coverage table** (each PartCraft feature: supported / partly / not yet, with the parity test against OpenCascade as an oracle), both hosts' mount checks.

## 5. Risks and what is unverified

- **PartCraft integration is large.** A feature interpreter (`regenerateSolid`) on ~10 operation families; nothing in PartCraft can regenerate on the engine before the Booleans (D-order decides how soon).
- **Not verified:** the private monorepo's build (import map `?v=` links) for a new `solid/` folder; Firefox and WebKit (Chromium only, for the digests and the host probe); the full host pages with the engine mounted (only the engine was loaded from their servers); the downloaded-engine package route (`engineResolver`); PartCraft's main test file; a NURBS face in the volume check (no corpus body has one).
- **Not built, by design for now:** face/face crossing in the auditor; point-in-solid for voids (boxes only); oracle comparison of volumes with OpenCascade (it is available through PartCraft's `--oracles` and works here).
- **Dependencies on the owner:** the upstream pull requests for cc-nurbs defects (unclamped end spans, `reduce`'s tolerance, the cone apex) and cc-field's `detmath`; the catalogue page; Safari by hand; the proposal issue upstream before any pull request.
