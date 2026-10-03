// TypeLab ⇄ texturelib adapter — registers every texturelib pattern as a TypeLab Pattern-workspace
// generator ("raster generator"). Drop-in: it wraps a few TL.patterns functions instead of editing
// them, so TypeLab's own vector generators keep working exactly as before.
//
// Load order in app/index.html (classic scripts, after patterns.js, before ui/*.js):
//   <script src="js/patterns.js"></script>
//   <script src="js/vendor/texturelib.js"></script>        <!-- defines window.TextureLib -->
//   <script src="js/texturelib-typelab.js"></script>       <!-- this file -->
// and copy dist/texturelib.worker.js next to texturelib.js (js/vendor/).
//
// What it does
//   * PT.list gets one generator per texturelib pattern, id "tx-<pattern id>" (e.g. "tx-tartan"),
//     grouped in their own gallery categories. Params map to TypeLab controls (slider / select /
//     toggle / text, seed slider with dice); texturelib's "advanced" params go in the Advanced fold.
//   * Colour params map to the layer's Colors panel (L.colors), so colourways, shuffle and the
//     colour fields work. "Fill background" off = the pattern's background param becomes transparent.
//   * texturelib presets appear in the generator's Preset picker (pr.colors holds their colours).
//   * Rendering: live view renders tiles on Web Workers (texturelib.worker.js) and shows a quick
//     provisional tile meanwhile (TL.fx.provisional, the same mechanism Embroidery uses); exports
//     and thumbnails render synchronously at exact size. PT.tileCanvasAsync(L, px) renders big
//     tiles on the workers (use it for PNG tile export).
//   * SVG export embeds the tile as a PNG <image> (raster patterns have no vector form).
//
// Optional config BEFORE this script: window.TEXTURELIB_TYPELAB = { workerUrl, workers, include: [...ids], exclude: [...ids], categories: {woven: '…'} }
(function (TL) {
  'use strict';
  const T = window.TextureLib;
  if (!TL || !TL.patterns || !T) {
    console.warn('texturelib-typelab: needs TL.patterns (patterns.js) and window.TextureLib (texturelib.js) loaded first');
    return;
  }
  const PT = TL.patterns, U = TL.util;
  const CFG = Object.assign({ workers: 3 }, window.TEXTURELIB_TYPELAB || {});
  const PREFIX = 'tx-';
  const CATS = Object.assign({
    woven: 'Fabrics · woven', knit: 'Fabrics · knit', textile: 'Fabrics · surfaces',
    geometric: 'Prints · geometric', organic: 'Materials · organic',
  }, CFG.categories || {});
  const BG_KEYS = ['background', 'backing']; // colour params that "Fill background: off" turns transparent
  const FIRST_KEYS = ['background', 'backing', 'fabric', 'base', 'ground', 'paper']; // shown first (TypeLab labels slot 0 "bg")
  const SYNC_MAX = 192;   // tiles up to this size render synchronously even in live view (cheap)
  const LIVE_MAX = 2048;  // live view never renders bigger tiles than this (upscaled beyond)

  // ---------------------------------------------------------------- schema -> TypeLab params
  const isColorType = (s) => s.type === 'color' || s.type === 'colors';
  function toTLParam(k, s) {
    const label = s.label || k;
    if (s.type === 'enum') return { k, label, type: 'select', options: s.options.map(String), def: String(s.default) };
    if (s.type === 'bool') return { k, label, type: 'bool', def: !!s.default };
    if (s.type === 'string') return { k, label, type: 'text', def: s.default };
    if (s.type === 'seed') return { k, label: 'Seed', min: 1, max: 9999, def: Math.max(1, s.default | 0), step: 1, seed: true };
    if (s.type === 'int') return { k, label, min: s.min, max: s.max, def: s.default, step: 1 };
    return { k, label, min: s.min, max: s.max, def: s.default, step: s.step || +((s.max - s.min) / 100).toPrecision(1) };
  }

  /** Colour slots: background-like params first, then the rest in schema order. */
  function colorSlots(schema) {
    // colour params whose default is fully transparent (e.g. optional centre dots) stay off the colour list:
    // TypeLab's colour fields have no alpha, editing them would make them opaque by accident
    const clear = (s) => s.type === 'color' && (T.parseColor(s.default) || [0, 0, 0, 1])[3] === 0;
    const keys = Object.keys(schema).filter((k) => isColorType(schema[k]) && !clear(schema[k]));
    const rank = (k) => (FIRST_KEYS.includes(k) ? FIRST_KEYS.indexOf(k) : 99);
    keys.sort((a, b) => rank(a) - rank(b)); // stable: everything else keeps schema order
    const slots = keys.map((k) => ({ key: k, type: schema[k].type, def: schema[k].default, len: schema[k].type === 'colors' ? schema[k].default.length : 1, max: schema[k].maxItems || 16, label: schema[k].label || k }));
    const variable = slots.filter((s) => s.type === 'colors').pop();
    return { slots, varKey: variable ? variable.key : null, bgKey: keys.find((k) => BG_KEYS.includes(k)) || null };
  }

  /** L (TypeLab layer) -> texturelib params. */
  function paramsFor(g, L) {
    const p = Object.assign({}, L.p || {});
    const cols = Array.isArray(L.colors) ? L.colors : [];
    const total = g.tx.slots.reduce((a, s) => a + s.len, 0);
    const extra = Math.max(0, cols.length - total);
    let i = 0;
    for (const s of g.tx.slots) {
      if (s.type === 'color') { p[s.key] = cols[i] || s.def; i++; continue; }
      const n = Math.min(s.max, s.len + (s.key === g.tx.varKey ? extra : 0));
      const list = [];
      for (let j = 0; j < n; j++) list.push(cols[i + j] || s.def[j % s.def.length]);
      p[s.key] = list;
      i += s.len + (s.key === g.tx.varKey ? extra : 0);
    }
    if (L.bgOn === false && g.tx.bgKey) p[g.tx.bgKey] = 'transparent';
    return p;
  }

  /** texturelib params -> L.colors list (used for presets). */
  function colorsFrom(g, params) {
    const out = [];
    for (const s of g.tx.slots) {
      const v = params[s.key] !== undefined ? params[s.key] : s.def;
      if (s.type === 'color') out.push(v); else out.push(...v);
    }
    return out;
  }

  // ---------------------------------------------------------------- register generators
  const include = CFG.include ? new Set(CFG.include) : null, exclude = new Set(CFG.exclude || []);
  const added = [];
  for (const meta of T.listPatterns()) {
    if ((include && !include.has(meta.id)) || exclude.has(meta.id) || PT.list.some((x) => x.id === PREFIX + meta.id)) continue;
    const schema = meta.params;
    const params = Object.keys(schema).filter((k) => !isColorType(schema[k])).map((k) => toTLParam(k, schema[k]));
    const cs = colorSlots(schema);
    const defaults = T.defaults(meta.id);
    const g = {
      id: PREFIX + meta.id, name: meta.name, cat: CATS[meta.category] || meta.category,
      colors: [], params, build() {}, raster: true, defTile: 512, defScale: 1,
      tx: { id: meta.id, slots: cs.slots, varKey: cs.varKey, bgKey: cs.bgKey, description: meta.description },
      simple: {
        keys: Object.keys(schema).filter((k) => !isColorType(schema[k]) && !schema[k].advanced),
        labels: {}, presetLabel: 'Preset', presetPlaceholder: 'Choose a preset…',
      },
    };
    g.colors = colorsFrom(g, defaults);
    g.colorLabels = cs.slots.flatMap((s) => (s.type === 'color' ? [s.label] : s.def.map((_, j) => `${s.label} ${j + 1}`)));
    const presets = T.listPresets(meta.id);
    if (presets.length) {
      g.presets = presets.map((pr) => {
        const full = Object.assign({}, defaults, pr.params);
        const p = {};
        for (const k of Object.keys(pr.params)) if (!isColorType(schema[k])) p[k] = schema[k].type === 'enum' ? String(pr.params[k]) : pr.params[k];
        return { name: pr.name, p, colors: colorsFrom(g, full) };
      });
    }
    // only show "Advanced" when there is something in it
    if (g.simple.keys.length === params.length) delete g.simple;
    PT.list.push(g);
    added.push(g.id);
  }

  // ---------------------------------------------------------------- rendering
  let renderer = null;
  function getRenderer() {
    if (renderer !== null) return renderer;
    renderer = false;
    try {
      let url = CFG.workerUrl;
      if (!url) {
        const tag = Array.from(document.scripts).find((s) => /texturelib(\.min)?\.js(\?|$)/.test(s.src));
        if (tag) url = tag.src.replace(/texturelib(\.min)?\.js(\?.*)?$/, 'texturelib.worker.js');
      }
      if (url && CFG.workers > 0) renderer = T.createRenderer({ workerUrl: url, workerType: 'classic', workers: CFG.workers });
    } catch (e) { console.warn('texturelib-typelab: workers unavailable, rendering on the main thread', e); }
    return renderer;
  }

  const cache = new Map(); // key -> canvas (LRU)
  let cacheBytes = 0;
  const CACHE_BUDGET = 320 * 1024 * 1024;
  const remember = (key, c) => {
    if (cache.has(key)) return;
    cache.set(key, c); cacheBytes += c.width * c.height * 4;
    while (cacheBytes > CACHE_BUDGET && cache.size > 1) { const [k, v] = cache.entries().next().value; cache.delete(k); cacheBytes -= v.width * v.height * 4; }
  };
  const recall = (key) => { const c = cache.get(key); if (c) { cache.delete(key); cache.set(key, c); } return c || null; };
  const pending = new Set();

  const toCanvas = (img) => T.toCanvas(img, U.canvas(img.width, img.height));
  const scaled = (src, px) => {
    const c = U.canvas(px, px), x = c.getContext('2d');
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(src, 0, 0, px, px);
    return c;
  };
  const quantize = (px) => Math.min(LIVE_MAX, Math.round(Math.pow(2, Math.ceil(Math.log2(px) * 2) / 2)));

  /** Synchronous exact render (exports, thumbnails, small tiles). */
  function renderSync(g, params, px) {
    return toCanvas(T.render(g.tx.id, { width: px, height: px, tiles: [1, 1], params, supersample: px <= SYNC_MAX ? 1 : 2 }));
  }

  function rasterTile(L, px) {
    const g = PT.get(L.gen);
    px = Math.max(8, Math.min(4096, Math.round(px) || 8));
    const params = paramsFor(g, L);
    const base = JSON.stringify([g.tx.id, params]);
    const exact = recall(base + '|' + px);
    if (exact) return exact;
    const live = !!(TL.view && TL.view.drawing);
    const r = live && px > SYNC_MAX ? getRenderer() : null;
    if (!r) { const c = renderSync(g, params, px); remember(base + '|' + px, c); return c; }
    // live view: render the (quantised) size on the workers, show a provisional tile meanwhile
    const q = quantize(px);
    const qc = recall(base + '|' + q);
    if (qc) { const c = q === px ? qc : scaled(qc, px); remember(base + '|' + px, c); return c; }
    const jobKey = base + '|' + q;
    if (!pending.has(jobKey)) {
      pending.add(jobKey);
      r.render(g.tx.id, { width: q, height: q, tiles: [1, 1], params, supersample: 2 }, { slot: (L.id || L.gen) + '|' + q })
        .then((img) => { remember(jobKey, toCanvas(img)); if (TL.view) TL.view.request(true); })
        .catch((e) => { if (e.name !== 'AbortError') console.warn('texturelib-typelab:', e); })
        .finally(() => pending.delete(jobKey));
    }
    let best = null;
    for (const [k, c] of cache) if (k.startsWith(base + '|') && (!best || Math.abs(c.width - px) < Math.abs(best.width - px))) best = c;
    if (!best) best = renderSync(g, params, Math.min(px, 96));
    if (TL.fx) TL.fx.provisional = true; // never cache this frame as final (exports re-render)
    return scaled(best, px);
  }

  /** Exact tile rendered on the workers (fast for big PNG exports). Resolves to a canvas. */
  PT.tileCanvasAsync = async (L, px) => {
    const g = PT.get(L.gen);
    if (!g.raster) return PT.tileCanvas(L, px);
    px = Math.max(8, Math.min(8192, Math.round(px)));
    const params = paramsFor(g, L), key = JSON.stringify([g.tx.id, params]) + '|' + px;
    const hit = recall(key);
    if (hit) return hit;
    const r = getRenderer();
    const c = r ? toCanvas(await r.render(g.tx.id, { width: px, height: px, tiles: [1, 1], params, supersample: px > 2048 ? 1 : 2 })) : renderSync(g, params, px);
    remember(key, c);
    return c;
  };

  // ---------------------------------------------------------------- wrap TL.patterns
  const isRaster = (L) => { const g = L && PT.get(L.gen); return !!(g && g.raster && g.id === L.gen); };
  const origItems = PT.items, origTile = PT.tileCanvas, origSvg = PT.svgBody;
  PT.items = (L) => (isRaster(L) ? { T: PT.tileSize(L), H: PT.tileSize(L), items: [] } : origItems(L));
  PT.tileCanvas = (L, px) => (isRaster(L) ? rasterTile(L, px) : origTile(L, px));
  PT.svgBody = (L) => {
    if (!isRaster(L)) return origSvg(L);
    const T0 = PT.tileSize(L), px = Math.max(256, Math.min(2048, Math.round(T0 * 2)));
    const href = rasterTile(Object.assign({}, L, { id: undefined }), px).toDataURL('image/png');
    return { T: T0, H: T0, body: `<image href="${href}" x="0" y="0" width="${T0}" height="${T0}" preserveAspectRatio="none"/>` };
  };

  /** Public handle for debugging / integration code. */
  TL.texturelib = {
    lib: T, added, paramsFor: (L) => paramsFor(PT.get(L.gen), L), colorsFrom: (id, params) => colorsFrom(PT.get(id), params),
    get renderer() { return getRenderer() || null; },
    clearCache() { cache.clear(); cacheBytes = 0; if (renderer) renderer.clear(); },
  };
  console.info(`texturelib-typelab: ${added.length} raster generators added (texturelib ${T.VERSION})`);
})(window.TL);
