// Test suite: node tests/run-tests.mjs [--json] [--only <id>]   (no dependencies)
//
// 1. Known answers: PCG3D vs an independent BigInt reference, weave drafts vs textbook
//    definitions, tartan parsing, colour parsing, param coercion.
// 2. API: presets, transparency, non-square tiles, renderMaps, renderArea, featureCount, sampler.
// 3. For EVERY pattern:
//    - metadata (name, category, description, scale param exists in the schema)
//    - determinism (two renders are byte-identical)
//    - seam continuity: the jump across the wrap seam (last col -> first col, last row -> first
//      row) must not exceed the largest jump found anywhere inside the tile
//    - strict periodicity: sample(u, v) == sample(u + k, v + m) for integers k, m
//    - finite output from the raw sampler (no NaN/Infinity), alpha and height in [0,1]
//    - fuzz: 40 random/garbage param sets must render without throwing
//    - level of detail: a tiny render of a dense setting has no high-contrast moiré
// Exit code 1 on any failure.

import { PATTERNS, render, renderMaps, renderArea, createSampler, getPattern, listPatterns, listPresets, featureCount, tileSizeFor, defaults } from '../src/index.js';
import { pcg3, mulberry32 } from '../src/core/hash.js';
import { drafts, parseThreadcount, expandSett } from '../src/patterns/woven.js';
import { perlin, worley, noiseField, voronoiEdge } from '../src/core/noise.js';
import { resolveParams } from '../src/core/params.js';
import { parseColor, normColor } from '../src/core/color.js';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
let failures = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { failures++; console.log('  FAIL', msg); } };

// ---------- 1. known answers ----------
console.log('Known-answer tests');
{
  const M = 0xffffffffn;
  const ref = (x, y, z) => {
    let a = (BigInt(x >>> 0) * 1664525n + 1013904223n) & M;
    let b = (BigInt(y >>> 0) * 1664525n + 1013904223n) & M;
    let c = (BigInt(z >>> 0) * 1664525n + 1013904223n) & M;
    a = (a + b * c) & M; b = (b + c * a) & M; c = (c + a * b) & M;
    a ^= a >> 16n; b ^= b >> 16n; c ^= c >> 16n;
    a = (a + b * c) & M; b = (b + c * a) & M; c = (c + a * b) & M;
    return [Number(a), Number(b), Number(c)];
  };
  const rnd = mulberry32(42);
  let allEq = true;
  for (let i = 0; i < 2000; i++) {
    const x = (rnd() * 2 ** 32) | 0, y = (rnd() * 2 ** 32) | 0, z = (rnd() * 2 ** 32) | 0;
    const got = Array.from(pcg3(x, y, z, new Uint32Array(3)));
    const exp = ref(x, y, z);
    if (got[0] !== exp[0] || got[1] !== exp[1] || got[2] !== exp[2]) { allEq = false; break; }
  }
  ok(allEq, 'pcg3 matches BigInt reference on 2000 random inputs');

  const pl = drafts.plain();
  let plainOk = true;
  for (let p = 0; p < 8; p++) for (let e = 0; e < 8; e++) if (pl.up(p, e) !== ((p + e) % 2 === 0 ? 1 : 0)) plainOk = false;
  ok(plainOk, 'plain weave is the checkerboard');

  const tw = drafts.twill(2, 2, 'Z');
  let twOk = true;
  for (let p = 0; p < 8; p++) for (let e = 0; e < 8; e++) if (tw.up(p, e) !== (((e + p) % 4) < 2 ? 1 : 0)) twOk = false;
  for (let e = 0; e < 4; e++) { let run = 0; for (let p = 0; p < 8; p++) run += tw.up(p, e); if (run !== 4) twOk = false; }
  ok(twOk, '2/2 twill: (e+p) mod 4 < 2, 50% warp up per end');

  for (const n of [5, 7, 8, 10, 12]) {
    const st = drafts.satin(n, 'weft');
    let rowsOk = true, colsOk = true;
    for (let p = 0; p < n; p++) { let c = 0; for (let e = 0; e < n; e++) c += st.up(p, e); if (c !== 1) rowsOk = false; }
    for (let e = 0; e < n; e++) { let c = 0; for (let p = 0; p < n; p++) c += st.up(p, e); if (c !== 1) colsOk = false; }
    const pos = (p) => { for (let e = 0; e < n; e++) if (st.up(p, e)) return e; return -1; };
    let noAdj = true;
    for (let p = 0; p < n; p++) { const d = (pos(p + 1) - pos(p) + n) % n; if (d === 1 || d === n - 1) noAdj = false; }
    ok(rowsOk && colsOk && noAdj, `satin ${n}: one interlacing per row/column, none diagonally adjacent`);
  }

  const hb = drafts.herringbone(4, true);
  let hbOk = true;
  for (let e = 0; e < hb.w; e++) { let run = 0; for (let p = 0; p < hb.h; p++) run += hb.up(p, e); if (run !== 2) hbOk = false; }
  ok(hbOk, 'herringbone: every end is a 2/2 twill (2 up of 4)');

  const tc = parseThreadcount('K4 R24 K24 Y4');
  ok(tc.length === 4 && tc[1].n === 24 && tc[3].color === '#e6c04a', 'threadcount parse');
  ok(expandSett(tc, true).map((t) => t.n).join(',') === '4,24,24,4,24,24', 'symmetric sett mirrors about pivots');
  ok(parseThreadcount('#123456/8 G4').length === 2, 'hex colours in threadcount');
  ok(parseThreadcount('garbage!!!').length === 2, 'unparseable threadcount falls back safely');

  let per = true;
  for (let i = 0; i < 500; i++) {
    const x = rnd() * 8, y = rnd() * 8;
    if (perlin(x, y, 8, 8, 3) !== perlin(x + 8, y - 16, 8, 8, 3)) per = false;
  }
  ok(per, 'perlin is exactly periodic');
  const f = noiseField({ freq: 3, octaves: 5, seed: 9 });
  let fp = true, frange = true;
  for (let i = 0; i < 500; i++) {
    const u = rnd(), v = rnd(), a = f(u, v);
    if (Math.abs(a - f(u + 2, v - 1)) > 1e-12) fp = false;
    if (!(a > -0.2 && a < 1.2)) frange = false;
  }
  ok(fp, 'noiseField is exactly periodic');
  ok(frange, 'noiseField 01-range stays near [0,1]');
  const a = {}, b = {};
  let wp = true;
  for (let i = 0; i < 500; i++) {
    const u = rnd(), v = rnd();
    worley(u, v, 6, 6, 9, 1, a); worley(u + 1, v + 1, 6, 6, 9, 1, b);
    if (Math.abs(a.f1 - b.f1) > 1e-9 || a.id !== b.id) wp = false;
  }
  ok(wp, 'worley is periodic');
  let ve = true;
  for (let i = 0; i < 300; i++) {
    const u = rnd(), v = rnd();
    voronoiEdge(u, v, 7, 7, 3, 1, a);
    if (!(a.edge >= (a.f2 - a.f1) * 0.5 - 1e-9 && a.edge <= a.f2 + 1e-9)) ve = false;
  }
  ok(ve, 'voronoiEdge: (F2−F1)/2 ≤ exact border distance ≤ F2');

  const sch = { n: { type: 'int', default: 4, min: 1, max: 10 }, c: { type: 'color', default: '#000000' }, e: { type: 'enum', default: 'a', options: ['a', 'b'] }, cs: { type: 'colors', default: ['#111111'] } };
  const r = resolveParams(sch, { n: 'NaN', c: 'red-ish', e: 'zzz' });
  ok(r.n === 4 && r.c === '#000000' && r.e === 'a', 'params: garbage coerced to defaults');
  ok(resolveParams(sch, { n: 999 }).n === 10, 'params: clamped to max');
  ok(resolveParams(sch, { cs: '#ff0000, #00ff00' }).cs.join() === '#ff0000,#00ff00', 'params: colours accept a comma string');
  ok(resolveParams(sch, null).n === 4 && resolveParams(sch, 'junk').n === 4, 'params: non-object input → defaults');

  ok(parseColor('#fff').join() === '1,1,1,1', 'colour: #rgb');
  ok(Math.abs(parseColor('#00000080')[3] - 128 / 255) < 1e-9, 'colour: #rrggbbaa alpha');
  ok(parseColor('transparent')[3] === 0, 'colour: transparent');
  ok(normColor('rgb(255, 0, 0)') === '#ff0000', 'colour: rgb()');
  ok(normColor('rgba(0,0,255,0.5)') === '#0000ff80', 'colour: rgba()');
  ok(normColor('hsl(120, 100%, 50%)') === '#00ff00', 'colour: hsl()');
  ok(parseColor('nope') === null && parseColor(42) === null, 'colour: invalid → null');
}

// ---------- 2. API ----------
console.log('\nAPI tests');
{
  const meta = listPatterns();
  ok(meta.length === PATTERNS.length && meta.every((m) => typeof m.id === 'string' && m.params), 'listPatterns covers every pattern');
  ok(JSON.parse(JSON.stringify(meta)).length === meta.length, 'listPatterns is JSON-safe');

  const presets = listPresets();
  const ids = new Set(presets.map((p) => p.id));
  ok(ids.size === presets.length, `preset ids unique (${presets.length} presets)`);
  let presetOk = true, presetMsg = '';
  for (const pr of presets) {
    const pat = getPattern(pr.pattern);
    if (!pat) { presetOk = false; presetMsg = `${pr.id}: unknown pattern ${pr.pattern}`; break; }
    for (const k of Object.keys(pr.params)) if (!(k in pat.params)) { presetOk = false; presetMsg = `${pr.id}: unknown param ${k}`; }
    // every preset value must survive validation unchanged (catches typos in enum values / colours)
    const resolved = resolveParams(pat.params, pr.params);
    for (const [k, v] of Object.entries(pr.params)) {
      const got = resolved[k], exp = pat.params[k].type === 'color' ? normColor(v) : pat.params[k].type === 'colors' ? v.map(normColor) : v;
      if (JSON.stringify(got) !== JSON.stringify(exp) && pat.params[k].type !== 'seed') { presetOk = false; presetMsg = `${pr.id}: ${k} = ${JSON.stringify(v)} resolved to ${JSON.stringify(got)}`; }
    }
    const img = render(pr.pattern, { width: 24, supersample: 1, preset: pr.id, params: pr.pattern === 'reaction-diffusion' ? { grid: 48, iterations: 200 } : {} });
    if (img.data.length !== 24 * 24 * 4) { presetOk = false; presetMsg = `${pr.id}: bad render`; }
  }
  ok(presetOk, 'every preset references a real pattern + params, values are valid, and renders ' + presetMsg);
  ok(render('dots', { width: 16, preset: 'ditsy-floral', supersample: 1 }).params.shape === 'flower', 'render({preset}) applies the preset');
  ok(render('dots', { width: 16, preset: 'ditsy-floral', params: { shape: 'star' }, supersample: 1 }).params.shape === 'star', 'explicit params override the preset');

  const t = render('dots', { width: 64, supersample: 1, params: { background: 'transparent' } });
  let transparent = 0, opaque = 0;
  for (let i = 3; i < t.data.length; i += 4) { if (t.data[i] === 0) transparent++; if (t.data[i] === 255) opaque++; }
  ok(transparent > 500 && opaque > 100, `transparent background: ${transparent} clear px, ${opaque} opaque px`);
  const fish = render('mesh', { width: 64, supersample: 1, params: { backing: 'transparent' } });
  let clear = 0;
  for (let i = 3; i < fish.data.length; i += 4) if (fish.data[i] < 10) clear++;
  ok(clear > 1000, 'mesh with transparent backing has see-through holes');

  const wide = render('stripes', { width: 128, height: 64, supersample: 1 });
  ok(wide.width === 128 && wide.height === 64 && wide.tiles.join() === '2,1', 'non-square output holds whole tiles (2×1)');
  // the two halves of a 2×1 render are identical (no stretching)
  let halves = true;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) for (let c = 0; c < 3; c++) {
    if (Math.abs(wide.data[(y * 128 + x) * 4 + c] - wide.data[(y * 128 + x + 64) * 4 + c]) > 1) halves = false;
  }
  ok(halves, 'non-square: both tiles are identical');
  ok(render('stripes', { width: 100, height: 50, tiles: [1, 1], supersample: 1 }).tiles.join() === '1,1', 'explicit tiles override');

  const maps = renderMaps('bricks', { width: 64, supersample: 1 });
  ok(maps.color.length === 64 * 64 * 4 && maps.heightMap.length === 64 * 64 * 4 && maps.normalMap.length === 64 * 64 * 4 && maps.heights.length === 64 * 64, 'renderMaps returns colour, height, normal, float heights');
  const colorOnly = render('bricks', { width: 64, supersample: 1 });
  ok(Buffer.compare(Buffer.from(maps.color.buffer), Buffer.from(colorOnly.data.buffer)) === 0, 'renderMaps colour == render colour');

  // normal maps: a given strength looks the same at any resolution (compare mean tilt)
  const tilt = (img) => { let s = 0; for (let i = 0; i < img.data.length; i += 4) s += 255 - img.data[i + 2]; return s / (img.data.length / 4); };
  const n1 = tilt(render('quilted', { width: 128, output: 'normal', supersample: 1 })), n2 = tilt(render('quilted', { width: 512, output: 'normal', supersample: 1 }));
  ok(Math.abs(n1 - n2) / Math.max(n1, n2) < 0.25, `normal strength is resolution independent (${n1.toFixed(1)} vs ${n2.toFixed(1)})`);
  const dx = render('quilted', { width: 32, output: 'normal', normalFormat: 'directx', supersample: 1 }), gl = render('quilted', { width: 32, output: 'normal', supersample: 1 });
  let flipped = true;
  for (let i = 0; i < dx.data.length; i += 4) if (Math.abs(dx.data[i + 1] - (255 - gl.data[i + 1])) > 1 || dx.data[i] !== gl.data[i]) flipped = false;
  ok(flipped, 'normalFormat directx flips green only');

  const area = renderArea('dots', { width: 300, height: 100, tileSize: 64, supersample: 1 });
  ok(area.width === 300 && area.height === 100 && area.data[(10 * 300 + 70) * 4] === area.data[(10 * 300 + 6) * 4], 'renderArea repeats the tile');

  const fc = featureCount('plain-weave', { repeats: 16 });
  ok(fc.x === 32 && fc.unit === 'threads', `featureCount plain-weave repeats 16 = 32 threads (${fc.x})`);
  ok(tileSizeFor('plain-weave', { repeats: 16 }, 6) === 192, 'tileSizeFor: 32 threads × 6 px');
  const smp = createSampler('dots', { background: 'transparent' });
  const s1 = smp(0.123, 0.456), s2 = smp(1.123, -0.544), into = smp.into(0.123, 0.456, new Float64Array(5));
  ok(s1.length === 5 && s1.every((x, i) => Math.abs(x - s2[i]) < 1e-9) && s1.every((x, i) => Math.abs(x - into[i]) < 1e-12), 'createSampler wraps u/v and .into matches');
  let threw = false;
  try { render('no-such-pattern'); } catch (e) { threw = /unknown pattern/.test(e.message); }
  ok(threw, 'unknown id throws a helpful error');
  ok(defaults('tartan').preset === 'black-watch', 'defaults()');
}

// ---------- 3. per-pattern ----------
console.log(`\nPattern tests (${PATTERNS.length} patterns)`);
const S = 160;
const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

function seamStats(img) {
  const { width: w, height: h, data: d } = img;
  const colJump = (x0, x1) => { let s = 0; for (let y = 0; y < h; y++) s += Math.abs(lum(d, (y * w + x0) * 4) - lum(d, (y * w + x1) * 4)); return s / h; };
  const rowJump = (y0, y1) => { let s = 0; for (let x = 0; x < w; x++) s += Math.abs(lum(d, (y0 * w + x) * 4) - lum(d, (y1 * w + x) * 4)); return s / w; };
  let maxC = 0, maxR = 0;
  for (let x = 0; x < w - 1; x++) maxC = Math.max(maxC, colJump(x, x + 1));
  for (let y = 0; y < h - 1; y++) maxR = Math.max(maxR, rowJump(y, y + 1));
  return { seamC: colJump(w - 1, 0), seamR: rowJump(h - 1, 0), maxC, maxR };
}

const fuzzRnd = mulberry32(7);
const garbage = [null, undefined, NaN, -1e9, 1e9, 'abc', '', [], {}, true, '#zzz', 3.7, 'transparent'];
function fuzzParams(schema) {
  const out = {};
  for (const [k, s] of Object.entries(schema)) {
    const r = fuzzRnd();
    if (r < 0.3) out[k] = garbage[(fuzzRnd() * garbage.length) | 0];
    else if (s.type === 'int' || s.type === 'float') out[k] = s.min + fuzzRnd() * ((s.max ?? s.min + 10) - s.min);
    else if (s.type === 'enum') out[k] = s.options[(fuzzRnd() * s.options.length) | 0];
    else if (s.type === 'bool') out[k] = fuzzRnd() < 0.5;
    else if (s.type === 'color') out[k] = fuzzRnd() < 0.15 ? 'transparent' : '#' + ((fuzzRnd() * 0xffffff) | 0).toString(16).padStart(6, '0');
    else if (s.type === 'colors') out[k] = Array.from({ length: 1 + ((fuzzRnd() * 5) | 0) }, () => '#' + ((fuzzRnd() * 0xffffffff) >>> 0).toString(16).padStart(8, '0'));
    else if (s.type === 'seed') out[k] = fuzzRnd() < 0.2 ? 'hello' : (fuzzRnd() * 1e6) | 0;
    else if (s.type === 'string') out[k] = ['', '1/0', 'K4 R8', '1100/0110', '0123/3210', '§§§', '2 1 3', '9'.repeat(300)][(fuzzRnd() * 8) | 0];
  }
  // keep heavy sims cheap during fuzzing
  if (schema.grid) out.grid = 48;
  if (schema.iterations) out.iterations = 200;
  return out;
}

const report = [];
for (const pat of PATTERNS) {
  if (only && pat.id !== only) continue;
  const fast = pat.id === 'reaction-diffusion' ? { grid: 96, iterations: 1500 } : {};
  const meta = getPattern(pat.id);
  ok(meta.name && meta.category && meta.description && Object.keys(meta.params).length > 0, `${pat.id}: has metadata`);
  ok(!meta.scale || meta.scale in meta.params, `${pat.id}: scale param "${meta.scale}" exists in its schema`);

  const t0 = performance.now();
  const a = render(pat.id, { width: S, supersample: 1, params: fast });
  const t1 = performance.now();
  const b = render(pat.id, { width: S, supersample: 1, params: fast });
  ok(Buffer.compare(Buffer.from(a.data.buffer), Buffer.from(b.data.buffer)) === 0, `${pat.id}: deterministic`);

  const st = seamStats(a);
  const tol = 1.15, slack = 1.5; // luminance units (0-255)
  ok(st.seamC <= st.maxC * tol + slack && st.seamR <= st.maxR * tol + slack, `${pat.id}: seamless (seam col ${st.seamC.toFixed(1)} vs max interior ${st.maxC.toFixed(1)}; row ${st.seamR.toFixed(1)} vs ${st.maxR.toFixed(1)})`);

  const smp = createSampler(pat.id, fast);
  let finite = true, rangeOk = true;
  for (let i = 0; i < 400; i++) {
    const r = smp(fuzzRnd() * 3 - 1, fuzzRnd() * 3 - 1);
    if (!r.every(Number.isFinite)) finite = false;
    if (r[3] < -1e-6 || r[3] > 1 + 1e-6 || r[4] < -1e-6 || r[4] > 1 + 1e-6) rangeOk = false;
  }
  ok(finite, `${pat.id}: sampler output finite`);
  ok(rangeOk, `${pat.id}: alpha and height in [0,1]`);

  let fuzzOk = true, fuzzErr = '';
  for (let i = 0; i < 40; i++) {
    try {
      const img = render(pat.id, { width: 24, supersample: 1, params: fuzzParams(pat.params) });
      if (img.data.length !== 24 * 24 * 4) throw new Error('bad size');
      for (let k = 0; k < img.data.length; k++) if (!Number.isFinite(img.data[k])) throw new Error('NaN pixel');
    } catch (e) { fuzzOk = false; fuzzErr = e.stack.split('\n').slice(0, 3).join(' | '); break; }
  }
  ok(fuzzOk, `${pat.id}: survives 40 fuzzed param sets ${fuzzErr}`);

  // strict periodicity: sample(u, v) must equal sample(u + k, v + m) for integer k, m.
  // (A few threshold flips from float rounding are tolerated: < 0.5% of points.)
  {
    const st8 = pat.prepare(resolveParams(pat.params, fast), { width: S, height: S, tiles: [1, 1] });
    const o1 = new Float64Array(5), o2 = new Float64Array(5), cx = { px: 1 / 512, pixel: 1 / 512, width: 512, height: 512, ss: 1, tileW: 512, tileH: 512 };
    let bad = 0;
    const N = 1500;
    for (let i = 0; i < N; i++) {
      const u = fuzzRnd(), v = fuzzRnd(), k = 1 + ((fuzzRnd() * 3) | 0), m = -1 - ((fuzzRnd() * 2) | 0);
      o1.fill(0); o1[3] = 1; o1[4] = 0.5; o2.fill(0); o2[3] = 1; o2[4] = 0.5;
      pat.sample(u, v, o1, cx, st8); pat.sample(u + k, v + m, o2, cx, st8);
      if (Math.max(Math.abs(o1[0] - o2[0]), Math.abs(o1[1] - o2[1]), Math.abs(o1[2] - o2[2]), Math.abs(o1[3] - o2[3])) > 2e-3) bad++;
    }
    ok(bad / N < 0.005, `${pat.id}: strictly periodic (mismatch ${((100 * bad) / N).toFixed(2)}% of samples)`);
  }
  report.push({ id: pat.id, ms160: +(t1 - t0).toFixed(1), seam: [+st.seamC.toFixed(2), +st.seamR.toFixed(2)], interiorMax: [+st.maxC.toFixed(2), +st.maxR.toFixed(2)] });
}

// level of detail: very dense fabrics rendered tiny must fade to an even tone instead of moiré
if (!only) {
  const lodCases = [['plain-weave', { repeats: 96 }], ['twill', { repeats: 48 }], ['knit', { stitchesAcross: 128 }], ['herringbone', { repeats: 24 }], ['corduroy', { wales: 128 }]];
  for (const [id, params] of lodCases) {
    const img = render(id, { width: 48, supersample: 1, params });
    let mean = 0, n = img.data.length / 4;
    for (let i = 0; i < img.data.length; i += 4) mean += lum(img.data, i);
    mean /= n;
    let sd = 0;
    for (let i = 0; i < img.data.length; i += 4) sd += (lum(img.data, i) - mean) ** 2;
    sd = Math.sqrt(sd / n);
    ok(sd < 22, `${id}: no moiré when rendered tiny (luminance sd ${sd.toFixed(1)})`);
  }
}

console.log(`\n${passes} passed, ${failures} failed`);
if (args.includes('--json')) console.log(JSON.stringify(report, null, 1));
process.exit(failures ? 1 : 0);
