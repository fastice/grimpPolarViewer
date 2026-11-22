// Glacier fronts: the NSIDC-0642 v2 winter terminus positions of up to 239 Greenland outlet glaciers, 1972-73 to
// 2020-21 (one line per glacier per winter), read from data/greenlandTermini.json the first time Glacier fronts
// is ticked. Greenland (EPSG:3413) only. Lines are colored by year, blue (oldest) to red (newest), with the
// color bar under the toggles, whose two handles pick the winters drawn (frontsSel); the hover readout gives the
// date of the fronts under the pointer.
const frontsUrl = 'data/greenlandTermini.json', frontsCode = 'EPSG:3413';
const frontColors = ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026'];
const frontsSource = new ol.source.Vector(), frontStyles = new Map();
let frontsList = null, frontsLoading = null, frontsYears = [0, 1], frontsSel = [-Infinity, Infinity];
// Color of a year on the frontColors ramp between years y0 and y1 (also used for the dated grounding lines).
function rampColor(year, [y0, y1] = frontsYears) {
  const t = Math.min(1, Math.max(0, (year - y0) / Math.max(1, y1 - y0))) * (frontColors.length - 1);
  const i = Math.min(Math.floor(t), frontColors.length - 2), a = hexRgba(frontColors[i]), b = hexRgba(frontColors[i + 1]);
  return `rgb(${[0, 1, 2].map(k => Math.round(a[k] + (t - i) * (b[k] - a[k]))).join(', ')})`;
}
const frontColor = year => rampColor(year);
// Two-handle year range over a color bar (key 'fronts' or 'gl': <key>Lo/Hi inputs, <key>ShadeL/R, <key>Band,
// <key>Min/Max labels): spans years, starts at all of them, labels the chosen ends with label(year) and calls
// onChange(lo, hi). Dragging the band between the handles shifts both, keeping the number of years.
function yearSlider(key, years, label, onChange) {
  const lo = $(key + 'Lo'), hi = $(key + 'Hi'), pos = v => (100 * (v - years[0])) / Math.max(1, years[1] - years[0]);
  for (const e of [lo, hi]) { e.min = years[0]; e.max = years[1]; e.step = 1; }
  lo.value = years[0]; hi.value = years[1];
  const band = $(key + 'Band'), at = f => `calc(var(--inset) + ${f / 100} * (100% - 2 * var(--inset)))`;
  const show = () => {
    band.style.left = at(pos(+lo.value)); band.style.width = `calc(${(pos(+hi.value) - pos(+lo.value)) / 100} * (100% - 2 * var(--inset)))`;
    $(key + 'ShadeL').style.cssText = `left: 0; width: ${pos(+lo.value)}%`;
    $(key + 'ShadeR').style.cssText = `right: 0; width: ${100 - pos(+hi.value)}%`;
    $(key + 'Min').textContent = label(+lo.value); $(key + 'Max').textContent = label(+hi.value);
  };
  lo.oninput = hi.oninput = e => {
    if (+lo.value > +hi.value) (e.target === lo ? hi : lo).value = e.target.value;  // a handle pushes the other
    show(); onChange(+lo.value, +hi.value);
  };
  band.onpointerdown = e => {
    const w = $(key + 'Bar').getBoundingClientRect().width, a = +lo.value, b = +hi.value, x0 = e.clientX;
    band.setPointerCapture(e.pointerId); e.preventDefault();
    band.onpointermove = m => {
      const d = Math.min(Math.max(Math.round(((m.clientX - x0) / w) * (years[1] - years[0])), years[0] - a), years[1] - b);
      if (a + d !== +lo.value) { lo.value = a + d; hi.value = b + d; show(); onChange(a + d, b + d); }
    };
    band.onpointerup = band.onpointercancel = () => { band.onpointermove = null; };
  };
  show();
}
const frontsLayer = new ol.layer.Vector({ source: frontsSource, zIndex: 5, visible: false, style: f => {
  const y = f.get('year');
  if (y < frontsSel[0] || y > frontsSel[1]) return null;
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
    yearSlider('fronts', frontsYears, y => `${y - 1}-${String(y).slice(2)}`, (a, b) => { frontsSel = [a, b]; frontsLayer.changed(); });
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
