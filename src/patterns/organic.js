// Organic / natural textures and materials: fractal noise, marble, granite, wood planks, parquet,
// animal prints (leopard, cheetah, giraffe, zebra, tiger), snakeskin, camouflage, Gray–Scott
// reaction–diffusion, Voronoi cells (stained glass, cracked earth, cobblestone), leather.
// Everything is built from the periodic noise in core/noise.js, so it all tiles.
// Noise fields are built ONCE in prepare() (noiseField / warpField) — never per sample.

import { P, adv } from '../core/params.js';
import { hexToLinear, mix, shade, ramp, PALETTES } from '../core/color.js';
import { hash01, hashU32, mulberry32, subSeed, hash01x3 } from '../core/hash.js';
import { clamp01, coverage, fract, mod, smoothstep, TAU, evenInt, detail, lambert } from '../core/math.js';
import { noiseField, valueNoise, warpField, worley, voronoiEdge } from '../core/noise.js';

const lin = (a) => a.map(hexToLinear);
const _c = [0, 0, 0, 0], _d = [0, 0, 0, 0], _w = [0, 0];
const W = { f1: 0, f2: 0, id: 0, dx: 0, dy: 0, cx: 0, cy: 0, edge: 0 };
const BIG = 1 << 20; // "infinite" period for noise used inside bounded pieces (planks, scales)

// Fractal noise -----------------------------------------------------------------------------

const noise = {
  id: 'noise', name: 'Fractal noise (fbm / ridged / turbulence)', category: 'organic', scale: 'frequency',
  tags: ['graphics', 'clouds', 'heightmap', 'mask', 'game', 'terrain'],
  description: 'Periodic Perlin/value fbm with optional domain warp, mapped through a colour ramp. Use output=height for height maps.',
  features: (p) => [p.frequency, p.frequency, 'blobs'],
  params: {
    basis: P.enumOf('perlin', ['perlin', 'value'], 'Basis'),
    mode: P.enumOf('fbm', ['fbm', 'ridged', 'turbulence'], 'Mode'),
    frequency: P.int(4, 1, 64, 'Base frequency (integer)'),
    octaves: P.int(6, 1, 10, 'Octaves'), gain: P.float(0.5, 0.1, 0.9, 'Gain (persistence)'),
    warp: P.float(0, 0, 1, 'Domain warp'), contrast: P.float(1, 0.2, 4, 'Contrast'),
    colors: P.colors(PALETTES.ocean, 'Colour ramp'), seed: P.seed(1),
  },
  prepare: (p) => ({
    ramp: lin(p.colors), p,
    f: noiseField({ freq: p.frequency, octaves: p.octaves, gain: p.gain, seed: p.seed, basis: p.basis, mode: p.mode }),
    w: warpField(p.warp * 0.25, 2, p.seed, 4),
  }),
  sample(u, v, out, ctx, s) {
    const p = s.p;
    if (p.warp > 0) { s.w(u, v, _w); u = _w[0]; v = _w[1]; }
    let f = s.f(u, v);
    f = clamp01(0.5 + (f - 0.5) * p.contrast);
    ramp(out, s.ramp, f);
    out[4] = f;
  },
};

// Marble ------------------------------------------------------------------------------------

const marble = {
  id: 'marble', name: 'Marble', category: 'organic', scale: 'veins',
  tags: ['graphics', 'stone', 'luxury', 'interior', 'material', 'carrara', 'calacatta'],
  description: 'Turbulence-displaced veins (Perlin marble) at two scales: bold main veins with a soft halo and a sharp core, a web of fine hairline veins, and cloudy tonal drifts. Presets: Carrara, Calacatta gold, Nero Marquina, verde.',
  features: (p) => [p.veins, p.veins, 'veins'],
  params: {
    base: P.color('#eeebe5', 'Base'), vein: P.color('#5d5a57', 'Vein'), tint: P.color('#c9b8a0', 'Cloud tint'),
    accent: adv(P.color('#b08d57', 'Vein halo / accent', 'Colour of the soft halo around main veins (gold for Calacatta).')),
    veins: P.int(1, 1, 16, 'Main veins'), turbulence: P.float(1.0, 0, 6, 'Turbulence'),
    sharpness: P.float(5, 1, 30, 'Vein sharpness'), fine: P.float(0.5, 0, 1, 'Fine veins'), seed: P.seed(12),
  },
  prepare: (p) => ({
    b: hexToLinear(p.base), v: hexToLinear(p.vein), t: hexToLinear(p.tint), a: hexToLinear(p.accent), p,
    turb: noiseField({ freq: 2, octaves: 7, gain: 0.55, seed: p.seed, mode: 'turbulence' }),
    turb2: noiseField({ freq: 4, octaves: 5, seed: p.seed + 3, mode: 'turbulence' }),
    cloud: noiseField({ freq: 3, octaves: 5, seed: p.seed + 9 }),
    web: noiseField({ freq: 6, octaves: 3, seed: p.seed + 21, mode: 'ridged' }),
  }),
  sample(u, v, out, ctx, s) {
    const p = s.p;
    const turb = s.turb(u, v);
    const t1 = Math.sin(TAU * (p.veins * (u + v) + p.turbulence * turb));
    const t2 = Math.sin(TAU * (p.veins * 3 * (u - v) + p.turbulence * 1.6 * s.turb2(u, v)));
    const a1 = 1 - Math.abs(t1);
    const core = Math.pow(a1, p.sharpness * 2.2), halo = Math.pow(a1, p.sharpness * 0.35);
    const m2 = Math.pow(1 - Math.abs(t2), p.sharpness * 3) * 0.3;
    const web = Math.pow(s.web(u, v), 18) * 0.35 * p.fine;
    const cloud = s.cloud(u, v);
    mix(out, s.b, s.t, smoothstep(0.45, 0.9, cloud) * 0.6);
    mix(out, out, s.a, halo * 0.35);
    mix(out, out, s.v, clamp01(core + m2 * p.fine * 2 + web));
    out[4] = 0.5 - 0.2 * clamp01(core + m2);
  },
};

// Granite -----------------------------------------------------------------------------------

const granite = {
  id: 'granite', name: 'Granite / speckled stone', category: 'organic', scale: 'grain',
  tags: ['stone', 'material', 'kitchen', 'interior', 'speckle', 'game'],
  description: 'Interlocking mineral grains (Voronoi crystals) in a weighted palette — feldspar, quartz, mica — with polished glints and slight clouding.',
  features: (p) => [p.grain, p.grain, 'grains'],
  params: {
    grain: P.int(48, 8, 256, 'Grains across'),
    colors: P.colors(['#c9c2b8', '#8c857c', '#3b3836', '#e9e4dc', '#a4704f'], 'Minerals (first = most common)'),
    contrast: P.float(1, 0.3, 2, 'Contrast'), glints: P.float(0.4, 0, 1, 'Mica glints'), seed: P.seed(23),
  },
  prepare: (p) => ({ c: lin(p.colors), p, cloud: noiseField({ freq: 3, octaves: 4, seed: p.seed + 2 }) }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.grain;
    worley(u, v, n, n, p.seed, 1, W, 0, 1);
    // weighted mineral pick: earlier palette entries are more common
    const r = (W.id >>> 8) / 16777216, k = Math.min(s.c.length - 1, Math.floor(Math.pow(r, 1.8) * s.c.length));
    const tone = 1 + ((W.id & 255) / 255 - 0.5) * 0.25 * p.contrast;
    shade(out, s.c[k], tone * (0.92 + 0.16 * s.cloud(u, v)));
    // tiny secondary grains inside big ones
    worley(u, v, n * 3, n * 3, p.seed + 1, 1, W, 0, 1);
    if ((W.id & 7) === 0) shade(out, s.c[(W.id >>> 3) % s.c.length], 0.95);
    // mica glints: rare, sharp bright flecks
    if (p.glints > 0 && (W.id & 63) < 2 && W.f1 < 0.3) { const g = p.glints * (1 - W.f1 / 0.3); out[0] += g; out[1] += g; out[2] += g * 0.95; }
    out[4] = 0.5 + 0.05 * (tone - 1);
  },
};

// Wood ----------------------------------------------------------------------------------------

/**
 * Flat-sawn wood grain inside one bounded board. along/across in board-width units (across 0..1).
 * The board cuts a log at a depth d that changes along the board, so growth rings show as
 * "cathedral" arches; rings wobble with noise; late-wood bands are darker; pores streak along the
 * grain; optional knots. Returns ramp position 0..1 and writes pores into woodOut.
 */
const woodOut = { pore: 0, knot: 0 };
function woodGrain(along, across, id, rings, wobble, knots, seed) {
  const h1 = hash01(id, 11, seed), h2 = hash01(id, 12, seed), h3 = hash01(id, 13, seed);
  const centre = 0.5 + (h1 - 0.5) * 3.0; // log axis position across the board (may lie outside: straight grain)
  const depth = 0.6 + h2 * 2.2, slope = (h3 - 0.5) * 0.45;
  const n1 = valueNoise(along * 0.9, id * 3.7, BIG, BIG, seed) * wobble;
  const n2 = valueNoise(along * 4, across * 3 + id, BIG, BIG, seed + 1) * wobble * 0.15;
  let x = across - centre + n1 * 0.12 + n2 * 0.05;
  let dz = depth + slope * along + 0.25 * Math.sin(along * 0.7 + h1 * 6);
  // knots: rings swirl around a point
  let knot = 0;
  if (knots > 0) {
    const kk = Math.floor(along / 3);
    if (hash01(id, kk, seed ^ 0x6b) < knots * 0.35) {
      const ky = kk * 3 + 0.6 + 1.8 * hash01(id, kk, seed ^ 0x6c), kx = 0.2 + 0.6 * hash01(kk, id, seed ^ 0x6d);
      const dx = (across - kx) * 1.6, dy = along - ky, dk = Math.hypot(dx, dy * 0.8);
      knot = Math.exp(-dk * dk * 18);
      x += dx * 0.6 * Math.exp(-dk * dk * 3) * Math.sign(dx || 1) * 0.3;
      dz -= Math.exp(-dk * dk * 4) * 0.8;
    }
  }
  const r = Math.sqrt(x * x * 2.5 + dz * dz) * rings * 0.6;
  const f = fract(r);
  // early wood -> late wood: gradual darkening, then a sharp boundary to next year's early wood
  const late = smoothstep(0.35, 0.92, f) * (1 - smoothstep(0.94, 1, f));
  woodOut.pore = valueNoise(across * 70, along * 2.5 + id * 5, BIG, BIG, seed + 5) * 0.5 + 0.5;
  woodOut.knot = knot;
  return clamp01(0.18 + late * 0.55 + knot * 0.6);
}

const wood = {
  id: 'wood', name: 'Wood planks / floorboards', category: 'organic', scale: 'planks',
  tags: ['graphics', 'floor', 'material', 'game', 'interior', 'oak', 'timber'],
  description: 'Flat-sawn boards with cathedral growth-ring arches, wobbling grain, pore streaks, optional knots; per-board tone, bevelled seams and staggered butt joints like a real floor.',
  features: (p) => [p.planks, p.planks, 'planks'],
  params: {
    planks: P.int(4, 1, 32, 'Planks across'), plankLength: P.int(2, 1, 12, 'Joints per tile height', 'Board ends per column; staggered between columns.'),
    rings: P.float(9, 1, 40, 'Ring density'), wobble: P.float(0.8, 0, 3, 'Grain wobble'), knots: P.float(0.2, 0, 1, 'Knots'),
    colors: P.colors(['#e1b382', '#c08552', '#8c5a3c'], 'Light, mid, dark', '', 3, 3),
    seam: P.float(0.004, 0, 0.02, 'Seam width (uv)'), variation: adv(P.float(0.5, 0, 1, 'Board tone variation')), seed: P.seed(21),
  },
  prepare: (p) => ({ c: lin(p.colors), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.planks, L = p.plankLength;
    const X = u * n, k = Math.floor(X), lx = X - k;
    const pk = mod(k, n);
    // staggered joints: each column's board ends are offset by a random fraction
    const off = hash01(pk, 0, p.seed);
    const Yb = v * L + off, seg = Math.floor(Yb), ly = Yb - seg;
    const id = pk * 131 + mod(seg, L) * 7 + 1;
    const boardLen = n / L; // board length in board widths
    const t = woodGrain(ly * boardLen, lx, id, p.rings, p.wobble, p.knots, p.seed);
    const pore = woodOut.pore;
    ramp(out, s.c, clamp01(t + (pore - 0.5) * 0.22 * (pore < 0.3 ? 2 : 1)));
    const tone = 1 + (hash01(id, 1, p.seed) - 0.5) * 0.3 * p.variation;
    shade(out, out, tone);
    let h = 0.6 - t * 0.2 - (pore < 0.25 ? 0.08 : 0);
    if (p.seam > 0) {
      const dSide = (Math.min(lx, 1 - lx) / n), dEnd = Math.min(ly, 1 - ly) / L;
      const d = Math.min(dSide, dEnd) - p.seam * 0.5;
      // bevel: a soft darkening right next to the seam
      shade(out, out, 0.82 + 0.18 * smoothstep(0, p.seam * 2.5, d + p.seam * 0.5));
      shade(_c, s.c[2], 0.3);
      mix(out, out, _c, coverage(d, ctx.px));
      if (d < 0) h = 0.1;
    }
    out[4] = clamp01(h);
  },
};

// Parquet -------------------------------------------------------------------------------------

const parquet = {
  id: 'parquet', name: 'Parquet (herringbone / chevron / basket)', category: 'organic', scale: 'repeats',
  tags: ['floor', 'material', 'interior', 'wood', 'herringbone', 'chevron'],
  description: 'Wooden parquet floors: herringbone (planks k:1 at right angles), chevron (mitred V columns), basket (square blocks of parallel slats) or straight staggered planks. Every plank gets its own grain and tone.',
  features: (p) => [p.repeats, p.repeats, 'repeats'],
  params: {
    layout: P.enumOf('herringbone', ['herringbone', 'chevron', 'basket', 'straight'], 'Layout'),
    repeats: P.int(2, 1, 16, 'Repeats'), ratio: P.int(4, 2, 8, 'Plank length : width'),
    rings: P.float(6, 1, 30, 'Ring density'), wobble: P.float(0.7, 0, 3, 'Grain wobble'),
    colors: P.colors(['#d9a86c', '#b07a45', '#7a4e2c'], 'Light, mid, dark', '', 3, 3),
    seam: P.float(0.06, 0, 0.3, 'Seam (plank-width units)'), variation: P.float(0.6, 0, 1, 'Plank tone variation'), seed: P.seed(27),
  },
  prepare: (p) => ({ c: lin(p.colors), p, k: p.ratio }),
  sample(u, v, out, ctx, s) {
    const p = s.p, k = s.k, R = p.repeats;
    let along = 0, across = 0, id = 0, len = k, wUnits = 1;
    if (p.layout === 'herringbone') {
      // planks k×1 (plank-width units); lattice (1,1) & (k,-k); square period 2k
      const T = 2 * k * R, x = u * T, y = v * T;
      const bb = Math.floor((x - y) / (2 * k));
      let found = false;
      for (let B = bb - 1; B <= bb + 1 && !found; B++) {
        const xs = x - B * k, ys = y + B * k;
        let t = Math.floor(ys);
        if (xs >= t && xs < t + k) { along = xs - t; across = ys - t; id = (mod(B, R) * 4096 + mod(t - k * B, 2 * k * R)) * 2; found = true; break; }
        t = Math.floor(xs) - k;
        if (ys >= t + 1 - k && ys < t + 1) { along = ys - (t + 1 - k); across = xs - (t + k); id = (mod(B, R) * 4096 + mod(t - k * B, 2 * k * R)) * 2 + 1; found = true; }
      }
      wUnits = T;
    } else if (p.layout === 'chevron') {
      // vertical columns of 45° planks, mitred where mirrored columns meet. A k×1 plank spans a
      // column of width k/√2; planks stack every √2 vertically (perpendicular width 1).
      const cols = 2 * R, wc = k / Math.SQRT2, Hp = cols * wc, perCol = cols * k / 2;
      const x = u * cols, c = Math.floor(x), lx = x - c, sgn = mod(c, 2) ? -1 : 1;
      const sc = (v * Hp - sgn * lx * wc) / Math.SQRT2, j = Math.floor(sc);
      along = lx * wc; len = wc; across = sc - j;
      id = mod(c, cols) * 977 + mod(j, perCol); wUnits = Hp;
    } else if (p.layout === 'basket') {
      // k×k blocks of k parallel slats, alternating direction like a checkerboard
      const B = 2 * R, x = u * B, y = v * B, bx = Math.floor(x), by = Math.floor(y);
      const fx = x - bx, fy = y - by, horiz = ((bx + by) & 1) === 0;
      const slat = Math.floor((horiz ? fy : fx) * k);
      along = (horiz ? fx : fy) * k; across = (horiz ? fy : fx) * k - slat;
      id = (mod(bx, B) * 64 + mod(by, B)) * 16 + slat; wUnits = B * k;
    } else {
      // straight boards with staggered ends
      const rows = 2 * k * R, y = v * rows, r = Math.floor(y), ly = y - r;
      const x = u * R * 2 + hash01(mod(r, rows), 3, p.seed) * 1, c = Math.floor(x), lx = x - c;
      along = lx * k; across = ly; id = mod(r, rows) * 997 + mod(c, R * 2); wUnits = rows;
    }
    const t = woodGrain(along, across, id + 1, p.rings, p.wobble, 0, p.seed);
    ramp(out, s.c, clamp01(t + (woodOut.pore - 0.5) * 0.2));
    shade(out, out, 1 + (hash01(id, 1, p.seed) - 0.5) * 0.35 * p.variation);
    // seams: distance to the plank border, in plank-width units -> uv for antialiasing
    const dA = Math.min(across, 1 - across), dL = Math.min(along, len - along);
    const d = Math.min(dA, dL) - p.seam * 0.5;
    shade(out, out, 0.85 + 0.15 * smoothstep(0, 0.25, d));
    shade(_c, s.c[2], 0.35);
    mix(out, out, _c, coverage(d / wUnits, ctx.px));
    out[4] = d < 0 ? 0.1 : clamp01(0.55 - t * 0.15 + 0.1 * smoothstep(0, 0.2, d));
  },
};

// Animal prints ------------------------------------------------------------------------------

const leopard = {
  id: 'leopard', name: 'Leopard / cheetah / jaguar', category: 'organic', scale: 'cells',
  tags: ['clothes', 'print', 'animal', 'fashion'],
  description: 'Rosettes: broken irregular rings around each feature point with a darker, warmer centre (leopard), larger rosettes with inner dots (jaguar) or solid spots (cheetah). Fur ground with soft tonal drift.',
  features: (p) => [p.cells, p.cells, 'rosettes'],
  params: {
    style: P.enumOf('leopard', ['leopard', 'jaguar', 'cheetah'], 'Style'),
    cells: P.int(6, 2, 48, 'Rosettes across'),
    colors: P.colors(['#d9a35b', '#b97834', '#1d140e'], 'Ground, centre, spot', '', 3, 3),
    irregularity: P.float(0.6, 0, 1, 'Irregularity'), seed: P.seed(13),
  },
  prepare: (p) => ({
    c: lin(p.colors), p,
    warp: warpField(0.02 + 0.03 * p.irregularity, 3, p.seed, 3),
    ground: noiseField({ freq: 3, octaves: 4, seed: p.seed + 4 }),
    fur: noiseField({ fx: 64, fy: 16, octaves: 2, seed: p.seed + 8, range: 'signed' }),
  }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.cells;
    s.warp(u, v, _w);
    const wu = _w[0], wv = _w[1];
    const g = s.ground(u, v);
    mix(out, s.c[0], s.c[1], g * 0.35);
    shade(out, out, 1 + 0.06 * s.fur(u, v) * detail(1 / 64, ctx.pixel));
    worley(wu, wv, n, n, p.seed, 0.85, W);
    const d = W.f1, ang = Math.atan2(W.dy, W.dx);
    const id = W.id;
    const h = (k) => ((id >>> (k * 4)) & 15) / 15;
    const shapeK = 1 + p.irregularity * (0.16 * Math.sin(3 * ang + h(0) * TAU) + 0.1 * Math.sin(5 * ang + h(1) * TAU));
    if (p.style === 'cheetah') {
      const r = (0.17 + 0.08 * h(2)) * shapeK;
      mix(out, out, s.c[2], coverage((d - r) / n, ctx.px));
      worley(wu, wv, n * 2, n * 2, p.seed + 1, 0.9, W);
      mix(out, out, s.c[2], coverage((W.f1 - (0.1 + (0.05 * ((W.id >>> 3) & 7)) / 7)) / (2 * n), ctx.px));
      return;
    }
    const jag = p.style === 'jaguar';
    const R = (jag ? 0.36 : 0.3) * (1 + 0.23 * h(2)) * shapeK, w = (jag ? 0.06 : 0.075) + 0.03 * h(3);
    if (d < R - w) mix(out, out, s.c[1], coverage((d - (R - w)) / n, ctx.px) * 0.85);
    const sectors = 4 + ((h(4) * 3) | 0);
    const sec = Math.floor(((ang / TAU + 0.5 + h(5)) % 1) * sectors);
    const gap = hash01(id & 0xffff, sec, p.seed) < 0.3 + 0.15 * p.irregularity;
    // break the ring with soft gaps, ring thickness swells per sector
    const ringD = Math.abs(d - R) - w * (gap ? 0.15 : 1) * (0.8 + 0.4 * hash01(sec, id & 0xff, p.seed));
    mix(out, out, s.c[2], coverage(ringD / n, ctx.px));
    if (jag) {
      // jaguar: one or two dots inside the rosette
      const dd = Math.hypot(W.dx + (h(6) - 0.5) * 0.12, W.dy + (h(7) - 0.5) * 0.12) - 0.05 - 0.03 * h(1);
      mix(out, out, s.c[2], coverage(dd / n, ctx.px));
    }
    worley(wu, wv, n * 3, n * 3, p.seed + 2, 0.9, W);
    if (d > R + w * 1.5) mix(out, out, s.c[2], coverage((W.f1 - 0.09) / (3 * n), ctx.px) * 0.9);
  },
};

const giraffe = {
  id: 'giraffe', name: 'Giraffe', category: 'organic', scale: 'cells',
  tags: ['clothes', 'print', 'animal'],
  description: 'Warped Voronoi patches with mottled interiors separated by a cream network of even width (exact Voronoi edge distance).',
  features: (p) => [p.cells, p.cells, 'patches'],
  params: {
    cells: P.int(5, 2, 48, 'Patches across'), border: P.float(0.12, 0.02, 0.5, 'Border width'),
    colors: P.colors(['#f1e3c6', '#8a4b1f', '#6e3a17', '#a35d2a'], 'Network, patch colours…', '', 2, 8),
    seed: P.seed(14),
  },
  prepare: (p) => ({ c: lin(p.colors), p, warp: warpField(0.035, 3, p.seed, 3), mott: noiseField({ freq: 8, octaves: 3, seed: p.seed + 2 }) }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.cells;
    s.warp(u, v, _w);
    voronoiEdge(_w[0], _w[1], n, n, p.seed, 0.9, W);
    const e = W.edge; // cell units
    const pc = s.c[1 + (W.id % (s.c.length - 1))];
    const mott = s.mott(u, v);
    // darker toward the patch edge, like real giraffe patches
    shade(_c, pc, (0.85 + 0.3 * mott) * (0.85 + 0.15 * smoothstep(0, 0.25, e)));
    mix(out, s.c[0], _c, coverage(-(e - p.border * 0.5) / n, ctx.px * 1.5));
  },
};

const zebra = {
  id: 'zebra', name: 'Zebra / tiger stripes', category: 'organic', scale: 'stripes',
  tags: ['clothes', 'print', 'animal'],
  description: 'Noise-displaced, thickness-modulated stripes that fork and taper; tiger style adds broken stripe ends over an orange-to-cream fur ground.',
  features: (p) => [p.stripes, p.stripes, 'stripes'],
  params: {
    style: P.enumOf('zebra', ['zebra', 'tiger'], 'Style'),
    stripes: P.int(9, 1, 64, 'Stripes'), warpAmount: P.float(0.6, 0, 2, 'Warp'),
    colors: P.colors(['#f5f2ea', '#141414'], 'Ground, stripe', '', 2, 2),
    tigerColor: adv(P.color('#e08a2e', 'Tiger fur colour')), seed: P.seed(15),
  },
  prepare: (p) => ({
    c: lin(p.colors), tc: hexToLinear(p.tigerColor), p,
    f1: noiseField({ freq: 2, octaves: 4, seed: p.seed, range: 'signed' }),
    f2: noiseField({ freq: 5, octaves: 3, seed: p.seed + 1, range: 'signed' }),
    brk: noiseField({ fx: 6, fy: 2, octaves: 3, seed: p.seed + 2 }),
    fork: noiseField({ fx: 4, fy: 8, octaves: 2, seed: p.seed + 6, mode: 'ridged' }),
    fur: noiseField({ freq: 2, octaves: 2, seed: p.seed + 5 }),
  }),
  sample(u, v, out, ctx, s) {
    const p = s.p;
    const t = v * p.stripes + p.warpAmount * s.f1(u, v) * 2 + 0.25 * Math.sin(TAU * 2 * u);
    const thick = 0.1 * s.f2(u, v);
    // forks: where the ridged field peaks, a thin light wedge splits the stripe
    const fork = Math.pow(s.fork(u, v), 6) * 0.9;
    let g = Math.cos(TAU * t) - thick * 4 - 0.05 - fork * (0.5 + 0.5 * Math.cos(TAU * t * 2));
    if (p.style === 'tiger') g -= smoothstep(0.55, 0.75, s.brk(u, v)) * 1.6;
    const d = g / (TAU * p.stripes * 1.2);
    shade(out, s.c[0]);
    if (p.style === 'tiger') { shade(out, s.tc); mix(out, out, s.c[0], smoothstep(0.55, 0.95, s.fur(u, v))); }
    mix(out, out, s.c[1], coverage(-d, ctx.px));
  },
};

// Snakeskin -----------------------------------------------------------------------------------

const snakeskin = {
  id: 'snakeskin', name: 'Snakeskin (python / croc)', category: 'organic', scale: 'cells',
  tags: ['clothes', 'print', 'animal', 'leather', 'fashion', 'reptile'],
  description: 'Python: overlapping diamond scales, each domed and edged, under large blotch markings. Croc: rows of glossy domed rectangular scales of varying width with deep creases.',
  features: (p) => [p.cells, p.cells, 'scales'],
  params: {
    style: P.enumOf('python', ['python', 'croc'], 'Style'),
    cells: P.int(20, 4, 96, 'Scales across'),
    colors: P.colors(['#cfc3a8', '#8d7c5e', '#3a2f22'], 'Light, mid, markings', '', 3, 3),
    markings: P.float(0.85, 0, 1, 'Markings'), gloss: P.float(0.4, 0, 1, 'Gloss'), seed: P.seed(29),
  },
  prepare: (p) => ({
    c: lin(p.colors), p, n: evenInt(p.cells),
    blot: noiseField({ freq: 3, octaves: 4, gain: 0.55, seed: p.seed }),
    warp: warpField(0.04, 2, p.seed + 1, 3),
  }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = s.n;
    let edge, dome, gx, gy, id, scU = u, scV = v;
    if (p.style === 'python') {
      // diamond lattice; each scale is a raised, rounded diamond that overlaps the one above it
      const A = u * n + v * n, B = u * n - v * n;
      const fa = fract(A), fb = fract(B);
      const da = Math.min(fa, 1 - fa), db = Math.min(fb, 1 - fb);
      edge = Math.min(da, db) * 0.7071; // distance to the scale border (cell units)
      const cx = fa - 0.5, cy = fb - 0.5;
      // pillow profile in diamond space, shifted so the lower (overlapping) edge is the highest
      dome = Math.sin(Math.PI * fa) * Math.sin(Math.PI * fb);
      const ga = Math.PI * Math.cos(Math.PI * fa) * Math.sin(Math.PI * fb), gb = Math.PI * Math.cos(Math.PI * fb) * Math.sin(Math.PI * fa);
      gx = (ga + gb) * 0.5; gy = (ga - gb) * 0.5 + 0.8;
      const ai = Math.floor(A), bi = Math.floor(B);
      id = hashU32(mod(ai, n), mod(bi - ai, 2 * n), p.seed); // invariant under the tile's lattice shifts
      scU = (ai + bi + 1) / (2 * n); scV = (ai - bi) / (2 * n); // scale centre (markings follow scales)
    } else {
      const rows = n, Y = v * rows, r = Math.floor(Y), fy = Y - r;
      const wr = mod(r, rows);
      const cols = Math.max(2, Math.round(n * (0.6 + 0.8 * hash01(wr, 1, p.seed)))); // row-specific scale width
      const X = u * cols + hash01(wr, 2, p.seed), c = Math.floor(X), fx = X - c;
      const ex = Math.min(fx, 1 - fx) * (rows / cols), ey = Math.min(fy, 1 - fy);
      // rounded-rectangle distance
      const rr = 0.18;
      const qx = Math.max(rr - ex, 0), qy = Math.max(rr - ey, 0);
      edge = Math.min(ex, ey) < rr ? rr - Math.hypot(qx, qy) : Math.min(ex, ey);
      dome = clamp01(Math.sin(Math.PI * fx) * Math.sin(Math.PI * fy) * 1.3);
      gx = Math.cos(Math.PI * fx) * 1.2; gy = Math.cos(Math.PI * fy) * 1.2;
      id = hashU32(mod(c, cols), wr, p.seed);
      scU = (c + 0.5 - hash01(wr, 2, p.seed)) / cols; scV = (r + 0.5) / rows;
    }
    s.warp(scU, scV, _w);
    const m = s.blot(_w[0], _w[1]) + ((id >>> 12) & 255) / 255 * 0.04 - 0.02;
    // markings (python): dark-rimmed blotches with mid-tone centres, plus small dark freckles —
    // evaluated once per scale, so marking edges follow the scale boundaries like real skin
    const ring = smoothstep(0.545, 0.555, m) * (1 - smoothstep(0.645, 0.655, m));
    const inner = smoothstep(0.64, 0.66, m);
    const mark = p.markings * Math.max(ring, smoothstep(0.345, 0.335, m) * 0.85);
    const tone = 0.88 + 0.24 * ((id & 255) / 255);
    mix(_c, s.c[0], s.c[1], clamp01(0.2 + inner * 0.8 * p.markings + (m - 0.5) * 0.4));
    mix(_c, _c, s.c[2], clamp01(mark));
    const lit = lambert(-gx * 0.22, -gy * 0.22);
    const nx = -gx * 0.22, ny = -gy * 0.22, inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
    const spec = p.gloss * Math.pow(Math.max(0, (nx * -0.25 + ny * -0.3 + 0.92) * inv), 20) * 0.6;
    shade(out, _c, tone * (0.5 + 0.5 * lit) * (0.8 + 0.2 * dome) + spec);
    // soft dark crease between scales
    shade(_d, _c, 0.45);
    mix(out, _d, out, smoothstep(0, 0.07, edge));
    out[4] = clamp01(0.2 + 0.6 * dome * smoothstep(0, 0.08, edge));
  },
};

// Camouflage ----------------------------------------------------------------------------------

const camo = {
  id: 'camouflage', name: 'Camouflage', category: 'organic', scale: 'scale',
  tags: ['clothes', 'military', 'streetwear', 'print'],
  description: 'Woodland (layered thresholded fbm blobs with slightly ragged edges), digital (same field quantised to a pixel grid) or tiger-stripe camo (horizontal brush strokes).',
  features: (p) => [p.scale, p.scale, 'blobs'],
  params: {
    style: P.enumOf('woodland', ['woodland', 'digital', 'tiger-stripe'], 'Style'),
    scale: P.int(3, 1, 16, 'Blob frequency'), pixels: P.int(64, 8, 256, 'Digital grid'),
    colors: P.colors(PALETTES.woodland, 'Base + layers', '', 2, 6),
    coverage: P.float(0.5, 0.2, 0.8, 'Layer coverage'), seed: P.seed(16),
  },
  prepare: (p) => {
    const fields = [];
    for (let i = 1; i < p.colors.length; i++) {
      fields.push(p.style === 'tiger-stripe'
        ? noiseField({ fx: p.scale, fy: p.scale * 4, octaves: 5, gain: 0.55, seed: subSeed(p.seed, i) })
        : noiseField({ freq: p.scale, octaves: 5, gain: 0.55, seed: subSeed(p.seed, i) }));
    }
    return { c: lin(p.colors), p, fields, rag: noiseField({ freq: p.scale * 16, octaves: 2, seed: p.seed + 99, range: 'signed' }) };
  },
  sample(u, v, out, ctx, s) {
    const p = s.p;
    if (p.style === 'digital') { u = (Math.floor(u * p.pixels) + 0.5) / p.pixels; v = (Math.floor(v * p.pixels) + 0.5) / p.pixels; }
    shade(out, s.c[0]);
    const rag = p.style === 'woodland' ? s.rag(u, v) * 0.03 : 0;
    for (let i = 1; i < s.c.length; i++) {
      // fbm is ~N(0.5, 0.15): stretch to ~[0,1] so 'coverage' maps roughly to area
      const f = 0.5 + (s.fields[i - 1](u, v) - 0.5) * 2.6 + rag;
      const thr = 1 - p.coverage + 0.07 * (i - 1);
      const a = p.style === 'digital' ? (f > thr ? 1 : 0) : smoothstep(thr - 0.006, thr + 0.006, f);
      mix(out, out, s.c[i], a);
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
        const na = a + (la - abb + feed * (1 - a));
        const nb = b + (0.5 * lb + abb - (kill + feed) * b);
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
  id: 'reaction-diffusion', name: 'Reaction–diffusion (Gray–Scott)', category: 'organic', scale: 'grid',
  tags: ['graphics', 'generative', 'biological', 'coral', 'print'],
  description: 'Turing patterns from the Gray–Scott model on a periodic grid (seamless by construction), sampled with smooth bicubic filtering. Presets: coral, mitosis, maze, spots, worms, holes. Cost ∝ grid² × iterations; results are cached.',
  features: (p) => [p.grid / 8, p.grid / 8, 'features'],
  params: {
    preset: P.enumOf('coral', Object.keys(RD_PRESETS).concat('custom'), 'Preset'),
    feed: adv(P.float(0.0545, 0.01, 0.1, 'Feed (custom)')), kill: adv(P.float(0.062, 0.04, 0.075, 'Kill (custom)')),
    grid: P.int(160, 48, 512, 'Simulation grid', 'Bigger = more, smaller features per tile (slower).'),
    iterations: adv(P.int(5000, 200, 30000, 'Iterations')),
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
    // Catmull-Rom bicubic over the 4×4 neighbourhood: smooth, no blocky texels, no smoothstep plateaus
    const wx = _wx, wy = _wy;
    crWeights(fx, wx); crWeights(fy, wy);
    let b = 0;
    for (let j = 0; j < 4; j++) {
      const row = mod(y0 - 1 + j, G) * G;
      let rs = 0;
      for (let i = 0; i < 4; i++) rs += B[row + mod(x0 - 1 + i, G)] * wx[i];
      b += rs * wy[j];
    }
    const t = smoothstep(0.1, 0.9, (b - lo) / (hi - lo + 1e-9));
    ramp(out, s.ramp, t);
    out[4] = t;
  },
};
const _wx = [0, 0, 0, 0], _wy = [0, 0, 0, 0];
function crWeights(t, w) {
  const t2 = t * t, t3 = t2 * t;
  w[0] = -0.5 * t3 + t2 - 0.5 * t; w[1] = 1.5 * t3 - 2.5 * t2 + 1; w[2] = -1.5 * t3 + 2 * t2 + 0.5 * t; w[3] = 0.5 * t3 - 0.5 * t2;
}

// Voronoi cells --------------------------------------------------------------------------------

const voronoi = {
  id: 'voronoi-cells', name: 'Voronoi cells (stained glass / cracked earth / cobblestone)', category: 'organic', scale: 'cells',
  tags: ['graphics', 'game', 'material', 'mosaic', 'stone'],
  description: 'Voronoi cells with EXACT border distance (even-width leading/grout/cracks). Stained glass with lead came and glass mottling, cracked earth with ragged cracks, domed cobblestones, or flat cells.',
  features: (p) => [p.cells, p.cells, 'cells'],
  params: {
    style: P.enumOf('stained-glass', ['stained-glass', 'cracked-earth', 'cobblestone', 'cells'], 'Style'),
    cells: P.int(8, 2, 96, 'Cells across'), jitter: P.float(1, 0, 1, 'Jitter'),
    edge: P.float(0.08, 0, 0.5, 'Edge width (cell units)'),
    colors: P.colors(PALETTES.candy, 'Cell colours'), edgeColor: P.color('#151515', 'Edge colour'),
    seed: P.seed(18),
  },
  prepare: (p) => ({
    c: lin(p.colors), e: hexToLinear(p.edgeColor), p,
    warp: warpField(0.012, 6, p.seed, 3),
    glass: noiseField({ freq: 16, octaves: 2, seed: p.seed + 11, range: 'signed' }),
    earth: noiseField({ freq: 12, octaves: 4, seed: p.seed + 3 }),
    crackW: noiseField({ freq: 20, octaves: 2, seed: p.seed + 7 }),
    cobble: noiseField({ freq: 32, octaves: 3, seed: p.seed + 5, range: 'signed' }),
  }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.cells;
    let wu = u, wv = v;
    if (p.style === 'cracked-earth') { s.warp(u, v, _w); wu = _w[0]; wv = _w[1]; }
    voronoiEdge(wu, wv, n, n, p.seed, p.jitter, W);
    const e = W.edge; // exact distance to the border, cell units
    const col = s.c[W.id % s.c.length];
    let w = p.edge * 0.5;
    if (p.style === 'stained-glass') {
      // light through glass: brighter in the middle, mottled
      shade(_c, col, 0.75 + 0.4 * smoothstep(0, 0.45, e) + 0.12 * s.glass(u + (W.id & 15) * 0.13, v));
    } else if (p.style === 'cracked-earth') {
      shade(_c, col, (0.85 + 0.3 * s.earth(u, v)) * (0.8 + 0.2 * smoothstep(0, 0.25, e)));
      w *= 0.5 + s.crackW(u, v);
    } else if (p.style === 'cobblestone') {
      const dome = Math.sqrt(clamp01((e - w) * 3.2));
      shade(_c, col, 0.45 + 0.55 * dome + 0.08 * s.cobble(u, v));
      out[4] = dome;
    } else shade(_c, col);
    if (p.style === 'stained-glass' && e < w * 1.6) {
      // lead came: a rounded metal strip
      const q = clamp01(e / w), prof = Math.sqrt(clamp01(1 - q * q));
      shade(_d, s.e, 0.7 + 0.8 * prof);
    } else shade(_d, s.e);
    mix(out, _d, _c, coverage(-(e - w) / n, ctx.px));
    if (p.style !== 'cobblestone') out[4] = e > w ? 0.7 : 0.2;
  },
};

// Leather ------------------------------------------------------------------------------------

const leather = {
  id: 'leather', name: 'Leather grain', category: 'organic', scale: 'cells',
  tags: ['clothes', 'material', 'bag', 'shoes', 'upholstery'],
  description: 'Pebbled full-grain leather: irregular rounded pebbles at two scales separated by fine creases, wandering wrinkles, pores, tonal mottling and a soft sheen, lit from the real height field. Pair output=normal for 3D.',
  features: (p) => [p.cells, p.cells, 'pebbles'],
  params: {
    color: P.color('#5a3522', 'Colour'), cells: P.int(40, 8, 160, 'Grain density'),
    crease: P.float(0.8, 0, 1, 'Crease depth'), wrinkles: P.float(0.5, 0, 1, 'Wrinkles'),
    sheen: P.float(0.3, 0, 1, 'Sheen'), seed: P.seed(19),
  },
  prepare: (p) => ({
    c: hexToLinear(p.color), p,
    warp: warpField(0.25 / p.cells, Math.max(2, Math.round(p.cells / 4)), p.seed + 3, 2),
    mott: noiseField({ freq: 4, octaves: 5, seed: p.seed + 1 }),
    wr: noiseField({ fx: 3, fy: 5, octaves: 4, seed: p.seed + 2, mode: 'ridged' }),
  }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.cells;
    s.warp(u, v, _w);
    // big pebbles: dome height from the distance to the cell border; its slope points from the
    // pebble's centre outwards (vector to the nearest feature point), so lighting is analytic
    worley(_w[0], _w[1], n, n, p.seed, 1, W, 0, 1);
    let e = W.f2 - W.f1, t = clamp01(e / 0.32);
    const big = t * t * (3 - 2 * t), dBig = (6 * t * (1 - t)) / 0.32;
    let inv = 1 / (Math.hypot(W.dx, W.dy) + 1e-6);
    let gx = -W.dx * inv * dBig * n, gy = -W.dy * inv * dBig * n;
    // small pebbles inside
    worley(_w[0], _w[1], n * 2, n * 2, p.seed + 7, 1, W, 0, 1);
    e = W.f2 - W.f1; t = clamp01(e / 0.3);
    const small = t * t * (3 - 2 * t), dSmall = (6 * t * (1 - t)) / 0.3;
    inv = 1 / (Math.hypot(W.dx, W.dy) + 1e-6);
    gx = gx * (0.7 + 0.3 * small) - W.dx * inv * dSmall * n * 2 * 0.3 * big;
    gy = gy * (0.7 + 0.3 * small) - W.dy * inv * dSmall * n * 2 * 0.3 * big;
    const wrink = Math.pow(s.wr(u, v), 10) * p.wrinkles;
    const h0 = big * (0.7 + 0.3 * small) * (1 - 0.35 * p.crease * (1 - small)) - wrink * 0.6;
    const k = (0.4 + p.crease * 1.6) / (n * 2) * 0.5;
    const nx = gx * k, ny = gy * k; // surface normal (x, y) components: outward slope faces away
    const lit = lambert(nx, ny);
    const mott = s.mott(u, v);
    const pore = (hash01(mod(Math.floor(u * n * 6), n * 6), mod(Math.floor(v * n * 6), n * 6), p.seed) < 0.04 ? 0.75 : 1);
    const ni = 1 / Math.sqrt(nx * nx + ny * ny + 1);
    const spec = p.sheen * Math.pow(Math.max(0, (nx * -0.25 + ny * -0.3 + 0.92) * ni), 30) * 0.5;
    shade(out, s.c, (0.62 + 0.45 * mott) * (0.35 + 0.7 * lit) * (0.6 + 0.4 * h0) * pore + spec);
    out[4] = clamp01(0.3 + 0.6 * h0);
  },
};

export default [noise, marble, granite, wood, parquet, leopard, giraffe, zebra, snakeskin, camo, reaction, voronoi, leather];
