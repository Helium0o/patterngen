// node tools/quick.mjs <id> [size] [jsonParams] -> scratch/<id>.png (2x2 tiled to show seams)
import { render } from '../src/index.js';
import { writePNG } from './png.mjs';
import { mkdirSync } from 'node:fs';
const [id, size = '256', json = '{}'] = process.argv.slice(2);
const t = performance.now();
const img = render(id, { width: +size, params: JSON.parse(json) });
const ms = performance.now() - t;
const W = img.width * 2, H = img.height * 2, d = new Uint8ClampedArray(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const s = ((y % img.height) * img.width + (x % img.width)) * 4, k = (y * W + x) * 4;
  d[k] = img.data[s]; d[k+1] = img.data[s+1]; d[k+2] = img.data[s+2]; d[k+3] = 255;
}
mkdirSync(process.env.OUT || 'scratch', { recursive: true });
writePNG(`${process.env.OUT || 'scratch'}/${id}.png`, { width: W, height: H, data: d });
console.log(id, ms.toFixed(0) + 'ms');
