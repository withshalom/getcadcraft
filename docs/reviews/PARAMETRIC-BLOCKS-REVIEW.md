# Review: parametric blocks in the CadCraft 0.12 lab build (PB.1)

Reviewed 2026-11-24 for hand-back to the PB.1 session. Subject: the parametric blocks of the CadCraft `dev` (lab) build:
the shared library `lib/paramblock/paramblock.js`, CadCraft's host `blockparams.js`, the commands `BPARAMS`, `PBLOCK` and
`PBEXPORT`, the Library item format's `dynamic` section, and the 20 blocks of the Library's Parametric tab.

## 0. How it was tested

- **Code under test:** the lab build's own modules, fetched from `getcadcraft.com/assets/apps/cadcraft/dev/` (served publicly;
  the lab page `/lab/cadcraft` needs a signed-in session, so no UI was driven), with `paramblocks/starter.json` (the 20 blocks).
- **Runtime:** Node 22 for everything; headless Chromium 158 for the cross-engine comparison.
- **Commands** were driven through the real command engine (`new Engine(doc, host)`, typed lines), the way the repository's own
  Node tests drive commands.
- **Coverage:** 2,014 checks of the 20 blocks and 11 hostile definitions; 302 formula checks; 480 save-and-reopen round trips;
  the authoring commands typed at the command line; export fidelity; copy and paste; explode; undo; the largest sizes; 3,000 mutated
  (untrusted) Library item files; a Node-against-Chromium bit comparison of all 20 blocks.
- **Scripts:** `docs/reviews/parametric-blocks-tests/` (with a README to rerun every number below).

## 1. Verdict

**The parametric engine itself is solid.** Every one of the 20 blocks, at every allowed value, gives finite, correct geometry;
illegal values are refused; values forged into a file cannot break a block; grips land where they are dropped on rotated,
mirrored and scaled references; hostile definitions are bounded by the documented limits; and every block survives DXF R12,
DXF 2000, binary DXF 2000 and DWG 2000, 2010 and 2018, in millimetre and inch drawings, still parametric and the same shape.

**Two paths around the engine are broken**, and neither was in the PB.1 session's checks:

| # | Severity | Finding |
|---|---|---|
| P1 | **High** | **`PBEXPORT` cannot produce a valid Library item.** It writes no IFC class, which the item validator requires, so every export is refused (`pb.export.problems`), including re-exporting each of the 20 shipped blocks |
| P2 | **High** | **Copy and paste into another drawing, and INSERT from another drawing's file, drop the block's parameters.** The pasted reference silently shows the block's default shape (a table set to 3000 mm pastes as 1500 mm) and has no grips. Paste within one drawing is fine |
| P3 | Medium | **Enter at a prompt that shows a default does not take it** in `PBLOCK` and `PBEXPORT`: a stretch or move with Enter at `dy <0>` is refused; `PBEXPORT` stops at `kind <symbol>` |
| P4 | Medium | `PBEXPORT` (once P1 is fixed) **loses text alignment and width factor**: a centred 10 mm label moves 21.7 mm right and 5 mm up when the item is placed |
| P5 | Medium | `PBEXPORT` **ignores the block's base point**: a block whose base point is at 20, 10 comes back shifted by 20, 10 from where it is placed |
| P6 | Low | `PBEXPORT` drops ellipses, splines, hatches and multiline text (and says how many) and drops polyline widths (and does not say so) |
| P7 | Low | The item validator **throws instead of refusing** on some malformed `dynamic` sections and on an entity type of `__proto__` (147 of 3,000 mutated files) |
| P8 | Low | Three blocks (both doors, the flange) give different last bits in Node and Chromium |

## 2. Architecture (read and confirmed)

| Piece | Lines | What it is |
|---|---|---|
| `paramblock.js` | 390 | the shared library: "canonical copy in `lib/paramblock/`; the apps carry byte-identical copies". DOM-free; imports only `expr.js` (the shared expression language, never `eval`). Value sets (`min`, `max`, `step`, `list`), actions (`stretch`, `move`, `rotate`, `scale`, `mirror`, `array`, `polar`, `set`, `label`, `show`, each with optional `keys` and `when`), grips (`linear`, `angle`, `flip`, `list`), size tables, and `k` (drawing units per parameter unit: an item is in millimetres). The host supplies the geometry operations (`ops`), so the library knows no host's object model. Limits `PB_LIMITS` (400 actions, 40 grips, 2,000 copies, 200,000 objects out, 400-character formulas) |
| `blockparams.js` | 587 | CadCraft's host: a block's `bp` (parameters, visibility states, and the parametric lists), `bpParts(block, ref)` — the one place a reference becomes objects, used for drawing, picking, bounds and explode — and `BP_OPS` |
| `blockparams-cmd.js`, `paramblock-cmd.js` | 93, 212 | `BPARAMS` (parameters, visibility); `PBLOCK` (actions, grips, tables, value sets); `PBEXPORT` (`itemFromParamBlock` → a `cadcraft-library-item` with `dynamic`) |
| `libitem.js` | 2,656 | the Library item format; `dynamic` is `cadcraft-parametric-block` version 1; `validateItem` (a PHP twin, `LibraryItemFormat::dynamic`, checks it on the server) |
| `libplace.js` | 300 | `blockFromItem`: an item's plan becomes a block (base 0, 0), each object keyed by its plan index, `bp` cleaned with `k` = 1 / (mm per drawing unit) |
| `libpanel.js` | 688 | the Parametric tab: the online collection `cadcraft-parametric-blocks` when published, else the copy that ships with the app (`paramblocks/starter.json`); every item checked before it is shown |

The design is sound: one shared engine, the host's geometry handed in, formulas that cannot run code, every untrusted input
cleaned with limits, and one function (`bpParts`) through which every part of the program sees a reference.

## 3. What works (measured)

| Area | Checks | Result |
|---|---|---|
| The 20 blocks at their defaults; every allowed value of every parameter (13 points across each range, every list value); the inch drawing equal to the millimetre one ÷ 25.4 | part of 2,014 | all pass |
| Illegal values (below min, above max, off-step, not in the list, `1/0`, `abc`, `1e400`, `NaN`) | part of 2,014 | all refused through `refSetValue` |
| Values forged straight into a reference (`1e300`, `-1e300`, `-1`, `999999999`, `1/0`) | part of 2,014 | geometry stays finite, nothing throws |
| Every grip dragged to ±10 km, onto itself and to the origin | part of 2,014 | the value always lands inside its set |
| Flips twice; every size-table row set and read back | part of 2,014 | pass |
| Hostile definitions: an array of 10⁹, 2,000 × 2,000 rows, a polar array of 10⁶, ten chained arrays (10¹⁰ copies), 10,000 actions, a 100,000-character formula, 5,000 nested brackets, division by zero, unknown actions | 11 | bounded: refused with a reported problem, or capped exactly at 200,000 objects (0.39 s) / 400 actions; never throws |
| Formulas, unit suffixes (`mm`, `in`), a parameter defined by itself, two defined by each other | 302 | pass; loops refused |
| **Save and reopen:** DXF R12, DXF 2000, binary DXF 2000, DWG 2000 / 2010 / 2018; mm and inch drawings; 40 references each (every block at its defaults, and moved, rotated and at other values) | 480 | **480 / 480**: still parametric, no value lost, same geometry (compared field by field; the only differences were a default `wf: 1` added on read and key order) |
| `BPARAMS` and `PBLOCK` typed at the command line (a parameter, a stretch, a value set `50..500 step 10`, a linear grip) | 6 | the expected definition each time; W = 230 stretches the plate to 230 × 50; 235, 40 and 510 refused |
| A grip dragged 57 mm along its arrow on references rotated, mirrored (`sx = −1`) and scaled (×2, ×1.5 mirrored) | 10 | W = 160 every time (157 to the 10 mm step); the grip lands within the step of where it was dropped |
| EXPLODE | 1 | gives the reference's current shape (3000 wide), not the default |
| Undo / redo of a value change | 1 | one step each way |
| Paste within the same drawing | 1 | keeps the parametric block and the reference's size |
| Every block with every parameter at its maximum (and minimum) at once | 40 | finite; slowest 1.2 ms; most objects 902 (the base plate's hole pattern) |
| 3,000 mutated Library item files through validation, placing, grips and the clipboard | 3,000 | 2,115 refused, 738 placed with finite geometry, none slow, no prototype pollution; 147 threw (P7) |
| Node against Chromium: every block's exploded geometry, at its defaults and at its largest values, rotated | 20 | 17 bit-identical (P8) |

## 4. Findings in detail

### P1 — `PBEXPORT` cannot produce a valid item (High)
`itemFromParamBlock` (`paramblock-cmd.js:166–191`) builds the item with `format`, `name`, `kind`, `category`, `plan`, `params`,
`dynamic` … but no `ifc`. `validateItem(item, { partial: true })` then fails with *"ifc: is required: every item placed in a drawing
or model names its IFC class"*, and the command prints `pb.export.problems` and writes nothing.

- Reproduced on an authored block, and on **every one of the 20 shipped blocks** placed and exported again: 20 of 20 refused.
- With `ifc` added (the source items carry it: `IfcFurniture`, `IfcAnnotation`, …), **all 20 re-export and place back identical**.
- *Fix:* write `ifc` — the source item's when the block came from the Library (its fields are on the block), else from the
  chosen kind (the validator also requires `IfcDoor` for a door and `IfcWindow` for a window; `IfcAnnotation` for a symbol or
  detail), or ask for it.

### P2 — Parameters lost on paste into another drawing and on INSERT from a file (High)
`blockcopy.js:104` (`applyCopy`) redefines each copied block as `{ name, base, entities, attdefs }`, and the clipboard format
(`clipboard.js`) never mentions `bp`. So:

| Path | Block arrives parametric | Reference keeps its shape |
|---|---|---|
| copy → paste into another mm drawing (in memory, and through the clipboard text) | no | **no**: 3000 × 750 becomes 1500 × 750 (the reference keeps `vals: { Width: "3000" }`, but its block no longer acts on it) |
| copy → paste into an inch drawing | no | no |
| INSERT a block from another drawing's DXF | no | — |
| paste within the same drawing (the block already exists) | yes | yes |

*Fix:* carry `bp` through `makeClip` / `readClip` (cleaned with `cleanBp`) and through `applyCopy`; when the two drawings'
units differ, scale `k` with the geometry (`planCopy` already computes the scale).

Observation, not counted as a defect: a paste from a millimetre drawing into an inch drawing does not convert units at all
(the pasted table is 1500 *inches* wide); `planCopy` computes the scale and a note, `pasteClip` does not apply it. Whether that
is intended is the developers' call.

### P3 — Enter does not take a shown default (Medium)
The command engine resolves an empty answer at a text prompt as `''` (`commands.js:168`), even though the prompt shows
`<default>`; established commands treat `''` as "keep" themselves (HATCH: `if (!v) break`). The new commands' helper
`ask = async (key, d) => String((await c.string(t(key), …)) || '').trim()` (`paramblock-cmd.js:43`, `blockparams-cmd.js:33`) never
falls back to `d`. Measured through the engine:

- `PBLOCK` → Stretch → Enter at `pb.ask.dy <0>`: no action, `blockparams.say.error`;
- `PBLOCK` → Move → Enter at `dx <0>` and `dy <0>`: no action;
- `PBEXPORT` → Enter at `kind <symbol>`: `pb.export.badkind` (and the same would follow at `category <symbols/annotation>`).

*Fix:* `return v || (d ?? '')` in both helpers, and the same for `PBEXPORT`'s own prompts.

### P4 — Text alignment and width factor lost on export (Medium)
`planEntity` writes text as `{ x, y, h, rot, value }` (`paramblock-cmd.js:159`); alignment (`ha`, `va`) and width factor (`wf`) are
dropped, so placed text is left/baseline at the old insertion point. A 10 mm label:

| Alignment | Moves when placed from the exported item |
|---|---|
| centre / middle | 21.7 mm right, 5.0 mm up |
| right / bottom | 43.4 mm right |
| left / top | 10.0 mm up |

*Fix:* write the alignment (and width factor) if the item format holds them; otherwise move the insertion point so a
left/baseline text sits where the aligned one did.

### P5 — The base point is ignored on export (Medium)
`blockFromItem` gives every Library block the base 0, 0; `itemFromParamBlock` writes the block's coordinates without
subtracting the block's own base point. A block with base 20, 10 and objects from 20, 10 to 120, 60 comes back with its
objects at 20, 10 … 120, 60 *from its insertion point*: shifted by the base. *Fix:* subtract `blk.base` from every coordinate,
and from the numbers in the actions and grips (frames, centres, grip positions are formulas over the block's coordinates;
the simplest exact form is to write them as `(<formula>) - base`).

### P6 — Object kinds and widths dropped on export (Low)
`planEntity` converts lines, circles, arcs, polylines, texts and points only. Ellipses, splines, hatches and multiline text are
dropped and counted (`pb.export.done.skipped`); polyline widths are dropped without a count. Layers and colours are kept.

### P7 — The validator throws on malformed items (Low)
3,000 mutations of the shipped items (values replaced by `null`, `NaN`, `±Infinity`, huge numbers, strings, `__proto__`, empty
and nested arrays): 147 make `validateItem` throw instead of returning errors.

- `libitem.js:823`: `if (a && 'key' in a)` throws when an action is a number, a string or `true` (137 cases). *Fix:*
  `a && typeof a === 'object' && 'key' in a`.
- `libitem.js:961`: `ENTITY_KEYS[e.type]` with `e.type = '__proto__'` returns `Object.prototype`, and the next line spreads it
  ("want is not iterable", 10 cases). *Fix:* `Object.hasOwn(ENTITY_KEYS, e.type)`.

The Library panel's online path catches errors per item (a bad shared item is dropped); a file opened through Library › Files,
or a damaged `starter.json`, goes through `problemOf` without that guard. No mutation polluted a prototype or ran slowly, and
every item that passed validation placed with finite geometry.

### P8 — Last bits differ between JavaScript engines (Low)
Every block's exploded geometry, at its defaults and at its largest values, placed rotated, hashed in Node 22 and Chromium 158:
17 of 20 identical. The single door, double door and round flange differ in the last bits (their swing arcs, rotations and
polar array use `Math.sin` / `Math.cos`, which ECMAScript leaves implementation-approximated). Effect: the same drawing saved on
two machines can differ in the last bits; nothing a person would see.

## 5. Against the PB.1 session's own report

| Its claim | Here |
|---|---|
| the 20 blocks, grips, sizes held to steps and limits | confirmed (§ 3) |
| Properties › Custom: values typed as numbers or formulas, disallowed values refused | confirmed at the function the panel calls (`refSetValue`); the panel itself not driven |
| BPARAMS + PBLOCK make a block from scratch | confirmed through the command engine, **with every value typed** — Enter at a default fails (P3) |
| PBEXPORT writes a Library item file | **not confirmed: every export is refused** (P1); its click-through list did not include PBEXPORT |
| save and reopen through DXF (both kinds) and DWG 2000, 2010, 2018 | confirmed, and binary DXF 2000 too (480 / 480) |
| no hand check by a person yet | still true: no UI was driven here either |

## 6. Not tested

- The UI: the Library panel, on-screen grip drags, the Properties panel, the block editor's object selection in `PBLOCK`.
- How other CAD programs read the DWG files' parametric data (no DWG oracle here).
- The server's twin validator (`LibraryItemFormat::dynamic`).
- Firefox and WebKit.
- The BimCraft DXF failures mentioned in the PB.1 report.

## 7. A note from engine.solid (only where it already solves the problem)

P8 is the one finding engine.solid has solved for itself: its elementary functions are built from + − × ÷ and √ only and give
the same bits in Node and in Chromium (checked on every release in 22 hashed areas). The same approach applied to
`paramblock.js`'s rotations, arcs and polar arrays would make P8 go away; it is low priority for 2D drafting.

## 8. Reproducing

`docs/reviews/parametric-blocks-tests/README.md`: mirror the lab build's modules with `crawl-cad.py`, fetch `starter.json`, run
the scripts with Node 22.
