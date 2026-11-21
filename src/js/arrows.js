// Flow arrows: the shown item's vx/vy drawn as arrows on a grid every arrowSpacing screen pixels, read
// (like animation frames) from the overview level nearest the grid spacing, so each arrow shows the flow
// averaged over its cell. The grid is fixed in map coordinates, so arrows stay put while panning, and is
// read again after each move or zoom. Direction is the flow direction; length grows with log speed from
// arrowMinSpeed to the 95th percentile of the speeds in view. Slower ice gets no arrow: the cutoff is
// above the noise on ice-free rock (1-4 m/yr beside Jakobshavn in the 2025 annual mosaic).
const arrowSpacing = 44, arrowMinSpeed = 5;
const arrowSource = new ol.source.Vector();
const arrowLayer = new ol.layer.Vector({ source: arrowSource, zIndex: 4, visible: false, style: [
  new ol.style.Style({ stroke: new ol.style.Stroke({ color: 'rgba(0, 0, 0, 0.7)', width: 3.5 }) }),
  new ol.style.Style({ stroke: new ol.style.Stroke({ color: '#fff', width: 1.5 }) }),
] });
map.addLayer(arrowLayer);
let arrowToken = 0, arrowKey = '';
const hasFlow = it => !!(it?.assets?.vx && it?.assets?.vy);

async function refreshArrows() {
  const ok = hasFlow(selected), on = $('arrowsOn').checked && ok;
  $('arrowsOn').disabled = !ok;
  arrowLayer.setVisible(on);
  if (!on) { ++arrowToken; arrowKey = ''; arrowSource.clear(); return; }
  const view = map.getView(), vr = view.getResolution(), cell = vr * arrowSpacing, e = view.calculateExtent(map.getSize());
  const ext = [Math.floor(e[0] / cell) * cell, Math.floor(e[1] / cell) * cell, Math.ceil(e[2] / cell) * cell, Math.ceil(e[3] / cell) * cell];
  const W = Math.round((ext[2] - ext[0]) / cell), H = Math.round((ext[3] - ext[1]) / cell), key = `${selected.id} ${ext.join()} ${cell}`;
  if (key === arrowKey) return;
  arrowKey = key;
  const token = ++arrowToken, it = selected;
  let vx, vy;
  try {
    [vx, vy] = (await Promise.all(['vx', 'vy'].map(k => readFrame(it, k, ext, cell, W, H)))).map(f => f.values);
  } catch (err) { if (token === arrowToken) { arrowKey = ''; setStatus(`Could not read the flow arrows (${err.message})`); } return; }
  if (token !== arrowToken) return;
  const speeds = [];
  for (let k = 0; k < W * H; k++) { const s = Math.hypot(vx[k], vy[k]); if (s >= arrowMinSpeed) speeds.push(s); }
  speeds.sort((a, b) => a - b);
  const top = Math.log10(Math.max(speeds[Math.floor(0.95 * (speeds.length - 1))] || 10, 10 * arrowMinSpeed)), bottom = Math.log10(arrowMinSpeed);
  const features = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x, s = Math.hypot(vx[k], vy[k]);
    if (!(s >= arrowMinSpeed)) continue;
    const f = 0.3 + 0.7 * Math.min(1, (Math.log10(s) - bottom) / (top - bottom)), L = 0.8 * cell * f;
    const ux = vx[k] / s, uy = vy[k] / s, cx = ext[0] + (x + 0.5) * cell, cy = ext[3] - (y + 0.5) * cell;
    const tip = [cx + ux * L / 2, cy + uy * L / 2], h = Math.min(0.4 * L, 7 * vr), c = Math.cos(0.5), sn = Math.sin(0.5);
    const head = [[tip[0] - h * (ux * c - uy * sn), tip[1] - h * (uy * c + ux * sn)], tip, [tip[0] - h * (ux * c + uy * sn), tip[1] - h * (uy * c - ux * sn)]];
    features.push(new ol.Feature(new ol.geom.MultiLineString([[[cx - ux * L / 2, cy - uy * L / 2], tip], head])));
  }
  arrowSource.clear(); arrowSource.addFeatures(features);
}
map.on('moveend', refreshArrows);
$('arrowsOn').onchange = refreshArrows;
