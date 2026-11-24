// The authoring path, as a user would type it: BPARAMS → PBLOCK → place → a grip → PBEXPORT → the file placed again from the Library.
const D = new URL('./dev/', import.meta.url).href;
const { Doc } = await import(D + 'doc.js');
const { Engine } = await import(D + 'commands.js');
await import(D + 'blockparams-cmd.js');
const PBC = await import(D + 'paramblock-cmd.js');
const BP = await import(D + 'blockparams.js');
const LP = await import(D + 'libplace.js');
const LI = await import(D + 'libitem.js');
const G = await import(D + 'geom.js');

function harness(units = 'millimeters') {
  const doc = new Doc(); doc.meta.units = units;
  const log = [], saved = [];
  const host = {
    cursor: { x: 0, y: 0 }, selection: new Set(), shift: false,
    print: (s) => log.push(String(s)), prompt: (s) => { host.lastPrompt = s; },
    setSelection: (s) => { host.selection = new Set(s); }, preview: () => {},
    pickAt: () => null, pickWindow: () => [], zoomExtents: () => {}, zoomWindow: () => {},
    saveBlob: (name, text, type) => saved.push({ name, text, type }),
  };
  const eng = new Engine(doc, host);
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const type = async (...lines) => { for (const l of lines) { eng.text(l); await tick(); await tick(); } };
  return { doc, host, eng, log, saved, type };
}
const ok = (c, m, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + m + (x ? '  — ' + x : ''));
const boundsOf = (ents, blocks) => { const b = G.emptyBounds(); for (const e of ents) { const eb = G.entityBounds(e, blocks); if (G.validBounds(eb)) { G.growPt(b, eb.minX, eb.minY); G.growPt(b, eb.maxX, eb.maxY); } } return b; };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e * Math.max(1, Math.abs(a), Math.abs(b));

// ---- a plain block: a 100 × 50 plate with a centred label, base at its corner
const H = harness();
const plate = [
  { type: 'poly', layer: '0', pts: [{ x: 0, y: 0, b: 0 }, { x: 100, y: 0, b: 0 }, { x: 100, y: 50, b: 0 }, { x: 0, y: 50, b: 0 }], closed: true },
  { type: 'text', layer: '0', x: 50, y: 25, h: 5, rot: 0, s: 'PLATE', ha: 'center', va: 'middle' },
];
H.doc.change('setup', () => H.doc.defineBlock({ name: 'PLATE', base: { x: 0, y: 0 }, entities: plate }));

// BPARAMS: W = 100, a length
await H.type('-BPARAMS', 'PLATE', 'P', 'W', '100', 'L', 'D');
let bp = H.doc.blocks.get('PLATE').bp;
ok(bp && bp.params.some((p) => p.name === 'W' && p.expr === '100' && p.kind === 'length'), 'BPARAMS (typed) adds W = 100, a length', JSON.stringify(bp && bp.params));

// PBLOCK: stretch the right side by W − 100; its values 50..500 step 10; a linear grip on the right edge
await H.type('PBLOCK', 'PLATE', 'S', '90,-10', '110,60', 'W - 100', '0', 'V', 'W', '50..500 step 10', 'G', 'L', 'W', 'R', '1', 'P', '100,25', 'D');
bp = H.doc.blocks.get('PLATE').bp;
ok(bp && bp.acts?.length === 1 && bp.acts[0].t === 'stretch', 'PBLOCK (typed) adds a stretch', JSON.stringify(bp && bp.acts));
ok(bp && bp.grips?.length === 1 && bp.grips[0].t === 'linear', 'PBLOCK adds a linear grip', JSON.stringify(bp && bp.grips));
const W = bp?.params.find((p) => p.name === 'W');
ok(W && W.min === 50 && W.max === 500 && W.step === 10, 'PBLOCK Values sets 50..500 step 10', JSON.stringify(W));

// place it, set W = 230 the way Properties does, and check the shape
let id;
H.doc.change('place', () => { id = H.doc.add({ type: 'insert', layer: '0', block: 'PLATE', x: 1000, y: 500, sx: 1, sy: 1, rot: 0 }); });
const blk = H.doc.blocks.get('PLATE');
const r230 = BP.refSetValue(null, blk.bp, 'W', '230');
ok(r230.ok, 'W = 230 accepted', r230.error);
const b230 = boundsOf(BP.bpParts(blk, r230.bp), H.doc.blocks);
ok(near(b230.maxX - b230.minX, 230) && near(b230.maxY - b230.minY, 50), 'W = 230 stretches the plate to 230 × 50', `${b230.maxX - b230.minX} × ${b230.maxY - b230.minY}`);
ok(!BP.refSetValue(null, blk.bp, 'W', '235').ok && !BP.refSetValue(null, blk.bp, 'W', '40').ok && !BP.refSetValue(null, blk.bp, 'W', '510').ok, 'off-step 235, 40 and 510 are refused');

// the grip: drag it from the right edge 57 mm further right (rotated, mirrored and scaled references too)
for (const tr of [{ rot: 0, sx: 1, sy: 1 }, { rot: Math.PI / 6, sx: 1, sy: 1 }, { rot: 0, sx: -1, sy: 1 }, { rot: 2, sx: 2, sy: 2 }, { rot: 1, sx: -1.5, sy: 1.5 }]) {
  const e = { type: 'insert', layer: '0', block: 'PLATE', x: 1000, y: 500, ...tr };
  const g = BP.refGrips(blk, e)[0];
  const len = Math.hypot(g.ux, g.uy), ux = g.ux / len, uy = g.uy / len;
  const to = { x: g.x + ux * 57 * Math.abs(tr.sx), y: g.y + uy * 57 * Math.abs(tr.sx) };
  const moved = BP.refGripMove(blk, e, g.key, to);
  const v = moved ? BP.resolveBp(blk.bp, moved.bp).values.get('W') : null;
  const g2 = moved ? BP.refGrips(blk, moved)[0] : null;
  const off = g2 ? Math.hypot(g2.x - to.x, g2.y - to.y) : null;
  ok(v === 160, `grip dragged 57 mm along its arrow on a reference rot ${tr.rot.toFixed(2)} sx ${tr.sx} sy ${tr.sy}: W = 160 (157 to the nearest step)`, 'W = ' + v);
  ok(off !== null && off <= 3 * Math.abs(tr.sx) + 1e-6, '…and the grip lands where it was dropped, within the 10 mm step', 'off by ' + (off === null ? '-' : off.toFixed(3)));
}

// PBEXPORT: the block as a Library item file
await H.type('PBEXPORT', 'PLATE', '', '', '', '');
ok(H.saved.length === 1, 'PBEXPORT writes one file', H.saved.map((s) => s.name).join(', ') + ' | last lines: ' + H.log.slice(-3).join(' / '));
let item = null;
try { item = JSON.parse(H.saved[0].text); } catch { /* */ }
const v = item ? LI.validateItem(item) : null;
ok(v && v.ok !== false, 'the file is a valid Library item', JSON.stringify(v && v.errors).slice(0, 200));

// the file placed again, in a millimetre and an inch drawing, against the original at several widths
if (item) {
  for (const units of ['millimeters', 'inches']) {
    const d2 = new Doc(); d2.meta.units = units;
    let name;
    d2.change('lib', () => { name = LP.ensureLibraryBlock(d2, { ...item, uuid: '00000000-0000-4000-8000-000000000001', version: 1 }).name; });
    const b2 = d2.blocks.get(name), k = units === 'inches' ? 25.4 : 1;
    for (const w of [50, 100, 230, 500]) {
      const ra = BP.refSetValue(null, blk.bp, 'W', String(w)), rb = BP.refSetValue(null, b2.bp, 'W', String(w));
      const A = BP.bpParts(blk, ra.bp), Bp = BP.bpParts(b2, rb.bp);
      const ba = boundsOf(A.filter((e) => e.type !== 'text'), H.doc.blocks), bb = boundsOf(Bp.filter((e) => e.type !== 'text' && e.type !== 'attdef'), d2.blocks);
      ok(near(ba.minX, bb.minX * k) && near(ba.maxX, bb.maxX * k) && near(ba.minY, bb.minY * k) && near(ba.maxY, bb.maxY * k), `${units}, W = ${w}: the outline from the Library equals the original`, `${JSON.stringify(ba)} vs ${JSON.stringify(bb)} ×${k}`);
      const ta = A.find((e) => e.type === 'text'), tb = Bp.find((e) => e.type === 'text');
      if (w === 100) {
        const tba = G.entityBounds(ta, H.doc.blocks), tbb = tb ? G.entityBounds(tb, d2.blocks) : null;
        ok(tb && near((tba.minX + tba.maxX) / 2, (tbb.minX + tbb.maxX) / 2 * k, 1e-3) && near((tba.minY + tba.maxY) / 2, (tbb.minY + tbb.maxY) / 2 * k, 1e-3), `${units}: the centred label is still centred after export`, tb ? `original centre ${((tba.minX + tba.maxX) / 2).toFixed(2)},${((tba.minY + tba.maxY) / 2).toFixed(2)}; from the Library ${((tbb.minX + tbb.maxX) / 2 * k).toFixed(2)},${((tbb.minY + tbb.maxY) / 2 * k).toFixed(2)} (ha ${tb.ha}, va ${tb.va})` : 'no text');
      }
    }
  }
}
// PBEXPORT refuses an inch drawing (a Library item is in millimetres)
const Hi = harness('inches');
Hi.doc.change('setup', () => Hi.doc.defineBlock({ name: 'P2', base: { x: 0, y: 0 }, entities: plate, bp: { params: [{ name: 'W', expr: '4' }], vis: [], acts: [{ t: 'move', dx: 'W', dy: '0' }] } }));
await Hi.type('PBEXPORT', 'P2', '', '', '', '');
ok(Hi.saved.length === 0, 'PBEXPORT in an inch drawing writes nothing (and says why)', Hi.log.slice(-1)[0]);
