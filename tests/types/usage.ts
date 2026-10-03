// Compile-only check of the public types: npx tsc -p tests/types (run by npm run typecheck)
import { render, renderMaps, listPatterns, listPresets, featureCount, tileSizeFor, createSampler, defaults } from '../../src/index.js';
import { createPattern, createRenderer, toCanvas } from '../../src/browser.js';

const t = render('tartan', { width: 512, params: { sett: 'buffalo-check', countScale: 1, fuzz: 0.4 } });
const w: number = t.width; const d: Uint8ClampedArray = t.data;
const sett: string = t.params.sett;
render('dots', { preset: 'ditsy-floral', params: { background: 'transparent', shape: 'flower' } });
// @ts-expect-error unknown pattern id
render('not-a-pattern');
// @ts-expect-error wrong enum value
render('dots', { params: { shape: 'blob' } });
// @ts-expect-error unknown preset id
render('dots', { preset: 'nope' });
const m = renderMaps('bricks', { width: 256, normalFormat: 'directx' });
const hts: Float32Array = m.heights;
for (const p of listPatterns()) { const s = p.params; void s; const sp: string | null = p.scaleParam; void sp; }
const presets = listPresets('knit'); const knitParams = presets[0].params; void knitParams;
const fc = featureCount('plain-weave', { repeats: 16 }); const unit: string = fc.unit;
const px: number = tileSizeFor('knit', { stitchesAcross: 24 }, 8);
const smp = createSampler('marble', { veins: 2 }); const [r, g, b, a, h] = smp(0.5, 0.5);
const dflt = defaults('wood'); const planks: number = dflt.planks;
declare const ctx: CanvasRenderingContext2D;
ctx.fillStyle = createPattern(ctx, t, { scale: 0.5, rotation: 30 }) ?? '#000';
const canvas: HTMLCanvasElement = toCanvas(t);
const renderer = createRenderer({ workerUrl: 'js/vendor/texturelib.worker.js', workers: 2 });
renderer.render('leopard', { width: 512 }, { slot: 'layer-1' }).then((tile) => tile.data);
void [w, d, sett, hts, unit, px, r, g, b, a, h, planks, canvas];
