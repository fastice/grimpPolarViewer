// Kopah maintenance: 2nd Tuesday monthly 9:00-17:00 Pacific; Jan/Apr/Jul/Oct 9:00 Tue to 9:00 Wed.
function kopahMaintenance(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now).map(x => [x.type, x.value]));
  const day = +parts.day, month = +parts.month, hour = +parts.hour;
  const secondTue = parts.weekday === 'Tue' && day >= 8 && day <= 14;
  const quarterly = [1, 4, 7, 10].includes(month);
  if (secondTue && hour >= 9 && (quarterly || hour < 17)) return quarterly ? '9 a.m. Wednesday' : '5 p.m.';
  if (quarterly && parts.weekday === 'Wed' && day >= 9 && day <= 15 && hour < 9) return '9 a.m. today';
  return null;
}
function showMaintenance() {
  const until = kopahMaintenance();
  $('maintNow').hidden = !until;
  if (until) $('maintNow').textContent = `Kopah is in its scheduled maintenance window until about ${until} Pacific; data may not load.`;
}

function setStatus(msg, err = false) { $('status').textContent = msg; $('status').className = err ? 'err' : ''; }
// Site collections (TSX boxes) open on the newest product, which may be at any glacier, so the status line
// says how to choose a site until one is picked.
const siteHint = '. Click a box on the map to choose a glacier site; points and animations use the orange box.';
function clearSiteHint() { const t = $('status').textContent; if (t.endsWith(siteHint)) setStatus(t.slice(0, -siteHint.length)); }
const siteName = it => it.raw?.['grimp:site'] || it.id;

function toItem(r) {
  const epsg = num(r['proj:epsg']);
  const assets = Object.fromEntries(Object.entries(r.assets || {}).filter(([, a]) => a && /^https?:\/\//i.test(a.href || '')));
  const start = r.start_datetime || r.datetime, end = r.end_datetime || r.datetime;
  const native = r['proj:geometry'];
  return { id: r.id, epsg, assets, start, end, geom: native?.type ? native : null, geom4326: r.geometry, raw: r };
}

async function loadCatalog(href, push = true) {
  const prevCode = viewCode, prevName = tsCollectionName();
  $('href').value = href;
  const p = presets.findIndex(([, u]) => u === href);
  if (p >= 0 && presets[p][2] !== hemi) setHemi(presets[p][2]);
  $('preset').value = p >= 0 ? String(p) : '';
  if (push) {
    const u = new URL(location.href); u.searchParams.set('href', href);
    if (u.href !== location.href) history.pushState({ href }, '', u);
  }
  setStatus('Loading catalog...');
  try {
    const resp = await fetch(href, { cache: 'no-cache' });  // revalidate: catalogs are replaced in place
    if (!resp.ok) throw new Error(`HTTP ${resp.status} reading ${href}`);
    const rows = await parquetReadObjects({ file: await resp.arrayBuffer(), compressors });
    items = rows.map(toItem).sort((a, b) => a.start - b.start);
  } catch (e) {
    setStatus(`Could not load catalog: ${e.message}. If Kopah is in its maintenance window (below), try again later.`, true); return;
  }
  const codes = [...new Set(items.map(i => i.epsg).filter(Boolean))];
  const code = codes.length ? `EPSG:${codes[0]}` : 'EPSG:3857';
  setView(ol.proj.get(code) ? code : 'EPSG:3857');
  if (p < 0 && code in projDefs) {
    // A custom catalog sets the hemisphere from its own projection.
    setHemi(code === 'EPSG:3031' ? 'S' : 'N');
    $('preset').value = '';
  }
  footSource.clear();
  for (const it of items) {
    const useNative = it.geom && it.epsg && `EPSG:${it.epsg}` === viewCode;
    const f = new ol.format.GeoJSON().readFeature({ type: 'Feature', geometry: useNative ? it.geom : it.geom4326 },
      { dataProjection: useNative ? viewCode : 'EPSG:4326', featureProjection: viewCode });
    f.set('item', it); it.feature = f;
  }
  dates = [...new Set(items.map(i => +i.start))].sort((a, b) => a - b);
  buildTimebar();
  // Cropping only makes sense for large products (mosaics); small site products such as the TSX
  // glacier boxes (median footprint under 100 km across) are downloaded whole.
  const spans = items.map(i => { const e = i.feature.getGeometry().getExtent(); return Math.max(e[2] - e[0], e[3] - e[1]); })
                     .sort((a, b) => a - b);
  const cropAllowed = spans.length > 0 && spans[Math.floor(spans.length / 2)] > 100e3;
  $('cropRow').hidden = !cropAllowed;
  siteMode = !cropAllowed;
  $('pickBlock').hidden = !siteMode;
  $('dlTitle').textContent = siteMode ? 'Download sites' : 'Download';
  if (!cropAllowed && $('cropOn').checked) { $('cropOn').checked = false; $('cropOn').dispatchEvent(new Event('change')); }
  const name = href.split('/').pop();
  $('title').firstChild.textContent = name;
  setStatus(`${items.length} items, ${code}${codes.length > 1 ? ` (catalog mixes ${codes.join(', ')}; showing first)` : ''}`);
  selected = null; rasterLayer.setSource(null); $('legend').hidden = true;
  $('asset').replaceChildren();
  // Points carry over to a catalog in the same projection; the old catalog's series stay on the plot.
  const carry = tsPoints.length && prevCode === viewCode ? snapshotTsPoints(prevName) : null;
  stopDraw(); boxSource.clear(); cropBox = null; areaSource.clear(); areaBox = null; picks.clear(); saCache = null; clearStaticAnom(); clearTsPoints(); updateCropInfo();
  // The profile line and its curves carry over too, so the new catalog's product adds its curve.
  if (prevCode !== viewCode) clearProfile();
  // Keep the current view when the new catalog is in the same projection and its extent is in view, so
  // switching collections compares the same place; otherwise fit the map to the new catalog.
  const all = new ol.source.Vector({ features: items.map(i => i.feature) });
  const keepView = prevCode === viewCode && items.length > 0 &&
                   ol.extent.intersects(map.getView().calculateExtent(map.getSize()), all.getExtent());
  const sv = startView; startView = null;
  if (sv?.t0 && sv.t1) {
    const k0 = dates.findIndex(d => fmtDate(new Date(d)) >= sv.t0), k1 = dates.findLastIndex(d => fmtDate(new Date(d)) <= sv.t1);
    if (k0 >= 0 && k1 >= k0) { i0 = k0; i1 = k1; }
  }
  applyFilter(!keepView && !sv?.center);
  if (sv?.center) { map.getView().setCenter(sv.center); if (sv.zoom) map.getView().setZoom(sv.zoom); }
  // Open on the newest item so a catalog shows data straight away, as stac-map does on a click.
  const want = sv?.item && items.find(i => i.id === sv.item);
  if (items.length) select(want || items[items.length - 1]);
  if (siteMode && items.length && !want) setStatus($('status').textContent + siteHint);
  if (carry) restoreTsPoints(carry);
  if (sv?.pts.length) { for (const c of sv.pts) addTsPoint(c, '', false); refreshTs(); }
  if (sv?.pf.length === 2 || sv?.flow) $('pfSec').open = true;
  if (sv?.pf.length === 2) newProfile(sv.pf);
  else if (sv?.flow) newFlowProfile(sv.flow, sv.flen || undefined, true);
  if (sv?.area && !siteMode) { areaBox = sv.area; areaSource.addFeature(new ol.Feature(ol.geom.Polygon.fromExtent(areaBox))); areaChanged(); }
  if (sv?.anim) {
    $('animSec').open = true; $('animNote').textContent = 'Shared animation: click Load frames to build it.';
    $('animSec').scrollIntoView({ block: 'start' }); animScrollPending = true;
  }
}

// Time range: indices into the sorted unique start dates.
let i0 = 0, i1 = 0;
const datePos = t => {
  const span = dates[dates.length - 1] - dates[0];
  return span ? 100 * (1 - (t - dates[0]) / span) : 50;
};

function buildTimebar() {
  i0 = 0; i1 = Math.max(dates.length - 1, 0);
  $('timebar').hidden = dates.length < 2;
  $('tticks').replaceChildren(...dates.map((t, k) => {
    const d = document.createElement('div');
    d.className = 'tick'; d.style.top = `${datePos(t)}%`; d.title = fmtDate(new Date(t));
    d.onclick = () => {
      // Ticks pick the focus date; the handles set the range. A tick outside the range widens the
      // range just enough to include it.
      if (k < i0 || k > i1) { i0 = Math.min(i0, k); i1 = Math.max(i1, k); applyFilter(); }
      const here = timeSeries().filter(i => +i.start === t);  // same place as the current image
      const hit = here.length ? here : items.filter(i => +i.start === t);
      if (hit.length) select(hit[hit.length - 1]);
    };
    return d;
  }));
}

function drawTimebar() {
  const p0 = datePos(dates[i0]), p1 = datePos(dates[i1]);
  $('th0').style.top = `${p0}%`; $('th1').style.top = `${p1}%`;
  $('trange').style.top = `${p1}%`; $('trange').style.height = `${p0 - p1}%`;
  $('th0').querySelector('span').textContent = fmtDate(new Date(dates[i0]));
  $('th1').querySelector('span').textContent = fmtDate(new Date(dates[i1]));
  $('th0').querySelector('span').hidden = i0 === i1;
  $('th0').setAttribute('aria-valuetext', fmtDate(new Date(dates[i0])));
  $('th1').setAttribute('aria-valuetext', fmtDate(new Date(dates[i1])));
  [...$('tticks').children].forEach((d, k) => {
    d.classList.toggle('on', k >= i0 && k <= i1);
    d.classList.toggle('cur', (animDate ?? (selected ? +selected.start : null)) === dates[k]);
  });
  fitTimebar();
}

// Fit the bar, and the faint box behind it, to its date labels in whatever font they come out in.
function fitTimebar() {
  const w = Math.max(...['th0', 'th1'].map(id => { const s = $(id).querySelector('span'); return s.offsetLeft + s.offsetWidth; }));
  if (w > 0) $('timebar').style.width = `${w + 2}px`;  // + the thumb border, for the box's 8 px margin both sides
}
document.fonts?.ready.then(fitTimebar);

function nearestDate(clientY) {
  const r = $('ttrack').getBoundingClientRect();
  const f = 1 - Math.min(1, Math.max(0, (clientY - r.top) / r.height));
  const t = dates[0] + f * (dates[dates.length - 1] - dates[0]);
  let best = 0;
  dates.forEach((d, k) => { if (Math.abs(d - t) < Math.abs(dates[best] - t)) best = k; });
  return best;
}

for (const [id, which] of [['th0', 0], ['th1', 1]]) {
  const th = $(id);
  const set = k => {
    if (which === 0) i0 = Math.min(k, i1); else i1 = Math.max(k, i0);
    applyFilter();
  };
  th.onpointerdown = e => { th.setPointerCapture(e.pointerId); th.style.cursor = 'grabbing'; };
  th.onpointermove = e => { if (th.hasPointerCapture(e.pointerId)) set(nearestDate(e.clientY)); };
  th.onpointerup = e => { th.releasePointerCapture(e.pointerId); th.style.cursor = ''; };
  th.onkeydown = e => {
    const step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    set(Math.min(dates.length - 1, Math.max(0, (which === 0 ? i0 : i1) + step)));
  };
}
$('treset').onclick = () => { i0 = 0; i1 = dates.length - 1; applyFilter(); };

function inRange() {
  if (!dates.length) return [];
  const lo = dates[i0], hi = dates[i1];
  return items.filter(i => +i.start >= lo && +i.start <= hi);
}

function fitFootprints(duration = 0) {
  if (footSource.getFeatures().length) map.getView().fit(footSource.getExtent(), { padding: [40, 40, 40, 40], maxZoom: 8, duration });
}
function applyFilter(fit = false) {
  const shown = inRange();
  if (dates.length) drawTimebar();
  footSource.clear(); footSource.addFeatures(shown.map(i => i.feature));
  $('count').textContent = `${shown.length} of ${items.length} items`;
  const ul = $('items'); ul.replaceChildren();
  for (const it of shown) {
    const li = document.createElement('li'); li.tabIndex = 0;
    li.innerHTML = `<input type="checkbox"><span class="id"></span><span class="when"></span>`;
    li.querySelector('.id').textContent = it.id;
    li.querySelector('.when').textContent = `${fmtDate(it.start)} to ${fmtDate(it.end)}`;
    const box = li.querySelector('input');
    box.checked = picks.has(it); box.setAttribute('aria-label', `Pick ${it.id} for download`);
    box.title = 'Pick for download (Shift-click its box on the map does the same)';
    li.title = 'Click to show this item';
    box.onclick = e => { e.stopPropagation(); togglePick(it, box.checked); };
    li.classList.toggle('picked', picks.has(it));
    if (it === selected) li.classList.add('sel');
    li.onclick = () => select(it, true);
    li.onkeydown = e => { if (e.key === 'Enter') select(it, true); };
    it.li = li; ul.append(li);
  }
  if (fit) fitFootprints();
  updateDownloadButtons();
  if (frames.length) resetAnimation('The time range changed; load the frames again.');
  else refreshAnimInfo();
}

function togglePick(it, on = !picks.has(it)) {
  if (on) picks.add(it); else picks.delete(it);
  if (it.li) { it.li.classList.toggle('picked', on); it.li.querySelector('input').checked = on; }
  footLayer.changed();
  updateDownloadButtons();
}

function pickAsset(it) {
  const keys = tiffAssetKeys(it);
  const prev = $('asset').value;
  $('asset').replaceChildren(...keys.map(k => new Option(it.assets[k].title || k, k)));
  // A link can choose the starting asset with &asset=<name>; it applies to the first item shown.
  const wanted = startAsset && keys.includes(startAsset) ? startAsset : null;
  startAsset = null;
  $('asset').value = wanted || (keys.includes(prev) ? prev : (['image', 'vv', 'gamma0'].find(k => keys.includes(k)) || keys[0] || ''));
  return $('asset').value;
}

const phoneLayout = matchMedia('(max-width: 760px)');
function select(it, zoom = false) {
  if (selected && it !== selected) clearSiteHint();
  selected = it;
  for (const li of $('items').children) li.classList.remove('sel');
  it.li?.classList.add('sel');
  // On phones the whole panel scrolls, so scroll only the list there; otherwise the panel would open part way down.
  if (it.li && phoneLayout.matches) {
    const ul = $('items'), top = it.li.offsetTop - ul.offsetTop;
    if (top < ul.scrollTop || top + it.li.offsetHeight > ul.scrollTop + ul.clientHeight) ul.scrollTop = top;
  } else it.li?.scrollIntoView({ block: 'nearest' });
  footLayer.changed();
  if (dates.length) drawTimebar();
  if (zoom) map.getView().fit(it.feature.getGeometry().getExtent(), { padding: [40, 40, 40, 40], duration: 250 });
  showAsset(pickAsset(it));
  fillCropAssets(it);
  nsidcFor(it);
  if (tsPlotInfo && !$('tsPlot').hidden) drawTsPlot();  // move the plot's date marker
}

