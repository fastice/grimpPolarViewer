let band = {};
let startAsset = new URL(location.href).searchParams.get('asset');
// A link from "Share this view" also carries the item, map view, time range, stretch and points; they apply
// to the first catalog loaded.
const startParams = new URL(location.href).searchParams;
const numList = (s, n = 2) => { const v = s.split(',').map(Number); return v.length === n && v.every(Number.isFinite) ? v : null; };
let startView = ['item', 'x', 't0', 'pts', 'area', 'anim'].some(k => startParams.has(k)) ? {
  item: startParams.get('item'),
  center: numList(`${startParams.get('x')},${startParams.get('y')}`), zoom: +startParams.get('z') || null,
  t0: startParams.get('t0'), t1: startParams.get('t1'),
  pts: (startParams.get('pts') || '').split(';').map(c => numList(c)).filter(Boolean),
  area: numList(startParams.get('area') || '', 4), anim: startParams.get('anim') === '1',
} : null;
let startStretch = numList(`${startParams.get('lo')},${startParams.get('hi')}`);
let startAnimRes = +startParams.get('ares') || null;  // frame resolution (m) of a shared animation
let animScrollPending = false;  // a shared animation scrolls the panel to the Animate section once the image is read
function toRaw(v) { return (v - (band.offset ?? 0)) / (band.scale ?? 1); }
function toDisp(v) { return v * (band.scale ?? 1) + (band.offset ?? 0); }

// The asset the point and line plots read: the one shown, or vv under an RGB browse image (so the browse
// image serves as the map to pick on).
function plotAsset() { return !rgbMode ? $('asset').value : selected?.assets.vv ? 'vv' : ''; }

function showAsset(key) {
  if (!selected || !key) return;
  saReady = false;  // wait for this asset's levels before computing a static anomaly
  clearStaticAnom();
  resetAnimation();
  const a = selected.assets[key];
  band = a['raster:bands']?.[0] || {};
  const nodata = band.nodata ?? undefined;
  const projection = selected.epsg ? `EPSG:${selected.epsg}` : undefined;
  rgbMode = (a['raster:bands']?.length ?? 1) >= 3;
  pfOnShown(plotAsset());
  refreshArrows(); refreshContours(); refreshParticles();
  $('stretchCtl').hidden = rgbMode; $('rgbNote').hidden = !rgbMode;
  $('lname').textContent = a.href.split('/').pop();
  $('legend').hidden = false;
  if (rgbMode) {
    rasterLayer.setStyle(rgbStyle(a));
    rasterLayer.setSource(new ol.source.GeoTIFF({ sources: [{ url: a.href, nodata }], normalize: true, interpolate: true, projection }));
    loadSample(a.href, nodata);
    compareKey = ''; refreshCompare();
    return;
  }
  // Speeds and errors start at a hard 0; velocity components are stretched symmetrically about 0.
  stretchMode = zeroFloorAssets.has(key) ? 'zero' : signedAssets.has(key) ? 'symmetric' : 'both';
  $('clipwhere').textContent = { zero: 'at the top (min fixed at 0)', symmetric: 'each end, centered on 0', both: 'each end' }[stretchMode];
  if (stretchMode === 'symmetric') {
    if ($('cmap').value !== 'blue-white-red') { lastSeqCmap = $('cmap').value; $('cmap').value = 'blue-white-red'; }
  } else if (!cmapChosen) {
    $('cmap').value = key === 'vv' ? 'viridis' : 'gray';  // speed opens in viridis until a map is picked
  } else if ($('cmap').value === 'blue-white-red') {
    $('cmap').value = lastSeqCmap;
  }
  setColormap($('cmap').value || 'gray');
  const st = band.statistics || {};
  let lo = num(st.minimum) ?? 0, hi = num(st.maximum) ?? 255;
  if (st.mean != null && st.stddev) { lo = Math.max(lo, st.mean - 2 * st.stddev); hi = Math.min(hi, st.mean + 2 * st.stddev); }
  if (stretchMode === 'zero') lo = toRaw(0);
  if (stretchMode === 'symmetric') { const L = Math.max(Math.abs(toDisp(lo)), Math.abs(toDisp(hi))); lo = toRaw(-L); hi = toRaw(L); }
  rasterLayer.setSource(new ol.source.GeoTIFF({ sources: [{ url: a.href, nodata }], normalize: false, interpolate: true, projection }));
  setStretch(...(startStretch || [toDisp(lo), toDisp(hi)]));
  $('lunit').textContent = band.unit || '';
  loadSample(a.href, nodata);
  compareKey = ''; refreshCompare();
}

// RGB(A) browse images: let OpenLayers scale each 8-bit band to 0-1 and draw it as color.
// Browse images have no alpha band; their background is pure white (255, 255, 255), so make that clear.
function rgbStyle(a) {
  const white = ['all', ['==', ['band', 1], 1], ['==', ['band', 2], 1], ['==', ['band', 3], 1]];
  const alpha = a['raster:bands'].length >= 4 ? ['band', 4] : ['case', white, 0, 1];
  return { color: ['array', ['band', 1], ['band', 2], ['band', 3], alpha] };
}

function setStretch(dlo, dhi) {
  const r = v => +v.toPrecision(4);
  $('smin').value = r(dlo); $('smax').value = r(dhi);
  $('lmin').textContent = r(dlo); $('lmax').textContent = r(dhi);
  const changed = rawLo !== toRaw(dlo) || rawHi !== toRaw(dhi);
  rawLo = toRaw(dlo); rawHi = toRaw(dhi);
  if (!rgbMode) { rasterLayer.updateStyleVariables({ lo: rawLo, hi: rawHi }); if (compareItem) compareLayer.updateStyleVariables({ lo: rawLo, hi: rawHi }); }
  if (changed && frames.length) resetAnimation('The color range changed; load the frames again to use it.');
  if (changed && saShown?.stack) drawStack();
}

function setColormap(name) {
  if (frames.length) resetAnimation('The color map changed; load the frames again to use it.');
  rasterLayer.setStyle(rasterStyle(cmaps[name], rawLo, rawHi));
  syncCompareStyle();
  $('bar').style.background = `linear-gradient(90deg, ${cmaps[name].join(', ')})`;
  if (saShown?.stack) drawStack();
}

// Percentile stretch: sort the valid pixels of a small overview (about 1000-1500 px across) once per image.
// The same pass records every resolution level (full image + overviews) for the area download.
let sample = null, sampleToken = 0, levels = null, origin = null;
const tiffCache = new Map();
function assetLevels(href) {
  // Every resolution level of one COG (full image first, then overviews), opened once per page.
  if (!tiffCache.has(href)) tiffCache.set(href, (async () => {
    const tiff = await GeoTIFF.fromUrl(href);
    const n = await tiff.getImageCount();
    const base = await tiff.getImage(0), r0 = base.getResolution()[0];
    const found = [];
    for (let i = 0; i < n; i++) {
      const im = await tiff.getImage(i);
      found.push({ img: im, res: r0 * base.getWidth() / im.getWidth() });
    }
    return { levels: found, origin: base.getOrigin() };
  })().catch(e => { tiffCache.delete(href); throw e; }));
  return tiffCache.get(href);
}
async function loadSample(href, nodata) {
  const token = ++sampleToken;
  sample = null; levels = null; updateCropInfo();
  $('clipnote').textContent = 'Reading overview for clip...';
  try {
    const info = await assetLevels(href);
    if (token !== sampleToken) return;
    const found = info.levels;
    levels = found; origin = info.origin; saReady = true;
    updateCropInfo();
    const small = found.filter(l => l.img.getWidth() <= 1500);
    const img = (small.length ? small[0] : found[found.length - 1]).img;
    const [values] = await img.readRasters({ samples: [0] });
    if (token !== sampleToken) return;
    const valid = Float64Array.from(values).filter(v => Number.isFinite(v) && v !== nodata);
    valid.sort();
    sample = valid;
    $('clipnote').textContent = `Clip from ${img.getWidth()} x ${img.getHeight()} overview, ${valid.length.toLocaleString()} valid pixels`;
    applyClip();
  } catch (e) {
    if (token === sampleToken) $('clipnote').textContent = `Could not read overview (${e.message}); using catalog statistics`;
  }
}

