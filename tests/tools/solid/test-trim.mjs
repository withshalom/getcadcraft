/* SPDX-License-Identifier: Apache-2.0 */
/**
 * test-trim.mjs — engine.solid's S13 tests (topo/pcurve.js, topo/prim.js, topo/trim.js), registered by test.mjs: sections
 * `pcurve` and `trim`.
 *
 * pcurve: for every analytic pair, edges made from the surface's own definition (a circle at a height, a meridian, a generator,
 * both ways round), each pcurve against the (u, v) the construction says it has and against the surface put through it;
 * the turns of the angles; every pair that is not one of the surface's lines refused; the poles.
 * trim: the four primitives with their seams and poles (counts, Euler–Poincaré with the degenerate edges left out, the seam's
 * two coedges, every coedge's pcurve on its edge, loops closed in (u, v), areas against closed forms, round trips); the winding
 * number against an exact BigInt crossing count (corners, edges, a ray through a vertex, one ulp off an edge or a circle); point
 * in face on the primitives, round a seam, at the poles, in a ring with a hole; attach on a polyhedron; every refusal typed.
 */
import * as R from './bigref.mjs';

export async function register({ section, ok, refuses, same, deepFrozen, appUrl }) {
  const P = await import(appUrl('solid/index.js'));
  const B = P.brep, Pc = P.pcurve, Pr = P.prim, Tr = P.trim, Fr = P.frame, V = P.vec3, T = P.trig, F = P.float;
  const AC = P.analyticCurve, AS = P.analyticSurface, C = P.curve, SF = P.surface, Q = P.query, Bu = P.build;
  const BAD = 'solid.err.bad_input', NOT = 'solid.err.not_supported';
  const unit = (v) => V.unit(v);
  const frameAt = (g) => { const z = unit([g.range(-1, 1), g.range(-1, 1), g.range(0.2, 1)]); return Fr.frameFromZ([g.range(-5, 5), g.range(-5, 5), g.range(-5, 5)], z); };
  const near = (a, b, d) => V.dist([a[0], a[1], a[2] || 0], [b[0], b[1], b[2] || 0]) <= d;
  /** a refusal that must happen: its result is kept, and the next ok(…, 'refused …') asks that every one held (refuses only answers; it does not fail anything) */
  const pending = [];
  const must = (fn, code, vars) => { const r = refuses(fn, code, vars); pending.push(r); return r; };
  const bi = (fn, code, name) => must(fn, code, name === undefined ? undefined : { name });
  const held = (what) => { const all = pending.splice(0); ok(all.length > 0 && all.every(Boolean), what + ' (' + all.length + ' refusals' + (all.every(Boolean) ? '' : '; failing: ' + all.map((x, i) => (x ? null : i)).filter((x) => x !== null).join(', ')) + ')'); };

  // ============================================================================================== pcurve
  section('pcurve', 'S13: pcurves of the analytic pairs against their construction; angles turned; refusals; poles', () => {
    const g = P.makePrng(1301), TAU = T.TAU;
    const size = 12, tol = 2 * 1e-9 * size;
    let worst = 0, cases = 0, bad = 0;
    /** pc against the (u, v) the construction says, and the surface put through pc against the edge's points */
    const check = (s, edge, [ta, tb], want, nearUv, what) => {
      let pc; try { pc = Pc.pcurveOf(s, edge, ta, tb, { near: nearUv }); } catch (e) { console.log('  threw in', what, e.code, JSON.stringify(e.vars), SF.typeOf(s), ta, tb, nearUv); throw e; }
      cases++;
      for (let k = 0; k <= 8; k++) {
        const t = ta + ((tb - ta) * k) / 8, uv = C.point(pc, t), w = want(t);
        const there = SF.point(s, uv[0], uv[1]), e = V.dist(there, C.point(edge, t)), d = Math.hypot(uv[0] - w[0], uv[1] - w[1]);
        worst = Math.max(worst, e, d);
        if (!(e <= tol && d <= tol && uv[2] === 0)) { bad++; }
      }
    };
    for (let i = 0; i < 12; i++) {
      const f = frameAt(g), sg = i % 2 ? -1 : 1;                                  // the way round: counter-clockwise or clockwise
      const ur = sg > 0 ? [0, TAU] : [-TAU, 0], vr = sg > 0 ? [0, TAU] : [-TAU, 0];   // clockwise runs u down from 0: the range goes with it
      const ring = (o, r, range, phase = 0) => AC.circle({ frame: Fr.frameFromZX(o, sg > 0 ? f.z : V.neg(f.z), f.x), r, range, phase });
      const world = (u, v) => V.add(V.add(f.o, V.scale(f.x, u)), V.scale(f.y, v));
      const r = g.range(0.5, 4), h = g.range(1, 5), ta = g.range(0.1, 2), tb = ta + g.range(0.5, 3.5), v0 = g.range(0.2, h - 0.2);
      // a cylinder: a circle at height v0, a line along the axis (up, or down from the top)
      const cyl = AS.cylinder({ frame: f, r, urange: ur, vrange: [0, h] }), at = (v) => V.madd(f.o, v, f.z);
      check(cyl, ring(at(v0), r, [ta, tb]), [ta, tb], (t) => [sg * t, v0], [sg * ta, v0], 'cylinder circle');
      const u0 = sg * g.range(0.1, TAU - 0.1), vs = sg > 0 ? 0 : h, foot = V.add(at(vs), V.add(V.scale(f.x, r * Math.cos(u0)), V.scale(f.y, r * Math.sin(u0))));
      check(cyl, AC.line({ o: foot, d: sg > 0 ? f.z : V.neg(f.z), range: [0, h] }), [0, h], (t) => [u0, vs + sg * t], [u0, vs], 'cylinder line');
      // a cone
      const al = (i % 3 === 0 ? -1 : 1) * g.range(0.15, 0.6), cone = AS.cone({ frame: f, r: 3, angle: Math.atan(al), urange: ur, vrange: [0, 3] });
      const rad = (v) => 3 + v * al, vc = g.range(0.1, 2.5);
      if (rad(vc) > 0.1) check(cone, ring(at(vc), rad(vc), [ta, tb]), [ta, tb], (t) => [sg * t, vc], [sg * ta, vc], 'cone circle');
      const p1 = SF.point(cone, u0, 0), p2 = SF.point(cone, u0, 1.5), L = V.dist(p1, p2), dz = V.dot(V.sub(p2, p1), f.z) / L;
      check(cone, AC.lineThrough(p1, p2), [0, L], (t) => [u0, t * dz], [u0, 0], 'cone generator');
      // a sphere: a parallel, a meridian
      const sph = AS.sphere({ frame: f, r, urange: ur, vrange: [-T.HALF_PI, T.HALF_PI] }), lat = g.range(-1.2, 1.2);
      check(sph, ring(at(r * Math.sin(lat)), r * Math.cos(lat), [ta, tb]), [ta, tb], (t) => [sg * t, lat], [sg * ta, lat], 'sphere parallel');
      const e1 = V.add(V.scale(f.x, Math.cos(u0)), V.scale(f.y, Math.sin(u0))), mz = sg > 0 ? V.cross(e1, f.z) : V.neg(V.cross(e1, f.z));
      const mer = AC.circle({ frame: Fr.frameFromZX(f.o, mz, e1), r, range: [-1.4, 1.4] }), lo = g.range(-1.3, 0), hi = lo + g.range(0.3, 1.3);
      check(sph, mer, [lo, hi], (t) => [u0, sg * t], [u0, sg * lo], 'sphere meridian');
      // a torus: a parallel, a meridian
      const R0 = r + g.range(0.5, 3), tor = AS.torus({ frame: f, R: R0, r, urange: ur, vrange: vr }), vt = sg * g.range(0.1, TAU - 0.1);
      check(tor, ring(at(r * Math.sin(vt)), R0 + r * Math.cos(vt), [ta, tb]), [ta, tb], (t) => [sg * t, vt], [sg * ta, vt], 'torus parallel');
      const cen = V.madd(f.o, R0, e1), mt = AC.circle({ frame: Fr.frameFromZX(cen, mz, e1), r, range: [0, TAU] });
      check(tor, mt, [ta, tb], (t) => [u0, sg * t], [u0, sg * ta], 'torus meridian');
      // a plane: a line, a circle
      const pl = AS.plane({ frame: f, urange: [-9, 9], vrange: [-9, 9] }), a = [g.range(-4, 4), g.range(-4, 4)], c2 = [g.range(-4, 4), g.range(-4, 4)];
      const ln = AC.lineThrough(world(...a), world(...c2)), Ln = AC.domain(ln)[1];
      check(pl, ln, [0, Ln], (t) => [a[0] + (t * (c2[0] - a[0])) / Ln, a[1] + (t * (c2[1] - a[1])) / Ln], null, 'plane line');
      const ph = g.range(0, TAU), cc = AC.circle({ frame: Fr.frameFromZX(world(...a), sg > 0 ? f.z : V.neg(f.z), V.add(V.scale(f.x, Math.cos(ph)), V.scale(f.y, Math.sin(ph)))), r, range: [ta, tb] });
      check(pl, cc, [ta, tb], (t) => [a[0] + r * Math.cos(ph + sg * t), a[1] + r * Math.sin(ph + sg * t)], null, 'plane circle');
    }
    ok(bad === 0 && cases >= 100, `pcurves: ${cases} edges of the ten kinds (a circle and a line or meridian on each of the five surfaces), both ways round, each pcurve on the (u, v) its construction says and the surface through it on its edge (worst ${worst.toExponential(1)} of ${tol.toExponential(1)})`);

    // ---- the pcurve is a record of the curve interface, a line or a circle, on the edge's own parameter
    const f0 = Fr.frameFromZX([0, 0, 0], [0, 0, 1], [1, 0, 0]), cy = AS.cylinder({ frame: f0, r: 2, urange: [0, TAU], vrange: [0, 3] });
    const bot = AC.circle({ frame: f0, r: 2 }), pb = Pc.pcurveOf(cy, bot, 0, TAU, { near: [0, 0] });
    ok(C.isCurve(pb) && same(C.domain(pb), [0, TAU]) && same(C.point(pb, 0), [0, 0, 0]) && same(C.point(pb, TAU), [TAU, 0, 0]) && deepFrozen(pb) && C.typeOf(pb) === 'nurbs', 'a circle round a cylinder is the straight pcurve from (0, 0) to (2π, 0) on the circle\'s own parameter');
    const pl0 = AS.plane({ frame: f0, urange: [-3, 3], vrange: [-3, 3] }), pcd = Pc.pcurveOf(pl0, AC.circle({ frame: f0, r: 2 }), 0, TAU);
    ok(C.typeOf(pcd) === 'circle' && near(C.point(pcd, 1), [2 * Math.cos(1), 2 * Math.sin(1)], 1e-15), 'a circle in a plane is a circle in its (u, v)');

    // ---- turns of the angle: near picks the branch, and a branch outside the surface's range is refused
    const ks = [-3, -1, 0, 1, 2], onTurn = ks.map((k) => Pc.pcurveOf(AS.cylinder({ frame: f0, r: 2, urange: [k * TAU, (k + 1) * TAU], vrange: [0, 3] }), bot, 0, 1, { near: [k * TAU + 0.2, 0] })).map((c) => C.point(c, 0)[0]);
    ok(onTurn.every((u, i) => Math.abs(u - ks[i] * TAU) < 1e-12), 'near = [u, v] puts the start on the turn of 2π nearest its u: from −3 turns to +2, on a cylinder whose range is that turn');
    must(() => Pc.pcurveOf(cy, bot, 0, 1, { near: [3 * TAU + 0.2, 0] }), NOT, { what: 'pcurve', why: 'off_surface' });

    // ---- uvOf: the closed forms, round trips and turns
    const surfaces = [AS.plane({ frame: f0, urange: [-3, 3], vrange: [-3, 3] }), cy, AS.cone({ frame: f0, r: 2, angle: -0.4, urange: [0, TAU], vrange: [0, 3] }), AS.sphere({ frame: f0, r: 2, urange: [0, TAU], vrange: [-T.HALF_PI, T.HALF_PI] }), AS.torus({ frame: f0, R: 5, r: 1, urange: [0, TAU], vrange: [0, TAU] })];
    let back = 0;
    for (const s of surfaces) for (let i = 0; i < 300; i++) {
      const ty = SF.typeOf(s), u = ty === 'plane' ? g.range(-3, 3) : g.range(0.01, TAU), v = ty === 'sphere' ? g.range(-1.5, 1.5) : ty === 'torus' ? g.range(0.01, TAU) : ty === 'plane' ? g.range(-3, 3) : g.range(0.1, 2.5);
      const ku = ty === 'plane' ? 0 : g.int(7) - 3, kv = ty === 'torus' ? g.int(7) - 3 : 0;                   // near is some turns away: the answer is on its turn
      const q = Pc.uvOf(s, SF.point(s, u, v), { near: [u + ku * TAU, v + kv * TAU] });
      back = Math.max(back, Math.abs(q[0] - (u + ku * TAU)), Math.abs(q[1] - (v + kv * TAU)));
    }
    ok(back <= 1e-11, `uvOf inverts every analytic surface (1,500 points, worst ${back.toExponential(1)}), and near picks the turn of each angle: from 3 turns below to 3 above`);
    const cone2 = AS.cone({ frame: f0, r: 2, angle: Math.atan(-0.5), urange: [0, TAU], vrange: [0, 4] });
    ok(Pc.uvOf(surfaces[3], SF.point(surfaces[3], 1, T.HALF_PI), { near: [2.5, 0] })[0] === 2.5 && Pc.uvOf(cone2, SF.point(cone2, 1, 4), { near: [0.7, 0] })[0] === 0.7, 'at a pole (a sphere\'s, a cone\'s apex) u is the u of near');
    ok(same(Pc.periods(surfaces[0]), { u: null, v: null }) && same(Pc.periods(cy), { u: TAU, v: null }) && same(Pc.periods(surfaces[3]), { u: TAU, v: null }) && same(Pc.periods(surfaces[4]), { u: TAU, v: TAU }), 'periods: the plane none, the cylinder, cone and sphere one (u), the torus two');

    // ---- refusals: not one of the surface's lines
    const nosup = (fn, what, why) => must(fn, NOT, { what, why });
    nosup(() => Pc.pcurveOf(cy, AC.circle({ frame: Fr.frameFromZX([0.5, 0, 1], [0, 0, 1], [1, 0, 0]), r: 2 }), 0, 1), 'pcurve', 'not_isoline');
    nosup(() => Pc.pcurveOf(cy, AC.circle({ frame: Fr.frameFromZX([0, 0, 1], [0, 1, 0], [1, 0, 0]), r: 2 }), 0, 1), 'pcurve', 'not_isoline');
    nosup(() => Pc.pcurveOf(cy, AC.circle({ frame: f0, r: 2.5 }), 0, 1), 'pcurve', 'not_isoline');
    nosup(() => Pc.pcurveOf(cy, AC.lineThrough([2, 0, 0], [2, 0.5, 1]), 0, 0.5), 'pcurve', 'not_isoline');
    nosup(() => Pc.pcurveOf(surfaces[2], AC.lineThrough([2, 0, 0], [3, 0, 1]), 0, 0.5), 'pcurve', 'not_isoline');
    nosup(() => Pc.pcurveOf(pl0, AC.ellipse({ frame: f0, a: 2, b: 1 }), 0, 1), 'pcurve', 'not_isoline');
    nosup(() => Pc.pcurveOf(pl0, AC.circle({ frame: Fr.frameFromZX([0, 0, 0], [1, 0, 0], [0, 1, 0]), r: 1 }), 0, 1), 'pcurve', 'not_isoline');
    const over = AC.circle({ frame: Fr.frameFromZX([0, 0, 0], V.neg([0, 1, 0]), [1, 0, 0]), r: 2, range: [-1.5, 1.5] });
    nosup(() => Pc.pcurveOf(surfaces[3], AC.circle({ frame: Fr.frameFromZX([0, 0, 0], [0, -1, 0], [1, 0, 0]), r: 2, range: [0, TAU] }), 0, TAU), 'pcurve', 'off_surface');   // over both poles: past v = ±π/2
    ok(C.isCurve(Pc.pcurveOf(surfaces[3], over, -1.5, 1.5, { near: [0, -1.5] })), 'a meridian short of both poles is accepted');
    nosup(() => Pc.uvOf(AS.revolution({ profile: AC.lineThrough([1, 0, 0], [1, 0, 2]), axis: { o: [0, 0, 0], d: [0, 0, 1] }, urange: [0, TAU] }), [1, 0, 1]), 'surface', 'unknown_type');
    bi(() => Pc.pcurveOf({}, bot, 0, 1), BAD, 's');
    bi(() => Pc.pcurveOf(cy, {}, 0, 1), BAD, 'c');
    bi(() => Pc.pcurveOf(cy, bot, 1, 0), BAD, 'range');
    bi(() => Pc.pcurveOf(cy, bot, 0, TAU + 1), BAD, 'range');
    bi(() => Pc.pcurveOf(cy, bot, 0, 1, { near: [0] }), BAD, 'near');
    bi(() => Pc.uvOf(cy, [1, 2]), BAD, 'p');
    bi(() => Pc.periods(7), BAD, 's');
    held('refused, typed: an off-axis, tilted or wrong-radius circle on a cylinder; a skew line; a line that is not a generator; an ellipse and a tilted circle on a plane; a loop over both poles; a surface with no closed form; bad arguments');

    // ---- a pole's edge
    const pt = Pc.pointCurve([0, 0, 2], 0, TAU);
    ok(Pc.isPoint(pt) && !Pc.isPoint(bot) && same(C.point(pt, 3), [0, 0, 2]) && Pc.isPoint(AC.lineThrough([0, 0, 0], [0, 0, 5e-7])) && !Pc.isPoint(AC.lineThrough([0, 0, 0], [0, 0, 5e-6])), 'a point curve stays where it is; isPoint is true within tol.lin (1e-6) and not beyond');
    const ul = Pc.uvLine([0, 1], [TAU, 1], 0, TAU);
    ok(same(C.point(ul, 0), [0, 1, 0]) && same(C.point(ul, TAU), [TAU, 1, 0]) && near(C.point(ul, 1), [1, 1, 0], 1e-15), 'uvLine runs from a at t0 to b at t1, straight');
    bi(() => Pc.pointCurve([0, 0], 0, 1), BAD, 'p');
    bi(() => Pc.uvLine([0], [1, 1], 0, 1), BAD, 'uv');
  });

  // ============================================================================================== trim
  section('trim', 'S13: the curved primitives, seams and poles; the winding number; point in face; attach', () => {
    const g = P.makePrng(1302), TAU = T.TAU, TOL = 1e-6;
    const frameOf = () => frameAt(g);
    const surfaceArea = (b, f) => Q.area(B.get(b, 'face', f).surface, { eps: 1e-10 }).value;
    const coedgesOf = (b, face) => B.get(b, 'face', face).loops.flatMap((l) => B.get(b, 'loop', l).coedges.map((c) => B.get(b, 'coedge', c)));
    const walk = (b, co) => { const e = B.get(b, 'edge', co.edge), a = C.point(co.pcurve, e.t0), z = C.point(co.pcurve, e.t1); return co.sense > 0 ? [a, z] : [z, a]; };   // start and end of the coedge in (u, v)
    const closed = (b, face, eps) => {
      for (const l of B.get(b, 'face', face).loops) {
        const cs = B.get(b, 'loop', l).coedges.map((c) => walk(b, B.get(b, 'coedge', c)));
        for (let i = 0; i < cs.length; i++) if (!near(cs[i][1], cs[(i + 1) % cs.length][0], eps)) return false;
      }
      return true;
    };
    /** the surface at (u, v), the point put back inside the range when evaluating a pcurve left it an ulp or two out (a constant u need not come back bit for bit) */
    const put = (s, uv) => { const c = (r, x) => (x < r[0] && r[0] - x < 1e-9 ? r[0] : x > r[1] && x - r[1] < 1e-9 ? r[1] : x); return SF.point(s, c(SF.domainU(s), uv[0]), c(SF.domainV(s), uv[1])); };
    const onEdge = (b, face, eps) => coedgesOf(b, face).every((co) => {
      const e = B.get(b, 'edge', co.edge), s = B.get(b, 'face', face).surface;
      for (let k = 0; k <= 6; k++) { const t = k === 6 ? e.t1 : e.t0 + ((e.t1 - e.t0) * k) / 6, uv = C.point(co.pcurve, t); if (!(V.dist(put(s, uv), C.point(e.curve, t)) <= eps)) return false; }
      return true;
    });
    const genus = (b) => { const e = B.euler(b), D = Tr.degenerate(b).length; return e.S - (e.V - (e.E - D) + e.F - e.R) / 2; };

    // ---- the four primitives
    const kinds = {
      cylinder: { make: (f, r, h) => Pr.cylinder(B.EMPTY, { frame: f, r, h }), V: 2, E: 3, D: 0, F: 3, G: 0, area: (r, h) => 2 * Math.PI * r * h },
      cone: { make: (f, r, h) => Pr.cone(B.EMPTY, { frame: f, r, h }), V: 2, E: 3, D: 1, F: 2, G: 0, area: (r, h) => Math.PI * r * Math.sqrt(r * r + h * h) },
      sphere: { make: (f, r) => Pr.sphere(B.EMPTY, { frame: f, r }), V: 2, E: 3, D: 2, F: 1, G: 0, area: (r) => 4 * Math.PI * r * r },
      torus: { make: (f, r, h) => Pr.torus(B.EMPTY, { frame: f, R: r + h, r }), V: 1, E: 2, D: 0, F: 1, G: 1, area: (r, h) => 4 * Math.PI * Math.PI * (r + h) * r },
    };
    let n = 0, structural = 0, seamOk = 0, polesOk = 0, areasOk = 0, wireOk = 0, worstArea = 0;
    const bodies = [];
    for (const [name, k] of Object.entries(kinds)) for (let i = 0; i < 8; i++) {
      const f = frameOf(), r = g.range(0.5, 3), h = g.range(0.5, 4), t = k.make(f, r, h), b = t.brep, e = B.euler(b);
      n++; bodies.push([name, t, f, r, h]);
      const sideFace = name === 'cylinder' || name === 'cone' ? t.side : t.face;
      if (e.V === k.V && e.E === k.E && e.F === k.F && e.L === k.F && e.S === 1 && e.R === 0 && Tr.degenerate(b).length === k.D && genus(b) === k.G && B.count(b, 'solid') === 1) structural++;
      const faces = B.get(b, 'shell', t.shell).faces;
      if (faces.every((fc) => closed(b, fc, 1e-12 * 12) && onEdge(b, fc, 1e-12 * 12)) && B.ids(b, 'coedge').every((c) => B.get(b, 'coedge', c).pcurve !== null)) wireOk++;
      // the seam: one edge, two coedges in the one loop, senses +1 and −1, pcurves a period apart in u (a torus: both its edges)
      const adj = B.adjacency(b).coedgesOfEdge, seams = name === 'torus' ? [t.edges.major, t.edges.minor] : [t.edges.seam];
      let seamsGood = true;
      for (const se of seams) {
        const cos = adj.get(se).map((c) => B.get(b, 'coedge', c));
        const senses = cos.map((c) => c.sense).sort(), loops = new Set(cos.map((c) => c.loop));
        if (!(cos.length === 2 && senses[0] === -1 && senses[1] === 1 && loops.size === 1)) seamsGood = false;
        const us = cos.map((c) => C.point(c.pcurve, B.get(b, 'edge', se).t0)), gap = Math.abs(us[0][0] - us[1][0]) + Math.abs(us[0][1] - us[1][1]);
        if (!(Math.abs(gap - TAU) <= 1e-12 * 8)) seamsGood = false;                  // the two uses of one edge lie a period apart, in u or in v
      }
      if (seamsGood) seamOk++;
      // the poles: a degenerate edge, one coedge, a vertex joined to itself, its pcurve along the pole
      const poles = Tr.degenerate(b);
      if (poles.length === k.D && poles.every((pe) => {
        const E = B.get(b, 'edge', pe), cs = adj.get(pe);
        if (!(E.v0 === E.v1 && cs.length === 1)) return false;
        const a = C.point(B.get(b, 'coedge', cs[0]).pcurve, E.t0), z = C.point(B.get(b, 'coedge', cs[0]).pcurve, E.t1);
        return Math.abs(Math.abs(z[0] - a[0]) - TAU) <= 1e-12 * 8 && a[1] === z[1];
      })) polesOk++;
      // the curved face's area, integrated on its own surface (a cap's plane is a square patch, not the disc: not compared)
      const rel = Math.abs(surfaceArea(b, sideFace) - k.area(r, h)) / k.area(r, h);
      worstArea = Math.max(worstArea, rel);
      if (rel <= 1e-9) areasOk++;
    }
    ok(structural === n, `the four primitives, ${n} bodies in random frames: counts (cylinder V 2 E 3 F 3, cone 2 / 3 (1 pole) / 2, sphere 2 / 3 (2 poles) / 1, torus 1 / 2 / 1), one shell, one solid, and Euler–Poincaré with the poles' edges left out: genus 0, the torus 1`);
    ok(wireOk === n, 'every coedge has a pcurve; every loop is closed in (u, v) (each coedge ends where the next starts, to 1e-11); every pcurve puts its edge on its surface (1e-11)');
    ok(seamOk === n, 'the seam is one edge with two coedges in one loop, senses +1 and −1, its two pcurves a period (2π) apart; the torus has two such edges');
    ok(polesOk === n, 'the poles are degenerate edges: one coedge, a vertex joined to itself, a pcurve of length 2π along the pole (the cone\'s apex, the sphere\'s two)');
    ok(areasOk === n, `each face's area, integrated on its own surface, equals the closed form (2πrh, πr², πr√(r²+h²), 4πr², 4π²Rr) to ${worstArea.toExponential(1)} relative`);
    ok(bodies.every(([, t, , , ]) => B.isBrep(t.brep) && deepFrozen(t.edges)), 'a primitive\'s record is frozen');
    // senses: outward
    const [, cylT] = bodies.find((x) => x[0] === 'cylinder');
    ok(B.get(cylT.brep, 'face', cylT.side).sense === 1 && B.get(cylT.brep, 'face', cylT.bottom).sense === -1 && B.get(cylT.brep, 'face', cylT.top).sense === 1, 'a cylinder\'s side faces out (+1), its bottom cap faces against its plane\'s normal (−1), its top with it (+1)');
    // round trip, and composing with a model that has something in it
    const rt = B.fromData(JSON.parse(JSON.stringify(B.toData(cylT.brep))));
    ok(same(B.toData(rt), B.toData(cylT.brep)) && B.ids(rt, 'coedge').every((c) => B.get(rt, 'coedge', c).pcurve !== null), 'pcurves survive toData / fromData through JSON: the same model back');
    const two = Pr.sphere(cylT.brep, { frame: Fr.frameFromZ([30, 0, 0], [0, 0, 1]), r: 2 });
    ok(B.count(two.brep, 'solid') === 2 && B.ids(two.brep, 'face').length === 4 && two.solid !== cylT.solid, 'a primitive added to a model with a solid in it: ids kept, a second solid');

    // ---- refusals of the primitives
    bi(() => Pr.cylinder(B.EMPTY, { frame: {}, r: 1, h: 1 }), BAD, 'frame');
    bi(() => Pr.cylinder(7, { frame: Fr.WORLD, r: 1, h: 1 }), BAD, 'b');
    bi(() => Pr.cylinder(B.EMPTY, { frame: Fr.WORLD, r: 0, h: 1 }), BAD, 'r');
    bi(() => Pr.cone(B.EMPTY, { frame: Fr.WORLD, r: 1, h: -1 }), BAD, 'h');
    bi(() => Pr.sphere(B.EMPTY, { frame: Fr.WORLD, r: NaN }), BAD, 'r');
    must(() => Pr.torus(B.EMPTY, { frame: Fr.WORLD, R: 1, r: 1 }), BAD, { name: 'R', why: 'not_above_r' });
    bi(() => Pr.torus(B.EMPTY, { frame: Fr.WORLD, R: 2 ** 600, r: 1 }), BAD, 'R');
    held('refused, typed: a frame that is not one, a model that is not one, r or h zero, negative or NaN, a torus with R ≤ r, a size past 2^500');

    // ---- the winding number, against an exact crossing count in BigInt
    const dy = (x) => { const { m, e } = R.decompose(x); return { m, e }; };
    const scaleOf = (xs) => xs.reduce((s, x) => Math.min(s, x === 0 ? 0 : dy(x).e), 0);
    const big = (x, s) => { if (x === 0) return 0n; const { m, e } = dy(x); return m << BigInt(e - s); };
    /** the same rule, a different arithmetic: whole numbers, and the side of the edge by a cross product of whole numbers */
    const refWinding = (poly, q) => {
      const s = scaleOf([...poly.flat(), ...q]), Pt = poly.map((p) => [big(p[0], s), big(p[1], s)]), Qq = [big(q[0], s), big(q[1], s)];
      let w = 0;
      for (let i = 0; i < Pt.length; i++) {
        const a = Pt[i], b = Pt[(i + 1) % Pt.length], cr = (b[0] - a[0]) * (Qq[1] - a[1]) - (b[1] - a[1]) * (Qq[0] - a[0]);   // cross(b − a, q − a) > 0: q is left of a → b
        const lo = a[1] < b[1] ? a[1] : b[1], hi = a[1] < b[1] ? b[1] : a[1];
        if (cr === 0n && (a[0] < b[0] ? a[0] : b[0]) <= Qq[0] && Qq[0] <= (a[0] < b[0] ? b[0] : a[0]) && lo <= Qq[1] && Qq[1] <= hi) return null;
        if (!(lo <= Qq[1] && Qq[1] < hi)) continue;
        w += a[1] < b[1] ? (cr > 0n ? 1 : 0) : (cr < 0n ? -1 : 0);
      }
      return w;
    };
    const toPieces = (poly) => poly.map((a, i) => ({ kind: 'seg', a, b: poly[(i + 1) % poly.length] }));
    let agree = 0, total = 0, onCount = 0, ulpOnes = 0;
    for (let i = 0; i < 4000; i++) {
      const sc = F.pow2(g.int(40) - 20), cnt = 3 + g.int(4), poly = Array.from({ length: cnt }, () => [(g.int(21) - 10) * sc, (g.int(21) - 10) * sc]);
      const a = poly[g.int(cnt)], b = poly[g.int(cnt)];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      // one ulp off, but never from 0: a subnormal is outside the predicates' domain (math/predicates.js refuses it)
      const up = (x) => (x === 0 ? sc * F.pow2(-30) : F.nextUp(x)), down = (x) => (x === 0 ? -sc * F.pow2(-30) : F.nextDown(x));
      const qs = [[(g.int(25) - 12) * sc, (g.int(25) - 12) * sc], a, mid, [(g.int(25) - 12) * sc, a[1]], [up(mid[0]), mid[1]], [mid[0], down(mid[1])], [down(mid[0]), up(mid[1])], [up(a[0]), a[1]]];
      for (const q of qs) {
        const w = Tr.winding(toPieces(poly), q), want = refWinding(poly, q);
        total++;
        if (w === want) agree++;;
        if (want === null) onCount++;
        if (q !== a && q !== mid && want !== null && (q[0] !== a[0] || q[1] !== a[1])) ulpOnes++;
      }
    }
    ok(agree === total, `winding: ${total} cases (random corners and points, corners, midpoints, a ray through a vertex, one ulp off an edge and off a corner) agree with the BigInt count; ${onCount} points exactly on a loop come back null`);
    ok(onCount > 400 && ulpOnes > 4000, `the draw is a real test: ${onCount} exact hits, ${ulpOnes} near-degenerate non-hits`);

    // ---- winding on circles: a disc cap's loop is four quarter arcs; exact hits on a circle, one ulp in and out
    const capF = Fr.frameFromZX([0, 0, 0], [0, 0, 1], [1, 0, 0]);
    const disc = Pr.cylinder(B.EMPTY, { frame: capF, r: 5, h: 2 }), dloop = (face) => B.get(disc.brep, 'face', face).loops[0];
    const pBot = Tr.uvLoop(disc.brep, dloop(disc.bottom)), pTop = Tr.uvLoop(disc.brep, dloop(disc.top));
    ok(pBot.length === 4 && pTop.length === 4 && pTop.every((p) => p.kind === 'arc'), 'a disc cap\'s loop is four quarter arcs, cut at the quarter turns');
    const exactCircle = (q) => { const s = scaleOf([...q, 5]), a = big(q[0], s), c = big(q[1], s), r = big(5, s); const d = a * a + c * c - r * r; return d === 0n ? 0 : d < 0n ? -1 : 1; };
    let circAgree = 0, circTotal = 0, hits = 0;
    const pyth = [[3, 4], [4, 3], [5, 0], [0, 5], [-3, 4], [-4, -3], [0, -5], [3, -4], [-5, 0]];
    for (let i = 0; i < 400; i++) {
      const base = i < 80 ? pyth[i % pyth.length] : [g.range(-6, 6), g.range(-6, 6)], q = [base[0], base[1]];
      const jit = i % 4, pt = jit === 1 ? [F.nextUp(q[0]), q[1]] : jit === 2 ? [F.nextDown(q[0]), q[1]] : jit === 3 ? [q[0], F.nextUp(q[1])] : q;
      for (const [pieces, sgn] of [[pTop, 1], [pBot, -1]]) {
        const w = Tr.winding(pieces, pt), c = exactCircle(pt);
        circTotal++;
        if (c === 0) hits++;
        if (c === 0 ? w === null : w === (c < 0 ? sgn : 0)) circAgree++;
      }
    }
    ok(circAgree === circTotal && hits > 20, `winding round a disc agrees with the exact sign of u² + v² − r² on ${circTotal} points, ${hits} of them exactly on the circle (3-4-5 and the axes), the rest one ulp in or out: counter-clockwise +1, clockwise −1`);

    // ---- the same off the origin: a circle about (3, −2) in a plane's (u, v), where the cross terms of u² + v² − r² are not zero
    const offF = Fr.frameFromZX([0, 0, 0], [0, 0, 1], [1, 0, 0]), offPl = AS.plane({ frame: offF, urange: [-20, 20], vrange: [-20, 20] }), cen = [3, -2];
    const offBody = B.edit(B.EMPTY, (d) => {
      const ring = AC.circle({ frame: Fr.frameFromZX([cen[0], cen[1], 0], [0, 0, 1], [1, 0, 0]), r: 5 }), v = d.vertex([8, -2, 0]), e = d.edge(ring, 0, TAU, v, v);
      d.shell([d.face(offPl, 1, [d.loop(null, [[e, 1]], { pcurves: [Pc.pcurveOf(offPl, ring, 0, TAU)] })])]);
    });
    const offFace = B.ids(offBody, 'face')[0], offPieces = Tr.uvLoop(offBody, B.ids(offBody, 'loop')[0]);
    const exactAbout = (q) => { const s = scaleOf([...q, ...cen, 5]), a = big(q[0], s) - big(cen[0], s), c = big(q[1], s) - big(cen[1], s), r5 = big(5, s), d = a * a + c * c - r5 * r5; return d === 0n ? 0 : d < 0n ? -1 : 1; };
    const onCircle = [[6, 2], [-1, 2], [3, 3], [3, -7], [8, -2], [-2, -2], [-1, -5], [7, -5]];
    let offAgree = 0, offTotal = 0, offHits = 0;
    for (let i = 0; i < 320; i++) {
      const base = i < 80 ? onCircle[i % onCircle.length] : [cen[0] + g.range(-6, 6), cen[1] + g.range(-6, 6)], j = i % 4;
      const q = j === 1 ? [F.nextUp(base[0]), base[1]] : j === 2 ? [base[0], F.nextDown(base[1])] : j === 3 ? [F.nextDown(base[0]), F.nextUp(base[1])] : base, c = exactAbout(q), w = Tr.winding(offPieces, q);
      offTotal++;
      if (c === 0) offHits++;
      if (c === 0 ? w === null : w === (c < 0 ? 1 : 0)) offAgree++;
    }
    ok(offAgree === offTotal && offHits >= 20, `winding round a circle about (3, −2) agrees with the exact sign of (u − 3)² + (v + 2)² − 25 on ${offTotal} points, ${offHits} of them exactly on it (3-4-5 about the centre), the rest one ulp in or out`);
    ok(Tr.classify(offBody, offFace, [3, -2]) === 'in' && Tr.classify(offBody, offFace, [-3, -2]) === 'out' && Tr.classify(offBody, offFace, [8, -2]) === 'on', 'classify on that face: its centre in, a point beyond its edge out, a point on it on');

    // ---- a cap's plane is cut wider than its disc, so rounding at the rim never puts the rim outside the plane's range
    const cylR = bodies.find((x) => x[1] === cylT)[3];
    ok([cylT.top, cylT.bottom].every((fc) => { const s = B.get(cylT.brep, 'face', fc).surface; return SF.domainU(s)[1] > cylR * 1.1 && SF.domainV(s)[0] < -cylR * 1.1; }), 'a cylinder\'s cap planes reach past the rim by at least a tenth of the radius, each way');

    // ---- classify: the primitives
    let cls = 0, clsBad = 0;
    const expect = (b, face, q, want, what) => { cls++; const got = Tr.classify(b, face, q); if (got !== want) { clsBad++; if (clsBad < 5) console.log('  classify', what, q, 'got', got, 'want', want); } };
    for (const [name, t, , r, h] of bodies.filter((x) => x[2] !== undefined)) {
      const b = t.brep;
      if (name === 'cylinder') {
        for (let i = 0; i < 40; i++) {
          const u = g.range(0.05, TAU - 0.05), v = g.range(0.05, h - 0.05), k = g.int(5) - 2;
          expect(b, t.side, [u, v], 'in', 'cyl in'); expect(b, t.side, [u + k * TAU, v], 'in', 'cyl wrapped');
          expect(b, t.side, [u, h + g.range(0.01, 1)], 'out', 'cyl above'); expect(b, t.side, [u, -g.range(0.01, 1)], 'out', 'cyl below');
          const d = g.range(0.01, 2 * r), ang = g.range(0, TAU);
          if (Math.abs(d - r) > 1e-3) for (const cap of [t.top, t.bottom]) expect(b, cap, [d * Math.cos(ang), d * Math.sin(ang)], d < r ? 'in' : 'out', 'cap');
        }
        for (const [u, v] of [[0, h / 2], [TAU, h / 2], [TAU + TOL / 2, h / 2], [-TOL / 2, h / 2], [1, 0], [1, h], [0, 0], [TAU, h]]) expect(b, t.side, [u, v], 'on', 'cyl on');
        expect(b, t.top, [r, 0], 'on', 'rim'); expect(b, t.top, [0, r + 5e-7], 'on', 'rim, within tol.lin'); expect(b, t.top, [r * (1 - 1e-9), 0], 'on', 'rim, 1e-9');
      } else if (name === 'sphere') {
        for (let i = 0; i < 40; i++) {
          const u = g.range(0.05, TAU - 0.05), v = g.range(-T.HALF_PI + 0.05, T.HALF_PI - 0.05), k = g.int(5) - 2;
          expect(b, t.face, [u + k * TAU, v], 'in', 'sphere in');
          expect(b, t.face, [u, T.HALF_PI + g.range(0.01, 1)], 'out', 'sphere beyond north'); expect(b, t.face, [u, -T.HALF_PI - g.range(0.01, 1)], 'out', 'sphere beyond south');
        }
        for (const u of [0, 1, 3, TAU]) { expect(b, t.face, [u, T.HALF_PI], 'on', 'north pole'); expect(b, t.face, [u, -T.HALF_PI], 'on', 'south pole'); }
        expect(b, t.face, [1, T.HALF_PI - 1e-3], 'in', 'near the pole');
      } else if (name === 'cone') {
        for (let i = 0; i < 40; i++) { const u = g.range(0.05, TAU - 0.05), v = g.range(0.05, h - 0.05); expect(b, t.side, [u, v], 'in', 'cone in'); expect(b, t.side, [u, h + g.range(0.01, 1)], 'out', 'beyond the apex'); }
        for (const u of [0, 2, TAU]) expect(b, t.side, [u, h], 'on', 'apex');
        expect(b, t.side, [3, h - 1e-3], 'in', 'near the apex');
      } else {
        for (let i = 0; i < 60; i++) { const u = g.range(0, TAU), v = g.range(0, TAU); expect(b, t.face, [u + (g.int(5) - 2) * TAU, v + (g.int(5) - 2) * TAU], 'in', 'torus in'); }
        for (const q of [[0, 1], [TAU, 1], [1, 0], [1, TAU], [0, 0], [TAU, TAU]]) expect(b, t.face, q, 'on', 'torus seam');
      }
    }
    ok(clsBad === 0, `classify on the primitives, ${cls} points: inside a cylinder's, sphere's, cone's and torus's face in a few turns of its angles, outside it, on a seam from both sides, at a pole and the apex, round a disc to within 1e-3 and 'on' within tol.lin`);

    // ---- a ring: a plane face with a hole (the hole's loop runs the other way)
    const wf = Fr.frameFromZX([0, 0, 0], [0, 0, 1], [1, 0, 0]), pl = AS.plane({ frame: wf, urange: [-6, 6], vrange: [-6, 6] });
    const ringBody = B.edit(B.EMPTY, (d) => {
      const outer = AC.circle({ frame: wf, r: 5 }), inner = AC.circle({ frame: wf, r: 2 });
      const vo = d.vertex([5, 0, 0]), vi = d.vertex([2, 0, 0]);
      const eo = d.edge(outer, 0, TAU, vo, vo), ei = d.edge(inner, 0, TAU, vi, vi);
      const l1 = d.loop(null, [[eo, 1]], { pcurves: [Pc.pcurveOf(pl, outer, 0, TAU)] }), l2 = d.loop(null, [[ei, -1]], { pcurves: [Pc.pcurveOf(pl, inner, 0, TAU)] });
      const fc = d.face(pl, 1, [l1, l2]);
      d.shell([fc]);
    });
    const rf = B.ids(ringBody, 'face')[0];
    let ringBad = 0;
    for (let i = 0; i < 300; i++) {
      const d = g.range(0, 7), a = g.range(0, TAU), q = [d * Math.cos(a), d * Math.sin(a)], want = Math.abs(d - 5) < 1e-3 || Math.abs(d - 2) < 1e-3 ? 'on' : d > 2 && d < 5 ? 'in' : 'out';
      const got = Tr.classify(ringBody, rf, q);
      if (want !== 'on' && got !== want) ringBad++;
    }
    ok(ringBad === 0 && Tr.classify(ringBody, rf, [3.5, 0]) === 'in' && Tr.classify(ringBody, rf, [0, 0]) === 'out' && Tr.classify(ringBody, rf, [6, 0]) === 'out' && Tr.classify(ringBody, rf, [2, 0]) === 'on' && Tr.classify(ringBody, rf, [-5, 0]) === 'on', 'a ring (a face with a hole): in the ring is in, in the hole and outside are out, on either circle is on: the hole\'s loop cancels the outer one inside it');

    // ---- refusals of classify
    const sideF = cylT.side;
    must(() => Tr.classify(cylT.brep, 999, [0, 0]), BAD, { name: 'face', why: 'unknown' });
    bi(() => Tr.classify(cylT.brep, sideF, [0]), BAD, 'q');
    bi(() => Tr.classify(5, sideF, [0, 0]), BAD, 'b');
    bi(() => Tr.winding([], [NaN, 0]), BAD, 'q');
    bi(() => Tr.winding(7, [0, 0]), BAD, 'pieces');
    const flipped = B.edit(cylT.brep, (d) => d.set('face', cylT.bottom, { sense: 1 }));                  // the bottom cap inside out
    must(() => Tr.classify(flipped, cylT.bottom, [0, 0]), 'solid.err.bad_topology', { rule: 'orientation', kind: 'face', id: cylT.bottom });
    const cube = Bu.polyhedron(B.EMPTY, [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7]]);
    must(() => Tr.classify(cube.brep, B.ids(cube.brep, 'face')[0], [0.5, 0.5]), NOT, { what: 'loop', why: 'no_pcurve' });
    const broken = B.edit(cylT.brep, (d) => { const c = B.get(cylT.brep, 'face', cylT.side).loops[0]; const co = B.get(cylT.brep, 'loop', c).coedges[1]; d.set('coedge', co, { pcurve: Pc.uvLine([1, 0], [1, 1], 0, B.get(cylT.brep, 'edge', cylT.edges.seam).t1) }); });
    must(() => Tr.classify(broken, cylT.side, [1, 1]), NOT, { what: 'loop', why: 'open_in_uv' });
    held('refused, typed: an unknown face, a point that is not a pair, a model that is not one, a winding of something that is not pieces, a face inside out (bad_topology, orientation), a coedge with no pcurve, a loop that does not close in (u, v)');

    // ---- attach: pcurves for a polyhedron; periodic faces left to their builders
    const at = Tr.attach(cube.brep);
    ok(at.made.length === 24 && at.skipped.length === 0 && B.ids(at.brep, 'coedge').every((c) => B.get(at.brep, 'coedge', c).pcurve !== null), 'attach: a cube\'s 24 coedges get pcurves (lines in each plane\'s (u, v)), none skipped');
    ok(closedAll(at.brep) && Tr.attach(at.brep).made.length === 0, 'the cube\'s loops are closed in (u, v), and attaching again changes nothing');
    function closedAll(b) { return B.ids(b, 'face').every((f) => closed(b, f, 1e-12 * 4)); }
    let inCube = 0, cubeTotal = 0;
    for (const f of B.ids(at.brep, 'face')) {
      const s = B.get(at.brep, 'face', f).surface, vs = B.get(at.brep, 'loop', B.get(at.brep, 'face', f).loops[0]).coedges.map((c) => walk(at.brep, B.get(at.brep, 'coedge', c))[0]);
      const lo = [Math.min(...vs.map((v) => v[0])), Math.min(...vs.map((v) => v[1]))], hi = [Math.max(...vs.map((v) => v[0])), Math.max(...vs.map((v) => v[1]))];
      for (let i = 0; i < 20; i++) {
        const q = [g.range(lo[0] - 0.5, hi[0] + 0.5), g.range(lo[1] - 0.5, hi[1] + 0.5)], inside = q[0] > lo[0] + 1e-3 && q[0] < hi[0] - 1e-3 && q[1] > lo[1] + 1e-3 && q[1] < hi[1] - 1e-3, outside = q[0] < lo[0] - 1e-3 || q[0] > hi[0] + 1e-3 || q[1] < lo[1] - 1e-3 || q[1] > hi[1] + 1e-3;
        if (!inside && !outside) continue;
        cubeTotal++;
        if (Tr.classify(at.brep, f, q) === (inside ? 'in' : 'out')) inCube++;
      }
    }
    ok(cubeTotal > 60 && inCube === cubeTotal, `classify on the cube's six faces after attach: ${cubeTotal} points inside or outside each square, all right`);
    const stripped = B.edit(cylT.brep, (d) => { for (const c of B.ids(cylT.brep, 'coedge')) d.set('coedge', c, { pcurve: null }); });
    const sk = Tr.attach(stripped);
    ok(sk.made.length === 2 && sk.skipped.length === 4 && sk.skipped.every(([, why]) => why === 'periodic'), 'attach on a cylinder with its pcurves taken off: the two caps (planes) are given theirs, the four coedges of the side (a periodic surface) are skipped and say why');
  });
}
