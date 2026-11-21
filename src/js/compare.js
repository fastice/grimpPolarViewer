// Swipe compare: a second copy of the main layer showing another date of the time series (the same asset,
// stretch and color map), drawn only left of a vertical line that can be dragged across the map, so the
// shown date is on the right. Set in the Anomaly and stack section; hidden while an anomaly, stack or
// animation is drawn, since those replace the main layer.
const compareLayer = new ol.layer.WebGLTile({ zIndex: 2, visible: false, style: rasterStyle(cmaps.gray, 0, 1) });
map.addLayer(compareLayer);
let swipeAt = 0.5, compareItem = null, compareKey = '';
compareLayer.on('prerender', e => {
  const gl = e.context, size = map.getSize();
  const bl = ol.render.getRenderPixel(e, [0, size[1]]), tr = ol.render.getRenderPixel(e, [size[0] * swipeAt, 0]);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(bl[0], bl[1], Math.max(0, Math.round(tr[0] - bl[0])), Math.round(tr[1] - bl[1]));
});
compareLayer.on('postrender', e => e.context.disable(e.context.SCISSOR_TEST));
const itemDates = it => `${fmtDate(it.start)} to ${fmtDate(it.end)}`;

// The compare layer follows the main layer's look: the RGB style for browse images, else the color map and stretch.
function syncCompareStyle() {
  if (!compareItem) return;
  const a = compareItem.assets[$('asset').value];
  compareLayer.setStyle(rgbMode ? rgbStyle(a) : rasterStyle(cmaps[$('cmap').value] || cmaps.gray, rawLo, rawHi));
}

function refreshCompare() {
  const series = timeSeries(), sel = $('swRef'), prev = sel.value;
  sel.replaceChildren(...series.map(it => new Option(itemDates(it), it.id)));
  sel.value = series.some(it => it.id === prev) ? prev : (series[0]?.id ?? '');
  const key = $('asset').value;
  $('swRow').hidden = !$('swOn').checked;
  compareItem = $('swOn').checked && selected && series.length >= 2 ? series.find(it => it.id === sel.value) : null;
  const a = compareItem?.assets[key];
  if (!a) { compareItem = null; compareKey = ''; compareLayer.setSource(null); }
  else if (`${compareItem.id}|${key}` !== compareKey) {
    compareKey = `${compareItem.id}|${key}`;
    syncCompareStyle();
    compareLayer.setSource(new ol.source.GeoTIFF({ sources: [{ url: a.href, nodata: a['raster:bands']?.[0]?.nodata ?? undefined }],
      normalize: rgbMode, interpolate: true, projection: compareItem.epsg ? `EPSG:${compareItem.epsg}` : undefined }));
  }
  swipeShow();
}

function swipeShow() {
  const on = !!compareItem && rasterLayer.getVisible();
  compareLayer.setVisible(on);
  $('swipe').hidden = !on;
  if (!on) return;
  $('swipe').style.left = `${swipeAt * 100}%`;
  $('swLeft').textContent = itemDates(compareItem);
  $('swRight').textContent = selected ? itemDates(selected) : '';
  map.render();
}

function moveSwipe(f) { swipeAt = Math.min(0.98, Math.max(0.02, f)); swipeShow(); }
$('swHandle').addEventListener('pointerdown', e => {
  e.preventDefault(); $('swHandle').setPointerCapture(e.pointerId);
  const move = ev => { const r = $('map').getBoundingClientRect(); moveSwipe((ev.clientX - r.left) / r.width); };
  const up = () => { $('swHandle').removeEventListener('pointermove', move); $('swHandle').removeEventListener('pointerup', up); };
  $('swHandle').addEventListener('pointermove', move); $('swHandle').addEventListener('pointerup', up);
});
$('swHandle').onkeydown = e => {
  const d = { ArrowLeft: -0.02, ArrowRight: 0.02, PageDown: -0.1, PageUp: 0.1 }[e.key];
  if (d) { e.preventDefault(); moveSwipe(swipeAt + d); }
};
$('swOn').onchange = $('swRef').onchange = refreshCompare;
