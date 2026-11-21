// Glacier names as map labels, read the first time Glacier names is ticked: in Greenland (EPSG:3413) the
// Greenland Glacier Names set (GGN v01, Bjørk et al. 2015, data/greenlandGlacierNames.json), in Antarctica
// (EPSG:3031) the SCAR Composite Gazetteer selection (data/antarcticPlaceNames.json, shared with place search).
// Three tiers: zoomed all the way out (coarser than namesMajorRes m per pixel) only the major features
// (Greenland: 19 outlets; Antarctica: the file's 'major' list of 80 glaciers, ice streams, shelves, stations,
// lands and seas), then tier 1 (Greenland: every ice-sheet outlet; Antarctica: namesMidTypes), and finer than
// namesLocalRes everything; labels that would overlap are dropped. In Greenland a foreign name that differs
// from the official one follows it in parentheses, e.g. Sermeq Kujalleq (Jakobshavn Isbræ), and labels go on
// the ocean side: to the left of glaciers west of Greenland's middle (namesMidLon, by latitude), to the right
// of those east of it.
const namesUrl = 'data/greenlandGlacierNames.json', antNamesUrl = 'data/antarcticPlaceNames.json', namesMajorRes = 1500, namesLocalRes = 400;
const namesMidTypes = new Set(['Glacier', 'Ice stream', 'Ice shelf', 'Station', 'Land', 'Coast', 'Sea', 'Ice sheet', 'Dome', 'Ice rise']);
// Longitude halfway between Greenland's west and east coasts, every 2 degrees of latitude from 60 N.
const namesMid = [-45, -46, -46, -45, -42, -38, -38, -38, -42, -45, -42, -40, -40];
function namesMidLon(lat) {
  const k = Math.min(Math.max((lat - 60) / 2, 0), namesMid.length - 1), i = Math.min(Math.floor(k), namesMid.length - 2);
  return namesMid[i] + (k - i) * (namesMid[i + 1] - namesMid[i]);
}
const namesSource = new ol.source.Vector();
let namesList = null, namesLoading = null, antNamesLoading = null;
const nameLabel = n => n[5] && n[5] !== n[4] ? `${n[4]} (${n[5]})` : n[4];
const namesLayer = new ol.layer.Vector({ source: namesSource, zIndex: 7, visible: false, declutter: true, style: (f, res) => {
  const tier = f.get('tier'), outlet = tier < 2, west = f.get('west');
  if ((res > namesMajorRes && tier > 0) || (tier > 1 && res > namesLocalRes)) return null;
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

// The Antarctic names file ({ names, major }), read once (shared with place search).
function loadAntarcticNames() {
  antNamesLoading ||= fetch(antNamesUrl).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .catch(e => { antNamesLoading = null; throw e; });
  return antNamesLoading;
}

async function refreshNames() {
  const code = viewCode, here = code === 'EPSG:3413' || code === 'EPSG:3031', on = $('namesOn').checked && here;
  $('namesOn').disabled = !here;
  namesLayer.setVisible(on);
  if (!on || namesSource.get('code') === code) return;
  let features;
  try {
    if (code === 'EPSG:3413') {
      features = (await loadGreenlandNames()).map(n => ({ lon: n[0], lat: n[1], label: nameLabel(n), tier: n[9] ? 0 : n[3] === 'GrIS' ? 1 : 2,
        west: n[0] < namesMidLon(n[1]) }));
    } else {
      const d = await loadAntarcticNames(), major = new Set(d.major);
      features = d.names.map(([lon, lat, label, type]) => ({ lon, lat, label, tier: major.has(`${label}@${lon},${lat}`) ? 0 : namesMidTypes.has(type) ? 1 : 2, west: false }));
    }
  } catch (e) {
    $('namesOn').checked = false; namesLayer.setVisible(false);
    setStatus(`Could not read the glacier names (${e.message})`); return;
  }
  if (viewCode !== code || namesSource.get('code') === code) return;
  namesSource.clear(); namesSource.set('code', code);
  namesSource.addFeatures(features.map(p => new ol.Feature({ geometry: new ol.geom.Point(ol.proj.fromLonLat([p.lon, p.lat], code)),
    label: p.label, tier: p.tier, west: p.west })));
}
map.on('change:view', refreshNames);
$('namesOn').onchange = refreshNames;
