#!/usr/bin/env node
// texturelib command line — render seamless PNG tiles without writing code.
//   texturelib list                         pattern ids by category
//   texturelib info <id>                    params (schema) + presets of one pattern
//   texturelib presets [id]                 preset ids
//   texturelib render <id> [options]        write a PNG
//     --size 512 | --width W --height H     output size (non-square = whole tiles)
//     --params '{"band":4}'                 params as JSON
//     --preset <presetId>                   preset (params override it)
//     --output color|height|normal          map type, or --maps for all three (<out>-color/height/normal.png)
//     --supersample 1..4                    quality (default 2)
//     --out file.png                        default: <id>.png
import { listPatterns, listPresets, render, renderMaps, CATEGORIES, getPattern } from '../src/index.js';
import { writePNG } from '../tools/png.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf('--' + k); return i >= 0 ? rest[i + 1] : d; };
const flag = (k) => rest.includes('--' + k);
const die = (m) => { console.error(m); process.exit(1); };

if (!cmd || cmd === 'help' || flag('help')) {
  console.log(readHelp());
} else if (cmd === 'list') {
  const all = listPatterns();
  for (const c of CATEGORIES) console.log(`${c}: ${all.filter((p) => p.category === c).map((p) => p.id).join(', ')}`);
} else if (cmd === 'info') {
  const p = listPatterns().find((x) => x.id === rest[0]) || die(`unknown pattern "${rest[0]}" (texturelib list)`);
  console.log(JSON.stringify(p, null, 2));
} else if (cmd === 'presets') {
  for (const pr of listPresets(rest[0])) console.log(`${pr.id.padEnd(28)} ${pr.pattern.padEnd(18)} ${pr.name}`);
} else if (cmd === 'render') {
  const id = rest[0];
  if (!getPattern(id)) die(`unknown pattern "${id}" (texturelib list)`);
  let params = {};
  try { params = JSON.parse(opt('params', '{}')); } catch (e) { die('--params must be JSON'); }
  const size = +opt('size', 512), width = +opt('width', size), height = +opt('height', width);
  const common = { width, height, params, preset: opt('preset'), supersample: +opt('supersample', 2), normalStrength: opt('normal-strength') ? +opt('normal-strength') : undefined };
  const out = opt('out', `${id}.png`);
  const t0 = Date.now();
  if (flag('maps')) {
    const m = renderMaps(id, common), base = out.replace(/\.png$/i, '');
    writePNG(`${base}-color.png`, { width: m.width, height: m.height, data: m.color });
    writePNG(`${base}-height.png`, { width: m.width, height: m.height, data: m.heightMap });
    writePNG(`${base}-normal.png`, { width: m.width, height: m.height, data: m.normalMap });
    console.log(`${base}-{color,height,normal}.png  ${m.width}×${m.height}  ${Date.now() - t0} ms`);
  } else {
    const img = render(id, { ...common, output: opt('output', 'color') });
    writePNG(out, img);
    console.log(`${out}  ${img.width}×${img.height}  ${Date.now() - t0} ms  params=${JSON.stringify(img.params)}`);
  }
} else die(`unknown command "${cmd}" — try: texturelib help`);

function readHelp() {
  return `texturelib — seamless procedural patterns
  texturelib list | info <id> | presets [id]
  texturelib render <id> [--size 512] [--width W --height H] [--params '{...}'] [--preset id]
                         [--output color|height|normal | --maps] [--supersample 1-4] [--out file.png]`;
}
