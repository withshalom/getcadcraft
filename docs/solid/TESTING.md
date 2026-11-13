# engine.solid — how it is tested

**The rule:** every claim the engine makes has a check that can fail, and nothing checks itself. Answers come from
somewhere the engine's own code cannot reach.

```sh
node bin/test-solid.mjs                 # everything: plain Node, no install, no network (about 6 s)
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

1. **The boundary checker:** 15 rules, read from tokens, so comments, strings, templates and regular expressions don't
   fool it.
   - Layers and the one-way import rule; the auditor never imports what it judges.
   - Only cc-nurbs and cc-step from outside, and only from `geom/` up.
   - Specifiers PartCraft's worker loader can follow.
   - No globals: DOM, Node, timers, network, WebAssembly.
   - Determinism: no `Math.random`, no `Date`; no `eval`.
   - No small literals outside `core/tol.js`.
   - (S2) No implementation-approximated `Math` function and no `**`.
   - Fixtures: in `fixtures/bad/`, every rule must fire on exactly its marked lines; `fixtures/clean/` holds look-alikes
     and must pass.
2. **A section per module,** in dependency order. S1: `errors`, `tol`, `limits`. S2: `prng` (first, since the rest draw on it),
   `float`, `trig`, `intervals`, `vec3`, `mat4`, `frame`, `aabb`, `quad`, `roots`, `linalg`. Then `entry` (the export list,
   no globals added, every file reachable), `boundaries` and `worker` (the engine unchanged in a worker thread).
3. **The same bits.** 18,000 trig results hash to a recorded value. Any change to one bit, from the code or from an engine,
   fails. Run the suite in each browser to confirm it there.
4. **Mutation runs, each session.** Break the code on purpose and the suite must fail. In S2, 19 of 20 faults were caught.
   The survivor was equivalent in practice. The run also found a real gap: adaptive integration had no cap on its number of
   pieces (`STATUS.md`). This is how the tests themselves are tested.
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
