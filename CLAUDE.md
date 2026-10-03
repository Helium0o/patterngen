# CLAUDE.md: texturelib (repo `patterngen`)

Guide for Claude Code working **in this repo**.

- **Integrating into TypeLab?** Read [TYPELAB_INTEGRATION.md](TYPELAB_INTEGRATION.md) instead. There's an installer and a verifier; you don't need to change this repo.
- **Integrating into another app?** Read [INTEGRATION.md](INTEGRATION.md).

## What this is

A zero-dependency ES-module library of **52 procedural, seamlessly tileable patterns** (woven fabrics,
knits, textile surfaces, geometric prints, organic materials) and **123 presets**. Every pattern is a
pure function `sample(u, v)` on the unit torus, so tiles are exactly periodic and deterministic per
seed. Runs unchanged in browsers, Web Workers, Electron and Node ≥ 18.

## Commands

```bash
npm test                                   # 471 checks (must stay green). --only <id> to test one pattern
node tools/dev.mjs <category> <id> [size] '{"param":1}' [--name out]   # one pattern → scratch/<out>.png (+ -h height, -n normal); works mid-edit
node tools/quick.mjs <id> [size] '{json}' [presetId]                    # via the public API, 2×2 tiled to eyeball seams
python3 tools/sheet.py scratch/x.png [--crop 128] [--cols 4] a.png b.png  # contact sheet; --crop zooms into detail
npm run catalog                            # PATTERNS.md + patterns.json + src/patterns.d.ts (run after ANY schema/preset change)
npm run build                              # dist/* bundles (esbuild via npx) + gallery.html (run before committing dist changes)
npm run render && npm run sheets           # previews/png (ignored) → committed previews/*.jpg + previews/sheets/*.jpg
npm run typecheck                          # tsc on tests/types/usage.ts (global tsc or npx tsc)
NODE_PATH=$(npm root -g) node integrations/typelab/verify-in-typelab.mjs <typelab>/app/index.html   # adapter inside real TypeLab
```

Use the pip package `pillow` for the Python tools. Look at renders with the Read tool: always check new or changed patterns visually, at full tile and zoomed (`--crop`).

## Layout

```
src/index.js            public API: render, renderMaps, renderArea, renderRegion, listPatterns, presets, featureCount, createSampler
src/browser.js          index + canvas helpers (toCanvas, createPattern, toBlob, cssBackground) + createRenderer/serveWorker
src/renderer.js         worker pool (row bands), LRU cache, slot/AbortSignal cancellation, main-thread fallback
src/worker.js           module worker entry (dist/texturelib.worker.js is the classic one)
src/presets.js          PRESETS: { id, pattern, name, params } — every preset is validated + rendered by the tests
src/index.d.ts, browser.d.ts   hand-written types; src/patterns.d.ts is GENERATED (npm run catalog)
src/core/raster.js      rasterize(): RGSS supersampling, premultiplied RGBA accumulation, dithered sRGB encode, height/normal, tiles, rows
src/core/color.js       parseColor (hex/rgb/hsl/transparent), premultiplied linear colours, mix/shade/over/ramp, PALETTES
src/core/params.js      schema builders P.int/float/bool/enumOf/color/colors/string/seed, adv(), resolveParams() coercion
src/core/noise.js       periodic perlin/value, noiseField()/warpField() (build once!), worley, voronoiEdge (exact border distance)
src/core/hash.js        PCG3D, mulberry32, seedFromString
src/core/math.js        clamp/mod/smoothstep, coverage() AA, detail() LOD, lambert(), SDFs (segment, box, polygon, star, heart)
src/patterns/woven.js   draft engine (weaveState/weaveSample): lit yarns, floats, crimp, sheen, slubs, heather, fuzz, neps; tartan parser
src/patterns/knit.js    loop engine: curved leg/purl-bump elements over a 3×3 (4×3) stitch neighbourhood, depth rules, charts, cables
src/patterns/textile.js corduroy, velvet, quilted, mesh, sequins, cross-stitch, eyelet-lace, shibori
src/patterns/geometric.js stripes … grid-paper (analytic SDF antialiasing everywhere)
src/patterns/organic.js noise, marble, granite, wood, parquet, animal prints, snakeskin, camo, reaction-diffusion, voronoi, leather
tests/run-tests.mjs     the suite;  tests/types/  compile-only type tests
tools/                  dev/quick renders, render-all, make-sheets.py, gen-catalog, build, build-gallery, png encoder
integrations/typelab/   TypeLab adapter + install.mjs + verify-in-typelab.mjs + reference patch + screenshot
dist/                   built bundles (committed so consumers need no build step) — never edit by hand
bin/texturelib.mjs      CLI
```

## Pattern contract (v2) — read before adding/editing a pattern

```js
{
  id: 'kebab-case-unique', name: 'Human name', category: 'woven'|'knit'|'textile'|'geometric'|'organic',
  tags: [...], description: '1–2 sentences: what it is + the technique',
  scale: 'repeats',                         // the param that sets density (features per tile)
  features: (p, state) => [nx, ny, 'threads'],   // optional: exact feature count (else uses p[scale])
  params: { key: P.int(def, min, max, label, help), key2: adv(P.float(...)), ... },
  prepare(p, { width, height, tiles }) { return state },   // p = validated params. Precompute EVERYTHING here.
  sample(u, v, out, ctx, state) { ... },   // hot path, called ~1M times per 512² tile
}
```

`sample` writes into `out` (Float64Array(5), pre-filled `[0, 0, 0, 1, 0.5]`):
- `out[0..2]` = **linear** RGB, **premultiplied** by alpha · `out[3]` = alpha · `out[4]` = height 0..1 (0.5 = flat).
- Colours are 4-vectors from `hexToLinear(str)` (premultiplied). Use `shade(out, c, k)` (rgb × k, alpha copied),
  `mix(out, a, b, t)` (all 4 channels), `over(out, c, t)`, `ramp(out, stops, t)`. Never write `out[3]` = height (v1 did; v2 is alpha).
- `ctx = { px, pixel, width, height, ss, tileW, tileH }`. `px` = sub-pixel size in uv (for AA). `pixel` = output pixel in uv (for LOD).

Invariants (the suite enforces them):
1. **Torus domain.** `sample(u, v) == sample(u + k, v + m)` for integers k, m, and the tests call it with u, v outside [0, 1).
   - Integer repeat counts, even where things alternate (checkers, half-drop, brick): `evenInt()`, `multipleOf()`.
   - Wrap every cell index before hashing: `hash01(mod(i, n), mod(j, n), seed)`. Unwrapped ids (`floor(Y) * 13.7`) break periodicity.
   - Noise: only `core/noise.js` with integer frequencies. If you need a frequency like `n × 2.2`, round it to an integer and use the same integer as both the frequency and the period. `BIG` periods are allowed only inside bounded pieces (a plank, a scale), keyed by a wrapped id.
   - Rotations only via integer lattice vectors (`a*u + b*v` with integer a, b).
2. **Determinism.** Randomness only from `core/hash.js` / noise keyed by the `seed` param. No `Math.random`, no `sin`-hash.
3. **Stability.** No throws for any input (params are coerced), no NaN, alpha and height in [0, 1].
4. **Antialias analytically.** Compute a signed distance `d` in uv (divide cell-space distances by the repeat count) and use `coverage(d, ctx.px)`.
5. **Level of detail.** Multiply the amplitude of fine detail (fibres, pores, grain) by `detail(periodUV, ctx.pixel)`. For repeated structures (threads, stitches, wales), blend to the average colour when `detail(cellUV * 2, ctx.pixel) < 1`. The LOD test fails if dense patterns moiré when rendered tiny.
6. **Hot path hygiene.** No allocation in `sample` (module-level scratch arrays, `[0,0,0,0]` colours). Build noise with `noiseField()`/`warpField()` in `prepare`. Passing a fresh options object to `fbm()` per sample is slow.
7. **Light from the top-left** (`lambert(nx, ny)`, wrap lighting for fabric) so all patterns look like one set.

### Adding a pattern: checklist
1. Add the object to the right `src/patterns/<category>.js` default export (index.js picks it up).
2. `node tools/dev.mjs <cat> <id> 384`, then view it, crop-zoom it, and check small sizes (`… 96 '{"cells":64}'`).
3. Add 1–4 presets to `src/presets.js` (they're validated and rendered by the tests).
4. `npm test`, `npm run catalog`, `npm run build`, `npm run render && npm run sheets`.
5. TypeLab picks it up automatically (`tx-<id>`). Rerun the TypeLab verifier if you changed rendering or params.

## Design decisions

- Premultiplied linear RGBA internally, straight-alpha sRGB 8-bit out (ImageData/PNG layout), with deterministic per-pixel dither.
- Supersample default 2 = 4 rotated-grid (RGSS) samples. It beats a 2×2 grid on the near-axis edges textiles are full of.
- Non-square outputs contain whole square tiles (`autoTiles`), never stretched.
- Noise lattice hash is a lowbias32 mix (cheap, exact integer maths); PCG3D stays for general hashing. Changing either changes every seeded output, so treat it as a breaking visual change.
- The weave engine shades each top yarn as a cylinder whose float rises and dives (precomputed float runs from the draft). The knit engine resolves overlapping loop elements by height (max z with depth bias), not by draw order.
- Presets are data, not code: an app can list and render them without knowing pattern internals.

## Gotchas

- `honeycomb`, `mesh(hex)`, `islamic-star(6.6.6)` and `grid-paper(isometric)` fit hex rows to a square tile; hexes are within a few % of regular.
- `reaction-diffusion` runs a simulation in `prepare` (memoised by params). Keep it out of hot UI paths, or render it in a worker.
- Some param ids are generic (`shape`, `style`, `preset`). TypeLab special-cases a param called `shape`/`motif`/`logo` only when its value is `'Imported'`, which never happens here.
- After changing schemas, regenerate `src/patterns.d.ts` (`npm run catalog`) or `npm run typecheck` will drift.
