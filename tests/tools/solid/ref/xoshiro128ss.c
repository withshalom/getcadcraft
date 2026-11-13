/* SPDX-License-Identifier: Apache-2.0 */
/*
 * xoshiro128ss.c — the reference for lib/solid/core/prng.js (engine.solid S2): xoshiro128** (Blackman and Vigna, "Scrambled
 * linear pseudorandom number generators", ACM TOMS 2021), seeded the way prng.js seeds it: a Weyl sequence (steps of
 * 0x9e3779b9) through MurmurHash3's 32-bit finaliser. Written from the paper; tools/solid/test.mjs holds the numbers this
 * program prints, so the tests need no compiler.
 *
 *   cc -O2 -o /tmp/xoshiro tools/solid/ref/xoshiro128ss.c && /tmp/xoshiro
 */
#include <stdint.h>
#include <stdio.h>

static uint32_t s[4];
static inline uint32_t rotl(const uint32_t x, int k) { return (x << k) | (x >> (32 - k)); }
static uint32_t fmix32(uint32_t h) { h ^= h >> 16; h *= 0x85ebca6bu; h ^= h >> 13; h *= 0xc2b2ae35u; h ^= h >> 16; return h; }
static void seed(uint32_t x) { for (uint32_t i = 1; i <= 4; i++) s[i - 1] = fmix32(x + 0x9e3779b9u * i); }
static uint32_t next(void) {
  const uint32_t result = rotl(s[1] * 5, 7) * 9;
  const uint32_t t = s[1] << 9;
  s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
  s[2] ^= t;
  s[3] = rotl(s[3], 11);
  return result;
}
int main(void) {
  const uint32_t seeds[] = { 0u, 1u, 42u, 2026u, 4294967295u };
  for (int k = 0; k < 5; k++) {
    seed(seeds[k]);
    printf("%u: state %08x %08x %08x %08x; first", seeds[k], s[0], s[1], s[2], s[3]);
    for (int i = 0; i < 6; i++) printf(" %u", next());
    for (int i = 6; i < 999999; i++) next();
    printf("; 1000000th %u\n", next());
  }
  return 0;
}
