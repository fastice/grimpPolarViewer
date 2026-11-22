// Place search: a box at the top right of the map that finds named places in the current hemisphere and
// zooms to the one picked, marking it. Greenland uses the glacier-name list (official, foreign, new and old
// Greenlandic and alternative names all match, so "Jakobshavn" finds Sermeq Kujalleq); Antarctica the
// SCAR Composite Gazetteer selection in data/antarcticPlaceNames.json (every country's name for a place
// matches). Matching ignores case and accents (æ, ø and å match ae, o and a); exact and prefix matches
// come first, then (Greenland) major glaciers, outlets and local glaciers, or (Antarctica) ice shelves,
// ice streams, glaciers, stations and regions before other features, places named by more countries first.
const searchSets = {
  'EPSG:3413': async () => (await loadGreenlandNames()).map(n => ({
    names: n.slice(4, 9).filter(Boolean), label: n[4], lon: n[0], lat: n[1],
    sub: [n[5] && n[5] !== n[4] ? n[5] : '', n[3] === 'GrIS' ? 'outlet glacier' : 'local glacier or ice cap'].filter(Boolean).join(', '),
    rank: n[9] ? 0 : n[3] === 'GrIS' ? 1 : 2 })),
  'EPSG:3031': async () => {
    return (await loadAntarcticNames()).names.map(([lon, lat, label, type, nGaz, ...others]) => ({ names: [label, ...others], label, lon, lat,
      sub: type.toLowerCase(), rank: (searchMajorTypes.has(type) ? 0 : 10) - nGaz }));
  },
};
const searchMajorTypes = new Set(['Ice shelf', 'Ice stream', 'Glacier', 'Station', 'Land', 'Coast', 'Sea', 'Ice sheet', 'Dome', 'Ice rise']);
const searchCache = new Map(), searchMax = 8;
const searchFold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/æ/g, 'ae').replace(/[øœ]/g, 'o').replace(/ß/g, 'ss');
const searchSource = new ol.source.Vector();
map.addLayer(new ol.layer.Vector({ source: searchSource, zIndex: 8, style: f => new ol.style.Style({
  image: new ol.style.Circle({ radius: 6.75, stroke: new ol.style.Stroke({ color: '#ff3ea5', width: 2.25 }), fill: new ol.style.Fill({ color: 'rgba(255, 62, 165, 0.15)' }) }),
  text: new ol.style.Text({ text: f.get('label'), font: '600 13px system-ui, sans-serif', textAlign: 'left', offsetX: 11,
    fill: new ol.style.Fill({ color: '#fff' }), stroke: new ol.style.Stroke({ color: 'rgba(0, 0, 0, 0.85)', width: 3 }) }),
}) }));
let searchHits = [], searchSel = -1, searchToken = 0;

async function searchPlaces(q) {
  const set = searchSets[viewCode];
  if (!set) return null;
  if (!searchCache.has(viewCode)) searchCache.set(viewCode, set().then(list => list.map(p => ({ ...p, folded: p.names.map(searchFold) })),
    e => { searchCache.delete(viewCode); throw e; }));
  const list = await searchCache.get(viewCode), f = searchFold(q.trim());
  if (!f) return [];
  const scored = [];
  for (const p of list) {
    let best = 9;
    for (const n of p.folded) {
      const s = n === f ? 0 : n.startsWith(f) ? 1 : n.split(/[\s-]+/).some(w => w.startsWith(f)) ? 2 : n.includes(f) ? 3 : 9;
      if (s < best) best = s;
    }
    if (best < 9) scored.push([best, p]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].rank - b[1].rank || a[1].label.localeCompare(b[1].label)).slice(0, searchMax).map(s => s[1]);
}

function showSearchHits() {
  const ul = $('searchResults');
  ul.replaceChildren(...searchHits.map((p, i) => {
    const li = document.createElement('li');
    li.className = i === searchSel ? 'sel' : '';
    li.innerHTML = `<b>${esc(p.label)}</b>${p.sub ? ` <span class="note">${esc(p.sub)}</span>` : ''}`;
    li.onmousedown = e => { e.preventDefault(); goToPlace(p); };
    return li;
  }));
  ul.hidden = !searchHits.length && !ul.dataset.note;
  if (!searchHits.length && ul.dataset.note) { const li = document.createElement('li'); li.className = 'note'; li.textContent = ul.dataset.note; ul.append(li); }
}

async function runSearch() {
  const q = $('searchBox').value, token = ++searchToken, ul = $('searchResults');
  let hits;
  try { hits = await searchPlaces(q); } catch (e) { hits = []; ul.dataset.note = `Could not read the place names (${e.message})`; }
  if (token !== searchToken) return;
  if (hits === null) { hits = []; ul.dataset.note = 'No place names for this region yet'; }
  else if (hits.length || !q.trim()) delete ul.dataset.note;
  else if (!ul.dataset.note?.startsWith('Could not')) ul.dataset.note = 'No match';
  searchHits = hits; searchSel = hits.length ? 0 : -1;
  showSearchHits();
}

// The box collapses to a Search button (closed at start, after a pick, and on Escape); the marker stays.
function setSearchOpen(open) {
  $('search').classList.toggle('collapsed', !open);
  $('searchOpen').setAttribute('aria-expanded', String(open));
  $('searchOpen').title = open ? 'Close the search box' : 'Search places';
  if (open) $('searchBox').focus();
}
$('searchOpen').onclick = () => setSearchOpen($('search').classList.contains('collapsed'));

function goToPlace(p) {
  const c = ol.proj.fromLonLat([p.lon, p.lat], viewCode), view = map.getView();
  searchSource.clear();
  searchSource.addFeature(new ol.Feature({ geometry: new ol.geom.Point(c), label: p.label }));
  view.animate({ center: c, resolution: Math.min(view.getResolution(), 400), duration: 400 });
  $('searchBox').value = p.label; $('searchClear').hidden = false;
  searchHits = []; delete $('searchResults').dataset.note; showSearchHits();
  $('searchBox').blur();
  setSearchOpen(false);
}

$('searchBox').oninput = () => { $('searchClear').hidden = !$('searchBox').value; runSearch(); };
$('searchBox').onfocus = () => { if ($('searchBox').value) runSearch(); };
$('searchBox').onblur = () => { searchHits = []; delete $('searchResults').dataset.note; showSearchHits(); };
$('searchBox').onkeydown = e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (searchHits.length) { searchSel = (searchSel + (e.key === 'ArrowDown' ? 1 : searchHits.length - 1)) % searchHits.length; showSearchHits(); }
  } else if (e.key === 'Enter') {
    if (searchHits[searchSel]) goToPlace(searchHits[searchSel]);
  } else if (e.key === 'Escape') { $('searchBox').blur(); setSearchOpen(false); $('searchOpen').focus(); }
};
$('searchClear').onclick = () => { $('searchBox').value = ''; $('searchClear').hidden = true; searchSource.clear(); runSearch(); };
map.on('change:view', () => { searchSource.clear(); $('searchBox').value = ''; $('searchClear').hidden = true; });
