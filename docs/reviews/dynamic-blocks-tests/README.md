# Dynamic blocks: the advisory's scripts

These scripts are behind `../ADVISORY-DYNAMIC-BLOCKS-LIVE.md`.

- They run the CadCraft dev build's own modules in Node 22.
- The picture also needs a Chromium through Playwright.
- Nothing here is part of CadCraft.
- Every layout they read was found by observation on one file; LibreDWG's source was not used.

**You need two things, neither in this repository:**

- a mirror of the dev build in `cad/dev/` (made with `../parametric-blocks-tests/crawl-cad.py`)
- the user's sample drawing, `Front_Parametryczny_03.dwg`, saved as `cad/front.dwg`

```sh
mkdir work && cd work
python3 ../../parametric-blocks-tests/crawl-cad.py agents.js dwg-import.js dwg-save.js dxf2000.js dxf.js plot.js \
        blockcopy.js blockparams-cmd.js paramblock-cmd.js dyn-blocks.js   # → cad/dev/ (set CA_BUNDLE if a proxy needs it)
cp ../*.mjs ../*.cjs cad/ && cp /path/to/Front_Parametryczny_03.dwg cad/front.dwg && cd cad
node t-dyn-today.mjs     # § 3: what the build does today: read, open, save (the dynamic data is lost), INSERT › File (237 km away)
node t-dyn-decode.mjs    # § 4: the layouts this file uses, with exactness checks (visibility exact; 48 of 48 vertex lists)
node t-dyn-live.mjs      # § 5: the translation to a PB.1 block; 33 checks (32 pass; the DXF layer-name issue fails) and 3 GAP notes
node t-dyn-sheet.mjs && node render-sheet.cjs   # the picture: out/front-live-sheet.svg (CadCraft's plotter) → .png
```

**What each file is:**

| File | What it is |
|---|---|
| `lib-dyn.mjs` | loads a DWG with cc-dwg's reader and gives a bit reader on a raw object, as cc-dwg's `dynblock-read.js` does |
| `lib-scan.mjs` | finds 64-bit coordinates (BD) in a raw object, used to locate points by their values |
| `lib-str.mjs` | lists an object's strings from the R2007+ string stream |
| `lib-stretch.mjs` | the stretch-action layout read in § 4.5 |
| `poc-front-pb.mjs` | the proof-of-concept translation: the file's definition → a PB.1 block in a CadCraft `Doc` |

Expect the scripts to need changes for any other file. They assume this file's object layout: release 33, with the bit positions quoted in the advisory.
