# Advisory: what engine.solid brings to the Exact Solids kernel (KRN.1)

**For:** coding agents working on CadCraft Studio's shared engines (`lib/kernel`, `lib/nurbs`, `lib/kernel-smlib`, the
Exact Solids add-on).
**Status:** advisory only. Nothing here is a pull request. The Exact Solids kernel was reviewed in the PartCraft 0.12 *lab*
build (`docs/solid/LAB-KERNEL-REVIEW.md`); work against it waits for an official release and an upstream sync, and its
authors may get there first. Where they do, skip the item. Every claim below is either measured (and says so) or marked
as a proposal.
**Rule that applies throughout:** cc-nurbs and the other shared libraries are not edited outside their own canonical home.
A change goes upstream as one small change with a failing test first, and a change that moves other apps' bits starts with
an issue (decision D-ccn).

---

## 1. The starting point

The Exact Solids kernel is the right delivery architecture and should stay the frame: one engine-neutral contract
(`kernel/index.js`, `CONTRACT = 1`), engines picked by capability, exact hand-over between engines (`krn.*` before STEP
before triangles), an off-by-default add-on that is byte-identical in PartCraft and ModelCraft, honest `method` / `why` on
every result, and a named fallback when the contract cannot build. Measured: on everything it builds it agrees with
OpenCascade to about 1e-16, it is more accurate than OpenCascade on curved intersections, and over 174 random parts both
kernels built, it matched OpenCascade every time.

engine.solid (`withshalom/getcadcraft`, `tests/lib/solid/`, version 0.0.17, 616 passing checks) was built as a separate
kernel and is not integrated anywhere. It should not compete with KRN.1. What it has that KRN.1 lacks is foundations:

| engine.solid has | KRN.1 finding it addresses |
|---|---|
| bit-identical elementary functions and arithmetic (§ 2) | F8: results differ between JavaScript engines |
| exact geometric predicates and exact signs (§ 3) | F7: `tangent`, `seam`, `sliver` whole-part fallbacks |
| first-class surface kinds incl. revolution and linear extrusion, with exact NURBS forms (§ 4) | F2, F6: the STEP reader's wrong vase, refused extrusion |
| certified pcurves and an exact point-in-face (§ 5) | F7 (`seam`), robustness of trimming |
| an independent, mutation-tested auditor with exact volumes (§ 6) | F1, F2, F4: wrong solids accepted as `approximate` |
| a tolerance policy tied to a model box, and budgets (§ 7) | F9 and imports: scale-aware tolerances, bounded work |
| a test discipline built on exact references (§ 8) | the kernel's own `honesty` note: "not compared with any other program" |

Section 9 says how each could enter the KRN.1 stack.

---

## 2. Same bits in every engine

### 2.1 The problem in KRN.1 (measured)
Four parts built by the lab kernel in Node 22 and in headless Chromium 158: **volume and area bit-identical; mesh
coordinates different in all four; centroids different in two** (last bits, about 1e-16 relative). cc-nurbs 0.12 and the
contract make **148 calls** to `Math.sin`, `cos`, `tan`, `atan`, `atan2`, `asin`, `acos`, `exp`, `log`, `pow`, `hypot`,
`cbrt`. ECMAScript specifies these as implementation-approximated, so V8, SpiderMonkey and JavaScriptCore may differ in the
last bit, and a bit difference in an angle becomes a different tessellation, a different intersection point, and, near a
decision threshold, a different topology.

Where it matters: live and teamwork sessions (two machines regenerating one part), checkpoint and cache keys, persistent
references that store coordinates (`EdgeRef.at`, `FaceRef.at`), golden tests across browsers, and any future decision made
on a computed angle.

### 2.2 What engine.solid does
- **`core/trig.js`**: sin, cos, sincos, tan, atan, atan2, asin, acos, exp, log, cbrt built from + − × ÷ and √ only, which
  IEEE 754 specifies exactly. Argument reduction is Cody–Waite with the reduction constant split into four parts and carried
  as a double-double; polynomial kernels are Taylor or minimax with compensated evaluation; constants (π/2 parts, atan
  breakpoints, ln 2) are **computed in BigInt**, not copied.
- **Measured accuracy** against a 320-bit BigInt reference (π by Machin's formula) on 1.6e5 random arguments: sin 0.71, cos
  0.73, atan 0.80, exp 0.90, log 0.73, cbrt 0.50, atan2 1.33, asin 1.62, tan 1.77, acos 2.00 ulps; next to 2000 multiples of
  π/2 up to 2^20, sin and cos 0.50 ulp. Each function carries its proved bound (`ULPS`).
- **Cost:** about 37 ns a sine against 21 ns for `Math.sin` in Node: half speed, the price of identical bits.
- **`core/float.js`**: the bits of a double (`ulp`, `nextUp`, `ulpDistance`), error-free transformations (TwoSum, Fast2Sum,
  TwoProduct with Veltkamp's split) and directed rounding for + − × ÷ √ (down ≤ exact ≤ up, overflow and underflow
  included).
- **`core/intervals.js`**: interval arithmetic rounded outward, with `sign` → 1 / −1 / 0 / null ("cannot tell"), and interval
  sin and cos that know their crests.
- **Enforcement, not convention**: a tokenizer-aware boundary checker (comments, strings, templates and regular expressions
  cannot fool it) refuses any `Math` transcendental, `**`, `Math` used as a value, `Math.random`, `Date`, timers and `eval` in
  the engine, and its `reach` rule follows every import into cc-nurbs function by function so nothing non-exact is reached
  indirectly.
- **Proof across engines**: `tools/solid/digest.mjs` hashes 22 areas of results; `browser-run.mjs` compares them in Node,
  Chromium, Firefox and WebKit, on the page and in a worker. Measured: Node and Chromium (page and worker) agree on all 22.

### 2.3 Advice
1. Treat cross-engine identity as a property with a test: add a digest of KRN.1 results (volumes, areas, tessellation
   hashes, face names) and run it in every engine, as engine.solid does.
2. Replace `Math.*` transcendentals in cc-nurbs' **decision paths first** (angles that feed `ssi.js`, seam placement,
   `analytic.js` maps, tessellation parameters) with deterministic functions. Moving cc-nurbs' bits changes every host's
   output, so this starts with an issue (decision D-det option (a), kept open since 2026-11-12).
3. If adopting `core/trig.js` wholesale is too much, adopt its constraint: a checker rule in cc-nurbs' own tests that fails on
   new `Math.*` transcendentals in files that make topological decisions.

---

## 3. Exact geometric decisions

### 3.1 The problem in KRN.1 (measured)
The lab kernel falls back to the mesh kernel **for the whole part** on: a hole exactly tangent to a side face (`tangent`), two
pattern holes exactly touching (`tangent`), bodies meeting along an edge (`topology`), `seam` and `sliver` cases found by
fuzzing. OpenCascade builds the tangent hole, the edge contact and the `seam` case. The kernel cannot tell "touching" from
"overlapping by a rounding error" reliably, so it refuses. That is safe, but tangency is common in real parts.

### 3.2 What engine.solid does
- **`math/predicates.js`**: `orient2d`, `orient3d`, `incircle`, `insphere` returning the **exact** sign (+1, −1, 0). A floating
  filter decides almost every case (Shewchuk's error bounds, doubled for margin); when it cannot, the determinant is computed
  exactly as an expansion (TwoSum, TwoProduct, Grow-Expansion). Domain: each coordinate 0 or between 2^-140 and 2^140; outside
  it the predicate **refuses** rather than guesses.
- **Measured:** 0 disagreements against an exact BigInt determinant on 1,560,000 cases (random, nudged onto the line, and
  Shewchuk's 256 × 256 grid next to (0.5, 0.5), where plain floating point gets 1442 of 4096 signs wrong). Cost: 50–110 ns a
  call; the exact stage (about 1.7 µs) only for near-degenerate input. A mutation run broke each predicate's exact stage, its
  bounds and its expansions: 9 of 9 caught.
- **`core/exact.js`**: exact signs and correctly rounded quotients of sums of products of doubles (a double is an integer
  times a power of two, so a sum of products is one too), used for decisions that are not determinants, e.g. the exact sign
  of (u − c_u)² + (v − c_v)² − r² for a point against a circle.
- **Typed "cannot tell"**: a decision that sits outside an exact predicate's domain, or whose interval contains zero, is
  reported as such (`null` / a typed refusal), never rounded into a yes or no.

### 3.3 Advice
1. **Make tangency a first-class outcome, not a refusal.** In the planar and analytic cases that produce most `tangent`
   fallbacks (circle tangent to a line in a face's plane, two circles tangent, a cylinder tangent to a plane along a line),
   the contact can be decided **exactly** from the defining data before any intersection curve is computed:
   - line–circle in a plane: the exact sign of (distance² − r²) via `core/exact.js` → separate, tangent, crossing;
   - circle–circle: the exact signs of d² − (r₁ + r₂)² and d² − (r₁ − r₂)²;
   - cylinder–plane (axis parallel to the plane): the exact sign of the axis's distance minus r;
   - coaxial and coplanar cases: exact orientation tests on the frames.

   With the case known exactly, the Boolean can build the tangent edge as a degenerate contact (a shared line or point, the
   faces split there) instead of falling back.
2. **Classify on-surface points exactly.** Where `sbool.js` and `ssi.js` decide whether a point is on, in or out of a face,
   use `orient2d` on the face's (u, v) loops (§ 5) with a half-open rule, so a point on an edge has one answer on both faces.
3. **Report "too close to call" as its own code** (a new `why` such as `near_degenerate`), so the fallback message can say
   *why* instead of a generic `tangent`.

---

## 4. Surface kinds

### 4.1 The problem in KRN.1 (measured)
cc-nurbs 0.12's `analytic.js` knows plane, cylinder, cone, sphere and torus. The STEP reader then:
- reads `fixtures/step/vase.step` (a SURFACE_OF_REVOLUTION over a B-spline profile) as a **wrong solid** (volume 1381.3
  against OpenCascade's 33,292.9) and accepts it as `approximate` (F2);
- refuses `fixtures/step/extrusion.step` (a SURFACE_OF_LINEAR_EXTRUSION) with the misleading cause `step_empty` (F6).

Both are common STEP surface types: CAD systems write revolved and extruded features from spline profiles exactly this way.

### 4.2 What engine.solid does (`geom/analytic-surface.js`, `geom/surface.js`)
Seven kinds that **keep their identity** (a cylinder stays a cylinder for STEP, for intersection and for the auditor), in
STEP's own parameterisations (ISO 10303-42), so a reader and a writer name them directly:

| kind | parameterisation |
|---|---|
| plane | S = o + u x + v y |
| cylinder | S = o + r (cos u x + sin u y) + v z |
| cone | S = o + (r + v tan α)(cos u x + sin u y) + v z, α the semi-angle, refused through its apex |
| sphere | S = o + r cos v (cos u x + sin u y) + r sin v z, v ∈ [−π/2, π/2] |
| torus | S = o + (R + r cos v)(cos u x + sin u y) + r sin v z, R > r |
| **revolution** | S(u, v) = the profile C(v) turned by u about the axis (d unit, right-handed) |
| **extrusion** | S(u, v) = C(u) + v d (d unit) |

- **Exact NURBS conversion** for every kind (`toNurbs`): tensor products of exact circular arcs (*The NURBS Book* A7.1, on the
  engine's own trig) and lines; revolution by A8.1 on the profile's own control net; extrusion by a linear tensor product.
  Checked: every converted point satisfies the kind's implicit equation (radius, axis distance, height) to 1e-12 of the size.
- **Su × Sv points outward** on the closed kinds with right-handed frames, so a face's sense alone decides orientation.
- **Normals at poles are true limits** (`diffgeo.js`), refused where none exists (a cone's apex), never a default direction.
- **Exact volumes of trimmed faces of these kinds**: the auditor integrates ∬ p · n dA / 3 in each face's own (u, v) by
  Green's theorem, with no mesh (§ 6). Measured on a revolved vase (a circular arc about an axis): agrees with the
  closed-form π ∫ r² dz to 4e-16.
- **One interface for all** (`surface.js`: domains, point, derivatives, normal, curvature, transform, box, toNurbs,
  `toData` / `fromData`), so code that consumes surfaces never branches on the kind except where an analytic shortcut helps.

### 4.3 Advice
1. **In the STEP reader:** map SURFACE_OF_REVOLUTION and SURFACE_OF_LINEAR_EXTRUSION to their own kinds (as above) or to
   their exact NURBS forms (A8.1 / linear tensor product) **before** building faces. Then they measure exactly and cross to
   SMLib as exact data.
2. **Until then, refuse instead of accepting:** a read that comes out `approximate` should be a refusal with a true cause
   (`surface_revolution`, `surface_extrusion`), not a solid. That one change removes F2's wrong answer.
3. **Keep the kinds when converting.** A recognised cylinder, or a revolution whose profile is a line or a circle, should
   become a cylinder, cone, sphere or torus (exact recognition), because the Boolean and intersection fast paths depend on
   the kind.

---

## 5. Trims: certified pcurves and an exact point-in-face

### 5.1 Relevance
`seam` fallbacks, and the class of failures where two faces disagree about whether a point is on their shared edge, come from
how a face's boundary is represented in its (u, v) plane, especially on periodic surfaces (seams) and at poles.

### 5.2 What engine.solid does (`topo/pcurve.js`, `topo/prim.js`, `topo/trim.js`)
- **pcurves are exact and certified.** For the analytic pairs (a plane with a line or circle; a cylinder, cone, sphere or
  torus with a circle round its axis or a line along it) the pcurve is a straight line or circle in (u, v), on the edge's own
  parameter (STEP's PCURVE). Before it is returned, four points of it are put through the surface and must meet the edge's
  points within `tol.lin`; anything else is refused (`not_isoline`, `off_surface`), never fitted silently.
- **Seams and poles are explicit.** A periodic seam is one edge used twice in one loop (senses +1 and −1, pcurves a period
  apart); a pole is a degenerate edge whose 3D curve is a point and whose pcurve runs along the pole. Euler–Poincaré counts
  edges without the poles: V − (E − D) + F − R = 2 (S − G).
- **Point in face is exact.** The winding number of a loop about a point uses a half-open crossing rule on v, `orient2d` for
  segments and the exact sign of (u − c_u)² + (v − c_v)² − r² for arcs cut at quarter turns. "On the loop" returns `null`,
  never in or out by accident. Measured: agrees with an exact BigInt crossing count on 32,000 cases (corners, midpoints, a
  ray through a vertex, one ulp off an edge or a corner).
- **A face on a periodic surface is read in the turn its loops lie in**, so a point a whole period away classifies the same.

### 5.3 Advice
cc-nurbs 0.12's `brep.js` already keeps an edge's pcurve implicitly (the edge's 3D curve under the face's closed-form map).
Adopt two things: **certify every pcurve** (sample, map, compare, refuse) when a face is made or imported, and **decide in /
on / out with exact predicates** in `sbool.js`, with seams represented as above. Both target the `seam` fallbacks.

---

## 6. An independent referee

### 6.1 The problem in KRN.1 (measured)
- A loft from a square to a circle comes back with volume 3982.9 (OpenCascade 8891.6; any such loft is at least 6032), and the
  kernel **accepts it** as `approximate` (F1).
- The vase read (F2) is accepted the same way.
- An impossible fillet becomes a fallback, and the mesh kernel then builds a body of volume 13,844.9 from it (F4).

KRN.1 checks topology on its own exact path (`brep.check`: every edge used once each way, Euler–Poincaré), but nothing
**independent of the code that built a result** checks the result before it is accepted, and `approximate` results are not
checked at all.

### 6.2 What engine.solid does (`audit/audit.js`)
- **Separate by construction**: the auditor imports core, math, geom and topo, never the operations or the mesher (a checker
  rule), so it cannot share a bug with what it judges.
- **Findings, not exceptions**, in the suite's Problems shape (`{ code, severity, msg: { key, vars }, about, source }`),
  advisory, capped; `ok` means no warning.
- **27 checks**:
  - topology: orphans, open edges (a warning in a solid, a note in a sheet), non-manifold edges, an edge used the same way by
    two faces, a pole's edge not used once, disconnected shells, and Euler–Poincaré per closed shell with the genus asked for;
  - geometry: a vertex off its edge, an edge off its face's surface (closest point at `samples` points), a pcurve off its edge,
    a pcurve out of its surface's domain (periodic directions read in their own turn), loops not closed in (u, v), the outer
    loop not counter-clockwise about the face's normal, holes not inside / not running the other way / overlapping, loop
    pieces that cross or touch (exact `orient2d` for segments, closed forms for arcs), tolerances above `tol.maxEdgeTol`;
  - solid: **the volume of each closed shell by the divergence theorem, each face integrated in its own (u, v) by Green's
    theorem** (∮ G dv with G = ∫ f du by Gauss–Legendre; no mesh), the outer shell positive, voids negative, the total
    positive, voids inside the outer shell's boxes.
- **Measured:** the seven-body corpus (box, cylinder, cone, sphere, torus, a prism with two holes, a vase) over six seeds audits
  clean with volumes equal to closed forms to 1e-12 (about 4e-16 in practice); **30 bodies broken on purpose**, one fault each,
  each reported with its own finding; **every finding code fired** by at least one; a **mutation run** of 56 faults in the
  auditor, **56 caught**.
- **Cost (measured):** 130–540 ms a body for the full audit, 40–160 ms with two samples and no volume. Too slow for every
  operation in an interactive rebuild, so it is meant to be **tiered**: topology on every operation, the full audit on demand,
  in tests and on import (proposal R12).

### 6.3 Advice
1. **Gate every `approximate` result** before it is accepted, with checks that do not use the code that made it:
   - closedness and orientation of the shell;
   - **a volume bound**: for a loft, the volume between the smallest and largest section areas times the height; for any
     solid, a divergence-theorem volume from its faces compared with the volume of its own tessellation (they must agree to
     the chord tolerance). F1 fails both; F2 fails the second.
   A failed gate becomes a refusal with a cause, not an `approximate` solid.
2. **Separate "the input is impossible" from "the kernel cannot"** (F4): a fillet whose radius does not fit, or a shell
   thicker than the body, is a feature error, with the body kept as it was, as OpenCascade and the mesh kernel already do.
   Only "cannot" should fall back.
3. **Audit imports in full**, since an imported file is untrusted input.
4. engine.solid's auditor would need a converter from cc-nurbs' `brep` to its B-rep to run as-is (not built; § 9). Its checks
   are written against definitions, not data structures, and port directly.

---

## 7. Tolerances and budgets

### 7.1 What engine.solid does
- **One tolerance policy** (`core/tol.js`): `lin` 1e-6 mm (two points are one), `ang` (parallel), `fit` (approximations),
  `maxEdgeTol` (the largest local tolerance an edge may carry before the auditor reports it), `mesh.chord` / `mesh.angle`,
  and a **model size box** (1 km by default) with the relations checked on construction: `ang ≤ lin / size` (otherwise
  "parallel" and "coincident" contradict each other at the box's far corner) and `lin ≥ size · 1e-13` (`lin` stays above the
  spacing of doubles there). No tolerance-sized literal is allowed anywhere else (a checker rule).
- **Local tolerances** on vertices and edges (tolerant modelling for imports), reported by the auditor.
- **Budgets** (`core/limits.js`): exact iteration and entity counts and an optional deadline on an injected clock; child
  budgets cannot outgrow their parent; every long loop in the engine is bounded and refuses with `solid.err.limit`.

### 7.2 Relevance and advice
- **Imports** need local tolerances: commercial files carry edges that meet only to 1e-4 mm or worse. A per-edge tolerance with
  a reported maximum is the honest way to accept them without loosening the global tolerance.
- **Scale**: measured, a 10 mm rectangle sketched 1 km from the origin fails in PartCraft's profile step (`profile_branches`),
  on every kernel. A tolerance tied to a declared model box, rather than absolute literals, fixes that class.
- **F9 (quadratic hole scaling: 900 holes 35 s; OpenCascade hangs on 57 of 240 random parts)**: budgets turn a slow or
  pathological case into a typed refusal the host can act on, instead of a stalled worker.

---

## 8. Test discipline

engine.solid's rule is "every claim has a check that can fail, and nothing checks itself". What is worth adopting for KRN.1:

| Practice | engine.solid | Suggested for KRN.1 |
|---|---|---|
| exact references | BigInt for rounding, trig, predicates, basis functions; closed forms for areas and volumes | closed forms and high-precision quadrature for every primitive and Boolean case (the review used a 200,000-step reference to show KRN.1 beats OpenCascade at 9e-16 against 6.5e-11) |
| a black-box oracle | OpenCascade planned, test-only | **already available**: PartCraft's own `--oracles` fetches it; the review ran KRN.1 against `regenerateBrep` on 73 parts and 240 random ones. Keep it in CI, with a time limit per part (it hung on 57 of 240) |
| randomized parts | seeded property tests (1e5 cases where a property exists) | the review's generator: random blocks with 1–6 cuts, pockets, bosses, holes, patterns; 174 compared, 0 mismatches |
| mutation runs | at every session close | breaks a check on purpose; the suite must fail. Survivors are missing tests (39 of 46 at first in S14) |
| digests across engines | 22 areas, Node / Chromium / Firefox / WebKit, page and worker | § 2.3 |
| "a finding exists only if something fires it" | the auditor's 27 codes are each fired by a test | the add-on's 66 `why` codes: a test that produces each |

---

## 9. How this could enter the KRN.1 stack (after an official release and an upstream sync)

Ordered by value for risk. Each starts as an issue upstream, with the failing case from the review attached.

1. **Correctness gates (§ 6.3 items 1–2).** Smallest change, removes every wrong-solid case found. Lives in `krn-build.js`
   and `kernel-smlib` result handling; no cc-nurbs change.
2. **Reader surface kinds (§ 4.3).** In cc-nurbs' `step.js`: revolution and extrusion surfaces to exact NURBS (A8.1 and the
   linear tensor product); until then, refuse. engine.solid's `analytic-surface.js` is a reference implementation with tests.
3. **Route STEP import to the kernel** (review § 6: `import` into `KRN_BUILT`, `fromStep`, axis transform, `face:<i>` names),
   after item 2's refusal is in.
4. **The naming fix (F3)**: SMLib split pieces need a suffix PartCraft does not use (`krn-build.js:62`).
5. **Exact tangency (§ 3.3)** for the planar and analytic contact cases.
6. **Deterministic transcendentals in cc-nurbs' decision paths (§ 2.3)**: an issue first, because it moves every host's bits.
7. **An engine.solid engine behind the contract**: proposal only. engine.solid could register as an engine (`id: 'solid'`)
   offering `measure`, an `audit`, exact predicates and the swept surface kinds, and exchanging bodies as `krn.topo` data. It
   would need converters between cc-nurbs' `brep` and engine.solid's B-rep (both are faces → loops → coedges → edges →
   vertices with exact curves, so the mapping is direct, but it is not written).

What not to do: duplicate KRN.1's operations in engine.solid, or let two kernels compete for the same features. The contract
already lets one engine borrow another's strengths, which is the point of building engines this way.

---

## 10. References

- `docs/solid/LAB-KERNEL-REVIEW.md`: the review, with every measurement and how to reproduce it.
- engine.solid: `tests/lib/solid/` (`core/trig.js`, `core/float.js`, `core/exact.js`, `core/intervals.js`, `core/tol.js`,
  `core/limits.js`, `math/predicates.js`, `geom/analytic-surface.js`, `geom/surface.js`, `geom/diffgeo.js`, `topo/pcurve.js`,
  `topo/trim.js`, `topo/prim.js`, `audit/audit.js`, `audit/corpus.js`), `tools/solid/` (checker, digests, BigInt reference),
  `docs/solid/STATUS.md`, `TESTING.md`, `PROVENANCE.md`.
- KRN.1 (lab build 0.12): `kernel/index.js`, `kernel/engine-nurbs.js`, `kernel-smlib/`, `krn-build.js`, `krn-worker.js`,
  `nurbs/brep.js`, `nurbs/sbool.js`, `nurbs/ssi.js`, `nurbs/step.js`, `addons/exact-solids/`.
- Sources behind engine.solid's methods: J. R. Shewchuk, "Adaptive Precision Floating-Point Arithmetic and Fast Robust
  Geometric Predicates" (1997); W. J. Cody, W. Waite, *Software Manual for the Elementary Functions* (1980); T. J. Dekker
  (1971) and D. E. Knuth, *TAOCP* vol. 2, for error-free transformations; L. Piegl, W. Tiller, *The NURBS Book* (2nd ed.),
  A7.1 and A8.1; ISO 10303-42 for the surface parameterisations; K. Hormann, A. Agathos, "The point in polygon problem for
  arbitrary polygons" (2001); M. Mäntylä, *An Introduction to Solid Modeling* (1988).

— Codie
