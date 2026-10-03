// Verify the texturelib adapter inside a real TypeLab checkout, in headless Chromium (13 checks).
//
//   NODE_PATH=$(npm root -g) node <patterngen>/integrations/typelab/verify-in-typelab.mjs <typelab>/app/index.html [outDir]
//
// Needs Playwright + a Chromium it can launch: a global install (npm i -g playwright, then
// npx playwright install chromium) reached through NODE_PATH, so TypeLab's package.json stays clean.
// The page is opened from file:// with file access enabled, like Electron.
// Checks: adapter loaded, generators registered (respects window.TEXTURELIB_TYPELAB include/exclude),
// every tx-* generator renders a non-blank tile, worker rendering, live provisional tiles get replaced,
// a pattern layer used as text fill is clipped to the letters, document export, SVG embeds the tile,
// presets carry colours, inspector shows the generator, no page errors.
// Screenshot goes to outDir (default: <os temp dir>/typelab-verify — nothing is written into TypeLab).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.error('Playwright not found. Install it globally (npm i -g playwright && npx playwright install chromium)\nand run with NODE_PATH=$(npm root -g), or add it as a devDependency.');
  process.exit(2);
}
const [indexHtml, outDir = join(tmpdir(), 'typelab-verify')] = process.argv.slice(2);
if (!indexHtml) { console.error('usage: node verify-in-typelab.mjs <typelab>/app/index.html [outDir]'); process.exit(2); }
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--allow-file-access-from-files', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); if (/texturelib/.test(m.text())) console.log('  [page]', m.text()); });
await page.goto(pathToFileURL(resolve(indexHtml)).href);
await page.waitForFunction(() => window.TL && TL.doc && TL.ui && TL.patterns, null, { timeout: 30000 });
await page.waitForTimeout(800);

let fail = 0;
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fail++; };

const info = await page.evaluate(() => {
  const cfg = window.TEXTURELIB_TYPELAB || {};
  const ids = window.TextureLib ? TextureLib.PATTERNS.map((p) => p.id) : [];
  const expected = ids.filter((id) => (!cfg.include || cfg.include.includes(id)) && !(cfg.exclude || []).includes(id)).length;
  return {
    hasLib: !!window.TextureLib, hasAdapter: !!(TL.texturelib && TL.texturelib.added),
    added: TL.texturelib ? TL.texturelib.added.length : 0, expected, configured: !!(cfg.include || cfg.exclude),
    genCount: TL.patterns.list.length, cats: TL.patterns.cats(),
  };
});
check(info.hasLib && info.hasAdapter, 'TextureLib + adapter loaded');
check(info.added === info.expected && info.added > 0, `${info.added} texturelib generators registered (expected ${info.expected}${info.configured ? ', per TEXTURELIB_TYPELAB include/exclude' : ''}); TypeLab now has ${info.genCount} generators`);
if (!info.added) { console.log('nothing registered — stopping'); await browser.close(); process.exit(1); }
// test with these patterns when installed, otherwise with whatever is installed
await page.evaluate(() => {
  const has = (id) => TL.texturelib.added.includes(id);
  const pick = (...ids) => ids.find(has) || TL.texturelib.added[0];
  window.__V = { heavy: pick('tx-leopard', 'tx-marble'), live: pick('tx-tartan', 'tx-denim'), bg: pick('tx-knit', 'tx-plain-weave'), fill: pick('tx-sequins', 'tx-dots'), svg: pick('tx-houndstooth', 'tx-stripes') };
});
console.log('  categories:', info.cats.join(' | '));

// every generator renders a non-blank tile inside TypeLab (sync path, like gallery thumbnails)
const blank = await page.evaluate(() => {
  const bad = [];
  for (const id of TL.texturelib.added) {
    const L = TL.make.pattern(id);
    const c = TL.patterns.tileCanvas(L, 64);
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let min = 255, max = 0;
    for (let i = 0; i < d.length; i += 4) { const y = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; if (y < min) min = y; if (y > max) max = y; }
    if (c.width !== 64 || max - min < 4) bad.push(id + ` (${c.width}px, range ${Math.round(max - min)})`);
  }
  return bad;
});
check(blank.length === 0, 'every tx-* generator renders a non-blank tile' + (blank.length ? ': ' + blank.join(', ') : ''));

// worker path + exact async tile
const worker = await page.evaluate(async () => {
  const L = TL.make.pattern(window.__V.heavy);
  const t0 = performance.now();
  const c = await TL.patterns.tileCanvasAsync(L, 512);
  const r = TL.texturelib.renderer;
  return { id: L.gen, w: c.width, ms: Math.round(performance.now() - t0), workers: r ? r.workers : 0, bands: r ? r.stats.workerBands : 0 };
});
check(worker.w === 512 && worker.workers > 0 && worker.bands > 0, `tileCanvasAsync on ${worker.workers} workers: 512 px ${worker.id} in ${worker.ms} ms (${worker.bands} bands)`);

// live view: provisional tile first, exact one after the workers finish
const live = await page.evaluate(async () => {
  const L = TL.make.pattern(window.__V.live);
  L.id = 'verify-live';
  TL.view.drawing = true; TL.fx.provisional = false;
  const first = TL.patterns.tileCanvas(L, 700);
  const prov = TL.fx.provisional;
  TL.view.drawing = false;
  await new Promise((r) => setTimeout(r, 4000));
  TL.view.drawing = true; TL.fx.provisional = false;
  const second = TL.patterns.tileCanvas(L, 700);
  const prov2 = TL.fx.provisional;
  TL.view.drawing = false;
  return { w1: first.width, prov, w2: second.width, prov2 };
});
check(live.w1 === 700 && live.prov === true, 'live view returns a provisional 700 px tile immediately');
check(live.w2 === 700 && live.prov2 === false, 'after the worker finishes, the exact tile is served');

// add real layers: a pattern filling text, plus a background pattern; render the document
await page.evaluate(async () => {
  TL.ui.setMode('pattern');
  const text = TL.doc.layers.find((l) => l.type === 'text');
  const bg = TL.make.pattern(window.__V.bg);
  bg.scale = 1;
  TL.doc.layers.unshift(bg);
  const fill = TL.make.pattern(window.__V.fill);
  fill.clipTo = text.id; fill.tile = 256;
  window.__V.fillId = fill.id;
  TL.doc.layers.push(fill);
  TL.st.layerId = fill.id;
  TL.commit('verify'); TL.emit('layers'); TL.ui.refresh && TL.ui.refresh();
  TL.view.request(true);
});
await page.waitForTimeout(6000);
await page.evaluate(() => TL.view.request(true));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/typelab-pattern-mode.png` });
console.log(`  screenshot: ${outDir}/typelab-pattern-mode.png`);

// pattern as text fill: the layer must be opaque inside the letters and transparent elsewhere
const clip = await page.evaluate(() => {
  const L = TL.layer(window.__V.fillId);
  const c = TL.render.layer(L, 0.5, false);
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let solid = 0, clear = 0;
  for (let i = 3; i < d.length; i += 4) { if (d[i] > 200) solid++; else if (d[i] < 10) clear++; }
  const n = d.length / 4;
  return { solid: solid / n, clear: clear / n };
});
check(clip.solid > 0.02 && clip.clear > 0.3, `pattern used as text fill is clipped to the letters (${(clip.solid * 100).toFixed(1)}% inside, ${(clip.clear * 100).toFixed(1)}% clear)`);

// full-resolution export of the composite (exports never use provisional tiles)
const exp = await page.evaluate(() => {
  const c = TL.render.composite(0.5, { useCache: false });
  return { w: c.width, h: c.height, url: c.toDataURL('image/png').length };
});
check(exp.w > 0 && exp.url > 10000, `document composite export renders (${exp.w}×${exp.h})`);

// SVG export embeds the raster tile; presets carry colours
const svg = await page.evaluate(() => {
  const L = TL.make.pattern(window.__V.svg);
  const s = TL.patterns.svgTile(L), sw = TL.patterns.svgSwatch(L);
  const withPresets = TL.texturelib.added.map((id) => TL.patterns.get(id)).filter((g) => g.presets && g.presets.some((p) => p.colors && p.colors.length));
  const g = withPresets[0];
  return { hasImage: s.includes('<image') && s.includes('data:image/png;base64'), swatch: sw.includes('<pattern'), gen: g ? g.id : null, presets: g ? g.presets.length : 0, none: !withPresets.length };
});
check(svg.hasImage && svg.swatch, 'SVG tile + swatch embed the tile as PNG');
check(svg.none || svg.presets > 0, svg.none ? 'presets: none of the installed patterns has colour presets (skipped)' : `presets exposed with colours (${svg.gen}: ${svg.presets})`);

// every preset, applied the way TypeLab's preset picker does (defaults + pr.p, then pr.colors), must render like
// the library's own preset: catches colour slots drifting out of alignment
const pre = await page.evaluate(() => {
  const PT = TL.patterns, X = TL.texturelib, T = X.lib, bad = [];
  let n = 0;
  for (const id of X.added) {
    const g = PT.get(id);
    for (const pr of g.presets || []) {
      const q = T.listPresets(g.tx.id).find((x) => x.name === pr.name);
      if (!q) continue;
      n++;
      const L = PT.defaults(id);
      L.p = Object.assign(L.p, pr.p);
      if (pr.colors && pr.colors.length) L.colors = pr.colors.slice();
      const a = T.render(g.tx.id, { width: 32, supersample: 1, params: X.paramsFor(L) }).data;
      const b = T.render(g.tx.id, { width: 32, supersample: 1, preset: q.id }).data;
      let d = 0; for (let k = 0; k < a.length; k++) d = Math.max(d, Math.abs(a[k] - b[k]));
      if (d > 2) bad.push(`${q.id} (max diff ${d})`);
    }
  }
  return { n, bad };
});
check(pre.bad.length === 0, `${pre.n} presets applied through TypeLab render like the library presets` + (pre.bad.length ? ': ' + pre.bad.join(', ') : ''));

// inspector shows the generator's controls
const insp = await page.evaluate(() => {
  const el = document.querySelector('#inspector');
  return { text: el ? el.innerText.slice(0, 600) : '', name: TL.patterns.get(window.__V.fill).name };
});
check(insp.text.toLowerCase().includes(insp.name.split(' ')[0].toLowerCase()), `pattern inspector shows the texturelib generator (${insp.name})`);

check(errors.length === 0, 'no page errors' + (errors.length ? ':\n    ' + errors.slice(0, 8).join('\n    ') : ''));
await browser.close();
console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed');
process.exit(fail ? 1 : 0);
