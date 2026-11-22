// Antarctic and Greenland reference lines (display only), each behind its own checkbox:
// - Basins: the IMBIE drainage basins of NSIDC-0709 v2 (data/antarcticBoundaries.json) with their labels in
//   Antarctica (EPSG:3031); the Mouginot and Rignot (2019) glacier basins (data/greenlandBasins.json), unlabeled
//   (Glacier names labels the glaciers), in Greenland (EPSG:3413). Dashed yellow. The readout gives the basin
//   under the pointer and its true area (basinNote).
// - Coastlines, in Antarctica only, in place of the GIBS coastline (which misplaces them): the NSIDC-0709
//   grounding line (white, from the same file) and the ice front and coast of the September 2026 GrIMP ice mask
//   (data/antarcticIceFront.json, cyan), with the NSIDC-0709 ice shelf names finer than boundsShelfRes m per
//   pixel. (NSIDC-0709's own shelf outlines are not drawn: their fronts are 2008-09.) Its legend entries hide
//   or show the grounding line and the ice front (with the shelf names) separately (coastOff).
// - Dated grounding lines: the NSIDC-0498 v2.1 InSAR grounding lines of the Amundsen Sea glaciers
//   (data/aseGroundingLines.json, 1992-2025), colored by year on the glacier-front ramp, the years drawn picked
//   on its color bar (glSel); the readout gives the dates of those under the pointer.
// The files are read the first time a layer needs them; overlapping labels are dropped.
const boundsUrl = 'data/antarcticBoundaries.json', iceFrontUrl = 'data/antarcticIceFront.json', boundsShelfRes = 1500;
// Per projection: the files read the first time Basins (or Antarctic Coastlines) needs them, the basin legend text
// and the source they fill.
const boundsSets = {
  'EPSG:3031': { urls: [boundsUrl, iceFrontUrl], what: 'Antarctic boundaries', basins: 'IMBIE basins', source: new ol.source.Vector() },
  'EPSG:3413': { urls: ['data/greenlandBasins.json'], what: 'Greenland basins', basins: 'glacier basins (Mouginot 2019)', source: new ol.source.Vector() },
};
const casing = w => new ol.style.Stroke({ color: 'rgba(0, 0, 0, 0.55)', width: w });
const boundsStyles = {
  groundingLine: [new ol.style.Style({ stroke: casing(3.5) }), new ol.style.Style({ stroke: new ol.style.Stroke({ color: '#ffffff', width: 1.75 }) })],
  iceFront: [new ol.style.Style({ stroke: casing(3) }), new ol.style.Style({ stroke: new ol.style.Stroke({ color: '#4fd8ff', width: 1.25 }) })],
  basins: [new ol.style.Style({ stroke: new ol.style.Stroke({ color: '#ffd23f', width: 1.5, lineDash: [6, 5] }) })],
};
const boundsLabel = (text, color, bold) => new ol.style.Style({ text: new ol.style.Text({ text, font: `${bold ? 600 : 400} 12px system-ui, sans-serif`,
  fill: new ol.style.Fill({ color }), stroke: new ol.style.Stroke({ color: 'rgba(0, 0, 0, 0.85)', width: 3 }), overflow: true }) });
// Basins draws the basin features of the source, Antarctic Coastlines the rest (both share the Antarctic source).
const boundsLayer = new ol.layer.Vector({ source: boundsSets['EPSG:3031'].source, zIndex: 5, visible: false, declutter: true, style: f => {
  if (f.get('kind') !== 'basins') return null;
  return !f.get('label') ? boundsStyles.basins : f.get('name') ? boundsLabel(f.get('name'), '#ffd23f', true) : null;
} });
map.addLayer(boundsLayer);
const coastOff = new Set();
const coastVecLayer = new ol.layer.Vector({ source: boundsSets['EPSG:3031'].source, zIndex: 4, visible: false, declutter: true, style: (f, res) => {
  const kind = f.get('kind');
  if (kind === 'basins' || coastOff.has(kind === 'iceShelves' ? 'iceFront' : kind)) return null;
  if (!f.get('label')) return boundsStyles[kind];
  return f.get('name') && res <= boundsShelfRes ? boundsLabel(f.get('name'), '#4fd8ff', false) : null;
} });
map.addLayer(coastVecLayer);
const glUrl = 'data/aseGroundingLines.json', glSource = new ol.source.Vector(), glStyles = new Map();
let glLoading = null, glYears = [0, 1], glSel = [-Infinity, Infinity];
const glLayer = new ol.layer.Vector({ source: glSource, zIndex: 5, visible: false, style: f => {
  const y = f.get('year');
  if (y < glSel[0] || y > glSel[1]) return null;
  if (!glStyles.has(y)) glStyles.set(y, [new ol.style.Style({ stroke: casing(3) }),
                                         new ol.style.Style({ stroke: new ol.style.Stroke({ color: rampColor(y, glYears), width: 1.5 }) })]);
  return glStyles.get(y);
} });
map.addLayer(glLayer);

async function refreshBounds() {
  const set = boundsSets[viewCode], ant = viewCode === 'EPSG:3031', on = $('boundsOn').checked && !!set, coast = ant && $('coastOn').checked;
  $('boundsOn').disabled = !set;
  if (set) { boundsLayer.setSource(set.source); $('basinsKey').textContent = set.basins; }
  boundsLayer.setVisible(on); coastVecLayer.setVisible(coast); $('coastLegend').hidden = !coast;
  $('boundsLegend').hidden = !on;
  const dated = ant && $('glOn').checked;
  $('glOn').disabled = !ant; glLayer.setVisible(dated); $('glLegend').hidden = !dated;
  if (dated && !glSource.getFeatures().length) loadGroundingLines();
  if (!(on || coast) || set.source.getFeatures().length) return;
  const getJson = u => fetch(u).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
  set.loading ||= Promise.all(set.urls.map(getJson)).then(([b, f]) => (f ? { ...b, iceFront: f.rings } : b));
  let d;
  try { d = await set.loading; } catch (e) {
    set.loading = null; $('boundsOn').checked = false; boundsLayer.setVisible(false); $('boundsLegend').hidden = true;
    setStatus(`Could not read the ${set.what} (${e.message})`); return;
  }
  if (set.source.getFeatures().length) return;
  const features = [];
  const toPts = xy => { const pts = []; for (let k = 0; k < xy.length; k += 2) pts.push([xy[k], xy[k + 1]]); return pts; };
  if (d.iceFront) features.push(new ol.Feature({ geometry: new ol.geom.MultiLineString(d.iceFront.map(toPts)), kind: 'iceFront' }));
  for (const kind of ['basins', 'iceShelves', 'groundingLine']) {
    for (const [name, ...rings] of d[kind] || []) {
      const lines = rings.map(toPts);
      if (kind !== 'iceShelves') features.push(new ol.Feature({ geometry: new ol.geom.MultiLineString(lines), kind, name: name.replace(/_/g, ' ') }));
      if (kind === 'groundingLine' || !name) continue;
      // Label at the middle of the largest ring's extent.
      const big = lines.reduce((a, b) => (b.length > a.length ? b : a));
      features.push(new ol.Feature({ geometry: new ol.geom.Point(ol.extent.getCenter(ol.extent.boundingExtent(big))), kind, label: true,
        name: name.replace(/_/g, ' ') }));
    }
  }
  set.source.addFeatures(features);
}
async function loadGroundingLines() {
  glLoading ||= fetch(glUrl).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
  let d;
  try { d = await glLoading; } catch (e) { glLoading = null; setStatus(`Could not read the Amundsen Sea grounding lines (${e.message})`); return; }
  if (glSource.getFeatures().length) return;
  glYears = [Math.min(...d.lines.map(l => l[0])), Math.max(...d.lines.map(l => l[0]))];
  $('glBar').style.background = `linear-gradient(90deg, ${frontColors.join(', ')})`;
  yearSlider('gl', glYears, String, (a, b) => { glSel = [a, b]; glLayer.changed(); });
  glSource.addFeatures(d.lines.map(([year, date, sensor, glacier, ...pieces]) => new ol.Feature({
    geometry: new ol.geom.MultiLineString(pieces.map(xy => { const pts = []; for (let k = 0; k < xy.length; k += 2) pts.push([xy[k], xy[k + 1]]); return pts; })),
    year, date: date || String(year), sensor, glacier })));
}
// Readout line for the dated grounding lines under a map pixel ('' when none or hidden).
function glNote(pixel) {
  if (!glLayer.getVisible()) return '';
  const hits = [];
  map.forEachFeatureAtPixel(pixel, f => { hits.push(f); }, { layerFilter: l => l === glLayer, hitTolerance: 3 });
  if (!hits.length) return '';
  const dates = [...new Set(hits.map(f => f.get('date')))].sort(), sensors = [...new Set(hits.map(f => f.get('sensor')).filter(Boolean))].join(', ');
  const when = dates.length > 3 ? `${dates[0]} to ${dates[dates.length - 1]}` : dates.join(', ');
  return `<b>${dates.length > 1 ? `${dates.length} grounding lines` : 'grounding line'}</b> ${when} (${esc(hits[0].get('glacier'))}${sensors ? `; ${esc(sensors)}` : ''})`;
}
// True (WGS84) area of a ring in km2, and its polar stereographic map area. The map area is divided by the
// square of the projection's scale factor exactly, by Green's theorem about the pole: the true area is the
// sum over the ring of the true area of the polar cap out to each vertex (from its authalic latitude) times
// the angle the ring turns about the pole there. Steps through the pole are radial and add nothing.
const wgsE2 = 0.00669437999014, wgsE = Math.sqrt(wgsE2);
const authQ = s => (1 - wgsE2) * (s / (1 - wgsE2 * s * s) - Math.log((1 - wgsE * s) / (1 + wgsE * s)) / (2 * wgsE));
const authQp = authQ(1), authR2 = 6378137 ** 2 * authQp / 2;
function ringArea(pts) {
  const n = pts.length, cap = pts.map(p => authR2 * (1 - authQ(Math.sin(Math.abs(ol.proj.toLonLat(p, viewCode)[1]) * Math.PI / 180)) / authQp));
  let a = 0, m = 0;
  for (let k = 0; k < n; k++) {
    const p = pts[k], q = pts[(k + 1) % n];
    m += p[0] * q[1] - q[0] * p[1];
    if (Math.hypot(...p) < 1 || Math.hypot(...q) < 1) continue;
    let turn = Math.atan2(q[1], q[0]) - Math.atan2(p[1], p[0]);
    if (turn > Math.PI) turn -= 2 * Math.PI; else if (turn < -Math.PI) turn += 2 * Math.PI;
    a += 0.5 * (cap[k] + cap[(k + 1) % n]) * turn;
  }
  return [Math.abs(a) / 1e6, Math.abs(m) / 2e6];
}
function inRing(ring, [x, y]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < xj + ((y - yi) * (xi - xj)) / (yj - yi)) inside = !inside;
  }
  return inside;
}
// A basin is the area inside an odd number of its rings (a ring inside another is a hole).
function basinArea(rings) {
  const ext = rings.map(r => ol.extent.boundingExtent(r));
  return rings.reduce((s, r, i) => {
    const holes = rings.filter((o, j) => j !== i && ol.extent.containsCoordinate(ext[j], r[0]) && inRing(o, r[0])).length, sign = holes % 2 ? -1 : 1;
    const [t, mp] = ringArea(r);
    return [s[0] + sign * t, s[1] + sign * mp];
  }, [0, 0]);
}
// Readout line for the basin under a map coordinate ('' when none or Basins is off): its name and true area.
function basinNote(coord) {
  if (!boundsLayer.getVisible()) return '';
  for (const f of boundsLayer.getSource().getFeatures()) {
    if (f.get('kind') !== 'basins' || f.get('label') || !ol.extent.containsCoordinate(f.getGeometry().getExtent(), coord)) continue;
    const rings = f.getGeometry().getCoordinates();
    if (rings.filter(r => inRing(r, coord)).length % 2 === 0) continue;
    if (!f.get('area')) f.set('area', basinArea(rings), true);
    const [t, m] = f.get('area'), km2 = v => Math.round(v).toLocaleString('en-US');
    return `<b>basin${f.get('name') ? ` ${esc(f.get('name'))}` : ''}</b> ${km2(t)} km<sup>2</sup> (${km2(m)} on the polar stereographic map)`;
  }
  return '';
}
map.on('change:view', refreshBounds);
$('boundsOn').onchange = refreshBounds;
$('glOn').onchange = refreshBounds;
$('coastOn').addEventListener('change', refreshBounds);
for (const b of document.querySelectorAll('#coastLegend .bkey')) {
  b.title = 'Click to hide or show this line';
  b.onclick = () => {
    const off = !coastOff.delete(b.dataset.kind);
    if (off) coastOff.add(b.dataset.kind);
    b.classList.toggle('off', off); b.setAttribute('aria-pressed', String(!off));
    coastVecLayer.changed();
  };
}
