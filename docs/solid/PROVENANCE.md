# engine.solid — where each module comes from

One row per file under `lib/solid/`, added in the session that creates the file (`HANDOFF.md` §15). PartCraft's own
`PROVENANCE.md` rules apply: no code copied from other projects; copyleft tools are black-box test oracles only.

| File | Implements (book / paper / standard, section) | Taken from (in-repo library or `reference/kad/` snapshot + lines) | Checked against (oracle / identity) | Session |
|---|---|---|---|---|
| `lib/solid/index.js` | the public entry (`HANDOFF.md` § 4) | — (written new) | `entry` tests: the export list, no globals added, every file reachable | S1 |
| `lib/solid/core/errors.js` | the refusal contract (`HANDOFF.md` § 4.6) | The shape follows cc-nurbs' `NurbsError(code, vars)` (`app/nurbs/curve.js` line 30). The KAD2 code names follow `reference/kad/kad2/src/engine/util/errors.js`. Both are the owner's own code; no lines were copied. | `errors` tests, including a real cc-nurbs `NurbsError` passing through | S1 |
| `lib/solid/core/tol.js` | the tolerance policy (`HANDOFF.md` § 5.2) | — (written new) | `tol` tests: defaults, every refusal, both ends of every range | S1 |
| `lib/solid/core/limits.js` | cooperative budgets (`HANDOFF.md` § 13.3) | — (written new) | `limits` tests, on a clock the test controls | S1 |

Test tools (under `tools/solid/`, not shipped):

| File | Implements | Taken from | Checked against | Session |
|---|---|---|---|---|
| `check-boundaries.mjs` | the architecture rules (`HANDOFF.md` § 4.2, 4.5, 5.2, 15), modelled on KAD2's boundary check | The import pattern of PartCraft's worker loader (`app/exact-client.js`, `blobModules()`) is quoted as data, so the checker sees what the loader sees. The tokenizer was written new. Import cycles are found with Tarjan's strongly connected components (R. E. Tarjan, "Depth-first search and linear graph algorithms", SIAM J. Comput. 1(2), 1972). | `boundaries` tests: every rule fires exactly where `fixtures/bad/` says, and nothing fires on `fixtures/clean/` | S1 |
| `test.mjs`, `worker-probe.mjs`, `fixtures/` | engine.solid's test runner, in PartCraft's style (`tests/tools/nurbs/test.mjs`) | — (written new) | ten deliberate faults (in tol, limits, errors and the checker itself) each made it fail | S1 |

Sources already in the repository that engine.solid builds on (imported, not copied):

| Library | Path | Licence | Its own provenance |
|---|---|---|---|
| cc-nurbs | `app/nurbs/` | Apache-2.0 | each file cites The NURBS Book (Piegl & Tiller, 2nd ed.) by algorithm number |
| cc-step | `app/step/` | Apache-2.0 | ISO 10303-21 / -42 / -43 long-form schemas; OpenCascade only as a black-box test oracle |
| cc-acis | `tests/lib/acis/` (canonical in the monorepo's `lib/acis`) | Apache-2.0 | `docs/ACIS-READER.md` in the monorepo |
