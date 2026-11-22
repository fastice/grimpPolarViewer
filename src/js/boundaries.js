// Antarctic boundaries (display only): the NSIDC-0709 v2 grounding line and IMBIE drainage basins (with the
// ice shelf names), read from data/antarcticBoundaries.json, and the ice front and coast of the September 2026
// GrIMP Antarctic ice mask (data/antarcticIceFront.json), read the first time Boundaries is ticked.
// Antarctica (EPSG:3031) only. Grounding line white, ice front cyan with the shelf names once zoomed in (finer
// than boundsShelfRes m per pixel), basins dashed yellow with their IMBIE labels; overlapping labels are dropped.
// (NSIDC-0709's own shelf outlines are not drawn: their fronts are 2008-09.) Over them, the dated
// NSIDC-0498 v2.1 InSAR grounding lines of the Amundsen Sea glaciers (data/aseGroundingLines.json, 1992-2025),
// colored by year on the glacier-front ramp, the years drawn picked on its color bar (glSel); the readout gives
// the dates of those under the pointer.
// In Greenland (EPSG:3413) Boundaries draws only the Mouginot and Rignot (2019) glacier basins
// (data/greenlandBasins.json), unlabeled (Glacier names labels the glaciers).
const boundsUrl = 'data/antarcticBoundaries.json', iceFrontUrl = 'data/antarcticIceFront.json', boundsShelfRes = 1500;
// Per projection: the files read the first time Boundaries is ticked there, the basin legend text and the source.
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
// Layers turned off by a click on their legend entry (ice shelf names go with the ice front; 'dated' = glLayer).
const boundsOff = new Set(), boundsKeyOf = { iceShelves: 'iceFront' };
const boundsLayer = new ol.layer.Vector({ source: boundsSets['EPSG:3031'].source, zIndex: 5, visible: false, declutter: true, style: (f, res) => {
  const kind = f.get('kind'), name = f.get('name');
  if (boundsOff.has(boundsKeyOf[kind] || kind)) return null;
  if (!f.get('label')) return boundsStyles[kind];
  if (!name || (kind === 'iceShelves' && res > boundsShelfRes)) return null;
  return boundsLabel(name, kind === 'basins' ? '#ffd23f' : '#4fd8ff', kind === 'basins');
} });
map.addLayer(boundsLayer);
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
  const set = boundsSets[viewCode], ant = viewCode === 'EPSG:3031', on = $('boundsOn').checked && !!set;
  $('boundsOn').disabled = !set;
  if (set) { boundsLayer.setSource(set.source); $('basinsKey').textContent = set.basins; }
  boundsLayer.setVisible(on); glLayer.setVisible(on && ant && !boundsOff.has('dated'));
  $('boundsLegend').hidden = !on;
  for (const b of document.querySelectorAll('#boundsLegend .bkey')) if (b.dataset.kind !== 'basins') b.hidden = !ant;
  $('glKey').hidden = !ant;
  if (on && ant && !glSource.getFeatures().length) loadGroundingLines();
  if (!on || set.source.getFeatures().length) return;
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
      if (kind !== 'iceShelves') features.push(new ol.Feature({ geometry: new ol.geom.MultiLineString(lines), kind }));
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
map.on('change:view', refreshBounds);
$('boundsOn').onchange = refreshBounds;
for (const b of document.querySelectorAll('#boundsLegend .bkey')) b.title = 'Click to hide or show this layer';
for (const b of document.querySelectorAll('#boundsLegend .bkey')) b.onclick = () => {
  const k = b.dataset.kind, off = !boundsOff.delete(k);
  if (off) boundsOff.add(k);
  b.classList.toggle('off', off); b.setAttribute('aria-pressed', String(!off));
  boundsLayer.changed(); refreshBounds();
};
