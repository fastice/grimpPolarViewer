const zeroFloorAssets = new Set(['vv', 'ex', 'ey']), signedAssets = new Set(['vx', 'vy']);
let stretchMode = 'both', lastSeqCmap = 'gray', cmapChosen = false;
// Speeds open on a log scale in the browse colors over the browse images' 1-3000 m/yr, until the log box is
// changed (logChosen). Every image (and ticking the box) starts at 1-3000; moving the clip (clipMoved) fits
// the range to the image shown, until the next one.
let logChosen = null, clipMoved = false;
const browseRange = [1, 3000];
// Animation: one frame per item of the selected item's time series (items in the time range that
// cover the same area), cut to the crop box or the whole image/site, drawn with the color range and
// color map in force when the frames are loaded, so every frame is directly comparable.
// Frames are held in memory (float values + an image each), so the total budget is larger on laptops and
// desktops than on phones/tablets (coarse pointer) or devices reporting under 4 GB of memory.
const lowMemory = matchMedia('(pointer: coarse)').matches || (navigator.deviceMemory ?? 8) < 4;
const maxFramePixels = 2.5e6, maxAnimPixels = lowMemory ? 40e6 : 120e6;
const animLayer = new ol.layer.Image({ zIndex: 2, visible: false });
map.addLayer(animLayer);
let animExtKey = '', frames = [], frameBox = null, animIdx = 0, animTimer = null, animDate = null, animBuilding = false, animToken = 0;

function timeSeries(allDates = false, key = $('asset').value) {
  if (!selected) return [];
  const e0 = selected.feature.getGeometry().getExtent();
  const overlap = e => {
    const i = ol.extent.getIntersection(e, e0);
    return ol.extent.isEmpty(i) ? 0 : ol.extent.getArea(i) / Math.min(ol.extent.getArea(e), ol.extent.getArea(e0));
  };
  return (allDates ? items : inRange()).filter(it => it.assets[key] && overlap(it.feature.getGeometry().getExtent()) >= 0.5)
                  .sort((a, b) => a.start - b.start);
}
function animExtent() {
  return !siteMode && areaBox ? areaBox : selected.feature.getGeometry().getExtent();
}
function drawArea() {
  if (draw) { const was = drawKind; stopDraw(); if (was === 'area') { refreshAnimInfo(); return; } }
  areaSource.clear(); areaBox = null;
  draw = boxDraw(areaSource, '#3cc8e6'); drawKind = 'area';
  draw.on('drawend', e => { areaBox = e.feature.getGeometry().getExtent(); setTimeout(() => { stopDraw(); areaChanged(); }); });
  map.addInteraction(draw);
  areaChanged();
}
function clearArea() { if (drawKind === 'area') stopDraw(); areaSource.clear(); areaBox = null; areaChanged(); }
function areaChanged() {
  if (frames.length && areaBox !== frameBox) resetAnimation('The area changed; load the frames again.');
  else refreshAnimInfo();
}
function refreshAreaRows() {
  // The area rows in the anomaly/stack and animation sections show the same box.
  const box = !siteMode && areaBox, txt = box ? `box, ${((areaBox[2] - areaBox[0]) / 1000).toFixed(0)} x ${((areaBox[3] - areaBox[1]) / 1000).toFixed(0)} km` : 'whole image';
  for (const [area, btn, whole, row] of [['saArea', 'saDrawBox', 'saWhole', 'saAreaRow'], ['animArea', 'animDrawBox', 'animWhole', 'animAreaRow']]) {
    $(row).hidden = siteMode; $(area).textContent = txt; $(whole).hidden = !box;
    $(btn).textContent = drawKind === 'area' ? 'Cancel' : box ? 'Redraw box' : 'Draw box';
  }
  const hint = 'Click one corner on the map, then the opposite corner.';
  for (const n of ['animNote', 'saNote']) if (drawKind === 'area') $(n).textContent = hint; else if ($(n).textContent === hint) $(n).textContent = '';
}
function frameSize(ext, res) { return [Math.ceil((ext[2] - ext[0]) / res), Math.ceil((ext[3] - ext[1]) / res)]; }

function animSeries() {
  // The dates to animate: every date in the series, or only dates whose windows start at least N days
  // after the previous frame's (so in a mix of 6- and 12-day products the closely spaced ones drop first).
  const s = timeSeries(), d = +$('animStep').value;
  if (!(d > 0)) return s;
  const out = [];
  let last = -Infinity;
  for (const it of s) if (+it.start - last >= d * 86400e3 - 3600e3) { out.push(it); last = +it.start; }
  return out;
}

function refreshAnimInfo() {
  refreshAreaRows();
  refreshStaticAnom();
  refreshCompare();
  refreshTs();
  if (animBuilding) return;
  const series = timeSeries();
  $('animSec').hidden = series.length < 2;
  if (series.length < 2) return;
  const fs = animSeries();
  $('animCount').textContent = fs.length < series.length ? `(${fs.length} of ${series.length} dates)` : `(${series.length} dates)`;
  // The animation area is the area box shared with the anomaly/stack; mosaics only (sites are animated whole).
  if (frames.length) return;
  const ext = animExtent(), where = ext === areaBox ? 'inside the box'
    : siteMode ? `site ${siteName(selected)} (the orange box; click another box on the map to change it)` : 'the whole image';
  const asStored = rgbMode || classMode;
  $('animAnomRow').hidden = asStored; $('animBarRow').hidden = asStored;
  $('animRangeRow').hidden = asStored || !$('animAnom').checked;
  $('animRangeUnit').textContent = band.unit || '';
  $('animInfo').textContent = `${fs.length} frames, ${fmtDate(fs[0].start)} to ${fmtDate(fs[fs.length - 1].start)}, ${where}. `
    + (rgbMode ? 'RGB images are shown as stored.' : classMode ? 'Classes are shown in their colors.'
       : $('animAnom').checked ? 'Each frame minus the per-pixel mean, centered on 0 in blue-white-red, using the current clip %.'
       : 'Every frame uses the current color range and color map.');
  const sel = $('animRes'), prev = sel.value;
  if (!levels) { sel.replaceChildren(new Option('Reading image...', '')); sel.disabled = true; $('animBuild').disabled = true; return; }
  sel.replaceChildren(...levels.map((l, i) => {
    const [w, h] = frameSize(ext, l.res), px = w * h;
    const o = new Option(`${+l.res.toPrecision(4)} m: ${w} x ${h} px per frame`, String(i));
    o.disabled = px > maxFramePixels || px * fs.length > maxAnimPixels;
    return o;
  }));
  const ok = [...sel.options].filter(o => !o.disabled);
  // Keep the user's choice while the area is unchanged; a new area starts at the finest level that fits.
  const extKey = ext.map(Math.round).join(',') + '|' + fs.length, keep = extKey === animExtKey;
  animExtKey = extKey;
  sel.value = keep && ok.some(o => o.value === prev) ? prev : (ok[0]?.value ?? '');
  if (startAnimRes) {  // a shared animation's resolution, when it still fits
    const k = String(levels.findIndex(l => Math.round(l.res) === startAnimRes));
    if (ok.some(o => o.value === k)) sel.value = k;
    startAnimRes = null;
  }
  // Again once the image is read, since the sections above it fill in meanwhile.
  if (animScrollPending) { animScrollPending = false; $('animSec').scrollIntoView({ block: 'start' }); }
  sel.disabled = !ok.length; $('animBuild').disabled = !ok.length || fs.length < 2;
  if (!ok.length) $('animNote').textContent = 'Too large to animate; draw a smaller crop box.';
  else if (fs.length < 2) $('animNote').textContent = 'Fewer than 2 frames at this spacing; use a smaller number of days.';
}

function buildLut(stops) {
  const lut = new Uint8ClampedArray(256 * 3), n = stops.length - 1, rgb = stops.map(hexRgba);
  for (let i = 0; i < 256; i++) {
    const t = i / 255 * n, k = Math.min(n - 1, Math.floor(t)), f = t - k;
    for (let j = 0; j < 3; j++) lut[i * 3 + j] = rgb[k][j] + (rgb[k + 1][j] - rgb[k][j]) * f;
  }
  return lut;
}

async function readFrame(it, key, ext, res, W, H) {
  // One item's asset on the common W x H frame grid (nearest neighbour), from the level nearest res.
  // Single band: { values } in stored units, NaN where no data. RGB(A): { rgba } bytes as stored.
  const a = it.assets[key], b = a['raster:bands']?.[0] || {}, nodata = b.nodata;
  const { levels: lv, origin: org } = await assetLevels(a.href);
  const level = lv.reduce((best, l) => Math.abs(l.res - res) < Math.abs(best.res - res) ? l : best);
  const r = level.res, IW = level.img.getWidth(), IH = level.img.getHeight(), nb = level.img.getSamplesPerPixel();
  const c0 = Math.max(0, Math.floor((ext[0] - org[0]) / r)), c1 = Math.min(IW, Math.ceil((ext[2] - org[0]) / r));
  const r0 = Math.max(0, Math.floor((org[1] - ext[3]) / r)), r1 = Math.min(IH, Math.ceil((org[1] - ext[1]) / r));
  const rgb = nb >= 3, out = rgb ? new Uint8ClampedArray(W * H * 4) : new Float32Array(W * H).fill(NaN);
  if (c1 <= c0 || r1 <= r0) return rgb ? { rgba: out } : { values: out };
  const w = c1 - c0, h = r1 - r0;
  const raw = rgb ? await level.img.readRasters({ window: [c0, r0, c1, r1], interleave: true })
                  : (await level.img.readRasters({ window: [c0, r0, c1, r1], samples: [0] }))[0];
  const sx = new Int32Array(W), sy = new Int32Array(H);
  for (let x = 0; x < W; x++) sx[x] = Math.floor((ext[0] + (x + 0.5) * res - org[0]) / r) - c0;
  for (let y = 0; y < H; y++) sy[y] = Math.floor((org[1] - (ext[3] - (y + 0.5) * res)) / r) - r0;
  for (let y = 0; y < H; y++) {
    const yy = sy[y];
    if (yy < 0 || yy >= h) continue;
    for (let x = 0; x < W; x++) {
      const xx = sx[x];
      if (xx < 0 || xx >= w) continue;
      const k = yy * w + xx, o = y * W + x;
      if (rgb) {
        const m = k * nb;
        out[o * 4] = raw[m]; out[o * 4 + 1] = raw[m + 1]; out[o * 4 + 2] = raw[m + 2]; out[o * 4 + 3] = nb >= 4 ? raw[m + 3] : 255;
      } else {
        const v = raw[k];
        if (v !== nodata && Number.isFinite(v)) out[o] = v;
      }
    }
  }
  return rgb ? { rgba: out } : { values: out };
}

// a class map's frame as RGBA in its class colors (clear where no class)
function classFrame(f, a) {
  const rgba = new Uint8ClampedArray(f.values.length * 4);
  f.values.forEach((v, k) => { const c = classOf(a, v); if (c) rgba.set([...hexRgba(`#${c.color_hint}`).slice(0, 3), 255], 4 * k); });
  return { rgba };
}
function frameCanvas(frame, W, H, lut, lo, hi, label, bar = null, log = false) {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(W, H), px = img.data;
  if (frame.rgba) px.set(frame.rgba);
  else {
    const v = frame.values, span = hi - lo || 1, logSpan = Math.log(hi / lo) || 1;
    for (let k = 0; k < v.length; k++) {
      if (Number.isNaN(v[k])) continue;  // alpha stays 0
      const f = log ? (v[k] > 0 ? Math.log(v[k] / lo) / logSpan : 0) : (v[k] - lo) / span;
      const q = Math.min(255, Math.max(0, Math.round(f * 255))) * 3;
      px[k * 4] = lut[q]; px[k * 4 + 1] = lut[q + 1]; px[k * 4 + 2] = lut[q + 2]; px[k * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Label burned into the frame so it travels with the movie.
  let fs = Math.max(12, Math.round(Math.min(W, H) / 22));
  ctx.font = `600 ${fs}px "JetBrains Mono", monospace`;
  let tw = ctx.measureText(label).width;
  if (tw > W - fs * 2) {  // shrink to fit narrow frames
    fs = Math.max(8, Math.floor(fs * (W - fs * 2) / tw));
    ctx.font = `600 ${fs}px "JetBrains Mono", monospace`;
    tw = ctx.measureText(label).width;
  }
  if (label) {
    ctx.fillStyle = 'rgba(12,16,20,0.75)'; ctx.fillRect(fs * 0.5, H - fs * 2.1, tw + fs, fs * 1.6);
    ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle'; ctx.fillText(label, fs, H - fs * 1.3);
  }
  if (bar) drawColorBar(ctx, W, fs, bar);
  return canvas;
}

function drawColorBar(ctx, W, fs, { stops, dlo, dhi, title, centered, log }) {
  // Top-right legend: title (with unit), gradient, and end values (plus 0 when centered).
  const bf = Math.max(8, Math.round(fs * 0.75)), pad = Math.round(bf * 0.6);
  const bw = Math.round(Math.min(W - fs * 2 - pad * 2, Math.max(bf * 12, W * 0.32))), bh = Math.round(bf * 0.9);
  const x0 = W - bw - fs - pad, y0 = Math.round(fs * 0.5);
  const fmt = v => String(+v.toPrecision(3));
  ctx.fillStyle = 'rgba(12,16,20,0.78)';
  ctx.fillRect(x0 - pad, y0, bw + pad * 2, pad + bf * 1.2 + bh + bf * 1.5 + pad * 0.5);
  ctx.font = `600 ${bf}px "JetBrains Mono", monospace`; ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle';
  ctx.textAlign = 'left'; ctx.fillText(title, x0, y0 + pad + bf * 0.6, bw);
  const yb = y0 + pad + bf * 1.2, grad = ctx.createLinearGradient(x0, 0, x0 + bw, 0);
  stops.forEach((c, i) => grad.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = grad; ctx.fillRect(x0, yb, bw, bh);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, yb + 0.5, bw - 1, bh - 1);
  const yl = yb + bh + bf * 0.8;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left'; ctx.fillText(fmt(dlo), x0, yl);
  ctx.textAlign = 'right'; ctx.fillText(fmt(dhi), x0 + bw, yl);
  if (centered) { ctx.textAlign = 'center'; ctx.fillText('0', x0 + bw / 2, yl); }
  if (log) {  // decade labels on the same line as the end values, each only where it fits between its neighbors
    ctx.textAlign = 'center';
    let left = x0 + ctx.measureText(fmt(dlo)).width + bf * 0.5;
    const right = x0 + bw - ctx.measureText(fmt(dhi)).width - bf * 0.5;
    for (const [v, f] of logTicks(dlo, dhi)) {
      const x = x0 + f * bw, w = ctx.measureText(String(v)).width;
      if (x - w / 2 < left || x + w / 2 > right) continue;
      ctx.fillRect(x, yb + bh, 1, bf * 0.25); ctx.fillText(String(v), x, yl);
      left = x + w / 2 + bf * 0.5;
    }
  }
  ctx.textAlign = 'left';
}

async function buildFrames() {
  const key = $('asset').value, series = animSeries(), ext = animExtent(), res = levels[+$('animRes').value].res;
  const anomaly = $('animAnom').checked && !rgbMode && !classMode;
  const [W, H] = frameSize(ext, res);
  const lut = rgbMode || classMode ? null : buildLut(anomaly ? cmaps['blue-white-red'] : (cmaps[$('cmap').value] || cmaps.gray));
  const scale = band.scale ?? 1, unit = band.unit || '';
  const withBar = $('animBar').checked && !rgbMode && !classMode;
  const barStops = anomaly ? cmaps['blue-white-red'] : (cmaps[$('cmap').value] || cmaps.gray);
  resetAnimation();
  const token = ++animToken;  // after the reset, which bumps the token itself
  animBuilding = true; frameBox = ext === areaBox ? areaBox : null;
  $('animBuild').disabled = true; $('animRes').disabled = true;
  const built = [], label = it => `${fmtDate(it.start)} to ${fmtDate(it.end)}${anomaly ? '  minus mean' : ''}`;
  const add = (it, canvas, values = null) => {
    // toDataURL is synchronous: toBlob's callback can be dropped while the tab is in the background.
    built.push({ it, canvas, values, source: new ol.source.ImageStatic({ url: canvas.toDataURL('image/png'), imageExtent: ext, projection: viewCode }) });
  };
  let summary = '';
  try {
    if (!anomaly) {
      for (const [i, it] of series.entries()) {
        $('animNote').textContent = `Loading frame ${i + 1} of ${series.length} (${fmtDate(it.start)})...`;
        const f = await maskFrame(await readFrame(it, key, ext, res, W, H), it, ext, res, W, H);
        if (token !== animToken) return;
        add(it, frameCanvas(classMode ? classFrame(f, it.assets[key]) : f, W, H, lut, rawLo, rawHi, label(it), withBar ? {
          stops: barStops, dlo: toDisp(rawLo), dhi: toDisp(rawHi), centered: stretchMode === 'symmetric',
          title: `${key}${unit ? ` (${unit})` : ''}${logScale ? ', log scale' : ''}`, log: logScale } : null, logScale), f.values || null);
        await pause(0);  // let the page repaint the progress note
      }
    } else {
      // Anomaly: subtract the per-pixel mean over all frames that have data there, then stretch
      // symmetrically about 0 using the clip percentage, in blue-white-red.
      const stack = [];
      for (const [i, it] of series.entries()) {
        $('animNote').textContent = `Reading frame ${i + 1} of ${series.length} (${fmtDate(it.start)})...`;
        stack.push((await maskFrame(await readFrame(it, key, ext, res, W, H), it, ext, res, W, H)).values);
        if (token !== animToken) return;
        await pause(0);
      }
      const n = W * H, sum = new Float64Array(n), cnt = new Uint16Array(n);
      for (const v of stack) for (let k = 0; k < n; k++) if (!Number.isNaN(v[k])) { sum[k] += v[k]; cnt[k]++; }
      const step = Math.max(1, Math.floor(n * stack.length / 1e6)), picks = [];
      for (const v of stack) {
        for (let k = 0; k < n; k++) v[k] = cnt[k] ? v[k] - sum[k] / cnt[k] : NaN;
        for (let k = 0; k < n; k += step) if (!Number.isNaN(v[k])) picks.push(v[k]);
      }
      const sorted = Float32Array.from(picks).sort(), p = +$('clip').value / 100;
      const at = q => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))] ?? 0;
      const autoL = Math.max(Math.abs(at(p)), Math.abs(at(1 - p))) || 1;
      const typed = +$('animRange').value;
      const L = animRangeTyped && typed > 0 ? typed / scale : autoL;
      // Kept so a new ± range can recolor the frames without reading them again.
      anomState = { stack, autoL, W, H, lut, scale, unit, key, ext, withBar, barStops, label, n: series.length };
      for (const [i, it] of series.entries()) {
        $('animNote').textContent = `Drawing anomaly frame ${i + 1} of ${series.length}...`;
        add(it, anomalyCanvas(i, L, it), stack[i]);
        await pause(0);
      }
      $('animRange').value = +(L * scale).toPrecision(3);
      summary = anomalySummary(L);
    }
  } catch (e) {
    animBuilding = false;
    $('animNote').textContent = `Could not load frames: ${e.message}`; refreshAnimInfo(); return;
  }
  animBuilding = false; frames = built;
  animGrid = { ext, res, W, H, anomaly, key, scale: band.scale ?? 1, offset: band.offset ?? 0, unit: band.unit || '' };
  applyLayers();
  $('animPos').max = frames.length - 1; $('animPos').hidden = false;
  $('animPlay').disabled = false; $('animExport').disabled = false; $('animClose').hidden = false;
  $('animBuild').disabled = false; $('animBuild').textContent = 'Reload frames'; $('animRes').disabled = false;
  $('animNote').textContent = `${frames.length} frames loaded, ${W} x ${H} px at ${+res.toPrecision(4)} m.${summary}`;
  showFrame(frames.length - 1);
}

let anomState = null, animRangeTyped = false, animGrid = null;
function anomalyCanvas(i, L, it = frames[i].it) {
  const a = anomState;
  return frameCanvas({ values: a.stack[i] }, a.W, a.H, a.lut, -L, L, a.label(it), a.withBar ? {
    stops: a.barStops, dlo: -L * a.scale, dhi: L * a.scale, centered: true,
    title: `${a.key} minus mean${a.unit ? ` (${a.unit})` : ''}` } : null);
}
function anomalySummary(L) {
  const a = anomState;
  return ` Anomaly from the ${a.n}-frame mean; color range ±${+(L * a.scale).toPrecision(3)} ${a.unit}`.trimEnd()
    + (animRangeTyped ? ' (typed)' : ` (auto, ${$('clip').value}% clip)`) + '; blue below the mean, red above.';
}
async function recolorAnomaly() {
  // Redraw the loaded anomaly frames with the ± range now in the box (or the automatic one).
  if (!anomState || !frames.length) return;
  const typed = +$('animRange').value;
  const L = animRangeTyped && typed > 0 ? typed / anomState.scale : anomState.autoL;
  if (!animRangeTyped) $('animRange').value = +(L * anomState.scale).toPrecision(3);
  for (const [i, f] of frames.entries()) {
    f.canvas = anomalyCanvas(i, L);
    f.source = new ol.source.ImageStatic({ url: f.canvas.toDataURL('image/png'), imageExtent: anomState.ext, projection: viewCode });
  }
  showFrame(animIdx);
  $('animNote').textContent = `${frames.length} frames, ${anomState.W} x ${anomState.H} px.${anomalySummary(L)}`;
}

function showFrame(i) {
  animIdx = i;
  const f = frames[i];
  animLayer.setSource(f.source);
  $('animPos').value = i;
  $('animInfo').textContent = `Frame ${i + 1} of ${frames.length}: ${fmtDate(f.it.start)} to ${fmtDate(f.it.end)}`;
  animDate = +f.it.start;
  if (dates.length) drawTimebar();
}
function pauseAnim() { clearInterval(animTimer); animTimer = null; $('animPlay').textContent = 'Play'; }
function playAnim() {
  pauseAnim();
  if (animIdx >= frames.length - 1 && !$('animLoop').checked) showFrame(0);
  animTimer = setInterval(() => {
    if (animIdx + 1 < frames.length) showFrame(animIdx + 1);
    else if ($('animLoop').checked) showFrame(0);
    else pauseAnim();
  }, 1000 / +$('animFps').value);
  $('animPlay').textContent = 'Pause';
}

function resetAnimation(note = '') {
  ++animToken; animBuilding = false; pauseAnim();
  frames = []; frameBox = null; animDate = null; anomState = null; animGrid = null;
  animLayer.setSource(null); applyLayers();
  $('animPos').hidden = true; $('animPlay').disabled = true; $('animExport').disabled = true; $('animClose').hidden = true;
  $('animBuild').textContent = 'Load frames';
  $('animNote').textContent = note;
  if (dates.length) drawTimebar();
  refreshAnimInfo();
}

async function pickH264(W, H, bitrate, fps) {
  // The first H.264 profile this browser can encode at W x H, or null.
  for (const c of ['avc1.640034', 'avc1.4d0034', 'avc1.42003e', 'avc1.42001f']) {
    try { if ((await VideoEncoder.isConfigSupported({ codec: c, width: W, height: H, bitrate, framerate: fps })).supported) return c; } catch (e) {}
  }
  return null;
}
async function exportMovie() {
  if (!('VideoEncoder' in window)) {
    $('animNote').textContent = 'This browser cannot encode video; use a recent Chrome, Edge, Safari (16.4+) or Firefox (130+).';
    return;
  }
  const fps = +$('animFps').value, W = frames[0].canvas.width + (frames[0].canvas.width % 2), H = frames[0].canvas.height + (frames[0].canvas.height % 2);
  const bitrate = Math.round(Math.min(20e6, Math.max(2e6, W * H * fps * 0.2)));
  const codec = await pickH264(W, H, bitrate, fps);
  if (!codec) { $('animNote').textContent = `This browser cannot encode H.264 at ${W} x ${H}; choose a coarser resolution.`; return; }
  $('animExport').disabled = true; pauseAnim();
  const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H, frameRate: fps }, fastStart: 'in-memory' });
  let failure = null;
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { failure = e; } });
  enc.configure({ codec, width: W, height: H, bitrate, framerate: fps });
  const vc = document.createElement('canvas'); vc.width = W; vc.height = H;
  const vctx = vc.getContext('2d');
  try {
    for (const [i, f] of frames.entries()) {
      $('animNote').textContent = `Encoding frame ${i + 1} of ${frames.length}...`;
      vctx.fillStyle = '#000000'; vctx.fillRect(0, 0, W, H);  // no-data areas are black in the movie
      vctx.drawImage(f.canvas, 0, 0);
      const vf = new VideoFrame(vc, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
      enc.encode(vf, { keyFrame: i % Math.max(1, fps * 2) === 0 });
      vf.close();
      while (enc.encodeQueueSize > 4) await pause(20);
      if (failure) throw failure;
    }
    await enc.flush();
    if (failure) throw failure;
    muxer.finalize();
    const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    const key = $('asset').value, coll = items[0]?.raw?.collection || 'grimp';
    const name = `${coll}_${key}_${fmtDate(frames[0].it.start)}_${fmtDate(frames[frames.length - 1].it.start)}.mp4`;
    saveBlob(blob, name);
    $('animNote').textContent = `Saved ${name} (${(blob.size / 1e6).toFixed(1)} MB, ${frames.length} frames at ${fps} frames/s).`;
  } catch (e) {
    $('animNote').textContent = `Movie export failed: ${e.message}`;
  } finally {
    if (enc.state !== 'closed') enc.close();
    $('animExport').disabled = !frames.length;
  }
}

$('animBuild').onclick = buildFrames;
$('animAnom').onchange = () => { if (frames.length) resetAnimation('Load the frames again to switch between values and anomalies.'); else refreshAnimInfo(); };
$('animRange').onchange = () => { animRangeTyped = $('animRange').value !== '' && +$('animRange').value > 0; recolorAnomaly(); };
$('animRangeAuto').onclick = () => { animRangeTyped = false; $('animRange').value = ''; recolorAnomaly(); };
$('animBar').onchange = () => { if (frames.length) resetAnimation('Load the frames again to add or remove the color bar.'); };
$('animStep').onchange = () => { if (frames.length) resetAnimation('Load the frames again to use the new spacing.'); else refreshAnimInfo(); };
$('animDrawBox').onclick = $('saDrawBox').onclick = drawArea;
$('animWhole').onclick = $('saWhole').onclick = clearArea;
$('animPlay').onclick = () => (animTimer ? pauseAnim() : playAnim());
$('animFps').onchange = () => { if (animTimer) playAnim(); };
$('animPos').oninput = e => { pauseAnim(); showFrame(+e.target.value); };
$('animClose').onclick = () => resetAnimation();
$('animExport').onclick = exportMovie;
$('animRes').onchange = () => {};

