# Research notes — how to make high-quality, stable, tileable patterns

Findings behind the design of texturelib, with sources. Each section ends with what the library does about it.

## 1. Seamless tiling: make the lattice periodic, don't blend edges
- Two common approaches: blend/cross-fade the edges, or make the noise **periodic** by wrapping the integer lattice
  coordinates modulo a period while keeping the true offsets for the gradient dot products. With lattice wrapping,
  opposite edges evaluate the *same* lattice samples, so the seam is exact. ([noise-lab README](https://github.com/slippylabs/noise-lab.slippylabs.com), [gamedev.net thread](https://gamedev.net/forums/topic/642794-tileable-fbm-noise/))
- Every octave must tile on its own, so octave frequencies must be integer multiples of the period (lacunarity 2, integer base frequency).
- Classic simplex noise uses a triangular lattice that does not wrap onto a square, so a square seamless simplex is not available without tricks; 4-D torus mapping works but distorts shapes. ([noise-lab README](https://github.com/slippylabs/noise-lab.slippylabs.com), [gamedev.net 3D tileable thread](https://www.gamedev.net/forums/topic/678392-how-do-i-create-tileable-3d-perlinsimplex-noise/))
- Blending-based tiling loses contrast; for *breaking up* visible repetition over large areas the state of the art is hex
  tiling with histogram-preserving blending (Heitz & Neyret, HPG 2018) and Mikkelsen's cheaper adaptation. ([JCGT 2022 Practical Real-Time Hex-Tiling](https://jcgt.org/published/0011/03/05/paper-lowres.pdf), [Unity publications](https://unity.com/publications))

**→ texturelib:** all noise in `core/noise.js` is lattice-periodic (Perlin, value, Worley) with integer frequencies; there is no simplex. Every pattern is a function on the unit torus and the tests check `f(u,v) = f(u+k, v+m)` exactly. Hex-tiling is the recommended next step if you need to cover huge areas without visible repeats.

## 2. Randomness that is identical everywhere
- The popular shader one-liner `fract(sin(dot(p,k))*43758.5453)` depends on float precision and `sin` implementations.
  Jarzynski & Olano evaluated a large set of hash functions for quality (TestU01) and GPU speed, and identified the Pareto-optimal ones, including **PCG3D**. ([JCGT 9(3) 2020](https://www.jcgt.org/published/0009/03/02/paper.pdf), [Nathan Reed's summary](https://www.reedbeta.com/blog/hash-functions-for-gpu-rendering/))
- Integer hashes can be made bit-identical across CPU and GPU. ([cone PR on integer-hashed noise](https://github.com/jondgoodwin/cone/pull/208))

**→ texturelib:** PCG3D via `Math.imul` (exact 32-bit), verified against an independent BigInt implementation in the tests, for general hashing. Noise lattices (called 4× per octave) use a cheaper lowbias32-style integer mix (Wellons, [Prospecting for Hash Functions](https://nullprogram.com/blog/2018/07/31/)), equally exact. Gradients come from a fixed 8-direction table, not `cos(hash)`, so results don't depend on the JS engine's trig.

## 3. Cellular (Worley/Voronoi) patterns
- Worley noise = distance to the n-th nearest jittered feature point; F2−F1 approximates the distance to the cell border (cobblestones, cracks, giraffe). ([Wikipedia](https://en.wikipedia.org/wiki/Worley_noise), [pythonworley](https://pypi.org/project/pythonworley))
- Space is split into cells with one point each, so only neighbouring cells are searched (3×3; Gustavson's 2×2 GPU optimisation; Quilez's exact-border and voronoise generalisations). ([The Book of Shaders ch.12](https://thebookofshaders.com/12/))
- Hard F1 ridges can be smoothed with a smooth-minimum. ([Catlike Coding](https://catlikecoding.com/unity/tutorials/pseudorandom-surfaces/voronoi-derivatives/))

**→ texturelib:** `worley()` wraps cell indices (periodic), returns F1, F2, cell id and nearest vector; 5×5 search when exact F2 matters. `voronoiEdge()` computes the exact distance to the nearest bisector (Quilez, [Voronoi edges](https://iquilezles.org/articles/voronoilines/)). F2−F1 only bounds it (edge ≥ (F2−F1)/2) and makes borders swell at corners, so giraffe, cracked earth and stained glass use the exact distance for even widths.

## 4. Woven cloth = structure × colour order
- A weave is a binary draft matrix (warp over/under per crossing); plain, twill and satin are the three fundamental structures. ([FabricGen](https://arxiv.org/pdf/2603.07240), [wave2weave](https://dl.acm.org/doi/10.1145/3736783), [Permanent Style](https://www.permanentstyle.com/2017/01/the-guide-to-cloth-weaves-and-designs.html))
- Twill (p,q): diagonal; satin: one interlacing per row/column with a shift coprime to the module (regular satin). ([Combinatorial weaving diagrams](https://arxiv.org/pdf/2108.09464), [Twill](https://en.wikipedia.org/wiki/Twill))
- Houndstooth is a *colour-and-weave* effect: 2/2 twill with 4 dark / 4 light in warp and weft; pick-and-pick uses 1/1 colour order on a 2/2 twill. ([Wikipedia](https://en.wikipedia.org/wiki/Houndstooth), [Design Pool](https://www.designpoolpatterns.com/houndstooth-definition-and-design/))
- Tartan is written as a threadcount (colour letter + thread number); symmetric setts mirror at the pivots, asymmetric ones repeat. ([Sett (tartans)](https://en.wikipedia.org/wiki/Sett_(tartans)), [How to design a tartan](https://jameshoward.us/2025/05/15/how-to-design-a-tartan), [pyTartan](https://github.com/clsn/pyTartan))

**→ texturelib:** one weave engine renders any draft with any warp/weft colour orders; tile size = lcm of all repeats so it is exact. Houndstooth, glen check, gingham, pick-and-pick and tartan are just colour orders on the right structure. Tests check the textbook definitions (plain = checkerboard, 2/2 twill = (e+p) mod 4 < 2, satin properties).

## 5. Knits
- Jersey/stockinette shows V-shaped loops on the face; rib alternates knit and purl wales (1×1, 2×2); cables cross groups of loops. ([Knitwear glossary](https://youtricot.com/knitwear-stitch-types-glossary/), [Ribbing](https://en.wikipedia.org/wiki/Ribbing_(knitting)))
- Garter, seed/moss, basketweave are pure knit/purl arrangements. ([Studio Knit](https://www.studioknitsf.com/stitch-patterns-beginner/))

- Yarn-level knit models represent each loop as curved yarn segments that pass through the loop below (Kaldor, James & Marschner, *Simulating Knitted Cloth at the Yarn Level*, SIGGRAPH 2008). On the face side each stitch shows two legs (a "V") whose lower ends cover the head of the loop below; on the back the heads and sinker loops show as bumps.

**→ texturelib:** stitch grid with real gauge (stitches wider than tall). Every visible yarn piece is an element (a curved ellipse with a dome profile): two legs per knit stitch, a head (∩) and a sinker (∪) bump per purl stitch. Elements from the 4×3 neighbouring stitches are tested and the highest wins, so loops interlock across cell borders like real yarn. Depth rules follow real fabric: purl columns recede in ribs, purl rows stand out in garter. Cables are 2-stitch-wide stockinette strands on S-curves with straight runs, front/back depth and cast shadows.

## 6. Print repeats (surface pattern design)
- Standard repeat structures: block, half-drop (most common for printed fabric), brick, mirror, diamond, ogee, tossed. ([PatternWeaver guide](https://patternweaver.ai/blog/pattern-repeat-types/), [The Pattern Cloud](https://www.thepatterncloud.com/post/surface-pattern-design), [Study.com](https://study.com/academy/lesson/types-of-repeats-in-textile-designing.html))

**→ texturelib:** `dots` implements block / half-drop / brick / tossed (non-overlapping jitter) for any motif; `ogee` uses an exact two-family tiling (sin²(πy)+cos²(πy)=1).

## 7. Geometric ornament
- Islamic star patterns via Hankin's *polygons-in-contact*: rays leave each edge midpoint at a contact angle θ and meet inside the tile. ([Kaplan 2005](https://cs.uwaterloo.ca/~csk/publications/Papers/kaplan_2005.pdf))
- Truchet/Smith tiles: quarter-circle tiles that form continuous curves and are two-colourable; multi-scale variants exist. ([Truchet tile](https://en.wikipedia.org/wiki/Truchet_tile), [Carlson, Bridges 2018](http://www.archive.bridgesmathart.org/2018/bridges2018-39.pdf))

**→ texturelib:** Hankin on 4.8.8 (8-point stars) and square tilings; Smith tiles with the derived colouring rule `inside ⊕ orientation ⊕ (i+j) parity`.

## 8. Reaction–diffusion
- Gray–Scott: two species, feed f and kill k select spots, stripes, mazes, coral, etc.; patterns are very sensitive to (f, k). ([biologicalmodeling.org](https://biologicalmodeling.org/prologue/gray-scott), [ShareTechNote](https://www.sharetechnote.com/html/WebProgramming/Websim_ReactionDiffusion.html), [arXiv 2606.12997 Table 4](https://arxiv.org/pdf/2606.12997))

**→ texturelib:** periodic-boundary simulation (so it tiles), seeded initial blobs, presets verified visually: coral, mitosis, maze, spots, worms, holes.

## 9. Shading cloth
- Woven cloth appearance is dominated by yarn geometry: each visible float is a curved cylinder whose highlight runs along the fibres (anisotropic). See Irawan & Marschner, *Specular Reflection from Woven Cloth* (ACM TOG 2012), and the Kajiya–Kay anisotropic model (SIGGRAPH 1989) for fibre highlights.

**→ texturelib:** each top yarn is a cylinder across its width and rises and dives along its float (float runs precomputed from the draft). It is lit with wrap lighting from the top-left plus an anisotropic sheen term (Blinn half-vector on the cylinder normal). Satin/silk raise the sheen. Twisted-fibre striations, slubs (thickness varying along the yarn) and heather (multi-tone fibres) add the rest.

## 10. Antialiasing procedural textures
- Procedural detail finer than a pixel aliases. The classic remedy is to clamp or fade frequencies above the pixel's Nyquist limit and replace them with their average (Ebert et al., *Texturing & Modeling: A Procedural Approach*, "antialiasing" chapter; Quilez, [filtering procedurals](https://iquilezles.org/articles/filtering/)).
- Rotated-grid supersampling (RGSS) gives better edge quality than an ordered 2×2 grid for the same 4 samples on near-horizontal and near-vertical edges (Akenine-Möller et al., *Real-Time Rendering*).
- Compositing and filtering are correct on premultiplied colours (Porter & Duff, *Compositing Digital Images*, 1984). 8-bit quantisation of smooth gradients bands unless dithered.

**→ texturelib:** `ctx.pixel` + `detail(period, pixel)` fades detail amplitude between ~4 px and ~1.7 px per period. Fabrics also fade whole thread/stitch/wale structures to their average colour, which the tests check on tiny dense renders. Edges use analytic signed-distance coverage. The rasteriser averages premultiplied linear RGBA over 4 RGSS samples, then un-premultiplies, sRGB-encodes and applies a deterministic ±½ LSB dither.

## Not included (and why)
- **Paisley / detailed florals / figurative motifs**: they need authored vector motifs. `dots` offers simple flowers, leaves, teardrops (a paisley body) and moons in textile repeat layouts; supply your own SDF for anything more complex.
- **Simplex noise** — doesn't tile on a square lattice (see §1).
- **GLSL versions** — the design (integer hash, periodic lattice, no sin-hash) ports directly, but no shader code is shipped because it couldn't be GPU-tested here.
