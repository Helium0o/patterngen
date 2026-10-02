// Textile surfaces & dye techniques that aren't plain weave/knit structures:
// corduroy, quilting, mesh/fishnet, sequins, cross-stitch, shibori (itajime / arashi / kumo).

import { P } from '../core/params.js';
import { hexToLinear, mix3, set3 } from '../core/color.js';
import { hash01, hash01x3, hashU32 } from '../core/hash.js';
import { clamp01, coverage, fract, mod, sdSegment, smoothstep, TAU, evenInt } from '../core/math.js';
import { fbm, fbm01, valueNoise } from '../core/noise.js';

const lin = (a) => a.map(hexToLinear);
const _c = [0, 0, 0];

// Corduroy ------------------------------------------------------------------------------------

const corduroy = {
  id: 'corduroy', name: 'Corduroy', category: 'textile',
  tags: ['clothes', 'trousers', 'jacket', 'retro'],
  description: 'Raised pile wales separated by grooves; wale count = cord size (wide wale ≈ 8, needlecord ≈ 24 per tile).',
  params: {
    wales: P.int(12, 2, 128, 'Wales across'), groove: P.float(0.18, 0.02, 0.5, 'Groove width'),
    color: P.color('#8a5a2b', 'Colour'), pile: P.float(0.5, 0, 1, 'Pile texture'), seed: P.seed(31),
  },
  prepare: (p) => ({ c: hexToLinear(p.color), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.wales;
    const fx = fract(u * n);
    const a = Math.abs(fx - 0.5) * 2 / (1 - p.groove);
    const prof = a < 1 ? Math.sqrt(1 - a * a) : 0;
    const pile = valueNoise(u * n * 6, v * 220, n * 6, 220, p.seed) * 0.5 + 0.5;
    const nap = fbm01(u, v, { fx: 2, fy: 3, octaves: 3, seed: p.seed + 1 });
    const b = a < 1 ? (0.35 + 0.65 * prof) * (1 - p.pile * 0.25 + p.pile * 0.25 * pile) * (0.9 + 0.2 * nap) : 0.18;
    set3(out, s.c, b);
    out[3] = 0.15 + 0.8 * prof;
  },
};

// Quilting ------------------------------------------------------------------------------------

const quilted = {
  id: 'quilted', name: 'Quilted / padded', category: 'textile',
  tags: ['clothes', 'puffer', 'jacket', 'bag', 'luxury'],
  description: 'Puffy padded cells (diamond or square channel) with dashed stitch lines; lit from top-left, height map included.',
  params: {
    layout: P.enumOf('diamond', ['diamond', 'square', 'channel'], 'Layout'),
    cells: P.int(4, 1, 32, 'Cells across'), puff: P.float(0.8, 0, 1, 'Puffiness'),
    color: P.color('#2c2c34', 'Fabric'), stitch: P.color('#9a9aa6', 'Stitch thread'),
    dashes: P.int(9, 0, 40, 'Stitches per seam (0 = none)'),
  },
  prepare: (p) => ({ c: hexToLinear(p.color), st: hexToLinear(p.stitch), n: p.layout === 'diamond' ? Math.max(1, p.cells) : p.cells, p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = s.n;
    let A, B, g;
    if (p.layout === 'diamond') { A = u * n + v * n; B = u * n - v * n; g = Math.hypot(n, n); }
    else if (p.layout === 'square') { A = u * n; B = v * n; g = n; }
    else { A = u * n; B = 0.5; g = n; }
    const fa = fract(A), fb = fract(B);
    const sa = Math.sin(Math.PI * fa), sb = p.layout === 'channel' ? 1 : Math.sin(Math.PI * fb);
    const h = Math.pow(sa * sb, 0.6 + (1 - p.puff) * 1.5);
    // analytic slope -> Lambert shading from the top-left
    const dA = Math.cos(Math.PI * fa) * sb, dB = p.layout === 'channel' ? 0 : Math.cos(Math.PI * fb) * sa;
    let lx, ly;
    if (p.layout === 'diamond') { lx = dA + dB; ly = dA - dB; } else { lx = dA; ly = dB; }
    const light = clamp01(0.52 + 0.3 * p.puff * (lx + ly) * 0.5 + 0.28 * h); // light from top-left
    set3(out, s.c, light * (0.5 + 0.7 * Math.pow(h, 0.35)));
    out[3] = h;
    if (p.dashes > 0) {
      const dSeamA = Math.min(fa, 1 - fa) / g, dSeamB = p.layout === 'channel' ? 1 : Math.min(fb, 1 - fb) / g;
      const onA = dSeamA < dSeamB;
      const along = onA ? B : A;
      const dash = fract(along * p.dashes);
      const w = 0.006;
      if (dash > 0.15 && dash < 0.75) mix3(out, out, s.st, coverage(Math.min(dSeamA, dSeamB) - w * 0.5, ctx.px) * 0.9);
    }
  },
};

// Mesh / fishnet --------------------------------------------------------------------------------

const mesh = {
  id: 'mesh', name: 'Mesh / fishnet / tulle', category: 'textile',
  tags: ['clothes', 'fishnet', 'sportswear', 'lace', 'net'],
  description: 'Open net of round yarn over a backing colour (use backing = skin tone for fishnet, or alpha-key it). Diamond fishnet or hexagonal tulle.',
  params: {
    layout: P.enumOf('diamond', ['diamond', 'hex'], 'Net shape'),
    cells: P.int(6, 2, 64, 'Openings across'), yarn: P.float(0.09, 0.02, 0.3, 'Yarn thickness (cell units)'),
    color: P.color('#141414', 'Yarn'), backing: P.color('#e0b49a', 'Backing'),
  },
  prepare: (p) => ({ c: hexToLinear(p.color), b: hexToLinear(p.backing), n: p.cells, K: Math.max(1, Math.round(p.cells / Math.sqrt(3))), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = s.n;
    let d, g;
    if (p.layout === 'diamond') {
      const A = u * n + v * n, B = u * n - v * n;
      g = Math.hypot(n, n);
      d = Math.min(Math.min(fract(A), 1 - fract(A)), Math.min(fract(B), 1 - fract(B))) * (n / g); // cell units
    } else {
      const S3 = Math.sqrt(3);
      const X = u * n, Y = v * s.K * S3;
      const ax = mod(X, 1) - 0.5, ay = mod(Y, S3) - S3 / 2, bx = mod(X - 0.5, 1) - 0.5, by = mod(Y - S3 / 2, S3) - S3 / 2;
      const [qx, qy] = ax * ax + ay * ay < bx * bx + by * by ? [ax, ay] : [bx, by];
      const hx = Math.abs(qx), hy = Math.abs(qy);
      d = 0.5 - Math.max(hx, hx * 0.5 + hy * (S3 / 2));
    }
    const r = p.yarn * 0.5;
    if (d < r) {
      const prof = Math.sqrt(1 - (d / r) * (d / r));
      set3(_c, s.c, 0.4 + 0.6 * prof);
      mix3(out, s.b, _c, coverage((d - r) / n, ctx.px));
      out[3] = 0.4 + 0.6 * prof;
    } else {
      set3(out, s.b, 0.92 + 0.08 * clamp01((d - r) * 6)); // faint shadow next to the yarn
      out[3] = 0;
    }
  },
};

// Sequins ------------------------------------------------------------------------------------------

const sequins = {
  id: 'sequins', name: 'Sequins / paillettes', category: 'textile',
  tags: ['clothes', 'party', 'glitter', 'evening', 'metallic'],
  description: 'Overlapping discs in staggered rows, each tilted randomly so it catches light differently; centre hole and rim highlight.',
  params: {
    cells: P.int(12, 2, 96, 'Sequins across'), colors: P.colors(['#c9a227', '#e8d27a'], 'Shadow, highlight', '', 2, 2),
    sparkle: P.float(0.6, 0, 1, 'Sparkle'), seed: P.seed(33),
  },
  prepare: (p) => ({ c: lin(p.colors), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.cells, X = u * n, Y = v * n;
    const step = 0.5, R = 0.56, rows = Math.round(n / step);
    const j0 = Math.floor(Y / step);
    const h = [0, 0, 0];
    for (let j = j0 + 2; j >= j0 - 2; j--) {
      const off = mod(j, 2) * 0.5, i = Math.round(X - off);
      const dx = X - (i + off), dy = Y - j * step, r = Math.hypot(dx, dy);
      if (r < R) {
        hash01x3(mod(i, n), mod(j, rows), p.seed, h);
        // tilted disc: brightness from random normal vs. light + radial term
        const tilt = (h[0] - 0.5) * 2 * dx + (h[1] - 0.5) * 2 * dy;
        let b = clamp01(0.35 + 0.5 * h[2] + 0.6 * tilt);
        b = b + p.sparkle * Math.pow(b, 8) * 1.5;
        mix3(out, s.c[0], s.c[1], clamp01(b));
        set3(out, out, 0.55 + 0.75 * b);
        const rim = smoothstep(R - 0.06, R - 0.01, r);
        set3(out, out, 1 - 0.55 * rim);
        if (r < 0.07) set3(out, out, 0.25);
        out[3] = 0.6 + 0.3 * (1 - r / R);
        return;
      }
    }
    set3(out, s.c[0], 0.2);
  },
};

// Cross-stitch ---------------------------------------------------------------------------------

export const CROSS_CHARTS = {
  heart: '011000110/111101111/111111111/111111111/011111110/001111100/000111000/000010000/000000000',
  diamonds: '00011000/00111100/01122110/11222211/11222211/01122110/00111100/00011000',
  border: '1010101010/0101010101/0000000000/2222222222/2033003302/2033003302/2222222222/0000000000',
  flower: '000020000/000222000/002212200/022111220/002212200/000222000/000030000/003333300/000030000',
};

const crossStitch = {
  id: 'cross-stitch', name: 'Cross-stitch / embroidery', category: 'textile',
  tags: ['clothes', 'embroidery', 'folk', 'craft', 'pixel-art'],
  description: 'Aida cloth grid with holes; chart digits (1-9) are stitched as shaded X crosses in palette colours, 0 = empty. Pixel-art friendly.',
  params: {
    chart: P.enumOf('heart', Object.keys(CROSS_CHARTS).concat('custom'), 'Chart'),
    customChart: P.string('0110/1111/0110', 'Custom chart'),
    repeats: P.int(3, 1, 32, 'Chart repeats'),
    fabric: P.color('#efe7d6', 'Aida'), colors: P.colors(['#b3202a', '#2f6d3a', '#1f3b73', '#d9a21b'], 'Thread palette (1,2,3…)'),
    seed: P.seed(35),
  },
  prepare: (p) => {
    const src = p.chart === 'custom' ? p.customChart : CROSS_CHARTS[p.chart];
    const rows = String(src).split(/[\/\n]+/).map((r) => r.trim()).filter(Boolean);
    const w = Math.max(1, ...rows.map((r) => r.length)), h = Math.max(1, rows.length);
    const g = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => Math.min(9, parseInt((rows[y] || '')[x] || '0', 10) || 0)));
    const N = Math.max(w, h);
    return { g, w, h, N, fab: hexToLinear(p.fabric), c: lin(p.colors), p };
  },
  sample(u, v, out, ctx, s) {
    const p = s.p, cells = s.N * p.repeats;
    const X = u * cells, Y = v * cells, cx = Math.floor(X), cy = Math.floor(Y), fx = X - cx, fy = Y - cy;
    // aida: woven block with holes at the cell corners
    const hole = Math.min(Math.hypot(fx, fy), Math.hypot(1 - fx, fy), Math.hypot(fx, 1 - fy), Math.hypot(1 - fx, 1 - fy));
    const weaveTex = 0.94 + 0.06 * Math.sin(TAU * fx * 4) * Math.sin(TAU * fy * 4);
    set3(out, s.fab, weaveTex * (hole < 0.12 ? 0.55 : 1));
    out[3] = hole < 0.12 ? 0.2 : 0.45;
    const gx = mod(cx, s.N), gy = mod(cy, s.N);
    const k = gx < s.w && gy < s.h ? s.g[gy][gx] : 0;
    if (!k) return;
    const col = s.c[(k - 1) % s.c.length];
    const r = 0.17;
    const d1 = sdSegment(fx, fy, 0.12, 0.12, 0.88, 0.88); // under leg "\"
    const d2 = sdSegment(fx, fy, 0.88, 0.12, 0.12, 0.88); // top leg "/"
    const top = d2 < r, under = d1 < r;
    if (!top && !under) return;
    const d = top ? d2 : d1;
    const prof = Math.sqrt(clamp01(1 - (d / r) ** 2));
    const along = top ? fx - (1 - fy) : fx - fy;
    const ply = 0.85 + 0.15 * Math.sin(TAU * (along * 3 + d * 6));
    set3(_c, col, (0.4 + 0.6 * prof) * ply * (top ? 1 : 0.8) * (0.94 + 0.12 * hash01(mod(cx, cells), mod(cy, cells), p.seed)));
    mix3(out, out, _c, coverage((d - r) / cells, ctx.px));
    out[3] = 0.55 + 0.4 * prof * (top ? 1 : 0.8);
  },
};

// Shibori -------------------------------------------------------------------------------------

const shibori = {
  id: 'shibori', name: 'Shibori / tie-dye', category: 'textile',
  tags: ['clothes', 'indigo', 'tie-dye', 'japanese', 'boho'],
  description: 'Resist-dye looks: itajime (clamped shapes), arashi (pole-wrapped diagonal storm lines), kumo (spider-web bound circles). Dye bleed is fbm-driven.',
  params: {
    style: P.enumOf('itajime', ['itajime', 'arashi', 'kumo'], 'Technique'),
    cells: P.int(3, 1, 32, 'Repeats'), shape: P.enumOf('square', ['square', 'circle', 'triangle'], 'Itajime shape'),
    bleed: P.float(0.5, 0, 1, 'Dye bleed'),
    colors: P.colors(['#1b2a4a', '#f2efe8'], 'Dye, cloth', '', 2, 2), seed: P.seed(37),
  },
  prepare: (p) => ({ c: lin(p.colors), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.cells;
    const nz = fbm(u, v, { freq: 6, octaves: 5, seed: p.seed });
    let white = 0;
    if (p.style === 'itajime') {
      const fx = fract(u * n) - 0.5, fy = fract(v * n) - 0.5;
      let d;
      if (p.shape === 'circle') d = Math.hypot(fx, fy) - 0.28;
      else if (p.shape === 'triangle') d = Math.max(Math.abs(fx) * 0.866 + fy * 0.5, -fy) - 0.17;
      else d = Math.max(Math.abs(fx), Math.abs(fy)) - 0.24;
      d += nz * 0.05 * (0.5 + p.bleed);
      white = 1 - smoothstep(-0.02, 0.03 + 0.08 * p.bleed, d);
      // fold lines: the cloth was accordion-folded on half-cell lines, dye wicks along them
      const x2 = u * n * 2, y2 = v * n * 2;
      const fold = Math.min(Math.min(fract(x2), 1 - fract(x2)), Math.min(fract(y2), 1 - fract(y2)));
      white = Math.max(white, 0.2 * (1 - smoothstep(0, 0.03 + 0.05 * p.bleed, fold + nz * 0.02)));
    } else if (p.style === 'arashi') {
      const a = u + v, b = u - v;
      const streak = fbm(a, b, { fx: 48 * n, fy: 2, octaves: 3, seed: p.seed + 1 });
      const t = fract(a * 6 * n + streak * 0.6 + nz * 0.3);
      white = smoothstep(0.86 - 0.12 * p.bleed, 0.97, Math.abs(t - 0.5) * 2) * (0.35 + 0.65 * smoothstep(-0.25, 0.35, streak));
    } else {
      const fx = fract(u * n) - 0.5, fy = fract(v * n) - 0.5;
      const r = Math.hypot(fx, fy) * 2 + nz * 0.08, ang = Math.atan2(fy, fx);
      const rings = 0.5 + 0.5 * Math.cos(TAU * r * 4);
      const spokes = 0.5 + 0.5 * Math.cos(ang * 10 + nz * 6 + r * 3);
      white = clamp01(Math.pow(rings, 3) * 0.8 * (1 - r) * (0.6 + 0.4 * spokes) + Math.pow(spokes, 8) * (1 - r) * 0.7 + (1 - smoothstep(0.08, 0.2, r)));
      white = smoothstep(0.15, 0.5 + 0.4 * p.bleed, white);
    }
    const tone = 0.9 + 0.2 * fbm01(u, v, { freq: 3, octaves: 4, seed: p.seed + 9 });
    set3(_c, s.c[0], tone);
    mix3(out, _c, s.c[1], clamp01(white));
  },
};

export default [corduroy, quilted, mesh, sequins, crossStitch, shibori];
