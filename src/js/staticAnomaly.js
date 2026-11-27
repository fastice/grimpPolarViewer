// Static anomaly view: the selected date minus the per-pixel mean of its time series, at an overview
// resolution, over the crop box or the whole image/site, in blue-white-red. The series stack is kept,
// so other dates of the same series show at once.
const staticLayer = new ol.layer.Image({ zIndex: 2, visible: false });
map.addLayer(staticLayer);
let saCache = null, saShown = null, saToken = 0, saBusy = false, saTyped = false, saReady = false, saExtKey = '';

function applyLayers() {
  const anim = frames.length > 0, sa = !anim && !!saShown;
  animLayer.setVisible(anim); staticLayer.setVisible(sa); rasterLayer.setVisible(!anim && !sa);
  swipeShow();
}

// Pixel size of what the map draws: the COG level OpenLayers picks for this zoom (full image or an
// overview, chosen as in its WebGL tile renderer), or the animation / anomaly / stack grid.
// Zoomed in past the finest pixels (a data pixel 1.5 or more screen pixels wide), it says by how much,
// highlighted, since the map otherwise zooms on smoothly with nothing new to see.
function pixelNote() {
  const m = r => `${Math.round(r).toLocaleString()} m`, view = map.getView(), vr = view.getResolution();
  const past = (label, res) => vr * 1.5 <= res ? { text: `${label} ${m(res)}, zoomed ${res / vr < 10 ? (res / vr).toFixed(1) : Math.round(res / vr)}× past full resolution`, past: true }
                                               : { text: `${label} ${m(res)}`, past: false };
  if (animLayer.getVisible() && animGrid) return past('Frame pixels', animGrid.res);
  if (staticLayer.getVisible() && saCache) return past(`${saShown?.stack ? 'Stack' : 'Anomaly'} pixels`, saCache.res);
  const src = rasterLayer.getSource(), tg = rasterLayer.getVisible() && src?.getState() === 'ready' && src.getTileGrid();
  if (!tg) return { text: '' };
  const full = tg.getResolution(tg.getMaxZoom());
  if (src.getProjection()?.getCode() !== view.getProjection().getCode()) return { text: `Full resolution ${m(full)}` };
  const r = tg.getResolution(tg.getZForResolution(vr, src.zDirection));
  if (r > full * 1.01) return { text: `Pixels ${m(r)} (overview; full ${m(full)})` };
  const n = past('Pixels', full);
  return n.past ? n : { text: `Pixels ${m(full)} (full resolution)` };
}
function updatePixelNote() {
  const { text, past } = pixelNote(), el = $('pixRes');
  el.hidden = !text;
  el.classList.toggle('past', !!past);
  if (el.textContent !== text) el.textContent = text;
}
map.on('moveend', updatePixelNote);
map.on('rendercomplete', updatePixelNote);

function refreshStaticAnom() {
  const series = timeSeries(), ok = !!selected && series.length >= 2 && !rgbMode;
  $('saBlock').hidden = !ok;
  if (!ok) { if (saShown) clearStaticAnom(); return; }
  $('stCount').textContent = `${series.length} dates`;
  const ref = $('saRef'), prevRef = ref.value;  // what the anomaly subtracts: the series mean or one date
  ref.replaceChildren(new Option(`the mean of ${series.length} dates`, ''), ...series.map(it => new Option(itemDates(it), it.id)));
  ref.value = series.some(it => it.id === prevRef) ? prevRef : '';
  $('saSecCount').textContent = `(${series.length} dates)`;
  const pos = series.indexOf(selected);
  $('saPrev').disabled = pos <= 0; $('saNext').disabled = pos < 0 || pos >= series.length - 1;
  $('saPos').textContent = pos >= 0 ? `${pos + 1} of ${series.length}: ${fmtDate(selected.start)}` : '';
  $('saUnit').textContent = band.unit || '';
  if (!saReady || !levels) return;
  const ext = animExtent(), sel = $('saRes'), prev = sel.value;
  sel.replaceChildren(...levels.map((l, i) => {
    const [w, h] = frameSize(ext, l.res), px = w * h;
    const o = new Option(`${+l.res.toPrecision(4)} m: ${w} x ${h} px`, String(i));
    o.disabled = px > maxFramePixels || px * series.length > maxAnimPixels;
    return o;
  }));
  const ok2 = [...sel.options].filter(o => !o.disabled), extKey = ext.map(Math.round).join(',') + '|' + series.length;
  sel.value = extKey === saExtKey && ok2.some(o => o.value === prev) ? prev : (ok2[0]?.value ?? '');
  saExtKey = extKey; sel.disabled = !ok2.length;
  if (saActive() && !saBusy) showStaticAnom();
}
// The anomaly and the stack mean share one cached stack of the dates in the time range.
const saActive = () => $('saOn').checked || $('stOn').checked;

function saKeys() {
  const key = $('asset').value, series = timeSeries(), ext = animExtent(), lvl = levels?.[+$('saRes').value];
  if (!lvl || !selected) return null;
  const base = [key, ext.map(Math.round).join(','), lvl.res.toFixed(3), series.map(s => s.id).join(';')].join('|');
  return { key, series, ext, res: lvl.res, base, full: base + '|' + ($('stOn').checked ? 'stack' : `${selected.id}|${$('saRef').value}`) };
}

async function showStaticAnom() {
  const k = saKeys();
  if (!k || saShown?.full === k.full) return;
  const stack = $('stOn').checked;
  if (!stack && !k.series.includes(selected)) { clearStaticAnom('The displayed date is outside the time range.'); return; }
  const token = ++saToken;
  saBusy = true;
  try {
    if (!saCache || saCache.base !== k.base) {
      saCache = null;
      const [W, H] = frameSize(k.ext, k.res), values = new Map();
      for (const [i, it] of k.series.entries()) {
        $('saNote').textContent = `Reading date ${i + 1} of ${k.series.length} (${fmtDate(it.start)})...`;
        values.set(it, (await readFrame(it, k.key, k.ext, k.res, W, H)).values);
        if (token !== saToken) return;
        await pause(0);
      }
      const n = W * H, sum = new Float64Array(n), cnt = new Uint16Array(n), mean = new Float32Array(n);
      for (const v of values.values()) for (let j = 0; j < n; j++) if (!Number.isNaN(v[j])) { sum[j] += v[j]; cnt[j]++; }
      for (let j = 0; j < n; j++) mean[j] = cnt[j] ? sum[j] / cnt[j] : NaN;
      const step = Math.max(1, Math.floor(n * values.size / 1e6)), picks = [];
      for (const v of values.values()) for (let j = 0; j < n; j += step) { const d = v[j] - mean[j]; if (!Number.isNaN(d)) picks.push(d); }
      saCache = { base: k.base, W, H, ext: k.ext, res: k.res, key: k.key, values, mean, cnt, sorted: Float32Array.from(picks).sort(),
                  scale: band.scale ?? 1, offset: band.offset ?? 0, unit: band.unit || '' };
    }
    if (token === saToken) (stack ? drawStack(k.full) : drawStaticAnom(k.full));
  } catch (e) {
    if (token === saToken) $('saNote').textContent = `Could not compute the anomaly: ${e.message}`;
  } finally {
    if (token === saToken) saBusy = false;
  }
}

function saRange() {
  // Typed ± value, or automatic: the larger tail at 1% over all dates' anomalies.
  const c = saCache, s = c.sorted, typed = +$('saRange').value;
  const at = q => s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))] ?? 0;
  return saTyped && typed > 0 ? typed / c.scale : (Math.max(Math.abs(at(0.01)), Math.abs(at(0.99))) || 1);
}

function drawStaticAnom(full = saShown?.full) {
  const c = saCache, v = c.values.get(selected), refItem = [...c.values.keys()].find(it => it.id === $('saRef').value);
  if (!v) return;
  const n = c.W * c.H, d = new Float32Array(n), base = refItem ? c.values.get(refItem) : c.mean, pct = $('saMode').value === 'pct';
  if (pct) {
    // Percent change: in physical units, blank where the reference is under 1% of its 99th-percentile magnitude,
    // so near-zero speeds do not blow up.
    const phys = new Float32Array(n);
    for (let j = 0; j < n; j++) phys[j] = base[j] * c.scale + c.offset;
    const step = Math.max(1, Math.floor(n / 1e6)), mags = [];
    for (let j = 0; j < n; j += step) if (!Number.isNaN(phys[j])) mags.push(Math.abs(phys[j]));
    const s = Float32Array.from(mags).sort(), floor = 0.01 * (s[Math.floor(0.99 * (s.length - 1))] || 0);
    for (let j = 0; j < n; j++) d[j] = Math.abs(phys[j]) > floor ? 100 * (v[j] - base[j]) * c.scale / phys[j] : NaN;
  } else for (let j = 0; j < n; j++) d[j] = v[j] - base[j];
  const L = pct ? diffRange(d, 1) : refItem ? diffRange(d) : saRange(), stops = cmaps['blue-white-red'];
  const canvas = frameCanvas({ values: d }, c.W, c.H, buildLut(stops), -L, L, '');
  staticLayer.setSource(new ol.source.ImageStatic({ url: canvas.toDataURL('image/png'), imageExtent: c.ext, projection: viewCode }));
  saShown = { full, d, L };
  applyLayers();
  $('saRangeRow').hidden = $('saStepRow').hidden = false;
  const Ld = +(L * (pct ? 1 : c.scale)).toPrecision(3), unit = pct ? '%' : c.unit;
  $('saUnit').textContent = unit;
  if (!saTyped) $('saRange').value = Ld;
  $('stretchCtl').hidden = true;  // the normal color controls do not apply to the anomaly
  $('saLegend').hidden = false;
  $('saBar').style.background = `linear-gradient(90deg, ${stops.join(', ')})`;
  $('saMin').textContent = -Ld; $('saMax').textContent = `${Ld} ${unit}`.trim();
  const refText = refItem ? fmtDate(refItem.start) : `the mean of ${c.values.size} dates`;
  $('saNote').textContent = `${pct ? `Percent change of ${fmtDate(selected.start)} from ${refText} (blank where that is near zero)` : `${fmtDate(selected.start)} minus ${refText}`}; `
    + `${c.W} x ${c.H} px at ${+c.res.toPrecision(4)} m; ±${Ld} ${unit} ${saTyped ? '(typed)' : '(auto, 1% clip)'}. `
    + `Blue below ${refItem ? 'that date' : 'the mean'}, red above.`;
}

// Automatic ± range of a difference from one date: the typed value, or the larger 1% tail of this difference
// (scale: of the values in d, 1 for a percent change).
function diffRange(d, scale = saCache.scale) {
  const typed = +$('saRange').value;
  if (saTyped && typed > 0) return typed / scale;
  const step = Math.max(1, Math.floor(d.length / 1e6)), picks = [];
  for (let j = 0; j < d.length; j += step) if (!Number.isNaN(d[j])) picks.push(d[j]);
  const s = Float32Array.from(picks).sort(), at = q => s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))] ?? 0;
  return Math.max(Math.abs(at(0.01)), Math.abs(at(0.99))) || 1;
}

function drawStack(full = saShown?.full) {
  // The per-pixel mean of the dates in the time range, colored with the normal stretch and color map.
  const c = saCache;
  if (!c || c.key !== $('asset').value) return;
  const canvas = frameCanvas({ values: c.mean }, c.W, c.H, buildLut(cmaps[$('cmap').value] || cmaps.gray), rawLo, rawHi, '', null, logScale);
  staticLayer.setSource(new ol.source.ImageStatic({ url: canvas.toDataURL('image/png'), imageExtent: c.ext, projection: viewCode }));
  saShown = { full, d: c.mean, stack: true };
  applyLayers();
  $('stretchCtl').hidden = false; $('saLegend').hidden = true;
  $('saRangeRow').hidden = $('saStepRow').hidden = true;
  const dates = [...c.values.keys()];
  $('saNote').textContent = `Mean of ${dates.length} dates, ${fmtDate(dates[0].start)} to ${fmtDate(dates[dates.length - 1].end)} `
    + `(each pixel averages the dates with data there); ${c.W} x ${c.H} px at ${+c.res.toPrecision(4)} m. Colors follow the controls above.`;
}

function clearStaticAnom(note = '') {
  ++saToken; saBusy = false; saShown = null;
  staticLayer.setSource(null); applyLayers();
  $('stretchCtl').hidden = rgbMode; $('saLegend').hidden = true; $('saNote').textContent = note;
}

$('saOn').onchange = $('stOn').onchange = e => {
  if (e.target.checked) (e.target.id === 'saOn' ? $('stOn') : $('saOn')).checked = false;
  $('saOpts').hidden = !saActive();
  if (saActive()) { saShown = null; refreshStaticAnom(); } else clearStaticAnom();
};
$('saRes').onchange = () => { if (saActive()) showStaticAnom(); };
$('saRef').onchange = () => { if ($('saOn').checked) showStaticAnom(); };
$('saMode').onchange = () => { saTyped = false; $('saRange').value = ''; if (saShown && !saShown.stack) drawStaticAnom(); };
$('saRange').onchange = () => { saTyped = +$('saRange').value > 0; if (saShown) drawStaticAnom(); };
function saStep(dir) {
  const series = timeSeries(), i = series.indexOf(selected), j = i + dir;
  if (i >= 0 && j >= 0 && j < series.length) select(series[j]);
}
$('saPrev').onclick = () => saStep(-1);
$('saNext').onclick = () => saStep(1);
$('saAuto').onclick = () => { saTyped = false; $('saRange').value = ''; if (saShown) drawStaticAnom(); };

