// Type declarations for the browser entry (src/browser.js = everything in index + DOM helpers +
// worker renderer). Also the types of dist/texturelib.mjs and of the global `TextureLib`.
export * from './index';
import type { PatternId, RenderOptions, Tile, Maps } from './index';

type TileLike = { width: number; height: number; data: Uint8ClampedArray };

/** Tile -> ImageData (shares the buffer). */
export function toImageData(img: TileLike): ImageData;
/** Tile -> canvas (reuses `canvas` if given; OffscreenCanvas in workers). */
export function toCanvas<C extends HTMLCanvasElement | OffscreenCanvas = HTMLCanvasElement>(img: TileLike, canvas?: C): C;
/** Repeating CanvasPattern; scale / rotation (degrees) / offset apply to the whole fill. */
export function createPattern(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  img: TileLike | CanvasImageSource,
  opts?: { scale?: number; rotation?: number; offsetX?: number; offsetY?: number; repetition?: 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat' },
): CanvasPattern | null;
export function toBlob(img: TileLike, type?: string, quality?: number): Promise<Blob>;
export function toDataURL(img: TileLike, type?: string, quality?: number): string;
export function cssBackground(img: TileLike, opts?: { size?: number }): Promise<{ css: string; url: string }>;

export interface RenderControl {
  /** A new request in the same slot cancels the previous one (slider drags). */
  slot?: string | number;
  signal?: AbortSignal;
}
export interface Renderer {
  render<I extends PatternId>(id: I, opts?: RenderOptions<I>, ctl?: RenderControl): Promise<Tile<I>>;
  renderMaps<I extends PatternId>(id: I, opts?: RenderOptions<I>, ctl?: RenderControl): Promise<Maps<I>>;
  /** Cached result or null (synchronous, never renders). */
  peek<I extends PatternId>(id: I, opts?: RenderOptions<I>): Tile<I> | null;
  clear(): void;
  terminate(): void;
  readonly workers: number;
  stats: { renders: number; cacheHits: number; workerBands: number; mainThread: number; lastMs: number };
}
/**
 * Worker-pool renderer with LRU cache. ES modules find ./worker.js automatically; with the classic
 * build pass workerUrl: '<dir>/texturelib.worker.js'. Falls back to the main thread without workers.
 */
export function createRenderer(options?: {
  workers?: number;
  workerUrl?: string | URL;
  workerType?: 'module' | 'classic';
  cacheSize?: number;
  cacheBytes?: number;
  splitAbove?: number;
}): Renderer;
/** Worker side: answers render-band requests (src/worker.js and dist/texturelib.worker.js call this). */
export function serveWorker(scope: { onmessage: unknown; postMessage(msg: unknown, transfer?: Transferable[]): void }): void;
