// Rasteriser: turns a pattern's sample(u, v) function into an RGBA buffer.
//
// Coordinate contract (every pattern relies on this):
//   * u, v are in [0, 1). The pattern is a function on the unit TORUS, i.e. sample(u, v) ===
//     sample(u + 1, v) === sample(u, v + 1). That is what makes every output seamless.
//   * v grows downward (screen space).
//   * Pixel (i, j) is sampled at subpixel centres ((i + (sx + .5)/ss) / W, ...).
//   * ctx.px = size of one subpixel in uv units — use it for analytic antialiasing.
//
// sample() writes into `out` (Float64Array(4)): out[0..2] = LINEAR rgb in [0,1], out[3] = height
// in [0,1] (0.5 = flat). Colour is averaged in linear space, then encoded to sRGB 8-bit.

import { linearToSrgb } from './color.js';
import { clamp, clamp01 } from './math.js';

const SRGB_LUT_SIZE = 4096;
const SRGB_LUT = new Uint8Array(SRGB_LUT_SIZE + 1);
for (let i = 0; i <= SRGB_LUT_SIZE; i++) SRGB_LUT[i] = Math.round(linearToSrgb(i / SRGB_LUT_SIZE) * 255);
const encode = (c) => SRGB_LUT[Math.round(clamp01(c) * SRGB_LUT_SIZE)];

/**
 * @param {number} width
 * @param {number} height
 * @param {(u:number, v:number, out:Float64Array, ctx:object) => void} sample
 * @param {{supersample?:number, output?:'color'|'height'|'normal', normalStrength?:number}} opts
 * @returns {{width:number, height:number, data:Uint8ClampedArray}}
 */
export function rasterize(width, height, sample, opts = {}) {
  width = clamp(Math.round(width) || 1, 1, 8192);
  height = clamp(Math.round(height) || 1, 1, 8192);
  const ss = clamp(Math.round(opts.supersample ?? 2), 1, 4);
  const output = opts.output || 'color';
  const data = new Uint8ClampedArray(width * height * 4);
  const out = new Float64Array(4);
  const ctx = { px: 1 / (Math.max(width, height) * ss), width, height, ss };
  const inv = 1 / (ss * ss);
  const heights = output === 'normal' ? new Float32Array(width * height) : null;

  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      let r = 0, g = 0, b = 0, h = 0;
      for (let sy = 0; sy < ss; sy++) {
        const v = (j + (sy + 0.5) / ss) / height;
        for (let sx = 0; sx < ss; sx++) {
          const u = (i + (sx + 0.5) / ss) / width;
          out[0] = out[1] = out[2] = 0; out[3] = 0.5;
          sample(u, v, out, ctx);
          r += out[0]; g += out[1]; b += out[2]; h += out[3];
        }
      }
      const k = (j * width + i) * 4;
      if (output === 'color') {
        data[k] = encode(r * inv); data[k + 1] = encode(g * inv); data[k + 2] = encode(b * inv);
      } else {
        const hv = clamp01(h * inv);
        if (heights) heights[j * width + i] = hv;
        const g8 = Math.round(hv * 255);
        data[k] = data[k + 1] = data[k + 2] = g8;
      }
      data[k + 3] = 255;
    }
  }
  if (heights) heightToNormal(heights, width, height, data, opts.normalStrength ?? 4);
  return { width, height, data };
}

/** Tangent-space normal map (OpenGL convention, +Y up) from a height field, wrapping at edges so it tiles. */
export function heightToNormal(heights, w, h, data, strength = 4) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const l = heights[j * w + ((i - 1 + w) % w)], r = heights[j * w + ((i + 1) % w)];
      const t = heights[((j - 1 + h) % h) * w + i], b = heights[((j + 1) % h) * w + i];
      let nx = (l - r) * strength, ny = (b - t) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const k = (j * w + i) * 4;
      data[k] = Math.round((nx * 0.5 + 0.5) * 255);
      data[k + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[k + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[k + 3] = 255;
    }
  }
}
