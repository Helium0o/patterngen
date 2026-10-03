// node examples/node-render.mjs -> scratch/example-*.png
// Node usage: render tiles and material maps to PNG (tools/png.mjs is a tiny dependency-free encoder).
import { render, renderMaps, renderArea } from '../src/index.js';
import { writePNG } from '../tools/png.mjs';
import { mkdirSync } from 'node:fs';

mkdirSync('scratch', { recursive: true });
// a seamless tile with custom params (anything invalid is clamped, never throws)
writePNG('scratch/example-tartan.png', render('tartan', { width: 512, params: { sett: 'custom', threadcount: 'R8 K2 R8 W1 R8 K16', countScale: 1 } }));
// a preset, rendered on a non-square canvas = 2×1 whole tiles
writePNG('scratch/example-wide.png', render('dots', { width: 1024, height: 512, preset: 'ditsy-floral' }));
// transparent background: motif-only PNG for compositing
writePNG('scratch/example-transparent.png', render('eyelet-lace', { width: 512, preset: 'eyelet-see-through' }));
// fill a 1200×300 banner by repeating a 200 px tile (fast pixel copy)
writePNG('scratch/example-banner.png', renderArea('herringbone', { width: 1200, height: 300, tileSize: 200 }));
// PBR-ish maps in one pass
const m = renderMaps('leather', { width: 512, normalStrength: 6 });
writePNG('scratch/example-leather-normal.png', { width: m.width, height: m.height, data: m.normalMap });
console.log('wrote scratch/example-*.png');
