/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * frame.js — cc-solid (S2, docs/solid/HANDOFF.md § 5.3): placements, an origin and three orthonormal right-handed axes.
 * DOM-free; imports the core, vec3.js and mat4.js.
 *
 * A body, a sketch plane or a face can carry a frame: its geometry is kept in the frame's own coordinates and placed in the
 * world by the frame ("local-frame lifting", HANDOFF § 5.3), which keeps survey-sized coordinates precise and lets
 * instances share geometry. A frame is frozen: { o, x, y, z }, each a frozen [x, y, z], with z = x × y.
 *
 *   WORLD                           the world origin and axes
 *   frameFromZ(o, z)                x from vec3.perp(z) (the same every time), y = z × x
 *   frameFromZX(o, z, xDir, tol)    z as given, made unit; x is xDir with its part along z removed. xDir within tol.ang of
 *                                   z or −z → solid.err.bad_input { name: 'x', why: 'parallel' }
 *   frameFromXY(o, x, yDir, tol)    the same with x kept and y taken from yDir (a sketch plane from two edges)
 *   frameFromMatrix(m, tol)         the frame of a rigid matrix (mat4.isRigid); anything else → bad_input { name: 'matrix',
 *                                   why: 'not_rigid' }
 *   toMatrix(f) → the local-to-world mat4 · toWorld(f, p) · toLocal(f, p) · dirToWorld(f, v) · dirToLocal(f, v)
 *   isFrame(x)                      true only for a frame made here (a look-alike copy is not one)
 */
import { fail } from '../core/errors.js';
import { resolveTol } from '../core/tol.js';
import { sub, dot, cross, scale, madd, len, unit, perp, isVec3 } from './vec3.js';
import { fromBasis, isRigid } from './mat4.js';

const MADE = new WeakSet();

function make(o, x, y, z) {
  const f = Object.freeze({ o: Object.freeze(o.slice()), x: Object.freeze(x), y: Object.freeze(y), z: Object.freeze(z) });
  MADE.add(f);
  return f;
}
function needVec(v, name) { if (!isVec3(v)) fail('solid.err.bad_input', { name, why: 'not_a_vector' }); }

export const WORLD = make([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
export const isFrame = (f) => f !== null && typeof f === 'object' && MADE.has(f);

/** b with its part along the unit vector a removed, twice over (one pass leaves rounding along a), made unit. */
function orthoUnit(b, a, name, ang) {
  const r = madd(b, -dot(b, a), a);
  if (!(len(r) > ang * len(b))) fail('solid.err.bad_input', { name, why: 'parallel' });
  const u = unit(r);
  return unit(madd(u, -dot(u, a), a));
}

export function frameFromZ(o, z) {
  needVec(o, 'origin'); needVec(z, 'z');
  const zu = unit(z), xu = perp(zu);
  return make(o, xu, cross(zu, xu), zu);
}
export function frameFromZX(o, z, xDir, tol) {
  needVec(o, 'origin'); needVec(z, 'z'); needVec(xDir, 'x');
  const t = resolveTol(tol);
  const zu = unit(z), xu = orthoUnit(unit(xDir), zu, 'x', t.ang);
  return make(o, xu, cross(zu, xu), zu);
}
export function frameFromXY(o, x, yDir, tol) {
  needVec(o, 'origin'); needVec(x, 'x'); needVec(yDir, 'y');
  const t = resolveTol(tol);
  const xu = unit(x), yu = orthoUnit(unit(yDir), xu, 'y', t.ang);
  return make(o, xu, yu, cross(xu, yu));
}
export function frameFromMatrix(m, tol) {
  if (!isRigid(m, tol)) fail('solid.err.bad_input', { name: 'matrix', why: 'not_rigid' });
  return frameFromZX([m[3], m[7], m[11]], [m[2], m[6], m[10]], [m[0], m[4], m[8]], tol);
}

export const toMatrix = (f) => fromBasis(f.o, f.x, f.y, f.z);
export const dirToWorld = (f, v) => madd(madd(scale(f.x, v[0]), v[1], f.y), v[2], f.z);
export const toWorld = (f, p) => madd(dirToWorld(f, p), 1, f.o);
export const dirToLocal = (f, v) => [dot(v, f.x), dot(v, f.y), dot(v, f.z)];
export const toLocal = (f, p) => dirToLocal(f, sub(p, f.o));
