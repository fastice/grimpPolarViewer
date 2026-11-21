// Antarctic boundaries (display only): the NSIDC-0709 v2 grounding line, ice shelf outlines and IMBIE drainage
// basins, read from data/antarcticBoundaries.json the first time Boundaries is ticked. Antarctica (EPSG:3031)
// only. Grounding line white, ice shelves cyan with their names once zoomed in (finer than boundsShelfRes m per
// pixel), basins dashed yellow with their IMBIE labels; overlapping labels are dropped.
const boundsUrl = 'data/antarcticBoundaries.json', boundsCode = 'EPSG:3031', boundsShelfRes = 1500;
const boundsSource = new ol.source.Vector();
let boundsLoading = null;
const casing = w => new ol.style.Stroke({ color: 'rgba(0, 0, 0, 0.55)', width: w });
const boundsStyles = {
  groundingLine: [new ol.style.Style({ stroke: casing(3.5) }), new ol.style.Style({ stroke: new ol.style.Stroke({ color: '#ffffff', width: 1.75 }) })],
  iceShelves: [new ol.style.Style({ stroke: casing(3) }), new ol.style.Style({ stroke: new ol.style.Stroke({ color: '#4fd8ff', width: 1.25 }) })],
  basins: [new ol.style.Style({ stroke: new ol.style.Stroke({ color: '#ffd23f', width: 1.5, lineDash: [6, 5] }) })],
};
const boundsLabel = (text, color, bold) => new ol.style.Style({ text: new ol.style.Text({ text, font: `${bold ? 600 : 400} 12px system-ui, sans-serif`,
  fill: new ol.style.Fill({ color }), stroke: new ol.style.Stroke({ color: 'rgba(0, 0, 0, 0.85)', width: 3 }), overflow: true }) });
const boundsLayer = new ol.layer.Vector({ source: boundsSource, zIndex: 5, visible: false, declutter: true, style: (f, res) => {
  const kind = f.get('kind'), name = f.get('name');
  if (!f.get('label')) return boundsStyles[kind];
  if (!name || (kind === 'iceShelves' && res > boundsShelfRes)) return null;
  return boundsLabel(name, kind === 'basins' ? '#ffd23f' : '#4fd8ff', kind === 'basins');
} });
map.addLayer(boundsLayer);

async function refreshBounds() {
  const here = viewCode === boundsCode, on = $('boundsOn').checked && here;
  $('boundsOn').disabled = !here;
  boundsLayer.setVisible(on);
  $('boundsLegend').hidden = !on;
  if (!on || boundsSource.getFeatures().length) return;
  boundsLoading ||= fetch(boundsUrl).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
  let d;
  try { d = await boundsLoading; } catch (e) {
    boundsLoading = null; $('boundsOn').checked = false; boundsLayer.setVisible(false); $('boundsLegend').hidden = true;
    setStatus(`Could not read the Antarctic boundaries (${e.message})`); return;
  }
  if (boundsSource.getFeatures().length) return;
  const features = [];
  for (const kind of ['basins', 'iceShelves', 'groundingLine']) {
    for (const [name, ...rings] of d[kind]) {
      const lines = rings.map(xy => { const pts = []; for (let k = 0; k < xy.length; k += 2) pts.push([xy[k], xy[k + 1]]); return pts; });
      features.push(new ol.Feature({ geometry: new ol.geom.MultiLineString(lines), kind }));
      if (kind === 'groundingLine' || !name) continue;
      // Label at the middle of the largest ring's extent.
      const big = lines.reduce((a, b) => (b.length > a.length ? b : a));
      features.push(new ol.Feature({ geometry: new ol.geom.Point(ol.extent.getCenter(ol.extent.boundingExtent(big))), kind, label: true,
        name: name.replace(/_/g, ' ') }));
    }
  }
  boundsSource.addFeatures(features);
}
map.on('change:view', refreshBounds);
$('boundsOn').onchange = refreshBounds;
