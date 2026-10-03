# ideas/: prototypes of patterns that are not in the library yet

Start with [../TYPELAB_HANDOFF.md](../TYPELAB_HANDOFF.md). It explains every idea, its formula, what
each prototype still needs, and the order to build them in.

| file | what |
|---|---|
| `prototypes.mjs` | 23 working prototypes (knit, crochet, weave, sashiko, ornament, formulas, metals, fur, caustics) using the library's engines |
| `knit-eyelet.patch` | knit-engine change: stitch kind `'o'` = eyelet with a transparent hole. `git apply ideas/knit-eyelet.patch`; `npm test` stays green. |
| `knit-lace-proto.js` | `src/patterns/knit.js` with that patch applied, plus prototype `lace-knit` and `brioche` patterns (imported by prototypes.mjs) |
| `examples/hitomezashi.js` | a prototype finished as a real library pattern (params, LOD, alpha, text input): the template for new patterns |
| `typelab/text-to-fabric.js` | TypeLab-side helpers: knit or weave the user's text with today's `tx-fair-isle` / `tx-weave-draft` |
| `typelab/vector-hitomezashi.js` | the same idea as a native TypeLab vector generator (SVG export) |
| `make-sheets.py` | `ideas/out/*.png` → `renders/*.jpg` + 3 titled sheets in `sheets/` (needs Pillow) |
| `renders/`, `sheets/` | committed previews. The `typelab-*.jpg` renders came from inside TypeLab (headless Chromium), not from make-sheets.py. |

```bash
node ideas/prototypes.mjs                 # render all into ideas/out/ (git-ignored), ~12 s
node ideas/prototypes.mjs damask ikat     # render some
node ideas/prototypes.mjs --check         # exact torus test: sample(u, v) == sample(u + k, v + m), finite, alpha/height in range
python3 ideas/make-sheets.py
```

Nothing in this folder is loaded by `src/`, the tests or the bundles.
