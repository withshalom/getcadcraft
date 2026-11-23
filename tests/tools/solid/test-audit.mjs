/* SPDX-License-Identifier: Apache-2.0 */
/**
 * test-audit.mjs — engine.solid's S14 tests (audit/audit.js, audit/corpus.js), registered by test.mjs: section `audit`.
 *
 * The corpus (box, cylinder, cone, sphere, torus, prism with a hole, vase) over several seeds: every body audits clean, its
 * volume agrees with the closed form (computed by the auditor's own Green's-theorem quadrature, which shares nothing with the
 * closed forms), its Euler–Poincaré number and genus are the ones the shape has, and the faces, surfaces and loops are the
 * ones the corpus says it has. Then the referee's own proof: bodies broken on purpose, one fault each, and the audit must
 * report the finding that fault is, and — for the faults that touch one thing only — nothing else; every finding code the
 * auditor can make is fired by at least one of them. Then notes, hollow solids, the cap on findings, refusals, and that
 * an audit changes nothing and gives the same answer twice.
 */

export async function register({ section, ok, refuses, same, deepFrozen, appUrl }) {
  const P = await import(appUrl('solid/index.js'));
  const A = await import(appUrl('solid/audit/audit.js'));
  const K = await import(appUrl('solid/audit/corpus.js'));
  const B = P.brep, Bu = P.build, Tr = P.trim, Pc = P.pcurve, V = P.vec3, C = P.curve, AS = P.analyticSurface, AC = P.analyticCurve, SF = P.surface, Fr = P.frame;
  const BAD = 'solid.err.bad_input', TAU = P.trig.TAU;

  const codesOf = (r) => new Set(r.problems.map((p) => p.code.replace('solid.audit.', '')));
  const warned = (r) => new Set(r.problems.filter((p) => p.severity === 'warning').map((p) => p.code.replace('solid.audit.', '')));
  const volumeOf = (r) => Object.values(r.stats.shellStats).map((s) => s.volume);
  const surfaces = (b) => new Set(B.ids(b, 'face').map((f) => SF.typeOf(B.get(b, 'face', f).surface)));

  // ---------------------------------------------------------------------------------------------- the corpus is clean
  section('audit', 'S14: the auditor passes the primitive corpus and fails every body broken on purpose', () => {
    const SEEDS = [1, 2, 3, 4, 5, 6];
    let cleanOk = true, bad = [], worstVol = 0, worstGap = 0, bodies = 0;
    const seenSurfaces = new Set(), names = new Set();
    for (const seed of SEEDS) {
      for (const c of K.corpus({ seed })) {
        bodies++;
        names.add(c.name);
        const r = A.audit(c.brep, { genus: c.genus });
        for (const s of surfaces(c.brep)) seenSurfaces.add(s);
        const v = volumeOf(r);
        const rel = Math.abs(v[0] - c.volume) / c.volume;
        worstVol = Math.max(worstVol, rel);
        worstGap = Math.max(worstGap, r.stats.maxVertexGap, r.stats.maxSurfaceGap, r.stats.maxPcurveGap);
        if (!(r.ok && r.problems.length === 0 && v.length === 1 && rel <= 1e-12 && Object.values(r.stats.shellStats)[0].genus === c.genus)) bad.push(`${c.name}/${seed}: ${r.problems.map((p) => p.code).join(',')} vol ${v[0]} want ${c.volume}`);
      }
    }
    cleanOk = bad.length === 0;
    ok(cleanOk && names.size === 7 && bodies === 42, `the corpus (7 bodies × ${SEEDS.length} seeds = ${bodies}) audits clean: no findings at all, genus as the shape has it (0; 1 for the torus; 2 for the prism with two holes)` + (bad.length ? '; failed: ' + bad.slice(0, 3).join(' | ') : ''));
    ok(worstVol <= 1e-12, `each body's volume, from Green's theorem on its own faces, agrees with the closed form to ${worstVol.toExponential(1)} (relative, worst of ${bodies})`);
    ok(['plane', 'cylinder', 'cone', 'sphere', 'torus', 'revolution'].every((t) => seenSurfaces.has(t)), 'the corpus has faces on a plane, a cylinder, a cone, a sphere, a torus and a surface of revolution (' + [...seenSurfaces].join(', ') + ')');
    ok(worstGap <= 1e-9, `the worst gap the audit measured (vertex on edge, edge on surface, pcurve on edge) is ${worstGap.toExponential(1)}`);
    const again = K.corpus({ seed: 3 }), first = K.corpus({ seed: 3 });
    ok(again.every((c, i) => same(B.toData(c.brep), B.toData(first[i].brep)) && c.volume === first[i].volume), 'the same seed gives the same corpus, bit for bit');
    ok(deepFrozen(A.audit(K.corpus({ seed: 1 })[0].brep)), 'an audit result is frozen all the way down');
    const e = A.audit(B.EMPTY);
    ok(e.ok && e.problems.length === 0 && e.summary.length === 4, 'an empty model has nothing to find');

    // ------------------------------------------------------------------------------------------ the referee's proof
    const base = K.corpus({ seed: 1 });
    const get = (n) => base.find((c) => c.name === n).brep;
    const at = (b, n, k = 0) => B.ids(b, 'face').filter((f) => SF.typeOf(B.get(b, 'face', f).surface) === n)[k];
    const flip = (d, l) => {                                        // a loop run the other way: its coedges reversed, each against its sense
      const cs = [...d.get('loop', l).coedges].reverse();
      for (const c of cs) d.set('coedge', c, { sense: -d.get('coedge', c).sense });
      d.relink(l, cs);
    };
    const dropFace = (d, f) => {
      const F = d.get('face', f), sh = d.get('shell', F.shell);
      for (const l of F.loops) { for (const c of d.get('loop', l).coedges) d.remove('coedge', c); d.remove('loop', l); }
      d.remove('face', f);
      d.set('shell', sh.id, { faces: sh.faces.filter((x) => x !== f) });
    };
    const shiftLine = (pc, t0, t1, du, dv) => { const a = C.point(pc, t0), b = C.point(pc, t1); return Pc.uvLine([a[0] + du, a[1] + dv], [b[0] + du, b[1] + dv], t0, t1); };
    const coedgeWith = (b, face) => B.get(b, 'loop', B.get(b, 'face', face).loops[0]).coedges.find((c) => B.get(b, 'coedge', c).pcurve);
    const another = (data, sh, dx) => {                              // a second cube in the same model, moved by dx (a new shell and solid)
      const pts = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]].map((p) => V.add(p, dx));
      return Bu.polyhedron(data, pts, [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]);
    };
    const attach = (b) => Tr.attach(b).brep;

    const cube = (dx = [0, 0, 0], s = 1, inward = false) => {        // a cube of side s, alone in its model, optionally inside out
      let b = B.EMPTY;
      const pts = [[0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0], [0, 0, s], [s, 0, s], [s, s, s], [0, s, s]].map((p) => V.add(p, dx));
      b = attach(Bu.polyhedron(b, pts, [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]).brep);
      if (!inward) return b;
      return B.edit(b, (d) => { for (const f of B.ids(b, 'face')) { for (const l of B.get(b, 'face', f).loops) flip(d, l); d.set('face', f, { sense: -d.get('face', f).sense }); } });
    };

    // an edge whose ends are on its faces and whose middle is too, between them off: a cubic with offsets (0, h, −h, 0) is zero at
    // t = 0, ½ and 1 and 3h t (1 − t)(1 − 2t) between
    const sCurve = () => {
      const b = cube([0, 0, 0], 2), e = B.ids(b, 'edge')[0], E = B.get(b, 'edge', e), a = B.get(b, 'vertex', E.v0).point, z = B.get(b, 'vertex', E.v1).point;
      const t = V.unit(V.sub(z, a)), w = V.unit(V.sub([1, 1, 1], V.scale(t, V.dot(t, [1, 1, 1]))));
      const curve = P.nurbsCurve.make({ deg: 3, knots: [0, 0, 0, 0, 1, 1, 1, 1], cvs: [a, V.madd(V.add(V.scale(a, 2 / 3), V.scale(z, 1 / 3)), 0.6, w), V.madd(V.add(V.scale(a, 1 / 3), V.scale(z, 2 / 3)), -0.6, w), z], w: [1, 1, 1, 1] });
      return B.edit(b, (d) => d.set('edge', e, { curve, t0: 0, t1: 1 }));
    };
    const sCurveCheck = () => {
      const bad = sCurve();
      ok(codesOf(A.audit(bad)).has('edge_off_surface') && !codesOf(A.audit(bad, { samples: 2 })).has('edge_off_surface'), 'the samples option is honoured: an edge that leaves its faces only between its ends and its middle is found at 8 samples a coedge and not at 2 (the ends and the middle all lie on them)');
    };
    const cases = [];
    const add = (name, make, want, only) => cases.push({ name, make, want, only });

    add('a vertex moved off its edge', () => { const b = get('cylinder'); return B.edit(b, (d) => { const v = B.ids(b, 'vertex')[0]; d.set('vertex', v, { point: V.add(B.get(b, 'vertex', v).point, [0.5, 0, 0]) }); }); }, ['vertex_off_edge'], true);
    add('a vertex with a tolerance above the largest an edge may carry', () => { const b = get('cylinder'); return B.edit(b, (d) => d.set('vertex', B.ids(b, 'vertex')[0], { tol: 1 })); }, ['tolerance'], true);
    add('an edge with a tolerance above it', () => { const b = get('cone'); return B.edit(b, (d) => d.set('edge', B.ids(b, 'edge')[0], { tol: 1 })); }, ['tolerance'], true);
    add('a cylinder face moved to a wider cylinder', () => { const b = get('cylinder'), f = at(b, 'cylinder'), s = B.get(b, 'face', f).surface; return B.edit(b, (d) => d.set('face', f, { surface: AS.cylinder({ frame: s.frame, r: s.r + 0.5, urange: s.urange, vrange: s.vrange }) })); }, ['edge_off_surface'], false);
    add('a pcurve shifted off its edge', () => { const b = get('box'), f = at(b, 'plane'), c = coedgeWith(b, f), co = B.get(b, 'coedge', c), e = B.get(b, 'edge', co.edge); return B.edit(b, (d) => d.set('coedge', c, { pcurve: shiftLine(co.pcurve, e.t0, e.t1, 0.25, 0) })); }, ['pcurve_off_edge'], false);
    add('a pcurve far out of its plane\'s range', () => { const b = get('box'), f = at(b, 'plane'), c = coedgeWith(b, f), co = B.get(b, 'coedge', c), e = B.get(b, 'edge', co.edge); return B.edit(b, (d) => d.set('coedge', c, { pcurve: shiftLine(co.pcurve, e.t0, e.t1, 1000, 0) })); }, ['pcurve_out_of_domain'], false);
    for (const [name, du, dv] of [['below u', -1000, 0], ['below v', 0, -1000], ['above v', 0, 1000]]) {
      add(`a pcurve far out of its plane's range, ${name}`, () => { const b = get('box'), f = at(b, 'plane'), c = coedgeWith(b, f), co = B.get(b, 'coedge', c), e = B.get(b, 'edge', co.edge); return B.edit(b, (d) => d.set('coedge', c, { pcurve: shiftLine(co.pcurve, e.t0, e.t1, du, dv) })); }, ['pcurve_out_of_domain'], false);
    }
    add('an edge that leaves its faces between its ends', () => sCurve(), ['edge_off_surface'], false);
    add('a loop run the other way', () => { const b = get('box'), f = at(b, 'plane'); return B.edit(b, (d) => flip(d, B.get(b, 'face', f).loops[0])); }, ['edge_same_direction', 'loop_orientation'], false);
    add('a face\'s sense flipped', () => { const b = get('box'), f = at(b, 'plane'); return B.edit(b, (d) => d.set('face', f, { sense: -B.get(b, 'face', f).sense })); }, ['loop_orientation'], false);
    add('a whole solid inside out', () => cube([0, 0, 0], 2, true), ['volume_sign', 'volume_nonpositive'], true);
    add('a face taken away: the shell open', () => { const b = get('box'); return B.edit(b, (d) => dropFace(d, at(b, 'plane', 2))); }, ['open_edge'], false);
    add('a third face on an edge', () => {
      const b = cube([0, 0, 0], 2), e = B.ids(b, 'edge')[0], E = B.get(b, 'edge', e), a = B.get(b, 'vertex', E.v0).point, z = B.get(b, 'vertex', E.v1).point;
      const shell = B.ids(b, 'shell')[0], c = V.add(V.scale(V.add(a, z), 0.5), [0, 0, 9]);
      return B.edit(b, (d) => {
        const vc = d.vertex(c), l1 = AC.lineThrough(z, c), l2 = AC.lineThrough(c, a);
        const e1 = d.edge(l1, 0, AC.domain(l1)[1], E.v1, vc), e2 = d.edge(l2, 0, AC.domain(l2)[1], vc, E.v0);
        const n = V.unit(V.cross(V.sub(z, a), V.sub(c, a))), pl = AS.plane({ frame: Fr.frameFromZX(a, n, V.unit(V.sub(z, a))), urange: [-20, 20], vrange: [-20, 20] });
        const lp = d.loop(null, [[e, 1], [e1, 1], [e2, 1]]), f = d.face(pl, 1, [lp]);
        d.set('shell', shell, { faces: [...d.get('shell', shell).faces, f] }); d.set('face', f, { shell });
      });
    }, ['non_manifold_edge'], false);
    add('a vertex that belongs to nothing', () => { const b = get('box'); return B.edit(b, (d) => d.vertex([9, 9, 9])); }, ['orphan_vertex'], true);
    add('an edge that no face uses', () => { const b = get('box'), [v0, v1] = B.ids(b, 'vertex'); return B.edit(b, (d) => { const l = AC.lineThrough(B.get(b, 'vertex', v0).point, B.get(b, 'vertex', v1).point); d.edge(l, 0, AC.domain(l)[1], v0, v1); }); }, ['orphan_edge'], true);
    add('two bodies in one shell', () => {
      const b = attach(another(cube(), null, [5, 0, 0]).brep), [s1, s2] = B.ids(b, 'shell'), sol2 = B.get(b, 'shell', s2).solid;
      return B.edit(b, (d) => {
        const faces2 = d.get('shell', s2).faces;
        for (const f of faces2) d.set('face', f, { shell: s1 });
        d.set('shell', s1, { faces: [...d.get('shell', s1).faces, ...faces2] });
        d.remove('shell', s2); d.remove('solid', sol2);
      });
    }, ['disconnected_shell', 'euler'], false);
    add('a void that is outside the solid and faces outward', () => {
      const b = attach(another(cube(), null, [9, 0, 0]).brep), [s1, s2] = B.ids(b, 'shell'), sol2 = B.get(b, 'shell', s2).solid, sol1 = B.get(b, 'shell', s1).solid;
      return B.edit(b, (d) => { d.set('solid', sol1, { shells: [s1, s2] }); d.set('shell', s2, { solid: sol1 }); d.remove('solid', sol2); });
    }, ['volume_sign', 'void_outside'], false);
    add('a loop that does not close in (u, v)', () => { const b = get('cylinder'), f = at(b, 'cylinder'), c = coedgeWith(b, f), co = B.get(b, 'coedge', c), e = B.get(b, 'edge', co.edge); return B.edit(b, (d) => d.set('coedge', c, { pcurve: Pc.uvLine(C.point(co.pcurve, e.t0).slice(0, 2), V.add(C.point(co.pcurve, e.t1), [0, 0.2, 0]).slice(0, 2), e.t0, e.t1) })); }, ['loop_open_uv'], false);
    add('a hole and its outer loop swapped', () => { const b = get('prism-with-holes'), f = B.ids(b, 'face').find((x) => B.get(b, 'face', x).loops.length === 3), [l0, l1, l2] = B.get(b, 'face', f).loops; return B.edit(b, (d) => d.set('face', f, { loops: [l1, l0, l2] })); }, ['loop_nesting'], false);
    add('a hole running the same way as its outer loop', () => { const b = get('prism-with-holes'), f = B.ids(b, 'face').find((x) => B.get(b, 'face', x).loops.length === 3); return B.edit(b, (d) => flip(d, B.get(b, 'face', f).loops[1])); }, ['loop_nesting'], false);
    add('two holes on top of each other', () => {
      const b = get('prism-with-holes'), f = B.ids(b, 'face').find((x) => B.get(b, 'face', x).loops.length === 3), [, la, lb] = B.get(b, 'face', f).loops;
      const mid = (p) => [0.5 * p.a[0] + 0.5 * p.b[0], 0.5 * p.a[1] + 0.5 * p.b[1]], ma = mid(Tr.uvLoop(b, la)[0]), mb = mid(Tr.uvLoop(b, lb)[0]);
      return B.edit(b, (d) => { for (const c of B.get(b, 'loop', lb).coedges) { const co = B.get(b, 'coedge', c), e = B.get(b, 'edge', co.edge); d.set('coedge', c, { pcurve: shiftLine(co.pcurve, e.t0, e.t1, ma[0] - mb[0], ma[1] - mb[1]) }); } });
    }, ['loop_nesting'], false);
    add('a void outside the solid on the other side', () => {
      const b = attach(another(cube(), null, [-9, 0, 0]).brep), [s1, s2] = B.ids(b, 'shell'), sol2 = B.get(b, 'shell', s2).solid, sol1 = B.get(b, 'shell', s1).solid;
      return B.edit(b, (d) => { d.set('solid', sol1, { shells: [s1, s2] }); d.set('shell', s2, { solid: sol1 }); d.remove('solid', sol2); });
    }, ['volume_sign', 'void_outside'], false);
    add('two cubes that touch at one vertex, in one shell', () => {
      const b = attach(another(cube(), null, [1, 1, 1]).brep), [s1, s2] = B.ids(b, 'shell'), sol2 = B.get(b, 'shell', s2).solid;
      const at111 = B.ids(b, 'vertex').filter((v) => V.dist(B.get(b, 'vertex', v).point, [1, 1, 1]) === 0), [vA, vB] = at111;
      return B.edit(b, (d) => {
        for (const e of B.ids(b, 'edge')) { const E = B.get(b, 'edge', e); if (E.v0 === vB) d.set('edge', e, { v0: vA }); if (E.v1 === vB) d.set('edge', e, { v1: vA }); }
        d.remove('vertex', vB);
        const faces2 = d.get('shell', s2).faces;
        for (const f of faces2) d.set('face', f, { shell: s1 });
        d.set('shell', s1, { faces: [...d.get('shell', s1).faces, ...faces2] });
        d.remove('shell', s2); d.remove('solid', sol2);
      });
    }, ['euler', 'disconnected_shell'], false);
    add('two corners of a cube made one vertex', () => {
      const b = cube([0, 0, 0], 2), [vA] = B.ids(b, 'vertex').filter((v) => V.dist(B.get(b, 'vertex', v).point, [0, 0, 0]) === 0), [vB] = B.ids(b, 'vertex').filter((v) => V.dist(B.get(b, 'vertex', v).point, [2, 2, 2]) === 0);
      return B.edit(b, (d) => {
        for (const e of B.ids(b, 'edge')) { const E = B.get(b, 'edge', e); if (E.v0 === vB) d.set('edge', e, { v0: vA }); if (E.v1 === vB) d.set('edge', e, { v1: vA }); }
        d.remove('vertex', vB);
      });
    }, ['euler', 'vertex_off_edge'], false);
    add('a hole carried outside its face', () => {
      const b = get('prism-with-holes'), f = B.ids(b, 'face').find((x) => B.get(b, 'face', x).loops.length === 3), [lo, , lb] = B.get(b, 'face', f).loops;
      const ext = (l) => { let lo2 = [Infinity, Infinity], hi2 = [-Infinity, -Infinity]; for (const p of Tr.uvLoop(b, l)) for (const q of [p.a, p.b]) { lo2 = [Math.min(lo2[0], q[0]), Math.min(lo2[1], q[1])]; hi2 = [Math.max(hi2[0], q[0]), Math.max(hi2[1], q[1])]; } return [lo2, hi2]; };
      const [[ox0, oy0], [ox1, oy1]] = ext(lo), [[hx0, hy0]] = ext(lb), du = (ox1 - ox0) * 1.05 - (hx0 - ox0), dv = (oy1 - oy0) * 0.0 + (hy0 - hy0);
      return B.edit(b, (d) => { for (const c of B.get(b, 'loop', lb).coedges) { const co = B.get(b, 'coedge', c), e = B.get(b, 'edge', co.edge); d.set('coedge', c, { pcurve: shiftLine(co.pcurve, e.t0, e.t1, du, dv) }); } });
    }, ['loop_nesting'], false);
    add('a polygon that crosses itself', () => attach(Bu.polygon(B.EMPTY, [[0, 0, 0], [3, 0, 0], [0, 2, 0], [2, 2, 0]]).brep), ['loop_self_intersect'], false);
    add('a pole\'s edge used twice', () => {
      const b = get('sphere'), pole = P.trim.degenerate(b)[0], co = B.adjacency(b).coedgesOfEdge.get(pole)[0], C0 = B.get(b, 'coedge', co), L = C0.loop;
      return B.edit(b, (d) => { const extra = d.coedge(pole, C0.sense, { pcurve: C0.pcurve }); d.relink(L, [...d.get('loop', L).coedges, extra]); });
    }, ['degenerate_use'], false);
    add('a face with no loop and no shell', () => { const b = get('box'); return B.edit(b, (d) => d.face(AS.plane({ frame: Fr.WORLD, urange: [-1, 1], vrange: [-1, 1] }), 1, [])); }, ['orphan_face', 'face_without_loop'], true);

    const fired = new Set(), failures = [];
    for (const c of cases) {
      let b, r;
      try { b = c.make(); r = A.audit(b); } catch (e) { failures.push(`${c.name}: threw ${e.code || e.message} ${JSON.stringify(e.vars || {})}`); continue; }
      const w = warned(r);
      for (const code of codesOf(r)) fired.add(code);
      const missing = c.want.filter((k) => !codesOf(r).has(k));
      const extra = c.only ? [...w].filter((k) => !c.want.includes(k)) : [];
      if (r.ok || missing.length || extra.length) failures.push(`${c.name}: ${r.ok ? 'ok = true; ' : ''}${missing.length ? 'missing ' + missing.join(',') + '; ' : ''}${extra.length ? 'extra ' + extra.join(',') + '; ' : ''}(saw ${[...codesOf(r)].join(',')})`);
    }
    ok(failures.length === 0, `${cases.length} bodies broken on purpose, one fault each: every one fails the audit with the finding that fault is, and those that touch one thing only report nothing else` + (failures.length ? '; failed: ' + failures.join(' | ') : ''));

    {
      const open = B.edit(get('box'), (d) => dropFace(d, at(get('box'), 'plane', 2)));
      ok(volumeOf(A.audit(open)).every((v) => v === null), 'a shell with a face taken away is open: no volume is made up for it');
      // a pcurve a whole turn away on a periodic surface is the same face: nothing to find, and the same volume
      const cyl = get('cylinder'), side = at(cyl, 'cylinder'), turned = B.edit(cyl, (d) => {
        for (const l of B.get(cyl, 'face', side).loops) for (const c of B.get(cyl, 'loop', l).coedges) { const co = B.get(cyl, 'coedge', c), e = B.get(cyl, 'edge', co.edge); d.set('coedge', c, { pcurve: shiftLine(co.pcurve, e.t0, e.t1, TAU, 0) }); }
      });
      const r0 = A.audit(cyl), r1 = A.audit(turned);
      ok(r1.ok && r1.problems.length === 0 && Math.abs(volumeOf(r1)[0] - volumeOf(r0)[0]) <= 1e-12 * volumeOf(r0)[0], 'a periodic face whose pcurves lie a whole turn away audits clean, with the same volume (a period is not a domain error)');
    }

    sCurveCheck();
    {
      const cut = cube([0, 0, 0], 2), sh = B.ids(cut, 'shell')[0], sol = B.get(cut, 'shell', sh).solid, face = B.ids(cut, 'face')[0];
      const sheetOpen = B.edit(cut, (d) => { dropFace(d, face); d.set('shell', sh, { solid: null }); d.remove('solid', sol); });
      const ro = A.audit(sheetOpen);
      for (const code of codesOf(ro)) fired.add(code);
      ok(ro.ok && codesOf(ro).has('open_edge') && ro.problems.filter((p) => p.code.endsWith('open_edge')).every((p) => p.severity === 'note'), 'an open shell that belongs to no solid (a sheet) is allowed its open edges: ok, and the open edges are only noted');
      const asSolid = B.edit(cut, (d) => dropFace(d, face));
      ok(A.audit(asSolid).problems.filter((p) => p.code.endsWith('open_edge')).every((p) => p.severity === 'warning'), 'the same shell inside a solid is not: its open edges are warnings');
    }

    // the loop helpers, on shapes with answers: a rounded rectangle (arcs of quarter turns and segments), the way round, and the meetings
    {
      const w = 7, h = 4, r = 1.5, arc = (cx, cy, a, b, qx, qy) => ({ kind: 'arc', c: [cx, cy], r, qx, qy, a, b }), seg = (a, b) => ({ kind: 'seg', a, b });
      const ring = [seg([r, 0], [w - r, 0]), arc(w - r, r, [w - r, 0], [w, r], 1, -1), seg([w, r], [w, h - r]), arc(w - r, h - r, [w, h - r], [w - r, h], 1, 1),
        seg([w - r, h], [r, h]), arc(r, h - r, [r, h], [0, h - r], -1, 1), seg([0, h - r], [0, r]), arc(r, r, [0, r], [r, 0], -1, -1)];
      const want = w * h - (4 - P.trig.PI) * r * r;
      const back = [...ring].reverse().map((p) => ({ ...p, a: p.b, b: p.a }));
      ok(Math.abs(A.loopArea(ring) - want) <= 1e-12 * want && Math.abs(A.loopArea(back) + want) <= 1e-12 * want, `the area of a rounded rectangle (${w} × ${h}, corners ${r}) round the loop is w h − (4 − π) r² = ${want.toFixed(9)}, positive counter-clockwise and negative the other way`);
      const sg = (a, b) => seg(a, b), arcR = (cx, cy, rr, a, b, qx, qy) => ({ kind: 'arc', c: [cx, cy], r: rr, qx, qy, a, b });
      const at0 = arcR(0, 0, 1, [1, 0], [0, 1], 1, 1);                                          // a quarter of the unit circle, in the first quadrant
      const R = (p, q) => A.piecesMeet(p, q, 1e-9);
      const meets = [
        [sg([0, 0], [4, 4]), sg([0, 4], [4, 0]), true, 'two segments crossing'],
        [sg([0, 0], [2, 0]), sg([2, 0], [2, 3]), true, 'two segments touching at an end'],
        [sg([0, 0], [4, 0]), sg([1, 0], [3, 0]), true, 'two segments on one line, overlapping'],
        [sg([0, 0], [1, 0]), sg([2, 0], [3, 0]), false, 'two segments on one line, apart'],
        [sg([0, 0], [4, 0]), sg([0, 1], [4, 1]), false, 'two parallel segments'],
        [sg([0, 0], [2, 2]), at0, true, 'a segment through the arc'],
        [sg([2, 0], [2, 2]), at0, false, 'a segment beside the arc'],
        [sg([-2, -2], [-1, -1]), at0, false, 'a segment past the circle'],
        [sg([0, -3], [0, -2]), arcR(0, 0, 1, [0, -1], [1, 0], 1, -1), false, 'a segment short of the circle'],
        [sg([-2, 0], [-0.5, 0]), at0, false, 'a segment into the circle on the side the arc is not'],
        [sg([0, -2], [0, -0.5]), at0, false, 'a segment into the circle below the arc'],
        [sg([0, 0], [4, 0]), sg([2, 0], [2, 3]), true, 'a T: one segment ends on the middle of the other'],
        [sg([0, 0], [4, 0]), sg([2, 3], [2, 0]), true, 'a T the other way round'],
        [at0, arcR(0.5, 0.5, 0.1, [0.6, 0.5], [0.5, 0.6], 1, 1), false, 'a small circle inside the arc\'s circle'],
        [at0, arcR(1, 0, 1, [1, 1], [0, 0], -1, 1), true, 'two arcs crossing, inside both'],
        [at0, arcR(3, 0, 1, [3, 1], [2, 0], -1, 1), false, 'two circles apart'],
        [at0, arcR(0.6, -0.8, 1, [0.6, -1.8], [1.6, -0.8], 1, -1), false, 'two circles that meet, but not on the second arc'],
      ];
      const wrong = meets.filter(([p, q, want2]) => R(p, q) !== want2 || R(q, p) !== want2).map((m) => m[3]);
      ok(wrong.length === 0, `${meets.length} meetings of pieces, each in both orders: segments and arcs that cross, touch, overlap or miss` + (wrong.length ? '; wrong: ' + wrong.join(', ') : ''));
    }

    // the notes: a sheet is allowed to be open, a free shell is only worth mentioning, a face with no pcurves cannot be judged in (u, v)
    const sheet = Bu.polygon(B.EMPTY, [[0, 0, 0], [3, 0, 0], [3, 2, 0], [0, 2, 0]]).brep;
    const rs = A.audit(sheet);
    for (const code of codesOf(rs)) fired.add(code);
    ok(rs.ok && codesOf(rs).has('free_shell') && codesOf(rs).has('loop_unreadable') && rs.problems.every((p) => p.severity === 'note'), 'a lamina of two faces made by Euler operators, with no pcurves: ok, and only notes (a free shell; loops that cannot be read)');
    const raw = Bu.polyhedron(B.EMPTY, [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]).brep;
    const rr = A.audit(raw);
    for (const code of codesOf(rr)) fired.add(code);
    ok(rr.ok && codesOf(rr).has('loop_unreadable') && codesOf(rr).has('volume_skipped') && volumeOf(rr)[0] === null, 'a cube with no pcurves: topology and geometry audit clean, the loops are noted as unreadable, and its volume is skipped with a note (not guessed)');
    const rv = A.audit(raw, { volume: false });
    ok(rv.ok && !codesOf(rv).has('volume_skipped'), 'volume: false leaves the volume out, and says nothing about it');

    // a hollow solid: a cube with an inside-out cube in its middle is one solid of two shells, the void negative
    {
      // the outer cube, then the inner one by the same builder, made inside out and moved into the outer's solid as its void
      let m = Bu.polyhedron(B.EMPTY, [[0, 0, 0], [4, 0, 0], [4, 4, 0], [0, 4, 0], [0, 0, 4], [4, 0, 4], [4, 4, 4], [0, 4, 4]], [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]).brep;
      const r2 = Bu.polyhedron(m, [[1, 1, 1], [3, 1, 1], [3, 3, 1], [1, 3, 1], [1, 1, 3], [3, 1, 3], [3, 3, 3], [1, 3, 3]], [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]);
      m = attach(r2.brep);
      const [s1, s2] = B.ids(m, 'shell'), sol1 = B.get(m, 'shell', s1).solid, sol2 = B.get(m, 'shell', s2).solid;
      m = B.edit(m, (d) => {
        for (const f of d.get('shell', s2).faces) { for (const l of d.get('face', f).loops) flip(d, l); d.set('face', f, { sense: -d.get('face', f).sense }); }
        d.set('solid', sol1, { shells: [s1, s2] }); d.set('shell', s2, { solid: sol1 }); d.remove('solid', sol2);
      });
      const rh = A.audit(m);
      const vs = volumeOf(rh);
      ok(rh.ok && rh.problems.length === 0 && Math.abs(vs[0] - 64) <= 1e-12 * 64 && Math.abs(vs[1] + 8) <= 1e-12 * 8, `a hollow solid (a 4-cube with an inside-out 2-cube in its middle) audits clean: the outer shell's volume is ${vs[0]}, the void's ${vs[1]}`);
    }

    // the cap, the asked genus, the tolerance option
    {
      const b = B.edit(get('box'), (d) => { for (let i = 0; i < 250; i++) d.vertex([i, 0, 0]); });
      const r = A.audit(b);
      ok(r.capped && r.problems.length === A.LIMIT && r.summary.find((s) => s.set === 'topology').found === 250, `more than ${A.LIMIT} findings are cut at ${A.LIMIT}, flagged \`capped\`, and the summary still counts all 250`);
      ok(codesOf(A.audit(get('box'), { genus: 1 })).has('euler') && codesOf(A.audit(get('torus'), { genus: 0 })).has('euler') && A.audit(get('torus'), { genus: 1 }).ok, 'a genus asked for is checked against each closed shell: a box is not genus 1, a torus is not genus 0');
      const sid = B.ids(get('torus'), 'shell')[0];
      ok(A.audit(get('torus'), { genus: { [sid]: 1 } }).ok && codesOf(A.audit(get('torus'), { genus: { [sid]: 2 } })).has('euler'), 'a genus can be given per shell');
      const loose = B.edit(get('cone'), (d) => d.set('edge', B.ids(get('cone'), 'edge')[0], { tol: 0.01 }));
      ok(codesOf(A.audit(loose)).has('tolerance') && !codesOf(A.audit(loose, { tol: { maxEdgeTol: 0.1 } })).has('tolerance'), 'tol.maxEdgeTol decides what counts as a tolerance above the largest an edge may carry');
      ok(refuses(() => A.audit('box'), BAD, { name: 'b', why: 'not_a_brep' }) && refuses(() => A.audit(get('box'), { samples: 1 }), BAD, { name: 'samples', why: 'out_of_range' }) && refuses(() => A.audit(get('box'), { genus: -1 }), BAD, { name: 'genus', why: 'not_a_genus' }), 'refusals: not a brep, samples out of range, a genus that is not a number of holes');
      const r1 = A.audit(get('prism-with-holes')), r2 = A.audit(get('prism-with-holes'));
      ok(same(JSON.stringify(r1), JSON.stringify(r2)), 'the same audit twice gives the same answer');
    }

    // every finding the auditor can make has been fired by something above
    const never = A.FINDINGS.map((k) => k.replace('solid.audit.', '')).filter((k) => !fired.has(k));
    ok(never.length === 0 && A.FINDINGS.every((k) => /^solid\.audit\.[a-z_]+$/.test(k)) && same([...A.FINDINGS].sort(), [...A.FINDINGS]), `every finding code (${A.FINDINGS.length}) is fired by at least one body above` + (never.length ? '; never fired: ' + never.join(', ') : ''));
  });
}
