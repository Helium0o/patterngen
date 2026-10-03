// EXAMPLE: one prototype idea (ideas/prototypes.mjs → 'hitomezashi') turned into a complete library pattern
// that follows the contract in CLAUDE.md. It was verified by temporarily adding it to src/patterns/geometric.js
// and running `npm test -- --only hitomezashi` (periodicity, seams, determinism, fuzzing, LOD) — all green.
//
// To ship it: paste the object into src/patterns/geometric.js (imports there already cover these names),
// add it to that file's default export array, add 1–4 presets to src/presets.js, then run
// npm test && npm run catalog && npm run build && npm run render && npm run sheets.
// After rerunning integrations/typelab/install.mjs, TypeLab shows it as `tx-hitomezashi` automatically.
//
// The imports below make this file importable on its own (e.g. from a quick script):
//   import hitomezashi from './ideas/examples/hitomezashi.js'
import { P, adv } from '../../src/core/params.js';
import { hexToLinear, mix, shade } from '../../src/core/color.js';
import { hashU32 } from '../../src/core/hash.js';
import { clamp01, coverage, detail, evenInt, fract, mod, TAU } from '../../src/core/math.js';

const _c = [0, 0, 0, 0], _avg = [0, 0, 0, 0];
const VOWELS = /[aeiouy]/i;

const hitomezashi = {
  id: 'hitomezashi', name: 'Hitomezashi sashiko', category: 'geometric', scale: 'cells',
  tags: ['japanese', 'sashiko', 'embroidery', 'stitch', 'generative', 'maze'],
  description: 'Japanese running-stitch embroidery: one bit per row and per column decides where each line of stitches starts. Regions are two-tone by crossing parity. Rows can be spelled from text.',
  features: (p, s) => [s.n, s.n, 'stitches'],
  params: {
    cells: P.int(20, 2, 128, 'Stitches across (even)', 'Grid size; rounded to an even number so the two-tone fill closes on the torus.'),
    density: P.float(0.5, 0, 1, 'Offset density', 'Chance that a row or column starts with a gap instead of a stitch.'),
    text: P.string('', 'Text (optional)', 'Spell the rows: vowel = 1, other letters = 0 (repeats to fill). Columns use the text reversed.', 200),
    stitch: P.float(0.76, 0.3, 1, 'Stitch length', 'Fraction of the cell each stitch covers (1 = continuous lines).'),
    thread: adv(P.float(0.075, 0.02, 0.2, 'Thread width (cell units)')),
    twoTone: P.bool(true, 'Two-tone regions'),
    background: P.color('#1f2f56', 'Fabric'),
    regionColor: P.color('#2b4170', 'Second tone'),
    threadColor: P.color('#f3efe6', 'Thread'),
    seed: P.seed(11),
  },
  prepare(p) {
    const n = evenInt(p.cells);
    const letters = (p.text || '').replace(/[^a-z]/gi, '');
    const bitsFrom = (axis) => {
      const b = new Uint8Array(n + 1);
      for (let k = 0; k < n; k++) {
        if (letters) { const ch = axis ? letters[letters.length - 1 - (k % letters.length)] : letters[k % letters.length]; b[k] = VOWELS.test(ch) ? 1 : 0; }
        else b[k] = (hashU32(k, axis + 1, p.seed) >>> 8) / 16777216 < p.density ? 1 : 0;
      }
      // the 2-colouring closes on a torus only if every row/column loop crosses an even number of lines:
      // with n even that means an even count of 0-bits; flip the last bit if needed
      let zeros = 0; for (let k = 0; k < n; k++) zeros += b[k] === 0 ? 1 : 0;
      if (zeros & 1) b[n - 1] ^= 1;
      b[n] = b[0];
      return b;
    };
    const b = bitsFrom(0), c = bitsFrom(1);
    // region parity: walk row 0 to column i (crossing vertical lines), then up column i (crossing horizontal ones)
    const xv = new Uint8Array(n + 1), p0 = new Uint8Array(n + 1), p1 = new Uint8Array(n + 1);
    for (let i = 1; i <= n; i++) xv[i] = xv[i - 1] ^ (c[i] === 0 ? 1 : 0);
    for (let j = 1; j <= n; j++) { p0[j] = p0[j - 1] ^ (b[j] === 0 ? 1 : 0); p1[j] = p1[j - 1] ^ (b[j] === 1 ? 1 : 0); }
    const bg = hexToLinear(p.background), bg2 = hexToLinear(p.twoTone ? p.regionColor : p.background), th = hexToLinear(p.threadColor);
    const lo = (1 - p.stitch) / 2, hi = 1 - lo, r = p.thread;
    // average colour for the LOD fade: each cell owns 2 edges, each carries a stitch half the time → 1 stitch per cell
    const threadArea = clamp01(p.stitch * 2 * r + Math.PI * r * r);
    mix(_avg, bg, bg2, 0.5);
    const avg = [0, 0, 0, 0]; mix(avg, _avg, th, threadArea * 0.9);
    return { n, b, c, xv, p0, p1, bg, bg2, th, lo, hi, r, avg, p };
  },
  sample(u, v, out, ctx, s) {
    const n = s.n, X = u * n, Y = v * n;
    const i = mod(Math.floor(X), n), j = mod(Math.floor(Y), n), fx = fract(X), fy = fract(Y);
    const parity = s.xv[i] ^ (i % 2 === 0 ? s.p0[j] : s.p1[j]);
    // fabric with a faint plain-weave texture that fades out when it gets below a pixel
    const weave = 0.05 * detail(1 / (n * 8), ctx.pixel);
    shade(out, parity ? s.bg2 : s.bg, 1 - weave * 0.5 + weave * Math.sin(TAU * X * 8) * Math.sin(TAU * Y * 8));
    // distance to the nearest stitch: capsules on the 4 cell edges that carry one
    const lo = s.lo, hi = s.hi, b = s.b, c = s.c;
    const seg = (along, d) => Math.hypot(Math.max(lo - along, along - hi, 0), d);
    let d = 9;
    if ((i + b[j]) % 2 === 0) d = Math.min(d, seg(fx, fy));
    if ((i + b[j + 1]) % 2 === 0) d = Math.min(d, seg(fx, 1 - fy));
    if ((j + c[i]) % 2 === 0) d = Math.min(d, seg(fy, fx));
    if ((j + c[i + 1]) % 2 === 0) d = Math.min(d, seg(fy, 1 - fx));
    const q = clamp01(d / s.r);
    shade(_c, s.th, 0.6 + 0.4 * Math.sqrt(1 - q * q)); // round thread, lit across its width
    mix(out, out, _c, coverage((d - s.r) / n, ctx.px));
    out[4] = 0.5 + 0.3 * coverage((d - s.r) / n, ctx.px) * Math.sqrt(1 - q * q);
    // level of detail: when a cell gets near a pixel, fade the whole structure to its average colour
    const lod = detail(2 / n, ctx.pixel);
    if (lod < 1) { mix(out, s.avg, out, lod); out[4] = 0.5 + (out[4] - 0.5) * lod; }
  },
};

export default hitomezashi;
