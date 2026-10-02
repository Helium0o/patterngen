// node tools/render-all.mjs [size]
// Renders every pattern (defaults) + curated variants to previews/, plus height/normal maps for
// material-type patterns, and writes previews/timings.json.
import { PATTERNS, render } from '../src/index.js';
import { writePNG } from './png.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const SIZE = +(process.argv[2] || 512);
mkdirSync('previews/variants', { recursive: true });
mkdirSync('previews/maps', { recursive: true });

export const VARIANTS = [
  ['knit', 'knit-rib-2x2', { stitch: 'rib-2x2', color: '#2f4858' }],
  ['knit', 'knit-seed', { stitch: 'seed', color: '#6c8e54' }],
  ['knit', 'knit-basketweave', { stitch: 'basketweave', color: '#c9a66b', stitchesAcross: 24 }],
  ['fair-isle', 'fair-isle-snowflake', { chart: 'snowflake', colors: ['#20304a', '#f4f1e8'], stitchesAcross: 27 }],
  ['tartan', 'tartan-buffalo', { preset: 'buffalo-check', countScale: 1, repeats: 2 }],
  ['tartan', 'tartan-four-colour', { preset: 'four-colour', countScale: 1 }],
  ['tartan', 'tartan-custom-hex', { preset: 'custom', threadcount: '#2d3047/24 #e0a458/4 #2d3047/8 #93b7be/16', countScale: 1 }],
  ['twill', 'twill-3-1-S', { over: 3, under: 1, direction: 'S', warp: '#5c3c2e', weft: '#e6d5b8' }],
  ['satin', 'satin-8-weft', { shafts: 8, face: 'weft', warp: '#0f3b57', weft: '#c8d9e6' }],
  ['houndstooth', 'puppytooth-red', { band: 2, repeats: 8, colors: ['#7b1113', '#efe6d8'] }],
  ['houndstooth', 'houndstooth-flat', { style: 'flat', repeats: 3 }],
  ['herringbone', 'herringbone-draft', { style: 'draft', repeats: 4 }],
  ['dots', 'dots-tossed-stars', { layout: 'tossed', shape: 'star', rotate: true, sizeJitter: 0.6, size: 0.3, colors: ['#ffb703', '#fb8500', '#219ebc'], background: '#023047', cells: 9 }],
  ['dots', 'dots-hearts-brick', { layout: 'brick', shape: 'heart', size: 0.3, colors: ['#e5383b'], background: '#ffe5ec' }],
  ['dots', 'dots-rings', { layout: 'block', shape: 'ring', colors: ['#1d3557'], background: '#f1faee', cells: 10 }],
  ['stripes', 'stripes-pinstripe', { colors: ['#e8e6e1', '#22262e'], widths: '1 16', direction: 'vertical', repeats: 12 }],
  ['stripes', 'stripes-diagonal-retro', { colors: ['#f4a259', '#5b8e7d', '#f4e285', '#bc4b51'], widths: '3 2 1 2', direction: 'diagonal', repeats: 4 }],
  ['truchet', 'truchet-maze', { variant: 'maze', cells: 16, colors: ['#111', '#f5f0e6', '#111'], lineWidth: 0.12 }],
  ['truchet', 'truchet-triangles', { variant: 'triangles', cells: 8, lineWidth: 0, colors: ['#f6bd60', '#84a59d', '#000000'] }],
  ['islamic-star', 'islamic-square-60', { tiling: '4.4.4.4', angle: 60, repeats: 4, colors: ['#f2e9dc', '#8c2f39', '#461220'] }],
  ['voronoi-cells', 'voronoi-cracked-earth', { style: 'cracked-earth', colors: ['#b5835a', '#a87449', '#c4935f'], edgeColor: '#3b2a1d', edge: 0.06, cells: 7 }],
  ['voronoi-cells', 'voronoi-cobblestone', { style: 'cobblestone', colors: ['#8d8d8d', '#7a7a7a', '#a39e93'], edgeColor: '#2b2b2b', cells: 6, edge: 0.12 }],
  ['leopard', 'cheetah', { style: 'cheetah' }],
  ['zebra', 'tiger', { style: 'tiger' }],
  ['camouflage', 'camo-digital', { style: 'digital', colors: ['#c2b280', '#8b7d5b', '#5e5340', '#3a3226'] }],
  ['reaction-diffusion', 'rd-mitosis', { preset: 'mitosis', colors: ['#fff8f0', '#f08080', '#6b2737'] }],
  ['reaction-diffusion', 'rd-maze', { preset: 'maze', colors: ['#111111', '#eeeeee'] }],
  ['reaction-diffusion', 'rd-worms', { preset: 'worms', colors: ['#14213d', '#fca311', '#e5e5e5'] }],
  ['shibori', 'shibori-arashi', { style: 'arashi' }],
  ['shibori', 'shibori-kumo', { style: 'kumo' }],
  ['quilted', 'quilted-channel', { layout: 'channel', cells: 6, color: '#7a8b5c' }],
  ['mesh', 'mesh-hex-tulle', { layout: 'hex', cells: 12, yarn: 0.06, color: '#f5f5f5', backing: '#2b2d42' }],
  ['noise', 'noise-ridged-terrain', { mode: 'ridged', colors: ['#1b4332', '#52b788', '#d8f3dc', '#ffffff'], frequency: 3 }],
  ['noise', 'noise-warped-sunset', { warp: 1, colors: ['#2d1e2f', '#7b2d43', '#e05e3c', '#f7b267', '#fef3e2'], frequency: 2 }],
  ['honeycomb', 'honeycomb-bevel', { style: 'bevel', colors: ['#3a86ff', '#4895ef', '#4361ee'], background: '#0b0f2a' }],
  ['contour-lines', 'contour-hypsometric', { fill: true, colors: ['#ffffff', '#3d2b1f'] }],
  ['cross-stitch', 'cross-stitch-flower', { chart: 'flower', repeats: 3 }],
  ['bricks', 'subway-tiles', { bond: 'running', cols: 6, rows: 14, colors: ['#f4f4f2', '#ecebe7', '#f8f8f6'], mortarColor: '#9aa0a6', roughness: 0.15 }],
];

const MAPS = ['denim', 'cable-knit', 'quilted', 'bricks', 'leather', 'knit', 'corduroy', 'voronoi-cells'];

const timings = {};
const t0 = performance.now();
for (const pat of PATTERNS) {
  const t = performance.now();
  const img = render(pat.id, { width: SIZE, supersample: 2 });
  timings[pat.id] = +(performance.now() - t).toFixed(0);
  writePNG(`previews/${pat.id}.png`, img);
  process.stdout.write(`${pat.id} ${timings[pat.id]}ms\n`);
}
for (const [id, name, params] of VARIANTS) {
  writePNG(`previews/variants/${name}.png`, render(id, { width: SIZE, supersample: 2, params }));
  process.stdout.write(`variant ${name}\n`);
}
for (const id of MAPS) {
  const params = id === 'voronoi-cells' ? VARIANTS.find((v) => v[1] === 'voronoi-cobblestone')[2] : {};
  writePNG(`previews/maps/${id}-color.png`, render(id, { width: SIZE, params }));
  writePNG(`previews/maps/${id}-height.png`, render(id, { width: SIZE, params, output: 'height' }));
  writePNG(`previews/maps/${id}-normal.png`, render(id, { width: SIZE, params, output: 'normal', normalStrength: 6 }));
}
writeFileSync('previews/timings.json', JSON.stringify({ size: SIZE, supersample: 2, node: process.version, ms: timings }, null, 1));
console.log(`total ${((performance.now() - t0) / 1000).toFixed(1)}s`);
