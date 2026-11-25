import { reader, hexKey } from './lib-dyn.mjs';
export const plaus = (v) => Number.isFinite(v) && (v === 0 || (Math.abs(v) >= 1e-6 && Math.abs(v) < 1e9));
// every offset where a full (64-bit) BD sits: [pos, value]
export function fullDoubles(o) {
  const r = reader(o.raw), end = r.end, out = [];
  for (let p = 0; p < end - 66; p++) { r.pos = p; let c; try { c = r.BB(); } catch { continue; } if (c !== 0) continue; let v; try { v = r.RD(); } catch { continue; } if (plaus(v) && Math.abs(v) > 1e-6) out.push([p, v]); }
  return out;
}
// pairs/triples of consecutive full doubles (BD2/BD3 candidates); z may be a short code
export function points(o) {
  const ds = fullDoubles(o), at = new Map(ds), r = reader(o.raw), out = [];
  for (const [p, x] of ds) { if (!at.has(p + 66)) continue; const y = at.get(p + 66); r.pos = p + 132; let z = null, zl = 0; try { const c = r.BB(); if (c === 2) { z = 0; zl = 2; } else if (c === 1) { z = 1; zl = 2; } else if (c === 0) { z = r.RD(); zl = 66; } } catch {} out.push({ p, x, y, z, end: p + 132 + zl }); }
  return out;
}
