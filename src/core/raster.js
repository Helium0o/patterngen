// Rasteriser: turns a pattern's sample(u, v) function into RGBA buffers.
//
// Coordinate contract (every pattern relies on this):
//   * u, v are in [0, 1). The pattern is a function on the unit TORUS, i.e. sample(u, v) ===
//     sample(u + 1, v) === sample(u, v + 1). That is what makes every output seamless.
//   * v grows downward (screen space).
//   * One pattern period ("tile") is always SQUARE in pattern space. A non-square output holds an
//     integer number of tiles across/down (opts.tiles), so nothing is stretched.
//   * ctx.pixel = size of one output pixel in uv units, ctx.px = one SUBpixel (pixel / ss).
//     Use ctx.px for analytic antialiasing and ctx.pixel for level-of-detail (math.detail()).
//
// sample() writes into `out` (Float64Array(5)), pre-filled with [0, 0, 0, 1, 0.5]:
//   out[0..2] = LINEAR rgb, PREMULTIPLIED by alpha;  out[3] = alpha 0..1;  out[4] = height 0..1
//   (0.5 = flat). Samples are averaged in linear premultiplied space, then un-premultiplied and
//   encoded to sRGB 8-bit (straight alpha, the format of ImageData / PNG).

import { linearToSrgb } from './color.js';
import { clamp } from './math.js';

const LUT_N = 8192;
const LUT = new Float32Array(LUT_N + 2);
for (let i = 0; i <= LUT_N + 1; i++) LUT[i] = linearToSrgb(Math.min(1, i / LUT_N)) * 255;

/** Linear 0..1 -> sRGB 0..255 float (caller adds dither; Uint8ClampedArray rounds + clamps). */
function encode(c) {
  if (!(c > 0)) return 0;
  if (c >= 1) return 255;
  const x = c * LUT_N, i = x | 0;
  return LUT[i] + (LUT[i + 1] - LUT[i]) * (x - i);
}

/** Deterministic per-pixel dither in [-0.5, 0.5) (8-bit LSB units): removes banding in gradients. */
function dither(i, j) {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j + 0x9e37, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 8) & 0xffff) / 65536 - 0.5;
}

// Sub-pixel sample positions. ss=2 uses a rotated grid (RGSS): same cost as a 2×2 grid but much
// better on near-horizontal/vertical edges, which textiles are full of.
const PATTERNS_SS = {
  1: [[0.5, 0.5]],
  2: [[0.125, 0.625], [0.375, 0.125], [0.625, 0.875], [0.875, 0.375]],
};
function samplePositions(ss) {
  if (PATTERNS_SS[ss]) return PATTERNS_SS[ss];
  const pts = [];
  for (let y = 0; y < ss; y++) for (let x = 0; x < ss; x++) pts.push([(x + 0.5) / ss, (y + 0.5) / ss]);
  return pts;
}

/** Choose integer tile counts so a non-square output holds whole, (nearly) undistorted square tiles. */
export function autoTiles(width, height) {
  if (width === height) return [1, 1];
  return width > height ? [Math.max(1, Math.round(width / height)), 1] : [1, Math.max(1, Math.round(height / width))];
}

/**
 * @param {number} width
 * @param {number} height
 * @param {(u:number, v:number, out:Float64Array, ctx:object) => void} sample
 * @param {object} [opts]
 *   supersample   1..4 (default 2 = 4 rotated-grid samples per pixel)
 *   output        'color' | 'height' | 'normal' | 'maps'
 *   normalStrength  bump strength (default 4); resolution independent
 *   normalFormat  'opengl' (default, +Y up / green up) | 'directx' (green flipped)
 *   tiles         [tilesX, tilesY] pattern repeats inside the image (default autoTiles)
 *   dither        default true (colour output)
 *   rows          [y0, y1] render only these rows (for splitting work across workers; colour/height only)
 * @returns {{width, height, data, tiles}}  or for output 'maps': {width, height, tiles, color, heightMap, normalMap, heights}
 */
export function rasterize(width, height, sample, opts = {}) {
  width = clamp(Math.round(width) || 1, 1, 8192);
  height = clamp(Math.round(height) || 1, 1, 8192);
  const ss = clamp(Math.round(opts.supersample ?? 2), 1, 4);
  const output = opts.output || 'color';
  const tiles = opts.tiles || autoTiles(width, height);
  const tx = Math.max(1, Math.round(tiles[0]) || 1), ty = Math.max(1, Math.round(tiles[1]) || 1);
  const tileW = width / tx, tileH = height / ty;
  const pixel = Math.max(1 / tileW, 1 / tileH);
  const ctx = { px: pixel / ss, pixel, width, height, ss, tileW, tileH };
  const y0 = opts.rows ? clamp(opts.rows[0] | 0, 0, height) : 0;
  const y1 = opts.rows ? clamp(opts.rows[1] | 0, y0, height) : height;
  const rowsN = y1 - y0;
  const doDither = opts.dither !== false;

  const wantColor = output === 'color' || output === 'maps';
  const wantHeight = output !== 'color';
  const color = wantColor ? new Uint8ClampedArray(width * rowsN * 4) : null;
  const heights = wantHeight ? new Float32Array(width * rowsN) : null;
  const pts = samplePositions(ss);
  const ns = pts.length, inv = 1 / ns;
  const out = new Float64Array(5);

  for (let j = y0; j < y1; j++) {
    for (let i = 0; i < width; i++) {
      let r = 0, g = 0, b = 0, a = 0, h = 0;
      for (let k = 0; k < ns; k++) {
        let u = (i + pts[k][0]) / tileW, v = (j + pts[k][1]) / tileH;
        u -= Math.floor(u); v -= Math.floor(v);
        out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 1; out[4] = 0.5;
        sample(u, v, out, ctx);
        r += out[0]; g += out[1]; b += out[2]; a += out[3]; h += out[4];
      }
      const p = (j - y0) * width + i;
      if (color) {
        a *= inv;
        const k4 = p * 4;
        if (a > 1e-6) {
          const ia = inv / a, d = doDither ? dither(i, j) : 0;
          color[k4] = encode(r * ia) + d; color[k4 + 1] = encode(g * ia) + d; color[k4 + 2] = encode(b * ia) + d;
        }
        color[k4 + 3] = a * 255;
      }
      if (heights) { h *= inv; heights[p] = h < 0 ? 0 : h > 1 ? 1 : h; }
    }
  }

  if (output === 'color') return { width, height: rowsN === height ? height : rowsN, data: color, tiles: [tx, ty] };
  if (output === 'height') return { width, height: rowsN === height ? height : rowsN, data: heightToGray(heights, doDither, width, y0), heights, tiles: [tx, ty] };
  const normal = new Uint8ClampedArray(width * height * 4);
  heightToNormal(heights, width, height, normal, opts.normalStrength ?? 4, opts.normalFormat, tileW);
  if (output === 'normal') return { width, height, data: normal, tiles: [tx, ty] };
  return { width, height, tiles: [tx, ty], color, heightMap: heightToGray(heights, doDither, width, 0), normalMap: normal, heights };
}

function heightToGray(heights, doDither, width, y0) {
  const n = heights.length, data = new Uint8ClampedArray(n * 4);
  for (let p = 0; p < n; p++) {
    const g = heights[p] * 255 + (doDither ? dither(p % width, y0 + ((p / width) | 0)) * 0.5 : 0);
    data[p * 4] = data[p * 4 + 1] = data[p * 4 + 2] = g;
    data[p * 4 + 3] = 255;
  }
  return data;
}

/**
 * Tangent-space normal map from a height field (Sobel gradient, wraps at the edges so it tiles).
 * `strength` is resolution independent: a given value looks the same at 256 px and 2048 px
 * (it is normalised to a 512 px tile). format 'opengl' = +Y up (green up), 'directx' flips green.
 */
export function heightToNormal(heights, w, h, data, strength = 4, format = 'opengl', tileW = w) {
  const k = strength * (tileW / 512) * 0.25; // Sobel sums 4× a central difference
  const flipY = format === 'directx' ? -1 : 1;
  for (let j = 0; j < h; j++) {
    const jm = ((j - 1 + h) % h) * w, j0 = j * w, jp = ((j + 1) % h) * w;
    for (let i = 0; i < w; i++) {
      const im = (i - 1 + w) % w, ip = (i + 1) % w;
      const tl = heights[jm + im], t = heights[jm + i], tr = heights[jm + ip];
      const l = heights[j0 + im], r = heights[j0 + ip];
      const bl = heights[jp + im], b = heights[jp + i], br = heights[jp + ip];
      const gx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const gy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      let nx = -gx * k, ny = gy * k * flipY;
      const len = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const q = (j0 + i) * 4;
      data[q] = (nx * len * 0.5 + 0.5) * 255;
      data[q + 1] = (ny * len * 0.5 + 0.5) * 255;
      data[q + 2] = (len * 0.5 + 0.5) * 255;
      data[q + 3] = 255;
    }
  }
  return data;
}

/**
 * Fill a larger buffer by repeating a tile (pure pixel copy, exact). offsetX/Y shift the tile
 * grid in pixels (e.g. to keep the texture anchored while a shape moves).
 */
export function fillArea(tile, width, height, offsetX = 0, offsetY = 0) {
  width = clamp(Math.round(width) || 1, 1, 16384);
  height = clamp(Math.round(height) || 1, 1, 16384);
  const tw = tile.width, th = tile.height, src = tile.data;
  const data = new Uint8ClampedArray(width * height * 4);
  const ox = ((Math.round(offsetX) % tw) + tw) % tw, oy = ((Math.round(offsetY) % th) + th) % th;
  for (let y = 0; y < height; y++) {
    const sy = (y + oy) % th;
    const rowStart = sy * tw * 4;
    let x = 0;
    while (x < width) {
      const sx = (x + ox) % tw;
      const n = Math.min(tw - sx, width - x);
      data.set(src.subarray(rowStart + sx * 4, rowStart + (sx + n) * 4), (y * width + x) * 4);
      x += n;
    }
  }
  return { width, height, data };
}
