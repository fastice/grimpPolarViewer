// Save figure: the map inside a box drawn on it, rendered again at a higher resolution than the screen.
// OpenLayers draws every layer afresh at a larger pixel ratio, so the images are read from finer overviews (down
// to the full-resolution data) and lines and labels are drawn sharp, not enlarged. A color bar, scale bar and the
// dates go on top, and the PNG records its dpi and the link that rebuilds it. A sidecar .json beside it holds
// that link (the viewer with the same view, layers, colors and box: click Save figure again) and the box, size
// and product.
const figSource = new ol.source.Vector();
const figLayer = new ol.layer.Vector({ source: figSource, zIndex: 5, style: outline('#e0559b') });
map.addLayer(figLayer);
const figMaxSide = 8192, figMaxPx = 16.7e6;  // canvas limits of common browsers (Safari: 16.7 million pixels)
let figBox = null, figBusy = false, figFromLink = false, figFiles = null;  // figFiles: the last figure's { png, json, name }

function setFigBox(box, fromLink = false) {
  figSource.clear(); figBox = box; figFromLink = fromLink;
  figFiles = null; $('figFiles').hidden = true;
  if (box) figSource.addFeature(new ol.Feature(ol.geom.Polygon.fromExtent(box)));
  figInfo();
}
// the figure's size [W, H] in pixels: a multiple of the box's size on screen, the data's pixels or a width in inches
function figPixels() {
  const [x0, y0, x1, y1] = figBox, bw = x1 - x0, bh = y1 - y0, kind = $('figSize').value;
  const W = Math.max(1, Math.round(kind === 'in' ? +$('figWidth').value * +$('figDpi').value
    : kind === 'data' ? bw / (levels?.[0]?.res || map.getView().getResolution()) : +kind * bw / map.getView().getResolution()));
  return [W, Math.max(1, Math.round(W * bh / bw))];
}
const figTooBig = (W, H) => W > figMaxSide || H > figMaxSide || W * H > figMaxPx;
function figInfo() {
  $('figWidthRow').hidden = $('figSize').value !== 'in';
  $('figClearBox').hidden = !figBox;
  $('figBoxInfo').textContent = figBox ? `${((figBox[2] - figBox[0]) / 1000).toFixed(1)} x ${((figBox[3] - figBox[1]) / 1000).toFixed(1)} km` : '';
  if (!figBox) { $('figSave').disabled = true; return; }
  const [W, H] = figPixels(), dpi = +$('figDpi').value || 300, px = (figBox[2] - figBox[0]) / W, big = figTooBig(W, H);
  $('figSave').disabled = big || figBusy;
  if (figBusy) return;
  const fine = levels?.[0] && px < levels[0].res * 0.95 ? `, finer than the data's ${Math.round(levels[0].res)} m (its pixels are enlarged)` : '';
  $('figNote').textContent = (figFromLink ? 'Figure link: click Save figure to make it again. ' : '')
    + (big ? `${W} x ${H} pixels is too large: at most ${figMaxSide} a side and 16.7 million in all. Choose a smaller size or box.`
    : `${W} x ${H} pixels (${(W / dpi).toFixed(2)} x ${(H / dpi).toFixed(2)} in at ${dpi} dpi), ${px < 10 ? px.toFixed(1) : Math.round(px)} m each${fine}.`
      + ($('particlesOn').checked ? ' Flow particles are not drawn in figures.' : ''));
}

// ---- labels drawn on the figure
function figLabels(ctx, W, H, bw) {
  const fs = Math.max(12, Math.round(Math.min(W, H) / 40)), pad = Math.round(fs * 0.5);
  if (srShown && srLayer.getVisible()) {
    drawColorBar(ctx, W, fs, { stops: srShown.kind === 'eff' ? cmaps.magma : cmaps['blue-white-red'], dlo: srShown.lo, dhi: srShown.hi,
      title: `${srKinds[srShown.kind]} (1/yr)`, centered: srShown.kind !== 'eff' });
  } else if (!rgbMode && rasterLayer.getVisible()) {
    drawColorBar(ctx, W, fs, { stops: cmaps[$('cmap').value] || cmaps.gray, dlo: +$('smin').value, dhi: +$('smax').value, centered: stretchMode === 'symmetric',
      title: `${$('asset').value}${band.unit ? ` (${band.unit})` : ''}${logScale ? ', log scale' : ''}`, log: logScale });
  }
  ctx.font = `600 ${fs}px "JetBrains Mono", monospace`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  // the dates, bottom left (both sides of a swipe)
  const label = compareItem && compareLayer.getVisible() ? `left ${itemDates(compareItem)}, right ${itemDates(selected)}` : itemDates(selected);
  const tw = Math.min(ctx.measureText(label).width, W * 0.6);
  ctx.fillStyle = 'rgba(12,16,20,0.75)'; ctx.fillRect(pad, H - fs * 2.1, tw + fs, fs * 1.6);
  ctx.fillStyle = '#ffffff'; ctx.fillText(label, pad + fs / 2, H - fs * 1.3, tw);
  // scale bar, bottom right: a round length near a fifth of the width
  const m = bw / W, want = bw / 5, e = 10 ** Math.floor(Math.log10(want)), L = [5, 2, 1].map(k => k * e).find(v => v <= want);
  const len = L / m, text = L >= 1000 ? `${L / 1000} km` : `${L} m`, x1 = W - pad - fs / 2, x0 = x1 - len, yb = H - fs * 1.0;
  ctx.fillStyle = 'rgba(12,16,20,0.75)'; ctx.fillRect(x0 - fs / 2, H - fs * 2.9, len + fs, fs * 2.4);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x0, yb - fs * 0.15, len, fs * 0.3);
  ctx.fillRect(x0, yb - fs * 0.4, fs * 0.12, fs * 0.8); ctx.fillRect(x1 - fs * 0.12, yb - fs * 0.4, fs * 0.12, fs * 0.8);
  ctx.textAlign = 'center'; ctx.fillText(text, (x0 + x1) / 2, H - fs * 2.1);
  ctx.textAlign = 'left';
}

// ---- PNG with its dpi (pHYs) and text entries (tEXt), placed after the header; the browser's own pHYs is dropped
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function pngChunk(type, data) {
  const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length); out.set(new TextEncoder().encode(type), 4); out.set(data, 8);
  let c = 0xffffffff;
  for (const b of out.subarray(4, 8 + data.length)) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  dv.setUint32(8 + data.length, (c ^ 0xffffffff) >>> 0);
  return out;
}
function pngWithInfo(bytes, dpi, text) {
  const ppm = Math.round(dpi / 0.0254), phys = new Uint8Array(9), dv = new DataView(bytes.buffer, bytes.byteOffset);
  new DataView(phys.buffer).setUint32(0, ppm); new DataView(phys.buffer).setUint32(4, ppm); phys[8] = 1;  // pixels per meter
  const ascii = s => s.replace(/[^\x20-\x7e]/g, '?');  // keyword, NUL, text
  const parts = [bytes.subarray(0, 33), pngChunk('pHYs', phys), ...Object.entries(text).map(([k, v]) => pngChunk('tEXt', new TextEncoder().encode(`${ascii(k)}\0${ascii(v)}`)))];
  for (let at = 33; at < bytes.length;) {  // the rest, chunk by chunk
    const n = dv.getUint32(at), type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (type !== 'pHYs') parts.push(bytes.subarray(at, at + 12 + n));
    at += 12 + n;
  }
  return new Blob(parts, { type: 'image/png' });
}

// ---- render and save
const waitRender = ms => new Promise(resolve => {
  const t = setTimeout(() => resolve(false), ms);
  map.once('rendercomplete', () => { clearTimeout(t); resolve(true); });
  map.render();
});
async function saveFigure() {
  if (!figBox || !selected || figBusy) return;
  const [W, H] = figPixels(), dpi = +$('figDpi').value || 300;
  if (figTooBig(W, H)) return figInfo();
  const [x0, y0, x1, y1] = figBox, bw = x1 - x0, bh = y1 - y0, view = map.getView();
  const was = { center: view.getCenter(), res: view.getResolution(), ratio: map.getPixelRatio(), swipeAt };
  // the map is resized to the box at its size on screen (at least 400 CSS pixels across), at the pixel ratio
  // that makes it W pixels; the swipe line stays at the same place on the ground
  const cssW = Math.max(400, Math.round(bw / was.res)), cssH = Math.max(1, Math.round(cssW * bh / bw)), ratio = W / cssW;
  const swipeX = view.calculateExtent(map.getSize())[0] + was.swipeAt * map.getSize()[0] * was.res;
  const fill = getComputedStyle($('map')).backgroundColor;
  const cover = document.createElement('div');
  cover.className = 'figCover'; cover.textContent = 'Rendering the figure...';
  $('mapwrap').append(cover);
  figBusy = true; $('figSave').disabled = true; $('figNote').textContent = `Rendering ${W} x ${H} pixels...`;
  let canvas = null, complete = true;
  try {
    figLayer.setVisible(false);
    swipeAt = Math.min(1, Math.max(0, (swipeX - x0) / bw));
    map.setSize([cssW, cssH]); map.setPixelRatio(ratio);
    view.setCenter([(x0 + x1) / 2, (y0 + y1) / 2]); view.setResolution(bw / cssW);
    complete = await waitRender(120000);
    canvas = compositeMap(W, H, ratio, fill);
  } catch (e) {
    $('figNote').textContent = `Could not render the figure: ${e.message}`;
  } finally {
    swipeAt = was.swipeAt; figLayer.setVisible(true);
    map.setPixelRatio(was.ratio); map.updateSize(); view.setCenter(was.center); view.setResolution(was.res);
    cover.remove(); figBusy = false;
  }
  if (!canvas) { figInfo(); return; }
  if ($('figLabels').checked) figLabels(canvas.getContext('2d'), W, H, bw);
  const key = $('asset').value, name = `${selected.id}_${key}_figure`, build = document.querySelector('#title small')?.textContent.split('·').pop().trim() || '';
  let link = null;
  if (!localCatalog) {
    const u = shareUrl(false), q = u.searchParams;
    q.set('fig', figBox.map(Math.round).join(',')); q.set('fsize', $('figSize').value); q.set('fdpi', dpi);
    if ($('figSize').value === 'in') q.set('fw', $('figWidth').value);
    if (!$('figLabels').checked) q.set('flab', 0);
    link = u.href;
  }
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  const png = pngWithInfo(new Uint8Array(await blob.arrayBuffer()), dpi,
    { Title: `${selected.id} ${key}`, Software: `GrIMP Polar Viewer ${build}`, ...(link ? { Source: link } : {}) });
  const sr = srShown && srLayer.getVisible() ? { kind: srKinds[srShown.kind], differencesAcross_m: Math.round(srShown.L), range: [srShown.lo, srShown.hi] } : null;
  const info = {
    figure: `${name}.png`,
    link: link || 'none: the catalog was opened from this computer',
    box: figBox.map(Math.round), crs: viewCode,
    pixels: [W, H], pixelSize_m: +(bw / W).toPrecision(4), dpi, inches: [+(W / dpi).toFixed(3), +(H / dpi).toFixed(3)],
    product: { id: selected.id, asset: key, start: fmtDate(selected.start), end: fmtDate(selected.end), href: selected.assets[key]?.href },
    ...(compareItem && compareLayer.getVisible() ? { swipeLeft: { id: compareItem.id, start: fmtDate(compareItem.start), end: fmtDate(compareItem.end) } } : {}),
    colors: rgbMode ? 'RGB as stored' : { colorMap: $('cmap').value, range: [+$('smin').value, +$('smax').value], logScale },
    ...(sr ? { strainRate: sr } : {}),
    labels: $('figLabels').checked, allTilesLoaded: complete, viewer: build, created: new Date().toISOString(),
  };
  // Only the PNG downloads by itself: browsers that allow one download without a click (Safari, phones) keep
  // only the last of two. The .json (and the PNG again, if the browser blocked it) are a click each.
  figFiles = { png, json: new Blob([JSON.stringify(info, null, 1)], { type: 'application/json' }), name };
  saveBlob(png, `${name}.png`);
  figInfo();
  $('figFiles').hidden = false;
  $('figNote').textContent = `Saved ${name}.png (${W} x ${H} pixels). Save the .json sidecar too: it has the link that rebuilds the figure (also stored in the PNG).`
    + (complete ? '' : ' Some map tiles had not loaded after 2 minutes, so parts may be blank; save again.');
}

$('figDraw').onclick = () => {
  if (draw) { const was = drawKind; stopDraw(); if (was === 'fig') return; refreshAnimInfo(); }
  setFigBox(null);
  draw = boxDraw(figSource, '#e0559b'); drawKind = 'fig';
  draw.on('drawend', e => { const b = e.feature.getGeometry().getExtent(); setTimeout(() => { stopDraw(); setFigBox(b); }); });
  map.addInteraction(draw);
  $('figDraw').textContent = 'Cancel';
  $('figNote').textContent = 'Click one corner, then the opposite corner.';
};
$('figClearBox').onclick = () => { if (drawKind === 'fig') stopDraw(); setFigBox(null); $('figNote').textContent = ''; };
$('figSave').onclick = saveFigure;
$('figJson').onclick = () => { if (figFiles) saveBlob(figFiles.json, `${figFiles.name}.json`); };
$('figPng').onclick = () => { if (figFiles) saveBlob(figFiles.png, `${figFiles.name}.png`); };
for (const id of ['figSize', 'figWidth', 'figDpi']) $(id).addEventListener('input', figInfo);
$('figSec').addEventListener('toggle', () => { if (!$('figSec').open && drawKind === 'fig') stopDraw(); });
map.on('moveend', () => { if (figBox && !figBusy) figInfo(); });
{
  const s = startParams.get('fsize');
  if ([...$('figSize').options].some(o => o.value === s)) $('figSize').value = s;
  if (+startParams.get('fdpi') > 0) $('figDpi').value = startParams.get('fdpi');
  if (+startParams.get('fw') > 0) $('figWidth').value = startParams.get('fw');
  if (startParams.get('flab') === '0') $('figLabels').checked = false;
}
