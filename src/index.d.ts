// Type declarations for texturelib's core API (src/index.js). Per-pattern param types live in the
// generated ./patterns.d.ts (npm run catalog).
import type { PatternParams, PatternId, PresetId, Category, ColorString } from './patterns';
export type { PatternParams, PatternId, PresetId, Category, ColorString };

/** Param schema entry (what listPatterns() returns per param) — enough to build a UI automatically. */
export type ParamSchema =
  | { type: 'int' | 'float'; default: number; min: number; max: number; step: number; label?: string; help?: string; advanced?: boolean }
  | { type: 'bool'; default: boolean; label?: string; help?: string; advanced?: boolean }
  | { type: 'enum'; default: string | number; options: (string | number)[]; label?: string; help?: string; advanced?: boolean }
  | { type: 'color'; default: ColorString; label?: string; help?: string; advanced?: boolean }
  | { type: 'colors'; default: ColorString[]; minItems: number; maxItems: number; label?: string; help?: string; advanced?: boolean }
  | { type: 'string'; default: string; maxLength: number; label?: string; help?: string; advanced?: boolean }
  | { type: 'seed'; default: number; label?: string; help?: string; advanced?: boolean };

export interface PatternMeta {
  id: PatternId;
  name: string;
  category: Category;
  tags: string[];
  description: string;
  /** Param that controls density (features per tile), e.g. 'repeats', 'cells', 'stitchesAcross'. */
  scaleParam: string | null;
  params: Record<string, ParamSchema>;
  /** Ids of presets for this pattern. */
  presets: PresetId[];
}

export interface Preset<I extends PatternId = PatternId> {
  id: PresetId;
  pattern: I;
  name: string;
  params: PatternParams[I];
  tags: string[];
}

export interface RenderOptions<I extends PatternId = PatternId> {
  /** Output width in px (default 512). */
  width?: number;
  /** Output height in px (default = width). Non-square outputs hold whole square tiles (e.g. 1024×512 = 2×1). */
  height?: number;
  /** Alias of width. */
  size?: number;
  params?: PatternParams[I];
  /** Preset id; its params are merged UNDER `params`. */
  preset?: PresetId;
  /** 1..4, default 2 (4 rotated-grid samples per pixel). 1 ≈ 4× faster, for previews. */
  supersample?: 1 | 2 | 3 | 4;
  output?: 'color' | 'height' | 'normal';
  /** Bump strength for output 'normal' (default 4, resolution independent). */
  normalStrength?: number;
  normalFormat?: 'opengl' | 'directx';
  /** Pattern repeats inside the image [x, y]; default: automatic (square tiles). */
  tiles?: [number, number];
  /** Ordered 8-bit dither (default true). */
  dither?: boolean;
}

/** A rendered seamless tile: RGBA bytes, straight alpha, sRGB — the layout of ImageData / PNG. */
export interface Tile<I extends PatternId = PatternId> {
  id: I;
  width: number;
  height: number;
  data: Uint8ClampedArray;
  /** The fully resolved params that were used (defaults filled in, values clamped). */
  params: Required<PatternParams[I]>;
  tiles: [number, number];
}

export interface Maps<I extends PatternId = PatternId> {
  id: I;
  width: number;
  height: number;
  params: Required<PatternParams[I]>;
  tiles: [number, number];
  color: Uint8ClampedArray;
  heightMap: Uint8ClampedArray;
  normalMap: Uint8ClampedArray;
  /** Float heights 0..1, one per pixel (for displacement). */
  heights: Float32Array;
}

export const VERSION: string;
export const CATEGORIES: Category[];
export const PATTERNS: ReadonlyArray<{ id: PatternId; name: string; category: Category; tags: string[]; description: string; scale?: string; params: Record<string, ParamSchema> }>;
export const PRESETS: ReadonlyArray<Preset>;
export const PALETTES: Record<string, ColorString[]>;

/** JSON-safe metadata of every pattern (params schema, presets) — build UIs from this. */
export function listPatterns(): PatternMeta[];
export function getPattern(id: string): (typeof PATTERNS)[number] | undefined;
/** Resolved default params of a pattern. */
export function defaults<I extends PatternId>(id: I): Required<PatternParams[I]>;
export function listPresets<I extends PatternId>(patternId?: I): Preset<I>[];
export function getPreset(id: string): Preset | undefined;

/** Render a seamless tile. Throws only for an unknown id; params are always coerced. */
export function render<I extends PatternId>(id: I, opts?: RenderOptions<I>): Tile<I>;
/** Colour + height + normal maps in one sampling pass. */
export function renderMaps<I extends PatternId>(id: I, opts?: RenderOptions<I>): Maps<I>;
/** Render one tile of `tileSize` px and repeat it over width×height (fast pixel copy). Not itself seamless. */
export function renderArea<I extends PatternId>(id: I, opts?: RenderOptions<I> & { tileSize?: number; offsetX?: number; offsetY?: number }): Tile<I> & { tileSize: number };
/** Low-level: only rows [y0, y1) (used to split work across workers). */
export function renderRegion<I extends PatternId>(id: I, opts: RenderOptions<I> & { rows: [number, number]; output?: 'color' | 'height' | 'color+height' }): Tile<I> & { color?: Uint8ClampedArray; heights?: Float32Array };

/** How many fundamental features (threads, stitches, cells…) one tile holds for these params. */
export function featureCount<I extends PatternId>(id: I, params?: PatternParams[I]): { x: number; y: number; unit: string };
/** Tile size in px so one feature is `featurePx` wide. */
export function tileSizeFor<I extends PatternId>(id: I, params: PatternParams[I] | undefined, featurePx: number): number;

export interface Sampler {
  /** LINEAR rgb (straight alpha), alpha, height; u/v wrap. */
  (u: number, v: number): [number, number, number, number, number];
  into(u: number, v: number, out: ArrayLike<number> & { [i: number]: number }): typeof out;
  params: Record<string, unknown>;
}
export function createSampler<I extends PatternId>(id: I, params?: PatternParams[I], opts?: { resolution?: number; preset?: PresetId }): Sampler;

export function resolveParams(schema: Record<string, ParamSchema>, input?: Record<string, unknown>): Record<string, unknown>;
/** Parse a CSS-like colour -> [r, g, b, a] sRGB 0..1 (straight alpha) or null. */
export function parseColor(input: unknown): [number, number, number, number] | null;
/** Colour string -> linear premultiplied [r, g, b, a]. */
export function hexToLinear(color: ColorString): [number, number, number, number];
export function linearToHex(c: ArrayLike<number>): string;
/** Repeat a tile into a width×height buffer (exact pixel copy). */
export function fillArea(tile: { width: number; height: number; data: Uint8ClampedArray }, width: number, height: number, offsetX?: number, offsetY?: number): { width: number; height: number; data: Uint8ClampedArray };
export function heightToNormal(heights: Float32Array, w: number, h: number, out: Uint8ClampedArray, strength?: number, format?: 'opengl' | 'directx', tileW?: number): Uint8ClampedArray;
export function autoTiles(width: number, height: number): [number, number];

export const noise: {
  perlin(x: number, y: number, px: number, py: number, seed: number): number;
  valueNoise(x: number, y: number, px: number, py: number, seed: number): number;
  noiseField(o?: { freq?: number; fx?: number; fy?: number; octaves?: number; gain?: number; seed?: number; basis?: 'perlin' | 'value'; mode?: 'fbm' | 'ridged' | 'turbulence'; range?: '01' | 'signed' }): (u: number, v: number) => number;
  warpField(amount: number, freq: number, seed: number, octaves?: number): (u: number, v: number, out: number[]) => number[];
  worley(u: number, v: number, n: number, m: number, seed: number, jitter: number, out: object, metric?: 0 | 1 | 2, range?: 1 | 2): object;
  voronoiEdge(u: number, v: number, n: number, m: number, seed: number, jitter: number, out: object): object;
  [k: string]: unknown;
};
export const hash: {
  pcg3(x: number, y: number, z: number, out?: Uint32Array): Uint32Array;
  hash01(x: number, y: number, seed: number): number;
  hashU32(x: number, y: number, seed: number): number;
  mulberry32(seed: number): () => number;
  seedFromString(s: string): number;
  [k: string]: unknown;
};
