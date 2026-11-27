// Strain rates from the shown item's vx and vy, computed in the browser for the map view: both read on one
// grid (the view, at the map's pixel size but no finer than the data and at most srMaxPx across), then
// differenced over the smoothing length L (centered differences across L, so features shorter than L are
// smoothed out). Shown as an image over the map, with the value under the pointer in the readout:
//   effective   sqrt(exx^2 + eyy^2 + exx eyy + exy^2) (Glen's second invariant, incompressible ice)
//   along flow  the stretching (+) or compression (-) along the flow direction
//   shear       the shear across the flow direction
//   divergence  exx + eyy (thinning (+) or thickening (-) by flow, for incompressible ice)
// in 1/yr (speeds in m/yr, distances in m). Recomputed when the date changes; Compute again after moving.
const srLayer = new ol.layer.Image({ zIndex: 2.5, visible: false });
map.addLayer(srLayer);
const srMaxPx = 1000;
const srKinds = { eff: 'effective strain rate', lon: 'along-flow strain rate', shear: 'shear strain rate', div: 'divergence' };
let srShown = null, srToken = 0;  // { kind, grid: { ext, W, H, res }, values, lo, hi, it }

function srAvailable() { return !!(selected?.assets.vx && selected?.assets.vy); }
// the 1/yr values of one kind over a W x H grid of cell res, from vx, vy (m/yr) differenced across k cells each way
function strainField(vx, vy, W, H, res, k, kind) {
  const out = new Float32Array(W * H).fill(NaN), d = 2 * k * res;
  for (let j = k; j < H - k; j++) for (let i = k; i < W - k; i++) {
    const c = j * W + i, e = c + k, w = c - k, n = c - k * W, s = c + k * W;  // rows run north to south
    const exx = (vx[e] - vx[w]) / d, eyy = (vy[n] - vy[s]) / d, exy = ((vx[n] - vx[s]) / d + (vy[e] - vy[w]) / d) / 2;
    let v;
    if (kind === 'eff') v = Math.sqrt(exx * exx + eyy * eyy + exx * eyy + exy * exy);
    else if (kind === 'div') v = exx + eyy;
    else {
      const u = vx[c], q = vy[c], s2 = u * u + q * q;
      v = kind === 'lon' ? (u * u * exx + 2 * u * q * exy + q * q * eyy) / s2 : (exy * (u * u - q * q) + u * q * (eyy - exx)) / s2;
    }
    if (Number.isFinite(v)) out[c] = v;
  }
  return out;
}
async function computeStrain() {
  if (!srAvailable()) return;
  const token = ++srToken, it = selected, kind = $('srKind').value, L = +$('srLen').value;
  const view = map.getView(), ext = view.calculateExtent(map.getSize());
  const { levels: lv } = await assetLevels(it.assets.vx.href);
  // a length L shorter than two cells is widened to two cells (the note gives the length used)
  const res = Math.max(view.getResolution(), lv[0].res, (ext[2] - ext[0]) / srMaxPx, (ext[3] - ext[1]) / srMaxPx);
  const W = Math.round((ext[2] - ext[0]) / res), H = Math.round((ext[3] - ext[1]) / res);
  $('srNote').textContent = 'Reading vx and vy...';
  try {
    const phys = async key => {
      const b = it.assets[key]['raster:bands']?.[0] || {}, f = await readFrame(it, key, ext, res, W, H);
      return f.values.map(v => v * (b.scale ?? 1) + (b.offset ?? 0));
    };
    const [vx, vy] = await Promise.all([phys('vx'), phys('vy')]);
    if (token !== srToken) return;
    const kk = Math.max(1, Math.round(L / 2 / res)), values = strainField(vx, vy, W, H, res, kk, kind);
    const ok = values.filter(Number.isFinite).map(Math.abs).sort((a, b) => a - b);
    if (!ok.length) { srClear(); $('srNote').textContent = 'No vx/vy data in this view.'; return; }
    const top = +$('srMax').value > 0 ? +$('srMax').value : +ok[Math.floor(ok.length * 0.98)].toPrecision(2);
    const signed = kind !== 'eff', lo = signed ? -top : 0;
    srShown = { kind, grid: { ext, W, H, res }, values, lo, hi: top, it, L: 2 * kk * res };
    srDraw();
    $('srNote').textContent = `${srKinds[kind]} of ${it.id}, differences across ${msKm(2 * kk * res)}, on ${Math.round(res)} m cells. Compute again after moving the map.`;
  } catch (e) {
    if (token === srToken) $('srNote').textContent = `Could not compute: ${e.message}`;
  }
}
function srDraw() {
  const s = srShown, stops = s.kind === 'eff' ? cmaps.magma : cmaps['blue-white-red'];
  const canvas = frameCanvas({ values: s.values }, s.grid.W, s.grid.H, buildLut(stops), s.lo, s.hi, '');
  srLayer.setSource(new ol.source.ImageStatic({ url: canvas.toDataURL('image/png'), imageExtent: s.grid.ext, projection: viewCode }));
  srLayer.setVisible(true); applyLayers();
  $('srBar').style.background = `linear-gradient(90deg, ${stops.join(', ')})`;
  const r = v => String(+v.toPrecision(3));
  $('srMin').textContent = r(s.lo); $('srMid').textContent = s.kind === 'eff' ? '1/yr' : '0  (1/yr)'; $('srMaxL').textContent = r(s.hi);
  $('srLegend').hidden = false; $('srClear').hidden = false;
}
function srClear() {
  ++srToken; srShown = null; srLayer.setVisible(false); srLayer.setSource(null); applyLayers();
  $('srLegend').hidden = true; $('srClear').hidden = true; $('srNote').textContent = '';
}
// readout line: the strain rate under the pointer ('' when none is shown or no value there)
function strainNote(coord) {
  const s = srShown;
  if (!s || !srLayer.getVisible()) return '';
  const { ext, W, H, res } = s.grid, i = Math.floor((coord[0] - ext[0]) / res), j = Math.floor((ext[3] - coord[1]) / res);
  const v = i >= 0 && j >= 0 && i < W && j < H ? s.values[j * W + i] : NaN;
  return Number.isFinite(v) ? `<b>${srKinds[s.kind]}</b> ${+v.toPrecision(3)} /yr` : '';
}
// after the shown item changes: the section follows whether it has vx and vy, and a strain map is redone
function refreshStrain() {
  $('srSec').hidden = !srAvailable();
  if (!srAvailable()) { if (srShown) srClear(); return; }
  if (srShown && srShown.it !== selected) computeStrain();
}
$('srCompute').onclick = computeStrain;
$('srClear').onclick = srClear;
for (const id of ['srKind', 'srLen']) $(id).onchange = () => { if (srShown) computeStrain(); };
$('srMax').onchange = () => { if (srShown) computeStrain(); };
