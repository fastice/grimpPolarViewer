// Download: originals or crops of the ticked assets, for the displayed image or for a selection of items.
const maxCropPixels = 64e6;
const boxSource = new ol.source.Vector();
// Boxes are outlines only, so they never tint the image under them: amber for the download crop,
// cyan for the area used by the anomaly, stack and animation.
const outline = color => new ol.style.Style({ stroke: new ol.style.Stroke({ color, width: 2.5 }),
  image: new ol.style.Circle({ radius: 5, fill: new ol.style.Fill({ color }) }) });
const boxLayer = new ol.layer.Vector({ source: boxSource, zIndex: 5, visible: false, style: outline('#e8a33d') });
map.addLayer(boxLayer);
const areaSource = new ol.source.Vector();
map.addLayer(new ol.layer.Vector({ source: areaSource, zIndex: 5, style: outline('#3cc8e6') }));
let draw = null, drawKind = null, cropBox = null, areaBox = null;

function stopDraw() {
  if (draw) map.removeInteraction(draw);
  draw = null; drawKind = null; $('drawBox').textContent = 'Draw box'; $('pfDraw').textContent = 'Draw line'; $('pfFlow').textContent = 'Flow line';
}
const boxDraw = (source, color) => new ol.interaction.Draw({ source, type: 'Circle', geometryFunction: ol.interaction.Draw.createBox(), style: outline(color) });
$('drawBox').onclick = () => {
  if (draw) { const was = drawKind; stopDraw(); if (was === 'crop') return; refreshAnimInfo(); }
  boxSource.clear(); cropBox = null; updateCropInfo();
  draw = boxDraw(boxSource, '#e8a33d'); drawKind = 'crop';
  draw.on('drawend', e => { cropBox = e.feature.getGeometry().getExtent(); setTimeout(() => { stopDraw(); updateCropInfo(); }); updateCropInfo(); });
  map.addInteraction(draw);
  $('drawBox').textContent = 'Cancel';
  $('cropNote').textContent = 'Click one corner, then the opposite corner.';
};
$('assetsAll').onchange = e => {
  for (const box of document.querySelectorAll('#cropAssets input')) box.checked = e.target.checked;
  updateDownloadButtons();
};
$('pickAll').onchange = $('pickAllSites').onchange = e => {
  const on = e.target.checked;  // read once: each togglePick refreshes this box's state
  for (const it of inRange()) togglePick(it, on);
};
$('clearBox').onclick =() => { stopDraw(); boxSource.clear(); cropBox = null; updateCropInfo(); };
$('cropOn').onchange = e => {
  $('cropOpts').hidden = !e.target.checked;
  boxLayer.setVisible(e.target.checked);
  if (!e.target.checked) stopDraw();
  updateCropInfo();
};

function cropWindow(level, org = origin) {
  const W = level.img.getWidth(), H = level.img.getHeight(), r = level.res, [ox, oy] = org;
  const c0 = Math.max(0, Math.floor((cropBox[0] - ox) / r)), c1 = Math.min(W, Math.ceil((cropBox[2] - ox) / r));
  const r0 = Math.max(0, Math.floor((oy - cropBox[3]) / r)), r1 = Math.min(H, Math.ceil((oy - cropBox[1]) / r));
  return c1 > c0 && r1 > r0 ? [c0, r0, c1, r1] : null;
}

function updateCropInfo() {
  $('cropSec').hidden = !selected;
  refreshAnimInfo();
  const sel = $('cropRes');
  $('boxInfo').textContent = cropBox ? `${((cropBox[2] - cropBox[0]) / 1000).toFixed(1)} x ${((cropBox[3] - cropBox[1]) / 1000).toFixed(1)} km` : '';
  $('clearBox').hidden = !cropBox;
  if (!cropBox || !levels) {
    sel.replaceChildren(); sel.disabled = true;
    if (!draw) $('cropNote').textContent = $('cropOn').checked && levels ? 'Draw a box on the map to choose the area.' : '';
    updateDownloadButtons();
    return;
  }
  const bytes = (band.scale ?? 1) !== 1 || (band.offset ?? 0) !== 0 ? 4 : levels[0].img.getBytesPerPixel();
  const prev = sel.value;
  sel.replaceChildren(...levels.map((l, i) => {
    const w = cropWindow(l), px = w ? (w[2] - w[0]) * (w[3] - w[1]) : 0;
    const o = new Option(w ? `${+l.res.toPrecision(4)} m: ${w[2] - w[0]} x ${w[3] - w[1]} px, ${(px * bytes / 1e6).toFixed(1)} MB` : `${l.res} m: outside image`, String(i));
    o.disabled = !w || px > maxCropPixels;
    return o;
  }));
  const ok = [...sel.options].filter(o => !o.disabled);
  sel.value = ok.some(o => o.value === prev) ? prev : (ok[0]?.value ?? '');
  sel.disabled = !ok.length;
  $('cropNote').textContent = ok.length ? '' : 'The box is outside this image.';
  if (ok.length && ok[0].value !== '0') $('cropNote').textContent = `Finer levels exceed ${maxCropPixels / 1e6}M pixels; draw a smaller box for full resolution.`;
  updateDownloadButtons();
}

function tiffAssetKeys(it) {
  return Object.keys(it.assets).filter(k => /tiff/.test(it.assets[k].type || '') || /\.tif$/.test(it.assets[k].href));
}

// NSIDC copies of an item's files: {file name: url} when NSIDC holds the collection's exact version
// (collection id nsidc-<number>-v<version>), found with one CMR search and matched by file name. Started
// when an item is shown, so "Download this product's assets" can link to NSIDC straight from the click.
const nsidcLookups = new Map();  // item id -> promise of {file name: url}
function nsidcFor(it) {
  if (!nsidcLookups.has(it.id)) nsidcLookups.set(it.id, (async () => {
    const ns = /^nsidc-(\d{4})-v(\d+)$/.exec(it.raw?.collection || '');
    if (!ns) return {};
    const day = t => fmtDate(new Date(t));
    const q = new URLSearchParams({ short_name: `NSIDC-${ns[1]}`, version: ns[2], provider: 'NSIDC_CPRD', page_size: '200',
      temporal: `${day(it.start)}T00:00:00Z,${day(it.end)}T23:59:59Z` });
    const r = await fetch(`https://cmr.earthdata.nasa.gov/search/granules.umm_json?${q}`);
    if (!r.ok) return {};
    const out = {};
    for (const g of (await r.json()).items) for (const u of g.umm.RelatedUrls || []) {
      if (u.Type === 'GET DATA' && /^https:.*\.tif$/.test(u.URL)) out[u.URL.split('/').pop()] = u.URL;
    }
    return out;
  })().catch(() => ({})));
  const p = nsidcLookups.get(it.id);
  p.then(m => { it.nsidc = m; if (it === selected) updateDownloadButtons(); });
  return p;
}
const atNsidc = (it, key) => it.nsidc?.[it.assets[key]?.href.split('/').pop()];

function fillCropAssets(it) {
  // Keep ticks across items that share asset names; otherwise tick the asset being displayed.
  const prev = new Set([...document.querySelectorAll('#cropAssets input:checked')].map(i => i.value));
  const keys = tiffAssetKeys(it);
  const keep = keys.filter(k => prev.has(k));
  const ticked = new Set(keep.length ? keep : [$('asset').value]);
  $('cropAssets').replaceChildren(...keys.map(k => {
    const lab = document.createElement('label'), box = document.createElement('input');
    box.type = 'checkbox'; box.value = k; box.checked = ticked.has(k);
    lab.title = `Include ${k} in downloads`;
    box.onchange = updateDownloadButtons;
    lab.append(box, ' ' + k);
    return lab;
  }));
  updateDownloadButtons();
}

function checkedAssets() {
  return [...document.querySelectorAll('#cropAssets input:checked')].map(i => i.value);
}

function selectionItems() {
  // Picked items when there are any; otherwise every item in the current time range. For site products
  // (TSX) a download is one site box: unpicked, the displayed site's dates in the range.
  if (picks.size) return items.filter(i => picks.has(i));
  const site = siteMode && selected?.raw?.['grimp:site'];
  return site ? inRange().filter(i => i.raw?.['grimp:site'] === site) : inRange();
}
const selectionSites = its => new Set(its.map(i => i.raw?.['grimp:site']).filter(Boolean));

let busy = false, siteMode = false;
function updateDownloadButtons() {
  const n = checkedAssets().length, crop = $('cropOn').checked;
  const cropReady = !crop || (!$('cropRes').disabled && $('cropRes').value !== '');
  const selItems = selectionItems();
  $('dlImage').disabled = busy || !selected || !n || !cropReady;
  const nSites = selectionSites(selItems).size;
  $('dlSel').disabled = busy || !selItems.length || !n || !cropReady || nSites > 1;
  if (siteMode) {
    // Small site products (TSX glacier boxes) are downloaded whole, one site box per download file.
    $('dlImage').textContent = "Download this product's assets";
    const site = [...selectionSites(selItems)][0] || '';
    $('dlSel').textContent = nSites > 1 ? 'Pick dates from one site box only'
      : `Save download file: ${site} ${picks.size ? `${selItems.length} picked` : `${selItems.length} dates in range`}`;
    $('pickCount').textContent = picks.size ? `${picks.size} picked.` : '';
  } else {
    const fromNsidc = selected && checkedAssets().some(k => atNsidc(selected, k));
    $('dlImage').textContent = crop ? (fromNsidc ? "Save download file: crop of this product's assets" : "Download crop of this product's assets")
                                    : `Download this product's assets${fromNsidc ? ' (from NSIDC)' : ''}`;
    const what = picks.size ? `${picks.size} picked item${picks.size > 1 ? 's' : ''}` : `all ${selItems.length} in time range`;
    $('dlSel').textContent = `Save download file${crop ? ' (crops)' : ''}: ${what}`;
  }
  $('clearPicks').hidden = !picks.size;
  const boxes = [...document.querySelectorAll('#cropAssets input')], on = boxes.filter(b => b.checked).length;
  $('assetsAll').checked = boxes.length > 0 && on === boxes.length;
  $('assetsAll').indeterminate = on > 0 && on < boxes.length;
  const shown = inRange(), shownPicked = shown.filter(i => picks.has(i)).length;
  for (const id of ['pickAll', 'pickAllSites']) {
    $(id).checked = shown.length > 0 && shownPicked === shown.length;
    $(id).indeterminate = shownPicked > 0 && shownPicked < shown.length;
  }
}
$('clearPicks').onclick = () => { for (const it of [...picks]) togglePick(it, false); };

async function cropAsset(it, key, res) {
  // Cut one asset to the box at the level nearest the chosen resolution, on that asset's own grid.
  const a = it.assets[key];
  if (!a) throw new Error(`${it.id} has no ${key} asset`);
  const b = a['raster:bands']?.[0] || {};
  const { levels: lv, origin: org } = await assetLevels(a.href);
  const level = lv.reduce((best, l) => Math.abs(l.res - res) < Math.abs(best.res - res) ? l : best);
  const w = cropWindow(level, org);
  if (!w) return null;
  const r = level.res, scale = b.scale ?? 1, offset = b.offset ?? 0, nodata = b.nodata;
  const nb = level.img.getSamplesPerPixel();
  // Multi-band (RGB browse) assets keep every band, pixel-interleaved, in their stored 8-bit form.
  const raw = nb > 1 ? await level.img.readRasters({ window: w, interleave: true })
                     : (await level.img.readRasters({ window: w, samples: [0] }))[0];
  let data = raw, outNodata = nodata;
  if (nb === 1 && (scale !== 1 || offset !== 0)) {
    // Write physical units (e.g. dB) as float32 so the file needs no scale/offset to read.
    data = new Float32Array(raw.length);
    for (let k = 0; k < raw.length; k++) data[k] = raw[k] * scale + offset;
    if (nodata != null) {
      outNodata = nodata * scale + offset;
      for (let k = 0; k < raw.length; k++) if (raw[k] === nodata) data[k] = outNodata;
    }
  }
  const meta = { width: w[2] - w[0], height: w[3] - w[1],
    ModelPixelScale: [r, r, 0], ModelTiepoint: [0, 0, 0, org[0] + w[0] * r, org[1] - w[1] * r, 0],
    GTModelTypeGeoKey: 1, GTRasterTypeGeoKey: 1, ProjectedCSTypeGeoKey: it.epsg };
  if (outNodata != null) meta.GDAL_NODATA = String(outNodata);
  const blob = new Blob([GeoTIFF.writeArrayBuffer(data, meta)], { type: 'image/tiff' });
  const stem = a.href.split('/').pop().replace(/\.tif$/, '');
  return { blob, name: `${stem}_crop_${Math.round(meta.ModelTiepoint[3])}_${Math.round(meta.ModelTiepoint[4])}_${+r.toPrecision(4)}m.tif` };
}

function saveUrl(url, name) {
  const link = document.createElement('a');
  link.href = url; link.download = name || '';
  if (new URL(url, location.href).origin !== location.origin) link.target = '_blank';  // download= only works same-origin
  document.body.append(link); link.click(); link.remove();
}
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  saveUrl(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const pause = ms => new Promise(r => setTimeout(r, ms));

async function runDownload(list, crop) {
  // list: [{ it, key }] in order. Originals are saved from NSIDC when it holds them (the browser asks for the
  // Earthdata login), otherwise from Kopah; crops are cut in the browser (Kopah files only).
  busy = true; updateDownloadButtons();
  const res = crop ? levels[+$('cropRes').value].res : null;
  let saved = 0, skipped = 0, mb = 0;
  try {
    for (const [i, { it, key }] of list.entries()) {
      $('cropNote').textContent = `${crop ? 'Cropping' : 'Saving'} ${it.id} ${key} (${i + 1} of ${list.length})...`;
      if (crop) {
        const out = await cropAsset(it, key, res);
        if (!out) { skipped++; continue; }
        saveBlob(out.blob, out.name); mb += out.blob.size / 1e6;
      } else {
        saveUrl(atNsidc(it, key) || it.assets[key].href, it.assets[key].href.split('/').pop());
      }
      saved++;
      await pause(crop ? 400 : 800);
    }
    $('cropNote').textContent = `Saved ${saved} file${saved === 1 ? '' : 's'}${crop ? ` (${mb.toFixed(1)} MB)` : ''}`
      + (skipped ? `; ${skipped} skipped because the box is outside them` : '') + '.';
  } catch (e) {
    $('cropNote').textContent = `Download failed after ${saved} file(s): ${e.message}`;
  }
  busy = false; updateDownloadButtons();
}

$('dlImage').onclick = () => {
  const keys = checkedAssets().filter(k => selected.assets[k]), crop = $('cropOn').checked;
  // NSIDC files cannot be cut in the browser (Earthdata login, no cross-site reads): crop them with grimpdownload.
  if (crop && keys.some(k => atNsidc(selected, k))) { saveDownloadFile([selected]); return; }
  runDownload(keys.map(key => ({ it: selected, key })), crop);
};

// Download selection saves a download file (.grimp.yaml; JSON, which is valid YAML) for the grimpdownload
// command (grimppolarviewer package in this repository). It names the products and their Kopah files;
// grimpdownload reads each file from NSIDC when NSIDC holds the same version (matched by file name) and
// from Kopah otherwise, so files saved now switch to NSIDC by themselves once NSIDC has them.
const installCmd = 'pip install git+https://github.com/fastice/grimpPolarViewer';
// Files under the GrIMP Kopah root are listed by path only; grimpdownload adds the root (or reads NSIDC).
const kopahRoot = 'https://s3.kopah.uw.edu/ianj-grimp/public/';
const kopahPath = href => href.startsWith(kopahRoot) ? href.slice(kopahRoot.length) : href;
$('dlSel').onclick = () => saveDownloadFile(selectionItems());
function saveDownloadFile(its) {
  const keys = checkedAssets(), crop = $('cropOn').checked && cropBox;
  const coll = items[0]?.raw?.collection || 'grimp', ns = /^nsidc-(\d{4})-v(\d+)$/.exec(coll);
  const manifest = {
    grimpDownload: 1, created: new Date().toISOString(),
    viewer: ($('title').querySelector('small')?.textContent.match(/build (.*)$/) || [, 'dev'])[1],
    collection: coll, nsidc: ns ? { shortName: `NSIDC-${ns[1]}`, version: ns[2] } : null,
    epsg: +viewCode.split(':')[1], assets: keys,
    ...(crop ? { crop: { bbox: cropBox.map(v => Math.round(v)), resolution: +levels[+$('cropRes').value].res.toPrecision(6) } } : {}),
    items: its.map(it => ({ id: it.id, start: fmtDate(new Date(it.start)), end: fmtDate(new Date(it.end)),
      files: Object.fromEntries(keys.filter(k => it.assets[k]).map(k => [k, kopahPath(it.assets[k].href)])) })),
  };
  const nFiles = manifest.items.reduce((n, it) => n + Object.keys(it.files).length, 0);
  const site = [...selectionSites(its)][0];
  const name = `${coll}${site ? `_${site}` : ''}_${manifest.created.slice(0, 10)}.grimp.yaml`;
  saveBlob(new Blob([JSON.stringify(manifest, null, 1) + '\n'], { type: 'application/x-yaml' }), name);
  $('cropNote').textContent = `Saved ${name} (${nFiles} file${nFiles === 1 ? '' : 's'}${crop ? ', cropped' : ''}). Download with: `
    + `grimpdownload ${name}   (install once with: ${installCmd})`;
}

