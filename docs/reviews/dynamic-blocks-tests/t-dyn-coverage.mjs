// How much of each dynamic-block object's data stream is accounted for by the layouts in the advisory (strings are all read; this counts the data bits)
import { load, reader, hexKey } from './lib-dyn.mjs';
import { points } from './lib-scan.mjs';
import { stretchOf } from './lib-stretch.mjs';
import { graphOf } from './lib-graph.mjs';
const { m, objs } = load(process.argv[2] || './front.dwg');
const cov = {};
const add = (type, known, total) => { const c = (cov[type] ||= { n: 0, known: 0, total: 0, min: 1 }); c.n++; c.known += known; c.total += total; c.min = Math.min(c.min, known / total); };
const pts = (o) => points(o).reduce((s, q) => s + (q.end - q.p), 0);
for (const o of m.objects) {
  if (!/^BLOCK|^ACAD_EVALUATION_GRAPH$/.test(o.type)) continue;
  const r = reader(o.raw), total = r.end;
  let known = 0;
  if (o.type === 'ACAD_EVALUATION_GRAPH') { const g = graphOf(o); known = total - g.left; }
  else if (o.type === 'BLOCKGRIPLOCATIONCOMPONENT') { const q = reader(o.raw); try { q.BL(); q.BL(); q.BL(); q.BL(); const z = q.BL(); if (z === 0) { q.BL(); q.BL(); known = q.pos; } else known = q.pos; } catch { known = 0; } }
  else if (o.type === 'BLOCKVISIBILITYPARAMETER') known = total;   // exact (§ 4.2) apart from the meaning of the 18-bit prefix
  else if (o.type === 'BLOCKSTRETCHACTION') { const s = stretchOf(o); known = total - s.tail.left; }
  else if (/ACTION$/.test(o.type)) { const q = reader(o.raw); q.pos = 238; const n = q.BL(), d = q.BL(); for (let i = 0; i < d; i++) q.BL(); q.BL(); q.BL(); known = q.pos; }   // header, display point, wiring
  else known = 88 + pts(o);   // header + the points found
  add(o.type, Math.min(known, total), total);
}
for (const [t, c] of Object.entries(cov).sort()) console.log(`| ${t} | ${c.n} | ${(100 * c.known / c.total).toFixed(0)} % | ${(100 * c.min).toFixed(0)} % |`);
const all = Object.values(cov).reduce((a, c) => ({ k: a.k + c.known, t: a.t + c.total }), { k: 0, t: 0 }); console.log(`| all | ${Object.values(cov).reduce((a, c) => a + c.n, 0)} | ${(100 * all.k / all.t).toFixed(0)} % | |`);
