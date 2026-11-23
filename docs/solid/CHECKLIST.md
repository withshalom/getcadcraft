# engine.solid — checklist from 0.0.16 (S13)

Written 2026-11-23 from `STATUS.md`, `COMPLIANCE.md` and `HANDOFF.md` §14. Verified on this checkout:
`node bin/test-solid.mjs` (Node 22.23): 590 passed, 0 failed; boundary checker: 36 files, 210 imports, 0 problems.

## A. Before the pull request (owner / gate items)
- [ ] Open a proposal issue upstream (scope, layout under `tests/`, how hosts take copies) — org rules require it for anything larger than a fix
- [ ] Run `node tools/solid/browser-run.mjs` (Playwright) — browsers last agreed on 13 of 21 digest areas (0.0.7); S5–S13 unconfirmed
- [ ] Safari check by hand
- [ ] Run the suite on Node 20.19 (BUILDING.md minimum) and confirm `npm test -- --oracles` on Node 22 as CI does
- [ ] Owner's go for the PR (D-home)
- [ ] Publish the `engine.solid` catalogue page (drafted in `ENGINE.md`)

## B. Next build — S14 auditor and primitive corpus (closes M2, release gate v0.1)
- [ ] Auditor imports only core/math/geom/topo (never ops or mesh); findings in the Problems shape (`CODE-CULTURE.md` §6)
- [ ] Euler–Poincaré as V − (E − D) + F − R using `trim.degenerate` (else a sphere is called wrong)
- [ ] Corpus: box, cylinder, cone, sphere, torus, prism with holes, revolved vase
- [ ] Auditor passes the corpus and fails >= 20 corrupted bodies, each check proven to fire
- [ ] Mutation run at close; STATUS/PROVENANCE/HANDOFF updated; VERSION 0.0.17; new digest area

## C. Get ahead (ordered by what blocks later sessions)
- [ ] cc-step: settle the canonical copy (PartCraft `app/step/` has `part21.js`, site `lib/step/` lacks it; `read.js` differs) before S28
- [ ] Periodic-aware `classify` for circle-bounded faces with no seam (needed by S30 STEP import)
- [ ] Unclamped/periodic knot vector -> clamped converter (S30)
- [ ] NURBS -> analytic recognition (S30)
- [ ] Closed-form / lower-bound closest points for analytic surfaces (S10 leftover)
- [ ] Curvature limit at a pole (needed by offset/fillet, S37–S38)
- [ ] Language keys for `solid.err.*` (due S24b)
- [ ] First real `tools/solid/sync.mjs` run against PartCraft (S24b)
- [ ] `fromEnvelope` with the worker protocol (S18)
- [ ] Open upstream PRs (not edits here, per D-ccn) for: cc-nurbs `findSpan` empty end span, cc-nurbs `reduce` tolerance, cone-apex rounding in `geom/analytic-surface.js`, cc-field `detmath.js` accuracy

## D. Compliance — open rows
- [ ] Browser digests S5–S13 (see A)
- [ ] CI on Node 22 and 20.19 (see A)
- [ ] Proposal issue before PR (see A)
- [ ] Catalogue page published (see A)
- [ ] Re-confirm per session: SPDX, clean-room provenance row per new file, no new library, package size (33 files, ~350 KB at S12; 200 files / 5 MB limit)

## E. Roadmap after S14
- [ ] M3 Mesh S15–S18 · M4 Construction S19–S24 (release gate v0.5) · M5 Intersection S25–S27 · M6 STEP S28–S33 (v0.8) · M7 Integration S35–S36 · M8 Advanced S37–S39 · M9 Booleans S40–S42 · M10 Hardening S43–S44 (v1.0)
- [ ] Risk watch: S25–S27 intersection, S38 fillets, M9 booleans
