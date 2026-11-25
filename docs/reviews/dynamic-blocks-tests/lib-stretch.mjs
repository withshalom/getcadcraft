// Observed layout of a stretch action (ODA/ZWCAD release-33 file): after the 88-bit element header and the display point (BD3, to bit 238):
// BL nSel · BL nDep · BL dep node × nDep · BL input node × 2 · BL nPts · (RD x, RD y) × nPts (the frame) · BL nEnt · per entity: BL k · BL vertex index × k · … trailing fields
import { reader, hexKey } from './lib-dyn.mjs';
export function stretchOf(o) {
  const r = reader(o.raw); r.pos = 238;
  const nSel = r.BL(), nDep = r.BL(), deps = []; for (let i = 0; i < nDep; i++) deps.push(r.BL());
  const input = r.BL(), input2 = r.BL();
  const nPts = r.BL(), frame = []; for (let i = 0; i < nPts; i++) frame.push({ x: r.RD(), y: r.RD() });
  const nEnt = r.BL(), idx = []; for (let i = 0; i < nEnt; i++) { const k = r.BL(), l = []; for (let j = 0; j < k; j++) l.push(r.BL()); idx.push(l); }
  const tailAt = r.pos, tail = { BL: r.BL() }; const p = r.pos; tail.BD1 = r.BD(); tail.BD2 = r.BD(); tail.left = r.end - r.pos;
  const refs = o.raw.h.map(([c, h]) => hexKey(h));
  return { nSel, deps, input, input2, frame, sel: refs.slice(0, nSel), moved: refs.slice(nSel), idx, tail, tailAt };
}
