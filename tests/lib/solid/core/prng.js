/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * prng.js — cc-solid (S2, docs/solid/HANDOFF.md § 5.5): a seeded random number generator, the same sequence everywhere.
 * DOM-free; imports errors.js and trig.js.
 *
 * cc-solid never uses Math.random (the boundary checker refuses it). Anything random (property tests, jittered sampling,
 * a randomised pivot) takes a generator made here from a seed, so the same seed gives the same run on every engine, and a
 * failing test can print its seed.
 *
 * The generator is xoshiro128** (Blackman and Vigna, "Scrambled linear pseudorandom number generators", ACM TOMS 2021):
 * 128 bits of state, period 2^128 − 1, 32-bit outputs. The four state words are filled from the seed by a Weyl sequence
 * (steps of 0x9e3779b9) passed through MurmurHash3's 32-bit finaliser, which is a bijection, so no seed gives the all-zero
 * state. tools/solid/ref/xoshiro128ss.c is the same algorithm in C; the tests compare the two.
 *
 *   makePrng(seed) → Prng      seed: a whole number from 0 to 2^32 − 1, else solid.err.bad_input { name: 'seed', why }
 *   prng.u32()                 a whole number in [0, 2^32)
 *   prng.float()               a double in [0, 1) with 53 random bits
 *   prng.range(lo, hi)         lo + (hi − lo) · float(), in [lo, hi) for finite lo < hi (bad_input otherwise); where hi − lo
 *                              overflows, lo · (1 − t) + hi · t instead, so the whole of [lo, hi) is still reached
 *   prng.int(n)                a whole number in [0, n), unbiased (rejection), for a whole n from 1 to 2^32
 *   prng.normal()              a standard normal deviate (Marsaglia's polar method, with trig.js's log)
 *   prng.unit3()               a direction uniform on the unit sphere, [x, y, z] (rejection from the cube; no trigonometry)
 *   prng.state() → [4 words]   the state, frozen; restorePrng(state) → a Prng that continues from it
 *   prng.clone()               an independent generator at the same point of the sequence
 */
import { fail } from './errors.js';
import { log } from './trig.js';

const TWO32 = 4294967296;
const TWO53 = 9007199254740992;
const GOLDEN = 0x9e3779b9;
const MADE = new WeakSet();

const rotl = (x, k) => (x << k) | (x >>> (32 - k));

/** MurmurHash3's finaliser (fmix32): a bijection on 32-bit words. */
function fmix32(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function create(s0, s1, s2, s3) {
  let a = s0 | 0, b = s1 | 0, c = s2 | 0, d = s3 | 0;
  function u32() {
    const result = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
    const t = b << 9;
    c ^= a; d ^= b; b ^= c; a ^= d;
    c ^= t;
    d = rotl(d, 11);
    return result;
  }
  const float = () => ((u32() >>> 5) * 67108864 + (u32() >>> 6)) / TWO53;
  function range(lo, hi) {
    if (typeof lo !== 'number' || typeof hi !== 'number' || !Number.isFinite(lo) || !Number.isFinite(hi) || !(lo < hi)) fail('solid.err.bad_input', { name: 'range', why: 'not_an_interval' });
    const w = hi - lo, t = float();
    const x = w === Infinity ? lo * (1 - t) + hi * t : lo + w * t;   // a width past the largest double: blend the ends instead
    return x >= lo && x < hi ? x : lo;                 // rounding can reach hi; [lo, hi) is the promise
  }
  function int(n) {
    if (!Number.isInteger(n) || n < 1 || n > TWO32) fail('solid.err.bad_input', { name: 'n', why: 'out_of_range' });
    const limit = TWO32 - (TWO32 % n);                 // the largest multiple of n not above 2^32
    let x = u32();
    while (x >= limit) x = u32();
    return x % n;
  }
  function normal() {
    for (;;) {
      const u = 2 * float() - 1, v = 2 * float() - 1;
      const s = u * u + v * v;
      if (s > 0 && s < 1) return u * Math.sqrt(-2 * log(s) / s);
    }
  }
  function unit3() {
    for (;;) {
      const x = 2 * float() - 1, y = 2 * float() - 1, z = 2 * float() - 1;
      const r2 = x * x + y * y + z * z;
      if (r2 > 0.0625 && r2 <= 1) { const r = Math.sqrt(r2); return [x / r, y / r, z / r]; }   // a shell, away from 0
    }
  }
  const state = () => Object.freeze([a >>> 0, b >>> 0, c >>> 0, d >>> 0]);
  const clone = () => create(a, b, c, d);
  const prng = Object.freeze({ u32, float, range, int, normal, unit3, state, clone });
  MADE.add(prng);
  return prng;
}

export function makePrng(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed >= TWO32) fail('solid.err.bad_input', { name: 'seed', why: 'not_a_seed' });
  const w = [];
  for (let i = 1; i <= 4; i++) w.push(fmix32((seed + Math.imul(GOLDEN, i)) >>> 0));
  return create(w[0], w[1], w[2], w[3]);
}

export function restorePrng(state) {
  if (!Array.isArray(state) || state.length !== 4 || !state.every((x) => Number.isInteger(x) && x >= 0 && x < TWO32)) fail('solid.err.bad_input', { name: 'state', why: 'not_a_state' });
  if (state.every((x) => x === 0)) fail('solid.err.bad_input', { name: 'state', why: 'all_zero' });
  return create(state[0], state[1], state[2], state[3]);
}

export const isPrng = (p) => p !== null && typeof p === 'object' && MADE.has(p);
