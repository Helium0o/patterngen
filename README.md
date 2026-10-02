# texturelib

45 procedural, **seamless**, **deterministic** patterns for apps — fabrics for clothes (weaves, tartan, houndstooth, knits, cables, Fair Isle, denim, corduroy, sequins, shibori…), print/graphic patterns (dots, stripes, chevron, argyle, Truchet, Islamic star, seigaiha, halftone…) and materials (marble, wood, leather, animal prints, camo, reaction–diffusion, Voronoi). Zero dependencies, plain ES modules, browser + Node.

```js
import { render } from './src/index.js';
const img = render('houndstooth', { width: 512, params: { band: 4, colors: ['#111', '#eee'] } });
ctx.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
```

- Catalog with every parameter: [PATTERNS.md](PATTERNS.md) · machine-readable: `patterns.json`
- How it works / how to extend: [CLAUDE.md](CLAUDE.md) · research & sources: [RESEARCH.md](RESEARCH.md)
- Previews: `previews/*.png`, `previews/sheets/*.png`, material maps in `previews/maps/`
- `npm test` — 330+ checks (exact periodicity, determinism, seams, fuzzed params, textbook weave definitions)
- Browser demo: serve the folder (`npx serve .` or `python3 -m http.server`) and open `examples/browser.html`
