// Working prototypes of pattern ideas for texturelib / TypeLab. NOT part of the library: no params,
// presets or LOD yet. Each one shows that an idea works with the library's engines and how its maths
// goes. See TYPELAB_HANDOFF.md §4 for the formulas and what each still needs to become a real pattern.
//
//   node ideas/prototypes.mjs                 render all → ideas/out/<name>.png (git-ignored)
//   node ideas/prototypes.mjs damask ikat     render some
//   node ideas/prototypes.mjs --check         exact torus test: sample(u, v) == sample(u + k, v + m)
//   python3 ideas/make-sheets.py              ideas/out → ideas/renders/*.jpg + ideas/sheets/*.jpg
//
// Every prototype is a sample(u, v, out, ctx) on the unit torus with the library's v2 contract:
// out = [r, g, b, a, height], linear premultiplied colour (see CLAUDE.md "Pattern contract").
import { mkdirSync } from 'node:fs';
import { rasterize } from '../src/core/raster.js';
import { render } from '../src/index.js';
import { hexToLinear as L, mix, shade, ramp } from '../src/core/color.js';
import { hash01, hashU32 } from '../src/core/hash.js';
import { clamp01, coverage, fract, mod, smoothstep, TAU, SQRT3, sdSegment, lambert, evenInt } from '../src/core/math.js';
import { noiseField, valueNoise, warpField, worley } from '../src/core/noise.js';
import { weaveState, weaveSample, drafts } from '../src/patterns/woven.js';
import { resolveParams } from '../src/core/params.js';
import { writePNG } from '../tools/png.mjs';
import knitx from './knit-lace-proto.js';

const OUT = new URL('./out/', import.meta.url).pathname;
const SIZE = 320;
const _c = [0, 0, 0, 0], _d = [0, 0, 0, 0], _w = [0, 0];
const W = { f1: 0, f2: 0, id: 0, dx: 0, dy: 0, cx: 0, cy: 0 };

/** name → { size, make: () => sample, backdrop? } (sample-based) or { image: () => img } (library render) */
const protos = {};
/** A prototype: make() builds state once and returns sample(u, v, out, ctx). backdrop: colour shown through alpha holes in the renders. */
const proto = (name, size, make, backdrop) => (protos[name] = { size, make, backdrop });
/** A prototype that is only a library render with settings (works in TypeLab today). */
const viaLibrary = (name, image) => (protos[name] = { image });

// ---- 5×7 pixel font for text charts (a real version would rasterise TypeLab's font to a bitmap)
const FONT = {
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
};
/** text lines → grid of 0/1 (rows of columns), centred in a Wd×Ht canvas */
function textGrid(lines, Wd, Ht, lineGap = 3) {
  const g = Array.from({ length: Ht }, () => Array(Wd).fill(0));
  const total = lines.length * 7 + (lines.length - 1) * lineGap;
  let y0 = Math.floor((Ht - total) / 2);
  for (const line of lines) {
    const w = line.length * 5 + (line.length - 1);
    let x0 = Math.floor((Wd - w) / 2);
    for (const ch of line) {
      const f = FONT[ch];
      for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (f[y][x] === '1') g[y0 + y][x0 + x] = 1;
      x0 += 6;
    }
    y0 += 7 + lineGap;
  }
  return g;
}

// =================================================================== KNIT / CROCHET / WEAVE
// Knitted words: text → 0/1/2 Fair Isle chart rows joined with '/'. Works in TypeLab today (tx-fair-isle, chart: custom).
viaLibrary('knitted-word', () => {
  const g = textGrid(['TYPE'], 27, 11);
  const band = '2'.repeat(27), dots = Array.from({ length: 27 }, (_, i) => (i % 2 ? '0' : '2')).join('');
  const rows = [band, dots, ...g.map((r) => r.join('')), dots, band];
  return render('fair-isle', { width: SIZE, params: { chart: 'custom', customChart: rows.join('/'), colors: ['#f1ebdd', '#b3202a', '#1d3557'], stitchesAcross: 27 } });
});

// Jacquard: the weave structure is chosen per crossing by a mask. Inside the mask the warp floats (8-shaft
// satin, gold warp shows), outside the weft floats (sateen, wine weft shows). Same draft engine as every weave.
proto('woven-letters', 576, () => {
  const N = 24, k = 4, g = textGrid(['TYPE', 'LAB'], N, N); // 96 threads: a multiple of the 8-shaft satin
  const warpS = drafts.satin(8, 'warp'), weftS = drafts.satin(8, 'weft');
  const draft = { w: N * k, h: N * k, up: (p, e) => (g[Math.floor(p / k)][Math.floor(e / k)] ? warpS.up(p, e) : weftS.up(p, e)) };
  const st = weaveState(draft, [L('#e8c25a')], [L('#5a1020')], { repeats: 1, yarnGap: 0.05, irregularity: 0.15, twist: 0.25, sheen: 0.55, slub: 0, seed: 3 });
  return (u, v, o, c) => weaveSample(u, v, o, c, st);
});

// Damask: same trick with an ornamental mask (ogee lattice + rosettes), one colour, the figure shows by sheen.
proto('damask', 420, () => {
  const N = 90; // threads per tile, a multiple of 5 (satin) and of 2 (the 2×2 motif repeat)
  const warpS = drafts.satin(5, 'warp'), weftS = drafts.satin(5, 'weft');
  const motif = (x, y) => {
    const X = x * 2, Y = y * 2, fx = fract(X), fy = fract(Y);
    const s = Math.sin(Math.PI * fy), gg = Math.abs(fx - 0.5) - 0.5 * s * s; // ogee: |x − ½| = ½ sin²(πy)
    if (Math.abs(gg) < 0.035) return 1;
    for (const [cx, cy] of [[0.5, 0.5], [0, 0], [1, 0], [0, 1], [1, 1]]) {
      const dx = fx - cx, dy = fy - cy, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const petal = 0.2 * (0.55 + 0.45 * Math.abs(Math.cos(2.5 * a))); // 5-petal rosette r(θ)
      if (r < petal && r > 0.045) return 1;
      if (r < 0.025) return 1;
    }
    return 0;
  };
  const draft = { w: N, h: N, up: (p, e) => (motif((e + 0.5) / N, (p + 0.5) / N) ? warpS.up(p, e) : weftS.up(p, e)) };
  const st = weaveState(draft, [L('#c4506c')], [L('#5e1129')], { repeats: 1, yarnGap: 0.03, irregularity: 0.1, twist: 0.15, sheen: 0.8, slub: 0, seed: 5 });
  return (u, v, o, c) => weaveSample(u, v, o, c, st);
});

// Ikat: warp threads are resist-dyed in bundles before weaving; each thread's dye is shifted a little,
// so motif edges feather. Implemented as a per-(thread, pick) warp colour function.
proto('ikat', SIZE, () => {
  const red = L('#b8322a'), mustard = L('#e0a63a'), cream = L('#efe3cc');
  const st = weaveState(drafts.twill(3, 1, 'Z'), [cream], [L('#1d2b4f')], { repeats: 30, yarnGap: 0.06, irregularity: 0.4, twist: 0.4, sheen: 0.05, slub: 0.3, seed: 9 }, {
    warpColor: (e, pk) => {
      const off = Math.floor(hash01(e, 1, 7) * 7) - 3; // dye shift per warp thread: −3…3 picks
      const x = mod(e, 40) - 20, y = mod(pk + off, 40) - 20, d = Math.abs(x) + Math.abs(y) * 0.8; // diamond motif, 40-thread repeat
      if (d < 6) return mustard;
      if (d > 9 && d < 16) return red;
      return cream;
    },
  });
  return (u, v, o, c) => weaveSample(u, v, o, c, st);
});

const knitP = (id, params) => () => {
  const pat = knitx.find((p) => p.id === id);
  const st = pat.prepare(resolveParams(pat.params, params));
  return (u, v, o, c) => pat.sample(u, v, o, c, st);
};
proto('lace-knit', SIZE, knitP('lace-knit', { stitchesAcross: 20 }), L('#0c1018')); // holes are alpha 0
proto('brioche', SIZE, knitP('brioche', { stitchesAcross: 14 }));

// Filet crochet: a chart of filled blocks (4 posts) and open mesh (2 posts) under a chain band per row.
proto('filet-crochet', SIZE, () => {
  const chart = ['00000000000000', '00000000000000', '00111000011100', '01111100111110', '01111111111110', '01111111111110', '00111111111100', '00011111111000',
    '00001111110000', '00000111100000', '00000011000000', '00000000000000', '00000000000000', '00000000000000'].map((r) => [...r].map(Number));
  const N = 14, thread = L('#f4efe3');
  const post = (x, cx, w) => { const a = Math.abs(x - cx); return a < w ? Math.sqrt(1 - (a / w) ** 2) : -1; }; // round cord profile
  return (u, v, out, ctx) => {
    const X = u * N, Y = v * N, i = Math.floor(X), j = Math.floor(Y), fx = X - i, fy = Y - j;
    const filled = chart[mod(j, N)][mod(i, N)];
    let prof = -1, along = 0, isBand = false;
    const bandD = Math.abs(fy - 0.1); // chain / stitch heads across the top of every row
    if (bandD < 0.095) { prof = Math.sqrt(1 - (bandD / 0.095) ** 2); along = fx * 3; isBand = true; }
    const w = filled ? 0.175 : 0.11; // posts at both cell edges, two more inside filled blocks
    for (const cx of filled ? [0, 1 / 3, 2 / 3, 1] : [0, 1]) {
      const pp = post(fx, cx, w);
      if (pp > prof && fy > 0.12) { prof = pp; along = fy * 2.2 + (fx - cx) * 2; isBand = false; }
    }
    if (prof < 0) { out[0] = out[1] = out[2] = out[3] = 0; out[4] = 0; return; } // open mesh: transparent
    const twist = isBand ? 0.82 + 0.18 * Math.abs(Math.sin(Math.PI * along * 2)) : 0.85 + 0.15 * Math.sin(TAU * (along * 3));
    shade(out, thread, (0.45 + 0.55 * prof) * twist);
    out[4] = prof;
  };
}, L('#2b3a55'));

// =================================================================== ORNAMENT & FORMULAS
// Hitomezashi: one bit per row b[j] and per column c[i]. Row j has a horizontal stitch over [i, i+1] when
// (i + b[j]) is even; column i a vertical stitch over [j, j+1] when (j + c[i]) is even. The regions are
// 2-colourable by crossing parity; on a torus that needs an even number of 0-bits (and of 1-bits) in b and c.
proto('hitomezashi', SIZE, () => {
  const N = 20, b = [], c = [];
  for (let k = 0; k < N; k++) { b.push(hashU32(k, 1, 11) & 1); c.push(hashU32(k, 2, 11) & 1); }
  const evenZeros = (a) => { if (a.filter((x) => x === 0).length % 2) a[N - 1] ^= 1; }; // N even → ones even too
  evenZeros(b); evenZeros(c);
  b.push(b[0]); c.push(c[0]);
  // region parity: walk along row 0 to column i (count vertical stitches crossed), then up column i
  const XV = [0]; for (let i = 1; i <= N; i++) XV[i] = XV[i - 1] ^ (c[i] % 2 === 0 ? 1 : 0);
  const P0 = [0], P1 = [0]; for (let j = 1; j <= N; j++) { P0[j] = P0[j - 1] ^ (b[j] === 0 ? 1 : 0); P1[j] = P1[j - 1] ^ (b[j] === 1 ? 1 : 0); }
  const indigo = L('#1f2f56'), indigo2 = L('#2b4170'), white = L('#f3efe6');
  const seg = (along, d) => Math.hypot(Math.max(0.12 - along, along - 0.88, 0), d); // capsule distance
  return (u, v, out, ctx) => {
    const X = u * N, Y = v * N, i = mod(Math.floor(X), N), j = mod(Math.floor(Y), N), fx = fract(X), fy = fract(Y);
    const parity = XV[i] ^ (i % 2 === 0 ? P0[j] : P1[j]);
    shade(out, parity ? indigo2 : indigo, 0.95 + 0.05 * Math.sin(TAU * u * 160) * Math.sin(TAU * v * 160));
    let d = 9;
    if ((i + b[j]) % 2 === 0) d = Math.min(d, seg(fx, fy));
    if ((i + b[j + 1]) % 2 === 0) d = Math.min(d, seg(fx, 1 - fy));
    if ((j + c[i]) % 2 === 0) d = Math.min(d, seg(fy, fx));
    if ((j + c[i + 1]) % 2 === 0) d = Math.min(d, seg(fy, 1 - fx));
    const r = 0.075, q = clamp01(d / r);
    shade(_c, white, 0.6 + 0.4 * Math.sqrt(1 - q * q));
    mix(out, out, _c, coverage((d - r) / N, ctx.px));
  };
});

// Sashiko shippō: circles of radius 1/√2 centred on every lattice point, drawn as a running stitch.
proto('sashiko-shippo', SIZE, () => {
  const N = 5, R = Math.SQRT1_2, white = L('#f3efe6'), indigo = L('#1b2a4a');
  return (u, v, out, ctx) => {
    const X = u * N, Y = v * N, i0 = Math.floor(X), j0 = Math.floor(Y);
    shade(out, indigo, 0.94 + 0.06 * Math.sin(TAU * u * 150) * Math.sin(TAU * v * 150));
    let best = 9, ang = 0;
    for (let a = -1; a <= 2; a++) for (let b = -1; b <= 2; b++) {
      const dx = X - (i0 + a), dy = Y - (j0 + b), d = Math.abs(Math.hypot(dx, dy) - R);
      if (d < best) { best = d; ang = Math.atan2(dy, dx); }
    }
    const t = fract((ang / TAU) * 16 + 0.25); // 16 dashes per circle
    const along = Math.min(t, 1 - t), dash = Math.max(0, 0.18 - along) * R * 6.3 / 16;
    const d = Math.hypot(best, Math.max(0, dash)) - 0.03;
    shade(_c, white, 0.85);
    mix(out, out, _c, coverage(d / N, ctx.px));
  };
});

// Kumiko asanoha: triangular lattice (fitted to the square tile with an even row count); in each triangle
// the 3 edges (thick) and the 3 centroid→vertex spokes (thin) are wooden strips.
proto('kumiko-asanoha', SIZE, () => {
  const N = 4, K = evenInt(N * 2 / SQRT3), h = SQRT3 / 2;
  const wood = L('#e2c391'), dark = L('#2a1c12');
  const P = (r, s) => [r + 0.5 * s, s * h];
  return (u, v, out, ctx) => {
    const x = u * N, y = v * K * h;
    const s = y / h, r = x - 0.5 * s, i = Math.floor(r), j = Math.floor(s), fr = r - i, fs = s - j;
    const up = fr + fs < 1;
    const A = up ? P(i, j) : P(i + 1, j), B = up ? P(i + 1, j) : P(i + 1, j + 1), C = P(i, j + 1);
    const gx = (A[0] + B[0] + C[0]) / 3, gy = (A[1] + B[1] + C[1]) / 3;
    const dEdge = Math.min(sdSegment(x, y, A[0], A[1], B[0], B[1]), sdSegment(x, y, B[0], B[1], C[0], C[1]), sdSegment(x, y, C[0], C[1], A[0], A[1]));
    const dIn = Math.min(sdSegment(x, y, gx, gy, A[0], A[1]), sdSegment(x, y, gx, gy, B[0], B[1]), sdSegment(x, y, gx, gy, C[0], C[1]));
    shade(out, dark);
    const wE = 0.05, wI = 0.028;
    const grain = 0.9 + 0.1 * valueNoise(u * 400, v * 40, 400, 40, 3);
    const tE = clamp01(1 - dEdge / wE), tI = clamp01(1 - dIn / wI);
    shade(_c, wood, (0.7 + 0.3 * Math.sqrt(Math.max(tE, tI))) * grain);
    mix(out, out, _c, coverage(Math.min(dEdge - wE, dIn - wI) / N, ctx.px));
  };
});

// Guilloché: N stacked lines y_k = (k + ½)/N + A·sin(2π f u + phase + 2π k φ / N), integer f and φ, two
// families; distance to a curve ≈ |v − y| / √(1 + y′²).
proto('guilloche', SIZE, () => {
  const N = 40, A = 0.055, f = 3, paper = L('#f1eedd'), green = L('#1d5b4a'), rust = L('#8a3d2b');
  const fam = (u, v, phase, phi) => {
    let best = 9;
    const k0 = Math.round(v * N - 0.5);
    for (let k = k0 - 4; k <= k0 + 4; k++) {
      const arg = TAU * f * u + phase + (TAU * k * phi) / N;
      const y = (k + 0.5) / N + A * Math.sin(arg), slope = A * TAU * f * Math.cos(arg);
      const d = Math.abs(v - y) / Math.sqrt(1 + slope * slope);
      if (d < best) best = d;
    }
    return best;
  };
  return (u, v, out, ctx) => {
    shade(out, paper, 0.96 + 0.04 * Math.cos(TAU * (u + v)));
    mix(out, out, rust, coverage(fam(u, v, Math.PI, -2) - 0.0011, ctx.px) * 0.85);
    mix(out, out, green, coverage(fam(u, v, 0, 2) - 0.0011, ctx.px));
  };
});

// Paper marbling (Jaffer & Lu, "Mathematical marbling"): a tine stroke along a line moves ink by
// z = αλ/(d + λ) (d = distance to the line). Render by applying the INVERSE strokes, last first, to (u, v),
// then reading the initial ink bands. Integer tine counts keep it periodic.
proto('paper-marbling', SIZE, () => {
  const cols = ['#1d3557', '#e63946', '#f1faee', '#a8dadc', '#457b9d', '#f4a261', '#f1faee', '#1d3557'].map(L);
  const widths = [3, 2, 1, 2, 3, 1, 1, 2]; const tot = widths.reduce((a, b) => a + b); let acc = 0;
  const edges = widths.map((w) => (acc += w) / tot);
  const wob = noiseField({ freq: 3, octaves: 3, seed: 4, range: 'signed' });
  const T1 = 10, a1 = 0.11, l1 = 0.012, T2 = 28, a2 = 0.035, l2 = 0.005;
  return (u, v, out) => {
    // last stroke: horizontal comb (28 tines) pulling along u
    let t = Math.round(v * T2 - 0.5), d = Math.abs(v - (t + 0.5) / T2);
    u -= (a2 * l2) / (d + l2);
    // first stroke: vertical rake (10 tines), alternate tines pull opposite ways (gel-git / nonpareil)
    t = Math.round(u * T1 - 0.5); d = Math.abs(u - (t + 0.5) / T1);
    v -= (mod(t, 2) ? -1 : 1) * (a1 * l1) / (d + l1);
    const b = fract(v * 2 + 0.02 * wob(u, v));
    let k = 0; while (k < edges.length - 1 && b >= edges[k]) k++;
    shade(out, cols[k], 0.97 + 0.06 * valueNoise(u * 200, v * 200, 200, 200, 2));
  };
});

// Wallpaper groups: fold (x, y) into the group's fundamental domain, then draw ONE motif there.
const gold = L('#e9c46a'), navy = L('#14213d'), coral = L('#e76f51'), teal = L('#2a9d8f');
function motifSDF(x, y) { // drawn in the fundamental region (cell units, centred cell)
  const leaf = (px, py, ax, ay, bx, by, w) => { // vesica along a segment
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    const t = ((px - ax) * ux + (py - ay) * uy) / len, n = Math.abs(-(px - ax) * uy + (py - ay) * ux) / len;
    const half = w * Math.sin(Math.PI * clamp01(t));
    return t < 0 || t > 1 ? 9 : (n - half) * len;
  };
  return [leaf(x, y, 0.06, 0.02, 0.46, 0.16, 0.22), Math.hypot(x - 0.42, y - 0.42) - 0.06, Math.abs(Math.hypot(x - 0.5, y - 0.5) - 0.3) - 0.025];
}
function wallpaper(fold) {
  const N = 3;
  return () => (u, v, out, ctx) => {
    let x = fract(u * N) - 0.5, y = fract(v * N) - 0.5;
    [x, y] = fold(x, y);
    const [d1, d2, d3] = motifSDF(x, y);
    shade(out, navy);
    mix(out, out, teal, coverage(d3 / N, ctx.px));
    mix(out, out, gold, coverage(d1 / N, ctx.px));
    mix(out, out, coral, coverage(d2 / N, ctx.px));
  };
}
proto('wallpaper-p4m', SIZE, wallpaper((x, y) => { x = Math.abs(x); y = Math.abs(y); return y > x ? [y, x] : [x, y]; })); // mirrors + diagonal mirror
proto('wallpaper-p4', SIZE, wallpaper((x, y) => { for (let k = 0; k < 4 && !(x >= 0 && y > 0); k++) [x, y] = [y, -x]; return [x, y]; })); // 90° rotations only

// Quasicrystal approximant: Σ cos(2π(a u + b v)) over integer vectors (a, b) ≈ R·(cos πj/n, sin πj/n).
proto('quasicrystal', SIZE, () => {
  const n = 7, R = 9, ks = [];
  for (let j = 0; j < n; j++) ks.push([Math.round(R * Math.cos((Math.PI * j) / n)), Math.round(R * Math.sin((Math.PI * j) / n))]);
  const pal = ['#0b132b', '#3a506b', '#5bc0be', '#f2e9e4', '#c9ada7'].map(L);
  return (u, v, out) => {
    let f = 0;
    for (const [a, b] of ks) f += Math.cos(TAU * (a * u + b * v));
    ramp(out, pal, fract((f / n) * 1.5 + 0.5));
  };
});

// Op-art (Riley-style): N lines displaced by A(u)·sin(2π f u); AA via the gradient magnitude of t.
proto('op-art-waves', SIZE, () => {
  const N = 36, f = 5, black = L('#111111'), white = L('#f4f1ea');
  return (u, v, out, ctx) => {
    const Au = 2.4 * (0.5 - 0.5 * Math.cos(TAU * u)), dA = 2.4 * 0.5 * TAU * Math.sin(TAU * u);
    const t = N * v + Au * Math.sin(TAU * f * u);
    const g = Math.hypot(N, dA * Math.sin(TAU * f * u) + Au * TAU * f * Math.cos(TAU * f * u));
    const ft = fract(t), d = Math.min(ft, 1 - ft, Math.abs(ft - 0.5)) / g;
    const inBlack = ft < 0.5;
    mix(out, inBlack ? white : black, inBlack ? black : white, clamp01(0.5 + d / ctx.px));
  };
});

// Superformula (Gielis): r(φ) = (|cos(mφ/4)|^n2 + |sin(mφ/4)|^n3)^(−1/n1), one random shape per cell.
proto('superformula', SIZE, () => {
  const N = 5, cells = [], pal = ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'].map(L), bg = L('#f6f1e7');
  const sf = (phi, c) => Math.pow(Math.pow(Math.abs(Math.cos((c.m * phi) / 4)), c.n2) + Math.pow(Math.abs(Math.sin((c.m * phi) / 4)), c.n3), -1 / c.n1);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const hh = (k) => hash01(i, j * 7 + k, 21);
    const c = { m: [3, 4, 5, 6, 7, 8][Math.floor(hh(0) * 6)], n1: 0.25 + hh(1) * 2.5, n2: 0.4 + hh(2) * 3, n3: 0.4 + hh(2) * 3, rot: hh(3) * TAU, col: pal[Math.floor(hh(4) * pal.length)] };
    let mx = 0; for (let k = 0; k < 256; k++) mx = Math.max(mx, sf((k / 256) * TAU, c));
    c.norm = 1 / mx; cells.push(c);
  }
  return (u, v, out, ctx) => {
    const X = u * N, Y = v * N, i = Math.floor(X), j = Math.floor(Y);
    const c = cells[mod(j, N) * N + mod(i, N)];
    const dx = X - i - 0.5, dy = Y - j - 0.5, r = Math.hypot(dx, dy), phi = Math.atan2(dy, dx) + c.rot;
    const d = (r - 0.42 * sf(phi, c) * c.norm) * 0.7; // radial distance, scaled: an approximate SDF
    shade(out, bg);
    mix(out, out, c.col, coverage(d / N, ctx.px));
  };
});

// =================================================================== MATERIALS
// brushed metal: value noise stretched 100:1 along v
const brushed = (u, v, base, k = 1) => shade(_d, base, 0.9 + 0.1 * k * valueNoise(u * 6, v * 600, 6, 600, 3) + 0.04 * valueNoise(u * 2, v * 90, 2, 90, 4));

// Tread plate: lens-shaped raised bars, ±45° alternating in a checkerboard (even N), with a soft offset shadow.
proto('diamond-plate', SIZE, () => {
  const N = 8, metal = L('#b9bec4');
  return (u, v, out, ctx) => {
    const X = u * N, Y = v * N, i = Math.floor(X), j = Math.floor(Y);
    const x = X - i - 0.5, y = Y - j - 0.5;
    const s = (i + j) & 1 ? -1 : 1, c = Math.SQRT1_2;
    const a = (x + s * y) * c, b = (-s * x + y) * c; // along / across the bar
    const len = 0.36, wmax = 0.11;
    const ta = clamp01(Math.abs(a) / len), half = wmax * Math.sqrt(Math.max(0, 1 - ta * ta)); // lens half-width
    const dd = Math.abs(a) > len ? 9 : Math.abs(b) - half;
    brushed(u, v, metal);
    shade(out, _d, 1);
    const shadowD = Math.abs(a) > len + 0.04 ? 9 : Math.abs(-s * (x - 0.025) * c + (y - 0.035) * c) - half * 1.15; // shadow down-right
    shade(out, out, 0.85 + 0.15 * smoothstep(-0.02, 0.05, shadowD));
    if (dd < 0.01) {
      const q = clamp01(Math.abs(b) / Math.max(half, 1e-3)), prof = Math.sqrt(1 - q * q);
      const nb = Math.sign(b) * q * 1.6, na = Math.sign(a) * ta * 0.8;
      const nx = (na - s * nb) * c, ny = (s * na + nb) * c;
      const lit = lambert(nx, ny), spec = Math.pow(clamp01((lit - 0.75) / 0.6), 3) * 0.6; // lambert() ≈ 0…1.5
      shade(_c, metal, (0.5 + 0.5 * lit) * (0.92 + 0.1 * prof) + spec);
      mix(out, out, _c, coverage(dd / N, ctx.px));
      out[4] = 0.5 + 0.5 * prof;
    }
  };
});

// Perforated metal: staggered round holes (even row count), chamfered rim lit on the side facing the light, holes transparent.
proto('perforated-metal', SIZE, () => {
  const N = 10, R = 0.27, steel = L('#9aa0a7');
  return (u, v, out, ctx) => {
    const Y = v * N, j = Math.floor(Y), X = u * N + (j & 1 ? 0.5 : 0), i = Math.floor(X);
    const dx = X - i - 0.5, dy = Y - j - 0.5, r = Math.hypot(dx, dy);
    brushed(u, v, steel);
    shade(out, _d, 1);
    const rim = clamp01((R + 0.06 - r) / 0.06); // chamfer: the inside edge facing the light catches it
    if (rim > 0) { const facing = (dx * 0.6 + dy * 0.75) / (r + 1e-6); shade(out, out, 1 + 0.45 * facing * rim); }
    const a = 1 - coverage((r - R) / N, ctx.px); // hole = alpha 0, antialiased
    if (a < 1) { out[0] *= a; out[1] *= a; out[2] *= a; out[3] = a; }
  };
}, L('#1a1c20'));

// Knurling: two crossing groove sets (u+v, u−v) give square pyramids; facet normal from the dominant axis.
proto('knurling', SIZE, () => {
  const N = 12, metal = L('#a7adb4'), Lx = -0.32, Ly = -0.72, Lz = 0.62;
  return (u, v, out) => {
    const a = (u + v) * N, b = (u - v) * N, fa = fract(a) - 0.5, fb = fract(b) - 0.5;
    let ga = 0, gb = 0;
    if (Math.abs(fa) > Math.abs(fb)) ga = -2 * Math.sign(fa); else gb = -2 * Math.sign(fb);
    const hgt = 1 - 2 * Math.max(Math.abs(fa), Math.abs(fb)); // pyramid height
    const k = 0.5, nx = -(ga + gb) * k, ny = -(ga - gb) * k, inv = 1 / Math.hypot(nx, ny, 1);
    const ndl = Math.max(0, (nx * Lx + ny * Ly + Lz) * inv);
    const ndh = Math.max(0, (nx * -0.16 + ny * -0.36 + 0.92) * inv);
    const groove = smoothstep(0, 0.25, hgt); // grooves collect dirt / shadow
    const brush = 0.95 + 0.05 * valueNoise(u * 300, v * 8, 300, 8, 2);
    shade(out, metal, (0.18 + 0.75 * ndl) * (0.55 + 0.45 * groove) * brush + 0.5 * Math.pow(ndh, 18) + 0.08 * hgt);
    out[4] = hgt;
  };
});

// Fur by line integral convolution: average fine periodic noise along a streamline of a periodic angle field.
proto('fur-lic', SIZE, () => {
  const ang = noiseField({ freq: 3, octaves: 3, seed: 8, range: 'signed' }), tone = noiseField({ freq: 4, octaves: 3, seed: 9 });
  const G = 220, steps = 18, ds = 0.0035;
  const pal = ['#2b1a10', '#6b4426', '#b07a46', '#e3b98a'].map(L);
  const dir = (u, v) => Math.PI / 2 + 2.2 * ang(u, v); // mostly downward, with swirls
  return (u, v, out) => {
    let acc = 0, wsum = 0;
    for (const sgn of [1, -1]) {
      let x = u, y = v;
      for (let k = 0; k < steps; k++) {
        const a = dir(x, y), w = 1 - k / steps;
        acc += (valueNoise(x * G, y * G, G, G, 5) * 0.5 + 0.5) * w; wsum += w;
        x += sgn * ds * Math.cos(a); y += sgn * ds * Math.sin(a);
      }
    }
    const s = clamp01(0.5 + (acc / wsum - 0.5) * 3.2); // contrast
    ramp(out, pal, clamp01(0.15 + 0.6 * s + 0.35 * (tone(u, v) - 0.5)));
  };
});

// Caustics: two domain-warped Worley networks; light concentrates on thin cell borders (F2 − F1 ≈ 0), brightest where both cross.
proto('water-caustics', SIZE, () => {
  const wf = warpField(0.09, 2, 3, 3), wf2 = warpField(0.08, 3, 7, 3), depth = noiseField({ freq: 2, octaves: 3, seed: 5 });
  const deep = L('#08455e'), mid = L('#127a96'), light = L('#e8fdff');
  return (u, v, out) => {
    wf(u, v, _w); worley(_w[0], _w[1], 5, 5, 3, 1, W);
    const e1 = W.f2 - W.f1;
    wf2(u, v, _w); worley(_w[0], _w[1], 7, 7, 8, 1, W);
    const e2 = W.f2 - W.f1;
    const c1 = Math.exp(-e1 * 28), c2 = Math.exp(-e2 * 30);
    const c = 0.55 * c1 + 0.45 * c2 + 0.9 * c1 * c2;
    mix(out, deep, mid, depth(u, v));
    mix(out, out, light, clamp01(c * 0.9));
  };
});

// Carbon fibre: only twill settings. Works in TypeLab today (tx-twill).
viaLibrary('carbon-fibre', () => render('twill', { width: SIZE, params: { over: 2, under: 2, warp: '#121315', weft: '#17181b', sheen: 1, yarnGap: 0.01, twist: 0, irregularity: 0.03, slub: 0, repeats: 8 } }));

// =================================================================== run
const args = process.argv.slice(2), check = args.includes('--check'), want = args.filter((a) => !a.startsWith('--'));
const selected = Object.entries(protos).filter(([name]) => !want.length || want.includes(name));

if (check) {
  // the library's strictest invariant: exact periodicity, plus no NaN and alpha/height in [0, 1]
  const ctx = { px: 1 / 640, pixel: 1 / 320, width: 320, height: 320, ss: 2, tileW: 320, tileH: 320 };
  const a = new Float64Array(5), b = new Float64Array(5);
  const fill = (o) => { o[0] = o[1] = o[2] = 0; o[3] = 1; o[4] = 0.5; };
  let failed = 0;
  for (const [name, p] of selected) {
    if (!p.make) { console.log(`${name.padEnd(18)} library render (covered by npm test)`); continue; }
    const sample = p.make();
    let bad = '', worst = 0;
    for (let n = 0; n < 400 && !bad; n++) {
      const u = hash01(n, 1, 99), v = hash01(n, 2, 99), k = (n % 5) - 2, m = ((n * 3) % 5) - 2;
      fill(a); sample(u, v, a, ctx);
      fill(b); sample(u + k, v + m, b, ctx);
      for (let q = 0; q < 5; q++) {
        if (!Number.isFinite(a[q])) bad = `NaN/Infinity in channel ${q}`;
        worst = Math.max(worst, Math.abs(a[q] - b[q]));
      }
      if (a[3] < 0 || a[3] > 1 || a[4] < -1e-9 || a[4] > 1 + 1e-9) bad = `alpha/height out of range at (${u.toFixed(3)}, ${v.toFixed(3)})`;
    }
    if (!bad && worst > 1e-6) bad = `not periodic: max difference ${worst.toExponential(2)}`;
    console.log(`${name.padEnd(18)} ${bad ? 'FAIL  ' + bad : 'ok (periodic, finite, in range)'}`);
    if (bad) failed++;
  }
  process.exit(failed ? 1 : 0);
}

mkdirSync(OUT, { recursive: true });
for (const [name, p] of selected) {
  const t = performance.now();
  let img;
  if (p.image) img = p.image();
  else {
    let sample = p.make();
    if (p.backdrop) { // composite over a backdrop so the transparent holes read in the renders
      const inner = sample, bg = p.backdrop;
      sample = (u, v, o, c) => { inner(u, v, o, c); const k = 1 - o[3]; o[0] += bg[0] * k; o[1] += bg[1] * k; o[2] += bg[2] * k; o[3] = 1; };
    }
    img = rasterize(p.size, p.size, sample, { supersample: 2 });
  }
  writePNG(OUT + name + '.png', { width: img.width, height: img.height, data: img.data || img.color });
  console.log(name.padEnd(18), Math.round(performance.now() - t) + ' ms');
}
