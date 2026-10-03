// Small math helpers shared by every pattern. All pure functions, no allocation.

export const TAU = Math.PI * 2;
export const SQRT3 = Math.sqrt(3);

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const fract = (x) => x - Math.floor(x);
/** Positive modulo for ints or floats: mod(-1, 4) === 3. */
export const mod = (a, n) => ((a % n) + n) % n;
export const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
/** Quintic fade used by Perlin noise (C2 continuous). */
export const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
/** Shortest signed difference on a unit torus, result in [-0.5, 0.5). */
export const wrapDelta = (d) => d - Math.round(d);
export const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; };
export const lcm = (a, b) => (a && b ? Math.abs(a * b) / gcd(a, b) : 0);
/** Round to the nearest even integer >= min (checkerboards/half-drops need even counts to tile). */
export const evenInt = (n, min = 2) => Math.max(min, Math.round(n / 2) * 2);
/** Round n to the nearest positive multiple of k (k >= 1). */
export const multipleOf = (n, k) => Math.max(1, Math.round(n / k)) * k;

/**
 * Analytic antialiasing coverage from a signed distance (negative = inside).
 * `px` is the size of one (sub)pixel in the same units as d. Returns 1 inside, 0 outside.
 */
export const coverage = (d, px) => clamp01(0.5 - d / px);

/**
 * Level-of-detail weight for a periodic detail of period `period` (uv units) rendered with
 * pixels of size `pixel` (uv units, use ctx.pixel). 1 = fully resolved (period ≥ ~4 px),
 * 0 = below Nyquist (period ≤ ~1.7 px) — multiply the detail's AMPLITUDE by this and it fades to
 * its mean instead of aliasing into moiré when a tile is rendered small.
 */
export const detail = (period, pixel) => 1 - smoothstep(0.25, 0.6, pixel / period);

/** Triangle wave in [0,1], period 1. */
export const tri = (x) => Math.abs(fract(x) - 0.5) * 2;

/** Smooth minimum (polynomial, k = blend radius). */
export const smin = (a, b, k) => {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k);
  return lerp(b, a, h) - k * h * (1 - h);
};

/** Lambert-ish shading of a height-field normal (nx, ny, 1) lit from the top-left. Returns ~[0, 1.25]. */
const LX = -0.48, LY = -0.58, LZ = 0.66; // normalised light direction (screen space, y down)
export function lambert(nx, ny) {
  const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
  const d = (nx * LX + ny * LY + LZ) * inv;
  return d > 0 ? d / LZ : 0; // 1.0 for a flat surface
}

/** Distance from point p to segment ab. */
export function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = clamp01((pax * bax + pay * bay) / (bax * bax + bay * bay || 1e-12));
  const dx = pax - bax * h, dy = pay - bay * h;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Like sdSegment but also returns the parameter h along the segment via out[0]. */
export function sdSegmentH(px, py, ax, ay, bx, by, out) {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = clamp01((pax * bax + pay * bay) / (bax * bax + bay * bay || 1e-12));
  const dx = pax - bax * h, dy = pay - bay * h;
  out[0] = h;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Signed distance to an axis-aligned box of half-size (bx, by) centred at the origin. */
export function sdBox(x, y, bx, by) {
  const dx = Math.abs(x) - bx, dy = Math.abs(y) - by;
  const ox = dx > 0 ? dx : 0, oy = dy > 0 ? dy : 0;
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(dx, dy), 0);
}

/**
 * Signed distance to a regular n-gon with circumradius r (Inigo Quilez). An edge faces +y (down
 * on screen), so odd n (triangle, pentagon) point a vertex up.
 */
export function sdPolygon(x, y, r, n) {
  const an = Math.PI / n, ca = Math.cos(an), sa = Math.sin(an);
  const bn = mod(Math.atan2(x, y), 2 * an) - an;
  const len = Math.hypot(x, y);
  let px = len * Math.cos(bn) - r * ca, py = len * Math.abs(Math.sin(bn)) - r * sa;
  py += clamp(-py, 0, r * sa);
  return Math.hypot(px, py) * Math.sign(px);
}

/** Inigo Quilez 5-point star SDF (y-down screen space; point faces up). r = outer radius, rf = inner ratio. */
export function sdStar5(x, y, r, rf) {
  const k1x = 0.809016994375, k1y = -0.587785252292;
  const k2x = -k1x, k2y = k1y;
  let px = Math.abs(x), py = -y;
  let d = Math.max(k1x * px + k1y * py, 0) * 2;
  px -= d * k1x; py -= d * k1y;
  d = Math.max(k2x * px + k2y * py, 0) * 2;
  px -= d * k2x; py -= d * k2y;
  px = Math.abs(px);
  py -= r;
  const bax = rf * -k1y - 0, bay = rf * k1x - 1;
  const h = clamp((px * bax + py * bay) / (bax * bax + bay * bay), 0, r);
  const ex = px - bax * h, ey = py - bay * h;
  return Math.sqrt(ex * ex + ey * ey) * Math.sign(py * bax - px * bay);
}

/** Inigo Quilez heart SDF, scaled so the heart spans roughly [-0.5,0.5]^2 (y-down). */
export function sdHeart(x, y) {
  let px = Math.abs(x) * 1.6, py = (0.55 - y) * 1.6;
  let d;
  if (py + px > 1.0) {
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
