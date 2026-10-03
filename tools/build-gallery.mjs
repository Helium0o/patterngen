// node tools/build-gallery.mjs -> gallery.html (self-contained: the minified bundle is inlined)
import { readFileSync, writeFileSync } from 'node:fs';
const lib = readFileSync('dist/texturelib.min.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const tpl = readFileSync('tools/gallery.template.html', 'utf8');
if (!tpl.includes('/*__TL__*/')) throw new Error('template marker /*__TL__*/ missing');
writeFileSync('gallery.html', tpl.replace('/*__TL__*/', () => lib));
console.log('gallery.html', (readFileSync('gallery.html').length / 1024).toFixed(0) + ' KB');
