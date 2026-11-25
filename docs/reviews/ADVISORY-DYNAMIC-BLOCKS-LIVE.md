# Advisory: keeping a ZWCAD-style dynamic block live in CadCraft

**For:** whoever builds DWG dynamic-block support in CadCraft. That covers three areas:

- cc-dwg: `dwg/dynblock-read.js`
- the importer: `dwg-import.js`, `dyn-blocks.js`
- parametric blocks (PB.1): `lib/paramblock/paramblock.js`, `blockparams.js`

**Sample:** `Front_Parametryczny_03.dwg`, the user's parametric cabinet front.

- **Format:** DWG 2018.
- **Saved by:** an ODA-based program; its AppInfo names Teigha .NET.
- **Where to get it:** it is not in the repository. Ask the user for it.

**Where it was tested:** the CadCraft lab build's own code.

- `/lab/cadcraft` is a sign-in gate (`302` → `/login`) around the CadCraft `dev` build at `/assets/apps/cadcraft/dev/`. The site's code describes it as "a signed-in person who may open that app's lab build (staff, lab access, or an active lab pass for its dev build)".
- That build is CadCraft 0.12 with PB.1. Its `cadcraft.js` was last modified 2026-11-24 19:38:38 GMT.
- On 2026-11-25 the 13 modules these tests load were byte-identical to what is served.
- I ran them in Node 22, with Chromium (Playwright) for the cross-engine check and the picture.
- The lab pass works through the site's sign-in, which I can't do from here. So the lab's browser shell itself was not driven; its code was.

**Status:** advisory only. Nothing here is a pull request. Each claim is marked as one of:

- **measured:** run against that build
- **observed:** read from the file's bits, one sample
- **inferred**
- **unknown**

**Rule that applies throughout:** cc-dwg finds its layouts by experiment and has never read LibreDWG's source (the `dynblock-read.js` header). Everything in §§ 2–4 was found the same way, on this one file. Confirm it on more samples before relying on it.

---

## 0. Summary

- **Yes, CadCraft can keep this drawing live.** I translated its dynamic definition into a PB.1 block (§ 7). The real engine then gives back every behaviour the file has:
  - its 8 front types
  - Width and Height
  - four gaps
  - the hinge marker
  - the flap centre
  - the flip
  - a movable label
  - grips
  
  Every action moves exactly the vertices the file stores for it, 48 of 48. The block survives saving and reopening in DXF 2000 and DWG 2000, 2010 and 2018, and it evaluates to the same bits in Node and Chromium.
- **Today CadCraft destroys this drawing's dynamic data** (§ 6, **measured**).
  - **Open and save:** this alone, in any DWG version or DXF, silently deletes the dynamic definition (81 objects) and 17 of the 30 objects.
  - **INSERT › File:** it puts the front 236.8 km east and 74.4 km north of the pick point.
  
  Both fixes are small and should come first.
- **The file's structure is now almost entirely read** (§§ 2–4, **observed**). By share of data bits:
  - the evaluation graph's nodes and edges: 100 %
  - the visibility parameter: 100 %, after one change to cc-dwg's layout for this writer's "release 33" objects
  - the stretch actions' frames and vertex lists: 99 %
  - all 81 dynamic-block objects together: 88 %
  
  § 5 lists what is known and what isn't.
- **PB.1 needs nine small things** (§ 8). Among them:
  - attributes that follow actions
  - stretching by stored vertex lists
  - an XY grip
  - grips that belong to one state
  - display labels in Polish
  - a fix for a visibility list that accepts picks and ignores them
- **Tests:** 47 of 49 checks pass. Both failures are real product findings: the DXF layer-name bug and PB.1 gap G9.

| Suite | Checks | Pass | What it covers |
|---|---|---|---|
| `t-dyn-decode` | 3 | 3 | visibility exact; 48 of 48 vertex lists; graph exact |
| `t-dyn-live` | 33 | 32 | the live block: states, sizes, gaps, dimensions, hatches, flip, label, grips, 320 random settings, save and reopen. The failure is the DXF layer-name bug. Also 3 GAP notes. |
| `t-dyn-more` | 9 | 9 | undo/redo, explode, copy and paste, height/flip/list grips, 0.22 ms per evaluation, 16 references through DWG 2018 and DXF 2000 |
| `t-dyn-visgrip` | 3 | 2 | the visibility list grip; the failure is PB.1 G9, on purpose |
| `bh-dyn` Node ↔ Chromium | 1 | 1 | 57 settings, 16,893 numbers, 0 differ |
| `t-dyn-today` | – | – | the current behaviour (§ 6) |

![The live block drawn by CadCraft's plotter at 16 settings](dynamic-blocks-tests/front-live-sheet.png)

*The translated block at 16 settings, drawn by CadCraft's own plotter (`plot.js`: `modelSheet` → `displayList` → `toSvg`). Every layer is printed; three of the file's layers are screen-only. Rows 1–2: the 8 front types. Row 3: Width 400 and 900, Height 500 and 1200. Row 4: gaps of 30, 10, 30 and 10 mm; the flip; the flap with its centre at 150; the right door with the marker at 250. In the flipped front (14), the number sits outside the front: gap G1.*

---

## 1. The drawing at a glance

It is a cabinet front for elevations, 600 × 860 mm.

- The front panel is set in 2 mm on every side ("luzy", gaps).
- The panel has a pale solid hatch and dimensions of its size and of each gap.
- A ⌀100 circle carries the `NUMER` attribute (the front's number).

The front changes with:

- **Width, Height:** the outline, with the panel keeping its gaps.
- **The four gaps:** the panel's edges.
- **Odległość3:** the height of the hinge marker on a door, default 430.
- **Środek Klapy:** where a flap's apex sits, default 300.
- **A flip:** a mirror image about the left edge.
- **A movable label:** in one state.
- **Eight front types**, as visibility states:
  1. front
  2. right door
  3. drawer
  4. flap
  5. blind
  6. inner
  7. sliding
  8. blind with label

The drawing's model space *is* the block definition. That is how a dynamic block is kept as one file per block (block editor "current drawing", or WBLOCK). Inserting the file is how it is used.

---

## 2. Form: how the file holds the dynamic block (observed)

### 2.1 File

| Item | Value |
|---|---|
| Version | AC1032 (DWG 2018), maintenance 4 |
| Writer | AppInfo: "Open Design Alliance DWG … last saved by an ODA application", product "Teigha(R) .NET for .dwg files" |
| Code page | 45 ("CNT"). cc-dwg notes it reads it as ANSI_1252. R2018 strings are UTF-16, so no text was affected. |
| Units | `INSUNITS` 4 (mm), `MEASUREMENT` 1, `LUNITS` 2, `LUPREC` 4 |
| `INSBASE` | (0, 0, 0). The front sits at (236788.0944, 74432.2456): real-world coordinates. |
| `EXTMIN` / `EXTMAX` | (−8516.2, −2549.1) / (260715.0, 81521.2). Stale: far larger than the front. |
| Other objects | 3 materials, a visual style, 33 scales, the usual dictionaries, 3 XRECORDs (§ 2.10), 3 DIMASSOC, 1 SORTENTSTABLE |
| Layers | `0`; `Defpoints` (no plot); `Mebel`; `Korpusy + półki + front` (colour 8); `TEKST + Strzałki`; and three screen-only layers (no plot): `Dodatkowe Niewidoczne` (203), `Fronty - Niewidoczne` (131), `Fronty - Wymiary` (131) |
| Styles | dimension style "Parametryczny my ISO-12.5"; text style "Standard"; the MTEXT use Arial |

### 2.2 The model space record

**Extended data:**

| Application | Value | Meaning |
|---|---|---|
| `AcDbDynamicBlockGUID` | `{7FAF46B6-A833-4F25-925B-45B7E029D3E5}` | the definition's identity |
| `AcDbDynamicBlockTrueName` | `Front_Parametryczny_02` | the block's own name (the file is `_03`) |
| `AcDbBlockRepETag` | 1070 = 1, 1071 = 31 | the next free entity tag; entities carry 0–30 (§ 2.10) |
| `ACAUTHENVIRON` | 1005 = "0" | the block-authoring marker |

**Extension dictionary** `3`:

- `ACAD_ENHANCEDBLOCK` → `4` (the evaluation graph, `ACAD_EVALUATION_GRAPH`)
- `ACAD_SORTENTS` → `139`

cc-dwg already finds the graph this way (`readDynamic`, `dynblock-read.js:156`) and sets `*Model_Space.dynamic`.

### 2.3 Entities: 30 in model space

- **13 drawn** in the saved state (state 1).
- **16 hidden** (the entity's invisible flag): they belong to the other states.
- **1 attribute definition:** `NUMER`, prompt `123`, default `0`.

Every entity carries `AcDbBlockRepETag` (1070 1, 1071 *tag*, 1005 *own handle*), with tags 0–30 and 28 unused. Appendix A lists each entity with its layer, tag, states, the actions that stretch it (with vertex indices), and its associations.

### 2.4 Dynamic-block objects: 81

| Type | Count | Role |
|---|---|---|
| `ACAD_EVALUATION_GRAPH` | 1 | the network: 80 nodes, 74 edges (§ 2.8) |
| `BLOCKLINEARPARAMETER` | 8 | height, width, hinge marker, four gaps, flap centre |
| `BLOCKFLIPPARAMETER` | 1 | the flip |
| `BLOCKVISIBILITYPARAMETER` | 1 | the 8 states |
| `BLOCKPOINTPARAMETER` | 1 | the label's position |
| `BLOCKBASEPOINTPARAMETER` | 1 | the insertion point |
| `BLOCKSTRETCHACTION` | 8 | one per linear parameter |
| `BLOCKFLIPACTION` | 1 | |
| `BLOCKMOVEACTION` | 1 | |
| `BLOCKLINEARGRIP` | 16 | two per linear parameter |
| `BLOCKFLIPGRIP`, `BLOCKVISIBILITYGRIP`, `BLOCKXYGRIP` | 1 each | |
| `BLOCKGRIPLOCATIONCOMPONENT` | 39 | each ties one grip coordinate to its parameter |

Appendix B lists every object with its handle, node, strings and points.

### 2.5 Parameters

Points are measured from the base point, in mm.

| Parameter | Kind | Label (description) | Value | Points |
|---|---|---|---|---|
| Liniowy | linear | Wysokość (height) | 860 | base (0, 860) → end (0, 0) |
| Liniowy1 | linear | Szerokość (width) | 600 | base (0, 0) → end (600, 0) |
| Liniowy2 | linear | Odległość3 (hinge-marker height) | 430 | base (600, 0) → end (600, 430) |
| Liniowy3 | linear | F. Góra Luz ("Ustawienie luzu na froncie na górze.") | 2 | base (497, 858) → end (497, 860) |
| Liniowy4 | linear | F. Prawa Luz ("… po prawej.") | 2 | base (598, 757) → end (600, 757) |
| Liniowy5 | linear | F. Lewa Luz ("… po lewej.") | 2 | base (2, 103) → end (0, 103) |
| Liniowy6 | linear | F. Dół Luz ("… na dole.") | 2 | base (103, 2) → end (103, 0) |
| Liniowy7 | linear | Środek Klapy frontua (flap centre) | 300 | base (0, 860) → end (300, 860) |
| Odwracania | flip | Stan odwrócenia1: Nieodwrócony / Odwrócony | – | reflection line (0, 185.491) → (0, −674.509); a third point (0, −577.027) |
| Punktowy | point | Położenie1 | – | (300, 430) |
| Punkt bazowy | base point | – | – | (0, 0), three times |
| Stan widoczności | visibility | Widoczność1 | – | grip at (0, −430) |

No parameter carries a value set (minimum, maximum, increment or list) that I could find.

### 2.6 Grips and grip-location components

| Grip | Parameter | Position | | Grip | Parameter | Position |
|---|---|---|---|---|---|---|
| base | Wysokość | (0, 860) | | base | F. Góra Luz | (497, 858) |
| end | Wysokość | (0, 0) | | end | F. Góra Luz | (497, 860) |
| base | Szerokość | (0, 0) | | base | F. Prawa Luz | (598, 757) |
| end | Szerokość | (600, 0) | | end | F. Prawa Luz | (600, 757) |
| base | Odległość3 | (600, 0) | | base | F. Lewa Luz | (2, 103) |
| end | Odległość3 | (600, 430) | | end | F. Lewa Luz | (0, 103) |
| flip | Odwracania | (0, −100) | | base | F. Dół Luz | (103, 2) |
| visibility | Stan widoczności | (0, −430) | | end | F. Dół Luz | (103, 0) |
| XY | Punktowy | (300, 430) | | base / end | Środek Klapy | (0, 860) / (300, 860) |

**Components (39):**

- Each linear grip has an X and a Y component, named `UpdatedBaseX` and so on, which gives 32.
- The flip grip has `UpdatedFlip`, `UpdatedBaseX` and `UpdatedBaseY`.
- The visibility and XY grips have `UpdatedX` and `UpdatedY` each.

Each component names its own node and its parameter's node (§ 3.3).

### 2.7 Actions

The frame is the file's stretch frame, two corners measured from the base point.

| Action | Kind | Input (moving point) | Selected | Stretched entities | Frame | Dependents (carried along) |
|---|---|---|---|---|---|---|
| Wysokość | stretch | Liniowy (base) | 25 (15 entities) | 14 | (−147.0, 592.0) – (842.9, 1134.2) | Liniowy7, Środek Klapy action, Odwracania, Liniowy3, Liniowy4 |
| Szerokość | stretch | Liniowy1 (end) | 24 (21 entities) | 20 | (432.6, −299.8) – (892.4, 1068.4) | Liniowy4, Liniowy3, Liniowy2 |
| Rozciągania2 | stretch | Liniowy2 (end) | 8 | 8 | (−117.7, 294.3) – (669.8, 628.5) | – |
| Środek Klapy frontua | stretch | Liniowy7 (end) | 1 | 1 | (218.0, 785.0) – (365.4, 920.5) | – |
| F. Góra Luz | stretch | Liniowy3 (base) | 6 | 5 | (0.8, 856.1) – (599.4, 859.2) | – |
| F. Prawa Luz | stretch | Liniowy4 (base) | 7 | 5 | (592.1, 0.6) – (599.1, 858.9) | – |
| F. Lewa Luz | stretch | Liniowy5 (base) | 6 | 5 | (0.7, 1.1) – (4.3, 858.9) | – |
| F. Dół Luz | stretch | Liniowy6 (base) | 7 | 6 | (0.6, 0.9) – (599.2, 4.7) | – |
| Odwracania1 | flip | Odwracania | 49 (29 entities, every one but the label, ATTDEF included) | – | – | 12: every other parameter and the four gap actions |
| Przesuwania | move | Punktowy | 2 (the "Ślepy Front" label and the XY grip) | – | – | – |

- Each stretch also stores a distance multiplier of 1 and an angle offset of 0 (**inferred** meaning).
- Each action has a display point, where its icon sits in the block editor. Eight of them lie to the right of the front, at x 976–2404 mm from the base point. Those of the move and flap actions lie about 185 km and 122 km away (**unknown**).

### 2.8 The evaluation graph

- **80 nodes:** every dynamic-block object but the graph itself, with node ids 1–87.
- **74 edges**, of three kinds:

| Kind | Count | From → to | Reading (inferred) |
|---|---|---|---|
| 2 | 16 | linear grip → linear parameter | a grip drives its parameter |
| 2 | 8 | linear parameter → stretch | a parameter drives its action |
| 2 | 1 | point parameter → move | |
| 2 | 1 | XY grip → point parameter | |
| 4 | 1 | flip parameter → flip action | |
| 1 | 32 | linear parameter → grip component | a parameter positions its grips |
| 1 | 7 | flip, visibility and point parameters → their components | |
| 1 | 2 | flip grip → flip; visibility grip → visibility | |
| 1 | 1 | the height stretch → the flap stretch | evaluation order: the earlier action carries the later one's points |
| 1 | 5 | the flip action → the four gap stretches and the base point | |

Each node's four edge fields are exactly [first incoming, last incoming, first outgoing, last outgoing] edge, for all 80 nodes. Appendix C lists all 74 edges.

### 2.9 The visibility states

Each state lists the objects it shows and its **elements**: the parameters, grips and actions present in that state. Appendix D gives the full lists.

| # | State | Objects | Elements | Present besides height, width and flip |
|---|---|---|---|---|
| 1 | Front (+luzy) | 13 | 31 | hinge marker; four gaps with their grips |
| 2 | 0 Front Prawy (+luzy) | 13 | 31 | the same |
| 3 | 0 Front Szuflada (+luzy) | 14 | 31 | the same |
| 4 | 0 Front Klapowy (+luzy) | 13 | 35 | the same, plus the flap centre (parameter, two grips, action) |
| 5 | 0 Ślepy Front (+luzy) | 12 | 31 | hinge marker; four gaps with their grips |
| 6 | Front Wewnętrzny | 4 | 15 | hinge marker |
| 7 | Front Przesuwny | 10 | 15 | hinge marker |
| 8 | Front Ślepy (+luzy) | 16 | 25 | see below |

State 8 is a special case. It has:

- the four gap parameters and actions, but not their grips
- the hinge marker's grips and action, but not its parameter
- the point parameter, the XY grip and the move action

### 2.10 Associations

- **Associative hatches:** `EB` (the panel) follows polyline `EF`, and `135` (state 8) follows `136`. cc-dwg reads these as `loops[].boundary`. No action lists either hatch in its vertex lists.
- **DIMASSOC:**
  - `F2` ties dimension `F0` to `EF`.
  - `10E` ties dimension `10C` to `EF` and `E6`.
  - `122` ties dimension `120` to `EF`.
  - `EF`'s reactors name them and the hatch.
- **XRECORDs:**
  - `EE` and `FF`: `[290, 0]`.
  - `13B`: `[90, 1], [330, AD]`.
  
  None relates to the dynamic block.
- **Representation tags:** they map each entity of a reference's evaluated copy back to the definition. They are unused here, since the file has no references.

---

## 3. Bit layouts (observed)

Positions are bits in an object's data stream. Strings come from the R2007+ string stream. "BL ×n" means n BL values.

### 3.1 Element header

Every parameter, grip and action starts with:

1. BL −1
2. BL release: **33** here, 27 in cc-dwg's samples
3. BL maintenance: 248
4. BL serial
5. the name, as the first string

This is exactly as cc-dwg's `header()` reads it (`dynblock-read.js:61`).

- **The release field:** it switches the visibility layout (§ 3.4). Release 33 is probably the 2018 object format (**inferred**).
- **The serial:** its low 16 bits are constant (`0xD8F1`), and its high bits count up object by object (**observed**; meaning **unknown**, not needed).

### 3.2 Evaluation graph

1. BL 91, BL 91 (**unknown**)
2. BL node count, then per node: BL handle index · BL flags (32) · BL node id · BL ×4 [first in, last in, first out, last out]
3. BL edge count (74), BL −1
4. Per edge: BL id · BL 0 · BL kind · BL from-node index · BL to-node index · BL ×4 list links · BL −1. Edge 0 has no `0` field.

The graph ends on its last bit. cc-dwg reads the nodes (`graphNodes`) but not yet the edges.

### 3.3 Grip-location component

BL −1 · BL 33 · BL 248 · BL kind (40 a coordinate, 70 the flip) · BL 0 · BL own node · BL parameter node

23 of the 39 end on their last bit. The 16 `UpdatedEnd…` ones carry 64 more bits (**unknown**).

### 3.4 Visibility parameter

1. header
2. **18 bits** (cc-dwg's release-27 layout, `B B BS×4`, does not parse here; read as `B B B B BS BS BS`, which lands on the next field; values **unknown**)
3. BD3 grip point (bit 106)
4. BS · BS · BL grip node (33) · label · description · B · B
5. BL 29 + 29 handles (every entity but the attribute)
6. BL 8 states, each: name · BL objects + handles · BL elements + handles

This ends on the last bit (436) and uses all 338 handles: cc-dwg's own acceptance test. Given those states, the existing importer builds all 8 into `dyn.vis` unchanged.

### 3.5 Parameters and grips

- **Linear parameter:**
  - BD3 base at bit 114, BD3 end at 248.
  - Strings: name · `DisplacementX` · `DisplacementY` · `DisplacementX` · `DisplacementY` · label · description if any.
  - The rest of its 572 bits is **unknown**, including any value set.
- **Flip parameter:** BD3 at 106 and 240 (the reflection line) and 400 (**unknown** role). Strings: name · label · ∅ · the two state names · `UpdatedFlip`.
- **Point parameter:** BD3 at 106. A second BD3 at 290 is far off the drawing (**unknown**).
- **Base-point parameter:** BD3 at 106, 246 and 380, all equal.
- **Grips:** BD3 position at bit 124. The rest is **unknown**.

### 3.6 Actions

After the header and a BD3 display point (to bit 238):

- BL selected count
- BL dependent count
- BL dependent node × that count
- BL input node × 2

The handle stream holds the selected objects (that count) first, then the stretched entities.

**Stretch:**

1. BL 2
2. RD x · RD y × 2: the frame's corners, raw doubles with no BD code
3. BL entity count
4. per entity: BL k · BL vertex index × k
5. BL 0 · BD 1 · BD 0 (multiplier and angle offset, **inferred**)
6. 8 bits (**unknown**)

**Check (measured):** for all 48 polyline and line entries, the stored frame selects exactly the stored vertex indices on CadCraft's converted objects. That confirms the frame, the lists, and that CadCraft's converter keeps vertex order.

Dimensions carry their own indices (0–4, their points). These are not mapped to CadCraft's `p1`/`p2`/`loc` yet.

**Move and flip:** they have selections only. The rest of their bits is **unknown**: about 4–5 %.

### 3.7 Share of data bits accounted for (measured)

| Object | Count | Average | Lowest |
|---|---|---|---|
| `ACAD_EVALUATION_GRAPH` | 1 | 100 % | 100 % |
| `BLOCKVISIBILITYPARAMETER` | 1 | 100 % | 100 % |
| `BLOCKSTRETCHACTION` | 8 | 99 % | 99 % |
| `BLOCKMOVEACTION` | 1 | 96 % | 96 % |
| `BLOCKFLIPACTION` | 1 | 95 % | 95 % |
| `BLOCKBASEPOINTPARAMETER` | 1 | 95 % | 95 % |
| `BLOCKFLIPPARAMETER` | 1 | 90 % | 90 % |
| `BLOCKPOINTPARAMETER` | 1 | 84 % | 84 % |
| `BLOCKGRIPLOCATIONCOMPONENT` | 39 | 81 % | 65 % |
| `BLOCKVISIBILITYGRIP`, `BLOCKXYGRIP` | 2 | 76 % | 76 % |
| `BLOCKLINEARPARAMETER` | 8 | 62 % | 62 % |
| `BLOCKLINEARGRIP` | 16 | 61 % | 61 % |
| `BLOCKFLIPGRIP` | 1 | 60 % | 60 % |
| **all** | **81** | **88 %** | |

---

## 4. What the existing solution already has (code reading)

- **cc-dwg** (`dwg/dynblock-read.js`):
  - It reads the graph's nodes, each parameter's and action's kind and name, and each reference's values. The values come from `ACAD_ENHANCEDBLOCKDATA` XRECORDs: distance, flip state, point and visibility state.
  - Only the visibility parameter is decoded in full (`:20`).
  - Each layout carries a `Spec gap:` note and is accepted only when nothing is left over.
- **The importer** (`dyn-blocks.js`, DB.2–DB.9):
  - A named dynamic block keeps every file object, hidden ones too (`block.dyn.all`). It can switch and edit visibility states, and it saves back dynamic in the version it came in.
  - Distances, flips and points show read only. The help page `app/help/dynamic-blocks.md` says so in "Not there yet".
- **PB.1**:
  - It has parameters with value sets, and 10 action kinds, each with `keys` and `when`.
  - Grips are linear, angle, flip and list.
  - It has size tables and visibility states chosen by a formula.
  - Properties and grips edit it, and CadCraft's own records keep it in DXF and DWG.
- **The split.** `takesBp(blk) = !blk.dyn && !blk.xref` (`blockparams.js:46`): a block with the file's own dynamic data cannot carry PB.1 data. The two systems are exclusive today.

---

## 5. Knowns and unknowns

| What | Status | Evidence |
|---|---|---|
| Where the definition lives (model space record → `ACAD_ENHANCEDBLOCK` → graph) | observed | cc-dwg already uses it |
| Graph nodes and edges, with edge kinds | observed, exact | every bit read; 80 of 80 nodes agree with the edges |
| Visibility states, their objects and their elements | observed, exact | every bit and handle read |
| Stretch frames and vertex lists | observed, exact | 48 of 48 polyline and line entries agree |
| Action wiring (input parameter, dependents, selection) | observed | agrees with the graph's edges |
| Linear parameter points, labels and descriptions | observed | every action's moving point lies on the edge it stretches |
| Grip positions and the component → parameter links | observed | agree with the parameters' points and the graph |
| Associative hatch boundaries, DIMASSOC, entity tags, record xdata | observed | read by cc-dwg |
| What "release 33" is | inferred | probably the 2018 object format |
| The stretch's BD 1 / BD 0 | inferred | multiplier and angle offset; AutoCAD's defaults |
| Flip = mirror across the parameter's line, so the front lands left of its insertion point | inferred | the parameter's definition. Confirm in ZWCAD. |
| Insertion at the base-point parameter | inferred | Confirm in ZWCAD. |
| Other dynamic blocks from this writer fail cc-dwg's visibility decode | inferred | every object here is release 33 |
| The 18-bit visibility prefix; the linear parameter's other fields (value sets?); grips beyond position; `UpdatedEnd…` components' 64 bits; the stretch's last 8 bits | unknown | need samples that vary one property at a time |
| The serial in the element header; graph head 91, 91; node flags 32; far-off display points; the flip's third point; the point parameter's second point | unknown | not needed for evaluation |
| Value sets, look-up, XY, rotation, polar and array parameters and actions | unknown | not in this file |

---

## 6. What happens today (measured; `t-dyn-today.mjs`)

### 6.1 Read and open

- cc-dwg finds the definition: 12 parameters and 10 actions. `visibilityOf` throws `count 835907327`, so the states are unreadable.
- The importer handles dynamic definitions only for named blocks (`dwg-import.js:183`). It drops the model space's hidden objects (`dwg-import.js:530`: `if (e.invisible) return null;`).
- **Open:** 13 objects; the report says nothing about a dynamic block.

### 6.2 Open, then save unchanged: the dynamic block is destroyed, silently

| Saved as | Objects | Hidden | Dynamic definition | Dynamic-block objects | Save notes |
|---|---|---|---|---|---|
| DWG 2018 | 13 | 0 | gone | 0 of 81 | none |
| DWG 2013 | 13 | 0 | gone | 0 of 81 | none |
| DWG 2000 | 13 | 0 | gone | 0 of 81 | the usual 2000 note only |
| DXF 2000 | – | – | gone | none | none |

The file loses 17 objects (the 16 hidden ones and `NUMER`) and all of its dynamic behaviour. The help page promises "Kept dynamic", which is true for named dynamic blocks but not for a drawing that is itself a block.

### 6.3 INSERT › File puts the front 237 km away

INSERT › File (whole drawing; `commands.js:3674` → `blockcopy.js` `planCopy`/`applyCopy`) makes the block `Front_Parametryczny_03`:

- 13 static objects
- base (0, 0), from `INSBASE`

Placed at (0, 0), the front lands at x 236788.1…237388.1 and y 74432.2…75292.2. The file's own block name (`AcDbDynamicBlockTrueName`: `Front_Parametryczny_02`) is not used.

This is the same path as PB.1's open P2 remainder: INSERT from a DXF or DWG drops `drawing.bparams` (`PARAMETRIC-BLOCKS-FIXES-VERIFY.md`). Fix them together.

### 6.4 DXF 2000 breaks Polish layer names (general)

- **Writers:** `dxf2000.js:26` and `dxf.js:1623` escape non-ASCII as `\U+XXXX`.
- **Reader:** it decodes those escapes in text but not in layer names (`dxf.js:223` for the layer table, `dxf.js:622` for each object's layer).
- **Result:** `Korpusy + półki + front` reopens as `Korpusy + p\U+00F3\U+0142ki + front`. DWG keeps the name.

---

## 7. Proof: this drawing as a live PB.1 block (measured; `poc-front-pb.mjs`)

### 7.1 Translation

The existing importer does most of the work. Named like a block, the model space converts completely: 30 file objects with `dyn.all`, hidden ones and the attribute included. The translation (`poc-front-pb.mjs`) then builds:

**Parameters**

- Each linear parameter becomes a `length` parameter. Its value is the base-to-end distance, and its label and description go in `note`.
- The names are ASCII, because `expr.js:61` refuses "Szerokość": `Height`, `Width`, `MidDist`, `GapTop`, `GapRight`, `GapLeft`, `GapBottom`, `FlapCentre`.
- The flip becomes `Flip` (yes/no).
- The point becomes `MoveX` and `MoveY`.
- The state becomes `State` (count, 1–8).

**Visibility**

- One PB.1 visibility parameter with the 8 states from § 2.9, each `when` = its number and `expr: 'State'`.
- A size table **Front type** has one row per state name, each setting `State`, and the list grip opens it. A list grip on the visibility parameter itself accepts picks and ignores them while a formula drives it: G9.

**Stretch actions**

- `delta = ±(P − P₀)` along the base→end direction of the point that moves.
- `keys` = the stretched entities, plus the associative hatches bound to them.
- `when` comes from § 2.9:
  - the gaps: not in states 6 and 7
  - the flap: state 4 only
  - the hinge marker: not in state 8
- **Frames:**
  - Along the axis of travel, the frame is the file's own.
  - Across it, the frame is the file's extent widened by 10 m, so vertices an earlier action moved sideways stay inside. (Opening it to ±1e9 breaks PB.1's tolerance: G6.)
  - Height and width run first. A later frame whose moving edge they moved shifts by their delta: the top gap by the height change, the right gap by the width change.

**Other actions**

- The flip becomes `mirror` across the flip parameter's line, `when: 'Flip'`.
- The move becomes `move` by (`MoveX`, `MoveY`) on the label, `when: 'State == 8'`.

**Grips and base**

- Grips: Width, Height, Flip, and Front type (the list).
- The block's base is the base-point parameter.

### 7.2 Results

All pass (**measured**):

- **Defaults:** exactly the 13 objects CadCraft draws today.
- **States:** each of the 8 shows exactly the objects the file lists.
- **Width 800:** the outline is 800 × 860 and the panel 796 × 856, so the gaps stay.
- **Height 1000, top gap 5, left gap 3:** the panel is 595 × 993 and sits 3 mm and 5 mm in.
- **Vertex check:** every action moves exactly the stored vertices, by the parameter's change (48 of 48).
- **Dimensions:** each gap's dimension measures its new gap, and the size dimensions measure the new size.
- **Hatches:** both associative hatches keep filling their boundaries under 6 settings, a difference of 0.0 mm.
- **Random sweep:** 320 random settings across all states give finite numbers, the right objects, and panel = size − gaps.
- **Flip:** the front mirrors, also after a stretch.
- **Label:** it follows the point in state 8 and nothing else does.
- **Grips:** dragging width +100 gives 700; dragging height −140 gives 720. The flip grip flips. The list offers the 8 front types by name and picking one shows it.
- **Editing:** a value change is one undo step and redo brings it back. EXPLODE gives the pieces at the reference's values. Copy and paste into another drawing keeps the block live and the values.
- **Save and reopen:** the block reopens live, with the values of all 16 references, from DWG 2000, 2010 and 2018 and from DXF 2000. DXF matches only after decoding the layer names of § 6.4.
- **Speed:** 0.22 ms per evaluation at a new setting.
- **Same bits:** 57 settings give the same bits in Node and Chromium (16,893 numbers).

**First-attempt lesson.** My first translation inferred the frames as the smallest band around each moving edge. The file's frames showed two of them were wrong:

- The height frame reaches 268 mm below the top, so the top-right helper square moves whole.
- The hinge-marker frame takes in the upper marker lines but not the lower ones.

Decode the frames; don't infer them.

---

## 8. What PB.1 needs

| # | Gap | Evidence | Proposal |
|---|---|---|---|
| G1 | Attributes don't follow actions. `geom.js:421` `attrTexts` uses the ATTDEF's own position. | With Flip = 1 the front spans x −700…100, but `NUMER` stays at x 102. The file's flip selects the ATTDEF. | Run actions on attribute positions, treating an ATTDEF as an object with a key. |
| G2 | Stretch tests a frame on the shape as it stands. The file moves stored vertex lists. | It matches only through action order, widened frames and shifted frames. | `{ t: 'stretch', pts: [[key, [i…]]…], dx, dy }`: exact, no frames, and changes in different actions add up. |
| G3 | No XY grip. | The point parameter has one. | `{ t: 'xy', px, py }`. Two linear grips stand in for now. |
| G4 | Grips and parameters can't belong to one state. Actions can, through `when`. | Each state lists its own grips and parameters (§ 2.9). | `when` on grips, and on whether Properties shows a parameter. |
| G5 | Parameter names are ASCII only (`expr.js:61`). | "Szerokość" and "F. Góra Luz" are refused. | A display `label` (any script) for Properties and grips. |
| G6 | The frame tolerance is `1e-9 × the largest frame coordinate` (`paramblock.js:327`). | Frames open to ±1e9 gave a 1 mm tolerance and swept in points 0.9 mm outside. | Base it on the block's extent, or document it. |
| G7 | After a change, dimensions are redrawn by CadCraft's rules. | Arrows on the 2 mm gap dimensions move outside. | Cosmetic; no change needed. |
| G8 | `takesBp` makes DWG dynamic data and PB.1 exclusive (`blockparams.js:46`). | A translated block must drop `dyn`, which loses the round trip. | One block carries both: `dyn` (the file's, kept for saving while unedited) and `bp` (derived, `from: 'dwg'`, live). BEDIT edits drop `dyn`; value changes keep it. |
| G9 | A visibility parameter driven by a formula still offers its states in its list grip. A pick is accepted (`ok`) and ignored. | `t-dyn-visgrip.mjs`: picking "0 Front Klapowy" stores the state but the front stays in state 1. | Have the pick set the driving parameter (`when` value), or don't offer the list. |

---

## 9. Plan (proposal), with acceptance tests

**Stage 0: stop the losses (small; do first).**

1. Say on open that the model space is a dynamic block definition. The reader already knows.
2. Keep the hidden objects (`dwg-import.js:530`). On a same-version DWG save, while the model space is unedited, pass the record's xdata, its extension dictionary and the 81 objects through, as DB.2 does for named blocks. Otherwise warn before saving.
3. INSERT › File and the Blocks panel:
   - use the base-point parameter as the block's base
   - use `AcDbDynamicBlockTrueName` (or the file name) as its name
   - fix the P2 remainder (`drawing.bparams`) on the same path
4. Decode `\U+XXXX` in DXF layer names.

*Accept when:* this file, opened and saved as DWG 2018, rereads with 30 objects (16 hidden) and all 81 dynamic-block objects, and ZWCAD opens it as the same block (manual). INSERT at (0, 0) puts the corner at (0, 0).

**Stage 1: read (cc-dwg).**

1. The release-33 visibility prefix.
2. The graph's edges.
3. Linear, flip, point and base-point geometry and strings.
4. The grip-location components.
5. Action wiring.
6. Stretch frames and vertex lists.
7. Move and flip selections.

Use the existing method, one feature per sample, from both ZWCAD and AutoCAD (releases 33 and 27). Mark an object `undecoded` whenever bits, handles or strings are left over; never throw.

*Accept when:* every object in a sample set decodes with nothing left over, except fields documented as unknown (§ 5).

**Stage 2: make it live (translate to PB.1).**

1. A DOM-free `dyn-to-pb.js` next to `dyn-blocks.js`. It takes a definition and its converted objects and returns `{ bp, report }`. The report lists every parameter and action as translated, approximated or dropped.
2. Use it on INSERT › File, in the Blocks panel's libraries, for named dynamic blocks in an opened drawing (replacing the read-only Custom values), and when the user asks to open such a drawing as a block.
3. Each reference's decoded values (`insert.dyn.values`) become `insert.bp.vals`.
4. **Self-check every reference.** A drawing with references at non-default values carries ZWCAD's own evaluated copy of each (the anonymous block, `block.dynamicOf`, matched through the representation tags). Compare PB.1's shape with it. Where they differ, keep the file's copy, mark the reference read only, and say so.

*Accept when:* the checks in `t-dyn-live.mjs` and `t-dyn-more.mjs` pass on this file, and the self-check passes on ZWCAD drawings that hold references at non-default values in every state.

**Stage 3: write back (later).** Save references edited in CadCraft so ZWCAD opens them still dynamic at the new values: the values XRECORDs plus the evaluated anonymous copy, with the definition passed through. Until then, the save report says these references are saved as drawn.

---

## 10. To settle in ZWCAD (not testable here)

1. Does it insert this file at the base-point parameter, and under the name `Front_Parametryczny_02`?
2. Does the flip mirror the front about its left edge?
3. Do ZWCAD drawings that hold references to named dynamic blocks also write release 33 (§ 6.1)?
4. In state 8 the gap actions have no grips, and the hinge-marker action has no parameter. Is that intended?
5. What do the unknown fields in § 5 hold? Vary one property at a time and compare.

---

## 11. Files

`docs/reviews/dynamic-blocks-tests/` holds the files below. Its README explains how to rerun them; you need a mirror of the dev build and the sample DWG.

| File | What it does |
|---|---|
| `t-dyn-today.mjs` | § 6 |
| `t-dyn-decode.mjs` | §§ 2–3 with their exactness checks |
| `t-dyn-live.mjs`, `t-dyn-more.mjs`, `t-dyn-visgrip.mjs` | § 7 |
| `bh-dyn*.mjs`, `bh-dyn-chrome.cjs` | the Node ↔ Chromium bits |
| `t-dyn-coverage.mjs` | § 3.7 |
| `t-dyn-inventory.mjs` | the appendices |
| `t-dyn-sheet.mjs`, `render-sheet.cjs` | the picture |
| `poc-front-pb.mjs` | the translation |
| `lib-*.mjs` | helpers on CadCraft's own bit reader |

— Codie

---

# Appendices (generated by `t-dyn-inventory.mjs`)

Points are measured from the base point, in mm. Handles are hexadecimal.

## A. Entities

| Handle | Type | Layer | Tag | In states | Stretched by (vertex indices) | Notes |
|---|---|---|---|---|---|---|
| D1 | LWPOLYLINE | Korpusy + półki + front | 2 | 1 6 7 | Wysokość [2]; Szerokość [1]; Rozciągania2 [1] |  |
| D6 | LINE | Korpusy + półki + front | 4 | 7 | Szerokość [0,1]; Rozciągania2 [0,1] | hidden |
| D7 | LINE | Korpusy + półki + front | 5 | 7 | Szerokość [0,1]; Rozciągania2 [0,1] | hidden |
| D8 | LINE | Korpusy + półki + front | 12 | 8 | Wysokość [1]; Szerokość [1] | hidden |
| D9 | LINE | Korpusy + półki + front | 13 | 8 | Wysokość [0]; Szerokość [1] | hidden |
| DA | LWPOLYLINE | Korpusy + półki + front | 24 | 2 | Wysokość [0,3]; Szerokość [0,2,3]; Rozciągania2 [1] | hidden |
| DB | LINE | Korpusy + półki + front | 25 | 3 | Wysokość [0]; Szerokość [1] | hidden |
| DC | LINE | Korpusy + półki + front | 26 | 3 | Wysokość [1]; Szerokość [1] | hidden |
| DD | LWPOLYLINE | Korpusy + półki + front | 27 | 4 | Wysokość [1]; Szerokość [2]; Środek Klapy frontua [1] | hidden |
| DE | LWPOLYLINE | Dodatkowe Niewidoczne | 0 | 1 2 3 4 5 8 | F. Lewa Luz [0,3]; F. Dół Luz [0,1] |  |
| E1 | LWPOLYLINE | Dodatkowe Niewidoczne | 1 | 1 2 3 4 5 8 | Wysokość [0,1,2,3]; Szerokość [0,1,2,3]; F. Góra Luz [0,1]; F. Prawa Luz [0,3] |  |
| E2 | LINE | Korpusy + półki + front | 3 | 7 | Szerokość [0]; Rozciągania2 [0,1] | hidden |
| E3 | LINE | Korpusy + półki + front | 6 | 7 | Szerokość [0,1]; Rozciągania2 [0] | hidden |
| E4 | LINE | Korpusy + półki + front | 7 | 7 | Szerokość [0,1]; Rozciągania2 [1] | hidden |
| E5 | MTEXT | 0 | 8 | 7 | Rozciągania2 [0,1,2,3,4] | hidden; "Front Przesuwny" |
| E6 | LWPOLYLINE | Mebel | 9 | 1 2 3 4 5 7 8 | Wysokość [0,1]; Szerokość [1,2] |  |
| E8 | LWPOLYLINE | Korpusy + półki + front | 10 | 6 | Szerokość [0,3] | hidden |
| E9 | MTEXT | TEKST + Strzałki | 11 | 8 | — | hidden; "Ślepy Front"; not in the flip |
| EB | HATCH | Fronty - Niewidoczne | 14 | 1 2 3 4 5 | — | hatch bound to EF |
| EF | LWPOLYLINE | Fronty - Niewidoczne | 15 | 1 2 3 4 5 6 7 8 | Wysokość [0,1]; Szerokość [1,2]; F. Góra Luz [0,1]; F. Prawa Luz [1,2]; F. Lewa Luz [0,3]; F. Dół Luz [2,3] |  |
| F0 | DIMENSION_LINEAR | Dodatkowe Niewidoczne | 16 | 1 2 3 4 5 8 | F. Dół Luz [0,2] | DIMASSOC → EF |
| 103 | DIMENSION_LINEAR | Dodatkowe Niewidoczne | 17 | 1 2 3 4 5 8 | F. Lewa Luz [0,2] |  |
| 10C | DIMENSION_LINEAR | Dodatkowe Niewidoczne | 18 | 1 2 3 4 5 8 | Wysokość [0,1,2,3,4]; Szerokość [0,1,2,3,4]; F. Góra Luz [0,2] | DIMASSOC → EF, E6 |
| 117 | DIMENSION_LINEAR | Dodatkowe Niewidoczne | 19 | 1 2 3 4 5 8 | Wysokość [0,1,2,3,4]; Szerokość [0,1,2,3,4]; F. Prawa Luz [0,2] |  |
| 120 | DIMENSION_LINEAR | Fronty - Wymiary | 20 | 1 2 3 4 5 8 | Szerokość [1,3]; F. Prawa Luz [1,3]; F. Lewa Luz [0,2]; F. Dół Luz [0,1] | DIMASSOC → EF |
| 12C | DIMENSION_LINEAR | Fronty - Wymiary | 21 | 1 2 3 4 5 8 | Wysokość [1,3]; F. Góra Luz [1,3]; F. Dół Luz [0,2] |  |
| 135 | HATCH | Fronty - Niewidoczne | 22 | 8 | — | hidden; hatch bound to 136 |
| 136 | LWPOLYLINE | Fronty - Niewidoczne | 23 | 8 | Wysokość [0,1]; Szerokość [1,2]; F. Góra Luz [0,1]; F. Prawa Luz [1,2]; F. Lewa Luz [0,3]; F. Dół Luz [2,3] | hidden |
| 137 | ATTDEF | TEKST + Strzałki | 29 | always | — | tag NUMER, prompt 123 |
| 138 | CIRCLE | Dodatkowe Niewidoczne | 30 | 1 2 3 4 5 6 7 8 | — |  |

## B. Dynamic-block objects

| Handle | Node | Type | Strings | Points (from the base point) |
|---|---|---|---|---|
| 4 | — | ACAD_EVALUATION_GRAPH |  |  |
| 5 | 1 | BLOCKBASEPOINTPARAMETER | Punkt bazowy | @106 (0, 0) @246 (0, 0) @380 (0, 0) |
| 6 | 2 | BLOCKLINEARPARAMETER | Liniowy · DisplacementX · DisplacementY · DisplacementX · DisplacementY · Wysokość | @114 (0, 860) @248 (0, 0) |
| 7 | 3 | BLOCKLINEARGRIP | Uchwyt bazowego | @124 (0, 860) |
| 8 | 4 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedBaseX |  |
| 9 | 5 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedBaseY |  |
| A | 6 | BLOCKLINEARGRIP | Uchwyt końcowego | @124 (0, 0) |
| B | 7 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedEndX |  |
| C | 8 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedEndY |  |
| D | 9 | BLOCKLINEARPARAMETER | Liniowy1 · DisplacementX · DisplacementY · DisplacementX · DisplacementY · Szerokość | @114 (0, 0) @248 (600, 0) |
| E | 10 | BLOCKLINEARGRIP | Uchwyt bazowego | @124 (0, 0) |
| F | 11 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedBaseX |  |
| 10 | 12 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedBaseY |  |
| 11 | 13 | BLOCKLINEARGRIP | Uchwyt końcowego | @124 (600, 0) |
| 12 | 14 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedEndX |  |
| 13 | 15 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedEndY |  |
| 14 | 16 | BLOCKSTRETCHACTION | Wysokość · BaseXDelta · BaseYDelta | @104 (2355.14, 752.895) |
| 15 | 17 | BLOCKSTRETCHACTION | Szerokość · EndXDelta · EndYDelta | @104 (2404.019, 203.732) |
| 16 | 18 | BLOCKFLIPPARAMETER | Odwracania · Stan odwrócenia1 · ∅ · Nieodwrócony · Odwrócony · UpdatedFlip | @106 (0, 185.491) @240 (0, -674.509) @400 (0, -577.027) |
| 17 | 19 | BLOCKFLIPGRIP | Uchwyt | @124 (0, -100) |
| 18 | 20 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedFlip |  |
| 19 | 21 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedBaseX |  |
| 1A | 22 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedBaseY |  |
| 1B | 23 | BLOCKFLIPACTION | Odwracania1 · Flip · UpdatedFlip · UpdatedBase · UpdatedEnd | @104 (2370.972, 47.057) |
| 1C | 24 | BLOCKLINEARPARAMETER | Liniowy2 · DisplacementX · DisplacementY · DisplacementX · DisplacementY · Odległość3 | @114 (600, 0) @248 (600, 430) |
| 1D | 25 | BLOCKLINEARGRIP | Uchwyt bazowego | @124 (600, 0) |
| 1E | 26 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedBaseX |  |
| 1F | 27 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedBaseY |  |
| 20 | 28 | BLOCKLINEARGRIP | Uchwyt końcowego | @124 (600, 430) |
| 21 | 29 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedEndX |  |
| 22 | 30 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedEndY |  |
| 23 | 31 | BLOCKSTRETCHACTION | Rozciągania2 · EndXDelta · EndYDelta | @104 (2347.773, -133.474) |
| 24 | 32 | BLOCKVISIBILITYPARAMETER | Stan widoczności · Widoczność1 · ∅ · Front (+luzy) · 0 Front Prawy (+luzy) · 0 Front Szuflada (+luzy) · 0 Front Klapowy (+luzy) · 0 Ślepy Front (+luzy) · Front Wewnętrzny · Front Przesuwny · Front Ślepy (+luzy) | @106 (0, -430) |
| 25 | 33 | BLOCKVISIBILITYGRIP | Uchwyt | @124 (0, -430) |
| 26 | 34 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedX |  |
| 27 | 35 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedY |  |
| 28 | 37 | BLOCKPOINTPARAMETER | Punktowy · DisplacementX · DisplacementY · Położenie1 | @106 (300, 430) @290 (-176731.897, -55114.279) |
| 29 | 38 | BLOCKXYGRIP | Uchwyt | @124 (300, 430) |
| 2A | 39 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedX |  |
| 2B | 40 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedY |  |
| 2C | 42 | BLOCKMOVEACTION | Przesuwania · XDelta · YDelta | @104 (-176252.227, -55468.429) |
| 2D | 47 | BLOCKLINEARPARAMETER | Liniowy3 · DisplacementX · DisplacementY · DisplacementX · DisplacementY · F. Góra Luz · Ustawienie luzu na froncie na górze. | @114 (497, 858) @248 (497, 860) |
| 2E | 48 | BLOCKLINEARGRIP | Uchwyt bazowego | @124 (497, 858) |
| 2F | 49 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedBaseX |  |
| 30 | 50 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedBaseY |  |
| 31 | 51 | BLOCKLINEARGRIP | Uchwyt końcowego | @124 (497, 860) |
| 32 | 52 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedEndX |  |
| 33 | 53 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedEndY |  |
| 34 | 54 | BLOCKLINEARPARAMETER | Liniowy4 · DisplacementX · DisplacementY · DisplacementX · DisplacementY · F. Prawa Luz · Ustawienie luzu na froncie po prawej. | @114 (598, 757) @248 (600, 757) |
| 35 | 55 | BLOCKLINEARGRIP | Uchwyt bazowego | @124 (598, 757) |
| 36 | 56 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedBaseX |  |
| 37 | 57 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedBaseY |  |
| 38 | 58 | BLOCKLINEARGRIP | Uchwyt końcowego | @124 (600, 757) |
| 39 | 59 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedEndX |  |
| 3A | 60 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedEndY |  |
| 3B | 62 | BLOCKLINEARPARAMETER | Liniowy5 · DisplacementX · DisplacementY · DisplacementX · DisplacementY · F. Lewa Luz · Ustawienie luzu na froncie po lewej. | @114 (2, 103) @248 (0, 103) |
| 3C | 63 | BLOCKLINEARGRIP | Uchwyt bazowego | @124 (2, 103) |
| 3D | 64 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedBaseX |  |
| 3E | 65 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedBaseY |  |
| 3F | 66 | BLOCKLINEARGRIP | Uchwyt końcowego | @124 (0, 103) |
| 40 | 67 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedEndX |  |
| 41 | 68 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedEndY |  |
| 42 | 69 | BLOCKLINEARPARAMETER | Liniowy6 · DisplacementX · DisplacementY · DisplacementX · DisplacementY · F. Dół Luz · Ustawienie luzu na froncie na dole. | @114 (103, 2) @248 (103, 0) |
| 43 | 70 | BLOCKLINEARGRIP | Uchwyt bazowego | @124 (103, 2) |
| 44 | 71 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedBaseX |  |
| 45 | 72 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedBaseY |  |
| 46 | 73 | BLOCKLINEARGRIP | Uchwyt końcowego | @124 (103, 0) |
| 47 | 74 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedEndX |  |
| 48 | 75 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedEndY |  |
| 49 | 76 | BLOCKSTRETCHACTION | F. Góra Luz · BaseXDelta · BaseYDelta | @104 (1893.598, 944.772) |
| 4A | 77 | BLOCKSTRETCHACTION | F. Prawa Luz · BaseXDelta · BaseYDelta | @104 (1888.622, 918.066) |
| 4B | 78 | BLOCKSTRETCHACTION | F. Lewa Luz · BaseXDelta · BaseYDelta | @104 (978.089, 196.266) |
| 4C | 79 | BLOCKSTRETCHACTION | F. Dół Luz · BaseXDelta · BaseYDelta | @104 (976.162, 170.597) |
| 4D | 80 | BLOCKLINEARPARAMETER | Liniowy7 · DisplacementX · DisplacementY · DisplacementX · DisplacementY · Środek Klapy frontua | @114 (0, 860) @248 (300, 860) |
| 4E | 81 | BLOCKLINEARGRIP | Uchwyt bazowego | @124 (0, 860) |
| 4F | 82 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedBaseX |  |
| 50 | 83 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedBaseY |  |
| 51 | 84 | BLOCKLINEARGRIP | Uchwyt końcowego | @124 (300, 860) |
| 52 | 85 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedEndX |  |
| 53 | 86 | BLOCKGRIPLOCATIONCOMPONENT | UpdatedEndY |  |
| 54 | 87 | BLOCKSTRETCHACTION | Środek Klapy frontua · EndXDelta · EndYDelta | @104 (-116064.683, -37502.003) |

## C. Graph edges

| Edge | Kind | From | To |
|---|---|---|---|
| 0 | 1 | 2 linearparameter “Wysokość” | 4 griplocationcomponent “UpdatedBaseX” |
| 1 | 1 | 2 linearparameter “Wysokość” | 5 griplocationcomponent “UpdatedBaseY” |
| 2 | 2 | 3 lineargrip “Uchwyt bazowego” | 2 linearparameter “Wysokość” |
| 3 | 1 | 2 linearparameter “Wysokość” | 7 griplocationcomponent “UpdatedEndX” |
| 4 | 1 | 2 linearparameter “Wysokość” | 8 griplocationcomponent “UpdatedEndY” |
| 5 | 2 | 6 lineargrip “Uchwyt końcowego” | 2 linearparameter “Wysokość” |
| 6 | 1 | 9 linearparameter “Szerokość” | 11 griplocationcomponent “UpdatedBaseX” |
| 7 | 1 | 9 linearparameter “Szerokość” | 12 griplocationcomponent “UpdatedBaseY” |
| 8 | 2 | 10 lineargrip “Uchwyt bazowego” | 9 linearparameter “Szerokość” |
| 9 | 1 | 9 linearparameter “Szerokość” | 14 griplocationcomponent “UpdatedEndX” |
| 10 | 1 | 9 linearparameter “Szerokość” | 15 griplocationcomponent “UpdatedEndY” |
| 11 | 2 | 13 lineargrip “Uchwyt końcowego” | 9 linearparameter “Szerokość” |
| 12 | 2 | 2 linearparameter “Wysokość” | 16 stretchaction “Wysokość” |
| 13 | 2 | 9 linearparameter “Szerokość” | 17 stretchaction “Szerokość” |
| 14 | 1 | 18 flipparameter “Odwracania” | 21 griplocationcomponent “UpdatedBaseX” |
| 15 | 1 | 18 flipparameter “Odwracania” | 22 griplocationcomponent “UpdatedBaseY” |
| 16 | 1 | 18 flipparameter “Odwracania” | 20 griplocationcomponent “UpdatedFlip” |
| 17 | 1 | 19 flipgrip “Uchwyt” | 18 flipparameter “Odwracania” |
| 18 | 4 | 18 flipparameter “Odwracania” | 23 flipaction “Odwracania1” |
| 19 | 1 | 24 linearparameter “Odległość3” | 26 griplocationcomponent “UpdatedBaseX” |
| 20 | 1 | 24 linearparameter “Odległość3” | 27 griplocationcomponent “UpdatedBaseY” |
| 21 | 2 | 25 lineargrip “Uchwyt bazowego” | 24 linearparameter “Odległość3” |
| 22 | 1 | 24 linearparameter “Odległość3” | 29 griplocationcomponent “UpdatedEndX” |
| 23 | 1 | 24 linearparameter “Odległość3” | 30 griplocationcomponent “UpdatedEndY” |
| 24 | 2 | 28 lineargrip “Uchwyt końcowego” | 24 linearparameter “Odległość3” |
| 25 | 2 | 24 linearparameter “Odległość3” | 31 stretchaction “Rozciągania2” |
| 26 | 1 | 33 visibilitygrip “Uchwyt” | 32 visibilityparameter “Stan widoczności” |
| 27 | 1 | 32 visibilityparameter “Stan widoczności” | 34 griplocationcomponent “UpdatedX” |
| 28 | 1 | 32 visibilityparameter “Stan widoczności” | 35 griplocationcomponent “UpdatedY” |
| 29 | 1 | 37 pointparameter “Punktowy” | 39 griplocationcomponent “UpdatedX” |
| 30 | 1 | 37 pointparameter “Punktowy” | 40 griplocationcomponent “UpdatedY” |
| 31 | 2 | 38 xygrip “Uchwyt” | 37 pointparameter “Punktowy” |
| 32 | 2 | 37 pointparameter “Punktowy” | 42 moveaction “Przesuwania” |
| 33 | 1 | 47 linearparameter “F. Góra Luz” | 49 griplocationcomponent “UpdatedBaseX” |
| 34 | 1 | 47 linearparameter “F. Góra Luz” | 50 griplocationcomponent “UpdatedBaseY” |
| 35 | 2 | 48 lineargrip “Uchwyt bazowego” | 47 linearparameter “F. Góra Luz” |
| 36 | 1 | 47 linearparameter “F. Góra Luz” | 52 griplocationcomponent “UpdatedEndX” |
| 37 | 1 | 47 linearparameter “F. Góra Luz” | 53 griplocationcomponent “UpdatedEndY” |
| 38 | 2 | 51 lineargrip “Uchwyt końcowego” | 47 linearparameter “F. Góra Luz” |
| 39 | 1 | 54 linearparameter “F. Prawa Luz” | 56 griplocationcomponent “UpdatedBaseX” |
| 40 | 1 | 54 linearparameter “F. Prawa Luz” | 57 griplocationcomponent “UpdatedBaseY” |
| 41 | 2 | 55 lineargrip “Uchwyt bazowego” | 54 linearparameter “F. Prawa Luz” |
| 42 | 1 | 54 linearparameter “F. Prawa Luz” | 59 griplocationcomponent “UpdatedEndX” |
| 43 | 1 | 54 linearparameter “F. Prawa Luz” | 60 griplocationcomponent “UpdatedEndY” |
| 44 | 2 | 58 lineargrip “Uchwyt końcowego” | 54 linearparameter “F. Prawa Luz” |
| 45 | 1 | 62 linearparameter “F. Lewa Luz” | 64 griplocationcomponent “UpdatedBaseX” |
| 46 | 1 | 62 linearparameter “F. Lewa Luz” | 65 griplocationcomponent “UpdatedBaseY” |
| 47 | 2 | 63 lineargrip “Uchwyt bazowego” | 62 linearparameter “F. Lewa Luz” |
| 48 | 1 | 62 linearparameter “F. Lewa Luz” | 67 griplocationcomponent “UpdatedEndX” |
| 49 | 1 | 62 linearparameter “F. Lewa Luz” | 68 griplocationcomponent “UpdatedEndY” |
| 50 | 2 | 66 lineargrip “Uchwyt końcowego” | 62 linearparameter “F. Lewa Luz” |
| 51 | 1 | 69 linearparameter “F. Dół Luz” | 71 griplocationcomponent “UpdatedBaseX” |
| 52 | 1 | 69 linearparameter “F. Dół Luz” | 72 griplocationcomponent “UpdatedBaseY” |
| 53 | 2 | 70 lineargrip “Uchwyt bazowego” | 69 linearparameter “F. Dół Luz” |
| 54 | 1 | 69 linearparameter “F. Dół Luz” | 74 griplocationcomponent “UpdatedEndX” |
| 55 | 1 | 69 linearparameter “F. Dół Luz” | 75 griplocationcomponent “UpdatedEndY” |
| 56 | 2 | 73 lineargrip “Uchwyt końcowego” | 69 linearparameter “F. Dół Luz” |
| 57 | 2 | 47 linearparameter “F. Góra Luz” | 76 stretchaction “F. Góra Luz” |
| 58 | 2 | 54 linearparameter “F. Prawa Luz” | 77 stretchaction “F. Prawa Luz” |
| 59 | 2 | 62 linearparameter “F. Lewa Luz” | 78 stretchaction “F. Lewa Luz” |
| 60 | 2 | 69 linearparameter “F. Dół Luz” | 79 stretchaction “F. Dół Luz” |
| 61 | 1 | 80 linearparameter “Środek Klapy frontua” | 82 griplocationcomponent “UpdatedBaseX” |
| 62 | 1 | 80 linearparameter “Środek Klapy frontua” | 83 griplocationcomponent “UpdatedBaseY” |
| 63 | 2 | 81 lineargrip “Uchwyt bazowego” | 80 linearparameter “Środek Klapy frontua” |
| 64 | 1 | 80 linearparameter “Środek Klapy frontua” | 85 griplocationcomponent “UpdatedEndX” |
| 65 | 1 | 80 linearparameter “Środek Klapy frontua” | 86 griplocationcomponent “UpdatedEndY” |
| 66 | 2 | 84 lineargrip “Uchwyt końcowego” | 80 linearparameter “Środek Klapy frontua” |
| 67 | 2 | 80 linearparameter “Środek Klapy frontua” | 87 stretchaction “Środek Klapy frontua” |
| 68 | 1 | 16 stretchaction “Wysokość” | 87 stretchaction “Środek Klapy frontua” |
| 69 | 1 | 23 flipaction “Odwracania1” | 78 stretchaction “F. Lewa Luz” |
| 70 | 1 | 23 flipaction “Odwracania1” | 79 stretchaction “F. Dół Luz” |
| 71 | 1 | 23 flipaction “Odwracania1” | 76 stretchaction “F. Góra Luz” |
| 72 | 1 | 23 flipaction “Odwracania1” | 77 stretchaction “F. Prawa Luz” |
| 73 | 1 | 23 flipaction “Odwracania1” | 1 basepointparameter “Punkt bazowy” |

## D. States

- **1. Front (+luzy)**: objects D1 DE E1 E6 EB EF F0 103 10C 117 120 12C 138; elements (node ids) 2 3 6 9 10 13 16 17 18 19 23 24 25 28 31 47 48 51 54 55 58 62 63 66 69 70 73 76 77 78 79
- **2. 0 Front Prawy (+luzy)**: objects DA DE E1 E6 EB EF F0 103 10C 117 120 12C 138; elements (node ids) 2 3 6 9 10 13 16 17 18 19 23 24 25 28 31 47 48 51 54 55 58 62 63 66 69 70 73 76 77 78 79
- **3. 0 Front Szuflada (+luzy)**: objects DB DC DE E1 E6 EB EF F0 103 10C 117 120 12C 138; elements (node ids) 2 3 6 9 10 13 16 17 18 19 23 24 25 28 31 47 48 51 54 55 58 62 63 66 69 70 73 76 77 78 79
- **4. 0 Front Klapowy (+luzy)**: objects DD DE E1 E6 EB EF F0 103 10C 117 120 12C 138; elements (node ids) 2 3 6 9 10 13 16 17 18 19 23 24 25 28 31 47 48 51 54 55 58 62 63 66 69 70 73 76 77 78 79 80 81 84 87
- **5. 0 Ślepy Front (+luzy)**: objects DE E1 E6 EB EF F0 103 10C 117 120 12C 138; elements (node ids) 2 3 6 9 10 13 16 17 18 19 23 24 25 28 31 47 48 51 54 55 58 62 63 66 69 70 73 76 77 78 79
- **6. Front Wewnętrzny**: objects D1 E8 EF 138; elements (node ids) 2 3 6 9 10 13 16 17 18 19 23 24 25 28 31
- **7. Front Przesuwny**: objects D1 D6 D7 E2 E3 E4 E5 E6 EF 138; elements (node ids) 2 3 6 9 10 13 16 17 18 19 23 24 25 28 31
- **8. Front Ślepy (+luzy)**: objects D8 D9 DE E1 E6 E9 EF F0 103 10C 117 120 12C 135 136 138; elements (node ids) 2 3 6 9 10 13 16 17 18 19 23 25 28 31 37 38 42 47 54 62 69 76 77 78 79
