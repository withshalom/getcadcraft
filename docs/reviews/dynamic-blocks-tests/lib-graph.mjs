// ACAD_EVALUATION_GRAPH as observed on this file (release-33 writer):
//   BL ? · BL ? · BL node count · per node [BL handle index · BL flags · BL node id · BL ×4 edge links]
//   BL edge count · BL −1 · edge 0 [BL id · BL kind · BL from · BL to · BL ×4 links · BL −1] · edges 1… [BL id · BL 0 · BL kind · BL from · BL to · BL ×4 links · BL −1]
//   (from / to are node indices). Ends on the last bit.
import { reader, hexKey } from './lib-dyn.mjs';
export function graphOf(g) {
  const r = reader(g.raw), refs = g.raw.h || [];
  const head = [r.BL(), r.BL()], n = r.BL(), nodes = [];
  for (let i = 0; i < n; i++) { const idx = r.BL(), flags = r.BL(), node = r.BL(), links = [r.BL(), r.BL(), r.BL(), r.BL()]; nodes.push({ i, node, flags, links, handle: hexKey(refs[idx]?.[1]) }); }
  const ne = r.BL(), lead = r.BL(), edges = [];
  for (let i = 0; i < ne; i++) {
    const id = r.BL(), z = i === 0 ? null : r.BL(), kind = r.BL(), from = r.BL(), to = r.BL(), links = [r.BL(), r.BL(), r.BL(), r.BL()], tail = r.BL();
    edges.push({ id, z, kind, from, to, links, tail });
  }
  return { head, nodes, edges, lead, left: r.end - r.pos };
}
