// Profile along a line: two clicks draw the line (A to B), and the shown product is sampled along it at
// the resolution level nearest 1/1000 of the line length (never finer than the full image). Each product
// shown while the line is up adds its curve (another date, or another catalog in the same projection);
// a new line or another asset starts a new plot. A flow line instead follows the ice flow up and down
// stream from a clicked point, traced once on the newest annual velocity mosaic; its two-handle slider
// trims the traced path, and the products on the plot are read again along the trimmed part. ITS_LIVE image pairs whose time span includes the shown
// product's central date are drawn in grey, sampled every 120 m (the datacube pixel); of each datacube
// chunk the line crosses, only the time chunks holding such pairs are read. For an annual product the
// ITS_LIVE annual mosaic of the calendar year holding its central date is drawn instead (dashed grey).
const pfSource = new ol.source.Vector();
map.addLayer(new ol.layer.Vector({ source: pfSource, zIndex: 6, style: f => {
  if (f.getGeometry().getType() === 'Point') return new ol.style.Style({ image: new ol.style.Circle({ radius: 6,
    fill: new ol.style.Fill({ color: '#ffffff' }), stroke: new ol.style.Stroke({ color: '#ff3ea5', width: 3 }) }) });
  const c = f.getGeometry().getCoordinates();
  const end = (k, text) => new ol.style.Style({ geometry: new ol.geom.Point(c[k]),
    image: new ol.style.Circle({ radius: 5, fill: new ol.style.Fill({ color: '#ff3ea5' }), stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 }) }),
    text: new ol.style.Text({ text, offsetY: -14, font: '700 12px sans-serif',
      fill: new ol.style.Fill({ color: '#ffffff' }), stroke: new ol.style.Stroke({ color: '#000000', width: 3 }) }) });
  return [new ol.style.Style({ stroke: new ol.style.Stroke({ color: '#ffffff', width: 5 }) }),
          new ol.style.Style({ stroke: new ol.style.Stroke({ color: '#ff3ea5', width: 2.5 }) }), end(0, 'A'), end(c.length - 1, 'B')];
} }));
let pfLine = null, pfKey = null, pfCurves = [], pfIts = null, pfToken = 0, pfItsToken = 0, pfDrawnAt = -Infinity;
let pfCum = null, pfOff = 0, pfFlow = null;  // cumulative m along pfLine; plotted distance of its start; flow trace
const pfAx = { x: { typed: null, span: null, pos: [0, 1] }, y: { typed: null, span: null, pos: [0, 1] } };  // plot ranges
let pfPoint = null, pfAdjust = null, pfWant = [0, 0];  // flow point feature; its drag interaction; lengths asked for (m)
const pfItsStep = 120;  // m between ITS_LIVE pair samples
const itsAnnualRegion = { 3413: 'RGI05A', 3031: 'RGI19A' };  // ITS_LIVE annual mosaic region per projection
const pfAnnual = it => { const days = (it.end - it.start) / 86400e3; return days > 350 && days < 380; };
const cumDist = path => path.reduce((c, p, i) => (c.push(i ? c[i - 1] + Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) : 0), c), []);
function alongPath(path, cum, d) {  // the point d metres along a polyline
  let lo = 1, hi = path.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < d) lo = m + 1; else hi = m; }
  const f = Math.min(1, Math.max(0, (d - cum[lo - 1]) / ((cum[lo] - cum[lo - 1]) || 1))), a = path[lo - 1], b = path[lo];
  return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])];
}
const pfLen = () => pfCum[pfCum.length - 1];
const pfAt = d => alongPath(pfLine, pfCum, d);

function clearProfile() {
  ++pfToken; ++pfItsToken;
  pfLine = null; pfKey = null; pfCurves = []; pfIts = null; pfFlow = null; pfOff = 0; pfPoint = null;
  pfAx.x.typed = pfAx.y.typed = null; $('pfAxRow').hidden = true;
  if (pfAdjust) { map.removeInteraction(pfAdjust); pfAdjust = null; }
  pfSource.clear(); itsPixCache.clear();
  $('pfPlot').hidden = true; $('pfShow').hidden = true; $('pfClear').hidden = true; $('pfProg').hidden = true; $('pfFlowRow').hidden = $('pfAccept').hidden = true;
  $('pfCsv').disabled = true; $('pfPng').disabled = true;
  $('pfNote').textContent = ''; $('pfItsNote').textContent = ''; $('pfCount').textContent = '';
}
// (Re)start the plot on a line; the products already on the plot are read again along it.
function setProfileLine(line, off) {
  ++pfToken; ++pfItsToken;
  const shown = pfCurves.map(c => [c.it, c.off]);
  pfLine = line; pfCum = cumDist(line); pfOff = off; pfCurves = []; pfIts = null; pfAx.x.typed = null;
  pfSource.clear(); pfSource.addFeature(new ol.Feature(new ol.geom.LineString(line)));
  if (pfPoint) pfSource.addFeature(pfPoint);
  $('pfClear').hidden = false;
  for (const [it, off] of shown) { addProfileCurve(it, pfKey); if (off) pfCurves.find(c => c.it === it).off = true; }
  if (selected && plotAsset()) pfOnShown(plotAsset());
}
function newProfile(line) {
  clearProfile();
  setProfileLine(line, 0);
}

// Flow lines are traced on the newest annual velocity mosaic in the map's projection (GrIMP Greenland,
// or the Amundsen Sea mosaic in Antarctica), whatever product is shown. Where there is none, or it has no
// flow at the point, the loaded catalog's velocity product with the longest averaging period is used.
const pfFlowCatalogs = { 'EPSG:3413': 'https://s3.kopah.uw.edu/ianj-grimp/public/nsidc-0725/v06/nsidc-0725.parquet',
                         'EPSG:3031': 'https://s3.kopah.uw.edu/ianj-grimp/public/pig/annual/ase-annual.parquet' };
const pfFlowMax = 150e3, pfFlowStart = 25e3;  // m traced each way from the point; m shown each way at first
const pfFlowItems = new Map();  // catalog href -> promise of its newest item with vx and vy
function flowItem(href) {
  if (!pfFlowItems.has(href)) pfFlowItems.set(href, (async () => {
    const resp = await fetch(href, { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} reading the annual velocity catalog`);
    const its = (await parquetReadObjects({ file: await resp.arrayBuffer(), compressors })).map(toItem).filter(it => it.assets.vx && it.assets.vy);
    if (!its.length) throw new Error('the annual velocity catalog has no vx/vy');
    return its.sort((a, b) => b.start - a.start)[0];
  })().catch(e => { pfFlowItems.delete(href); throw e; }));
  return pfFlowItems.get(href);
}
async function traceFlow(p0) {
  // The first candidate mosaic with flow at the point, or null.
  const href = pfFlowCatalogs[viewCode], cands = [];
  if (href) cands.push(await flowItem(href).catch(() => null));
  const covers = it => !it.feature || it.feature.getGeometry().intersectsCoordinate(p0);
  cands.push(...items.filter(it => it.assets.vx && it.assets.vy && (!it.epsg || `EPSG:${it.epsg}` === viewCode) && covers(it))
    .sort((a, b) => (b.end - b.start) - (a.end - a.start) || b.start - a.start).slice(0, 3));
  const seen = new Set();
  let err = null;
  for (const it of cands) {
    if (!it || seen.has(it.assets.vx.href)) continue;
    seen.add(it.assets.vx.href);
    try { const f = await traceOn(it, p0); if (f.up || f.down) return f; } catch (e) { err = e; }
  }
  if (err) throw err;
  return null;
}
async function traceOn(it, p0) {
  // { path (upstream end first), cum, up, down (m traced each way), p0, it (the mosaic traced on) }
  const comps = await Promise.all(['vx', 'vy'].map(async k => ({ ...(await assetLevels(it.assets[k].href)), nodata: it.assets[k]['raster:bands']?.[0]?.nodata })));
  const org = comps[0].origin, r = comps[0].levels[0].res, W = comps[0].levels[0].img.getWidth(), H = comps[0].levels[0].img.getHeight(), T = 256;
  const tiles = new Map();  // full-resolution 256 x 256 tiles of vx and vy, read as the trace reaches them
  const tile = (tx, ty) => {
    const k = `${tx},${ty}`;
    if (!tiles.has(k)) tiles.set(k, Promise.all(comps.map(c => c.levels[0].img.readRasters({
      window: [tx * T, ty * T, Math.min(W, tx * T + T), Math.min(H, ty * T + T)], samples: [0] }).then(a => a[0]))));
    return tiles.get(k);
  };
  const pix = async (i, j) => {
    if (i < 0 || j < 0 || i >= W || j >= H) return null;
    const tx = Math.floor(i / T), ty = Math.floor(j / T), w = Math.min(W, tx * T + T) - tx * T, t = await tile(tx, ty), o = (j - ty * T) * w + i - tx * T;
    const v = t.map((a, n) => a[o] === comps[n].nodata || !Number.isFinite(a[o]) ? NaN : a[o]);
    return v.some(Number.isNaN) ? null : v;
  };
  const vel = async ([x, y]) => {  // bilinear vx, vy between pixel centres; null where any is missing
    const fx = (x - org[0]) / r - 0.5, fy = (org[1] - y) / r - 0.5, i = Math.floor(fx), j = Math.floor(fy), a = fx - i, b = fy - j;
    const q = await Promise.all([pix(i, j), pix(i + 1, j), pix(i, j + 1), pix(i + 1, j + 1)]);
    if (q.some(v => !v)) return null;
    return [0, 1].map(n => (1 - b) * ((1 - a) * q[0][n] + a * q[1][n]) + b * ((1 - a) * q[2][n] + a * q[3][n]));
  };
  const walk = async sign => {
    // Midpoint steps of one pixel along the flow direction (sign -1: upstream); stops where the data end,
    // the ice is nearly still (< 1 m/yr) or the direction turns back.
    const pts = [], dir = v => { const sp = v && Math.hypot(v[0], v[1]); return sp >= 1 ? [sign * v[0] / sp, sign * v[1] / sp] : null; };
    let p = p0, prev = null;
    while (pts.length * r < pfFlowMax) {
      const d1 = dir(await vel(p));
      if (!d1) break;
      const d2 = dir(await vel([p[0] + d1[0] * r / 2, p[1] + d1[1] * r / 2]));
      if (!d2 || (prev && d2[0] * prev[0] + d2[1] * prev[1] < 0)) break;
      p = [p[0] + d2[0] * r, p[1] + d2[1] * r]; pts.push(p); prev = d2;
    }
    return pts;
  };
  const up = await walk(-1), down = await walk(1), path = [...up.reverse(), p0, ...down];
  return { path, cum: cumDist(path), up: up.length * r, down: down.length * r, p0, it };
}
function flowTrim(lo, hi) {  // the traced path from lo to hi m (lo <= 0 <= hi) about the point
  const { path, cum, up } = pfFlow, s0 = up + lo, s1 = up + hi;
  return [alongPath(path, cum, s0), ...path.filter((p, i) => cum[i] > s0 && cum[i] < s1), alongPath(path, cum, s1)];
}
function flowSlider() {  // the slider's fill, zero mark and text from its two handles
  const lo = +$('pfLo').value, hi = +$('pfHi').value, a = +$('pfLo').min, b = +$('pfLo').max, pos = v => (b > a ? (v - a) / (b - a) : 0.5);
  const at = f => `calc(8px + ${f} * (100% - 16px))`;
  $('pfFill').style.left = at(pos(lo)); $('pfFill').style.width = `calc(${pos(hi) - pos(lo)} * (100% - 16px))`;
  $('pfZero').style.left = at(pos(0));
  $('pfFlowText').textContent = `${(-lo).toFixed(1)} km upstream (traced ${(pfFlow.up / 1000).toFixed(1)}), ${hi.toFixed(1)} km downstream `
    + `(traced ${(pfFlow.down / 1000).toFixed(1)}); flow from ${pfFlow.it.id}.`;
}
// A new flow point starts in adjust mode: the point can be dragged and the line is traced again as it
// moves (map only, nothing read) until 'Use this line' reads the products along it.
const pfLineFeature = () => pfSource.getFeatures().find(f => f.getGeometry().getType() === 'LineString');
function newFlowProfile(p0) {
  clearProfile();
  pfPoint = new ol.Feature(new ol.geom.Point(p0)); pfWant = [-pfFlowStart, pfFlowStart];
  pfSource.addFeature(new ol.Feature(new ol.geom.LineString([p0, p0]))); pfSource.addFeature(pfPoint);
  $('pfClear').hidden = false;
  setAdjust(true);
  retrace();
}
function setAdjust(on) {
  if (on && !pfAdjust) {
    pfAdjust = new ol.interaction.Translate({ features: new ol.Collection([pfPoint]), hitTolerance: 8 });
    pfAdjust.on(['translating', 'translateend'], () => retrace());
    map.addInteraction(pfAdjust);
  } else if (!on && pfAdjust) { map.removeInteraction(pfAdjust); pfAdjust = null; }
  $('pfAccept').textContent = on ? 'Use this line' : 'Adjust point';
  $('pfAccept').disabled = on && !pfFlow;
}
let pfTracing = false, pfTraceAgain = false;
async function retrace() {
  // Trace from where the point is now; a move during a trace traces once more when it finishes.
  if (pfTracing) { pfTraceAgain = true; return; }
  pfTracing = true;
  const token = pfToken;
  try {
    do {
      pfTraceAgain = false;
      const p0 = pfPoint.getGeometry().getCoordinates();
      $('pfNote').textContent = 'Tracing the flow line...';
      let f = null;
      try { f = await traceFlow(p0); } catch (e) { if (token === pfToken) $('pfNote').textContent = `Could not trace the flow line: ${e.message}`; }
      if (token !== pfToken) return;
      pfFlow = f;
      $('pfFlowRow').hidden = $('pfAccept').hidden = false;
      if (!f) {
        pfLineFeature()?.setGeometry(new ol.geom.LineString([p0, p0]));
        if (!/Could not/.test($('pfNote').textContent)) $('pfNote').textContent = 'No velocity mosaic has flow at that point; drag it onto moving ice.';
        $('pfFlowText').textContent = '';
        continue;
      }
      const lo = Math.max(pfWant[0], -f.up), hi = Math.min(pfWant[1], f.down);
      for (const [id, v] of [['pfLo', lo], ['pfHi', hi]])
        Object.assign($(id), { min: String(-f.up / 1000), max: String(f.down / 1000), step: 'any', value: String(v / 1000) });
      flowSlider();
      pfLineFeature()?.setGeometry(new ol.geom.LineString(flowTrim(lo, hi)));
      if (pfAdjust) $('pfNote').textContent = 'Drag the white point to nudge the flow line, then Use this line.';
    } while (pfTraceAgain);
  } finally {
    pfTracing = false;
    if (token === pfToken) $('pfAccept').disabled = !!pfAdjust && !pfFlow;
  }
}
$('pfAccept').onclick = () => {
  if (!pfAdjust) { setAdjust(true); $('pfNote').textContent = 'Drag the white point to nudge the flow line, then Use this line.'; return; }
  if (!pfFlow || pfTracing) return;
  const lo = +$('pfLo').value * 1000, hi = +$('pfHi').value * 1000;
  if (hi - lo < 1) { $('pfNote').textContent = 'Move a handle away from the point to give the line some length.'; return; }
  setAdjust(false);
  setProfileLine(flowTrim(lo, hi), lo);
};
for (const id of ['pfLo', 'pfHi']) {
  $(id).addEventListener('input', () => {  // keep the handles either side of the point; move the map line only
    if (+$('pfLo').value > 0) $('pfLo').value = '0';
    if (+$('pfHi').value < 0) $('pfHi').value = '0';
    pfWant = [+$('pfLo').value * 1000, +$('pfHi').value * 1000];
    if (!pfFlow) return;
    flowSlider();
    pfLineFeature()?.setGeometry(new ol.geom.LineString(flowTrim(...pfWant)));
  });
  $(id).addEventListener('change', () => {  // on release (once the line is in use), read the products along it
    if (pfAdjust || !pfFlow) return;
    const [lo, hi] = pfWant;
    if (hi - lo < 1) { $('pfNote').textContent = 'Move a handle away from the point to give the line some length.'; return; }
    setProfileLine(flowTrim(lo, hi), lo);
  });
}
// Called whenever a product's asset is shown.
function pfOnShown(key) {
  $('pfSec').hidden = !key;
  $('pfItsRow').hidden = !(key in itsVars);
  if (!pfLine || !key) return;
  if (key !== pfKey) { pfCurves = []; pfKey = key; pfIts = null; pfAx.y.typed = null; }
  addProfileCurve(selected, key);
  refreshProfileIts();
}

async function profileValues(it, key) {
  // The asset along the line: { d, v, res }, d in metres from A, v in physical units (NaN = no data).
  const a = it.assets[key], b = a['raster:bands']?.[0] || {};
  const { levels: lv, origin: org } = await assetLevels(a.href);
  const len = pfLen(), want = Math.max(lv[0].res, len / 1000);
  const level = lv.reduce((best, l) => Math.abs(l.res - want) < Math.abs(best.res - want) ? l : best);
  const r = level.res, IW = level.img.getWidth(), IH = level.img.getHeight(), n = Math.max(2, Math.ceil(len / r) + 1);
  const d = new Float64Array(n), v = new Float64Array(n).fill(NaN), cols = new Int32Array(n), rows = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    d[k] = len * k / (n - 1);
    const [x, y] = pfAt(d[k]);
    cols[k] = Math.floor((x - org[0]) / r); rows[k] = Math.floor((org[1] - y) / r);
  }
  // Read in pieces of 256 samples, so each window stays close to the line.
  const tasks = [];
  for (let s = 0; s < n; s += 256) tasks.push(async () => {
    const e = Math.min(n, s + 256), cs = cols.subarray(s, e), rs = rows.subarray(s, e);
    const c0 = Math.max(0, Math.min(...cs)), c1 = Math.min(IW, Math.max(...cs) + 1);
    const r0 = Math.max(0, Math.min(...rs)), r1 = Math.min(IH, Math.max(...rs) + 1);
    if (c1 <= c0 || r1 <= r0) return;
    const raw = (await level.img.readRasters({ window: [c0, r0, c1, r1], samples: [0] }))[0], w = c1 - c0;
    for (let k = s; k < e; k++) {
      if (cols[k] < c0 || cols[k] >= c1 || rows[k] < r0 || rows[k] >= r1) continue;
      const q = raw[(rows[k] - r0) * w + cols[k] - c0];
      if (q !== b.nodata && Number.isFinite(q)) v[k] = q * (b.scale ?? 1) + (b.offset ?? 0);
    }
  });
  await runPool(tasks, 4);
  return { d, v, res: r };
}
async function addProfileCurve(it, key) {
  const href = it.assets[key].href;
  if (pfCurves.some(c => c.href === href)) { drawProfile(); return; }
  const token = pfToken, b = it.assets[key]['raster:bands']?.[0] || {};
  const c = { it, href, key, unit: b.unit || '', name: tsCollectionName(),
              color: tsColors.find(x => !pfCurves.some(q => q.color === x)) || tsColors[pfCurves.length % tsColors.length] };
  pfCurves.push(c);
  setPfPlot(true);
  $('pfNote').textContent = `Reading ${fmtDate(it.start)} along the line...`;
  try {
    Object.assign(c, await profileValues(it, key));
    if (token !== pfToken) return;
    $('pfNote').textContent = `Line ${(pfLen() / 1000).toFixed(1)} km; ${fmtDate(it.start)} read every ${Math.round(c.res)} m`
      + (c.v.some(Number.isFinite) ? '.' : ', but it has no data along the line.');
    $('pfCsv').disabled = false; $('pfPng').disabled = false;
  } catch (e) {
    if (token !== pfToken) return;
    pfCurves.splice(pfCurves.indexOf(c), 1);
    $('pfNote').textContent = `Could not read the profile: ${e.message}`;
  }
  drawProfile();
}

// ITS_LIVE along the line. Datacube chunks hold about 20000 dates of 10 x 10 pixels (1.2 km), so a
// sampled pixel's values are kept per time chunk and later products reuse them.
const itsCubes = new Map();  // zarr url -> promise of { zarr, root, x, y, md, dt, arrays }
const itsPixCache = new Map();  // `${url}|${var}|${time chunk}|${ix},${iy}` -> that pixel's values in the chunk
function itsCube(url) {
  if (!itsCubes.has(url)) itsCubes.set(url, (async () => {
    const zarr = await import('https://cdn.jsdelivr.net/npm/zarrita@0.7.5/+esm');
    const root = zarr.root(new zarr.FetchStore(url));
    const read = async n => (await zarr.get(await zarr.open.v2(root.resolve(n), { kind: 'array', attrs: false }))).data;
    const [x, y, md, dt] = await Promise.all(['x', 'y', 'mid_date', 'date_dt'].map(read));
    return { zarr, root, x, y, md, dt, arrays: new Map() };
  })().catch(e => { itsCubes.delete(url); throw e; }));
  return itsCubes.get(url);
}
async function profileIts(it, key, maxDt, onChunk) {
  // Pairs spanning the product's central date, every pfItsStep m from A:
  // { d, pairs: [{ t0, t1, v }], cubes (datacubes on the line), end (latest mid date in them, ms) }.
  const cen = (+it.start + +it.end) / 2 / 86400e3, name = itsVars[key], n = Math.floor(pfLen() / pfItsStep) + 1;
  const d = Float64Array.from({ length: n }, (_, k) => k * pfItsStep), urls = [];
  for (let k = 0; k < n; k++) urls.push(await itsCubeUrl(pfAt(d[k])));
  const pairs = new Map(), jobs = [], cubeUrls = [...new Set(urls.filter(Boolean))];
  let end = -Infinity;
  for (const url of cubeUrls) {
    const cube = await itsCube(url);
    if (!cube.arrays.has(name)) cube.arrays.set(name, await cube.zarr.open.v2(cube.root.resolve(name), { kind: 'array', attrs: false }));
    const arr = cube.arrays.get(name), [tc, yc, xc] = arr.chunks, { md, dt } = cube, idx = [];
    for (let i = 0; i < md.length; i++) {
      if (md[i] > end) end = md[i];
      if (dt[i] <= maxDt && md[i] - dt[i] / 2 <= cen && md[i] + dt[i] / 2 >= cen) idx.push(i);
    }
    if (!idx.length) continue;
    const groups = new Map();  // spatial chunk -> samples in it
    for (let k = 0; k < n; k++) {
      if (urls[k] !== url) continue;
      const [px, py] = pfAt(d[k]);
      const ix = Math.round((px - cube.x[0]) / (cube.x[1] - cube.x[0])), iy = Math.round((py - cube.y[0]) / (cube.y[1] - cube.y[0]));
      if (ix < 0 || iy < 0 || ix >= cube.x.length || iy >= cube.y.length) continue;
      const g = `${Math.floor(iy / yc)},${Math.floor(ix / xc)}`;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push({ k, ix, iy });
    }
    for (const t of new Set(idx.map(i => Math.floor(i / tc)))) {
      const inT = idx.filter(i => Math.floor(i / tc) === t);
      for (const [g, ss] of groups) jobs.push({ url, cube, arr, t, g, ss, inT });
    }
  }
  const tasks = jobs.map(({ url, cube, arr, t, g, ss, inT }) => async () => {
    const [tc, yc, xc] = arr.chunks, pk = s => `${url}|${name}|${t}|${s.ix},${s.iy}`, need = ss.filter(s => !itsPixCache.has(pk(s)));
    if (need.length) {
      const [gy, gx] = g.split(',').map(Number), t0 = t * tc, y0 = gy * yc, x0 = gx * xc, z = cube.zarr;
      const t1 = Math.min(t0 + tc, arr.shape[0]), y1 = Math.min(y0 + yc, arr.shape[1]), x1 = Math.min(x0 + xc, arr.shape[2]);
      const { data, stride } = await z.get(arr, [z.slice(t0, t1), z.slice(y0, y1), z.slice(x0, x1)]);
      for (const s of need) {
        const pix = new Int16Array(t1 - t0), o = (s.iy - y0) * stride[1] + (s.ix - x0) * stride[2];
        for (let q = 0; q < pix.length; q++) pix[q] = data[q * stride[0] + o];
        itsPixCache.set(pk(s), pix);
      }
    }
    for (const s of ss) {
      const pix = itsPixCache.get(pk(s));
      for (const i of inT) {
        const val = pix[i - t * tc];
        if (val === -32767) continue;
        // The same image pair has the same mid date in every cube, so pairs join up across cube edges.
        const id = `${cube.md[i]}|${cube.dt[i]}`;
        if (!pairs.has(id)) pairs.set(id, { t0: (cube.md[i] - cube.dt[i] / 2) * 86400e3, t1: (cube.md[i] + cube.dt[i] / 2) * 86400e3, v: new Float64Array(n).fill(NaN) });
        pairs.get(id).v[s.k] = val;
      }
    }
  });
  await runPool(tasks, 4, (k, r, count) => onChunk(count, tasks.length));
  return { d, pairs: [...pairs.values()], cubes: cubeUrls.length, end: end * 86400e3 };
}
async function profileItsAnnual(it, key) {
  // The ITS_LIVE annual mosaic (calendar year, 120 m COG) of the year holding the product's central date,
  // as one 'pair': { d, res, year, pairs } (pairs empty, with the reason in none, when there is no mosaic).
  const year = new Date((+it.start + +it.end) / 2).getUTCFullYear(), region = itsAnnualRegion[viewCode.split(':')[1]];
  if (!region) return { year, pairs: [], none: 'no annual mosaics in this projection' };
  const href = `https://its-live-data.s3.amazonaws.com/velocity_mosaic/v2/annual/cog/ITS_LIVE_velocity_120m_${region}_${year}_v02_${itsVars[key]}.tif`;
  if (!(await fetch(href, { method: 'HEAD' })).ok) return { year, pairs: [], none: `no annual mosaic for ${year}` };
  const r = await profileValues({ assets: { [key]: { href, 'raster:bands': [{ nodata: -32767 }] } } }, key);
  return { d: r.d, res: r.res, year, pairs: [{ t0: Date.UTC(year, 0, 1), t1: Date.UTC(year, 11, 31), v: r.v }] };
}
async function refreshProfileIts() {
  const key = pfKey, it = selected, maxDt = +$('pfItsDt').value, annual = !!it && pfAnnual(it);
  $('pfItsDt').disabled = annual;
  if (!($('pfIts').checked && pfLine && it && key in itsVars)) { ++pfItsToken; pfIts = null; $('pfItsNote').textContent = ''; $('pfProg').hidden = true; drawProfile(); return; }
  if (pfIts && pfIts.it === it && pfIts.key === key && (annual || pfIts.maxDt === maxDt)) return;
  const token = ++pfItsToken, day = fmtDate(new Date((+it.start + +it.end) / 2));
  pfIts = null; drawProfile();
  $('pfItsNote').textContent = annual ? 'ITS_LIVE: reading the annual mosaic...' : 'ITS_LIVE: finding the datacubes...';
  try {
    const r = annual ? await profileItsAnnual(it, key) : await profileIts(it, key, maxDt, (count, total) => {
      if (token !== pfItsToken) return;
      $('pfProg').hidden = count >= total; $('pfProg').value = count / total;
      $('pfItsNote').textContent = `ITS_LIVE: read ${count} of ${total} datacube chunks`;
    });
    if (token !== pfItsToken) return;
    $('pfProg').hidden = true;
    pfIts = { it, key, maxDt, annual, ...r };
    const apart = maxDt < 1e5 ? `, up to ${maxDt} d apart` : '';
    $('pfItsNote').textContent = annual ? (!r.pairs.length ? `ITS_LIVE: ${r.none}.`
        : `ITS_LIVE: ${r.year} annual mosaic, read every ${Math.round(r.res)} m` + (r.pairs[0].v.some(Number.isFinite) ? '.' : ', but it has no data along the line.'))
      : !r.cubes ? 'ITS_LIVE: no datacube along the line.'
      : r.pairs.length ? `ITS_LIVE: ${r.pairs.length} image pairs spanning ${day}${apart}.`
      : `ITS_LIVE: no image pairs spanning ${day}${apart}` + ((+it.start + +it.end) / 2 > r.end ? `; the datacubes end ${fmtDate(new Date(r.end))}.` : '.');
    drawProfile();
  } catch (e) {
    if (token === pfItsToken) { $('pfProg').hidden = true; $('pfItsNote').textContent = `ITS_LIVE: could not read (${e.message})`; }
  }
}

