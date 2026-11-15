# engine.solid — catalogue entry (draft)

For the add-on catalogue at getcadcraft.com › Build an add-on › Engines. The fields follow the existing engine pages
(`engine.nurbs`, `engine.field`). The owner publishes it; nothing here is live.

| Field | Value |
|---|---|
| **Id** | `engine.solid` |
| **Name** | Solid kernel (proposed, after "Field kernel"; the owner's choice) |
| **What it computes** | Exact solids: NURBS and analytic B-rep, STEP. |
| **Status** | Planned. Today the numerical ground and the whole of M1 (splines) are built: NURBS curves and surfaces, the analytic curves and surfaces with exact NURBS forms, fitting, construction (ruled, loft, Coons) and queries (closest points, length, area, tight boxes, a BVH) — and M2 (topology) has begun with the B-rep data model: immutable snapshots with stable ids and persistent names — S1–S11 of 44, `STATUS.md`. It becomes "Built · in the lab" when PartCraft's rebuild runs through it (S24b). |
| **Maker** | CadCraft |
| **Licence** | Apache-2.0 |
| **Hosts** | PartCraft first; then ModelCraft, CadCraft (its 3D tab), BimCraft and SuperCad Studio, each carrying its own copy |
| **Delivery** | canonical in the site repo's `lib/solid/`, beside `lib/nurbs/`; `tools/solid/sync.mjs` copies it byte for byte into each host's `dev/solid/` (run the cc-nurbs sync first). The owner authorizes each app |
| **Download** | none needed while every host carries a copy; a package size is given once there is one |
| **Built on it** | No add-on yet. |

## Use it in your add-on

Name it in your manifest's `needs`. Each host app carries the engine, so the copy the app already has answers, and nothing
is downloaded:

```json
{
  "id": "com.example.my-addon",
  "apps": ["partcraft", "modelcraft"],
  "needs": ["engine.solid"]
}
```

Import it through the add-on loader's `engine:` form, `engine:solid/index.js`, declared in the manifest's `imports.engine`.
Then use the namespaces (`vec3`, `mat4`, `linalg` …), not files inside the engine, which may move between versions.

## Methods and standards

- **Geometry (planned):** NURBS curves and surfaces from cc-nurbs (*The NURBS Book*, Piegl and Tiller); analytic planes,
  cylinders, cones, spheres and tori with exact conversions; trimmed faces with exact parameter-space trims.
- **Topology (planned):** a B-rep of vertices, edges, coedges, loops, faces, shells and solids, with tolerant edges, stable
  ids, and an independent auditor that cannot import the code it judges.
- **Solids (planned):** made by profile and feature operations (extrude, revolve, sweep, loft). Exact booleans come later
  (M9), beside those operations, not instead of them.
- **Numerics (built):**
  - Elementary functions from + − × ÷ and √ only, so the same input gives the same bits in every browser and in Node.
    Measured against a BigInt reference: within 1 ulp for sin, cos, atan, exp, log and cbrt, 2 for tan, atan2 and asin, 3 for acos.
  - Interval arithmetic rounded outward, and boxes that always hold what they bound.
  - LU with a condition estimate, banded LU, Householder least squares, Gauss–Legendre integration, Kahan's quadratic and
    cubic, and Brent's method.
- **Determinism and safety:**
  - No clock, no `Math.random`, no network, no DOM.
  - Work budgets stop long jobs.
  - Every failure is a typed refusal (`solid.err.*`) that the app words in its own language. The engine never returns a
    wrong answer quietly.
- **Exchange (planned):** STEP AP214 / AP242 (ISO 10303-21, -42) through cc-step; meshes for display and printing.
- **Clean room:** written from published sources only. OpenCascade and other kernels serve as black-box test oracles,
  never as source.

## Limits

- **A kernel in progress, not a finished tool.** Today it provides the numerical ground: tolerances, budgets, refusals,
  deterministic functions, intervals, linear algebra, integration and roots. It does not yet make curves, surfaces or
  solids; those arrive session by session.
- Booleans come last (M9), and fillets between trimmed faces after the intersection work (S25–S27, S38).
- Speed: about 27 million sines a second in Node, roughly half the speed of `Math.sin`. That is the price of identical
  bits everywhere; tuning comes in S43.
- Figures from a shared build server are not reliable and are not quoted.
