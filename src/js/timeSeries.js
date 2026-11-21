// Time series at points: click points on the map; each is read at full resolution from every date
// of the displayed item's time series (one-pixel reads, like the hover readout) and plotted against
// date. Velocity gets error bars from the ex/ey assets. Points, plot and values can be saved.
const tsColors = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#9a6324'];
const tsSource = new ol.source.Vector();
map.addLayer(new ol.layer.Vector({ source: tsSource, zIndex: 6, style: f => new ol.style.Style({
  image: new ol.style.Circle({ radius: 7, fill: new ol.style.Fill({ color: f.get('color') + (f.get('off') ? '59' : '') }),  // faded while hidden
    stroke: new ol.style.Stroke({ color: f.get('off') ? '#ffffff88' : '#ffffff', width: 2 }) }),
  text: new ol.style.Text({ text: String(f.get('n')), offsetY: -15, font: '700 12px sans-serif',
    fill: new ol.style.Fill({ color: '#ffffff' }), stroke: new ol.style.Stroke({ color: '#000000', width: 3 }) }) }) }));
let tsPoints = [], tsMode = false, tsToken = 0, tsKey = '', tsNext = 1;
const tsLayerOff = new Set();  // catalogs whose series are hidden on the plot (by name)
const tsCache = new Map();  // `${x},${y}|${href}` -> value in physical units (NaN = no data)

function tsSeries() { return timeSeries(!$('tsRange').checked, plotAsset()); }
// Site collections: each point reads every product whose box contains it, so points can be at different
// sites; mosaics read the series of the product shown.
function pointSeries(p, series) {
  if (!siteMode) return series;
  const key = plotAsset();
  return ($('tsRange').checked ? inRange() : items).filter(it => it.assets[key] && it.feature.getGeometry().intersectsCoordinate(p.coord))
    .sort((a, b) => a.start - b.start);
}
const tsKeyOf = (key, per) => [key, per.map(s => s.map(i => i.id).join(';')).join('/'), $('tsErr').checked, tsPoints.map(p => p.n).join(',')].join('|');
// Site collections: unless the shown product has data at one of the points, show the newest product in
// the time range with data at the first point that has one, so the orange box is the site the points and
// animation use. Overlapping boxes often leave a point in another frame's permanent no-data area, so the
// pixel is read (into the point cache) rather than trusting the footprint.
async function selectSiteAt(coords) {
  if (!siteMode || !selected) return;
  const key = plotAsset(), start = selected, has = async (it, c) => Number.isFinite(await pointValue(it, key, c));
  const inside = (it, c) => it.feature.getGeometry().intersectsCoordinate(c);
  try {
    for (const c of coords) if (inside(selected, c) && await has(selected, c)) return;
    for (const c of coords) {
      const hits = inRange().filter(it => it.assets[key] && inside(it, c)).sort((a, b) => b.start - a.start);
      if (!hits.length) continue;
      let pick = hits.find(it => it === selected) || hits[0];
      for (const it of hits.slice(0, 30)) if (await has(it, c)) { pick = it; break; }
      if (selected === start && pick !== selected) select(pick);
      return;
    }
  } catch (e) { /* a failed read leaves the shown product; the series reports its own errors */ }
}
function tsHasErrors(key, series) {
  const need = key === 'vx' ? ['ex'] : key === 'vy' ? ['ey'] : key === 'vv' ? ['vx', 'vy', 'ex', 'ey'] : null;
  return !!need && series.some(it => need.every(k => it.assets[k]));
}

function refreshTs() {
  const series = selected && plotAsset() ? tsSeries() : [];
  const ok = series.length >= 2 || (siteMode && selected && plotAsset() && items.length >= 2);
  $('tsSec').hidden = !ok;
  if (!ok) { $('tsPlot').hidden = true; return; }
  $('tsCount').textContent = tsPoints.length ? `(${tsPoints.length} point${tsPoints.length > 1 ? 's' : ''})` : '';
  const per = tsPoints.map(p => pointSeries(p, series));
  $('tsErrRow').hidden = !tsHasErrors(plotAsset(), siteMode ? [...series, ...per.flat()] : series);
  $('tsItsRow').hidden = !(plotAsset() in itsVars);
  if (!tsPoints.length) return;
  const key = tsKeyOf(plotAsset(), per);
  if (key !== tsKey) computeTs(); else if (tsPlotInfo && !$('tsPlot').hidden) drawTsPlot();
  refreshIts();
}

async function pointValue(it, key, coord) {
  const a = it.assets[key];
  if (!a) return NaN;
  const ck = `${coord[0]},${coord[1]}|${a.href}`;
  if (tsCache.has(ck)) return tsCache.get(ck);
  const b = a['raster:bands']?.[0] || {};
  const { levels: lv, origin: org } = await assetLevels(a.href);
  const img = lv[0].img, r = lv[0].res;
  const col = Math.floor((coord[0] - org[0]) / r), row = Math.floor((org[1] - coord[1]) / r);
  let v = NaN;
  if (col >= 0 && row >= 0 && col < img.getWidth() && row < img.getHeight()) {
    const raw = (await img.readRasters({ window: [col, row, col + 1, row + 1], samples: [0] }))[0][0];
    if (raw !== b.nodata && Number.isFinite(raw)) v = raw * (b.scale ?? 1) + (b.offset ?? 0);
  }
  tsCache.set(ck, v);
  return v;
}
async function pointError(it, key, coord) {
  if (key === 'vx' || key === 'vy') return pointValue(it, key === 'vx' ? 'ex' : 'ey', coord);
  if (key === 'vv') {
    // Speed error from the component errors: sigma_v = sqrt((vx ex)^2 + (vy ey)^2) / v.
    const [vx, vy, ex, ey] = await Promise.all(['vx', 'vy', 'ex', 'ey'].map(k => pointValue(it, k, coord)));
    const v = Math.hypot(vx, vy);
    return v > 0 ? Math.hypot(vx * ex, vy * ey) / v : NaN;
  }
  return NaN;
}
async function runPool(tasks, n, onDone = null) {
  // Run async tasks with at most n in flight; results keep the task order. onDone(k, result, count) after each.
  const out = new Array(tasks.length);
  let next = 0, count = 0;
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, async () => {
    while (next < tasks.length) { const k = next++; out[k] = await tasks[k](); onDone?.(k, out[k], ++count); }
  }));
  return out;
}
const fmtSecs = s => s < 60 ? `${Math.ceil(s)} s` : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s`;

// ITS_LIVE image-pair velocities at the same points (public its-live-data datacubes, CORS open),
// drawn as a light grey cloud behind the GrIMP series for comparison. A cube is chosen in the map's
// projection, so vx/vy are the same components; the cube catalog (7.6 MB) is fetched once.
const itsCatalogUrl = 'https://its-live-data.s3.amazonaws.com/datacubes/catalog_v02.json';
const itsVars = { vv: 'v', vx: 'vx', vy: 'vy' };
let itsCatalog = null;
const itsCache = new Map();  // `${x},${y}|${var}` -> promise of [{ t, v, dt }] or null (no cube)
async function itsCubeUrl(coord) {
  itsCatalog ??= fetch(itsCatalogUrl).then(r => { if (!r.ok) throw new Error(`ITS_LIVE catalog: HTTP ${r.status}`); return r.json(); })
    .then(c => c.features.map(f => f.properties).filter(q => q.datacube_exist))
    .catch(e => { itsCatalog = null; throw e; });
  const epsg = +viewCode.split(':')[1];
  for (const q of await itsCatalog) {
    if (q.epsg !== epsg) continue;
    const ring = q.geometry_epsg.coordinates[0], xs = ring.map(c => c[0]), ys = ring.map(c => c[1]);
    if (coord[0] >= Math.min(...xs) && coord[0] < Math.max(...xs) && coord[1] >= Math.min(...ys) && coord[1] < Math.max(...ys)) return q.zarr_url;
  }
  return null;
}
function itsSeries(coord, key) {
  const ck = `${coord[0]},${coord[1]}|${itsVars[key]}`;
  if (!itsCache.has(ck)) itsCache.set(ck, (async () => {
    const url = await itsCubeUrl(coord);
    if (!url) return null;
    const zarr = await import('https://cdn.jsdelivr.net/npm/zarrita@0.7.5/+esm');
    const root = zarr.root(new zarr.FetchStore(url));
    const read = async (n, sel) => (await zarr.get(await zarr.open.v2(root.resolve(n), { kind: 'array', attrs: false }), sel)).data;
    const [x, y] = await Promise.all([read('x'), read('y')]);
    const ix = Math.round((coord[0] - x[0]) / (x[1] - x[0])), iy = Math.round((coord[1] - y[0]) / (y[1] - y[0]));
    if (ix < 0 || iy < 0 || ix >= x.length || iy >= y.length) return null;
    const [v, md, dt] = await Promise.all([read(itsVars[key], [null, iy, ix]), read('mid_date'), read('date_dt')]);
    const out = [];
    for (let i = 0; i < v.length; i++) if (v[i] !== -32767 && Number.isFinite(md[i])) out.push({ t: md[i] * 86400e3, v: v[i], dt: dt[i] });
    return out;
  })().catch(e => { itsCache.delete(ck); throw e; }));
  return itsCache.get(ck);
}
function refreshIts() {
  const key = plotAsset(), on = $('tsIts').checked && key in itsVars;
  $('tsItsRow').hidden = !(key in itsVars);
  if (!on || !tsPoints.length) { $('tsItsNote').textContent = ''; if (tsPlotInfo) drawTsPlot(); return; }
  $('tsItsNote').textContent = 'ITS_LIVE: reading...';
  Promise.allSettled(tsPoints.map(async p => {
    p.its = await itsSeries(p.coord, key); p.itsKey = key;
    if (tsPlotInfo) drawTsPlot();
  })).then(rs => {
    if (!$('tsIts').checked || plotAsset() !== key) return;
    const failed = rs.find(r => r.status === 'rejected'), maxDt = +$('tsItsDt').value;
    const n = tsPoints.reduce((a, p) => a + (p.itsKey === key && p.its ? p.its.filter(q => q.dt <= maxDt).length : 0), 0);
    const none = tsPoints.filter(p => !p.its).map(p => p.n);
    $('tsItsNote').textContent = failed ? `ITS_LIVE: could not read (${failed.reason.message})`
      : `ITS_LIVE: ${n} image pairs` + (none.length ? `; no cube at point ${none.join(', ')}` : '') + '.';
  });
}

async function computeTs() {
  const key = plotAsset(), token = ++tsToken, per = tsPoints.map(p => pointSeries(p, tsSeries()));
  const series = [...new Set(per.flat())].sort((a, b) => a.start - b.start);
  const withErr = $('tsErr').checked && tsHasErrors(key, series);
  tsKey = tsKeyOf(key, per);
  const total = per.reduce((n, s) => n + s.length, 0);
  $('tsNote').textContent = `Reading ${total} values...`;
  $('tsCsv').disabled = true; $('tsPng').disabled = true;
  $('tsProg').hidden = false; $('tsProg').value = 0;
  const band0 = selected.assets[key]?.['raster:bands']?.[0] || {};
  if (tsPlotInfo?.key !== key) tsYTyped = null;
  tsPlotInfo = { key, unit: band0.unit || '', withErr, n: series.length, times: series.map(it => (+it.start + +it.end) / 2), name: tsCollectionName() };
  $('tsYRow').hidden = false;
  for (const p of tsPoints) p.values = [];
  setTsPlot(true);
  drawTsPlot();
  const t0 = performance.now();
  // Progress and the plot update as values arrive (redrawn at most every 0.3 s); values already in
  // the cache count as done at once, so the time estimate uses the uncached reads only.
  const got = new Array(total);
  let lastDraw = 0, fresh = 0, freshAt = 0;
  const progress = (k, r, count) => {
    if (token !== tsToken) return;
    got[k] = r;
    if (r.fresh) { fresh++; freshAt = performance.now(); }
    const now = performance.now();
    if (count < total && now - lastDraw < 300) return;
    lastDraw = now;
    $('tsProg').value = count / total;
    const left = fresh ? (freshAt - t0) / fresh * (total - count) / 1000 : NaN;
    $('tsNote').textContent = `Reading values: ${count} of ${total} (${Math.round(100 * count / total)}%)`
      + (count < total && Number.isFinite(left) ? `, about ${fmtSecs(left)} left` : '');
    for (const p of tsPoints) p.values = got.filter(x => x && x.p === p).map(({ it, v, e }) => ({ it, v, e }));
    drawTsPlot();
  };
  try {
    const tasks = tsPoints.flatMap((p, k) => per[k].map(it => async () => {
      const fresh = !tsCache.has(`${p.coord[0]},${p.coord[1]}|${it.assets[key]?.href}`);
      return { p, it, fresh, v: await pointValue(it, key, p.coord), e: withErr ? await pointError(it, key, p.coord) : NaN };
    }));
    const res = await runPool(tasks, 6, progress);
    if (token !== tsToken) return;
    $('tsProg').hidden = true;
    for (const p of tsPoints) p.values = res.filter(r => r.p === p).map(({ it, v, e }) => ({ it, v, e }));
    drawTsPlot();
    const outside = tsPoints.filter((p, k) => !per[k].length).map(p => p.n);
    const empty = tsPoints.filter((p, k) => per[k].length && p.values.every(x => Number.isNaN(x.v))).map(p => p.n);
    $('tsNote').textContent = `${tsPoints.length} point${tsPoints.length > 1 ? 's' : ''} x ${series.length} dates in `
      + `${((performance.now() - t0) / 1000).toFixed(1)} s.` + (empty.length ? ` No data at point ${empty.join(', ')}.` : '')
      + (outside.length ? ` Point${outside.length > 1 ? 's' : ''} ${outside.join(', ')} ${outside.length > 1 ? 'are' : 'is'} not inside any site box in the time range.` : '');
    $('tsCsv').disabled = false; $('tsPng').disabled = false;
  } catch (e) {
    if (token === tsToken) { $('tsProg').hidden = true; $('tsNote').textContent = `Could not read the values: ${e.message}`; }
  }
}

