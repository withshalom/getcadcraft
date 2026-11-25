// More checks on the translated block: undo/redo, explode, copy and paste between drawings, grips (height, flip, state list), timing,
// every reference of the 16-cell sheet through DWG 2018 and DXF 2000, and the bits of every setting (for the Node ↔ Chromium comparison).
import fs from 'node:fs';
import { buildFront } from './poc-front-pb.mjs';
const D = new URL('./dev/', import.meta.url).href;
const BP = await import(D + 'blockparams.js'); const G = await import(D + 'geom.js'); const CL = await import(D + 'clipboard.js');
const { Doc } = await import(D + 'doc.js'); const { writeDxf2000 } = await import(D + 'dxf2000.js'); const { readDxf } = await import(D + 'dxf.js');
const { saveDwg } = await import(D + 'dwg-save.js'); const { readDwg } = await import(D + 'dwg/read.js'); const { importDwg } = await import(D + 'dwg-import.js');
const say = (ok, m, x = '') => console.log((ok ? 'PASS ' : 'FAIL ') + m + (x ? '  — ' + x : ''));
const F = await buildFront(process.argv[2] || './front.dwg'); const doc = F.doc, blk = F.blk, bp = blk.bp, x0 = F.base.x, y0 = F.base.y;
const ref = (vals) => { let r = null; for (const [k, v] of Object.entries(vals)) r = BP.refSetValue(r, bp, k, String(v)).bp; return r; };
const R = (v) => (typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : v);
const unU = (s) => (typeof s === 'string' ? s.replace(/\\U\+([0-9A-Fa-f]{4})/g, (m0, h) => String.fromCharCode(parseInt(h, 16))) : s);
const norm = (v) => (Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter((k) => !['id', 'bpk', 'handle', 'st', 'island', 'pattern', 'block'].includes(k)).map((k) => [k, k === 'layer' ? unU(v[k]) : norm(v[k])])) : R(v));
const shape = (es) => es.filter((e) => e.type !== 'attdef').map((e) => JSON.stringify(norm(e))).sort();
const boxOf = (es, blocks = doc.blocks) => { const b = G.emptyBounds(); for (const e of es) { const q = G.entityBounds(e, blocks); if (G.validBounds(q)) { G.growPt(b, q.minX, q.minY); G.growPt(b, q.maxX, q.maxY); } } return b; };
const insertOf = (d) => [...d.model.values()].find((e) => e.type === 'insert' && e.block === F.name);

// 1. undo and redo of a value change on a placed reference
{ const e = insertOf(doc), w0 = boxOf([e]).maxX - boxOf([e]).minX;
  doc.change('W', () => doc.update(e.id, { ...e, bp: ref({ Width: 750, State: 3 }) }));
  const w1 = boxOf([doc.get(e.id)]).maxX - boxOf([doc.get(e.id)]).minX; doc.undo(); const w2 = boxOf([doc.get(e.id)]).maxX - boxOf([doc.get(e.id)]).minX; doc.redo(); const w3 = boxOf([doc.get(e.id)]).maxX - boxOf([doc.get(e.id)]).minX;
  say(w1 !== w0 && w2 === w0 && w3 === w1, 'a value change is one undo step, and redo brings it back', `${w0.toFixed(1)} → ${w1.toFixed(1)}; undo ${w2.toFixed(1)}; redo ${w3.toFixed(1)} (extents include the dimensions)`); }

// 2. EXPLODE gives the reference's current shape, not the default one
{ const e = { ...insertOf(doc), bp: ref({ Width: 820, Height: 990, State: 4, FlapCentre: 410 }) };
  const parts = G.explodeEntity(e, doc.blocks).filter((x) => x.type !== 'attdef' && x.type !== 'text' && x.type !== 'dim');
  const want = BP.bpParts(blk, e.bp).filter((x) => x.type !== 'text' && x.type !== 'dim').map((x) => G.txEntity(x, G.insertMatrix(e, blk)));
  say(JSON.stringify(shape(parts)) === JSON.stringify(shape(want)), 'EXPLODE gives the pieces at the reference\'s values (Width 820, Height 990, flap state, centre 410)', `${parts.length} pieces`); }

// 3. copy a reference and paste it into another drawing (the clipboard carries the parameters: PB.1 P2 fix)
{ const e = insertOf(doc); doc.change('v', () => doc.update(e.id, { ...e, bp: ref({ Width: 700, GapTop: 6, State: 2 }) }));
  const clip = CL.readClip(JSON.stringify(CL.makeClip(doc, [e.id]))).clip; const B2 = new Doc(); B2.meta.units = 'millimeters';
  B2.change('paste', () => CL.pasteClip(B2, clip, 0, 0)); const p = insertOf(B2), b2 = B2.blocks.get(F.name);
  say(!!p && BP.isParametric(b2?.bp) && JSON.stringify(shape(BP.bpParts(b2, p.bp))) === JSON.stringify(shape(BP.bpParts(blk, doc.get(e.id).bp))), 'copy and paste into another drawing keeps the block live and the reference\'s values', p ? JSON.stringify(p.bp?.vals) : 'nothing pasted'); }

// 4. grips: height grip drag, flip grip click, the state list
{ const e = { type: 'insert', layer: '0', block: F.name, x: 1000, y: 2000, sx: 1, sy: 1, rot: 0 }, gs = BP.refGrips(blk, e);
  const gh = gs.find((g) => /height/i.test(g.name || '')), gf = gs.find((g) => g.kind === 'flip'), gl = gs.find((g) => g.kind === 'list');
  const mh = gh && BP.refGripMove(blk, e, gh.key, { x: gh.x, y: gh.y - 140 }); const vH = mh ? BP.resolveBp(bp, mh.bp).values.get('Height') : null;
  say(vH === 720, 'dragging the height grip 140 mm down sets Height = 720', 'Height = ' + vH);
  const mf = gf && BP.refFlip(null, bp, gf.param); const vF = mf?.ok ? BP.resolveBp(bp, mf.bp).values.get('Flip') : null;
  say(vF === 1, 'clicking the flip grip (refFlip) flips the front: Flip = 1', 'Flip = ' + vF);
  const ch = gl && BP.refChoices(bp, null, gl), pk = ch && ch.rows[3].pick(), keys = pk?.ok ? new Set(BP.bpParts(blk, pk.bp).map((x) => x.bpk)) : null, want4 = new Set(F.states[3].shown.flatMap((h) => F.keysOf.get(h) || []));
  say(!!keys && ch.rows.length === 8 && keys.size === want4.size && [...want4].every((k) => keys.has(k)), 'the list grip offers the 8 front types by name; picking the 4th shows the flap state', ch ? ch.rows.map((r) => r.name).join(' | ') : 'no list'); }

// 5. timing: one evaluation of the block at a new setting
{ const t0 = performance.now(); let n = 0; for (let i = 0; i < 400; i++) { BP.bpParts(blk, ref({ Width: 300 + i, Height: 600 + (i % 7) * 50, State: 1 + (i % 8), Flip: i % 2 })); n++; } const ms = (performance.now() - t0) / n;
  say(ms < 5, `one evaluation at a new setting takes ${ms.toFixed(2)} ms (400 settings, the memo bypassed by changing values)`); }

// 6. all 16 references of the sheet through DWG 2018 and DXF 2000
{ const S = new Doc(); S.meta.units = 'millimeters';
  const cells = [...F.states.map((s, i) => ({ State: i + 1 })), { Width: 400 }, { Width: 900 }, { Height: 500 }, { Height: 1200 }, { GapTop: 30, GapRight: 10, GapLeft: 30, GapBottom: 10 }, { Flip: 1 }, { State: 4, FlapCentre: 150 }, { State: 2, MidDist: 250 }];
  S.change('s', () => { for (const l of doc.layers.values()) { try { S.addLayer(l); } catch { /* */ } } for (const b of doc.blocks.values()) S.defineBlock(b); cells.forEach((v, i) => S.add({ type: 'insert', layer: '0', block: F.name, x: (i % 4) * 1500, y: -Math.floor(i / 4) * 1500, sx: 1, sy: 1, rot: 0, bp: ref(v) })); });
  const sig = (d) => [...d.model.values()].filter((e) => e.type === 'insert').sort((a, b) => a.x - b.x || a.y - b.y).map((e) => JSON.stringify(shape(BP.bpParts(d.blocks.get(F.name), e.bp))));
  const want = sig(S);
  for (const [label, fn] of [['DWG 2018', () => importDwg(readDwg(saveDwg(S, { version: '2018' }).bytes))], ['DXF 2000', () => { const x = readDxf(writeDxf2000(S).text); return x.drawing ?? x; }]]) {
    const d2 = new Doc(); d2.load(fn()); const got = sig(d2);
    say(got.length === 16 && got.every((s, i) => s === want[i]), `${label}: all 16 references reopen with their own values and shapes`, `${got.filter((s, i) => s === want[i]).length} of ${got.length}`);
  } }

// 7. bits of every cell setting, for the Node ↔ Chromium comparison (bh-dyn-*.mjs)
fs.writeFileSync('front-block.json', JSON.stringify({ entities: blk.entities, bp }));
