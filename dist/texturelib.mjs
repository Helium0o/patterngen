/*! texturelib 2.0.0 — seamless procedural patterns & textures. Zero dependencies.
 * Docs: README.md · INTEGRATION.md · PATTERNS.md (generated from src/, do not edit this bundle by hand)
 * Global build: <script src="texturelib.js"></script> then TextureLib.render('houndstooth', { width: 512 }) */
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/core/math.js
var TAU = Math.PI * 2;
var SQRT3 = Math.sqrt(3);
var clamp = (x, a, b) => x < a ? a : x > b ? b : x;
var clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
var lerp = (a, b, t) => a + (b - a) * t;
var fract = (x) => x - Math.floor(x);
var mod = (a, n) => (a % n + n) % n;
var smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
var fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
var gcd = (a, b) => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
};
var lcm = (a, b) => a && b ? Math.abs(a * b) / gcd(a, b) : 0;
var evenInt = (n, min = 2) => Math.max(min, Math.round(n / 2) * 2);
var multipleOf = (n, k) => Math.max(1, Math.round(n / k)) * k;
var coverage = (d, px) => clamp01(0.5 - d / px);
var detail = (period, pixel) => 1 - smoothstep(0.25, 0.6, pixel / period);
var tri = (x) => Math.abs(fract(x) - 0.5) * 2;
var LX = -0.48;
var LY = -0.58;
var LZ = 0.66;
function lambert(nx, ny) {
  const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
  const d = (nx * LX + ny * LY + LZ) * inv;
  return d > 0 ? d / LZ : 0;
}
function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = clamp01((pax * bax + pay * bay) / (bax * bax + bay * bay || 1e-12));
  const dx = pax - bax * h, dy = pay - bay * h;
  return Math.sqrt(dx * dx + dy * dy);
}
function sdPolygon(x, y, r, n) {
  const an = Math.PI / n, ca = Math.cos(an), sa = Math.sin(an);
  const bn = mod(Math.atan2(x, y), 2 * an) - an;
  const len = Math.hypot(x, y);
  let px = len * Math.cos(bn) - r * ca, py = len * Math.abs(Math.sin(bn)) - r * sa;
  py += clamp(-py, 0, r * sa);
  return Math.hypot(px, py) * Math.sign(px);
}
function sdStar5(x, y, r, rf) {
  const k1x = 0.809016994375, k1y = -0.587785252292;
  const k2x = -k1x, k2y = k1y;
  let px = Math.abs(x), py = -y;
  let d = Math.max(k1x * px + k1y * py, 0) * 2;
  px -= d * k1x;
  py -= d * k1y;
  d = Math.max(k2x * px + k2y * py, 0) * 2;
  px -= d * k2x;
  py -= d * k2y;
  px = Math.abs(px);
  py -= r;
  const bax = rf * -k1y - 0, bay = rf * k1x - 1;
  const h = clamp((px * bax + py * bay) / (bax * bax + bay * bay), 0, r);
  const ex = px - bax * h, ey = py - bay * h;
  return Math.sqrt(ex * ex + ey * ey) * Math.sign(py * bax - px * bay);
}
function sdHeart(x, y) {
  let px = Math.abs(x) * 1.6, py = (0.55 - y) * 1.6;
  let d;
  if (py + px > 1) {
    const dx = px - 0.25, dy = py - 0.75;
    d = Math.sqrt(dx * dx + dy * dy) - Math.SQRT2 / 4;
  } else {
    const a = px * px + (py - 1) * (py - 1);
    const m = 0.5 * Math.max(px + py, 0);
    const b = (px - m) * (px - m) + (py - m) * (py - m);
    d = Math.sqrt(Math.min(a, b)) * Math.sign(px - py);
  }
  return d / 1.6;
}

// src/core/color.js
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c) {
  c = clamp01(c);
  return c <= 31308e-7 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
var HEX_RE = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
var FN_RE = /^(rgba?|hsla?)\(\s*([^)]*)\)$/i;
function hslToRgb(h, s, l) {
  h = (h % 360 + 360) % 360 / 360;
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}
function parseColor(input) {
  if (typeof input !== "string") return null;
  const s = input.trim().toLowerCase();
  if (s === "transparent" || s === "none") return [0, 0, 0, 0];
  if (HEX_RE.test(s)) {
    let h = s.replace("#", "");
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    const n = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
    return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1];
  }
  const m = FN_RE.exec(s);
  if (!m) return null;
  const parts = m[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const num = (t, scale) => t.endsWith("%") ? parseFloat(t) / 100 * scale : parseFloat(t);
  let rgb;
  if (m[1].startsWith("rgb")) rgb = parts.slice(0, 3).map((t) => num(t, 255) / 255);
  else rgb = hslToRgb(parseFloat(parts[0]), num(parts[1], 1) / (parts[1].endsWith("%") ? 1 : 100), num(parts[2], 1) / (parts[2].endsWith("%") ? 1 : 100));
  const a = parts.length === 4 ? num(parts[3], 1) : 1;
  const out = [...rgb, a].map((x) => clamp01(x));
  return out.every(Number.isFinite) ? out : null;
}
function normColor(s) {
  const c = parseColor(s);
  if (!c) return null;
  const to = (v) => Math.round(v * 255).toString(16).padStart(2, "0");
  return "#" + to(c[0]) + to(c[1]) + to(c[2]) + (c[3] < 1 ? to(c[3]) : "");
}
function hexToLinear(str) {
  const c = parseColor(str);
  if (!c) return [1, 0, 1, 1];
  const a = c[3];
  return [srgbToLinear(c[0]) * a, srgbToLinear(c[1]) * a, srgbToLinear(c[2]) * a, a];
}
function linearToHex(c) {
  const a = c.length > 3 && c[3] > 0 ? c[3] : 1;
  const to = (v) => Math.round(linearToSrgb(v / a) * 255).toString(16).padStart(2, "0");
  return "#" + to(c[0]) + to(c[1]) + to(c[2]);
}
function mix(out, a, b, t) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  out[3] = a[3] + (b[3] - a[3]) * t;
  return out;
}
function shade(out, c, k = 1) {
  out[0] = c[0] * k;
  out[1] = c[1] * k;
  out[2] = c[2] * k;
  out[3] = c[3];
  return out;
}
function ramp(out, stops, t) {
  if (stops.length === 1) return shade(out, stops[0]);
  t = clamp01(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  return mix(out, stops[i], stops[i + 1], t - i);
}
var PALETTES = {
  ink: ["#14151a", "#f4f1ea"],
  denim: ["#1d2b4f", "#2e4a7d", "#e9e4d6"],
  autumn: ["#3b2a20", "#9c4a1a", "#d98e32", "#efd9a7"],
  ocean: ["#04202f", "#0b4f6c", "#20a4c3", "#c9f1f5"],
  pastel: ["#f7d6e0", "#b2f7ef", "#eff7f6", "#f2b5d4", "#7bdff2"],
  terracotta: ["#7a3b2e", "#c86b4a", "#e8b18f", "#f3e3d3"],
  forest: ["#1f2a1d", "#3c5232", "#6b7f45", "#c2b98b"],
  candy: ["#ff5d8f", "#ffd166", "#06d6a0", "#118ab2", "#f8f9fa"],
  mono: ["#111111", "#555555", "#aaaaaa", "#eeeeee"],
  sunset: ["#2d1e2f", "#7b2d43", "#e05e3c", "#f7b267", "#fef3e2"],
  bauhaus: ["#1b1b1b", "#e63946", "#f1c40f", "#1d4e89", "#f4efe6"],
  sage: ["#2f3e36", "#6b8f71", "#aac0aa", "#e7ede4"],
  woodland: ["#7d7a52", "#4b5b33", "#6b4b2e", "#1f1f1a"],
  desert: ["#d8c49a", "#b89b6a", "#8c6d46", "#5a4630"],
  snow: ["#e9edf0", "#b9c2c9", "#7d8a94", "#3f4850"],
  neon: ["#0d0221", "#ff2a6d", "#05d9e8", "#d1f7ff"]
};

// src/core/hash.js
var hash_exports = {};
__export(hash_exports, {
  hash01: () => hash01,
  hash01x3: () => hash01x3,
  hashU32: () => hashU32,
  mulberry32: () => mulberry32,
  pcg3: () => pcg3,
  seedFromString: () => seedFromString,
  subSeed: () => subSeed
});
var INV_U32 = 1 / 4294967296;
var _h = new Uint32Array(3);
function pcg3(x, y, z, out = _h) {
  let a = Math.imul(x | 0, 1664525) + 1013904223 | 0;
  let b = Math.imul(y | 0, 1664525) + 1013904223 | 0;
  let c = Math.imul(z | 0, 1664525) + 1013904223 | 0;
  a = a + Math.imul(b, c) | 0;
  b = b + Math.imul(c, a) | 0;
  c = c + Math.imul(a, b) | 0;
  a ^= a >>> 16;
  b ^= b >>> 16;
  c ^= c >>> 16;
  a = a + Math.imul(b, c) | 0;
  b = b + Math.imul(c, a) | 0;
  c = c + Math.imul(a, b) | 0;
  out[0] = a >>> 0;
  out[1] = b >>> 0;
  out[2] = c >>> 0;
  return out;
}
function hashU32(x, y, seed) {
  pcg3(x, y, seed, _h);
  return _h[0];
}
function hash01(x, y, seed) {
  pcg3(x, y, seed, _h);
  return _h[0] * INV_U32;
}
function hash01x3(x, y, seed, out) {
  pcg3(x, y, seed, _h);
  out[0] = _h[0] * INV_U32;
  out[1] = _h[1] * INV_U32;
  out[2] = _h[2] * INV_U32;
  return out;
}
function subSeed(seed, k) {
  return hashU32(seed | 0, k | 0, 1540483477) | 0;
}
function seedFromString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}
function mulberry32(seed) {
  let s = seed >>> 0;
  return function next() {
    s = s + 1831565813 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) * INV_U32;
  };
}

// src/core/params.js
function resolveParams(schema, input = {}) {
  const out = {};
  for (const key of Object.keys(schema)) {
    const s = schema[key];
    const v = input == null || typeof input !== "object" ? void 0 : input[key];
    out[key] = coerce(s, v);
  }
  return out;
}
var toNum = (v) => typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
function coerce(s, v) {
  switch (s.type) {
    case "int": {
      let n = toNum(v);
      if (!Number.isFinite(n)) n = s.default;
      n = Math.round(n);
      return Math.min(s.max ?? Infinity, Math.max(s.min ?? -Infinity, n));
    }
    case "float": {
      let n = toNum(v);
      if (!Number.isFinite(n)) n = s.default;
      return Math.min(s.max ?? Infinity, Math.max(s.min ?? -Infinity, n));
    }
    case "seed": {
      if (typeof v === "string" && v.trim() !== "") return Number.isFinite(Number(v)) ? Number(v) | 0 : seedFromString(v);
      if (typeof v === "number" && Number.isFinite(v)) return v | 0;
      return s.default | 0;
    }
    case "bool":
      if (typeof v === "boolean") return v;
      if (v === "true" || v === 1 || v === "1") return true;
      if (v === "false" || v === 0 || v === "0") return false;
      return !!s.default;
    case "enum": {
      const hit2 = s.options.find((o) => o === v || v != null && typeof v !== "object" && String(o) === String(v));
      return hit2 === void 0 ? s.default : hit2;
    }
    case "color":
      return normColor(v) ?? s.default;
    case "colors": {
      const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;]\s*|\s+(?=#)/) : null;
      if (!arr) return s.default.slice();
      const ok = arr.map(normColor).filter(Boolean);
      const min = s.minItems ?? 1, max = s.maxItems ?? 16;
      return ok.length >= min ? ok.slice(0, max) : s.default.slice();
    }
    case "string": {
      if (typeof v === "number" && Number.isFinite(v)) v = String(v);
      if (typeof v !== "string") return s.default;
      return v.slice(0, s.maxLength ?? 4e3);
    }
    default:
      return v === void 0 ? s.default : v;
  }
}
var P = {
  int: (def, min, max, label, help) => ({ type: "int", default: def, min, max, step: 1, label, help }),
  float: (def, min, max, label, help, step) => ({ type: "float", default: def, min, max, step: step ?? niceStep(min, max), label, help }),
  bool: (def, label, help) => ({ type: "bool", default: def, label, help }),
  enumOf: (def, options, label, help) => ({ type: "enum", default: def, options, label, help }),
  color: (def, label, help) => ({ type: "color", default: def, label, help }),
  colors: (def, label, help, minItems = 1, maxItems = 16) => ({ type: "colors", default: def, label, help, minItems, maxItems }),
  string: (def, label, help, maxLength = 4e3) => ({ type: "string", default: def, label, help, maxLength }),
  seed: (def = 1) => ({ type: "seed", default: def, label: "Seed", help: "Same seed + params = identical output, always. Change it for a different random variation." })
};
var adv = (entry) => ({ ...entry, advanced: true });
function niceStep(min, max) {
  const r = Math.abs(max - min);
  if (!(r > 0)) return 0.01;
  const raw = r / 200;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  return +(raw >= 5 * p ? 5 * p : raw >= 2 * p ? 2 * p : p).toPrecision(1);
}

// src/core/noise.js
var noise_exports = {};
__export(noise_exports, {
  fbm: () => fbm,
  fbm01: () => fbm01,
  noiseField: () => noiseField,
  perlin: () => perlin,
  valueNoise: () => valueNoise,
  voronoiEdge: () => voronoiEdge,
  warp: () => warp,
  warpField: () => warpField,
  worley: () => worley
});
function lat(x, y, seed) {
  let h = Math.imul(x, 2376512323) ^ Math.imul(y, 3625334849) ^ Math.imul(seed, 3407524639);
  h = Math.imul(h ^ h >>> 16, 2146121005);
  h = Math.imul(h ^ h >>> 15, 2221713035);
  return (h ^ h >>> 16) >>> 0;
}
var INV32 = 1 / 4294967296;
var D = 0.7071067811865476;
var GX = [1, -1, 0, 0, D, -D, D, -D];
var GY = [0, 0, 1, -1, D, D, -D, -D];
function perlin(x, y, px, py, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const ix0 = mod(x0, px), ix1 = ix0 + 1 === px ? 0 : ix0 + 1;
  const iy0 = mod(y0, py), iy1 = iy0 + 1 === py ? 0 : iy0 + 1;
  let h = lat(ix0, iy0, seed) >>> 29;
  const n00 = GX[h] * fx + GY[h] * fy;
  h = lat(ix1, iy0, seed) >>> 29;
  const n10 = GX[h] * (fx - 1) + GY[h] * fy;
  h = lat(ix0, iy1, seed) >>> 29;
  const n01 = GX[h] * fx + GY[h] * (fy - 1);
  h = lat(ix1, iy1, seed) >>> 29;
  const n11 = GX[h] * (fx - 1) + GY[h] * (fy - 1);
  const a = fade(fx), b = fade(fy);
  return lerp(lerp(n00, n10, a), lerp(n01, n11, a), b) * 1.41421356;
}
function valueNoise(x, y, px, py, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = fade(x - x0), fy = fade(y - y0);
  const ix0 = mod(x0, px), ix1 = ix0 + 1 === px ? 0 : ix0 + 1;
  const iy0 = mod(y0, py), iy1 = iy0 + 1 === py ? 0 : iy0 + 1;
  const a = lat(ix0, iy0, seed) * INV32, b = lat(ix1, iy0, seed) * INV32;
  const c = lat(ix0, iy1, seed) * INV32, d = lat(ix1, iy1, seed) * INV32;
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy) * 2 - 1;
}
var MODES = { fbm: 0, ridged: 1, turbulence: 2 };
function noiseField(o = {}) {
  const octaves = Math.max(1, Math.min(12, Math.round(o.octaves ?? 5)));
  const gain = o.gain ?? 0.5;
  const fx0 = Math.max(1, Math.round(o.fx ?? o.freq ?? 4));
  const fy0 = Math.max(1, Math.round(o.fy ?? o.freq ?? 4));
  const basis = o.basis === "value" ? valueNoise : perlin;
  const mode = MODES[o.mode] ?? 0;
  const signed = o.range === "signed" && mode === 0;
  const seeds = new Int32Array(octaves), amps = new Float64Array(octaves);
  let amp = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    seeds[i] = (o.seed ?? 0) + Math.imul(i + 1, 2654435769) | 0;
    amps[i] = amp;
    norm += amp;
    amp *= gain;
  }
  for (let i = 0; i < octaves; i++) amps[i] /= norm;
  return function field(u, v) {
    let sum = 0, fx = fx0, fy = fy0;
    for (let i = 0; i < octaves; i++) {
      let n = basis(u * fx, v * fy, fx, fy, seeds[i]);
      if (mode === 1) {
        n = 1 - Math.abs(n);
        n *= n;
      } else if (mode === 2) n = Math.abs(n);
      sum += n * amps[i];
      fx *= 2;
      fy *= 2;
    }
    return mode !== 0 || signed ? sum : sum * 0.5 + 0.5;
  };
}
var _fieldCache = /* @__PURE__ */ new WeakMap();
function fbm(u, v, o) {
  let f = _fieldCache.get(o);
  if (!f) {
    f = noiseField({ ...o, range: "signed" });
    _fieldCache.set(o, f);
  }
  return f(u, v);
}
var fbm01 = (u, v, o) => o.mode && o.mode !== "fbm" ? fbm(u, v, o) : fbm(u, v, o) * 0.5 + 0.5;
function warpField(amount, freq, seed, octaves = 4) {
  const fx = noiseField({ freq, octaves, seed: subSeed(seed, 101), range: "signed" });
  const fy = noiseField({ freq, octaves, seed: subSeed(seed, 202), range: "signed" });
  return function warpUV(u, v, out) {
    out[0] = u + amount * fx(u, v);
    out[1] = v + amount * fy(u, v);
    return out;
  };
}
function warp(u, v, amount, freq, seed, octaves, out) {
  return warpField(amount, freq, seed, octaves)(u, v, out);
}
var INV = 1 / 4294967296;
function fmix(h) {
  h = Math.imul(h ^ h >>> 16, 2146121005);
  h = Math.imul(h ^ h >>> 15, 2221713035);
  return (h ^ h >>> 16) >>> 0;
}
var hA = 0;
var hB = 0;
var hC = 0;
function cellHash(x, y, seed) {
  hA = lat(x, y, seed);
  hB = fmix(hA ^ 2654435769);
  hC = fmix(hB ^ 2246822507);
}
function worley(u, v, n, m, seed, jitter, out, metric = 0, range = 1) {
  const x = u * n, y = v * m;
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 1e9, f2 = 1e9, id = 0, bdx = 0, bdy = 0, bcx = 0, bcy = 0;
  for (let j = -range; j <= range; j++) {
    for (let i = -range; i <= range; i++) {
      const cx = xi + i, cy = yi + j;
      const wx = mod(cx, n), wy = mod(cy, m);
      cellHash(wx, wy, seed);
      const ppx = cx + 0.5 + (hA * INV - 0.5) * jitter;
      const ppy = cy + 0.5 + (hB * INV - 0.5) * jitter;
      const dx = ppx - x, dy = ppy - y;
      const d = metric === 1 ? Math.abs(dx) + Math.abs(dy) : metric === 2 ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.sqrt(dx * dx + dy * dy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hC;
        bdx = dx;
        bdy = dy;
        bcx = wx;
        bcy = wy;
      } else if (d < f2) f2 = d;
    }
  }
  out.f1 = f1;
  out.f2 = f2;
  out.id = id;
  out.dx = bdx;
  out.dy = bdy;
  out.cx = bcx;
  out.cy = bcy;
  return out;
}
function voronoiEdge(u, v, n, m, seed, jitter, out) {
  worley(u, v, n, m, seed, jitter, out, 0, 1);
  const x = u * n, y = v * m;
  const xi = Math.floor(x), yi = Math.floor(y);
  const mx = x + out.dx, my = y + out.dy;
  let best = 1e9;
  for (let j = -2; j <= 2; j++) {
    for (let i = -2; i <= 2; i++) {
      const cx = xi + i, cy = yi + j;
      cellHash(mod(cx, n), mod(cy, m), seed);
      const ppx = cx + 0.5 + (hA * INV - 0.5) * jitter;
      const ppy = cy + 0.5 + (hB * INV - 0.5) * jitter;
      const ex = ppx - mx, ey = ppy - my;
      const l2 = ex * ex + ey * ey;
      if (l2 < 1e-10) continue;
      const inv = 1 / Math.sqrt(l2);
      const d = ((mx + ppx) * 0.5 - x) * ex * inv + ((my + ppy) * 0.5 - y) * ey * inv;
      if (d < best) best = d;
    }
  }
  out.edge = best;
  return out;
}

// src/patterns/woven.js
var drafts = {
  plain: () => ({ w: 2, h: 2, up: (p, e) => p + e & 1 ^ 1 }),
  /** p/q twill: p ends up, q down, stepping one end per pick. dir 'Z' rises to the right, 'S' to the left. */
  twill: (p = 2, q = 2, dir = "Z") => {
    const n = p + q;
    return { w: n, h: n, up: (pk, e) => mod(e + (dir === "Z" ? pk : -pk), n) < p ? 1 : 0 };
  },
  /** Regular satin of n shafts, move a (gcd(a,n)=1, 1<a<n-1). face 'warp' = warp floats on top. */
  satin: (n = 5, face = "warp") => {
    let a = 2;
    while (a < n - 1 && gcd(a, n) !== 1) a++;
    return { w: n, h: n, up: (pk, e) => {
      const hit2 = mod(e - a * pk, n) === 0;
      return face === "warp" ? hit2 ? 0 : 1 : hit2 ? 1 : 0;
    } };
  },
  basket: (k = 2) => ({ w: 2 * k, h: 2 * k, up: (p, e) => Math.floor(e / k) + Math.floor(p / k) & 1 ? 0 : 1 }),
  /** Herringbone: 2/2 twill whose direction mirrors every `k` ends ('broken' = offset at the reversal, like real cloth). */
  herringbone: (k = 8, broken = true) => ({
    w: 2 * k,
    h: 4,
    up: (p, e) => {
      if (e < k) return mod(e + p, 4) < 2 ? 1 : 0;
      const ee = 2 * k - 1 - e;
      return mod(ee + p + (broken ? 2 : 0), 4) < 2 ? 1 : 0;
    }
  }),
  /** Waffle / honeycomb weave (n = 6, 8 or 10): diamond floats that form deep cells. */
  waffle: (n = 8) => {
    const h = n / 2;
    return { w: n, h: n, up: (p, e) => {
      const a = Math.abs(mod(e, n) - h), b = Math.abs(mod(p, n) - h);
      return a + b >= h - 0.5 && (a + b) % 2 === h % 2 ? 1 : a === b ? 1 : 0;
    } };
  },
  /** Parse "1100/0110/0011/1001" (rows = picks, '1','x','#' = warp up). */
  parse: (str) => {
    const rows = String(str).split(/[\/\n,;|]+/).map((r) => r.trim()).filter(Boolean);
    if (!rows.length) return drafts.plain();
    const w = Math.min(64, Math.max(...rows.map((r) => r.length)));
    const hh = Math.min(64, rows.length);
    const grid2 = rows.slice(0, hh).map((r) => Array.from({ length: w }, (_, i) => /[1x#X]/.test(r[i] || "0") ? 1 : 0));
    return { w, h: hh, up: (p, e) => grid2[mod(p, hh)][mod(e, w)] };
  }
};
var COMMON = {
  style: P.enumOf("fabric", ["fabric", "flat", "draft"], "Style", "fabric = shaded 3D yarns; flat = solid colour per crossing (prints, pixel art); draft = black/white weave draft"),
  repeats: P.int(4, 1, 64, "Repeats", "Pattern repeats across the tile (integer keeps it seamless). Higher = finer cloth."),
  yarnGap: P.float(0.12, 0, 0.5, "Yarn gap", "Fraction of each thread cell left open between yarns."),
  irregularity: P.float(0.35, 0, 1, "Irregularity", "Per-yarn tone and thickness variation."),
  twist: P.float(0.5, 0, 1, "Fibre twist", "Strength of the twisted-fibre striation on each yarn."),
  sheen: adv(P.float(0.08, 0, 1, "Sheen", "Glossy highlight along the yarns (silk/satin \u2248 0.6).")),
  slub: adv(P.float(0.15, 0, 1, "Slubs", "Thick-and-thin yarn (linen, raw silk).")),
  heather: adv(P.float(0, 0, 1, "Heather", "Mottled multi-tone fibres (marl / melange yarn).")),
  fuzz: adv(P.float(0, 0, 1, "Brushed fuzz", "Brushed / napped surface that softens the weave (flannel, brushed cotton).")),
  seed: P.seed(1)
};
var _scratch = [0, 0, 0, 0];
function weaveState(draft, warpSeq, weftSeq, p, extra = {}) {
  const repE = lcm(draft.w, warpSeq.length);
  const repP = lcm(draft.h, weftSeq.length);
  const T = lcm(repE, repP) * Math.max(1, p.repeats | 0);
  const ratio = extra.ratio || 1;
  const E = T, Pk = multipleOf(T / ratio, repP);
  const dw = draft.w, dh = draft.h;
  const up = new Uint8Array(dw * dh);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) up[y * dw + x] = draft.up(y, x) ? 1 : 0;
  const runPos = new Uint8Array(dw * dh), runLen = new Uint8Array(dw * dh);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const i = y * dw + x, isUp = up[i];
    const same = (yy, xx) => up[mod(yy, dh) * dw + mod(xx, dw)] === isUp;
    const n = isUp ? dh : dw;
    let back = 0, fwd = 0;
    if (isUp) {
      while (back < n && same(y - back - 1, x)) back++;
      while (fwd < n && same(y + fwd + 1, x)) fwd++;
    } else {
      while (back < n && same(y, x - back - 1)) back++;
      while (fwd < n && same(y, x + fwd + 1)) fwd++;
    }
    const len = back + fwd + 1;
    runPos[i] = len > n ? 0 : back;
    runLen[i] = len > n ? 0 : len;
  }
  const g = (k, d) => p[k] === void 0 ? d : p[k];
  return {
    E,
    Pk,
    dw,
    dh,
    up,
    runPos,
    runLen,
    warpSeq,
    weftSeq,
    style: g("style", "fabric"),
    gap: g("yarnGap", 0.12),
    irr: g("irregularity", 0.35),
    twist: g("twist", 0.5),
    sheen: g("sheen", 0.12),
    slub: g("slub", 0.15),
    heather: g("heather", 0),
    fuzz: g("fuzz", 0),
    seed: g("seed", 1) | 0,
    slubFx: Math.max(1, Math.round(E * 0.6)),
    slubFy: Math.max(1, Math.round(Pk * 0.6)),
    fuzzField: noiseField({ fx: Math.max(4, Math.round(E / 6)), fy: Math.max(4, Math.round(Pk / 6)), octaves: 3, seed: (g("seed", 1) | 0) + 77 }),
    warpColor: extra.warpColor,
    weftColor: extra.weftColor,
    neps: extra.neps
  };
}
var DARK = hexToLinear("#1a1a1a");
var LIGHT = hexToLinear("#f3f1ea");
var LX2 = -0.48;
var LY2 = -0.58;
var LZ2 = 0.66;
var HX = -0.25;
var HY = -0.3;
var HZ = 0.92;
var _top = [0, 0, 0, 0];
var _bot = [0, 0, 0, 0];
var _avg = [0, 0, 0, 0];
var yarnInfo = { b: 0, h: 0 };
function shadeYarn(a, s, len, hw, isWarp, st, fibreLod, yarnId, cellLod) {
  const q = a / hw, q2 = q * q;
  const prof = Math.sqrt(1 - q2);
  let dive = 1, ddive = 0;
  if (len > 0) {
    const D2 = 0.55, sa = s, sb = len - s;
    const ta = clamp01(sa / D2), tb = clamp01(sb / D2);
    const fa = ta * ta * (3 - 2 * ta), fb = tb * tb * (3 - 2 * tb);
    dive = fa * fb;
    ddive = 6 * ta * (1 - ta) / D2 * fb * (sa < D2 ? 1 : 0) - 6 * tb * (1 - tb) / D2 * fa * (sb < D2 ? 1 : 0);
  }
  const lift = 0.35 + 0.65 * dive;
  const z = prof * lift;
  const relief = 0.36;
  const dzA = -q / Math.max(0.2, prof) / hw * lift * relief;
  const dzS = prof * 0.65 * ddive * relief;
  const nx = isWarp ? -dzA : -dzS, ny = isWarp ? -dzS : -dzA;
  const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
  const ndl = (nx * LX2 + ny * LY2 + LZ2) * inv;
  const diffuse = Math.max(0, (ndl + 0.35) / (LZ2 + 0.35));
  let fib = 0;
  if (fibreLod > 0) {
    const phase = s * 3.2 + (isWarp ? a : -a) * 1.9;
    const n = valueNoise(phase * 2.5, (yarnId & 1023) + q * 1.5, 1 << 20, 1 << 20, st.seed);
    fib = (st.twist * 0.22 * Math.sin(TAU * phase + n * 2.2) + st.heather * 0.55 * (hash01(Math.floor(phase * 2) & 65535, yarnId, st.seed ^ 81) - 0.5) + 0.06 * n) * fibreLod;
  }
  const ao = 0.7 + 0.3 * dive;
  yarnInfo.b = (0.42 + 0.58 * diffuse) * ao * (1 + fib) * (0.94 + 0.08 * prof);
  yarnInfo.h = 0.3 + 0.7 * z;
  if (st.sheen > 0 && cellLod > 0) {
    const ndh = (nx * HX + ny * HY + HZ) * inv;
    return ndh > 0 ? Math.pow(ndh, 9) * st.sheen * 0.75 * dive * cellLod : 0;
  }
  return 0;
}
function weaveSample(u, v, out, ctx, s) {
  const x = u * s.E, y = v * s.Pk;
  const ex = Math.floor(x), py = Math.floor(y);
  const fx = x - ex, fy = y - py;
  const e = mod(ex, s.E), pk = mod(py, s.Pk);
  const di = mod(pk, s.dh) * s.dw + mod(e, s.dw);
  const warpUp = s.up[di];
  const warpC = s.warpColor ? s.warpColor(e, pk, u, v) : s.warpSeq[e % s.warpSeq.length];
  const weftC = s.weftColor ? s.weftColor(pk, e, u, v) : s.weftSeq[pk % s.weftSeq.length];
  if (s.style === "draft") {
    shade(out, warpUp ? DARK : LIGHT);
    out[4] = warpUp ? 0.7 : 0.3;
    return;
  }
  if (s.style === "flat") {
    shade(out, warpUp ? warpC : weftC);
    out[4] = 0.5;
    return;
  }
  const cellPx = Math.min(1 / s.E, 1 / s.Pk);
  const cellLod = detail(cellPx * 2, ctx.pixel);
  const fibreLod = detail(cellPx / 3.2, ctx.pixel) * (s.twist > 0 || s.heather > 0 ? 1 : 0.5);
  const topC = warpUp ? warpC : weftC, botC = warpUp ? weftC : warpC;
  const irr = s.irr;
  const yarnId = warpUp ? e : pk + 7919;
  const along = warpUp ? fy : fx, across = (warpUp ? fx : fy) - 0.5;
  const yarnTone = 1 + (hash01(yarnId, warpUp ? 1 : 2, s.seed) - 0.5) * 0.3 * irr;
  let hw = (1 - s.gap) * 0.5;
  if (s.slub > 0) {
    const F = warpUp ? s.slubFy : s.slubFx;
    hw *= 1 + s.slub * 0.28 * valueNoise((warpUp ? v : u) * F, yarnId * 3.1, F, 1 << 20, s.seed ^ 47);
  }
  hw *= 1 + (hash01(yarnId, 5, s.seed) - 0.5) * 0.12 * irr;
  hw = Math.min(0.5, Math.max(0.12, hw));
  const len = s.runLen[di], sPos = s.runPos[di] + along;
  const edgeW = (warpUp ? ctx.px * s.E : ctx.px * s.Pk) * 0.5 + 1e-6;
  const dTop = Math.abs(across) - hw;
  let spec = 0, hTop = 0.5;
  if (dTop < edgeW) {
    const aa = Math.min(Math.abs(across), hw * 0.999) * Math.sign(across || 1);
    spec = shadeYarn(aa, sPos, len, hw, warpUp, s, fibreLod, yarnId, cellLod);
    const crossTone = 1 + (hash01(e, pk, s.seed ^ 85) - 0.5) * 0.08 * irr;
    shade(_top, topC, yarnInfo.b * yarnTone * crossTone);
    if (spec > 0) {
      const w = 0.22 * topC[3];
      _top[0] += spec * (topC[0] * 0.78 + w);
      _top[1] += spec * (topC[1] * 0.78 + w);
      _top[2] += spec * (topC[2] * 0.78 + w);
    }
    hTop = yarnInfo.h;
  }
  let hBot = 0.1;
  if (dTop > -edgeW) {
    const acrossB = (warpUp ? fy : fx) - 0.5;
    const hwB = (1 - s.gap) * 0.5;
    const dB = Math.abs(acrossB) - hwB;
    const contact = 0.3 + 0.45 * smoothstep(0, 0.22, dTop);
    const profB = Math.sqrt(clamp01(1 - (acrossB / hwB) ** 2));
    shade(_bot, botC, contact * (0.55 + 0.45 * profB) * (1 + (hash01(warpUp ? pk + 7919 : e, warpUp ? 2 : 1, s.seed) - 0.5) * 0.3 * irr));
    hBot = 0.08 + 0.22 * profB;
    const edgeB = (warpUp ? ctx.px * s.Pk : ctx.px * s.E) * 0.5 + 1e-6;
    if (dB > -edgeB) {
      mix(_avg, topC, botC, 0.5);
      shade(_avg, _avg, 0.07);
      mix(_bot, _bot, _avg, clamp01(0.5 + dB / (2 * edgeB)));
      hBot *= 1 - clamp01(0.5 + dB / (2 * edgeB));
    }
  }
  const tTop = clamp01(0.5 - dTop / (2 * edgeW));
  mix(out, _bot, _top, tTop);
  let h = hBot + (hTop - hBot) * tTop;
  if (s.neps) {
    const n = s.neps, G = n.grid, gx = u * G, gy = v * G, ix = Math.floor(gx), iy = Math.floor(gy);
    const hx = hash01(mod(ix, G), mod(iy, G), s.seed ^ 119);
    if (hx < n.density) {
      const cx = ix + 0.25 + 0.5 * hash01(mod(ix, G), mod(iy, G), s.seed ^ 120), cy = iy + 0.25 + 0.5 * hash01(mod(iy, G), mod(ix, G), s.seed ^ 121);
      const d = Math.hypot((gx - cx) * (warpUp ? 1.6 : 0.8), (gy - cy) * (warpUp ? 0.8 : 1.6)) - n.size * (0.6 + 0.6 * hash01(mod(ix, G), mod(iy, G), s.seed ^ 122));
      const c = n.colors[Math.floor(hx / n.density * n.colors.length) % n.colors.length];
      const t = coverage(d / G, ctx.px) * tTop;
      if (t > 0) {
        shade(_scratch, c, 0.75 + 0.35 * yarnInfo.b);
        mix(out, out, _scratch, t);
      }
    }
  }
  if (s.fuzz > 0) {
    mix(_avg, warpC, weftC, 0.5);
    const nap = s.fuzzField(u, v);
    shade(_avg, _avg, 0.78 + 0.35 * nap);
    mix(out, out, _avg, s.fuzz * 0.75);
    h = h + (0.5 + 0.2 * (nap - 0.5) - h) * s.fuzz * 0.7;
  }
  if (cellLod < 1) {
    shade(_avg, topC, 0.78 * yarnTone);
    mix(_avg, _avg, botC, 0.12);
    mix(out, _avg, out, cellLod);
    h = 0.5 + (h - 0.5) * cellLod;
  }
  out[4] = h;
}
var lin = (arr) => arr.map(hexToLinear);
var expandOrder = (colors, counts) => {
  const seq = [];
  colors.forEach((c, i) => {
    for (let k = 0; k < counts[i % counts.length]; k++) seq.push(c);
  });
  return seq;
};
var features = (p, s) => [s.E, s.Pk, "threads"];
var weave = (def) => ({ category: "woven", scale: "repeats", features, sample: weaveSample, ...def });
var plain = weave({
  id: "plain-weave",
  name: "Plain weave (tabby)",
  tags: ["clothes", "cotton", "shirting", "canvas", "linen", "chambray"],
  description: "1/1 over-under: the base of poplin, canvas, chambray and linen. Different warp/weft colours give a chambray / iridescent look; raise slubs + heather for linen.",
  params: { ...COMMON, repeats: P.int(16, 1, 128, "Repeats", "Pattern repeats across the tile (1 repeat = 2 threads)."), warp: P.color("#3d5a80", "Warp colour"), weft: P.color("#e0e6ee", "Weft colour") },
  prepare: (p) => weaveState(drafts.plain(), [hexToLinear(p.warp)], [hexToLinear(p.weft)], p)
});
var twill = weave({
  id: "twill",
  name: "Twill",
  tags: ["clothes", "denim", "gabardine", "chino", "suiting", "drill"],
  description: "Diagonal-rib weave. 2/2 = gabardine/serge, 3/1 = denim/drill, 2/1 = chino. S or Z diagonal.",
  params: {
    ...COMMON,
    repeats: P.int(8, 1, 64, "Repeats"),
    over: P.int(2, 1, 6, "Over (warp up)"),
    under: P.int(2, 1, 6, "Under (warp down)"),
    direction: P.enumOf("Z", ["Z", "S"], "Diagonal", "Z rises to the right, S to the left."),
    warp: P.color("#4a3f35", "Warp colour"),
    weft: P.color("#b9a88f", "Weft colour")
  },
  prepare: (p) => weaveState(drafts.twill(p.over, p.under, p.direction), [hexToLinear(p.warp)], [hexToLinear(p.weft)], p)
});
var satin = weave({
  id: "satin",
  name: "Satin",
  tags: ["clothes", "silk", "lining", "luxury", "evening"],
  description: "Long floats with scattered interlacings: a smooth, lustrous face. Regular satin needs a move number coprime to the shaft count, so 6 shafts is not offered.",
  params: {
    ...COMMON,
    repeats: P.int(6, 1, 64, "Repeats"),
    yarnGap: P.float(0.03, 0, 0.5, "Yarn gap"),
    twist: P.float(0.15, 0, 1, "Fibre twist"),
    sheen: P.float(0.7, 0, 1, "Sheen", "Glossy highlight along the floats."),
    shafts: P.enumOf(5, [5, 7, 8, 10, 12], "Shafts"),
    face: P.enumOf("warp", ["warp", "weft"], "Face"),
    warp: P.color("#7b1e3a", "Warp colour"),
    weft: P.color("#5a1429", "Weft colour")
  },
  prepare: (p) => weaveState(drafts.satin(Number(p.shafts), p.face), [hexToLinear(p.warp)], [hexToLinear(p.weft)], p)
});
var basket = weave({
  id: "basket-weave",
  name: "Basket / hopsack / oxford",
  tags: ["clothes", "oxford", "hopsack", "upholstery", "shirting"],
  description: "Plain weave with k threads acting as one (2 = hopsack; white weft on a coloured warp = oxford cloth).",
  params: { ...COMMON, repeats: P.int(6, 1, 64, "Repeats"), group: P.int(2, 2, 6, "Threads per group"), warp: P.color("#e7dcc5", "Warp"), weft: P.color("#8a9a7b", "Weft") },
  prepare: (p) => weaveState(drafts.basket(p.group), [hexToLinear(p.warp)], [hexToLinear(p.weft)], p)
});
var herring = weave({
  id: "herringbone",
  name: "Herringbone twill",
  tags: ["clothes", "tweed", "coat", "suiting", "classic"],
  description: '2/2 twill whose diagonal reverses every N ends with a half-step offset ("broken" twill), giving the classic fish-bone zigzag.',
  params: {
    ...COMMON,
    repeats: P.int(3, 1, 32, "Repeats"),
    band: P.int(8, 2, 32, "Ends per band"),
    heather: adv(P.float(0.25, 0, 1, "Heather")),
    broken: adv(P.bool(true, "Broken reversal", "Offset the twill at each reversal (real herringbone). Off = plain zigzag.")),
    warp: P.color("#2b2b2b", "Warp"),
    weft: P.color("#cfc8b8", "Weft")
  },
  prepare: (p) => weaveState(drafts.herringbone(p.band, p.broken), [hexToLinear(p.warp)], [hexToLinear(p.weft)], p)
});
var houndstooth = weave({
  id: "houndstooth",
  name: "Houndstooth",
  tags: ["clothes", "tweed", "check", "classic", "print"],
  description: "Colour-and-weave effect: 2/2 twill with 4 dark / 4 light in both warp and weft. Band 2 = puppytooth, band 8 = large dogtooth. Use style=flat for a crisp printed version.",
  params: { ...COMMON, repeats: P.int(4, 1, 32, "Repeats"), band: P.int(4, 1, 16, "Threads per colour band"), colors: P.colors(["#151515", "#f2efe6"], "Dark, light", "", 2, 2) },
  prepare: (p) => {
    const seq = expandOrder(lin(p.colors), [p.band, p.band]);
    return weaveState(drafts.twill(2, 2, "Z"), seq, seq, p);
  }
});
var pickpick = weave({
  id: "pick-and-pick",
  name: "Pick-and-pick / sharkskin",
  tags: ["clothes", "suiting"],
  description: "2/2 twill with alternating 1 dark / 1 light warp and weft \u2014 the stepped sharkskin texture of suiting.",
  params: { ...COMMON, repeats: P.int(12, 1, 64, "Repeats"), colors: P.colors(["#2d3440", "#a9b1bc"], "Dark, light", "", 2, 2) },
  prepare: (p) => {
    const seq = lin(p.colors);
    return weaveState(drafts.twill(2, 2, "Z"), seq, seq, p);
  }
});
var glen = weave({
  id: "glen-check",
  name: "Glen check / Prince of Wales",
  tags: ["clothes", "suiting", "check", "classic"],
  description: "2/2 twill alternating a houndstooth block (4&4) with a hairline block (2&2) in warp and weft; optional coloured overcheck.",
  params: {
    ...COMMON,
    repeats: P.int(2, 1, 16, "Repeats"),
    colors: P.colors(["#1f1f1f", "#ece8dd"], "Dark, light", "", 2, 2),
    overcheck: P.bool(true, "Overcheck"),
    overcheckColor: P.color("#2f5e9e", "Overcheck colour")
  },
  prepare: (p) => {
    const [d, l] = lin(p.colors);
    const seq = [...expandOrder([d, l], [4, 4]), ...expandOrder([d, l], [4, 4]), ...expandOrder([d, l, d, l, d, l, d, l], [2])];
    if (p.overcheck) {
      const o = hexToLinear(p.overcheckColor);
      seq[16] = o;
      seq[17] = o;
    }
    return weaveState(drafts.twill(2, 2, "Z"), seq, seq, p);
  }
});
var gingham = weave({
  id: "gingham",
  name: "Gingham",
  tags: ["clothes", "shirt", "picnic", "check", "summer"],
  description: "Plain weave, equal coloured and white bands in warp and weft; the crossings of colour \xD7 white give the characteristic mid-tone. Use style=flat at small sizes for a print-style check.",
  params: { ...COMMON, repeats: P.int(4, 1, 32, "Repeats"), band: P.int(6, 1, 32, "Threads per band"), colors: P.colors(["#c8102e", "#ffffff"], "Colour, ground", "", 2, 2) },
  prepare: (p) => {
    const seq = expandOrder(lin(p.colors), [p.band, p.band]);
    return weaveState(drafts.plain(), seq, seq, p);
  }
});
var TARTAN_COLORS = {
  K: "#101012",
  W: "#efece3",
  R: "#b2182b",
  DR: "#7a1020",
  B: "#1f2f6b",
  DB: "#121a3a",
  LB: "#6b8fc9",
  A: "#4f8fc6",
  G: "#1d5a34",
  DG: "#0f3320",
  LG: "#6f9a4c",
  Y: "#e6c04a",
  N: "#7d7d7d",
  LN: "#b5b5b5",
  P: "#5b2a6e",
  T: "#8a5a2b",
  O: "#e0782a",
  C: "#c0306c",
  M: "#8b1c3b",
  S: "#b8574f",
  CA: "#c19a6b"
};
var TARTAN_PRESETS = {
  // Black Watch / simple setts follow public references (Wikipedia "Sett (tartans)", J. Howard tutorial);
  // the "-style" setts are designed look-alikes, not registered threadcounts.
  "black-watch": "B24 K4 B4 K4 B4 K20 G24 K6 G24 K20 B22 K4 B4",
  "simple-green": "G24 B4 G24 R6 G24 B4 G24",
  "four-colour": "K4 R24 K24 Y4",
  "buffalo-check": "R24 K24",
  "red-stewart-style": "R40 B8 K4 Y2 K4 W2 K4 G12 R6 W2 R6",
  "camel-check-style": "CA36 K4 CA4 K4 W4 K4 CA4 R2",
  "grey-flannel-style": "N24 LN4 N8 K2 N8 LN4",
  "madras-style": "#e94f37/12 #f6f7eb/2 #393e41/4 #3f88c5/12 #f6f7eb/2 #44bba4/8 #e7bb41/6"
};
function parseThreadcount(str) {
  const out = [];
  const re = /(#[0-9a-fA-F]{6}|[A-Za-z]{1,2})\s*\/?\s*(\d+)/g;
  let m;
  while ((m = re.exec(String(str))) && out.length < 400) {
    const key = m[1].startsWith("#") ? m[1] : m[1].toUpperCase();
    const color = key.startsWith("#") ? key : TARTAN_COLORS[key] || TARTAN_COLORS[key[0]] || "#808080";
    const n = Math.max(1, Math.min(400, parseInt(m[2], 10)));
    out.push({ color, n });
  }
  return out.length ? out : [{ color: "#b2182b", n: 8 }, { color: "#101012", n: 8 }];
}
function expandSett(items, symmetric = true) {
  return symmetric && items.length > 2 ? [...items, ...items.slice(1, -1).reverse()] : items;
}
var tartan = weave({
  id: "tartan",
  name: "Tartan / plaid (threadcount)",
  tags: ["clothes", "plaid", "kilt", "flannel", "check", "lumberjack"],
  description: 'Renders any tartan from a threadcount like "K4 R24 K24 Y4" (letters = colours, numbers = threads). Symmetric setts mirror about the pivots. Woven in 2/2 twill so crossing blocks blend like real cloth; raise "Brushed fuzz" for flannel.',
  params: {
    ...COMMON,
    repeats: P.int(1, 1, 16, "Repeats", "Setts across the tile."),
    yarnGap: P.float(0.06, 0, 0.5, "Yarn gap"),
    preset: P.enumOf("black-watch", [...Object.keys(TARTAN_PRESETS), "custom"], "Sett"),
    threadcount: P.string("K4 R24 K24 Y4", "Threadcount (when sett = custom)", "Letters: " + Object.keys(TARTAN_COLORS).join(" ") + ", or #rrggbb/N"),
    symmetric: P.bool(true, "Symmetric sett", "Mirror the threadcount about its pivots (most tartans)."),
    countScale: P.float(0.5, 0.1, 4, "Thread scale", "Multiplies every count: smaller = fewer, thicker threads per sett.")
  },
  prepare: (p) => {
    const tc = p.preset === "custom" ? p.threadcount : TARTAN_PRESETS[p.preset];
    const items = expandSett(parseThreadcount(tc), p.symmetric);
    const seq = [];
    for (const it of items) {
      const n = Math.max(2, Math.round(it.n * p.countScale / 2) * 2);
      const c = hexToLinear(it.color);
      for (let k = 0; k < n && seq.length < 4096; k++) seq.push(c);
    }
    return weaveState(drafts.twill(2, 2, "Z"), seq, seq, p);
  }
});
var denim = weave({
  id: "denim",
  name: "Denim",
  tags: ["clothes", "jeans", "workwear", "indigo"],
  description: "3/1 right-hand (Z) twill with more ends than picks (steep twill line), ring-spun indigo warp with slubs and tone variation, ecru weft, optional fade/wash.",
  params: {
    ...COMMON,
    repeats: P.int(16, 1, 64, "Repeats"),
    irregularity: P.float(0.7, 0, 1, "Irregularity"),
    slub: adv(P.float(0.35, 0, 1, "Slubs")),
    yarnGap: P.float(0.08, 0, 0.5, "Yarn gap"),
    direction: P.enumOf("Z", ["Z", "S"], "Twill direction", "Z = right-hand (most jeans), S = left-hand."),
    indigo: P.color("#1f3561", "Indigo warp"),
    weft: P.color("#d9d2c0", "Weft"),
    wash: P.float(0.35, 0, 1, "Wash / fade", "Low-frequency fading and whiskering.")
  },
  prepare: (p) => {
    const ind = hexToLinear(p.indigo), light = hexToLinear("#8fa9cf");
    const fade2 = noiseField({ fx: 3, fy: 2, octaves: 4, seed: p.seed + 11 });
    const c = [0, 0, 0, 1];
    return weaveState(drafts.twill(3, 1, p.direction), [ind], [hexToLinear(p.weft)], p, {
      ratio: 1.4,
      warpColor: (e, pk, u, v) => {
        const ring = hash01(e, 3, p.seed) * 0.6 + hash01(pk >> 3, e, p.seed ^ 9) * 0.4;
        const t = clamp01(ring * 0.35 * p.irregularity + (fade2(u, v) - 0.35) * 1.2 * p.wash);
        return mix(c, ind, light, t);
      }
    });
  }
});
var tweed = weave({
  id: "tweed",
  name: "Tweed (Donegal / Harris)",
  tags: ["clothes", "wool", "coat", "jacket", "country", "heritage"],
  description: "Heathered woollen yarns in a 2/2 twill or herringbone, flecked with coloured neps (Donegal). Rough, hairy, multi-tone.",
  params: {
    ...COMMON,
    repeats: P.int(12, 1, 48, "Repeats"),
    weave: P.enumOf("twill", ["twill", "herringbone", "plain"], "Weave"),
    irregularity: P.float(0.6, 0, 1, "Irregularity"),
    heather: P.float(0.6, 0, 1, "Heather"),
    slub: adv(P.float(0.4, 0, 1, "Slubs")),
    fuzz: adv(P.float(0.15, 0, 1, "Brushed fuzz")),
    warp: P.color("#5b5346", "Warp"),
    weft: P.color("#8a7d66", "Weft"),
    neps: P.float(0.35, 0, 1, "Neps (flecks)", "Density of coloured flecks."),
    nepColors: P.colors(["#c8553d", "#f2d0a4", "#3c6e71", "#e8c547"], "Fleck colours")
  },
  prepare: (p) => {
    const d = p.weave === "herringbone" ? drafts.herringbone(8, true) : p.weave === "plain" ? drafts.plain() : drafts.twill(2, 2, "Z");
    const st = weaveState(d, [hexToLinear(p.warp)], [hexToLinear(p.weft)], p);
    if (p.neps > 0) st.neps = { grid: Math.max(4, Math.round(st.E / 1.5)), density: p.neps * 0.12, size: 0.16, colors: lin(p.nepColors) };
    return st;
  }
});
var custom = weave({
  id: "weave-draft",
  name: "Custom weave draft",
  tags: ["clothes", "jacquard", "dobby", "custom", "waffle"],
  description: `Any dobby structure from a draft string: rows = picks separated by "/", 1 = warp up. Colour orders as colour lists with thread counts. Presets include waffle, bird's-eye and diamond twill.`,
  params: {
    ...COMMON,
    repeats: P.int(4, 1, 64, "Repeats"),
    draft: P.string("11100/01110/00111/10011/11001", "Draft rows", 'e.g. "1100/0110/0011/1001" = 2/2 twill (max 64\xD764)'),
    warpColors: P.colors(["#264653", "#e9c46a"], "Warp colour order"),
    warpCounts: P.string("6 2", "Warp counts", "Threads per colour, space separated (cycled)."),
    weftColors: P.colors(["#f4f1de"], "Weft colour order"),
    weftCounts: P.string("1", "Weft counts")
  },
  prepare: (p) => {
    const nums2 = (s) => (String(s).match(/\d+/g) || ["1"]).slice(0, 64).map((x) => Math.max(1, Math.min(256, +x)));
    return weaveState(drafts.parse(p.draft), expandOrder(lin(p.warpColors), nums2(p.warpCounts)), expandOrder(lin(p.weftColors), nums2(p.weftCounts)), p);
  }
});
var woven_default = [plain, twill, satin, basket, herring, houndstooth, pickpick, glen, gingham, tartan, denim, tweed, custom];

// src/patterns/knit.js
var hit = { z: -1, gx: 0, gy: 0, t: 0, a: 0, b: 0, elem: 0, r: 0, c: 0 };
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
  hit.z = z;
  hit.gx = dza * dx - dzb * dy;
  hit.gy = dza * dy + dzb * dx;
  hit.t = ta;
  hit.a = a;
  hit.b = b;
  hit.elem = elem;
  hit.r = r;
  hit.c = c;
}
function knitLegs(lx, ly, H, Lb, r, c, bias) {
  const tx = 0.46, ty = 1.42 * H, len = Math.sqrt(tx * tx + ty * ty);
  const dx = tx / len, dy = ty / len, La = len * 0.55;
  if (lx > -0.32 && lx < 0.64) element(lx, ly, 0.27, 0.71 * H, dx, dy, La, Lb, 0.4, bias, 0.22, 1, r, c);
  if (lx > 0.36 && lx < 1.32) element(lx, ly, 0.73, 0.71 * H, -dx, dy, La, Lb, -0.4, bias, 0.22, 2, r, c);
}
function purlBumps(lx, ly, H, Lb, r, c, bias) {
  element(lx, ly, 0.5, 0.36 * H, 1, 0, 0.5, Lb * 1.15, 1.1, bias, 0, 3, r, c);
  element(lx, ly, 1, 0.84 * H, 1, 0, 0.48, Lb, -1.1, bias - 0.05, 0, 4, r, c);
}
var STITCHES = {
  stockinette: () => ({ w: 1, h: 1, fn: () => "k" }),
  "reverse-stockinette": () => ({ w: 1, h: 1, fn: () => "p" }),
  garter: () => ({ w: 1, h: 2, fn: (r) => r & 1 ? "p" : "k" }),
  "rib-1x1": () => ({ w: 2, h: 1, fn: (r, c) => c & 1 ? "p" : "k" }),
  "rib-2x2": () => ({ w: 4, h: 1, fn: (r, c) => mod(c, 4) < 2 ? "k" : "p" }),
  "rib-3x1": () => ({ w: 4, h: 1, fn: (r, c) => mod(c, 4) < 3 ? "k" : "p" }),
  seed: () => ({ w: 2, h: 2, fn: (r, c) => r + c & 1 ? "p" : "k" }),
  moss: () => ({ w: 2, h: 4, fn: (r, c) => Math.floor(r / 2) + c & 1 ? "p" : "k" }),
  basketweave: () => ({ w: 8, h: 8, fn: (r, c) => Math.floor(r / 4) + Math.floor(c / 4) & 1 ? "p" : "k" }),
  "broken-rib": () => ({ w: 2, h: 2, fn: (r, c) => r & 1 ? "k" : c & 1 ? "p" : "k" }),
  welting: () => ({ w: 1, h: 8, fn: (r) => mod(r, 8) < 4 ? "k" : "p" }),
  "diamond-brocade": () => ({ w: 8, h: 8, fn: (r, c) => Math.abs(mod(c, 8) - 4) + Math.abs(mod(r, 8) - 4) === 4 ? "p" : "k" })
};
var CHARTS = {
  none: "0",
  diamonds: "00011000/00111100/01100110/11000011/11000011/01100110/00111100/00011000",
  zigzag: "10000001/01000010/00100100/00011000",
  "fair-isle-band": [
    "00000000",
    "00011000",
    "00100100",
    "01000010",
    "00100100",
    "00011000",
    "00000000",
    "22222222",
    "20202020",
    "22222222",
    "00000000",
    "10000001",
    "01000010",
    "00100100",
    "00011000",
    "00000000",
    "33333333"
  ].join("/"),
  snowflake: "000010000/010010010/001010100/000111000/111101111/000111000/001010100/010010010/000010000/000000000",
  hearts: "0000000000/0110001100/1111011110/1111111110/0111111100/0011111000/0001110000/0000100000/0000000000/0000000000",
  trees: "0000100000/0001110000/0011111000/0001110000/0011111000/0111111100/0001110000/0011111000/0111111100/1111111110/0000200000/0000200000/0000000000",
  checks: "1100/1100/0011/0011",
  stripes: "0/0/0/1/1/2/2/2"
};
function parseChart(str) {
  const rows = String(str).split(/[\/\n]+/).map((r) => r.trim()).filter(Boolean).slice(0, 128);
  if (!rows.length) return { w: 1, h: 1, g: new Uint8Array(1) };
  const w = Math.min(128, Math.max(...rows.map((r) => r.length)));
  const g = new Uint8Array(w * rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) g[y * w + x] = Math.max(0, Math.min(9, parseInt(row[x] || "0", 10) || 0));
  });
  return { w, h: rows.length, g };
}
var COMMON2 = {
  stitchesAcross: P.int(16, 2, 256, "Stitches across tile", "Higher = finer knit."),
  gauge: adv(P.float(1.36, 0.6, 2.5, "Rows per stitch width", "Row/stitch gauge ratio (\u224830 rows / 22 sts per 10 cm).")),
  yarnRadius: P.float(0.25, 0.14, 0.34, "Yarn thickness", "Thicker yarn closes the gaps between loops."),
  irregularity: P.float(0.4, 0, 1, "Irregularity", "Stitch-to-stitch tone variation (hand-knit look)."),
  fuzz: adv(P.float(0.35, 0, 1, "Fibre fuzz", "Ply striations and hairiness of the yarn.")),
  seed: P.seed(3)
};
function knitState(p, stitch, chart, colors) {
  const L = lcm(stitch.w, chart.w);
  const W2 = Math.max(1, Math.round(p.stitchesAcross / L)) * L;
  const rowRep = lcm(stitch.h, chart.h);
  const R = Math.max(1, Math.round(W2 * p.gauge / rowRep)) * rowRep;
  const kinds = new Uint8Array(stitch.w * stitch.h);
  for (let r = 0; r < stitch.h; r++) for (let c = 0; c < stitch.w; c++) kinds[r * stitch.w + c] = stitch.fn(r, c) === "p" ? 1 : 0;
  const allK = kinds.every((k) => k === 0), allP = kinds.every((k) => k === 1);
  const s = { W: W2, R, H: W2 / R, sw: stitch.w, sh: stitch.h, kinds, uniform: allK ? 1 : allP ? 2 : 0, chart, colors: colors.map(hexToLinear), p, Lb: 0.22 * (p.yarnRadius / 0.25) };
  s.bias = biasTable(s);
  return s;
}
var isPurl = (s, r, c) => s.kinds[mod(r, s.sh) * s.sw + mod(c, s.sw)] === 1;
var chartAt = (s, r, c) => s.chart.g[mod(r, s.chart.h) * s.chart.w + mod(c, s.chart.w)];
var _avg2 = [0, 0, 0, 0];
var LX3 = -0.48;
var LY3 = -0.58;
var LZ3 = 0.66;
function litYarn(s, fibreLod, seedY) {
  const nx = -hit.gx * 0.55, ny = -hit.gy * 0.55;
  const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
  const ndl = (nx * LX3 + ny * LY3 + LZ3) * inv;
  const diffuse = Math.max(0, (ndl + 0.4) / (LZ3 + 0.4));
  let fib = 0;
  if (fibreLod > 0) {
    const ph = hit.a * 7.5 + hit.b * 4.2;
    fib = (0.13 * Math.sin(TAU * ph) + 0.07 * valueNoise(ph * 3, hit.b * 9 + seedY, 1 << 20, 1 << 20, s.p.seed)) * fibreLod * (0.4 + s.p.fuzz);
  }
  const ao = 0.62 + 0.38 * Math.min(1, hit.z);
  return (0.4 + 0.6 * diffuse) * ao * (1 + fib);
}
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
function evalField(s, X, Y) {
  const c0 = Math.floor(X), r0 = Math.floor(Y), H = s.H, Lb = s.Lb;
  hit.z = -1;
  for (let dr = -2; dr <= 1; dr++) {
    const r = r0 + dr, ly = (Y - r) * H;
    if (ly < -0.75 * H || ly > 2.1 * H) continue;
    for (let dc = -1; dc <= 1; dc++) {
      const c = c0 + dc, lx = X - c;
      const bias = s.uniform ? s.uniform === 1 ? 0.16 : 0.08 : s.bias[mod(r, s.sh) * s.sw + mod(c, s.sw)];
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
    rr = Math.floor(Y);
    cc = Math.floor(X);
    b = 0.24 + 0.08 * Math.sin(TAU * (Y * 2 + X));
    h = 0.04;
  } else {
    rr = hit.r;
    cc = hit.c;
    b = litYarn(s, fibreLod, mod(rr, s.R) * 13.7);
    if (hit.elem >= 3) {
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
    shade(_avg2, s.colors[Math.min(chartAt(s, mod(Math.floor(Y), s.R), mod(Math.floor(X), s.W)), s.colors.length - 1)], 0.72 * tone);
    mix(out, _avg2, out, cellLod);
    h = 0.5 + (h - 0.5) * cellLod;
  }
  out[4] = clamp01(h);
}
var knitBase = {
  id: "knit",
  name: "Knit stitches",
  category: "knit",
  scale: "stitchesAcross",
  tags: ["clothes", "sweater", "jersey", "wool", "rib", "beanie"],
  description: "Stockinette/jersey, garter, ribs, seed, moss, basketweave, welting, diamond brocade \u2014 interlocking V stitches and purl bumps with real depth (purl columns recede in ribs).",
  params: {
    ...COMMON2,
    stitch: P.enumOf("stockinette", Object.keys(STITCHES), "Stitch pattern"),
    color: P.color("#b23a48", "Yarn colour")
  },
  prepare: (p) => knitState(p, STITCHES[p.stitch](), parseChart("0"), [p.color]),
  sample: knitSample,
  features: (p, s) => [s.W, s.R, "stitches"]
};
var fairIsle = {
  id: "fair-isle",
  name: "Fair Isle / jacquard knit",
  category: "knit",
  scale: "stitchesAcross",
  tags: ["clothes", "sweater", "nordic", "christmas", "colourwork", "jacquard"],
  description: 'Stockinette colourwork from a chart: rows separated by "/", digits index the palette (0 = background). Built-in charts: bands, snowflake, hearts, trees, diamonds\u2026',
  params: {
    ...COMMON2,
    stitchesAcross: P.int(24, 2, 256, "Stitches across tile"),
    chart: P.enumOf("fair-isle-band", Object.keys(CHARTS).concat("custom"), "Chart"),
    customChart: P.string("0110/1001/1001/0110", "Custom chart", 'Rows of digits separated by "/" (max 128\xD7128).'),
    colors: P.colors(["#f1ebdd", "#9b1d20", "#1d3557", "#3a6b35"], "Palette (0,1,2,3\u2026)", "", 1, 10)
  },
  prepare: (p) => knitState(p, STITCHES.stockinette(), parseChart(p.chart === "custom" ? p.customChart : CHARTS[p.chart]), p.colors),
  sample: knitSample,
  features: (p, s) => [s.W, s.R, "stitches"]
};
var _strand = { x: 0, slope: 0, front: 0 };
function strandPath(kind, k, block, t, crossLen) {
  const q = clamp01(t / crossLen), s = q * q * (3 - 2 * q), ds = q > 0 && q < 1 ? 6 * q * (1 - q) / crossLen : 0;
  if (kind === "rope") {
    const from2 = k === 0 ? 1 : 3, to2 = k === 0 ? 3 : 1;
    _strand.x = from2 + (to2 - from2) * s;
    _strand.slope = (to2 - from2) * ds;
    _strand.front = k === 0 ? 1 : 0;
    return;
  }
  const left = (block & 1) === 0;
  const a = left ? 1 : 3, b = left ? 3 : 5, still = left ? 5 : 1;
  if (k === 2) {
    _strand.x = still;
    _strand.slope = 0;
    _strand.front = 0;
    return;
  }
  const from = k === 0 ? a : b, to = k === 0 ? b : a;
  _strand.x = from + (to - from) * s;
  _strand.slope = (to - from) * ds;
  _strand.front = to === 3 ? 1 : 0;
}
var cable = {
  id: "cable-knit",
  name: "Cable knit (aran)",
  category: "knit",
  scale: "stitchesAcross",
  tags: ["clothes", "sweater", "aran", "fisherman", "wool", "chunky"],
  description: "Rope cables (2 strands) or braids (3 strands) of stockinette crossing every N rows, raised over a reverse-stockinette or seed-stitch ground, with depth shading and cast shadows.",
  params: {
    ...COMMON2,
    stitchesAcross: P.int(24, 8, 256, "Stitches across tile"),
    yarnRadius: P.float(0.27, 0.14, 0.34, "Yarn thickness"),
    cable: P.enumOf("rope", ["rope", "braid", "mixed"], "Cable type", "mixed = rope and braid panels alternating (aran sweater)."),
    crossEvery: P.int(6, 4, 16, "Rows between crossings"),
    purlBetween: P.int(2, 1, 6, "Ground stitches each side"),
    ground: P.enumOf("reverse-stockinette", ["reverse-stockinette", "seed"], "Ground stitch"),
    color: P.color("#e8dcc4", "Yarn colour")
  },
  prepare: (p) => {
    const widthOf = (kind) => (kind === "rope" ? 4 : 6) + 2 * p.purlBetween;
    const kinds = p.cable === "mixed" ? ["rope", "braid"] : [p.cable];
    const unit = kinds.reduce((a, k) => a + widthOf(k), 0);
    const W2 = Math.max(unit, Math.round(p.stitchesAcross / unit) * unit);
    const period = (p.cable === "rope" ? 1 : 2) * p.crossEvery;
    const R = Math.max(period, Math.round(W2 * p.gauge / period) * period);
    const panels = [];
    let x0 = 0;
    for (const k of kinds) {
      panels.push({ kind: k, x0, w: widthOf(k) });
      x0 += widthOf(k);
    }
    const ground = p.ground === "seed" ? STITCHES.seed() : STITCHES["reverse-stockinette"]();
    const gk = new Uint8Array(ground.w * ground.h);
    for (let r = 0; r < ground.h; r++) for (let c = 0; c < ground.w; c++) gk[r * ground.w + c] = ground.fn(r, c) === "p" ? 1 : 0;
    const st = {
      W: W2,
      R,
      H: W2 / R,
      unit,
      panels,
      crossLen: Math.min(p.crossEvery * 0.6, 3.2),
      color: hexToLinear(p.color),
      p,
      sw: ground.w,
      sh: ground.h,
      kinds: gk,
      uniform: p.ground === "seed" ? 0 : 2,
      Lb: 0.22 * (p.yarnRadius / 0.25)
    };
    st.bias = biasTable(st);
    return st;
  },
  features: (p, s) => [s.W, s.R, "stitches"],
  sample(u, v, out, ctx, s) {
    const p = s.p, H = s.H;
    const X = u * s.W, Y = v * s.R;
    const cellLod = detail(1 / s.W, ctx.pixel * 1.6);
    const fibreLod = detail(1 / (s.W * 7), ctx.pixel);
    const ux = mod(X, s.unit);
    let panel = s.panels[0];
    for (const pn of s.panels) if (ux >= pn.x0 && ux < pn.x0 + pn.w) panel = pn;
    const local = ux - panel.x0 - p.purlBetween;
    const cw = panel.kind === "rope" ? 4 : 6;
    const tone = 1 + (hash01(mod(Math.floor(X), s.W), mod(Math.floor(Y), s.R), p.seed) - 0.5) * 0.2 * p.irregularity;
    const block = Math.floor(Y / p.crossEvery), t = Y - block * p.crossEvery;
    const nStr = panel.kind === "rope" ? 2 : 3;
    let best = -1, bestFront = -1, bestS = 0, bestX = 0, frontEdge = 9, anyEdge = 9;
    for (let k = 0; k < nStr; k++) {
      strandPath(panel.kind, k, block, t, s.crossLen);
      const slopePhys = _strand.slope / H;
      const norm = 1 / Math.sqrt(1 + slopePhys * slopePhys);
      const d = Math.abs(local - _strand.x) * norm;
      const e = d - 0.98;
      if (e < anyEdge) anyEdge = e;
      if (_strand.front && e < frontEdge) frontEdge = e;
      if (e < 0 && (_strand.front > bestFront || _strand.front === bestFront && d < Math.abs(bestS))) {
        best = k;
        bestFront = _strand.front;
        bestS = (local - _strand.x) * norm;
        bestX = _strand.x;
      }
    }
    let b, h;
    if (best >= 0) {
      const sx = local - bestX + 1;
      hit.z = -1;
      const c0 = Math.floor(sx), r0 = Math.floor(Y);
      for (let dr = -2; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const c = c0 + dc;
        if (c < 0 || c > 1) continue;
        knitLegs(sx - c, (Y - (r0 + dr)) * H, H, s.Lb * 1.05, r0 + dr, c, 0);
      }
      const across = bestS / 0.98, cyl = Math.sqrt(clamp01(1 - across * across));
      if (hit.z < 0) {
        b = 0.2;
      } else b = litYarn(s, fibreLod, best * 31.7);
      b *= 0.72 + 0.28 * cyl + 0.12 * -across;
      if (!bestFront) b *= 0.55 + 0.45 * smoothstep(0, 0.6, frontEdge);
      h = (bestFront ? 0.55 : 0.4) + 0.35 * cyl * (0.6 + 0.4 * Math.max(0, hit.z));
    } else {
      evalField(s, X, Y);
      if (hit.z < 0) {
        b = 0.16;
        h = 0.02;
      } else {
        b = litYarn(s, fibreLod, mod(Math.floor(Y), s.R) * 7.3);
        h = 0.05 + 0.3 * Math.min(1, hit.z);
      }
      if (local > -1.5 && local < cw + 1.5) b *= 0.55 + 0.45 * smoothstep(0, 0.9, anyEdge);
      b *= 0.9;
    }
    shade(out, s.color, b * tone);
    if (cellLod < 1) {
      shade(_avg2, s.color, 0.72 * tone);
      mix(out, _avg2, out, cellLod);
      h = 0.5 + (h - 0.5) * cellLod;
    }
    out[4] = clamp01(h);
  }
};
var knit_default = [knitBase, fairIsle, cable];

// src/patterns/geometric.js
var lin2 = (a) => a.map(hexToLinear);
var _c = [0, 0, 0, 0];
var _d = [0, 0, 0, 0];
var nums = (s, def = [1]) => {
  const m = String(s).match(/\d*\.?\d+/g);
  const a = m ? m.map(Number).filter((x) => x > 0 && Number.isFinite(x)) : [];
  return a.length ? a.slice(0, 64) : def;
};
function bandColor(out, t, edges, cols, aaT) {
  let k = 0;
  while (k < edges.length - 1 && t >= edges[k]) k++;
  const start = k === 0 ? 0 : edges[k - 1], end = edges[k];
  const dS = t - start, dE = end - t;
  const L = cols.length;
  if (dS < dE) return mix(out, cols[mod(k - 1, L)], cols[k % L], clamp01(0.5 + dS / aaT));
  return mix(out, cols[(k + 1) % L], cols[k % L], clamp01(0.5 + dE / aaT));
}
var DIRS = { horizontal: [0, 1], vertical: [1, 0], diagonal: [1, 1], "anti-diagonal": [1, -1], shallow: [1, 2], steep: [2, 1] };
var stripes = {
  id: "stripes",
  name: "Stripes",
  category: "geometric",
  scale: "repeats",
  tags: ["clothes", "print", "breton", "pinstripe", "awning", "graphics", "wavy"],
  description: 'Any number of coloured bands with relative widths, horizontal/vertical/diagonal, optionally wavy. Pinstripe: widths "1 14". Breton: "1 1.4". Soft = blurred band edges.',
  features: (p) => [p.repeats, p.repeats, "repeats"],
  params: {
    colors: P.colors(["#1b2a49", "#f4f1ea"], "Band colours (cycled)"),
    widths: P.string("1 1", "Relative widths", "Space-separated, one per band (cycled to match colours)."),
    direction: P.enumOf("horizontal", Object.keys(DIRS), "Direction"),
    repeats: P.int(8, 1, 256, "Repeats"),
    wave: P.float(0, 0, 2, "Wave amplitude", "In stripe-repeat units; 0 = straight."),
    waveFreq: P.int(2, 1, 32, "Waves across"),
    soft: adv(P.float(0, 0, 1, "Soft edges"))
  },
  prepare: (p) => {
    const w = nums(p.widths);
    const n = p.colors.length;
    const ws = Array.from({ length: Math.max(n, w.length) }, (_, i) => w[i % w.length]);
    const cols = Array.from({ length: ws.length }, (_, i) => hexToLinear(p.colors[i % n]));
    const total = ws.reduce((a2, b2) => a2 + b2, 0);
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
      const along = s.db * u - s.da * v;
      t += p.wave * Math.sin(TAU * p.waveFreq * along);
      grad = Math.hypot(grad, p.wave * TAU * p.waveFreq * Math.hypot(s.da, s.db));
    }
    bandColor(out, fract(t), s.edges, s.cols, ctx.px * grad + p.soft * 0.25);
  }
};
var checker = {
  id: "checkerboard",
  name: "Checkerboard",
  category: "geometric",
  scale: "cells",
  tags: ["print", "graphics", "floor", "racing", "harlequin", "retro"],
  description: "Two-colour checks, square or diagonal (harlequin diamonds). Cell count is forced even so it tiles.",
  features: (p, s) => [s.n, s.n, "cells"],
  params: {
    cells: P.int(8, 2, 256, "Cells across (even)"),
    colors: P.colors(["#111111", "#f2f2f2"], "Colours", "", 2, 2),
    diagonal: P.bool(false, "Diagonal (harlequin)")
  },
  prepare: (p) => ({ n: evenInt(p.cells), cols: lin2(p.colors), p }),
  sample(u, v, out, ctx, s) {
    let x = u * s.n, y = v * s.n, scale = 1;
    if (s.p.diagonal) {
      const a = (x + y) * 0.5, b = (x - y) * 0.5;
      x = a;
      y = b;
      scale = Math.SQRT1_2;
    }
    const sgn = (z) => (fract(z / 2) < 0.5 ? 1 : -1) * clamp01(Math.min(fract(z), 1 - fract(z)) * scale / s.n / (ctx.px * 0.5));
    const k = 0.5 + 0.5 * sgn(x) * sgn(y);
    mix(out, s.cols[1], s.cols[0], k);
  }
};
var SHAPES = ["circle", "ring", "square", "diamond", "cross", "star", "heart", "flower", "triangle", "hexagon", "teardrop", "moon", "leaf"];
function shapeSDF(shape, x, y, r) {
  switch (shape) {
    case "ring":
      return Math.abs(Math.hypot(x, y) - r * 0.75) - r * 0.25;
    case "square":
      return Math.max(Math.abs(x), Math.abs(y)) - r * 0.82;
    case "diamond":
      return (Math.abs(x) + Math.abs(y) - r) * 0.7071;
    case "cross": {
      const ax = Math.abs(x), ay = Math.abs(y), w = r * 0.3;
      return Math.min(Math.max(ax - r, ay - w), Math.max(ax - w, ay - r));
    }
    case "star":
      return sdStar5(x, y, r, 0.45);
    case "heart":
      return sdHeart(x / (r * 2), y / (r * 2)) * r * 2;
    case "flower": {
      let d = Math.hypot(x, y) - r * 0.32;
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * TAU - Math.PI / 2;
        d = Math.min(d, Math.hypot(x - Math.cos(a) * r * 0.55, y - Math.sin(a) * r * 0.55) - r * 0.42);
      }
      return d;
    }
    case "triangle":
      return sdPolygon(x, -y + r * 0.15, r, 3);
    case "hexagon":
      return sdPolygon(y, x, r * 0.95, 6);
    case "teardrop": {
      const px = Math.abs(x), py = -(y - r * 0.35), r1 = r * 0.62, r2 = r * 0.04, hh = r * 1.2;
      const b = (r1 - r2) / hh, a = Math.sqrt(1 - b * b);
      const k = -b * px + a * py;
      if (k < 0) return Math.hypot(px, py) - r1;
      if (k > a * hh) return Math.hypot(px, py - hh) - r2;
      return a * px + b * py - r1;
    }
    case "moon":
      return Math.max(Math.hypot(x, y) - r, -(Math.hypot(x - r * 0.42, y - r * 0.2) - r * 0.8));
    case "leaf": {
      const c = Math.SQRT1_2, xr = (x - y) * c, yr = (x + y) * c;
      const R = r * 1.05, off = R * 0.62;
      return Math.max(Math.hypot(xr - off, yr) - R, Math.hypot(xr + off, yr) - R);
    }
    default:
      return Math.hypot(x, y) - r;
  }
}
var dots = {
  id: "dots",
  name: "Polka dots & tossed motifs",
  category: "geometric",
  scale: "cells",
  tags: ["clothes", "print", "polka", "confetti", "graphics", "kids", "ditsy", "floral"],
  description: "Dots, stars, hearts, flowers, leaves, moons\u2026 in textile repeat layouts: block, half-drop, brick or tossed (random, non-overlapping). Optional outline and flower centres make ditsy florals.",
  features: (p, s) => [s.n, s.n, "cells"],
  params: {
    layout: P.enumOf("half-drop", ["block", "half-drop", "brick", "tossed"], "Repeat layout"),
    shape: P.enumOf("circle", SHAPES, "Motif"),
    cells: P.int(8, 2, 128, "Cells across"),
    size: P.float(0.28, 0.05, 0.5, "Motif radius (cell units)"),
    sizeJitter: P.float(0, 0, 1, "Size variation"),
    rotate: P.bool(false, "Random rotation"),
    background: P.color("#f6efe2", "Background", '"transparent" for motifs only.'),
    colors: P.colors(["#c1272d"], "Motif colours (random pick)"),
    outline: adv(P.float(0, 0, 0.1, "Outline width (cell units)")),
    outlineColor: adv(P.color("#1d1d1d", "Outline colour")),
    centerColor: adv(P.color("transparent", "Centre dot colour", 'E.g. yellow flower centres. "transparent" = none.')),
    seed: P.seed(5)
  },
  prepare: (p) => ({
    n: p.layout === "block" || p.layout === "tossed" ? p.cells : evenInt(p.cells),
    bg: hexToLinear(p.background),
    cols: lin2(p.colors),
    oc: hexToLinear(p.outlineColor),
    cc: hexToLinear(p.centerColor),
    p
  }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = s.n;
    const X = u * n, Y = v * n;
    const xi = Math.floor(X), yi = Math.floor(Y);
    let best = 1e9, bestCol = 0, bestCenter = 1e9;
    const h = _h2;
    for (let j = -2; j <= 2; j++) {
      for (let i = -1; i <= 1; i++) {
        const ci = xi + i, cj = yi + j, wi = mod(ci, n), wj = mod(cj, n);
        let cx = ci + 0.5, cy = cj + 0.5;
        if (p.layout === "half-drop" && wi & 1) cy += 0.5;
        if (p.layout === "brick" && wj & 1) cx += 0.5;
        hash01x3(wi, wj, p.seed, h);
        const r = p.size * (1 - p.sizeJitter * 0.6 * h[2]);
        if (p.layout === "tossed") {
          const room = Math.max(0, 0.5 - r);
          cx += (h[0] - 0.5) * 2 * room;
          cy += (h[1] - 0.5) * 2 * room;
        }
        let dx = X - cx, dy = Y - cy;
        if (dx * dx + dy * dy > (r * 1.6 + 0.1) ** 2) continue;
        if (p.rotate) {
          const a = hash01(wi, wj, p.seed ^ 77) * TAU, ca = Math.cos(a), sa = Math.sin(a);
          const rx = ca * dx + sa * dy, ry = -sa * dx + ca * dy;
          dx = rx;
          dy = ry;
        }
        const d = shapeSDF(p.shape, dx, dy, r);
        if (d < best) {
          best = d;
          bestCol = hashU32(wi, wj, p.seed ^ 31) % s.cols.length;
          bestCenter = Math.hypot(dx, dy) - r * 0.2;
        }
      }
    }
    shade(out, s.bg, 1);
    const ow = p.outline;
    if (ow > 0) mix(out, out, s.oc, coverage((best - ow) / n, ctx.px));
    mix(out, out, s.cols[bestCol], coverage(best / n, ctx.px));
    if (s.cc[3] > 0 && best < 0) mix(out, out, s.cc, coverage(bestCenter / n, ctx.px));
  }
};
var _h2 = [0, 0, 0];
var chevron = {
  id: "chevron",
  name: "Chevron / zigzag",
  category: "geometric",
  scale: "zigs",
  tags: ["clothes", "print", "missoni", "graphics"],
  description: "Zigzag bands. Band count is rounded to a multiple of the colour count so colours tile. Rounded = soft wave zigzag.",
  features: (p) => [p.zigs, p.bands, "zigzags"],
  params: {
    colors: P.colors(["#264653", "#2a9d8f", "#e9c46a", "#f4a261", "#e76f51"], "Band colours"),
    bands: P.int(10, 1, 128, "Bands (vertical)"),
    zigs: P.int(4, 1, 64, "Zigzags across"),
    amplitude: P.float(1.5, 0, 8, "Amplitude (bands)"),
    rounded: P.float(0, 0, 1, "Rounded peaks")
  },
  prepare: (p) => {
    const L = p.colors.length;
    const n = Math.max(1, Math.round(p.bands / L)) * L;
    const edges = Array.from({ length: L }, (_, i) => (i + 1) / L);
    return { n, cols: lin2(p.colors), edges, p };
  },
  sample(u, v, out, ctx, s) {
    const p = s.p, L = s.cols.length;
    const x = u * p.zigs;
    const tw = tri(x), sw = 0.5 - 0.5 * Math.cos(TAU * x);
    const wave = tw + (sw - tw) * p.rounded;
    const y = v * s.n + p.amplitude * wave;
    const grad = Math.hypot(s.n, 2 * p.amplitude * p.zigs) / L;
    bandColor(out, fract(y / L), s.edges, s.cols, ctx.px * grad);
  }
};
var argyle = {
  id: "argyle",
  name: "Argyle",
  category: "geometric",
  scale: "cols",
  tags: ["clothes", "knitwear", "socks", "golf", "preppy"],
  description: "Alternating diamonds on a ground with thin diagonal overcheck lines (dashed option, like the stitched original).",
  features: (p, s) => [s.n, s.m, "diamonds"],
  params: {
    cols: P.int(4, 2, 64, "Diamonds across (even)"),
    rows: P.int(2, 2, 64, "Diamond rows (even)"),
    colors: P.colors(["#5b2333", "#2e4057", "#c9b79c"], "Diamond A, diamond B, ground", "", 3, 3),
    lineColor: P.color("#f2e8cf", "Overcheck line"),
    lineWidth: P.float(0.012, 0, 0.05, "Line width (uv)"),
    dashed: P.bool(false, "Dashed overcheck")
  },
  prepare: (p) => ({ n: evenInt(p.cols), m: evenInt(p.rows), c: lin2(p.colors), line: hexToLinear(p.lineColor), p }),
  sample(u, v, out, ctx, s) {
    const P_ = u * s.n + v * s.m, Q = u * s.n - v * s.m;
    const fp = Math.floor(P_), fq = Math.floor(Q);
    const colOf = (a, b) => (a + b & 1) === 0 ? mod(a, 2) ? s.c[0] : s.c[1] : s.c[2];
    const col = colOf(fp, fq);
    const g = Math.hypot(s.n, s.m);
    const dP = Math.min(fract(P_), 1 - fract(P_)) / g, dQ = Math.min(fract(Q), 1 - fract(Q)) / g;
    const dEdge = Math.min(dP, dQ);
    const nfp = dP < dQ ? fract(P_) < 0.5 ? fp - 1 : fp + 1 : fp;
    const nfq = dP < dQ ? fq : fract(Q) < 0.5 ? fq - 1 : fq + 1;
    mix(out, colOf(nfp, nfq), col, clamp01(0.5 + dEdge / ctx.px));
    if (s.p.lineWidth > 0) {
      const lp = Math.abs(fract(P_) - 0.5) / g, lq = Math.abs(fract(Q) - 0.5) / g;
      let dl = Math.min(lp, lq) - s.p.lineWidth * 0.5;
      if (s.p.dashed) {
        const along = lp < lq ? Q : P_;
        if (fract(along * 6) > 0.6) dl = 1;
      }
      mix(out, out, s.line, coverage(dl, ctx.px));
    }
  }
};
function hexCell(u, v, n, K, res) {
  const X = u * n, Y = v * K * SQRT3;
  const ax = mod(X, 1) - 0.5, ay = mod(Y, SQRT3) - SQRT3 / 2;
  const bx = mod(X - 0.5, 1) - 0.5, by = mod(Y - SQRT3 / 2, SQRT3) - SQRT3 / 2;
  if (ax * ax + ay * ay < bx * bx + by * by) {
    res.x = ax;
    res.y = ay;
    res.i = mod(Math.floor(X), n);
    res.j = mod(Math.floor(Y / SQRT3), K) * 2;
  } else {
    res.x = bx;
    res.y = by;
    res.i = mod(Math.floor(X - 0.5), n);
    res.j = mod(Math.floor((Y - SQRT3 / 2) / SQRT3), K) * 2 + 1;
  }
  return res;
}
var _hx = { x: 0, y: 0, i: 0, j: 0 };
var honeycomb = {
  id: "honeycomb",
  name: "Hexagon / honeycomb",
  category: "geometric",
  scale: "cells",
  tags: ["graphics", "tiles", "sci-fi", "mesh", "print"],
  description: "Pointy-top hex grid. Vertical rows are chosen so hexes are within a few % of regular on a square tile. Cells, outline-only or bevelled tiles.",
  features: (p) => [p.cells, p.cells, "hexes"],
  params: {
    cells: P.int(8, 1, 128, "Hexes across"),
    style: P.enumOf("cells", ["cells", "lines", "bevel"], "Style"),
    line: P.float(0.06, 0, 0.4, "Line width (hex units)"),
    background: P.color("#1d1d24", "Line / gap colour"),
    colors: P.colors(["#f2b134", "#f7c75e", "#e89f1f", "#fad681"], "Cell colours (random)"),
    seed: P.seed(2)
  },
  prepare: (p) => ({ n: p.cells, K: Math.max(1, Math.round(p.cells / SQRT3)), bg: hexToLinear(p.background), cols: lin2(p.colors), p }),
  sample(u, v, out, ctx, s) {
    const c = hexCell(u, v, s.n, s.K, _hx);
    const hx = Math.abs(c.x), hy = Math.abs(c.y);
    const dh = Math.max(hx, hx * 0.5 + hy * (SQRT3 / 2));
    const edge = (0.5 - dh) / s.n;
    const p = s.p;
    const col = s.cols[hashU32(c.i, c.j, p.seed) % s.cols.length];
    if (p.style === "lines") {
      mix(out, s.cols[0], s.bg, coverage(edge - p.line * 0.5 / s.n, ctx.px));
      return;
    }
    let k = 1;
    if (p.style === "bevel") {
      const bw = 0.1, t = clamp01((0.5 - dh) / bw);
      if (t < 1) {
        const nx = hx * 0.5 + hy * (SQRT3 / 2) > hx ? 0.5 * Math.sign(c.x) : Math.sign(c.x);
        const ny = hx * 0.5 + hy * (SQRT3 / 2) > hx ? SQRT3 / 2 * Math.sign(c.y) : 0;
        k = lambert(nx * 1.2, ny * 1.2) * (0.85 + 0.15 * t) + (1 - t) * 0;
      }
      out[4] = 0.5 + 0.5 * t;
    }
    shade(_c, col, k);
    mix(out, s.bg, _c, coverage(-(edge - p.line * 0.5 / s.n), ctx.px));
    if (p.style !== "bevel") out[4] = 0.5 + 0.5 * clamp01((0.5 - dh) * 4);
  }
};
var truchet = {
  id: "truchet",
  name: "Truchet tiles",
  category: "geometric",
  scale: "cells",
  tags: ["graphics", "maze", "generative", "print"],
  description: "Smith quarter-circle tiles (2-colourable: colour = inside \u2295 orientation \u2295 parity), 10-PRINT maze, or triangle tiles.",
  features: (p, s) => [s.n, s.n, "tiles"],
  params: {
    variant: P.enumOf("arcs", ["arcs", "maze", "triangles"], "Variant"),
    cells: P.int(10, 2, 128, "Tiles across (even)"),
    fill: P.bool(true, "Two-colour fill"),
    lineWidth: P.float(0.08, 0, 0.5, "Line width (tile units)"),
    colors: P.colors(["#0f4c5c", "#f6e7cb", "#e36414"], "Colour A, B, line", "", 3, 3),
    seed: P.seed(11)
  },
  prepare: (p) => ({ n: evenInt(p.cells), c: lin2(p.colors), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = s.n;
    const X = u * n, Y = v * n, i = Math.floor(X), j = Math.floor(Y), fx = X - i, fy = Y - j;
    const o = hashU32(mod(i, n), mod(j, n), p.seed) >>> 31;
    const par = i + j & 1;
    let dLine = 1e9;
    if (p.variant === "arcs") {
      const c0x = o ? 1 : 0, c1x = o ? 0 : 1;
      const l0 = Math.hypot(fx - c0x, fy), l1 = Math.hypot(fx - c1x, fy - 1);
      dLine = Math.min(Math.abs(l0 - 0.5), Math.abs(l1 - 0.5));
      const inside = l0 < 0.5 || l1 < 0.5 ? 1 : 0;
      const fillSide = inside ^ o ^ par;
      if (p.fill) mix(out, s.c[fillSide ^ 1], s.c[fillSide], clamp01(0.5 + dLine / n / ctx.px));
      else shade(out, s.c[1]);
    } else if (p.variant === "maze") {
      dLine = o ? Math.abs(fx - fy) / Math.SQRT2 : Math.abs(fx + fy - 1) / Math.SQRT2;
      shade(out, s.c[1]);
    } else {
      const sd = (o ? fx - fy : fx + fy - 1) / Math.SQRT2;
      const fillSide = (sd > 0 ? 1 : 0) ^ par;
      mix(out, s.c[fillSide ^ 1], s.c[fillSide], clamp01(0.5 + Math.abs(sd) / n / ctx.px));
    }
    if (p.lineWidth > 0 && dLine < 1e8) mix(out, out, s.c[2], coverage((dLine - p.lineWidth * 0.5) / n, ctx.px));
  }
};
var scales = {
  id: "seigaiha",
  name: "Seigaiha / scales",
  category: "geometric",
  scale: "cells",
  tags: ["print", "japanese", "kimono", "waves", "mermaid", "clothes"],
  description: "Overlapping concentric half-circles (Japanese wave pattern). Rings alternate through the palette.",
  features: (p) => [p.cells, p.cells * 4, "scales"],
  params: {
    cells: P.int(6, 1, 64, "Scales across"),
    rings: P.int(4, 1, 12, "Rings per scale"),
    colors: P.colors(["#1d3557", "#f1faee", "#457b9d", "#f1faee"], "Ring colours (outer \u2192 inner)"),
    outline: P.float(0.03, 0, 0.2, "Outline (scale units)"),
    outlineColor: P.color("#1d3557", "Outline colour")
  },
  prepare: (p) => ({ n: p.cells, cols: lin2(p.colors), line: hexToLinear(p.outlineColor), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = s.n, X = u * n, Y = v * n;
    const j0 = Math.floor(Y / 0.25);
    for (let j = j0 + 3; j >= j0 - 2; j--) {
      const off = mod(j, 2) * 0.5;
      const i = Math.round(X - off);
      const dx = X - (i + off), dy = Y - j * 0.25;
      const r = Math.hypot(dx, dy);
      if (r < 0.5) {
        const t = r / 0.5 * p.rings;
        const k = Math.min(p.rings - 1, Math.floor(p.rings - t));
        shade(out, s.cols[k % s.cols.length]);
        const dRing = Math.min(fract(t), 1 - fract(t)) * 0.5 / p.rings / n;
        const dOuter = (0.5 - r) / n;
        const dl = Math.min(dRing, dOuter) - p.outline * 0.5 / n;
        if (p.outline > 0) mix(out, out, s.line, coverage(dl, ctx.px));
        return;
      }
    }
    shade(out, s.cols[0]);
  }
};
var ogee = {
  id: "ogee",
  name: "Ogee lattice",
  category: "geometric",
  scale: "cols",
  tags: ["print", "damask", "wallpaper", "moroccan", "clothes"],
  description: "Interlocking onion shapes. Exact two-family tiling because sin\xB2(\u03C0y) + sin\xB2(\u03C0(y+\xBD)) = 1. Optional inner outline and centre dot.",
  features: (p) => [p.cols, p.rows, "shapes"],
  params: {
    cols: P.int(4, 1, 64, "Shapes across"),
    rows: P.int(3, 1, 64, "Shapes down"),
    colors: P.colors(["#e9d8a6", "#94d2bd"], "Family A, family B", "", 2, 2),
    line: P.float(0.03, 0, 0.2, "Outline (cell units)"),
    lineColor: P.color("#005f73", "Outline"),
    inset: P.float(0.12, 0, 0.4, "Inner outline inset (0 = off)"),
    dot: adv(P.float(0, 0, 0.2, "Centre dot size"))
  },
  prepare: (p) => ({ c: lin2(p.colors), line: hexToLinear(p.lineColor), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.cols, m = p.rows;
    const X = u * n, Y = v * m, fx = fract(X), fy = fract(Y);
    const sn = Math.sin(Math.PI * fy);
    const g = Math.abs(fx - 0.5) - 0.5 * sn * sn;
    const grad = Math.hypot(n, 0.5 * Math.PI * Math.sin(TAU * fy) * m);
    const d = g / grad;
    mix(out, s.c[1], s.c[0], clamp01(0.5 - d / ctx.px));
    if (p.line > 0) {
      let dl = Math.abs(d) - p.line * 0.5 / n;
      if (p.inset > 0) dl = Math.min(dl, Math.abs(Math.abs(d) - p.inset / n) - p.line * 0.35 / n);
      mix(out, out, s.line, coverage(dl, ctx.px));
    }
    if (p.dot > 0) {
      const dA = Math.hypot((fx - 0.5) / m, (fy - 0.5) / n), dB = Math.hypot((Math.abs(fx - 0.5) - 0.5) / m, (Math.abs(fy - 0.5) - 0.5) / n);
      mix(out, out, s.line, coverage(Math.min(dA, dB) - p.dot / Math.max(n, m) / 2, ctx.px));
    }
  }
};
function hankinPolygon(cx, cy, inr, n, rot, theta, segs) {
  for (let i = 0; i < n; i++) {
    const phi = rot + i * TAU / n, phiN = rot + (i + 1) * TAU / n;
    const mx = cx + inr * Math.cos(phi), my = cy + inr * Math.sin(phi);
    const tx = -Math.sin(phi), ty = Math.cos(phi), nx = -Math.cos(phi), ny = -Math.sin(phi);
    const dx = Math.cos(theta) * tx + Math.sin(theta) * nx, dy = Math.cos(theta) * ty + Math.sin(theta) * ny;
    const b = (phi + phiN) / 2, bx = Math.cos(b), by = Math.sin(b);
    const den = dx * by - dy * bx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((cx - mx) * by - (cy - my) * bx) / den;
    const ix = mx + dx * t, iy = my + dy * t;
    const mnx = cx + inr * Math.cos(phiN), mny = cy + inr * Math.sin(phiN);
    segs.push([mx, my, ix, iy], [ix, iy, mnx, mny]);
  }
}
var islamic = {
  id: "islamic-star",
  name: "Islamic star (Hankin)",
  category: "geometric",
  scale: "repeats",
  tags: ["print", "tiles", "moroccan", "zellige", "graphics", "ornament"],
  description: "Hankin's polygons-in-contact: rays leave each edge midpoint at a contact angle and meet inside the tile. 4.8.8 tiling gives 8-point stars, 6.6.6 gives 6-point stars (hex rows fitted to the square tile), 4.4.4.4 gives crosses.",
  features: (p) => [p.repeats, p.repeats, "repeats"],
  params: {
    tiling: P.enumOf("4.8.8", ["4.8.8", "4.4.4.4", "6.6.6"], "Underlying tiling"),
    angle: P.float(67.5, 20, 85, "Contact angle (deg)"),
    repeats: P.int(2, 1, 32, "Repeats"),
    width: P.float(0.035, 2e-3, 0.15, "Strap width (cell units)"),
    style: P.enumOf("strap", ["line", "strap"], "Style"),
    colors: P.colors(["#0b3954", "#f4d35e", "#0b3954"], "Ground, strap, strap edge", "", 3, 3)
  },
  prepare: (p) => {
    const th = p.angle * Math.PI / 180;
    const base = [];
    if (p.tiling === "6.6.6") {
      hankinPolygon(0, 0, 0.5, 6, 0, th, base);
      return { hex: true, segs: Float64Array.from(base.flat()), c: lin2(p.colors), p, n: p.repeats * 2, K: Math.max(1, Math.round(p.repeats * 2 / SQRT3)) };
    }
    if (p.tiling === "4.8.8") {
      hankinPolygon(0.5, 0.5, 0.5, 8, 0, th, base);
      hankinPolygon(0, 0, Math.tan(Math.PI / 8) / 2, 4, Math.PI / 4, th, base);
    } else hankinPolygon(0.5, 0.5, 0.5, 4, 0, th, base);
    const segs = [];
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) for (const s of base) {
      const q = [s[0] + ox, s[1] + oy, s[2] + ox, s[3] + oy];
      const pad = 0.2;
      if (Math.max(q[0], q[2]) < -pad || Math.min(q[0], q[2]) > 1 + pad || Math.max(q[1], q[3]) < -pad || Math.min(q[1], q[3]) > 1 + pad) continue;
      segs.push(q);
    }
    return { hex: false, segs: Float64Array.from(segs.flat()), c: lin2(p.colors), p };
  },
  sample(u, v, out, ctx, s) {
    const p = s.p;
    let X, Y, n;
    if (s.hex) {
      const c = hexCell(u, v, s.n, s.K, _hx);
      X = c.x;
      Y = c.y;
      n = s.n;
    } else {
      n = p.repeats;
      X = fract(u * n);
      Y = fract(v * n);
    }
    let d = 1e9;
    const g = s.segs;
    for (let k = 0; k < g.length; k += 4) {
      const dd = sdSegment(X, Y, g[k], g[k + 1], g[k + 2], g[k + 3]);
      if (dd < d) d = dd;
    }
    const half = p.width * 0.5;
    shade(out, s.c[0]);
    if (p.style === "line") {
      mix(out, out, s.c[1], coverage((d - half) / n, ctx.px));
      return;
    }
    const edge = half * 0.28;
    mix(out, out, s.c[2], coverage((d - half) / n, ctx.px));
    mix(out, out, s.c[1], coverage((d - half + edge) / n, ctx.px));
    out[4] = 0.5 + 0.5 * clamp01(1 - d / half);
  }
};
var _tz = { d: 0, id: 0 };
function chipLayer(X, Y, n, seed, size, prob, h3) {
  const xi = Math.floor(X), yi = Math.floor(Y);
  let best = 1e9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const wi = mod(xi + i, n), wj = mod(yi + j, n);
    hash01x3(wi, wj, seed, h3);
    if (h3[2] > prob) continue;
    const cx = xi + i + 0.2 + 0.6 * h3[0], cy = yi + j + 0.2 + 0.6 * h3[1];
    const dx = X - cx, dy = Y - cy;
    if (dx * dx + dy * dy > size * size * 2.2) continue;
    const a = Math.atan2(dy, dx), ph = hash01(wi, wj, seed ^ 99) * TAU;
    const R = size * (0.55 + 0.45 * hash01(wj, wi, seed ^ 7));
    const rr = R * (1 + 0.12 * Math.sin(3 * a + ph) + 0.09 * Math.sin(5 * a - ph * 2) + 0.14 * Math.sin(2 * a + ph * 3) + 0.05 * Math.sin(7 * a + ph));
    const d = Math.hypot(dx, dy) - rr;
    if (d < best) {
      best = d;
      id = hashU32(wi, wj, seed ^ 2748);
    }
  }
  _tz.d = best;
  _tz.id = id;
  return _tz;
}
var terrazzo = {
  id: "terrazzo",
  name: "Terrazzo",
  category: "geometric",
  scale: "density",
  tags: ["graphics", "interior", "surface", "print", "stone"],
  description: "Irregular stone chips at two scales plus fine grit on a speckled ground, with subtle per-chip polish variation.",
  features: (p) => [p.density, p.density, "chips"],
  params: {
    density: P.int(7, 1, 64, "Large chips across"),
    chipSize: P.float(0.32, 0.05, 0.5, "Chip size"),
    background: P.color("#ece6dc", "Ground"),
    colors: P.colors(["#c75d3c", "#2f5d62", "#e3b23c", "#9aa5a1", "#3d3b3c"], "Chip colours"),
    grit: adv(P.float(0.5, 0, 1, "Fine grit")),
    seed: P.seed(8)
  },
  prepare: (p) => ({ bg: hexToLinear(p.background), cols: lin2(p.colors), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.density, h3 = _h2;
    const lod = detail(1 / 900, ctx.pixel);
    const speck = (hash01(mod(Math.floor(u * 900), 900), mod(Math.floor(v * 900), 900), p.seed) - 0.5) * 0.08 * lod;
    shade(out, s.bg, 1 + speck);
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
    shade(_c, s.cols[id1 % s.cols.length], 0.93 + 0.12 * hash01(mod(Math.floor(u * 300), 300), mod(Math.floor(v * 300), 300), id1) + 0.04 * (id1 >>> 8 & 1));
    mix(out, out, _c, coverage(d1 / n, ctx.px));
  }
};
var SCREENS = { "0\xB0": [1, 0], "45\xB0": [1, 1], "26.6\xB0": [2, 1], "18.4\xB0": [3, 1] };
var halftone = {
  id: "halftone",
  name: "Halftone screen",
  category: "geometric",
  scale: "cells",
  tags: ["graphics", "pop-art", "comic", "print", "retro", "risograph"],
  description: "Screen of dots, lines or squares whose size follows a periodic noise / wave / radial field. Screen angles use integer lattice vectors so the tile stays seamless.",
  features: (p) => [p.cells, p.cells, "dots"],
  params: {
    cells: P.int(24, 4, 256, "Dots across"),
    angle: P.enumOf("45\xB0", Object.keys(SCREENS), "Screen angle"),
    dot: P.enumOf("circle", ["circle", "line", "square", "diamond"], "Dot shape"),
    field: P.enumOf("noise", ["noise", "waves", "radial", "flat"], "Tone field"),
    tone: P.float(0.5, 0, 1, "Tone (flat field)"),
    scale: P.int(2, 1, 16, "Field frequency"),
    contrast: P.float(1.4, 0.2, 4, "Contrast"),
    colors: P.colors(["#f7f1e3", "#e63946"], "Paper, ink", "", 2, 2),
    seed: P.seed(4)
  },
  prepare: (p) => {
    const [a, b] = SCREENS[p.angle];
    const k = Math.max(1, Math.round(p.cells / Math.hypot(a, b)));
    return { a, b, k, c: lin2(p.colors), p, f: noiseField({ freq: p.scale, octaves: 4, seed: p.seed }) };
  },
  sample(u, v, out, ctx, s) {
    const { a, b, k, p } = s;
    const S = (a * u + b * v) * k, T = (-b * u + a * v) * k;
    const L2 = (a * a + b * b) * k, sc = k * Math.hypot(a, b);
    const s0 = Math.floor(S), t0 = Math.floor(T);
    const si = S - s0 < 0.5 ? -1 : 1, ti = T - t0 < 0.5 ? -1 : 1;
    let d = 1e9;
    const nearS = Math.abs(S - s0 - 0.5) > 0.37, nearT = Math.abs(T - t0 - 0.5) > 0.37;
    for (let q = 0; q < 4; q++) {
      if (q && (q & 1 && !nearS || q & 2 && !nearT)) continue;
      const cs = s0 + (q & 1 ? si : 0) + 0.5, ct = t0 + (q & 2 ? ti : 0) + 0.5;
      const cu = (a * cs - b * ct) / L2, cv = (b * cs + a * ct) / L2;
      let f;
      if (p.field === "flat") f = p.tone;
      else if (p.field === "waves") f = 0.5 + 0.25 * Math.sin(TAU * p.scale * cu) + 0.25 * Math.sin(TAU * p.scale * (cv + 0.3 * Math.sin(TAU * cu)));
      else if (p.field === "radial") {
        const dx = fract(cu * p.scale) - 0.5, dy = fract(cv * p.scale) - 0.5;
        f = 1 - Math.min(1, Math.hypot(dx, dy) * 2);
      } else f = s.f(cu, cv);
      f = clamp01(0.5 + (f - 0.5) * p.contrast);
      const ds = S - cs, dt = T - ct;
      let dd;
      if (p.dot === "line") dd = Math.abs(dt) - f * 0.5;
      else if (p.dot === "square") dd = Math.max(Math.abs(ds), Math.abs(dt)) - Math.sqrt(f) * 0.5;
      else if (p.dot === "diamond") dd = (Math.abs(ds) + Math.abs(dt) - Math.sqrt(f) * 0.72) * 0.7071;
      else dd = Math.hypot(ds, dt) - Math.sqrt(f) * 0.62;
      if (dd < d) d = dd;
      if (p.dot === "line" || p.dot === "square") break;
    }
    mix(out, s.c[0], s.c[1], coverage(d / sc, ctx.px));
  }
};
var contour = {
  id: "contour-lines",
  name: "Topographic contours",
  category: "geometric",
  scale: "levels",
  tags: ["graphics", "map", "outdoor", "print", "abstract"],
  description: "Iso-lines of a periodic fbm field with constant on-screen width (gradient-normalised), thicker index lines every Nth level; optional hypsometric colour fill.",
  features: (p) => [p.scale, p.scale, "hills"],
  params: {
    levels: P.int(14, 2, 64, "Levels"),
    scale: P.int(2, 1, 16, "Field frequency"),
    lineWidth: P.float(1.6, 0.3, 6, "Line width (px @512)"),
    indexEvery: P.int(5, 0, 20, "Index line every"),
    fill: P.bool(false, "Hypsometric fill"),
    colors: P.colors(["#f3efe0", "#7a5c3e"], "Ground, line", "", 2, 2),
    fillColors: P.colors(["#2b5f4a", "#7da36b", "#e6d8a6", "#c58b4e", "#f4efe6"], "Fill ramp"),
    seed: P.seed(6)
  },
  prepare: (p) => ({ c: lin2(p.colors), ramp: lin2(p.fillColors), p, f: noiseField({ freq: p.scale, octaves: 4, gain: 0.45, seed: p.seed }) }),
  sample(u, v, out, ctx, s) {
    const p = s.p;
    const e = 1 / 2048;
    const F = (a, b) => (s.f(a, b) - 0.5) * 2.5 + 0.5;
    const f = F(u, v);
    const fx = (F(u + e, v) - f) / e, fy = (F(u, v + e) - f) / e;
    const t = f * p.levels, gl = Math.hypot(fx, fy) * p.levels + 1e-6;
    const k = Math.round(t);
    const d = Math.abs(t - k) / gl;
    const isIndex = p.indexEvery > 0 && mod(k, p.indexEvery) === 0;
    const w = p.lineWidth / 512 * (isIndex ? 2 : 1) * 0.5;
    if (p.fill) ramp(out, s.ramp, clamp01(Math.floor(t) / p.levels));
    else shade(out, s.c[0]);
    mix(out, out, s.c[1], coverage(d - w, ctx.px));
    out[4] = clamp01(f);
  }
};
var bricks = {
  id: "bricks",
  name: "Bricks / tiles",
  category: "geometric",
  scale: "cols",
  tags: ["graphics", "game", "wall", "material", "subway-tile", "masonry"],
  description: "Running, stack, Flemish or basket-weave bond with recessed mortar; every brick has its own tone, noisy pitted surface and slightly chipped edges, plus a bevelled height map (good for normal maps).",
  features: (p, s) => [p.cols, s.m, "bricks"],
  params: {
    bond: P.enumOf("running", ["running", "stack", "flemish", "basket"], "Bond"),
    cols: P.int(4, 1, 64, "Bricks per row"),
    rows: P.int(8, 2, 128, "Rows (even for running)"),
    mortar: P.float(0.06, 0, 0.3, "Mortar (brick-height units)"),
    colors: P.colors(["#9c4a33", "#b05a3c", "#8a3f2c", "#a8553b"], "Brick colours"),
    mortarColor: P.color("#cfc6b8", "Mortar"),
    roughness: P.float(0.5, 0, 1, "Surface noise"),
    chipping: adv(P.float(0.4, 0, 1, "Edge chipping")),
    seed: P.seed(9)
  },
  prepare: (p) => ({
    m: p.bond === "stack" ? p.rows : evenInt(p.rows),
    c: lin2(p.colors),
    mc: hexToLinear(p.mortarColor),
    p,
    rough: noiseField({ freq: 16, octaves: 4, seed: p.seed, range: "signed" }),
    chip: noiseField({ freq: 48, octaves: 2, seed: p.seed + 5, range: "signed" })
  }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.cols, m = s.m;
    const Y = v * m, row = Math.floor(Y);
    let X = u * n, splitV = false;
    if (p.bond === "running") X += mod(row, 2) ? 0.5 : 0;
    else if (p.bond === "flemish") X = u * n * 1.5 + (mod(row, 2) ? 0.75 : 0);
    else if (p.bond === "basket") splitV = (Math.floor(u * n) + Math.floor(Y / 2) & 1) === 1;
    let col = Math.floor(X), fx = X - col, fy = Y - row, bw = m / n, bh = 1, brow = row;
    if (p.bond === "flemish") {
      const unit = Math.floor(X / 1.5), w = X - unit * 1.5;
      if (w < 1) {
        fx = w;
        col = unit * 2;
        bw = m / (n * 1.5);
      } else {
        fx = (w - 1) / 0.5;
        col = unit * 2 + 1;
        bw = m / (n * 3);
      }
    } else if (p.bond === "basket") {
      const bx = u * n, by = Y / 2, ix = Math.floor(bx), iy = Math.floor(by);
      const lx = bx - ix, ly = by - iy;
      if (splitV) {
        col = ix * 2 + (lx < 0.5 ? 0 : 1);
        fx = (lx < 0.5 ? lx : lx - 0.5) * 2;
        fy = ly;
        bw = m / (2 * n);
        bh = 2;
        brow = iy * 2;
      } else {
        col = ix * 2;
        fx = lx;
        fy = fract(ly * 2);
      }
    }
    const nz = p.roughness * s.rough(u, v);
    const chip = p.chipping * 0.06 * s.chip(u, v);
    const dx = Math.min(fx, 1 - fx) * bw, dy = Math.min(fy, 1 - fy) * bh;
    const dEdge = Math.min(dx, dy) - p.mortar * 0.5 + chip;
    const wi = mod(col, p.bond === "running" || p.bond === "stack" ? n : n * 2), wj = mod(brow, m);
    const base = s.c[hashU32(wi, wj, p.seed) % s.c.length];
    const pit = (worley(u, v, n * 6, m * 3, p.seed + 3, 1, _wr).f1 < 0.12 ? -0.12 : 0) * p.roughness;
    shade(_c, base, 0.85 + 0.3 * hash01(wi, wj, p.seed ^ 5) + nz * 0.25 + pit);
    shade(_d, s.mc, 0.92 + nz * 0.15);
    const ao = 0.75 + 0.25 * smoothstep(-p.mortar * 0.5, 0, dEdge);
    _d[0] *= ao;
    _d[1] *= ao;
    _d[2] *= ao;
    const bev = smoothstep(0, 0.08, dEdge);
    const lightK = 1 + (1 - bev) * 0.18 * ((fy < 0.5 ? 1 : -1) * (dy < dx ? 1 : 0) + (fx < 0.5 ? 1 : -1) * (dx <= dy ? 1 : 0));
    shade(_c, _c, lightK);
    mix(out, _d, _c, coverage(-dEdge / m, ctx.px));
    out[4] = dEdge < 0 ? 0.1 : clamp01(0.4 + 0.55 * smoothstep(0, 0.15, dEdge) + nz * 0.15 + pit * 0.6);
  }
};
var _wr = { f1: 0, f2: 0, id: 0, dx: 0, dy: 0, cx: 0, cy: 0 };
var grid = {
  id: "grid-paper",
  name: "Grid paper (graph / dot / isometric)",
  category: "geometric",
  scale: "cells",
  tags: ["graphics", "paper", "notebook", "blueprint", "technical", "typography"],
  description: "Graph paper with minor and major lines, dot grid, or isometric (triangular) grid \u2014 backgrounds for type specimens, blueprints and notebooks. Lines keep a constant pixel width at any size.",
  features: (p) => [p.cells, p.cells, "cells"],
  params: {
    style: P.enumOf("lines", ["lines", "dots", "isometric"], "Style"),
    cells: P.int(16, 2, 256, "Cells across"),
    majorEvery: P.int(4, 0, 16, "Major line every (0 = none)"),
    lineWidth: P.float(1, 0.3, 6, "Line width (px @512)"),
    colors: P.colors(["#f7f5ee", "#b9d4e8", "#6f9fc8"], "Paper, minor line, major line", "", 3, 3)
  },
  prepare: (p) => {
    const n = p.majorEvery > 0 ? Math.max(1, Math.round(p.cells / p.majorEvery)) * p.majorEvery : p.cells;
    const K = Math.max(1, Math.round(n / SQRT3));
    return { n, K, c: lin2(p.colors), p };
  },
  sample(u, v, out, ctx, s) {
    const p = s.p, n = s.n;
    const w = p.lineWidth / 512 * 0.5, wMaj = w * 1.8;
    shade(out, s.c[0]);
    if (p.style === "dots") {
      const fx = fract(u * n), fy = fract(v * n);
      const d = Math.hypot(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy)) / n;
      const ix = Math.round(u * n), iy = Math.round(v * n);
      const major = p.majorEvery > 0 && mod(ix, p.majorEvery) === 0 && mod(iy, p.majorEvery) === 0;
      mix(out, out, s.c[major ? 2 : 1], coverage(d - (major ? wMaj : w) * 2.6, ctx.px));
      return;
    }
    const lineSet = (a, scale) => {
      const k = Math.round(a);
      return [Math.abs(a - k) / scale, p.majorEvery > 0 && mod(k, p.majorEvery) === 0];
    };
    const fams = [];
    if (p.style === "lines") fams.push(lineSet(u * n, n), lineSet(v * n, n));
    else {
      const rows = s.K * 2, Y = v * rows, X = u * n * 2;
      fams.push(lineSet(Y, rows));
      fams.push(lineSet((X + Y) / 2, Math.hypot(n, rows / 2)), lineSet((X - Y) / 2, Math.hypot(n, rows / 2)));
    }
    for (const [d, maj] of fams) if (!maj) mix(out, out, s.c[1], coverage(d - w, ctx.px));
    for (const [d, maj] of fams) if (maj) mix(out, out, s.c[2], coverage(d - wMaj, ctx.px));
  }
};
var geometric_default = [stripes, checker, dots, chevron, argyle, honeycomb, truchet, scales, ogee, islamic, terrazzo, halftone, contour, bricks, grid];

// src/patterns/organic.js
var lin3 = (a) => a.map(hexToLinear);
var _c2 = [0, 0, 0, 0];
var _d2 = [0, 0, 0, 0];
var _w = [0, 0];
var W = { f1: 0, f2: 0, id: 0, dx: 0, dy: 0, cx: 0, cy: 0, edge: 0 };
var BIG = 1 << 20;
var noise = {
  id: "noise",
  name: "Fractal noise (fbm / ridged / turbulence)",
  category: "organic",
  scale: "frequency",
  tags: ["graphics", "clouds", "heightmap", "mask", "game", "terrain"],
  description: "Periodic Perlin/value fbm with optional domain warp, mapped through a colour ramp. Use output=height for height maps.",
  features: (p) => [p.frequency, p.frequency, "blobs"],
  params: {
    basis: P.enumOf("perlin", ["perlin", "value"], "Basis"),
    mode: P.enumOf("fbm", ["fbm", "ridged", "turbulence"], "Mode"),
    frequency: P.int(4, 1, 64, "Base frequency (integer)"),
    octaves: P.int(6, 1, 10, "Octaves"),
    gain: P.float(0.5, 0.1, 0.9, "Gain (persistence)"),
    warp: P.float(0, 0, 1, "Domain warp"),
    contrast: P.float(1, 0.2, 4, "Contrast"),
    colors: P.colors(PALETTES.ocean, "Colour ramp"),
    seed: P.seed(1)
  },
  prepare: (p) => ({
    ramp: lin3(p.colors),
    p,
    f: noiseField({ freq: p.frequency, octaves: p.octaves, gain: p.gain, seed: p.seed, basis: p.basis, mode: p.mode }),
    w: warpField(p.warp * 0.25, 2, p.seed, 4)
  }),
  sample(u, v, out, ctx, s) {
    const p = s.p;
    if (p.warp > 0) {
      s.w(u, v, _w);
      u = _w[0];
      v = _w[1];
    }
    let f = s.f(u, v);
    f = clamp01(0.5 + (f - 0.5) * p.contrast);
    ramp(out, s.ramp, f);
    out[4] = f;
  }
};
var marble = {
  id: "marble",
  name: "Marble",
  category: "organic",
  scale: "veins",
  tags: ["graphics", "stone", "luxury", "interior", "material", "carrara", "calacatta"],
  description: "Turbulence-displaced veins (Perlin marble) at two scales: bold main veins with a soft halo and a sharp core, a web of fine hairline veins, and cloudy tonal drifts. Presets: Carrara, Calacatta gold, Nero Marquina, verde.",
  features: (p) => [p.veins, p.veins, "veins"],
  params: {
    base: P.color("#eeebe5", "Base"),
    vein: P.color("#5d5a57", "Vein"),
    tint: P.color("#c9b8a0", "Cloud tint"),
    accent: adv(P.color("#b08d57", "Vein halo / accent", "Colour of the soft halo around main veins (gold for Calacatta).")),
    veins: P.int(1, 1, 16, "Main veins"),
    turbulence: P.float(1, 0, 6, "Turbulence"),
    sharpness: P.float(5, 1, 30, "Vein sharpness"),
    fine: P.float(0.5, 0, 1, "Fine veins"),
    seed: P.seed(12)
  },
  prepare: (p) => ({
    b: hexToLinear(p.base),
    v: hexToLinear(p.vein),
    t: hexToLinear(p.tint),
    a: hexToLinear(p.accent),
    p,
    turb: noiseField({ freq: 2, octaves: 7, gain: 0.55, seed: p.seed, mode: "turbulence" }),
    turb2: noiseField({ freq: 4, octaves: 5, seed: p.seed + 3, mode: "turbulence" }),
    cloud: noiseField({ freq: 3, octaves: 5, seed: p.seed + 9 }),
    web: noiseField({ freq: 6, octaves: 3, seed: p.seed + 21, mode: "ridged" })
  }),
  sample(u, v, out, ctx, s) {
    const p = s.p;
    const turb = s.turb(u, v);
    const t1 = Math.sin(TAU * (p.veins * (u + v) + p.turbulence * turb));
    const t2 = Math.sin(TAU * (p.veins * 3 * (u - v) + p.turbulence * 1.6 * s.turb2(u, v)));
    const a1 = 1 - Math.abs(t1);
    const core = Math.pow(a1, p.sharpness * 2.2), halo = Math.pow(a1, p.sharpness * 0.35);
    const m2 = Math.pow(1 - Math.abs(t2), p.sharpness * 3) * 0.3;
    const web = Math.pow(s.web(u, v), 18) * 0.35 * p.fine;
    const cloud = s.cloud(u, v);
    mix(out, s.b, s.t, smoothstep(0.45, 0.9, cloud) * 0.6);
    mix(out, out, s.a, halo * 0.35);
    mix(out, out, s.v, clamp01(core + m2 * p.fine * 2 + web));
    out[4] = 0.5 - 0.2 * clamp01(core + m2);
  }
};
var granite = {
  id: "granite",
  name: "Granite / speckled stone",
  category: "organic",
  scale: "grain",
  tags: ["stone", "material", "kitchen", "interior", "speckle", "game"],
  description: "Interlocking mineral grains (Voronoi crystals) in a weighted palette \u2014 feldspar, quartz, mica \u2014 with polished glints and slight clouding.",
  features: (p) => [p.grain, p.grain, "grains"],
  params: {
    grain: P.int(48, 8, 256, "Grains across"),
    colors: P.colors(["#c9c2b8", "#8c857c", "#3b3836", "#e9e4dc", "#a4704f"], "Minerals (first = most common)"),
    contrast: P.float(1, 0.3, 2, "Contrast"),
    glints: P.float(0.4, 0, 1, "Mica glints"),
    seed: P.seed(23)
  },
  prepare: (p) => ({ c: lin3(p.colors), p, cloud: noiseField({ freq: 3, octaves: 4, seed: p.seed + 2 }) }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.grain;
    worley(u, v, n, n, p.seed, 1, W, 0, 1);
    const r = (W.id >>> 8) / 16777216, k = Math.min(s.c.length - 1, Math.floor(Math.pow(r, 1.8) * s.c.length));
    const tone = 1 + ((W.id & 255) / 255 - 0.5) * 0.25 * p.contrast;
    shade(out, s.c[k], tone * (0.92 + 0.16 * s.cloud(u, v)));
    worley(u, v, n * 3, n * 3, p.seed + 1, 1, W, 0, 1);
    if ((W.id & 7) === 0) shade(out, s.c[(W.id >>> 3) % s.c.length], 0.95);
    if (p.glints > 0 && (W.id & 63) < 2 && W.f1 < 0.3) {
      const g = p.glints * (1 - W.f1 / 0.3);
      out[0] += g;
      out[1] += g;
      out[2] += g * 0.95;
    }
    out[4] = 0.5 + 0.05 * (tone - 1);
  }
};
var woodOut = { pore: 0, knot: 0 };
function woodGrain(along, across, id, rings, wobble, knots, seed) {
  const h1 = hash01(id, 11, seed), h2 = hash01(id, 12, seed), h3 = hash01(id, 13, seed);
  const centre = 0.5 + (h1 - 0.5) * 3;
  const depth = 0.6 + h2 * 2.2, slope = (h3 - 0.5) * 0.45;
  const n1 = valueNoise(along * 0.9, id * 3.7, BIG, BIG, seed) * wobble;
  const n2 = valueNoise(along * 4, across * 3 + id, BIG, BIG, seed + 1) * wobble * 0.15;
  let x = across - centre + n1 * 0.12 + n2 * 0.05;
  let dz = depth + slope * along + 0.25 * Math.sin(along * 0.7 + h1 * 6);
  let knot = 0;
  if (knots > 0) {
    const kk = Math.floor(along / 3);
    if (hash01(id, kk, seed ^ 107) < knots * 0.35) {
      const ky = kk * 3 + 0.6 + 1.8 * hash01(id, kk, seed ^ 108), kx = 0.2 + 0.6 * hash01(kk, id, seed ^ 109);
      const dx = (across - kx) * 1.6, dy = along - ky, dk = Math.hypot(dx, dy * 0.8);
      knot = Math.exp(-dk * dk * 18);
      x += dx * 0.6 * Math.exp(-dk * dk * 3) * Math.sign(dx || 1) * 0.3;
      dz -= Math.exp(-dk * dk * 4) * 0.8;
    }
  }
  const r = Math.sqrt(x * x * 2.5 + dz * dz) * rings * 0.6;
  const f = fract(r);
  const late = smoothstep(0.35, 0.92, f) * (1 - smoothstep(0.94, 1, f));
  woodOut.pore = valueNoise(across * 70, along * 2.5 + id * 5, BIG, BIG, seed + 5) * 0.5 + 0.5;
  woodOut.knot = knot;
  return clamp01(0.18 + late * 0.55 + knot * 0.6);
}
var wood = {
  id: "wood",
  name: "Wood planks / floorboards",
  category: "organic",
  scale: "planks",
  tags: ["graphics", "floor", "material", "game", "interior", "oak", "timber"],
  description: "Flat-sawn boards with cathedral growth-ring arches, wobbling grain, pore streaks, optional knots; per-board tone, bevelled seams and staggered butt joints like a real floor.",
  features: (p) => [p.planks, p.planks, "planks"],
  params: {
    planks: P.int(4, 1, 32, "Planks across"),
    plankLength: P.int(2, 1, 12, "Joints per tile height", "Board ends per column; staggered between columns."),
    rings: P.float(9, 1, 40, "Ring density"),
    wobble: P.float(0.8, 0, 3, "Grain wobble"),
    knots: P.float(0.2, 0, 1, "Knots"),
    colors: P.colors(["#e1b382", "#c08552", "#8c5a3c"], "Light, mid, dark", "", 3, 3),
    seam: P.float(4e-3, 0, 0.02, "Seam width (uv)"),
    variation: adv(P.float(0.5, 0, 1, "Board tone variation")),
    seed: P.seed(21)
  },
  prepare: (p) => ({ c: lin3(p.colors), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.planks, L = p.plankLength;
    const X = u * n, k = Math.floor(X), lx = X - k;
    const pk = mod(k, n);
    const off = hash01(pk, 0, p.seed);
    const Yb = v * L + off, seg = Math.floor(Yb), ly = Yb - seg;
    const id = pk * 131 + mod(seg, L) * 7 + 1;
    const boardLen = n / L;
    const t = woodGrain(ly * boardLen, lx, id, p.rings, p.wobble, p.knots, p.seed);
    const pore = woodOut.pore;
    ramp(out, s.c, clamp01(t + (pore - 0.5) * 0.22 * (pore < 0.3 ? 2 : 1)));
    const tone = 1 + (hash01(id, 1, p.seed) - 0.5) * 0.3 * p.variation;
    shade(out, out, tone);
    let h = 0.6 - t * 0.2 - (pore < 0.25 ? 0.08 : 0);
    if (p.seam > 0) {
      const dSide = Math.min(lx, 1 - lx) / n, dEnd = Math.min(ly, 1 - ly) / L;
      const d = Math.min(dSide, dEnd) - p.seam * 0.5;
      shade(out, out, 0.82 + 0.18 * smoothstep(0, p.seam * 2.5, d + p.seam * 0.5));
      shade(_c2, s.c[2], 0.3);
      mix(out, out, _c2, coverage(d, ctx.px));
      if (d < 0) h = 0.1;
    }
    out[4] = clamp01(h);
  }
};
var parquet = {
  id: "parquet",
  name: "Parquet (herringbone / chevron / basket)",
  category: "organic",
  scale: "repeats",
  tags: ["floor", "material", "interior", "wood", "herringbone", "chevron"],
  description: "Wooden parquet floors: herringbone (planks k:1 at right angles), chevron (mitred V columns), basket (square blocks of parallel slats) or straight staggered planks. Every plank gets its own grain and tone.",
  features: (p) => [p.repeats, p.repeats, "repeats"],
  params: {
    layout: P.enumOf("herringbone", ["herringbone", "chevron", "basket", "straight"], "Layout"),
    repeats: P.int(2, 1, 16, "Repeats"),
    ratio: P.int(4, 2, 8, "Plank length : width"),
    rings: P.float(6, 1, 30, "Ring density"),
    wobble: P.float(0.7, 0, 3, "Grain wobble"),
    colors: P.colors(["#d9a86c", "#b07a45", "#7a4e2c"], "Light, mid, dark", "", 3, 3),
    seam: P.float(0.06, 0, 0.3, "Seam (plank-width units)"),
    variation: P.float(0.6, 0, 1, "Plank tone variation"),
    seed: P.seed(27)
  },
  prepare: (p) => ({ c: lin3(p.colors), p, k: p.ratio }),
  sample(u, v, out, ctx, s) {
    const p = s.p, k = s.k, R = p.repeats;
    let along = 0, across = 0, id = 0, len = k, wUnits = 1;
    if (p.layout === "herringbone") {
      const T = 2 * k * R, x = u * T, y = v * T;
      const bb = Math.floor((x - y) / (2 * k));
      let found = false;
      for (let B = bb - 1; B <= bb + 1 && !found; B++) {
        const xs = x - B * k, ys = y + B * k;
        let t2 = Math.floor(ys);
        if (xs >= t2 && xs < t2 + k) {
          along = xs - t2;
          across = ys - t2;
          id = (mod(B, R) * 4096 + mod(t2 - k * B, 2 * k * R)) * 2;
          found = true;
          break;
        }
        t2 = Math.floor(xs) - k;
        if (ys >= t2 + 1 - k && ys < t2 + 1) {
          along = ys - (t2 + 1 - k);
          across = xs - (t2 + k);
          id = (mod(B, R) * 4096 + mod(t2 - k * B, 2 * k * R)) * 2 + 1;
          found = true;
        }
      }
      wUnits = T;
    } else if (p.layout === "chevron") {
      const cols = 2 * R, wc = k / Math.SQRT2, Hp = cols * wc, perCol = cols * k / 2;
      const x = u * cols, c = Math.floor(x), lx = x - c, sgn = mod(c, 2) ? -1 : 1;
      const sc = (v * Hp - sgn * lx * wc) / Math.SQRT2, j = Math.floor(sc);
      along = lx * wc;
      len = wc;
      across = sc - j;
      id = mod(c, cols) * 977 + mod(j, perCol);
      wUnits = Hp;
    } else if (p.layout === "basket") {
      const B = 2 * R, x = u * B, y = v * B, bx = Math.floor(x), by = Math.floor(y);
      const fx = x - bx, fy = y - by, horiz = (bx + by & 1) === 0;
      const slat = Math.floor((horiz ? fy : fx) * k);
      along = (horiz ? fx : fy) * k;
      across = (horiz ? fy : fx) * k - slat;
      id = (mod(bx, B) * 64 + mod(by, B)) * 16 + slat;
      wUnits = B * k;
    } else {
      const rows = 2 * k * R, y = v * rows, r = Math.floor(y), ly = y - r;
      const x = u * R * 2 + hash01(mod(r, rows), 3, p.seed) * 1, c = Math.floor(x), lx = x - c;
      along = lx * k;
      across = ly;
      id = mod(r, rows) * 997 + mod(c, R * 2);
      wUnits = rows;
    }
    const t = woodGrain(along, across, id + 1, p.rings, p.wobble, 0, p.seed);
    ramp(out, s.c, clamp01(t + (woodOut.pore - 0.5) * 0.2));
    shade(out, out, 1 + (hash01(id, 1, p.seed) - 0.5) * 0.35 * p.variation);
    const dA = Math.min(across, 1 - across), dL = Math.min(along, len - along);
    const d = Math.min(dA, dL) - p.seam * 0.5;
    shade(out, out, 0.85 + 0.15 * smoothstep(0, 0.25, d));
    shade(_c2, s.c[2], 0.35);
    mix(out, out, _c2, coverage(d / wUnits, ctx.px));
    out[4] = d < 0 ? 0.1 : clamp01(0.55 - t * 0.15 + 0.1 * smoothstep(0, 0.2, d));
  }
};
var leopard = {
  id: "leopard",
  name: "Leopard / cheetah / jaguar",
  category: "organic",
  scale: "cells",
  tags: ["clothes", "print", "animal", "fashion"],
  description: "Rosettes: broken irregular rings around each feature point with a darker, warmer centre (leopard), larger rosettes with inner dots (jaguar) or solid spots (cheetah). Fur ground with soft tonal drift.",
  features: (p) => [p.cells, p.cells, "rosettes"],
  params: {
    style: P.enumOf("leopard", ["leopard", "jaguar", "cheetah"], "Style"),
    cells: P.int(6, 2, 48, "Rosettes across"),
    colors: P.colors(["#d9a35b", "#b97834", "#1d140e"], "Ground, centre, spot", "", 3, 3),
    irregularity: P.float(0.6, 0, 1, "Irregularity"),
    seed: P.seed(13)
  },
  prepare: (p) => ({
    c: lin3(p.colors),
    p,
    warp: warpField(0.02 + 0.03 * p.irregularity, 3, p.seed, 3),
    ground: noiseField({ freq: 3, octaves: 4, seed: p.seed + 4 }),
    fur: noiseField({ fx: 64, fy: 16, octaves: 2, seed: p.seed + 8, range: "signed" })
  }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.cells;
    s.warp(u, v, _w);
    const wu = _w[0], wv = _w[1];
    const g = s.ground(u, v);
    mix(out, s.c[0], s.c[1], g * 0.35);
    shade(out, out, 1 + 0.06 * s.fur(u, v) * detail(1 / 64, ctx.pixel));
    worley(wu, wv, n, n, p.seed, 0.85, W);
    const d = W.f1, ang = Math.atan2(W.dy, W.dx);
    const id = W.id;
    const h = (k) => (id >>> k * 4 & 15) / 15;
    const shapeK = 1 + p.irregularity * (0.16 * Math.sin(3 * ang + h(0) * TAU) + 0.1 * Math.sin(5 * ang + h(1) * TAU));
    if (p.style === "cheetah") {
      const r = (0.17 + 0.08 * h(2)) * shapeK;
      mix(out, out, s.c[2], coverage((d - r) / n, ctx.px));
      worley(wu, wv, n * 2, n * 2, p.seed + 1, 0.9, W);
      mix(out, out, s.c[2], coverage((W.f1 - (0.1 + 0.05 * (W.id >>> 3 & 7) / 7)) / (2 * n), ctx.px));
      return;
    }
    const jag = p.style === "jaguar";
    const R = (jag ? 0.36 : 0.3) * (1 + 0.23 * h(2)) * shapeK, w = (jag ? 0.06 : 0.075) + 0.03 * h(3);
    if (d < R - w) mix(out, out, s.c[1], coverage((d - (R - w)) / n, ctx.px) * 0.85);
    const sectors = 4 + (h(4) * 3 | 0);
    const sec = Math.floor((ang / TAU + 0.5 + h(5)) % 1 * sectors);
    const gap = hash01(id & 65535, sec, p.seed) < 0.3 + 0.15 * p.irregularity;
    const ringD = Math.abs(d - R) - w * (gap ? 0.15 : 1) * (0.8 + 0.4 * hash01(sec, id & 255, p.seed));
    mix(out, out, s.c[2], coverage(ringD / n, ctx.px));
    if (jag) {
      const dd = Math.hypot(W.dx + (h(6) - 0.5) * 0.12, W.dy + (h(7) - 0.5) * 0.12) - 0.05 - 0.03 * h(1);
      mix(out, out, s.c[2], coverage(dd / n, ctx.px));
    }
    worley(wu, wv, n * 3, n * 3, p.seed + 2, 0.9, W);
    if (d > R + w * 1.5) mix(out, out, s.c[2], coverage((W.f1 - 0.09) / (3 * n), ctx.px) * 0.9);
  }
};
var giraffe = {
  id: "giraffe",
  name: "Giraffe",
  category: "organic",
  scale: "cells",
  tags: ["clothes", "print", "animal"],
  description: "Warped Voronoi patches with mottled interiors separated by a cream network of even width (exact Voronoi edge distance).",
  features: (p) => [p.cells, p.cells, "patches"],
  params: {
    cells: P.int(5, 2, 48, "Patches across"),
    border: P.float(0.12, 0.02, 0.5, "Border width"),
    colors: P.colors(["#f1e3c6", "#8a4b1f", "#6e3a17", "#a35d2a"], "Network, patch colours\u2026", "", 2, 8),
    seed: P.seed(14)
  },
  prepare: (p) => ({ c: lin3(p.colors), p, warp: warpField(0.035, 3, p.seed, 3), mott: noiseField({ freq: 8, octaves: 3, seed: p.seed + 2 }) }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.cells;
    s.warp(u, v, _w);
    voronoiEdge(_w[0], _w[1], n, n, p.seed, 0.9, W);
    const e = W.edge;
    const pc = s.c[1 + W.id % (s.c.length - 1)];
    const mott = s.mott(u, v);
    shade(_c2, pc, (0.85 + 0.3 * mott) * (0.85 + 0.15 * smoothstep(0, 0.25, e)));
    mix(out, s.c[0], _c2, coverage(-(e - p.border * 0.5) / n, ctx.px * 1.5));
  }
};
var zebra = {
  id: "zebra",
  name: "Zebra / tiger stripes",
  category: "organic",
  scale: "stripes",
  tags: ["clothes", "print", "animal"],
  description: "Noise-displaced, thickness-modulated stripes that fork and taper; tiger style adds broken stripe ends over an orange-to-cream fur ground.",
  features: (p) => [p.stripes, p.stripes, "stripes"],
  params: {
    style: P.enumOf("zebra", ["zebra", "tiger"], "Style"),
    stripes: P.int(9, 1, 64, "Stripes"),
    warpAmount: P.float(0.6, 0, 2, "Warp"),
    colors: P.colors(["#f5f2ea", "#141414"], "Ground, stripe", "", 2, 2),
    tigerColor: adv(P.color("#e08a2e", "Tiger fur colour")),
    seed: P.seed(15)
  },
  prepare: (p) => ({
    c: lin3(p.colors),
    tc: hexToLinear(p.tigerColor),
    p,
    f1: noiseField({ freq: 2, octaves: 4, seed: p.seed, range: "signed" }),
    f2: noiseField({ freq: 5, octaves: 3, seed: p.seed + 1, range: "signed" }),
    brk: noiseField({ fx: 6, fy: 2, octaves: 3, seed: p.seed + 2 }),
    fork: noiseField({ fx: 4, fy: 8, octaves: 2, seed: p.seed + 6, mode: "ridged" }),
    fur: noiseField({ freq: 2, octaves: 2, seed: p.seed + 5 })
  }),
  sample(u, v, out, ctx, s) {
    const p = s.p;
    const t = v * p.stripes + p.warpAmount * s.f1(u, v) * 2 + 0.25 * Math.sin(TAU * 2 * u);
    const thick = 0.1 * s.f2(u, v);
    const fork = Math.pow(s.fork(u, v), 6) * 0.9;
    let g = Math.cos(TAU * t) - thick * 4 - 0.05 - fork * (0.5 + 0.5 * Math.cos(TAU * t * 2));
    if (p.style === "tiger") g -= smoothstep(0.55, 0.75, s.brk(u, v)) * 1.6;
    const d = g / (TAU * p.stripes * 1.2);
    shade(out, s.c[0]);
    if (p.style === "tiger") {
      shade(out, s.tc);
      mix(out, out, s.c[0], 0.55 * smoothstep(0.62, 0.92, s.fur(u, v)));
    }
    mix(out, out, s.c[1], coverage(-d, ctx.px));
  }
};
var snakeskin = {
  id: "snakeskin",
  name: "Snakeskin (python / croc)",
  category: "organic",
  scale: "cells",
  tags: ["clothes", "print", "animal", "leather", "fashion", "reptile"],
  description: "Python: overlapping diamond scales, each domed and edged, under large blotch markings. Croc: rows of glossy domed rectangular scales of varying width with deep creases.",
  features: (p) => [p.cells, p.cells, "scales"],
  params: {
    style: P.enumOf("python", ["python", "croc"], "Style"),
    cells: P.int(20, 4, 96, "Scales across"),
    colors: P.colors(["#cfc3a8", "#8d7c5e", "#3a2f22"], "Light, mid, markings", "", 3, 3),
    markings: P.float(0.85, 0, 1, "Markings"),
    gloss: P.float(0.4, 0, 1, "Gloss"),
    seed: P.seed(29)
  },
  prepare: (p) => ({
    c: lin3(p.colors),
    p,
    n: evenInt(p.cells),
    blot: noiseField({ freq: 3, octaves: 4, gain: 0.55, seed: p.seed }),
    warp: warpField(0.04, 2, p.seed + 1, 3)
  }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = s.n;
    let edge, dome, gx, gy, id, scU = u, scV = v;
    if (p.style === "python") {
      const A = u * n + v * n, B = u * n - v * n;
      const fa = fract(A), fb = fract(B);
      const da = Math.min(fa, 1 - fa), db = Math.min(fb, 1 - fb);
      edge = Math.min(da, db) * 0.7071;
      const cx = fa - 0.5, cy = fb - 0.5;
      dome = Math.sin(Math.PI * fa) * Math.sin(Math.PI * fb);
      const ga = Math.PI * Math.cos(Math.PI * fa) * Math.sin(Math.PI * fb), gb = Math.PI * Math.cos(Math.PI * fb) * Math.sin(Math.PI * fa);
      gx = (ga + gb) * 0.5;
      gy = (ga - gb) * 0.5 + 0.8;
      const ai = Math.floor(A), bi = Math.floor(B);
      id = hashU32(mod(ai, n), mod(bi - ai, 2 * n), p.seed);
      scU = (ai + bi + 1) / (2 * n);
      scV = (ai - bi) / (2 * n);
    } else {
      const rows = n, Y = v * rows, r = Math.floor(Y), fy = Y - r;
      const wr = mod(r, rows);
      const cols = Math.max(2, Math.round(n * (0.6 + 0.8 * hash01(wr, 1, p.seed))));
      const X = u * cols + hash01(wr, 2, p.seed), c = Math.floor(X), fx = X - c;
      const ex = Math.min(fx, 1 - fx) * (rows / cols), ey = Math.min(fy, 1 - fy);
      const rr = 0.18;
      const qx = Math.max(rr - ex, 0), qy = Math.max(rr - ey, 0);
      edge = Math.min(ex, ey) < rr ? rr - Math.hypot(qx, qy) : Math.min(ex, ey);
      dome = clamp01(Math.sin(Math.PI * fx) * Math.sin(Math.PI * fy) * 1.3);
      gx = Math.cos(Math.PI * fx) * 1.2;
      gy = Math.cos(Math.PI * fy) * 1.2;
      id = hashU32(mod(c, cols), wr, p.seed);
      scU = (c + 0.5 - hash01(wr, 2, p.seed)) / cols;
      scV = (r + 0.5) / rows;
    }
    s.warp(scU, scV, _w);
    const m = s.blot(_w[0], _w[1]) + (id >>> 12 & 255) / 255 * 0.04 - 0.02;
    const ring = smoothstep(0.545, 0.555, m) * (1 - smoothstep(0.645, 0.655, m));
    const inner = smoothstep(0.64, 0.66, m);
    const mark = p.markings * Math.max(ring, smoothstep(0.345, 0.335, m) * 0.85);
    const tone = 0.88 + 0.24 * ((id & 255) / 255);
    mix(_c2, s.c[0], s.c[1], clamp01(0.2 + inner * 0.8 * p.markings + (m - 0.5) * 0.4));
    mix(_c2, _c2, s.c[2], clamp01(mark));
    const lit = lambert(-gx * 0.22, -gy * 0.22);
    const nx = -gx * 0.22, ny = -gy * 0.22, inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
    const spec = p.gloss * Math.pow(Math.max(0, (nx * -0.25 + ny * -0.3 + 0.92) * inv), 20) * 0.6;
    shade(out, _c2, tone * (0.5 + 0.5 * lit) * (0.8 + 0.2 * dome) + spec);
    shade(_d2, _c2, 0.45);
    mix(out, _d2, out, smoothstep(0, 0.07, edge));
    out[4] = clamp01(0.2 + 0.6 * dome * smoothstep(0, 0.08, edge));
  }
};
var camo = {
  id: "camouflage",
  name: "Camouflage",
  category: "organic",
  scale: "scale",
  tags: ["clothes", "military", "streetwear", "print"],
  description: "Woodland (layered thresholded fbm blobs with slightly ragged edges), digital (same field quantised to a pixel grid) or tiger-stripe camo (horizontal brush strokes).",
  features: (p) => [p.scale, p.scale, "blobs"],
  params: {
    style: P.enumOf("woodland", ["woodland", "digital", "tiger-stripe"], "Style"),
    scale: P.int(3, 1, 16, "Blob frequency"),
    pixels: P.int(64, 8, 256, "Digital grid"),
    colors: P.colors(PALETTES.woodland, "Base + layers", "", 2, 6),
    coverage: P.float(0.5, 0.2, 0.8, "Layer coverage"),
    seed: P.seed(16)
  },
  prepare: (p) => {
    const fields = [];
    for (let i = 1; i < p.colors.length; i++) {
      fields.push(p.style === "tiger-stripe" ? noiseField({ fx: p.scale, fy: p.scale * 4, octaves: 5, gain: 0.55, seed: subSeed(p.seed, i) }) : noiseField({ freq: p.scale, octaves: 5, gain: 0.55, seed: subSeed(p.seed, i) }));
    }
    return { c: lin3(p.colors), p, fields, rag: noiseField({ freq: p.scale * 16, octaves: 2, seed: p.seed + 99, range: "signed" }) };
  },
  sample(u, v, out, ctx, s) {
    const p = s.p;
    if (p.style === "digital") {
      u = (Math.floor(u * p.pixels) + 0.5) / p.pixels;
      v = (Math.floor(v * p.pixels) + 0.5) / p.pixels;
    }
    shade(out, s.c[0]);
    const rag = p.style === "woodland" ? s.rag(u, v) * 0.03 : 0;
    for (let i = 1; i < s.c.length; i++) {
      const f = 0.5 + (s.fields[i - 1](u, v) - 0.5) * 2.6 + rag;
      const thr = 1 - p.coverage + 0.07 * (i - 1);
      const a = p.style === "digital" ? f > thr ? 1 : 0 : smoothstep(thr - 6e-3, thr + 6e-3, f);
      mix(out, out, s.c[i], a);
    }
  }
};
var RD_PRESETS = {
  // (feed, kill) with dA=1, dB=0.5, dt=1 (Karl Sims' parametrisation)
  coral: [0.0545, 0.062],
  mitosis: [0.0367, 0.0649],
  maze: [0.029, 0.057],
  spots: [0.035, 0.065],
  worms: [0.078, 0.061],
  holes: [0.039, 0.058]
};
var rdCache = /* @__PURE__ */ new Map();
function grayScott(G, feed, kill, iters, seed) {
  const key = `${G}|${feed}|${kill}|${iters}|${seed}`;
  if (rdCache.has(key)) return rdCache.get(key);
  const N = G * G;
  let A = new Float32Array(N).fill(1), B = new Float32Array(N);
  let A2 = new Float32Array(N), B2 = new Float32Array(N);
  const rnd = mulberry32(seed);
  const blobs = Math.max(4, Math.round(N / 600));
  for (let k = 0; k < blobs; k++) {
    const cx = rnd() * G | 0, cy = rnd() * G | 0, r = 2 + (rnd() * 3 | 0);
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const i = mod(cy + y, G) * G + mod(cx + x, G);
      B[i] = 1;
      A[i] = 0.5;
    }
  }
  const L = new Int32Array(G), R = new Int32Array(G);
  for (let i = 0; i < G; i++) {
    L[i] = mod(i - 1, G);
    R[i] = mod(i + 1, G);
  }
  for (let it = 0; it < iters; it++) {
    for (let y = 0; y < G; y++) {
      const yu = L[y] * G, yc = y * G, yd = R[y] * G;
      for (let x = 0; x < G; x++) {
        const xl = L[x], xr = R[x], i = yc + x;
        const a = A[i], b = B[i];
        const la = 0.2 * (A[yc + xl] + A[yc + xr] + A[yu + x] + A[yd + x]) + 0.05 * (A[yu + xl] + A[yu + xr] + A[yd + xl] + A[yd + xr]) - a;
        const lb = 0.2 * (B[yc + xl] + B[yc + xr] + B[yu + x] + B[yd + x]) + 0.05 * (B[yu + xl] + B[yu + xr] + B[yd + xl] + B[yd + xr]) - b;
        const abb = a * b * b;
        const na = a + (la - abb + feed * (1 - a));
        const nb = b + (0.5 * lb + abb - (kill + feed) * b);
        A2[i] = na < 0 ? 0 : na > 1 ? 1 : na;
        B2[i] = nb < 0 ? 0 : nb > 1 ? 1 : nb;
      }
    }
    [A, A2] = [A2, A];
    [B, B2] = [B2, B];
  }
  let lo = 1, hi = 0;
  for (let i = 0; i < N; i++) {
    if (B[i] < lo) lo = B[i];
    if (B[i] > hi) hi = B[i];
  }
  const res = { G, B, lo, hi };
  if (rdCache.size > 8) rdCache.delete(rdCache.keys().next().value);
  rdCache.set(key, res);
  return res;
}
var reaction = {
  id: "reaction-diffusion",
  name: "Reaction\u2013diffusion (Gray\u2013Scott)",
  category: "organic",
  scale: "grid",
  tags: ["graphics", "generative", "biological", "coral", "print"],
  description: "Turing patterns from the Gray\u2013Scott model on a periodic grid (seamless by construction), sampled with smooth bicubic filtering. Presets: coral, mitosis, maze, spots, worms, holes. Cost \u221D grid\xB2 \xD7 iterations; results are cached.",
  features: (p) => [p.grid / 8, p.grid / 8, "features"],
  params: {
    preset: P.enumOf("coral", Object.keys(RD_PRESETS).concat("custom"), "Preset"),
    feed: adv(P.float(0.0545, 0.01, 0.1, "Feed (custom)")),
    kill: adv(P.float(0.062, 0.04, 0.075, "Kill (custom)")),
    grid: P.int(160, 48, 512, "Simulation grid", "Bigger = more, smaller features per tile (slower)."),
    iterations: adv(P.int(5e3, 200, 3e4, "Iterations")),
    colors: P.colors(["#0b132b", "#5bc0be", "#f7f7f2"], "Colour ramp"),
    seed: P.seed(17)
  },
  prepare: (p) => {
    const [f, k] = p.preset === "custom" ? [p.feed, p.kill] : RD_PRESETS[p.preset];
    return { sim: grayScott(p.grid, f, k, p.iterations, p.seed), ramp: lin3(p.colors) };
  },
  sample(u, v, out, ctx, s) {
    const { G, B, lo, hi } = s.sim;
    const x = u * G - 0.5, y = v * G - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const wx = _wx, wy = _wy;
    crWeights(fx, wx);
    crWeights(fy, wy);
    let b = 0;
    for (let j = 0; j < 4; j++) {
      const row = mod(y0 - 1 + j, G) * G;
      let rs = 0;
      for (let i = 0; i < 4; i++) rs += B[row + mod(x0 - 1 + i, G)] * wx[i];
      b += rs * wy[j];
    }
    const t = smoothstep(0.1, 0.9, (b - lo) / (hi - lo + 1e-9));
    ramp(out, s.ramp, t);
    out[4] = t;
  }
};
var _wx = [0, 0, 0, 0];
var _wy = [0, 0, 0, 0];
function crWeights(t, w) {
  const t2 = t * t, t3 = t2 * t;
  w[0] = -0.5 * t3 + t2 - 0.5 * t;
  w[1] = 1.5 * t3 - 2.5 * t2 + 1;
  w[2] = -1.5 * t3 + 2 * t2 + 0.5 * t;
  w[3] = 0.5 * t3 - 0.5 * t2;
}
var voronoi = {
  id: "voronoi-cells",
  name: "Voronoi cells (stained glass / cracked earth / cobblestone)",
  category: "organic",
  scale: "cells",
  tags: ["graphics", "game", "material", "mosaic", "stone"],
  description: "Voronoi cells with EXACT border distance (even-width leading/grout/cracks). Stained glass with lead came and glass mottling, cracked earth with ragged cracks, domed cobblestones, or flat cells.",
  features: (p) => [p.cells, p.cells, "cells"],
  params: {
    style: P.enumOf("stained-glass", ["stained-glass", "cracked-earth", "cobblestone", "cells"], "Style"),
    cells: P.int(8, 2, 96, "Cells across"),
    jitter: P.float(1, 0, 1, "Jitter"),
    edge: P.float(0.08, 0, 0.5, "Edge width (cell units)"),
    colors: P.colors(PALETTES.candy, "Cell colours"),
    edgeColor: P.color("#151515", "Edge colour"),
    seed: P.seed(18)
  },
  prepare: (p) => ({
    c: lin3(p.colors),
    e: hexToLinear(p.edgeColor),
    p,
    warp: warpField(0.012, 6, p.seed, 3),
    glass: noiseField({ freq: 16, octaves: 2, seed: p.seed + 11, range: "signed" }),
    earth: noiseField({ freq: 12, octaves: 4, seed: p.seed + 3 }),
    crackW: noiseField({ freq: 20, octaves: 2, seed: p.seed + 7 }),
    cobble: noiseField({ freq: 32, octaves: 3, seed: p.seed + 5, range: "signed" })
  }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.cells;
    let wu = u, wv = v;
    if (p.style === "cracked-earth") {
      s.warp(u, v, _w);
      wu = _w[0];
      wv = _w[1];
    }
    voronoiEdge(wu, wv, n, n, p.seed, p.jitter, W);
    const e = W.edge;
    const col = s.c[W.id % s.c.length];
    let w = p.edge * 0.5;
    if (p.style === "stained-glass") {
      shade(_c2, col, 0.75 + 0.4 * smoothstep(0, 0.45, e) + 0.12 * s.glass(u + (W.id & 15) * 0.13, v));
    } else if (p.style === "cracked-earth") {
      shade(_c2, col, (0.85 + 0.3 * s.earth(u, v)) * (0.8 + 0.2 * smoothstep(0, 0.25, e)));
      w *= 0.5 + s.crackW(u, v);
    } else if (p.style === "cobblestone") {
      const dome = Math.sqrt(clamp01((e - w) * 3.2));
      shade(_c2, col, 0.45 + 0.55 * dome + 0.08 * s.cobble(u, v));
      out[4] = dome;
    } else shade(_c2, col);
    if (p.style === "stained-glass" && e < w * 1.6) {
      const q = clamp01(e / w), prof = Math.sqrt(clamp01(1 - q * q));
      shade(_d2, s.e, 0.7 + 0.8 * prof);
    } else shade(_d2, s.e);
    mix(out, _d2, _c2, coverage(-(e - w) / n, ctx.px));
    if (p.style !== "cobblestone") out[4] = e > w ? 0.7 : 0.2;
  }
};
var leather = {
  id: "leather",
  name: "Leather grain",
  category: "organic",
  scale: "cells",
  tags: ["clothes", "material", "bag", "shoes", "upholstery"],
  description: "Pebbled full-grain leather: irregular rounded pebbles at two scales separated by fine creases, wandering wrinkles, pores, tonal mottling and a soft sheen, lit from the real height field. Pair output=normal for 3D.",
  features: (p) => [p.cells, p.cells, "pebbles"],
  params: {
    color: P.color("#5a3522", "Colour"),
    cells: P.int(40, 8, 160, "Grain density"),
    crease: P.float(0.8, 0, 1, "Crease depth"),
    wrinkles: P.float(0.5, 0, 1, "Wrinkles"),
    sheen: P.float(0.3, 0, 1, "Sheen"),
    seed: P.seed(19)
  },
  prepare: (p) => ({
    c: hexToLinear(p.color),
    p,
    warp: warpField(0.25 / p.cells, Math.max(2, Math.round(p.cells / 4)), p.seed + 3, 2),
    mott: noiseField({ freq: 4, octaves: 5, seed: p.seed + 1 }),
    wr: noiseField({ fx: 3, fy: 5, octaves: 4, seed: p.seed + 2, mode: "ridged" })
  }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.cells;
    s.warp(u, v, _w);
    worley(_w[0], _w[1], n, n, p.seed, 1, W, 0, 1);
    let e = W.f2 - W.f1, t = clamp01(e / 0.32);
    const big = t * t * (3 - 2 * t), dBig = 6 * t * (1 - t) / 0.32;
    let inv = 1 / (Math.hypot(W.dx, W.dy) + 1e-6);
    let gx = -W.dx * inv * dBig * n, gy = -W.dy * inv * dBig * n;
    worley(_w[0], _w[1], n * 2, n * 2, p.seed + 7, 1, W, 0, 1);
    e = W.f2 - W.f1;
    t = clamp01(e / 0.3);
    const small = t * t * (3 - 2 * t), dSmall = 6 * t * (1 - t) / 0.3;
    inv = 1 / (Math.hypot(W.dx, W.dy) + 1e-6);
    gx = gx * (0.7 + 0.3 * small) - W.dx * inv * dSmall * n * 2 * 0.3 * big;
    gy = gy * (0.7 + 0.3 * small) - W.dy * inv * dSmall * n * 2 * 0.3 * big;
    const wrink = Math.pow(s.wr(u, v), 10) * p.wrinkles;
    const h0 = big * (0.7 + 0.3 * small) * (1 - 0.35 * p.crease * (1 - small)) - wrink * 0.6;
    const k = (0.4 + p.crease * 1.6) / (n * 2) * 0.5;
    const nx = gx * k, ny = gy * k;
    const lit = lambert(nx, ny);
    const mott = s.mott(u, v);
    const pore = hash01(mod(Math.floor(u * n * 6), n * 6), mod(Math.floor(v * n * 6), n * 6), p.seed) < 0.04 ? 0.75 : 1;
    const ni = 1 / Math.sqrt(nx * nx + ny * ny + 1);
    const spec = p.sheen * Math.pow(Math.max(0, (nx * -0.25 + ny * -0.3 + 0.92) * ni), 30) * 0.5;
    shade(out, s.c, (0.62 + 0.45 * mott) * (0.35 + 0.7 * lit) * (0.6 + 0.4 * h0) * pore + spec);
    out[4] = clamp01(0.3 + 0.6 * h0);
  }
};
var organic_default = [noise, marble, granite, wood, parquet, leopard, giraffe, zebra, snakeskin, camo, reaction, voronoi, leather];

// src/patterns/textile.js
var lin4 = (a) => a.map(hexToLinear);
var _c3 = [0, 0, 0, 0];
var _d3 = [0, 0, 0, 0];
var _w2 = [0, 0];
var corduroy = {
  id: "corduroy",
  name: "Corduroy",
  category: "textile",
  scale: "wales",
  tags: ["clothes", "trousers", "jacket", "retro", "pile"],
  description: "Rounded pile wales separated by grooves where the ground weave shows; fine vertical pile fibres with a velvety sheen on the wale shoulders. Wide wale \u2248 8, needlecord \u2248 24 per tile.",
  features: (p) => [p.wales, p.wales, "wales"],
  params: {
    wales: P.int(12, 2, 128, "Wales across"),
    groove: P.float(0.2, 0.04, 0.5, "Groove width", "Fraction of each wale that is groove."),
    color: P.color("#8a5a2b", "Colour"),
    pile: P.float(0.6, 0, 1, "Pile texture"),
    sheen: adv(P.float(0.5, 0, 1, "Sheen", "Velvet highlight across each wale.")),
    wear: adv(P.float(0.2, 0, 1, "Wear", "Low-frequency crushing / fading of the pile.")),
    seed: P.seed(31)
  },
  prepare: (p) => ({ c: hexToLinear(p.color), p, nap: noiseField({ fx: 2, fy: 3, octaves: 4, seed: p.seed + 1 }) }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.wales;
    const fx = fract(u * n);
    const a = Math.abs(fx - 0.5) * 2 / (1 - p.groove);
    const fibreLod = detail(1 / (n * 14), ctx.pixel);
    const wear = (s.nap(u, v) - 0.5) * p.wear;
    if (a < 1) {
      const prof = Math.sqrt(1 - a * a);
      const ty = Math.max(1, Math.round(n * 2.2)), sy = Math.max(1, Math.round(n * 0.8));
      const tuft = valueNoise(u * n * 14, v * ty, n * 14, ty, p.seed) * 0.5 + 0.5;
      const streak = valueNoise(u * n * 40, v * sy, n * 40, sy, p.seed + 3) * 0.5 + 0.5;
      const fib = ((tuft - 0.5) * 0.35 + (streak - 0.5) * 0.25) * p.pile * fibreLod;
      const side = (fx - 0.5) * 2;
      const shoulder = Math.exp(-((side + 0.45) ** 2) * 9) * p.sheen * 0.35;
      const wi = mod(Math.floor(u * n), n);
      const waleTone = (hash01(wi, 7, p.seed) - 0.5) * 0.12;
      const brush = valueNoise(u * n * 4, v * 6, n * 4, 6, p.seed + 9) * 0.1 * p.pile;
      const b = (0.45 + 0.55 * prof) * (1 + fib + waleTone + brush) * (1 + wear * 0.6) + shoulder * prof;
      shade(out, s.c, b);
      out[4] = 0.2 + 0.75 * prof * (0.85 + 0.15 * tuft) - wear * 0.2;
    } else {
      const weave2 = 0.85 + 0.15 * Math.sin(TAU * v * n * 12) * Math.sin(TAU * u * n * 12) * fibreLod;
      shade(out, s.c, 0.22 * weave2);
      out[4] = 0.08;
    }
    const waleLod = detail(1 / n, ctx.pixel * 1.6);
    if (waleLod < 1) {
      shade(_c3, s.c, 0.62 * (1 + wear * 0.6));
      mix(out, _c3, out, waleLod);
      out[4] = 0.5 + (out[4] - 0.5) * waleLod;
    }
  }
};
var velvet = {
  id: "velvet",
  name: "Velvet / crushed velvet",
  category: "textile",
  scale: "scale",
  tags: ["clothes", "evening", "luxury", "upholstery", "pile", "velour"],
  description: 'Dense short pile: smooth colour with soft shimmering highlights where the pile changes direction. Raise "crush" for crushed / panne velvet.',
  features: (p) => [p.scale, p.scale, "crush patches"],
  params: {
    color: P.color("#5b1a3a", "Colour"),
    scale: P.int(3, 1, 16, "Crush scale", "Number of crush patches across."),
    crush: P.float(0.55, 0, 1, "Crush", "Strength of the light/dark patches."),
    sheen: P.float(0.6, 0, 1, "Sheen"),
    seed: P.seed(41)
  },
  prepare: (p) => ({
    c: hexToLinear(p.color),
    p,
    f1: noiseField({ freq: p.scale, octaves: 5, gain: 0.55, seed: p.seed }),
    f2: noiseField({ freq: p.scale * 2, octaves: 4, seed: p.seed + 7, mode: "ridged" }),
    w: warpField(0.08, Math.max(1, p.scale), p.seed + 3, 3)
  }),
  sample(u, v, out, ctx, s) {
    const p = s.p;
    s.w(u, v, _w2);
    const a = s.f1(_w2[0], _w2[1]), r = s.f2(_w2[0], _w2[1]);
    const lie = clamp01(0.5 + (a - 0.5) * 3.2 * p.crush + (r - 0.35) * 0.9 * p.crush);
    const fibreLod = detail(1 / 400, ctx.pixel);
    const grain = (hash01(mod(Math.floor(u * 1024), 1024), mod(Math.floor(v * 1024), 1024), p.seed) - 0.5) * 0.12 * fibreLod;
    const b = 0.3 + 0.62 * lie + p.sheen * 1.1 * Math.pow(lie, 5) + grain;
    shade(out, s.c, b);
    out[4] = 0.5 + 0.12 * (lie - 0.5);
  }
};
var quilted = {
  id: "quilted",
  name: "Quilted / padded / puffer",
  category: "textile",
  scale: "cells",
  tags: ["clothes", "puffer", "jacket", "bag", "luxury", "down"],
  description: "Puffy padded cells (diamond, square or puffer channels) with dashed stitch seams; lit from the top-left from the real height field, with a nylon or cotton surface.",
  features: (p) => [p.cells, p.cells, "cells"],
  params: {
    layout: P.enumOf("diamond", ["diamond", "square", "channel"], "Layout"),
    cells: P.int(4, 1, 32, "Cells across"),
    puff: P.float(0.8, 0, 1, "Puffiness"),
    color: P.color("#2c2c34", "Fabric"),
    stitch: P.color("#9a9aa6", "Stitch thread"),
    surface: P.enumOf("nylon", ["nylon", "cotton", "satin"], "Surface", "nylon = ripstop grid + sheen; satin = glossy; cotton = matte weave."),
    dashes: P.int(9, 0, 40, "Stitches per seam (0 = none)")
  },
  prepare: (p) => ({ c: hexToLinear(p.color), st: hexToLinear(p.stitch), n: p.cells, p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = s.n;
    let A, B, g;
    if (p.layout === "diamond") {
      A = u * n + v * n;
      B = u * n - v * n;
      g = Math.hypot(n, n);
    } else if (p.layout === "square") {
      A = u * n;
      B = v * n;
      g = n;
    } else {
      A = v * n;
      B = 0.5;
      g = n;
    }
    const fa = fract(A), fb = fract(B);
    const chan = p.layout === "channel";
    const sa = Math.sin(Math.PI * fa), sb = chan ? 1 : Math.sin(Math.PI * fb);
    const k = 0.45 + (1 - p.puff) * 1.4;
    const base = sa * sb;
    const h = Math.pow(base, k);
    const dbase_dA = Math.PI * Math.cos(Math.PI * fa) * sb, dbase_dB = chan ? 0 : Math.PI * Math.cos(Math.PI * fb) * sa;
    const dh = k * Math.pow(Math.max(base, 1e-3), k - 1);
    const hA2 = dh * dbase_dA, hB2 = dh * dbase_dB;
    let gx, gy;
    if (p.layout === "diamond") {
      gx = (hA2 + hB2) * 0.5;
      gy = (hA2 - hB2) * 0.5;
    } else if (p.layout === "square") {
      gx = hA2;
      gy = hB2;
    } else {
      gx = 0;
      gy = hA2;
    }
    const relief = 0.22 * p.puff;
    const lit = lambert(-gx * relief, -gy * relief);
    const lod = detail(1 / (n * 40), ctx.pixel);
    let micro = 0, spec = 0;
    if (p.surface === "nylon") {
      const gx2 = fract(u * n * 36), gy2 = fract(v * n * 36);
      micro = (Math.min(gx2, 1 - gx2) < 0.08 || Math.min(gy2, 1 - gy2) < 0.08 ? 0.05 : 0) * lod;
      spec = 0.35;
    } else if (p.surface === "satin") spec = 0.8;
    else micro = valueNoise(u * n * 60, v * n * 60, n * 60, n * 60, 9) * 0.06 * lod;
    const nx = -gx * relief, ny = -gy * relief, inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
    const ndh = (nx * -0.25 + ny * -0.3 + 0.92) * inv;
    const sp = spec * Math.pow(Math.max(0, ndh), 24) * 0.6;
    const b = (0.35 + 0.65 * lit) * (0.55 + 0.45 * Math.pow(h, 0.3)) * (1 + micro) + sp;
    shade(out, s.c, b);
    out[4] = clamp01(h);
    if (p.dashes > 0) {
      const dSeamA = Math.min(fa, 1 - fa) / g, dSeamB = chan ? 1 : Math.min(fb, 1 - fb) / g;
      const onA = dSeamA < dSeamB;
      const along = onA ? B : A;
      const dash = fract(along * p.dashes);
      const w = 35e-4 * (4 / Math.max(1, n)) + 2e-3;
      if (dash > 0.12 && dash < 0.78) {
        const d = Math.min(dSeamA, dSeamB);
        const t = clamp01((dash - 0.12) / 0.66);
        const capsule = Math.sqrt(clamp01(1 - (2 * t - 1) ** 2));
        const prof = Math.sqrt(clamp01(1 - (d / (w * 0.5)) ** 2));
        shade(_c3, s.st, 0.55 + 0.45 * prof * capsule);
        mix(out, out, _c3, coverage(d - w * 0.5 * (0.6 + 0.4 * capsule), ctx.px));
      }
    }
  }
};
var mesh = {
  id: "mesh",
  name: "Mesh / fishnet / tulle",
  category: "textile",
  scale: "cells",
  tags: ["clothes", "fishnet", "sportswear", "lace", "net", "transparent"],
  description: 'Open net of round, twisted yarn with knots at the crossings, casting a soft shadow on the backing. Set backing to "transparent" for a see-through net. Diamond fishnet, square net or hexagonal tulle.',
  features: (p) => [p.cells, p.cells, "openings"],
  params: {
    layout: P.enumOf("diamond", ["diamond", "square", "hex"], "Net shape"),
    cells: P.int(6, 2, 64, "Openings across"),
    yarn: P.float(0.09, 0.02, 0.3, "Yarn thickness (cell units)"),
    knots: P.float(0.5, 0, 1, "Knot size"),
    color: P.color("#141414", "Yarn"),
    backing: P.color("#e0b49a", "Backing", 'Use "transparent" for a see-through net.'),
    shadow: adv(P.float(0.5, 0, 1, "Shadow on backing"))
  },
  prepare: (p) => ({ c: hexToLinear(p.color), b: hexToLinear(p.backing), n: p.layout === "hex" ? p.cells : p.cells, K: Math.max(1, Math.round(p.cells / Math.sqrt(3))), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p;
    const d = netDist(u, v, s), r = p.yarn * 0.5 * (1 + p.knots * 0.9 * netKnot), along = netAlong;
    const px = ctx.px * s.n;
    shade(_d3, s.b, 1);
    if (p.shadow > 0 && s.b[3] > 0) {
      const ds = netDist(u - 0.12 * p.yarn / s.n, v - 0.18 * p.yarn / s.n, s);
      _d3[0] *= 1 - p.shadow * 0.45 * (1 - smoothstep(r * 0.6, r * 1.9, ds));
      _d3[1] *= 1 - p.shadow * 0.45 * (1 - smoothstep(r * 0.6, r * 1.9, ds));
      _d3[2] *= 1 - p.shadow * 0.45 * (1 - smoothstep(r * 0.6, r * 1.9, ds));
    }
    if (d < r + px) {
      const q = Math.min(1, d / r), prof = Math.sqrt(1 - q * q);
      const twist = 0.88 + 0.12 * Math.sin(TAU * (along * 5 + q * 1.5)) * detail(1 / (s.n * 5), ctx.pixel);
      shade(_c3, s.c, (0.35 + 0.65 * prof) * twist + 0.25 * prof * prof * prof);
      mix(out, _d3, _c3, coverage((d - r) / s.n, ctx.px));
      out[4] = 0.4 + 0.6 * prof;
    } else {
      shade(out, _d3, 1);
      out[4] = 0;
    }
  }
};
var netKnot = 0;
var netAlong = 0;
function netDist(u, v, s) {
  const p = s.p, n = s.n;
  if (p.layout === "hex") {
    const S3 = Math.sqrt(3);
    const X = u * n, Y = v * s.K * S3;
    const ax = mod(X, 1) - 0.5, ay = mod(Y, S3) - S3 / 2, bx = mod(X - 0.5, 1) - 0.5, by = mod(Y - S3 / 2, S3) - S3 / 2;
    const useA = ax * ax + ay * ay < bx * bx + by * by;
    const qx = useA ? ax : bx, qy = useA ? ay : by;
    const hx = Math.abs(qx), hy = Math.abs(qy);
    const dd = 0.5 - Math.max(hx, hx * 0.5 + hy * (S3 / 2));
    const ang = Math.atan2(qy, qx);
    netKnot = Math.pow(Math.abs(Math.cos(ang * 3)), 6) * (1 - smoothstep(0, 0.2, dd));
    netAlong = ang / TAU * 6;
    return dd;
  }
  let A, B, scale;
  if (p.layout === "diamond") {
    A = u * n + v * n;
    B = u * n - v * n;
    scale = 1 / Math.SQRT2;
  } else {
    A = u * n;
    B = v * n;
    scale = 1;
  }
  const da = Math.min(fract(A), 1 - fract(A)), db = Math.min(fract(B), 1 - fract(B));
  netKnot = (1 - smoothstep(0, 0.22, da)) * (1 - smoothstep(0, 0.22, db));
  netAlong = da < db ? B : A;
  return Math.min(da, db) * scale;
}
var sequins = {
  id: "sequins",
  name: "Sequins / paillettes",
  category: "textile",
  scale: "cells",
  tags: ["clothes", "party", "glitter", "evening", "metallic", "disco"],
  description: "Overlapping metallic discs in staggered rows, each tilted and slightly cupped so it mirrors a studio light differently; centre hole with thread, bevelled rim, shadows from the sequin above. Several colours = mixed sequins.",
  features: (p) => [p.cells, p.cells, "sequins"],
  params: {
    cells: P.int(12, 2, 96, "Sequins across"),
    colors: P.colors(["#c9a227"], "Sequin colours (random mix)"),
    sparkle: P.float(0.6, 0, 1, "Sparkle"),
    tilt: P.float(0.5, 0, 1, "Tilt variation"),
    fabric: adv(P.color("#1a1a1a", "Base fabric")),
    seed: P.seed(33)
  },
  prepare: (p) => ({ c: lin4(p.colors), fab: hexToLinear(p.fabric), p, rows: evenInt(p.cells / 0.42) }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.cells, X = u * n, Y = v * n;
    const step = 0.42, R = 0.56, rows = s.rows;
    const j0 = Math.floor(Y / (step * n / (rows * step)));
    const h = _h3;
    const sy = n / (rows * step);
    for (let j = j0 + 2; j >= j0 - 2; j--) {
      const off = mod(j, 2) * 0.5, i = Math.round(X - off);
      const dx = X - (i + off), dy = Y - j * step * sy, r = Math.hypot(dx, dy);
      if (r >= R) continue;
      const wi = mod(i, n), wj = mod(j, rows);
      hash01x3(wi, wj, p.seed, h);
      const base = s.c[hashU32(wi, wj, p.seed ^ 60) % s.c.length];
      const tx = (h[0] - 0.5) * 1.8 * p.tilt, ty = (h[1] - 0.5) * 1.8 * p.tilt - 0.15;
      const nx = tx - 0.35 * dx / R, ny = ty - 0.35 * dy / R;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const key = Math.max(0, (nx * -0.45 + ny * -0.55 + 0.7) * inv);
      const env = 0.1 + 0.95 * Math.pow(key, 4) + 0.12 * h[2];
      const spark = p.sparkle * Math.pow(key, 40) * 2.2;
      shade(out, base, 0.25 + 1.1 * env);
      out[0] += spark * base[3];
      out[1] += spark * base[3];
      out[2] += spark * base[3];
      const rim = smoothstep(R - 0.07, R - 0.015, r);
      const rimLit = (-dx - dy) / (r * 1.414 + 1e-6);
      shade(out, out, 1 + rim * 0.45 * rimLit - rim * 0.25);
      let sh = 1;
      for (let jj = j + 1; jj <= j + 2; jj++) {
        const off2 = mod(jj, 2) * 0.5, i2 = Math.round(X - off2);
        const e = Math.hypot(X - (i2 + off2), Y - jj * step * sy) - R;
        sh = Math.min(sh, 0.55 + 0.45 * smoothstep(0, 0.12, e));
      }
      shade(out, out, sh);
      if (r < 0.05) {
        shade(_c3, base, 0.35);
        mix(out, _c3, out, smoothstep(0.035, 0.05, r) * 0.6 + 0.4);
      }
      out[4] = 0.55 + 0.35 * (1 - r / R) - 0.2 * (1 - sh);
      return;
    }
    shade(out, s.fab, 1);
    out[4] = 0;
  }
};
var _h3 = [0, 0, 0];
var CROSS_CHARTS = {
  heart: "011000110/111101111/111111111/111111111/011111110/001111100/000111000/000010000/000000000",
  diamonds: "00011000/00111100/01122110/11222211/11222211/01122110/00111100/00011000",
  border: "1010101010/0101010101/0000000000/2222222222/2033003302/2033003302/2222222222/0000000000",
  flower: "000020000/000222000/002212200/022111220/002212200/000222000/000030000/003333300/000030000",
  strawberry: "0000330000/0003333000/0011331100/0111111110/0114111410/0111111110/0011411100/0001111000/0000110000/0000000000"
};
var crossStitch = {
  id: "cross-stitch",
  name: "Cross-stitch / embroidery",
  category: "textile",
  scale: "repeats",
  tags: ["clothes", "embroidery", "folk", "craft", "pixel-art"],
  description: "Aida cloth with its woven blocks and holes; chart digits (1-9) are stitched as X crosses of two-strand twisted floss in palette colours, 0 = empty. Pixel-art friendly.",
  features: (p, s) => [s.N * p.repeats, s.N * p.repeats, "stitches"],
  params: {
    chart: P.enumOf("heart", Object.keys(CROSS_CHARTS).concat("custom"), "Chart"),
    customChart: P.string("0110/1111/0110", "Custom chart", 'Rows of digits separated by "/" (0 = empty, max 64\xD764).'),
    repeats: P.int(3, 1, 32, "Chart repeats"),
    fabric: P.color("#efe7d6", "Aida"),
    colors: P.colors(["#b3202a", "#2f6d3a", "#1f3b73", "#d9a21b"], "Thread palette (1,2,3\u2026)"),
    seed: P.seed(35)
  },
  prepare: (p) => {
    const src = p.chart === "custom" ? p.customChart : CROSS_CHARTS[p.chart];
    const rows = String(src).split(/[\/\n]+/).map((r) => r.trim()).filter(Boolean).slice(0, 64);
    const w = Math.min(64, Math.max(1, ...rows.map((r) => r.length))), h = Math.max(1, rows.length);
    const g = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_2, x) => Math.min(9, parseInt((rows[y] || "")[x] || "0", 10) || 0)));
    const N = Math.max(w, h);
    return { g, w, h, N, fab: hexToLinear(p.fabric), c: lin4(p.colors), p };
  },
  sample(u, v, out, ctx, s) {
    const p = s.p, cells = s.N * p.repeats;
    const X = u * cells, Y = v * cells, cx = Math.floor(X), cy = Math.floor(Y), fx = X - cx, fy = Y - cy;
    const lod = detail(1 / (cells * 4), ctx.pixel);
    const hole = Math.min(Math.hypot(fx, fy), Math.hypot(1 - fx, fy), Math.hypot(fx, 1 - fy), Math.hypot(1 - fx, 1 - fy));
    const block = Math.sin(Math.PI * fx) * Math.sin(Math.PI * fy);
    const threads = 1 + 0.07 * (Math.sin(TAU * fx * 4) * 0.5 + Math.sin(TAU * fy * 4) * 0.5) * lod;
    shade(out, s.fab, (0.8 + 0.2 * block) * threads * (hole < 0.13 ? 0.45 + 0.4 * smoothstep(0.05, 0.13, hole) : 1));
    out[4] = hole < 0.12 ? 0.15 : 0.35 + 0.15 * block;
    const gx = mod(cx, s.N), gy = mod(cy, s.N);
    const k = gx < s.w && gy < s.h ? s.g[gy][gx] : 0;
    if (!k) return;
    const col = s.c[(k - 1) % s.c.length];
    const r = 0.17;
    const d1 = sdSegment(fx, fy, 0.1, 0.1, 0.9, 0.9);
    const d2 = sdSegment(fx, fy, 0.9, 0.1, 0.1, 0.9);
    const top = d2 < r + 0.03, under = d1 < r + 0.03;
    if (!top && !under) {
      const ds = Math.min(d1, d2) - r;
      shade(out, out, 0.75 + 0.25 * smoothstep(0, 0.12, ds));
      return;
    }
    const d = top ? d2 : d1;
    const q = clamp01(d / r), prof = Math.sqrt(1 - q * q);
    const along = top ? fx - (1 - fy) : fx - fy;
    const across = top ? (fx + fy - 1) / Math.SQRT2 : (fx - fy) / Math.SQRT2;
    const strand = 0.82 + 0.18 * Math.abs(Math.sin(TAU * (along * 2.6 + across * 3)));
    const shadeK = (0.38 + 0.62 * prof) * (0.9 + 0.1 * strand * lod + (1 - lod) * 0.08) * (top ? 1 : 0.78) * (0.94 + 0.12 * hash01(mod(cx, cells), mod(cy, cells), p.seed));
    shade(_c3, col, shadeK);
    mix(out, out, _c3, coverage((d - r) / cells, ctx.px));
    out[4] = 0.55 + 0.4 * prof * (top ? 1 : 0.8);
  }
};
var eyelet = {
  id: "eyelet-lace",
  name: "Eyelet lace (broderie anglaise)",
  category: "textile",
  scale: "cells",
  tags: ["clothes", "lace", "summer", "blouse", "cotton", "transparent", "embroidery"],
  description: 'Cotton lawn with satin-stitched eyelet flowers: petal and round holes with raised, radially stitched rims and tiny dot eyelets between. Set backing to "transparent" for real see-through holes.',
  features: (p) => [p.cells, p.cells, "motifs"],
  params: {
    cells: P.int(4, 1, 24, "Flowers across"),
    petals: P.int(6, 4, 9, "Petals"),
    holeSize: P.float(0.5, 0.2, 1, "Hole size"),
    color: P.color("#f7f5ef", "Cloth & thread"),
    backing: P.color("#2a3550", "Backing", 'What shows through the holes; "transparent" for see-through.'),
    dots: P.bool(true, "Dot eyelets between flowers"),
    seed: P.seed(43)
  },
  prepare: (p) => ({ c: hexToLinear(p.color), b: hexToLinear(p.backing), n: evenInt(p.cells), p }),
  sample(u, v, out, ctx, s) {
    const p = s.p, n = s.n;
    const lod = detail(1 / (n * 60), ctx.pixel);
    const weave2 = 1 + 0.04 * Math.sin(TAU * u * n * 48) * Math.sin(TAU * v * n * 48) * lod;
    let best = 9, rimD = 9, radial = 0;
    const X = u * n, Y = v * n, xi = Math.floor(X);
    for (let i = xi - 1; i <= xi + 1; i++) {
      const dropY = mod(i, 2) * 0.5;
      const yi = Math.floor(Y - dropY);
      for (let j = yi - 1; j <= yi + 1; j++) {
        const cx = i + 0.5, cy = j + 0.5 + dropY;
        const dx = X - cx, dy = Y - cy;
        const rr = Math.hypot(dx, dy);
        if (rr > 0.75) continue;
        const ang = Math.atan2(dy, dx);
        const hs = p.holeSize;
        let d = rr - 0.07 * hs;
        let rad = ang;
        const k = p.petals, sector = TAU / k;
        const a0 = Math.round(ang / sector) * sector;
        const ca = Math.cos(a0), sa = Math.sin(a0);
        const along = dx * ca + dy * sa - 0.24, acr = -dx * sa + dy * ca;
        const pl = 0.13 * (0.6 + 0.4 * hs), pw = 0.055 * (0.6 + 0.4 * hs) * (6 / k) ** 0.5;
        const dp = (Math.hypot(along / pl, acr / pw) - 1) * Math.min(pl, pw);
        if (dp < d) {
          d = dp;
          rad = Math.atan2(acr, along);
        }
        if (d < best) {
          best = d;
          radial = rad;
        }
      }
      if (p.dots) {
        for (let j = Math.floor(Y) - 1; j <= Math.floor(Y) + 1; j++) {
          const cx = i + 1, cy = j + 0.5 + mod(i, 2) * 0.5 + 0.25;
          const d = Math.hypot(X - cx, Y - cy) - 0.035 * (0.6 + 0.4 * p.holeSize);
          if (d < best) {
            best = d;
            radial = Math.atan2(Y - cy, X - cx);
          }
        }
      }
    }
    rimD = best;
    const rimW = 0.03;
    shade(out, s.c, 0.84 * weave2 * (0.86 + 0.14 * smoothstep(rimW, rimW * 2.2, rimD)));
    out[4] = 0.4;
    if (rimD < rimW * 1.2) {
      const t = clamp01(rimD / rimW);
      const prof = Math.sin(Math.PI * (0.5 + 0.5 * t));
      const stitches = 0.92 + 0.08 * Math.sin(radial * 64) * lod;
      const slope = Math.cos(Math.PI * (0.5 + 0.5 * t));
      const lit = 1 + 0.35 * slope * Math.cos(radial + 2.35);
      shade(_c3, s.c, (0.92 + 0.12 * prof) * stitches * lit);
      mix(out, out, _c3, coverage(rimD - rimW, ctx.px * n));
      out[4] = 0.4 + 0.5 * prof;
    }
    if (rimD < 0) {
      shade(_d3, s.b, 1);
      const inner = smoothstep(0, -0.02, rimD);
      _d3[0] *= 0.7 + 0.3 * inner;
      _d3[1] *= 0.7 + 0.3 * inner;
      _d3[2] *= 0.7 + 0.3 * inner;
      mix(out, out, _d3, coverage(rimD + 2e-3, ctx.px * n));
      out[4] = 0;
    }
  }
};
var shibori = {
  id: "shibori",
  name: "Shibori / tie-dye",
  category: "textile",
  scale: "cells",
  tags: ["clothes", "indigo", "tie-dye", "japanese", "boho", "resist-dye"],
  description: "Resist-dye looks on woven cotton: itajime (clamped shapes + fold lines), arashi (pole-wrapped diagonal storm lines), kumo (spider-web bound circles), tie-dye spiral. Dye wicks along the weave, so edges feather along warp and weft.",
  features: (p) => [p.cells, p.cells, "repeats"],
  params: {
    style: P.enumOf("itajime", ["itajime", "arashi", "kumo", "spiral"], "Technique"),
    cells: P.int(3, 1, 32, "Repeats"),
    shape: P.enumOf("square", ["square", "circle", "triangle"], "Itajime shape"),
    bleed: P.float(0.5, 0, 1, "Dye bleed"),
    colors: P.colors(["#1b2a4a", "#f2efe8"], "Dye, cloth", "", 2, 2),
    seed: P.seed(37)
  },
  prepare: (p) => {
    const n = p.cells;
    return {
      c: lin4(p.colors),
      p,
      nz: noiseField({ freq: 6, octaves: 5, seed: p.seed, range: "signed" }),
      tone: noiseField({ freq: 3, octaves: 4, seed: p.seed + 9 }),
      streak: noiseField({ fx: 48 * n, fy: 2, octaves: 3, seed: p.seed + 1, range: "signed" })
    };
  },
  sample(u, v, out, ctx, s) {
    const p = s.p, n = p.cells;
    const nz = s.nz(u, v);
    const lod = detail(1 / 300, ctx.pixel);
    const wick = (valueNoise(u * 320, v * 24, 320, 24, p.seed + 4) + valueNoise(u * 24, v * 320, 24, 320, p.seed + 5)) * 0.5 * lod;
    let white = 0;
    if (p.style === "itajime") {
      const fx = fract(u * n) - 0.5, fy = fract(v * n) - 0.5;
      let d;
      if (p.shape === "circle") d = Math.hypot(fx, fy) - 0.28;
      else if (p.shape === "triangle") d = Math.max(Math.abs(fx) * 0.866 + fy * 0.5, -fy) - 0.17;
      else d = Math.max(Math.abs(fx), Math.abs(fy)) - 0.24;
      d += nz * 0.05 * (0.5 + p.bleed) + wick * 0.025 * (0.4 + p.bleed);
      white = 1 - smoothstep(-0.02, 0.03 + 0.09 * p.bleed, d);
      const x2 = u * n * 2, y2 = v * n * 2;
      const fold = Math.min(Math.min(fract(x2), 1 - fract(x2)), Math.min(fract(y2), 1 - fract(y2)));
      const foldW = 0.03 + 0.05 * p.bleed;
      const gate = smoothstep(0.3, 0.8, s.tone(u + v, v));
      white = Math.max(white, (0.08 + 0.18 * gate) * (1 - smoothstep(0, foldW * (0.6 + gate), fold + nz * 0.03 + wick * 0.03)));
    } else if (p.style === "arashi") {
      const a = u + v, b = u - v;
      const streak = s.streak(fract(a), fract(b));
      const t = fract(a * 6 * n + streak * 0.6 + nz * 0.3);
      white = smoothstep(0.86 - 0.12 * p.bleed, 0.97, Math.abs(t - 0.5) * 2 + wick * 0.05) * (0.35 + 0.65 * smoothstep(-0.25, 0.35, streak));
    } else if (p.style === "kumo") {
      const fx = fract(u * n) - 0.5, fy = fract(v * n) - 0.5;
      const r = Math.hypot(fx, fy) * 2 + nz * 0.08, ang = Math.atan2(fy, fx);
      const rings = 0.5 + 0.5 * Math.cos(TAU * r * 4);
      const spokes = 0.5 + 0.5 * Math.cos(ang * 10 + nz * 6 + r * 3);
      white = clamp01(Math.pow(rings, 3) * 0.8 * (1 - r) * (0.6 + 0.4 * spokes) + Math.pow(spokes, 8) * (1 - r) * 0.7 + (1 - smoothstep(0.08, 0.2, r)));
      white = smoothstep(0.15, 0.5 + 0.4 * p.bleed, white + wick * 0.08);
    } else {
      const fx = fract(u * n) - 0.5, fy = fract(v * n) - 0.5;
      const r = Math.hypot(fx, fy), ang = Math.atan2(fy, fx);
      const arms = Math.cos(ang * 4 + r * 22 + nz * 2.5);
      white = smoothstep(0.55 - 0.25 * p.bleed, 0.95, arms + wick * 0.15) * smoothstep(0.02, 0.1, r) * (1 - smoothstep(0.45, 0.72, r) * 0.5);
    }
    const tone = 0.88 + 0.24 * s.tone(u, v);
    shade(_c3, s.c[0], tone);
    mix(out, _c3, s.c[1], clamp01(white));
    const weave2 = 1 + 0.035 * Math.sin(TAU * u * 160) * Math.sin(TAU * v * 160) * lod;
    shade(out, out, weave2);
  }
};
var textile_default = [corduroy, velvet, quilted, mesh, sequins, crossStitch, eyelet, shibori];

// src/presets.js
var pr = (id, pattern, name, params, tags = []) => ({ id, pattern, name, params, tags });
var PRESETS = [
  // woven
  pr("chambray", "plain-weave", "Chambray", { warp: "#4f6d9a", weft: "#eef1f4", repeats: 24, heather: 0.15 }, ["shirt"]),
  pr("linen", "plain-weave", "Natural linen", { warp: "#cbbd9f", weft: "#d9ccb0", repeats: 22, slub: 0.75, heather: 0.45, irregularity: 0.6, yarnGap: 0.16 }, ["summer"]),
  pr("canvas", "plain-weave", "Canvas / duck", { warp: "#c8b48a", weft: "#bba57a", repeats: 14, yarnGap: 0.05, twist: 0.6 }, ["bag", "workwear"]),
  pr("oxford-cloth", "basket-weave", "Oxford shirting", { warp: "#7da3d6", weft: "#f4f4f0", group: 2, repeats: 14 }, ["shirt"]),
  pr("gabardine", "twill", "Gabardine", { over: 2, under: 2, warp: "#5d5446", weft: "#6a604f", repeats: 20 }, ["coat"]),
  pr("chino", "twill", "Chino drill", { over: 2, under: 1, warp: "#c2a878", weft: "#d6c6a2", repeats: 16 }, ["trousers"]),
  pr("twill-3-1-s", "twill", "3/1 S-twill", { over: 3, under: 1, direction: "S", warp: "#5c3c2e", weft: "#e6d5b8" }),
  pr("silk-satin", "satin", "Silk satin", { shafts: 8, warp: "#c9a46b", weft: "#a8834c", sheen: 0.85, repeats: 10 }, ["luxury"]),
  pr("satin-weft-face", "satin", "Sateen (weft-faced)", { shafts: 8, face: "weft", warp: "#0f3b57", weft: "#c8d9e6" }),
  pr("dogtooth-large", "houndstooth", "Large dogtooth", { band: 8, repeats: 2 }),
  pr("puppytooth", "houndstooth", "Puppytooth (red)", { band: 2, repeats: 8, colors: ["#7b1113", "#efe6d8"] }),
  pr("houndstooth-print", "houndstooth", "Houndstooth (flat print)", { style: "flat", repeats: 3 }, ["print"]),
  pr("herringbone-tweed", "herringbone", "Herringbone tweed", { warp: "#3b3a36", weft: "#9b9078", heather: 0.6, slub: 0.4, irregularity: 0.6, repeats: 4 }),
  pr("herringbone-draft", "herringbone", "Herringbone (draft view)", { style: "draft", repeats: 4 }),
  pr("sharkskin-navy", "pick-and-pick", "Navy sharkskin", { colors: ["#1d2840", "#7c8aa6"] }, ["suiting"]),
  pr("prince-of-wales-brown", "glen-check", "Prince of Wales (brown)", { colors: ["#4a3426", "#e6dccb"], overcheckColor: "#7d2a2a" }),
  pr("gingham-navy", "gingham", "Navy gingham", { colors: ["#1f3a68", "#ffffff"], band: 4, repeats: 6 }),
  pr("gingham-print", "gingham", "Gingham (flat print)", { style: "flat", band: 8, repeats: 4 }, ["print"]),
  pr("tartan-black-watch", "tartan", "Black Watch", { preset: "black-watch" }),
  pr("tartan-red-stewart", "tartan", "Red Stewart-style", { preset: "red-stewart-style", countScale: 0.6 }),
  pr("buffalo-check", "tartan", "Buffalo check", { preset: "buffalo-check", countScale: 1, repeats: 2 }, ["lumberjack"]),
  pr("flannel-plaid", "tartan", "Brushed flannel plaid", { preset: "four-colour", countScale: 1, fuzz: 0.55 }, ["flannel"]),
  pr("camel-check", "tartan", "Camel check-style", { preset: "camel-check-style", countScale: 1.2 }),
  pr("madras", "tartan", "Madras", { preset: "madras-style", symmetric: false, countScale: 1, yarnGap: 0.1, irregularity: 0.5 }, ["summer"]),
  pr("tartan-custom-hex", "tartan", "Custom hex sett", { preset: "custom", threadcount: "#2d3047/24 #e0a458/4 #2d3047/8 #93b7be/16", countScale: 1 }),
  pr("raw-denim", "denim", "Raw selvedge denim", { indigo: "#16264a", wash: 0, irregularity: 0.85, slub: 0.5 }, ["jeans"]),
  pr("stonewash-denim", "denim", "Stonewashed denim", { indigo: "#3a5a8c", wash: 0.85 }, ["jeans"]),
  pr("donegal-grey", "tweed", "Donegal grey", { warp: "#6b6a66", weft: "#8d8a82", neps: 0.55 }),
  pr("harris-herringbone", "tweed", "Harris herringbone", { weave: "herringbone", warp: "#4b4a33", weft: "#7b6b4a", neps: 0.3, nepColors: ["#a33b2a", "#d8b26e", "#3d6b6b"] }),
  pr("waffle-weave", "weave-draft", "Waffle / honeycomb", { draft: "11111111/10000001/10111101/10100101/10100101/10111101/10000001/11111111", warpColors: ["#efe9df"], warpCounts: "1", weftColors: ["#e3dccf"], weftCounts: "1", repeats: 4, yarnGap: 0.18 }, ["towel"]),
  pr("birdseye", "weave-draft", "Bird's-eye", { draft: "0110/1001/1001/0110", warpColors: ["#2b3440", "#c9ced6"], warpCounts: "1 1", weftColors: ["#2b3440", "#c9ced6"], weftCounts: "1 1", repeats: 10 }, ["suiting"]),
  pr("diamond-twill", "weave-draft", "Diamond twill", { draft: "11000011/10000111/00001111/00011110/00111100/01111000/11110000/11100001", warpColors: ["#5b2a3c"], warpCounts: "1", weftColors: ["#e4cfa8"], weftCounts: "1", repeats: 5 }),
  // knit
  pr("rib-2x2-navy", "knit", "2\xD72 rib (navy)", { stitch: "rib-2x2", color: "#2f4858" }, ["beanie", "cuffs"]),
  pr("seed-stitch", "knit", "Seed stitch", { stitch: "seed", color: "#6c8e54" }),
  pr("garter-stitch", "knit", "Garter stitch", { stitch: "garter", color: "#c97b63" }),
  pr("knit-basketweave", "knit", "Knit basketweave", { stitch: "basketweave", color: "#c9a66b", stitchesAcross: 24 }),
  pr("diamond-brocade", "knit", "Diamond brocade", { stitch: "diamond-brocade", color: "#2f6f73", stitchesAcross: 24 }),
  pr("fine-jersey", "knit", "Fine jersey (t-shirt)", { stitch: "stockinette", color: "#3c3c44", stitchesAcross: 48, yarnRadius: 0.27, fuzz: 0.2 }),
  pr("nordic-snowflake", "fair-isle", "Nordic snowflake", { chart: "snowflake", colors: ["#20304a", "#f4f1e8"], stitchesAcross: 27 }, ["christmas"]),
  pr("christmas-trees", "fair-isle", "Christmas trees", { chart: "trees", colors: ["#a4161a", "#f5f3f4", "#5c4033"], stitchesAcross: 20 }, ["christmas"]),
  pr("fair-isle-hearts", "fair-isle", "Hearts", { chart: "hearts", colors: ["#f6e8ea", "#c9184a"], stitchesAcross: 20 }),
  pr("aran-sweater", "cable-knit", "Aran sweater", { cable: "mixed", stitchesAcross: 40, color: "#ece3cf" }),
  pr("braid-cable", "cable-knit", "Braided cable", { cable: "braid", stitchesAcross: 30, color: "#8c9a7e" }),
  pr("chunky-cable-seed", "cable-knit", "Chunky cable on seed", { ground: "seed", stitchesAcross: 18, color: "#d6c7b0", yarnRadius: 0.3 }),
  // textile
  pr("needlecord", "corduroy", "Needlecord", { wales: 28, color: "#6b3b2a" }),
  pr("wide-wale-cord", "corduroy", "Wide-wale cord", { wales: 7, color: "#b38b4d", groove: 0.15 }),
  pr("crushed-velvet-emerald", "velvet", "Crushed velvet (emerald)", { color: "#0f5132", crush: 0.85 }),
  pr("velvet-midnight", "velvet", "Midnight velvet", { color: "#1b1f3b", crush: 0.35, sheen: 0.8 }),
  pr("puffer-channel", "quilted", "Puffer jacket", { layout: "channel", cells: 6, color: "#7a8b5c" }, ["puffer"]),
  pr("quilted-satin-blush", "quilted", "Quilted satin", { surface: "satin", color: "#e8b4b8", stitch: "#f4dfe0", cells: 5 }),
  pr("fishnet", "mesh", "Fishnet (see-through)", { backing: "transparent", cells: 8 }),
  pr("tulle-white", "mesh", "White tulle", { layout: "hex", cells: 12, yarn: 0.06, color: "#f5f5f5", backing: "#2b2d42" }),
  pr("sequins-silver", "sequins", "Silver sequins", { colors: ["#b8bcc4"], cells: 14 }),
  pr("sequins-rainbow", "sequins", "Rainbow sequins", { colors: ["#e63946", "#f4a261", "#e9c46a", "#2a9d8f", "#457b9d", "#9b5de5"], cells: 16 }),
  pr("cross-stitch-flower", "cross-stitch", "Folk flower", { chart: "flower", repeats: 3 }),
  pr("cross-stitch-strawberry", "cross-stitch", "Strawberries", { chart: "strawberry", repeats: 3, colors: ["#c1121f", "#2d6a4f", "#386641", "#fefae0"] }),
  pr("eyelet-see-through", "eyelet-lace", "Eyelet (see-through)", { backing: "transparent" }),
  pr("shibori-arashi", "shibori", "Arashi", { style: "arashi" }),
  pr("shibori-kumo", "shibori", "Kumo", { style: "kumo" }),
  pr("tie-dye-spiral", "shibori", "Tie-dye spiral", { style: "spiral", cells: 2, colors: ["#7b2cbf", "#fff3b0"] }),
  // geometric
  pr("breton", "stripes", "Breton stripe", { colors: ["#1b2a49", "#f4f1ea"], widths: "1 1.6", repeats: 14 }),
  pr("pinstripe", "stripes", "Pinstripe", { colors: ["#e8e6e1", "#22262e"], widths: "1 16", direction: "vertical", repeats: 12 }),
  pr("awning", "stripes", "Awning stripe", { colors: ["#d62828", "#fdf0d5"], widths: "1 1", direction: "vertical", repeats: 6 }),
  pr("retro-diagonal", "stripes", "Retro diagonal", { colors: ["#f4a259", "#5b8e7d", "#f4e285", "#bc4b51"], widths: "3 2 1 2", direction: "diagonal", repeats: 4 }),
  pr("wavy-candy", "stripes", "Wavy candy stripe", { colors: ["#ffcdb2", "#e5989b", "#6d6875"], wave: 0.35, waveFreq: 3, repeats: 6 }),
  pr("harlequin", "checkerboard", "Harlequin", { diagonal: true, colors: ["#1d1d1d", "#c1121f"], cells: 6 }),
  pr("racing-check", "checkerboard", "Racing check", { cells: 16 }),
  pr("ditsy-floral", "dots", "Ditsy floral", { layout: "tossed", shape: "flower", rotate: true, sizeJitter: 0.5, size: 0.32, cells: 7, colors: ["#f28482", "#f6bd60", "#84a59d"], background: "#f7ede2", centerColor: "#ffd166" }, ["floral"]),
  pr("tossed-stars", "dots", "Tossed stars", { layout: "tossed", shape: "star", rotate: true, sizeJitter: 0.6, size: 0.3, colors: ["#ffb703", "#fb8500", "#219ebc"], background: "#023047", cells: 9 }),
  pr("hearts-brick", "dots", "Hearts", { layout: "brick", shape: "heart", size: 0.3, colors: ["#e5383b"], background: "#ffe5ec" }),
  pr("rain-drops", "dots", "Raindrops", { layout: "half-drop", shape: "teardrop", colors: ["#3d405b"], size: 0.26 }),
  pr("falling-leaves", "dots", "Falling leaves", { layout: "tossed", shape: "leaf", rotate: true, colors: ["#2d6a4f", "#40916c", "#74c69d"], background: "#fefae0", cells: 8 }),
  pr("polka-transparent", "dots", "Polka dots (transparent)", { background: "transparent", colors: ["#111111"], layout: "half-drop" }),
  pr("missoni-zigzag", "chevron", "Missoni zigzag", { colors: ["#3d2c8d", "#916bbf", "#c996cc", "#f9f871", "#ff6f91"], bands: 15, zigs: 8, amplitude: 2 }),
  pr("argyle-golf", "argyle", "Golf argyle", { colors: ["#1b4332", "#d8f3dc", "#95d5b2"], lineColor: "#081c15", dashed: true }),
  pr("honeycomb-bevel", "honeycomb", "Bevelled hex tiles", { style: "bevel", colors: ["#3a86ff", "#4895ef", "#4361ee"], background: "#0b0f2a" }),
  pr("truchet-maze", "truchet", "10-PRINT maze", { variant: "maze", cells: 16, colors: ["#111111", "#f5f0e6", "#111111"], lineWidth: 0.12 }),
  pr("truchet-triangles", "truchet", "Triangle tiles", { variant: "triangles", cells: 8, lineWidth: 0, colors: ["#f6bd60", "#84a59d", "#000000"] }),
  pr("seigaiha-red", "seigaiha", "Seigaiha (vermilion)", { colors: ["#c1121f", "#fdf0d5", "#e76f51", "#fdf0d5"], outlineColor: "#780000" }),
  pr("moroccan-ogee", "ogee", "Moroccan ogee", { colors: ["#f1faee", "#a8dadc"], lineColor: "#1d3557", dot: 0.06 }),
  pr("islamic-six-star", "islamic-star", "Six-point stars", { tiling: "6.6.6", angle: 55, repeats: 2, colors: ["#1d3557", "#e9c46a", "#14213d"] }),
  pr("islamic-square-60", "islamic-star", "Square Hankin 60\xB0", { tiling: "4.4.4.4", angle: 60, repeats: 4, colors: ["#f2e9dc", "#8c2f39", "#461220"] }),
  pr("terrazzo-pastel", "terrazzo", "Pastel terrazzo", { background: "#f7f3ee", colors: ["#f4acb7", "#9d8189", "#ffcad4", "#d8e2dc", "#ffe5d9"] }),
  pr("halftone-lines", "halftone", "Line screen", { dot: "line", field: "waves", colors: ["#fdf0d5", "#003049"] }),
  pr("halftone-radial", "halftone", "Radial halftone", { field: "radial", scale: 2, colors: ["#ffffff", "#111111"], cells: 32 }),
  pr("contour-hypsometric", "contour-lines", "Hypsometric map", { fill: true, colors: ["#ffffff", "#3d2b1f"] }),
  pr("subway-tiles", "bricks", "Subway tiles", { bond: "running", cols: 6, rows: 14, colors: ["#f4f4f2", "#ecebe7", "#f8f8f6"], mortarColor: "#9aa0a6", roughness: 0.15, chipping: 0 }),
  pr("brick-basketweave", "bricks", "Basket-weave pavers", { bond: "basket", cols: 4, rows: 8 }),
  pr("flemish-bond", "bricks", "Flemish bond", { bond: "flemish", cols: 4, rows: 10 }),
  pr("graph-paper", "grid-paper", "Graph paper", { style: "lines" }),
  pr("dot-grid", "grid-paper", "Dot grid", { style: "dots", cells: 24, majorEvery: 0, colors: ["#fbfaf7", "#8c8c8c", "#8c8c8c"] }),
  pr("blueprint", "grid-paper", "Blueprint", { colors: ["#1e4f8a", "#4f7fb8", "#d6e4f5"], cells: 20, majorEvery: 5 }),
  pr("isometric-grid", "grid-paper", "Isometric grid", { style: "isometric", majorEvery: 0 }),
  // organic
  pr("ridged-terrain", "noise", "Ridged terrain", { mode: "ridged", colors: ["#1b4332", "#52b788", "#d8f3dc", "#ffffff"], frequency: 3 }),
  pr("warped-sunset", "noise", "Warped sunset", { warp: 1, colors: ["#2d1e2f", "#7b2d43", "#e05e3c", "#f7b267", "#fef3e2"], frequency: 2 }),
  pr("clouds", "noise", "Clouds", { colors: ["#4a90d9", "#ffffff"], contrast: 1.6, frequency: 3 }),
  pr("carrara", "marble", "Carrara", { base: "#efeeea", vein: "#8a8d91", tint: "#dcdcdc", accent: "#b9bcc0", sharpness: 4 }),
  pr("calacatta-gold", "marble", "Calacatta gold", { base: "#f4f1ea", vein: "#4a4038", accent: "#c9a45c", veins: 1, turbulence: 1.4, sharpness: 6, fine: 0.3 }),
  pr("nero-marquina", "marble", "Nero Marquina", { base: "#151515", vein: "#efefef", tint: "#2a2a2a", accent: "#555555", veins: 2, turbulence: 1.4 }),
  pr("verde-marble", "marble", "Verde marble", { base: "#1f3d2b", vein: "#d8e8d0", tint: "#2f5a3f", accent: "#5f8f6a", veins: 2, turbulence: 2 }),
  pr("black-galaxy-granite", "granite", "Black granite", { colors: ["#1c1c1e", "#2c2c2e", "#5a5a5e", "#c9a45c"], glints: 0.7 }),
  pr("oak-floor", "wood", "Oak floor", { colors: ["#d8b58a", "#b88b5e", "#8a6240"], planks: 5, rings: 12 }),
  pr("walnut", "wood", "Walnut", { colors: ["#8b5e3c", "#5d3a22", "#3b2314"], planks: 4, knots: 0.35 }),
  pr("whitewashed-pine", "wood", "Whitewashed pine", { colors: ["#efe6d8", "#d9c7ad", "#b59c7d"], planks: 6, knots: 0.5 }),
  pr("parquet-chevron", "parquet", "Chevron parquet", { layout: "chevron" }),
  pr("parquet-basket", "parquet", "Basket parquet", { layout: "basket", repeats: 3 }),
  pr("cheetah", "leopard", "Cheetah", { style: "cheetah" }),
  pr("jaguar", "leopard", "Jaguar", { style: "jaguar", cells: 5 }),
  pr("snow-leopard", "leopard", "Snow leopard", { colors: ["#e9e6df", "#cfc9bd", "#3b3a38"] }),
  pr("tiger", "zebra", "Tiger", { style: "tiger" }),
  pr("python", "snakeskin", "Python", { cells: 24, colors: ["#e8e2d0", "#b9a77f", "#2a241c"] }),
  pr("croc-embossed", "snakeskin", "Croc embossed", { style: "croc", colors: ["#3f4a2f", "#2b3320", "#141a10"], cells: 12, gloss: 0.7 }),
  pr("camo-digital", "camouflage", "Digital camo", { style: "digital", colors: ["#c2b280", "#8b7d5b", "#5e5340", "#3a3226"] }),
  pr("camo-desert", "camouflage", "Desert camo", { colors: ["#d8c49a", "#b89b6a", "#8c6d46", "#5a4630"] }),
  pr("camo-tiger-stripe", "camouflage", "Tiger-stripe camo", { style: "tiger-stripe", colors: ["#9c9a6a", "#4d5b33", "#1e2016"] }),
  pr("camo-urban", "camouflage", "Urban camo", { colors: ["#d9d9d9", "#9e9e9e", "#5e5e5e", "#262626"] }),
  pr("rd-mitosis", "reaction-diffusion", "Mitosis", { preset: "mitosis", colors: ["#fff8f0", "#f08080", "#6b2737"] }),
  pr("rd-maze", "reaction-diffusion", "Turing maze", { preset: "maze", colors: ["#111111", "#eeeeee"] }),
  pr("rd-worms", "reaction-diffusion", "Worms", { preset: "worms", colors: ["#14213d", "#fca311", "#e5e5e5"] }),
  pr("cracked-earth", "voronoi-cells", "Cracked earth", { style: "cracked-earth", colors: ["#b5835a", "#a87449", "#c4935f"], edgeColor: "#3b2a1d", edge: 0.06, cells: 7 }),
  pr("cobblestone", "voronoi-cells", "Cobblestones", { style: "cobblestone", colors: ["#8d8d8d", "#7a7a7a", "#a39e93"], edgeColor: "#2b2b2b", cells: 6, edge: 0.12 }),
  pr("black-leather", "leather", "Black leather", { color: "#1d1c1c", sheen: 0.5 }),
  pr("tan-leather", "leather", "Tan saddle leather", { color: "#9a5b2e", cells: 28, crease: 0.6 })
];

// src/core/raster.js
var LUT_N = 8192;
var LUT = new Float32Array(LUT_N + 2);
for (let i = 0; i <= LUT_N + 1; i++) LUT[i] = linearToSrgb(Math.min(1, i / LUT_N)) * 255;
function encode(c) {
  if (!(c > 0)) return 0;
  if (c >= 1) return 255;
  const x = c * LUT_N, i = x | 0;
  return LUT[i] + (LUT[i + 1] - LUT[i]) * (x - i);
}
function dither(i, j) {
  let h = Math.imul(i, 668265261) ^ Math.imul(j + 40503, 374761393);
  h = Math.imul(h ^ h >>> 15, 2246822507);
  h ^= h >>> 13;
  return (h >>> 8 & 65535) / 65536 - 0.5;
}
var PATTERNS_SS = {
  1: [[0.5, 0.5]],
  2: [[0.125, 0.625], [0.375, 0.125], [0.625, 0.875], [0.875, 0.375]]
};
function samplePositions(ss) {
  if (PATTERNS_SS[ss]) return PATTERNS_SS[ss];
  const pts = [];
  for (let y = 0; y < ss; y++) for (let x = 0; x < ss; x++) pts.push([(x + 0.5) / ss, (y + 0.5) / ss]);
  return pts;
}
function autoTiles(width, height) {
  if (width === height) return [1, 1];
  return width > height ? [Math.max(1, Math.round(width / height)), 1] : [1, Math.max(1, Math.round(height / width))];
}
function rasterize(width, height, sample, opts = {}) {
  width = clamp(Math.round(width) || 1, 1, 8192);
  height = clamp(Math.round(height) || 1, 1, 8192);
  const ss = clamp(Math.round(opts.supersample ?? 2), 1, 4);
  const output = opts.output || "color";
  const tiles = opts.tiles || autoTiles(width, height);
  const tx = Math.max(1, Math.round(tiles[0]) || 1), ty = Math.max(1, Math.round(tiles[1]) || 1);
  const tileW = width / tx, tileH = height / ty;
  const pixel = Math.max(1 / tileW, 1 / tileH);
  const ctx = { px: pixel / ss, pixel, width, height, ss, tileW, tileH };
  const y0 = opts.rows ? clamp(opts.rows[0] | 0, 0, height) : 0;
  const y1 = opts.rows ? clamp(opts.rows[1] | 0, y0, height) : height;
  const rowsN = y1 - y0;
  const doDither = opts.dither !== false;
  const wantColor = output === "color" || output === "maps" || output === "color+height";
  const wantHeight = output !== "color";
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
        u -= Math.floor(u);
        v -= Math.floor(v);
        out[0] = 0;
        out[1] = 0;
        out[2] = 0;
        out[3] = 1;
        out[4] = 0.5;
        sample(u, v, out, ctx);
        r += out[0];
        g += out[1];
        b += out[2];
        a += out[3];
        h += out[4];
      }
      const p = (j - y0) * width + i;
      if (color) {
        a *= inv;
        const k4 = p * 4;
        if (a > 1e-6) {
          const ia = inv / a, d = doDither ? dither(i, j) : 0;
          color[k4] = encode(r * ia) + d;
          color[k4 + 1] = encode(g * ia) + d;
          color[k4 + 2] = encode(b * ia) + d;
        }
        color[k4 + 3] = a * 255;
      }
      if (heights) {
        h *= inv;
        heights[p] = h < 0 ? 0 : h > 1 ? 1 : h;
      }
    }
  }
  if (output === "color") return { width, height: rowsN === height ? height : rowsN, data: color, tiles: [tx, ty] };
  if (output === "color+height") return { width, height: rowsN, color, heights, tiles: [tx, ty] };
  if (output === "height") return { width, height: rowsN === height ? height : rowsN, data: heightToGray(heights, doDither, width, y0), heights, tiles: [tx, ty] };
  const normal = new Uint8ClampedArray(width * height * 4);
  heightToNormal(heights, width, height, normal, opts.normalStrength ?? 4, opts.normalFormat, tileW);
  if (output === "normal") return { width, height, data: normal, tiles: [tx, ty] };
  return { width, height, tiles: [tx, ty], color, heightMap: heightToGray(heights, doDither, width, 0), normalMap: normal, heights };
}
function heightToGray(heights, doDither, width, y0) {
  const n = heights.length, data = new Uint8ClampedArray(n * 4);
  for (let p = 0; p < n; p++) {
    const g = heights[p] * 255 + (doDither ? dither(p % width, y0 + (p / width | 0)) * 0.5 : 0);
    data[p * 4] = data[p * 4 + 1] = data[p * 4 + 2] = g;
    data[p * 4 + 3] = 255;
  }
  return data;
}
function heightToNormal(heights, w, h, data, strength = 4, format = "opengl", tileW = w) {
  const k = strength * (tileW / 512) * 0.25;
  const flipY = format === "directx" ? -1 : 1;
  for (let j = 0; j < h; j++) {
    const jm = (j - 1 + h) % h * w, j0 = j * w, jp = (j + 1) % h * w;
    for (let i = 0; i < w; i++) {
      const im = (i - 1 + w) % w, ip = (i + 1) % w;
      const tl = heights[jm + im], t = heights[jm + i], tr = heights[jm + ip];
      const l = heights[j0 + im], r = heights[j0 + ip];
      const bl = heights[jp + im], b = heights[jp + i], br = heights[jp + ip];
      const gx = tr + 2 * r + br - (tl + 2 * l + bl);
      const gy = bl + 2 * b + br - (tl + 2 * t + tr);
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
function fillArea(tile, width, height, offsetX = 0, offsetY = 0) {
  width = clamp(Math.round(width) || 1, 1, 16384);
  height = clamp(Math.round(height) || 1, 1, 16384);
  const tw = tile.width, th = tile.height, src = tile.data;
  const data = new Uint8ClampedArray(width * height * 4);
  const ox = (Math.round(offsetX) % tw + tw) % tw, oy = (Math.round(offsetY) % th + th) % th;
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

// src/index.js
var VERSION = "2.0.0";
var PATTERNS = [...woven_default, ...knit_default, ...textile_default, ...geometric_default, ...organic_default];
var BY_ID = new Map(PATTERNS.map((p) => [p.id, p]));
if (BY_ID.size !== PATTERNS.length) throw new Error("texturelib: duplicate pattern id");
var CATEGORIES = ["woven", "knit", "textile", "geometric", "organic"];
var PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));
var getPattern = (id) => BY_ID.get(id);
function need(id) {
  const pat = BY_ID.get(id);
  if (!pat) throw new Error(`texturelib: unknown pattern "${id}". Call listPatterns() for valid ids.`);
  return pat;
}
function listPatterns() {
  return PATTERNS.map(({ id, name, category, tags, description, params, scale }) => ({
    id,
    name,
    category,
    tags,
    description,
    scaleParam: scale || null,
    params,
    presets: PRESETS.filter((pr2) => pr2.pattern === id).map((pr2) => pr2.id)
  }));
}
function defaults(id) {
  return resolveParams(need(id).params, {});
}
function listPresets(patternId) {
  return PRESETS.filter((p) => !patternId || p.pattern === patternId).map((p) => ({ ...p, params: { ...p.params } }));
}
var getPreset = (id) => PRESET_BY_ID.get(id);
function resolveFor(pat, opts) {
  let input = opts.params || {};
  if (opts.preset) {
    const pr2 = PRESET_BY_ID.get(opts.preset);
    if (pr2 && pr2.pattern === pat.id) input = { ...pr2.params, ...input };
  }
  return resolveParams(pat.params, input);
}
function render(id, opts = {}) {
  const pat = need(id);
  const width = opts.width ?? opts.size ?? 512;
  const height = opts.height ?? width;
  const p = resolveFor(pat, opts);
  const tiles = opts.tiles || autoTiles(Math.round(width), Math.round(height));
  const state = pat.prepare(p, { width, height, tiles });
  const img = rasterize(width, height, (u, v, out, ctx) => pat.sample(u, v, out, ctx, state), { ...opts, tiles, output: opts.output === "maps" ? "color" : opts.output });
  return { id, ...img, params: p };
}
function renderRegion(id, opts = {}) {
  const pat = need(id);
  const width = opts.width ?? opts.size ?? 512;
  const height = opts.height ?? width;
  const p = resolveFor(pat, opts);
  const tiles = opts.tiles || autoTiles(Math.round(width), Math.round(height));
  const state = pat.prepare(p, { width, height, tiles });
  const img = rasterize(width, height, (u, v, out, ctx) => pat.sample(u, v, out, ctx, state), { ...opts, tiles });
  return { id, ...img, params: p };
}
function renderMaps(id, opts = {}) {
  const pat = need(id);
  const width = opts.width ?? opts.size ?? 512;
  const height = opts.height ?? width;
  const p = resolveFor(pat, opts);
  const tiles = opts.tiles || autoTiles(Math.round(width), Math.round(height));
  const state = pat.prepare(p, { width, height, tiles });
  const img = rasterize(width, height, (u, v, out, ctx) => pat.sample(u, v, out, ctx, state), { ...opts, tiles, output: "maps" });
  return { id, ...img, params: p };
}
function renderArea(id, opts = {}) {
  const tileSize = Math.max(1, Math.round(opts.tileSize ?? 256));
  const tile = render(id, { ...opts, width: tileSize, height: tileSize, tiles: [1, 1] });
  const area = fillArea(tile, opts.width ?? tileSize, opts.height ?? opts.width ?? tileSize, opts.offsetX, opts.offsetY);
  return { id, ...area, params: tile.params, tileSize };
}
function featureCount(id, params = {}) {
  const pat = need(id);
  const p = resolveParams(pat.params, params);
  if (pat.features) {
    const st = pat.prepare(p, { width: 512, height: 512, tiles: [1, 1] });
    const f = pat.features(p, st);
    return { x: f[0], y: f[1], unit: f[2] || "cells" };
  }
  const n = pat.scale ? Number(p[pat.scale]) || 1 : 1;
  return { x: n, y: n, unit: "repeats" };
}
function tileSizeFor(id, params, featurePx) {
  return Math.max(1, Math.round(featureCount(id, params).x * featurePx));
}
function createSampler(id, params = {}, { resolution = 1024, preset } = {}) {
  const pat = need(id);
  const p = resolveFor(pat, { params, preset });
  const state = pat.prepare(p, { width: resolution, height: resolution, tiles: [1, 1] });
  const out = new Float64Array(5);
  const ctx = { px: 1 / resolution, pixel: 1 / resolution, width: resolution, height: resolution, ss: 1, tileW: resolution, tileH: resolution };
  const into = (u, v, dst) => {
    u -= Math.floor(u);
    v -= Math.floor(v);
    out[0] = out[1] = out[2] = 0;
    out[3] = 1;
    out[4] = 0.5;
    pat.sample(u, v, out, ctx, state);
    const a = out[3], k = a > 1e-6 ? 1 / a : 0;
    dst[0] = out[0] * k;
    dst[1] = out[1] * k;
    dst[2] = out[2] * k;
    dst[3] = a;
    dst[4] = out[4];
    return dst;
  };
  const fn = (u, v) => into(u, v, [0, 0, 0, 0, 0]);
  fn.into = into;
  fn.params = p;
  return fn;
}

// src/renderer.js
var now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
function abortError() {
  const e = new Error("texturelib: render aborted");
  e.name = "AbortError";
  return e;
}
function grayFromHeights(heights) {
  const n = heights.length, data = new Uint8ClampedArray(n * 4);
  for (let p = 0; p < n; p++) {
    const g = heights[p] * 255;
    data[p * 4] = data[p * 4 + 1] = data[p * 4 + 2] = g;
    data[p * 4 + 3] = 255;
  }
  return data;
}
function keyOf(kind, id, opts) {
  const o = {};
  for (const k of Object.keys(opts).sort()) if (k !== "signal" && k !== "slot") o[k] = opts[k];
  return kind + "|" + id + "|" + JSON.stringify(o);
}
function createRenderer(options = {}) {
  const cores = typeof navigator !== "undefined" && navigator.hardwareConcurrency || 4;
  const want = options.workers ?? Math.max(1, Math.min(4, cores - 1));
  const cacheSize = options.cacheSize ?? 48, cacheBytes = options.cacheBytes ?? 384 * 1024 * 1024;
  const splitAbove = options.splitAbove ?? 160 * 160;
  const cache = /* @__PURE__ */ new Map();
  let bytes = 0;
  const inflight = /* @__PURE__ */ new Map();
  const slots = /* @__PURE__ */ new Map();
  const pool = [];
  const queue = [];
  let jobSeq = 0;
  const stats = { renders: 0, cacheHits: 0, workerBands: 0, mainThread: 0, lastMs: 0 };
  if (want > 0 && typeof Worker !== "undefined") {
    let url = options.workerUrl, type = options.workerType;
    if (!url) {
      try {
        url = new URL("./worker.js", import.meta.url).href;
      } catch (e) {
        url = null;
      }
      type = type || "module";
    }
    if (url && !type) type = /\.worker\.js($|\?)/.test(String(url)) ? "classic" : "module";
    for (let i = 0; url && i < want; i++) {
      try {
        const w = new Worker(url, type === "module" ? { type: "module" } : void 0);
        const slot = { w, busy: null };
        w.onmessage = (e) => onDone(slot, e.data);
        w.onerror = (e) => {
          if (slot.busy) {
            const b = slot.busy;
            slot.busy = null;
            b.reject(new Error("texturelib worker error: " + (e.message || "failed to load " + url)));
          }
          e.preventDefault && e.preventDefault();
          pump();
        };
        pool.push(slot);
      } catch (e) {
        break;
      }
    }
  }
  function onDone(slot, msg) {
    const band = slot.busy;
    slot.busy = null;
    if (band) {
      if (msg.ok) {
        stats.workerBands++;
        band.resolve(msg);
      } else band.reject(new Error(msg.error));
    }
    pump();
  }
  function pump() {
    for (const slot of pool) {
      if (slot.busy) continue;
      let band;
      while ((band = queue.shift()) && band.cancelled()) band.reject(abortError());
      if (!band) return;
      slot.busy = band;
      slot.w.postMessage({ job: band.job, id: band.id, opts: band.opts });
    }
  }
  function runBand(id, opts, cancelled) {
    return new Promise((resolve, reject) => {
      queue.push({ job: ++jobSeq, id, opts, resolve, reject, cancelled });
      pump();
    });
  }
  function remember(key, img) {
    const b = (img.data ? img.data.byteLength : 0) + (img.color ? img.color.byteLength * 3 : 0);
    cache.set(key, { img, bytes: b });
    bytes += b;
    while ((cache.size > cacheSize || bytes > cacheBytes) && cache.size > 1) {
      const [k, v] = cache.entries().next().value;
      cache.delete(k);
      bytes -= v.bytes;
    }
  }
  function recall(key) {
    const hit2 = cache.get(key);
    if (!hit2) return null;
    cache.delete(key);
    cache.set(key, hit2);
    return hit2.img;
  }
  async function produce(kind, id, opts, signal) {
    const t0 = now();
    const width = Math.round(opts.width ?? opts.size ?? 512), height = Math.round(opts.height ?? width);
    const cancelled = () => !!(signal && signal.aborted);
    if (!pool.length) {
      await new Promise((r) => setTimeout(r, 0));
      if (cancelled()) throw abortError();
      stats.mainThread++;
      const img2 = kind === "maps" ? renderMaps(id, opts) : render(id, opts);
      stats.lastMs = now() - t0;
      return img2;
    }
    const output = opts.output || "color";
    const need2 = kind === "maps" || output === "normal" ? "color+height" : output === "height" ? "height" : "color";
    const bands = width * height >= splitAbove ? Math.min(pool.length * 2, Math.max(1, Math.floor(height / 16))) : 1;
    const parts = [];
    for (let b = 0; b < bands; b++) {
      const y0 = Math.floor(b * height / bands), y1 = Math.floor((b + 1) * height / bands);
      parts.push(runBand(id, { ...opts, width, height, rows: [y0, y1], output: need2, signal: void 0, slot: void 0 }, cancelled));
    }
    let res;
    try {
      res = await Promise.all(parts);
    } catch (e) {
      parts.forEach((p) => p.catch(() => {
      }));
      throw cancelled() ? abortError() : e;
    }
    if (cancelled()) throw abortError();
    const first = res[0];
    const color = need2 !== "height" ? new Uint8ClampedArray(width * height * 4) : null;
    const heights = need2 !== "color" ? new Float32Array(width * height) : null;
    for (const r of res) {
      if (color) color.set(new Uint8ClampedArray(r.color), r.rows[0] * width * 4);
      if (heights) heights.set(new Float32Array(r.heights), r.rows[0] * width);
    }
    const base = { id, width, height, params: first.params, tiles: first.tiles };
    let img;
    if (kind === "maps") {
      const normalMap = heightToNormal(heights, width, height, new Uint8ClampedArray(width * height * 4), opts.normalStrength ?? 4, opts.normalFormat, width / first.tiles[0]);
      img = { ...base, color, heightMap: grayFromHeights(heights), normalMap, heights };
    } else if (output === "normal") {
      img = { ...base, data: heightToNormal(heights, width, height, new Uint8ClampedArray(width * height * 4), opts.normalStrength ?? 4, opts.normalFormat, width / first.tiles[0]) };
    } else if (output === "height") img = { ...base, data: grayFromHeights(heights), heights };
    else img = { ...base, data: color };
    stats.lastMs = now() - t0;
    return img;
  }
  function request(kind, id, opts = {}, ctl = {}) {
    stats.renders++;
    const key = keyOf(kind, id, opts);
    const hit2 = recall(key);
    if (hit2) {
      stats.cacheHits++;
      return Promise.resolve(hit2);
    }
    let signal = ctl.signal;
    if (ctl.slot != null) {
      const prev = slots.get(ctl.slot);
      if (prev) prev.abort();
      const ac = new AbortController();
      slots.set(ctl.slot, ac);
      if (signal) signal.addEventListener("abort", () => ac.abort(), { once: true });
      signal = ac.signal;
    }
    if (inflight.has(key) && !signal) return inflight.get(key);
    const p = produce(kind, id, opts, signal).then((img) => {
      remember(key, img);
      return img;
    });
    if (!signal) {
      inflight.set(key, p);
      p.finally(() => inflight.delete(key)).catch(() => {
      });
    }
    return p;
  }
  return {
    /** Promise of render(id, opts). ctl = { slot, signal }. */
    render: (id, opts, ctl) => request("color", id, opts, ctl),
    /** Promise of renderMaps(id, opts). */
    renderMaps: (id, opts, ctl) => request("maps", id, opts, ctl),
    /** Cached result for (id, opts) or null — synchronous, never renders. */
    peek: (id, opts = {}) => recall(keyOf("color", id, opts)),
    clear() {
      cache.clear();
      bytes = 0;
    },
    terminate() {
      for (const s of pool) s.w.terminate();
      pool.length = 0;
      queue.length = 0;
    },
    get workers() {
      return pool.length;
    },
    stats
  };
}
function serveWorker(scope) {
  scope.onmessage = (e) => {
    const { job, id, opts } = e.data || {};
    try {
      const r = renderRegion(id, opts);
      const msg = { job, ok: true, rows: opts.rows, params: r.params, tiles: r.tiles };
      const transfer = [];
      const color = r.color || (opts.output === "color" ? r.data : null);
      if (color) {
        msg.color = color.buffer;
        transfer.push(color.buffer);
      }
      if (r.heights) {
        msg.heights = r.heights.buffer;
        transfer.push(r.heights.buffer);
      }
      scope.postMessage(msg, transfer);
    } catch (err) {
      scope.postMessage({ job, ok: false, error: String(err && err.message || err) });
    }
  };
}

// src/browser.js
function toImageData(img) {
  return new ImageData(img.data, img.width, img.height);
}
function toCanvas(img, canvas) {
  const c = canvas || (typeof document !== "undefined" ? document.createElement("canvas") : new OffscreenCanvas(img.width, img.height));
  if (c.width !== img.width) c.width = img.width;
  if (c.height !== img.height) c.height = img.height;
  c.getContext("2d").putImageData(toImageData(img), 0, 0);
  return c;
}
function createPattern(ctx, img, { scale = 1, rotation = 0, offsetX = 0, offsetY = 0, repetition = "repeat" } = {}) {
  const src = img && img.data && !img.getContext ? toCanvas(img) : img;
  const pattern = ctx.createPattern(src, repetition);
  if (pattern && pattern.setTransform && typeof DOMMatrix !== "undefined") {
    pattern.setTransform(new DOMMatrix().translateSelf(offsetX, offsetY).rotateSelf(rotation).scaleSelf(scale));
  }
  return pattern;
}
async function toBlob(img, type = "image/png", quality) {
  const c = toCanvas(img, typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(img.width, img.height) : void 0);
  if (c.convertToBlob) return c.convertToBlob({ type, quality });
  return new Promise((resolve) => c.toBlob(resolve, type, quality));
}
function toDataURL(img, type = "image/png", quality) {
  const c = document.createElement("canvas");
  return toCanvas(img, c).toDataURL(type, quality);
}
async function cssBackground(img, { size } = {}) {
  const url = URL.createObjectURL(await toBlob(img));
  return { url, css: `url("${url}") 0 0${size ? ` / ${size}px ${size}px` : ""} repeat` };
}
export {
  CATEGORIES,
  PALETTES,
  PATTERNS,
  PRESETS,
  VERSION,
  autoTiles,
  createPattern,
  createRenderer,
  createSampler,
  cssBackground,
  defaults,
  featureCount,
  fillArea,
  getPattern,
  getPreset,
  hash_exports as hash,
  heightToNormal,
  hexToLinear,
  linearToHex,
  listPatterns,
  listPresets,
  noise_exports as noise,
  parseColor,
  render,
  renderArea,
  renderMaps,
  renderRegion,
  resolveParams,
  serveWorker,
  tileSizeFor,
  toBlob,
  toCanvas,
  toDataURL,
  toImageData
};
