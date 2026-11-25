# Parametric blocks (PB.1): verification of the P1–P8 fixes

> **Hand-off.** For the PB.1 developer · Follows `PARAMETRIC-BLOCKS-REVIEW.md` · Tested 2026-11-25 · Tests: `docs/reviews/parametric-blocks-tests/` · **Summary:** P1, P3–P7 fixed; P2 and P8 partly fixed; one new regression (N1). Nothing here is released to /try.

Build tested: the CadCraft `dev` assets as now served, mirrored fresh (317 files). `paramblock-cmd.js`, `paramblock.js`, `libitem.js`,
`blockcopy.js` and `clipboard.js` all changed against the build in the first review. The same suite from
`parametric-blocks-tests/` was run again. Three tests (`t-pb-cmd`, `t-pb-enter`, `t-pb-fidelity`) were updated, and the reasons are below.

## Result

| # | Fix | Result |
|---|---|---|
| P1 | IFC class in the exported item | **Verified.** There is a new `pb.export.ask.ifc` prompt. The plate exports, passes `validateItem` (partial: uuid, version and licence are filled at upload), and places back the same at W = 50/100/230/500 in mm and inch drawings. All 20 starter blocks re-export and place back the same. |
| P2 | Parameters kept on paste and INSERT | **Partly verified.** Paste works into a different drawing (in memory and as clipboard text) and into the same drawing: the block stays parametric and keeps its values. **INSERT from a DXF or DWG file still drops them**, see below. |
| P3 | Enter takes the default | **Verified.** PBLOCK Stretch and Move, and PBEXPORT through every prompt, work with Enter alone and with the values typed out. |
| P4 | Text alignment and width factor | **Verified.** center/middle, right/bottom with wf 0.8, and left/top all come back with the same alignment, and the text boxes move 0.0 mm. |
| P5 | Base point becomes 0,0 | **Verified.** A block with its base at 20,10 comes back as the same shape relative to its base, at W = 100 and 180. |
| P6 | Ellipse, spline, hatch, multiline text, widths | **Verified.** Ellipses and solid hatches stay as they are, a spline becomes a polyline (as stated) with the same box, multiline text becomes text, and a polyline width is now counted (`widths: 1`). |
| P7 | Validator refuses instead of throwing | **Verified.** 3,000 mutated items: 2,262 refused, 738 placed, 0 threw, 0 non-finite, 0 slow, 0 prototype pollution. |
| P8 | Same bits in Node and Chromium | **Verified for the block's own geometry.** The flange now matches. The two doors still differ by one bit once a rotated reference is exploded, but that comes from the host's `geom.js` and not from `paramblock.js`, see below. |

Regressions: everything else passes as before (2,013 of 2,014 checks; DXF R12/2000/binary and DWG 2000/2010/2018 round trips 40→40 in mm
and inches; formulas; grips on rotated, mirrored and scaled references; EXPLODE; undo/redo; largest sizes at 2.0 ms or less). **One new failure**, below.

## Still open

### N1 — New: a forged huge angle makes non-finite geometry (Low)
`t-pb.mjs`, north arrow, `North = 999999999`: 16 non-finite numbers in 4 objects. The old build passed this case. The new `sinCosDeg`
(`paramblock.js:83`) returns `[NaN, NaN]` for |d| > 5.7e6, where `Math.cos` gave a finite value. Only a forged or edited file can hold such a
value, and the validator does not crash on it, but NaN objects reach the drawing. Fix: reduce first. `d % 360` is exact in floating point
(`sinCosDeg(999999999 % 360)` gives `[-0.98769, 0.15643]`). Or clamp or refuse out-of-range angles where the values are cleaned.

### P2 (remainder) — INSERT from a DXF/DWG file loses the parameters (High, as before)
`readDxf` returns the parameters separately as `drawing.bparams` (`dxf.js:314`). Only `Doc` loading applies them (`doc.js:510`
`applyBparams`). INSERT › File (`open-ui.js:281` `pickDrawing` → `commands.js:3674` `planCopy`/`applyCopy`) passes the raw read drawing, so
`srcBlocks.get(n).bp` is undefined. The new code in `blockcopy.js:104` copies `bp` only when it is already on the block. Reproduce with
`t-pb-insert-file.mjs` (the block comes back with `bp` undefined, while `bparams` is on the drawing). Paste works because the clipboard puts
`bp` on the block itself. Fix: apply `drawing.bparams` to `drawing.blocks` with the same cleaning (`blockparams-file.js`) before
`planCopy`, in `pickDrawing` or in `applyCopy`.

### P8 (remainder) — explode of a rotated reference (Low, host side)
`bh-pb-raw-*.mjs` dumps every number. The only differences in the 20 blocks are two arc ends in the doors:
`arc.a1 = 2.2707963267948967` (Node) vs `…963` (Chromium). They come from transforming an arc by the reference's rotation
(`geom.js:759`, `Math.atan2`/`Math.cos`/`Math.sin`). That is shared by every block, parametric or not, so it is outside the PB.1 fix. The
developer's check (block-local parts) would not see it. If bit-identical output is the goal, `geom.js` needs the same `sinCos`/`atan2`.

## Notes on the test changes
- `t-pb-cmd`, `t-pb-enter`: one more Enter for the new IFC prompt. The validity check now uses `{ partial: true }`, the mode PBEXPORT itself uses.
- `t-pb-fidelity`: my first fixtures used the wrong field names for ellipse (`rx/ry`), spline (`cps`), hatch (point objects) and multiline
  text (`type: 'mtext'`). They now use CadCraft's own shapes (`mx/my/ratio`, `ctrl`, flat loops with `solid`, `text` with `ww`).
  The first review's P6 finding still stands for the old build: kinds were skipped and counted there.
- Paste from a mm drawing into an inch drawing does not scale. The size is kept number for number, with the `clip.units_differ` note. That is
  CadCraft's general paste behaviour and not part of P2.
- `t-pb-formula`'s 5 "count" problems are the same as on the old build: my test feeds unit-converted values to count parameters.
