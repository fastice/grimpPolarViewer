// Glacier fronts: the NSIDC-0642 v2 winter terminus positions of up to 239 Greenland outlet glaciers, 1972-73 to
// 2020-21 (one line per glacier per winter), read from data/greenlandTermini.json the first time Glacier fronts
// is ticked. Greenland (EPSG:3413) only. Lines are colored by year, blue (oldest) to red (newest), with the
// color bar under the toggles; the hover readout gives the date of the fronts under the pointer.
const frontsUrl = 'data/greenlandTermini.json', frontsCode = 'EPSG:3413';
const frontColors = ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026'];
const frontsSource = new ol.source.Vector(), frontStyles = new Map();
let frontsList = null, frontsLoading = null, frontsYears = [0, 1];
// Color of a year on the frontColors ramp between years y0 and y1 (also used for the dated grounding lines).
function rampColor(year, [y0, y1] = frontsYears) {
  const t = Math.min(1, Math.max(0, (year - y0) / Math.max(1, y1 - y0))) * (frontColors.length - 1);
  const i = Math.min(Math.floor(t), frontColors.length - 2), a = hexRgba(frontColors[i]), b = hexRgba(frontColors[i + 1]);
  return `rgb(${[0, 1, 2].map(k => Math.round(a[k] + (t - i) * (b[k] - a[k]))).join(', ')})`;
}
const frontColor = year => rampColor(year);
const frontsLayer = new ol.layer.Vector({ source: frontsSource, zIndex: 5, visible: false, style: f => {
  const y = f.get('year');
  if (!frontStyles.has(y)) frontStyles.set(y, [new ol.style.Style({ stroke: new ol.style.Stroke({ color: 'rgba(0, 0, 0, 0.55)', width: 3.5 }) }),
                                               new ol.style.Style({ stroke: new ol.style.Stroke({ color: frontColor(y), width: 1.75 }) })]);
  return frontStyles.get(y);
} });
map.addLayer(frontsLayer);

async function refreshFronts() {
  const here = viewCode === frontsCode, on = $('frontsOn').checked && here;
  $('frontsOn').disabled = !here;
  frontsLayer.setVisible(on);
  $('frontsLegend').hidden = !on;
  if (!on) return;
  if (!frontsList) {
    frontsLoading ||= fetch(frontsUrl).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
    try { frontsList = (await frontsLoading).fronts; } catch (e) {
      frontsLoading = null; $('frontsOn').checked = false; frontsLayer.setVisible(false); $('frontsLegend').hidden = true;
      setStatus(`Could not read the glacier fronts (${e.message})`); return;
    }
    frontsYears = [Math.min(...frontsList.map(f => f[0])), Math.max(...frontsList.map(f => f[0]))];
    $('frontsBar').style.background = `linear-gradient(90deg, ${frontColors.join(', ')})`;
    $('frontsMin').textContent = `${frontsYears[0] - 1}-${String(frontsYears[0]).slice(2)}`;
    $('frontsMax').textContent = `${frontsYears[1] - 1}-${String(frontsYears[1]).slice(2)}`;
  }
  if (!frontsSource.getFeatures().length) {
    frontsSource.addFeatures(frontsList.map(([year, glacier, date, , ...xy]) => {
      const pts = []; for (let k = 0; k < xy.length; k += 2) pts.push([xy[k], xy[k + 1]]);
      return new ol.Feature({ geometry: new ol.geom.LineString(pts), year, glacier, date });
    }));
  }
}
// Readout line for the fronts under a map pixel ('' when none or hidden).
function frontNote(pixel) {
  if (!frontsLayer.getVisible()) return '';
  const hits = [];
  map.forEachFeatureAtPixel(pixel, f => { hits.push(f); }, { layerFilter: l => l === frontsLayer, hitTolerance: 3 });
  if (!hits.length) return '';
  const dates = [...new Set(hits.map(f => f.get('date')))].sort();
  const when = dates.length > 3 ? `${dates[0]} to ${dates[dates.length - 1]}` : dates.join(', ');
  return `<b>${dates.length > 1 ? `${dates.length} fronts` : 'front'}</b> ${when} (glacier ${hits[0].get('glacier')})`;
}
map.on('change:view', refreshFronts);
$('frontsOn').onchange = refreshFronts;
