let band = {};
let startAsset = new URL(location.href).searchParams.get('asset');
// A link from "Share this view" also carries the item, map view, time range, stretch and points; they apply
// to the first catalog loaded.
const startParams = new URL(location.href).searchParams;
const numList = (s, n = 2) => { const v = s.split(',').map(Number); return v.length === n && v.every(Number.isFinite) ? v : null; };
let startView = ['item', 'x', 't0', 'pts', 'area', 'anim', 'pf', 'flow'].some(k => startParams.has(k)) ? {
  item: startParams.get('item'),
  center: numList(`${startParams.get('x')},${startParams.get('y')}`), zoom: +startParams.get('z') || null,
  t0: startParams.get('t0'), t1: startParams.get('t1'),
  pts: (startParams.get('pts') || '').split(';').map(c => numList(c)).filter(Boolean),
  area: numList(startParams.get('area') || '', 4), anim: startParams.get('anim') === '1',
  pf: (startParams.get('pf') || '').split(';').map(c => numList(c)).filter(Boolean),  // drawn profile line A;B
  flow: numList(startParams.get('flow') || ''), flen: numList(startParams.get('flen') || ''),  // flow-line point; m up, down
} : null;
// Year ranges of the glacier fronts and dated grounding lines, applied when their sliders are built.
const startYears = { fronts: numList(startParams.get('fy') || ''), gl: numList(startParams.get('gy') || '') };
let startStretch = numList(`${startParams.get('lo')},${startParams.get('hi')}`);
// A shared profile date series: [dt option value, first and last step from the anchor (the item shown)].
let startSer = (s => s && s.length === 3 && s.every(Number.isFinite) ? s : null)((startParams.get('pser') || '').split(',').filter(Boolean).map(Number));
let startRef = startParams.get('pref');  // a shared profile's reference curve (item id), set once that curve is read
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
    rasterLayer.setSource(new ol.source.GeoTIFF({ sources: [tiffSource(a.href, nodata)], normalize: true, interpolate: true, projection }));
    loadSample(a.href, nodata);
    compareKey = ''; refreshCompare();
    return;
  }
  // Speeds and errors start at a hard 0; velocity components are stretched symmetrically about 0.
  stretchMode = zeroFloorAssets.has(key) ? 'zero' : signedAssets.has(key) ? 'symmetric' : 'both';
  logScale = stretchMode === 'zero' && (logChosen ?? key === 'vv');
  clipMoved = false;
  $('logRow').hidden = stretchMode !== 'zero'; $('logScale').checked = logScale;
  clipWhere();
  if (stretchMode === 'symmetric') {
    if ($('cmap').value !== 'blue-white-red') { lastSeqCmap = $('cmap').value; $('cmap').value = 'blue-white-red'; }
  } else if (!cmapChosen) {
    $('cmap').value = key === 'vv' ? (logScale ? 'browse' : 'viridis') : 'gray';  // speed opens in browse colors until a map is picked
  } else if ($('cmap').value === 'blue-white-red') {
    $('cmap').value = lastSeqCmap;
  }
  setColormap($('cmap').value || 'gray');
  const st = band.statistics || {};
  let lo = num(st.minimum) ?? 0, hi = num(st.maximum) ?? 255;
  if (st.mean != null && st.stddev) { lo = Math.max(lo, st.mean - 2 * st.stddev); hi = Math.min(hi, st.mean + 2 * st.stddev); }
  if (stretchMode === 'zero') lo = toRaw(0);
  if (stretchMode === 'symmetric') { const L = Math.max(Math.abs(toDisp(lo)), Math.abs(toDisp(hi))); lo = toRaw(-L); hi = toRaw(L); }
  rasterLayer.setSource(new ol.source.GeoTIFF({ sources: [tiffSource(a.href, nodata)], normalize: false, interpolate: true, projection }));
  setStretch(...(startStretch || (logScale && key === 'vv' && !clipMoved ? browseRange : [toDisp(lo), toDisp(hi)])));
  $('lunit').textContent = unitText();
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

const unitText = () => `${band.unit || ''}${logScale ? ' (log scale)' : ''}`;
function clipWhere() {
  $('clipwhere').textContent = logScale ? 'each end (log scale)' : { zero: 'at the top (min fixed at 0)', symmetric: 'each end, centered on 0', both: 'each end' }[stretchMode];
}
// On a log scale, the powers of 10 between the ends of the color range (and 2 and 5 times them when the range
// spans less than two decades), as [value, 0-1 position along the bar], not at the very ends.
function logTicks(lo, hi) {
  if (!(lo > 0 && hi > lo)) return [];
  const out = [], span = Math.log(hi / lo), steps = Math.log10(hi / lo) < 2 ? [1, 2, 5] : [1];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) for (const m of steps) {
    const v = m * 10 ** e, f = Math.log(v / lo) / span;
    if (f > 0.05 && f < 0.95) out.push([v, f]);
  }
  return out;
}
function drawBarTicks(dlo, dhi) {
  const ticks = logScale ? logTicks(dlo, dhi) : [];
  $('barTicks').hidden = !ticks.length;
  $('barTicks').replaceChildren(...ticks.map(([v, f]) => { const s = document.createElement('span'); s.textContent = v; s.style.left = `${(f * 100).toFixed(2)}%`; return s; }));
}
function setStretch(dlo, dhi) {
  if (logScale && !(dlo > 0)) dlo = dhi / 1000;  // a log scale starts above 0
  const r = v => +v.toPrecision(4);
  $('smin').value = r(dlo); $('smax').value = r(dhi);
  $('lmin').textContent = r(dlo); $('lmax').textContent = r(dhi);
  drawBarTicks(dlo, dhi);
  const changed = rawLo !== toRaw(dlo) || rawHi !== toRaw(dhi);
  rawLo = toRaw(dlo); rawHi = toRaw(dhi);
  if (!rgbMode) { const v = styleVars(rawLo, rawHi, logScale); rasterLayer.updateStyleVariables(v); if (compareItem) compareLayer.updateStyleVariables(v); }
  if (changed && frames.length) resetAnimation('The color range changed; load the frames again to use it.');
  if (changed && saShown?.stack) drawStack();
}

function setColormap(name) {
  if (frames.length) resetAnimation('The color map changed; load the frames again to use it.');
  rasterLayer.setStyle(rasterStyle(cmaps[name], rawLo, rawHi, logScale));
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
    const tiff = await (localFiles.has(href) ? GeoTIFF.fromBlob(localFiles.get(href)) : GeoTIFF.fromUrl(href));
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

