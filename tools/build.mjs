// node tools/build.mjs  (npm run build) -> dist/
//   texturelib.js         classic <script> / importScripts bundle, defines global `TextureLib` (readable)
//   texturelib.min.js     same, minified
//   texturelib.mjs        ES module bundle (readable)
//   texturelib.worker.js  classic worker for createRenderer({ workerUrl }) — loads texturelib.js next to it
// Uses esbuild through npx (fetched on first run; the library itself has no dependencies).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const banner = `/*! texturelib ${version} — seamless procedural patterns & textures. Zero dependencies.
 * Docs: README.md · INTEGRATION.md · PATTERNS.md (generated from src/, do not edit this bundle by hand)
 * Global build: <script src="texturelib.js"></script> then TextureLib.render('houndstooth', { width: 512 }) */`;
mkdirSync('dist', { recursive: true });
const esbuild = (args) => execFileSync('npx', ['--yes', 'esbuild@0.28.2', 'src/browser.js', '--bundle', '--target=es2020', '--log-level=error', `--banner:js=${banner}`, ...args], { stdio: 'inherit' });
esbuild(['--format=iife', '--global-name=TextureLib', '--outfile=dist/texturelib.js']);
esbuild(['--format=iife', '--global-name=TextureLib', '--minify', '--outfile=dist/texturelib.min.js']);
esbuild(['--format=esm', '--outfile=dist/texturelib.mjs']);
writeFileSync('dist/texturelib.worker.js', `/*! texturelib ${version} worker — classic Web Worker for TextureLib.createRenderer({ workerUrl: '<path>/texturelib.worker.js' }).
 * Keep this file next to texturelib.js (importScripts resolves relative to this file). */
importScripts('texturelib.js');
TextureLib.serveWorker(self);
`);
writeFileSync('dist/texturelib.d.ts', `// Types for dist/texturelib.mjs (same API as src/browser.js)\nexport * from '../src/browser';\n`);
writeFileSync('dist/texturelib.global.d.ts', `// Types for the classic build: <script src="texturelib.js"> defines this global\ndeclare const TextureLib: typeof import('../src/browser');\n`);
for (const f of ['texturelib.js', 'texturelib.min.js', 'texturelib.mjs']) console.log(f, (readFileSync('dist/' + f).length / 1024).toFixed(0) + ' KB');
