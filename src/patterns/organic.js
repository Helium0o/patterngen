// Organic / natural textures: fractal noise, marble, wood, animal prints (leopard, cheetah,
// giraffe, zebra), camouflage, Gray–Scott reaction–diffusion, Voronoi cells (stained glass,
// cracked earth, cobblestone), leather.
// Everything is built from the periodic noise in core/noise.js, so it all tiles.

import { P } from '../core/params.js';
import { hexToLinear, mix3, set3, ramp, PALETTES } from '../core/color.js';
import { hash01, hashU32, mulberry32, subSeed } from '../core/hash.js';
import { clamp01, coverage, fract, mod, smoothstep, TAU } from '../core/math.js';
import { fbm, fbm01, perlin, valueNoise, warp, worley } from '../core/noise.js';

const lin = (a) => a.map(hexToLinear);
const _c = [0, 0, 0], _w = [0, 0], W = { f1: 0, f2: 0, id: 0, dx: 0, dy: 0 };

// Fractal noise -----------------------------------------------------------------------------

const noise = {
  id: 'noise', name: 'Fractal noise (fbm / ridged / turbulence)', category: 'organic',
  tags: ['graphics', 'clouds', 'heightmap', 'mask', 'game', 'terrain'],
  description: 'Periodic Perlin/value fbm with optional domain warp, mapped through a colour ramp. Use output=height for height maps.',
  params: {
    basis: P.enumOf('perlin', ['perlin', 'value'], 'Basis'),
    mode: P.enumOf('fbm', ['fbm', 'ridged', 'turbulence'], 'Mode'),
    frequency: P.int(4, 1, 64, 'Base frequency (integer)'),
    octaves: P.int(6, 1, 10, 'Octaves'), gain: P.float(0.5, 0.1, 0.9, 'Gain (persistence)'),
    warp: P.float(0, 0, 1, 'Domain warp'), contrast: P.float(1, 0.2, 4, 'Contrast'),
    colors: P.colors(PALETTES.ocean, 'Colour ramp'), seed: P.seed(1),
  },
  prepare: (p) => ({ ramp: lin(p.colors), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p;
    if (p.warp > 0) { warp(u, v, p.warp * 0.25, 2, p.seed, 4, _w); u = _w[0]; v = _w[1]; }
    let f = fbm01(u, v, { freq: p.frequency, octaves: p.octaves, gain: p.gain, seed: p.seed, basis: p.basis, mode: p.mode });
    f = clamp01(0.5 + (f - 0.5) * p.contrast);
    ramp(out, s.ramp, f);
    out[3] = f;
  },
};

// Marble ------------------------------------------------------------------------------------

const marble = {
  id: 'marble', name: 'Marble', category: 'organic',
  tags: ['graphics', 'stone', 'luxury', 'interior', 'material'],
  description: 'Turbulence-displaced sine veins (classic Perlin marble) plus a fine secondary vein layer.',
  params: {
    base: P.color('#eeebe5', 'Base'), vein: P.color('#5d5a57', 'Vein'), tint: P.color('#c9b8a0', 'Cloud tint'),
    veins: P.int(1, 1, 16, 'Main veins'), turbulence: P.float(1.0, 0, 6, 'Turbulence'),
    sharpness: P.float(5, 1, 30, 'Vein sharpness'), seed: P.seed(12),
  },
  prepare: (p) => ({ b: hexToLinear(p.base), v: hexToLinear(p.vein), t: hexToLinear(p.tint), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p;
    const turb = fbm(u, v, { freq: 2, octaves: 7, gain: 0.55, seed: p.seed, mode: 'turbulence' });
    const t1 = Math.sin(TAU * (p.veins * (u + v) + p.turbulence * turb));
    const t2 = Math.sin(TAU * (p.veins * 3 * (u - v) + p.turbulence * 1.6 * fbm(u, v, { freq: 4, octaves: 5, seed: p.seed + 3, mode: 'turbulence' })));
    const m1 = Math.pow(1 - Math.abs(t1), p.sharpness);
    const m2 = Math.pow(1 - Math.abs(t2), p.sharpness * 3) * 0.22;
    const cloud = fbm01(u, v, { freq: 3, octaves: 5, seed: p.seed + 9 });
    mix3(out, s.b, s.t, smoothstep(0.45, 0.9, cloud) * 0.6);
    mix3(out, out, s.v, clamp01(m1 + m2));
    out[3] = 0.5 - 0.2 * clamp01(m1 + m2);
  },
};

// Wood --------------------------------------------------------------------------------------

const wood = {
  id: 'wood', name: 'Wood grain / planks', category: 'organic',
  tags: ['graphics', 'floor', 'material', 'game', 'interior'],
  description: 'Flat-sawn grain: growth rings wobbled by anisotropic noise, pore streaks, optional plank seams.',
  params: {
    planks: P.int(4, 1, 32, 'Planks across'), rings: P.float(9, 1, 40, 'Rings per plank'),
    wobble: P.float(0.8, 0, 3, 'Grain wobble'),
    colors: P.colors(['#e1b382', '#c08552', '#8c5a3c'], 'Light, mid, dark', '', 3, 3),
    seam: P.float(0.004, 0, 0.02, 'Seam width (uv)'), seed: P.seed(21),
  },
  prepare: (p) => ({ c: lin(p.colors), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.planks;
    const X = u * n, k = Math.floor(X), lx = X - k;
    const pk = mod(k, n);
    const off = hash01(pk, 0, p.seed) * 10, tone = 0.88 + 0.24 * hash01(pk, 1, p.seed);
    const wob = fbm(u, v, { fx: 3 * n, fy: 1, octaves: 4, seed: p.seed + pk }) * p.wobble;
    const t = fract(lx * p.rings + off + wob * 2 + 0.6 * Math.sin(TAU * (v + hash01(pk, 2, p.seed))));
    const late = smoothstep(0.62, 0.86, t) * (1 - smoothstep(0.9, 1, t));
    const pores = valueNoise(u * 256 * n, v * 12, 256 * n, 12, p.seed + 5) * 0.5 + 0.5;
    ramp(out, s.c, clamp01(0.15 + late * 0.75 + (pores - 0.5) * 0.25));
    set3(out, out, tone);
    if (p.seam > 0 && n > 1) {
      const d = Math.min(lx, 1 - lx) / n - p.seam * 0.5;
      set3(_c, s.c[2], 0.35);
      mix3(out, out, _c, coverage(d, ctx.px));
    }
    out[3] = 0.6 - late * 0.25 - (pores < 0.3 ? 0.1 : 0);
  },
};

// Animal prints ------------------------------------------------------------------------------

const leopard = {
  id: 'leopard', name: 'Leopard / cheetah', category: 'organic',
  tags: ['clothes', 'print', 'animal', 'fashion'],
  description: 'Rosettes: broken irregular rings around each Worley feature point with a darker centre; cheetah = solid spots.',
  params: {
    style: P.enumOf('leopard', ['leopard', 'cheetah'], 'Style'),
    cells: P.int(6, 2, 48, 'Rosettes across'),
    colors: P.colors(['#d9a35b', '#b97834', '#1d140e'], 'Ground, centre, spot', '', 3, 3),
    irregularity: P.float(0.6, 0, 1, 'Irregularity'), seed: P.seed(13),
  },
  prepare: (p) => ({ c: lin(p.colors), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.cells;
    warp(u, v, 0.02 + 0.03 * p.irregularity, 3, p.seed, 3, _w);
    const wu = _w[0], wv = _w[1];
    const g = fbm01(u, v, { freq: 3, octaves: 4, seed: p.seed + 4 });
    mix3(out, s.c[0], s.c[1], g * 0.35);
    worley(wu, wv, n, n, p.seed, 0.85, W);
    const d = W.f1, ang = Math.atan2(W.dy, W.dx);
    const id = W.id;
    const h = (k) => ((id >>> (k * 4)) & 15) / 15;
    const shape = 1 + p.irregularity * (0.16 * Math.sin(3 * ang + h(0) * TAU) + 0.1 * Math.sin(5 * ang + h(1) * TAU));
    if (p.style === 'cheetah') {
      const r = (0.17 + 0.08 * h(2)) * shape;
      mix3(out, out, s.c[2], coverage((d - r) / n, ctx.px));
      // small satellite spots
      worley(wu, wv, n * 2, n * 2, p.seed + 1, 0.9, W);
      mix3(out, out, s.c[2], coverage((W.f1 - (0.1 + 0.05 * ((W.id >>> 3) & 7) / 7)) / (2 * n), ctx.px));
      return;
    }
    const R = (0.3 + 0.07 * h(2)) * shape, w = 0.075 + 0.03 * h(3);
    if (d < R - w) mix3(out, out, s.c[1], coverage((d - (R - w)) / n, ctx.px) * 0.85);
    const sectors = 4 + (h(4) * 3 | 0);
    const sec = Math.floor(((ang / TAU + 0.5 + h(5)) % 1) * sectors);
    const gap = hash01(id & 0xffff, sec, p.seed) < 0.3 + 0.15 * p.irregularity;
    // break the ring with soft gaps, ring thickness swells per sector
    const ringD = Math.abs(d - R) - w * (gap ? 0.15 : 1) * (0.8 + 0.4 * hash01(sec, id & 0xff, p.seed));
    mix3(out, out, s.c[2], coverage(ringD / n, ctx.px));
    worley(wu, wv, n * 3, n * 3, p.seed + 2, 0.9, W);
    if (d > R + w * 1.5) mix3(out, out, s.c[2], coverage((W.f1 - 0.09) / (3 * n), ctx.px) * 0.9);
  },
};

const giraffe = {
  id: 'giraffe', name: 'Giraffe', category: 'organic',
  tags: ['clothes', 'print', 'animal'],
  description: 'Warped Voronoi patches separated by a cream network (F2 − F1 band).',
  params: {
    cells: P.int(5, 2, 48, 'Patches across'), border: P.float(0.12, 0.02, 0.5, 'Border width'),
    colors: P.colors(['#f1e3c6', '#8a4b1f', '#6e3a17', '#a35d2a'], 'Network, patch colours…', '', 2, 8),
    seed: P.seed(14),
  },
  prepare: (p) => ({ c: lin(p.colors), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.cells;
    warp(u, v, 0.035, 3, p.seed, 3, _w);
    worley(_w[0], _w[1], n, n, p.seed, 0.9, W, 0, 2);
    const e = W.f2 - W.f1;
    const pc = s.c[1 + (W.id % (s.c.length - 1))];
    const mott = fbm01(u, v, { freq: 8, octaves: 3, seed: p.seed + 2 });
    set3(_c, pc, 0.85 + 0.3 * mott);
    mix3(out, s.c[0], _c, clamp01((e - p.border) * n / (ctx.px * n * n * 0.6) + 0.5));
  },
};

const zebra = {
  id: 'zebra', name: 'Zebra / tiger stripes', category: 'organic',
  tags: ['clothes', 'print', 'animal'],
  description: 'Noise-displaced, thickness-modulated stripes; tiger style adds broken stripe ends.',
  params: {
    style: P.enumOf('zebra', ['zebra', 'tiger'], 'Style'),
    stripes: P.int(9, 1, 64, 'Stripes'), warpAmount: P.float(0.6, 0, 2, 'Warp'),
    colors: P.colors(['#f5f2ea', '#141414'], 'Ground, stripe', '', 2, 2), seed: P.seed(15),
  },
  prepare: (p) => ({ c: lin(p.colors), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p;
    const t = v * p.stripes + p.warpAmount * fbm(u, v, { freq: 2, octaves: 4, seed: p.seed }) * 2 + 0.25 * Math.sin(TAU * 2 * u);
    const thick = 0.1 * fbm(u, v, { freq: 5, octaves: 3, seed: p.seed + 1 });
    let g = Math.cos(TAU * t) - thick * 4 - 0.05;
    if (p.style === 'tiger') {
      const brk = fbm01(u, v, { fx: 6, fy: 2, octaves: 3, seed: p.seed + 2 });
      g -= smoothstep(0.55, 0.75, brk) * 1.6;
    }
    const d = g / (TAU * p.stripes * 1.2);
    set3(out, s.c[0]);
    if (p.style === 'tiger') { set3(out, hexToLinear('#e08a2e')); mix3(out, out, s.c[0], smoothstep(0.55, 0.95, fbm01(u, v, { freq: 2, octaves: 2, seed: p.seed + 5 }))); }
    mix3(out, out, s.c[1], coverage(-d, ctx.px));
  },
};

// Camouflage ----------------------------------------------------------------------------------

const camo = {
  id: 'camouflage', name: 'Camouflage', category: 'organic',
  tags: ['clothes', 'military', 'streetwear', 'print'],
  description: 'Woodland (layered thresholded fbm blobs) or digital (same field quantised to a pixel grid).',
  params: {
    style: P.enumOf('woodland', ['woodland', 'digital'], 'Style'),
    scale: P.int(3, 1, 16, 'Blob frequency'), pixels: P.int(64, 8, 256, 'Digital grid'),
    colors: P.colors(['#7d7a52', '#4b5b33', '#6b4b2e', '#1f1f1a'], 'Base + layers', '', 2, 6),
    coverage: P.float(0.5, 0.2, 0.8, 'Layer coverage'), seed: P.seed(16),
  },
  prepare: (p) => ({ c: lin(p.colors), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p;
    if (p.style === 'digital') { u = (Math.floor(u * p.pixels) + 0.5) / p.pixels; v = (Math.floor(v * p.pixels) + 0.5) / p.pixels; }
    set3(out, s.c[0]);
    for (let i = 1; i < s.c.length; i++) {
      // fbm is ~N(0.5, 0.15): stretch to ~[0,1] so 'coverage' maps roughly to area
      const f = 0.5 + (fbm01(u, v, { freq: p.scale, octaves: 5, gain: 0.55, seed: subSeed(p.seed, i) }) - 0.5) * 2.6;
      const thr = 1 - p.coverage + 0.07 * (i - 1);
      const a = p.style === 'digital' ? (f > thr ? 1 : 0) : smoothstep(thr - 0.006, thr + 0.006, f);
      mix3(out, out, s.c[i], a);
    }
  },
};

// Reaction–diffusion ----------------------------------------------------------------------------

export const RD_PRESETS = {
  // (feed, kill) with dA=1, dB=0.5, dt=1 (Karl Sims' parametrisation)
  coral: [0.0545, 0.062], mitosis: [0.0367, 0.0649], maze: [0.029, 0.057],
  spots: [0.035, 0.065], worms: [0.078, 0.061], holes: [0.039, 0.058],
};

const rdCache = new Map();

/** Run Gray–Scott on a periodic grid. Deterministic: seeded init, fixed iteration count. */
export function grayScott(G, feed, kill, iters, seed) {
  const key = `${G}|${feed}|${kill}|${iters}|${seed}`;
  if (rdCache.has(key)) return rdCache.get(key);
  const N = G * G;
  let A = new Float32Array(N).fill(1), B = new Float32Array(N);
  let A2 = new Float32Array(N), B2 = new Float32Array(N);
  const rnd = mulberry32(seed);
  const blobs = Math.max(4, Math.round(N / 600));
  for (let k = 0; k < blobs; k++) {
    const cx = (rnd() * G) | 0, cy = (rnd() * G) | 0, r = 2 + ((rnd() * 3) | 0);
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const i = mod(cy + y, G) * G + mod(cx + x, G);
      B[i] = 1; A[i] = 0.5;
    }
  }
  const L = new Int32Array(G), R = new Int32Array(G);
  for (let i = 0; i < G; i++) { L[i] = mod(i - 1, G); R[i] = mod(i + 1, G); }
  for (let it = 0; it < iters; it++) {
    for (let y = 0; y < G; y++) {
      const yu = L[y] * G, yc = y * G, yd = R[y] * G;
      for (let x = 0; x < G; x++) {
        const xl = L[x], xr = R[x], i = yc + x;
        const a = A[i], b = B[i];
        const la = 0.2 * (A[yc + xl] + A[yc + xr] + A[yu + x] + A[yd + x]) + 0.05 * (A[yu + xl] + A[yu + xr] + A[yd + xl] + A[yd + xr]) - a;
        const lb = 0.2 * (B[yc + xl] + B[yc + xr] + B[yu + x] + B[yd + x]) + 0.05 * (B[yu + xl] + B[yu + xr] + B[yd + xl] + B[yd + xr]) - b;
        const abb = a * b * b;
        let na = a + (la - abb + feed * (1 - a));
        let nb = b + (0.5 * lb + abb - (kill + feed) * b);
        A2[i] = na < 0 ? 0 : na > 1 ? 1 : na;
        B2[i] = nb < 0 ? 0 : nb > 1 ? 1 : nb;
      }
    }
    [A, A2] = [A2, A]; [B, B2] = [B2, B];
  }
  let lo = 1, hi = 0;
  for (let i = 0; i < N; i++) { if (B[i] < lo) lo = B[i]; if (B[i] > hi) hi = B[i]; }
  const res = { G, B, lo, hi };
  if (rdCache.size > 8) rdCache.delete(rdCache.keys().next().value);
  rdCache.set(key, res);
  return res;
}

const reaction = {
  id: 'reaction-diffusion', name: 'Reaction–diffusion (Gray–Scott)', category: 'organic',
  tags: ['graphics', 'generative', 'biological', 'coral', 'print'],
  description: 'Turing patterns from the Gray–Scott model on a periodic grid (seamless by construction). Presets: coral, mitosis, maze, spots, worms, holes. Cost ∝ grid² × iterations; results are cached.',
  params: {
    preset: P.enumOf('coral', Object.keys(RD_PRESETS).concat('custom'), 'Preset'),
    feed: P.float(0.0545, 0.01, 0.1, 'Feed (custom)'), kill: P.float(0.062, 0.04, 0.075, 'Kill (custom)'),
    grid: P.int(160, 48, 512, 'Simulation grid', 'Bigger = more, smaller features per tile'),
    iterations: P.int(5000, 200, 30000, 'Iterations'),
    colors: P.colors(['#0b132b', '#5bc0be', '#f7f7f2'], 'Colour ramp'), seed: P.seed(17),
  },
  prepare: (p) => {
    const [f, k] = p.preset === 'custom' ? [p.feed, p.kill] : RD_PRESETS[p.preset];
    return { sim: grayScott(p.grid, f, k, p.iterations, p.seed), ramp: lin(p.colors) };
  },
  sample(u, v, out, ctx, s) {
    const { G, B, lo, hi } = s.sim;
    const x = u * G - 0.5, y = v * G - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const i0 = mod(x0, G), i1 = mod(x0 + 1, G), j0 = mod(y0, G) * G, j1 = mod(y0 + 1, G) * G;
    // bicubic-ish smoothing via smoothstep weights keeps edges soft without blocky texels
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const b = (B[j0 + i0] * (1 - sx) + B[j0 + i1] * sx) * (1 - sy) + (B[j1 + i0] * (1 - sx) + B[j1 + i1] * sx) * sy;
    const t = smoothstep(0.15, 0.85, (b - lo) / (hi - lo + 1e-9));
    ramp(out, s.ramp, t);
    out[3] = t;
  },
};

// Voronoi cells --------------------------------------------------------------------------------

const voronoi = {
  id: 'voronoi-cells', name: 'Voronoi cells (stained glass / cracked earth / cobblestone)', category: 'organic',
  tags: ['graphics', 'game', 'material', 'mosaic', 'stone'],
  description: 'Worley F1/F2 with exact 5×5 search. Edge band = F2 − F1 (≈ distance to the Voronoi border).',
  params: {
    style: P.enumOf('stained-glass', ['stained-glass', 'cracked-earth', 'cobblestone', 'cells'], 'Style'),
    cells: P.int(8, 2, 96, 'Cells across'), jitter: P.float(1, 0, 1, 'Jitter'),
    edge: P.float(0.08, 0, 0.5, 'Edge width (cell units)'),
    colors: P.colors(PALETTES.candy, 'Cell colours'), edgeColor: P.color('#151515', 'Edge colour'),
    seed: P.seed(18),
  },
  prepare: (p) => ({ c: lin(p.colors), e: hexToLinear(p.edgeColor), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.cells;
    let wu = u, wv = v;
    if (p.style === 'cracked-earth') { warp(u, v, 0.012, 6, p.seed, 3, _w); wu = _w[0]; wv = _w[1]; }
    worley(wu, wv, n, n, p.seed, p.jitter, W, 0, 2);
    const e = (W.f2 - W.f1) * 0.5; // ≈ distance to edge in cell units
    const col = s.c[W.id % s.c.length];
    let w = p.edge * 0.5;
    if (p.style === 'stained-glass') {
      set3(_c, col, 0.7 + 0.45 * (1 - clamp01(W.f1 * 1.4)) + 0.1 * fbm(u, v, { freq: 16, octaves: 2, seed: W.id & 0xffff }));
    } else if (p.style === 'cracked-earth') {
      const tone = 0.85 + 0.3 * fbm01(u, v, { freq: 12, octaves: 4, seed: p.seed + 3 });
      set3(_c, col, tone * (0.85 + 0.15 * smoothstep(0, 0.25, e)));
      w *= 0.5 + fbm01(u, v, { freq: 20, octaves: 2, seed: p.seed + 7 });
    } else if (p.style === 'cobblestone') {
      const dome = Math.sqrt(clamp01(e * 4));
      set3(_c, col, 0.45 + 0.55 * dome + 0.08 * fbm(u, v, { freq: 32, octaves: 3, seed: p.seed + 5 }));
      out[3] = dome;
    } else set3(_c, col);
    mix3(out, s.e, _c, coverage(-(e - w) / n, ctx.px));
    if (p.style !== 'cobblestone') out[3] = e > w ? 0.7 : 0.2;
  },
};

// Leather ------------------------------------------------------------------------------------

const leather = {
  id: 'leather', name: 'Leather grain', category: 'organic',
  tags: ['clothes', 'material', 'bag', 'shoes', 'upholstery'],
  description: 'Dense pebbled cells with soft creases, tonal mottling. Pair output=normal for 3D.',
  params: {
    color: P.color('#5a3522', 'Colour'), cells: P.int(40, 8, 160, 'Grain density'),
    crease: P.float(0.8, 0, 1, 'Crease depth'), seed: P.seed(19),
  },
  prepare: (p) => ({ c: hexToLinear(p.color), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p;
    worley(u, v, p.cells, p.cells, p.seed, 1, W, 0, 1);
    const e = W.f2 - W.f1;
    const bump = smoothstep(0, 0.35, e);
    const mott = fbm01(u, v, { freq: 4, octaves: 5, seed: p.seed + 1 });
    const hgt = clamp01(0.35 + 0.5 * bump * (1 - p.crease * 0.4) + 0.15 * mott);
    set3(out, s.c, (0.6 + 0.5 * mott) * (1 - p.crease * 0.6 * (1 - bump)) * (0.85 + 0.3 * bump * (1 - W.f1)));
    out[3] = hgt;
  },
};

export default [noise, marble, wood, leopard, giraffe, zebra, camo, reaction, voronoi, leather];
