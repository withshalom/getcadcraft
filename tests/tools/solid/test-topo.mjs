/* SPDX-License-Identifier: Apache-2.0 */
/**
 * test-topo.mjs — engine.solid's S11 tests (topo/brep.js, topo/names.js), registered by test.mjs: section `topo`.
 *
 *   a cube built face by face: its tables, Euler–Poincaré (V − E + F − R = 2), adjacency (two faces an edge, three edges a
 *   vertex); edits that copy only the tables and share every record they do not touch, ids never reused; every structural
 *   rule of check() proven to fire on a model broken on purpose; round trips through structuredClone and JSON with clone
 *   equality (HANDOFF § 14, S11); a 1,000-face body taken through 100 edits, timed (§ 14, S11: "benchmark recorded");
 *   persistent names.
 */
export async function register({ section, ok, refuses, same, deepFrozen, appUrl }) {
  const P = await import(appUrl('solid/index.js'));
  const B = P.brep, N = P.names, A = P.analyticCurve, S = P.analyticSurface, Fr = P.frame, V = P.vec3;
  const BAD = 'solid.err.bad_input', TOPO = 'solid.err.bad_topology';

  /** A cube of side h at the origin: planes with outward normals, each loop counter-clockwise seen from outside. */
  const cube = (h = 10) => B.edit(B.EMPTY, (d) => {
    const vid = {};
    for (const i of [0, 1]) for (const j of [0, 1]) for (const k of [0, 1]) vid[`${i}${j}${k}`] = d.vertex([i * h, j * h, k * h]);
    const pos = (key) => key.split('').map((c) => Number(c) * h), edges = new Map();
    const use = (a, b) => {
      const key = a < b ? a + b : b + a;
      if (!edges.has(key)) { const [p, q] = a < b ? [a, b] : [b, a]; const ln = A.lineThrough(pos(p), pos(q)); edges.set(key, { id: d.edge(ln, 0, A.domain(ln)[1], vid[p], vid[q]), from: p }); }
      const e = edges.get(key);
      return [e.id, e.from === a ? 1 : -1];
    };
    const faces = [
      [['000', '010', '110', '100'], [0, 0, -1]], [['001', '101', '111', '011'], [0, 0, 1]],
      [['000', '100', '101', '001'], [0, -1, 0]], [['010', '011', '111', '110'], [0, 1, 0]],
      [['000', '001', '011', '010'], [-1, 0, 0]], [['100', '110', '111', '101'], [1, 0, 0]],
    ].map(([ring, n]) => {
      const loop = d.loop(null, ring.map((a, i) => use(a, ring[(i + 1) % 4])));
      const o = pos(ring[0]), x = V.sub(pos(ring[1]), o), frame = Fr.frameFromZX(o, n, x);
      return d.face(S.plane({ frame, urange: [-1, h + 1], vrange: [-h - 1, h + 1] }), 1, [loop]);
    });
    d.solid([d.shell(faces)]);
  });

  section('topo', 'S11: the B-rep — tables, Euler–Poincaré, adjacency, copy-on-write, stable ids, the structural rules, round trips, a 1,000-face benchmark', () => {
    // ---------------------------------------------------------------------------------------- a cube
    const c = cube();
    const e = B.euler(c);
    ok(B.isBrep(c) && deepFrozen(c.tables.vertex) && e.V === 8 && e.E === 12 && e.F === 6 && e.L === 6 && e.S === 1 && e.R === 0, 'a cube: 8 vertices, 12 edges, 6 faces, 6 loops, 1 shell, no rings; the tables are frozen');
    ok(e.V - e.E + e.F - e.R === 2 * (e.S - 0), 'Euler–Poincaré: V − E + F − (L − F) = 2 (S − G), with G = 0 for a cube');
    const adj = B.adjacency(c);
    ok(B.ids(c, 'edge').every((id) => adj.facesOfEdge.get(id).length === 2 && adj.coedgesOfEdge.get(id).length === 2) && B.ids(c, 'vertex').every((id) => adj.edgesOfVertex.get(id).length === 3) && B.adjacency(c) === adj, 'adjacency: every edge of the cube is used by two coedges in two faces, every vertex meets three edges; computed once per snapshot');
    const senses = B.ids(c, 'edge').map((id) => adj.coedgesOfEdge.get(id).map((k) => B.get(c, 'coedge', k).sense).sort().join(','));
    ok(senses.every((s) => s === '-1,1'), 'every edge is used once each way (a closed, consistently oriented shell)');
    // each face's normal points away from the cube's centre
    const outward = B.ids(c, 'face').every((id) => { const f = B.get(c, 'face', id), q = S.point(f.surface, 2, -2), n = S.normal(f.surface, 2, -2); return V.dot(n, V.sub(q, [5, 5, 5])) > 0; });
    ok(outward, 'the faces were built with outward normals (the check of orientation is the auditor\'s, S14)');

    // ---------------------------------------------------------------------------------------- copy-on-write, stable ids
    const moved = B.edit(c, (d) => d.set('vertex', 0, { point: [-1, -1, -1] }));
    ok(B.get(c, 'vertex', 0).point[0] === 0 && B.get(moved, 'vertex', 0).point[0] === -1 && moved.tables.face[0] === c.tables.face[0] && moved.tables.edge[3] === c.tables.edge[3] && moved !== c, 'an edit makes a new snapshot: the old one is unchanged, and every record the edit did not touch is the same object in both');
    const removed = B.edit(c, (d) => { const f = d.get('face', 5), sh = d.get('shell', f.shell); d.set('shell', sh.id, { faces: sh.faces.filter((x) => x !== 5) }); for (const l of f.loops) { for (const k of d.get('loop', l).coedges) d.remove('coedge', k); d.remove('loop', l); } d.remove('face', 5); });
    const readded = B.edit(removed, (d) => { const fid = d.face(c.tables.face[5].surface, 1, []); d.set('shell', 0, { faces: [...d.get('shell', 0).faces, fid] }); d.set('face', fid, { shell: 0 }); });
    ok(B.count(removed, 'face') === 5 && B.ids(readded, 'face').includes(6) && !B.ids(readded, 'face').includes(5) && readded.next.face === 7, 'ids are never reused: a face removed (5) and a face added get a new id (6); next counts up');
    ok(refuses(() => B.get(removed, 'face', 5), BAD, { name: 'face', why: 'no_such_id' }) && refuses(() => B.get(c, 'wheel', 0), BAD, { name: 'kind', why: 'unknown' }), 'get refuses an id that has no record and a kind that does not exist');

    // ---------------------------------------------------------------------------------------- the structural rules
    const D = () => JSON.parse(JSON.stringify(B.toData(c)));
    const breaks = (mutate, rule, kind) => { const d = D(); mutate(d); return refuses(() => B.fromData(d), TOPO, kind ? { rule, kind } : { rule }); };
    const rules = [
      ['reference', (d) => { d.edge[0].v0 = 99; }, 'edge'],
      ['back_reference', (d) => { d.coedge[0].loop = 3; }, 'coedge'],
      ['shared', (d) => { d.loop[1].coedges[0] = d.loop[0].coedges[0]; }, 'coedge'],
      ['open_loop', (d) => { d.coedge[0].sense = -d.coedge[0].sense; }, 'loop'],
      ['orphan', (d) => { d.coedge.push({ id: d.coedge.length, edge: 0, sense: 1, loop: 0, pcurve: null }); d.next.coedge = d.coedge.length; }, 'coedge'],
      ['range', (d) => { d.edge[0].t1 = 1e6; }, 'edge'],
      ['sense', (d) => { d.face[0].sense = 0; }, 'face'],
      ['empty', (d) => { d.solid[0].shells = []; }, 'solid'],
      ['id', (d) => { d.vertex[2].id = 3; }, 'vertex'],
    ];
    const missed = rules.filter(([rule, m, kind]) => !breaks(m, rule, kind)).map(([r]) => r);
    ok(missed.length === 0, `check: every structural rule fires on a cube broken on purpose — ${rules.map(([r]) => r).join(', ')}` + (missed.length ? ' (did not fire: ' + missed.join(', ') + ')' : ''));
    ok(refuses(() => B.edit(c, (d) => d.set('face', 0, { loops: [99] })), TOPO, { rule: 'reference', kind: 'face' }) && B.get(c, 'face', 0).loops[0] === 0, 'an edit that leaves a broken model is refused, and the snapshot it started from is unchanged');

    // ---------------------------------------------------------------------------------------- the draft's own refusals
    ok(refuses(() => B.edit(c, (d) => d.vertex([0, 0])), BAD, { name: 'point', why: 'not_a_point' }) && refuses(() => B.edit(c, (d) => d.edge(A.lineThrough([0, 0, 0], [1, 0, 0]), 0, 2, 0, 1)), BAD, { name: 'range', why: 'out_of_domain' }) && refuses(() => B.edit(c, (d) => d.edge({}, 0, 1, 0, 1)), BAD, { name: 'curve', why: 'not_a_curve' }) && refuses(() => B.edit(c, (d) => d.loop(null, [[0, 2]])), BAD, { name: 'sense', why: 'not_a_sense' }) && refuses(() => B.edit(c, (d) => d.loop(null, [])), BAD, { name: 'coedges', why: 'empty' }) && refuses(() => B.edit(c, (d) => d.vertex([0, 0, 0], { tol: 1e-9 })), BAD, { name: 'tol', why: 'below_lin' }) && refuses(() => B.edit(c, (d) => d.set('vertex', 0, { id: 4 })), BAD, { name: 'id', why: 'read_only' }), 'the draft refuses a non-point, a range outside the curve, a non-curve, a sense that is not ±1, an empty loop, a local tolerance below tol.lin, and a change of id');
    ok(refuses(() => B.edit({ tables: {} }, () => {}), BAD, { name: 'brep', why: 'not_a_brep' }) && refuses(() => B.euler({}), BAD, { name: 'brep', why: 'not_a_brep' }), 'a look-alike snapshot is refused');

    // the draft's lower-level calls (the Euler operators, S12, are built on them): a coedge made in no loop, a loop made of
    // coedges that already exist, relink; the check catches a coedge left in no loop and one moved while its old loop holds it
    const swapped = B.edit(c, (d) => {
      const L = d.get('loop', 0), old = d.get('coedge', L.coedges[0]), fresh = d.coedge(old.edge, old.sense);
      d.relink(0, [fresh, ...L.coedges.slice(1)]);
      d.remove('coedge', old.id);
    });
    const first = B.get(swapped, 'coedge', B.get(swapped, 'loop', 0).coedges[0]);
    ok(first.id === 24 && first.loop === 0 && first.edge === B.get(c, 'coedge', 0).edge && B.count(swapped, 'coedge') === 24 && swapped.next.coedge === 25, 'draft: coedge() makes a coedge in no loop and relink() puts it in its place (its loop set); with the old one removed there are still 24 coedges, the next id 25');
    const rebuilt = B.edit(c, (d) => { const l = d.loop(0, d.get('loop', 0).coedges); d.set('face', 0, { loops: [l] }); d.remove('loop', 0); });   // face 0's loop made anew from its coedges
    ok(B.get(rebuilt, 'loop', 6).coedges.every((k) => B.get(rebuilt, 'coedge', k).loop === 6) && B.get(rebuilt, 'face', 0).loops[0] === 6, 'draft: a loop made of existing coedges points each of them at itself');
    ok(refuses(() => B.edit(c, (d) => { d.coedge(0, 1); }), TOPO, { rule: 'orphan', kind: 'coedge' }) && refuses(() => B.edit(c, (d) => { d.loop(null, [d.get('loop', 0).coedges[0]]); }), TOPO, { rule: 'back_reference', kind: 'coedge' }) && refuses(() => B.edit(c, (d) => d.coedge(0, 2)), BAD, { name: 'sense', why: 'not_a_sense' }) && refuses(() => B.edit(c, (d) => d.coedge(99, 1)), BAD, { name: 'edge', why: 'no_such_id' }) && refuses(() => B.edit(c, (d) => d.relink(0, [])), BAD, { name: 'coedges', why: 'empty' }), 'the check refuses a coedge left in no loop (orphan) and one moved into a new loop while its old loop still lists it (back_reference); the draft refuses a sense that is not ±1, an edge that does not exist, an empty relink');

    // adjacency counts a face once for an edge it uses twice (a strut, a seam), and fromData refuses counters behind the tables
    const strut = B.edit(B.EMPTY, (d) => {
      const a = d.vertex([0, 0, 0]), z = d.vertex([1, 0, 0]), ln = A.lineThrough([0, 0, 0], [1, 0, 0]), e = d.edge(ln, 0, 1, a, z);
      d.shell([d.face(S.plane({ frame: Fr.frameFromZX([0, 0, 0], [0, 0, 1], [1, 0, 0]), urange: [-1, 2], vrange: [-1, 1] }), 1, [d.loop(null, [[e, 1], [e, -1]])])]);
    });
    const late = JSON.parse(JSON.stringify(B.toData(c)));
    late.next.face = 3;
    ok(B.adjacency(strut).facesOfEdge.get(0).length === 1 && B.adjacency(strut).coedgesOfEdge.get(0).length === 2 && refuses(() => B.fromData(late), BAD, { name: 'next', why: 'out_of_range' }), 'adjacency: an edge used twice by one face lists that face once (and both coedges); fromData refuses a counter behind its table (ids would be reused)');

    // ---------------------------------------------------------------------------------------- round trips
    const rt1 = B.fromData(structuredClone(B.toData(c))), rt2 = B.fromData(JSON.parse(JSON.stringify(B.toData(removed))));
    ok(B.isBrep(rt1) && same(B.toData(rt1), B.toData(c)) && same(B.toData(rt2), B.toData(removed)) && rt2.next.face === removed.next.face && rt2.tables.face[5] === undefined, 'round trip: a model crosses structuredClone or JSON as plain data and comes back the same, holes and counters included (clone equality, D-wire)');

    // ---------------------------------------------------------------------------------------- a 1,000-face body, 100 edits
    {
      const n = 40, m = 25, h = 1;                                                  // 40 × 25 = 1000 quads
      const f0 = Fr.frameFromZX([0, 0, 0], [0, 0, 1], [1, 0, 0]);
      const t0 = performance.now();
      const grid = B.edit(B.EMPTY, (d) => {
        const v = [];
        for (let i = 0; i <= n; i++) { v.push([]); for (let j = 0; j <= m; j++) v[i].push(d.vertex([i * h, j * h, 0])); }
        const hor = [], ver = [];
        for (let i = 0; i < n; i++) { hor.push([]); for (let j = 0; j <= m; j++) { const ln = A.lineThrough([i * h, j * h, 0], [(i + 1) * h, j * h, 0]); hor[i].push(d.edge(ln, 0, 1, v[i][j], v[i + 1][j])); } }
        for (let i = 0; i <= n; i++) { ver.push([]); for (let j = 0; j < m; j++) { const ln = A.lineThrough([i * h, j * h, 0], [i * h, (j + 1) * h, 0]); ver[i].push(d.edge(ln, 0, 1, v[i][j], v[i][j + 1])); } }
        const pl = S.plane({ frame: f0, urange: [-1, n + 1], vrange: [-1, m + 1] }), faces = [];
        for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) faces.push(d.face(pl, 1, [d.loop(null, [[hor[i][j], 1], [ver[i + 1][j], 1], [hor[i][j + 1], -1], [ver[i][j], -1]])]));
        d.shell(faces);
      });
      const built = performance.now() - t0, ge = B.euler(grid);
      let b = grid;
      const t1 = performance.now();
      for (let k = 0; k < 100; k++) b = B.edit(b, (d) => { const vid = (k * 37) % ((n + 1) * (m + 1)), p = d.get('vertex', vid).point; d.set('vertex', vid, { point: [p[0], p[1], p[2] + 0.01] }); });
      const per = (performance.now() - t1) / 100;
      const adjN = B.adjacency(b), inner = B.ids(b, 'edge').filter((id) => adjN.facesOfEdge.get(id).length === 2).length;
      ok(ge.F === 1000 && ge.V === 1066 && ge.E === 2065 && ge.V - ge.E + ge.F === 1 && inner === 2065 - 2 * (n + m), `a 1,000-face sheet: V − E + F = 1 (a disc), ${inner} inner edges with two faces each; built in ${built.toFixed(0)} ms`);
      ok(per < 250, `benchmark (HANDOFF § 14, S11): 100 edits of a 1,000-face body, each copying the tables and checking every structural rule, ${per.toFixed(1)} ms per edit (decision D-store: whole-table copies are enough at this size)`);
    }

    // ---------------------------------------------------------------------------------------- persistent names
    const n1 = N.nameOf('extrude', ['nabc', 'nd'], 'side'), n2 = N.nameOf('extrude', ['nabc', 'nd'], 'side'), n3 = N.nameOf('extrude', ['nabc', 'nd'], 'cap'), n4 = N.nameOf('extrude', ['nabcnd'], 'side'), n5 = N.nameOf('extrude', ['nab', 'cnd'], 'side');
    ok(N.isName(n1) && n1 === n2 && new Set([n1, n3, n4, n5]).size === 4, 'names: the same recipe gives the same name; a different role, or the same text split into other inputs, gives another');
    ok(n1 === 'n2f9e98ed9c301073' && N.nameOf('box', [], 'top') === 'n32ab7f73644ba6ed' && N.nameOf('op') === 'n0b2dd516c4d11bde', 'names are persistent: three recorded names come out the same (a change to the hash renames every entity in every saved model)');
    const many = new Set();
    for (let i = 0; i < 20000; i++) many.add(N.nameOf('op', [String(i)], 'r'));
    ok(many.size === 20000, 'names: 20,000 inputs, 20,000 different names');
    ok(refuses(() => N.nameOf(''), BAD, { name: 'op', why: 'not_a_string' }) && refuses(() => N.nameOf('x', 'y'), BAD, { name: 'inputs', why: 'not_an_array' }) && refuses(() => N.nameOf('x', [3]), BAD, { name: 'inputs', why: 'not_a_string' }) && refuses(() => N.nameOf('x', [], 7), BAD, { name: 'role', why: 'not_a_string' }), 'names refuse an empty operation, inputs that are not a list of strings, a role that is not a string');
    const named = B.edit(c, (d) => d.set('face', 1, { name: n1 }));
    ok(B.get(named, 'face', 1).name === n1 && B.get(B.fromData(B.toData(named)), 'face', 1).name === n1, 'a name rides on its record and through a round trip');
  });
}
