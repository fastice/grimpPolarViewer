// Speed contours: isotachs of the shown item's speed (vv) at the levels typed under the toggles, each line
// labeled with its speed. They are traced by marching squares on a grid every contourCell screen pixels,
// read (like the flow arrows) from the overview level nearest that spacing and smoothed with a 3 x 3 mean,
// so the lines follow the flow rather than the pixel noise. The grid is read again after each move or zoom;
// lines of fewer than contourMinPts points (specks of noise) are dropped.
const contourCell = 3, contourMinPts = 6, contourMaxLevels = 12;
const contourSource = new ol.source.Vector(), contourStyles = new Map();
const contourLayer = new ol.layer.Vector({ source: contourSource, zIndex: 4, visible: false, declutter: true, style: f => {
  const v = f.get('level');
  if (!contourStyles.has(v)) contourStyles.set(v, [new ol.style.Style({ stroke: new ol.style.Stroke({ color: 'rgba(0, 0, 0, 0.6)', width: 3 }) }),
    new ol.style.Style({ stroke: new ol.style.Stroke({ color: '#ffffff', width: 1.2 }), text: new ol.style.Text({ text: fmtVal(v), placement: 'line', repeat: 350,
      font: '600 11px system-ui, sans-serif', fill: new ol.style.Fill({ color: '#ffffff' }), stroke: new ol.style.Stroke({ color: 'rgba(0, 0, 0, 0.85)', width: 3 }) }) })]);
  return contourStyles.get(v);
} });
map.addLayer(contourLayer);
let contourToken = 0, contourKey = '';
const contourLevels = () => [...new Set($('contourLevels').value.split(/[\s,;]+/).map(Number).filter(v => Number.isFinite(v) && v > 0))]
  .sort((a, b) => a - b).slice(0, contourMaxLevels);

async function refreshContours() {
  const ok = !!selected?.assets?.vv, on = $('contourOn').checked && ok, levels = contourLevels();
  $('contourOn').disabled = !ok;
  contourLayer.setVisible(on); $('contourLegend').hidden = !on;
  if (!on || !levels.length) { ++contourToken; contourKey = ''; contourSource.clear(); return; }
  const view = map.getView(), cell = view.getResolution() * contourCell, e = view.calculateExtent(map.getSize());
  const ext = [Math.floor(e[0] / cell) * cell, Math.floor(e[1] / cell) * cell, Math.ceil(e[2] / cell) * cell, Math.ceil(e[3] / cell) * cell];
  const W = Math.round((ext[2] - ext[0]) / cell), H = Math.round((ext[3] - ext[1]) / cell), key = `${selected.id} ${ext.join()} ${cell} ${levels.join()}`;
  if (key === contourKey) return;
  contourKey = key;
  const token = ++contourToken, b = selected.assets.vv['raster:bands']?.[0] || {};
  let raw;
  try { raw = (await readFrame(selected, 'vv', ext, cell, W, H)).values; } catch (err) {
    if (token === contourToken) { contourKey = ''; setStatus(`Could not read the speed for contours (${err.message})`); } return;
  }
  if (token !== contourToken) return;
  const g = new Float32Array(W * H).fill(NaN);  // 3 x 3 mean of the valid neighbours, in physical units
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (Number.isNaN(raw[y * W + x])) continue;
    let s = 0, n = 0;
    for (let j = Math.max(0, y - 1); j <= Math.min(H - 1, y + 1); j++) for (let i = Math.max(0, x - 1); i <= Math.min(W - 1, x + 1); i++) {
      const v = raw[j * W + i];
      if (!Number.isNaN(v)) { s += v; n++; }
    }
    g[y * W + x] = (s / n) * (b.scale ?? 1) + (b.offset ?? 0);
  }
  const toMapXY = ([gx, gy]) => [ext[0] + (gx + 0.5) * cell, ext[3] - (gy + 0.5) * cell], features = [];
  for (const level of levels) for (const line of isolines(g, W, H, level)) {
    if (line.length >= contourMinPts) features.push(new ol.Feature({ geometry: new ol.geom.LineString(line.map(toMapXY)), level }));
  }
  contourSource.clear(); contourSource.addFeatures(features);
}
// Marching squares: the lines where grid g (W x H, row 0 at the top, NaN = no data) crosses level, as
// polylines in grid coordinates (pixel centres at integers). Cells with a missing corner are skipped, so
// lines end at the data edge; saddles are split by the cell's mean.
function isolines(g, W, H, level) {
  const pt = new Map(), adj = new Map();
  const edge = (x, y, vert) => {  // the crossing on the edge right of (vert 0) or below (vert 1) node (x, y)
    const id = 2 * (y * W + x) + vert;
    if (!pt.has(id)) { const v0 = g[y * W + x], v1 = vert ? g[(y + 1) * W + x] : g[y * W + x + 1], f = (level - v0) / (v1 - v0); pt.set(id, vert ? [x, y + f] : [x + f, y]); }
    return id;
  };
  const link = (p, q) => { for (const [a, b] of [[p, q], [q, p]]) { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); } };
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const a = g[y * W + x], b = g[y * W + x + 1], c = g[(y + 1) * W + x + 1], d = g[(y + 1) * W + x];
    if (Number.isNaN(a + b + c + d)) continue;
    const k = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
    if (k === 0 || k === 15) continue;
    const T = () => edge(x, y, 0), B = () => edge(x, y + 1, 0), L = () => edge(x, y, 1), R = () => edge(x + 1, y, 1);
    const high = (a + b + c + d) / 4 > level;
    switch (k) {
      case 1: case 14: link(L(), B()); break;
      case 2: case 13: link(B(), R()); break;
      case 3: case 12: link(L(), R()); break;
      case 4: case 11: link(T(), R()); break;
      case 6: case 9: link(T(), B()); break;
      case 7: case 8: link(T(), L()); break;
      case 5: if (high) { link(T(), L()); link(B(), R()); } else { link(T(), R()); link(L(), B()); } break;
      case 10: if (high) { link(T(), R()); link(L(), B()); } else { link(T(), L()); link(B(), R()); } break;
    }
  }
  const used = new Set(), lines = [];
  const walk = s => {
    const line = [s];
    used.add(s);
    for (let cur = s; ;) { const n = adj.get(cur).find(q => !used.has(q)); if (n === undefined) break; used.add(n); line.push(n); cur = n; }
    return line;
  };
  for (const [id, nb] of adj) if (nb.length === 1 && !used.has(id)) lines.push(walk(id));  // open lines, from an end
  for (const id of adj.keys()) if (!used.has(id)) { const l = walk(id); l.push(l[0]); lines.push(l); }  // closed loops
  return lines.map(l => l.map(id => pt.get(id)));
}
map.on('moveend', refreshContours);
$('contourOn').onchange = refreshContours;
$('contourLevels').onchange = refreshContours;
