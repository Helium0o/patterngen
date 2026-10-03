// texturelib — browser entry. Everything from index.js plus DOM / canvas helpers and a worker
// renderer. Bundled as dist/texturelib.js (classic script, global `TextureLib`) and
// dist/texturelib.mjs (ES module). Safe to import in Node (helpers only touch the DOM when called).

export * from './index.js';
export { createRenderer, serveWorker } from './renderer.js';

/** Tile -> ImageData (shares the pixel buffer, no copy). */
export function toImageData(img) {
  return new ImageData(img.data, img.width, img.height);
}

/**
 * Tile -> canvas. Reuses `canvas` if given, else creates an HTMLCanvasElement (or an
 * OffscreenCanvas inside a worker).
 */
export function toCanvas(img, canvas) {
  const c = canvas || (typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(img.width, img.height));
  if (c.width !== img.width) c.width = img.width;
  if (c.height !== img.height) c.height = img.height;
  c.getContext('2d').putImageData(toImageData(img), 0, 0);
  return c;
}

/**
 * A repeating CanvasPattern from a tile, with scale / rotation (degrees) / offset applied to the
 * whole fill (the tile grid itself rotates, so it stays seamless at any angle).
 *   ctx.fillStyle = createPattern(ctx, tile, { scale: 0.5, rotation: 30 }); ctx.fillText('Hi', 0, 200);
 * `img` may also be a canvas / ImageBitmap you already have.
 */
export function createPattern(ctx, img, { scale = 1, rotation = 0, offsetX = 0, offsetY = 0, repetition = 'repeat' } = {}) {
  const src = img && img.data && !img.getContext ? toCanvas(img) : img;
  const pattern = ctx.createPattern(src, repetition);
  if (pattern && pattern.setTransform && typeof DOMMatrix !== 'undefined') {
    pattern.setTransform(new DOMMatrix().translateSelf(offsetX, offsetY).rotateSelf(rotation).scaleSelf(scale));
  }
  return pattern;
}

/** Tile -> Blob (PNG by default). Works on the main thread and in workers. */
export async function toBlob(img, type = 'image/png', quality) {
  const c = toCanvas(img, typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(img.width, img.height) : undefined);
  if (c.convertToBlob) return c.convertToBlob({ type, quality });
  return new Promise((resolve) => c.toBlob(resolve, type, quality));
}

/** Tile -> data: URL (main thread only; use toBlob in workers). */
export function toDataURL(img, type = 'image/png', quality) {
  const c = document.createElement('canvas');
  return toCanvas(img, c).toDataURL(type, quality);
}

/**
 * Tile -> CSS background, e.g. const bg = await cssBackground(tile, { size: 128 }); el.style.background = bg.css;
 * Uses an object URL; call URL.revokeObjectURL(bg.url) when you no longer need it.
 * @returns {Promise<{css: string, url: string}>}
 */
export async function cssBackground(img, { size } = {}) {
  const url = URL.createObjectURL(await toBlob(img));
  return { url, css: `url("${url}") 0 0${size ? ` / ${size}px ${size}px` : ''} repeat` };
}
