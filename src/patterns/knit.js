// Knitted fabrics.
//
// A knit is a grid of stitches: W wales (columns) × R courses (rows). Real stitches are wider
// than tall (typical gauge ≈ 22 sts × 30 rows per 10 cm → ratio 1.36), so R = W × gauge,
// rounded to the pattern's row repeat. Each stitch cell is drawn analytically:
//   knit  'k' — the "V": two slanted yarn legs, shaded as round yarn
//   purl  'p' — a horizontal bump
// Stitch patterns are functions stitch(row, col) -> 'k' | 'p'. Colourwork (Fair Isle /
// jacquard) is a chart string of digits indexing a palette. Cables are drawn as two crossing
// knitted strands over reverse stockinette.

import { P } from '../core/params.js';
import { hexToLinear, set3 } from '../core/color.js';
import { hash01 } from '../core/hash.js';
import { clamp01, mod, lcm, TAU } from '../core/math.js';

const _seg = [0];

/** Distance from (x,y) to segment + param along it, inline for speed. */
function segDist(x, y, ax, ay, bx, by) {
  const pax = x - ax, pay = y - ay, bax = bx - ax, bay = by - ay;
  let h = (pax * bax + pay * bay) / (bax * bax + bay * bay);
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  _seg[0] = h;
  const dx = pax - bax * h, dy = pay - bay * h;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Shade a knit V at local cell coords (fx in [0,1), Y in physical units, cell height H).
 * Returns brightness (0 = gap) and writes height into res.h.
 */
function knitV(fx, Y, H, radius, res) {
  // Legs run from the top corners to the bottom centre, extending a little past the cell so
  // rows interlock. The upper part of the stitch below also pokes into this cell (handled by caller).
  const dl = segDist(fx, Y, 0.1, -0.22 * H, 0.47, 1.0 * H);
  const tl = _seg[0];
  const dr = segDist(fx, Y, 0.9, -0.22 * H, 0.53, 1.0 * H);
  const tr = _seg[0];
  const left = dl < dr;
  const d = left ? dl : dr, t = left ? tl : tr;
  // legs taper toward the bottom point
  const r = radius * (1.0 - 0.25 * t);
  if (d >= r) { res.h = 0; return 0; }
  const prof = Math.sqrt(1 - (d / r) * (d / r));
  const ply = 0.88 + 0.12 * Math.sin(TAU * (t * 2.5 + (left ? d : -d) * 3));
  res.h = prof;
  return (0.42 + 0.58 * prof) * ply * (left ? 1.0 : 0.93); // light from the left
}

function purlBump(fx, Y, H, res) {
  const cy = H * (0.5 - 0.14 * Math.sin(Math.PI * fx));
  const dy = (Y - cy) / (0.36 * H);
  const ex = Math.max(0, Math.abs(fx - 0.5) - 0.38) / 0.12;
  const d = Math.sqrt(dy * dy + ex * ex);
  if (d >= 1) { res.h = 0; return 0; }
  const prof = Math.sqrt(1 - d * d);
  res.h = prof * 0.9;
  return (0.4 + 0.6 * prof) * (0.9 + 0.1 * Math.cos(TAU * fx * 2));
}

/** Stitch-pattern library: returns { w, h, fn(row, col) -> 'k'|'p' } (w,h = repeat size). */
export const STITCHES = {
  stockinette: () => ({ w: 1, h: 1, fn: () => 'k' }),
  'reverse-stockinette': () => ({ w: 1, h: 1, fn: () => 'p' }),
  garter: () => ({ w: 1, h: 2, fn: (r) => (r & 1 ? 'p' : 'k') }),
  'rib-1x1': () => ({ w: 2, h: 1, fn: (r, c) => (c & 1 ? 'p' : 'k') }),
  'rib-2x2': () => ({ w: 4, h: 1, fn: (r, c) => (mod(c, 4) < 2 ? 'k' : 'p') }),
  seed: () => ({ w: 2, h: 2, fn: (r, c) => ((r + c) & 1 ? 'p' : 'k') }),
  moss: () => ({ w: 2, h: 4, fn: (r, c) => ((Math.floor(r / 2) + c) & 1 ? 'p' : 'k') }),
  basketweave: () => ({ w: 8, h: 8, fn: (r, c) => ((Math.floor(r / 4) + Math.floor(c / 4)) & 1 ? 'p' : 'k') }),
  'broken-rib': () => ({ w: 2, h: 2, fn: (r, c) => (r & 1 ? 'k' : c & 1 ? 'p' : 'k') }),
};

export const CHARTS = {
  none: '0',
  diamonds: '00011000/00111100/01100110/11000011/11000011/01100110/00111100/00011000',
  zigzag: '10000001/01000010/00100100/00011000',
  'fair-isle-band': [
    '00000000', '00011000', '00100100', '01000010', '00100100', '00011000', '00000000',
    '22222222', '20202020', '22222222', '00000000',
    '10000001', '01000010', '00100100', '00011000', '00000000', '33333333',
  ].join('/'),
  'snowflake': '000010000/010010010/001010100/000111000/111101111/000111000/001010100/010010010/000010000/000000000',
  checks: '1100/1100/0011/0011',
};

function parseChart(str) {
  const rows = String(str).split(/[\/\n]+/).map((r) => r.trim()).filter(Boolean);
  if (!rows.length) return { w: 1, h: 1, at: () => 0 };
  const w = Math.max(...rows.map((r) => r.length));
  const g = rows.map((r) => Array.from({ length: w }, (_, i) => Math.max(0, Math.min(9, parseInt(r[i] || '0', 10) || 0))));
  return { w, h: rows.length, at: (r, c) => g[mod(r, rows.length)][mod(c, w)] };
}

const COMMON = {
  stitchesAcross: P.int(16, 2, 256, 'Stitches across tile'),
  gauge: P.float(1.36, 0.6, 2.5, 'Rows per stitch width', 'Row/stitch gauge ratio (≈30 rows / 22 sts).'),
  yarnRadius: P.float(0.25, 0.1, 0.32, 'Yarn thickness'),
  irregularity: P.float(0.4, 0, 1, 'Irregularity'),
  seed: P.seed(3),
};

/** Shared state builder: rows rounded so stitch repeat AND chart repeat tile exactly. */
function knitState(p, stitch, chart, colors) {
  const L = lcm(stitch.w, chart.w);
  const W = Math.max(1, Math.round(p.stitchesAcross / L)) * L;
  const rowRep = lcm(stitch.h, chart.h);
  const R = Math.max(1, Math.round((W * p.gauge) / rowRep)) * rowRep;
  return { W, R, H: W / R, stitch, chart, colors: colors.map(hexToLinear), p };
}

const res = { h: 0 };

function knitSample(u, v, out, ctx, s) {
  const x = u * s.W, y = v * s.R;
  const c = Math.floor(x), r = Math.floor(y);
  const fx = x - c, fy = y - r;
  const H = s.H, Y = fy * H;
  const p = s.p;
  const kind = s.stitch.fn(mod(r, s.R), mod(c, s.W));
  let b, h, rr = r;
  if (kind === 'k') {
    b = knitV(fx, Y, H, p.yarnRadius, res); h = res.h;
    // the stitch below reaches up into this cell
    if (s.stitch.fn(mod(r + 1, s.R), mod(c, s.W)) === 'k') {
      const b2 = knitV(fx, Y + H, H, p.yarnRadius, res);
      if (res.h > h) { b = b2; h = res.h; rr = r + 1; }
    }
  } else {
    b = purlBump(fx, Y, H, res); h = res.h;
  }
  const ci = s.chart.at(mod(rr, s.R), c);
  const col = s.colors[Math.min(ci, s.colors.length - 1)];
  const tone = 1 + (hash01(mod(c, s.W), mod(rr, s.R), p.seed) - 0.5) * 0.22 * p.irregularity;
  if (b <= 0) { set3(out, col, 0.12); out[3] = 0.05; return; }
  set3(out, col, b * tone);
  out[3] = 0.1 + 0.85 * h;
}

const knitBase = {
  id: 'knit', name: 'Knit stitches', category: 'knit',
  tags: ['clothes', 'sweater', 'jersey', 'wool'],
  description: 'Stockinette/jersey, garter, ribs, seed, moss, basketweave — drawn as real V stitches and purl bumps.',
  params: {
    ...COMMON,
    stitch: P.enumOf('stockinette', Object.keys(STITCHES), 'Stitch pattern'),
    color: P.color('#b23a48', 'Yarn colour'),
  },
  prepare: (p) => knitState(p, STITCHES[p.stitch](), parseChart('0'), [p.color]),
  sample: knitSample,
};

const fairIsle = {
  id: 'fair-isle', name: 'Fair Isle / jacquard knit', category: 'knit',
  tags: ['clothes', 'sweater', 'nordic', 'christmas', 'colourwork'],
  description: 'Stockinette colourwork from a chart: rows separated by "/", digits index the palette (0 = background).',
  params: {
    ...COMMON, stitchesAcross: P.int(24, 2, 256, 'Stitches across tile'),
    chart: P.enumOf('fair-isle-band', Object.keys(CHARTS).concat('custom'), 'Chart'),
    customChart: P.string('0110/1001/1001/0110', 'Custom chart'),
    colors: P.colors(['#f1ebdd', '#9b1d20', '#1d3557', '#3a6b35'], 'Palette (0,1,2,3…)', '', 1, 10),
  },
  prepare: (p) => knitState(p, STITCHES.stockinette(), parseChart(p.chart === 'custom' ? p.customChart : CHARTS[p.chart]), p.colors),
  sample: knitSample,
};

// Cable ---------------------------------------------------------------------------------------

const cable = {
  id: 'cable-knit', name: 'Cable knit (aran)', category: 'knit',
  tags: ['clothes', 'sweater', 'aran', 'fisherman', 'wool'],
  description: 'Rope cables (2 strands × 2 stitches crossing every N rows) separated by purl columns.',
  params: {
    ...COMMON, stitchesAcross: P.int(24, 8, 256, 'Stitches across tile'),
    crossEvery: P.int(6, 3, 16, 'Rows between crossings'),
    purlBetween: P.int(2, 1, 6, 'Purl stitches each side'),
    color: P.color('#e8dcc4', 'Yarn colour'),
  },
  prepare: (p) => {
    const unit = 4 + 2 * p.purlBetween;
    const W = Math.max(unit, Math.round(p.stitchesAcross / unit) * unit);
    const period = 2 * p.crossEvery;
    const R = Math.max(period, Math.round((W * p.gauge) / period) * period);
    return { W, R, H: W / R, unit, period, color: hexToLinear(p.color), p };
  },
  sample(u, v, out, ctx, s) {
    const p = s.p;
    const x = u * s.W, y = v * s.R;
    const c = Math.floor(x), r = Math.floor(y);
    const H = s.H;
    const local = mod(x, s.unit) - p.purlBetween; // 0..4 inside the cable panel
    const tone = 1 + (hash01(mod(c, s.W), mod(r, s.R), p.seed) - 0.5) * 0.2 * p.irregularity;
    if (local >= 0 && local < 4) {
      // two strands: A centre goes 1 -> 3 -> 1 over one period, B mirrors it
      const ph = (TAU * mod(y, s.period)) / s.period;
      const xa = 2 - Math.cos(ph), xb = 4 - xa;
      const slope = (Math.sin(ph) * TAU / s.period) / H; // dx per physical y
      const norm = 1 / Math.sqrt(1 + slope * slope);
      const da = Math.abs(local - xa) * norm, db = Math.abs(local - xb) * norm;
      const aFront = Math.sin(ph) >= 0; // strand moving rightwards crosses in front
      const order = aFront ? [[da, xa], [db, xb]] : [[db, xb], [da, xa]];
      for (let k = 0; k < 2; k++) {
        const [d, xc] = order[k];
        if (d < 0.98) {
          // knitted V stitches running along the strand (2 wales wide)
          const sx = (local - xc) / 1.96 + 0.5; // 0..1 across strand
          const wx = sx * 2, wc = Math.floor(wx);
          const b = knitV(wx - wc, (y - r) * H, H, p.yarnRadius * 1.05, res);
          const b2 = knitV(wx - wc, (y - r) * H + H, H, p.yarnRadius * 1.05, res2);
          const bb = Math.max(b, b2), hh = Math.max(res.h, res2.h);
          const cyl = Math.sqrt(clamp01(1 - (d / 0.98) ** 2));
          const shadow = k === 1 ? 0.7 : 1; // back strand sits lower
          set3(out, s.color, (0.45 + 0.55 * bb) * (0.55 + 0.45 * cyl) * shadow * tone);
          out[3] = (k === 1 ? 0.45 : 0.6) + 0.4 * cyl * (0.5 + 0.5 * hh);
          return;
        }
      }
    }
    // reverse stockinette ground (purl), darker near the cable
    const b = purlBump(x - c, (y - r) * H, H, res);
    const near = local >= -0.6 && local < 4.6 ? 0.75 : 1;
    set3(out, s.color, (b > 0 ? b : 0.12) * 0.82 * near * tone);
    out[3] = 0.05 + 0.4 * res.h;
  },
};
const res2 = { h: 0 };

export default [knitBase, fairIsle, cable];
