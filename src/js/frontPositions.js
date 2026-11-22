// Front positions along the profile line: where each glacier front (Greenland) or dated grounding line
// (Amundsen Sea) shown on the map, in its year range, crosses the line, as distance along the line (the
// profile plot's km) against date, in a plot of its own, and as ticks along the top of the profile plot.
// These are not GrIMP data, so there is a PNG of the plot but no CSV.
let fpCross = [], fpQueued = 0;  // { t (ms), year, km, kind, glacier, color }, oldest first
function lineCrossings() {
  if (!pfLine) return [];
  const ext = ol.extent.boundingExtent(pfLine), out = [];
  const sets = [{ layer: frontsLayer, sel: frontsSel, color: y => frontColor(y), kind: 'front' },
                { layer: glLayer, sel: glSel, color: y => rampColor(y, glYears), kind: 'grounding line' }];
  for (const { layer, sel, color, kind } of sets) {
    if (!layer.getVisible()) continue;
    for (const f of layer.getSource().getFeaturesInExtent(ext)) {
      const y = f.get('year');
      if (y < sel[0] || y > sel[1]) continue;
      const g = f.getGeometry(), t = Date.parse(f.get('date')) || Date.UTC(y, 6, 1);
      for (const part of g.getType() === 'LineString' ? [g.getCoordinates()] : g.getCoordinates())
        for (const d of crossings(part)) out.push({ t, year: y, km: (d + pfOff) / 1000, kind, glacier: f.get('glacier'), color: color(y) });
    }
  }
  return out.sort((a, b) => a.t - b.t || a.km - b.km);
}
function crossings(part) {  // distances (m from the start of pfLine) where a polyline crosses pfLine
  const out = [];
  for (let i = 1; i < part.length; i++) {
    const p = part[i - 1], q = part[i], s0 = q[0] - p[0], s1 = q[1] - p[1];
    const x0 = Math.min(p[0], q[0]), x1 = Math.max(p[0], q[0]), y0 = Math.min(p[1], q[1]), y1 = Math.max(p[1], q[1]);
    for (let k = 1; k < pfLine.length; k++) {
      const a = pfLine[k - 1], b = pfLine[k];
      if (Math.max(a[0], b[0]) < x0 || Math.min(a[0], b[0]) > x1 || Math.max(a[1], b[1]) < y0 || Math.min(a[1], b[1]) > y1) continue;
      const r0 = b[0] - a[0], r1 = b[1] - a[1], den = r0 * s1 - r1 * s0;
      if (!den) continue;
      const u = ((p[0] - a[0]) * s1 - (p[1] - a[1]) * s0) / den, v = ((p[0] - a[0]) * r1 - (p[1] - a[1]) * r0) / den;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) out.push(pfCum[k - 1] + u * (pfCum[k] - pfCum[k - 1]));
    }
  }
  return out;
}
// Called when the line, the fronts or grounding lines shown, or their year ranges change (once a frame).
function refreshFrontPositions() {
  if (fpQueued) return;
  fpQueued = requestAnimationFrame(() => {
    fpQueued = 0;
    fpCross = lineCrossings();
    const any = frontsLayer.getVisible() || glLayer.getVisible(), what = viewCode === frontsCode ? 'glacier fronts' : 'grounding lines';
    $('fpRow').hidden = !pfLine || !any;
    $('fpNote').textContent = !pfLine || !any ? '' : fpCross.length ? `${fpCross.length} crossings of the line by the ${what} shown, ${fpCross[0].year} to ${fpCross[fpCross.length - 1].year}.`
      : `None of the ${what} shown crosses the line.`;
    $('fpPng').disabled = !fpCross.length;
    if (!pfLine) $('fpPlot').hidden = true;
    if (!$('fpPlot').hidden) drawFrontPositions();
    if (pfLine) drawProfile();
  });
}
function drawFrontPositions(canvas = $('fpCanvas'), scale = window.devicePixelRatio || 1) {
  const W = canvas.clientWidth || 600, H = canvas.clientHeight || 285;
  canvas.width = W * scale; canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const css = getComputedStyle(document.documentElement), tok = n => css.getPropertyValue(n).trim();
  const fg = tok('--fg'), muted = tok('--muted'), line = tok('--line');
  ctx.fillStyle = tok('--panel'); ctx.fillRect(0, 0, W, H);
  const R = 14, T = 30, B = 42, ph = H - T - B, gl = fpCross.some(c => c.kind === 'grounding line');
  ctx.font = '12px "Atkinson Hyperlegible", sans-serif'; ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(`${gl ? 'Grounding lines (NSIDC-0498)' : 'Glacier fronts (NSIDC-0642)'} crossing the ${pfFlow ? 'flow line' : 'line'}, colored by year`, 44, 14, Math.max(60, W - 74));
  if (!fpCross.length) { ctx.fillStyle = muted; ctx.fillText('No crossings', 60, T + ph / 2); return; }
  let y0 = Math.min(...fpCross.map(c => c.km)), y1 = Math.max(...fpCross.map(c => c.km));
  if (y1 - y0 < 0.5) { const m = (y0 + y1) / 2; y0 = m - 0.25; y1 = m + 0.25; }
  const yp = (y1 - y0) * 0.08; y0 -= yp; y1 += yp;
  let t0 = fpCross[0].t, t1 = fpCross[fpCross.length - 1].t;
  const tp = Math.max((t1 - t0) * 0.04, 180 * 86400e3); t0 -= tp; t1 += tp;
  const L = yAxisLeft(ctx, y0, y1), pw = W - L - R, X = t => L + (t - t0) / (t1 - t0) * pw, Y = v => T + (1 - (v - y0) / (y1 - y0)) * ph;
  ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.fillStyle = muted; ctx.textAlign = 'right';
  const ys = niceStep(y1 - y0, 5);
  for (let v = Math.ceil(y0 / ys) * ys; v <= y1; v += ys) { ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(L + pw, Y(v)); ctx.stroke(); ctx.fillText(fmtVal(+v.toPrecision(6) || 0), L - 6, Y(v)); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const y0yr = new Date(t0).getUTCFullYear(), y1yr = new Date(t1).getUTCFullYear(), step = Math.max(1, Math.round((y1yr - y0yr) / 8));
  for (let y = y0yr + 1; y <= y1yr; y += step) { const x = X(Date.UTC(y, 0, 1)); ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke(); ctx.fillText(String(y), x, T + ph + 6); }
  ctx.save(); ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.translate(12, T + ph / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText(pfFlow ? 'Distance downstream of the point (km)' : 'Distance from A (km)', 0, 0); ctx.restore();
  ctx.save(); ctx.fillStyle = fg; ctx.textBaseline = 'bottom'; ctx.fillText('Date', L + pw / 2, H - 3); ctx.restore();
  ctx.strokeStyle = muted; ctx.strokeRect(L, T, pw, ph);
  ctx.save(); ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();
  for (const c of fpCross) {
    ctx.fillStyle = c.color; ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)'; ctx.lineWidth = 1;
    tsMarker(ctx, c.kind === 'front' ? 'circle' : 'triangle', X(c.t), Y(c.km), 4, true); ctx.stroke();
  }
  ctx.restore();
}
for (const l of [frontsLayer, glLayer]) { l.on(['change', 'change:visible'], refreshFrontPositions); l.getSource().on('change', refreshFrontPositions); }
$('fpShow').onclick = () => { $('fpPlot').hidden = !$('fpPlot').hidden; if (!$('fpPlot').hidden) drawFrontPositions(); };
$('fpHide').onclick = () => { $('fpPlot').hidden = true; };
$('fpPng').onclick = () => {
  const c = document.createElement('canvas'); c.style.width = `${$('fpCanvas').clientWidth || 600}px`; c.style.height = `${$('fpCanvas').clientHeight || 285}px`;
  document.body.append(c); drawFrontPositions(c, 2); c.remove();
  saveUrl(c.toDataURL('image/png'), `${items[0]?.raw?.collection || 'grimp'}_front_positions.png`);
};
floatingPlot($('fpPlot'), $('fpDrag'), $('fpSize'), () => drawFrontPositions());
window.addEventListener('resize', () => { if (!$('fpPlot').hidden) drawFrontPositions(); });
