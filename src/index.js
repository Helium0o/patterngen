// texturelib — public API. Zero dependencies, runs unchanged in browsers, workers and Node ≥ 18.
//
//   import { render, listPatterns } from './src/index.js';
//   const tile = render('houndstooth', { width: 512, params: { band: 4, seed: 7 } });
//   ctx.putImageData(new ImageData(tile.data, tile.width, tile.height), 0, 0);   // browser
//
// Every pattern is a seamless tile: repeat it (CanvasPattern, CSS background, GL_REPEAT) to fill
// any area. See INTEGRATION.md for app recipes and CLAUDE.md for how patterns are written.

import woven from './patterns/woven.js';
import knit from './patterns/knit.js';
import geometric from './patterns/geometric.js';
import organic from './patterns/organic.js';
import textile from './patterns/textile.js';
import { PRESETS } from './presets.js';
import { resolveParams } from './core/params.js';
import { rasterize, fillArea, autoTiles } from './core/raster.js';

export const VERSION = '2.0.0';

/** All pattern definitions (objects with id, name, category, tags, description, params, prepare, sample). */
export const PATTERNS = [...woven, ...knit, ...textile, ...geometric, ...organic];
const BY_ID = new Map(PATTERNS.map((p) => [p.id, p]));
if (BY_ID.size !== PATTERNS.length) throw new Error('texturelib: duplicate pattern id');

export const CATEGORIES = ['woven', 'knit', 'textile', 'geometric', 'organic'];

const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

/** @returns the pattern definition, or undefined for an unknown id. */
export const getPattern = (id) => BY_ID.get(id);

function need(id) {
  const pat = BY_ID.get(id);
  if (!pat) throw new Error(`texturelib: unknown pattern "${id}". Call listPatterns() for valid ids.`);
  return pat;
}

/**
 * Lightweight, JSON-safe metadata for building UIs (no functions).
 * `scaleParam` names the param that controls density (how many features fit in one tile).
 */
export function listPatterns() {
  return PATTERNS.map(({ id, name, category, tags, description, params, scale }) => ({
    id, name, category, tags, description, scaleParam: scale || null, params,
    presets: PRESETS.filter((pr) => pr.pattern === id).map((pr) => pr.id),
  }));
}

/** Default (resolved) params for a pattern. */
export function defaults(id) {
  return resolveParams(need(id).params, {});
}

/** All presets, or only those of one pattern. Preset = { id, pattern, name, params, tags? }. */
export function listPresets(patternId) {
  return PRESETS.filter((p) => !patternId || p.pattern === patternId).map((p) => ({ ...p, params: { ...p.params } }));
}
export const getPreset = (id) => PRESET_BY_ID.get(id);

/** Merge preset params (if any) under the user's params, then validate against the schema. */
function resolveFor(pat, opts) {
  let input = opts.params || {};
  if (opts.preset) {
    const pr = PRESET_BY_ID.get(opts.preset);
    if (pr && pr.pattern === pat.id) input = { ...pr.params, ...input };
  }
  return resolveParams(pat.params, input);
}

/**
 * Render a seamless tile.
 * @param {string} id   pattern id (see listPatterns / PATTERNS.md)
 * @param {object} [opts]
 *   width, height   output size in px (default 512; height defaults to width). Non-square outputs
 *                   hold whole square tiles (e.g. 1024×512 = 2×1 tiles) unless `tiles` is given.
 *   params          pattern params (anything invalid is clamped / replaced by defaults)
 *   preset          preset id (see listPresets) — merged under `params`
 *   supersample     1..4, default 2 (= 4 samples/px). 1 is ~4× faster for previews.
 *   output          'color' (default) | 'height' | 'normal'
 *   normalStrength, normalFormat ('opengl' | 'directx')   for output 'normal'
 *   tiles           [tilesX, tilesY] repeats inside the image (overrides the automatic choice)
 * @returns {{id, width, height, data: Uint8ClampedArray, params, tiles}}  RGBA, straight alpha, sRGB.
 */
export function render(id, opts = {}) {
  const pat = need(id);
  const width = opts.width ?? opts.size ?? 512;
  const height = opts.height ?? width;
  const p = resolveFor(pat, opts);
  const tiles = opts.tiles || autoTiles(Math.round(width), Math.round(height));
  const state = pat.prepare(p, { width, height, tiles });
  const img = rasterize(width, height, (u, v, out, ctx) => pat.sample(u, v, out, ctx, state), { ...opts, tiles, output: opts.output === 'maps' ? 'color' : opts.output });
  return { id, ...img, params: p };
}

/**
 * Colour + height + normal maps in ONE sampling pass (for 3D materials / PBR).
 * @returns {{id, width, height, params, tiles, color, heightMap, normalMap, heights: Float32Array}}
 */
export function renderMaps(id, opts = {}) {
  const pat = need(id);
  const width = opts.width ?? opts.size ?? 512;
  const height = opts.height ?? width;
  const p = resolveFor(pat, opts);
  const tiles = opts.tiles || autoTiles(Math.round(width), Math.round(height));
  const state = pat.prepare(p, { width, height, tiles });
  const img = rasterize(width, height, (u, v, out, ctx) => pat.sample(u, v, out, ctx, state), { ...opts, tiles, output: 'maps' });
  return { id, ...img, params: p };
}

/**
 * Fill an arbitrary width×height area: renders ONE tile of `tileSize` px, then repeats it by
 * copying pixels (fast). Use offsetX/offsetY to shift the texture. The result is not itself
 * seamless unless width/height are multiples of tileSize — it is meant for direct display.
 */
export function renderArea(id, opts = {}) {
  const tileSize = Math.max(1, Math.round(opts.tileSize ?? 256));
  const tile = render(id, { ...opts, width: tileSize, height: tileSize, tiles: [1, 1] });
  const area = fillArea(tile, opts.width ?? tileSize, opts.height ?? opts.width ?? tileSize, opts.offsetX, opts.offsetY);
  return { id, ...area, params: tile.params, tileSize };
}

/**
 * How many fundamental features (threads, stitches, cells, dots…) one tile holds, for a param set.
 * Lets an app keep "feature size in px" constant across patterns: featurePx = tileSize / count.
 * @returns {{x:number, y:number, unit:string}}
 */
export function featureCount(id, params = {}) {
  const pat = need(id);
  const p = resolveParams(pat.params, params);
  if (pat.features) {
    const st = pat.prepare(p, { width: 512, height: 512, tiles: [1, 1] });
    const f = pat.features(p, st);
    return { x: f[0], y: f[1], unit: f[2] || 'cells' };
  }
  const n = pat.scale ? Number(p[pat.scale]) || 1 : 1;
  return { x: n, y: n, unit: 'repeats' };
}

/** Tile size in px so that one feature (see featureCount) is `featurePx` wide. */
export function tileSizeFor(id, params, featurePx) {
  return Math.max(1, Math.round(featureCount(id, params).x * featurePx));
}

/**
 * Raw sampler for custom pipelines (WebGL upload, 3D UV lookup, procedural shading…).
 * Returns fn(u, v) -> [r, g, b, a, height]: LINEAR rgb (straight alpha), u/v wrap automatically.
 * `resolution` (default 1024) tells antialiasing / level-of-detail how big a pixel is.
 * fn.into(u, v, out) writes into your own array to avoid allocation.
 */
export function createSampler(id, params = {}, { resolution = 1024, preset } = {}) {
  const pat = need(id);
  const p = resolveFor(pat, { params, preset });
  const state = pat.prepare(p, { width: resolution, height: resolution, tiles: [1, 1] });
  const out = new Float64Array(5);
  const ctx = { px: 1 / resolution, pixel: 1 / resolution, width: resolution, height: resolution, ss: 1, tileW: resolution, tileH: resolution };
  const into = (u, v, dst) => {
    u -= Math.floor(u); v -= Math.floor(v);
    out[0] = out[1] = out[2] = 0; out[3] = 1; out[4] = 0.5;
    pat.sample(u, v, out, ctx, state);
    const a = out[3], k = a > 1e-6 ? 1 / a : 0;
    dst[0] = out[0] * k; dst[1] = out[1] * k; dst[2] = out[2] * k; dst[3] = a; dst[4] = out[4];
    return dst;
  };
  const fn = (u, v) => into(u, v, [0, 0, 0, 0, 0]);
  fn.into = into;
  fn.params = p;
  return fn;
}

export { resolveParams } from './core/params.js';
export { PALETTES, parseColor, hexToLinear, linearToHex } from './core/color.js';
export { fillArea, heightToNormal, autoTiles } from './core/raster.js';
export { PRESETS } from './presets.js';
export * as noise from './core/noise.js';
export * as hash from './core/hash.js';
