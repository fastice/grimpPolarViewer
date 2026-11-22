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

// Flow particles: streaks drifting with the shown item's vx/vy, read like the arrows on a grid every
// particleCell screen pixels. Each frame moves every particle in proportion to its speed (the 95th
// percentile of the speeds in view moves particleStep px a frame) and fades the old trails, so a streak's
// length shows its speed. A particle lives particleLife frames, or until it leaves the data, then starts
// again at a random cell of moving ice (at least arrowMinSpeed). They are drawn on a canvas over the map,
// cleared while the map moves and started again on the new view.
const particleCell = 4, particleStep = 2, particleLife = 100, particleMax = 3000;
const pCanvas = document.createElement('canvas');
pCanvas.className = 'particles';
map.getViewport().insertBefore(pCanvas, map.getViewport().querySelector('.ol-overlaycontainer'));
let pField = null, pParts = [], pRaf = 0, pToken = 0;
function stopParticles() {
  ++pToken; cancelAnimationFrame(pRaf); pRaf = 0; pParts = []; pField = null;
  pCanvas.getContext('2d').clearRect(0, 0, pCanvas.width, pCanvas.height);
}
async function refreshParticles() {
  const ok = hasFlow(selected), on = $('particlesOn').checked && ok;
  $('particlesOn').disabled = !ok;
  stopParticles();
  if (!on) return;
  const token = pToken, view = map.getView(), size = map.getSize(), cell = view.getResolution() * particleCell, e = view.calculateExtent(size);
  const W = Math.ceil(size[0] / particleCell), H = Math.ceil(size[1] / particleCell), ext = [e[0], e[3] - H * cell, e[0] + W * cell, e[3]];
  const it = selected, bands = ['vx', 'vy'].map(k => it.assets[k]['raster:bands']?.[0] || {});
  let vx, vy;
  try {
    [vx, vy] = (await Promise.all(['vx', 'vy'].map(k => readFrame(it, k, ext, cell, W, H)))).map((f, n) => f.values.map(v => v * (bands[n].scale ?? 1) + (bands[n].offset ?? 0)));
  } catch (err) { if (token === pToken) setStatus(`Could not read the flow for particles (${err.message})`); return; }
  if (token !== pToken) return;
  const moving = [], speeds = [];
  for (let k = 0; k < W * H; k++) { const s = Math.hypot(vx[k], vy[k]); if (s >= arrowMinSpeed) { moving.push(k); speeds.push(s); } }
  if (!moving.length) return;
  speeds.sort((a, b) => a - b);
  const top = Math.max(speeds[Math.floor(0.95 * (speeds.length - 1))], 10 * arrowMinSpeed), dpr = window.devicePixelRatio || 1;
  pField = { vx, vy, W, H, moving, scale: particleStep / top };
  pCanvas.width = size[0] * dpr; pCanvas.height = size[1] * dpr;
  pCanvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  const n = Math.min(particleMax, Math.round(size[0] * size[1] / 300), moving.length * 4);
  pParts = Array.from({ length: n }, () => ({ age: Math.floor(Math.random() * particleLife) }));
  for (const q of pParts) spawnParticle(q);
  pRaf = requestAnimationFrame(particleFrame);
}
function spawnParticle(q) {
  const k = pField.moving[Math.floor(Math.random() * pField.moving.length)];
  q.x = (k % pField.W + Math.random()) * particleCell; q.y = (Math.floor(k / pField.W) + Math.random()) * particleCell;
}
function particleFrame() {
  const f = pField, ctx = pCanvas.getContext('2d'), w = pCanvas.width, h = pCanvas.height;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = 'rgba(0, 0, 0, 0.92)'; ctx.fillRect(0, 0, w, h);  // fade the trails
  ctx.restore();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; ctx.lineWidth = 1.3; ctx.beginPath();
  for (const q of pParts) {
    const i = Math.floor(q.x / particleCell), j = Math.floor(q.y / particleCell), k = j * f.W + i;
    const u = i >= 0 && j >= 0 && i < f.W && j < f.H ? f.vx[k] : NaN, v = u === u ? f.vy[k] : NaN;
    if (!(q.age++ < particleLife) || !Number.isFinite(u + v)) { q.age = 0; spawnParticle(q); continue; }
    const nx = q.x + u * f.scale, ny = q.y - v * f.scale;  // map y is up, screen y down
    ctx.moveTo(q.x, q.y); ctx.lineTo(nx, ny); q.x = nx; q.y = ny;
  }
  ctx.stroke();
  pRaf = requestAnimationFrame(particleFrame);
}
map.on('movestart', () => { if (pField || pRaf) stopParticles(); });
map.on('moveend', refreshParticles);
$('particlesOn').onchange = refreshParticles;
