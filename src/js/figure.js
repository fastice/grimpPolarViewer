// Save figure: the map inside a box drawn on it, rendered again at a higher resolution than the screen.
// OpenLayers draws every layer afresh at a larger pixel ratio, so the images are read from finer overviews (down
// to the full-resolution data) and lines and labels are drawn sharp, not enlarged. A color bar, scale bar and the
// dates go on top, and the PNG, JPEG or TIFF records its dpi and the link that rebuilds it. A sidecar .json beside it holds
// that link (the viewer with the same view, layers, colors and box: click Save figure again) and the box, size
// and product.
const figSource = new ol.source.Vector();
const figLayer = new ol.layer.Vector({ source: figSource, zIndex: 5, style: outline('#e0559b') });
map.addLayer(figLayer);
const figMaxSide = 8192, figMaxPx = 16.7e6;  // canvas limits of common browsers (Safari: 16.7 million pixels)
let figBox = null, figBusy = false, figFromLink = false, figFiles = null;  // figFiles: the last figure's { img, json, name, ext }

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
  } else if (!rgbMode && !classMode && rasterLayer.getVisible()) {
    drawColorBar(ctx, W, fs, { stops: cmaps[$('cmap').value] || cmaps.gray, dlo: +$('smin').value, dhi: +$('smax').value, centered: stretchMode === 'symmetric',
      title: `${$('asset').value}${band.unit ? ` (${band.unit})` : ''}${logScale ? ', log scale' : ''}`, log: logScale });
  }
  ctx.font = `600 ${fs}px "JetBrains Mono", monospace`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const classes = classMode && rasterLayer.getVisible() && selected.assets[$('asset').value]?.['classification:classes'];
  if (classes) {  // a class map: its colors and names, top right
    const w = Math.max(...classes.map(c => ctx.measureText(c.name).width)) + fs * 2.2, h = classes.length * fs * 1.5 + fs * 0.5;
    ctx.fillStyle = 'rgba(12,16,20,0.75)'; ctx.fillRect(W - pad - w, pad, w, h);
    classes.forEach((c, i) => {
      const y = pad + fs * (1 + 1.5 * i);
      ctx.fillStyle = `#${c.color_hint}`; ctx.fillRect(W - pad - w + fs * 0.5, y - fs * 0.45, fs * 0.9, fs * 0.9);
      ctx.fillStyle = '#ffffff'; ctx.fillText(c.name, W - pad - w + fs * 1.7, y);
    });
  }
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
// ---- JPEG: the dpi in its JFIF header and the text as a comment (COM) after it
function jpgWithInfo(bytes, dpi, text) {
  const jfif = bytes[2] === 0xff && bytes[3] === 0xe0 && String.fromCharCode(...bytes.subarray(6, 10)) === 'JFIF';
  if (!jfif) return new Blob([bytes], { type: 'image/jpeg' });
  const d = Math.min(65535, Math.round(dpi)), dv = new DataView(bytes.buffer, bytes.byteOffset), end = 4 + dv.getUint16(4);
  bytes[13] = 1; dv.setUint16(14, d); dv.setUint16(16, d);  // dots per inch
  const note = new TextEncoder().encode(Object.entries(text).map(([k, v]) => `${k}: ${v}`).join('\n').replace(/[^\x0a\x20-\x7e]/g, '?'));
  const com = new Uint8Array(4 + note.length);
  com.set([0xff, 0xfe, (note.length + 2) >> 8, (note.length + 2) & 255]); com.set(note, 4);
  return new Blob([bytes.subarray(0, end), com, bytes.subarray(end)], { type: 'image/jpeg' });
}
// ---- TIFF (browsers cannot make one): 8-bit RGB, Deflate, one strip, with its dpi, title, link and software, and
// GeoTIFF tags (the view's EPSG code, the upper-left corner and the pixel size) when geo is given
async function tiffWithInfo(canvas, dpi, text, geo) {
  const { width: W, height: H } = canvas, rgba = canvas.getContext('2d').getImageData(0, 0, W, H).data;
  const rgb = new Uint8Array(W * H * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) { rgb[j] = rgba[i]; rgb[j + 1] = rgba[i + 1]; rgb[j + 2] = rgba[i + 2]; }
  const data = new Uint8Array(await new Response(new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const ascii = s => new TextEncoder().encode(s.replace(/[^\x20-\x7e]/g, '?') + '\0');
  const res = [Math.round(dpi * 100), 100];
  const epsg = +(/^EPSG:(\d+)$/.exec(geo?.crs || '') || [])[1];
  // tag, type (3 SHORT, 4 LONG, 2 ASCII, 5 RATIONAL, 12 DOUBLE), values; in tag order
  const tags = [[256, 4, [W]], [257, 4, [H]], [258, 3, [8, 8, 8]], [259, 3, [8]], [262, 3, [2]],
    [269, 2, ascii(text.Title)], ...(text.Source ? [[270, 2, ascii(text.Source)]] : []), [273, 4, [0]], [277, 3, [3]], [278, 4, [H]],
    [279, 4, [data.length]], [282, 5, res], [283, 5, res], [284, 3, [1]], [296, 3, [2]], [305, 2, ascii(text.Software)],
    ...(epsg ? [[33550, 12, [geo.s, geo.s, 0]], [33922, 12, [0, 0, 0, geo.x0, geo.y0, 0]],  // pixel scale, tie point
      [34735, 3, [1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, epsg]]] : [])];  // projected, pixel is area, EPSG
  const size = { 2: 1, 3: 2, 4: 4, 5: 8, 12: 8 }, count = (t, v) => t === 5 ? v.length / 2 : v.length;
  const ifdLen = 2 + tags.length * 12 + 4;
  let extra = 8 + ifdLen;  // values over 4 bytes go after the IFD, then the image
  const at = tags.map(([, t, v]) => { const n = count(t, v) * size[t]; if (n <= 4) return null; const o = extra; extra += n + (n & 1); return o; });
  const head = new Uint8Array(extra), dv = new DataView(head.buffer);
  head.set([0x49, 0x49, 42, 0]); dv.setUint32(4, 8, true); dv.setUint16(8, tags.length, true);
  const put = (o, t, v) => v.forEach((x, k) => t === 2 ? (head[o + k] = x) : t === 3 ? dv.setUint16(o + 2 * k, x, true)
    : t === 12 ? dv.setFloat64(o + 8 * k, x, true) : dv.setUint32(o + 4 * k, x, true));
  tags.forEach(([tag, t, v], i) => {
    const e = 10 + 12 * i;
    if (tag === 273) v = [extra];
    dv.setUint16(e, tag, true); dv.setUint16(e + 2, t, true); dv.setUint32(e + 4, count(t, v), true);
    if (at[i] === null) put(e + 8, t, v); else { dv.setUint32(e + 8, at[i], true); put(at[i], t, v); }
  });
  return new Blob([head, data], { type: 'image/tiff' });
}
const figFormats = { png: 'PNG', jpg: 'JPEG', tif: 'TIFF' };
async function figImage(canvas, ext, dpi, text, geo) {
  if (ext === 'tif') return tiffWithInfo(canvas, dpi, text, geo);
  const blob = await new Promise(r => canvas.toBlob(r, ext === 'jpg' ? 'image/jpeg' : 'image/png', 0.92));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return ext === 'jpg' ? jpgWithInfo(bytes, dpi, text) : pngWithInfo(bytes, dpi, text);
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
  const key = $('asset').value, name = `${selected.id}_${key}_figure`, ext = $('figFormat').value, build = document.querySelector('#title small')?.textContent.split('·').pop().trim() || '';
  let link = null;
  if (!localCatalog) {
    const u = shareUrl(false), q = u.searchParams;
    q.set('fig', figBox.map(Math.round).join(',')); q.set('fsize', $('figSize').value); q.set('fdpi', dpi);
    if ($('figSize').value === 'in') q.set('fw', $('figWidth').value);
    if (!$('figLabels').checked) q.set('flab', 0);
    if (ext !== 'png') q.set('ffmt', ext);
    link = u.href;
  }
  const img = await figImage(canvas, ext, dpi,
    { Title: `${selected.id} ${key}`, Software: `GrIMP Polar Viewer ${build}`, ...(link ? { Source: link } : {}) },
    // square pixels of bw / W from the box's left edge; the map was drawn centered on the box, cssH of bw / cssW tall
    { crs: viewCode, x0, y0: (y0 + y1) / 2 + cssH * bw / cssW / 2, s: bw / W });
  const sr = srShown && srLayer.getVisible() ? { kind: srKinds[srShown.kind], differencesAcross_m: Math.round(srShown.L), range: [srShown.lo, srShown.hi] } : null;
  const info = {
    figure: `${name}.${ext}`,
    link: link || 'none: the catalog was opened from this computer',
    box: figBox.map(Math.round), crs: viewCode,
    pixels: [W, H], pixelSize_m: +(bw / W).toPrecision(4), dpi, inches: [+(W / dpi).toFixed(3), +(H / dpi).toFixed(3)],
    product: { id: selected.id, asset: key, start: fmtDate(selected.start), end: fmtDate(selected.end), href: selected.assets[key]?.href },
    ...(compareItem && compareLayer.getVisible() ? { swipeLeft: { id: compareItem.id, start: fmtDate(compareItem.start), end: fmtDate(compareItem.end) } } : {}),
    colors: rgbMode ? 'RGB as stored' : classMode ? 'class colors' : { colorMap: $('cmap').value, range: [+$('smin').value, +$('smax').value], logScale },
    ...(sr ? { strainRate: sr } : {}),
    labels: $('figLabels').checked, allTilesLoaded: complete, viewer: build, created: new Date().toISOString(),
  };
  // Only the image downloads by itself: browsers that allow one download without a click (Safari, phones) keep
  // only the last of two. The .json (and the image again, if the browser blocked it) are a click each.
  figFiles = { img, json: new Blob([JSON.stringify(info, null, 1)], { type: 'application/json' }), name, ext };
  saveBlob(img, `${name}.${ext}`);
  figInfo();
  $('figFiles').hidden = false; $('figAgain').textContent = `${figFormats[ext]} again`;
  $('figNote').textContent = `Saved ${name}.${ext} (${W} x ${H} pixels). Save the .json sidecar too: it has the link that rebuilds the figure (also stored in the ${figFormats[ext]}).`
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
$('figAgain').onclick = () => { if (figFiles) saveBlob(figFiles.img, `${figFiles.name}.${figFiles.ext}`); };
for (const id of ['figSize', 'figWidth', 'figDpi']) $(id).addEventListener('input', figInfo);
$('figSec').addEventListener('toggle', () => { if (!$('figSec').open && drawKind === 'fig') stopDraw(); });
map.on('moveend', () => { if (figBox && !figBusy) figInfo(); });
{
  const s = startParams.get('fsize');
  if ([...$('figSize').options].some(o => o.value === s)) $('figSize').value = s;
  if (+startParams.get('fdpi') > 0) $('figDpi').value = startParams.get('fdpi');
  if (+startParams.get('fw') > 0) $('figWidth').value = startParams.get('fw');
  if (startParams.get('flab') === '0') $('figLabels').checked = false;
  if (startParams.get('ffmt') in figFormats) $('figFormat').value = startParams.get('ffmt');
}
