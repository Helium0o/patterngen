// Woven textiles.
//
// Model (standard textile CAD): a weave structure is a binary DRAFT matrix up[pick][end]
// (1 = warp thread on top at that crossing). Colour comes from the warp colour order (per end)
// and weft colour order (per pick). Pattern = structure × colour order. That single model gives
// plain, twill, satin, basket, herringbone AND colour-and-weave effects like houndstooth,
// pick-and-pick and glen check, plus tartan from a threadcount.
//
// Tiling: ends/picks per tile = lcm(draft repeat, colour repeat) × repeats, so tiles are exact.
// Styles: 'fabric' (shaded yarns + height), 'flat' (pure colour per crossing — for prints,
// pixel art, embroidery/knit charts) and 'draft' (black/white weave draft, as weavers read it).

import { P } from '../core/params.js';
import { hexToLinear, mix3, set3 } from '../core/color.js';
import { hash01 } from '../core/hash.js';
import { clamp01, lcm, smoothstep, TAU, mod, gcd } from '../core/math.js';
import { fbm } from '../core/noise.js';

// ---------- draft generators (pure; return function up(pick, end) -> 0|1 plus repeat size) ----------

export const drafts = {
  plain: () => ({ w: 2, h: 2, up: (p, e) => (p + e) & 1 ^ 1 }),
  /** p/q twill: p ends up, q down, stepping one end per pick. dir 'Z' rises to the right, 'S' to the left. */
  twill: (p = 2, q = 2, dir = 'Z') => {
    const n = p + q;
    return { w: n, h: n, up: (pk, e) => (mod(e + (dir === 'Z' ? pk : -pk), n) < p ? 1 : 0) };
  },
  /** Regular satin of n shafts, move a (gcd(a,n)=1, 1<a<n-1). face 'warp' = warp floats on top. */
  satin: (n = 5, face = 'warp') => {
    let a = 2;
    while (a < n - 1 && gcd(a, n) !== 1) a++;
    return { w: n, h: n, up: (pk, e) => { const hit = mod(e - a * pk, n) === 0; return face === 'warp' ? (hit ? 0 : 1) : hit ? 1 : 0; } };
  },
  basket: (k = 2) => ({ w: 2 * k, h: 2 * k, up: (p, e) => ((Math.floor(e / k) + Math.floor(p / k)) & 1 ? 0 : 1) }),
  /** Herringbone: 2/2 twill whose direction mirrors every `k` ends. */
  herringbone: (k = 8) => ({
    w: 2 * k, h: 4,
    up: (p, e) => {
      const ee = e < k ? e : 2 * k - 1 - e; // reflect the second band so the zig meets the zag
      return mod(ee + p, 4) < 2 ? 1 : 0;
    },
  }),
  /** Parse "1100/0110/0011/1001" (rows = picks, '1','x','#' = warp up). */
  parse: (str) => {
    const rows = String(str).split(/[\/\n,;|]+/).map((r) => r.trim()).filter(Boolean);
    if (!rows.length) return drafts.plain();
    const w = Math.max(...rows.map((r) => r.length));
    const grid = rows.map((r) => Array.from({ length: w }, (_, i) => (/[1x#X]/.test(r[i] || '0') ? 1 : 0)));
    return { w, h: rows.length, up: (p, e) => grid[mod(p, rows.length)][mod(e, w)] };
  },
};

// ---------- shared weave renderer ----------

const COMMON = {
  style: P.enumOf('fabric', ['fabric', 'flat', 'draft'], 'Style', 'fabric = shaded yarns; flat = solid colour per crossing; draft = B/W weave draft'),
  repeats: P.int(4, 1, 64, 'Repeats', 'Pattern repeats across the tile (integer keeps it seamless).'),
  yarnGap: P.float(0.12, 0, 0.5, 'Yarn gap', 'Fraction of each thread cell left as gap between yarns.'),
  irregularity: P.float(0.35, 0, 1, 'Irregularity', 'Per-yarn tone variation (slubs).'),
  twist: P.float(0.5, 0, 1, 'Fibre twist', 'Strength of the diagonal fibre striation.'),
  seed: P.seed(1),
};

/**
 * Build sampler state.
 * @param draft   {w,h,up}
 * @param warpSeq array of linear colours, one per end in the colour repeat
 * @param weftSeq array of linear colours, one per pick in the colour repeat
 */
export function weaveState(draft, warpSeq, weftSeq, p, extra = {}) {
  const repE = lcm(draft.w, warpSeq.length);
  const repP = lcm(draft.h, weftSeq.length);
  // Balanced cloth: same thread count both ways so yarn cells are square on a square tile.
  const N = lcm(repE, repP) * p.repeats;
  const E = N, Pk = N;
  // Precompute the draft repeat into a flat array (fast lookups in the hot loop).
  const up = new Uint8Array(draft.w * draft.h);
  for (let y = 0; y < draft.h; y++) for (let x = 0; x < draft.w; x++) up[y * draft.w + x] = draft.up(y, x) ? 1 : 0;
  return { E, Pk, dw: draft.w, dh: draft.h, up, warpSeq, weftSeq, p, ...extra };
}

const DARK = hexToLinear('#1a1a1a'), LIGHT = hexToLinear('#f3f1ea');
const _c = [0, 0, 0];

export function weaveSample(u, v, out, ctx, s) {
  const x = u * s.E, y = v * s.Pk;
  const fx = x - Math.floor(x), fy = y - Math.floor(y);
  const e = mod(Math.floor(x), s.E), pk = mod(Math.floor(y), s.Pk); // wrapped: exact periodicity
  const isUp = (pp, ee) => s.up[mod(pp, s.dh) * s.dw + mod(ee, s.dw)];
  const warpUp = isUp(pk, e);
  const warpC = s.warpColor ? s.warpColor(e, pk, u, v) : s.warpSeq[mod(e, s.warpSeq.length)];
  const weftC = s.weftColor ? s.weftColor(pk, e, u, v) : s.weftSeq[mod(pk, s.weftSeq.length)];
  const p = s.p;

  if (p.style === 'draft') { set3(out, warpUp ? DARK : LIGHT); out[3] = warpUp ? 0.7 : 0.3; return; }
  if (p.style === 'flat') { set3(out, warpUp ? warpC : weftC); out[3] = 0.5; return; }

  // fabric: the top yarn runs along y (warp) or x (weft).
  const across = warpUp ? fx : fy;           // coordinate across the visible yarn
  const along = warpUp ? fy : fx;            // coordinate along it
  const a = Math.abs(across - 0.5) * 2 / Math.max(1e-3, 1 - p.yarnGap);
  if (a >= 1) {
    // gap: we see the crossing yarn underneath, in shadow
    set3(out, warpUp ? weftC : warpC, 0.28);
    out[3] = 0.15;
    return;
  }
  const profile = Math.sqrt(1 - a * a);
  // float ends: yarn dives under where the neighbouring crossing is not also on top
  const prevSame = warpUp ? isUp(pk - 1, e) === 1 : isUp(pk, e - 1) === 0;
  const nextSame = warpUp ? isUp(pk + 1, e) === 1 : isUp(pk, e + 1) === 0;
  const t0 = prevSame ? 1 : smoothstep(0, 0.32, along);
  const t1 = nextSame ? 1 : smoothstep(0, 0.32, 1 - along);
  const dive = t0 * t1;
  // fibre twist striation + per-yarn slub tone
  const tw = 1 - p.twist * 0.18 * (0.5 + 0.5 * Math.sin(TAU * (along * 3 + across * 1.2 * (warpUp ? 1 : -1))));
  const yarnId = warpUp ? e : pk + 7919;
  const slub = 1 + (hash01(yarnId, warpUp ? 1 : 2, p.seed) - 0.5) * 0.3 * p.irregularity
    + (hash01(e, pk, p.seed ^ 0x55) - 0.5) * 0.08 * p.irregularity;
  const shade = (0.38 + 0.62 * profile) * (0.45 + 0.55 * dive) * tw * slub;
  set3(out, warpUp ? warpC : weftC, shade);
  out[3] = 0.25 + 0.75 * profile * (0.3 + 0.7 * dive);
}

const lin = (arr) => arr.map(hexToLinear);
const expandOrder = (colors, counts) => {
  const seq = [];
  colors.forEach((c, i) => { for (let k = 0; k < counts[i % counts.length]; k++) seq.push(c); });
  return seq;
};

// ---------- patterns ----------

const plain = {
  id: 'plain-weave', name: 'Plain weave (tabby)', category: 'woven',
  tags: ['clothes', 'cotton', 'shirting', 'canvas'],
  description: '1/1 over-under: the base of poplin, canvas, chambray. Different warp/weft colours give a chambray/iridescent look.',
  params: { ...COMMON, repeats: P.int(16, 1, 128, 'Repeats'), warp: P.color('#3d5a80', 'Warp colour'), weft: P.color('#e0e6ee', 'Weft colour') },
  prepare: (p) => weaveState(drafts.plain(), [hexToLinear(p.warp)], [hexToLinear(p.weft)], p),
  sample: weaveSample,
};

const twill = {
  id: 'twill', name: 'Twill', category: 'woven',
  tags: ['clothes', 'denim', 'gabardine', 'chino', 'suiting'],
  description: 'Diagonal-rib weave. 2/2 = gabardine/serge, 3/1 = denim/drill. S or Z diagonal.',
  params: {
    ...COMMON, repeats: P.int(8, 1, 64, 'Repeats'),
    over: P.int(2, 1, 6, 'Over (warp up)'), under: P.int(2, 1, 6, 'Under (warp down)'),
    direction: P.enumOf('Z', ['Z', 'S'], 'Diagonal'),
    warp: P.color('#4a3f35', 'Warp colour'), weft: P.color('#b9a88f', 'Weft colour'),
  },
  prepare: (p) => weaveState(drafts.twill(p.over, p.under, p.direction), [hexToLinear(p.warp)], [hexToLinear(p.weft)], p),
  sample: weaveSample,
};

const satin = {
  id: 'satin', name: 'Satin', category: 'woven',
  tags: ['clothes', 'silk', 'lining', 'luxury'],
  description: 'Long floats, scattered interlacings: smooth lustrous face. Regular satin needs a move number coprime to the shaft count, so 6 shafts is not offered.',
  params: {
    ...COMMON, repeats: P.int(6, 1, 64, 'Repeats'), yarnGap: P.float(0.04, 0, 0.5, 'Yarn gap'),
    shafts: P.enumOf(5, [5, 7, 8, 10, 12], 'Shafts'), face: P.enumOf('warp', ['warp', 'weft'], 'Face'),
    warp: P.color('#7b1e3a', 'Warp colour'), weft: P.color('#3a0f1e', 'Weft colour'),
  },
  prepare: (p) => weaveState(drafts.satin(Number(p.shafts), p.face), [hexToLinear(p.warp)], [hexToLinear(p.weft)], p),
  sample: weaveSample,
};

const basket = {
  id: 'basket-weave', name: 'Basket / hopsack', category: 'woven',
  tags: ['clothes', 'oxford', 'hopsack', 'upholstery'],
  description: 'Plain weave with k threads acting as one (2 = hopsack / oxford-like).',
  params: { ...COMMON, repeats: P.int(6, 1, 64, 'Repeats'), group: P.int(2, 2, 6, 'Threads per group'), warp: P.color('#e7dcc5', 'Warp'), weft: P.color('#8a9a7b', 'Weft') },
  prepare: (p) => weaveState(drafts.basket(p.group), [hexToLinear(p.warp)], [hexToLinear(p.weft)], p),
  sample: weaveSample,
};

const herring = {
  id: 'herringbone', name: 'Herringbone twill', category: 'woven',
  tags: ['clothes', 'tweed', 'coat', 'suiting'],
  description: '2/2 twill whose diagonal reverses every N ends, giving the broken-zigzag "fish bone".',
  params: { ...COMMON, repeats: P.int(3, 1, 32, 'Repeats'), band: P.int(8, 2, 32, 'Ends per band'), warp: P.color('#2b2b2b', 'Warp'), weft: P.color('#cfc8b8', 'Weft') },
  prepare: (p) => weaveState(drafts.herringbone(p.band), [hexToLinear(p.warp)], [hexToLinear(p.weft)], p),
  sample: weaveSample,
};

const houndstooth = {
  id: 'houndstooth', name: 'Houndstooth', category: 'woven',
  tags: ['clothes', 'tweed', 'check', 'classic', 'print'],
  description: 'Colour-and-weave effect: 2/2 twill with 4 dark / 4 light in both warp and weft (Wikipedia, Permanent Style). Band 2 = puppytooth.',
  params: { ...COMMON, repeats: P.int(4, 1, 32, 'Repeats'), band: P.int(4, 1, 16, 'Threads per colour band'), colors: P.colors(['#151515', '#f2efe6'], 'Dark, light', '', 2, 2) },
  prepare: (p) => {
    const seq = expandOrder(lin(p.colors), [p.band, p.band]);
    return weaveState(drafts.twill(2, 2, 'Z'), seq, seq, p);
  },
  sample: weaveSample,
};

const pickpick = {
  id: 'pick-and-pick', name: 'Pick-and-pick / sharkskin', category: 'woven',
  tags: ['clothes', 'suiting'],
  description: '2/2 twill with alternating 1 dark / 1 light warp and weft — the stepped sharkskin texture.',
  params: { ...COMMON, repeats: P.int(12, 1, 64, 'Repeats'), colors: P.colors(['#2d3440', '#a9b1bc'], 'Dark, light', '', 2, 2) },
  prepare: (p) => { const seq = lin(p.colors); return weaveState(drafts.twill(2, 2, 'Z'), seq, seq, p); },
  sample: weaveSample,
};

const glen = {
  id: 'glen-check', name: 'Glen check / Prince of Wales', category: 'woven',
  tags: ['clothes', 'suiting', 'check', 'classic'],
  description: '2/2 twill alternating a houndstooth block (4&4) with a hairline block (2&2) in warp and weft; optional coloured overcheck.',
  params: {
    ...COMMON, repeats: P.int(2, 1, 16, 'Repeats'),
    colors: P.colors(['#1f1f1f', '#ece8dd'], 'Dark, light', '', 2, 2),
    overcheck: P.bool(true, 'Overcheck'), overcheckColor: P.color('#2f5e9e', 'Overcheck colour'),
  },
  prepare: (p) => {
    const [d, l] = lin(p.colors);
    const seq = [...expandOrder([d, l], [4, 4]), ...expandOrder([d, l], [4, 4]), ...expandOrder([d, l, d, l, d, l, d, l], [2])];
    if (p.overcheck) { const o = hexToLinear(p.overcheckColor); seq[16] = o; seq[17] = o; }
    return weaveState(drafts.twill(2, 2, 'Z'), seq, seq, p);
  },
  sample: weaveSample,
};

const gingham = {
  id: 'gingham', name: 'Gingham', category: 'woven',
  tags: ['clothes', 'shirt', 'picnic', 'check'],
  description: 'Plain weave, equal coloured and white bands in warp and weft. Use style=flat at small sizes for a print-style check.',
  params: { ...COMMON, repeats: P.int(4, 1, 32, 'Repeats'), band: P.int(6, 1, 32, 'Threads per band'), colors: P.colors(['#c8102e', '#ffffff'], 'Colour, ground', '', 2, 2) },
  prepare: (p) => { const seq = expandOrder(lin(p.colors), [p.band, p.band]); return weaveState(drafts.plain(), seq, seq, p); },
  sample: weaveSample,
};

// Tartan --------------------------------------------------------------------------------------

/** Scottish Register style colour letters -> hex (approximate modern dyes). */
export const TARTAN_COLORS = {
  K: '#101012', W: '#efece3', R: '#b2182b', DR: '#7a1020', B: '#1f2f6b', DB: '#121a3a', LB: '#6b8fc9', A: '#4f8fc6',
  G: '#1d5a34', DG: '#0f3320', LG: '#6f9a4c', Y: '#e6c04a', N: '#7d7d7d', LN: '#b5b5b5', P: '#5b2a6e',
  T: '#8a5a2b', O: '#e0782a', C: '#c0306c', M: '#8b1c3b', S: '#b8574f',
};

export const TARTAN_PRESETS = {
  // Threadcounts quoted from public references (Wikipedia Infobox tartan, J. Howard tutorial).
  'black-watch': 'B24 K4 B4 K4 B4 K20 G24 K6 G24 K20 B22 K4 B4',
  'simple-green': 'G24 B4 G24 R6 G24 B4 G24',
  'four-colour': 'K4 R24 K24 Y4',
  'buffalo-check': 'R24 K24',
};

/** Parse "K4 R24 #aa3344/12 ..." -> [{color:'#hex', n}]. Unknown letters fall back to grey. */
export function parseThreadcount(str) {
  const out = [];
  const re = /(#[0-9a-fA-F]{6}|[A-Za-z]{1,2})\s*\/?\s*(\d+)/g;
  let m;
  while ((m = re.exec(String(str)))) {
    const key = m[1].startsWith('#') ? m[1] : m[1].toUpperCase();
    const color = key.startsWith('#') ? key : TARTAN_COLORS[key] || TARTAN_COLORS[key[0]] || '#808080';
    const n = Math.max(1, Math.min(400, parseInt(m[2], 10)));
    out.push({ color, n });
  }
  return out.length ? out : [{ color: '#b2182b', n: 8 }, { color: '#101012', n: 8 }];
}

/** Expand a half-sett (symmetric: reflect about both pivots) or full sett (asymmetric) to a thread list. */
export function expandSett(items, symmetric = true) {
  const seq = symmetric && items.length > 2 ? [...items, ...items.slice(1, -1).reverse()] : items;
  return seq;
}

const tartan = {
  id: 'tartan', name: 'Tartan / plaid (threadcount)', category: 'woven',
  tags: ['clothes', 'plaid', 'kilt', 'flannel', 'check'],
  description: 'Renders any tartan from a threadcount like "K4 R24 K24 Y4" (letters = colours, numbers = threads). Symmetric setts mirror about the pivots. Woven in 2/2 twill so the crossing blocks blend like real cloth.',
  params: {
    ...COMMON, repeats: P.int(1, 1, 16, 'Repeats'), yarnGap: P.float(0.06, 0, 0.5, 'Yarn gap'),
    preset: P.enumOf('black-watch', [...Object.keys(TARTAN_PRESETS), 'custom'], 'Preset'),
    threadcount: P.string('K4 R24 K24 Y4', 'Threadcount (when preset = custom)', 'Letters: ' + Object.keys(TARTAN_COLORS).join(' ') + ', or #rrggbb/N'),
    symmetric: P.bool(true, 'Symmetric sett'),
    countScale: P.float(0.5, 0.1, 4, 'Thread scale', 'Multiplies every count (smaller = finer threads, larger pattern repeat per tile).'),
  },
  prepare: (p) => {
    const tc = p.preset === 'custom' ? p.threadcount : TARTAN_PRESETS[p.preset];
    const items = expandSett(parseThreadcount(tc), p.symmetric);
    const seq = [];
    for (const it of items) {
      // keep counts even so the 2/2 twill lines up across stripe boundaries
      const n = Math.max(2, Math.round((it.n * p.countScale) / 2) * 2);
      const c = hexToLinear(it.color);
      for (let k = 0; k < n; k++) seq.push(c);
    }
    return weaveState(drafts.twill(2, 2, 'Z'), seq, seq, p);
  },
  sample: weaveSample,
};

// Denim ---------------------------------------------------------------------------------------

const denim = {
  id: 'denim', name: 'Denim', category: 'woven',
  tags: ['clothes', 'jeans', 'workwear'],
  description: '3/1 right-hand (Z) twill, indigo warp with ring-spun tone variation, ecru weft, optional low-frequency wash/fade.',
  params: {
    ...COMMON, repeats: P.int(16, 1, 64, 'Repeats'), irregularity: P.float(0.7, 0, 1, 'Irregularity'),
    indigo: P.color('#1f3561', 'Indigo warp'), weft: P.color('#d9d2c0', 'Weft'),
    wash: P.float(0.35, 0, 1, 'Wash / fade'),
  },
  prepare: (p) => {
    const ind = hexToLinear(p.indigo), light = hexToLinear('#7f9cc7');
    const s = weaveState(drafts.twill(3, 1, 'Z'), [ind], [hexToLinear(p.weft)], p);
    const c = [0, 0, 0];
    s.warpColor = (e, pk, u, v) => {
      const ring = hash01(e, 3, p.seed) * 0.6 + hash01(Math.floor(pk / 4), e, p.seed ^ 9) * 0.4;
      const f = fbm(u, v, { fx: 3, fy: 2, octaves: 4, seed: p.seed + 11 }) * 0.5 + 0.5;
      const t = clamp01(ring * 0.35 * p.irregularity + (f - 0.35) * 1.2 * p.wash);
      return mix3(c, ind, light, t);
    };
    return s;
  },
  sample: weaveSample,
};

const custom = {
  id: 'weave-draft', name: 'Custom weave draft', category: 'woven',
  tags: ['clothes', 'jacquard', 'dobby', 'custom'],
  description: 'Any dobby structure from a draft string: rows = picks separated by "/", 1 = warp up. Colour orders as comma lists of hex with counts.',
  params: {
    ...COMMON, repeats: P.int(4, 1, 64, 'Repeats'),
    draft: P.string('11100/01110/00111/10011/11001', 'Draft rows', 'e.g. "1100/0110/0011/1001" = 2/2 twill'),
    warpColors: P.colors(['#264653', '#e9c46a'], 'Warp colour order'), warpCounts: P.string('6 2', 'Warp counts'),
    weftColors: P.colors(['#f4f1de'], 'Weft colour order'), weftCounts: P.string('1', 'Weft counts'),
  },
  prepare: (p) => {
    const nums = (s) => (String(s).match(/\d+/g) || ['1']).map((x) => Math.max(1, Math.min(256, +x)));
    return weaveState(drafts.parse(p.draft), expandOrder(lin(p.warpColors), nums(p.warpCounts)), expandOrder(lin(p.weftColors), nums(p.weftCounts)), p);
  },
  sample: weaveSample,
};

export default [plain, twill, satin, basket, herring, houndstooth, pickpick, glen, gingham, tartan, denim, custom];
