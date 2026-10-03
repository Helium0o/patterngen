# Integrating texturelib into an app

texturelib renders **seamless, deterministic pattern tiles** (RGBA pixels) from a pattern id and a
params object. Your app repeats the tile to fill any area. This guide covers every entry point, the
data you get back, and recipes for common targets. **TypeLab:** use the ready-made adapter described
in [TYPELAB_INTEGRATION.md](TYPELAB_INTEGRATION.md).

- [Pick an entry point](#pick-an-entry-point)
- [Core API](#core-api)
- [Scale, layout and tiling](#scale-layout-and-tiling)
- [Colours and transparency](#colours-and-transparency)
- [Building a UI from the schema](#building-a-ui-from-the-schema)
- [Recipes](#recipes): canvas, text fill, CSS, SVG, WebGL / Three.js, workers, React, Node
- [Performance](#performance)
- [Determinism and versions](#determinism-and-versions)

## Pick an entry point

| your app | use | how |
|---|---|---|
| ES modules (Vite, webpack, native `<script type="module">`, Deno, Node) | `src/index.js` (core) or `src/browser.js` (core + canvas helpers + worker renderer) | `import { render } from './texturelib/src/browser.js'` |
| Classic `<script>` tags, Electron without bundler, `importScripts` workers | `dist/texturelib.js` → global `TextureLib` | `<script src="texturelib.js"></script>` then `TextureLib.render(...)` |
| One-file ES module | `dist/texturelib.mjs` | `import * as TextureLib from './texturelib.mjs'` |
| Size-sensitive page | `dist/texturelib.min.js` (~120 KB, ~48 KB gzipped) | like `texturelib.js` |
| Not JavaScript (Python, C#, native…) | CLI | `node bin/texturelib.mjs render tartan --size 512 --preset madras --out madras.png` |

Zero dependencies. Plain ES2020. Runs in browsers, Web Workers, Electron (incl. `file://`) and
Node ≥ 18. TypeScript types: `src/index.d.ts`, `src/browser.d.ts`, generated `src/patterns.d.ts`
(per-pattern params, `PatternId` and `PresetId` unions), plus `dist/texturelib.global.d.ts` for the
global build.

Workers: ES-module builds find `src/worker.js` automatically. With the classic build, copy
`dist/texturelib.worker.js` next to `dist/texturelib.js` and pass its URL to `createRenderer`.

## Core API

```js
import { render, renderMaps, renderArea, listPatterns, listPresets, defaults,
         featureCount, tileSizeFor, createSampler } from './texturelib/src/index.js';

const tile = render('houndstooth', { width: 512, params: { band: 4, colors: ['#151515', '#f2efe6'] } });
// tile = { id, width, height, data: Uint8ClampedArray (RGBA, straight alpha, sRGB), params (resolved), tiles: [1, 1] }
```

| function | returns | notes |
|---|---|---|
| `render(id, opts)` | `Tile` | The main call. Throws only for an unknown id; any params are coerced. |
| `renderMaps(id, opts)` | `{ color, heightMap, normalMap, heights: Float32Array, … }` | All maps in one sampling pass (3D, PBR, emboss). |
| `renderArea(id, { width, height, tileSize, offsetX, offsetY, … })` | `Tile` | Renders one `tileSize` tile and repeats it by pixel copy. Fast; meant for display, not seamless itself. |
| `listPatterns()` | `PatternMeta[]` | JSON-safe: id, name, category, tags, description, **params schema**, `scaleParam`, preset ids. |
| `listPresets(patternId?)` / `getPreset(id)` | `Preset[]` | Named looks: `{ id, pattern, name, params }`. |
| `defaults(id)` | params | Resolved defaults. |
| `featureCount(id, params)` | `{ x, y, unit }` | Threads / stitches / cells per tile, for the given params. |
| `tileSizeFor(id, params, featurePx)` | px | Tile size that makes one feature `featurePx` wide. |
| `createSampler(id, params, { resolution })` | `fn(u, v) → [r, g, b, a, height]` | Raw sampler in linear colour, u/v wrap. `fn.into(u, v, out)` writes into your own array. |
| `resolveParams(schema, input)`, `parseColor`, `hexToLinear`, `linearToHex`, `fillArea`, `heightToNormal`, `noise.*`, `hash.*` | | Building blocks. |

**`opts` for render / renderMaps:**

| option | default | |
|---|---|---|
| `width`, `height` (or `size`) | 512, = width | Output px. Non-square = whole square tiles, see below. |
| `params` | `{}` | Pattern params ([PATTERNS.md](PATTERNS.md)). Invalid → clamped or default. |
| `preset` | | Preset id ([PATTERNS.md](PATTERNS.md#presets)). Its params are merged under `params`. An unknown id, or another pattern's, is **ignored** (not an error); `result.preset` tells you which preset was applied (`null` if none). Don't confuse it with ordinary params that pick a variant, such as tartan's `sett` (`'black-watch'`, `'madras-style'`, …) or reaction-diffusion's `regime`. |
| `supersample` | 2 | 1–4. 2 = 4 rotated-grid samples/px. 1 is ~4× faster for previews. |
| `output` | `'color'` | `'height'` (grey) or `'normal'` (tangent space). |
| `normalStrength`, `normalFormat` | 4, `'opengl'` | Normal maps are resolution independent. `'directx'` flips green. |
| `tiles` | auto | `[x, y]` pattern repeats inside the image. |
| `dither` | true | Hides 8-bit banding in smooth gradients. |

**Browser helpers** (`src/browser.js` / global build): `toCanvas(tile, canvas?)`, `toImageData(tile)`,
`createPattern(ctx, tile, { scale, rotation, offsetX, offsetY })`, `toBlob(tile)`, `toDataURL(tile)`,
`cssBackground(tile, { size })`, `createRenderer(options)` (worker pool + cache).

## Scale, layout and tiling

- **A tile is one period of the pattern and is always square in pattern space.** Repeat it and the seams
  are invisible. Tests check `sample(u, v) = sample(u + k, v + m)` exactly, for every pattern.
- **Two independent knobs:**
  1. **Density.** The pattern's scale param (`scaleParam` in `listPatterns()`, e.g. `repeats`, `cells`,
     `stitchesAcross`, `wales`) sets how many threads/stitches/cells a tile holds. It is always an
     integer (some must be even), so the tile stays exact.
  2. **Tile pixel size.** Render the tile at the size it will appear on screen:
     `tilePx = cssSize × devicePixelRatio`. Don't scale a small bitmap up (blurry) or a huge one down
     (wasted work).
- **Consistent feature size across patterns:** `tileSizeFor(id, params, featurePx)`, e.g. "threads
  always 6 px".
- **Non-square outputs** contain whole tiles: `render(id, { width: 1024, height: 512 })` gives 2×1
  identical tiles (`result.tiles`). Nothing is stretched. For an arbitrary area use `renderArea` or a
  CanvasPattern.
- **Rotation / offset:** rotate the fill, not the tile. `createPattern(ctx, tile, { rotation: 30 })`
  rotates the whole tile grid, so it stays seamless at any angle.
- **Small sizes don't shimmer:** fibre detail fades out below ~2 px, and whole structures (threads,
  stitches, wales) fade to their average colour below ~2 px per feature, instead of aliasing into moiré.
  So a 64 px thumbnail of a dense tweed looks like a calm tweed-coloured swatch.

## Colours and transparency

- Colour params accept `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()/rgba()`, `hsl()/hsla()` and
  `transparent`. `colors` (list) params also accept a comma-separated string.
- Blending happens in linear light with premultiplied alpha. Output `data` is sRGB with **straight
  alpha**, ready for `ImageData`, PNG and `texImage2D`.
- Transparent backgrounds give motif-only tiles to composite over anything: dots/prints `background`,
  mesh `backing` (see-through fishnet), eyelet-lace `backing` (real holes).
- Named palettes: `PALETTES` (ink, denim, autumn, ocean, woodland, desert, neon, …).

## Building a UI from the schema

`listPatterns()` gives everything needed to generate controls; no per-pattern UI code is required:

| schema `type` | control |
|---|---|
| `int` / `float` (`min`, `max`, `step`) | slider (+ number field) |
| `enum` (`options`) | select. Options may be numbers; strings like `'8'` are accepted back. |
| `bool` | toggle |
| `color` | colour picker (+ "transparent" option for background/backing) |
| `colors` (`minItems`, `maxItems`) | list of colour pickers with add/remove |
| `string` (`maxLength`) | text field (threadcounts, weave drafts, charts) |
| `seed` | number + "randomise" button (strings are hashed to a seed) |

Use `label`/`help` for UI text. Put `advanced: true` entries behind a "More" toggle. Show
`listPresets(id)` as a one-click gallery. `gallery.html` is a complete working example (open it from
disk).

## Recipes

**Fill a canvas:**
```js
import { render, createPattern } from './texturelib/src/browser.js';
const tile = render('denim', { width: 256 });
ctx.fillStyle = createPattern(ctx, tile, { scale: 1 });
ctx.fillRect(0, 0, canvas.width, canvas.height);
```

**Texture-filled text** (or any path):
```js
ctx.font = '900 200px Impact';
ctx.fillStyle = createPattern(ctx, render('sequins', { width: 256 }), { scale: 0.5, rotation: -8 });
ctx.fillText('PARTY', 40, 220);
// or: draw the text, then ctx.globalCompositeOperation = 'source-in' and fillRect with the pattern
```

**CSS background:**
```js
const bg = await cssBackground(render('gingham', { width: 128 }), { size: 64 });
el.style.background = bg.css;          // URL.revokeObjectURL(bg.url) when done
```

**SVG `<pattern>`:**
```js
const href = toDataURL(render('tartan', { width: 256 }));
svg.innerHTML = `<defs><pattern id="p" width="64" height="64" patternUnits="userSpaceOnUse">
  <image href="${href}" width="64" height="64"/></pattern></defs><rect width="100%" height="100%" fill="url(#p)"/>`;
```

**WebGL / Three.js** (the tile repeats with REPEAT wrapping):
```js
const m = renderMaps('leather', { width: 1024, normalStrength: 5 });
const tex = (data) => { const t = new THREE.DataTexture(data, m.width, m.height); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return t; };
const map = tex(m.color); map.colorSpace = THREE.SRGBColorSpace;   // colour is sRGB
const mat = new THREE.MeshStandardMaterial({ map, normalMap: tex(m.normalMap), bumpMap: tex(m.heightMap) });
mat.map.repeat.set(4, 4);   // tile rows are top-down; a DataTexture shows them mirrored vertically (harmless for seamless textures)
// raw WebGL: gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, tile.data) + GL_REPEAT
```

**Off the main thread** (worker pool, cache, cancellation):
```js
import { createRenderer, createPattern } from './texturelib/src/browser.js';
const renderer = createRenderer();      // classic build: createRenderer({ workerUrl: 'vendor/texturelib.worker.js' })
slider.oninput = async () => {
  try {
    const tile = await renderer.render('cable-knit', { width: 512, params: { crossEvery: +slider.value } }, { slot: 'preview' });
    ctx.fillStyle = createPattern(ctx, tile); ctx.fillRect(0, 0, w, h);
  } catch (e) { if (e.name !== 'AbortError') throw e; }    // superseded by a newer request in the same slot
};
```
Large tiles are split into row bands across workers. Identical requests share one render. Results are
cached (LRU). Fast drag pattern: show `render(id, { width: 128, supersample: 1 })` immediately, then
swap in the worker result.

**React hook:**
```js
function useTile(id, params, size = 256) {
  const [tile, setTile] = useState(null);
  const key = JSON.stringify(params);
  useEffect(() => {
    const ac = new AbortController();
    renderer.render(id, { width: size, params }, { signal: ac.signal }).then(setTile, () => {});
    return () => ac.abort();
  }, [id, key, size]);
  return tile;   // draw with toCanvas / createPattern
}
```

**Node / build step:**
```js
import { render } from './texturelib/src/index.js';
import { writePNG } from './texturelib/tools/png.mjs';
writePNG('denim.png', render('denim', { width: 1024 }));
```
More: `examples/node-render.mjs`, `examples/browser.html` (ES modules + workers + text fill),
`examples/classic-script.html` (global build + classic worker).

## Performance

512×512 at supersample 2, one core: median ≈0.6 s; simple geometric patterns 0.1–0.3 s; the heaviest
(giraffe, leopard, marble, leather, voronoi, reaction–diffusion) 1–3 s
(`previews/timings.json`). Rules of thumb:

- Cost ∝ pixels × supersample². Previews: `supersample: 1` at 128–256 px (16–60× cheaper than a 512 final).
- Render tiles, not areas. A 256 px tile repeated over a 4K canvas costs the same as the tile alone.
- Use `createRenderer()` in interactive apps (parallel, cached, cancellable). Cache by `id + JSON.stringify(params) + size`.
- `reaction-diffusion` cost ∝ grid² × iterations. Its simulation is memoised per process/worker.

## Determinism and versions

- Same id + params + size + options → **identical bytes** in every engine and OS. Randomness comes only
  from integer hashes keyed by the `seed` param. There is no `Math.random`, and colours don't depend on
  floating-point trig of large numbers.
- Pattern ids, param names and preset ids are the public contract. Visual output may improve between
  minor versions (CHANGELOG.md says so); a param or id rename is a major version.
