// Knitted fabrics.
//
// A knit is a grid of stitches: W wales (columns) × R courses (rows). Real stitches are wider
// than tall (typical gauge ≈ 22 sts × 30 rows per 10 cm → ratio 1.36), so R = W × gauge,
// rounded to the pattern's row repeat. All geometry is in PHYSICAL units: one stitch is 1 wide
// and H = W / R tall.
//
// Every visible piece of yarn is an "element": a curved ellipse ("grain of rice") with a dome
// height profile, lit from the top-left:
//   knit 'k'  — the V: two fat legs leaning ±30°, meeting at the bottom. Each leg's lower end sits
//               in front of the head of the stitch below, its upper end tucks behind.
//   purl 'p'  — the back of a loop: a frown-shaped head bump (∩) centred on the stitch and a
//               smile-shaped sinker bump (∪) between stitches, offset by half a stitch.
// For each sample the elements of the 3×3 neighbouring stitches are tested and the highest one
// wins, so stitches interlock across cell borders exactly like the real loops.
// Purl stitches sit lower than knit ones and are shadowed beside knit columns (ribs pull in).
// Stitch patterns are grids of k/p; colourwork (Fair Isle / jacquard) is a digit chart indexing a
// palette. Cables are strands of 2-stitch-wide stockinette that follow S-curves between
// straight runs, with front/back depth and cast shadows, over a purl or seed-stitch ground.

import { P, adv } from '../core/params.js';
import { hexToLinear, shade, mix } from '../core/color.js';
import { hash01 } from '../core/hash.js';
import { clamp01, mod, lcm, TAU, smoothstep, detail } from '../core/math.js';
import { valueNoise } from '../core/noise.js';

// ---------- element evaluation ----------

/** Shared hit record (no allocation in the hot path). */
const hit = { z: -1, gx: 0, gy: 0, t: 0, a: 0, b: 0, elem: 0, r: 0, c: 0 };

/**
 * Test one curved ellipse element. (lx, ly) = sample in the element's cell frame (physical units).
 * (cx, cy) centre, (dx, dy) unit direction along the element, La/Lb half length / half width,
 * bend = banana curvature, bias = depth bias, tilt = extra depth along the element (+ = lower end in front).
 * Writes into `hit` when this element is the highest so far.
 */
function element(lx, ly, cx, cy, dx, dy, La, Lb, bend, bias, tilt, elem, r, c) {
  const px = lx - cx, py = ly - cy;
  const a = px * dx + py * dy;
  if (a > La || a < -La) return;
  const ta = a / La;
  let b = -px * dy + py * dx;
  b -= bend * (ta * ta - 0.35) * Lb;
  const tb = b / Lb;
  const e2 = ta * ta + tb * tb;
  if (e2 >= 1) return;
  const z0 = Math.sqrt(1 - e2);
  const z = z0 * (1 + tilt * ta) + bias;
  if (z <= hit.z) return;
  const zc = Math.max(z0, 0.22);
  const dza = -ta / (La * zc), dzb = -tb / (Lb * zc);
  hit.z = z; hit.gx = dza * dx - dzb * dy; hit.gy = dza * dy + dzb * dx;
  hit.t = ta; hit.a = a; hit.b = b; hit.elem = elem; hit.r = r; hit.c = c;
}

/** Knit V legs of the stitch whose cell origin is at (ox, oy) relative to the sample. */
function knitLegs(lx, ly, H, Lb, r, c, bias) {
  // left leg: top (0.04, 0) -> bottom (0.5, 1.42H): the V nests ~0.4 row into the V below, filling
  // the opening between its legs (lower ends are in front: tilt > 0). Right leg mirrored.
  const tx = 0.46, ty = 1.42 * H, len = Math.sqrt(tx * tx + ty * ty);
  const dx = tx / len, dy = ty / len, La = len * 0.55;
  if (lx > -0.32 && lx < 0.64) element(lx, ly, 0.27, 0.71 * H, dx, dy, La, Lb, 0.4, bias, 0.22, 1, r, c);
  if (lx > 0.36 && lx < 1.32) element(lx, ly, 0.73, 0.71 * H, -dx, dy, La, Lb, -0.4, bias, 0.22, 2, r, c);
}

/** Purl bumps: head (∩) on the stitch, sinker (∪) between this stitch and the next. */
function purlBumps(lx, ly, H, Lb, r, c, bias) {
  // the loop head arches up (∩), the sinker loop between stitches sags (∪): a wavy, pebbly row
  element(lx, ly, 0.5, 0.36 * H, 1, 0, 0.5, Lb * 1.15, 1.1, bias, 0, 3, r, c);
  element(lx, ly, 1.0, 0.84 * H, 1, 0, 0.48, Lb, -1.1, bias - 0.05, 0, 4, r, c);
}

/** Stitch-pattern library: { w, h, fn(row, col) -> 'k'|'p' } (w,h = repeat size). */
export const STITCHES = {
  stockinette: () => ({ w: 1, h: 1, fn: () => 'k' }),
  'reverse-stockinette': () => ({ w: 1, h: 1, fn: () => 'p' }),
  garter: () => ({ w: 1, h: 2, fn: (r) => (r & 1 ? 'p' : 'k') }),
  'rib-1x1': () => ({ w: 2, h: 1, fn: (r, c) => (c & 1 ? 'p' : 'k') }),
  'rib-2x2': () => ({ w: 4, h: 1, fn: (r, c) => (mod(c, 4) < 2 ? 'k' : 'p') }),
  'rib-3x1': () => ({ w: 4, h: 1, fn: (r, c) => (mod(c, 4) < 3 ? 'k' : 'p') }),
  seed: () => ({ w: 2, h: 2, fn: (r, c) => ((r + c) & 1 ? 'p' : 'k') }),
  moss: () => ({ w: 2, h: 4, fn: (r, c) => ((Math.floor(r / 2) + c) & 1 ? 'p' : 'k') }),
  basketweave: () => ({ w: 8, h: 8, fn: (r, c) => ((Math.floor(r / 4) + Math.floor(c / 4)) & 1 ? 'p' : 'k') }),
  'broken-rib': () => ({ w: 2, h: 2, fn: (r, c) => (r & 1 ? 'k' : c & 1 ? 'p' : 'k') }),
  welting: () => ({ w: 1, h: 8, fn: (r) => (mod(r, 8) < 4 ? 'k' : 'p') }),
  'diamond-brocade': () => ({ w: 8, h: 8, fn: (r, c) => (Math.abs(mod(c, 8) - 4) + Math.abs(mod(r, 8) - 4) === 4 ? 'p' : 'k') }),
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
  snowflake: '000010000/010010010/001010100/000111000/111101111/000111000/001010100/010010010/000010000/000000000',
  hearts: '0000000000/0110001100/1111011110/1111111110/0111111100/0011111000/0001110000/0000100000/0000000000/0000000000',
  trees: '0000100000/0001110000/0011111000/0001110000/0011111000/0111111100/0001110000/0011111000/0111111100/1111111110/0000200000/0000200000/0000000000',
  checks: '1100/1100/0011/0011',
  stripes: '0/0/0/1/1/2/2/2',
};

function parseChart(str) {
  const rows = String(str).split(/[\/\n]+/).map((r) => r.trim()).filter(Boolean).slice(0, 128);
  if (!rows.length) return { w: 1, h: 1, g: new Uint8Array(1) };
  const w = Math.min(128, Math.max(...rows.map((r) => r.length)));
  const g = new Uint8Array(w * rows.length);
  rows.forEach((row, y) => { for (let x = 0; x < w; x++) g[y * w + x] = Math.max(0, Math.min(9, parseInt(row[x] || '0', 10) || 0)); });
  return { w, h: rows.length, g };
}

const COMMON = {
  stitchesAcross: P.int(16, 2, 256, 'Stitches across tile', 'Higher = finer knit.'),
  gauge: adv(P.float(1.36, 0.6, 2.5, 'Rows per stitch width', 'Row/stitch gauge ratio (≈30 rows / 22 sts per 10 cm).')),
  yarnRadius: P.float(0.25, 0.14, 0.34, 'Yarn thickness', 'Thicker yarn closes the gaps between loops.'),
  irregularity: P.float(0.4, 0, 1, 'Irregularity', 'Stitch-to-stitch tone variation (hand-knit look).'),
  fuzz: adv(P.float(0.35, 0, 1, 'Fibre fuzz', 'Ply striations and hairiness of the yarn.')),
  seed: P.seed(3),
};

/** Shared state builder: rows rounded so stitch repeat AND chart repeat tile exactly. */
function knitState(p, stitch, chart, colors) {
  const L = lcm(stitch.w, chart.w);
  const W = Math.max(1, Math.round(p.stitchesAcross / L)) * L;
  const rowRep = lcm(stitch.h, chart.h);
  const R = Math.max(1, Math.round((W * p.gauge) / rowRep)) * rowRep;
  const kinds = new Uint8Array(stitch.w * stitch.h);
  for (let r = 0; r < stitch.h; r++) for (let c = 0; c < stitch.w; c++) kinds[r * stitch.w + c] = stitch.fn(r, c) === 'p' ? 1 : 0;
  const allK = kinds.every((k) => k === 0), allP = kinds.every((k) => k === 1);
  const s = { W, R, H: W / R, sw: stitch.w, sh: stitch.h, kinds, uniform: allK ? 1 : allP ? 2 : 0, chart, colors: colors.map(hexToLinear), p, Lb: 0.22 * (p.yarnRadius / 0.25) };
  s.bias = biasTable(s);
  return s;
}

const isPurl = (s, r, c) => s.kinds[mod(r, s.sh) * s.sw + mod(c, s.sw)] === 1;
const chartAt = (s, r, c) => s.chart.g[mod(r, s.chart.h) * s.chart.w + mod(c, s.chart.w)];

const _col = [0, 0, 0, 0], _avg = [0, 0, 0, 0];
const LX = -0.48, LY = -0.58, LZ = 0.66;

/** Brightness of the element in `hit` (diffuse wrap light + ply striations + ambient occlusion). */
function litYarn(s, fibreLod, seedY) {
  const nx = -hit.gx * 0.55, ny = -hit.gy * 0.55;
  const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
  const ndl = (nx * LX + ny * LY + LZ) * inv;
  const diffuse = Math.max(0, (ndl + 0.4) / (LZ + 0.4));
  let fib = 0;
  if (fibreLod > 0) {
    // plies twist around the yarn axis: diagonal stripes in the element frame + hairy noise
    const ph = hit.a * 7.5 + hit.b * 4.2;
    fib = (0.13 * Math.sin(TAU * ph) + 0.07 * valueNoise(ph * 3, hit.b * 9 + seedY, 1 << 20, 1 << 20, s.p.seed)) * fibreLod * (0.4 + s.p.fuzz);
  }
  const ao = 0.62 + 0.38 * Math.min(1, hit.z);
  return (0.4 + 0.6 * diffuse) * ao * (1 + fib);
}

/**
 * Depth bias of a stitch from its neighbours: knit beside purl COLUMNS stands out (ribs), purl
 * between knit ROWS stands out (garter ridges, welting).
 */
function depthBias(s, r, c) {
  const kl = isPurl(s, r, c - 1) ? 0 : 1, kr = isPurl(s, r, c + 1) ? 0 : 1;
  const ka = isPurl(s, r - 1, c) ? 0 : 1, kb = isPurl(s, r + 1, c) ? 0 : 1;
  if (isPurl(s, r, c)) return 0.08 + 0.16 * (ka + kb) * 0.5 - 0.12 * (kl + kr) * 0.5;
  return 0.16 + 0.08 * (2 - kl - kr) * 0.5 - 0.22 * (2 - ka - kb) * 0.5;
}

function biasTable(s) {
  const t = new Float64Array(s.sw * s.sh);
  for (let r = 0; r < s.sh; r++) for (let c = 0; c < s.sw; c++) t[r * s.sw + c] = depthBias(s, r, c);
  return t;
}

/** Evaluate the stitch field at (X, Y) = (stitches, rows), unwrapped. Leaves the winner in `hit`. */
function evalField(s, X, Y) {
  const c0 = Math.floor(X), r0 = Math.floor(Y), H = s.H, Lb = s.Lb;
  hit.z = -1;
  for (let dr = -2; dr <= 1; dr++) {
    const r = r0 + dr, ly = (Y - r) * H;
    if (ly < -0.75 * H || ly > 2.1 * H) continue;
    for (let dc = -1; dc <= 1; dc++) {
      const c = c0 + dc, lx = X - c;
      const bias = s.uniform ? (s.uniform === 1 ? 0.16 : 0.08) : s.bias[mod(r, s.sh) * s.sw + mod(c, s.sw)];
      if (isPurl(s, r, c)) purlBumps(lx, ly, H, Lb * 1.05, r, c, bias);
      else knitLegs(lx, ly, H, Lb, r, c, bias);
    }
  }
}

function knitSample(u, v, out, ctx, s) {
  const X = u * s.W, Y = v * s.R;
  const cellLod = detail(1 / s.W, ctx.pixel * 1.6);
  const fibreLod = detail(1 / (s.W * 7), ctx.pixel);
  evalField(s, X, Y);
  const p = s.p;
  let b, h, rr, cc;
  if (hit.z < 0) {
    // opening between loops: the yarn of the loops behind shows through, in shadow
    rr = Math.floor(Y); cc = Math.floor(X);
    b = 0.24 + 0.08 * Math.sin(TAU * (Y * 2 + X)); h = 0.04;
  } else {
    rr = hit.r; cc = hit.c;
    b = litYarn(s, fibreLod, mod(rr, s.R) * 13.7);
    if (hit.elem >= 3) {
      // purl: lower, and shadowed next to knit neighbours (ribs pull the purl columns back)
      const lx = X - cc;
      let occ = 1;
      if (!isPurl(s, rr, cc - 1)) occ *= 0.62 + 0.38 * smoothstep(0, 0.45, lx);
      if (!isPurl(s, rr, cc + 1)) occ *= 0.62 + 0.38 * smoothstep(0, 0.45, 1 - lx);
      b *= occ;
      h = 0.05 + 0.6 * Math.min(1, hit.z);
    } else h = 0.15 + 0.75 * Math.min(1, hit.z);
  }
  const wc = mod(cc, s.W), wr = mod(rr, s.R);
  const ci = chartAt(s, wr, wc);
  const col = s.colors[Math.min(ci, s.colors.length - 1)];
  const tone = 1 + (hash01(wc, wr, p.seed) - 0.5) * 0.22 * p.irregularity;
  shade(out, col, b * tone);
  if (cellLod < 1) {
    // too small to resolve loops: fade to the stitch's average look (no moiré)
    shade(_avg, s.colors[Math.min(chartAt(s, mod(Math.floor(Y), s.R), mod(Math.floor(X), s.W)), s.colors.length - 1)], 0.72 * tone);
    mix(out, _avg, out, cellLod);
    h = 0.5 + (h - 0.5) * cellLod;
  }
  out[4] = clamp01(h);
}

const knitBase = {
  id: 'knit', name: 'Knit stitches', category: 'knit', scale: 'stitchesAcross',
  tags: ['clothes', 'sweater', 'jersey', 'wool', 'rib', 'beanie'],
  description: 'Stockinette/jersey, garter, ribs, seed, moss, basketweave, welting, diamond brocade — interlocking V stitches and purl bumps with real depth (purl columns recede in ribs).',
  params: {
    ...COMMON,
    stitch: P.enumOf('stockinette', Object.keys(STITCHES), 'Stitch pattern'),
    color: P.color('#b23a48', 'Yarn colour'),
  },
  prepare: (p) => knitState(p, STITCHES[p.stitch](), parseChart('0'), [p.color]),
  sample: knitSample,
  features: (p, s) => [s.W, s.R, 'stitches'],
};

const fairIsle = {
  id: 'fair-isle', name: 'Fair Isle / jacquard knit', category: 'knit', scale: 'stitchesAcross',
  tags: ['clothes', 'sweater', 'nordic', 'christmas', 'colourwork', 'jacquard'],
  description: 'Stockinette colourwork from a chart: rows separated by "/", digits index the palette (0 = background). Built-in charts: bands, snowflake, hearts, trees, diamonds…',
  params: {
    ...COMMON, stitchesAcross: P.int(24, 2, 256, 'Stitches across tile'),
    chart: P.enumOf('fair-isle-band', Object.keys(CHARTS).concat('custom'), 'Chart'),
    customChart: P.string('0110/1001/1001/0110', 'Custom chart', 'Rows of digits separated by "/" (max 128×128).'),
    colors: P.colors(['#f1ebdd', '#9b1d20', '#1d3557', '#3a6b35'], 'Palette (0,1,2,3…)', '', 1, 10),
  },
  prepare: (p) => knitState(p, STITCHES.stockinette(), parseChart(p.chart === 'custom' ? p.customChart : CHARTS[p.chart]), p.colors),
  sample: knitSample,
  features: (p, s) => [s.W, s.R, 'stitches'],
};

// Cables ---------------------------------------------------------------------------------------
//
// Panel = [ground | cable | ground]. A rope cable has 2 strands (4 stitches) crossing every N
// rows, always in the same direction; a braid (plait) has 3 strands (6 stitches) crossing left
// pair / right pair alternately. Within each N-row block, a crossing pair swaps over the first
// `crossRows` rows along a smooth S-curve and runs straight for the rest.

const _strand = { x: 0, slope: 0, front: 0 };

/** Centre (stitches, panel-local) and slope (stitches/row) of strand slot k in block-local row t. */
function strandPath(kind, k, block, t, crossLen) {
  const q = clamp01(t / crossLen), s = q * q * (3 - 2 * q), ds = q > 0 && q < 1 ? (6 * q * (1 - q)) / crossLen : 0;
  if (kind === 'rope') {
    // slot 0 starts left (centre 1) and moves to 3; slot 1 moves 3 -> 1. Left-mover is in front.
    const from = k === 0 ? 1 : 3, to = k === 0 ? 3 : 1;
    _strand.x = from + (to - from) * s; _strand.slope = (to - from) * ds; _strand.front = k === 0 ? 1 : 0;
    return;
  }
  // braid: block even = left pair (1<->3) crosses, odd = right pair (3<->5); centre-mover in front
  const left = (block & 1) === 0;
  const a = left ? 1 : 3, b = left ? 3 : 5, still = left ? 5 : 1;
  if (k === 2) { _strand.x = still; _strand.slope = 0; _strand.front = 0; return; }
  const from = k === 0 ? a : b, to = k === 0 ? b : a;
  _strand.x = from + (to - from) * s; _strand.slope = (to - from) * ds;
  _strand.front = to === 3 ? 1 : 0;
}

const cable = {
  id: 'cable-knit', name: 'Cable knit (aran)', category: 'knit', scale: 'stitchesAcross',
  tags: ['clothes', 'sweater', 'aran', 'fisherman', 'wool', 'chunky'],
  description: 'Rope cables (2 strands) or braids (3 strands) of stockinette crossing every N rows, raised over a reverse-stockinette or seed-stitch ground, with depth shading and cast shadows.',
  params: {
    ...COMMON, stitchesAcross: P.int(24, 8, 256, 'Stitches across tile'), yarnRadius: P.float(0.27, 0.14, 0.34, 'Yarn thickness'),
    cable: P.enumOf('rope', ['rope', 'braid', 'mixed'], 'Cable type', 'mixed = rope and braid panels alternating (aran sweater).'),
    crossEvery: P.int(6, 4, 16, 'Rows between crossings'),
    purlBetween: P.int(2, 1, 6, 'Ground stitches each side'),
    ground: P.enumOf('reverse-stockinette', ['reverse-stockinette', 'seed'], 'Ground stitch'),
    color: P.color('#e8dcc4', 'Yarn colour'),
  },
  prepare: (p) => {
    const widthOf = (kind) => (kind === 'rope' ? 4 : 6) + 2 * p.purlBetween;
    const kinds = p.cable === 'mixed' ? ['rope', 'braid'] : [p.cable];
    const unit = kinds.reduce((a, k) => a + widthOf(k), 0);
    const W = Math.max(unit, Math.round(p.stitchesAcross / unit) * unit);
    const period = (p.cable === 'rope' ? 1 : 2) * p.crossEvery; // braid needs two blocks to repeat
    const R = Math.max(period, Math.round((W * p.gauge) / period) * period);
    // panel map: for each column in the unit, which panel and local x
    const panels = [];
    let x0 = 0;
    for (const k of kinds) { panels.push({ kind: k, x0, w: widthOf(k) }); x0 += widthOf(k); }
    const ground = p.ground === 'seed' ? STITCHES.seed() : STITCHES['reverse-stockinette']();
    const gk = new Uint8Array(ground.w * ground.h);
    for (let r = 0; r < ground.h; r++) for (let c = 0; c < ground.w; c++) gk[r * ground.w + c] = ground.fn(r, c) === 'p' ? 1 : 0;
    const st = {
      W, R, H: W / R, unit, panels, crossLen: Math.min(p.crossEvery * 0.6, 3.2), color: hexToLinear(p.color), p,
      sw: ground.w, sh: ground.h, kinds: gk, uniform: p.ground === 'seed' ? 0 : 2, Lb: 0.22 * (p.yarnRadius / 0.25),
    };
    st.bias = biasTable(st);
    return st;
  },
  features: (p, s) => [s.W, s.R, 'stitches'],
  sample(u, v, out, ctx, s) {
    const p = s.p, H = s.H;
    const X = u * s.W, Y = v * s.R;
    const cellLod = detail(1 / s.W, ctx.pixel * 1.6);
    const fibreLod = detail(1 / (s.W * 7), ctx.pixel);
    const ux = mod(X, s.unit);
    let panel = s.panels[0];
    for (const pn of s.panels) if (ux >= pn.x0 && ux < pn.x0 + pn.w) panel = pn;
    const local = ux - panel.x0 - p.purlBetween; // 0..cableWidth inside the cable
    const cw = panel.kind === 'rope' ? 4 : 6;
    const tone = 1 + (hash01(mod(Math.floor(X), s.W), mod(Math.floor(Y), s.R), p.seed) - 0.5) * 0.2 * p.irregularity;
    const block = Math.floor(Y / p.crossEvery), t = Y - block * p.crossEvery;
    const nStr = panel.kind === 'rope' ? 2 : 3;

    // find the strand under the sample (front strands win), and the distance to the nearest front-strand edge
    let best = -1, bestFront = -1, bestS = 0, bestX = 0, frontEdge = 9, anyEdge = 9;
    for (let k = 0; k < nStr; k++) {
      strandPath(panel.kind, k, block, t, s.crossLen);
      const slopePhys = _strand.slope / H;
      const norm = 1 / Math.sqrt(1 + slopePhys * slopePhys);
      const d = Math.abs(local - _strand.x) * norm; // perpendicular distance (stitches)
      const e = d - 0.98;
      if (e < anyEdge) anyEdge = e;
      if (_strand.front && e < frontEdge) frontEdge = e;
      if (e < 0 && (_strand.front > bestFront || (_strand.front === bestFront && d < Math.abs(bestS)))) {
        best = k; bestFront = _strand.front; bestS = (local - _strand.x) * norm; bestX = _strand.x;
      }
    }

    let b, h;
    if (best >= 0) {
      // stockinette running along the strand: 2 wales, sheared with the strand
      const sx = local - bestX + 1; // 0..2 across the strand
      hit.z = -1;
      const c0 = Math.floor(sx), r0 = Math.floor(Y);
      for (let dr = -2; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const c = c0 + dc;
        if (c < 0 || c > 1) continue;
        knitLegs(sx - c, (Y - (r0 + dr)) * H, H, s.Lb * 1.05, r0 + dr, c, 0);
      }
      const across = bestS / 0.98, cyl = Math.sqrt(clamp01(1 - across * across));
      if (hit.z < 0) { b = 0.2; } else b = litYarn(s, fibreLod, best * 31.7);
      // strand roundness lighting (light from the left) + shadow from a crossing front strand
      b *= 0.72 + 0.28 * cyl + 0.12 * -across;
      if (!bestFront) b *= 0.55 + 0.45 * smoothstep(0, 0.6, frontEdge);
      h = (bestFront ? 0.55 : 0.4) + 0.35 * cyl * (0.6 + 0.4 * Math.max(0, hit.z));
    } else {
      // ground: reverse stockinette / seed, recessed and shadowed beside the cable
      evalField(s, X, Y);
      if (hit.z < 0) { b = 0.16; h = 0.02; } else { b = litYarn(s, fibreLod, mod(Math.floor(Y), s.R) * 7.3); h = 0.05 + 0.3 * Math.min(1, hit.z); }
      if (local > -1.5 && local < cw + 1.5) b *= 0.55 + 0.45 * smoothstep(0, 0.9, anyEdge);
      b *= 0.9;
    }
    shade(out, s.color, b * tone);
    if (cellLod < 1) { shade(_avg, s.color, 0.72 * tone); mix(out, _avg, out, cellLod); h = 0.5 + (h - 0.5) * cellLod; }
    out[4] = clamp01(h);
  },
};

export default [knitBase, fairIsle, cable];
