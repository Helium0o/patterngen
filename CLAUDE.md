# CLAUDE.md — texturelib

Guide for Claude Code (and humans) working in or integrating this library.

## What this is
A zero-dependency ES-module library of **45 procedural, seamlessly tileable patterns** — woven
textiles, knits, textile surfaces/dyes, geometric prints and organic materials. Runs unchanged in
the browser and Node ≥ 18. Every pattern is deterministic per seed and validated by `npm test`.

## Commands
```bash
npm test                       # 330+ checks: known answers, determinism, seams, strict periodicity, fuzzing
node tools/quick.mjs <id> [size] '{"param":1}'   # render one pattern, 2×2 tiled, to scratch/<id>.png
npm run render                 # all patterns + variants + height/normal maps -> previews/
python3 tools/make-sheets.py   # contact sheets -> previews/sheets/ (needs Pillow)
npm run catalog                # regenerate PATTERNS.md + patterns.json from the code
```

## Public API (`src/index.js`)
```js
import { render, listPatterns, getPattern, defaults, createSampler } from './src/index.js';

const img = render('tartan', { width: 1024, params: { preset: 'black-watch', seed: 3 } });
// img = { width, height, data: Uint8ClampedArray RGBA, params (resolved), id }
// browser: ctx.putImageData(new ImageData(img.data, img.width, img.height), 0, 0)

render('cable-knit', { width: 512, output: 'height' });                  // grey height map
render('cable-knit', { width: 512, output: 'normal', normalStrength: 6 }); // tangent-space normal map (OpenGL +Y)
render('dots', { width: 256, supersample: 1 });                           // fast preview (default 2 = 4 samples/px)

const s = createSampler('marble', { seed: 9 });  // (u, v) -> [r, g, b, height], linear colour, any u/v (wraps)
listPatterns();      // metadata + param schemas for building UIs (no functions)
```
`patterns.json` is the same metadata as a static file; `PATTERNS.md` is the readable catalog.

## Pattern contract (read before adding/editing a pattern)
Each pattern is a plain object in `src/patterns/<category>.js`, exported in the file's default array:
```js
{
  id: 'kebab-case-unique', name: 'Human name', category: 'woven'|'knit'|'textile'|'geometric'|'organic',
  tags: [...], description: '1–2 sentences, mention the technique',
  params: { key: P.int(def, min, max, label, help), ... },  // see src/core/params.js
  prepare(p) { return state },          // p = validated params. Precompute here (colours, tables, sims).
  sample(u, v, out, ctx, state) { ... } // hot path: write out[0..2] LINEAR rgb, out[3] height 0..1
}
```
Invariants — the test suite enforces all of them:
1. **Torus domain.** `sample` must satisfy `sample(u,v) == sample(u+k, v+m)` for integers k, m.
   - Use integer repeat counts. Things that alternate (checkers, half-drop, brick, argyle) need EVEN counts → `evenInt()`.
   - Wrap every lattice/cell index with `mod(i, n)` *before* hashing (`hash01(mod(i,n), mod(j,n), seed)`).
   - Noise: only `core/noise.js` (periodic lattice; integer frequencies). Never `Math.random`, never sin-hash.
   - Rotations only via integer lattice vectors (e.g. `a*u + b*v` with integer a, b).
2. **Determinism.** All randomness from `core/hash.js` (PCG3D integer hash / mulberry32) keyed by the `seed` param.
3. **Stability.** No throws for any input (params are coerced by `resolveParams`), no NaN; clamp heights to [0,1].
4. **Linear colour.** Convert hex with `hexToLinear` once in `prepare`; mix with `mix3`/`set3`/`ramp`. The rasteriser does the sRGB encode.
5. **Antialias analytically.** Compute a signed distance `d` in **uv units** (divide cell-space distances by the repeat count) and use `coverage(d, ctx.px)`.
6. **Hot path hygiene.** No allocation in `sample` (reuse module-level scratch arrays), no string work, precompute in `prepare`.

After adding a pattern: register nothing extra (index.js spreads each file's array), then run `npm test` and `npm run catalog`.

## Layout
```
src/index.js              public API + registry
src/core/hash.js          PCG3D (Jarzynski & Olano 2020), mulberry32, string seeds
src/core/noise.js         periodic Perlin/value noise, fbm/ridged/turbulence, domain warp, periodic Worley
src/core/math.js          clamp/mod/smoothstep, SDFs (segment, star, heart), coverage()
src/core/color.js         sRGB<->linear, hex parsing, ramps, named PALETTES
src/core/params.js        schema types + resolveParams() (coerces/clamps any input)
src/core/raster.js        rasterize(): supersampling, sRGB encode, height & normal output
src/patterns/woven.js     draft-based weaving engine + 12 weaves (tartan threadcount parser, colour-and-weave)
src/patterns/knit.js      stitch engine (V/purl), stitch library, charts, cables
src/patterns/textile.js   corduroy, quilted, mesh, sequins, cross-stitch, shibori
src/patterns/geometric.js stripes … Islamic star (Hankin), terrazzo, halftone, contours, bricks
src/patterns/organic.js   noise, marble, wood, animal prints, camo, Gray–Scott, Voronoi, leather
tests/run-tests.mjs       the test suite
tools/                    quick render, render-all, contact sheets, catalog generator, PNG encoder
previews/                 rendered swatches, variants, material maps, sheets, timings.json
```

## Extension points that need no new code
- **Any weave**: `weave-draft` takes a draft string (`"1100/0110/0011/1001"`) + warp/weft colour orders with counts.
- **Any tartan**: `tartan` with `preset:'custom'` and a threadcount (`"K4 R24 K24 Y4"`, or `#rrggbb/N` tokens).
- **Any colourwork**: `fair-isle` / `cross-stitch` take a digit chart (`"0110/1001"`, digits index the palette).
- **Exported helpers**: `drafts`, `weaveState`, `weaveSample` (woven.js), `STITCHES`, `CHARTS` (knit.js), `grayScott`, `RD_PRESETS` (organic.js) to compose new patterns.

## Performance notes
512² with supersample 2 (≈1M samples): median ≈0.4 s in Node, heaviest (marble, animal prints, camo) ≈2–3.5 s; see `previews/timings.json`.
For interactive UIs: preview with `supersample: 1` at 256² (≈16× cheaper), render finals in a Web Worker,
and cache results by `id + JSON.stringify(params)`. `reaction-diffusion` cost ∝ grid² × iterations; its simulation is memoised.

## Gotchas
- Output is square-tile oriented; non-square `width/height` stretches the torus.
- `honeycomb`/`mesh(hex)` choose a row count so hexes are within a few % of regular on a square tile.
- Fabric scale is set by `repeats` / `stitchesAcross` (threads/stitches per tile), not by pixel size.
- Changing hash/noise internals changes every seeded output — treat as a breaking change.
