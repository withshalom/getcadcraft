/* SPDX-License-Identifier: Apache-2.0 */
/**
 * test-fit.mjs — engine.solid's S8 and S9 tests (geom/fit.js, geom/construct.js), registered by test.mjs: sections `fit`
 * and `construct`.
 *
 *   fit: interpolation passes through its data to 1e-10 of the size (HANDOFF § 14, S8), with the end derivatives it was
 *     given; least-squares approximation stays within the requested tol.fit on a corpus of point sets sampled from known
 *     curves (helices, circles, cubics, noisy ones), and its error is a bound (each point's distance to the curve, by a
 *     dense search, never exceeds it); the KAD / DXF SPLINE forms; refusals.
 *   construct: compatibility leaves every curve unchanged (deviation 0 to rounding); a loft passes through its sections
 *     (HANDOFF § 14, S9), rational ones included; a ruled surface's v-lines are straight; a Coons patch has its four curves
 *     as edges and reproduces a bilinear-blended known surface; grid interpolation passes through the grid; every
 *     compatibility refusal is typed.
 */
export async function register({ section, ok, refuses, same, appUrl }) {
  const P = await import(appUrl('solid/index.js'));
  const FI = P.fit, K = P.construct, CV = P.nurbsCurve, NS = P.nurbsSurface, A = P.analyticCurve, V = P.vec3, Fr = P.frame;
  const BAD = 'solid.err.bad_input';

  section('fit', 'S8: fitting — interpolation through the data, approximation within tol.fit, the SPLINE forms, refusals', () => {
    const g = P.makePrng(801);
    const size = (Q) => Math.max(1, ...Q.map((q) => V.len(q)));
    // a corpus: points sampled from known shapes, unevenly
    const shapes = [
      (t) => [Math.cos(6 * t) * 10, Math.sin(6 * t) * 10, 4 * t],                       // a helix
      (t) => [20 * t, 5 * Math.sin(3 * t), 2 * t * t],                                  // a wave
      (t) => [t * t * t - 2 * t, t * t + 1, -3 * t],                                    // a cubic
      (t) => [8 * Math.cos(2 * t), 3 * Math.sin(2 * t), 0],                             // an ellipse arc
      (t) => [100 * t, 0.01 * Math.sin(40 * t), 0],                                     // nearly straight, small detail
    ];
    const sample = (f, n) => { const ts = []; for (let i = 0; i < n; i++) ts.push(i / (n - 1)); for (let i = 1; i + 1 < n; i++) ts[i] += (g.float() - 0.5) * 0.5 / (n - 1); return ts.sort((a, b) => a - b).map(f); };
    let worst = 0, cases = 0, degs = new Set();
    for (let i = 0; i < 60; i++) {
      const Q = sample(shapes[i % shapes.length], 5 + g.int(40)), deg = 1 + g.int(5), param = ['chord', 'centripetal', 'uniform'][g.int(3)];
      const r = FI.interpolate(Q, { deg, param });
      degs.add(r.curve.deg);
      for (let k = 0; k < Q.length; k++) worst = Math.max(worst, V.dist(CV.point(r.curve, r.params[k]), Q[k]) / size(Q));
      cases++;
    }
    ok(worst <= 1e-10, `interpolate: the curve passes through every point at its parameter to 1e-10 of the size (${cases} point sets, degrees ${[...degs].sort().join(', ')}, chord / centripetal / uniform; worst ${worst.toExponential(1)})`);
    {
      const Q = sample(shapes[0], 12), d0 = [5, -3, 1], d1 = [0, 7, 2], r = FI.interpolate(Q, { d0, d1 }), [a, b] = CV.domain(r.curve);
      ok(V.dist(CV.derivs(r.curve, a, 1)[1], d0) <= 1e-10 && V.dist(CV.derivs(r.curve, b, 1)[1], d1) <= 1e-10 && r.error <= 1e-6, 'interpolate with end derivatives: C′ at the ends is what was given (§ 9.2.2)');
      // found by search: 11 points spaced from 1e-4 to 1e4 apart at degree 10; cc-nurbs' solve misses its own points by 1e-4
      const ill = [[0.160421, -0.0977888, 0], [664.369, -133.072, 0], [692.037, -47.0411, 0], [692.062, -0.00617902, 0], [692.093, -33.0839, 0], [692.093, 56.2154, 0], [692.738, 72.4198, 0], [692.738, 0.777981, 0], [6196.06, -10.6945, 0], [10996, 5.65179, 0], [11078.2, 0.000524382, 0]];
      ok(refuses(() => FI.interpolate(ill, { deg: 10 }), 'solid.err.not_within_tolerance', { what: 'interpolate', tol: 1e-6 }) && FI.interpolate(ill, { deg: 3 }).error <= 1e-6, 'interpolate refuses a curve that misses its own points by more than tol.lin (an ill-conditioned system: 11 points spaced 1e-4 to 1e4 apart, degree 10), and passes the same points at degree 3');
      const two = FI.interpolate([[0, 0, 0], [3, 4, 0]], { deg: 3 });
      ok(two.curve.deg === 1 && V.dist(CV.point(two.curve, 1), [3, 4, 0]) === 0, 'two points, degree 3 asked: a line (the degree falls to count − 1)');
    }
    // approximation within tol.fit; its error is a bound on each point's distance to the curve
    let within = true, bound = true, gotFewer = 0, runs = 0;
    for (let i = 0; i < 30; i++) {
      const Q = sample(shapes[i % shapes.length], 60 + g.int(80)), fitTol = [1e-1, 1e-2, 1e-3][i % 3];
      const r = FI.approximate(Q, { deg: 3, tol: { lin: 1e-6, fit: fitTol } });
      runs++;
      if (!(r.error <= fitTol)) within = false;
      if (r.count < Q.length) gotFewer++;
      const [a, b] = CV.domain(r.curve), N = 600, at = (s) => (s >= N ? b : s <= 0 ? a : a + (b - a) * s / N);
      for (let k = 0; k < Q.length; k++) {
        // the closest point: the best of N samples, then a ternary search between its neighbours
        let bi = 0, best = Infinity;
        for (let s = 0; s <= N; s++) { const d = V.dist(CV.point(r.curve, at(s)), Q[k]); if (d < best) { best = d; bi = s; } }
        let lo = at(bi - 1), hi = at(bi + 1);
        for (let it = 0; it < 100; it++) {
          const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
          if (V.dist(CV.point(r.curve, m1), Q[k]) < V.dist(CV.point(r.curve, m2), Q[k])) hi = m2; else lo = m1;
        }
        best = Math.min(best, V.dist(CV.point(r.curve, (lo + hi) / 2), Q[k]));
        if (best > r.error * (1 + 1e-9) + 1e-12) bound = false;
      }
    }
    ok(within && bound && gotFewer > 20, `approximate: within the requested tol.fit on ${runs} point sets (0.1, 0.01, 0.001 mm), with fewer control points than points in ${gotFewer}; each point's distance to the curve (dense search) never exceeds the reported error`);
    {
      const noisy = sample(shapes[1], 200).map((q) => [q[0] + g.range(-0.05, 0.05), q[1] + g.range(-0.05, 0.05), q[2]]);
      ok(refuses(() => FI.approximate(noisy, { tol: { lin: 1e-6, fit: 1e-3 }, maxCount: 20 }), 'solid.err.not_within_tolerance', { what: 'approximate', tol: 1e-3 }), 'approximate: noise of ±0.05 cannot be followed within 0.001 by 20 control points: refused with the error left');
    }
    // the SPLINE forms (KAD, DXF)
    {
      const ctrl = FI.fromSpline({ degree: 3, controlPoints: [[0, 0, 0], [1, 2, 0], [3, 2, 0], [4, 0, 0]], knots: [0, 0, 0, 0, 1, 1, 1, 1] });
      const fitp = FI.fromSpline({ degree: 3, fitPoints: [[0, 0, 0], [1, 1, 0], [2, 0, 0], [3, 1, 0]], startTangent: [1, 0, 0], endTangent: [0, 1, 0] });
      const t0 = CV.tangent(fitp, 0), t1 = CV.tangent(fitp, 1);
      ok(CV.isCurve(ctrl) && ctrl.deg === 3 && V.dist(t0, [1, 0, 0]) <= 1e-12 && V.dist(t1, [0, 1, 0]) <= 1e-12 && V.dist(CV.point(fitp, 1), [3, 1, 0]) <= 1e-12, 'fromSpline: the control form as it is; the fit form through its points with its end tangent directions');
      const L = 3 * Math.SQRT2;
      ok(Math.abs(V.len(CV.derivs(fitp, 0, 1)[1]) - L) <= 1e-12 && Math.abs(V.len(CV.derivs(fitp, 1, 1)[1]) - L) <= 1e-12, 'fromSpline: a fit form\'s end derivatives have the total chord length as their magnitude (the derivative in a chord-length parameter on [0, 1])');
      ok(refuses(() => FI.fromSpline({ degree: 3, fitPoints: [[0, 0, 0]] }), BAD, { name: 'spline', why: 'no_points' }) && refuses(() => FI.fromSpline({ degree: 2, controlPoints: [[0, 0, 0], [1, 0, 0], [2, 1, 0]], knots: [0, 0.1, 0.2, 0.8, 0.9, 1] }), BAD, { name: 'knots', why: 'not_clamped' }), "fromSpline refuses a fit form without points, and an unclamped control form (S5's curves are clamped)");
    }
    ok(refuses(() => FI.interpolate([[0, 0, 0], [1, 0, 0], [1, 0, 0], [2, 0, 0]]), BAD, { name: 'points', why: 'repeated', index: 2 }) && refuses(() => FI.interpolate([[0, 0, 0]]), BAD, { name: 'points', why: 'too_few' }) && refuses(() => FI.interpolate([[0, 0, 0], [1, 0]]), BAD, { name: 'points', why: 'not_a_point' }) && refuses(() => FI.interpolate([[0, 0, 0], [1, 0, 0]], { param: 'arc' }), BAD, { name: 'param', why: 'unknown' }) && refuses(() => FI.interpolate([[0, 0, 0], [1, 0, 0]], { deg: 0 }), BAD, { name: 'degree' }) && refuses(() => FI.interpolate([[0, 0, 0], [1, 0, 0]], { d0: [1, 0] }), BAD, { name: 'd0', why: 'not_a_vector' }), 'refused: a repeated point (with its index), too few points, a non-point, an unknown parameterisation, degree 0, a derivative that is not a vector');
  });

  section('construct', 'S9: construction — compatibility, ruled surfaces, lofts through their sections, Coons patches, grids, refusals', () => {
    const g = P.makePrng(901);
    const randCurve = (rational) => {
      const p = 1 + g.int(4), spans = 1 + g.int(4), U = new Array(p + 1).fill(0);
      for (let s = 1; s < spans; s++) { const m = 1 + g.int(p); for (let i = 0; i < m; i++) U.push(s / spans); }
      for (let i = 0; i <= p; i++) U.push(1);
      const n = U.length - p - 1;
      return CV.make({ deg: p, knots: U.map((x) => x * 3 - 1), cvs: Array.from({ length: n }, (_, i) => [i * 2 + g.range(-0.5, 0.5), g.range(-3, 3), g.range(-3, 3)]), w: rational ? Array.from({ length: n }, () => g.range(0.5, 2)) : null });
    };
    // compatibility: same degree and knots, every curve unchanged
    let compat = 0, compatOk = true;
    for (let i = 0; i < 40; i++) {
      const cs = Array.from({ length: 2 + g.int(3) }, () => randCurve(false)), out = K.compatible(cs);
      if (!out.every((c) => c.deg === out[0].deg && same(c.knots, out[0].knots) && same(CV.domain(c), [0, 1]))) compatOk = false;
      out.forEach((c, k) => { compat = Math.max(compat, CV.deviation(c, CV.reparam(cs[k], 0, 1))); });
    }
    ok(compatOk && compat <= 1e-12, `compatible: one degree, one knot vector, domain [0, 1], and every curve the same as given (deviation ${compat.toExponential(1)}; 40 random sets)`);
    // lofts pass through their sections
    let loftErr = 0, loftN = 0;
    for (let i = 0; i < 30; i++) {
      const rational = i % 3 === 0, k = 2 + g.int(5), base = randCurve(rational);
      const secs = Array.from({ length: k }, (_, j) => CV.transform(CV.make({ ...CV.toData(base), cvs: base.cvs.map((q) => [q[0], q[1] + g.range(-1, 1), q[2] + g.range(-1, 1)]) }), P.mat4.translation([0, 0, 5 * j])));
      const r = K.loft(secs, { deg: 1 + g.int(3) });
      for (let j = 0; j < k; j++) {
        const s = CV.reparam(secs[j], 0, 1);
        for (let q = 0; q <= 20; q++) loftErr = Math.max(loftErr, V.dist(NS.point(r.surface, q / 20, r.params[j]), CV.point(s, q / 20)));
      }
      loftN++;
    }
    ok(loftErr <= 1e-10, `loft: the surface passes through every section at its parameter (${loftN} lofts of 2–6 sections, a third of them rational; worst ${loftErr.toExponential(1)})`);
    {
      // the v parameters are the columns' chord-length parameters, averaged over the columns (§ 10.3)
      // each column moves differently from section to section, so the columns' own parameters differ and only their average is right
      const base = randCurve(false), secs = [0, 1, 3, 7].map((z, j) => CV.transform(CV.make({ ...CV.toData(base), cvs: base.cvs.map((q, i) => [q[0], q[1] + j * j * (0.4 + 0.9 * i), q[2]]) }), P.mat4.translation([0, 0, z])));
      const r = K.loft(secs), cs = K.compatible(secs), want = [0, 0, 0, 0];
      for (let i = 0; i < cs[0].cvs.length; i++) {
        const col = cs.map((c) => c.cvs[i]), d = [0];
        for (let j = 1; j < col.length; j++) d.push(d[j - 1] + V.dist(col[j], col[j - 1]));
        d.forEach((x, j) => { want[j] += x / d[d.length - 1] / cs[0].cvs.length; });
      }
      ok(r.params.every((x, j) => Math.abs(x - want[j]) <= 1e-12), `loft: its section parameters are the columns' chord-length parameters averaged (${r.params.map((x) => x.toFixed(4)).join(', ')})`);
      // found by search: sections spaced from 1e-4 to 1e4 apart, degree 10 in v: the column solve misses the sections
      const ill = [0.160421, 664.369, 692.037, 692.062, 692.093, 692.0935, 692.738, 692.7385, 6196.06, 10996, 11078.2];
      const line0 = CV.make({ deg: 1, knots: [0, 0, 1, 1], cvs: [[0, 0, 0], [1, 0, 0]] }), ys = [-0.0977888, -133.072, -47.0411, -0.00617902, -33.0839, 56.2154, 72.4198, 0.777981, -10.6945, 5.65179, 0.000524382];
      ok(refuses(() => K.loft(ill.map((z, j) => CV.transform(line0, P.mat4.translation([ys[j], 0, z]))), { deg: 10 }), 'solid.err.not_within_tolerance', { what: 'loft' }), 'loft refuses a surface that misses its sections by more than tol.lin (an ill-conditioned column solve)');
    }
    // a ruled surface: every v-line is the segment between a(u) and b(u)
    {
      const a = randCurve(true), b = randCurve(false), s = K.ruled(a, b), [ca, cb] = K.compatible([a, b]);
      let e = 0;
      for (let i = 0; i <= 10; i++) {
        const u = i / 10, pa = CV.point(ca, u), pb = CV.point(cb, u);
        for (let j = 0; j <= 10; j++) { const x = NS.point(s, u, j / 10), d = V.sub(pb, pa), t = V.dot(V.sub(x, pa), d) / V.dot(d, d); e = Math.max(e, V.dist(x, V.add(pa, V.scale(d, t))), t < -1e-12 || t > 1 + 1e-12 ? 1 : 0); }
      }
      ok(e <= 1e-12 && s.degV === 1, 'ruled: every v-line lies on the segment from a(u) to b(u), rational a included (§ 8.3)');
    }
    // Coons: the four curves are the edges; a bilinear-blended known surface comes back
    {
      const c0 = CV.make({ deg: 2, knots: [0, 0, 0, 1, 1, 1], cvs: [[0, 0, 0], [1, 0, 1], [2, 0, 0]] }), c1 = CV.make({ deg: 3, knots: [0, 0, 0, 0, 1, 1, 1, 1], cvs: [[0, 2, 0], [0.7, 2, -1], [1.3, 2, 1], [2, 2, 0]] });
      const d0 = CV.make({ deg: 2, knots: [0, 0, 0, 1, 1, 1], cvs: [[0, 0, 0], [-0.5, 1, 0.5], [0, 2, 0]] }), d1 = CV.make({ deg: 1, knots: [0, 0, 1, 1], cvs: [[2, 0, 0], [2, 2, 0]] });
      const s = K.coons(c0, c1, d0, d1);
      const e = Math.max(...[['v0', c0], ['v1', c1], ['u0', d0], ['u1', d1]].map(([ed, c]) => CV.deviation(CV.reparam(NS.edgeCurve(s, ed), 0, 1), K.compatible([c])[0])));
      // the Coons formula at interior points, from the curves themselves
      let f = 0;
      for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) {
        const u = i / 6, v = j / 6, want = V.sub(V.add(V.add(V.scale(CV.point(c0, u), 1 - v), V.scale(CV.point(c1, u), v)), V.add(V.scale(CV.point(d0, v), 1 - u), V.scale(CV.point(d1, v), u))),
          V.add(V.add(V.scale(CV.point(c0, 0), (1 - u) * (1 - v)), V.scale(CV.point(c0, 1), u * (1 - v))), V.add(V.scale(CV.point(c1, 0), (1 - u) * v), V.scale(CV.point(c1, 1), u * v))));
        f = Math.max(f, V.dist(NS.point(s, u, v), want));
      }
      ok(e <= 1e-12 && f <= 1e-12, `coons: the patch's four edges are the four curves (${e.toExponential(1)}), and inside it is Lc + Ld − B (${f.toExponential(1)})`);
      const off = CV.make({ deg: 1, knots: [0, 0, 1, 1], cvs: [[2, 0, 0.1], [2, 2, 0]] });
      ok(refuses(() => K.coons(c0, c1, d0, off), BAD, { name: 'curves', why: 'corners' }) && refuses(() => K.coons(randCurve(true), c1, d0, d1), BAD, { name: 'curve', why: 'rational' }), 'coons refuses curves that do not meet at the corners, and rational curves');
    }
    // grid interpolation
    {
      const Q = Array.from({ length: 7 }, (_, i) => Array.from({ length: 5 }, (_, j) => [i + g.range(-0.2, 0.2), j * 1.5 + g.range(-0.2, 0.2), Math.sin(i) * Math.cos(j)]));
      const r = K.interpolateGrid(Q, { degU: 3, degV: 2 });
      let e = 0;
      for (let i = 0; i < 7; i++) for (let j = 0; j < 5; j++) e = Math.max(e, V.dist(NS.point(r.surface, r.paramsU[i], r.paramsV[j]), Q[i][j]));
      ok(e <= 1e-12 && r.surface.degU === 3 && r.surface.degV === 2, `interpolateGrid: the surface passes through every grid point at its parameters (${e.toExponential(1)})`);
      ok(refuses(() => K.interpolateGrid([[[0, 0, 0], [1, 0, 0]], [[0, 1, 0]]]), BAD, { name: 'grid', why: 'not_a_grid' }) && refuses(() => K.interpolateGrid([[[0, 0, 0]]]), BAD, { name: 'grid', why: 'too_few' }), 'interpolateGrid refuses a ragged grid and one of a single row');
    }
    // extrude and revolve keep their identity
    {
      const f = Fr.frameFromZX([0, 0, 0], [0, 0, 1], [1, 0, 0]), ci = A.circle({ frame: f, r: 2 }), ex = K.extrude(ci, [0, 0, 5]), rv = K.revolve(A.lineThrough([3, 0, 0], [3, 0, 4]), { o: [0, 0, 0], d: [0, 0, 1] });
      ok(ex.type === 'extrusion' && rv.type === 'revolution' && V.dist(P.surface.point(ex, 1, 5), V.add(A.point(ci, 1), [0, 0, 5])) <= 1e-15 && Math.abs(Math.hypot(...P.surface.point(rv, 2, 1).slice(0, 2)) - 3) <= 1e-15, 'extrude and revolve keep their identity (analytic extrusion and revolution, exact)');
      ok(refuses(() => K.extrude(ci, [0, 0, 0]), BAD, { name: 'vector', why: 'zero_length' }) && refuses(() => K.revolve(ci, { o: [0, 0, 0], d: [0, 0, 1] }, 7), BAD, { name: 'angle', why: 'out_of_range' }), 'refused: a zero extrusion vector, a revolution past one turn');
    }
    // compatibility refusals, typed
    {
      const c = randCurve(false);
      const nearA = CV.make({ deg: 2, knots: [0, 0, 0, 0.5, 1, 1, 1], cvs: [[0, 0, 0], [1, 1, 0], [2, 0, 0], [3, 1, 0]] });
      const nearB = CV.make({ deg: 2, knots: [0, 0, 0, 0.5 + 2 ** -44, 1, 1, 1], cvs: [[0, 0, 0], [1, 1, 0], [2, 0, 0], [3, 1, 0]] });
      ok(refuses(() => K.compatible([nearA, nearB]), BAD, { name: 'curves', why: 'near_knots' }), 'compatible refuses two curves whose knots differ by less than KTOL (one reading would merge them, the other not)');
      ok(refuses(() => K.loft([c]), BAD, { name: 'sections', why: 'too_few' }) && refuses(() => K.loft([c, { ...c }]), BAD, { name: 'sections', why: 'not_a_curve' }) && refuses(() => K.loft('x'), BAD, { name: 'sections', why: 'not_an_array' }) && refuses(() => K.loft([c, c]), BAD, { name: 'sections', why: 'repeated' }) && refuses(() => K.compatible([]), BAD, { name: 'curves', why: 'too_few' }), 'refused: one section, a section that is not a curve, not a list, two identical sections (no parameter between them), nothing to make compatible');
    }
  });
}
