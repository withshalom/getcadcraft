# engine.solid — the hosts: PartCraft and ModelCraft together

Written at the close of S14 (2026-11-23), after the owner's direction (D-host): **build engine.solid for PartCraft and
ModelCraft at the same time, and keep each environment's build uniform.** This page says what was read, how a host carries
an engine today, how the two hosts differ, what that changes in the architecture, the refinements it asks for, and what is
left for the owner to decide. Nothing here is built yet except where it says so.

## 1. What was read

| Repo | At | Role |
|---|---|---|
| `withshalom/getcadcraft` (the CadCraft app; its `tests/lib/` mirrors the suite's libraries) | upstream 0.11.0, plus the engine on this branch | where the engine is built (`tests/lib/solid/`); canonical for it |
| `withshalom/getpartcraft` | 0.11.0 (`1a96fb2a`) | host |
| `withshalom/getmodelcraft` | 0.11.0 (`d4ae1115`) | host |

Not verified: neither host's `npm test` was run (PartCraft's main test file does not finish in this sandbox, and the vendor
step needs the network); the import map and the edition's file list are made by the build in the suite's private monorepo
(`AppBuilds`), so what is said about them below comes from the devshell copies (`render.php`, `edition.mjs`) and may be
incomplete; the downloaded-engine package format (`engineResolver`) was read in `addons.js`, not exercised.

## 2. How a host carries an engine today (cc-nurbs is the template)

| What | PartCraft | ModelCraft | Same? |
|---|---|---|---|
| The library, canonical | `lib/nurbs/` in the private monorepo; mirrored as `tests/lib/nurbs/` | the same | yes |
| The host's copy | `app/nurbs/` (byte for byte; 20 files) | `app/nurbs/` (the same 20) | yes: **checked 2026-11-23, identical in both and in this repo** |
| The UI over it | `app/nurbs-ui/` (panel, session, display) | the same, byte copies | yes |
| How an add-on reaches it | `engine:nurbs/…` through `addons.js` (`ENGINE_SPEC_RE`), from a downloaded engine package or else `<build folder>/nurbs/…` | the same file: **`app/addons.js` is identical in both** | yes |
| Its sync | `tools/nurbs/sync.mjs` (a file allow-list; refuses unlisted files) | the same | yes, but it writes to monorepo paths (`public_html/assets/apps/<app>/dev/nurbs`) |
| Its words | `tools/nurbs/lang.mjs <app>` writes `nurbs.*` keys into that app's `en.json` and `es-MX.json` | the same | yes |
| The mount check | `tools/nurbs/test-mount.mjs <app>`: loads the app's copy, runs one command of each family, checks the keys are in the language files and that the app imports the copy | the same | yes |
| What the edition packs | everything under `app/` (`edition.mjs` walks it) | the same | yes, so `app/solid/` needs no registration there |

So the suite already has a pattern for "one library, byte-identical copies in several apps": **sync, lang, mount.**
engine.solid has the first (`tools/solid/sync.mjs`, built at the move) and none of the others.

## 3. Where the two hosts differ, and what each needs from the engine

| | PartCraft | ModelCraft | What it means for engine.solid |
|---|---|---|---|
| What it is | parametric parts: constrained sketches, feature history, STEP in and out, drawings with GD&T, FEA, CAM | push/pull and mesh modelling (half-edge meshes, sculpt, subdivision, UVs), the Surfaces panel's first host, 3D print tools | the engine's callers differ in kind: **history-driven regeneration** against **direct edits and meshes** |
| Today's solids | Manifold and its own mesh code; the exact kernel is **off** (OpenCascade left in 0.4, LGPL); features that need exact B-rep say "Not built yet" | Manifold (`solids.js`, 127 lines) for Union, Subtract, Intersect; NURBS solids' Booleans, fillet and thicken run on triangles (`engine: 'manifold'` in `nurbs/tools.js`) | PartCraft needs the engine as a **kernel** behind `ExactKernel`; ModelCraft as the **exact engine under commands it already has** |
| The seam | `exact-client.js` starts `brep-worker.js` (modules linked as blobs from single-quoted relative imports; cycles refused), messages `{ id, op, args }`, extra ops by `addOps()` | `compute/pool.js`: module workers run plain exported functions on typed-array arguments (`pool.run(kind, fn, args, { transfer })`); the Surfaces panel takes `manifold()` and `bake` host hooks | **one neutral job table**, two thin adapters (R5) |
| Units, axes | millimetres, Z up | **metres**, Z up, 4×4 **column-major** (`mat4.convertUnits`, `fromColumnMajor` exist; the Surfaces adapter already scales by 0.001) | conversion stays at the host boundary (D-unit); each host adapter owns it and tests it |
| What is saved | a part document; add-ons keep data through `docData.forAddon(name)` | `.modelcraft` JSON; the patch set is kept as `addons.nurbs` through the same `docData` hook | **one key, `solid`, in both** (R6) |
| Where a profile comes from | the sketcher (`sketch*.js`) | loops of faces in the model (`model.js`: `loops[0]` outer, the rest holes), DXF/DWG imports | S19 takes a neutral profile; **two adapters** (R8) |
| Persistent names | needed: features re-run on a changed sketch | not needed by push/pull; useful for the Surfaces history | the engine builds them for both (S11); only PartCraft depends on them |
| Mesh in | three.js; its own mesh code | three.js; `Mesh` (indexed n-gons with UVs) | the engine's mesh (M3) is plain typed arrays in mm; each host converts |
| Words | 76 language files; `en.json` plus an es-MX draft written by the library's own lang tool | 76, the same | the engine's `solid.err.*` and `solid.audit.*` keys need the same treatment in both (R3) |
| STEP | `app/step/` (cc-step, 0.8-era `read.js` that imports `./part21.js`) | **no cc-step at all**; STEP/IGES only through the Surfaces panel (`nurbs/step.js`) | M6 (STEP in the engine) needs cc-step in both hosts; it is **not uniform today** (R9) |

## 4. What this changes in the architecture

Most of the architecture holds: it was written for several hosts (`ARCHITECTURE.md` § 7 and § 13). What the simultaneous
build changes:

1. **"PartCraft first" is gone from the plan.** `HANDOFF.md` § 13.2 and the old S24b / S36 become "both hosts, each
   milestone", and S34 (an app-specific backend) stays dropped. The pull-forward of the PartCraft adapter after M4 becomes
   **a host adapter for each, after M4**, with the same acceptance.
2. **The unit of delivery is one set of bytes in three places.** The engine lives in `tests/lib/solid/` here (the mirror's
   name for the suite's `lib/solid/`), and each host carries it as `app/solid/` and `tests/lib/solid/`. "Uniform" has to be
   a test, not a habit: **one manifest** (version, SHA-256 per file, the digest hash) that every repo's check compares (R1,
   R2).
3. **`tools/solid/sync.mjs` is wrong for the three repos.** It writes `public_html/assets/apps/<app>/dev/solid/`, the
   monorepo layout, which none of these repos has. It needs a repo-layout mode (R1).
4. **The worker interface (S18) is designed now, not then.** Two hosts load workers differently (blob-linked modules with
   a message protocol; a pool of module workers running exported functions), and both refuse what the other allows (import
   maps do not reach workers; cycles refused). The engine's own side is therefore **a table of pure functions over plain
   data and typed arrays**, with no protocol of its own, and the two adapters are the only code that differs (R5). The
   `specifier`, `bundler` and `cycle` rules of the boundary checker already enforce the stricter host.
5. **Plain data is the exchange form (D-wire, already decided).** Both hosts persist and message plain data, so every body,
   profile, mesh and report needs a `toData` / `fromData` before an adapter is written. S11 has it for the B-rep; S15
   onward add it as they go.
6. **The acceptance of each session gains a clause:** with the new copy in place, both hosts' mount checks pass (R4). That
   doubles verification and the cost of a session; it is what makes two hosts one build.
7. **The Surfaces panel is the bridge for ModelCraft, PartCraft and SuperCad alike.** Its commands carry an `engine`
   field (`'manifold'` today). A `'solid'` engine behind the same commands means the exact Booleans, fillets and thickening
   arrive in both hosts through one panel and one `Session`, with no new UI. This is M8 and M9, but the **host hook**
   (`solid()` beside `manifold()`) can be agreed now.
8. **cc-step is the one library that breaks uniformity.** The site's copy imports `../ifc/step.js`; PartCraft's carries the
   same file as `part21.js` and imports it as `./part21.js`; ModelCraft carries neither. D-ccn forbids editing either
   copy on this branch. Decision at the start of M6 (§ 6).

## 5. Refinements (what to build, in this order)

| | Refinement | Why | Cost |
|---|---|---|---|
| R1 | `tools/solid/hosts.mjs`: sync and `--check` for the three repos by their real layout (`tests/lib/solid` here; `app/solid` and `tests/lib/solid` in a host), the allow-list of the engine's own files, LF only | the current sync targets a layout the repos do not have | small; tested on temporary folders like the existing sync |
| R2 | one manifest, `tests/tools/solid/manifest.json`: engine version, every file's SHA-256, the digest hash; written by R1, read by each host's check | makes "uniform" mechanical, and tells a host which engine version it holds (the add-on loader's `needs` ranges compare versions) | small |
| R3 | `tools/solid/lang.mjs <host>`: the `solid.err.*` and `solid.audit.*` keys, English and an es-MX draft, written into a host's `en.json` / `es-MX.json` like `tools/nurbs/lang.mjs` | an app must not show a bare code; today the engine's 27 audit codes and its refusals have no words | medium: someone has to write the sentences; the codes are stable now (S14) |
| R4 | `tools/solid/test-mount.mjs <host>`: loads the host's own `app/solid/`, runs the audit on the corpus through it, compares the digest with the manifest, checks the language keys and that the host imports the copy | what `test-mount.mjs` does for cc-nurbs | small |
| R5 | `api/jobs.js` (with S18): a frozen table `{ name: (args, ctx) → result }` of the engine's operations over plain data and typed arrays, with `ctx = { progress, cancelled, transfer }`; and two adapters, one for the `addOps` worker of PartCraft's `ExactKernel`, one for ModelCraft's pool (`kind`, `fn`) | the two hosts' worker interfaces differ; the engine must not know either | medium; the adapters are tens of lines each |
| R6 | one persistence format, `{ format: 'cadcraft-solid', version: 1, bodies: [toData …] }`, in `docData.forAddon('solid')` of both hosts | one file format, one reader, whichever app saved it | small, decided with the first body that has to be saved (M4) |
| R7 | a **host contract test**: the same script run against a fake host with PartCraft's conventions (mm) and one with ModelCraft's (m, column-major): placement, units, a mesh round trip | catches boundary mistakes once, not per host | small |
| R8 | a neutral `profile` (S19): plain loops of lines, arcs, circles, NURBS in a plane, with the loops' nesting left to the engine; adapters for a PartCraft sketch and for a ModelCraft face's loops | the two hosts' profile sources differ | with S19 |
| R9 | cc-step in both hosts, one canonical copy | M6; ModelCraft has none, PartCraft's differs by one import line | decide at M6 |
| R10 | the session protocol (`HANDOFF.md` § 16.3) gains: the manifest rewritten, both hosts' mount checks run, the hosts' own `npm test` run where the sandbox allows | the verification the build needs | text only |

R1 to R4 are plumbing and do not touch the engine's numerics; I propose to build them next, before S15, in this repo and
in a branch of each host (`claude/gracious-rubin-bp03o8`, the branch this session may push to), because they are what
makes the first real copy into the two hosts possible and testable.

## 6. For the owner to decide

Taken at the start of the milestone they belong to, as agreed, not now:

- **M3 (meshing), before S15:** the triangulator (extend engine.solid's own exact-predicate triangulation, or adapt
  cc-acis' `cdt.js` or cc-step's `tess.js`, which are built on `Math.*` and would break the same-bits rule); the mesh
  precision (Float32 for display as planned, or Float64 through the engine and Float32 at the adapter); whether the
  stand-alone dev viewer (S18) is kept now that two real hosts show the meshes; 3MF in or out.
- **M4 (construction), before S19:** the neutral profile (R8); the persistence format (R6); which host gets the first
  user-visible command.
- **M6 (STEP), before S28:** cc-step's canonical copy and whether ModelCraft takes it (R9).
- **M9 (Booleans), before S40:** the adversarial pass-rate target (`HANDOFF.md` § 14, S42).

## 7. What would change this analysis

- The monorepo's `AppBuilds` (private) decides how a new `app/solid/` folder reaches the import map; a host's build may
  need a line there, which these repos cannot show.
- If a host's `npm test` turns out to need a file layout for a new library that the devshell copy of `test.mjs` does not
  show, R4's mount check is where that gets fixed.
- The downloaded-engine package route (`engineResolver`, file count and size limits in `COMPLIANCE.md` § 2) is untried:
  `engine.solid` would be a package of 38 files today, well inside the 200-file, 5 MB limit.
