# BimCraft with no WebGL 2: the patch and its checks

Behind `../BUG-BIMCRAFT-NO-WEBGL.md`. Nothing here is part of BimCraft; the patch has not been applied to any BimCraft repository.

| File | What it is |
|---|---|
| `bimcraft-no-webgl.patch` | The proposed change, made against the lab build **as served on 2026-11-26** (not against the repository, which is at 0.11.0 and differs in these files). Four files, +49 / −4 lines. |
| `bimcraft-no-webgl-on-upstream-main.patch` | The same change as a `git diff` against **upstream `main`** (`getcadcraft/bimcraft` at `79b603f6`, which is also `withshalom/getbimcraft` `main`). It includes the lab's 2026-11-26 message fix and the `view3d.nowebgl` string, which the public repo lacks. Four files, +55 / −5. `git apply --check` is clean; applied, `nogl-check.cjs` gives 14 of 14. Apply from the repo root: `git apply bimcraft-no-webgl-on-upstream-main.patch`. |
| `nogl-check.cjs` | A regression suite for any served BimCraft build: three browser conditions, 14 checks. It **fails** on the repository as released and on the lab build as it stands (2 of 14 pass: the WebGL-on control and "no uncaught errors"), and **passes** (14 of 14) on the lab build with the patch. |
| `smoke-buttons.cjs` | Opens a model, clicks every toolbar button (50) with WebGL on and off, and compares. With the patch: 0 differing outcomes, 0 uncaught errors in either. |
| `sheet-paper.png`, `sheet-model.png` | The same stage, WebGL off, in the three builds side by side: as reported, the lab today, the lab with the patch. Paper space (light) and model space (dark). |

## Run the checks

You need Node 20+, Playwright with Chromium, and a BimCraft build to point at. The repository's own dev shell serves one from a clone:

```sh
git clone https://github.com/withshalom/getbimcraft && cd getbimcraft
NODE_USE_ENV_PROXY=1 node devshell/serve.mjs --port 8135 &      # NODE_USE_ENV_PROXY only if the network needs an HTTPS proxy
node /path/to/nogl-check.cjs http://127.0.0.1:8135/ fixtures/ifc/wall-precision-legacy.ifc
node /path/to/smoke-buttons.cjs http://127.0.0.1:8135/ fixtures/ifc/wall-precision-legacy.ifc
```

The three conditions:

- **WebGL on** (the control).
- **WebGL really off**: Chromium `--disable-3d-apis`. To the page this is a browser with WebGL disabled, the way privacy-hardened builds ship.
- **WebGL 1 on, WebGL 2 off**: simulated by making `getContext('webgl2')` return `null` and fire `webglcontextcreationerror`. This is what `webgl.enable-webgl2 = false` or an older GPU looks like. A WebGL 1 test page passes here; BimCraft does not.

The scripts use BimCraft's own markup (`#bc-file`, `.bc-status`, `[data-canvas]` and its `.viewer`, `[data-canvas-wrap]`, `[data-empty]`, `[data-nogl]`, `[data-tree]`, `[data-plan-canvas]`), so they need changing if those change. `[data-nogl]` and `viewer.noGL` exist only with the patch; without it those checks fail, which is the point.

## Check that the patch applies to the lab build as served

```sh
mkdir -p lab/app/lang && cd lab
B=https://getcadcraft.com/assets/apps/bimcraft/dev
for f in viewer3d.js ifc-open-ui.js bimcraft.css; do curl -s -o app/$f $B/$f; done
curl -s -o app/lang/en.json $B/lang/en.json
patch -p1 --dry-run -i ../bimcraft-no-webgl.patch      # the lab changes daily: if a hunk fails, the lab moved on
```

On 2026-11-26 this applied with no offsets and no fuzz, and the patched files equalled "the lab's file plus my additions". Only two existing lines change in each of `viewer3d.js` and `ifc-open-ui.js`; nothing is removed from the stylesheet or the strings.

## Limits

- Chromium only (version 158, headless, software WebGL as the control). Firefox, Safari and a real GPU were not used.
- The lab's page (`/lab/bimcraft`) sits behind an account sign-in, so it was not driven. The same files, served without sign-in at `/assets/apps/bimcraft/dev/`, were run through the repository's dev shell.
- Verified in the patched no-WebGL mode: the model opens (two files in a row), the tree, element properties and 2D plan match the WebGL run, 50 toolbar buttons behave the same. Not tested: schedules and checks, saving or printing the 3D picture, Live view and VR beyond clicking their buttons, opening a point cloud, and any language but English.
