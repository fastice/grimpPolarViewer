// Flow arrows: the shown item's vx/vy drawn as arrows on a grid every arrowSpacing screen pixels, read
// (like animation frames) from the overview level nearest the grid spacing, so each arrow shows the flow
// averaged over its cell. The grid is fixed in map coordinates, so arrows stay put while panning, and is
// read again after each move or zoom. Direction is the flow direction; length grows with log speed from
// arrowMinSpeed to the 95th percentile of the speeds in view. Slower ice gets no arrow: the cutoff is
// above the noise on ice-free rock (1-4 m/yr beside Jakobshavn in the 2025 annual mosaic).
const arrowSpacing = 44, arrowMinSpeed = 5;
const arrowSource = new ol.source.Vector();
const arrowLayer = new ol.layer.Vector({ source: arrowSource, zIndex: 4, visible: false, style: [
  new ol.style.Style({ stroke: new ol.style.Stroke({ color: 'rgba(0, 0, 0, 0.7)', width: 3.5 }) }),
  new ol.style.Style({ stroke: new ol.style.Stroke({ color: '#fff', width: 1.5 }) }),
] });
map.addLayer(arrowLayer);
let arrowToken = 0, arrowKey = '';
const hasFlow = it => !!(it?.assets?.vx && it?.assets?.vy);

async function refreshArrows() {
  const ok = hasFlow(selected), on = $('arrowsOn').checked && ok;
  $('arrowsOn').disabled = !ok;
  arrowLayer.setVisible(on);
  if (!on) { ++arrowToken; arrowKey = ''; arrowSource.clear(); return; }
  const view = map.getView(), vr = view.getResolution(), cell = vr * arrowSpacing, e = view.calculateExtent(map.getSize());
  const ext = [Math.floor(e[0] / cell) * cell, Math.floor(e[1] / cell) * cell, Math.ceil(e[2] / cell) * cell, Math.ceil(e[3] / cell) * cell];
  const W = Math.round((ext[2] - ext[0]) / cell), H = Math.round((ext[3] - ext[1]) / cell), key = `${selected.id} ${ext.join()} ${cell}`;
  if (key === arrowKey) return;
  arrowKey = key;
  const token = ++arrowToken, it = selected;
  let vx, vy;
  try {
    [vx, vy] = (await Promise.all(['vx', 'vy'].map(k => readFrame(it, k, ext, cell, W, H)))).map(f => f.values);
  } catch (err) { if (token === arrowToken) { arrowKey = ''; setStatus(`Could not read the flow arrows (${err.message})`); } return; }
  if (token !== arrowToken) return;
  const speeds = [];
  for (let k = 0; k < W * H; k++) { const s = Math.hypot(vx[k], vy[k]); if (s >= arrowMinSpeed) speeds.push(s); }
  speeds.sort((a, b) => a - b);
  const top = Math.log10(Math.max(speeds[Math.floor(0.95 * (speeds.length - 1))] || 10, 10 * arrowMinSpeed)), bottom = Math.log10(arrowMinSpeed);
  const features = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x, s = Math.hypot(vx[k], vy[k]);
    if (!(s >= arrowMinSpeed)) continue;
    const f = 0.3 + 0.7 * Math.min(1, (Math.log10(s) - bottom) / (top - bottom)), L = 0.8 * cell * f;
    const ux = vx[k] / s, uy = vy[k] / s, cx = ext[0] + (x + 0.5) * cell, cy = ext[3] - (y + 0.5) * cell;
    const tip = [cx + ux * L / 2, cy + uy * L / 2], h = Math.min(0.4 * L, 7 * vr), c = Math.cos(0.5), sn = Math.sin(0.5);
    const head = [[tip[0] - h * (ux * c - uy * sn), tip[1] - h * (uy * c + ux * sn)], tip, [tip[0] - h * (ux * c + uy * sn), tip[1] - h * (uy * c - ux * sn)]];
    features.push(new ol.Feature(new ol.geom.MultiLineString([[[cx - ux * L / 2, cy - uy * L / 2], tip], head])));
  }
  arrowSource.clear(); arrowSource.addFeatures(features);
}
map.on('moveend', refreshArrows);
$('arrowsOn').onchange = refreshArrows;

// Flow particles: streaks drifting with the shown item's vx/vy, read like the arrows on a grid every
// particleCell screen pixels. Each frame moves every particle in proportion to its speed (the 95th
// percentile of the speeds in view moves particleStep px a frame) and fades the old trails, so a streak's
// length shows its speed. A particle lives particleLife frames, or until it leaves the data, then starts
// again at a random cell of moving ice (at least arrowMinSpeed). They are drawn on a canvas over the map,
// cleared while the map moves and started again on the new view.
const particleCell = 4, particleStep = 2, particleLife = 100, particleMax = 3000;
const pCanvas = document.createElement('canvas');
pCanvas.className = 'particles';
map.getViewport().insertBefore(pCanvas, map.getViewport().querySelector('.ol-overlaycontainer'));
let pField = null, pParts = [], pRaf = 0, pToken = 0, pFades = 0;
function stopParticles() {
  ++pToken; cancelAnimationFrame(pRaf); pRaf = 0; pParts = []; pField = null;
  pCanvas.getContext('2d').clearRect(0, 0, pCanvas.width, pCanvas.height);
}
async function refreshParticles() {
  const ok = hasFlow(selected), on = $('particlesOn').checked && ok;
  $('particlesOn').disabled = !ok; $('particleRow').hidden = !on;
  stopParticles();
  if (!on) return;
  const token = pToken, view = map.getView(), size = map.getSize(), cell = view.getResolution() * particleCell, e = view.calculateExtent(size);
  const W = Math.ceil(size[0] / particleCell), H = Math.ceil(size[1] / particleCell), ext = [e[0], e[3] - H * cell, e[0] + W * cell, e[3]];
  const it = selected, bands = ['vx', 'vy'].map(k => it.assets[k]['raster:bands']?.[0] || {});
  let vx, vy;
  try {
    [vx, vy] = (await Promise.all(['vx', 'vy'].map(k => readFrame(it, k, ext, cell, W, H)))).map((f, n) => f.values.map(v => v * (bands[n].scale ?? 1) + (bands[n].offset ?? 0)));
  } catch (err) { if (token === pToken) setStatus(`Could not read the flow for particles (${err.message})`); return; }
  if (token !== pToken) return;
  const moving = [], speeds = [];
  for (let k = 0; k < W * H; k++) { const s = Math.hypot(vx[k], vy[k]); if (s >= arrowMinSpeed) { moving.push(k); speeds.push(s); } }
  if (!moving.length) return;
  speeds.sort((a, b) => a - b);
  const top = Math.max(speeds[Math.floor(0.95 * (speeds.length - 1))], 10 * arrowMinSpeed), dpr = window.devicePixelRatio || 1;
  pField = { it, vx, vy, W, H, moving, scale: particleStep / top };
  pCanvas.width = size[0] * dpr; pCanvas.height = size[1] * dpr;
  pCanvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  const n = Math.min(particleMax, Math.round(size[0] * size[1] / 300), moving.length * 4);
  pParts = Array.from({ length: n }, () => ({ age: Math.floor(Math.random() * particleLife) }));
  for (const q of pParts) spawnParticle(q);
  pRaf = requestAnimationFrame(particleFrame);
}
function spawnParticle(q) {
  const k = pField.moving[Math.floor(Math.random() * pField.moving.length)];
  q.x = (k % pField.W + Math.random()) * particleCell; q.y = (Math.floor(k / pField.W) + Math.random()) * particleCell;
}
function particleFrame() {
  moveParticles();
  pRaf = requestAnimationFrame(particleFrame);
}
function moveParticles(loop) {
  // One frame. With loop = { t, cycles } (the movie) particle q starts at q.seeds[n % cycles] when
  // t + q.phase = n particleLife and, if it leaves the data, waits for its next start, so the frames repeat
  // every cycles x particleLife.
  const f = pField, ctx = pCanvas.getContext('2d'), w = pCanvas.width, h = pCanvas.height;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = 'rgba(0, 0, 0, 0.92)'; ctx.fillRect(0, 0, w, h);  // fade the trails
  if (loop || ++pFades % 30 === 0) {  // 8-bit alpha of 6 or less rounds back to itself, so clear what the fade leaves
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (let k = 3; k < d.length; k += 4) if (d[k] < 8) d[k] = 0;
    ctx.putImageData(img, 0, 0);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; ctx.lineWidth = 1.3; ctx.beginPath();
  for (const q of pParts) {
    if (loop) {
      const s = loop.t + q.phase;
      if (s % particleLife === 0) { [q.x, q.y] = q.seeds[(s / particleLife) % loop.cycles]; q.dead = false; }
      if (q.dead) continue;
    }
    const i = Math.floor(q.x / particleCell), j = Math.floor(q.y / particleCell), k = j * f.W + i;
    const u = i >= 0 && j >= 0 && i < f.W && j < f.H ? f.vx[k] : NaN, v = u === u ? f.vy[k] : NaN;
    if (loop) { if (!Number.isFinite(u + v)) { q.dead = true; continue; } }
    else if (!(q.age++ < particleLife) || !Number.isFinite(u + v)) { q.age = 0; spawnParticle(q); continue; }
    const nx = q.x + u * f.scale, ny = q.y - v * f.scale;  // map y is up, screen y down
    ctx.moveTo(q.x, q.y); ctx.lineTo(nx, ny); q.x = nx; q.y = ny;
  }
  ctx.stroke();
}
// Save particle movie: particleMovieSecs of the particles over a still of the map as shown (the image and every
// line drawn on it, composited from the layer canvases as OpenLayers' map export does) at the screen's
// resolution, as an H.264 MP4 that loops seamlessly: its particleMovieSecs are a whole number of particle
// lives and every particle repeats its starts once per movie (moveParticles' loop mode), and two lives are run
// before the first frame so the trails at the start are those at the end. The live particles pause while it
// encodes; moving the map stops it.
const particleMovieSecs = 10, particleMovieFps = 30;
// The map's layer canvases composited on one W x H canvas (ratio canvas pixels per CSS pixel) over fill.
function compositeMap(W, H, ratio, fill) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = fill; ctx.fillRect(0, 0, W, H);
  for (const lc of map.getViewport().querySelectorAll('.ol-layer canvas, canvas.ol-layer')) {
    if (!lc.width) continue;
    const op = lc.parentNode.style.opacity || lc.style.opacity, tr = lc.style.transform.match(/^matrix\(([^(]*)\)$/);
    const m = tr ? tr[1].split(',').map(Number) : [parseFloat(lc.style.width) / lc.width, 0, 0, parseFloat(lc.style.height) / lc.height, 0, 0];
    ctx.globalAlpha = op === '' ? 1 : +op;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.transform(...m);
    ctx.drawImage(lc, 0, 0);
  }
  return c;
}
function mapStill() {
  // The map composited at the particle canvas's size, once the map has finished rendering (no-data areas are
  // black in the movie).
  return new Promise(resolve => {
    map.once('rendercomplete', () => resolve(compositeMap(pCanvas.width, pCanvas.height, window.devicePixelRatio || 1, '#000000')));
    map.renderSync();
  });
}
async function saveParticleMovie() {
  const note = t => { $('particleNote').textContent = t; };
  if (!pField) return note('Wait for the particles to start, then save.');
  if (!('VideoEncoder' in window)) return note('This browser cannot encode video; use a recent Chrome, Edge, Safari (16.4+) or Firefox (130+).');
  const token = pToken, it = pField.it, fps = particleMovieFps, cycles = Math.max(1, Math.round(particleMovieSecs * fps / particleLife)), n = cycles * particleLife;
  cancelAnimationFrame(pRaf); pRaf = 0;
  $('particleSave').disabled = true;
  try {
    const still = await mapStill();
    if (token !== pToken) throw new Error('the map moved');
    const W = still.width + (still.width % 2), H = still.height + (still.height % 2);
    const bitrate = Math.round(Math.min(20e6, Math.max(4e6, W * H * fps * 0.4))), codec = await pickH264(W, H, bitrate, fps);
    if (!codec) throw new Error(`this browser cannot encode H.264 at ${W} x ${H}; make the window smaller`);
    // The encoder first takes the loop's last warm frames, so its rate control has settled when the
    // movie's first frame (a key frame) follows them; their chunks are dropped. Without this the first frames
    // differ from the last more than one step does, and the loop jumps.
    const warm = Math.min(30, n), muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H, frameRate: fps },
      fastStart: 'in-memory', firstTimestampBehavior: 'offset' });
    let failure = null, nOut = 0, config = null;
    const enc = new VideoEncoder({ output: (chunk, meta) => {
      config ||= meta?.decoderConfig;
      if (nOut++ >= warm) muxer.addVideoChunk(chunk, nOut === warm + 1 ? { ...meta, decoderConfig: meta?.decoderConfig || config } : meta);
    }, error: e => { failure = e; } });
    enc.configure({ codec, width: W, height: H, bitrate, framerate: fps });
    const vc = document.createElement('canvas'); vc.width = W; vc.height = H;
    const vctx = vc.getContext('2d');
    for (const q of pParts) {
      q.phase = Math.floor(Math.random() * particleLife); q.dead = true;
      q.seeds = Array.from({ length: cycles }, () => { spawnParticle(q); return [q.x, q.y]; });
    }
    pCanvas.getContext('2d').clearRect(0, 0, pCanvas.width, pCanvas.height);
    for (let t = -2 * particleLife; t < -warm; t++) moveParticles({ t: t + n, cycles });  // t + n: the same frames, phases kept positive
    for (let i = -warm; i < n; i++) {
      if (token !== pToken) throw new Error('the map moved');
      if (i >= 0 && i % fps === 0) note(`Encoding second ${i / fps + 1} of ${Math.ceil(n / fps)}...`);
      moveParticles({ t: (i + n) % n, cycles });
      vctx.fillStyle = '#000000'; vctx.fillRect(0, 0, W, H);
      vctx.drawImage(still, 0, 0); vctx.drawImage(pCanvas, 0, 0);
      const vf = new VideoFrame(vc, { timestamp: Math.round((i + warm) * 1e6 / fps), duration: Math.round(1e6 / fps) });
      enc.encode(vf, { keyFrame: i === -warm || i === 0 });  // key frames only there: on a still background each one flickers
      vf.close();
      while (enc.encodeQueueSize > 4) await pause(20);
      if (failure) throw failure;
    }
    await enc.flush();
    if (failure) throw failure;
    muxer.finalize();
    const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' }), name = `${items[0]?.raw?.collection || 'grimp'}_particles_${fmtDate(it.start)}.mp4`;
    saveBlob(blob, name);
    note(`Saved ${name} (${(blob.size / 1e6).toFixed(1)} MB, ${(n / fps).toFixed(1)} s loop, ${W} x ${H}).`);
  } catch (e) {
    note(`Particle movie failed: ${e.message}`);
  } finally {
    $('particleSave').disabled = false;
    if (token === pToken && pField && !pRaf) pRaf = requestAnimationFrame(particleFrame);
  }
}
map.on('movestart', () => { if (pField || pRaf) stopParticles(); });
map.on('moveend', refreshParticles);
$('particlesOn').onchange = refreshParticles;
$('particleSave').onclick = saveParticleMovie;
