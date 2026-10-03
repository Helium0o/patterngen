// Off-main-thread rendering: a small pool of Web Workers that split each tile into row bands,
// plus an LRU cache and request cancellation. Falls back to the main thread when workers are
// unavailable, so the same code runs everywhere.
//
//   const renderer = createRenderer();                         // ES modules: finds ./worker.js itself
//   const renderer = createRenderer({ workerUrl: 'js/vendor/texturelib.worker.js' }); // classic script build
//   const tile = await renderer.render('tartan', { width: 512, params }, { slot: 'layer-7' });
//
// `slot`: a new request in the same slot cancels the previous one (perfect for slider drags).
// `signal`: an AbortSignal; aborted requests reject with an Error whose name is 'AbortError'.

import { render, renderMaps, renderRegion, heightToNormal } from './index.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function abortError() {
  const e = new Error('texturelib: render aborted');
  e.name = 'AbortError';
  return e;
}

function grayFromHeights(heights) {
  const n = heights.length, data = new Uint8ClampedArray(n * 4);
  for (let p = 0; p < n; p++) { const g = heights[p] * 255; data[p * 4] = data[p * 4 + 1] = data[p * 4 + 2] = g; data[p * 4 + 3] = 255; }
  return data;
}

/** Stable cache key for (id, opts) — ignores keys that don't change pixels. */
function keyOf(kind, id, opts) {
  const o = {};
  for (const k of Object.keys(opts).sort()) if (k !== 'signal' && k !== 'slot') o[k] = opts[k];
  return kind + '|' + id + '|' + JSON.stringify(o);
}

/**
 * @param {object} [options]
 *   workers     number of workers (default: min(4, cores − 1)); 0 = main thread only
 *   workerUrl   URL of the worker script. ES modules: defaults to ./worker.js next to this file.
 *               Classic-script build: pass the path of dist/texturelib.worker.js.
 *   workerType  'module' | 'classic' (default: 'classic' when workerUrl ends in ".worker.js", else 'module')
 *   cacheSize   max cached results (default 48); cacheBytes max total bytes (default 384 MB)
 *   splitAbove  split a render into row bands when width×height ≥ this (default 160²)
 * @returns {{render, renderMaps, clear, terminate, stats}}
 */
export function createRenderer(options = {}) {
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  const want = options.workers ?? Math.max(1, Math.min(4, cores - 1));
  const cacheSize = options.cacheSize ?? 48, cacheBytes = options.cacheBytes ?? 384 * 1024 * 1024;
  const splitAbove = options.splitAbove ?? 160 * 160;
  const cache = new Map(); // key -> {img, bytes}
  let bytes = 0;
  const inflight = new Map(); // key -> promise
  const slots = new Map(); // slot -> AbortController
  const pool = [];
  const queue = []; // pending bands
  let jobSeq = 0;
  const stats = { renders: 0, cacheHits: 0, workerBands: 0, mainThread: 0, lastMs: 0 };

  // ---------- workers ----------
  if (want > 0 && typeof Worker !== 'undefined') {
    let url = options.workerUrl, type = options.workerType;
    if (!url) {
      try { url = new URL('./worker.js', import.meta.url).href; } catch (e) { url = null; }
      type = type || 'module';
    }
    if (url && !type) type = /\.worker\.js($|\?)/.test(String(url)) ? 'classic' : 'module';
    for (let i = 0; url && i < want; i++) {
      try {
        const w = new Worker(url, type === 'module' ? { type: 'module' } : undefined);
        const slot = { w, busy: null };
        w.onmessage = (e) => onDone(slot, e.data);
        w.onerror = (e) => { if (slot.busy) { const b = slot.busy; slot.busy = null; b.reject(new Error('texturelib worker error: ' + (e.message || 'failed to load ' + url))); } e.preventDefault && e.preventDefault(); pump(); };
        pool.push(slot);
      } catch (e) { break; }
    }
  }

  function onDone(slot, msg) {
    const band = slot.busy;
    slot.busy = null;
    if (band) {
      if (msg.ok) { stats.workerBands++; band.resolve(msg); } else band.reject(new Error(msg.error));
    }
    pump();
  }

  function pump() {
    for (const slot of pool) {
      if (slot.busy) continue;
      let band;
      while ((band = queue.shift()) && band.cancelled());
      if (!band) return;
      slot.busy = band;
      slot.w.postMessage({ job: band.job, id: band.id, opts: band.opts });
    }
  }

  function runBand(id, opts, cancelled) {
    return new Promise((resolve, reject) => {
      queue.push({ job: ++jobSeq, id, opts, resolve, reject, cancelled });
      pump();
    });
  }

  // ---------- cache ----------
  function remember(key, img) {
    const b = (img.data ? img.data.byteLength : 0) + (img.color ? img.color.byteLength * 3 : 0);
    cache.set(key, { img, bytes: b });
    bytes += b;
    while ((cache.size > cacheSize || bytes > cacheBytes) && cache.size > 1) {
      const [k, v] = cache.entries().next().value;
      cache.delete(k); bytes -= v.bytes;
    }
  }
  function recall(key) {
    const hit = cache.get(key);
    if (!hit) return null;
    cache.delete(key); cache.set(key, hit); // LRU touch
    return hit.img;
  }

  // ---------- rendering ----------
  async function produce(kind, id, opts, signal) {
    const t0 = now();
    const width = Math.round(opts.width ?? opts.size ?? 512), height = Math.round(opts.height ?? width);
    const cancelled = () => !!(signal && signal.aborted);
    if (!pool.length) {
      // main thread: yield once so callers can update the UI first
      await new Promise((r) => setTimeout(r, 0));
      if (cancelled()) throw abortError();
      stats.mainThread++;
      const img = kind === 'maps' ? renderMaps(id, opts) : render(id, opts);
      stats.lastMs = now() - t0;
      return img;
    }
    const output = opts.output || 'color';
    const need = kind === 'maps' || output === 'normal' ? 'color+height' : output === 'height' ? 'height' : 'color';
    const bands = width * height >= splitAbove ? Math.min(pool.length * 2, Math.max(1, Math.floor(height / 16))) : 1;
    const parts = [];
    for (let b = 0; b < bands; b++) {
      const y0 = Math.floor((b * height) / bands), y1 = Math.floor(((b + 1) * height) / bands);
      parts.push(runBand(id, { ...opts, width, height, rows: [y0, y1], output: need, signal: undefined, slot: undefined }, cancelled));
    }
    const res = await Promise.all(parts);
    if (cancelled()) throw abortError();
    const first = res[0];
    const color = need !== 'height' ? new Uint8ClampedArray(width * height * 4) : null;
    const heights = need !== 'color' ? new Float32Array(width * height) : null;
    for (const r of res) {
      if (color) color.set(new Uint8ClampedArray(r.color), r.rows[0] * width * 4);
      if (heights) heights.set(new Float32Array(r.heights), r.rows[0] * width);
    }
    const base = { id, width, height, params: first.params, tiles: first.tiles };
    let img;
    if (kind === 'maps') {
      const normalMap = heightToNormal(heights, width, height, new Uint8ClampedArray(width * height * 4), opts.normalStrength ?? 4, opts.normalFormat, width / first.tiles[0]);
      img = { ...base, color, heightMap: grayFromHeights(heights), normalMap, heights };
    } else if (output === 'normal') {
      img = { ...base, data: heightToNormal(heights, width, height, new Uint8ClampedArray(width * height * 4), opts.normalStrength ?? 4, opts.normalFormat, width / first.tiles[0]) };
    } else if (output === 'height') img = { ...base, data: grayFromHeights(heights), heights };
    else img = { ...base, data: color };
    stats.lastMs = now() - t0;
    return img;
  }

  function request(kind, id, opts = {}, ctl = {}) {
    stats.renders++;
    const key = keyOf(kind, id, opts);
    const hit = recall(key);
    if (hit) { stats.cacheHits++; return Promise.resolve(hit); }
    // slot: cancel the previous request of the same slot
    let signal = ctl.signal;
    if (ctl.slot != null) {
      const prev = slots.get(ctl.slot);
      if (prev) prev.abort();
      const ac = new AbortController();
      slots.set(ctl.slot, ac);
      if (signal) signal.addEventListener('abort', () => ac.abort(), { once: true });
      signal = ac.signal;
    }
    if (inflight.has(key) && !signal) return inflight.get(key);
    const p = produce(kind, id, opts, signal).then((img) => { remember(key, img); return img; });
    if (!signal) { inflight.set(key, p); p.finally(() => inflight.delete(key)).catch(() => {}); }
    return p;
  }

  return {
    /** Promise of render(id, opts). ctl = { slot, signal }. */
    render: (id, opts, ctl) => request('color', id, opts, ctl),
    /** Promise of renderMaps(id, opts). */
    renderMaps: (id, opts, ctl) => request('maps', id, opts, ctl),
    /** Cached result for (id, opts) or null — synchronous, never renders. */
    peek: (id, opts = {}) => recall(keyOf('color', id, opts)),
    clear() { cache.clear(); bytes = 0; },
    terminate() { for (const s of pool) s.w.terminate(); pool.length = 0; queue.length = 0; },
    get workers() { return pool.length; },
    stats,
  };
}

/**
 * Worker side: call serveWorker(self) in a worker script (src/worker.js and
 * dist/texturelib.worker.js already do). Answers {job, id, opts} with row bands.
 */
export function serveWorker(scope) {
  scope.onmessage = (e) => {
    const { job, id, opts } = e.data || {};
    try {
      const r = renderRegion(id, opts);
      const msg = { job, ok: true, rows: opts.rows, params: r.params, tiles: r.tiles };
      const transfer = [];
      const color = r.color || (opts.output === 'color' ? r.data : null);
      if (color) { msg.color = color.buffer; transfer.push(color.buffer); }
      if (r.heights) { msg.heights = r.heights.buffer; transfer.push(r.heights.buffer); }
      scope.postMessage(msg, transfer);
    } catch (err) {
      scope.postMessage({ job, ok: false, error: String((err && err.message) || err) });
    }
  };
}
