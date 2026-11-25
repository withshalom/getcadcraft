# Dynamic blocks: the advisory's scripts

These scripts are behind `../ADVISORY-DYNAMIC-BLOCKS-LIVE.md`.

- They run the CadCraft lab build's own modules, the `dev` build that `/lab/cadcraft` serves, in Node 22.
- The picture and the cross-engine check also need a Chromium through Playwright.
- Nothing here is part of CadCraft.
- Every layout they read was found by observation on one file; LibreDWG's source was not used.

**You need two things, neither in this repository:**

- a mirror of the dev build in `cad/dev/` (made with `../parametric-blocks-tests/crawl-cad.py`)
- the user's sample drawing, `Front_Parametryczny_03.dwg`, saved as `cad/front.dwg`

```sh
mkdir work && cd work
python3 ../../parametric-blocks-tests/crawl-cad.py agents.js dwg-import.js dwg-save.js dxf2000.js dxf.js plot.js \
        blockcopy.js clipboard.js blockparams-cmd.js paramblock-cmd.js dyn-blocks.js   # → cad/dev/ (set CA_BUNDLE if a proxy needs it)
cp ../*.mjs ../*.cjs cad/ && cp /path/to/Front_Parametryczny_03.dwg cad/front.dwg && cd cad
node t-dyn-today.mjs      # what the build does today: read, open, save (the dynamic data is lost), INSERT › File (237 km away)
node t-dyn-decode.mjs     # the layouts, with exactness checks: visibility, 48 vertex lists, the evaluation graph; grips, components, records
node t-dyn-live.mjs       # the translation to a PB.1 block: 33 checks (32 pass; the DXF layer-name bug fails) and 3 GAP notes
node t-dyn-more.mjs       # undo/redo, explode, copy and paste, grips, timing, 16 references through DWG 2018 and DXF 2000 (9 checks)
node t-dyn-visgrip.mjs    # the visibility list grip with a formula-driven state (PB.1 gap G9, fails on purpose) and the table grip that works
node t-dyn-coverage.mjs   # how much of each dynamic-block object's data bits the layouts account for
node t-dyn-inventory.mjs  # the advisory's appendices: every entity, every dynamic-block object, every graph edge, every state
node bh-dyn-node.mjs > n.json                    # the bits of 57 settings (needs front-block.json, written by t-dyn-more.mjs)
python3 -m http.server 8133 --bind 127.0.0.1 &   # then: node bh-dyn-chrome.cjs > c.json, and compare n.json with c.json
node t-dyn-sheet.mjs && node render-sheet.cjs    # the picture: out/front-live-sheet.svg (CadCraft's plotter) → .png
```

`bh-dyn-chrome.cjs` loads `probe.html` from the served folder. Any empty HTML page will do:

```sh
echo '<!doctype html><meta charset=utf-8>' > probe.html
```

**What each file is:**

| File | What it is |
|---|---|
| `lib-dyn.mjs` | loads a DWG with cc-dwg's reader and gives a bit reader on a raw object, as cc-dwg's `dynblock-read.js` does |
| `lib-scan.mjs` | finds 64-bit coordinates (BD) in a raw object, used to locate points by their values |
| `lib-str.mjs` | lists an object's strings from the R2007+ string stream |
| `lib-stretch.mjs` | the stretch-action layout |
| `lib-graph.mjs` | the evaluation graph's nodes and edges |
| `poc-front-pb.mjs` | the proof-of-concept translation: the file's definition → a PB.1 block in a CadCraft `Doc` |
| `bh-dyn.mjs` | the shared hashing code that `bh-dyn-node.mjs` and `bh-dyn-chrome.cjs` run |

Expect the scripts to need changes for any other file. They assume this file's object layout: release 33, with the bit positions quoted in the advisory.
