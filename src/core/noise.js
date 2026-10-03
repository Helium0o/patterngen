// Periodic (seamlessly tileable) noise.
//
// Technique: make the LATTICE periodic — integer lattice coordinates are wrapped modulo the
// period before hashing, while the true unwrapped offsets are kept for the dot products. Opposite
// edges then evaluate the *same* lattice samples, so the seam is exact, not blended.
// Octaves use integer frequencies (lacunarity fixed at 2) so every octave tiles too.
// Simplex is deliberately absent: its triangular lattice doesn't wrap onto a square tile.
//
// All functions take u, v on the unit torus [0,1) and integer frequencies.
//
// PERFORMANCE: build fields ONCE in a pattern's prepare() with noiseField()/warpField(), then call
// the returned function in sample(). Passing a fresh options object to fbm() per sample allocates
// in the hot loop and is several times slower.

import { subSeed } from './hash.js';
import { fade, lerp, mod } from './math.js';

/**
 * Lattice hash for noise: a lowbias32-style integer mix (Wellons 2018) of (x, y, seed). Exact
 * 32-bit integer maths like PCG3D (identical in every JS engine), but cheaper — noise calls it
 * 4× per octave, so it dominates organic patterns' cost.
 */
function lat(x, y, seed) {
  let h = Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841) ^ Math.imul(seed, 0xcb1ab31f);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}
const INV32 = 1 / 4294967296;

const D = 0.7071067811865476;
// 8 gradient directions (axis + diagonal). A fixed table keeps results bit-identical across
// engines (no Math.cos on hashed angles).
const GX = [1, -1, 0, 0, D, -D, D, -D];
const GY = [0, 0, 1, -1, D, D, -D, -D];

/** Periodic Perlin gradient noise. x,y in lattice units; px,py integer periods. Returns ~[-1,1]. */
export function perlin(x, y, px, py, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const ix0 = mod(x0, px), ix1 = ix0 + 1 === px ? 0 : ix0 + 1;
  const iy0 = mod(y0, py), iy1 = iy0 + 1 === py ? 0 : iy0 + 1;
  let h = lat(ix0, iy0, seed) >>> 29;
  const n00 = GX[h] * fx + GY[h] * fy;
  h = lat(ix1, iy0, seed) >>> 29;
  const n10 = GX[h] * (fx - 1) + GY[h] * fy;
  h = lat(ix0, iy1, seed) >>> 29;
  const n01 = GX[h] * fx + GY[h] * (fy - 1);
  h = lat(ix1, iy1, seed) >>> 29;
  const n11 = GX[h] * (fx - 1) + GY[h] * (fy - 1);
  const a = fade(fx), b = fade(fy);
  return lerp(lerp(n00, n10, a), lerp(n01, n11, a), b) * 1.41421356;
}

/** Periodic value noise. Returns [-1,1]. Blockier/cheaper than Perlin. */
export function valueNoise(x, y, px, py, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = fade(x - x0), fy = fade(y - y0);
  const ix0 = mod(x0, px), ix1 = ix0 + 1 === px ? 0 : ix0 + 1;
  const iy0 = mod(y0, py), iy1 = iy0 + 1 === py ? 0 : iy0 + 1;
  const a = lat(ix0, iy0, seed) * INV32, b = lat(ix1, iy0, seed) * INV32;
  const c = lat(ix0, iy1, seed) * INV32, d = lat(ix1, iy1, seed) * INV32;
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy) * 2 - 1;
}

const MODES = { fbm: 0, ridged: 1, turbulence: 2 };

/**
 * Build a fractal noise field once; returns f(u, v).
 * @param {object} o { freq | fx, fy (integer base frequencies, default 4), octaves (5), gain (0.5),
 *                     seed (0), basis: 'perlin'|'value', mode: 'fbm'|'ridged'|'turbulence',
 *                     range: '01' (default) | 'signed' }
 * Ranges: fbm signed ≈ [-1,1] (most values within ±0.5); '01' maps fbm to ≈[0,1] around 0.5.
 *         ridged / turbulence are always ≈[0,1].
 */
export function noiseField(o = {}) {
  const octaves = Math.max(1, Math.min(12, Math.round(o.octaves ?? 5)));
  const gain = o.gain ?? 0.5;
  const fx0 = Math.max(1, Math.round(o.fx ?? o.freq ?? 4));
  const fy0 = Math.max(1, Math.round(o.fy ?? o.freq ?? 4));
  const basis = o.basis === 'value' ? valueNoise : perlin;
  const mode = MODES[o.mode] ?? 0;
  const signed = o.range === 'signed' && mode === 0;
  const seeds = new Int32Array(octaves), amps = new Float64Array(octaves);
  let amp = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    seeds[i] = ((o.seed ?? 0) + Math.imul(i + 1, 0x9e3779b9)) | 0; // golden-ratio offset per octave
    amps[i] = amp; norm += amp; amp *= gain;
  }
  for (let i = 0; i < octaves; i++) amps[i] /= norm;
  return function field(u, v) {
    let sum = 0, fx = fx0, fy = fy0;
    for (let i = 0; i < octaves; i++) {
      let n = basis(u * fx, v * fy, fx, fy, seeds[i]);
      if (mode === 1) { n = 1 - Math.abs(n); n *= n; } else if (mode === 2) n = Math.abs(n);
      sum += n * amps[i];
      fx *= 2; fy *= 2;
    }
    return mode !== 0 || signed ? sum : sum * 0.5 + 0.5;
  };
}

/**
 * v1-compatible fractal sum (allocation-free only if you reuse `o`). Prefer noiseField().
 * fbm: ~[-1,1]; ridged/turbulence: [0,1]
 */
const _fieldCache = new WeakMap();
export function fbm(u, v, o) {
  let f = _fieldCache.get(o);
  if (!f) { f = noiseField({ ...o, range: 'signed' }); _fieldCache.set(o, f); }
  return f(u, v);
}
/** fbm remapped to [0,1]. */
export const fbm01 = (u, v, o) => (o.mode && o.mode !== 'fbm' ? fbm(u, v, o) : fbm(u, v, o) * 0.5 + 0.5);

/**
 * Domain warp (Quilez-style): displaces (u,v) by two independent periodic fbm fields.
 * Periodic in, periodic out, so warped patterns still tile. Returns w(u, v, out) writing out[0..1].
 */
export function warpField(amount, freq, seed, octaves = 4) {
  const fx = noiseField({ freq, octaves, seed: subSeed(seed, 101), range: 'signed' });
  const fy = noiseField({ freq, octaves, seed: subSeed(seed, 202), range: 'signed' });
  return function warpUV(u, v, out) {
    out[0] = u + amount * fx(u, v);
    out[1] = v + amount * fy(u, v);
    return out;
  };
}

/** v1-compatible one-shot warp (builds fields every call — slow; prefer warpField). */
export function warp(u, v, amount, freq, seed, octaves, out) {
  return warpField(amount, freq, seed, octaves)(u, v, out);
}

const INV = 1 / 4294967296;
/** lowbias32 finaliser of one int. */
function fmix(h) {
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}
// three independent hashes of a cell: jitter x, jitter y, cell id
let hA = 0, hB = 0, hC = 0;
function cellHash(x, y, seed) {
  hA = lat(x, y, seed); hB = fmix(hA ^ 0x9e3779b9); hC = fmix(hB ^ 0x85ebca6b);
}

/**
 * Periodic Worley / cellular noise on an n×m grid of jittered feature points.
 * out: { f1, f2 (distances in cell units), id (uint32 of nearest cell), dx, dy (vector from the
 *        sample to the nearest point, cell units), cx, cy (wrapped integer cell of the nearest point) }
 * metric: 0 euclidean, 1 manhattan, 2 chebyshev. range: 1 => 3x3 search, 2 => 5x5 (exact F2 for jitter=1).
 */
export function worley(u, v, n, m, seed, jitter, out, metric = 0, range = 1) {
  const x = u * n, y = v * m;
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 1e9, f2 = 1e9, id = 0, bdx = 0, bdy = 0, bcx = 0, bcy = 0;
  for (let j = -range; j <= range; j++) {
    for (let i = -range; i <= range; i++) {
      const cx = xi + i, cy = yi + j;
      const wx = mod(cx, n), wy = mod(cy, m);
      cellHash(wx, wy, seed);
      const ppx = cx + 0.5 + (hA * INV - 0.5) * jitter;
      const ppy = cy + 0.5 + (hB * INV - 0.5) * jitter;
      const dx = ppx - x, dy = ppy - y;
      const d = metric === 1 ? Math.abs(dx) + Math.abs(dy)
        : metric === 2 ? Math.max(Math.abs(dx), Math.abs(dy))
        : Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; f1 = d; id = hC; bdx = dx; bdy = dy; bcx = wx; bcy = wy; }
      else if (d < f2) f2 = d;
    }
  }
  out.f1 = f1; out.f2 = f2; out.id = id; out.dx = bdx; out.dy = bdy; out.cx = bcx; out.cy = bcy;
  return out;
}

/**
 * Exact distance to the Voronoi border (Quilez, "Voronoi edges"): F2−F1 over-estimates near
 * corners; this computes the true perpendicular distance to the nearest bisector. 5×5 search.
 * Writes out.edge (cell units) plus everything worley() writes.
 */
export function voronoiEdge(u, v, n, m, seed, jitter, out) {
  worley(u, v, n, m, seed, jitter, out, 0, 1); // 3×3 finds the nearest point exactly for jitter ≤ 1
  const x = u * n, y = v * m;
  const xi = Math.floor(x), yi = Math.floor(y);
  // nearest point position in unwrapped cell space
  const mx = x + out.dx, my = y + out.dy;
  let best = 1e9;
  for (let j = -2; j <= 2; j++) {
    for (let i = -2; i <= 2; i++) {
      const cx = xi + i, cy = yi + j;
      cellHash(mod(cx, n), mod(cy, m), seed);
      const ppx = cx + 0.5 + (hA * INV - 0.5) * jitter;
      const ppy = cy + 0.5 + (hB * INV - 0.5) * jitter;
      const ex = ppx - mx, ey = ppy - my;
      const l2 = ex * ex + ey * ey;
      if (l2 < 1e-10) continue; // the nearest point itself
      const inv = 1 / Math.sqrt(l2);
      // distance from sample to bisector of (m, p)
      const d = ((mx + ppx) * 0.5 - x) * ex * inv + ((my + ppy) * 0.5 - y) * ey * inv;
      if (d < best) best = d;
    }
  }
  out.edge = best;
  return out;
}
