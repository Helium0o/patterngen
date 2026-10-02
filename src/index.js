// texturelib — public API.
//
//   import { render, listPatterns, getPattern, createSampler } from './src/index.js';
//   const img = render('houndstooth', { width: 512, params: { band: 4, seed: 7 } });
//   ctx.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);   // browser
//
// Every pattern: { id, name, category, tags, description, params (schema), prepare(p) -> state,
// sample(u, v, out, ctx, state) }. See CLAUDE.md for the contract.

import woven from './patterns/woven.js';
import knit from './patterns/knit.js';
import geometric from './patterns/geometric.js';
import organic from './patterns/organic.js';
import textile from './patterns/textile.js';
import { resolveParams } from './core/params.js';
import { rasterize } from './core/raster.js';

export const PATTERNS = [...woven, ...knit, ...textile, ...geometric, ...organic];
const BY_ID = new Map(PATTERNS.map((p) => [p.id, p]));
if (BY_ID.size !== PATTERNS.length) throw new Error('texturelib: duplicate pattern id');

export const CATEGORIES = ['woven', 'knit', 'textile', 'geometric', 'organic'];

/** @returns pattern definition or undefined */
export const getPattern = (id) => BY_ID.get(id);

/** Lightweight metadata for UIs (no functions). */
export function listPatterns() {
  return PATTERNS.map(({ id, name, category, tags, description, params }) => ({ id, name, category, tags, description, params }));
}

/** Default params for a pattern. */
export function defaults(id) {
  const pat = BY_ID.get(id);
  if (!pat) throw new Error(`texturelib: unknown pattern "${id}"`);
  return resolveParams(pat.params, {});
}

/**
 * Get a raw sampler for custom pipelines (WebGL upload, 3D UV lookup, physics bodies...).
 * Returned fn(u, v) -> [r, g, b, height] in LINEAR colour. u,v wrap automatically.
 */
export function createSampler(id, params = {}) {
  const pat = BY_ID.get(id);
  if (!pat) throw new Error(`texturelib: unknown pattern "${id}"`);
  const p = resolveParams(pat.params, params);
  const state = pat.prepare(p);
  const out = new Float64Array(4);
  const ctx = { px: 1 / 1024, width: 1024, height: 1024, ss: 1 };
  return (u, v) => {
    u -= Math.floor(u); v -= Math.floor(v);
    out[0] = out[1] = out[2] = 0; out[3] = 0.5;
    pat.sample(u, v, out, ctx, state);
    return [out[0], out[1], out[2], out[3]];
  };
}

/**
 * Render a seamless tile.
 * @param {string} id
 * @param {{width?:number, height?:number, params?:object, supersample?:1|2|3|4, output?:'color'|'height'|'normal', normalStrength?:number}} [opts]
 * @returns {{width:number, height:number, data:Uint8ClampedArray, params:object, id:string}}
 */
export function render(id, opts = {}) {
  const pat = BY_ID.get(id);
  if (!pat) throw new Error(`texturelib: unknown pattern "${id}"`);
  const width = opts.width ?? 512;
  const height = opts.height ?? width;
  const p = resolveParams(pat.params, opts.params || {});
  const state = pat.prepare(p, { width, height });
  const img = rasterize(width, height, (u, v, out, ctx) => pat.sample(u, v, out, ctx, state), opts);
  return { ...img, params: p, id };
}

export { resolveParams } from './core/params.js';
export { PALETTES, hexToLinear, linearToHex } from './core/color.js';
export * as noise from './core/noise.js';
export * as hash from './core/hash.js';
