// Route B example (TYPELAB_HANDOFF.md §3): hitomezashi as a native TypeLab vector generator.
// Paste into app/js/patterns.js next to gen('checker', …) — it uses that file's gen, R and camoCommon.
// Tested in headless Chromium inside TypeLab d4c0832: 462 vector items, canvas tile + SVG tile, no page errors
// (render: ideas/renders/typelab-vector-hitomezashi.jpg).
gen('hitomezashi', 'Hitomezashi Sashiko', 'Geometric', ['#1f2f56', '#f3efe6'],
  [R('cells', 'Stitches across', 4, 60, 20), R('density', 'Offset density', 0, 1, 0.5, 0.01),
   R('stitch', 'Stitch length', 0.3, 1, 0.76, 0.01), R('width', 'Thread width', 0.03, 0.3, 0.14, 0.01), ...camoCommon],
  (b, p) => {
    const n = p.cells + (p.cells % 2), s = b.T / n, lo = (1 - p.stitch) / 2;
    const bits = () => Array.from({ length: n }, () => (b.r() < p.density ? 1 : 0));
    const rb = bits(), cb = bits();
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      if ((i + rb[j]) % 2 === 0) b.line(1, [[(i + lo) * s, j * s], [(i + 1 - lo) * s, j * s]], s * p.width);
      if ((j + cb[i]) % 2 === 0) b.line(1, [[i * s, (j + lo) * s], [i * s, (j + 1 - lo) * s]], s * p.width);
    }
  });
