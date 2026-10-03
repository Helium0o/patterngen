// TypeLab-side helpers (main thread, classic script): turn text into knitted or woven fabric with the texturelib
// generators that are already installed (tx-fair-isle, tx-cross-stitch, tx-weave-draft). No library change needed.
// Tested in headless Chromium inside TypeLab d4c0832 + the adapter: see ideas/renders/typelab-knit-text.jpg and
// ideas/renders/typelab-woven-monogram.jpg. Suggested UI: a "Knit this text" / "Weave this text" button in the
// Pattern inspector that fills the current tx- layer's params.

/** Text → chart rows of '0'/'1' joined with '/' (the customChart format), the largest font size that fits with a 1-cell margin. */
function textToChart(text, cols, rows, font = 'bold {px}px sans-serif') {
  const c = document.createElement('canvas'); c.width = cols; c.height = rows;
  const g = c.getContext('2d');
  let px = rows * 2, m;
  do { g.font = font.replace('{px}', px--); m = g.measureText(text); }
  while (px > 4 && (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent > rows - 2 || m.width > cols - 2));
  g.fillStyle = '#fff'; g.textAlign = 'center';
  g.fillText(text, cols / 2, Math.round((rows + m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2));
  const d = g.getImageData(0, 0, cols, rows).data, out = [];
  for (let y = 0; y < rows; y++) { let s = ''; for (let x = 0; x < cols; x++) s += d[(y * cols + x) * 4 + 3] > 110 ? '1' : '0'; out.push(s); }
  return out.join('/');
}

/**
 * Chart ('0101/…') → weave-draft string: glyph pixels are warp-faced 8-shaft satin (the warp colour floats on top),
 * the ground is weft-faced sateen. k threads per chart pixel. weave-draft's string param is capped at 4000 characters,
 * so keep cols·k ≤ ~60 (e.g. a 14×14 chart at k = 4 → 56×56 threads).
 */
function maskToDraft(chart, k = 4, n = 8, a = 3) {
  const mask = chart.split('/'), rows = [];
  for (let p = 0; p < mask.length * k; p++) {
    let s = '';
    for (let e = 0; e < mask[0].length * k; e++) {
      const hit = (((e - a * p) % n) + n) % n === 0; // satin interlacing points (move a, coprime with n)
      s += (mask[Math.floor(p / k)][Math.floor(e / k)] === '1' ? !hit : hit) ? '1' : '0';
    }
    rows.push(s);
  }
  return rows.join('/');
}

/** Fill a tx-fair-isle layer with a knitted word between two bands. Colours go through L.colors (the Colors panel slots). */
function knitText(L, text, cols = 40, rows = 12, colors = ['#f1ebdd', '#b3202a', '#1d3557']) {
  const band = '2'.repeat(cols);
  L.p.chart = 'custom';
  L.p.customChart = band + '/' + textToChart(text, cols, rows) + '/' + band; // digits index the palette: 0 ground, 1 letters, 2 bands
  L.p.stitchesAcross = cols;
  L.colors = TL.texturelib.colorsFrom('tx-fair-isle', { colors });
}

/** Fill a tx-weave-draft layer with a woven monogram (jacquard-style label). */
function weaveText(L, text, size = 14, warp = '#e8c25a', weft = '#5a1020') {
  L.p.draft = maskToDraft(textToChart(text, size, size));
  L.p.repeats = 1; L.p.warpCounts = '1'; L.p.weftCounts = '1'; L.p.sheen = 0.5;
  L.colors = TL.texturelib.colorsFrom('tx-weave-draft', { warpColors: [warp], weftColors: [weft] });
}

// usage:  const L = TL.patterns.defaults('tx-fair-isle'); knitText(L, 'TYPE');   → then add L as a pattern layer
//         const W = TL.patterns.defaults('tx-weave-draft'); weaveText(W, 'TL');
// cross-stitch: L.p.chart = 'custom'; L.p.customChart = textToChart('Hi', 24, 12);  (0 = empty aida)
