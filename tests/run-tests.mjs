// Test suite: node tests/run-tests.mjs   (no dependencies)
//
// 1. Known answers: PCG3D vs an independent BigInt reference, weave drafts vs textbook
//    definitions, tartan parsing.
// 2. For EVERY pattern:
//    - determinism (two renders are byte-identical)
//    - seam continuity: the jump across the wrap seam (last col -> first col, last row -> first
//      row) must not exceed the largest jump found anywhere inside the tile
//    - finite output from the raw sampler (no NaN/Infinity), heights in [0,1]
//    - fuzz: 40 random/garbage param sets must render without throwing
// Exit code 1 on any failure.

import { PATTERNS, render, createSampler, getPattern } from '../src/index.js';
import { pcg3, mulberry32 } from '../src/core/hash.js';
import { drafts, parseThreadcount, expandSett } from '../src/patterns/woven.js';
import { perlin, worley } from '../src/core/noise.js';
import { resolveParams } from '../src/core/params.js';

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
  // every warp float in a 2/2 twill is exactly 2 long
  for (let e = 0; e < 4; e++) { let run = 0; for (let p = 0; p < 8; p++) run += tw.up(p, e); if (run !== 4) twOk = false; }
  ok(twOk, '2/2 twill: (e+p) mod 4 < 2, 50% warp up per end');

  for (const n of [5, 7, 8, 10, 12]) {
    const st = drafts.satin(n, 'weft');
    let rowsOk = true, colsOk = true;
    for (let p = 0; p < n; p++) { let c = 0; for (let e = 0; e < n; e++) c += st.up(p, e); if (c !== 1) rowsOk = false; }
    for (let e = 0; e < n; e++) { let c = 0; for (let p = 0; p < n; p++) c += st.up(p, e); if (c !== 1) colsOk = false; }
    // interlacings of consecutive picks must not touch diagonally (that would be a twill line)
    const pos = (p) => { for (let e = 0; e < n; e++) if (st.up(p, e)) return e; return -1; };
    let noAdj = true;
    for (let p = 0; p < n; p++) { const d = (pos(p + 1) - pos(p) + n) % n; if (d === 1 || d === n - 1) noAdj = false; }
    ok(rowsOk && colsOk && noAdj, `satin ${n}: one interlacing per row/column, none diagonally adjacent`);
  }

  const tc = parseThreadcount('K4 R24 K24 Y4');
  ok(tc.length === 4 && tc[1].n === 24 && tc[3].color === '#e6c04a', 'threadcount parse');
  ok(expandSett(tc, true).map((t) => t.n).join(',') === '4,24,24,4,24,24', 'symmetric sett mirrors about pivots');
  ok(parseThreadcount('#123456/8 G4').length === 2, 'hex colours in threadcount');
  ok(parseThreadcount('garbage!!!').length === 2, 'unparseable threadcount falls back safely');

  // periodic noise: f(x) == f(x + period) exactly
  let per = true;
  for (let i = 0; i < 500; i++) {
    const x = rnd() * 8, y = rnd() * 8;
    if (perlin(x, y, 8, 8, 3) !== perlin(x + 8, y - 16, 8, 8, 3)) per = false;
  }
  ok(per, 'perlin is exactly periodic');
  const a = {}, b = {};
  let wp = true;
  for (let i = 0; i < 500; i++) {
    const u = rnd(), v = rnd();
    worley(u, v, 6, 6, 9, 1, a); worley(u + 1, v + 1, 6, 6, 9, 1, b);
    if (Math.abs(a.f1 - b.f1) > 1e-9 || a.id !== b.id) wp = false;
  }
  ok(wp, 'worley is periodic');

  const sch = { n: { type: 'int', default: 4, min: 1, max: 10 }, c: { type: 'color', default: '#000000' }, e: { type: 'enum', default: 'a', options: ['a', 'b'] } };
  const r = resolveParams(sch, { n: 'NaN', c: 'red', e: 'zzz' });
  ok(r.n === 4 && r.c === '#000000' && r.e === 'a', 'params: garbage coerced to defaults');
  ok(resolveParams(sch, { n: 999 }).n === 10, 'params: clamped to max');
}

// ---------- 2. per-pattern ----------
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
const garbage = [null, undefined, NaN, -1e9, 1e9, 'abc', '', [], {}, true, '#zzz', 3.7];
function fuzzParams(schema) {
  const out = {};
  for (const [k, s] of Object.entries(schema)) {
    const r = fuzzRnd();
    if (r < 0.3) out[k] = garbage[(fuzzRnd() * garbage.length) | 0];
    else if (s.type === 'int' || s.type === 'float') out[k] = s.min + fuzzRnd() * ((s.max ?? s.min + 10) - s.min);
    else if (s.type === 'enum') out[k] = s.options[(fuzzRnd() * s.options.length) | 0];
    else if (s.type === 'bool') out[k] = fuzzRnd() < 0.5;
    else if (s.type === 'color') out[k] = '#' + ((fuzzRnd() * 0xffffff) | 0).toString(16).padStart(6, '0');
    else if (s.type === 'colors') out[k] = Array.from({ length: 1 + ((fuzzRnd() * 5) | 0) }, () => '#' + ((fuzzRnd() * 0xffffff) | 0).toString(16).padStart(6, '0'));
    else if (s.type === 'seed') out[k] = (fuzzRnd() * 1e6) | 0;
    else if (s.type === 'string') out[k] = ['', '1/0', 'K4 R8', '1100/0110', '0123/3210', '§§§', '2 1 3'][(fuzzRnd() * 7) | 0];
  }
  // keep heavy sims cheap during fuzzing
  if (schema.grid) out.grid = 48;
  if (schema.iterations) out.iterations = 200;
  return out;
}

const report = [];
for (const pat of PATTERNS) {
  const t0 = performance.now();
  const fast = pat.id === 'reaction-diffusion' ? { grid: 96, iterations: 1500 } : {};
  const a = render(pat.id, { width: S, supersample: 1, params: fast });
  const t1 = performance.now();
  const b = render(pat.id, { width: S, supersample: 1, params: fast });
  ok(Buffer.compare(Buffer.from(a.data.buffer), Buffer.from(b.data.buffer)) === 0, `${pat.id}: deterministic`);

  const st = seamStats(a);
  const tol = 1.15, slack = 1.5; // luminance units (0-255)
  const seamOk = st.seamC <= st.maxC * tol + slack && st.seamR <= st.maxR * tol + slack;
  ok(seamOk, `${pat.id}: seamless (seam col ${st.seamC.toFixed(1)} vs max interior ${st.maxC.toFixed(1)}; row ${st.seamR.toFixed(1)} vs ${st.maxR.toFixed(1)})`);

  const smp = createSampler(pat.id, fast);
  let finite = true, hOk = true;
  for (let i = 0; i < 400; i++) {
    const r = smp(fuzzRnd() * 3 - 1, fuzzRnd() * 3 - 1);
    if (!r.every(Number.isFinite)) finite = false;
    if (r[3] < -1e-6 || r[3] > 1 + 1e-6) hOk = false;
  }
  ok(finite, `${pat.id}: sampler output finite`);
  ok(hOk, `${pat.id}: height in [0,1]`);

  let fuzzOk = true, fuzzErr = '';
  for (let i = 0; i < 40; i++) {
    try {
      const img = render(pat.id, { width: 24, supersample: 1, params: fuzzParams(pat.params) });
      if (img.data.length !== 24 * 24 * 4) throw new Error('bad size');
    } catch (e) { fuzzOk = false; fuzzErr = e.message; break; }
  }
  ok(fuzzOk, `${pat.id}: survives 40 fuzzed param sets ${fuzzErr}`);

  // strict periodicity: sample(u, v) must equal sample(u + k, v + m) for integer k, m.
  // (A few threshold flips from float rounding are tolerated: < 0.5% of points.)
  {
    const st8 = pat.prepare(resolveParams(pat.params, fast), { width: S, height: S });
    const o1 = new Float64Array(4), o2 = new Float64Array(4), cx = { px: 1 / 512, width: 512, height: 512, ss: 1 };
    let bad = 0;
    const N = 1500;
    for (let i = 0; i < N; i++) {
      const u = fuzzRnd(), v = fuzzRnd(), k = 1 + ((fuzzRnd() * 3) | 0), m = -1 - ((fuzzRnd() * 2) | 0);
      o1.fill(0); o1[3] = 0.5; o2.fill(0); o2[3] = 0.5;
      pat.sample(u, v, o1, cx, st8); pat.sample(u + k, v + m, o2, cx, st8);
      if (Math.max(Math.abs(o1[0] - o2[0]), Math.abs(o1[1] - o2[1]), Math.abs(o1[2] - o2[2])) > 2e-3) bad++;
    }
    ok(bad / N < 0.005, `${pat.id}: strictly periodic (mismatch ${(100 * bad / N).toFixed(2)}% of samples)`);
  }

  const meta = getPattern(pat.id);
  ok(meta.name && meta.category && meta.description && Object.keys(meta.params).length > 0, `${pat.id}: has metadata`);
  report.push({ id: pat.id, ms160: +(t1 - t0).toFixed(1), seam: [+st.seamC.toFixed(2), +st.seamR.toFixed(2)], interiorMax: [+st.maxC.toFixed(2), +st.maxR.toFixed(2)] });
}

console.log(`\n${passes} passed, ${failures} failed`);
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 1));
process.exit(failures ? 1 : 0);
