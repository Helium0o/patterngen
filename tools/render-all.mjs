// node tools/render-all.mjs [size]
// Renders every pattern (defaults) + every preset to previews/, colour/height/normal maps for
// material-type patterns, and writes previews/timings.json (ms per pattern at size² with supersample 2).
import { PATTERNS, PRESETS, render, renderMaps } from '../src/index.js';
import { writePNG } from './png.mjs';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const SIZE = +(process.argv[2] || 512);
const PRESET_SIZE = Math.round(SIZE / 2);
rmSync('previews', { recursive: true, force: true });
mkdirSync('previews/presets', { recursive: true });
mkdirSync('previews/maps', { recursive: true });

export const MAPS = ['denim', 'cable-knit', 'quilted', 'bricks', 'leather', 'knit', 'corduroy', 'voronoi-cells', 'snakeskin', 'wood'];

const timings = {};
const t0 = performance.now();
for (const pat of PATTERNS) {
  const t = performance.now();
  const img = render(pat.id, { width: SIZE, supersample: 2 });
  timings[pat.id] = +(performance.now() - t).toFixed(0);
  writePNG(`previews/${pat.id}.png`, img);
  process.stdout.write(`${pat.id} ${timings[pat.id]}ms\n`);
}
for (const pr of PRESETS) {
  writePNG(`previews/presets/${pr.id}.png`, render(pr.pattern, { width: PRESET_SIZE, supersample: 2, preset: pr.id }));
}
console.log(`presets: ${PRESETS.length}`);
for (const id of MAPS) {
  const params = id === 'voronoi-cells' ? PRESETS.find((p) => p.id === 'cobblestone').params : {};
  const m = renderMaps(id, { width: PRESET_SIZE, params, normalStrength: 6 });
  writePNG(`previews/maps/${id}-color.png`, { width: m.width, height: m.height, data: m.color });
  writePNG(`previews/maps/${id}-height.png`, { width: m.width, height: m.height, data: m.heightMap });
  writePNG(`previews/maps/${id}-normal.png`, { width: m.width, height: m.height, data: m.normalMap });
}
writeFileSync('previews/timings.json', JSON.stringify({ size: SIZE, supersample: 2, node: process.version, ms: timings }, null, 1) + '\n');
console.log(`total ${((performance.now() - t0) / 1000).toFixed(1)}s`);
