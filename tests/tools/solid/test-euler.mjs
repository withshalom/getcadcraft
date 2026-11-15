/* SPDX-License-Identifier: Apache-2.0 */
/**
 * test-euler.mjs — engine.solid's S12 tests (topo/euler.js, topo/build.js), registered by test.mjs: section `euler`.
 *
 *   600 random Euler operations on a growing random model: each changes V, E, F, L and S as its table says, and
 *   V − E + F − R = 2 (S − G) holds after every one (HANDOFF § 14, S12); an operation followed by its inverse gives back the
 *   model it started from, up to ids; every refusal typed, with the snapshot it was given unchanged; a polygon lamina;
 *   prisms made by the Euler sweep and the same prisms from the polyhedron builder, face for face (§ 14, S12); the builders'
 *   refusals; a square torus from the builder (genus 1); a hole through a block made with Euler operators (struts, mef,
 *   kemr, a pocket swept through, kfmrh): genus 1, every face outward and on its plane, the volume right.
 */
export async function register({ section, ok, refuses, same, appUrl }) {
  const P = await import(appUrl('solid/index.js'));
  const B = P.brep, E = P.euler, Bu = P.build, V = P.vec3, Fr = P.frame, A = P.analyticCurve, S = P.analyticSurface;
  const BAD = 'solid.err.bad_input';

  // ------------------------------------------------------------------------------------------------ helpers
  const start = (b, c) => { const co = B.get(b, 'coedge', c), e = B.get(b, 'edge', co.edge); return co.sense > 0 ? e.v0 : e.v1; };
  const pts = (b, loop) => B.get(b, 'loop', loop).coedges.map((c) => B.get(b, 'vertex', start(b, c)).point);
  const minRot = (parts) => { let best = null; for (let i = 0; i < parts.length; i++) { const r = [...parts.slice(i), ...parts.slice(0, i)].join(' '); if (best === null || r < best) best = r; } return best; };
  const tags = new Map(), tag = (o) => { if (!tags.has(o)) tags.set(o, tags.size); return tags.get(o); };
  /** the model up to its ids: its shells' faces, each face's loops as their coedges (start point, edge, sense), in turn */
  const canon = (b) => {
    const loopKey = (l) => minRot(B.get(b, 'loop', l).coedges.map((c) => { const co = B.get(b, 'coedge', c), e = B.get(b, 'edge', co.edge); return B.get(b, 'vertex', start(b, c)).point.join(',') + '~' + tag(e.curve) + '[' + e.t0 + ',' + e.t1 + ']' + co.sense; }));
    const faceKey = (f) => { const F = B.get(b, 'face', f); return tag(F.surface) + (F.sense > 0 ? '+' : '-') + '{' + (F.loops.length ? loopKey(F.loops[0]) : '') + ' | ' + F.loops.slice(1).map(loopKey).sort().join(' | ') + '}'; };
    const shells = B.ids(b, 'shell').map((s) => { const sh = B.get(b, 'shell', s); return (sh.solid === null ? 'sheet' : 'solid') + '[' + sh.faces.map(faceKey).sort().join('; ') + ']'; }).sort();
    return JSON.stringify({ shells, vertices: B.ids(b, 'vertex').map((v) => B.get(b, 'vertex', v).point.join(',')).sort(), edges: B.count(b, 'edge') });
  };
  const genus = (b) => { const e = B.euler(b); return e.S - (e.V - e.E + e.F - e.R) / 2; };
  const newell = (p) => { let n = [0, 0, 0]; for (let k = 1; k + 1 < p.length; k++) n = V.add(n, V.cross(V.sub(p[k], p[0]), V.sub(p[k + 1], p[0]))); return n; };
  /** the divergence theorem over every loop of every face (a ring runs the other way, so it takes its area off) */
  const volume = (b) => { let v = 0; for (const f of B.ids(b, 'face')) for (const l of B.get(b, 'face', f).loops) { const p = pts(b, l); for (let k = 1; k + 1 < p.length; k++) v += V.triple(p[0], p[k], p[k + 1]); } return v / 6; };
  /** every face on its plane (all its loops' vertices within eps), its normal (frame z × sense) turning with its outer loop */
  const placed = (b, eps = 1e-9) => B.ids(b, 'face').every((f) => {
    const F = B.get(b, 'face', f), z = F.surface.frame.z, o = F.surface.frame.o;
    return V.dot(V.scale(z, F.sense), newell(pts(b, F.loops[0]))) > 0 && F.loops.every((l) => pts(b, l).every((q) => Math.abs(V.dot(V.sub(q, o), z)) <= eps));
  });
  /** a closed, consistently oriented shell: every edge used twice, once each way */
  const closed = (b) => { const adj = B.adjacency(b); return B.ids(b, 'edge').every((e) => adj.coedgesOfEdge.get(e).map((c) => B.get(b, 'coedge', c).sense).sort().join(',') === '-1,1'); };
  const along = (b, edge) => B.adjacency(b).coedgesOfEdge.get(edge).find((c) => B.get(b, 'coedge', c).sense > 0);
  const against = (b, edge) => B.adjacency(b).coedgesOfEdge.get(edge).find((c) => B.get(b, 'coedge', c).sense < 0);

  section('euler', 'S12: Euler operators and builders — counts and Euler–Poincaré over random operations, inverses, refusals, the sweep against the polyhedron builder, a through hole', () => {
    const g = P.makePrng(1212);
    const pt = () => [g.range(-50, 50), g.range(-50, 50), g.range(-50, 50)];
    const pick = (a) => a[g.int(a.length)];

    // ---------------------------------------------------------------------------------------- random operations
    // the change of V, E, F, L, S and G each operator makes (HANDOFF § 8.4; euler.js's table)
    const D = { mevvlfs: [2, 1, 1, 1, 1, 0], kevvlfs: [-2, -1, -1, -1, -1, 0], mev: [1, 1, 0, 0, 0, 0], kev: [-1, -1, 0, 0, 0, 0], semv: [1, 1, 0, 0, 0, 0], jekv: [-1, -1, 0, 0, 0, 0], mef: [0, 1, 1, 1, 0, 0], kef: [0, -1, -1, -1, 0, 0], mekr: [0, 1, 0, -1, 0, 0], kemr: [0, -1, 0, 1, 0, 0], kfmrh: [0, 0, -1, 0, 0, 1], mfkrh: [0, 0, 1, 0, 0, -1] };
    const W = [['mevvlfs', 1], ['kevvlfs', 1], ['mev', 5], ['kev', 3], ['semv', 2], ['jekv', 2], ['mef', 5], ['kef', 2], ['mekr', 2], ['kemr', 3], ['kfmrh', 2], ['mfkrh', 2]];
    const total = W.reduce((s, [, w]) => s + w, 0);
    const choose = () => { let x = g.int(total); for (const [n, w] of W) { if (x < w) return n; x -= w; } return 'mev'; };
    /** one random application of `name` to b: { r, undo } (undo: its inverse, where the arguments are known), or null */
    const attempt = (b, name) => {
      const cs = B.ids(b, 'coedge'), fs = B.ids(b, 'face'), adj = B.adjacency(b);
      const loopsOf = (f) => B.get(b, 'face', f).loops;
      // candidates the operator may apply to (it still refuses some: those refusals are tested too), else anything
      const oneLoop = (e) => { const u = adj.coedgesOfEdge.get(e) || []; return u.length === 2 && B.get(b, 'coedge', u[0]).loop === B.get(b, 'coedge', u[1]).loop; };
      const or = (some, all) => (some.length && g.int(4) ? some : all);
      const es = B.ids(b, 'edge'), vs = B.ids(b, 'vertex'), ss = B.ids(b, 'shell');
      switch (name) {
        case 'mevvlfs': return { r: E.mevvlfs(b, pt(), pt()), undo: (x) => E.kevvlfs(x.brep, x.shell) };
        case 'kevvlfs': return ss.length ? { r: E.kevvlfs(b, pick(or(ss.filter((s) => B.get(b, 'shell', s).faces.length === 1), ss))) } : null;
        case 'mev': return cs.length ? { r: E.mev(b, pick(cs), pt()), undo: (x) => E.kev(x.brep, x.edge) } : null;
        case 'kev': return es.length ? { r: E.kev(b, pick(or(es.filter(oneLoop), es))) } : null;
        case 'semv': {
          if (!es.length) return null;
          const e = B.get(b, 'edge', pick(es));
          return { r: E.semv(b, e.id, e.t0 + (e.t1 - e.t0) * g.range(0.2, 0.8)), undo: (x) => E.jekv(x.brep, x.vertex) };
        }
        case 'jekv': return vs.length ? { r: E.jekv(b, pick(or(vs.filter((v) => (adj.edgesOfVertex.get(v) || []).length === 2), vs))) } : null;
        case 'mef': {
          const ls = B.ids(b, 'loop').filter((l) => B.get(b, 'loop', l).face !== null && B.get(b, 'loop', l).coedges.length >= 2);
          if (!ls.length) return null;
          const lc = B.get(b, 'loop', pick(ls)).coedges, ca = pick(lc);
          return { r: E.mef(b, ca, pick(lc.filter((c) => c !== ca))), undo: (x) => E.kef(x.brep, x.edge) };
        }
        case 'kef': return es.length ? { r: E.kef(b, pick(or(es.filter((e) => (adj.coedgesOfEdge.get(e) || []).length === 2 && !oneLoop(e)), es))) } : null;
        case 'mekr': {
          const fl = fs.filter((f) => loopsOf(f).length >= 2);
          if (!fl.length) return null;
          const L = loopsOf(pick(fl)), lb = pick(L.slice(1)), la = pick(L.filter((l) => l !== lb));   // cb in a ring: exact inverse
          return { r: E.mekr(b, pick(B.get(b, 'loop', la).coedges), pick(B.get(b, 'loop', lb).coedges)), undo: (x) => E.kemr(x.brep, x.edge) };
        }
        case 'kemr': return es.length ? { r: E.kemr(b, pick(or(es.filter(oneLoop), es))) } : null;
        case 'kfmrh': {
          const one = fs.filter((f) => loopsOf(f).length === 1);
          if (!one.length) return null;
          const kill = pick(one), K = B.get(b, 'face', kill), keeps = fs.filter((f) => f !== kill && B.get(b, 'face', f).shell === K.shell);
          if (!keeps.length) return null;
          const keep = pick(keeps);
          return { r: E.kfmrh(b, kill, keep), undo: (x) => E.mfkrh(x.brep, keep, x.ring, { surface: K.surface, sense: K.sense }) };
        }
        case 'mfkrh': {
          const fl = fs.filter((f) => loopsOf(f).length >= 2);
          if (!fl.length) return null;
          const f = pick(fl);
          return { r: E.mfkrh(b, f, pick(loopsOf(f).slice(1))) };
        }
      }
      return null;
    };
    let b = B.EMPTY, G = 0, made = 0, refused = 0, countsOk = true, epOk = true, undone = 0, undoOk = true, kept = true;
    const done = Object.fromEntries(W.map(([n]) => [n, 0])), bad = [];
    for (let step = 0; step < 600; step++) {
      const name = choose(), before = B.euler(b), was = step % 25 === 0 ? JSON.stringify(B.toData(b)) : null;
      let a;
      try { a = attempt(b, name); } catch (e) {
        if (e && e.code === BAD) { refused++; if (was !== null && JSON.stringify(B.toData(b)) !== was) kept = false; continue; }
        bad.push(name + ': ' + (e && e.code) + ' ' + JSON.stringify(e && e.vars));
        continue;
      }
      if (!a) continue;
      if (was !== null && JSON.stringify(B.toData(b)) !== was) kept = false;
      const after = B.euler(a.r.brep), dd = D[name];
      if (after.V - before.V !== dd[0] || after.E - before.E !== dd[1] || after.F - before.F !== dd[2] || after.L - before.L !== dd[3] || after.S - before.S !== dd[4]) countsOk = false;
      G += dd[5];
      if (after.V - after.E + after.F - after.R !== 2 * (after.S - G)) epOk = false;
      if (a.undo && g.int(2) === 0) {
        undone++;
        try { if (canon(a.undo(a.r).brep) !== canon(b)) undoOk = false; } catch (e) { undoOk = false; bad.push('undo ' + name + ': ' + (e && e.code) + ' ' + JSON.stringify(e && e.vars)); }
      }
      b = a.r.brep;
      done[name]++;
      made++;
    }
    const few = Object.entries(done).filter(([, n]) => n < 3).map(([k]) => k), fin = B.euler(b);
    ok(bad.length === 0 && countsOk && epOk && few.length === 0, `600 random operations (${made} made, ${refused} refused with bad_input): each changed V, E, F, L and S as its table says, and V − E + F − R = 2 (S − G) held after every one, G counted by kfmrh and mfkrh (${Object.entries(done).map(([k, n]) => k + ' ' + n).join(', ')}; at the end V ${fin.V}, E ${fin.E}, F ${fin.F}, R ${fin.R}, S ${fin.S})` + (bad.length ? '; failed: ' + bad.slice(0, 3).join('; ') : '') + (few.length ? '; made fewer than 3 times: ' + few.join(', ') : ''));
    ok(undoOk && undone > 50, `an operation followed by its inverse gives back the model it started from, up to ids (${undone} pairs: mevvlfs–kevvlfs, mev–kev, semv–jekv, mef–kef, mekr–kemr, kfmrh–mfkrh)`);
    ok(kept, 'an operation leaves the snapshot it was given as it was, whether it succeeds or is refused (checked every 25 steps)');

    // ---------------------------------------------------------------------------------------- refusals
    const lam = E.mevvlfs(B.EMPTY, [0, 0, 0], [1, 0, 0]);
    const sq = Bu.polygon(B.EMPTY, [[0, 0, 0], [4, 0, 0], [4, 3, 0], [0, 3, 0]]), pb = sq.brep, pData = JSON.stringify(B.toData(pb));
    const fc = B.get(pb, 'loop', B.get(pb, 'face', sq.front).loops[0]).coedges, bc = B.get(pb, 'loop', B.get(pb, 'face', sq.back).loops[0]).coedges;
    const anEdge = B.get(pb, 'coedge', fc[0]).edge, strut = E.mev(pb, fc[0], [1, 1, 0]);
    const withPcurve = B.edit(pb, (d) => d.set('coedge', fc[0], { pcurve: A.lineThrough([0, 0, 0], [1, 0, 0]) }));
    // odd models built by hand: a loop in no face; two faces of one closed edge; an edge between two shells; one face
    // holding both uses of an edge in two loops
    const odd = B.edit(B.EMPTY, (d) => {
      const a = d.vertex([0, 0, 0]), z = d.vertex([1, 0, 0]), w = d.vertex([5, 5, 5]), f0 = Fr.frameFromZX([0, 0, 0], [0, 0, 1], [1, 0, 0]);
      const pl = S.plane({ frame: f0, urange: [-9, 9], vrange: [-9, 9] }), line = () => A.lineThrough([0, 0, 0], [1, 0, 0]), back = () => A.lineThrough([1, 0, 0], [0, 0, 0]);
      const e1 = d.edge(line(), 0, 1, a, z), e2 = d.edge(back(), 0, 1, z, a), e3 = d.edge(line(), 0, 1, a, z), e4 = d.edge(back(), 0, 1, z, a);
      d.shell([d.face(pl, 1, [d.loop(null, [[e1, 1], [e2, 1]])])]);                          // faces 0 and 1 share e1 (id 0) …
      d.shell([d.face(pl, -1, [d.loop(null, [[e1, -1], [e3, 1]])])]);                        // … from two shells
      d.face(pl, 1, [d.loop(null, [[e4, 1], [e3, 1]]), d.loop(null, [[e4, -1], [e2, 1]])]);     // face 2: e4 (id 3) in two of its loops
      const circ = A.circle({ frame: Fr.frameFromZX([5, 5, 5], [0, 0, 1], [1, 0, 0]), r: 1, range: [0, 6] });
      const ec = d.edge(circ, 0, 6, w, w);
      d.shell([d.face(pl, 1, [d.loop(null, [[ec, 1]])]), d.face(pl, -1, [d.loop(null, [[ec, -1]])])]);   // e5 (id 4): one coedge a loop
      d.loop(null, [[d.edge(line(), 0, 1, a, z), 1], [e2, 1]]);                              // a loop in no face, with e6 (id 5)
    });
    const looseLoop = B.ids(odd, 'loop').find((l) => B.get(odd, 'loop', l).face === null), lc = B.get(odd, 'loop', looseLoop).coedges;
    const tries = [
      [() => E.mev(pb, 999, [0, 0, 1]), { name: 'coedge', why: 'no_such_id' }],
      [() => E.kev(lam.brep, lam.edge), { name: 'edge', why: 'lamina' }],
      [() => E.kev(pb, anEdge), { name: 'edge', why: 'not_a_strut' }],
      [() => E.kevvlfs(pb, sq.shell), { name: 'shell', why: 'not_a_lamina' }],
      [() => E.semv(pb, anEdge, -1), { name: 't', why: 'out_of_range' }],
      [() => E.semv(withPcurve, anEdge, 0.5), { name: 'edge', why: 'has_pcurves' }],
      [() => E.jekv(pb, 0), { name: 'vertex', why: 'not_a_split' }],
      [() => E.jekv(strut.brep, 0), { name: 'vertex', why: 'not_two_edges' }],
      [() => E.mef(pb, fc[0], fc[0]), { name: 'coedges', why: 'same_coedge' }],
      [() => E.mef(pb, fc[0], bc[0]), { name: 'coedges', why: 'not_in_one_loop' }],
      [() => E.mef(odd, lc[0], lc[1]), { name: 'loop', why: 'not_in_a_face' }],
      [() => E.mef(pb, fc[0], fc[1], { curve: {} }), { name: 'curve', why: 'not_a_curve' }],
      [() => E.kef(lam.brep, lam.edge), { name: 'edge', why: 'same_loop' }],
      [() => E.kef(odd, 0), { name: 'edge', why: 'two_shells' }],
      [() => E.kef(odd, 3), { name: 'edge', why: 'same_face' }],
      [() => E.kef(odd, 4), { name: 'edge', why: 'empty_loop' }],
      [() => E.kef(odd, 5), { name: 'edge', why: 'not_two_faces' }],
      [() => E.kef(pb, anEdge, { keep: 999 }), { name: 'keep', why: 'not_on_edge' }],
      [() => E.mekr(pb, fc[0], fc[1]), { name: 'coedges', why: 'same_loop' }],
      [() => E.mekr(pb, fc[0], bc[0]), { name: 'coedges', why: 'not_in_one_face' }],
      [() => E.kemr(pb, anEdge), { name: 'edge', why: 'not_twice_in_loop' }],
      [() => E.kemr(strut.brep, strut.edge), { name: 'edge', why: 'adjacent' }],
      [() => E.kfmrh(pb, sq.front, sq.front), { name: 'faces', why: 'same_face' }],
      [() => E.kfmrh(odd, 2, 0), { name: 'face', why: 'not_one_loop' }],
      [() => E.kfmrh(odd, 0, 1), { name: 'faces', why: 'two_shells' }],
      [() => E.mfkrh(pb, sq.front, B.get(pb, 'face', sq.front).loops[0]), { name: 'ring', why: 'not_a_ring' }],
    ];
    const missed = tries.map(([f, vars], i) => (refuses(f, BAD, vars) ? null : i)).filter((i) => i !== null);
    ok(missed.length === 0 && JSON.stringify(B.toData(pb)) === pData, `the operators' refusals, each typed (${tries.length}: ${[...new Set(tries.map(([, v]) => v.why))].join(', ')}); the snapshot refused is unchanged` + (missed.length ? ' (not refused as expected: ' + missed.join(', ') + ')' : ''));

    // ---------------------------------------------------------------------------------------- what the defaults keep
    const big = 1000 * P.DEFAULT_TOL.lin, half = E.semv(pb, anEdge, 0.5);
    const joined = E.jekv(B.edit(half.brep, (d) => d.set('edge', half.edge, { tol: big })), half.vertex);
    const mf = E.mef(pb, fc[0], fc[2]), mb = E.mef(pb, bc[0], bc[2]), Ff = B.get(pb, 'face', sq.front), Fb = B.get(pb, 'face', sq.back);
    const killed = E.kef(mf.brep, mf.edge).brep;
    const s1 = E.mev(pb, fc[0], [1, 1, 0]), s2 = E.mev(s1.brep, against(s1.brep, s1.edge), [2, 1, 0]), rg = E.kemr(s2.brep, s1.edge);
    const lifted = E.mfkrh(rg.brep, sq.front, rg.ring);
    ok(B.get(joined.brep, 'edge', anEdge).tol === big && B.get(mf.brep, 'face', mf.face).surface === Ff.surface && B.get(mf.brep, 'face', mf.face).sense === Ff.sense && B.get(mb.brep, 'face', mb.face).sense === Fb.sense && B.ids(killed, 'face').includes(sq.front) && !B.ids(killed, 'face').includes(mf.face)
      && B.get(rg.brep, 'face', sq.front).loops.length === 2 && B.get(lifted.brep, 'face', lifted.face).sense === -Ff.sense && B.get(lifted.brep, 'face', lifted.face).surface === Ff.surface, 'defaults: jekv keeps the larger of the two tolerances; mef\'s new face takes its parent\'s surface and sense (front and back); kef keeps the face it cut from (its id stays); kemr leaves a ring, and mfkrh makes it a face on the same surface facing the other way');
    // a vertex another shell also uses is not the operators' to remove
    const shared = B.edit(B.EMPTY, (d) => {
      const pl = S.plane({ frame: Fr.frameFromZX([0, 0, 0], [0, 0, 1], [1, 0, 0]), urange: [-9, 9], vrange: [-9, 9] });
      const a = d.vertex([0, 0, 0]), z = d.vertex([1, 0, 0]), w = d.vertex([1, 1, 0]), q = d.vertex([2, 0, 0]);
      const e0 = d.edge(A.lineThrough([0, 0, 0], [1, 0, 0]), 0, 1, a, z), e1 = d.edge(A.lineThrough([1, 0, 0], [1, 1, 0]), 0, 1, z, w), e2 = d.edge(A.lineThrough([1, 1, 0], [2, 0, 0]), 0, Math.SQRT2, w, q);
      d.shell([d.face(pl, 1, [d.loop(null, [[e0, 1], [e1, 1], [e1, -1], [e0, -1]])])]);   // a lamina with a strut out to w …
      d.shell([d.face(pl, 1, [d.loop(null, [[e2, 1], [e2, -1]])])]);                      // … and another shell's lamina at w
    });
    ok(B.count(E.kev(shared, 0).brep, 'vertex') === 3 && refuses(() => E.kev(shared, 1), BAD, { name: 'edge', why: 'not_a_strut' }) && refuses(() => E.kevvlfs(shared, 1), BAD, { name: 'shell', why: 'not_a_lamina' }), 'kev removes a strut whose far vertex nothing else uses, and refuses one whose far vertex another shell uses; kevvlfs refuses a lamina whose vertex another shell uses');
    const se = B.euler(pb), frontPts = pts(pb, B.get(pb, 'face', sq.front).loops[0]), F0 = B.get(pb, 'face', sq.front), F1 = B.get(pb, 'face', sq.back);
    ok(se.V === 4 && se.E === 4 && se.F === 2 && se.L === 2 && se.S === 1 && genus(pb) === 0 && closed(pb) && placed(pb) && minRot(frontPts.map(String)) === minRot([[0, 0, 0], [4, 0, 0], [4, 3, 0], [0, 3, 0]].map(String)) && F0.surface === F1.surface && F0.sense === 1 && F1.sense === -1 && F0.surface.frame.z[2] === 1, 'a polygon lamina: 4 vertices, 4 edges, 2 faces on one plane (the front through the points in their order, its normal +z by Newell; the back the other way, sense −1), each edge used once each way');

    // ---------------------------------------------------------------------------------------- the sweep and the polyhedron builder
    const frameR = () => Fr.frameFromZX([g.range(-9, 9), g.range(-9, 9), g.range(-9, 9)], [g.range(-1, 1), g.range(-1, 1), g.range(0.2, 1)], [1, g.range(-1, 1), g.range(-1, 1)]);
    const shapeOf = (b2) => { const m = new Map(); for (const f of B.ids(b2, 'face')) { const F = B.get(b2, 'face', f); m.set(minRot(pts(b2, F.loops[0]).map(String)), V.scale(F.surface.frame.z, F.sense)); } return m; };
    const sameShape = (x, y) => { const X = shapeOf(x), Y = shapeOf(y); if (X.size !== Y.size) return false; for (const [k, n] of X) { const m = Y.get(k); if (!m || V.dot(n, m) < 1 - 1e-12) return false; } return true; };
    const polys = [
      [[0, 0, 0], [4, 0, 0], [4, 3, 0], [0, 3, 0]],
      Array.from({ length: 6 }, (_, k) => [2 * [1, 0.5, -0.5, -1, -0.5, 0.5][k], 2 * [0, 1, 1, 0, -1, -1][k] * Math.sqrt(3) / 2, 1]),
      [[0, 0, 0], [3, 0, 0], [3, 1, 0], [1, 1, 0], [1, 3, 0], [0, 3, 0]],                        // an L: not convex
    ];
    for (let i = 0; i < 5; i++) {                                                               // convex, in random planes
      const f = frameR(), n = 3 + g.int(6), th = Array.from({ length: n }, () => g.range(0, 6.283)).sort((x, y) => x - y), r = g.range(1, 5);
      polys.push(th.map((t) => Fr.toWorld(f, [r * Math.cos(t), r * Math.sin(t), 0])));
    }
    let prisms = 0, sweepOk = true;
    for (const poly of polys) {
      const n = poly.length, lm = Bu.polygon(B.EMPTY, poly), nrm = V.unit(newell(poly));
      const vec = V.add(V.scale(nrm, g.range(1, 4)), V.scale(V.sub(poly[1], poly[0]), g.range(-0.3, 0.3)));   // oblique as often as not
      const sw = Bu.sweep(lm.brep, lm.front, vec);
      const faces = [poly.map((_, k) => n - 1 - k), poly.map((_, k) => n + k), ...poly.map((_, k) => [k, (k + 1) % n, n + (k + 1) % n, n + k])];
      const ph = Bu.polyhedron(B.EMPTY, [...poly, ...poly.map((p) => V.add(p, vec))], faces);
      const ew = B.euler(sw.brep), eh = B.euler(ph.brep), area = V.len(newell(poly)) / 2, vol = area * V.dot(vec, nrm);
      const good = ew.V === 2 * n && ew.E === 3 * n && ew.F === n + 2 && ew.R === 0 && same(ew, eh) && sameShape(sw.brep, ph.brep) && closed(sw.brep) && placed(sw.brep) && closed(ph.brep) && placed(ph.brep)
        && Math.abs(volume(sw.brep) - vol) <= 1e-12 * vol * 100 && Math.abs(volume(ph.brep) - vol) <= 1e-12 * vol * 100 && sw.top === lm.front && sw.sides.length === n && B.count(sw.brep, 'solid') === 1;
      if (!good) sweepOk = false;
      prisms++;
    }
    ok(sweepOk, `acceptance (HANDOFF § 14, S12): ${prisms} prisms (a rectangle, a hexagon, an L that is not convex, five random convex polygons in random planes; swept straight or obliquely) made by the Euler sweep match the same prisms from the polyhedron builder face for face — the same vertices round each face, the same outward normals — with V = 2n, E = 3n, F = n + 2, each edge used once each way, every face on its plane, the volume area × height`);

    // ---------------------------------------------------------------------------------------- the builders' refusals
    const cubeP = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
    const cubeF = [[3, 2, 1, 0], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
    const cube = Bu.polyhedron(B.EMPTY, cubeP, cubeF), inside = Bu.polyhedron(B.EMPTY, cubeP, cubeF.map((f) => f.slice().reverse()));
    ok(closed(cube.brep) && placed(cube.brep) && Math.abs(volume(cube.brep) - 1) <= 1e-15 && closed(inside.brep) && placed(inside.brep) && Math.abs(volume(inside.brep) - 1) <= 1e-15 && genus(cube.brep) === 0, 'polyhedron: a unit cube comes out closed, on its planes, volume 1; given inside out (every face reversed), it is turned outward');
    const bent = cubeP.map((p, i) => (i === 6 ? [1, 1, 1.1] : p));
    const two = [...cubeP, ...cubeP.map((p) => V.add(p, [5, 0, 0]))], twoF = [...cubeF, ...cubeF.map((f) => f.map((i) => i + 8))];
    const btries = [
      [() => Bu.polyhedron(B.EMPTY, cubeP, cubeF.slice(1)), { name: 'faces', why: 'not_closed' }],
      [() => Bu.polyhedron(B.EMPTY, cubeP, [cubeF[0].slice().reverse(), ...cubeF.slice(1)]), { name: 'faces', why: 'not_oriented' }],
      [() => Bu.polyhedron(B.EMPTY, bent, cubeF), { name: 'faces', why: 'not_planar' }],
      [() => Bu.polyhedron(B.EMPTY, two, twoF), { name: 'faces', why: 'not_connected' }],
      [() => Bu.polyhedron(B.EMPTY, [...cubeP, [9, 9, 9]], cubeF), { name: 'faces', why: 'unused_point' }],
      [() => Bu.polyhedron(B.EMPTY, [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], [[0, 1, 2, 3], [3, 2, 1, 0], [0, 1, 2, 3], [3, 2, 1, 0]]), { name: 'faces', why: 'not_closed' }],
      [() => Bu.polyhedron(B.EMPTY, [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], [[0, 1, 2], [0, 2, 3], [1, 0, 3], [1, 3, 2]]), { name: 'faces', why: 'flat' }],   // a square, both sides
      [() => Bu.polyhedron(B.EMPTY, cubeP, [[0, 1, 1, 2], ...cubeF.slice(1)]), { name: 'faces', why: 'not_a_face' }],
      [() => Bu.polyhedron(B.EMPTY, cubeP.map((p, i) => (i === 1 ? [0, 0, 0] : p)), cubeF), { name: 'faces', why: 'short_edge' }],
      [() => Bu.polyhedron(B.EMPTY, cubeP.slice(0, 3), [[0, 1, 2]]), { name: 'points', why: 'too_few' }],
      [() => Bu.polygon(B.EMPTY, [[0, 0, 0], [1, 0, 0]]), { name: 'points', why: 'too_few' }],
      [() => Bu.polygon(B.EMPTY, [[0, 0, 0], [1, 0, 0], [2, 0, 0]]), { name: 'points', why: 'degenerate' }],
      [() => Bu.polygon(B.EMPTY, [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 1]]), { name: 'points', why: 'not_planar' }],
      [() => Bu.polygon(B.EMPTY, [[0, 0, 0], [1, 0, 0], [1, 0, 0], [0, 1, 0]]), { name: 'points', why: 'short_edge' }],
      [() => Bu.polygon(B.EMPTY, [[0, 0], [1, 0], [0, 1]]), { name: 'points', why: 'not_points' }],
      [() => Bu.sweep(pb, sq.front, [0, 0, -1]), { name: 'vector', why: 'inside_out' }],
      [() => Bu.sweep(pb, sq.front, [1, 0, 0]), { name: 'vector', why: 'parallel' }],
      [() => Bu.sweep(lam.brep, lam.face, [0, 0, 1]), { name: 'face', why: 'not_a_polygon' }],
      [() => Bu.sweep(odd, 2, [0, 0, 1]), { name: 'face', why: 'not_one_loop' }],
    ];
    // sewing by geometry: the cube as six separate faces, each corner copied with its own jitter of up to 0.3 tol.lin
    const lin = P.DEFAULT_TOL.lin, jit = (p) => V.add(p, V.scale(g.unit3(), g.range(0, 0.3) * lin));
    const sewn = Bu.sew(B.EMPTY, cubeF.map((f) => f.map((i) => jit(cubeP[i])))), es2 = B.euler(sewn.brep);
    ok(sewn.vertices === 8 && es2.V === 8 && es2.E === 12 && es2.F === 6 && closed(sewn.brep) && placed(sewn.brep, lin) && Math.abs(volume(sewn.brep) - 1) <= 1e-5 && B.count(sewn.brep, 'solid') === 1, 'sew (HANDOFF § 8.4, by geometry within tolerance): a cube given as six separate faces, each corner copied with its own jitter of up to 0.3 tol.lin, comes together as 8 vertices, 12 edges and 6 faces, closed and outward, every vertex within tol.lin of its faces\' planes');
    const chained = cubeF.map((f, fi) => f.map((i) => (i === 0 ? [[0, 2, 5].indexOf(fi) * 0.6 * lin, 0, 0] : cubeP[i])));   // corner 0 at 0, 0.6 and 1.2 tol.lin
    const merged = cubeF.map((f, fi) => f.map((i) => (fi === 1 && i === 5 ? V.add(cubeP[4], [0.5 * lin, 0, 0]) : cubeP[i])));  // face 1's corners 4 and 5 meet
    const nearTwo = cubeF.map((f, fi) => f.map((i) => (i === 0 ? [[0, 1.5, 0.75][[0, 2, 5].indexOf(fi)] * lin, 0, 0] : cubeP[i])));   // corner 0 at 0, 1.5 and 0.75 tol.lin: the last is near both
    btries.push(
      [() => Bu.sew(B.EMPTY, chained), { name: 'faces', why: 'ambiguous' }],
      [() => Bu.sew(B.EMPTY, nearTwo), { name: 'faces', why: 'ambiguous' }],
      [() => Bu.sew(B.EMPTY, merged), { name: 'faces', why: 'short_edge' }],
      [() => Bu.sew(B.EMPTY, 'cube'), { name: 'faces', why: 'not_a_list' }],
    );
    const bmissed = btries.map(([f, vars], i) => (refuses(f, BAD, vars) ? null : i)).filter((i) => i !== null);
    ok(bmissed.length === 0, `the builders' refusals, each typed (${btries.length}: ${[...new Set(btries.map(([, v]) => v.why))].join(', ')})` + (bmissed.length ? ' (not refused as expected: ' + bmissed.join(', ') + ')' : ''));

    // ---------------------------------------------------------------------------------------- genus 1
    {
      // a square frame, 3 × 3 with a 1 × 1 hole, height 2, as sixteen quadrilaterals
      const ring = (z, s, o) => [[o, o, z], [o + s, o, z], [o + s, o + s, z], [o, o + s, z]];
      const pt4 = [...ring(0, 3, 0), ...ring(0, 1, 1), ...ring(2, 3, 0), ...ring(2, 1, 1)];   // outer 0–3, inner 4–7, top outer 8–11, top inner 12–15
      const fr = [];
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        fr.push([8 + i, 8 + j, 12 + j, 12 + i], [i, 4 + i, 4 + j, j], [i, j, 8 + j, 8 + i], [4 + i, 12 + i, 12 + j, 4 + j]);
      }
      const tor = Bu.polyhedron(B.EMPTY, pt4, fr), et = B.euler(tor.brep);
      ok(et.V === 16 && et.E === 32 && et.F === 16 && et.R === 0 && genus(tor.brep) === 1 && closed(tor.brep) && placed(tor.brep) && Math.abs(volume(tor.brep) - 16) <= 1e-12, 'polyhedron: a square frame (sixteen quadrilaterals) is a torus — V − E + F = 0, genus 1 — closed, every face on its plane, volume 8 × 2');

      // the same kind of hole made with Euler operators: a block (a square swept up), a square drawn on its top (struts, then
      // mef closes it into a face of its own, kemr leaves it a ring of the top), that face swept down through the block (a
      // pocket as deep as the block), and kfmrh kills it into the bottom face: a ring there too, and a hole through
      const h = 2, base = Bu.polygon(B.EMPTY, [[0, 0, 0], [3, 0, 0], [3, 3, 0], [0, 3, 0]]), blk = Bu.sweep(base.brep, base.front, [0, 0, h]);
      let m = blk.brep;
      const corner = B.get(m, 'loop', B.get(m, 'face', blk.top).loops[0]).coedges.find((c) => B.get(m, 'vertex', start(m, c)).point.join() === [0, 0, h].join());
      const s0 = E.mev(m, corner, [1, 1, h]); m = s0.brep;
      const s1 = E.mev(m, against(m, s0.edge), [2, 1, h]); m = s1.brep;
      const s2 = E.mev(m, against(m, s1.edge), [2, 2, h]); m = s2.brep;
      const s3 = E.mev(m, against(m, s2.edge), [1, 2, h]); m = s3.brep;
      const sqf = E.mef(m, against(m, s3.edge), along(m, s1.edge)); m = sqf.brep;
      const step1 = B.euler(m);
      m = E.kemr(m, s0.edge).brep;
      const ringed = B.get(m, 'face', blk.top).loops.length === 2;
      m = Bu.sweep(m, sqf.face, [0, 0, -h]).brep;
      const pocket = B.euler(m);
      m = E.kfmrh(m, sqf.face, base.back).brep;
      const eh = B.euler(m);
      ok(step1.F === 7 && ringed && pocket.F === 11 && pocket.R === 1 && genus(blk.brep) === 0 && eh.V === 16 && eh.E === 24 && eh.F === 10 && eh.L === 12 && eh.R === 2 && eh.S === 1 && genus(m) === 1, `a hole through a block by Euler operators: struts and mef draw a square face on the top (F 7), kemr makes it a ring, a sweep down makes a pocket (F 11, R 1), kfmrh opens it into the bottom: V 16, E 24, F 10, R 2 — genus 1`);
      ok(closed(m) && placed(m) && Math.abs(volume(m) - 8 * h) <= 1e-12 * 8 * h, `the hole's walls face into it, every face is on its plane with its normal outward, each edge is used once each way, and the volume is (9 − 1) × ${h} (${volume(m)})`);
      ok(refuses(() => E.kfmrh(m, blk.top, base.back), BAD, { name: 'face', why: 'not_one_loop' }), 'kfmrh refuses a face with a ring: only a face of one loop can become a ring');
    }
  });
}
