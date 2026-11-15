/* SPDX-License-Identifier: Apache-2.0 */
/**
 * test-query.mjs — engine.solid's S10 tests (geom/query.js, math/bvh.js), registered by test.mjs: section `query`.
 *
 *   closest points against a brute-force search (dense samples, then a ternary search around the best three local minima)
 *   on 1e4 random queries to random curves, NURBS (rational and not) and analytic (HANDOFF § 14, S10); on surfaces against
 *   a dense grid with the same refinement; inversion of points on the shape; lengths and areas against closed forms
 *   (circle arcs; sphere, torus and cylinder patches, analytic and converted); tight boxes that contain 20,000 samples and lie
 *   within their slack of the samples' box (§ 14, S10); the BVH against brute force.
 */
import { genCurveData, genSurfaceData } from './digest.mjs';

export async function register({ section, ok, refuses, appUrl }) {
  const P = await import(appUrl('solid/index.js'));
  const Qy = P.query, C = P.curve, SF = P.surface, CV = P.nurbsCurve, NS = P.nurbsSurface, A = P.analyticCurve, S = P.analyticSurface;
  const V = P.vec3, Fr = P.frame, BX = P.aabb, BV = P.bvh;
  const BAD = 'solid.err.bad_input';

  section('query', 'S10: queries — closest points against brute force, inversion, length, area, tight boxes, the BVH', () => {
    const g = P.makePrng(1001);
    const frameR = () => Fr.frameFromZX([g.range(-9, 9), g.range(-9, 9), g.range(-9, 9)], [g.range(-1, 1), g.range(-1, 1), g.range(0.2, 1)], [1, g.range(-1, 1), g.range(-1, 1)]);
    const at = (a, b, k, n) => (k >= n ? b : a + (b - a) * k / n);
    /** brute force on [a, b]: n samples, then ternary refinement around the three best local minima */
    const brute1 = (f, a, b, n) => {
      const ds = [];
      for (let i = 0; i <= n; i++) ds.push(f(at(a, b, i, n)));
      const mins = [];
      for (let i = 0; i <= n; i++) if ((i === 0 || ds[i] <= ds[i - 1]) && (i === n || ds[i] <= ds[i + 1])) mins.push(i);
      mins.sort((x, y) => ds[x] - ds[y]);
      let best = Math.min(...ds);
      for (const i of mins.slice(0, 3)) {
        let lo = at(a, b, Math.max(0, i - 1), n), hi = at(a, b, Math.min(n, i + 1), n);
        for (let it = 0; it < 80; it++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (f(m1) < f(m2)) hi = m2; else lo = m1; }
        best = Math.min(best, f((lo + hi) / 2));
      }
      return best;
    };

    // ---------------------------------------------------------------------------------------- closest points on curves
    const curves = [];
    for (let i = 0; i < 100; i++) curves.push(CV.make(genCurveData(g, { maxDeg: 5, spans: 1 + g.int(5) })));
    for (let i = 0; i < 40; i++) {
      const f = frameR(), t0 = g.range(-3, 3), t1 = t0 + g.range(0.5, 6.28);
      curves.push(A.circle({ frame: f, r: g.range(0.5, 9), range: [t0, t1] }), A.ellipse({ frame: f, a: g.range(0.5, 9), b: g.range(0.5, 9), range: [t0, t1] }));
    }
    let worse = 0, queries = 0, worst = 0;
    for (let q = 0; q < 10000; q++) {
      const c = curves[q % curves.length], [a, b] = C.domain(c), bb = C.bbox(c), d0 = V.dist(bb.min, bb.max) || 1;
      const p = [0, 1, 2].map((i) => bb.min[i] + (bb.max[i] - bb.min[i]) * g.range(-0.3, 1.3));
      const r = Qy.closestOnCurve(c, p), bf = brute1((t) => V.dist(C.point(c, t), p), a, b, 400);
      queries++;
      worst = Math.max(worst, (r.d - bf) / d0);
      if (r.d > bf + 1e-9 * d0) worse++;
      if (q % 500 === 0 && !(V.dist(C.point(c, r.t), r.point) === 0)) worse++;
    }
    ok(worse === 0, `closestOnCurve: never farther than a brute-force search (400 samples, then refined) on ${queries} random queries to 100 NURBS curves (rational and not, degrees 1–5) and 80 circle and ellipse arcs (worst ${worst.toExponential(1)} of the size above it); the point is the curve's own`);

    // ---------------------------------------------------------------------------------------- closest points on surfaces
    const surfs = [];
    for (let i = 0; i < 20; i++) surfs.push(NS.make(genSurfaceData(g, { maxDeg: 3, spans: 1 + g.int(3) })));
    for (let i = 0; i < 6; i++) {
      const f = frameR(), r = g.range(1, 5);
      surfs.push(S.sphere({ frame: f, r, urange: [0, g.range(1, 6.28)], vrange: [-1.2, g.range(0, 1.5)] }), S.torus({ frame: f, R: r + 2, r, urange: [0, g.range(1, 6.28)], vrange: [0, g.range(1, 6.28)] }), S.cylinder({ frame: f, r, urange: [0, g.range(1, 6.28)], vrange: [0, 4] }));
    }
    // the analytic surfaces have no lower bound to fall back on, so they get their own share of queries: cones either way
    // of their apex, planes, and extrusions and revolutions of wavy profiles (many local minima along the profile)
    for (let i = 0; i < 6; i++) {
      const f = frameR(), r = g.range(1, 4), ang = g.range(0.2, 1.2) * (i % 2 ? -1 : 1);
      surfs.push(S.cone({ frame: f, r, angle: ang, urange: [0, g.range(1, 6.28)], vrange: [0, ang > 0 ? g.range(1, 4) : 0.9 * r / Math.tan(-ang)] }));
      surfs.push(S.plane({ frame: f, urange: [-g.range(1, 5), g.range(1, 5)], vrange: [-g.range(1, 5), g.range(1, 5)] }));
      const n = 5 + g.int(5), knots = [0, 0, 0, 0, ...Array.from({ length: n - 4 }, (_, k) => k + 1), n - 3, n - 3, n - 3, n - 3];
      const wave = CV.make({ deg: 3, knots, cvs: Array.from({ length: n }, (_, k) => Fr.toWorld(f, [k, g.range(-2, 2), 0])), w: null });
      surfs.push(S.extrusion({ profile: wave, d: V.add(f.z, [g.range(-0.5, 0.5), g.range(-0.5, 0.5), g.range(-0.5, 0.5)]), vrange: [0, g.range(1, 5)] }));
      const prof = CV.make({ deg: 3, knots, cvs: Array.from({ length: n }, (_, k) => Fr.toWorld(f, [g.range(0.5, 4), 0, k * g.range(0.4, 1.2)])), w: null });
      surfs.push(S.revolution({ profile: prof, axis: { o: f.o, d: f.z }, urange: [0, g.range(1, 6.28)] }));
    }
    let sWorse = 0, sQueries = 0, sWorst = 0;
    for (let q = 0; q < 1800; q++) {
      const s = surfs[q % surfs.length], [ua, ub] = SF.domainU(s), [va, vb] = SF.domainV(s), bb = SF.bbox(s), d0 = V.dist(bb.min, bb.max) || 1;
      const p = [0, 1, 2].map((i) => bb.min[i] + (bb.max[i] - bb.min[i]) * g.range(-0.2, 1.2));
      const r = Qy.closestOnSurface(s, p);
      // brute force: a 60 × 60 grid, then alternating ternary refinement in u and v around the best three cells
      const N = 60, D = [];
      for (let i = 0; i <= N; i++) { D.push([]); for (let j = 0; j <= N; j++) D[i].push(V.dist(SF.point(s, at(ua, ub, i, N), at(va, vb, j, N)), p)); }
      const cells = [];
      for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) cells.push([D[i][j], i, j]);
      cells.sort((x, y) => x[0] - y[0]);
      let bf = cells[0][0];
      for (const [, i, j] of cells.slice(0, 3)) {
        let u = at(ua, ub, i, N), v = at(va, vb, j, N);
        for (let round = 0; round < 6; round++) {
          let lo = Math.max(ua, u - (ub - ua) / N), hi = Math.min(ub, u + (ub - ua) / N);
          for (let it = 0; it < 50; it++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (V.dist(SF.point(s, m1, v), p) < V.dist(SF.point(s, m2, v), p)) hi = m2; else lo = m1; }
          u = (lo + hi) / 2;
          lo = Math.max(va, v - (vb - va) / N); hi = Math.min(vb, v + (vb - va) / N);
          for (let it = 0; it < 50; it++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (V.dist(SF.point(s, u, m1), p) < V.dist(SF.point(s, u, m2), p)) hi = m2; else lo = m1; }
          v = (lo + hi) / 2;
        }
        bf = Math.min(bf, V.dist(SF.point(s, u, v), p));
      }
      sQueries++;
      sWorst = Math.max(sWorst, (r.d - bf) / d0);
      if (r.d > bf + 1e-9 * d0) sWorse++;
    }
    ok(sWorse === 0, `closestOnSurface: never farther than a brute-force search (a 61 × 61 grid, then refined) on ${sQueries} random queries to 20 NURBS surfaces and 42 analytic ones (spheres, tori, cylinders, cones, planes, extrusions and revolutions of wavy profiles) (worst ${sWorst.toExponential(1)} of the size above it)`);
    {
      const f = frameR(), sp = S.sphere({ frame: f, r: 3 }), pt = V.add(f.o, V.scale(V.unit([1, 2, 2]), 7)), r = Qy.closestOnSurface(sp, pt);
      ok(Math.abs(r.d - 4) <= 1e-12, 'closestOnSurface: a point 7 from a sphere\'s centre is 4 from the sphere of radius 3');
    }

    // ---------------------------------------------------------------------------------------- inversion
    let inv = true;
    for (const c of curves.slice(0, 60)) {
      const [a, b] = C.domain(c), t = a + (b - a) * g.float(), q = C.point(c, t), r = Qy.invertCurve(c, q);
      if (!(V.dist(C.point(c, r), q) <= 1e-9)) inv = false;
    }
    for (const s of surfs.slice(0, 20)) {
      const [ua, ub] = SF.domainU(s), [va, vb] = SF.domainV(s), q = SF.point(s, ua + (ub - ua) * g.float(), va + (vb - va) * g.float()), [u, v] = Qy.invertSurface(s, q);
      if (!(V.dist(SF.point(s, u, v), q) <= 1e-9)) inv = false;
    }
    ok(inv && refuses(() => Qy.invertCurve(curves[0], V.add(C.point(curves[0], C.domain(curves[0])[0]), [1e3, 1e3, 1e3])), BAD, { name: 'p', why: 'not_on_curve' }), 'inversion: a point on the curve or surface comes back to parameters whose point is within 1e-9 of it; a point off it is refused (not_on_curve)');

    // ---------------------------------------------------------------------------------------- length and area
    {
      let le = 0;
      for (let i = 0; i < 20; i++) {
        const f = frameR(), r = g.range(0.5, 9), t0 = g.range(-3, 3), t1 = t0 + g.range(0.3, 6.28), arc = A.circle({ frame: f, r, range: [t0, t1] });
        le = Math.max(le, Math.abs(Qy.length(arc).value - r * (t1 - t0)) / (r * (t1 - t0)), Math.abs(Qy.length(A.toNurbs(arc)).value - r * (t1 - t0)) / (r * (t1 - t0)));
        const p = [g.range(-5, 5), g.range(-5, 5), 0], q2 = [g.range(-5, 5), g.range(-5, 5), 1];
        le = Math.max(le, Math.abs(Qy.length(A.lineThrough(p, q2)).value - V.dist(p, q2)) / V.dist(p, q2));
      }
      ok(le <= 1e-12, `length: circle arcs (analytic and their NURBS forms, r Δθ) and segments to ${le.toExponential(1)}`);
      let ae = 0;
      for (let i = 0; i < 8; i++) {
        const f = frameR(), r = g.range(0.5, 5), u1 = g.range(0.5, 6.28), v0 = g.range(-1.5, 0), v1 = g.range(0.1, 1.5), R = r + g.range(1, 4);
        const sp = S.sphere({ frame: f, r, urange: [0, u1], vrange: [v0, v1] }), to = S.torus({ frame: f, R, r, urange: [0, u1], vrange: [v0, v1] }), cy = S.cylinder({ frame: f, r, urange: [0, u1], vrange: [0, 3] });
        const wS = r * r * u1 * (Math.sin(v1) - Math.sin(v0)), wT = r * u1 * (R * (v1 - v0) + r * (Math.sin(v1) - Math.sin(v0))), wC = r * u1 * 3;
        for (const [s, w] of [[sp, wS], [to, wT], [cy, wC], [S.toNurbs(sp), wS], [S.toNurbs(to), wT]]) ae = Math.max(ae, Math.abs(Qy.area(s).value / w - 1));
      }
      ok(ae <= 1e-9, `area: sphere, torus and cylinder patches, analytic and converted, against their closed forms (${ae.toExponential(1)})`);
      // the same surface, another parameter: one rational Bézier patch of a sphere with its weights multiplied by c^i along
      // u and e^j along v is a Möbius change of parameter (the shape is unchanged, its parameter speed now varies by a factor
      // of several hundred across the patch), so its area is still the closed form; a fixed rule cannot get there, only the
      // adaptive one
      let me = 0, honest = true, oneSpan = true;
      for (let i = 0; i < 6; i++) {
        const f = frameR(), r = g.range(1, 4), u1 = g.range(0.6, 1.5), v0 = -g.range(0.1, 0.7), v1 = g.range(0.1, 0.7), c = g.range(8, 20), e = 1 / g.range(8, 12);
        const dt = NS.toData(S.toNurbs(S.sphere({ frame: f, r, urange: [0, u1], vrange: [v0, v1] }))), A = r * r * u1 * (Math.sin(v1) - Math.sin(v0));
        if (dt.knotsU.length !== 6 || dt.knotsV.length !== 6) oneSpan = false;
        dt.w = dt.w.map((row, a) => row.map((w, b) => w * c ** a * e ** b));
        const res = Qy.area(NS.make(dt), { eps: 1e-10 * A });
        me = Math.max(me, Math.abs(res.value / A - 1));
        if (!(Math.abs(res.value - A) <= res.error + 1e-12 * A)) honest = false;
      }
      ok(oneSpan && me <= 1e-9 && honest, `area does not depend on the parameter: six sphere patches under a Möbius change of parameter keep their closed-form areas (${me.toExponential(1)}), each within its reported error`);
    }

    // ---------------------------------------------------------------------------------------- tight boxes
    {
      // the referee: the samples' box, each of its six sides then pushed out by a local search around its best sample
      const ternary = (f, lo, hi) => { for (let it = 0; it < 100; it++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (f(m1) > f(m2)) hi = m2; else lo = m1; } return f((lo + hi) / 2); };
      let contains = true, within = true, tighter = 0, tested = 0, over = 0, out = 0;
      for (const c of curves.slice(0, 60)) {
        const [a, b] = C.domain(c), loose = C.bbox(c), sz = V.dist(loose.min, loose.max) || 1, slack = 1e-3 * sz, box = Qy.curveBox(c, { slack }), N = 4000;
        const ts = Array.from({ length: N + 1 }, (_, i) => at(a, b, i, N)), pts = ts.map((t) => C.point(c, t)), sb = { min: [0, 0, 0], max: [0, 0, 0] };
        for (let k = 0; k < 3; k++) for (const sgn of [1, -1]) {
          let bi = 0;
          pts.forEach((q, i) => { if (sgn * q[k] > sgn * pts[bi][k]) bi = i; });
          const v = Math.max(sgn * pts[bi][k], ternary((t) => sgn * C.point(c, t)[k], ts[Math.max(0, bi - 1)], ts[Math.min(N, bi + 1)]));
          if (sgn > 0) sb.max[k] = v; else sb.min[k] = -v;
        }
        for (const q of pts) if (!BX.contains(box, q)) contains = false;
        for (let i = 0; i < 3; i++) { const e = Math.max(box.max[i] - sb.max[i], sb.min[i] - box.min[i]) - slack; over = Math.max(over, e / sz); if (e > 1e-9 * sz) within = false; if (sb.max[i] > box.max[i] || sb.min[i] < box.min[i]) { out++; contains = false; } }
        if (V.dist(box.min, box.max) < V.dist(loose.min, loose.max) - 1e-9) tighter++;
        tested++;
      }
      for (const s of surfs.slice(0, 26)) {
        const [ua, ub] = SF.domainU(s), [va, vb] = SF.domainV(s), loose = SF.bbox(s), sz = V.dist(loose.min, loose.max) || 1, slack = 1e-3 * sz, box = Qy.surfaceBox(s, { slack }), N = 120;
        const us = Array.from({ length: N + 1 }, (_, i) => at(ua, ub, i, N)), vs = Array.from({ length: N + 1 }, (_, j) => at(va, vb, j, N)), sb = { min: [0, 0, 0], max: [0, 0, 0] };
        const P0 = us.map((u) => vs.map((v) => SF.point(s, u, v)));
        for (const row of P0) for (const q of row) if (!BX.contains(box, q)) contains = false;
        for (let k = 0; k < 3; k++) for (const sgn of [1, -1]) {
          let bi = 0, bj = 0;
          for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) if (sgn * P0[i][j][k] > sgn * P0[bi][bj][k]) { bi = i; bj = j; }
          let u = us[bi], v = vs[bj], val = sgn * P0[bi][bj][k];
          for (let round = 0; round < 8; round++) {
            let lo = Math.max(ua, u - (ub - ua) / N), hi = Math.min(ub, u + (ub - ua) / N);
            for (let it = 0; it < 60; it++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (sgn * SF.point(s, m1, v)[k] > sgn * SF.point(s, m2, v)[k]) hi = m2; else lo = m1; }
            u = (lo + hi) / 2;
            lo = Math.max(va, v - (vb - va) / N); hi = Math.min(vb, v + (vb - va) / N);
            for (let it = 0; it < 60; it++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (sgn * SF.point(s, u, m1)[k] > sgn * SF.point(s, u, m2)[k]) hi = m2; else lo = m1; }
            v = (lo + hi) / 2;
            val = Math.max(val, sgn * SF.point(s, u, v)[k]);
          }
          if (sgn > 0) sb.max[k] = val; else sb.min[k] = -val;
        }
        // a local search reaches only the extreme near its best sample: a surface's farther extremes may be missed, so the
        // slack is held against the referee with one grid step's worth of the surface's reach added
        const step = Math.max(...P0.flatMap((row, i) => row.map((q, j) => Math.max(i < N ? V.dist(q, P0[i + 1][j]) : 0, j < N ? V.dist(q, row[j + 1]) : 0))));
        for (let i = 0; i < 3; i++) { const e = Math.max(box.max[i] - sb.max[i], sb.min[i] - box.min[i]) - slack; over = Math.max(over, (e - step) / sz); if (e > step) within = false; if (sb.max[i] > box.max[i] || sb.min[i] < box.min[i]) { out++; contains = false; } }
        tested++;
      }
      ok(contains, `tight boxes hold the curve or surface: every sample (4,001 per curve, 121² per surface) and every side's local extreme inside (${tested} shapes${out ? '; outside: ' + out : ''})`);
      ok(within && tighter > 40, `tight boxes lie within their slack (1e-3 of the size) of the shape's own box, found by search (worst excess ${over.toExponential(1)} of the size; ${tighter} of 60 curve boxes tighter than the control net's)`);
    }

    // ---------------------------------------------------------------------------------------- the BVH
    {
      const boxes = Array.from({ length: 500 }, () => { const c = [g.range(-50, 50), g.range(-50, 50), g.range(-50, 50)], h = [g.range(0.1, 5), g.range(0.1, 5), g.range(0.1, 5)]; return BX.box(V.sub(c, h), V.add(c, h)); });
      const tree = BV.build(boxes);
      let sameO = true, sameN = true;
      for (let q = 0; q < 300; q++) {
        const c = [g.range(-60, 60), g.range(-60, 60), g.range(-60, 60)], h = [g.range(0, 10), g.range(0, 10), g.range(0, 10)], qb = BX.box(V.sub(c, h), V.add(c, h));
        const want = boxes.map((b, i) => (BX.overlaps(b, qb) ? i : -1)).filter((i) => i >= 0);
        if (JSON.stringify(BV.overlapping(tree, qb)) !== JSON.stringify(want)) sameO = false;
        // nearest by the distance to each box's centre (never below the box distance, and not a multiple of it, so a search
        // that skips a node too early misses), then by the box distance itself (0 inside a box: ties go to the lower item)
        for (const dist of [(i, p) => V.dist(BX.center(boxes[i]), p), (i, p) => BV.boxDistance(boxes[i], p)]) {
          const r = BV.nearest(tree, c, dist);
          let bi = -1, bd = Infinity;
          boxes.forEach((b, i) => { const d = dist(i, c); if (d < bd) { bd = d; bi = i; } });
          if (r.d !== bd || r.item !== bi) sameN = false;
        }
      }
      ok(sameO && sameN, 'bvh: overlapping and nearest agree with brute force on 300 queries over 500 boxes');
      ok(refuses(() => BV.build([]), BAD, { name: 'boxes', why: 'empty' }) && refuses(() => BV.build([BX.EMPTY]), BAD, { name: 'boxes', why: 'not_a_box' }) && refuses(() => BV.overlapping({ root: null }, BX.EMPTY), BAD, { name: 'tree', why: 'not_a_tree' }), 'bvh refuses no boxes, an empty box, and a tree it did not build');
    }
    ok(refuses(() => Qy.closestOnCurve({}, [0, 0, 0]), BAD, { name: 'curve', why: 'not_a_curve' }) && refuses(() => Qy.closestOnSurface(surfs[0], [0, 0]), BAD, { name: 'point', why: 'not_a_point' }) && refuses(() => Qy.curveBox(curves[0], { slack: 0 }), BAD, { name: 'slack', why: 'not_positive' }) && refuses(() => Qy.length(curves[0], { a: -1e9 }), BAD, { name: 'a', why: 'out_of_domain' }), 'refused: a record that is no curve, a point that is no point, a slack ≤ 0, a length outside the domain');
  });
}
