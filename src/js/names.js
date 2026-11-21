// Glacier names: the Greenland Glacier Names set (GGN v01, Bjørk et al. 2015) as map labels, read from
// data/greenlandGlacierNames.json the first time Glacier names is ticked. Greenland (EPSG:3413) only.
// Zoomed all the way out (coarser than namesMajorRes m per pixel) only the major outlets are labelled,
// then every ice-sheet outlet, and finer than namesLocalRes the local glaciers and ice caps too; labels
// that would overlap are dropped. A foreign name that differs from the official one follows it in
// parentheses, e.g. Sermeq Kujalleq (Jakobshavn Isbræ). Labels go on the ocean side: to the left of
// glaciers west of Greenland's middle (namesMidLon, by latitude), to the right of those east of it.
const namesUrl = 'data/greenlandGlacierNames.json', namesCode = 'EPSG:3413', namesMajorRes = 1500, namesLocalRes = 400;
// Longitude halfway between Greenland's west and east coasts, every 2 degrees of latitude from 60 N.
const namesMid = [-45, -46, -46, -45, -42, -38, -38, -38, -42, -45, -42, -40, -40];
function namesMidLon(lat) {
  const k = Math.min(Math.max((lat - 60) / 2, 0), namesMid.length - 1), i = Math.min(Math.floor(k), namesMid.length - 2);
  return namesMid[i] + (k - i) * (namesMid[i + 1] - namesMid[i]);
}
const namesSource = new ol.source.Vector();
let namesList = null, namesLoading = null;
const nameLabel = n => n[5] && n[5] !== n[4] ? `${n[4]} (${n[5]})` : n[4];
const namesLayer = new ol.layer.Vector({ source: namesSource, zIndex: 7, visible: false, declutter: true, style: (f, res) => {
  const outlet = f.get('type') === 'GrIS', west = f.get('west');
  if ((res > namesMajorRes && !f.get('major')) || (!outlet && res > namesLocalRes)) return null;
  return new ol.style.Style({
    image: new ol.style.Circle({ radius: outlet ? 3 : 2, fill: new ol.style.Fill({ color: '#fff' }), stroke: new ol.style.Stroke({ color: '#000', width: 1 }) }),
    text: new ol.style.Text({ text: f.get('label'), font: `${outlet ? 600 : 400} 12px system-ui, sans-serif`, textAlign: west ? 'right' : 'left', offsetX: west ? -6 : 6,
      fill: new ol.style.Fill({ color: '#fff' }), stroke: new ol.style.Stroke({ color: 'rgba(0, 0, 0, 0.85)', width: 3 }) }),
  });
} });
map.addLayer(namesLayer);

// The names list, read once (shared with place search); a failed read is tried again next time.
function loadGreenlandNames() {
  namesLoading ||= fetch(namesUrl).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(d => (namesList = d.names), e => { namesLoading = null; throw e; });
  return namesLoading;
}

async function refreshNames() {
  const here = viewCode === namesCode, on = $('namesOn').checked && here;
  $('namesOn').disabled = !here;
  namesLayer.setVisible(on);
  if (!on) return;
  try { await loadGreenlandNames(); } catch (e) {
    $('namesOn').checked = false; namesLayer.setVisible(false);
    setStatus(`Could not read the glacier names (${e.message})`); return;
  }
  if (namesSource.get('code') !== viewCode) {
    namesSource.clear(); namesSource.set('code', viewCode);
    namesSource.addFeatures(namesList.map(n => new ol.Feature({ geometry: new ol.geom.Point(ol.proj.fromLonLat([n[0], n[1]], viewCode)),
      type: n[3], label: nameLabel(n), major: !!n[9], west: n[0] < namesMidLon(n[1]) })));
  }
}
map.on('change:view', refreshNames);
$('namesOn').onchange = refreshNames;
