// Geometric & print patterns: stripes, checks, dots, chevrons, argyle, hex, Truchet, seigaiha,
// ogee, Islamic star (Hankin), terrazzo, halftone, contours, bricks.
//
// Conventions:
//  * Every repeat count is an INTEGER (and EVEN where alternation needs it: checkers, half-drop,
//    brick, argyle) so the tile is exactly periodic.
//  * Edges are antialiased analytically from signed distances using ctx.px (subpixel size in uv),
//    so results are crisp at any resolution even with supersample=1.

import { P } from '../core/params.js';
import { hexToLinear, mix3, set3, ramp } from '../core/color.js';
import { hash01, hashU32, hash01x3 } from '../core/hash.js';
import { clamp01, coverage, evenInt, fract, mod, sdSegment, sdStar5, sdHeart, smoothstep, tri, SQRT3, TAU, gcd } from '../core/math.js';
import { fbm01, perlin } from '../core/noise.js';

const lin = (a) => a.map(hexToLinear);
const _c = [0, 0, 0], _d = [0, 0, 0];
const nums = (s, def = [1]) => {
  const m = String(s).match(/\d*\.?\d+/g);
  const a = m ? m.map(Number).filter((x) => x > 0 && Number.isFinite(x)) : [];
  return a.length ? a.slice(0, 64) : def;
};

/** Pick a colour band for periodic coordinate t∈[0,1) with cumulative edges, antialiased. */
function bandColor(out, t, edges, cols, aaT) {
  // edges: ascending cumulative fractions ending in 1; band k spans [edges[k-1], edges[k])
  let k = 0;
  while (k < edges.length - 1 && t >= edges[k]) k++;
  const start = k === 0 ? 0 : edges[k - 1], end = edges[k];
  const dS = t - start, dE = end - t;
  const L = cols.length;
  if (dS < dE) {
    const w = clamp01(0.5 + dS / aaT);
    return mix3(out, cols[mod(k - 1, L)], cols[k % L], w);
  }
  const w = clamp01(0.5 + dE / aaT);
  return mix3(out, cols[(k + 1) % L], cols[k % L], w);
}

// ---------------------------------------------------------------------------------------------

const DIRS = { horizontal: [0, 1], vertical: [1, 0], diagonal: [1, 1], 'anti-diagonal': [1, -1], 'shallow': [1, 2], 'steep': [2, 1] };

const stripes = {
  id: 'stripes', name: 'Stripes', category: 'geometric',
  tags: ['clothes', 'print', 'breton', 'pinstripe', 'awning', 'graphics'],
  description: 'Any number of coloured bands with relative widths, horizontal/vertical/diagonal. Pinstripe: widths "1 14". Breton: "1 1.4".',
  params: {
    colors: P.colors(['#1b2a49', '#f4f1ea'], 'Band colours (cycled)'),
    widths: P.string('1 1', 'Relative widths', 'Space-separated, one per band (cycled to match colours)'),
    direction: P.enumOf('horizontal', Object.keys(DIRS), 'Direction'),
    repeats: P.int(8, 1, 256, 'Repeats'),
  },
  prepare: (p) => {
    const w = nums(p.widths);
    const n = p.colors.length;
    const ws = Array.from({ length: Math.max(n, w.length) }, (_, i) => w[i % w.length]);
    const cols = Array.from({ length: ws.length }, (_, i) => hexToLinear(p.colors[i % n]));
    const total = ws.reduce((a, b) => a + b, 0);
    let acc = 0;
    const edges = ws.map((x) => (acc += x) / total);
    edges[edges.length - 1] = 1;
    const [a, b] = DIRS[p.direction];
    return { edges, cols, a: a * p.repeats, b: b * p.repeats };
  },
  sample(u, v, out, ctx, s) {
    const t = fract(s.a * u + s.b * v);
    bandColor(out, t, s.edges, s.cols, ctx.px * Math.hypot(s.a, s.b));
  },
};

const checker = {
  id: 'checkerboard', name: 'Checkerboard', category: 'geometric',
  tags: ['print', 'graphics', 'floor', 'racing'],
  description: 'Two-colour checks. Cell count is forced even so it tiles.',
  params: { cells: P.int(8, 2, 256, 'Cells across (even)'), colors: P.colors(['#111111', '#f2f2f2'], 'Colours', '', 2, 2) },
  prepare: (p) => ({ n: evenInt(p.cells), cols: lin(p.colors) }),
  sample(u, v, out, ctx, s) {
    const x = u * s.n, y = v * s.n;
    const sgn = (z) => (fract(z / 2) < 0.5 ? 1 : -1) * clamp01(Math.min(fract(z), 1 - fract(z)) / s.n / (ctx.px * 0.5));
    const k = 0.5 + 0.5 * sgn(x) * sgn(y);
    mix3(out, s.cols[1], s.cols[0], k);
  },
};

// Dots & tossed motifs --------------------------------------------------------------------------

function shapeSDF(shape, x, y, r) {
  switch (shape) {
    case 'ring': return Math.abs(Math.hypot(x, y) - r * 0.75) - r * 0.25;
    case 'square': return Math.max(Math.abs(x), Math.abs(y)) - r * 0.85;
    case 'diamond': return (Math.abs(x) + Math.abs(y) - r) * 0.7071;
    case 'cross': {
      const ax = Math.abs(x), ay = Math.abs(y), w = r * 0.3;
      return Math.min(Math.max(ax - r, ay - w), Math.max(ax - w, ay - r));
    }
    case 'star': return sdStar5(x, y, r, 0.45);
    case 'heart': return sdHeart(x / (r * 2), y / (r * 2)) * r * 2;
    default: return Math.hypot(x, y) - r;
  }
}

const dots = {
  id: 'dots', name: 'Polka dots & tossed motifs', category: 'geometric',
  tags: ['clothes', 'print', 'polka', 'confetti', 'graphics', 'kids'],
  description: 'Dots/stars/hearts/etc. in textile repeat layouts: block, half-drop, brick or tossed (random, non-overlapping).',
  params: {
    layout: P.enumOf('half-drop', ['block', 'half-drop', 'brick', 'tossed'], 'Repeat layout'),
    shape: P.enumOf('circle', ['circle', 'ring', 'square', 'diamond', 'cross', 'star', 'heart'], 'Motif'),
    cells: P.int(8, 2, 128, 'Cells across'),
    size: P.float(0.28, 0.05, 0.5, 'Motif radius (cell units)'),
    sizeJitter: P.float(0, 0, 1, 'Size variation'),
    rotate: P.bool(false, 'Random rotation'),
    background: P.color('#f6efe2', 'Background'),
    colors: P.colors(['#c1272d'], 'Motif colours (random pick)'),
    seed: P.seed(5),
  },
  prepare: (p) => ({ n: p.layout === 'block' || p.layout === 'tossed' ? p.cells : evenInt(p.cells), bg: hexToLinear(p.background), cols: lin(p.colors), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = s.n;
    const X = u * n, Y = v * n;
    const xi = Math.floor(X), yi = Math.floor(Y);
    let best = 1e9, bestCol = 0;
    const h = [0, 0, 0];
    for (let j = -2; j <= 2; j++) {
      for (let i = -1; i <= 1; i++) {
        const ci = xi + i, cj = yi + j, wi = mod(ci, n), wj = mod(cj, n);
        let cx = ci + 0.5, cy = cj + 0.5;
        if (p.layout === 'half-drop' && wi & 1) cy += 0.5;
        if (p.layout === 'brick' && wj & 1) cx += 0.5;
        hash01x3(wi, wj, p.seed, h);
        let r = p.size * (1 - p.sizeJitter * 0.6 * h[2]);
        if (p.layout === 'tossed') {
          const room = Math.max(0, 0.5 - r);
          cx += (h[0] - 0.5) * 2 * room; cy += (h[1] - 0.5) * 2 * room;
        }
        let dx = X - cx, dy = Y - cy;
        if (p.rotate) {
          const a = hash01(wi, wj, p.seed ^ 77) * TAU, ca = Math.cos(a), sa = Math.sin(a);
          [dx, dy] = [ca * dx + sa * dy, -sa * dx + ca * dy];
        }
        const d = shapeSDF(p.shape, dx, dy, r);
        if (d < best) { best = d; bestCol = hashU32(wi, wj, p.seed ^ 31) % s.cols.length; }
      }
    }
    mix3(out, s.bg, s.cols[bestCol], coverage(best / n, ctx.px));
  },
};

// Chevron ---------------------------------------------------------------------------------------

const chevron = {
  id: 'chevron', name: 'Chevron / zigzag', category: 'geometric',
  tags: ['clothes', 'print', 'missoni', 'graphics'],
  description: 'Zigzag bands. Band count is rounded to a multiple of the colour count so colours tile.',
  params: {
    colors: P.colors(['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'], 'Band colours'),
    bands: P.int(10, 1, 128, 'Bands (vertical)'), zigs: P.int(4, 1, 64, 'Zigzags across'),
    amplitude: P.float(1.5, 0, 8, 'Amplitude (bands)'),
  },
  prepare: (p) => {
    const L = p.colors.length;
    const n = Math.max(1, Math.round(p.bands / L)) * L;
    const edges = Array.from({ length: L }, (_, i) => (i + 1) / L);
    return { n, cols: lin(p.colors), edges, p };
  },
  sample(u, v, out, ctx, s) {
    const p = s.p, L = s.cols.length;
    const y = v * s.n + p.amplitude * tri(u * p.zigs);
    const grad = Math.hypot(s.n, 2 * p.amplitude * p.zigs) / L; // |∇t| in uv
    bandColor(out, fract(y / L), s.edges, s.cols, ctx.px * grad);
  },
};

// Argyle ----------------------------------------------------------------------------------------

const argyle = {
  id: 'argyle', name: 'Argyle', category: 'geometric',
  tags: ['clothes', 'knitwear', 'socks', 'golf', 'preppy'],
  description: 'Alternating diamonds on a ground with thin diagonal overcheck lines.',
  params: {
    cols: P.int(4, 2, 64, 'Diamonds across (even)'), rows: P.int(2, 2, 64, 'Diamond rows (even)'),
    colors: P.colors(['#5b2333', '#2e4057', '#c9b79c'], 'Diamond A, diamond B, ground', '', 3, 3),
    lineColor: P.color('#f2e8cf', 'Overcheck line'), lineWidth: P.float(0.012, 0, 0.05, 'Line width (uv)'),
  },
  prepare: (p) => ({ n: evenInt(p.cols), m: evenInt(p.rows), c: lin(p.colors), line: hexToLinear(p.lineColor), p }),
  sample(u, v, out, ctx, s) {
    const P_ = u * s.n + v * s.m, Q = u * s.n - v * s.m; // diamond lattice
    const fp = Math.floor(P_), fq = Math.floor(Q);
    const even = ((fp + fq) & 1) === 0;
    const col = even ? (mod(fp, 2) ? s.c[0] : s.c[1]) : s.c[2];
    // distance to nearest diamond edge (integer P or Q lines) for AA
    const g = Math.hypot(s.n, s.m);
    const dP = Math.min(fract(P_), 1 - fract(P_)) / g, dQ = Math.min(fract(Q), 1 - fract(Q)) / g;
    const dEdge = Math.min(dP, dQ);
    // neighbour colour across the nearest edge
    const nfp = dP < dQ ? (fract(P_) < 0.5 ? fp - 1 : fp + 1) : fp;
    const nfq = dP < dQ ? fq : fract(Q) < 0.5 ? fq - 1 : fq + 1;
    const nEven = ((nfp + nfq) & 1) === 0;
    const ncol = nEven ? (mod(nfp, 2) ? s.c[0] : s.c[1]) : s.c[2];
    mix3(out, ncol, col, clamp01(0.5 + dEdge / ctx.px));
    // overcheck lines through diamond centres
    if (s.p.lineWidth > 0) {
      const lp = Math.abs(fract(P_) - 0.5) / g, lq = Math.abs(fract(Q) - 0.5) / g;
      const dl = Math.min(lp, lq) - s.p.lineWidth * 0.5;
      mix3(out, out, s.line, coverage(dl, ctx.px));
    }
  },
};

// Honeycomb -------------------------------------------------------------------------------------

const honeycomb = {
  id: 'honeycomb', name: 'Hexagon / honeycomb', category: 'geometric',
  tags: ['graphics', 'tiles', 'sci-fi', 'mesh', 'print'],
  description: 'Pointy-top hex grid. Vertical rows are chosen so hexes are within a few % of regular on a square tile.',
  params: {
    cells: P.int(8, 1, 128, 'Hexes across'),
    style: P.enumOf('cells', ['cells', 'lines', 'bevel'], 'Style'),
    line: P.float(0.06, 0, 0.4, 'Line width (hex units)'),
    background: P.color('#1d1d24', 'Line / gap colour'),
    colors: P.colors(['#f2b134', '#f7c75e', '#e89f1f', '#fad681'], 'Cell colours (random)'),
    seed: P.seed(2),
  },
  prepare: (p) => ({ n: p.cells, K: Math.max(1, Math.round(p.cells / SQRT3)), bg: hexToLinear(p.background), cols: lin(p.colors), p }),
  sample(u, v, out, ctx, s) {
    const X = u * s.n, Y = v * s.K * SQRT3;
    const ax = mod(X, 1) - 0.5, ay = mod(Y, SQRT3) - SQRT3 / 2;
    const bx = mod(X - 0.5, 1) - 0.5, by = mod(Y - SQRT3 / 2, SQRT3) - SQRT3 / 2;
    let qx, qy, id0, id1;
    if (ax * ax + ay * ay < bx * bx + by * by) { qx = ax; qy = ay; id0 = mod(Math.floor(X), s.n); id1 = mod(Math.floor(Y / SQRT3), s.K) * 2; }
    else { qx = bx; qy = by; id0 = mod(Math.floor(X - 0.5), s.n); id1 = mod(Math.floor((Y - SQRT3 / 2) / SQRT3), s.K) * 2 + 1; }
    const hx = Math.abs(qx), hy = Math.abs(qy);
    const dh = Math.max(hx, hx * 0.5 + hy * (SQRT3 / 2)); // 0.5 at the edge
    const edge = (0.5 - dh) / s.n; // uv distance to edge (inside positive)
    const p = s.p;
    const col = s.cols[hashU32(id0, id1, p.seed) % s.cols.length];
    if (p.style === 'lines') {
      mix3(out, s.cols[0], s.bg, coverage(edge - p.line * 0.5 / s.n, ctx.px) );
      return;
    }
    let shade = 1;
    if (p.style === 'bevel') shade = 0.75 + 0.25 * clamp01((0.5 - dh) * 6) + 0.12 * (-qy / 0.5);
    set3(_c, col, shade);
    mix3(out, s.bg, _c, coverage(-(edge - p.line * 0.5 / s.n), ctx.px));
    out[3] = 0.5 + 0.5 * clamp01((0.5 - dh) * 4);
  },
};

// Truchet ---------------------------------------------------------------------------------------

const truchet = {
  id: 'truchet', name: 'Truchet tiles', category: 'geometric',
  tags: ['graphics', 'maze', 'generative', 'print'],
  description: 'Smith quarter-circle tiles (2-colourable: colour = inside ⊕ orientation ⊕ parity), 10-PRINT maze, or triangle tiles.',
  params: {
    variant: P.enumOf('arcs', ['arcs', 'maze', 'triangles'], 'Variant'),
    cells: P.int(10, 2, 128, 'Tiles across (even)'),
    fill: P.bool(true, 'Two-colour fill'), lineWidth: P.float(0.08, 0, 0.5, 'Line width (tile units)'),
    colors: P.colors(['#0f4c5c', '#f6e7cb', '#e36414'], 'Colour A, B, line', '', 3, 3),
    seed: P.seed(11),
  },
  prepare: (p) => ({ n: evenInt(p.cells), c: lin(p.colors), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = s.n;
    const X = u * n, Y = v * n, i = Math.floor(X), j = Math.floor(Y), fx = X - i, fy = Y - j;
    const o = hashU32(mod(i, n), mod(j, n), p.seed) >>> 31;
    const par = (i + j) & 1;
    let fillSide = 0, dLine = 1e9;
    if (p.variant === 'arcs') {
      const c0x = o ? 1 : 0, c1x = o ? 0 : 1;
      const l0 = Math.hypot(fx - c0x, fy), l1 = Math.hypot(fx - c1x, fy - 1);
      dLine = Math.min(Math.abs(l0 - 0.5), Math.abs(l1 - 0.5));
      const inside = l0 < 0.5 || l1 < 0.5 ? 1 : 0;
      fillSide = inside ^ o ^ par;
      // AA between fill regions happens at the arc itself (covered by the line or blended below)
      const dArc = Math.min(Math.abs(l0 - 0.5), Math.abs(l1 - 0.5)) / n;
      const a = s.c[fillSide], b = s.c[fillSide ^ 1];
      if (p.fill) mix3(out, b, a, clamp01(0.5 + dArc / ctx.px));
      else set3(out, s.c[1]);
    } else if (p.variant === 'maze') {
      dLine = o ? Math.abs(fx - fy) / Math.SQRT2 : Math.abs(fx + fy - 1) / Math.SQRT2;
      set3(out, s.c[1]);
    } else {
      const sd = (o ? fx - fy : fx + fy - 1) / Math.SQRT2;
      fillSide = (sd > 0 ? 1 : 0) ^ par;
      mix3(out, s.c[fillSide ^ 1], s.c[fillSide], clamp01(0.5 + Math.abs(sd) / n / ctx.px));
      dLine = 1e9;
    }
    if (p.lineWidth > 0 && dLine < 1e8) mix3(out, out, s.c[2], coverage((dLine - p.lineWidth * 0.5) / n, ctx.px));
  },
};

// Seigaiha / fish scales ------------------------------------------------------------------------

const scales = {
  id: 'seigaiha', name: 'Seigaiha / scales', category: 'geometric',
  tags: ['print', 'japanese', 'kimono', 'waves', 'mermaid', 'clothes'],
  description: 'Overlapping concentric half-circles (Japanese wave). Rings alternate through the palette.',
  params: {
    cells: P.int(6, 1, 64, 'Scales across'), rings: P.int(4, 1, 12, 'Rings per scale'),
    colors: P.colors(['#1d3557', '#f1faee', '#457b9d', '#f1faee'], 'Ring colours (outer → inner)'),
    outline: P.float(0.03, 0, 0.2, 'Outline (scale units)'), outlineColor: P.color('#1d3557', 'Outline colour'),
  },
  prepare: (p) => ({ n: p.cells, cols: lin(p.colors), line: hexToLinear(p.outlineColor), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = s.n, X = u * n, Y = v * n;
    const j0 = Math.floor(Y / 0.25);
    for (let j = j0 + 3; j >= j0 - 2; j--) {
      const off = (mod(j, 2)) * 0.5;
      const i = Math.round(X - off);
      const dx = X - (i + off), dy = Y - j * 0.25;
      const r = Math.hypot(dx, dy);
      if (r < 0.5) {
        const t = (r / 0.5) * p.rings;
        const k = Math.min(p.rings - 1, Math.floor(p.rings - t));
        const c = s.cols[k % s.cols.length];
        set3(out, c);
        const dRing = Math.min(fract(t), 1 - fract(t)) * 0.5 / p.rings / n;
        const dOuter = (0.5 - r) / n;
        const dl = Math.min(dRing, dOuter) - p.outline * 0.5 / n;
        if (p.outline > 0) mix3(out, out, s.line, coverage(dl, ctx.px));
        return;
      }
    }
    set3(out, s.cols[0]);
  },
};

// Ogee ------------------------------------------------------------------------------------------

const ogee = {
  id: 'ogee', name: 'Ogee lattice', category: 'geometric',
  tags: ['print', 'damask', 'wallpaper', 'moroccan', 'clothes'],
  description: 'Interlocking onion shapes. Exact two-family tiling because sin²(πy) + sin²(π(y+½)) = 1.',
  params: {
    cols: P.int(4, 1, 64, 'Shapes across'), rows: P.int(3, 1, 64, 'Shapes down'),
    colors: P.colors(['#e9d8a6', '#94d2bd'], 'Family A, family B', '', 2, 2),
    line: P.float(0.03, 0, 0.2, 'Outline (cell units)'), lineColor: P.color('#005f73', 'Outline'),
    inset: P.float(0.12, 0, 0.4, 'Inner outline inset (0 = off)'),
  },
  prepare: (p) => ({ c: lin(p.colors), line: hexToLinear(p.lineColor), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.cols, m = p.rows;
    const X = u * n, Y = v * m, fx = fract(X), fy = fract(Y);
    const sn = Math.sin(Math.PI * fy);
    const g = Math.abs(fx - 0.5) - 0.5 * sn * sn;
    const grad = Math.hypot(n, 0.5 * Math.PI * Math.sin(TAU * fy) * m);
    const d = g / grad;
    mix3(out, s.c[1], s.c[0], clamp01(0.5 - d / ctx.px));
    if (p.line > 0) {
      let dl = Math.abs(d) - p.line * 0.5 / n;
      if (p.inset > 0) dl = Math.min(dl, Math.abs(Math.abs(d) - p.inset / n) - p.line * 0.35 / n);
      mix3(out, out, s.line, coverage(dl, ctx.px));
    }
  },
};

// Islamic star patterns (Hankin's polygons-in-contact, after Kaplan 2005) ------------------------

/** Hankin rays for a regular n-gon: returns segments [[ax,ay,bx,by], ...]. */
function hankinPolygon(cx, cy, inr, n, rot, theta, segs) {
  for (let i = 0; i < n; i++) {
    const phi = rot + (i * TAU) / n, phiN = rot + ((i + 1) * TAU) / n;
    const mx = cx + inr * Math.cos(phi), my = cy + inr * Math.sin(phi);
    // direction: rotate the edge tangent (towards edge i+1) inward by theta
    const tx = -Math.sin(phi), ty = Math.cos(phi), nx = -Math.cos(phi), ny = -Math.sin(phi);
    const dx = Math.cos(theta) * tx + Math.sin(theta) * nx, dy = Math.cos(theta) * ty + Math.sin(theta) * ny;
    // intersect with the polygon's bisector between edges i and i+1 (symmetry line)
    const b = (phi + phiN) / 2, bx = Math.cos(b), by = Math.sin(b);
    const den = dx * by - dy * bx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((cx - mx) * by - (cy - my) * bx) / den;
    const ix = mx + dx * t, iy = my + dy * t;
    const mnx = cx + inr * Math.cos(phiN), mny = cy + inr * Math.sin(phiN);
    segs.push([mx, my, ix, iy], [ix, iy, mnx, mny]);
  }
}

const islamic = {
  id: 'islamic-star', name: 'Islamic star (Hankin)', category: 'geometric',
  tags: ['print', 'tiles', 'moroccan', 'zellige', 'graphics', 'ornament'],
  description: "Hankin's polygons-in-contact: rays leave each edge midpoint at a contact angle and meet inside the tile. 4.8.8 tiling gives 8-point stars.",
  params: {
    tiling: P.enumOf('4.8.8', ['4.8.8', '4.4.4.4'], 'Underlying tiling'),
    angle: P.float(67.5, 20, 85, 'Contact angle (deg)'),
    repeats: P.int(2, 1, 32, 'Repeats'),
    width: P.float(0.035, 0.002, 0.15, 'Strap width (cell units)'),
    style: P.enumOf('strap', ['line', 'strap'], 'Style'),
    colors: P.colors(['#0b3954', '#f4d35e', '#0b3954'], 'Ground, strap, strap edge', '', 3, 3),
  },
  prepare: (p) => {
    const th = (p.angle * Math.PI) / 180;
    const base = [];
    if (p.tiling === '4.8.8') {
      hankinPolygon(0.5, 0.5, 0.5, 8, 0, th, base);
      hankinPolygon(0, 0, Math.tan(Math.PI / 8) / 2, 4, Math.PI / 4, th, base);
    } else {
      hankinPolygon(0.5, 0.5, 0.5, 4, 0, th, base);
    }
    // replicate into the 3×3 neighbourhood, keep only segments near the unit cell
    const segs = [];
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) for (const s of base) {
      const q = [s[0] + ox, s[1] + oy, s[2] + ox, s[3] + oy];
      const pad = 0.2;
      if (Math.max(q[0], q[2]) < -pad || Math.min(q[0], q[2]) > 1 + pad || Math.max(q[1], q[3]) < -pad || Math.min(q[1], q[3]) > 1 + pad) continue;
      segs.push(q);
    }
    return { segs: Float64Array.from(segs.flat()), c: lin(p.colors), p };
  },
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.repeats, X = fract(u * n), Y = fract(v * n);
    let d = 1e9;
    const g = s.segs;
    for (let k = 0; k < g.length; k += 4) {
      const dd = sdSegment(X, Y, g[k], g[k + 1], g[k + 2], g[k + 3]);
      if (dd < d) d = dd;
    }
    const half = p.width * 0.5;
    set3(out, s.c[0]);
    if (p.style === 'line') { mix3(out, out, s.c[1], coverage((d - half) / n, ctx.px)); return; }
    const edge = half * 0.28;
    mix3(out, out, s.c[2], coverage((d - half) / n, ctx.px));
    mix3(out, out, s.c[1], coverage((d - half + edge) / n, ctx.px));
    out[3] = 0.5 + 0.5 * clamp01(1 - d / half);
  },
};

// Terrazzo ----------------------------------------------------------------------------------------

function chipLayer(X, Y, n, seed, size, prob, h3) {
  const xi = Math.floor(X), yi = Math.floor(Y);
  let best = 1e9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const wi = mod(xi + i, n), wj = mod(yi + j, n);
    hash01x3(wi, wj, seed, h3);
    if (h3[2] > prob) continue;
    const cx = xi + i + 0.2 + 0.6 * h3[0], cy = yi + j + 0.2 + 0.6 * h3[1];
    const dx = X - cx, dy = Y - cy;
    if (dx * dx + dy * dy > size * size * 2.2) continue; // can't reach: skip the trig
    const a = Math.atan2(dy, dx), ph = hash01(wi, wj, seed ^ 99) * TAU;
    const R = size * (0.55 + 0.45 * hash01(wj, wi, seed ^ 7));
    const rr = R * (1 + 0.12 * Math.sin(3 * a + ph) + 0.09 * Math.sin(5 * a - ph * 2) + 0.14 * Math.sin(2 * a + ph * 3) + 0.05 * Math.sin(7 * a + ph));
    const d = Math.hypot(dx, dy) - rr;
    if (d < best) { best = d; id = hashU32(wi, wj, seed ^ 0xabc); }
  }
  return [best, id];
}

const terrazzo = {
  id: 'terrazzo', name: 'Terrazzo', category: 'geometric',
  tags: ['graphics', 'interior', 'surface', 'print', 'stone'],
  description: 'Irregular stone chips at two scales on a speckled ground.',
  params: {
    density: P.int(7, 1, 64, 'Large chips across'),
    chipSize: P.float(0.32, 0.05, 0.5, 'Chip size'),
    background: P.color('#ece6dc', 'Ground'),
    colors: P.colors(['#c75d3c', '#2f5d62', '#e3b23c', '#9aa5a1', '#3d3b3c'], 'Chip colours'),
    seed: P.seed(8),
  },
  prepare: (p) => ({ bg: hexToLinear(p.background), cols: lin(p.colors), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.density, h3 = [0, 0, 0];
    const speck = (hash01(Math.floor(fract(u) * 900), Math.floor(fract(v) * 900), p.seed) - 0.5) * 0.06;
    set3(out, s.bg, 1 + speck);
    const n2 = n * 3;
    const [d2, id2] = chipLayer(u * n2, v * n2, n2, p.seed + 1, p.chipSize * 0.8, 0.7, h3);
    mix3(out, out, s.cols[id2 % s.cols.length], coverage(d2 / n2, ctx.px));
    const [d1, id1] = chipLayer(u * n, v * n, n, p.seed, p.chipSize, 0.8, h3);
    set3(_c, s.cols[id1 % s.cols.length], 0.95 + 0.1 * hash01(Math.floor(fract(u) * 300), Math.floor(fract(v) * 300), id1));
    mix3(out, out, _c, coverage(d1 / n, ctx.px));
  },
};

// Halftone ---------------------------------------------------------------------------------------

const SCREENS = { '0°': [1, 0], '45°': [1, 1], '26.6°': [2, 1], '18.4°': [3, 1] };

const halftone = {
  id: 'halftone', name: 'Halftone dots', category: 'geometric',
  tags: ['graphics', 'pop-art', 'comic', 'print', 'retro'],
  description: 'Screen of dots whose area follows a periodic noise or wave field. Screen angles use integer lattice vectors so the tile stays seamless.',
  params: {
    cells: P.int(24, 4, 256, 'Dots across'), angle: P.enumOf('45°', Object.keys(SCREENS), 'Screen angle'),
    field: P.enumOf('noise', ['noise', 'waves', 'flat'], 'Tone field'), tone: P.float(0.5, 0, 1, 'Tone (flat field)'),
    scale: P.int(2, 1, 16, 'Field frequency'), contrast: P.float(1.4, 0.2, 4, 'Contrast'),
    colors: P.colors(['#f7f1e3', '#e63946'], 'Paper, ink', '', 2, 2), seed: P.seed(4),
  },
  prepare: (p) => {
    const [a, b] = SCREENS[p.angle];
    const k = Math.max(1, Math.round(p.cells / Math.hypot(a, b)));
    return { a, b, k, c: lin(p.colors), p };
  },
  sample(u, v, out, ctx, s) {
    const { a, b, k, p } = s;
    const S = (a * u + b * v) * k, T = (-b * u + a * v) * k;
    const cs = Math.floor(S) + 0.5, ct = Math.floor(T) + 0.5;
    const L2 = (a * a + b * b) * k;
    const cu = (a * cs - b * ct) / L2, cv = (b * cs + a * ct) / L2;
    let f;
    if (p.field === 'flat') f = p.tone;
    else if (p.field === 'waves') f = 0.5 + 0.25 * Math.sin(TAU * p.scale * cu) + 0.25 * Math.sin(TAU * p.scale * (cv + 0.3 * Math.sin(TAU * cu)));
    else f = fbm01(cu, cv, { freq: p.scale, octaves: 4, seed: p.seed });
    f = clamp01(0.5 + (f - 0.5) * p.contrast);
    const r = Math.sqrt(f) * 0.62; // area ∝ tone; 0.62 lets neighbours just merge at full tone
    const d = (Math.hypot(S - cs, T - ct) - r) / (k * Math.hypot(a, b));
    mix3(out, s.c[0], s.c[1], coverage(d, ctx.px));
  },
};

// Contours ---------------------------------------------------------------------------------------

const contour = {
  id: 'contour-lines', name: 'Topographic contours', category: 'geometric',
  tags: ['graphics', 'map', 'outdoor', 'print', 'abstract'],
  description: 'Iso-lines of a periodic fbm field with constant on-screen width (gradient-normalised), thicker index lines every Nth level.',
  params: {
    levels: P.int(14, 2, 64, 'Levels'), scale: P.int(2, 1, 16, 'Field frequency'),
    lineWidth: P.float(1.6, 0.3, 6, 'Line width (px @512)'), indexEvery: P.int(5, 0, 20, 'Index line every'),
    fill: P.bool(false, 'Hypsometric fill'),
    colors: P.colors(['#f3efe0', '#7a5c3e'], 'Ground, line', '', 2, 2),
    fillColors: P.colors(['#2b5f4a', '#7da36b', '#e6d8a6', '#c58b4e', '#f4efe6'], 'Fill ramp'),
    seed: P.seed(6),
  },
  prepare: (p) => ({ c: lin(p.colors), ramp: lin(p.fillColors), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, o = { freq: p.scale, octaves: 4, gain: 0.45, seed: p.seed };
    const e = 1 / 2048;
    // fbm sits mostly in [0.3, 0.7]; stretch ×2.5 so 'levels' means visible levels
    const F = (a, b) => (fbm01(a, b, o) - 0.5) * 2.5 + 0.5;
    const f = F(u, v);
    const fx = (F(u + e, v) - f) / e, fy = (F(u, v + e) - f) / e; // forward differences: 3 evals, not 5
    const t = f * p.levels, gl = Math.hypot(fx, fy) * p.levels + 1e-6;
    const k = Math.round(t);
    const d = Math.abs(t - k) / gl; // uv distance to nearest iso-line
    const isIndex = p.indexEvery > 0 && mod(k, p.indexEvery) === 0;
    const w = (p.lineWidth / 512) * (isIndex ? 2 : 1) * 0.5;
    if (p.fill) ramp(out, s.ramp, clamp01(Math.floor(t) / p.levels)); else set3(out, s.c[0]);
    mix3(out, out, s.c[1], coverage(d - w, ctx.px));
    out[3] = clamp01(f);
  },
};

// Bricks -----------------------------------------------------------------------------------------

const bricks = {
  id: 'bricks', name: 'Bricks / tiles', category: 'geometric',
  tags: ['graphics', 'game', 'wall', 'material', 'subway-tile'],
  description: 'Running or stack bond with mortar, per-brick colour variation and a bevelled height map (good for normal maps).',
  params: {
    bond: P.enumOf('running', ['running', 'stack'], 'Bond'),
    cols: P.int(4, 1, 64, 'Bricks per row'), rows: P.int(8, 2, 128, 'Rows (even for running)'),
    mortar: P.float(0.06, 0, 0.3, 'Mortar (brick-height units)'),
    colors: P.colors(['#9c4a33', '#b05a3c', '#8a3f2c', '#a8553b'], 'Brick colours'),
    mortarColor: P.color('#cfc6b8', 'Mortar'), roughness: P.float(0.5, 0, 1, 'Surface noise'),
    seed: P.seed(9),
  },
  prepare: (p) => ({ m: p.bond === 'running' ? evenInt(p.rows) : p.rows, c: lin(p.colors), mc: hexToLinear(p.mortarColor), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.cols, m = s.m;
    const Y = v * m, row = Math.floor(Y);
    const X = u * n + (p.bond === 'running' && mod(row, 2) ? 0.5 : 0);
    const col = Math.floor(X), fx = X - col, fy = Y - row;
    const aspect = m / n; // brick width / height in physical units
    const dx = Math.min(fx, 1 - fx) * aspect, dy = Math.min(fy, 1 - fy);
    const dEdge = Math.min(dx, dy) - p.mortar * 0.5; // in brick-height units
    const wi = mod(col, n), wj = mod(row, m);
    const base = s.c[hashU32(wi, wj, p.seed) % s.c.length];
    const nz = p.roughness * 0.25 * perlin(u * 64, v * 64, 64, 64, p.seed);
    set3(_c, base, 0.85 + 0.3 * hash01(wi, wj, p.seed ^ 5) + nz);
    set3(_d, s.mc, 1 + nz * 0.5);
    mix3(out, _d, _c, coverage(-dEdge / m, ctx.px));
    out[3] = dEdge < 0 ? 0.1 : clamp01(0.4 + 0.55 * smoothstep(0, 0.15, dEdge) + nz * 0.2);
  },
};

export default [stripes, checker, dots, chevron, argyle, honeycomb, truchet, scales, ogee, islamic, terrazzo, halftone, contour, bricks];
