// Verify the texturelib adapter inside a real TypeLab checkout, in headless Chromium.
//
//   node integrations/typelab/verify-in-typelab.mjs <path-to-typelab>/app/index.html [outDir]
//
// Needs Playwright (npm i -D playwright, or a global install reachable through NODE_PATH) and a
// Chromium it can launch. The page is opened from file:// with file access enabled, like Electron.
// Checks: no page errors, every tx-* generator renders a non-blank tile inside TypeLab, worker
// rendering works, live provisional tiles get replaced, SVG export embeds the tile, pattern-as-text-
// fill works, presets carry colours. Writes screenshots to outDir (default ./typelab-verify).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.error('Playwright not found: npm i -D playwright (or set NODE_PATH to a global install).');
  process.exit(2);
}
const [indexHtml, outDir = 'typelab-verify'] = process.argv.slice(2);
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

const info = await page.evaluate(() => ({
  hasLib: !!window.TextureLib, hasAdapter: !!(TL.texturelib && TL.texturelib.added),
  added: TL.texturelib ? TL.texturelib.added.length : 0, total: window.TextureLib ? TextureLib.PATTERNS.length : -1,
  genCount: TL.patterns.list.length, cats: TL.patterns.cats(),
}));
check(info.hasLib && info.hasAdapter, 'TextureLib + adapter loaded');
check(info.added === info.total && info.added > 0, `all ${info.total} texturelib patterns registered (${info.added}); TypeLab now has ${info.genCount} generators`);
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
  const L = TL.make.pattern('tx-leopard');
  const t0 = performance.now();
  const c = await TL.patterns.tileCanvasAsync(L, 512);
  const r = TL.texturelib.renderer;
  return { w: c.width, ms: Math.round(performance.now() - t0), workers: r ? r.workers : 0, bands: r ? r.stats.workerBands : 0 };
});
check(worker.w === 512 && worker.workers > 0 && worker.bands > 0, `tileCanvasAsync on ${worker.workers} workers: 512 px leopard in ${worker.ms} ms (${worker.bands} bands)`);

// live view: provisional tile first, exact one after the workers finish
const live = await page.evaluate(async () => {
  const L = TL.make.pattern('tx-tartan');
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
  const bg = TL.make.pattern('tx-knit');
  bg.p.stitch = 'stockinette'; bg.scale = 1;
  TL.doc.layers.unshift(bg);
  const fill = TL.make.pattern('tx-sequins');
  fill.clipTo = text.id; fill.tile = 256;
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

// full-resolution export of the composite (exports never use provisional tiles)
const exp = await page.evaluate(() => {
  const c = TL.render.composite(0.5, { useCache: false });
  return { w: c.width, h: c.height, url: c.toDataURL('image/png').length };
});
check(exp.w > 0 && exp.url > 10000, `document composite export renders (${exp.w}×${exp.h})`);

// SVG export embeds the raster tile; presets carry colours
const svg = await page.evaluate(() => {
  const L = TL.make.pattern('tx-houndstooth');
  const s = TL.patterns.svgTile(L), sw = TL.patterns.svgSwatch(L);
  const g = TL.patterns.get('tx-dots');
  return { hasImage: s.includes('<image') && s.includes('data:image/png;base64'), swatch: sw.includes('<pattern'), presets: (g.presets || []).length, presetColors: !!(g.presets && g.presets[0].colors && g.presets[0].colors.length) };
});
check(svg.hasImage && svg.swatch, 'SVG tile + swatch embed the tile as PNG');
check(svg.presets > 0 && svg.presetColors, `presets exposed with colours (dots: ${svg.presets})`);

// inspector shows the generator's controls
const insp = await page.evaluate(() => document.querySelector('#inspector') ? document.querySelector('#inspector').innerText.slice(0, 400) : '');
check(/Sequins/i.test(insp), 'pattern inspector shows the texturelib generator');

check(errors.length === 0, 'no page errors' + (errors.length ? ':\n    ' + errors.slice(0, 8).join('\n    ') : ''));
await browser.close();
console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed');
process.exit(fail ? 1 : 0);
