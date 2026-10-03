// Textile surfaces & dye techniques that aren't plain weave/knit structures:
// corduroy, velvet, quilting, mesh/fishnet, sequins, cross-stitch, eyelet lace, shibori.

import { P, adv } from '../core/params.js';
import { hexToLinear, mix, shade, over } from '../core/color.js';
import { hash01, hash01x3, hashU32 } from '../core/hash.js';
import { clamp01, coverage, fract, mod, sdSegment, smoothstep, TAU, evenInt, detail, lambert } from '../core/math.js';
import { noiseField, valueNoise, warpField } from '../core/noise.js';

const lin = (a) => a.map(hexToLinear);
const _c = [0, 0, 0, 0], _d = [0, 0, 0, 0], _w = [0, 0];

// Corduroy ------------------------------------------------------------------------------------

const corduroy = {
  id: 'corduroy', name: 'Corduroy', category: 'textile', scale: 'wales',
  tags: ['clothes', 'trousers', 'jacket', 'retro', 'pile'],
  description: 'Rounded pile wales separated by grooves where the ground weave shows; fine vertical pile fibres with a velvety sheen on the wale shoulders. Wide wale ≈ 8, needlecord ≈ 24 per tile.',
  features: (p) => [p.wales, p.wales, 'wales'],
  params: {
    wales: P.int(12, 2, 128, 'Wales across'), groove: P.float(0.2, 0.04, 0.5, 'Groove width', 'Fraction of each wale that is groove.'),
    color: P.color('#8a5a2b', 'Colour'), pile: P.float(0.6, 0, 1, 'Pile texture'),
    sheen: adv(P.float(0.5, 0, 1, 'Sheen', 'Velvet highlight across each wale.')),
    wear: adv(P.float(0.2, 0, 1, 'Wear', 'Low-frequency crushing / fading of the pile.')), seed: P.seed(31),
  },
  prepare: (p) => ({ c: hexToLinear(p.color), p, nap: noiseField({ fx: 2, fy: 3, octaves: 4, seed: p.seed + 1 }) }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.wales;
    const fx = fract(u * n);
    const a = (Math.abs(fx - 0.5) * 2) / (1 - p.groove); // 0 centre … 1 wale edge
    const fibreLod = detail(1 / (n * 14), ctx.pixel);
    const wear = (s.nap(u, v) - 0.5) * p.wear;
    if (a < 1) {
      const prof = Math.sqrt(1 - a * a);
      // pile: tufts aligned with the wale (long in v), plus single fibre streaks
      const ty = Math.max(1, Math.round(n * 2.2)), sy = Math.max(1, Math.round(n * 0.8)); // integer frequencies keep it periodic
      const tuft = valueNoise(u * n * 14, v * ty, n * 14, ty, p.seed) * 0.5 + 0.5;
      const streak = valueNoise(u * n * 40, v * sy, n * 40, sy, p.seed + 3) * 0.5 + 0.5;
      const fib = ((tuft - 0.5) * 0.35 + (streak - 0.5) * 0.25) * p.pile * fibreLod;
      // velvet: pile fibres facing the light glow on one shoulder of the wale
      const side = (fx - 0.5) * 2;
      const shoulder = Math.exp(-((side + 0.45) ** 2) * 9) * p.sheen * 0.35;
      // visible at any size: wale-to-wale tone and long brushed streaks in the pile
      const wi = mod(Math.floor(u * n), n);
      const waleTone = (hash01(wi, 7, p.seed) - 0.5) * 0.12;
      const brush = valueNoise(u * n * 4, v * 6, n * 4, 6, p.seed + 9) * 0.1 * p.pile;
      const b = (0.45 + 0.55 * prof) * (1 + fib + waleTone + brush) * (1 + wear * 0.6) + shoulder * prof;
      shade(out, s.c, b);
      out[4] = 0.2 + 0.75 * prof * (0.85 + 0.15 * tuft) - wear * 0.2;
    } else {
      // groove: the ground weave, in shadow
      const weave = 0.85 + 0.15 * Math.sin(TAU * v * n * 12) * Math.sin(TAU * u * n * 12) * fibreLod;
      shade(out, s.c, 0.22 * weave);
      out[4] = 0.08;
    }
    // level of detail: wales thinner than ~2 px fade to their average tone (no moiré)
    const waleLod = detail(1 / n, ctx.pixel * 1.6);
    if (waleLod < 1) {
      shade(_c, s.c, 0.62 * (1 + wear * 0.6));
      mix(out, _c, out, waleLod);
      out[4] = 0.5 + (out[4] - 0.5) * waleLod;
    }
  },
};

// Velvet ----------------------------------------------------------------------------------------

const velvet = {
  id: 'velvet', name: 'Velvet / crushed velvet', category: 'textile', scale: 'scale',
  tags: ['clothes', 'evening', 'luxury', 'upholstery', 'pile', 'velour'],
  description: 'Dense short pile: smooth colour with soft shimmering highlights where the pile changes direction. Raise "crush" for crushed / panne velvet.',
  features: (p) => [p.scale, p.scale, 'crush patches'],
  params: {
    color: P.color('#5b1a3a', 'Colour'), scale: P.int(3, 1, 16, 'Crush scale', 'Number of crush patches across.'),
    crush: P.float(0.55, 0, 1, 'Crush', 'Strength of the light/dark patches.'),
    sheen: P.float(0.6, 0, 1, 'Sheen'), seed: P.seed(41),
  },
  prepare: (p) => ({
    c: hexToLinear(p.color), p,
    f1: noiseField({ freq: p.scale, octaves: 5, gain: 0.55, seed: p.seed }),
    f2: noiseField({ freq: p.scale * 2, octaves: 4, seed: p.seed + 7, mode: 'ridged' }),
    w: warpField(0.08, Math.max(1, p.scale), p.seed + 3, 3),
  }),
  sample(u, v, out, ctx, s) {
    const p = s.p;
    s.w(u, v, _w);
    const a = s.f1(_w[0], _w[1]), r = s.f2(_w[0], _w[1]);
    // pile direction relative to the light: dark where fibres point at the viewer, bright where they lie down
    const lie = clamp01(0.5 + (a - 0.5) * 3.2 * p.crush + (r - 0.35) * 0.9 * p.crush);
    const fibreLod = detail(1 / 400, ctx.pixel);
    const grain = (hash01(mod(Math.floor(u * 1024), 1024), mod(Math.floor(v * 1024), 1024), p.seed) - 0.5) * 0.12 * fibreLod;
    const b = 0.3 + 0.62 * lie + p.sheen * 1.1 * Math.pow(lie, 5) + grain;
    shade(out, s.c, b);
    out[4] = 0.5 + 0.12 * (lie - 0.5);
  },
};

// Quilting ------------------------------------------------------------------------------------

const quilted = {
  id: 'quilted', name: 'Quilted / padded / puffer', category: 'textile', scale: 'cells',
  tags: ['clothes', 'puffer', 'jacket', 'bag', 'luxury', 'down'],
  description: 'Puffy padded cells (diamond, square or puffer channels) with dashed stitch seams; lit from the top-left from the real height field, with a nylon or cotton surface.',
  features: (p) => [p.cells, p.cells, 'cells'],
  params: {
    layout: P.enumOf('diamond', ['diamond', 'square', 'channel'], 'Layout'),
    cells: P.int(4, 1, 32, 'Cells across'), puff: P.float(0.8, 0, 1, 'Puffiness'),
    color: P.color('#2c2c34', 'Fabric'), stitch: P.color('#9a9aa6', 'Stitch thread'),
    surface: P.enumOf('nylon', ['nylon', 'cotton', 'satin'], 'Surface', 'nylon = ripstop grid + sheen; satin = glossy; cotton = matte weave.'),
    dashes: P.int(9, 0, 40, 'Stitches per seam (0 = none)'),
  },
  prepare: (p) => ({ c: hexToLinear(p.color), st: hexToLinear(p.stitch), n: p.cells, p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = s.n;
    let A, B, g;
    if (p.layout === 'diamond') { A = u * n + v * n; B = u * n - v * n; g = Math.hypot(n, n); }
    else if (p.layout === 'square') { A = u * n; B = v * n; g = n; }
    else { A = v * n; B = 0.5; g = n; } // channels run horizontally like a puffer jacket
    const fa = fract(A), fb = fract(B);
    const chan = p.layout === 'channel';
    const sa = Math.sin(Math.PI * fa), sb = chan ? 1 : Math.sin(Math.PI * fb);
    const k = 0.45 + (1 - p.puff) * 1.4;
    const base = sa * sb;
    const h = Math.pow(base, k);
    // analytic gradient of h in (A, B), then to screen (u, v) directions
    const dbase_dA = Math.PI * Math.cos(Math.PI * fa) * sb, dbase_dB = chan ? 0 : Math.PI * Math.cos(Math.PI * fb) * sa;
    const dh = k * Math.pow(Math.max(base, 1e-3), k - 1);
    const hA = dh * dbase_dA, hB = dh * dbase_dB;
    let gx, gy;
    if (p.layout === 'diamond') { gx = (hA + hB) * 0.5; gy = (hA - hB) * 0.5; }
    else if (p.layout === 'square') { gx = hA; gy = hB; }
    else { gx = 0; gy = hA; }
    const relief = 0.22 * p.puff;
    const lit = lambert(-gx * relief, -gy * relief);
    // surface micro texture
    const lod = detail(1 / (n * 40), ctx.pixel);
    let micro = 0, spec = 0;
    if (p.surface === 'nylon') {
      const gx2 = fract(u * n * 36), gy2 = fract(v * n * 36);
      micro = (Math.min(gx2, 1 - gx2) < 0.08 || Math.min(gy2, 1 - gy2) < 0.08 ? 0.05 : 0) * lod;
      spec = 0.35;
    } else if (p.surface === 'satin') spec = 0.8;
    else micro = (valueNoise(u * n * 60, v * n * 60, n * 60, n * 60, 9) * 0.06) * lod;
    // soft specular band on the puff crests
    const nx = -gx * relief, ny = -gy * relief, inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
    const ndh = (nx * -0.25 + ny * -0.3 + 0.92) * inv;
    const sp = spec * Math.pow(Math.max(0, ndh), 24) * 0.6;
    const b = (0.35 + 0.65 * lit) * (0.55 + 0.45 * Math.pow(h, 0.3)) * (1 + micro) + sp;
    shade(out, s.c, b);
    out[4] = clamp01(h);
    if (p.dashes > 0) {
      const dSeamA = Math.min(fa, 1 - fa) / g, dSeamB = chan ? 1 : Math.min(fb, 1 - fb) / g;
      const onA = dSeamA < dSeamB;
      const along = onA ? B : A;
      const dash = fract(along * p.dashes);
      const w = 0.0035 * (4 / Math.max(1, n)) + 0.002;
      if (dash > 0.12 && dash < 0.78) {
        const d = Math.min(dSeamA, dSeamB);
        const t = clamp01((dash - 0.12) / 0.66);
        const capsule = Math.sqrt(clamp01(1 - (2 * t - 1) ** 2)); // thread stitch is plump in the middle
        const prof = Math.sqrt(clamp01(1 - (d / (w * 0.5)) ** 2));
        shade(_c, s.st, 0.55 + 0.45 * prof * capsule);
        mix(out, out, _c, coverage(d - w * 0.5 * (0.6 + 0.4 * capsule), ctx.px));
      }
    }
  },
};

// Mesh / fishnet --------------------------------------------------------------------------------

const mesh = {
  id: 'mesh', name: 'Mesh / fishnet / tulle', category: 'textile', scale: 'cells',
  tags: ['clothes', 'fishnet', 'sportswear', 'lace', 'net', 'transparent'],
  description: 'Open net of round, twisted yarn with knots at the crossings, casting a soft shadow on the backing. Set backing to "transparent" for a see-through net. Diamond fishnet, square net or hexagonal tulle.',
  features: (p) => [p.cells, p.cells, 'openings'],
  params: {
    layout: P.enumOf('diamond', ['diamond', 'square', 'hex'], 'Net shape'),
    cells: P.int(6, 2, 64, 'Openings across'), yarn: P.float(0.09, 0.02, 0.3, 'Yarn thickness (cell units)'),
    knots: P.float(0.5, 0, 1, 'Knot size'),
    color: P.color('#141414', 'Yarn'), backing: P.color('#e0b49a', 'Backing', 'Use "transparent" for a see-through net.'),
    shadow: adv(P.float(0.5, 0, 1, 'Shadow on backing')),
  },
  prepare: (p) => ({ c: hexToLinear(p.color), b: hexToLinear(p.backing), n: p.layout === 'hex' ? p.cells : p.cells, K: Math.max(1, Math.round(p.cells / Math.sqrt(3))), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p;
    const d = netDist(u, v, s), r = p.yarn * 0.5 * (1 + p.knots * 0.9 * netKnot), along = netAlong;
    const px = ctx.px * s.n;
    // backing with the net's shadow (offset down-right)
    shade(_d, s.b, 1);
    if (p.shadow > 0 && s.b[3] > 0) {
      const ds = netDist(u - 0.12 * p.yarn / s.n, v - 0.18 * p.yarn / s.n, s);
      _d[0] *= 1 - p.shadow * 0.45 * (1 - smoothstep(r * 0.6, r * 1.9, ds)); _d[1] *= 1 - p.shadow * 0.45 * (1 - smoothstep(r * 0.6, r * 1.9, ds)); _d[2] *= 1 - p.shadow * 0.45 * (1 - smoothstep(r * 0.6, r * 1.9, ds));
    }
    if (d < r + px) {
      const q = Math.min(1, d / r), prof = Math.sqrt(1 - q * q);
      const twist = 0.88 + 0.12 * Math.sin(TAU * (along * 5 + q * 1.5)) * detail(1 / (s.n * 5), ctx.pixel);
      shade(_c, s.c, (0.35 + 0.65 * prof) * twist + 0.25 * prof * prof * prof);
      mix(out, _d, _c, coverage((d - r) / s.n, ctx.px));
      out[4] = 0.4 + 0.6 * prof;
    } else {
      shade(out, _d, 1);
      out[4] = 0;
    }
  },
};
let netKnot = 0, netAlong = 0;
/** Distance (cell units) from (u, v) to the net yarn; sets netKnot (0..1 near crossings) and netAlong. */
function netDist(u, v, s) {
  const p = s.p, n = s.n;
  if (p.layout === 'hex') {
    const S3 = Math.sqrt(3);
    const X = u * n, Y = v * s.K * S3;
    const ax = mod(X, 1) - 0.5, ay = mod(Y, S3) - S3 / 2, bx = mod(X - 0.5, 1) - 0.5, by = mod(Y - S3 / 2, S3) - S3 / 2;
    const useA = ax * ax + ay * ay < bx * bx + by * by;
    const qx = useA ? ax : bx, qy = useA ? ay : by;
    const hx = Math.abs(qx), hy = Math.abs(qy);
    const dd = 0.5 - Math.max(hx, hx * 0.5 + hy * (S3 / 2));
    // corners of the hex are the knots
    const ang = Math.atan2(qy, qx);
    netKnot = Math.pow(Math.abs(Math.cos(ang * 3)), 6) * (1 - smoothstep(0, 0.2, dd));
    netAlong = ang / TAU * 6;
    return dd;
  }
  let A, B, scale;
  if (p.layout === 'diamond') { A = u * n + v * n; B = u * n - v * n; scale = 1 / Math.SQRT2; }
  else { A = u * n; B = v * n; scale = 1; }
  const da = Math.min(fract(A), 1 - fract(A)), db = Math.min(fract(B), 1 - fract(B));
  netKnot = (1 - smoothstep(0, 0.22, da)) * (1 - smoothstep(0, 0.22, db));
  netAlong = da < db ? B : A;
  return Math.min(da, db) * scale;
}

// Sequins ------------------------------------------------------------------------------------------

const sequins = {
  id: 'sequins', name: 'Sequins / paillettes', category: 'textile', scale: 'cells',
  tags: ['clothes', 'party', 'glitter', 'evening', 'metallic', 'disco'],
  description: 'Overlapping metallic discs in staggered rows, each tilted and slightly cupped so it mirrors a studio light differently; centre hole with thread, bevelled rim, shadows from the sequin above. Several colours = mixed sequins.',
  features: (p) => [p.cells, p.cells, 'sequins'],
  params: {
    cells: P.int(12, 2, 96, 'Sequins across'),
    colors: P.colors(['#c9a227'], 'Sequin colours (random mix)'),
    sparkle: P.float(0.6, 0, 1, 'Sparkle'), tilt: P.float(0.5, 0, 1, 'Tilt variation'),
    fabric: adv(P.color('#1a1a1a', 'Base fabric')), seed: P.seed(33),
  },
  prepare: (p) => ({ c: lin(p.colors), fab: hexToLinear(p.fabric), p, rows: evenInt(p.cells / 0.42) }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.cells, X = u * n, Y = v * n;
    const step = 0.42, R = 0.56, rows = s.rows;
    const j0 = Math.floor(Y / (step * n / (rows * step)));
    const h = _h3;
    const sy = n / (rows * step); // stretch so `rows` rows fit the tile exactly
    for (let j = j0 + 2; j >= j0 - 2; j--) {
      const off = mod(j, 2) * 0.5, i = Math.round(X - off);
      const dx = X - (i + off), dy = Y - j * step * sy, r = Math.hypot(dx, dy);
      if (r >= R) continue;
      const wi = mod(i, n), wj = mod(j, rows);
      hash01x3(wi, wj, p.seed, h);
      const base = s.c[hashU32(wi, wj, p.seed ^ 0x3c) % s.c.length];
      // surface normal: random tilt + slight cup (concave disc)
      const tx = (h[0] - 0.5) * 1.8 * p.tilt, ty = (h[1] - 0.5) * 1.8 * p.tilt - 0.15;
      const nx = tx - 0.35 * dx / R, ny = ty - 0.35 * dy / R;
      // studio environment: a soft key light top-left + a dim fill
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const key = Math.max(0, (nx * -0.45 + ny * -0.55 + 0.7) * inv);
      const env = 0.1 + 0.95 * Math.pow(key, 4) + 0.12 * h[2];
      const spark = p.sparkle * Math.pow(key, 40) * 2.2;
      shade(out, base, 0.25 + 1.1 * env);
      out[0] += spark * base[3]; out[1] += spark * base[3]; out[2] += spark * base[3];
      // rim bevel: bright on the lit side, dark on the far side
      const rim = smoothstep(R - 0.07, R - 0.015, r);
      const rimLit = (-dx - dy) / (r * 1.414 + 1e-6);
      shade(out, out, 1 + rim * 0.45 * rimLit - rim * 0.25);
      // shadow cast by the sequins of the next row (which overlap this one)
      let sh = 1;
      for (let jj = j + 1; jj <= j + 2; jj++) {
        const off2 = mod(jj, 2) * 0.5, i2 = Math.round(X - off2);
        const e = Math.hypot(X - (i2 + off2), Y - jj * step * sy) - R;
        sh = Math.min(sh, 0.55 + 0.45 * smoothstep(0, 0.12, e));
      }
      shade(out, out, sh);
      // centre hole: fabric + the holding stitch
      if (r < 0.05) {
        shade(_c, base, 0.35);
        mix(out, _c, out, smoothstep(0.035, 0.05, r) * 0.6 + 0.4);
      }
      out[4] = 0.55 + 0.35 * (1 - r / R) - 0.2 * (1 - sh);
      return;
    }
    shade(out, s.fab, 1);
    out[4] = 0;
  },
};
const _h3 = [0, 0, 0];

// Cross-stitch ---------------------------------------------------------------------------------

export const CROSS_CHARTS = {
  heart: '011000110/111101111/111111111/111111111/011111110/001111100/000111000/000010000/000000000',
  diamonds: '00011000/00111100/01122110/11222211/11222211/01122110/00111100/00011000',
  border: '1010101010/0101010101/0000000000/2222222222/2033003302/2033003302/2222222222/0000000000',
  flower: '000020000/000222000/002212200/022111220/002212200/000222000/000030000/003333300/000030000',
  strawberry: '0000330000/0003333000/0011331100/0111111110/0114111410/0111111110/0011411100/0001111000/0000110000/0000000000',
};

const crossStitch = {
  id: 'cross-stitch', name: 'Cross-stitch / embroidery', category: 'textile', scale: 'repeats',
  tags: ['clothes', 'embroidery', 'folk', 'craft', 'pixel-art'],
  description: 'Aida cloth with its woven blocks and holes; chart digits (1-9) are stitched as X crosses of two-strand twisted floss in palette colours, 0 = empty. Pixel-art friendly.',
  features: (p, s) => [s.N * p.repeats, s.N * p.repeats, 'stitches'],
  params: {
    chart: P.enumOf('heart', Object.keys(CROSS_CHARTS).concat('custom'), 'Chart'),
    customChart: P.string('0110/1111/0110', 'Custom chart', 'Rows of digits separated by "/" (0 = empty, max 64×64).'),
    repeats: P.int(3, 1, 32, 'Chart repeats'),
    fabric: P.color('#efe7d6', 'Aida'), colors: P.colors(['#b3202a', '#2f6d3a', '#1f3b73', '#d9a21b'], 'Thread palette (1,2,3…)'),
    seed: P.seed(35),
  },
  prepare: (p) => {
    const src = p.chart === 'custom' ? p.customChart : CROSS_CHARTS[p.chart];
    const rows = String(src).split(/[\/\n]+/).map((r) => r.trim()).filter(Boolean).slice(0, 64);
    const w = Math.min(64, Math.max(1, ...rows.map((r) => r.length))), h = Math.max(1, rows.length);
    const g = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => Math.min(9, parseInt((rows[y] || '')[x] || '0', 10) || 0)));
    const N = Math.max(w, h);
    return { g, w, h, N, fab: hexToLinear(p.fabric), c: lin(p.colors), p };
  },
  sample(u, v, out, ctx, s) {
    const p = s.p, cells = s.N * p.repeats;
    const X = u * cells, Y = v * cells, cx = Math.floor(X), cy = Math.floor(Y), fx = X - cx, fy = Y - cy;
    const lod = detail(1 / (cells * 4), ctx.pixel);
    // aida: each cell is a raised block of 4×4 threads, with holes at the cell corners
    const hole = Math.min(Math.hypot(fx, fy), Math.hypot(1 - fx, fy), Math.hypot(fx, 1 - fy), Math.hypot(1 - fx, 1 - fy));
    const block = Math.sin(Math.PI * fx) * Math.sin(Math.PI * fy);
    const threads = 1 + 0.07 * (Math.sin(TAU * fx * 4) * 0.5 + Math.sin(TAU * fy * 4) * 0.5) * lod;
    shade(out, s.fab, (0.8 + 0.2 * block) * threads * (hole < 0.13 ? 0.45 + 0.4 * smoothstep(0.05, 0.13, hole) : 1));
    out[4] = hole < 0.12 ? 0.15 : 0.35 + 0.15 * block;
    const gx = mod(cx, s.N), gy = mod(cy, s.N);
    const k = gx < s.w && gy < s.h ? s.g[gy][gx] : 0;
    if (!k) return;
    const col = s.c[(k - 1) % s.c.length];
    const r = 0.17;
    const d1 = sdSegment(fx, fy, 0.1, 0.1, 0.9, 0.9); // under leg "\"
    const d2 = sdSegment(fx, fy, 0.9, 0.1, 0.1, 0.9); // top leg "/"
    const top = d2 < r + 0.03, under = d1 < r + 0.03;
    if (!top && !under) {
      // soft shadow of the cross on the cloth
      const ds = Math.min(d1, d2) - r;
      shade(out, out, 0.75 + 0.25 * smoothstep(0, 0.12, ds));
      return;
    }
    const d = top ? d2 : d1;
    const q = clamp01(d / r), prof = Math.sqrt(1 - q * q);
    const along = top ? fx - (1 - fy) : fx - fy;
    const across = top ? (fx + fy - 1) / Math.SQRT2 : (fx - fy) / Math.SQRT2;
    // two strands of floss twisted together: a dividing groove + diagonal twist
    const strand = 0.82 + 0.18 * Math.abs(Math.sin(TAU * (along * 2.6 + across * 3)));
    const shadeK = (0.38 + 0.62 * prof) * (0.9 + 0.1 * strand * lod + (1 - lod) * 0.08) * (top ? 1 : 0.78) * (0.94 + 0.12 * hash01(mod(cx, cells), mod(cy, cells), p.seed));
    shade(_c, col, shadeK);
    mix(out, out, _c, coverage((d - r) / cells, ctx.px));
    out[4] = 0.55 + 0.4 * prof * (top ? 1 : 0.8);
  },
};

// Eyelet lace (broderie anglaise) --------------------------------------------------------------

const eyelet = {
  id: 'eyelet-lace', name: 'Eyelet lace (broderie anglaise)', category: 'textile', scale: 'cells',
  tags: ['clothes', 'lace', 'summer', 'blouse', 'cotton', 'transparent', 'embroidery'],
  description: 'Cotton lawn with satin-stitched eyelet flowers: petal and round holes with raised, radially stitched rims and tiny dot eyelets between. Set backing to "transparent" for real see-through holes.',
  features: (p) => [p.cells, p.cells, 'motifs'],
  params: {
    cells: P.int(4, 1, 24, 'Flowers across'),
    petals: P.int(6, 4, 9, 'Petals'),
    holeSize: P.float(0.5, 0.2, 1, 'Hole size'),
    color: P.color('#f7f5ef', 'Cloth & thread'), backing: P.color('#2a3550', 'Backing', 'What shows through the holes; "transparent" for see-through.'),
    dots: P.bool(true, 'Dot eyelets between flowers'), seed: P.seed(43),
  },
  prepare: (p) => ({ c: hexToLinear(p.color), b: hexToLinear(p.backing), n: evenInt(p.cells), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = s.n;
    const lod = detail(1 / (n * 60), ctx.pixel);
    // cloth: fine lawn weave
    const weave = 1 + 0.04 * Math.sin(TAU * u * n * 48) * Math.sin(TAU * v * n * 48) * lod;
    let best = 9, rimD = 9, radial = 0;
    // half-drop grid of flowers, check the 3×3 neighbourhood
    const X = u * n, Y = v * n, xi = Math.floor(X);
    for (let i = xi - 1; i <= xi + 1; i++) {
      const dropY = mod(i, 2) * 0.5;
      const yi = Math.floor(Y - dropY);
      for (let j = yi - 1; j <= yi + 1; j++) {
        const cx = i + 0.5, cy = j + 0.5 + dropY;
        const dx = X - cx, dy = Y - cy;
        const rr = Math.hypot(dx, dy);
        if (rr > 0.75) continue;
        const ang = Math.atan2(dy, dx);
        // centre hole
        const hs = p.holeSize;
        let d = rr - 0.07 * hs;
        let rad = ang;
        // petals: ellipses arranged around the centre
        const k = p.petals, sector = TAU / k;
        const a0 = Math.round(ang / sector) * sector;
        const ca = Math.cos(a0), sa = Math.sin(a0);
        const along = dx * ca + dy * sa - 0.24, acr = -dx * sa + dy * ca;
        const pl = 0.13 * (0.6 + 0.4 * hs), pw = 0.055 * (0.6 + 0.4 * hs) * (6 / k) ** 0.5;
        const dp = (Math.hypot(along / pl, acr / pw) - 1) * Math.min(pl, pw);
        if (dp < d) { d = dp; rad = Math.atan2(acr, along) ; }
        if (d < best) { best = d; radial = rad; }
      }
      if (p.dots) {
        // small round eyelets in the gaps (between flowers of the half-drop)
        for (let j = Math.floor(Y) - 1; j <= Math.floor(Y) + 1; j++) {
          const cx = i + 1, cy = j + 0.5 + mod(i, 2) * 0.5 + 0.25;
          const d = Math.hypot(X - cx, Y - cy) - 0.035 * (0.6 + 0.4 * p.holeSize);
          if (d < best) { best = d; radial = Math.atan2(Y - cy, X - cx); }
        }
      }
    }
    rimD = best;
    const rimW = 0.03;
    // cloth, with a soft shadow just outside each raised rim
    shade(out, s.c, 0.84 * weave * (0.86 + 0.14 * smoothstep(rimW, rimW * 2.2, rimD)));
    out[4] = 0.4;
    if (rimD < rimW * 1.2) {
      // satin-stitched rim: raised ring, stitches run radially (across the rim), lit from the top-left
      const t = clamp01(rimD / rimW);
      const prof = Math.sin(Math.PI * (0.5 + 0.5 * t)) ;
      const stitches = 0.92 + 0.08 * Math.sin(radial * 64) * lod;
      const slope = Math.cos(Math.PI * (0.5 + 0.5 * t)); // -1 outer edge … 0 crest
      const lit = 1 + 0.35 * slope * Math.cos(radial + 2.35);
      shade(_c, s.c, (0.92 + 0.12 * prof) * stitches * lit);
      mix(out, out, _c, coverage(rimD - rimW, ctx.px * n));
      out[4] = 0.4 + 0.5 * prof;
    }
    if (rimD < 0) {
      // hole: backing shows through (transparent backing = real hole)
      shade(_d, s.b, 1);
      const inner = smoothstep(0, -0.02, rimD); // shadow of the rim inside the hole
      _d[0] *= 0.7 + 0.3 * inner; _d[1] *= 0.7 + 0.3 * inner; _d[2] *= 0.7 + 0.3 * inner;
      mix(out, out, _d, coverage(rimD + 0.002, ctx.px * n));
      out[4] = 0;
    }
  },
};

// Shibori -------------------------------------------------------------------------------------

const shibori = {
  id: 'shibori', name: 'Shibori / tie-dye', category: 'textile', scale: 'cells',
  tags: ['clothes', 'indigo', 'tie-dye', 'japanese', 'boho', 'resist-dye'],
  description: 'Resist-dye looks on woven cotton: itajime (clamped shapes + fold lines), arashi (pole-wrapped diagonal storm lines), kumo (spider-web bound circles), tie-dye spiral. Dye wicks along the weave, so edges feather along warp and weft.',
  features: (p) => [p.cells, p.cells, 'repeats'],
  params: {
    style: P.enumOf('itajime', ['itajime', 'arashi', 'kumo', 'spiral'], 'Technique'),
    cells: P.int(3, 1, 32, 'Repeats'), shape: P.enumOf('square', ['square', 'circle', 'triangle'], 'Itajime shape'),
    bleed: P.float(0.5, 0, 1, 'Dye bleed'),
    colors: P.colors(['#1b2a4a', '#f2efe8'], 'Dye, cloth', '', 2, 2), seed: P.seed(37),
  },
  prepare: (p) => {
    const n = p.cells;
    return {
      c: lin(p.colors), p,
      nz: noiseField({ freq: 6, octaves: 5, seed: p.seed, range: 'signed' }),
      tone: noiseField({ freq: 3, octaves: 4, seed: p.seed + 9 }),
      streak: noiseField({ fx: 48 * n, fy: 2, octaves: 3, seed: p.seed + 1, range: 'signed' }),
    };
  },
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.cells;
    const nz = s.nz(u, v);
    // capillary wicking: high-frequency noise stretched along warp OR weft makes edges feather like real dye
    const lod = detail(1 / 300, ctx.pixel);
    const wick = (valueNoise(u * 320, v * 24, 320, 24, p.seed + 4) + valueNoise(u * 24, v * 320, 24, 320, p.seed + 5)) * 0.5 * lod;
    let white = 0;
    if (p.style === 'itajime') {
      const fx = fract(u * n) - 0.5, fy = fract(v * n) - 0.5;
      let d;
      if (p.shape === 'circle') d = Math.hypot(fx, fy) - 0.28;
      else if (p.shape === 'triangle') d = Math.max(Math.abs(fx) * 0.866 + fy * 0.5, -fy) - 0.17;
      else d = Math.max(Math.abs(fx), Math.abs(fy)) - 0.24;
      d += nz * 0.05 * (0.5 + p.bleed) + wick * 0.025 * (0.4 + p.bleed);
      white = 1 - smoothstep(-0.02, 0.03 + 0.09 * p.bleed, d);
      // accordion-fold lines: dye pools along the creases (darker), resisted just beside them
      const x2 = u * n * 2, y2 = v * n * 2;
      const fold = Math.min(Math.min(fract(x2), 1 - fract(x2)), Math.min(fract(y2), 1 - fract(y2)));
      const foldW = 0.03 + 0.05 * p.bleed;
      const gate = smoothstep(0.3, 0.8, s.tone(u + v, v)); // dye reaches the creases unevenly
      white = Math.max(white, (0.08 + 0.18 * gate) * (1 - smoothstep(0, foldW * (0.6 + gate), fold + nz * 0.03 + wick * 0.03)));
    } else if (p.style === 'arashi') {
      const a = u + v, b = u - v;
      const streak = s.streak(fract(a), fract(b));
      const t = fract(a * 6 * n + streak * 0.6 + nz * 0.3);
      white = smoothstep(0.86 - 0.12 * p.bleed, 0.97, Math.abs(t - 0.5) * 2 + wick * 0.05) * (0.35 + 0.65 * smoothstep(-0.25, 0.35, streak));
    } else if (p.style === 'kumo') {
      const fx = fract(u * n) - 0.5, fy = fract(v * n) - 0.5;
      const r = Math.hypot(fx, fy) * 2 + nz * 0.08, ang = Math.atan2(fy, fx);
      const rings = 0.5 + 0.5 * Math.cos(TAU * r * 4);
      const spokes = 0.5 + 0.5 * Math.cos(ang * 10 + nz * 6 + r * 3);
      white = clamp01(Math.pow(rings, 3) * 0.8 * (1 - r) * (0.6 + 0.4 * spokes) + Math.pow(spokes, 8) * (1 - r) * 0.7 + (1 - smoothstep(0.08, 0.2, r)));
      white = smoothstep(0.15, 0.5 + 0.4 * p.bleed, white + wick * 0.08);
    } else {
      // tie-dye spiral: twisted bundle bound with rubber bands -> spiral arms of resist
      const fx = fract(u * n) - 0.5, fy = fract(v * n) - 0.5;
      const r = Math.hypot(fx, fy), ang = Math.atan2(fy, fx);
      const arms = Math.cos(ang * 4 + r * 22 + nz * 2.5);
      white = smoothstep(0.55 - 0.25 * p.bleed, 0.95, arms + wick * 0.15) * smoothstep(0.02, 0.1, r) * (1 - smoothstep(0.45, 0.72, r) * 0.5);
    }
    const tone = 0.88 + 0.24 * s.tone(u, v);
    shade(_c, s.c[0], tone);
    mix(out, _c, s.c[1], clamp01(white));
    // the cloth's own weave shows faintly through everything
    const weave = 1 + 0.035 * Math.sin(TAU * u * 160) * Math.sin(TAU * v * 160) * lod;
    shade(out, out, weave);
  },
};

export default [corduroy, velvet, quilted, mesh, sequins, crossStitch, eyelet, shibori];
