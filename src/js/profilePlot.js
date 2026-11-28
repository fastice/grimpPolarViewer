// Change from a reference: the reference curve's values interpolated (linearly; NaN where either side has
// none, unless c's distance is one of the reference's own) to curve c's distances and subtracted from c's. The curves can be read at different resolutions.
let pfRef = null;  // href of the reference curve, or null for plain values
function pfChange(c, ref) {
  if (c === ref) return c.v.map(v => (Number.isFinite(v) ? 0 : NaN));
  const out = new Float64Array(c.v.length).fill(NaN), d = ref.d, n = d.length;
  let j = 0;
  for (let k = 0; k < c.v.length; k++) {
    const x = c.d[k];
    if (!Number.isFinite(c.v[k]) || x < d[0] || x > d[n - 1]) continue;
    while (j < n - 2 && d[j + 1] < x) j++;
    const r = x === d[j] ? ref.v[j] : x === d[j + 1] ? ref.v[j + 1] : ref.v[j] + (x - d[j]) / (d[j + 1] - d[j]) * (ref.v[j + 1] - ref.v[j]);  // a sample hit exactly needs no neighbor
    if (Number.isFinite(r)) out[k] = c.v[k] - r;
  }
  return out;
}
// The Plot menu: values, or the change from any curve read (by date); a reference that is removed reverts to values.
function pfRefOptions() {
  const sc = startRef && pfCurves.find(c => c.it.id === startRef && c.v);
  if (sc) { pfRef = sc.href; startRef = null; }
  if (pfRef && !pfCurves.some(c => c.href === pfRef)) pfRef = null;
  const curves = [...pfCurves].sort((a, b) => a.it.start - b.it.start), names = new Set(curves.map(c => c.name));
  const opts = [['', 'values'], ...curves.map(c => [c.href, `change from ${fmtDate(c.it.start)} to ${fmtDate(c.it.end)}${names.size > 1 ? `, ${c.name}` : ''}`])];
  const sel = $('pfRef');
  if (sel.options.length !== opts.length || opts.some(([v], k) => sel.options[k].value !== v))
    sel.replaceChildren(...opts.map(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; }));
  sel.value = pfRef || '';
  $('pfRefRow').hidden = pfCurves.length < 2 && !pfRef;
}
$('pfRef').onchange = () => { pfRef = $('pfRef').value || null; pfAx.y.typed = null; drawProfile(); };
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
  const elev = pfElev?.line === pfLine && $('pfElevOn').checked ? pfElev : null, brown = '#a0683a';
  let R = 14;
  const T = pfMarks.length ? 48 : 30, B = 42, ph = H - T - B, km = pfLen() / 1000;  // room for the travel-time axis
  let L = 82, pw = W - L - R;  // L narrows to fit the y labels once the y range is known
  // Change from a reference curve (picked under Plot): every curve minus it, ITS_LIVE left out.
  if (canvas === $('pfCanvas')) pfRefOptions();
  const ref = pfRef ? pfCurves.find(c => c.href === pfRef && c.v) : null, dv = c => (ref ? pfChange(c, ref) : c.v);
  const unit = pfCurves.find(c => c.unit)?.unit || '';
  const label = `${ref ? `Change in ${pfKey} from ${fmtDate(ref.it.start)}` : pfKey}${unit ? ` (${unit})` : ''}`;
  const its = !ref && $('pfIts').checked && pfIts?.key === pfKey ? pfIts : null;
  ctx.font = '12px "Atkinson Hyperlegible", sans-serif'; ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(`${pfFlow ? 'Flow line' : 'Profile A to B'}: ${label}` + (elev ? '; elevation (brown, right axis)' : '') + (!its ? '' : its.annual ? `; ITS_LIVE (dashed grey): ${its.year} annual mosaic`
    : `; ITS_LIVE (grey): pairs spanning ${fmtDate(new Date((+its.it.start + +its.it.end) / 2))}`), 44, 14, Math.max(60, W - 74));  // right of the move grip, clear of the close x  // clear of the close x
  // x range: the whole line, or as set on its slider (plotted km: from the flow line's point, or from A)
  const xFull = [pfOff / 1000, pfOff / 1000 + km];
  if (canvas === $('pfCanvas')) pfAxSliders('x', xFull, xFull);
  const [xa, xb] = pfAx.x.typed || xFull, inX = dm => (dm + pfOff) / 1000 >= xa - 1e-9 && (dm + pfOff) / 1000 <= xb + 1e-9;
  // y range from the GrIMP curves in that x range (ITS_LIVE is clipped to it), or from ITS_LIVE alone
  let y0 = Infinity, y1 = -Infinity;
  const span = (d, vs) => { for (let k = 0; k < vs.length; k++) { const v = vs[k]; if (Number.isFinite(v) && inX(d[k])) { if (v < y0) y0 = v; if (v > y1) y1 = v; } } };
  for (const c of pfCurves) if (c.v && !c.off) span(c.d, dv(c));
  if (y0 > y1) for (const c of pfCurves) if (c.v) span(c.d, dv(c));  // every curve hidden: keep their axes
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
  // the elevation's range over the x range shown, for the right axis
  let z0 = Infinity, z1 = -Infinity;
  if (elev) for (let k = 0; k < elev.v.length; k++) { const v = elev.v[k]; if (Number.isFinite(v) && inX(elev.d[k])) { z0 = Math.min(z0, v); z1 = Math.max(z1, v); } }
  const zOn = z0 <= z1;
  if (zOn) { if (z0 === z1) { z0 -= 1; z1 += 1; } const zp = (z1 - z0) * 0.06; z0 -= zp; z1 += zp; R = yAxisLeft(ctx, z0, z1) - 8; }
  L = yAxisLeft(ctx, y0, y1); pw = W - L - R;
  const X = dm => L + ((dm + pfOff) / 1000 - xa) / (xb - xa) * pw, Y = v => T + (1 - (v - y0) / (y1 - y0)) * ph;
  const Z = v => T + (1 - (v - z0) / (z1 - z0)) * ph;
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
  // x title under the plot center, kept inside the canvas (squeezed when the plot is narrower than it)
  const xTitle = pfFlow ? 'Distance downstream of the point (km)' : 'Distance from A (km)', xw = Math.min(ctx.measureText(xTitle).width, W - 44) / 2;
  ctx.save(); ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(xTitle, Math.min(Math.max(L + pw / 2, xw + 4), W - xw - 24), H - 3, W - 44);  // clear of the resize corner ctx.restore();
  ctx.strokeStyle = muted; ctx.strokeRect(L, T, pw, ph);
  ctx.save(); ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();
  if (pfFlow) {  // the picked point
    ctx.strokeStyle = '#ff3ea5'; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(X(-pfOff), T); ctx.lineTo(X(-pfOff), T + ph); ctx.stroke(); ctx.setLineDash([]);
  }
  const path = (d, v, F = Y) => {  // a polyline broken at missing values
    ctx.beginPath();
    let on = false;
    for (let k = 0; k < v.length; k++) {
      if (!Number.isFinite(v[k])) { on = false; continue; }
      if (on) ctx.lineTo(X(d[k]), F(v[k])); else ctx.moveTo(X(d[k]), F(v[k]));
      on = true;
    }
    ctx.stroke();
  };
  if (its?.annual) { ctx.strokeStyle = muted; ctx.lineWidth = 1.8; ctx.setLineDash([6, 4]); for (const p of its.pairs) path(its.d, p.v); ctx.setLineDash([]); }
  else if (its) { ctx.strokeStyle = 'rgba(140, 140, 140, 0.45)'; ctx.lineWidth = 1; for (const p of its.pairs) path(its.d, p.v); }
  if (ref) { ctx.strokeStyle = fg; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(L, Y(0)); ctx.lineTo(L + pw, Y(0)); ctx.stroke(); ctx.setLineDash([]); }
  const halo = tok('--panel'), shown = c => selected && c.href === selected.assets[pfKey]?.href;
  if (zOn) { ctx.strokeStyle = halo; ctx.lineWidth = 4; path(elev.d, elev.v, Z); ctx.strokeStyle = brown; ctx.lineWidth = 2; path(elev.d, elev.v, Z); }
  for (const c of [...pfCurves.filter(c => !shown(c)), ...pfCurves.filter(shown)]) {  // the shown product on top
    if (!c.v || c.off) continue;
    const v = dv(c);
    ctx.strokeStyle = halo; ctx.lineWidth = shown(c) ? 4.5 : 3.5; path(c.d, v);
    ctx.strokeStyle = c.color; ctx.lineWidth = shown(c) ? 2.4 : 1.4; path(c.d, v);
  }
  // where the fronts or grounding lines shown cross the line (ticks down from the top, in their year colors)
  const Xk = km => L + (km - xa) / (xb - xa) * pw;
  ctx.lineWidth = 2.5;
  for (const c of fpCross) { ctx.strokeStyle = c.color; ctx.beginPath(); ctx.moveTo(Xk(c.km), T); ctx.lineTo(Xk(c.km), T + 10); ctx.stroke(); }
  ctx.restore();
  if (zOn) {  // the elevation axis on the right, in brown
    ctx.save(); ctx.fillStyle = brown; ctx.strokeStyle = brown; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const zs = niceStep(z1 - z0, 5);
    for (let v = Math.ceil(z0 / zs) * zs; v <= z1; v += zs) {
      ctx.beginPath(); ctx.moveTo(L + pw, Z(v)); ctx.lineTo(L + pw + 4, Z(v)); ctx.stroke();
      ctx.fillText(fmtVal(+v.toPrecision(6)), L + pw + 6, Z(v));
    }
    ctx.translate(W - 10, T + ph / 2); ctx.rotate(Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('Elevation (m, ellipsoid)', 0, 0);
    ctx.restore();
  }
  // the travel-time marks as a time axis along the top: ticks up from the plot, every fifth one longer
  // and labeled in years (+ downstream, - upstream; all labeled when there are few), labels kept apart
  if (pfMarks.length) {
    const step = +$('pfYrStep').value, few = pfMarks.length <= 12;
    ctx.save(); ctx.strokeStyle = fg; ctx.fillStyle = fg; ctx.lineWidth = 1.5; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.font = '11px "Atkinson Hyperlegible", sans-serif';
    let right = L;  // clear of the 'years' title left of the axis
    for (const m of [...pfMarks].sort((a, b) => a.km - b.km)) {
      if (m.km < xa - 1e-9 || m.km > xb + 1e-9) continue;
      const x = Xk(m.km), major = m.t % (5 * step) === 0;
      ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T - (major ? 7 : 4)); ctx.stroke();
      const text = `${m.t > 0 ? '+' : ''}${m.t}`, w = ctx.measureText(text).width;
      if ((major || few) && x - w / 2 > right + 4) { ctx.fillText(text, x, T - 8); right = x + w / 2; }
    }
    ctx.fillStyle = muted; ctx.textAlign = 'right'; ctx.fillText('years', L - 6, T - 8);
    ctx.restore();
  }
  // legend: each curve's dates (and catalog, when more than one), the shown product in bold; a click on
  // an entry hides or shows its curve (hidden entries are faded), a click on its x removes it. On screen
  // a header row minimizes it to a small 'Legend +' box, and a click on that box brings it back (a
  // minimized legend is left out of the saved PNG).
  const scr = canvas === $('pfCanvas'), names = new Set(pfCurves.map(c => c.name)), rowsShown = pfCurves.slice(-8);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  if (scr) pfLegendHits = [];
  if (pfLegendMin && !scr) return;
  const text = c => `${fmtDate(c.it.start)} to ${fmtDate(c.it.end)}${names.size > 1 ? `, ${c.name}` : ''}`;
  ctx.font = '700 11px "Atkinson Hyperlegible", sans-serif';
  const lh = 15, head = scr ? lh : 0, lw = pfLegendMin ? ctx.measureText('Legend +').width + 16 : Math.max(...rowsShown.map(c => ctx.measureText(text(c)).width)) + 50;
  const extra = pfCurves.length - rowsShown.length, lhgt = pfLegendMin ? lh + 6 : head + lh * (rowsShown.length + (extra ? 1 : 0)) + 6;
  // placed by pfLegendPos: fractions of the free room across and down the plot (dragged by the user)
  const lx = L + 6 + pfLegendPos[0] * Math.max(0, pw - lw - 12), ly = T + 6 + pfLegendPos[1] * Math.max(0, ph - lhgt - 12);
  if (scr) pfLegendBox = { x: lx, y: ly, w: lw, h: lhgt, roomX: Math.max(0, pw - lw - 12), roomY: Math.max(0, ph - lhgt - 12) };
  ctx.globalAlpha = 0.85; ctx.fillStyle = halo; ctx.fillRect(lx, ly, lw, lhgt); ctx.globalAlpha = 1;
  if (pfLegendMin) {
    ctx.strokeStyle = muted; ctx.lineWidth = 1; ctx.strokeRect(lx + 0.5, ly + 0.5, lw - 1, lhgt - 1);
    ctx.fillStyle = fg; ctx.fillText('Legend +', lx + 8, ly + lhgt / 2);
    pfLegendHits.push({ x: lx, y: ly, w: lw, h: lhgt, toggle: true });
    return;
  }
  if (scr) {  // the header: click to minimize
    ctx.fillStyle = muted; ctx.font = '400 11px "Atkinson Hyperlegible", sans-serif'; ctx.fillText('Legend', lx + 6, ly + 3 + lh / 2);
    ctx.textAlign = 'center'; ctx.font = '700 13px sans-serif'; ctx.fillText('\u2212', lx + lw - 9, ly + 3 + lh / 2); ctx.textAlign = 'left';
    pfLegendHits.push({ x: lx, y: ly, w: lw, h: head + 3, toggle: true });
  }
  rowsShown.forEach((c, k) => {
    const y = ly + 3 + head + lh * k + lh / 2;
    ctx.globalAlpha = c.off ? 0.35 : 1;
    ctx.strokeStyle = c.color; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(lx + 6, y); ctx.lineTo(lx + 24, y); ctx.stroke();
    ctx.font = `${shown(c) ? 700 : 400} 11px "Atkinson Hyperlegible", sans-serif`; ctx.fillStyle = fg; ctx.fillText(text(c), lx + 28, y);
    ctx.globalAlpha = 1;
    if (scr) {  // the x (screen only, not in the saved PNG)
      ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.font = '700 12px sans-serif'; ctx.fillText('\u00d7', lx + lw - 9, y); ctx.textAlign = 'left';
      pfLegendHits.push({ x: lx + lw - 18, y: y - lh / 2, w: 18, h: lh, c, remove: true }, { x: lx, y: y - lh / 2, w: lw - 18, h: lh, c });
    }
  });
  if (extra) { ctx.fillStyle = muted; ctx.fillText(`and ${extra} earlier`, lx + 28, ly + 3 + head + lh * rowsShown.length + lh / 2); }
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
// The date series controls: the step (only steps at least about the shown product's length are offered),
// Earlier and Later (each adds a date at that end, or slides the window once it holds pfSerMax), and a
// slider over the dates found whose handles set the window and whose band slides it.
function serSteps() {  // offer the steps at least about the shown product's length; 1 year if the one chosen is too short
  const len = selected ? (+selected.end - +selected.start) / 86400e3 : 0, dt = $('pfSerDt');
  for (const o of dt.options) o.hidden = o.disabled = +o.value < 0.9 * len;
  if (dt.selectedOptions[0]?.disabled) dt.value = [...dt.options].find(o => !o.disabled && +o.value >= 365)?.value || dt.value;
}
function serUi() {
  const dt = $('pfSerDt'), n = pfSer?.cands.length || 0;
  $('pfSerWin').hidden = n < 2;
  $('pfSerEarlier').disabled = !pfSer || pfSer.i0 === 0 && pfSer.i1 - pfSer.i0 + 1 >= Math.min(n, pfSerMax);
  $('pfSerLater').disabled = !pfSer || pfSer.i1 === n - 1 && pfSer.i1 - pfSer.i0 + 1 >= Math.min(n, pfSerMax);
  if (!pfSer) { $('pfSerNote').textContent = ''; return; }
  const f = i => `${(100 * (n > 1 ? i / (n - 1) : 0)).toFixed(2)}%`, { cands, i0, i1, anchor } = pfSer, first = cands[i0].it, last = cands[i1].it;
  $('pfSerLo').style.left = f(i0); $('pfSerHi').style.left = f(i1); $('pfSerBand').style.left = f(i0);
  $('pfSerBand').style.width = `${(100 * (n > 1 ? (i1 - i0) / (n - 1) : 0)).toFixed(2)}%`;
  $('pfSerLo').setAttribute('aria-valuetext', fmtDate(first.start)); $('pfSerHi').setAttribute('aria-valuetext', fmtDate(last.start));
  const gaps = cands[i1].k - cands[i0].k + 1 - (i1 - i0 + 1), step = dt.selectedOptions[0].textContent;
  $('pfSerNote').textContent = n < 2 ? `No other product of the same length is a whole number of ${step} steps from ${fmtDate(anchor.start)}; choose another step.`
    : `${i1 - i0 + 1} dates, ${fmtDate(first.start)} to ${fmtDate(last.start)}, every ${step} from ${fmtDate(anchor.start)}`
      + (gaps ? ` (${gaps} step${gaps > 1 ? 's' : ''} with no product)` : '') + `; ${n} found, at most ${pfSerMax} at once.`;
}
function serWindow(i0, i1, wait) {  // a new window (kept to pfSerMax dates, moving the end that did not move)
  if (!pfSer) return;
  if (i1 - i0 + 1 > pfSerMax) { if (i0 !== pfSer.i0) i1 = i0 + pfSerMax - 1; else i0 = i1 - pfSerMax + 1; }
  if (i0 === pfSer.i0 && i1 === pfSer.i1) return;
  Object.assign(pfSer, { i0, i1 }); serUi();
  clearTimeout(serWindow.timer);
  if (wait) serWindow.timer = setTimeout(serApply, 400); else serApply();  // a slider drag reads once it pauses
}
rangeSlider($('pfSerTrack'), ['pfSerLo', 'pfSerHi', 'pfSerBand'], () => {
  const n = pfSer?.cands.length;
  return n > 1 && [pfSer.i0 / (n - 1), pfSer.i1 / (n - 1)];
}, (f0, f1) => { const n = pfSer.cands.length - 1; serWindow(Math.round(f0 * n), Math.round(f1 * n), true); });
$('pfSerEarlier').onclick = () => { const { i0, i1 } = pfSer; if (i0 > 0) serWindow(i0 - 1, i1 - i0 + 1 >= pfSerMax ? i1 - 1 : i1); };
$('pfSerLater').onclick = () => { const { i0, i1 } = pfSer; if (i1 < pfSer.cands.length - 1) serWindow(i1 - i0 + 1 >= pfSerMax ? i0 + 1 : i0, i1 + 1); };
$('pfSerOn').onchange = $('pfSerDt').onchange = () => serStart();
let pfLegendHits = [];  // legend entries on the plot: { x, y, w, h, c } in CSS px
let pfLegendMin = false;  // legend minimized to its 'Legend +' box
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
  if (!pfLegendDrag) { $('pfCanvas').style.cursor = pfLegendAt(e)?.remove || pfLegendAt(e)?.toggle ? 'pointer' : inBox(xy, pfLegendBox) ? 'move' : ''; return; }
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
  if (h.toggle) pfLegendMin = !pfLegendMin;
  else if (h.remove) pfCurves.splice(pfCurves.indexOf(h.c), 1); else h.c.off = !h.c.off;
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
// A typed flow-line point: lat, lon in degrees (negative or S/W for south and west, either order with
// N/S/E/W) or, with km (or m) in the text, x, y in the map's projection (metres when over 20000).
function parseFlowPoint(t) {
  const xy = /\bk?m\b/i.test(t), toks = [...t.matchAll(/(-?\d+(?:\.\d+)?)\s*°?\s*([NSEW])?/gi)];
  if (toks.length !== 2) return null;
  let [a, b] = toks.map(m => +m[1] * (/[sw]/i.test(m[2] || '') ? -1 : 1));
  if (xy) { const m = Math.max(Math.abs(a), Math.abs(b)) > 20000 ? 1 : 1000; return [a * m, b * m]; }
  if (/[ew]/i.test(toks[0][2] || '')) [a, b] = [b, a];  // longitude first
  return Math.abs(a) <= 90 && Math.abs(b) <= 360 ? ol.proj.fromLonLat([b, a], viewCode) : null;
}
$('pfAtGo').onclick = () => {
  const c = parseFlowPoint($('pfAt').value);
  if (!c) { $('pfNote').textContent = 'Type the point as lat, lon (69.17, -49.5) or x, y in km (-180, -2273 km).'; return; }
  if (draw) stopDraw();
  if (tsMode) setTsMode(false);
  const v = map.getView();
  if (!ol.extent.containsCoordinate(v.calculateExtent(map.getSize()), c)) v.setCenter(c);
  newFlowProfile(c);
};
$('pfAt').onkeydown = e => { if (e.key === 'Enter') $('pfAtGo').click(); };
$('pfClear').onclick = () => { if (drawKind === 'profile' || drawKind === 'flow') stopDraw(); clearProfile(); };
$('pfShow').onclick = () => setPfPlot($('pfPlot').hidden);
$('pfHide').onclick = () => setPfPlot(false);
$('pfIts').onchange = () => refreshProfileIts();
$('pfElevOn').onchange = refreshProfileElev;
$('pfYrOn').onchange = $('pfYrStep').onchange = () => travelMarks();
$('pfItsDt').onchange = () => refreshProfileIts();
$('pfSec').addEventListener('toggle', () => { if (!$('pfSec').open && (drawKind === 'profile' || drawKind === 'flow')) stopDraw(); });
floatingPlot($('pfPlot'), $('pfDrag'), $('pfSize'), () => drawProfile());
window.addEventListener('resize', () => { if (!$('pfPlot').hidden) drawProfile(); });
$('pfCsv').onclick = () => {
  const ref = pfRef ? pfCurves.find(c => c.href === pfRef && c.v) : null;  // with a reference, a column of the change from it
  const rows = [['source', 'collection', 'item', 'start', 'end', 'asset', 'unit', 'distance_km', 'x_km', 'y_km', 'lat', 'lon', 'value',
    ...(ref ? [`change_from_${fmtDate(ref.it.start)}`] : [])]];
  const csvText = t => /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  const pos = dm => {
    const [x, y] = pfAt(dm), [lon, lat] = ol.proj.toLonLat([x, y], viewCode);
    return [((dm + pfOff) / 1000).toFixed(3), (x / 1000).toFixed(3), (y / 1000).toFixed(3), lat.toFixed(5), lon.toFixed(5)];
  };
  for (const c of pfCurves) {
    if (!c.v || c.off) continue;
    const ch = ref && pfChange(c, ref);
    for (let k = 0; k < c.v.length; k++) rows.push(['GrIMP', csvText(c.name), c.it.id, fmtDate(c.it.start), fmtDate(c.it.end), c.key, c.unit,
                                                    ...pos(c.d[k]), Number.isNaN(c.v[k]) ? '' : c.v[k], ...(ch ? [Number.isNaN(ch[k]) ? '' : ch[k]] : [])]);
  }
  // the GrIMP DEM elevation along the line, when it is plotted
  const elev = pfElev?.line === pfLine && $('pfElevOn').checked ? pfElev : null;
  if (elev) for (let k = 0; k < elev.v.length; k++) rows.push(['GrIMP', 'NSIDC-0715 GrIMP DEM v2', 'GrIMP_DEM_30m_v02.0', '2008-05-15', '2020-11-19', 'dem', 'm',
    ...pos(elev.d[k]), Number.isNaN(elev.v[k]) ? '' : elev.v[k], ...(ref ? [''] : [])]);
  // ITS_LIVE is drawn for comparison only: data that are not GrIMP products are shown, never exported.
  saveBlob(new Blob([rows.map(r => r.join(',')).join('\n') + '\n'], { type: 'text/csv' }), `${items[0]?.raw?.collection || 'grimp'}_${pfKey}_profile.csv`);
};
$('pfPng').onclick = () => {
  const c = document.createElement('canvas'); c.style.width = `${$('pfCanvas').clientWidth}px`; c.style.height = `${$('pfCanvas').clientHeight}px`;
  document.body.append(c); drawProfile(c, 2); c.remove();
  saveUrl(c.toDataURL('image/png'), `${items[0]?.raw?.collection || 'grimp'}_${pfKey}_profile.png`);
};

