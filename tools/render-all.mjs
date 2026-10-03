// node tools/render-all.mjs [size]   (npm run render; then npm run sheets)
// Renders every pattern (defaults) + every preset + colour/height/normal maps as lossless PNGs into
// previews/png/ (git-ignored working files) and writes previews/timings.json (ms per pattern at size²,
// supersample 2). tools/make-sheets.py turns them into the committed JPEG previews + contact sheets.
import { PATTERNS, PRESETS, render, renderMaps } from '../src/index.js';
import { writePNG } from './png.mjs';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const SIZE = +(process.argv[2] || 512);
const PRESET_SIZE = Math.round(SIZE / 2);
const OUT = 'previews/png';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/presets`, { recursive: true });
mkdirSync(`${OUT}/maps`, { recursive: true });

export const MAPS = ['denim', 'cable-knit', 'quilted', 'bricks', 'leather', 'knit', 'corduroy', 'voronoi-cells', 'snakeskin', 'wood'];

const timings = {};
const t0 = performance.now();
for (const pat of PATTERNS) {
  const t = performance.now();
  const img = render(pat.id, { width: SIZE, supersample: 2 });
  timings[pat.id] = +(performance.now() - t).toFixed(0);
  writePNG(`${OUT}/${pat.id}.png`, img);
  process.stdout.write(`${pat.id} ${timings[pat.id]}ms\n`);
}
for (const pr of PRESETS) {
  writePNG(`${OUT}/presets/${pr.id}.png`, render(pr.pattern, { width: PRESET_SIZE, supersample: 2, preset: pr.id }));
}
console.log(`presets: ${PRESETS.length}`);
for (const id of MAPS) {
  const params = id === 'voronoi-cells' ? PRESETS.find((p) => p.id === 'cobblestone').params : {};
  const m = renderMaps(id, { width: PRESET_SIZE, params, normalStrength: 6 });
  writePNG(`${OUT}/maps/${id}-color.png`, { width: m.width, height: m.height, data: m.color });
  writePNG(`${OUT}/maps/${id}-height.png`, { width: m.width, height: m.height, data: m.heightMap });
  writePNG(`${OUT}/maps/${id}-normal.png`, { width: m.width, height: m.height, data: m.normalMap });
}
writeFileSync('previews/timings.json', JSON.stringify({ size: SIZE, supersample: 2, node: process.version, ms: timings }, null, 1) + '\n');
console.log(`total ${((performance.now() - t0) / 1000).toFixed(1)}s`);
