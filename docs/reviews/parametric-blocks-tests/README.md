# Parametric blocks (CadCraft 0.12 lab, PB.1) — the review's tests

The scripts behind `../PARAMETRIC-BLOCKS-REVIEW.md`. They run the lab build's own modules in Node 22 (and Chromium for the
cross-engine check); nothing here is part of CadCraft.

```sh
mkdir work && cd work
python3 ../crawl-cad.py paramblock-cmd.js blockparams-cmd.js libpanel.js libplace.js clipboard.js blockcopy.js \
        dxf2000.js open-ui.js save-ui.js dwg-save.js          # mirrors the dev build into cad/dev/ (set CA_BUNDLE if a proxy needs it)
mkdir -p cad/dev/paramblocks && curl -s https://getcadcraft.com/assets/apps/cadcraft/dev/paramblocks/starter.json -o cad/dev/paramblocks/starter.json
cp ../*.mjs cad/ && cd cad
node t-pb.mjs            # the 20 blocks: values, refusals, forged values, grips, flips, tables, hostile definitions (2,014 checks)
node t-pb-files.mjs      # DXF R12 / 2000 / binary 2000, DWG 2000 / 2010 / 2018, mm and inch drawings (480 round trips)
node t-pb-formula.mjs    # formulas, unit suffixes, loops
node t-pb-cmd.mjs        # BPARAMS → PBLOCK → place → grips on transformed references → PBEXPORT → placed again
node t-pb-enter.mjs      # Enter at prompts that show a default
node t-pb-export.mjs     # PBEXPORT's item for the 20 shipped blocks (and with the IFC class added)
node t-pb-fidelity.mjs   # what PBEXPORT keeps: text alignment, base point, object kinds, widths, layers
node t-pb-text.mjs       # how far an exported label moves
node t-pb-misc.mjs       # paste between drawings, INSERT from a file, EXPLODE, undo/redo, largest sizes
node t-pb-samepaste.mjs  # paste within one drawing
node t-pb-fuzz.mjs       # 3,000 mutated Library item files
node bh-pb-node.mjs      # bits of every block's exploded geometry (compare with bh-pb-chrome.mjs, served over http)
```
