// Integer hashing and seeded PRNG.
//
// WHY integer hashes: the popular GLSL one-liner `fract(sin(dot(p, k)) * 43758.5453)`
// depends on float precision and sin() implementation, so it gives different results
// across GPUs/engines and degrades for large coordinates. Integer hashes are exact and
// bit-identical everywhere (Math.imul is specified 32-bit wraparound multiply).
//
// pcg3: PCG3D from Jarzynski & Olano, "Hash Functions for GPU Rendering", JCGT 9(3) 2020 —
// on the Pareto frontier of quality vs speed in their TestU01 evaluation.

const INV_U32 = 1 / 4294967296;
const _h = new Uint32Array(3);

/** PCG3D. Writes three uint32 outputs into `out` (defaults to a shared scratch array). */
export function pcg3(x, y, z, out = _h) {
  let a = (Math.imul(x | 0, 1664525) + 1013904223) | 0;
  let b = (Math.imul(y | 0, 1664525) + 1013904223) | 0;
  let c = (Math.imul(z | 0, 1664525) + 1013904223) | 0;
  a = (a + Math.imul(b, c)) | 0;
  b = (b + Math.imul(c, a)) | 0;
  c = (c + Math.imul(a, b)) | 0;
  a ^= a >>> 16; b ^= b >>> 16; c ^= c >>> 16;
  a = (a + Math.imul(b, c)) | 0;
  b = (b + Math.imul(c, a)) | 0;
  c = (c + Math.imul(a, b)) | 0;
  out[0] = a >>> 0; out[1] = b >>> 0; out[2] = c >>> 0;
  return out;
}

/** One uint32 from (x, y, seed). */
export function hashU32(x, y, seed) {
  pcg3(x, y, seed, _h);
  return _h[0];
}

/** Float in [0, 1) from integer lattice coordinates and a seed. */
export function hash01(x, y, seed) {
  pcg3(x, y, seed, _h);
  return _h[0] * INV_U32;
}

/** Three floats in [0,1) written to out[0..2]. */
export function hash01x3(x, y, seed, out) {
  pcg3(x, y, seed, _h);
  out[0] = _h[0] * INV_U32; out[1] = _h[1] * INV_U32; out[2] = _h[2] * INV_U32;
  return out;
}

/** Derive an independent sub-seed (e.g. per octave or per layer). */
export function subSeed(seed, k) {
  return hashU32(seed | 0, k | 0, 0x5bd1e995) | 0;
}

/** FNV-1a: turn a string into a 32-bit seed. */
export function seedFromString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h | 0;
}

/** mulberry32 sequential PRNG -> function returning floats in [0,1). Deterministic per seed. */
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) * INV_U32;
  };
}
