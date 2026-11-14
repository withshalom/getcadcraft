/* SPDX-License-Identifier: Apache-2.0 */
/**
 * test-analytic.mjs — engine.solid's S7 tests (geom/analytic-curve.js, analytic-surface.js, curve.js, surface.js,
 * diffgeo.js), registered by test.mjs: section `analytic`.
 *
 * The answers come from somewhere the engine cannot reach:
 *   - points: the textbook formulas evaluated here with Math.sin and Math.cos (the engine uses its own core/trig.js);
 *   - derivatives: fourth-order central differences of those formulas;
 *   - exact conversions (HANDOFF § 14, S7): every point of toNurbs' result satisfies the implicit equation of the analytic
 *     shape (radius, distance from the axis, height) to 1e-12 of its size, and agrees with it at every knot;
 *   - areas (HANDOFF § 14, S7): sphere and torus patches of the converted NURBS, integrated here with Gauss–Legendre rules,
 *     against their closed forms, to 1e-9;
 *   - normals and curvatures against closed forms (outward normals; poles and the apex by their limits).
 */
export async function register({ section, ok, refuses, same, deepFrozen, appUrl }) {
  const P = await import(appUrl('solid/index.js'));
  const A = P.analyticCurve, S = P.analyticSurface, C = P.curve, SF = P.surface, NC = P.nurbsCurve, NS = P.nurbsSurface;
  const V = P.vec3, Fr = P.frame, M = P.mat4, T = P.trig, Q = P.quad;
  const BAD = 'solid.err.bad_input';

  section('analytic', 'S7: analytic curves and surfaces — closed forms, exact conversions to NURBS, areas, normals, curvature', () => {
    const g = P.makePrng(701);
    const frameR = () => Fr.frameFromZX([g.range(-50, 50), g.range(-50, 50), g.range(-50, 50)], [g.range(-1, 1), g.range(-1, 1), g.range(0.2, 1)], [g.range(-1, 1), 1, g.range(-1, 1)]);
    const loc = (f, p) => Fr.toLocal(f, p);
    const mathCS = (t) => [Math.cos(t), Math.sin(t)];
    const at = (a, b, k, n) => (k >= n ? b : Math.min(b, a + (b - a) * k / n));

    // ---------------------------------------------------------------------------------------- records
    const f0 = Fr.frameFromZX([0, 0, 0], [0, 0, 1], [1, 0, 0]);
    const ci0 = A.circle({ frame: f0, r: 2 });
    ok(A.isAnalytic(ci0) && deepFrozen(ci0) && same(A.domain(ci0), [0, T.TAU]) && ci0.phase === 0 && C.isCurve(ci0) && C.typeOf(ci0) === 'circle' && !A.isAnalytic({ ...ci0 }), 'circle: a frozen record (frame, r, phase, range); a full turn by default; one interface (curve.js) knows it; a copy is not one');
    ok(refuses(() => A.circle({ frame: { o: [0, 0, 0] }, r: 1 }), BAD, { name: 'frame', why: 'not_a_frame' }) && refuses(() => A.circle({ frame: f0, r: 0 }), BAD, { name: 'r', why: 'not_positive' }) && refuses(() => A.circle({ frame: f0, r: 1, range: [0, 7] }), BAD, { name: 'range', why: 'out_of_range' }) && refuses(() => A.circle({ frame: f0, r: 1, range: [1, 1] }), BAD, { name: 'range', why: 'not_a_range' }) && refuses(() => A.ellipse({ frame: f0, a: 1, b: -1 }), BAD, { name: 'b', why: 'not_positive' }), 'refused: a frame that is not one, a radius ≤ 0, an arc longer than a turn, an empty range, a negative semi-axis');
    ok(refuses(() => A.line({ o: [0, 0, 0], d: [0, 0, 0], range: [0, 1] }), BAD, { name: 'd', why: 'zero_length' }) && refuses(() => A.lineThrough([1, 2, 3], [1, 2, 3]), BAD, { name: 'q', why: 'same_point' }) && refuses(() => A.line({ o: [0, 0], d: [1, 0, 0], range: [0, 1] }), BAD, { name: 'o', why: 'not_a_vector' }), 'refused: a zero direction, a line through one point twice, a non-vector');
    ok(refuses(() => S.torus({ frame: f0, R: 1, r: 1 }), BAD, { name: 'R', why: 'not_above_r' }) && refuses(() => S.sphere({ frame: f0, r: 1, vrange: [-2, 0] }), BAD, { name: 'vrange', why: 'out_of_range' }) && refuses(() => S.cone({ frame: f0, r: 1, angle: 0.5, vrange: [-5, 1] }), BAD, { name: 'vrange', why: 'crosses_apex' }) && refuses(() => S.cone({ frame: f0, r: 1, angle: 0, vrange: [0, 1] }), BAD, { name: 'angle', why: 'out_of_range' }) && refuses(() => S.revolution({ profile: { type: 'line' }, axis: { o: [0, 0, 0], d: [0, 0, 1] } }), BAD, { name: 'profile', why: 'not_a_curve' }), 'refused: a torus with R ≤ r, a sphere past its poles, a cone through its apex, a cone of semi-angle 0, a profile that is no curve');

    // ---------------------------------------------------------------------------------------- points and derivatives
    let ptMax = 0, dMax = 0;
    const curves = [], surfs = [];
    for (let i = 0; i < 40; i++) {
      const f = frameR(), r = g.range(0.5, 20), a = g.range(0.5, 20), b = g.range(0.5, 20), t0 = g.range(-7, 7), t1 = t0 + g.range(0.3, 6.28);
      curves.push([A.circle({ frame: f, r, range: [t0, t1] }), (t) => { const [c, s] = mathCS(t); return V.add(f.o, V.add(V.scale(f.x, r * c), V.scale(f.y, r * s))); }]);
      curves.push([A.ellipse({ frame: f, a, b, range: [t0, t1] }), (t) => { const [c, s] = mathCS(t); return V.add(f.o, V.add(V.scale(f.x, a * c), V.scale(f.y, b * s))); }]);
      const o = f.o, d = V.unit(f.z);
      curves.push([A.line({ o, d, range: [t0, t1] }), (t) => V.add(o, V.scale(d, t))]);
      const R = r + g.range(0.5, 9), al = g.range(0.1, 1.3), v0 = g.range(0, 5), v1 = v0 + g.range(0.5, 9);
      surfs.push([S.cylinder({ frame: f, r, urange: [t0, t1], vrange: [v0, v1] }), (u, v) => { const [c, s] = mathCS(u); return V.add(f.o, V.add(V.add(V.scale(f.x, r * c), V.scale(f.y, r * s)), V.scale(f.z, v))); }]);
      surfs.push([S.cone({ frame: f, r, angle: al, urange: [t0, t1], vrange: [v0, v1] }), (u, v) => { const [c, s] = mathCS(u), q = r + v * Math.tan(al); return V.add(f.o, V.add(V.add(V.scale(f.x, q * c), V.scale(f.y, q * s)), V.scale(f.z, v))); }]);
      const lat0 = g.range(-1.5, 1), lat1 = Math.min(1.5707963267948966, lat0 + g.range(0.2, 2));
      surfs.push([S.sphere({ frame: f, r, urange: [t0, t1], vrange: [lat0, lat1] }), (u, v) => { const [c, s] = mathCS(u), [cv, sv] = mathCS(v); return V.add(f.o, V.add(V.add(V.scale(f.x, r * cv * c), V.scale(f.y, r * cv * s)), V.scale(f.z, r * sv))); }]);
      surfs.push([S.torus({ frame: f, R, r, urange: [t0, t1], vrange: [lat0, lat0 + g.range(0.5, 6)] }), (u, v) => { const [c, s] = mathCS(u), [cv, sv] = mathCS(v), q = R + r * cv; return V.add(f.o, V.add(V.add(V.scale(f.x, q * c), V.scale(f.y, q * s)), V.scale(f.z, r * sv))); }]);
      surfs.push([S.plane({ frame: f, urange: [t0, t1], vrange: [v0, v1] }), (u, v) => V.add(f.o, V.add(V.scale(f.x, u), V.scale(f.y, v)))]);
      // a surface of revolution of an analytic profile (a line not through the axis), checked by Rodrigues' formula
      const p0 = V.add(f.o, V.add(V.scale(f.x, r), V.scale(f.z, v0))), p1 = V.add(p0, V.add(V.scale(f.x, g.range(-0.4, 2)), V.scale(f.z, g.range(1, 4))));
      const prof = A.lineThrough(p0, p1), axis = { o: f.o, d: f.z }, L = V.dist(p0, p1);
      const turn = (p, u) => { const rel = V.sub(p, f.o), par = V.scale(f.z, V.dot(rel, f.z)), perp = V.sub(rel, par), [c, s] = mathCS(u); return V.add(V.add(f.o, par), V.add(V.scale(perp, c), V.scale(V.cross(f.z, perp), s))); };
      surfs.push([S.revolution({ profile: prof, axis, urange: [t0, t1] }), (u, v) => turn(V.add(p0, V.scale(V.sub(p1, p0), v / L)), u)]);
      surfs.push([S.extrusion({ profile: prof, d: f.y, vrange: [v0, v1] }), (u, v) => V.add(V.add(p0, V.scale(V.sub(p1, p0), u / L)), V.scale(f.y, v))]);
    }
    const size = (p) => Math.max(1, V.len(p));
    for (const [c, ref] of curves) {
      const [t0, t1] = A.domain(c);
      for (let k = 0; k <= 6; k++) {
        const t = at(t0, t1, k, 6);
        ptMax = Math.max(ptMax, V.dist(A.point(c, t), ref(t)) / size(ref(t)));
        const h = (t1 - t0) * 1e-3, tt = Math.min(t1 - 3 * h, Math.max(t0 + 3 * h, t));
        const fd = V.scale(V.add(V.sub(V.scale(ref(tt + h), 8), V.scale(ref(tt - h), 8)), V.sub(ref(tt - 2 * h), ref(tt + 2 * h))), 1 / (12 * h));
        dMax = Math.max(dMax, V.dist(A.derivs(c, tt, 1)[1], fd) / Math.max(1, V.len(fd)));
        // the higher derivatives, each against the central difference of the one below it
        const D = A.derivs(c, tt, 4);
        for (let q = 2; q <= 4; q++) {
          const fq = V.scale(V.add(V.sub(V.scale(A.derivs(c, tt + h, q - 1)[q - 1], 8), V.scale(A.derivs(c, tt - h, q - 1)[q - 1], 8)), V.sub(A.derivs(c, tt - 2 * h, q - 1)[q - 1], A.derivs(c, tt + 2 * h, q - 1)[q - 1])), 1 / (12 * h));
          dMax = Math.max(dMax, V.dist(D[q], fq) / Math.max(1, V.len(fq)));
        }
      }
    }
    for (const [s, ref] of surfs) {
      const [ua, ub] = S.domainU(s), [va, vb] = S.domainV(s);
      for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
        const u = at(ua, ub, i, 4), v = at(va, vb, j, 4);
        ptMax = Math.max(ptMax, V.dist(S.point(s, u, v), ref(u, v)) / size(ref(u, v)));
        const h = Math.min(ub - ua, vb - va) * 1e-3, uu = Math.min(ub - 3 * h, Math.max(ua + 3 * h, u)), vv = Math.min(vb - 3 * h, Math.max(va + 3 * h, v));
        const d5 = (fn) => V.scale(V.add(V.sub(V.scale(fn(h), 8), V.scale(fn(-h), 8)), V.sub(fn(-2 * h), fn(2 * h))), 1 / (12 * h));
        const D = S.derivs(s, uu, vv, 2), su = d5((e) => ref(uu + e, vv)), sv = d5((e) => ref(uu, vv + e));
        const suv = d5((e) => S.derivs(s, uu, vv + e, 1)[1][0]), suu = d5((e) => S.derivs(s, uu + e, vv, 1)[1][0]), svv = d5((e) => S.derivs(s, uu, vv + e, 1)[0][1]);
        for (const [x, y] of [[D[1][0], su], [D[0][1], sv], [D[1][1], suv], [D[2][0], suu], [D[0][2], svv]]) dMax = Math.max(dMax, V.dist(x, y) / Math.max(1, V.len(y)));
      }
    }
    ok(ptMax <= 1e-14, `points of lines, circles, ellipses, planes, cylinders, cones, spheres, tori, revolution and extrusion surfaces agree with the textbook formulas (Math.sin, Math.cos; Rodrigues' rotation) to ${ptMax.toExponential(1)} of their size (core/trig.js within 1 ulp)`);
    ok(dMax <= 1e-8, `derivatives (C′ … C⁗; Su, Sv, Suu, Suv, Svv) agree with fourth-order central differences (worst ${dMax.toExponential(1)})`);
    ok(A.derivs(curves[0][0], A.domain(curves[0][0])[0], 5).every((d, k) => k === 0 || Math.abs(V.len(d) - curves[0][0].r) <= 1e-14 * curves[0][0].r), "a circle's derivatives all have length r (a quarter turn each)");

    // ---------------------------------------------------------------------------------------- exact conversions
    let convC = 0, convS = 0, knotC = 0, knotS = 0, domOk = true;
    // reversed curves carry a phase: their conversions are checked too
    const withReversed = [...curves, ...curves.filter(([c]) => c.type !== 'line').slice(0, 30).map(([c, ref]) => [A.reverse(c), ref])];
    for (const [c] of withReversed) {
      const n = A.toNurbs(c), [t0, t1] = A.domain(c), f = c.frame;
      if (!same(NC.domain(n), [t0, t1])) domOk = false;
      for (let k = 0; k <= 40; k++) {
        const t = at(t0, t1, k, 40), p = NC.point(n, t);
        if (c.type === 'line') convC = Math.max(convC, V.dist(p, A.point(c, t)) / size(p));
        else {
          const l = loc(f, p), A1 = c.type === 'circle' ? c.r : c.a, B1 = c.type === 'circle' ? c.r : c.b;
          convC = Math.max(convC, Math.abs(Math.hypot(l[0] / A1, l[1] / B1) - 1), Math.abs(l[2]) / Math.max(A1, B1));
        }
      }
      for (const kn of [...new Set(n.knots)]) knotC = Math.max(knotC, V.dist(NC.point(n, kn), A.point(c, kn)) / size(A.point(c, kn)));
    }
    // A7.1's pieces: at most a quarter turn each, so every middle weight is at least cos(π/4)
    let pieces = true;
    for (const span of [0.1, 1.5707963267948966, 1.6, 3, 3.1415, 3.2, 4.7, 4.8, 6, 6.283185307179586]) {
      const n = A.toNurbs(A.circle({ frame: f0, r: 1, range: [0.25, 0.25 + span] })), br = [...new Set(n.knots)];
      const want = Math.max(1, Math.ceil(span / (Math.PI / 2) - 1e-12));
      if (br.length - 1 !== want || br.some((x, i) => i > 0 && x - br[i - 1] > Math.PI / 2 + 1e-12) || n.w.some((w) => w < Math.SQRT1_2 - 1e-15)) pieces = false;
    }
    ok(pieces, 'toNurbs of an arc: ⌈span / (π/2)⌉ pieces, none longer than a quarter turn, every weight at least cos(π/4) (A7.1)');
    ok(convC <= 1e-12 && knotC <= 1e-14 && domOk, `toNurbs on lines, circle and ellipse arcs: every point on the analytic curve to ${convC.toExponential(1)} (radius and plane), the same points at every knot (${knotC.toExponential(1)}), the same domain`);
    for (const [s] of surfs) {
      if (!s.frame) continue;                                  // revolution and extrusion: their own test below
      const n = S.toNurbs(s), f = s.frame;
      if (!same(NS.domainU(n), S.domainU(s)) || !same(NS.domainV(n), S.domainV(s))) domOk = false;
      const [ua, ub] = NS.domainU(n), [va, vb] = NS.domainV(n);
      for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) {
        const p = NS.point(n, at(ua, ub, i, 12), at(va, vb, j, 12)), l = loc(f, p), rho = Math.hypot(l[0], l[1]);
        let e;
        if (s.type === 'plane') e = Math.abs(l[2]) / size(p);
        else if (s.type === 'cylinder') e = Math.abs(rho - s.r) / s.r;
        else if (s.type === 'cone') e = Math.abs(rho - (s.r + l[2] * s.tanA)) / (s.r + Math.abs(l[2]) + 1);
        else if (s.type === 'sphere') e = Math.abs(V.len(l) - s.r) / s.r;
        else e = Math.abs(Math.hypot(rho - s.R, l[2]) - s.r) / s.R;
        convS = Math.max(convS, e);
      }
      for (const ku of [...new Set(n.knotsU)]) for (const kv of [...new Set(n.knotsV)]) knotS = Math.max(knotS, V.dist(NS.point(n, ku, kv), S.point(s, ku, kv)) / size(S.point(s, ku, kv)));
    }
    ok(convS <= 1e-12 && knotS <= 1e-13 && domOk, `toNurbs on planes, cylinders, cones, spheres and tori: every point on the analytic surface to ${convS.toExponential(1)} (radius, distance from the axis, height), the same points at every knot pair (${knotS.toExponential(1)}), the same domains`);
    // revolution and extrusion of a NURBS profile
    {
      let rv = 0, ex = 0;
      for (let i = 0; i < 20; i++) {
        const prof = NC.make({ deg: 3, knots: [0, 0, 0, 0, 0.5, 1, 1, 1, 1], cvs: [[2, 0, 0], [3, 0, 1], [2.5, 0, 2], [4, 0, 3], [3, 0, 4]].map((q) => [q[0] + g.range(0, 1), g.range(-0.3, 0.3), q[2]]), w: [1, g.range(0.5, 2), 1, g.range(0.5, 2), 1] });
        const ax = { o: [g.range(-1, 1), g.range(-1, 1), 0], d: [g.range(-0.2, 0.2), g.range(-0.2, 0.2), 1] }, a = V.unit(ax.d);
        const sr = S.revolution({ profile: prof, axis: ax, urange: [0, g.range(1, 6.28)] }), n = S.toNurbs(sr), [ua, ub] = NS.domainU(n);
        for (let j = 0; j <= 10; j++) for (let k = 0; k <= 10; k++) {
          const v = k / 10, p = NS.point(n, at(ua, ub, j, 10), v), c = NC.point(prof, v);
          const h = (x) => V.dot(V.sub(x, ax.o), a), rad = (x) => V.len(V.sub(V.sub(x, ax.o), V.scale(a, h(x))));
          rv = Math.max(rv, Math.abs(h(p) - h(c)), Math.abs(rad(p) - rad(c)));
        }
        const se = S.extrusion({ profile: prof, d: [1, 1, 0], vrange: [0, 3] }), ne = S.toNurbs(se);
        for (let k = 0; k <= 10; k++) for (const v of [0, 1.3, 3]) ex = Math.max(ex, V.dist(NS.point(ne, k / 10, v), V.add(NC.point(prof, k / 10), V.scale(V.unit([1, 1, 0]), v))), V.dist(S.point(se, k / 10, v), NS.point(ne, k / 10, v)));
      }
      ok(rv <= 1e-12 && ex <= 1e-13, `revolution of a rational profile (A8.1): every NURBS point keeps the profile's height along the axis and distance from it (${rv.toExponential(1)}); extrusion is the profile moved along d (${ex.toExponential(1)})`);
    }

    // ---------------------------------------------------------------------------------------- areas (HANDOFF § 14, S7)
    const area = (n) => {
      const rule = Q.rule(24), us = [...new Set(n.knotsU)], vs = [...new Set(n.knotsV)];
      let A0 = 0;
      for (let i = 0; i + 1 < us.length; i++) for (let j = 0; j + 1 < vs.length; j++) {
        const hu = (us[i + 1] - us[i]) / 2, hv = (vs[j + 1] - vs[j]) / 2, mu = (us[i + 1] + us[i]) / 2, mv = (vs[j + 1] + vs[j]) / 2;
        for (let a = 0; a < rule.x.length; a++) for (let b = 0; b < rule.x.length; b++) {
          const D = NS.derivs(n, mu + hu * rule.x[a], mv + hv * rule.x[b], 1);
          A0 += rule.w[a] * rule.w[b] * hu * hv * V.len(V.cross(D[1][0], D[0][1]));
        }
      }
      return A0;
    };
    let aMax = 0;
    for (let i = 0; i < 12; i++) {
      const f = frameR(), r = g.range(0.5, 9), u0 = g.range(-3, 3), u1 = u0 + g.range(0.5, 6.28), v0 = g.range(-1.5, 1), v1 = Math.min(1.5707963267948966, v0 + g.range(0.3, 2));
      const sp = S.sphere({ frame: f, r, urange: [u0, u1], vrange: [v0, v1] });
      const want = r * r * (u1 - u0) * (Math.sin(v1) - Math.sin(v0));
      aMax = Math.max(aMax, Math.abs(area(S.toNurbs(sp)) / want - 1));
      const R = r + g.range(0.5, 9), w0 = g.range(-3, 3), w1 = w0 + g.range(0.5, 6.28), to = S.torus({ frame: f, R, r, urange: [u0, u1], vrange: [w0, w1] });
      const wantT = r * (u1 - u0) * (R * (w1 - w0) + r * (Math.sin(w1) - Math.sin(w0)));
      aMax = Math.max(aMax, Math.abs(area(S.toNurbs(to)) / wantT - 1));
    }
    ok(aMax <= 1e-9, `the converted sphere and torus patches have their closed-form areas (r² Δu (sin v1 − sin v0); r Δu (R Δv + r Δ sin v)) to ${aMax.toExponential(1)} (Gauss–Legendre, 24 points per knot span)`);

    // ---------------------------------------------------------------------------------------- normals and curvature
    {
      const f = frameR(), r = 3, R = 7, al = 0.6;
      const sp = S.sphere({ frame: f, r }), cy = S.cylinder({ frame: f, r, vrange: [0, 5] }), to = S.torus({ frame: f, R, r }), co = S.cone({ frame: f, r: 0, angle: al, vrange: [0, 4] }), pl = S.plane({ frame: f, urange: [0, 1], vrange: [0, 1] });
      let en = 0, ek = 0;
      for (let i = 0; i <= 6; i++) for (let j = 1; j <= 5; j++) {
        const u = 6.28 * i / 6, lat = -1.5 + 3 * j / 6, p = S.point(sp, u, lat);
        en = Math.max(en, V.dist(S.normal(sp, u, lat), V.scale(V.sub(p, f.o), 1 / r)));
        const k = S.curvature(sp, u, lat);
        ek = Math.max(ek, Math.abs(k.k1 * r + 1), Math.abs(k.k2 * r + 1), Math.abs(k.K * r * r - 1));
        const vv = 6.28 * j / 6, pt = S.point(to, u, vv), [cu, su] = mathCS(u), [cv, sv] = mathCS(vv);
        const nt = V.add(V.add(V.scale(f.x, cv * cu), V.scale(f.y, cv * su)), V.scale(f.z, sv));
        en = Math.max(en, V.dist(S.normal(to, u, vv), nt));
        const kt = S.curvature(to, u, vv), want = [-1 / r, -cv / (R + r * cv)].sort((x, y) => y - x);
        ek = Math.max(ek, Math.abs(kt.k1 - want[0]) * r, Math.abs(kt.k2 - want[1]) * r);
        const kc = S.curvature(cy, u, 2.5);
        ek = Math.max(ek, Math.abs(kc.k1) * r, Math.abs(kc.k2 * r + 1));
        const h = 4 * j / 6, kk = S.curvature(co, u, h), rho = h * Math.tan(al);
        ek = Math.max(ek, Math.abs(kk.k1) * rho, Math.abs(kk.k2 + Math.cos(al) / rho) * rho);
        en = Math.max(en, V.dist(S.normal(pl, 0.5, 0.5), f.z));
        void pt;
      }
      ok(en <= 1e-14 && ek <= 1e-13, `outward normals and principal curvatures against closed forms: sphere (−1/r twice), torus (−1/r, −cos v / (R + r cos v)), cylinder (0, −1/r), cone (0, −cos α / ρ), plane (worst ${Math.max(en, ek).toExponential(1)})`);
      const north = S.normal(sp, 1, T.HALF_PI), south = S.normal(sp, 1, -T.HALF_PI), apex = S.normal(co, 1, 0), [c1, s1] = mathCS(1);
      const apexWant = V.sub(V.scale(V.add(V.scale(f.x, c1), V.scale(f.y, s1)), Math.cos(al)), V.scale(f.z, Math.sin(al)));
      ok(V.dist(north, f.z) <= 1e-15 && V.dist(south, V.scale(f.z, -1)) <= 1e-15 && V.dist(apex, apexWant) <= 1e-15, "the sphere's poles and the cone's apex: the normal is the limit from inside (±z; the cone's outward normal along that generator)");
      ok(refuses(() => S.curvature(sp, 1, T.HALF_PI), BAD, { name: 'uv', why: 'degenerate' }) && refuses(() => S.curvature(co, 1, 0), BAD, { name: 'uv', why: 'degenerate' }), 'curvature at a pole or an apex is refused');
      const el = A.ellipse({ frame: f, a: 5, b: 2 });
      ok(Math.abs(A.curvature(el, 0) - 5 / 4) <= 1e-14 && Math.abs(A.curvature(el, T.HALF_PI) - 2 / 25) <= 1e-15 && Math.abs(A.curvature(A.circle({ frame: f, r: 4 }), 1) - 0.25) <= 1e-15 && A.curvature(A.lineThrough([0, 0, 0], [1, 2, 3]), 0.5) === 0, 'curve curvature: an ellipse a/b² and b/a² at its vertices, a circle 1/r, a line 0');
    }

    // ---------------------------------------------------------------------------------------- reverse, transform, data
    {
      let rmax = 0;
      for (const [c] of curves) {
        const r = A.reverse(c), [t0, t1] = A.domain(c);
        if (!same(A.domain(r), [t0, t1]) || r.type !== c.type) rmax = Infinity;
        for (let k = 0; k <= 8; k++) { const t = at(t0, t1, k, 8); rmax = Math.max(rmax, V.dist(A.point(r, Math.max(t0, Math.min(t1, t0 + t1 - t))), A.point(c, t)) / size(A.point(c, t))); }
      }
      ok(rmax <= 1e-13, `reverse keeps the type and the domain and runs the other way: C′(t0 + t1 − s) = C(s) (an ellipse keeps its axes through the phase; worst ${rmax.toExponential(1)})`);
      let twice = 0;
      for (const [c] of curves) {
        const rr = A.reverse(A.reverse(c)), [t0, t1] = A.domain(c);
        for (let k = 0; k <= 6; k++) { const t = at(t0, t1, k, 6); twice = Math.max(twice, V.dist(A.point(rr, t), A.point(c, t)) / size(A.point(c, t))); }
      }
      ok(twice <= 1e-13, `reversed twice, a curve is itself again, point for point (the phase of a reversed curve carried through; worst ${twice.toExponential(1)})`);
      const Rm = M.mul(M.translation([3, -2, 7]), M.rotation([1, 2, 3], 0.9)), Sm = M.mul(M.scaling([2, 1, 1]), Rm);
      let tmax = 0, kinds = true;
      for (const [c] of curves.slice(0, 12)) {
        const rc = C.transform(c, Rm), sc = C.transform(c, Sm), [t0, t1] = C.domain(c);
        if (C.typeOf(rc) !== c.type || C.typeOf(sc) !== 'nurbs') kinds = false;
        for (let k = 0; k <= 6; k++) { const t = at(t0, t1, k, 6); tmax = Math.max(tmax, V.dist(C.point(rc, t), M.apply(Rm, C.point(c, t))) / size(C.point(c, t))); }
      }
      for (const [s] of surfs.slice(0, 15)) {
        const rs = SF.transform(s, Rm), ss = SF.transform(s, Sm), [ua, ub] = SF.domainU(s), [va, vb] = SF.domainV(s);
        if (SF.typeOf(rs) !== s.type || SF.typeOf(ss) !== 'nurbs') kinds = false;
        for (let k = 0; k <= 4; k++) { const u = at(ua, ub, k, 4), v = at(va, vb, k, 4); tmax = Math.max(tmax, V.dist(SF.point(rs, u, v), M.apply(Rm, SF.point(s, u, v))) / size(SF.point(s, u, v))); }
      }
      ok(kinds && tmax <= 1e-13, `transform: a rigid motion keeps the type (and every point moves with it, ${tmax.toExponential(1)}); a non-uniform scaling turns the shape into its exact NURBS image`);
      let rt = true;
      for (const [x] of [...curves.slice(0, 6), ...surfs.slice(0, 8)]) {
        const isC = C.isCurve(x), d = isC ? C.toData(x) : SF.toData(x), y = isC ? C.fromData(structuredClone(d)) : SF.fromData(JSON.parse(JSON.stringify(d)));
        if (!same(y, x) || (isC ? !C.isCurve(y) : !SF.isSurface(y))) rt = false;
      }
      const prof = A.lineThrough([2, 0, 0], [3, 0, 2]), rev = S.revolution({ profile: prof, axis: { o: [0, 0, 0], d: [0, 0, 1] } });
      const back = SF.fromData(JSON.parse(JSON.stringify(SF.toData(rev))));
      ok(rt && same(SF.point(back, 1, 1), SF.point(rev, 1, 1)) && C.fromData(C.toData(NC.make({ deg: 1, knots: [0, 0, 1, 1], cvs: [[0, 0, 0], [1, 0, 0]] }))).type === 'nurbs', 'toData / fromData through structuredClone and JSON, for every type, a revolution with its profile, and NURBS through the same interface (D-wire)');
      ok(refuses(() => C.point({ type: 'circle' }, 0), BAD, { name: 'curve', why: 'not_a_curve' }) && refuses(() => SF.point({ type: 'plane' }, 0, 0), BAD, { name: 'surface', why: 'not_a_surface' }) && refuses(() => A.point(ci0, 7), BAD, { name: 't', why: 'out_of_domain' }) && refuses(() => S.point(S.plane({ frame: f0, urange: [0, 1], vrange: [0, 1] }), 2, 0), BAD, { name: 'u', why: 'out_of_domain' }) && refuses(() => A.fromData({ type: 'spiral' }), BAD, { name: 'curve', why: 'unknown_type' }), 'refused: look-alike records, parameters outside the domain, an unknown type');
      const cb = A.bbox(ci0);
      ok(cb.min[0] <= -2 && cb.max[0] >= 2 && cb.min[1] <= -2 && cb.max[1] >= 2 && A.isClosed(ci0) && !A.isClosed(A.circle({ frame: f0, r: 1, range: [0, 3] })), 'bbox holds the curve (its NURBS net); a full circle is closed, an arc is not');
    }
  });
}
