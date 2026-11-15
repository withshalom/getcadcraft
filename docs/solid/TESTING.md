# engine.solid — how it is tested

**The rule:** every claim the engine makes has a check that can fail, and nothing checks itself. Answers come from
somewhere the engine's own code cannot reach.

```sh
# run these from tests/ in a clone of the site repo (the repo root holds lib/, tools/, bin/ in the real layout)
node bin/test-solid.mjs                 # everything: plain Node, no install, no network (about 1 minute)
node bin/test-solid.mjs --only trig     # one section
node bin/test-solid.mjs --verbose       # every check by name
node tools/solid/check-boundaries.mjs   # the architecture rules alone
```

## Where the right answers come from

| Source | What it settles | Where |
|---|---|---|
| **Exact arithmetic, BigInt** (tests only; the engine never uses BigInt) | everything about rounding. a + b = s + e exactly. Rounded down ≤ exact ≤ rounded up. An interval holds the true result of points inside it. A box holds the exact image of each corner. The error of each trig function in ulps, against a 320-bit reference with π from Machin's formula. κ₁ of the inverse Hilbert matrices, from their exact integer inverses. | `tools/solid/bigref.mjs`, the dyadic helpers in `test-core.mjs` |
| **A second implementation** | the random generator, bit for bit: state, first outputs and the millionth output for five seeds | `tools/solid/ref/xoshiro128ss.c` (outputs written into the test) |
| **Known answers** | Kahan's hard quadratic (roots 1 and 1.0000000289…), the Gauss rules for 1, 2 and 3 points, integer roots of cubics, x³ − 2x − 5 = 0 | the sections themselves |
| **Properties on seeded random cases** (1e5 where a property exists) | identities, round trips, backward errors: whether an answer satisfies the equation it solves | every section; seeds are in the messages |
| **Later: oracles** | volumes, areas, bounding boxes, STEP read-back against OpenCascade; opt-in, never shipped, never loaded by an app | from S14 on (`HANDOFF.md` §16.1) |

## What runs

1. **The boundary checker:** 16 rules (`reach` judges cc-nurbs function by function), read from tokens, so comments, strings, templates and regular expressions don't
   fool it.
   - Layers and the one-way import rule; the auditor never imports what it judges.
   - Only cc-nurbs and cc-step from outside, and only from `geom/` up.
   - Specifiers PartCraft's worker loader can follow.
   - No globals: DOM, Node, timers, network, WebAssembly.
   - Determinism: no `Math.random`, no `Date`; no `eval`.
   - No small literals outside `core/tol.js`.
   - (S2) No implementation-approximated `Math` function and no `**`.
   - (S4) `reach`: the same exactness for every cc-nurbs or cc-step file an import loads, followed to the end.
   - Fixtures: in `fixtures/bad/`, every rule must fire on exactly its marked lines; `fixtures/clean/` holds look-alikes
     and must pass.
2. **A section per module,** in dependency order. S1: `errors`, `tol`, `limits`. S2: `prng` (first, since the rest draw on it),
   `float`, `trig`, `intervals`, `vec3`, `mat4`, `frame`, `aabb`, `quad`, `roots`, `linalg`; S3: `predicates`, with an exact BigInt determinant for each of 1.56e6 cases. `sync` (since the move to the site repo: the engine and cc-nurbs are LF-only and canonical side by side, and `tools/solid/sync.mjs` copies, checks, repairs and refuses correctly, tried on temporary hosts) and S4's `basis`. In `basis` the values are checked against exact Cox–de Boor in BigInt rationals, using the proved bound γ(6p). The knots and u are scaled by a power of two to whole numbers, and each degree level shares one denominator, so no gcd is needed. S5: `curve` — points against the exact Σ N·w·P / Σ N·w in BigInt rationals (on `basis`' exact reference) within (16p + 8) u of the size of their terms; derivatives against exact ones; every shape-preserving operation compared point by point before and after, to 1e-12 of the curve's size; curvature and torsion against closed forms and under a 2^±400 change of parameter scale; `deviation` against a known perturbation and against sampling; a fixture where cc-nurbs' own reduction misses its tolerance. S6: `surface` — points and partials (k + l ≤ 2) against exact values, A4.4 done exactly for rational surfaces; the operations in u and in v to 1e-12; normals orthogonal to both partials to 8 u; a sphere octant (umbilic everywhere, the pole's limit normal), a cylinder and the saddle z = xy against closed forms, Euler's formula. S7: `analytic` — lines, circles, ellipses and the analytic surfaces against the textbook formulas evaluated with `Math.sin` and `Math.cos` (the engine has its own trig), derivatives against central differences, every converted NURBS point against the analytic shape's implicit equation (radius, axis distance, height) to 1e-12, sphere and torus patch areas against closed forms to 1e-9. S8–S9: `fit` and `construct` — interpolation residuals at the data, approximation error against a closest-point referee (dense search, then ternary search) on a corpus of known shapes, ill-conditioned data that must be refused (found by search), lofts against their sections and the averaging rule, Coons patches against their edges and the Coons formula, grid interpolation against the grid. S10: `query` — closest points against brute force (dense samples refined by ternary search) on 10,000 curve queries and 1800 surface queries (20 NURBS surfaces and 42 analytic ones, among them extrusions and revolutions of wavy profiles, which have no lower bound to fall back on), inversion, lengths and areas against closed forms, the area of the same surface under a Möbius change of parameter (its rational weights times c^i), tight boxes against a referee whose sides are pushed out by local search, the BVH against brute force with a distance that is not a multiple of the box distance. S11: `topo` — a cube's tables, Euler–Poincaré and adjacency, copy-on-write sharing, ids never reused, every structural rule fired on a model broken on purpose, round trips through `structuredClone` and JSON, the draft's own calls and refusals, a 1,000-face body taken through 100 timed edits; persistent names, three of them recorded. S12: `euler` — 600 random Euler operations on a growing model, each against its table of counts and Euler–Poincaré, with inverse pairs giving back their model up to ids; every refusal; prisms by Euler sweep against the same prisms from the polyhedron builder; a torus from the builder; a hole made by Euler operators; a cube sewn from jittered faces. Then `entry` (the export list,
   no globals added, every file reachable), `boundaries` and `worker` (the engine unchanged in a worker thread).
3. **The same bits.** 18,000 trig results hash to a recorded value, and so do 4,000 basis evaluations (S4). Any change to one bit, from the code or from an engine,
   fails. For browsers: `tools/solid/digest.mjs` hashes 20 areas (S5 added `curve`, S6 `surface`, S7 `analytic`, S8–S9 `fitting`, S10 `query`, S11 `topo`, S12 `euler`) and imports nothing, so the same file runs in Node, on
   a page and in a worker. `node tools/solid/browser-run.mjs` (needs Playwright, which is not a dependency here) runs
   it in Chromium, Firefox and WebKit against `tools/solid/digests.json`; `tools/solid/browser.html`, served over
   http, is the same check by hand for any other browser. After a deliberate change of answers: `--record`.
4. **Mutation runs, each session.** Break the code on purpose and the suite must fail. In S2, 19 of 20 faults were caught.
   The survivor was equivalent in practice. The run also found a real gap: adaptive integration had no cap on its number of
   pieces (`STATUS.md`). This is how the tests themselves are tested. In S5 the first run caught 18 of 22; each of the four
   survivors showed a test that was missing (a real knot removal under its tolerance, a gap in join, reverse on knots that
   round, a reduction cc-nurbs gets wrong), and with those tests all 22 are caught. In S6 one survivor guarded a case that random
   surfaces almost never reach; a seeded search over 4000 surfaces found two that do, and they are fixtures now (23 of 23).
   A mutation run starts with the unmutated code: in S7 a run once reported every fault caught while the section itself was
   throwing, which proves nothing. A survivor can also mean the code is dead: in S10 removing a Gauss–Newton fallback or
   eleven of twelve descents changed no answer on 1800 queries, and timing showed both cost time (branch and bound and the
   line polish, added after them, do their work), so they were removed rather than kept untested.
5. **Before the pull request, and whenever a host takes a new copy:** that host's own test suite with the copy in place
   (PartCraft's `npm test` first), and the browser run above.

## Choices, and why

- **BigInt as the referee.** Exact and independent of the engine's double arithmetic. It is slow, which doesn't matter in
  tests.
- **Seeds, not `Math.random`, even in tests.** A failure reproduces exactly and names its seed. The generator is
  cc-solid's own, checked against C before anything relies on it.
- **Bounds that cannot lie.** Intervals and boxes round outward and are checked exactly. So a later "definitely inside,
  definitely outside, or cannot tell" decision (S3 predicates, the S25–S27 intersections) can rest on them.
- **Measured accuracy, written down.** `trig.ULPS` holds the largest error the tests measure, and the interval functions
  widen by it.
- **Tests run on the edited copy, `lib/solid/`.** Hosts carry byte-identical copies, checked by a sync script with
  `--check`, so one passing run covers them all.

## Adding a session's tests

- A new module gets its own section, registered in dependency order.
- A new refusal code gets a test that throws it.
- A rounding claim gets an exact check.
- An accuracy claim gets a measured number, recorded in `STATUS.md`.
- Every session ends with a mutation run, also recorded in `STATUS.md`.
