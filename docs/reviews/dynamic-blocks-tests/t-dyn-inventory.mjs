// Markdown inventories of the sample, straight from the file (the advisory's appendices)
import { load, reader, hexKey } from './lib-dyn.mjs';
import { points } from './lib-scan.mjs';
import { strings } from './lib-str.mjs';
import { stretchOf } from './lib-stretch.mjs';
import { graphOf } from './lib-graph.mjs';
const { m, objs } = load(process.argv[2] || './front.dwg');
const ms = m.blocks.find((b) => b.name === '*Model_Space'), dyn = ms.dynamic;
const G = graphOf(m.objects.find((o) => o.type === 'ACAD_EVALUATION_GRAPH'));
const nodeOf = new Map(G.nodes.map((n) => [n.handle, n.node])), idxNode = (i) => G.nodes[i].node;
const bx = 236788.09440733615, by = 74432.24560409508, rp = (x, y) => `(${+(x - bx).toFixed(3)}, ${+(y - by).toFixed(3)})`;
const layerPlot = new Map((m.tables?.layers || []).map((l) => [l.name, l.plot !== false && l.plotFlag !== 0]));
// states (release-33 visibility layout)
const vo = m.objects.find((o) => o.type === 'BLOCKVISIBILITYPARAMETER'), vr = reader(vo.raw), vh = vo.raw.h.map(([, h]) => hexKey(h)); let k = 0; const take = (n) => { const l = vh.slice(k, k + n); k += n; return l; };
vr.BL(); vr.BL(); vr.BL(); vr.BL(); vr.TV(); vr.B(); vr.B(); vr.B(); vr.B(); vr.BS(); vr.BS(); vr.BS(); vr.BD3(); vr.BS(); vr.BS(); vr.BL(); vr.TV(); vr.TV(); vr.B(); vr.B();
const all = take(vr.BL()), ns = vr.BL(), states = []; for (let i = 0; i < ns; i++) { const name = vr.TV(); states.push({ name, shown: take(vr.BL()), elems: take(vr.BL()) }); }
const sAct = dyn.actions.filter((a) => a.kind === 'stretch').map((a) => ({ a, s: stretchOf(objs.get(a.handle)) }));
const flipSel = (() => { const a = dyn.actions.find((x) => x.kind === 'flip'), o = objs.get(a.handle), r = reader(o.raw); r.pos = 238; const n = r.BL(); return new Set(o.raw.h.slice(0, n).map(([, h]) => hexKey(h))); })();
const assoc = new Map(); for (const e of ms.entities) if (e.type === 'HATCH') for (const l of e.loops || []) for (const b of l.boundary || []) assoc.set(hexKey(e.handle), hexKey(b));
const dimassoc = new Map(); for (const o of m.objects.filter((x) => x.type === 'DIMASSOC')) { const hs = (o.raw.h || []).map(([, h]) => hexKey(h)); dimassoc.set(hs[0], hs.slice(1)); }
console.log('## A. Entities\n\n| Handle | Type | Layer | Tag | In states | Stretched by (vertex indices) | Notes |\n|---|---|---|---|---|---|---|');
for (const e of ms.entities) {
  const h = hexKey(e.handle), tag = (e.xdata?.AcDbBlockRepETag || []).find(([c]) => c === 1071)?.[1];
  const inS = states.map((s, i) => (s.shown.includes(h) ? i + 1 : null)).filter(Boolean).join(' ') || (all.includes(h) ? '—' : 'always');
  const by = sAct.map(({ a, s }) => { const j = s.moved.indexOf(h); return j >= 0 ? `${a.name} [${s.idx[j].join(',')}]` : null; }).filter(Boolean).join('; ');
  const notes = [e.invisible ? 'hidden' : '', assoc.has(h) ? 'hatch bound to ' + assoc.get(h) : '', dimassoc.has(h) ? 'DIMASSOC → ' + dimassoc.get(h).join(', ') : '', e.type === 'ATTDEF' ? `tag ${e.tag}, prompt ${e.prompt}` : '', e.type === 'MTEXT' ? '"' + String(e.value || '').replace(/\{\\f[^;]*;|\}|\\p[^;]*;/g, '') + '"' : '', flipSel.has(h) ? '' : 'not in the flip'].filter(Boolean).join('; ');
  console.log(`| ${h} | ${e.type} | ${e.layer} | ${tag ?? ''} | ${inS} | ${by || '—'} | ${notes} |`);
}
console.log('\n## B. Dynamic-block objects\n\n| Handle | Node | Type | Strings | Points (from the base point) |\n|---|---|---|---|---|');
for (const o of m.objects.filter((x) => /^BLOCK|^ACAD_EVALUATION_GRAPH$/.test(x.type))) {
  const AT = { BLOCKBASEPOINTPARAMETER: [106, 246, 380], BLOCKLINEARPARAMETER: [114, 248], BLOCKFLIPPARAMETER: [106, 240, 400], BLOCKPOINTPARAMETER: [106, 290], BLOCKVISIBILITYPARAMETER: [106] };
  const at = AT[o.type] || (/GRIP$/.test(o.type) ? [124] : /ACTION$/.test(o.type) ? [104] : []);
  const h = hexKey(o.handle), S = o.type === 'ACAD_EVALUATION_GRAPH' ? [] : strings(o), P = o.type === 'ACAD_EVALUATION_GRAPH' ? [] : points(o).filter((q) => at.includes(q.p));
  console.log(`| ${h} | ${nodeOf.get(h) ?? '—'} | ${o.type} | ${S.map((x) => x || '∅').join(' · ').replace(/\|/g, '/')} | ${P.map((q) => '@' + q.p + ' ' + rp(q.x, q.y)).join(' ')} |`);
}
const T = (i) => objs.get(G.nodes[i].handle).type.replace('BLOCK', '').toLowerCase();
const N = (i) => { const o = objs.get(G.nodes[i].handle), S = strings(o); return `${idxNode(i)} ${T(i)} “${o.type === 'BLOCKLINEARPARAMETER' ? S[5] : S[0]}”`; };
console.log('\n## C. Graph edges\n\n| Edge | Kind | From | To |\n|---|---|---|---|');
for (const e of G.edges) console.log(`| ${e.id} | ${e.kind} | ${N(e.from)} | ${N(e.to)} |`);
console.log('\n## D. States\n');
states.forEach((s, i) => console.log(`- **${i + 1}. ${s.name}**: objects ${s.shown.join(' ')}; elements (node ids) ${s.elems.map((h) => nodeOf.get(h) ?? h).join(' ')}`));
