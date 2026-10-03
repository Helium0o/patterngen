// Woven textiles.
//
// Model (standard textile CAD): a weave structure is a binary DRAFT matrix up[pick][end]
// (1 = warp thread on top at that crossing). Colour comes from the warp colour order (per end)
// and weft colour order (per pick). Pattern = structure × colour order. That single model gives
// plain, twill, satin, basket, herringbone AND colour-and-weave effects like houndstooth,
// pick-and-pick and glen check, plus tartan from a threadcount.
//
// Tiling: ends/picks per tile = lcm(draft repeat, colour repeat) × repeats, so tiles are exact.
//
// Rendering ('fabric' style), per sample:
//   1. Find the crossing (end e, pick pk) and which yarn is on top.
//   2. The top yarn is a cylinder of half-width hw (varies along the yarn: slubs). Along its FLOAT
//      (the run of consecutive crossings where it stays on top, precomputed from the draft) it
//      rises in the middle and dives at both ends (crimp). That height field is lit with a
//      Lambert term from the top-left + an optional anisotropic sheen highlight (satin, silk).
//   3. Outside the top yarn we see the crossing yarn underneath (in contact shadow), and outside
//      both, a dark interstice. Edges between them are antialiased analytically.
//   4. Fibre twist striations, hairiness and heather are faded out with math.detail() when the
//      tile is rendered so small they would alias; below ~2 px per thread the whole yarn
//      structure fades to its average colour, so small renders never shimmer with moiré.
// Other styles: 'flat' (pure colour per crossing — prints, pixel art) and 'draft' (B/W weave
// draft, as weavers read it).

import { P, adv } from '../core/params.js';
import { hexToLinear, mix, shade } from '../core/color.js';
import { hash01 } from '../core/hash.js';
import { clamp01, lcm, smoothstep, TAU, mod, gcd, detail, multipleOf, coverage } from '../core/math.js';
import { noiseField, valueNoise } from '../core/noise.js';

// ---------- draft generators (pure; return { w, h, up(pick, end) -> 0|1 }) ----------

export const drafts = {
  plain: () => ({ w: 2, h: 2, up: (p, e) => ((p + e) & 1) ^ 1 }),
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
  /** Herringbone: 2/2 twill whose direction mirrors every `k` ends ('broken' = offset at the reversal, like real cloth). */
  herringbone: (k = 8, broken = true) => ({
    w: 2 * k, h: 4,
    up: (p, e) => {
      if (e < k) return mod(e + p, 4) < 2 ? 1 : 0;
      const ee = 2 * k - 1 - e;
      return mod(ee + p + (broken ? 2 : 0), 4) < 2 ? 1 : 0;
    },
  }),
  /** Waffle / honeycomb weave (n = 6, 8 or 10): diamond floats that form deep cells. */
  waffle: (n = 8) => {
    const h = n / 2;
    return { w: n, h: n, up: (p, e) => { const a = Math.abs(mod(e, n) - h), b = Math.abs(mod(p, n) - h); return a + b >= h - 0.5 && (a + b) % 2 === h % 2 ? 1 : (a === b ? 1 : 0); } };
  },
  /** Parse "1100/0110/0011/1001" (rows = picks, '1','x','#' = warp up). */
  parse: (str) => {
    const rows = String(str).split(/[\/\n,;|]+/).map((r) => r.trim()).filter(Boolean);
    if (!rows.length) return drafts.plain();
    const w = Math.min(64, Math.max(...rows.map((r) => r.length)));
    const hh = Math.min(64, rows.length);
    const grid = rows.slice(0, hh).map((r) => Array.from({ length: w }, (_, i) => (/[1x#X]/.test(r[i] || '0') ? 1 : 0)));
    return { w, h: hh, up: (p, e) => grid[mod(p, hh)][mod(e, w)] };
  },
};

// ---------- shared weave renderer ----------

const COMMON = {
  style: P.enumOf('fabric', ['fabric', 'flat', 'draft'], 'Style', 'fabric = shaded 3D yarns; flat = solid colour per crossing (prints, pixel art); draft = black/white weave draft'),
  repeats: P.int(4, 1, 64, 'Repeats', 'Pattern repeats across the tile (integer keeps it seamless). Higher = finer cloth.'),
  yarnGap: P.float(0.12, 0, 0.5, 'Yarn gap', 'Fraction of each thread cell left open between yarns.'),
  irregularity: P.float(0.35, 0, 1, 'Irregularity', 'Per-yarn tone and thickness variation.'),
  twist: P.float(0.5, 0, 1, 'Fibre twist', 'Strength of the twisted-fibre striation on each yarn.'),
  sheen: adv(P.float(0.08, 0, 1, 'Sheen', 'Glossy highlight along the yarns (silk/satin ≈ 0.6).')),
  slub: adv(P.float(0.15, 0, 1, 'Slubs', 'Thick-and-thin yarn (linen, raw silk).')),
  heather: adv(P.float(0, 0, 1, 'Heather', 'Mottled multi-tone fibres (marl / melange yarn).')),
  fuzz: adv(P.float(0, 0, 1, 'Brushed fuzz', 'Brushed / napped surface that softens the weave (flannel, brushed cotton).')),
  seed: P.seed(1),
};

const _scratch = [0, 0, 0, 0];

/**
 * Build sampler state.
 * @param draft   {w,h,up}
 * @param warpSeq array of linear colours, one per end in the colour repeat
 * @param weftSeq array of linear colours, one per pick in the colour repeat
 * @param p       resolved params (must include the COMMON keys; missing ones get safe values)
 * @param extra   optional { ratio (ends per pick spacing, default 1), warpColor(e,pk,u,v), weftColor(pk,e,u,v), neps }
 */
export function weaveState(draft, warpSeq, weftSeq, p, extra = {}) {
  const repE = lcm(draft.w, warpSeq.length);
  const repP = lcm(draft.h, weftSeq.length);
  const T = lcm(repE, repP) * Math.max(1, p.repeats | 0);
  const ratio = extra.ratio || 1;
  const E = T, Pk = multipleOf(T / ratio, repP);
  const dw = draft.w, dh = draft.h;
  const up = new Uint8Array(dw * dh);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) up[y * dw + x] = draft.up(y, x) ? 1 : 0;
  // Float runs: for every draft cell, position inside its float and the float length (wrapping).
  const runPos = new Uint8Array(dw * dh), runLen = new Uint8Array(dw * dh);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const i = y * dw + x, isUp = up[i];
    const same = (yy, xx) => up[mod(yy, dh) * dw + mod(xx, dw)] === isUp;
    const n = isUp ? dh : dw;
    let back = 0, fwd = 0;
    if (isUp) { while (back < n && same(y - back - 1, x)) back++; while (fwd < n && same(y + fwd + 1, x)) fwd++; }
    else { while (back < n && same(y, x - back - 1)) back++; while (fwd < n && same(y, x + fwd + 1)) fwd++; }
    const len = back + fwd + 1;
    runPos[i] = len > n ? 0 : back; runLen[i] = len > n ? 0 : len; // 0 = endless float (never dives)
  }
  const g = (k, d) => (p[k] === undefined ? d : p[k]);
  return {
    E, Pk, dw, dh, up, runPos, runLen, warpSeq, weftSeq,
    style: g('style', 'fabric'), gap: g('yarnGap', 0.12), irr: g('irregularity', 0.35), twist: g('twist', 0.5),
    sheen: g('sheen', 0.12), slub: g('slub', 0.15), heather: g('heather', 0), fuzz: g('fuzz', 0), seed: g('seed', 1) | 0,
    slubFx: Math.max(1, Math.round(E * 0.6)), slubFy: Math.max(1, Math.round(Pk * 0.6)),
    fuzzField: noiseField({ fx: Math.max(4, Math.round(E / 6)), fy: Math.max(4, Math.round(Pk / 6)), octaves: 3, seed: (g('seed', 1) | 0) + 77 }),
    warpColor: extra.warpColor, weftColor: extra.weftColor, neps: extra.neps,
  };
}

const DARK = hexToLinear('#1a1a1a'), LIGHT = hexToLinear('#f3f1ea');
const LX = -0.48, LY = -0.58, LZ = 0.66;               // light from the top-left (screen space, y down)
const HX = -0.25, HY = -0.30, HZ = 0.92;               // Blinn half-vector between light and viewer
const _top = [0, 0, 0, 0], _bot = [0, 0, 0, 0], _avg = [0, 0, 0, 0];
const yarnInfo = { b: 0, h: 0 };

/**
 * Shade one yarn. a = across coordinate (cells, centred), s = along position from float start
 * (cells), len = float length (0 = endless), hw = half-width (cells). Writes brightness/height
 * into yarnInfo, returns specular strength.
 */
function shadeYarn(a, s, len, hw, isWarp, st, fibreLod, yarnId, cellLod) {
  const q = a / hw, q2 = q * q;
  const prof = Math.sqrt(1 - q2);
  let dive = 1, ddive = 0;
  if (len > 0) {
    const D = 0.55, sa = s, sb = len - s;
    const ta = clamp01(sa / D), tb = clamp01(sb / D);
    const fa = ta * ta * (3 - 2 * ta), fb = tb * tb * (3 - 2 * tb);
    dive = fa * fb;
    ddive = (6 * ta * (1 - ta) / D) * fb * (sa < D ? 1 : 0) - (6 * tb * (1 - tb) / D) * fa * (sb < D ? 1 : 0);
  }
  const lift = 0.35 + 0.65 * dive;
  // height (in yarn-radius units) and its gradient (per cell)
  const z = prof * lift;
  const relief = 0.36;
  const dzA = (-q / Math.max(0.2, prof)) / hw * lift * relief;
  const dzS = prof * 0.65 * ddive * relief;
  const nx = isWarp ? -dzA : -dzS, ny = isWarp ? -dzS : -dzA;
  const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
  const ndl = (nx * LX + ny * LY + LZ) * inv;
  const diffuse = Math.max(0, (ndl + 0.35) / (LZ + 0.35)); // wrap lighting: soft, fabric-like falloff
  // twisted-fibre striations: stripes at ~30° to the yarn axis, plus fine hairiness
  let fib = 0;
  if (fibreLod > 0) {
    const phase = s * 3.2 + (isWarp ? a : -a) * 1.9;
    const n = valueNoise(phase * 2.5, (yarnId & 1023) + q * 1.5, 1 << 20, 1 << 20, st.seed);
    fib = (st.twist * 0.22 * Math.sin(TAU * phase + n * 2.2) + st.heather * 0.55 * (hash01(Math.floor(phase * 2) & 0xffff, yarnId, st.seed ^ 0x51) - 0.5)
      + 0.06 * n) * fibreLod;
  }
  const ao = 0.7 + 0.3 * dive;
  yarnInfo.b = (0.42 + 0.58 * diffuse) * ao * (1 + fib) * (0.94 + 0.08 * prof);
  yarnInfo.h = 0.3 + 0.7 * z;
  // anisotropic sheen (only the across-yarn normal component matters for a cylinder)
  if (st.sheen > 0 && cellLod > 0) {
    const ndh = (nx * HX + ny * HY + HZ) * inv;
    return ndh > 0 ? Math.pow(ndh, 9) * st.sheen * 0.75 * dive * cellLod : 0;
  }
  return 0;
}

export function weaveSample(u, v, out, ctx, s) {
  const x = u * s.E, y = v * s.Pk;
  const ex = Math.floor(x), py = Math.floor(y);
  const fx = x - ex, fy = y - py;
  const e = mod(ex, s.E), pk = mod(py, s.Pk); // wrapped: exact periodicity
  const di = mod(pk, s.dh) * s.dw + mod(e, s.dw);
  const warpUp = s.up[di];
  const warpC = s.warpColor ? s.warpColor(e, pk, u, v) : s.warpSeq[e % s.warpSeq.length];
  const weftC = s.weftColor ? s.weftColor(pk, e, u, v) : s.weftSeq[pk % s.weftSeq.length];

  if (s.style === 'draft') { shade(out, warpUp ? DARK : LIGHT); out[4] = warpUp ? 0.7 : 0.3; return; }
  if (s.style === 'flat') { shade(out, warpUp ? warpC : weftC); out[4] = 0.5; return; }

  const cellPx = Math.min(1 / s.E, 1 / s.Pk);
  const cellLod = detail(cellPx * 2, ctx.pixel);          // yarn structure resolvable?
  const fibreLod = detail(cellPx / 3.2, ctx.pixel) * (s.twist > 0 || s.heather > 0 ? 1 : 0.5);
  const topC = warpUp ? warpC : weftC, botC = warpUp ? weftC : warpC;
  const irr = s.irr;

  // Top yarn geometry (cell units). Slubs: half-width varies along the yarn.
  const yarnId = warpUp ? e : pk + 7919;
  const along = warpUp ? fy : fx, across = (warpUp ? fx : fy) - 0.5;
  const yarnTone = 1 + (hash01(yarnId, warpUp ? 1 : 2, s.seed) - 0.5) * 0.3 * irr;
  let hw = (1 - s.gap) * 0.5;
  if (s.slub > 0) {
    // thickness varies along the yarn; integer frequency per tile keeps it periodic
    const F = warpUp ? s.slubFy : s.slubFx;
    hw *= 1 + s.slub * 0.28 * valueNoise((warpUp ? v : u) * F, yarnId * 3.1, F, 1 << 20, s.seed ^ 0x2f);
  }
  hw *= 1 + (hash01(yarnId, 5, s.seed) - 0.5) * 0.12 * irr;
  hw = Math.min(0.5, Math.max(0.12, hw));
  const len = s.runLen[di], sPos = s.runPos[di] + along;
  const edgeW = (warpUp ? ctx.px * s.E : ctx.px * s.Pk) * 0.5 + 1e-6; // half AA width in cell units
  const dTop = Math.abs(across) - hw;                      // >0 = outside the top yarn

  // --- top yarn colour
  let spec = 0, hTop = 0.5;
  if (dTop < edgeW) {
    const aa = Math.min(Math.abs(across), hw * 0.999) * Math.sign(across || 1);
    spec = shadeYarn(aa, sPos, len, hw, warpUp, s, fibreLod, yarnId, cellLod);
    const crossTone = 1 + (hash01(e, pk, s.seed ^ 0x55) - 0.5) * 0.08 * irr;
    shade(_top, topC, yarnInfo.b * yarnTone * crossTone);
    if (spec > 0) { const w = 0.22 * topC[3]; _top[0] += spec * (topC[0] * 0.78 + w); _top[1] += spec * (topC[1] * 0.78 + w); _top[2] += spec * (topC[2] * 0.78 + w); }
    hTop = yarnInfo.h;
  }
  // --- what is visible beside the top yarn: the crossing yarn underneath, or a gap
  let hBot = 0.1;
  if (dTop > -edgeW) {
    const acrossB = (warpUp ? fy : fx) - 0.5;
    const hwB = (1 - s.gap) * 0.5;
    const dB = Math.abs(acrossB) - hwB;
    const contact = 0.3 + 0.45 * smoothstep(0, 0.22, dTop); // shadow cast by the top yarn
    const profB = Math.sqrt(clamp01(1 - (acrossB / hwB) ** 2));
    shade(_bot, botC, contact * (0.55 + 0.45 * profB) * (1 + (hash01(warpUp ? pk + 7919 : e, warpUp ? 2 : 1, s.seed) - 0.5) * 0.3 * irr));
    hBot = 0.08 + 0.22 * profB;
    // interstice between the two yarns
    const edgeB = (warpUp ? ctx.px * s.Pk : ctx.px * s.E) * 0.5 + 1e-6;
    if (dB > -edgeB) {
      mix(_avg, topC, botC, 0.5);
      shade(_avg, _avg, 0.07);
      mix(_bot, _bot, _avg, clamp01(0.5 + dB / (2 * edgeB)));
      hBot *= 1 - clamp01(0.5 + dB / (2 * edgeB));
    }
  }
  const tTop = clamp01(0.5 - dTop / (2 * edgeW));
  mix(out, _bot, _top, tTop);
  let h = hBot + (hTop - hBot) * tTop;

  // tweed neps: small flecks of colour sitting on the surface
  if (s.neps) {
    const n = s.neps, G = n.grid, gx = u * G, gy = v * G, ix = Math.floor(gx), iy = Math.floor(gy);
    const hx = hash01(mod(ix, G), mod(iy, G), s.seed ^ 0x77);
    if (hx < n.density) {
      const cx = ix + 0.25 + 0.5 * hash01(mod(ix, G), mod(iy, G), s.seed ^ 0x78), cy = iy + 0.25 + 0.5 * hash01(mod(iy, G), mod(ix, G), s.seed ^ 0x79);
      const d = Math.hypot((gx - cx) * (warpUp ? 1.6 : 0.8), (gy - cy) * (warpUp ? 0.8 : 1.6)) - n.size * (0.6 + 0.6 * hash01(mod(ix, G), mod(iy, G), s.seed ^ 0x7a));
      const c = n.colors[Math.floor(hx / n.density * n.colors.length) % n.colors.length];
      const t = coverage(d / G, ctx.px) * tTop;
      if (t > 0) { shade(_scratch, c, 0.75 + 0.35 * yarnInfo.b); mix(out, out, _scratch, t); }
    }
  }

  // brushed fuzz: soften towards the local average colour + low-frequency nap
  if (s.fuzz > 0) {
    mix(_avg, warpC, weftC, 0.5);
    const nap = s.fuzzField(u, v);
    shade(_avg, _avg, 0.78 + 0.35 * nap);
    mix(out, out, _avg, s.fuzz * 0.75);
    h = h + (0.5 + 0.2 * (nap - 0.5) - h) * s.fuzz * 0.7;
  }

  // level of detail: below ~2 px per thread, fade to the crossing's average look (no moiré)
  if (cellLod < 1) {
    shade(_avg, topC, 0.78 * yarnTone);
    mix(_avg, _avg, botC, 0.12);
    mix(out, _avg, out, cellLod);
    h = 0.5 + (h - 0.5) * cellLod;
  }
  out[4] = h;
}

const lin = (arr) => arr.map(hexToLinear);
const expandOrder = (colors, counts) => {
  const seq = [];
  colors.forEach((c, i) => { for (let k = 0; k < counts[i % counts.length]; k++) seq.push(c); });
  return seq;
};
const features = (p, s) => [s.E, s.Pk, 'threads'];
const weave = (def) => ({ category: 'woven', scale: 'repeats', features, sample: weaveSample, ...def });

// ---------- patterns ----------

const plain = weave({
  id: 'plain-weave', name: 'Plain weave (tabby)',
  tags: ['clothes', 'cotton', 'shirting', 'canvas', 'linen', 'chambray'],
  description: '1/1 over-under: the base of poplin, canvas, chambray and linen. Different warp/weft colours give a chambray / iridescent look; raise slubs + heather for linen.',
  params: { ...COMMON, repeats: P.int(16, 1, 128, 'Repeats', 'Pattern repeats across the tile (1 repeat = 2 threads).'), warp: P.color('#3d5a80', 'Warp colour'), weft: P.color('#e0e6ee', 'Weft colour') },
  prepare: (p) => weaveState(drafts.plain(), [hexToLinear(p.warp)], [hexToLinear(p.weft)], p),
});

const twill = weave({
  id: 'twill', name: 'Twill',
  tags: ['clothes', 'denim', 'gabardine', 'chino', 'suiting', 'drill'],
  description: 'Diagonal-rib weave. 2/2 = gabardine/serge, 3/1 = denim/drill, 2/1 = chino. S or Z diagonal.',
  params: {
    ...COMMON, repeats: P.int(8, 1, 64, 'Repeats'),
    over: P.int(2, 1, 6, 'Over (warp up)'), under: P.int(2, 1, 6, 'Under (warp down)'),
    direction: P.enumOf('Z', ['Z', 'S'], 'Diagonal', 'Z rises to the right, S to the left.'),
    warp: P.color('#4a3f35', 'Warp colour'), weft: P.color('#b9a88f', 'Weft colour'),
  },
  prepare: (p) => weaveState(drafts.twill(p.over, p.under, p.direction), [hexToLinear(p.warp)], [hexToLinear(p.weft)], p),
});

const satin = weave({
  id: 'satin', name: 'Satin',
  tags: ['clothes', 'silk', 'lining', 'luxury', 'evening'],
  description: 'Long floats with scattered interlacings: a smooth, lustrous face. Regular satin needs a move number coprime to the shaft count, so 6 shafts is not offered.',
  params: {
    ...COMMON, repeats: P.int(6, 1, 64, 'Repeats'), yarnGap: P.float(0.03, 0, 0.5, 'Yarn gap'),
    twist: P.float(0.15, 0, 1, 'Fibre twist'), sheen: P.float(0.7, 0, 1, 'Sheen', 'Glossy highlight along the floats.'),
    shafts: P.enumOf(5, [5, 7, 8, 10, 12], 'Shafts'), face: P.enumOf('warp', ['warp', 'weft'], 'Face'),
    warp: P.color('#7b1e3a', 'Warp colour'), weft: P.color('#5a1429', 'Weft colour'),
  },
  prepare: (p) => weaveState(drafts.satin(Number(p.shafts), p.face), [hexToLinear(p.warp)], [hexToLinear(p.weft)], p),
});

const basket = weave({
  id: 'basket-weave', name: 'Basket / hopsack / oxford',
  tags: ['clothes', 'oxford', 'hopsack', 'upholstery', 'shirting'],
  description: 'Plain weave with k threads acting as one (2 = hopsack; white weft on a coloured warp = oxford cloth).',
  params: { ...COMMON, repeats: P.int(6, 1, 64, 'Repeats'), group: P.int(2, 2, 6, 'Threads per group'), warp: P.color('#e7dcc5', 'Warp'), weft: P.color('#8a9a7b', 'Weft') },
  prepare: (p) => weaveState(drafts.basket(p.group), [hexToLinear(p.warp)], [hexToLinear(p.weft)], p),
});

const herring = weave({
  id: 'herringbone', name: 'Herringbone twill',
  tags: ['clothes', 'tweed', 'coat', 'suiting', 'classic'],
  description: '2/2 twill whose diagonal reverses every N ends with a half-step offset ("broken" twill), giving the classic fish-bone zigzag.',
  params: {
    ...COMMON, repeats: P.int(3, 1, 32, 'Repeats'), band: P.int(8, 2, 32, 'Ends per band'),
    heather: adv(P.float(0.25, 0, 1, 'Heather')),
    broken: adv(P.bool(true, 'Broken reversal', 'Offset the twill at each reversal (real herringbone). Off = plain zigzag.')),
    warp: P.color('#2b2b2b', 'Warp'), weft: P.color('#cfc8b8', 'Weft'),
  },
  prepare: (p) => weaveState(drafts.herringbone(p.band, p.broken), [hexToLinear(p.warp)], [hexToLinear(p.weft)], p),
});

const houndstooth = weave({
  id: 'houndstooth', name: 'Houndstooth',
  tags: ['clothes', 'tweed', 'check', 'classic', 'print'],
  description: 'Colour-and-weave effect: 2/2 twill with 4 dark / 4 light in both warp and weft. Band 2 = puppytooth, band 8 = large dogtooth. Use style=flat for a crisp printed version.',
  params: { ...COMMON, repeats: P.int(4, 1, 32, 'Repeats'), band: P.int(4, 1, 16, 'Threads per colour band'), colors: P.colors(['#151515', '#f2efe6'], 'Dark, light', '', 2, 2) },
  prepare: (p) => {
    const seq = expandOrder(lin(p.colors), [p.band, p.band]);
    return weaveState(drafts.twill(2, 2, 'Z'), seq, seq, p);
  },
});

const pickpick = weave({
  id: 'pick-and-pick', name: 'Pick-and-pick / sharkskin',
  tags: ['clothes', 'suiting'],
  description: '2/2 twill with alternating 1 dark / 1 light warp and weft — the stepped sharkskin texture of suiting.',
  params: { ...COMMON, repeats: P.int(12, 1, 64, 'Repeats'), colors: P.colors(['#2d3440', '#a9b1bc'], 'Dark, light', '', 2, 2) },
  prepare: (p) => { const seq = lin(p.colors); return weaveState(drafts.twill(2, 2, 'Z'), seq, seq, p); },
});

const glen = weave({
  id: 'glen-check', name: 'Glen check / Prince of Wales',
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
});

const gingham = weave({
  id: 'gingham', name: 'Gingham',
  tags: ['clothes', 'shirt', 'picnic', 'check', 'summer'],
  description: 'Plain weave, equal coloured and white bands in warp and weft; the crossings of colour × white give the characteristic mid-tone. Use style=flat at small sizes for a print-style check.',
  params: { ...COMMON, repeats: P.int(4, 1, 32, 'Repeats'), band: P.int(6, 1, 32, 'Threads per band'), colors: P.colors(['#c8102e', '#ffffff'], 'Colour, ground', '', 2, 2) },
  prepare: (p) => { const seq = expandOrder(lin(p.colors), [p.band, p.band]); return weaveState(drafts.plain(), seq, seq, p); },
});

// Tartan --------------------------------------------------------------------------------------

/** Scottish Register style colour letters -> hex (approximate modern dyes). */
export const TARTAN_COLORS = {
  K: '#101012', W: '#efece3', R: '#b2182b', DR: '#7a1020', B: '#1f2f6b', DB: '#121a3a', LB: '#6b8fc9', A: '#4f8fc6',
  G: '#1d5a34', DG: '#0f3320', LG: '#6f9a4c', Y: '#e6c04a', N: '#7d7d7d', LN: '#b5b5b5', P: '#5b2a6e',
  T: '#8a5a2b', O: '#e0782a', C: '#c0306c', M: '#8b1c3b', S: '#b8574f', CA: '#c19a6b',
};

export const TARTAN_PRESETS = {
  // Black Watch / simple setts follow public references (Wikipedia "Sett (tartans)", J. Howard tutorial);
  // the "-style" setts are designed look-alikes, not registered threadcounts.
  'black-watch': 'B24 K4 B4 K4 B4 K20 G24 K6 G24 K20 B22 K4 B4',
  'simple-green': 'G24 B4 G24 R6 G24 B4 G24',
  'four-colour': 'K4 R24 K24 Y4',
  'buffalo-check': 'R24 K24',
  'red-stewart-style': 'R40 B8 K4 Y2 K4 W2 K4 G12 R6 W2 R6',
  'camel-check-style': 'CA36 K4 CA4 K4 W4 K4 CA4 R2',
  'grey-flannel-style': 'N24 LN4 N8 K2 N8 LN4',
  'madras-style': '#e94f37/12 #f6f7eb/2 #393e41/4 #3f88c5/12 #f6f7eb/2 #44bba4/8 #e7bb41/6',
};

/** Parse "K4 R24 #aa3344/12 ..." -> [{color:'#hex', n}]. Unknown letters fall back to grey. */
export function parseThreadcount(str) {
  const out = [];
  const re = /(#[0-9a-fA-F]{6}|[A-Za-z]{1,2})\s*\/?\s*(\d+)/g;
  let m;
  while ((m = re.exec(String(str))) && out.length < 400) {
    const key = m[1].startsWith('#') ? m[1] : m[1].toUpperCase();
    const color = key.startsWith('#') ? key : TARTAN_COLORS[key] || TARTAN_COLORS[key[0]] || '#808080';
    const n = Math.max(1, Math.min(400, parseInt(m[2], 10)));
    out.push({ color, n });
  }
  return out.length ? out : [{ color: '#b2182b', n: 8 }, { color: '#101012', n: 8 }];
}

/** Expand a half-sett (symmetric: reflect about both pivots) or full sett (asymmetric) to a thread list. */
export function expandSett(items, symmetric = true) {
  return symmetric && items.length > 2 ? [...items, ...items.slice(1, -1).reverse()] : items;
}

const tartan = weave({
  id: 'tartan', name: 'Tartan / plaid (threadcount)',
  tags: ['clothes', 'plaid', 'kilt', 'flannel', 'check', 'lumberjack'],
  description: 'Renders any tartan from a threadcount like "K4 R24 K24 Y4" (letters = colours, numbers = threads). Symmetric setts mirror about the pivots. Woven in 2/2 twill so crossing blocks blend like real cloth; raise "Brushed fuzz" for flannel.',
  params: {
    ...COMMON, repeats: P.int(1, 1, 16, 'Repeats', 'Setts across the tile.'), yarnGap: P.float(0.06, 0, 0.5, 'Yarn gap'),
    sett: P.enumOf('black-watch', [...Object.keys(TARTAN_PRESETS), 'custom'], 'Sett', 'A named threadcount, or "custom" to use the threadcount below.'),
    threadcount: P.string('K4 R24 K24 Y4', 'Threadcount (when sett = custom)', 'Letters: ' + Object.keys(TARTAN_COLORS).join(' ') + ', or #rrggbb/N'),
    symmetric: P.bool(true, 'Symmetric sett', 'Mirror the threadcount about its pivots (most tartans).'),
    countScale: P.float(0.5, 0.1, 4, 'Thread scale', 'Multiplies every count: smaller = fewer, thicker threads per sett.'),
  },
  prepare: (p) => {
    const tc = p.sett === 'custom' ? p.threadcount : TARTAN_PRESETS[p.sett];
    const items = expandSett(parseThreadcount(tc), p.symmetric);
    const seq = [];
    for (const it of items) {
      // keep counts even so the 2/2 twill lines up across stripe boundaries
      const n = Math.max(2, Math.round((it.n * p.countScale) / 2) * 2);
      const c = hexToLinear(it.color);
      for (let k = 0; k < n && seq.length < 4096; k++) seq.push(c);
    }
    return weaveState(drafts.twill(2, 2, 'Z'), seq, seq, p);
  },
});

// Denim ---------------------------------------------------------------------------------------

const denim = weave({
  id: 'denim', name: 'Denim',
  tags: ['clothes', 'jeans', 'workwear', 'indigo'],
  description: '3/1 right-hand (Z) twill with more ends than picks (steep twill line), ring-spun indigo warp with slubs and tone variation, ecru weft, optional fade/wash.',
  params: {
    ...COMMON, repeats: P.int(16, 1, 64, 'Repeats'), irregularity: P.float(0.7, 0, 1, 'Irregularity'),
    slub: adv(P.float(0.35, 0, 1, 'Slubs')), yarnGap: P.float(0.08, 0, 0.5, 'Yarn gap'),
    direction: P.enumOf('Z', ['Z', 'S'], 'Twill direction', 'Z = right-hand (most jeans), S = left-hand.'),
    indigo: P.color('#1f3561', 'Indigo warp'), weft: P.color('#d9d2c0', 'Weft'),
    wash: P.float(0.35, 0, 1, 'Wash / fade', 'Low-frequency fading and whiskering.'),
  },
  prepare: (p) => {
    const ind = hexToLinear(p.indigo), light = hexToLinear('#8fa9cf');
    const fade = noiseField({ fx: 3, fy: 2, octaves: 4, seed: p.seed + 11 });
    const c = [0, 0, 0, 1];
    return weaveState(drafts.twill(3, 1, p.direction), [ind], [hexToLinear(p.weft)], p, {
      ratio: 1.4,
      warpColor: (e, pk, u, v) => {
        const ring = hash01(e, 3, p.seed) * 0.6 + hash01(pk >> 3, e, p.seed ^ 9) * 0.4; // ring-spun: dye penetrates unevenly
        const t = clamp01(ring * 0.35 * p.irregularity + (fade(u, v) - 0.35) * 1.2 * p.wash);
        return mix(c, ind, light, t);
      },
    });
  },
});

// Tweed ---------------------------------------------------------------------------------------

const tweed = weave({
  id: 'tweed', name: 'Tweed (Donegal / Harris)',
  tags: ['clothes', 'wool', 'coat', 'jacket', 'country', 'heritage'],
  description: 'Heathered woollen yarns in a 2/2 twill or herringbone, flecked with coloured neps (Donegal). Rough, hairy, multi-tone.',
  params: {
    ...COMMON, repeats: P.int(12, 1, 48, 'Repeats'),
    weave: P.enumOf('twill', ['twill', 'herringbone', 'plain'], 'Weave'),
    irregularity: P.float(0.6, 0, 1, 'Irregularity'), heather: P.float(0.6, 0, 1, 'Heather'),
    slub: adv(P.float(0.4, 0, 1, 'Slubs')), fuzz: adv(P.float(0.15, 0, 1, 'Brushed fuzz')),
    warp: P.color('#5b5346', 'Warp'), weft: P.color('#8a7d66', 'Weft'),
    neps: P.float(0.35, 0, 1, 'Neps (flecks)', 'Density of coloured flecks.'),
    nepColors: P.colors(['#c8553d', '#f2d0a4', '#3c6e71', '#e8c547'], 'Fleck colours'),
  },
  prepare: (p) => {
    const d = p.weave === 'herringbone' ? drafts.herringbone(8, true) : p.weave === 'plain' ? drafts.plain() : drafts.twill(2, 2, 'Z');
    const st = weaveState(d, [hexToLinear(p.warp)], [hexToLinear(p.weft)], p);
    if (p.neps > 0) st.neps = { grid: Math.max(4, Math.round(st.E / 1.5)), density: p.neps * 0.12, size: 0.16, colors: lin(p.nepColors) };
    return st;
  },
});

const custom = weave({
  id: 'weave-draft', name: 'Custom weave draft',
  tags: ['clothes', 'jacquard', 'dobby', 'custom', 'waffle'],
  description: 'Any dobby structure from a draft string: rows = picks separated by "/", 1 = warp up. Colour orders as colour lists with thread counts. Presets include waffle, bird\'s-eye and diamond twill.',
  params: {
    ...COMMON, repeats: P.int(4, 1, 64, 'Repeats'),
    draft: P.string('11100/01110/00111/10011/11001', 'Draft rows', 'e.g. "1100/0110/0011/1001" = 2/2 twill (max 64×64)'),
    warpColors: P.colors(['#264653', '#e9c46a'], 'Warp colour order'), warpCounts: P.string('6 2', 'Warp counts', 'Threads per colour, space separated (cycled).'),
    weftColors: P.colors(['#f4f1de'], 'Weft colour order'), weftCounts: P.string('1', 'Weft counts'),
  },
  prepare: (p) => {
    const nums = (s) => (String(s).match(/\d+/g) || ['1']).slice(0, 64).map((x) => Math.max(1, Math.min(256, +x)));
    return weaveState(drafts.parse(p.draft), expandOrder(lin(p.warpColors), nums(p.warpCounts)), expandOrder(lin(p.weftColors), nums(p.weftCounts)), p);
  },
});

export default [plain, twill, satin, basket, herring, houndstooth, pickpick, glen, gingham, tartan, denim, tweed, custom];
