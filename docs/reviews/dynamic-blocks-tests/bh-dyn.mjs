// The translated block evaluated at 56 fixed settings; every number of every object hashed (FNV-1a over float64 bytes). Same input in Node and Chromium.
export async function run(json, base) {
  const BP = await import(base + 'blockparams.js');
  const blk = { name: 'F', base: { x: 0, y: 0 }, entities: json.entities, bp: json.bp };
  let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const settings = [{}, ...[1, 2, 3, 4, 5, 6, 7, 8].map((s) => ({ State: s })), { Width: 400 }, { Width: 900 }, { Height: 500 }, { Height: 1200 }, { GapTop: 30, GapRight: 10, GapLeft: 30, GapBottom: 10 }, { Flip: 1 }, { State: 4, FlapCentre: 150 }, { State: 2, MidDist: 250 }];
  for (let i = 0; i < 40; i++) settings.push({ State: 1 + (i % 8), Width: Math.round(300 + rnd() * 900), Height: Math.round(400 + rnd() * 1100), GapTop: Math.round(rnd() * 100) / 10, GapRight: Math.round(rnd() * 100) / 10, GapLeft: Math.round(rnd() * 100) / 10, GapBottom: Math.round(rnd() * 100) / 10, MidDist: Math.round(100 + rnd() * 600), FlapCentre: Math.round(100 + rnd() * 400), MoveX: Math.round(rnd() * 200 - 100), MoveY: Math.round(rnd() * 200 - 100), Flip: i % 3 === 0 ? 1 : 0 });
  const dv = new DataView(new ArrayBuffer(8)), out = {};
  settings.forEach((v, i) => {
    let ref = null; for (const [k, x] of Object.entries(v)) { const r = BP.refSetValue(ref, json.bp, k, String(x)); if (r.ok) ref = r.bp; }
    let h = 0x811c9dc5 >>> 0, n = 0;
    const walk = (o) => { if (typeof o === 'number') { dv.setFloat64(0, o); for (let b = 0; b < 8; b++) { h ^= dv.getUint8(b); h = Math.imul(h, 0x01000193) >>> 0; } n++; } else if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') for (const k of Object.keys(o).sort()) walk(o[k]); };
    for (const e of BP.bpParts(blk, ref)) walk(e);
    out[i + ' ' + JSON.stringify(v)] = h.toString(16) + ':' + n;
  });
  return out;
}
