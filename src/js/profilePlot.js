function drawProfile(canvas = $('pfCanvas'), scale = window.devicePixelRatio || 1) {
  $('pfCount').textContent = pfCurves.length ? `(${pfCurves.length} curve${pfCurves.length > 1 ? 's' : ''})` : '';
  if (!pfLine || (canvas === $('pfCanvas') && $('pfPlot').hidden)) return;
  const W = canvas.clientWidth || 600, H = canvas.clientHeight || 285;
  canvas.width = W * scale; canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const css = getComputedStyle(document.documentElement), tok = n => css.getPropertyValue(n).trim();
  const fg = tok('--fg'), muted = tok('--muted'), line = tok('--line');
  ctx.fillStyle = tok('--panel'); ctx.fillRect(0, 0, W, H);
  const L = 82, R = 14, T = 30, B = 42, pw = W - L - R, ph = H - T - B, km = pfLen() / 1000;
  const unit = pfCurves.find(c => c.unit)?.unit || '', label = `${pfKey}${unit ? ` (${unit})` : ''}`;
  const its = $('pfIts').checked && pfIts?.key === pfKey ? pfIts : null;
  ctx.font = '12px "Atkinson Hyperlegible", sans-serif'; ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(`${pfFlow ? 'Flow line' : 'Profile A to B'}: ${label}` + (!its ? '' : its.annual ? `; ITS_LIVE (dashed grey): ${its.year} annual mosaic`
    : `; ITS_LIVE (grey): pairs spanning ${fmtDate(new Date((+its.it.start + +its.it.end) / 2))}`), L, 14, Math.max(60, W - L - 30));  // clear of the close x
  // x range: the whole line, or as set on its slider (plotted km: from the flow line's point, or from A)
  const xFull = [pfOff / 1000, pfOff / 1000 + km];
  if (canvas === $('pfCanvas')) pfAxSliders('x', xFull, xFull);
  const [xa, xb] = pfAx.x.typed || xFull, inX = dm => (dm + pfOff) / 1000 >= xa - 1e-9 && (dm + pfOff) / 1000 <= xb + 1e-9;
  // y range from the GrIMP curves in that x range (ITS_LIVE is clipped to it), or from ITS_LIVE alone
  let y0 = Infinity, y1 = -Infinity;
  const span = (d, vs) => { for (let k = 0; k < vs.length; k++) { const v = vs[k]; if (Number.isFinite(v) && inX(d[k])) { if (v < y0) y0 = v; if (v > y1) y1 = v; } } };
  for (const c of pfCurves) if (c.v && !c.off) span(c.d, c.v);
  if (y0 > y1) for (const c of pfCurves) if (c.v) span(c.d, c.v);  // every curve hidden: keep their axes
  if (y0 > y1 && its) for (const p of its.pairs) span(its.d, p.v);
  if (y0 > y1) { ctx.fillStyle = muted; ctx.fillText(!pfCurves.length ? 'No curves: show a product to add one' : pfCurves.some(c => !c.v) ? 'Reading values...' : 'No data along the line', L + 10, T + ph / 2); return; }
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const yp = (y1 - y0) * 0.06; y0 -= yp; y1 += yp;
  if (canvas === $('pfCanvas')) {
    // the y slider spans these and the 1st-99th percentile of the ITS_LIVE values shown, half a span beyond each
    let lo = y0, hi = y1;
    if (its) {
      const v = its.pairs.flatMap(p => [...p.v].filter((q, k) => Number.isFinite(q) && inX(its.d[k]))).sort((a, b) => a - b);
      if (v.length) { lo = Math.min(lo, v[Math.floor(v.length * 0.01)]); hi = Math.max(hi, v[Math.floor(v.length * 0.99)]); }
    }
    const pad = (hi - lo) * 0.5;
    pfAxSliders('y', [y0, y1], [lo - pad, hi + pad]);
    $('pfAxRow').hidden = false;
  }
  if (pfAx.y.typed) [y0, y1] = pfAx.y.typed;
  const X = dm => L + ((dm + pfOff) / 1000 - xa) / (xb - xa) * pw, Y = v => T + (1 - (v - y0) / (y1 - y0)) * ph;
  ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.fillStyle = muted; ctx.textAlign = 'right';
  const ys = niceStep(y1 - y0, 5);
  for (let v = Math.ceil(y0 / ys) * ys; v <= y1; v += ys) {
    ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(L + pw, Y(v)); ctx.stroke();
    ctx.fillText(fmtVal(+v.toPrecision(6)), L - 6, Y(v));
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const xs = niceStep(xb - xa, 6);  // ticks in plotted km
  for (let k = Math.ceil(xa / xs - 1e-9); k * xs <= xb + 1e-9; k++) {
    const x = k * xs, px = L + (x - xa) / (xb - xa) * pw;
    ctx.beginPath(); ctx.moveTo(px, T); ctx.lineTo(px, T + ph); ctx.stroke();
    ctx.fillText(fmtVal(+x.toPrecision(6) || 0), px, T + ph + 6);
  }
  ctx.save(); ctx.fillStyle = fg; ctx.textBaseline = 'middle';
  ctx.translate(12, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(label, 0, 0); ctx.restore();
  ctx.save(); ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(pfFlow ? 'Distance downstream of the point (km)' : 'Distance from A (km)', L + pw / 2, H - 3); ctx.restore();
  ctx.strokeStyle = muted; ctx.strokeRect(L, T, pw, ph);
  ctx.save(); ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();
  if (pfFlow) {  // the picked point
    ctx.strokeStyle = '#ff3ea5'; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(X(-pfOff), T); ctx.lineTo(X(-pfOff), T + ph); ctx.stroke(); ctx.setLineDash([]);
  }
  const path = (d, v) => {  // a polyline broken at missing values
    ctx.beginPath();
    let on = false;
    for (let k = 0; k < v.length; k++) {
      if (!Number.isFinite(v[k])) { on = false; continue; }
      if (on) ctx.lineTo(X(d[k]), Y(v[k])); else ctx.moveTo(X(d[k]), Y(v[k]));
      on = true;
    }
    ctx.stroke();
  };
  if (its?.annual) { ctx.strokeStyle = muted; ctx.lineWidth = 1.8; ctx.setLineDash([6, 4]); for (const p of its.pairs) path(its.d, p.v); ctx.setLineDash([]); }
  else if (its) { ctx.strokeStyle = 'rgba(140, 140, 140, 0.45)'; ctx.lineWidth = 1; for (const p of its.pairs) path(its.d, p.v); }
  const halo = tok('--panel'), shown = c => selected && c.href === selected.assets[pfKey]?.href;
  for (const c of [...pfCurves.filter(c => !shown(c)), ...pfCurves.filter(shown)]) {  // the shown product on top
    if (!c.v || c.off) continue;
    ctx.strokeStyle = halo; ctx.lineWidth = shown(c) ? 4.5 : 3.5; path(c.d, c.v);
    ctx.strokeStyle = c.color; ctx.lineWidth = shown(c) ? 2.4 : 1.4; path(c.d, c.v);
  }
  ctx.restore();
  // legend: each curve's dates (and catalog, when more than one), the shown product in bold; a click on
  // an entry hides or shows its curve (hidden entries are faded), a click on its x removes it
  const names = new Set(pfCurves.map(c => c.name)), rowsShown = pfCurves.slice(-8);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const text = c => `${fmtDate(c.it.start)} to ${fmtDate(c.it.end)}${names.size > 1 ? `, ${c.name}` : ''}`;
  ctx.font = '700 11px "Atkinson Hyperlegible", sans-serif';
  const lw = Math.max(...rowsShown.map(c => ctx.measureText(text(c)).width)) + 50, lh = 15;
  const extra = pfCurves.length - rowsShown.length, lhgt = lh * (rowsShown.length + (extra ? 1 : 0)) + 6;
  // placed by pfLegendPos: fractions of the free room across and down the plot (dragged by the user)
  const lx = L + 6 + pfLegendPos[0] * Math.max(0, pw - lw - 12), ly = T + 6 + pfLegendPos[1] * Math.max(0, ph - lhgt - 12);
  if (canvas === $('pfCanvas')) pfLegendBox = { x: lx, y: ly, w: lw, h: lhgt, roomX: Math.max(0, pw - lw - 12), roomY: Math.max(0, ph - lhgt - 12) };
  ctx.globalAlpha = 0.85; ctx.fillStyle = halo; ctx.fillRect(lx, ly, lw, lhgt); ctx.globalAlpha = 1;
  if (canvas === $('pfCanvas')) pfLegendHits = [];
  rowsShown.forEach((c, k) => {
    const y = ly + 3 + lh * k + lh / 2;
    ctx.globalAlpha = c.off ? 0.35 : 1;
    ctx.strokeStyle = c.color; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(lx + 6, y); ctx.lineTo(lx + 24, y); ctx.stroke();
    ctx.font = `${shown(c) ? 700 : 400} 11px "Atkinson Hyperlegible", sans-serif`; ctx.fillStyle = fg; ctx.fillText(text(c), lx + 28, y);
    ctx.globalAlpha = 1;
    if (canvas === $('pfCanvas')) {  // the x (screen only, not in the saved PNG)
      ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.font = '700 12px sans-serif'; ctx.fillText('\u00d7', lx + lw - 9, y); ctx.textAlign = 'left';
      pfLegendHits.push({ x: lx + lw - 18, y: y - lh / 2, w: 18, h: lh, c, remove: true }, { x: lx, y: y - lh / 2, w: lw - 18, h: lh, c });
    }
  });
  if (extra) { ctx.fillStyle = muted; ctx.fillText(`and ${extra} earlier`, lx + 28, ly + 3 + lh * rowsShown.length + lh / 2); }
}
// Plot x and y ranges (pfAx): automatic, or set with two-handle sliders like the time-series y range.
function pfAxSliders(k, auto, span) {
  const a = pfAx[k], P = k.toUpperCase(), [v0, v1] = a.typed || auto;
  a.span = span[1] > span[0] ? span : [span[0] - 1, span[1] + 1];
  const pos = v => Math.min(1, Math.max(0, (v - a.span[0]) / (a.span[1] - a.span[0])));
  a.pos = [pos(v0), pos(v1)];
  const [l, r] = a.pos.map(f => `${(100 * f).toFixed(2)}%`);
  $(`pf${P}Lo`).style.left = l; $(`pf${P}Hi`).style.left = r; $(`pf${P}Band`).style.left = l;
  $(`pf${P}Band`).style.width = `${(100 * (a.pos[1] - a.pos[0])).toFixed(2)}%`;
  $(`pf${P}Lo`).setAttribute('aria-valuetext', fmtVal(+v0.toPrecision(4))); $(`pf${P}Hi`).setAttribute('aria-valuetext', fmtVal(+v1.toPrecision(4)));
  $(`pf${P}MinV`).textContent = fmtVal(+v0.toPrecision(4) || 0); $(`pf${P}MaxV`).textContent = fmtVal(+v1.toPrecision(4) || 0);
  $(`pf${P}Auto`).hidden = !a.typed;
}
for (const k of ['x', 'y']) {
  const P = k.toUpperCase(), a = pfAx[k];
  rangeSlider($(`pf${P}Track`), [`pf${P}Lo`, `pf${P}Hi`, `pf${P}Band`], () => a.span && a.pos, (f0, f1) => {
    const v = f => a.span[0] + (a.span[1] - a.span[0]) * f;
    a.typed = [v(f0), v(f1)];
    drawProfile();
  });
  $(`pf${P}Auto`).onclick = () => { a.typed = null; drawProfile(); };
}
let pfLegendHits = [];  // legend entries on the plot: { x, y, w, h, c } in CSS px
let pfLegendPos = [1, 0], pfLegendBox = null, pfLegendDrag = null, pfLegendDropped = -Infinity;  // top right at first
const pfXY = e => { const r = $('pfCanvas').getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
const inBox = ([x, y], h) => h && x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h;
const pfLegendAt = e => pfLegendHits.find(h => inBox(pfXY(e), h));
// Dragging the legend moves it (a press that moves less than 4 px is a click on an entry instead).
$('pfCanvas').addEventListener('pointerdown', e => {
  if (!inBox(pfXY(e), pfLegendBox)) return;
  pfLegendDrag = { start: pfXY(e), pos: [...pfLegendPos], moved: false };
  $('pfCanvas').setPointerCapture(e.pointerId);
});
$('pfCanvas').addEventListener('pointermove', e => {
  const xy = pfXY(e);
  if (!pfLegendDrag) { $('pfCanvas').style.cursor = pfLegendAt(e)?.remove ? 'pointer' : inBox(xy, pfLegendBox) ? 'move' : ''; return; }
  const dx = xy[0] - pfLegendDrag.start[0], dy = xy[1] - pfLegendDrag.start[1];
  if (!pfLegendDrag.moved && Math.hypot(dx, dy) < 4) return;
  pfLegendDrag.moved = true;
  const f = (v, room) => Math.min(1, Math.max(0, room ? v : 0));
  pfLegendPos = [f(pfLegendDrag.pos[0] + dx / pfLegendBox.roomX, pfLegendBox.roomX), f(pfLegendDrag.pos[1] + dy / pfLegendBox.roomY, pfLegendBox.roomY)];
  drawProfile();
});
$('pfCanvas').addEventListener('pointerup', e => { if (pfLegendDrag?.moved) pfLegendDropped = e.timeStamp; pfLegendDrag = null; });
$('pfCanvas').addEventListener('pointercancel', () => { pfLegendDrag = null; });
$('pfCanvas').addEventListener('click', e => {
  if (e.timeStamp - pfLegendDropped < 300) return;  // the end of a drag, not a click
  const h = pfLegendAt(e);
  if (!h) return;
  if (h.remove) pfCurves.splice(pfCurves.indexOf(h.c), 1); else h.c.off = !h.c.off;
  $('pfCsv').disabled = $('pfPng').disabled = !pfCurves.length;
  drawProfile();
});
function setPfPlot(show) {
  $('pfPlot').hidden = !show;
  $('pfShow').hidden = false; $('pfShow').textContent = show ? 'Hide plot' : 'Show plot';
  if (show) drawProfile();
}
$('pfDraw').onclick = () => {
  if (draw) { const was = drawKind; stopDraw(); if (was === 'profile') return; refreshAnimInfo(); }
  if (tsMode) setTsMode(false);
  draw = new ol.interaction.Draw({ type: 'LineString', maxPoints: 2, style: outline('#ff3ea5') }); drawKind = 'profile';
  draw.on('drawend', e => {
    const c = e.feature.getGeometry().getCoordinates(), line = [c[0], c[c.length - 1]];
    pfDrawnAt = performance.now();
    setTimeout(() => {
      stopDraw();
      if (line[0][0] === line[1][0] && line[0][1] === line[1][1]) { $('pfNote').textContent = 'A and B must be different points; draw the line again.'; return; }
      newProfile(line);
    });
  });
  map.addInteraction(draw);
  $('pfDraw').textContent = 'Cancel';
  $('pfNote').textContent = 'Click the start of the line (A), then the end (B).';
};
$('pfFlow').onclick = () => {
  if (draw) { const was = drawKind; stopDraw(); if (was === 'flow') return; refreshAnimInfo(); }
  if (tsMode) setTsMode(false);
  draw = new ol.interaction.Draw({ type: 'Point', style: outline('#ff3ea5') }); drawKind = 'flow';
  draw.on('drawend', e => {
    const p = e.feature.getGeometry().getCoordinates();
    pfDrawnAt = performance.now();
    setTimeout(() => { stopDraw(); newFlowProfile(p); });
  });
  map.addInteraction(draw);
  $('pfFlow').textContent = 'Cancel';
  $('pfNote').textContent = 'Click a point on the glacier; the line follows the flow up and down stream from it.';
};
$('pfClear').onclick = () => { if (drawKind === 'profile' || drawKind === 'flow') stopDraw(); clearProfile(); };
$('pfShow').onclick = () => setPfPlot($('pfPlot').hidden);
$('pfHide').onclick = () => setPfPlot(false);
$('pfIts').onchange = () => refreshProfileIts();
$('pfItsDt').onchange = () => refreshProfileIts();
$('pfSec').addEventListener('toggle', () => { if (!$('pfSec').open && (drawKind === 'profile' || drawKind === 'flow')) stopDraw(); });
floatingPlot($('pfPlot'), $('pfDrag'), $('pfSize'), () => drawProfile());
window.addEventListener('resize', () => { if (!$('pfPlot').hidden) drawProfile(); });
$('pfCsv').onclick = () => {
  const rows = [['source', 'collection', 'item', 'start', 'end', 'asset', 'unit', 'distance_km', 'x_km', 'y_km', 'lat', 'lon', 'value']];
  const csvText = t => /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  const pos = dm => {
    const [x, y] = pfAt(dm), [lon, lat] = ol.proj.toLonLat([x, y], viewCode);
    return [((dm + pfOff) / 1000).toFixed(3), (x / 1000).toFixed(3), (y / 1000).toFixed(3), lat.toFixed(5), lon.toFixed(5)];
  };
  for (const c of pfCurves) {
    if (!c.v || c.off) continue;
    for (let k = 0; k < c.v.length; k++) rows.push(['GrIMP', csvText(c.name), c.it.id, fmtDate(c.it.start), fmtDate(c.it.end), c.key, c.unit,
                                                    ...pos(c.d[k]), Number.isNaN(c.v[k]) ? '' : c.v[k]]);
  }
  // ITS_LIVE is drawn for comparison only: data that are not GrIMP products are shown, never exported.
  saveBlob(new Blob([rows.map(r => r.join(',')).join('\n') + '\n'], { type: 'text/csv' }), `${items[0]?.raw?.collection || 'grimp'}_${pfKey}_profile.csv`);
};
$('pfPng').onclick = () => {
  const c = document.createElement('canvas'); c.style.width = `${$('pfCanvas').clientWidth}px`; c.style.height = `${$('pfCanvas').clientHeight}px`;
  document.body.append(c); drawProfile(c, 2); c.remove();
  saveUrl(c.toDataURL('image/png'), `${items[0]?.raw?.collection || 'grimp'}_${pfKey}_profile.png`);
};

