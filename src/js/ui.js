function applyClip() {
  const p = +$('clip').value;
  $('clipv').textContent = `${p}%`;
  if (rgbMode || !sample || !sample.length) return;
  if (startStretch) { setStretch(...startStretch); startStretch = null; return; }  // a shared link's range wins once
  const at = q => sample[Math.min(sample.length - 1, Math.max(0, Math.round(q * (sample.length - 1))))];
  const lo = toDisp(at(p / 100)), hi = toDisp(at(1 - p / 100));
  if (stretchMode === 'zero') setStretch(0, hi);
  else if (stretchMode === 'symmetric') {
    // Same limit both sides: the larger of the two tails, so neither end clips more than p%.
    const L = Math.max(Math.abs(lo), Math.abs(hi));
    setStretch(-L, L);
  } else setStretch(lo, hi);
}

// Hover tooltips for the controls. A checkbox's tooltip also goes on its label, so hovering the text shows it.
const tips = {
  hemN: 'Greenland and other Arctic collections (polar stereographic EPSG:3413)',
  hemS: 'Antarctic collections (polar stereographic EPSG:3031)',
  preset: 'Collections for the selected hemisphere; pick one to open its catalog',
  href: 'URL of any public stac-geoparquet catalog (.parquet); press Enter or Load',
  load: 'Open the catalog URL',
  share: 'Copy a link that reopens this view: collection, product, asset, map position, time range, colors, layers, background and points',
  animShare: 'Copy a link that reopens this view with the same animation area and settings, ready to load the frames',
  shareQr: 'Show the Share this view link as a QR code',
  animShareQr: 'Show the Share this animation link as a QR code',
  asset: 'Which file of the item to show (e.g. vv speed, vx/vy components, browse image)',
  opacity: 'Transparency of the image over the basemap',
  baseOn: 'NASA GIBS Blue Marble basemap',
  bgColl: 'Show an image (backscatter) product in gray under the main layer; kept for this hemisphere until you change it',
  bgItem: 'Which image of the background collection to show',
  coastOn: 'Coastline overlay: NASA GIBS, except in Antarctica, where it is the NSIDC-0709 v2 grounding line (white) and the ice front and coast of the September 2026 GrIMP ice mask (cyan), with ice shelf names as you zoom in',
  footOn: 'Outlines of the items in the time range; click one to show it',
  arrowsOn: 'Flow direction of the shown velocity product (its vx and vy), averaged over each arrow\'s cell; longer arrows are faster (log scale up to the fastest 5% in view); none below 5 m/yr',
  olAdd: 'Draw your own GeoJSON, KML or GPX outlines on the map (they stay in this browser tab, nothing is uploaded)',
  boundsOn: 'Drainage basins: IMBIE (NSIDC-0709 v2) in Antarctica, Mouginot and Rignot (2019) glacier basins in Greenland; point at a basin for its true area (the polar stereographic map area corrected for the projection scale)',
  particlesOn: 'Streaks drifting with the flow of the shown velocity product (its vx and vy); faster ice moves faster and leaves longer trails. Paused while the map moves',
  contourOn: 'Lines of equal speed (isotachs) of the shown product\'s speed (vv), at the levels typed below, read at the map\'s resolution and lightly smoothed',
  contourLevels: 'Speeds to contour, m/yr, separated by commas (at most 12)',
  pfYrOn: 'Dots along the flow line where ice at the point was (upstream, -) or will be (downstream, +) after each interval, for steady flow at the speeds of the mosaic the line was traced on',
  pfYrStep: 'Years between travel-time marks',
  fpShow: 'Plot where the glacier fronts or dated grounding lines shown on the map cross the line, against date (their year sliders pick the years); the profile plot marks the same crossings along its top',
  fpPng: 'Save the front-position plot as a PNG (these lines are not GrIMP data, so there is no CSV)',
  tsXMode: 'Plot against date, or fold the series onto the months of the year with one line per year (colored by year) to compare seasonal cycles',
  glOn: 'Dated InSAR grounding lines of the Amundsen Sea glaciers, 1992-2025 (NSIDC-0498 v2.1), colored by year; point at one for its date. Antarctica only',
  frontsOn: 'Winter ice-front positions of Greenland outlet glaciers, 1972-73 to 2020-21 (NSIDC-0642 v2), colored by year; point at a front for its date',
  namesOn: 'Glacier and place names: Greenland from Bjørk et al. 2015, Antarctica from the SCAR Composite Gazetteer. Zoomed out only the major ones, more as you zoom in',
  cmap: 'Color map for single-band images',
  clip: 'Percent of pixels saturated at each end of the color range (only the top for speeds; symmetric for vx/vy)',
  smin: 'Lowest value of the color range (type to override the clip)',
  smax: 'Highest value of the color range (type to override the clip)',
  saOn: 'Show the displayed date minus the per-pixel mean of all dates in its time series, or minus one date (Minus)',
  saRef: 'What the anomaly subtracts: the per-pixel mean of the dates in the time range, or one of those dates (a two-date difference)',
  swOn: 'Split the map: the chosen date left of a line you can drag, the displayed date right of it, with the same colors',
  swRef: 'Date shown left of the swipe line',
  swHandle: 'Drag (or use the arrow keys) to move the swipe line',
  stOn: 'Show the per-pixel mean (stack) of all dates in the time range, with the normal color controls',
  saRes: 'Grid spacing for the anomaly; draw a crop box to get finer levels',
  saRange: 'Color range of the anomaly, ± this value; blank or Auto uses a 1% clip',
  saAuto: 'Go back to the automatic range (1% clip over all dates)',
  saPrev: 'Show the anomaly for the previous date in the series',
  saNext: 'Show the anomaly for the next date in the series',
  animStep: 'Skip dates so frames are at least this many days apart (blank: every date); fewer frames allow finer resolution',
  animDrawBox: 'Draw the area (shared with the anomaly and stack): click one corner on the map, then the opposite corner',
  animWhole: 'Use the whole image instead of the box',
  saDrawBox: 'Draw the area (shared with the animation): click one corner on the map, then the opposite corner',
  saWhole: 'Use the whole image instead of the box',
  animRes: 'Grid spacing of the frames; finer levels need a smaller box',
  animAnom: 'Animate each date minus the per-pixel mean of all frames',
  animRange: 'Anomaly color range, ± this value; changing it recolors the loaded frames',
  animRangeAuto: 'Go back to the automatic anomaly range (current clip %)',
  animBar: 'Draw a color bar into each frame (also in the saved movie)',
  animFps: 'Playback speed, and the frame rate of the saved movie',
  animLoop: 'Start again from the first frame after the last',
  animBuild: 'Read every date in the series and draw the frames',
  animPlay: 'Play or pause the animation',
  animClose: 'Remove the animation and show the normal image again',
  animPos: 'Drag to show a single frame',
  animExport: 'Save the loaded frames as an H.264 MP4 (plays in QuickTime, Windows Media Player, browsers, PowerPoint)',
  assetsAll: 'Tick or untick every asset',
  cropOn: 'Download a cropped area instead of whole files',
  drawBox: 'Draw the crop box: click one corner on the map, then the opposite corner',
  clearBox: 'Remove the box',
  cropRes: 'Grid spacing of the cropped files; levels over 64 million pixels are disabled',
  dlImage: 'Save the ticked assets of the displayed item',
  dlSel: 'Save a download file for the picked items (or every item in the time range), with the crop box if Crop is ticked; run grimpdownload on it',
  pickAllSites: 'Pick every site in the time range for download',
  pickAll: 'Pick every item in the time range for download',
  clearPicks: 'Unpick all items',
  th0: 'Start of the time range: drag, or use the arrow keys',
  th1: 'End of the time range: drag, or use the arrow keys',
  treset: 'Show the full time range',
  tsShow: 'Hide or show the time-series plot',
  pfDraw: 'Click two points on the map (A, then B) to plot the shown product along the line; each product you show next adds its curve',
  pfFlow: 'Click a point on a glacier: the line follows the ice flow up and down stream from it (traced on the newest annual velocity mosaic, or else the loaded catalog\'s longest-period velocity product)',
  pfAccept: 'Read the products along the flow line as it is now (Adjust point lets you drag the point again)',
  pfLo: 'Length of the flow line upstream of the point (km); the plot is read again when you let go',
  pfHi: 'Length of the flow line downstream of the point (km); the plot is read again when you let go',
  pfShow: 'Hide or show the profile plot',
  frontsLo: 'First winter of glacier fronts drawn', frontsHi: 'Last winter of glacier fronts drawn',
  glLo: 'First year of dated grounding lines drawn', glHi: 'Last year of dated grounding lines drawn',
  frontsBand: 'Drag to shift the winters drawn, keeping how many', glBand: 'Drag to shift the years drawn, keeping how many',
  pfClear: 'Remove the line and its plot',
  pfIts: 'Also plot ITS_LIVE image pairs whose time span includes the shown product\'s central date, sampled every 120 m, in grey; for an annual product, the ITS_LIVE annual mosaic of that calendar year instead (dashed)',
  pfItsDt: 'Only ITS_LIVE pairs whose images are at most this many days apart (not used for annual products)',
  pfCsv: 'Save the GrIMP curves shown as CSV, one row per sample along the line; curves hidden in the legend are left out (ITS_LIVE is shown for comparison only and is not saved)',
  pfXLo: 'Left end of the plot x axis: drag right to zoom in',
  pfXHi: 'Right end of the plot x axis: drag left to zoom in',
  pfXBand: 'Drag to pan the plot x range along the line, keeping its width',
  pfYLo: 'Bottom of the plot y axis: drag right to zoom in',
  pfYHi: 'Top of the plot y axis: drag left to zoom in',
  pfYBand: 'Drag to shift the plot y range up or down, keeping its height',
  tsCanvas: 'Click a point\'s date to show it on the map; click a legend number to hide or show that point, or its x to remove it; click a catalog in the second legend row to hide or show its series, or an earlier catalog\'s x to drop them',
  pfCanvas: 'Drag the legend to move it; click an entry to hide or show its curve, or its x to remove it',
  pfPng: 'Save the profile plot as a PNG image',
  tsYHi: 'Top of the plot y axis: drag left to zoom in',
  tsYLo: 'Bottom of the plot y axis: drag right to zoom in',
  tsYBand: 'Drag to shift the plot y range up or down, keeping its height',
  tsYAuto: 'Fit the y axis to the GrIMP values again',
  tsXBar: 'Limit the plot x axis to the time-bar range; untick to show every date plotted',
  tsLoad: 'Load points from a CSV or text file: lat/lon or x/y (km or m) columns, optional label; a saved CSV loads back',
  tsIts: 'Also plot ITS_LIVE image-pair velocities (its-live.jpl.nasa.gov datacubes) at the same points, in grey',
  tsItsDt: 'Only ITS_LIVE pairs whose images are at most this many days apart',
  panelToggle: 'Hide or show the control panel, giving the map the whole window',
};
for (const [id, text] of Object.entries(tips)) {
  const el = $(id);
  if (!el) continue;
  el.title = text;
  const label = el.closest('label');
  if (label) label.title = text;
}
$('animSec').querySelector('summary').title = 'Play the dates of the displayed item as an animation, or save them as a movie';
$('ttrack').title = 'Ticks are acquisition dates: click one to show it; the handles set the range';

// The map is exposed for scripted use (screenshots for the guide, debugging in the console).
window.grimpViewer = { map };

{
  // A shared link's background replaces this session's choice for that hemisphere.
  const bg = startParams.get('bg'), href = startParams.get('href') || presets[0][1];
  const p = bg && presets.find(q => q[1].split('/').pop() === bg);
  if (p) bgSave(p[2], { href: p[1], id: startParams.get('bgi') });
  else if (bg === 'none') bgSave(presets.find(q => q[1] === href)?.[2] || 'N', null);
}
setHemi('N');
showMaintenance();
setInterval(showMaintenance, 10 * 60 * 1000);
$('hemN').onclick = () => pickHemi('N');
$('hemS').onclick = () => pickHemi('S');
$('preset').onchange = e => { if (e.target.value !== '') loadCatalog(presets[+e.target.value][1]); };
$('load').onclick = () => $('href').value.trim() && loadCatalog($('href').value.trim());
$('href').onkeydown = e => { if (e.key === 'Enter') $('load').click(); };
$('asset').onchange = e => showAsset(e.target.value);
$('opacity').oninput = e => rasterLayer.setOpacity(+e.target.value);
$('baseOn').onchange = e => baseLayer.setVisible(e.target.checked);
$('coastOn').onchange = e => coastLayer.setVisible(e.target.checked);
$('bgColl').onchange = e => { bgSave(hemi, e.target.value ? { href: e.target.value } : null); loadBackground(e.target.value); };
$('bgItem').onchange = e => showBackground(bgItems[+e.target.value]);
$('footOn').onchange = e => footLayer.setVisible(e.target.checked);
$('smin').onchange = $('smax').onchange = () => setStretch(+$('smin').value, +$('smax').value);
$('cmap').replaceChildren(...Object.keys(cmaps).map(k => new Option(k, k)));
$('cmap').onchange = e => { if (e.target.value !== 'blue-white-red') { lastSeqCmap = e.target.value; cmapChosen = true; } setColormap(e.target.value); };
$('clip').oninput = applyClip;
function setPanel(show) {
  document.body.classList.toggle('nopanel', !show);
  $('panelToggle').innerHTML = show ? '&lsaquo; Hide controls' : '&#9776; Controls';
  $('panelToggle').setAttribute('aria-expanded', show);
  map.updateSize();
}
$('panelToggle').onclick = () => setPanel(document.body.classList.contains('nopanel'));

map.on('singleclick', e => {
  // singleclick arrives at least 250 ms late, so skip the click that ended a line (it happened by then)
  if (draw || e.originalEvent.timeStamp <= pfDrawnAt + 100) return;
  if (tsMode) { addTsPoint(e.coordinate); return; }
  // Touch screens have no hover, so a tap shows the readout.
  const touch = e.originalEvent.pointerType === 'touch';
  if (touch) updateReadout(e);
  // Test against the footprint geometry rather than rendered pixels, since footprints are outline-only.
  const hits = footLayer.getVisible() ? footSource.getFeaturesAtCoordinate(e.coordinate) : [];
  if (!hits.length) return;
  // Smallest footprint first; identical footprints step back in time from the newest.
  hits.sort((a, b) => (a.getGeometry().getArea() - b.getGeometry().getArea()) || (b.get('item').start - a.get('item').start));
  if (e.originalEvent.shiftKey || e.originalEvent.ctrlKey || e.originalEvent.metaKey) {
    // Shift/Ctrl/Cmd-click picks the displayed footprint if it is under the cursor, else the smallest
    // (newest) one, so a single TSX site box can be picked even where dates overlap.
    const shown = hits.find(f => f.get('item') === selected);
    togglePick((shown || hits[0]).get('item'));
    return;
  }
  const cur = hits.findIndex(f => f.get('item') === selected);
  // A tap inside the shown product only reads its value; a tap on another footprint shows that product.
  if (touch) { if (cur < 0) select(hits[0].get('item')); return; }
  select(hits[(cur + 1) % hits.length].get('item'));
});
// Hover readout: map x/y (km) and lat/lon at once; the pixel value after a short pause, read from
// the full-resolution COG (or, while an animation is shown, from the current frame).
let readoutTimer = null, readoutToken = 0;
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtVal = v => Math.abs(v) >= 1e4 || (v !== 0 && Math.abs(v) < 1e-3) ? v.toExponential(3) : String(+v.toPrecision(5));
function readoutCoords(coord) {
  const [lon, lat] = ol.proj.toLonLat(coord, viewCode);
  const km = viewCode === 'EPSG:3857' ? '' : `x ${(coord[0] / 1000).toFixed(2)} km, y ${(coord[1] / 1000).toFixed(2)} km   `;
  return `${km}${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`;
}
async function readoutValue(coord) {
  if (!frames.length && saShown && saCache) {
    const c = saCache, fx = Math.floor((coord[0] - c.ext[0]) / c.res), fy = Math.floor((c.ext[3] - coord[1]) / c.res);
    if (fx < 0 || fy < 0 || fx >= c.W || fy >= c.H) return saShown.stack ? 'outside stack area' : 'outside anomaly area';
    if (saShown.stack) {
      const j = fy * c.W + fx, m = c.mean[j];
      return Number.isNaN(m) ? 'no data' : `<b>${esc(c.key)} mean</b> ${fmtVal(m * c.scale + c.offset)} ${esc(c.unit)} (${c.cnt[j]} of ${c.values.size} dates)`;
    }
    const d = saShown.d[fy * c.W + fx], ref = [...c.values.keys()].find(it => it.id === $('saRef').value);
    return Number.isNaN(d) ? 'no data' : `<b>${esc(c.key)} minus ${ref ? fmtDate(ref.start) : 'mean'}</b> ${fmtVal(d * c.scale)} ${esc(c.unit)} (${fmtDate(selected.start)})`;
  }
  if (frames.length && animGrid && frames[animIdx]?.values) {
    const g = animGrid, fx = Math.floor((coord[0] - g.ext[0]) / g.res), fy = Math.floor((g.ext[3] - coord[1]) / g.res);
    if (fx < 0 || fy < 0 || fx >= g.W || fy >= g.H) return 'outside frame';
    const v = frames[animIdx].values[fy * g.W + fx];
    if (Number.isNaN(v)) return 'no data';
    const shown = g.anomaly ? v * g.scale : v * g.scale + g.offset;
    return `<b>${esc(g.key)}${g.anomaly ? ' minus mean' : ''}</b> ${fmtVal(shown)} ${esc(g.unit)} (${fmtDate(frames[animIdx].it.start)})`;
  }
  if (!selected || !$('asset').value) return '';
  const key = $('asset').value, a = selected.assets[key], b = a['raster:bands']?.[0] || {};
  const { levels: lv, origin: org } = await assetLevels(a.href);
  const img = lv[0].img, r = lv[0].res;
  const col = Math.floor((coord[0] - org[0]) / r), row = Math.floor((org[1] - coord[1]) / r);
  if (col < 0 || row < 0 || col >= img.getWidth() || row >= img.getHeight()) return 'outside image';
  const vals = await img.readRasters({ window: [col, row, col + 1, row + 1], interleave: true });
  if (vals.length >= 3) return `<b>${esc(key)}</b> R ${vals[0]} G ${vals[1]} B ${vals[2]}`;
  const v = vals[0];
  if (v === b.nodata || !Number.isFinite(v)) return `<b>${esc(key)}</b> no data`;
  const sig = await readoutError(selected, key, coord).catch(() => NaN);
  return `<b>${esc(key)}</b> ${fmtVal(v * (b.scale ?? 1) + (b.offset ?? 0))}${Number.isFinite(sig) ? ` &plusmn; ${fmtVal(sig)}` : ''} ${esc(b.unit || '')}`;
}
// One sigma of a velocity value at a point from the product's ex/ey (NaN without them), as for the
// time-series error bars but read uncached, since every hover position is new.
async function readoutError(it, key, coord) {
  const need = { vx: ['ex'], vy: ['ey'], vv: ['vx', 'vy', 'ex', 'ey'] }[key];
  if (!need || !need.every(k => it.assets[k])) return NaN;
  const q = await Promise.all(need.map(k => pixelValue(it.assets[k], coord)));
  if (key !== 'vv') return q[0];
  const [vx, vy, ex, ey] = q, v = Math.hypot(vx, vy);
  return v > 0 ? Math.hypot(vx * ex, vy * ey) / v : NaN;
}
function updateReadout(e) {
  // A tap's readout stays until the next tap, so it gets a close button (the "x 12.34 km" text is not one).
  $('roClose').hidden = e.originalEvent?.pointerType !== 'touch';
  const ro = $('roText'), lines = [frontNote(e.pixel), glNote(e.pixel), basinNote(e.coordinate)].filter(Boolean);
  const coords = [readoutCoords(e.coordinate), ...lines].join('<br>');
  $('readout').hidden = false;
  ro.innerHTML = `${coords}<br><span class="note" style="color:inherit">reading value...</span>`;
  clearTimeout(readoutTimer);
  const token = ++readoutToken;
  readoutTimer = setTimeout(async () => {
    let val;
    try { val = await readoutValue(e.coordinate); } catch (err) { val = `value unavailable (${esc(err.message)})`; }
    if (token === readoutToken) ro.innerHTML = val ? `${coords}<br>${val}` : coords;
  }, 150);
}
map.on('pointermove', e => { if (!e.dragging) updateReadout(e); });
const hideReadout = () => { clearTimeout(readoutTimer); ++readoutToken; $('readout').hidden = true; };
map.getViewport().addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') hideReadout(); });
$('roClose').onclick = hideReadout;
map.on('pointerdrag', e => { if (e.originalEvent.pointerType === 'touch') hideReadout(); });  // a pan leaves the tapped point

map.on('pointermove', e => {
  const over = !draw && footLayer.getVisible() && footSource.getFeaturesAtCoordinate(e.coordinate).length > 0;
  map.getTargetElement().style.cursor = tsMode ? 'crosshair' : over ? 'pointer' : '';
});
// Share this view: the link reopens the same collection, item, asset, map view, time range, colors,
// layers, background and time-series points. It goes in the address bar and, where allowed, the clipboard.
// Share this animation adds the area box and animation settings; the frames are loaded on request.
async function shareView(anim, note, qr = false) {
  const u = new URL(location.origin + location.pathname), q = u.searchParams, v = map.getView();
  q.set('href', $('href').value);
  if (selected) { q.set('item', selected.id); q.set('asset', $('asset').value); }
  const [x, y] = v.getCenter();
  q.set('x', Math.round(x)); q.set('y', Math.round(y)); q.set('z', +v.getZoom().toFixed(2));
  if (dates.length && (i0 > 0 || i1 < dates.length - 1)) { q.set('t0', fmtDate(new Date(dates[i0]))); q.set('t1', fmtDate(new Date(dates[i1]))); }
  if (selected && !rgbMode) { q.set('lo', $('smin').value); q.set('hi', $('smax').value); }
  if (cmapChosen) q.set('cmap', lastSeqCmap);
  if (rasterLayer.getOpacity() < 1) q.set('op', rasterLayer.getOpacity());
  const off = ['base', 'coast', 'foot'].filter(k => !$(`${k}On`).checked);
  if (off.length) q.set('off', off.join(','));
  const bgIt = $('bgColl').value && bgItems[+$('bgItem').value];
  q.set('bg', bgIt ? $('bgColl').value.split('/').pop() : 'none');
  if (bgIt) q.set('bgi', bgIt.id);
  if (tsPoints.length) q.set('pts', tsPoints.map(p => p.coord.map(Math.round).join(',')).join(';'));
  if (anim) {
    q.set('anim', 1);
    if (!siteMode && areaBox) q.set('area', areaBox.map(Math.round).join(','));
    if ($('animStep').value) q.set('astep', $('animStep').value);
    const lv = levels?.[+$('animRes').value];
    if (lv && $('animRes').value !== '') q.set('ares', Math.round(lv.res));
    if ($('animAnom').checked) { q.set('aanom', 1); if (animRangeTyped) q.set('arange', $('animRange').value); }
    if ($('animBar').checked) q.set('abar', 1);
    q.set('afps', $('animFps').value);
    if (!$('animLoop').checked) q.set('aloop', 0);
  }
  history.replaceState(null, '', u);
  if (qr) { showQr(u.href, anim); return; }
  let copied = false;
  try { await navigator.clipboard.writeText(u.href); copied = true; } catch (e) { /* not allowed here */ }
  $(note).textContent = copied ? 'Link copied to the clipboard (also in the address bar).' : 'Copy the link from the address bar.';
}
$('share').onclick = () => shareView(false, 'shareNote');
$('animShare').onclick = () => shareView(true, 'animNote');
$('shareQr').onclick = () => shareView(false, 'shareNote', true);
$('animShareQr').onclick = () => shareView(true, 'animNote', true);
// The same link as a QR code (white margin of 4 modules, as the standard asks), to scan with a phone or
// put on a slide or poster. Very long links (many points) do not fit in a QR code.
function showQr(url, anim) {
  const cv = $('qrCanvas'), ctx = cv.getContext('2d');
  let q = null;
  try { q = qrcode(0, 'M'); q.addData(url); q.make(); } catch (e) { q = null; }
  $('qrSave').disabled = !q;
  if (q) {
    const n = q.getModuleCount(), cell = Math.max(2, Math.floor(640 / (n + 8)));
    cv.width = cv.height = (n + 8) * cell;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect((c + 4) * cell, (r + 4) * cell, cell, cell);
    $('qrNote').textContent = `Scan to open this ${anim ? 'animation' : 'view'} (the link is also in the address bar).`;
  } else {
    cv.width = cv.height = 10; ctx.clearRect(0, 0, 10, 10);
    $('qrNote').textContent = `The link is too long for a QR code (${url.length} characters, usually from many points); share the link instead.`;
  }
  $('qrDlg').showModal();
}
$('qrClose').onclick = () => $('qrDlg').close();
$('qrSave').onclick = () => $('qrCanvas').toBlob(b => saveBlob(b, 'grimp-viewer-qr.png'));
{
  const c = startParams.get('cmap'), op = startParams.get('op');
  if (c in cmaps && c !== 'blue-white-red') { $('cmap').value = c; lastSeqCmap = c; cmapChosen = true; }
  if (op) { $('opacity').value = op; rasterLayer.setOpacity(+op); }
  if (startParams.get('anim') === '1') {
    $('animStep').value = startParams.get('astep') || '';
    $('animAnom').checked = startParams.get('aanom') === '1';
    $('animRange').value = startParams.get('arange') || '';
    animRangeTyped = +$('animRange').value > 0;
    $('animBar').checked = startParams.get('abar') === '1';
    if (startParams.get('afps')) $('animFps').value = startParams.get('afps');
    $('animLoop').checked = startParams.get('aloop') !== '0';
  }
  for (const k of (startParams.get('off') || '').split(',')) {
    if (['base', 'coast', 'foot'].includes(k)) { $(`${k}On`).checked = false; $(`${k}On`).dispatchEvent(new Event('change')); }
  }
}
window.addEventListener('popstate', () => loadCatalog(new URL(location.href).searchParams.get('href') || presets[0][1], false));

loadCatalog(new URL(location.href).searchParams.get('href') || presets[0][1], false);
