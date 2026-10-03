// Install texturelib into a TypeLab checkout (idempotent — safe to run again after updating texturelib).
//
//   node integrations/typelab/install.mjs <path-to-typelab> [--dry-run] [--no-ui-tweaks]
//
// 1. copies   dist/texturelib.js, dist/texturelib.worker.js   -> <typelab>/app/js/vendor/
//             integrations/typelab/texturelib-typelab.js      -> <typelab>/app/js/
// 2. edits    app/index.html: loads both scripts right after js/patterns.js
// 3. optional UI tweaks in app/js/ui/mode-pattern.js (skip with --no-ui-tweaks):
//      a) presets also apply their colours      b) colour slots show a tooltip with their meaning
//      c) "Tile .png" / tile pack export big texturelib tiles on Web Workers
// Every edit is anchored on exact TypeLab source lines; if TypeLab changed and an anchor is missing,
// the step is skipped with a message explaining the manual change (nothing is half-applied).
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const lib = resolve(here, '../..');
const args = process.argv.slice(2);
const dry = args.includes('--dry-run'), noTweaks = args.includes('--no-ui-tweaks');
const root = args.find((a) => !a.startsWith('--'));
if (!root || !existsSync(join(root, 'app', 'index.html'))) {
  console.error('usage: node integrations/typelab/install.mjs <path-to-typelab-checkout> [--dry-run] [--no-ui-tweaks]\n(the folder that contains app/index.html)');
  process.exit(2);
}
for (const f of ['dist/texturelib.js', 'dist/texturelib.worker.js']) {
  if (!existsSync(join(lib, f))) { console.error(`missing ${f} — run "npm run build" in the texturelib repo first`); process.exit(2); }
}
const log = (...m) => console.log(dry ? '[dry-run]' : '', ...m);
let warnings = 0;

// 1. files
const copies = [
  ['dist/texturelib.js', 'app/js/vendor/texturelib.js'],
  ['dist/texturelib.worker.js', 'app/js/vendor/texturelib.worker.js'],
  ['integrations/typelab/texturelib-typelab.js', 'app/js/texturelib-typelab.js'],
];
for (const [from, to] of copies) {
  if (!dry) { mkdirSync(dirname(join(root, to)), { recursive: true }); copyFileSync(join(lib, from), join(root, to)); }
  log(`copied ${from} -> ${to}`);
}

// 2. + 3. edits
function edit(file, steps) {
  const path = join(root, file);
  let src = readFileSync(path, 'utf8');
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  let changed = false;
  for (const st of steps) {
    const done = st.done.replace(/\n/g, eol), anchor = st.anchor.replace(/\n/g, eol), repl = st.replace.replace(/\n/g, eol);
    if (src.includes(done)) { log(`${file}: ${st.name} — already applied`); continue; }
    if (!src.includes(anchor)) { warnings++; console.warn(`WARNING ${file}: ${st.name} — anchor not found, skipped.\n  Manual change: ${st.manual}`); continue; }
    src = src.replace(anchor, repl);
    changed = true;
    log(`${file}: ${st.name} — applied`);
  }
  if (changed && !dry) writeFileSync(path, src);
}

edit('app/index.html', [{
  name: 'load texturelib + adapter after patterns.js',
  done: '<script src="js/texturelib-typelab.js"></script>',
  anchor: '  <script src="js/patterns.js"></script>\n',
  replace: '  <script src="js/patterns.js"></script>\n  <script src="js/vendor/texturelib.js"></script>\n  <script src="js/texturelib-typelab.js"></script>\n',
  manual: 'add <script src="js/vendor/texturelib.js"></script> and <script src="js/texturelib-typelab.js"></script> right after the js/patterns.js script tag.',
}]);

if (!noTweaks) {
  edit('app/js/ui/mode-pattern.js', [
    {
      name: 'presets apply their colours',
      done: 'if (pr.colors && pr.colors.length) L.colors = pr.colors.slice();',
      anchor: "          L.p = Object.assign(PT().defaults(L.gen).p, pr.p, keep);\n",
      replace: "          L.p = Object.assign(PT().defaults(L.gen).p, pr.p, keep);\n          if (pr.colors && pr.colors.length) L.colors = pr.colors.slice(); // texturelib presets carry their colours\n",
      manual: 'in the preset picker onChange, after "L.p = Object.assign(...)", add: if (pr.colors && pr.colors.length) L.colors = pr.colors.slice();',
    },
    {
      name: 'colour slot tooltips',
      done: "title: g.colorLabels ? g.colorLabels[i] || '' : ''",
      anchor: "h('span', { class: 'dim', style: { width: '30px' } }, i === 0 ? 'bg' : '#' + i),",
      replace: "h('span', { class: 'dim', style: { width: '30px' }, title: g.colorLabels ? g.colorLabels[i] || '' : '' }, i === 0 ? 'bg' : '#' + i),",
      manual: "in colorsSection, give the 'bg' / '#i' label span a title: g.colorLabels ? g.colorLabels[i] : ''",
    },
    {
      name: 'PNG tile export on workers',
      done: 'PT().tileCanvasAsync ? await PT().tileCanvasAsync(L, px)',
      anchor: 'const pngTile = async (px) => { const c = U.cloneCanvas(PT().tileCanvas(L, px)); return U.canvasToBlob(c); };',
      replace: 'const pngTile = async (px) => { const c = U.cloneCanvas(PT().tileCanvasAsync ? await PT().tileCanvasAsync(L, px) : PT().tileCanvas(L, px)); return U.canvasToBlob(c); };',
      manual: 'in exportSection, make pngTile use: PT().tileCanvasAsync ? await PT().tileCanvasAsync(L, px) : PT().tileCanvas(L, px)',
    },
  ]);
}

console.log(`\nDone${warnings ? ` with ${warnings} warning(s)` : ''}. Next:
  1. verify:   NODE_PATH=$(npm root -g) node ${join(here, 'verify-in-typelab.mjs')} ${join(resolve(root), 'app', 'index.html')}
               (needs a global Playwright: npm i -g playwright && npx playwright install chromium)
  2. try it:   cd ${resolve(root)} && npm start   → Pattern workspace → "Fabrics · woven" etc.
  3. ship:     npm run dist   (electron-builder already packages app/**/*)
  Commit in TypeLab: app/index.html, app/js/ui/mode-pattern.js, app/js/texturelib-typelab.js, app/js/vendor/texturelib*.js`);
process.exit(warnings ? 1 : 0);
