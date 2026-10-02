// Colour handling. Everything is blended in LINEAR light and converted to sRGB once at the
// end (in raster.js). Mixing in sRGB space darkens/muddies blends and antialiased edges.

import { clamp01 } from './math.js';

export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
export function linearToSrgb(c) {
  c = clamp01(c);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
export const isHex = (s) => typeof s === 'string' && HEX_RE.test(s.trim());

/** '#rrggbb' or '#rgb' -> [r,g,b] linear floats. Invalid input -> magenta (never throws). */
export function hexToLinear(hex) {
  if (!isHex(hex)) return [1, 0, 1];
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

export function linearToHex(c) {
  const to = (v) => Math.round(linearToSrgb(v) * 255).toString(16).padStart(2, '0');
  return '#' + to(c[0]) + to(c[1]) + to(c[2]);
}

/** out = a*(1-t) + b*t (linear colours, length 3). */
export function mix3(out, a, b, t) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

export function set3(out, c, k = 1) {
  out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
  return out;
}

/** Sample an evenly-spaced gradient of linear colours at t in [0,1]. */
export function ramp(out, stops, t) {
  t = clamp01(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  if (stops.length === 1) return set3(out, stops[0]);
  return mix3(out, stops[i], stops[i + 1], t - i);
}

/** Named palettes (sRGB hex). Patterns accept any array of hex strings; these are presets. */
export const PALETTES = {
  ink: ['#14151a', '#f4f1ea'],
  denim: ['#1d2b4f', '#2e4a7d', '#e9e4d6'],
  autumn: ['#3b2a20', '#9c4a1a', '#d98e32', '#efd9a7'],
  ocean: ['#04202f', '#0b4f6c', '#20a4c3', '#c9f1f5'],
  pastel: ['#f7d6e0', '#b2f7ef', '#eff7f6', '#f2b5d4', '#7bdff2'],
  terracotta: ['#7a3b2e', '#c86b4a', '#e8b18f', '#f3e3d3'],
  forest: ['#1f2a1d', '#3c5232', '#6b7f45', '#c2b98b'],
  candy: ['#ff5d8f', '#ffd166', '#06d6a0', '#118ab2', '#f8f9fa'],
  mono: ['#111111', '#555555', '#aaaaaa', '#eeeeee'],
  sunset: ['#2d1e2f', '#7b2d43', '#e05e3c', '#f7b267', '#fef3e2'],
  bauhaus: ['#1b1b1b', '#e63946', '#f1c40f', '#1d4e89', '#f4efe6'],
  sage: ['#2f3e36', '#6b8f71', '#aac0aa', '#e7ede4'],
};
