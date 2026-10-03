// Geometric & print patterns: stripes, checks, dots & motifs, chevrons, argyle, hex, Truchet,
// seigaiha, ogee, Islamic star (Hankin), terrazzo, halftone, contours, bricks/tiles, grid paper.
//
// Conventions:
//  * Every repeat count is an INTEGER (and EVEN where alternation needs it: checkers, half-drop,
//    brick, argyle) so the tile is exactly periodic.
//  * Edges are antialiased analytically from signed distances using ctx.px (subpixel size in uv),
//    so results are crisp at any resolution even with supersample=1.
//  * Patterns must accept u, v outside [0,1) (the tests call sample(u + k, v + m)): wrap every
//    integer cell index with mod() before hashing.

import { P, adv } from '../core/params.js';
import { hexToLinear, mix, shade, ramp } from '../core/color.js';
import { hash01, hashU32, hash01x3 } from '../core/hash.js';
import { clamp01, coverage, evenInt, fract, mod, sdSegment, sdStar5, sdHeart, sdPolygon, smoothstep, tri, SQRT3, TAU, detail, lambert } from '../core/math.js';
import { noiseField, perlin, worley } from '../core/noise.js';

const lin = (a) => a.map(hexToLinear);
const _c = [0, 0, 0, 0], _d = [0, 0, 0, 0];
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
  if (dS < dE) return mix(out, cols[mod(k - 1, L)], cols[k % L], clamp01(0.5 + dS / aaT));
  return mix(out, cols[(k + 1) % L], cols[k % L], clamp01(0.5 + dE / aaT));
}

// ---------------------------------------------------------------------------------------------

const DIRS = { horizontal: [0, 1], vertical: [1, 0], diagonal: [1, 1], 'anti-diagonal': [1, -1], shallow: [1, 2], steep: [2, 1] };

const stripes = {
  id: 'stripes', name: 'Stripes', category: 'geometric', scale: 'repeats',
  tags: ['clothes', 'print', 'breton', 'pinstripe', 'awning', 'graphics', 'wavy'],
  description: 'Any number of coloured bands with relative widths, horizontal/vertical/diagonal, optionally wavy. Pinstripe: widths "1 14". Breton: "1 1.4". Soft = blurred band edges.',
  features: (p) => [p.repeats, p.repeats, 'repeats'],
  params: {
    colors: P.colors(['#1b2a49', '#f4f1ea'], 'Band colours (cycled)'),
    widths: P.string('1 1', 'Relative widths', 'Space-separated, one per band (cycled to match colours).'),
    direction: P.enumOf('horizontal', Object.keys(DIRS), 'Direction'),
    repeats: P.int(8, 1, 256, 'Repeats'),
    wave: P.float(0, 0, 2, 'Wave amplitude', 'In stripe-repeat units; 0 = straight.'),
    waveFreq: P.int(2, 1, 32, 'Waves across'),
    soft: adv(P.float(0, 0, 1, 'Soft edges')),
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
    return { edges, cols, a: a * p.repeats, b: b * p.repeats, da: a, db: b, p };
  },
  sample(u, v, out, ctx, s) {
    const p = s.p;
    let t = s.a * u + s.b * v, grad = Math.hypot(s.a, s.b);
    if (p.wave > 0) {
      // displace along the stripe normal by a sine running along the stripes (integer frequency)
      const along = s.db * u - s.da * v; // integer direction: periodic along the stripes
      t += p.wave * Math.sin(TAU * p.waveFreq * along);
      grad = Math.hypot(grad, p.wave * TAU * p.waveFreq * Math.hypot(s.da, s.db));
    }
    bandColor(out, fract(t), s.edges, s.cols, ctx.px * grad + p.soft * 0.25);
  },
};

const checker = {
  id: 'checkerboard', name: 'Checkerboard', category: 'geometric', scale: 'cells',
  tags: ['print', 'graphics', 'floor', 'racing', 'harlequin', 'retro'],
  description: 'Two-colour checks, square or diagonal (harlequin diamonds). Cell count is forced even so it tiles.',
  features: (p, s) => [s.n, s.n, 'cells'],
  params: {
    cells: P.int(8, 2, 256, 'Cells across (even)'), colors: P.colors(['#111111', '#f2f2f2'], 'Colours', '', 2, 2),
    diagonal: P.bool(false, 'Diagonal (harlequin)'),
  },
  prepare: (p) => ({ n: evenInt(p.cells), cols: lin(p.colors), p }),
  sample(u, v, out, ctx, s) {
    let x = u * s.n, y = v * s.n, scale = 1;
    if (s.p.diagonal) { const a = (x + y) * 0.5, b = (x - y) * 0.5; x = a; y = b; scale = Math.SQRT1_2; }
    const sgn = (z) => (fract(z / 2) < 0.5 ? 1 : -1) * clamp01((Math.min(fract(z), 1 - fract(z)) * scale) / s.n / (ctx.px * 0.5));
    const k = 0.5 + 0.5 * sgn(x) * sgn(y);
    mix(out, s.cols[1], s.cols[0], k);
  },
};

// Dots & tossed motifs --------------------------------------------------------------------------

const SHAPES = ['circle', 'ring', 'square', 'diamond', 'cross', 'star', 'heart', 'flower', 'triangle', 'hexagon', 'teardrop', 'moon', 'leaf'];

function shapeSDF(shape, x, y, r) {
  switch (shape) {
    case 'ring': return Math.abs(Math.hypot(x, y) - r * 0.75) - r * 0.25;
    case 'square': return Math.max(Math.abs(x), Math.abs(y)) - r * 0.82;
    case 'diamond': return (Math.abs(x) + Math.abs(y) - r) * 0.7071;
    case 'cross': {
      const ax = Math.abs(x), ay = Math.abs(y), w = r * 0.3;
      return Math.min(Math.max(ax - r, ay - w), Math.max(ax - w, ay - r));
    }
    case 'star': return sdStar5(x, y, r, 0.45);
    case 'heart': return sdHeart(x / (r * 2), y / (r * 2)) * r * 2;
    case 'flower': {
      // 5 round petals around a disc: union of circles (exact SDF of a union = min)
      let d = Math.hypot(x, y) - r * 0.32;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU - Math.PI / 2;
        d = Math.min(d, Math.hypot(x - Math.cos(a) * r * 0.55, y - Math.sin(a) * r * 0.55) - r * 0.42);
      }
      return d;
    }
    case 'triangle': return sdPolygon(x, -y + r * 0.15, r, 3);
    case 'hexagon': return sdPolygon(y, x, r * 0.95, 6);
    case 'teardrop': {
      // uneven capsule (Inigo Quilez) with a tiny top radius: a rain drop / simple paisley body, tip up
      const px = Math.abs(x), py = -(y - r * 0.35), r1 = r * 0.62, r2 = r * 0.04, hh = r * 1.2;
      const b = (r1 - r2) / hh, a = Math.sqrt(1 - b * b);
      const k = -b * px + a * py;
      if (k < 0) return Math.hypot(px, py) - r1;
      if (k > a * hh) return Math.hypot(px, py - hh) - r2;
      return a * px + b * py - r1;
    }
    case 'moon': return Math.max(Math.hypot(x, y) - r, -(Math.hypot(x - r * 0.42, y - r * 0.2) - r * 0.8));
    case 'leaf': {
      // vesica (intersection of two offset circles), tilted 45°
      const c = Math.SQRT1_2, xr = (x - y) * c, yr = (x + y) * c;
      const R = r * 1.05, off = R * 0.62;
      return Math.max(Math.hypot(xr - off, yr) - R, Math.hypot(xr + off, yr) - R);
    }
    default: return Math.hypot(x, y) - r;
  }
}

const dots = {
  id: 'dots', name: 'Polka dots & tossed motifs', category: 'geometric', scale: 'cells',
  tags: ['clothes', 'print', 'polka', 'confetti', 'graphics', 'kids', 'ditsy', 'floral'],
  description: 'Dots, stars, hearts, flowers, leaves, moons… in textile repeat layouts: block, half-drop, brick or tossed (random, non-overlapping). Optional outline and flower centres make ditsy florals.',
  features: (p, s) => [s.n, s.n, 'cells'],
  params: {
    layout: P.enumOf('half-drop', ['block', 'half-drop', 'brick', 'tossed'], 'Repeat layout'),
    shape: P.enumOf('circle', SHAPES, 'Motif'),
    cells: P.int(8, 2, 128, 'Cells across'),
    size: P.float(0.28, 0.05, 0.5, 'Motif radius (cell units)'),
    sizeJitter: P.float(0, 0, 1, 'Size variation'),
    rotate: P.bool(false, 'Random rotation'),
    background: P.color('#f6efe2', 'Background', '"transparent" for motifs only.'),
    colors: P.colors(['#c1272d'], 'Motif colours (random pick)'),
    outline: adv(P.float(0, 0, 0.1, 'Outline width (cell units)')), outlineColor: adv(P.color('#1d1d1d', 'Outline colour')),
    centerColor: adv(P.color('transparent', 'Centre dot colour', 'E.g. yellow flower centres. "transparent" = none.')),
    seed: P.seed(5),
  },
  prepare: (p) => ({
    n: p.layout === 'block' || p.layout === 'tossed' ? p.cells : evenInt(p.cells), bg: hexToLinear(p.background), cols: lin(p.colors),
    oc: hexToLinear(p.outlineColor), cc: hexToLinear(p.centerColor), p,
  }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = s.n;
    const X = u * n, Y = v * n;
    const xi = Math.floor(X), yi = Math.floor(Y);
    let best = 1e9, bestCol = 0, bestCenter = 1e9;
    const h = _h;
    for (let j = -2; j <= 2; j++) {
      for (let i = -1; i <= 1; i++) {
        const ci = xi + i, cj = yi + j, wi = mod(ci, n), wj = mod(cj, n);
        let cx = ci + 0.5, cy = cj + 0.5;
        if (p.layout === 'half-drop' && wi & 1) cy += 0.5;
        if (p.layout === 'brick' && wj & 1) cx += 0.5;
        hash01x3(wi, wj, p.seed, h);
        const r = p.size * (1 - p.sizeJitter * 0.6 * h[2]);
        if (p.layout === 'tossed') {
          const room = Math.max(0, 0.5 - r);
          cx += (h[0] - 0.5) * 2 * room; cy += (h[1] - 0.5) * 2 * room;
        }
        let dx = X - cx, dy = Y - cy;
        if (dx * dx + dy * dy > (r * 1.6 + 0.1) ** 2) continue;
        if (p.rotate) {
          const a = hash01(wi, wj, p.seed ^ 77) * TAU, ca = Math.cos(a), sa = Math.sin(a);
          const rx = ca * dx + sa * dy, ry = -sa * dx + ca * dy; dx = rx; dy = ry;
        }
        const d = shapeSDF(p.shape, dx, dy, r);
        if (d < best) { best = d; bestCol = hashU32(wi, wj, p.seed ^ 31) % s.cols.length; bestCenter = Math.hypot(dx, dy) - r * 0.2; }
      }
    }
    shade(out, s.bg, 1);
    const ow = p.outline;
    if (ow > 0) mix(out, out, s.oc, coverage((best - ow) / n, ctx.px));
    mix(out, out, s.cols[bestCol], coverage(best / n, ctx.px));
    if (s.cc[3] > 0 && best < 0) mix(out, out, s.cc, coverage(bestCenter / n, ctx.px));
  },
};
const _h = [0, 0, 0];

// Chevron ---------------------------------------------------------------------------------------

const chevron = {
  id: 'chevron', name: 'Chevron / zigzag', category: 'geometric', scale: 'zigs',
  tags: ['clothes', 'print', 'missoni', 'graphics'],
  description: 'Zigzag bands. Band count is rounded to a multiple of the colour count so colours tile. Rounded = soft wave zigzag.',
  features: (p) => [p.zigs, p.bands, 'zigzags'],
  params: {
    colors: P.colors(['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'], 'Band colours'),
    bands: P.int(10, 1, 128, 'Bands (vertical)'), zigs: P.int(4, 1, 64, 'Zigzags across'),
    amplitude: P.float(1.5, 0, 8, 'Amplitude (bands)'),
    rounded: P.float(0, 0, 1, 'Rounded peaks'),
  },
  prepare: (p) => {
    const L = p.colors.length;
    const n = Math.max(1, Math.round(p.bands / L)) * L;
    const edges = Array.from({ length: L }, (_, i) => (i + 1) / L);
    return { n, cols: lin(p.colors), edges, p };
  },
  sample(u, v, out, ctx, s) {
    const p = s.p, L = s.cols.length;
    const x = u * p.zigs;
    const tw = tri(x), sw = 0.5 - 0.5 * Math.cos(TAU * x);
    const wave = tw + (sw - tw) * p.rounded;
    const y = v * s.n + p.amplitude * wave;
    const grad = Math.hypot(s.n, 2 * p.amplitude * p.zigs) / L; // |∇t| in uv
    bandColor(out, fract(y / L), s.edges, s.cols, ctx.px * grad);
  },
};

// Argyle ----------------------------------------------------------------------------------------

const argyle = {
  id: 'argyle', name: 'Argyle', category: 'geometric', scale: 'cols',
  tags: ['clothes', 'knitwear', 'socks', 'golf', 'preppy'],
  description: 'Alternating diamonds on a ground with thin diagonal overcheck lines (dashed option, like the stitched original).',
  features: (p, s) => [s.n, s.m, 'diamonds'],
  params: {
    cols: P.int(4, 2, 64, 'Diamonds across (even)'), rows: P.int(2, 2, 64, 'Diamond rows (even)'),
    colors: P.colors(['#5b2333', '#2e4057', '#c9b79c'], 'Diamond A, diamond B, ground', '', 3, 3),
    lineColor: P.color('#f2e8cf', 'Overcheck line'), lineWidth: P.float(0.012, 0, 0.05, 'Line width (uv)'),
    dashed: P.bool(false, 'Dashed overcheck'),
  },
  prepare: (p) => ({ n: evenInt(p.cols), m: evenInt(p.rows), c: lin(p.colors), line: hexToLinear(p.lineColor), p }),
  sample(u, v, out, ctx, s) {
    const P_ = u * s.n + v * s.m, Q = u * s.n - v * s.m; // diamond lattice
    const fp = Math.floor(P_), fq = Math.floor(Q);
    const colOf = (a, b) => ((((a + b) & 1) === 0) ? (mod(a, 2) ? s.c[0] : s.c[1]) : s.c[2]);
    const col = colOf(fp, fq);
    const g = Math.hypot(s.n, s.m);
    const dP = Math.min(fract(P_), 1 - fract(P_)) / g, dQ = Math.min(fract(Q), 1 - fract(Q)) / g;
    const dEdge = Math.min(dP, dQ);
    const nfp = dP < dQ ? (fract(P_) < 0.5 ? fp - 1 : fp + 1) : fp;
    const nfq = dP < dQ ? fq : fract(Q) < 0.5 ? fq - 1 : fq + 1;
    mix(out, colOf(nfp, nfq), col, clamp01(0.5 + dEdge / ctx.px));
    if (s.p.lineWidth > 0) {
      const lp = Math.abs(fract(P_) - 0.5) / g, lq = Math.abs(fract(Q) - 0.5) / g;
      let dl = Math.min(lp, lq) - s.p.lineWidth * 0.5;
      if (s.p.dashed) { const along = lp < lq ? Q : P_; if (fract(along * 6) > 0.6) dl = 1; }
      mix(out, out, s.line, coverage(dl, ctx.px));
    }
  },
};

// Honeycomb -------------------------------------------------------------------------------------

/** Pointy-top hex lattice on a square tile: nearest cell centre in hex-local coords. */
function hexCell(u, v, n, K, res) {
  const X = u * n, Y = v * K * SQRT3;
  const ax = mod(X, 1) - 0.5, ay = mod(Y, SQRT3) - SQRT3 / 2;
  const bx = mod(X - 0.5, 1) - 0.5, by = mod(Y - SQRT3 / 2, SQRT3) - SQRT3 / 2;
  if (ax * ax + ay * ay < bx * bx + by * by) { res.x = ax; res.y = ay; res.i = mod(Math.floor(X), n); res.j = mod(Math.floor(Y / SQRT3), K) * 2; }
  else { res.x = bx; res.y = by; res.i = mod(Math.floor(X - 0.5), n); res.j = mod(Math.floor((Y - SQRT3 / 2) / SQRT3), K) * 2 + 1; }
  return res;
}
const _hx = { x: 0, y: 0, i: 0, j: 0 };

const honeycomb = {
  id: 'honeycomb', name: 'Hexagon / honeycomb', category: 'geometric', scale: 'cells',
  tags: ['graphics', 'tiles', 'sci-fi', 'mesh', 'print'],
  description: 'Pointy-top hex grid. Vertical rows are chosen so hexes are within a few % of regular on a square tile. Cells, outline-only or bevelled tiles.',
  features: (p) => [p.cells, p.cells, 'hexes'],
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
    const c = hexCell(u, v, s.n, s.K, _hx);
    const hx = Math.abs(c.x), hy = Math.abs(c.y);
    const dh = Math.max(hx, hx * 0.5 + hy * (SQRT3 / 2)); // 0.5 at the edge
    const edge = (0.5 - dh) / s.n; // uv distance to edge (inside positive)
    const p = s.p;
    const col = s.cols[hashU32(c.i, c.j, p.seed) % s.cols.length];
    if (p.style === 'lines') { mix(out, s.cols[0], s.bg, coverage(edge - (p.line * 0.5) / s.n, ctx.px)); return; }
    let k = 1;
    if (p.style === 'bevel') {
      // flat top with a 45° bevel band: normal points away from the nearest edge
      const bw = 0.1, t = clamp01((0.5 - dh) / bw);
      if (t < 1) {
        const nx = hx * 0.5 + hy * (SQRT3 / 2) > hx ? 0.5 * Math.sign(c.x) : Math.sign(c.x);
        const ny = hx * 0.5 + hy * (SQRT3 / 2) > hx ? (SQRT3 / 2) * Math.sign(c.y) : 0;
        k = lambert(nx * 1.2, ny * 1.2) * (0.85 + 0.15 * t) + (1 - t) * 0;
      }
      out[4] = 0.5 + 0.5 * t;
    }
    shade(_c, col, k);
    mix(out, s.bg, _c, coverage(-(edge - (p.line * 0.5) / s.n), ctx.px));
    if (p.style !== 'bevel') out[4] = 0.5 + 0.5 * clamp01((0.5 - dh) * 4);
  },
};

// Truchet ---------------------------------------------------------------------------------------

const truchet = {
  id: 'truchet', name: 'Truchet tiles', category: 'geometric', scale: 'cells',
  tags: ['graphics', 'maze', 'generative', 'print'],
  description: 'Smith quarter-circle tiles (2-colourable: colour = inside ⊕ orientation ⊕ parity), 10-PRINT maze, or triangle tiles.',
  features: (p, s) => [s.n, s.n, 'tiles'],
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
    let dLine = 1e9;
    if (p.variant === 'arcs') {
      const c0x = o ? 1 : 0, c1x = o ? 0 : 1;
      const l0 = Math.hypot(fx - c0x, fy), l1 = Math.hypot(fx - c1x, fy - 1);
      dLine = Math.min(Math.abs(l0 - 0.5), Math.abs(l1 - 0.5));
      const inside = l0 < 0.5 || l1 < 0.5 ? 1 : 0;
      const fillSide = inside ^ o ^ par;
      if (p.fill) mix(out, s.c[fillSide ^ 1], s.c[fillSide], clamp01(0.5 + dLine / n / ctx.px));
      else shade(out, s.c[1]);
    } else if (p.variant === 'maze') {
      dLine = o ? Math.abs(fx - fy) / Math.SQRT2 : Math.abs(fx + fy - 1) / Math.SQRT2;
      shade(out, s.c[1]);
    } else {
      const sd = (o ? fx - fy : fx + fy - 1) / Math.SQRT2;
      const fillSide = (sd > 0 ? 1 : 0) ^ par;
      mix(out, s.c[fillSide ^ 1], s.c[fillSide], clamp01(0.5 + Math.abs(sd) / n / ctx.px));
    }
    if (p.lineWidth > 0 && dLine < 1e8) mix(out, out, s.c[2], coverage((dLine - p.lineWidth * 0.5) / n, ctx.px));
  },
};

// Seigaiha / fish scales ------------------------------------------------------------------------

const scales = {
  id: 'seigaiha', name: 'Seigaiha / scales', category: 'geometric', scale: 'cells',
  tags: ['print', 'japanese', 'kimono', 'waves', 'mermaid', 'clothes'],
  description: 'Overlapping concentric half-circles (Japanese wave pattern). Rings alternate through the palette.',
  features: (p) => [p.cells, p.cells * 4, 'scales'],
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
      const off = mod(j, 2) * 0.5;
      const i = Math.round(X - off);
      const dx = X - (i + off), dy = Y - j * 0.25;
      const r = Math.hypot(dx, dy);
      if (r < 0.5) {
        const t = (r / 0.5) * p.rings;
        const k = Math.min(p.rings - 1, Math.floor(p.rings - t));
        shade(out, s.cols[k % s.cols.length]);
        const dRing = (Math.min(fract(t), 1 - fract(t)) * 0.5) / p.rings / n;
        const dOuter = (0.5 - r) / n;
        const dl = Math.min(dRing, dOuter) - (p.outline * 0.5) / n;
        if (p.outline > 0) mix(out, out, s.line, coverage(dl, ctx.px));
        return;
      }
    }
    shade(out, s.cols[0]);
  },
};

// Ogee ------------------------------------------------------------------------------------------

const ogee = {
  id: 'ogee', name: 'Ogee lattice', category: 'geometric', scale: 'cols',
  tags: ['print', 'damask', 'wallpaper', 'moroccan', 'clothes'],
  description: 'Interlocking onion shapes. Exact two-family tiling because sin²(πy) + sin²(π(y+½)) = 1. Optional inner outline and centre dot.',
  features: (p) => [p.cols, p.rows, 'shapes'],
  params: {
    cols: P.int(4, 1, 64, 'Shapes across'), rows: P.int(3, 1, 64, 'Shapes down'),
    colors: P.colors(['#e9d8a6', '#94d2bd'], 'Family A, family B', '', 2, 2),
    line: P.float(0.03, 0, 0.2, 'Outline (cell units)'), lineColor: P.color('#005f73', 'Outline'),
    inset: P.float(0.12, 0, 0.4, 'Inner outline inset (0 = off)'),
    dot: adv(P.float(0, 0, 0.2, 'Centre dot size')),
  },
  prepare: (p) => ({ c: lin(p.colors), line: hexToLinear(p.lineColor), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.cols, m = p.rows;
    const X = u * n, Y = v * m, fx = fract(X), fy = fract(Y);
    const sn = Math.sin(Math.PI * fy);
    const g = Math.abs(fx - 0.5) - 0.5 * sn * sn;
    const grad = Math.hypot(n, 0.5 * Math.PI * Math.sin(TAU * fy) * m);
    const d = g / grad;
    mix(out, s.c[1], s.c[0], clamp01(0.5 - d / ctx.px));
    if (p.line > 0) {
      let dl = Math.abs(d) - (p.line * 0.5) / n;
      if (p.inset > 0) dl = Math.min(dl, Math.abs(Math.abs(d) - p.inset / n) - (p.line * 0.35) / n);
      mix(out, out, s.line, coverage(dl, ctx.px));
    }
    if (p.dot > 0) {
      // dot at the centre of each onion (family A at (0.5, 0.5), family B at the cell corners)
      const dA = Math.hypot((fx - 0.5) / m, (fy - 0.5) / n), dB = Math.hypot((Math.abs(fx - 0.5) - 0.5) / m, (Math.abs(fy - 0.5) - 0.5) / n);
      mix(out, out, s.line, coverage(Math.min(dA, dB) - p.dot / Math.max(n, m) / 2, ctx.px));
    }
  },
};

// Islamic star patterns (Hankin's polygons-in-contact, after Kaplan 2005) ------------------------

/** Hankin rays for a regular n-gon; pushes segments [ax,ay,bx,by]. */
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
  id: 'islamic-star', name: 'Islamic star (Hankin)', category: 'geometric', scale: 'repeats',
  tags: ['print', 'tiles', 'moroccan', 'zellige', 'graphics', 'ornament'],
  description: "Hankin's polygons-in-contact: rays leave each edge midpoint at a contact angle and meet inside the tile. 4.8.8 tiling gives 8-point stars, 6.6.6 gives 6-point stars (hex rows fitted to the square tile), 4.4.4.4 gives crosses.",
  features: (p) => [p.repeats, p.repeats, 'repeats'],
  params: {
    tiling: P.enumOf('4.8.8', ['4.8.8', '4.4.4.4', '6.6.6'], 'Underlying tiling'),
    angle: P.float(67.5, 20, 85, 'Contact angle (deg)'),
    repeats: P.int(2, 1, 32, 'Repeats'),
    width: P.float(0.035, 0.002, 0.15, 'Strap width (cell units)'),
    style: P.enumOf('strap', ['line', 'strap'], 'Style'),
    colors: P.colors(['#0b3954', '#f4d35e', '#0b3954'], 'Ground, strap, strap edge', '', 3, 3),
  },
  prepare: (p) => {
    const th = (p.angle * Math.PI) / 180;
    const base = [];
    if (p.tiling === '6.6.6') {
      // one hexagon (pointy-top, inradius 0.5) in hex-local coords; evaluated per hex cell
      hankinPolygon(0, 0, 0.5, 6, 0, th, base);
      return { hex: true, segs: Float64Array.from(base.flat()), c: lin(p.colors), p, n: p.repeats * 2, K: Math.max(1, Math.round((p.repeats * 2) / SQRT3)) };
    }
    if (p.tiling === '4.8.8') {
      hankinPolygon(0.5, 0.5, 0.5, 8, 0, th, base);
      hankinPolygon(0, 0, Math.tan(Math.PI / 8) / 2, 4, Math.PI / 4, th, base);
    } else hankinPolygon(0.5, 0.5, 0.5, 4, 0, th, base);
    // replicate into the 3×3 neighbourhood, keep only segments near the unit cell
    const segs = [];
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) for (const s of base) {
      const q = [s[0] + ox, s[1] + oy, s[2] + ox, s[3] + oy];
      const pad = 0.2;
      if (Math.max(q[0], q[2]) < -pad || Math.min(q[0], q[2]) > 1 + pad || Math.max(q[1], q[3]) < -pad || Math.min(q[1], q[3]) > 1 + pad) continue;
      segs.push(q);
    }
    return { hex: false, segs: Float64Array.from(segs.flat()), c: lin(p.colors), p };
  },
  sample(u, v, out, ctx, s) {
    const p = s.p;
    let X, Y, n;
    if (s.hex) { const c = hexCell(u, v, s.n, s.K, _hx); X = c.x; Y = c.y; n = s.n; }
    else { n = p.repeats; X = fract(u * n); Y = fract(v * n); }
    let d = 1e9;
    const g = s.segs;
    for (let k = 0; k < g.length; k += 4) {
      const dd = sdSegment(X, Y, g[k], g[k + 1], g[k + 2], g[k + 3]);
      if (dd < d) d = dd;
    }
    const half = p.width * 0.5;
    shade(out, s.c[0]);
    if (p.style === 'line') { mix(out, out, s.c[1], coverage((d - half) / n, ctx.px)); return; }
    const edge = half * 0.28;
    mix(out, out, s.c[2], coverage((d - half) / n, ctx.px));
    mix(out, out, s.c[1], coverage((d - half + edge) / n, ctx.px));
    out[4] = 0.5 + 0.5 * clamp01(1 - d / half);
  },
};

// Terrazzo ----------------------------------------------------------------------------------------

const _tz = { d: 0, id: 0 };
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
    // angular chips: a few flat facets (polygonal) rather than round blobs
    const rr = R * (1 + 0.12 * Math.sin(3 * a + ph) + 0.09 * Math.sin(5 * a - ph * 2) + 0.14 * Math.sin(2 * a + ph * 3) + 0.05 * Math.sin(7 * a + ph));
    const d = Math.hypot(dx, dy) - rr;
    if (d < best) { best = d; id = hashU32(wi, wj, seed ^ 0xabc); }
  }
  _tz.d = best; _tz.id = id;
  return _tz;
}

const terrazzo = {
  id: 'terrazzo', name: 'Terrazzo', category: 'geometric', scale: 'density',
  tags: ['graphics', 'interior', 'surface', 'print', 'stone'],
  description: 'Irregular stone chips at two scales plus fine grit on a speckled ground, with subtle per-chip polish variation.',
  features: (p) => [p.density, p.density, 'chips'],
  params: {
    density: P.int(7, 1, 64, 'Large chips across'),
    chipSize: P.float(0.32, 0.05, 0.5, 'Chip size'),
    background: P.color('#ece6dc', 'Ground'),
    colors: P.colors(['#c75d3c', '#2f5d62', '#e3b23c', '#9aa5a1', '#3d3b3c'], 'Chip colours'),
    grit: adv(P.float(0.5, 0, 1, 'Fine grit')),
    seed: P.seed(8),
  },
  prepare: (p) => ({ bg: hexToLinear(p.background), cols: lin(p.colors), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.density, h3 = _h;
    const lod = detail(1 / 900, ctx.pixel);
    const speck = (hash01(mod(Math.floor(u * 900), 900), mod(Math.floor(v * 900), 900), p.seed) - 0.5) * 0.08 * lod;
    shade(out, s.bg, 1 + speck);
    // grit: tiny chips (3rd layer)
    if (p.grit > 0) {
      const n3 = n * 9;
      const g = chipLayer(u * n3, v * n3, n3, p.seed + 2, 0.22, 0.35 * p.grit, h3);
      mix(out, out, s.cols[g.id % s.cols.length], coverage(g.d / n3, ctx.px) * (0.5 + 0.5 * lod));
    }
    const n2 = n * 3;
    const c2 = chipLayer(u * n2, v * n2, n2, p.seed + 1, p.chipSize * 0.8, 0.7, h3);
    mix(out, out, s.cols[c2.id % s.cols.length], coverage(c2.d / n2, ctx.px));
    const c1 = chipLayer(u * n, v * n, n, p.seed, p.chipSize, 0.8, h3);
    const id1 = c1.id, d1 = c1.d;
    shade(_c, s.cols[id1 % s.cols.length], 0.93 + 0.12 * hash01(mod(Math.floor(u * 300), 300), mod(Math.floor(v * 300), 300), id1) + 0.04 * ((id1 >>> 8) & 1));
    mix(out, out, _c, coverage(d1 / n, ctx.px));
  },
};

// Halftone ---------------------------------------------------------------------------------------

const SCREENS = { '0°': [1, 0], '45°': [1, 1], '26.6°': [2, 1], '18.4°': [3, 1] };

const halftone = {
  id: 'halftone', name: 'Halftone screen', category: 'geometric', scale: 'cells',
  tags: ['graphics', 'pop-art', 'comic', 'print', 'retro', 'risograph'],
  description: 'Screen of dots, lines or squares whose size follows a periodic noise / wave / radial field. Screen angles use integer lattice vectors so the tile stays seamless.',
  features: (p) => [p.cells, p.cells, 'dots'],
  params: {
    cells: P.int(24, 4, 256, 'Dots across'), angle: P.enumOf('45°', Object.keys(SCREENS), 'Screen angle'),
    dot: P.enumOf('circle', ['circle', 'line', 'square', 'diamond'], 'Dot shape'),
    field: P.enumOf('noise', ['noise', 'waves', 'radial', 'flat'], 'Tone field'), tone: P.float(0.5, 0, 1, 'Tone (flat field)'),
    scale: P.int(2, 1, 16, 'Field frequency'), contrast: P.float(1.4, 0.2, 4, 'Contrast'),
    colors: P.colors(['#f7f1e3', '#e63946'], 'Paper, ink', '', 2, 2), seed: P.seed(4),
  },
  prepare: (p) => {
    const [a, b] = SCREENS[p.angle];
    const k = Math.max(1, Math.round(p.cells / Math.hypot(a, b)));
    return { a, b, k, c: lin(p.colors), p, f: noiseField({ freq: p.scale, octaves: 4, seed: p.seed }) };
  },
  sample(u, v, out, ctx, s) {
    const { a, b, k, p } = s;
    const S = (a * u + b * v) * k, T = (-b * u + a * v) * k;
    const L2 = (a * a + b * b) * k, sc = k * Math.hypot(a, b);
    // own cell + the 3 neighbours towards the sample: big (merging) dots are not clipped at cell edges
    const s0 = Math.floor(S), t0 = Math.floor(T);
    const si = S - s0 < 0.5 ? -1 : 1, ti = T - t0 < 0.5 ? -1 : 1;
    let d = 1e9;
    // neighbours' dots (radius ≤ 0.62) only reach ~0.12 into this cell: skip them in the middle
    const nearS = Math.abs(S - s0 - 0.5) > 0.37, nearT = Math.abs(T - t0 - 0.5) > 0.37;
    for (let q = 0; q < 4; q++) {
      if (q && ((q & 1 && !nearS) || (q & 2 && !nearT))) continue;
      const cs = s0 + (q & 1 ? si : 0) + 0.5, ct = t0 + (q & 2 ? ti : 0) + 0.5;
      const cu = (a * cs - b * ct) / L2, cv = (b * cs + a * ct) / L2;
      let f;
      if (p.field === 'flat') f = p.tone;
      else if (p.field === 'waves') f = 0.5 + 0.25 * Math.sin(TAU * p.scale * cu) + 0.25 * Math.sin(TAU * p.scale * (cv + 0.3 * Math.sin(TAU * cu)));
      else if (p.field === 'radial') { const dx = fract(cu * p.scale) - 0.5, dy = fract(cv * p.scale) - 0.5; f = 1 - Math.min(1, Math.hypot(dx, dy) * 2); }
      else f = s.f(cu, cv);
      f = clamp01(0.5 + (f - 0.5) * p.contrast);
      const ds = S - cs, dt = T - ct;
      let dd;
      if (p.dot === 'line') dd = Math.abs(dt) - f * 0.5; // line width ∝ tone
      else if (p.dot === 'square') dd = Math.max(Math.abs(ds), Math.abs(dt)) - Math.sqrt(f) * 0.5;
      else if (p.dot === 'diamond') dd = (Math.abs(ds) + Math.abs(dt) - Math.sqrt(f) * 0.72) * 0.7071;
      else dd = Math.hypot(ds, dt) - Math.sqrt(f) * 0.62; // area ∝ tone; 0.62 lets neighbours just merge at full tone
      if (dd < d) d = dd;
      if (p.dot === 'line' || p.dot === 'square') break; // these never cross their cell
    }
    mix(out, s.c[0], s.c[1], coverage(d / sc, ctx.px));
  },
};

// Contours ---------------------------------------------------------------------------------------

const contour = {
  id: 'contour-lines', name: 'Topographic contours', category: 'geometric', scale: 'levels',
  tags: ['graphics', 'map', 'outdoor', 'print', 'abstract'],
  description: 'Iso-lines of a periodic fbm field with constant on-screen width (gradient-normalised), thicker index lines every Nth level; optional hypsometric colour fill.',
  features: (p) => [p.scale, p.scale, 'hills'],
  params: {
    levels: P.int(14, 2, 64, 'Levels'), scale: P.int(2, 1, 16, 'Field frequency'),
    lineWidth: P.float(1.6, 0.3, 6, 'Line width (px @512)'), indexEvery: P.int(5, 0, 20, 'Index line every'),
    fill: P.bool(false, 'Hypsometric fill'),
    colors: P.colors(['#f3efe0', '#7a5c3e'], 'Ground, line', '', 2, 2),
    fillColors: P.colors(['#2b5f4a', '#7da36b', '#e6d8a6', '#c58b4e', '#f4efe6'], 'Fill ramp'),
    seed: P.seed(6),
  },
  prepare: (p) => ({ c: lin(p.colors), ramp: lin(p.fillColors), p, f: noiseField({ freq: p.scale, octaves: 4, gain: 0.45, seed: p.seed }) }),
  sample(u, v, out, ctx, s) {
    const p = s.p;
    const e = 1 / 2048;
    // fbm sits mostly in [0.3, 0.7]; stretch ×2.5 so 'levels' means visible levels
    const F = (a, b) => (s.f(a, b) - 0.5) * 2.5 + 0.5;
    const f = F(u, v);
    const fx = (F(u + e, v) - f) / e, fy = (F(u, v + e) - f) / e; // forward differences: 3 evals, not 5
    const t = f * p.levels, gl = Math.hypot(fx, fy) * p.levels + 1e-6;
    const k = Math.round(t);
    const d = Math.abs(t - k) / gl; // uv distance to nearest iso-line
    const isIndex = p.indexEvery > 0 && mod(k, p.indexEvery) === 0;
    const w = (p.lineWidth / 512) * (isIndex ? 2 : 1) * 0.5;
    if (p.fill) ramp(out, s.ramp, clamp01(Math.floor(t) / p.levels)); else shade(out, s.c[0]);
    mix(out, out, s.c[1], coverage(d - w, ctx.px));
    out[4] = clamp01(f);
  },
};

// Bricks / tiles ---------------------------------------------------------------------------------

const bricks = {
  id: 'bricks', name: 'Bricks / tiles', category: 'geometric', scale: 'cols',
  tags: ['graphics', 'game', 'wall', 'material', 'subway-tile', 'masonry'],
  description: 'Running, stack, Flemish or basket-weave bond with recessed mortar; every brick has its own tone, noisy pitted surface and slightly chipped edges, plus a bevelled height map (good for normal maps).',
  features: (p, s) => [p.cols, s.m, 'bricks'],
  params: {
    bond: P.enumOf('running', ['running', 'stack', 'flemish', 'basket'], 'Bond'),
    cols: P.int(4, 1, 64, 'Bricks per row'), rows: P.int(8, 2, 128, 'Rows (even for running)'),
    mortar: P.float(0.06, 0, 0.3, 'Mortar (brick-height units)'),
    colors: P.colors(['#9c4a33', '#b05a3c', '#8a3f2c', '#a8553b'], 'Brick colours'),
    mortarColor: P.color('#cfc6b8', 'Mortar'), roughness: P.float(0.5, 0, 1, 'Surface noise'),
    chipping: adv(P.float(0.4, 0, 1, 'Edge chipping')),
    seed: P.seed(9),
  },
  prepare: (p) => ({
    m: p.bond === 'stack' ? p.rows : evenInt(p.rows), c: lin(p.colors), mc: hexToLinear(p.mortarColor), p,
    rough: noiseField({ freq: 16, octaves: 4, seed: p.seed, range: 'signed' }),
    chip: noiseField({ freq: 48, octaves: 2, seed: p.seed + 5, range: 'signed' }),
  }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.cols, m = s.m;
    const Y = v * m, row = Math.floor(Y);
    let X = u * n, splitV = false;
    if (p.bond === 'running') X += mod(row, 2) ? 0.5 : 0;
    else if (p.bond === 'flemish') X = u * n * 1.5 + (mod(row, 2) ? 0.75 : 0); // stretcher + header alternating
    else if (p.bond === 'basket') splitV = ((Math.floor(u * n) + Math.floor(Y / 2)) & 1) === 1;
    // brick-local coords (fx, fy) and the brick's size in ROW units (one row = one standard brick height)
    let col = Math.floor(X), fx = X - col, fy = Y - row, bw = m / n, bh = 1, brow = row;
    if (p.bond === 'flemish') {
      // in each 1.5-wide unit: a stretcher (1.0) then a header (0.5)
      const unit = Math.floor(X / 1.5), w = X - unit * 1.5;
      if (w < 1) { fx = w; col = unit * 2; bw = m / (n * 1.5); }
      else { fx = (w - 1) / 0.5; col = unit * 2 + 1; bw = m / (n * 3); }
    } else if (p.bond === 'basket') {
      // 2×2 blocks of two bricks, alternating horizontal / vertical pairs
      const bx = u * n, by = Y / 2, ix = Math.floor(bx), iy = Math.floor(by);
      const lx = bx - ix, ly = by - iy;
      if (splitV) { col = ix * 2 + (lx < 0.5 ? 0 : 1); fx = (lx < 0.5 ? lx : lx - 0.5) * 2; fy = ly; bw = m / (2 * n); bh = 2; brow = iy * 2; }
      else { col = ix * 2; fx = lx; fy = fract(ly * 2); }
    }
    const nz = p.roughness * s.rough(u, v);
    const chip = p.chipping * 0.06 * s.chip(u, v);
    const dx = Math.min(fx, 1 - fx) * bw, dy = Math.min(fy, 1 - fy) * bh;
    const dEdge = Math.min(dx, dy) - p.mortar * 0.5 + chip; // in row units
    const wi = mod(col, p.bond === 'running' || p.bond === 'stack' ? n : n * 2), wj = mod(brow, m);
    const base = s.c[hashU32(wi, wj, p.seed) % s.c.length];
    // surface: per-brick tone, noise, a few pits
    const pit = (worley(u, v, n * 6, m * 3, p.seed + 3, 1, _wr).f1 < 0.12 ? -0.12 : 0) * p.roughness;
    shade(_c, base, 0.85 + 0.3 * hash01(wi, wj, p.seed ^ 5) + nz * 0.25 + pit);
    shade(_d, s.mc, 0.92 + nz * 0.15);
    // mortar is recessed: darker right under the brick edge
    const ao = 0.75 + 0.25 * smoothstep(-p.mortar * 0.5, 0, dEdge);
    _d[0] *= ao; _d[1] *= ao; _d[2] *= ao;
    // bevel light on the brick edge (top-left lit)
    const bev = smoothstep(0, 0.08, dEdge);
    const lightK = 1 + (1 - bev) * 0.18 * ((fy < 0.5 ? 1 : -1) * (dy < dx ? 1 : 0) + (fx < 0.5 ? 1 : -1) * (dx <= dy ? 1 : 0));
    shade(_c, _c, lightK);
    mix(out, _d, _c, coverage(-dEdge / m, ctx.px));
    out[4] = dEdge < 0 ? 0.1 : clamp01(0.4 + 0.55 * smoothstep(0, 0.15, dEdge) + nz * 0.15 + pit * 0.6);
  },
};
const _wr = { f1: 0, f2: 0, id: 0, dx: 0, dy: 0, cx: 0, cy: 0 };

// Grid paper -------------------------------------------------------------------------------------

const grid = {
  id: 'grid-paper', name: 'Grid paper (graph / dot / isometric)', category: 'geometric', scale: 'cells',
  tags: ['graphics', 'paper', 'notebook', 'blueprint', 'technical', 'typography'],
  description: 'Graph paper with minor and major lines, dot grid, or isometric (triangular) grid — backgrounds for type specimens, blueprints and notebooks. Lines keep a constant pixel width at any size.',
  features: (p) => [p.cells, p.cells, 'cells'],
  params: {
    style: P.enumOf('lines', ['lines', 'dots', 'isometric'], 'Style'),
    cells: P.int(16, 2, 256, 'Cells across'), majorEvery: P.int(4, 0, 16, 'Major line every (0 = none)'),
    lineWidth: P.float(1, 0.3, 6, 'Line width (px @512)'),
    colors: P.colors(['#f7f5ee', '#b9d4e8', '#6f9fc8'], 'Paper, minor line, major line', '', 3, 3),
  },
  prepare: (p) => {
    const n = p.majorEvery > 0 ? Math.max(1, Math.round(p.cells / p.majorEvery)) * p.majorEvery : p.cells;
    const K = Math.max(1, Math.round(n / SQRT3)); // isometric: row count fitted to the square tile
    return { n, K, c: lin(p.colors), p };
  },
  sample(u, v, out, ctx, s) {
    const p = s.p, n = s.n;
    const w = (p.lineWidth / 512) * 0.5, wMaj = w * 1.8;
    shade(out, s.c[0]);
    if (p.style === 'dots') {
      const fx = fract(u * n), fy = fract(v * n);
      const d = Math.hypot(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy)) / n;
      const ix = Math.round(u * n), iy = Math.round(v * n);
      const major = p.majorEvery > 0 && mod(ix, p.majorEvery) === 0 && mod(iy, p.majorEvery) === 0;
      mix(out, out, s.c[major ? 2 : 1], coverage(d - (major ? wMaj : w) * 2.6, ctx.px));
      return;
    }
    const lineSet = (a, scale) => {
      // distance (uv) to the nearest line of the family a = const, plus whether it is a major line
      const k = Math.round(a);
      return [Math.abs(a - k) / scale, p.majorEvery > 0 && mod(k, p.majorEvery) === 0];
    };
    const fams = [];
    if (p.style === 'lines') fams.push(lineSet(u * n, n), lineSet(v * n, n));
    else {
      // isometric: horizontal lines + two families at ±60° (exact on the fitted lattice)
      const rows = s.K * 2, Y = v * rows, X = u * n * 2;
      fams.push(lineSet(Y, rows));
      fams.push(lineSet((X + Y) / 2, Math.hypot(n, rows / 2)), lineSet((X - Y) / 2, Math.hypot(n, rows / 2)));
    }
    for (const [d, maj] of fams) if (!maj) mix(out, out, s.c[1], coverage(d - w, ctx.px));
    for (const [d, maj] of fams) if (maj) mix(out, out, s.c[2], coverage(d - wMaj, ctx.px));
  },
};

export default [stripes, checker, dots, chevron, argyle, honeycomb, truchet, scales, ogee, islamic, terrazzo, halftone, contour, bricks, grid];
