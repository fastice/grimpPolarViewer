// Measure: distances along lines and areas inside polygons drawn on the map, as true lengths and areas on
// the WGS84 ellipsoid, with the polar stereographic map's own values beside them. On the polar maps each
// piece of a line (at most 2 km) is divided by the projection's scale factor there, and areas use the
// basins' ring area (ringArea) with the sides cut into the same pieces; other projections use OpenLayers'
// spherical geodesic measures.
// Measurements stay on the map until cleared (or the map's projection changes). Once drawn they can be
// edited: drag a point to move it, drag a side to add a point there, double-click or Alt-click a point to
// delete it (a line keeps at least two points, an area three); labels follow as they change.
const msSource = new ol.source.Vector();
const msLabelAt = g => g.getType() === 'Polygon' ? g.getInteriorPoint() : new ol.geom.Point(g.getLastCoordinate());
map.addLayer(new ol.layer.Vector({ source: msSource, zIndex: 7, style: f => [
  new ol.style.Style({ stroke: new ol.style.Stroke({ color: 'rgba(0, 0, 0, 0.7)', width: 4.5 }) }),
  new ol.style.Style({ stroke: new ol.style.Stroke({ color: '#ffd400', width: 2.5 }), fill: new ol.style.Fill({ color: 'rgba(255, 212, 0, 0.12)' }) }),
  new ol.style.Style({ geometry: g => msLabelAt(g.getGeometry()), text: new ol.style.Text({ text: f.get('label'), font: '600 13px system-ui, sans-serif',
    textAlign: 'left', offsetX: 8, offsetY: -10, fill: new ol.style.Fill({ color: '#fff' }), stroke: new ol.style.Stroke({ color: 'rgba(0, 0, 0, 0.85)', width: 3 }) }) }),
] }));
const msPolar = () => viewCode === 'EPSG:3413' || viewCode === 'EPSG:3031';
// Polar stereographic scale factor at a map point: map radius over the true parallel radius (taken 1 km
// out from the pole, where both go to zero).
function psScale([x, y]) {
  const r = Math.hypot(x, y), p = r >= 1000 ? [x, y] : r ? [x * 1000 / r, y * 1000 / r] : [1000, 0];
  const phi = Math.abs(ol.proj.toLonLat(p, viewCode)[1]) * Math.PI / 180, s = Math.sin(phi);
  return Math.hypot(...p) / (6378137 * Math.cos(phi) / Math.sqrt(1 - wgsE2 * s * s));
}
// [true length, map length] of a line in m.
function msLength(cs) {
  let t = 0, m = 0;
  for (let k = 1; k < cs.length; k++) {
    const [a, b] = [cs[k - 1], cs[k]], len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.min(500, Math.max(1, Math.ceil(len / 2000)));
    m += len;
    if (msPolar()) for (let j = 0; j < n; j++) { const f = (j + 0.5) / n; t += len / n / psScale([a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])]); }
  }
  return [msPolar() ? t : ol.sphere.getLength(new ol.geom.LineString(cs), { projection: viewCode }), m];
}
// A ring with its sides cut into straight map pieces of at most 2 km: ringArea's steps about the pole are
// exact only when short (a polygon with 20 km sides is otherwise 0.3% off).
function msDense(cs) {
  const out = [cs[0]];
  for (let k = 1; k < cs.length; k++) {
    const [a, b] = [cs[k - 1], cs[k]], n = Math.min(500, Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2000)));
    for (let j = 1; j <= n; j++) out.push([a[0] + j / n * (b[0] - a[0]), a[1] + j / n * (b[1] - a[1])]);
  }
  return out;
}
// [true area, map area] of a polygon in km2.
const msArea = g => msPolar() ? ringArea(msDense(g.getCoordinates()[0])) : [ol.sphere.getArea(g, { projection: viewCode }) / 1e6, g.getArea() / 1e6];
const msKm = m => m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 1e5 ? 2 : 0)} km`;
const msKm2 = a => `${a < 100 ? +a.toPrecision(3) : Math.round(a).toLocaleString('en-US')} km²`;
function msText(g) {
  if (g.getType() === 'Polygon') { const [t, m] = msArea(g); return [msKm2(t), `${msKm2(t)} (${msKm2(m)} on the map)`]; }
  const [t, m] = msLength(g.getCoordinates());
  return [msKm(t), `${msKm(t)} (${msKm(m)} on the map)`];
}
function msNoteAll(live = '') {
  const done = msSource.getFeatures().map(f => f.get('full'));
  $('msNote').textContent = live || (done.length ? `Last: ${done[done.length - 1]}. True lengths and areas on the WGS84 ellipsoid. `
    + 'Drag a point to move it, drag a side to add a point, double-click (or Alt-click) a point to delete it.' : '');
  $('msClear').hidden = !done.length;
  $('msCount').textContent = done.length ? `(${done.length})` : '';
}
function msStart(kind) {
  const btn = kind === 'LineString' ? 'msDist' : 'msArea', was = drawKind;
  if (draw) { stopDraw(); if (was === btn) { msNoteAll(); return; } refreshAnimInfo(); }
  if (tsMode) setTsMode(false);
  draw = new ol.interaction.Draw({ source: msSource, type: kind, style: outline('#ffd400') }); drawKind = btn;
  draw.on('drawstart', e => e.feature.getGeometry().on('change', ev => msNoteAll(msText(ev.target)[1])));
  draw.on('drawend', e => {
    const [label, full] = msText(e.feature.getGeometry());
    e.feature.setProperties({ label, full });
    pfDrawnAt = performance.now();  // the click that ended it is not a map click
    setTimeout(() => { stopDraw(); msNoteAll(); });
  });
  draw.on('drawabort', () => msNoteAll());
  map.addInteraction(draw);
  $(btn).textContent = 'Cancel';
  $('msNote').textContent = kind === 'LineString' ? 'Click points along the line; double-click to finish.' : 'Click the corners; double-click or click the first corner to finish.';
}
// Editing: a Modify interaction on the measurements, off while any shape is being drawn (on the map, by
// any tool); each edit relabels its measurement.
const msModify = new ol.interaction.Modify({ source: msSource, pixelTolerance: 8,
  deleteCondition: e => ol.events.condition.doubleClick(e) || (ol.events.condition.altKeyOnly(e) && ol.events.condition.singleClick(e)) });
map.addInteraction(msModify);
const msDrawing = () => map.getInteractions().getArray().some(i => i instanceof ol.interaction.Draw);
map.getInteractions().on(['add', 'remove'], () => msModify.setActive(!msDrawing()));
msSource.on('addfeature', e => e.feature.getGeometry().on('change', ev => {
  if (!e.feature.get('label')) return;  // still being drawn
  const [label, full] = msText(ev.target);
  e.feature.setProperties({ label, full });
  msNoteAll(full);
}));
msModify.on('modifyend', () => msNoteAll());
$('msDist').onclick = () => msStart('LineString');
$('msArea').onclick = () => msStart('Polygon');
$('msClear').onclick = () => { if (drawKind === 'msDist' || drawKind === 'msArea') stopDraw(); msSource.clear(); msNoteAll(); };
map.on('change:view', () => { msSource.clear(); msNoteAll(); });
