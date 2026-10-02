// Periodic (seamlessly tileable) noise.
//
// Technique: make the LATTICE periodic — integer lattice coordinates are wrapped modulo the
// period before hashing, while the true unwrapped offsets are kept for the dot products. Opposite
// edges then evaluate the *same* lattice samples, so the seam is exact, not blended.
// Octaves use integer frequencies (lacunarity fixed at 2) so every octave tiles too.
// Simplex is deliberately absent: its triangular lattice doesn't wrap onto a square tile.
//
// All functions take u, v on the unit torus [0,1) and integer frequencies.

import { hashU32, hash01, pcg3, subSeed } from './hash.js';
import { fade, lerp, mod } from './math.js';

const D = 0.7071067811865476;
// 8 gradient directions (axis + diagonal). A fixed table keeps results bit-identical across
// engines (no Math.cos on hashed angles).
const GX = [1, -1, 0, 0, D, -D, D, -D];
const GY = [0, 0, 1, -1, D, D, -D, -D];

function grad(ix, iy, seed, dx, dy) {
  const h = hashU32(ix, iy, seed) >>> 29; // top 3 bits -> 0..7
  return GX[h] * dx + GY[h] * dy;
}

/** Periodic Perlin gradient noise. x,y in lattice units; px,py integer periods. Returns ~[-1,1]. */
export function perlin(x, y, px, py, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const ix0 = mod(x0, px), ix1 = mod(x0 + 1, px);
  const iy0 = mod(y0, py), iy1 = mod(y0 + 1, py);
  const n00 = grad(ix0, iy0, seed, fx, fy);
  const n10 = grad(ix1, iy0, seed, fx - 1, fy);
  const n01 = grad(ix0, iy1, seed, fx, fy - 1);
  const n11 = grad(ix1, iy1, seed, fx - 1, fy - 1);
  const a = fade(fx), b = fade(fy);
  return lerp(lerp(n00, n10, a), lerp(n01, n11, a), b) * 1.41421356;
}

/** Periodic value noise. Returns [-1,1]. Blockier/cheaper than Perlin. */
export function valueNoise(x, y, px, py, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = fade(x - x0), fy = fade(y - y0);
  const ix0 = mod(x0, px), ix1 = mod(x0 + 1, px);
  const iy0 = mod(y0, py), iy1 = mod(y0 + 1, py);
  const a = hash01(ix0, iy0, seed), b = hash01(ix1, iy0, seed);
  const c = hash01(ix0, iy1, seed), d = hash01(ix1, iy1, seed);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy) * 2 - 1;
}

/**
 * Fractal sum of periodic noise.
 * @param {number} u,v      unit-torus coordinates
 * @param {object} o        { fx, fy (base integer frequencies), octaves, gain, seed, basis:'perlin'|'value', mode:'fbm'|'ridged'|'turbulence' }
 * @returns fbm: ~[-1,1]; ridged/turbulence: [0,1]
 */
export function fbm(u, v, o) {
  const octaves = o.octaves ?? 5, gain = o.gain ?? 0.5, seed = o.seed ?? 0;
  const basis = o.basis === 'value' ? valueNoise : perlin;
  const mode = o.mode || 'fbm';
  let fx = Math.max(1, Math.round(o.fx ?? o.freq ?? 4));
  let fy = Math.max(1, Math.round(o.fy ?? o.freq ?? 4));
  let amp = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    // per-octave seed: golden-ratio offset (cheap; PCG mixes it fully)
    let n = basis(u * fx, v * fy, fx, fy, (seed + Math.imul(i + 1, 0x9e3779b9)) | 0);
    if (mode === 'ridged') { n = 1 - Math.abs(n); n *= n; }
    else if (mode === 'turbulence') n = Math.abs(n);
    sum += n * amp; norm += amp;
    amp *= gain; fx *= 2; fy *= 2;
  }
  return sum / norm;
}

/** fbm remapped to [0,1]. */
export const fbm01 = (u, v, o) => (o.mode && o.mode !== 'fbm' ? fbm(u, v, o) : fbm(u, v, o) * 0.5 + 0.5);

/**
 * Domain warp (Quilez-style): displaces (u,v) by two independent periodic fbm fields.
 * Periodic in, periodic out, so warped patterns still tile. Writes to out[0], out[1].
 */
export function warp(u, v, amount, freq, seed, octaves, out) {
  out[0] = u + amount * fbm(u, v, { freq, octaves, seed: subSeed(seed, 101) });
  out[1] = v + amount * fbm(u, v, { freq, octaves, seed: subSeed(seed, 202) });
  return out;
}

const _w = new Uint32Array(3);
const INV = 1 / 4294967296;

/**
 * Periodic Worley / cellular noise on an n×m grid of jittered feature points.
 * out: { f1, f2 (distances in cell units), id (uint32 of nearest cell), dx, dy (vector to nearest point, cell units) }
 * metric: 0 euclidean, 1 manhattan, 2 chebyshev. range: 1 => 3x3 search, 2 => 5x5 (exact F2 for jitter=1).
 */
export function worley(u, v, n, m, seed, jitter, out, metric = 0, range = 1) {
  const x = u * n, y = v * m;
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 1e9, f2 = 1e9, id = 0, bdx = 0, bdy = 0;
  for (let j = -range; j <= range; j++) {
    for (let i = -range; i <= range; i++) {
      const cx = xi + i, cy = yi + j;
      pcg3(mod(cx, n), mod(cy, m), seed, _w);
      const ppx = cx + 0.5 + (_w[0] * INV - 0.5) * jitter;
      const ppy = cy + 0.5 + (_w[1] * INV - 0.5) * jitter;
      const dx = ppx - x, dy = ppy - y;
      const d = metric === 1 ? Math.abs(dx) + Math.abs(dy)
        : metric === 2 ? Math.max(Math.abs(dx), Math.abs(dy))
        : Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; f1 = d; id = _w[2]; bdx = dx; bdy = dy; }
      else if (d < f2) f2 = d;
    }
  }
  out.f1 = f1; out.f2 = f2; out.id = id; out.dx = bdx; out.dy = bdy;
  return out;
}
