// node tools/dev.mjs <category> <id> [size] [jsonParams] [--ss N] [--tile2]
// Renders one pattern straight from its category module (works while other modules are mid-edit).
// Output: scratch/<id>.png (and scratch/<id>-h.png height map).
import { rasterize } from '../src/core/raster.js';
import { resolveParams } from '../src/core/params.js';
import { writePNG } from './png.mjs';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const ss = +flag('--ss', 2);
const name = flag('--name', null);
const [cat, id, size = '384', json = '{}'] = args;
const mod = await import(`../src/patterns/${cat}.js`);
const pat = mod.default.find((p) => p.id === id);
if (!pat) { console.error('no pattern', id, 'in', cat, mod.default.map((p) => p.id)); process.exit(1); }
const p = resolveParams(pat.params, JSON.parse(json));
const t0 = performance.now();
const st = pat.prepare(p, { width: +size, height: +size, tiles: [1, 1] });
const img = rasterize(+size, +size, (u, v, o, c) => pat.sample(u, v, o, c, st), { supersample: ss, output: 'maps' });
const ms = performance.now() - t0;
mkdirSync('scratch', { recursive: true });
const out = name || id;
writePNG(`scratch/${out}.png`, { width: img.width, height: img.height, data: img.color });
writePNG(`scratch/${out}-h.png`, { width: img.width, height: img.height, data: img.heightMap });
writePNG(`scratch/${out}-n.png`, { width: img.width, height: img.height, data: img.normalMap });
console.log(out, ms.toFixed(0) + 'ms');
