// Colour handling.
//
// * Everything is blended in LINEAR light and converted to sRGB once at the end (raster.js).
//   Mixing in sRGB space darkens/muddies blends and antialiased edges.
// * Colours are 4-vectors [r, g, b, a] with PREMULTIPLIED alpha, so mixing an opaque colour with
//   a transparent one is a plain lerp of all four channels and stays correct at edges.
// * Every colour param accepts '#rgb', '#rgba', '#rrggbb', '#rrggbbaa', 'rgb()/rgba()',
//   'hsl()/hsla()' and 'transparent'. Invalid input never throws (params fall back to defaults).

import { clamp01 } from './math.js';

export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
export function linearToSrgb(c) {
  c = clamp01(c);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

const HEX_RE = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FN_RE = /^(rgba?|hsla?)\(\s*([^)]*)\)$/i;

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

/**
 * Parse a CSS-like colour string -> [r, g, b, a] (sRGB 0..1, straight alpha) or null if invalid.
 */
export function parseColor(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (s === 'transparent' || s === 'none') return [0, 0, 0, 0];
  if (HEX_RE.test(s)) {
    let h = s.replace('#', '');
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
    return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1];
  }
  const m = FN_RE.exec(s);
  if (!m) return null;
  const parts = m[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const num = (t, scale) => (t.endsWith('%') ? (parseFloat(t) / 100) * scale : parseFloat(t));
  let rgb;
  if (m[1].startsWith('rgb')) rgb = parts.slice(0, 3).map((t) => num(t, 255) / 255);
  else rgb = hslToRgb(parseFloat(parts[0]), num(parts[1], 1) / (parts[1].endsWith('%') ? 1 : 100), num(parts[2], 1) / (parts[2].endsWith('%') ? 1 : 100));
  const a = parts.length === 4 ? num(parts[3], 1) : 1;
  const out = [...rgb, a].map((x) => clamp01(x));
  return out.every(Number.isFinite) ? out : null;
}

export const isColor = (s) => parseColor(s) !== null;
/** @deprecated alias kept for v1 code */
export const isHex = isColor;

/** Normalise any accepted colour string to lowercase '#rrggbb' (opaque) or '#rrggbbaa'. */
export function normColor(s) {
  const c = parseColor(s);
  if (!c) return null;
  const to = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return '#' + to(c[0]) + to(c[1]) + to(c[2]) + (c[3] < 1 ? to(c[3]) : '');
}

/** Colour string -> linear, premultiplied [r, g, b, a]. Invalid input -> opaque magenta (never throws). */
export function hexToLinear(str) {
  const c = parseColor(str);
  if (!c) return [1, 0, 1, 1];
  const a = c[3];
  return [srgbToLinear(c[0]) * a, srgbToLinear(c[1]) * a, srgbToLinear(c[2]) * a, a];
}
export const toLinear = hexToLinear;

/** Linear (premultiplied or opaque) colour -> '#rrggbb' (alpha dropped). */
export function linearToHex(c) {
  const a = c.length > 3 && c[3] > 0 ? c[3] : 1;
  const to = (v) => Math.round(linearToSrgb(v / a) * 255).toString(16).padStart(2, '0');
  return '#' + to(c[0]) + to(c[1]) + to(c[2]);
}

/** out = a*(1-t) + b*t, all four channels (premultiplied colours). */
export function mix(out, a, b, t) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  out[3] = a[3] + (b[3] - a[3]) * t;
  return out;
}

/** out = colour c with its rgb multiplied by k (lighting/shading); alpha is copied. */
export function shade(out, c, k = 1) {
  out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; out[3] = c[3];
  return out;
}

/** Draw colour `c` OVER whatever is in `out` with coverage t (0..1). Premultiplied "over". */
export function over(out, c, t) {
  const k = c[3] * t, inv = 1 - k;
  out[0] = c[0] * t + out[0] * inv;
  out[1] = c[1] * t + out[1] * inv;
  out[2] = c[2] * t + out[2] * inv;
  out[3] = k + out[3] * inv;
  return out;
}

/** Sample an evenly-spaced gradient of linear colours at t in [0,1]. */
export function ramp(out, stops, t) {
  if (stops.length === 1) return shade(out, stops[0]);
  t = clamp01(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  return mix(out, stops[i], stops[i + 1], t - i);
}

/** Linear luminance of a colour (premultiplied colours give premultiplied luminance). */
export const luminance = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** Named palettes (sRGB hex). Patterns accept any array of colours; these are presets. */
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
  woodland: ['#7d7a52', '#4b5b33', '#6b4b2e', '#1f1f1a'],
  desert: ['#d8c49a', '#b89b6a', '#8c6d46', '#5a4630'],
  snow: ['#e9edf0', '#b9c2c9', '#7d8a94', '#3f4850'],
  neon: ['#0d0221', '#ff2a6d', '#05d9e8', '#d1f7ff'],
};
