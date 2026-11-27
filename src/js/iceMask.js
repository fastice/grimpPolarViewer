// Show only: the shown product where the GIMP land ice / ocean mask (NSIDC-0714 v1.2, 15 m; also its own
// collection) is ice, land or water, from the epoch (2000, 2015 or 2020) nearest the product's middle date.
// Greenland (EPSG:3413) single-band products only. The main and swipe layers are then read through a DataTile
// source that folds the mask into the nodata alpha the style uses (band 2), on the COG's own tiles and levels;
// animation frames and anomaly stacks are set to NaN outside the classes kept. Downloads are not masked.
const maskBase = 'https://s3.kopah.uw.edu/ianj-grimp/public/nsidc-0714/v01/';
const maskEpochs = [[2000, 2000.7], [2015, 2014.6], [2020, 2020.7]];  // [epoch, middle of its imagery, decimal year]
const maskClassNames = { 1: 'ice', 2: 'land', 3: 'water' };
const maskShown = () => $('maskSel').value;  // '' everything, else the classes kept, e.g. '1' or '12'
const maskOk = it => !!it && it.epsg === 3413;
const maskOn = it => !!maskShown() && maskOk(it) && !rgbMode && !classMode;
function maskEpoch(it) {
  const y = 1970 + (new Date(it.start).getTime() + new Date(it.end).getTime()) / 2 / 3.15576e10;
  return maskEpochs.reduce((b, m) => Math.abs(m[1] - y) < Math.abs(b[1] - y) ? m : b)[0];
}
const maskItem = it => {
  const href = `${maskBase}GrIMP_LandIceOceanMask_15m_${maskEpoch(it)}_class_v01.2.tif`;
  return { id: href, assets: { class: { href, 'raster:bands': [{ nodata: 0 }] } } };
};
// 1 where the mask class at each pixel of a W x H frame on ext (res m) is kept, else 0
async function maskKeep(it, ext, res, W, H) {
  const { values } = await readFrame(maskItem(it), 'class', ext, res, W, H), keep = maskShown();
  return Uint8Array.from(values, v => keep.includes(String(v)) ? 1 : 0);
}
// a frame from readFrame with the pixels outside the classes kept set to NaN (in place)
async function maskFrame(f, it, ext, res, W, H) {
  if (!maskOn(it) || !f.values) return f;
  const keep = await maskKeep(it, ext, res, W, H);
  for (let k = 0; k < keep.length; k++) if (!keep[k]) f.values[k] = NaN;
  return f;
}
// the mask class (name) at a map point, or '' when it is kept
async function maskedAt(it, coord) {
  if (!maskOn(it)) return '';
  const [v] = (await readFrame(maskItem(it), 'class', [coord[0] - 7.5, coord[1] - 7.5, coord[0] + 7.5, coord[1] + 7.5], 15, 1, 1)).values;
  return maskShown().includes(String(v)) ? '' : maskClassNames[v] || 'outside the mask';
}

function plainSource(a, nodata, projection) {
  return new ol.source.GeoTIFF({ sources: [tiffSource(a.href, nodata)], normalize: false, interpolate: !classMode, projection });
}
async function maskedSource(it, a, nodata) {
  const { levels: lv, origin: org } = await assetLevels(a.href), ts = 256;
  const r0 = lv[0].res, extent = [org[0], org[1] - lv[0].img.getHeight() * r0, org[0] + lv[0].img.getWidth() * r0, org[1]];
  const tileGrid = new ol.tilegrid.TileGrid({ extent, origin: [org[0], org[1]], resolutions: lv.map(l => l.res).reverse(), tileSize: ts });
  return new ol.source.DataTile({ projection: 'EPSG:3413', tileGrid, bandCount: 2, interpolate: true, wrapX: false, loader: async (z, x, y) => {
    const { img, res: r } = lv[lv.length - 1 - z], out = new Float32Array(ts * ts * 2);
    const c0 = x * ts, w = Math.min(img.getWidth(), c0 + ts) - c0, q0 = y * ts, h = Math.min(img.getHeight(), q0 + ts) - q0;
    if (w <= 0 || h <= 0) return out;
    const [[v], keep] = await Promise.all([img.readRasters({ window: [c0, q0, c0 + w, q0 + h], samples: [0] }),
      maskKeep(it, [org[0] + c0 * r, org[1] - (q0 + ts) * r, org[0] + (c0 + ts) * r, org[1] - q0 * r], r, ts, ts)]);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const val = v[j * w + i], o = 2 * (j * ts + i);
      out[o] = val; out[o + 1] = Number.isFinite(val) && val !== nodata && keep[j * ts + i] ? 1 : 0;
    }
    return out;
  } });
}
// layer shows asset a of item it, masked when Show only is set; the plain source first, the masked one when ready
const maskTokens = new Map();
function setLayerSource(layer, it, a, nodata, projection) {
  const token = (maskTokens.get(layer) || 0) + 1;
  maskTokens.set(layer, token);
  const plain = plainSource(a, nodata, projection);
  layer.setSource(plain);
  if (!maskOn(it)) return;
  maskedSource(it, a, nodata).then(s => { if (maskTokens.get(layer) === token) layer.setSource(s); })
    .catch(e => setStatus(`Could not apply the mask (${e.message})`));
}
function maskInfo() {
  const ok = maskOk(selected) && !rgbMode && !classMode;
  $('maskRow').hidden = !ok;
  $('maskNote').textContent = ok && maskShown() ? `GIMP mask ${maskEpoch(selected)}` : '';
}
$('maskSel').onchange = () => {
  maskInfo();
  if (!selected || rgbMode || classMode) return;
  if (frames.length) resetAnimation('The mask changed; load the frames again to use it.');
  if (saShown) clearStaticAnom();
  const a = selected.assets[$('asset').value];
  setLayerSource(rasterLayer, selected, a, a['raster:bands']?.[0]?.nodata ?? undefined, `EPSG:${selected.epsg}`);
  compareKey = ''; refreshCompare();
};
if ([...$('maskSel').options].some(o => o.value && o.value === startParams.get('mask'))) $('maskSel').value = startParams.get('mask');
