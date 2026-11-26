let tsPlotInfo = null;
let tsTrendMin = false, tsTrendPos = null, tsTrendBox = null, tsTrendDrag = null, tsTrendDropped = -Infinity;  // the trend box
// Plot y range: automatic (the GrIMP values with their error bars), or set with the two sliders, which
// span the GrIMP values and the 1st-99th percentile of the ITS_LIVE values shown (half a span beyond each).
let tsYTyped = null, tsYSpan = null;
function tsYSliders(a0, a1, itsOn) {
  let lo = a0, hi = a1;
  if (itsOn) {
    const maxDt = +$('tsItsDt').value, v = tsVisible().flatMap(p => p.itsKey === tsPlotInfo.key && p.its ? p.its.filter(q => q.dt <= maxDt).map(q => q.v) : []).sort((x, y) => x - y);
    if (v.length) { lo = Math.min(lo, v[Math.floor(v.length * 0.01)]); hi = Math.max(hi, v[Math.floor(v.length * 0.99)]); }
  }
  const pad = (hi - lo) * 0.5;
  tsYSpan = [lo - pad, hi + pad];
  const [y0, y1] = tsYTyped || [a0, a1], pos = v => Math.min(1, Math.max(0, (v - tsYSpan[0]) / (tsYSpan[1] - tsYSpan[0])));
  tsYPos = [pos(y0), pos(y1)];
  const [a, b] = tsYPos.map(f => `${(100 * f).toFixed(2)}%`);
  $('tsYLo').style.left = a; $('tsYHi').style.left = b; $('tsYBand').style.left = a; $('tsYBand').style.width = `${(100 * (tsYPos[1] - tsYPos[0])).toFixed(2)}%`;
  $('tsYLo').setAttribute('aria-valuetext', fmtVal(+y0.toPrecision(4))); $('tsYHi').setAttribute('aria-valuetext', fmtVal(+y1.toPrecision(4)));
  $('tsYMinV').textContent = fmtVal(+y0.toPrecision(4)); $('tsYMaxV').textContent = fmtVal(+y1.toPrecision(4));
  $('tsYAuto').hidden = !tsYTyped;
}
let tsYPos = [0, 1];  // handle positions, 0-1 along tsYSpan
function tsYSet(a, b) {
  if (!tsYSpan) return;
  const v = f => tsYSpan[0] + (tsYSpan[1] - tsYSpan[0]) * f;
  tsYTyped = [v(a), v(b)];
  drawTsPlot();
}
function rangeSlider(track, [loId, hiId, bandId], pos, set) {
  // A plot-range slider: pos() gives the handle positions [a, b] (0-1, null while inactive), set(a, b) applies new ones.
  // Drag a handle, click the track to move the nearer handle there, or drag the band to shift the range
  // keeping its height; arrow keys move a focused handle or the band by 1% (Page Up/Down 10%).
  const gap = 0.01;
  let drag = null;
  const frac = e => { const r = track.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
  const move = f => {
    const { which, f0, a, b } = drag, p = pos();
    if (which === 'band') { const d = Math.min(Math.max(f - f0, -a), 1 - b); set(a + d, b + d); }
    else if (which === 0) set(Math.min(f, p[1] - gap), p[1]);
    else set(p[0], Math.max(f, p[0] + gap));
  };
  track.addEventListener('pointerdown', e => {
    if (!pos()) return;
    const f = frac(e), [a, b] = pos(), id = e.target.id;
    drag = { which: id === loId ? 0 : id === hiId ? 1 : id === bandId ? 'band' : Math.abs(f - a) <= Math.abs(f - b) ? 0 : 1, f0: f, a, b };
    track.setPointerCapture(e.pointerId); e.preventDefault(); e.target.focus?.();
    if (drag.which !== 'band') move(f);
  });
  track.addEventListener('pointermove', e => { if (drag) move(frac(e)); });
  for (const t of ['pointerup', 'pointercancel']) track.addEventListener(t, () => { drag = null; });
  for (const [id, k] of [[loId, 0], [hiId, 1], [bandId, 2]]) $(id).addEventListener('keydown', e => {
    const step = { ArrowLeft: -gap, ArrowDown: -gap, ArrowRight: gap, ArrowUp: gap, PageDown: -0.1, PageUp: 0.1 }[e.key];
    if (step === undefined || !pos()) return;
    e.preventDefault();
    let [a, b] = pos();
    if (k === 2) { const d = Math.min(Math.max(step, -a), 1 - b); a += d; b += d; }
    else if (k === 0) a = Math.min(Math.max(a + step, 0), b - gap);
    else b = Math.max(Math.min(b + step, 1), a + gap);
    set(a, b);
  });
}
rangeSlider($('tsYTrack'), ['tsYLo', 'tsYHi', 'tsYBand'], () => tsYSpan && tsYPos, tsYSet);
// Each point's ITS_LIVE cloud gets its own grey level, shown beside the point in the legend.
const itsGreys = [175, 95, 135, 210, 60, 155, 115, 190];
const itsGrey = (p, a = 1) => { const g = itsGreys[(p.n - 1) % itsGreys.length]; return `rgba(${g}, ${g}, ${g}, ${a})`; };
function niceStep(span, target) {
  const raw = span / target, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
}
// Left margin that just fits the y tick labels (right-aligned at L - 6) beside the rotated axis title.
function yAxisLeft(ctx, y0, y1) {
  const ys = niceStep(y1 - y0, 5);
  let w = 0;
  for (let v = Math.ceil(y0 / ys) * ys; v <= y1; v += ys) w = Math.max(w, ctx.measureText(fmtVal(+v.toPrecision(6))).width);
  return Math.ceil(w) + 30;
}
function drawTsPlot(canvas = $('tsCanvas'), scale = window.devicePixelRatio || 1) {
  if (!tsPlotInfo) return;
  const W = canvas.clientWidth || 600, H = canvas.clientHeight || 285;
  canvas.width = W * scale; canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const css = getComputedStyle(document.documentElement), tok = n => css.getPropertyValue(n).trim();
  const fg = tok('--fg'), muted = tok('--muted'), line = tok('--line');
  ctx.fillStyle = tok('--panel'); ctx.fillRect(0, 0, W, H);
  const ovAll = tsOverlays(), ovNames = [...new Set(ovAll.map(o => o.l.name))], vis = tsVisible();
  const ovs = ovAll.filter(o => vis.includes(o.p) && !tsLayerOff.has(o.l.name)), curOff = tsLayerOff.has(tsPlotInfo.name), scr = canvas === $('tsCanvas');
  if (scr) tsLegendHits = [];
  // Title, left of the point legend (top right); the ITS_LIVE part goes on a second line when both do not fit.
  const itsOn = $('tsIts').checked && tsPlotInfo.key in itsVars;
  // Seasonal: x is the time of year, each year's values joined by a line in its color on the year ramp
  // (markers keep the point colors), with a thick line (black, or white in dark mode) through each point's
  // mean of every calendar month; earlier catalogs are drawn as markers only. The year of the product on
  // the map (clicking a value shows it) is drawn on top, thicker and labeled, and the other years fade.
  const seasonal = $('tsXMode').value === 'season';
  const midYear = it => new Date((+it.start + +it.end) / 2).getUTCFullYear();
  const yearsShown = (curOff ? [] : vis).flatMap(p => p.values.filter(x => Number.isFinite(x.v)).map(x => new Date((+x.it.start + +x.it.end) / 2).getUTCFullYear()));
  const yrs = yearsShown.length ? [Math.min(...yearsShown), Math.max(...yearsShown)] : [0, 1];
  const head1 = `GrIMP (color): ${tsPlotInfo.key}${tsPlotInfo.unit ? ` (${tsPlotInfo.unit})` : ''}${tsPlotInfo.withErr ? ', error bars 1 sigma' : ''}`
    + (seasonal && yearsShown.length ? `; lines by year, ${yrs[0]} blue to ${yrs[1]} red; thick: monthly mean`
      + (selected && yearsShown.includes(midYear(selected)) ? `; ${midYear(selected)} on top (${fmtDate(selected.start)} shown)` : '') : '');
  const head2 = itsOn ? `ITS_LIVE (grey): pairs${+$('tsItsDt').value < 1e5 ? ` up to ${$('tsItsDt').value} d` : ''}` : '';
  const R = 14, L0 = 44, titleMax = Math.max(60, W - R - L0 - (scr ? 30 * tsPoints.length + 22 : 18 * tsPoints.length + 16));
  ctx.font = '12px "Atkinson Hyperlegible", sans-serif'; ctx.fillStyle = fg; ctx.textBaseline = 'middle';
  const split = head2 && ctx.measureText(`${head1}; ${head2}`).width > titleMax, hy = split ? 16 : 0;  // hy: height of the extra line
  const T = (ovAll.length ? 46 : 30) + hy, B = 42, ph = H - T - B;
  let L = 82, pw = W - L - R;  // L narrows to fit the y labels once the y range is known
  const pts = (curOff ? [] : vis).flatMap(p => p.values.map(x => ({ t: (+x.it.start + +x.it.end) / 2, v: x.v, e: x.e })))
    .concat(ovs.flatMap(o => o.l.values));
  const finite = pts.filter(q => Number.isFinite(q.v));
  ctx.fillText(split || !head2 ? head1 : `${head1}; ${head2}`, L0, 14, titleMax);  // maxWidth squeezes what still does not fit
  if (split) ctx.fillText(head2, L0, 30, titleMax);
  if (ovAll.length) {
    // Which line style is which catalog: filled circles = the catalog shown now.
    ctx.save(); ctx.font = '11px "Atkinson Hyperlegible", sans-serif'; ctx.fillStyle = muted; ctx.strokeStyle = muted;
    // A click on an entry hides or shows that catalog's series at every point; the x of an earlier
    // catalog (screen only) drops its series from all points.
    let lx = L0;
    const entry = (shape, fill, dash, text, name, removable) => {
      const x0 = lx;
      ctx.globalAlpha = tsLayerOff.has(name) ? 0.35 : 1;
      const ry = 32 + hy;
      if ($('tsStyle').value !== 'points') { ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(lx, ry); ctx.lineTo(lx + 18, ry); ctx.stroke(); ctx.setLineDash([]); }
      if ($('tsStyle').value !== 'lines') tsMarker(ctx, shape, lx + 9, ry, 3.2, fill); ctx.fillText(text, lx + 23, ry); lx += 23 + ctx.measureText(text).width;
      ctx.globalAlpha = 1;
      if (scr) {
        tsLegendHits.push({ x: x0, y: ry - 8, w: lx - x0, h: 16, name });
        if (removable) { ctx.fillText('\u00d7', lx + 4, ry); tsLegendHits.push({ x: lx + 1, y: ry - 8, w: 11, h: 16, name, remove: true }); lx += 12; }
      }
      lx += 14;
    };
    entry('circle', true, [], `${tsPlotInfo.name} (shown)`, tsPlotInfo.name, false);
    ovNames.forEach((n, k) => entry(ovStyles[k % ovStyles.length].shape, false, ovStyles[k % ovStyles.length].dash, n, n, true));
    ctx.restore();
  }
  if (!finite.length) { ctx.fillStyle = muted; ctx.fillText(!$('tsProg').hidden ? 'Reading values...' : curOff || tsLayerOff.size || tsPoints.some(p => p.off)
    ? 'Every series is hidden: click the legend to show them' : 'No data at these points', L + 10, T + ph / 2); drawTsLegend(ctx, canvas, W, R, itsOn); return; }
  let y0 = Math.min(...finite.map(q => q.v - (Number.isFinite(q.e) ? q.e : 0)));
  let y1 = Math.max(...finite.map(q => q.v + (Number.isFinite(q.e) ? q.e : 0)));
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const yp = (y1 - y0) * 0.06; y0 -= yp; y1 += yp;
  if (canvas === $('tsCanvas')) tsYSliders(y0, y1, itsOn);
  if (tsYTyped) [y0, y1] = tsYTyped;
  L = yAxisLeft(ctx, y0, y1); pw = W - L - R;
  // x axis: the time-bar range, or every date plotted (both fixed while values arrive)
  const inR = $('tsXBar').checked ? inRange() : [];
  const ts = inR.length ? inR.flatMap(it => [+it.start, +it.end]) : tsPlotInfo.times.concat(ovs.flatMap(o => o.l.values.map(x => x.t)));
  let t0 = Math.min(...ts), t1 = Math.max(...ts);
  const tp = Math.max((t1 - t0) * 0.04, 86400e3 * 5); t0 -= tp; t1 += tp;
  const yearFrac = t => { const y = new Date(t).getUTCFullYear(), a = Date.UTC(y, 0, 1); return (t - a) / (Date.UTC(y + 1, 0, 1) - a); };
  const X = seasonal ? t => L + yearFrac(t) * pw : t => L + (t - t0) / (t1 - t0) * pw, Y = v => T + (1 - (v - y0) / (y1 - y0)) * ph;
  // grid and y labels
  const ys = niceStep(y1 - y0, 5);
  ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.fillStyle = muted; ctx.textAlign = 'right';
  for (let v = Math.ceil(y0 / ys) * ys; v <= y1; v += ys) {
    ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(L + pw, Y(v)); ctx.stroke();
    ctx.fillText(fmtVal(+v.toPrecision(6)), L - 6, Y(v));
  }
  // axis titles: the asset and unit up the left side, Date along the bottom
  ctx.save(); ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.translate(12, T + ph / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText(`${tsPlotInfo.key}${tsPlotInfo.unit ? ` (${tsPlotInfo.unit})` : ''}`, 0, 0); ctx.restore();
  ctx.save(); ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(seasonal ? 'Month' : 'Date', L + pw / 2, H - 3); ctx.restore();
  // x labels: years for long spans, months otherwise
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const d0 = new Date(t0), d1 = new Date(t1), years = (t1 - t0) / (365.25 * 86400e3);
  if (seasonal) {
    const months = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
    for (let m = 0; m < 12; m++) {
      const x = L + yearFrac(Date.UTC(2001, m, 1)) * pw;
      ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke();
      ctx.fillText(months[m], L + yearFrac(Date.UTC(2001, m, 15)) * pw, T + ph + 6);
    }
  } else if (years > 2) {
    const step = Math.max(1, Math.round(years / 8));
    for (let y = d0.getUTCFullYear() + 1; y <= d1.getUTCFullYear(); y += step) {
      const x = X(Date.UTC(y, 0, 1));
      ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke();
      ctx.fillText(String(y), x, T + ph + 6);
    }
  } else {
    const step = Math.max(1, Math.round(years * 12 / 8));
    for (let m = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1)); m <= d1; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + step, 1))) {
      const x = X(+m);
      ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke();
      ctx.fillText(m.toISOString().slice(0, 7), x, T + ph + 6);
    }
  }
  ctx.strokeStyle = muted; ctx.strokeRect(L, T, pw, ph);
  // ITS_LIVE image pairs (light grey, clipped to the axes set by the GrIMP values)
  if ($('tsIts').checked && tsPlotInfo.key in itsVars) {
    const maxDt = +$('tsItsDt').value;
    ctx.save(); ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();
    for (const p of vis) {
      if (p.itsKey !== tsPlotInfo.key || !p.its) continue;
      ctx.fillStyle = itsGrey(p, 0.55);
      for (const q of p.its) if (q.dt <= maxDt) ctx.fillRect(X(q.t) - 1.25, Y(q.v) - 1.25, 2.5, 2.5);
    }
    ctx.restore();
  }
  // The displayed date: a thin dashed line (on screen only; the saved PNG leaves it out).
  const onScreen = canvas === $('tsCanvas'), tSel = selected ? (+selected.start + +selected.end) / 2 : NaN;
  if (onScreen && Number.isFinite(tSel) && (seasonal || (tSel >= t0 && tSel <= t1))) {
    ctx.save(); ctx.strokeStyle = fg; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(X(tSel), T); ctx.lineTo(X(tSel), T + ph); ctx.stroke(); ctx.restore();
  }
  if (onScreen) tsPlotInfo.geom = { X, Y };  // for picking a date by clicking the plot
  ctx.save(); ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();

  // Earlier catalogs, under the catalog shown (which is drawn on top): dashed lines and large hollow
  // markers in the point's color, haloed in the panel color so they stay visible through the newer series.
  const halo = tok('--panel'), style = $('tsStyle').value, lines = style !== 'points', marks = style !== 'lines';
  for (const { p, l, k } of ovs) {
    const st = ovStyles[k % ovStyles.length], q = l.values.filter(x => Number.isFinite(x.v));
    const path = () => { ctx.beginPath(); q.forEach((x, i) => (i ? ctx.lineTo(X(x.t), Y(x.v)) : ctx.moveTo(X(x.t), Y(x.v)))); ctx.stroke(); };
    if (lines && !seasonal) {
      ctx.setLineDash(st.dash);
      ctx.strokeStyle = halo; ctx.lineWidth = 3.5; path();
      ctx.strokeStyle = p.color; ctx.lineWidth = 1.5; path();
      ctx.setLineDash([]);
    }
    if (marks) for (const x of q) {
      if (tsPlotInfo.withErr && Number.isFinite(x.e) && x.e > 0) {
        ctx.strokeStyle = p.color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(x.t), Y(x.v - x.e)); ctx.lineTo(X(x.t), Y(x.v + x.e)); ctx.stroke();
      }
      ctx.strokeStyle = halo; ctx.lineWidth = 3.5; tsMarker(ctx, st.shape, X(x.t), Y(x.v), 5, false);
      ctx.strokeStyle = p.color; ctx.lineWidth = 1.6; tsMarker(ctx, st.shape, X(x.t), Y(x.v), 5, false);
    }
  }
  // series: line, error bars, markers
  for (const p of curOff ? [] : vis) {
    const q = p.values.map(x => ({ t: (+x.it.start + +x.it.end) / 2, v: x.v, e: x.e })).filter(x => Number.isFinite(x.v));
    ctx.strokeStyle = p.color; ctx.fillStyle = p.color; ctx.lineWidth = 1.6;
    const yOf = x => new Date(x.t).getUTCFullYear(), selY = seasonal && selected && q.some(x => yOf(x) === midYear(selected)) ? midYear(selected) : null;
    const fade = x => (selY !== null && yOf(x) !== selY ? 0.45 : 1);
    // Seasonal lines are wide and cased in grey, so the pale middle of the year ramp shows on a light panel.
    if (lines && seasonal) {
      for (const y of [...new Set(q.map(yOf))].sort((a, b) => (a === selY) - (b === selY))) {  // the selected year last
        const qy = q.filter(x => yOf(x) === y), top = y === selY;
        ctx.globalAlpha = fade(qy[0]);
        for (const [w, c] of [[top ? 6.5 : 4.5, 'rgba(90, 90, 90, 0.55)'], [top ? 4.5 : 2.8, rampColor(y, yrs)]]) {
          ctx.lineWidth = w; ctx.strokeStyle = c; ctx.beginPath(); qy.forEach((x, i) => (i ? ctx.lineTo(X(x.t), Y(x.v)) : ctx.moveTo(X(x.t), Y(x.v)))); ctx.stroke();
        }
        if (top) {
          const e = qy[qy.length - 1];
          ctx.font = '700 12px "Atkinson Hyperlegible", sans-serif'; ctx.textBaseline = 'middle';
          const right = X(e.t) + 7 + ctx.measureText(String(y)).width <= L + pw, lx = right ? X(e.t) + 7 : X(e.t) - 9, ly = Y(e.v) - (right ? 0 : 12);  // left of a point near the right edge
          ctx.textAlign = right ? 'left' : 'right';
          ctx.lineWidth = 3; ctx.strokeStyle = halo; ctx.strokeText(String(y), lx, ly); ctx.fillStyle = rampColor(y, yrs); ctx.fillText(String(y), lx, ly);
        }
      }
      ctx.globalAlpha = 1; ctx.lineWidth = 1.6; ctx.strokeStyle = p.color; ctx.fillStyle = p.color;
    } else if (lines) { ctx.beginPath(); q.forEach((x, i) => (i ? ctx.lineTo(X(x.t), Y(x.v)) : ctx.moveTo(X(x.t), Y(x.v)))); ctx.stroke(); }
    ctx.lineWidth = 1.2;
    if (marks) for (const x of q) {
      if (Number.isFinite(x.e) && x.e > 0) {
        ctx.beginPath(); ctx.moveTo(X(x.t), Y(x.v - x.e)); ctx.lineTo(X(x.t), Y(x.v + x.e));
        ctx.moveTo(X(x.t) - 3, Y(x.v - x.e)); ctx.lineTo(X(x.t) + 3, Y(x.v - x.e));
        ctx.moveTo(X(x.t) - 3, Y(x.v + x.e)); ctx.lineTo(X(x.t) + 3, Y(x.v + x.e)); ctx.stroke();
      }
      // seasonal with one point: markers in their year's color, ringed in the point's
      if (seasonal && vis.length === 1) { ctx.fillStyle = rampColor(yOf(x), yrs); ctx.strokeStyle = p.color; ctx.lineWidth = 1.5; }
      ctx.globalAlpha = fade(x); ctx.beginPath(); ctx.arc(X(x.t), Y(x.v), seasonal ? 4 : 3.2, 0, 2 * Math.PI); ctx.fill();
      if (seasonal && vis.length === 1) { ctx.stroke(); ctx.fillStyle = ctx.strokeStyle = p.color; ctx.lineWidth = 1.2; }
      ctx.globalAlpha = 1;
    }
  }
  // Trend: a least-squares line (or line plus annual cycle) through each point's values on the x axis
  // (dashed, haloed, in the point's color) over the dates it fits, weighted by the errors when error bars
  // are on, and a box listing each rate per year with its 1-sigma error, r2 and p (and the cycle).
  const trends = [], cycle = $('tsTrendFit').value === 'cycle';
  if ($('tsTrend').checked && !seasonal) for (const p of curOff ? [] : vis) {
    const q = p.values.map(x => ({ t: (+x.it.start + +x.it.end) / 2, v: x.v, e: x.e })).filter(x => Number.isFinite(x.v) && x.t >= t0 && x.t <= t1);
    const f = fitTrend(q, cycle, tsPlotInfo.withErr);
    if (f?.unresolved) { trends.push({ p, text: `${p.n}: no annual cycle (the dates all fall at one time of year)` }); continue; }
    if (!f) continue;
    const nStep = cycle ? Math.max(2, Math.ceil((f.tb - f.ta) / (yearMs / 48))) : 1;
    for (const [w, c] of [[4, halo], [2, p.color]]) {
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.setLineDash([8, 4]); ctx.beginPath();
      for (let k = 0; k <= nStep; k++) { const t = f.ta + (f.tb - f.ta) * k / nStep; if (k) ctx.lineTo(X(t), Y(f.model(t))); else ctx.moveTo(X(t), Y(f.model(t))); }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    trends.push({ p, f, text: `${p.n}: ${trendText(f, tsPlotInfo.unit)}` });
  }
  if (onScreen) tsPlotInfo.trends = trends;
  if (onScreen) tsTrendBox = null;
  if (trends.length && !(tsTrendMin && !onScreen)) {
    // On screen a header row minimizes the box to a small 'Trend +' box (left out of the saved PNG), and the
    // box can be dragged anywhere on the plot; until it is, it sits in the left corner that hides fewer values.
    ctx.font = '12px "Atkinson Hyperlegible", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const head = onScreen ? 16 : 0, bw = tsTrendMin ? ctx.measureText('Trend +').width + 16 : Math.max(...trends.map(r => ctx.measureText(r.text).width)) + 12;
    const bh = tsTrendMin ? 22 : head + 16 * trends.length + 6, roomX = Math.max(0, pw - bw - 12), roomY = Math.max(0, ph - bh - 12);
    const under = fy => { const y = T + 6 + fy * roomY; return finite.filter(q => X(q.t) <= L + 6 + bw && Y(q.v) >= y && Y(q.v) <= y + bh).length; };
    const pos = tsTrendPos || [0, under(1) < under(0) ? 1 : 0];
    const bx = L + 6 + pos[0] * roomX, by = T + 6 + pos[1] * roomY;
    if (onScreen) tsTrendBox = { x: bx, y: by, w: bw, h: bh, roomX, roomY, pos };
    ctx.globalAlpha = 0.85; ctx.fillStyle = halo; ctx.fillRect(bx, by, bw, bh); ctx.globalAlpha = 1;
    ctx.strokeStyle = tsTrendMin ? muted : line; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    if (tsTrendMin) {
      ctx.fillStyle = fg; ctx.fillText('Trend +', bx + 8, by + bh / 2);
      tsLegendHits.push({ x: bx, y: by, w: bw, h: bh, trendToggle: true });
    } else {
      if (onScreen) {  // the header: click to minimize
        ctx.fillStyle = muted; ctx.font = '11px "Atkinson Hyperlegible", sans-serif';
        ctx.fillText(`Trend${cycle ? ' + annual cycle' : ''}${trends.some(r => r.f?.weighted) ? ', error-weighted' : ''}`, bx + 6, by + 11);
        ctx.textAlign = 'center'; ctx.font = '700 13px sans-serif'; ctx.fillText('\u2212', bx + bw - 9, by + 11); ctx.textAlign = 'left';
        ctx.font = '12px "Atkinson Hyperlegible", sans-serif';
        tsLegendHits.push({ x: bx, y: by, w: bw, h: head + 3, trendToggle: true });
      }
      trends.forEach((r, k) => { ctx.fillStyle = r.p.color; ctx.fillText(r.text, bx + 6, by + head + 11 + 16 * k); });
    }
  }
  if (seasonal) for (const p of curOff ? [] : vis) {  // monthly means, broken where a month has no data
    const sum = new Array(12).fill(0), n = new Array(12).fill(0);
    for (const x of p.values) if (Number.isFinite(x.v)) { const m = new Date((+x.it.start + +x.it.end) / 2).getUTCMonth(); sum[m] += x.v; n[m]++; }
    const at = m => [L + yearFrac(Date.UTC(2001, m, 15)) * pw, Y(sum[m] / n[m])];
    for (const [w, c] of [[7, halo], [3.8, fg]]) {
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath();
      for (let m = 0; m < 12; m++) if (n[m]) { const [x, y] = at(m); if (m && n[m - 1]) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
    }
    if (vis.length > 1) { ctx.fillStyle = p.color; for (let m = 0; m < 12; m++) if (n[m]) { const [x, y] = at(m); ctx.fillRect(x - 3, y - 3, 6, 6); } }
    p.monthMean = sum.map((v, m) => (n[m] ? v / n[m] : NaN));
  }
  if (onScreen) {
    ctx.strokeStyle = fg; ctx.lineWidth = 2;
    for (const p of curOff ? [] : vis) {
      const x = p.values.find(q => q.it === selected);
      if (x && Number.isFinite(x.v)) { ctx.beginPath(); ctx.arc(X(tSel), Y(x.v), 6.5, 0, 2 * Math.PI); ctx.stroke(); }
    }
  }
  ctx.restore();
  drawTsLegend(ctx, canvas, W, R, itsOn);
}
// Least-squares trend through [{ t (ms), v, e }]: a straight line, or with cycle a line plus an annual
// sinusoid. Weighted by 1/e^2 when weighted and every value has an error. Returns the rate per year, its
// 1-sigma error (scaled by the scatter about the fit), r2, p (two-sided t test of a zero rate, n - np
// degrees of freedom), for a cycle its semi-amplitude amp and the day of the year of its peak (peak, 0-1),
// the model at any time, and the span fitted (ta to tb). Null with too few dates (a line needs three, a
// cycle five), or for a cycle whose dates do not spread through the year (cycle: 'unresolved').
const yearMs = 365.25 * 86400e3;
const tsYearFrac = t => { const y = new Date(t).getUTCFullYear(), a = Date.UTC(y, 0, 1); return (t - a) / (Date.UTC(y + 1, 0, 1) - a); };
function fitTrend(q, cycle = false, weighted = false) {
  const np = cycle ? 4 : 2, n = q.length;
  if (n < np + 1) return null;
  if (cycle) {  // mean resultant length of the dates' phases: near 1 when they all fall at one time of year
    const ph = q.map(x => 2 * Math.PI * tsYearFrac(x.t));
    if (Math.hypot(ph.reduce((a, f) => a + Math.cos(f), 0), ph.reduce((a, f) => a + Math.sin(f), 0)) / n > 0.8) return { unresolved: true };
  }
  const tm = q.reduce((a, x) => a + x.t, 0) / n;
  const row = t => { const y = (t - tm) / yearMs, f = 2 * Math.PI * tsYearFrac(t); return cycle ? [1, y, Math.cos(f), Math.sin(f)] : [1, y]; };
  const w = weighted && q.every(x => x.e > 0) ? q.map(x => 1 / x.e ** 2) : q.map(() => 1);
  // normal equations, inverted by Gauss-Jordan with partial pivoting
  const N = Array.from({ length: np }, () => new Array(2 * np).fill(0)), b = new Array(np).fill(0);
  q.forEach((x, k) => { const a = row(x.t); for (let i = 0; i < np; i++) { b[i] += w[k] * a[i] * x.v; for (let j = 0; j < np; j++) N[i][j] += w[k] * a[i] * a[j]; } });
  const scale = Math.max(...N.map((r, i) => r[i]));
  N.forEach((r, i) => { r[np + i] = 1; });
  for (let c = 0; c < np; c++) {
    let piv = c;
    for (let r = c + 1; r < np; r++) if (Math.abs(N[r][c]) > Math.abs(N[piv][c])) piv = r;
    if (Math.abs(N[piv][c]) < 1e-10 * scale) return null;
    [N[c], N[piv]] = [N[piv], N[c]];
    const d = N[c][c]; N[c] = N[c].map(v => v / d);
    for (let r = 0; r < np; r++) if (r !== c) { const f = N[r][c]; N[r] = N[r].map((v, j) => v - f * N[c][j]); }
  }
  const inv = N.map(r => r.slice(np)), coef = inv.map(r => r.reduce((a, v, j) => a + v * b[j], 0));
  const model = t => row(t).reduce((a, v, j) => a + v * coef[j], 0);
  const sw = w.reduce((a, v) => a + v, 0), vm = q.reduce((a, x, k) => a + w[k] * x.v, 0) / sw;
  const ss = q.reduce((a, x, k) => a + w[k] * (x.v - model(x.t)) ** 2, 0), sst = q.reduce((a, x, k) => a + w[k] * (x.v - vm) ** 2, 0);
  const df = n - np, rate = coef[1], se = Math.sqrt(inv[1][1] * ss / df);
  const p = se > 0 ? betaInc(df / 2, 0.5, df / (df + (rate / se) ** 2)) : 0;
  const out = { rate, se, r2: sst ? 1 - ss / sst : 1, p, model, weighted: w[0] !== 1 || w.some(v => v !== 1), ta: Math.min(...q.map(x => x.t)), tb: Math.max(...q.map(x => x.t)) };
  if (cycle) Object.assign(out, { amp: Math.hypot(coef[2], coef[3]), peak: ((Math.atan2(coef[3], coef[2]) / (2 * Math.PI)) % 1 + 1) % 1 });
  return out;
}
// One line of the trend box (and of the CSV's trend table): rate +- 1 sigma per year, r2, p, and the cycle.
function trendText(f, unit) {
  const dec = f.se > 0 ? Math.max(0, 1 - Math.floor(Math.log10(f.se))) : 2, u = unit ? `${unit} ` : '';
  let s = `${f.rate >= 0 ? '+' : '\u2212'}${Math.abs(f.rate).toFixed(dec)} \u00b1 ${f.se.toFixed(dec)} ${u}per year, r\u00b2 ${f.r2.toFixed(2)}, p ${f.p < 0.001 ? '< 0.001' : f.p.toPrecision(2)}`;
  if (f.amp !== undefined) s += `; cycle \u00b1${+f.amp.toPrecision(2)}${unit ? ` ${unit}` : ''}, peak ${new Date(Date.UTC(2001, 0, 1) + f.peak * 365 * 86400e3).toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
  return s;
}
// Regularized incomplete beta I_x(a, b), by its continued fraction (Numerical Recipes betai/betacf).
function betaInc(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnGamma = z => {  // Lanczos
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = z, s = 1.000000000190015;
    for (const k of c) s += k / ++y;
    return Math.log(2.5066282746310005 * s / z) - (z + 5.5) + (z + 0.5) * Math.log(z + 5.5);
  };
  const cf = (a, b, x) => {
    let c = 1, d = 1 - (a + b) * x / (a + 1), h;
    d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d); h = d;
    for (let m = 1; m <= 200; m++) {
      for (const aa of [m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m)), -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1))]) {
        d = 1 + aa * d; d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d);
        c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
        h *= d * c;
      }
      if (Math.abs(d * c - 1) < 1e-12) break;
    }
    return h;
  };
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? front * cf(a, b, x) / a : 1 - front * cf(b, a, 1 - x) / b;
}
// Points shown on the plot: all but those hidden in the legend (all of them when every one is hidden).
function tsVisible() { const v = tsPoints.filter(p => !p.off); return v.length ? v : tsPoints; }
// Legend: point numbers in their colors, each with an x (screen only). A click on a number hides or shows
// that point's series (faded number and map marker), on its x removes the point from the map and plot.
let tsLegendHits = [];
function drawTsLegend(ctx, canvas, W, R, itsOn) {
  const onScreen = canvas === $('tsCanvas'), muted = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
  ctx.textBaseline = 'middle';
  let lx = W - R - (onScreen ? 42 : 26);  // on screen, clear of the plot's own close x
  for (const p of [...tsPoints].reverse()) {
    ctx.globalAlpha = p.off ? 0.35 : 1;
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(lx, 14, 6, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.font = '700 12px sans-serif'; ctx.fillText(String(p.n), lx, 14.5);
    if (itsOn && p.its) { ctx.fillStyle = itsGrey(p); ctx.fillRect(lx - 4, 22, 8, 5); }  // this point's ITS_LIVE grey
    ctx.globalAlpha = 1;
    if (onScreen) {
      ctx.fillStyle = muted; ctx.font = '700 11px sans-serif'; ctx.fillText('\u00d7', lx + 12, 14);
      tsLegendHits.push({ x: lx + 7, y: 6, w: 11, h: 16, p, remove: true }, { x: lx - 8, y: 5, w: 15, h: 20, p });
    }
    lx -= onScreen ? 30 : 18;
  }
}
function removeTsLayer(name) {  // drop an earlier catalog's series (for the asset plotted) from every point
  for (const p of tsPoints) p.layers = (p.layers || []).filter(l => !(l.name === name && l.key === tsPlotInfo.key));
  tsLayerOff.delete(name);
  drawTsPlot();
}
function removeTsPoint(p) {
  tsPoints.splice(tsPoints.indexOf(p), 1);
  tsSource.removeFeature(p.feature);
  if (!tsPoints.length) { setTsMode(false); clearTsPoints(); }
  refreshTs();
}

// Series from earlier catalogs ("layers" on each point) are kept when the catalog changes and drawn
// with their own line and marker style; only the asset shown when leaving a catalog is kept.
const tsCollectionName = () => items[0]?.raw?.collection || ($('title').firstChild?.textContent || 'catalog').replace(/\.parquet$/, '');
function snapshotTsPoints(name) {
  return tsPoints.map(p => {
    const layers = (p.layers || []).filter(l => !(tsPlotInfo && l.name === name && l.key === tsPlotInfo.key));
    if (tsPlotInfo && p.values.some(x => Number.isFinite(x.v))) layers.push({ name, key: tsPlotInfo.key, unit: tsPlotInfo.unit,
      values: p.values.map(x => ({ t: (+x.it.start + +x.it.end) / 2, start: x.it.start, end: x.it.end, id: x.it.id, v: x.v, e: x.e })) });
    return { n: p.n, coord: p.coord, label: p.label, its: p.its, itsKey: p.itsKey, layers, off: p.off };
  });
}
function restoreTsPoints(carry) {
  for (const q of carry) {
    tsNext = q.n; addTsPoint(q.coord, q.label, false);
    Object.assign(tsPoints[tsPoints.length - 1], { layers: q.layers, its: q.its, itsKey: q.itsKey, off: q.off });
    tsPoints[tsPoints.length - 1].feature.set('off', !!q.off);
  }
  tsNext = Math.max(...carry.map(q => q.n)) + 1;
  $('tsLoadNote').textContent = `${carry.length} point${carry.length > 1 ? 's' : ''} kept from the previous collection; its series stay on the plot.`;
  selectSiteAt(carry.map(q => q.coord));
  refreshTs();
}
function tsOverlays() {
  // [{ p, l, k }]: earlier catalogs' series for the asset now plotted; k numbers the catalogs for styling.
  if (!tsPlotInfo) return [];
  const out = tsPoints.flatMap(p => (p.layers || []).filter(l => l.key === tsPlotInfo.key && l.name !== tsPlotInfo.name).map(l => ({ p, l })));
  const names = [...new Set(out.map(o => o.l.name))];
  for (const o of out) o.k = names.indexOf(o.l.name);
  return out;
}
const ovStyles = [{ dash: [6, 4], shape: 'square' }, { dash: [2, 3], shape: 'triangle' }, { dash: [10, 3, 2, 3], shape: 'diamond' }];
function tsMarker(ctx, shape, x, y, r, fill) {
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(x, y, r, 0, 2 * Math.PI);
  else if (shape === 'square') ctx.rect(x - r, y - r, 2 * r, 2 * r);
  else if (shape === 'triangle') { ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r * 1.1, y + r * 0.8); ctx.lineTo(x - r * 1.1, y + r * 0.8); ctx.closePath(); }
  else { ctx.moveTo(x, y - r * 1.3); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 1.3); ctx.lineTo(x - r, y); ctx.closePath(); }
  if (fill) ctx.fill(); else ctx.stroke();
}

function addTsPoint(coord, label = '', refresh = true) {
  const n = tsNext++, color = tsColors[(n - 1) % tsColors.length];
  const f = new ol.Feature({ geometry: new ol.geom.Point(coord) });
  f.setProperties({ n, color });
  tsSource.addFeature(f);
  tsPoints.push({ n, coord, color, label, feature: f, values: [] });
  $('tsClear').hidden = false;
  if (refresh) { selectSiteAt([coord]); refreshTs(); }
}

// Load points from a text/CSV file: lat/lon columns (preferred), or x/y in km (x_km, y_km, or x, y with
// |x| < 20000) or metres (x_m, y_m, or larger x, y), in the map's projection. A header row is optional;
// without one, two numbers that fit lat/lon are read as lat, lon, otherwise as x, y. An optional
// label/name/site/id/point column names the points. The CSV this section saves loads back (one point
// per distinct position).
const maxLoadPoints = 100;
function parseTsPoints(text) {
  const rows = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => (l.includes(',') ? l.split(/\s*,\s*/) : l.includes(';') ? l.split(/\s*;\s*/) : l.includes('\t') ? l.split(/\t/) : l.split(/\s+/))
      .map(c => c.trim().replace(/^"(.*)"$/, '$1')));
  if (!rows.length) throw new Error('the file is empty');
  const isNum = c => c !== '' && Number.isFinite(+c);
  let head = null, body = rows;
  if (rows[0].some(c => !isNum(c))) { head = rows[0].map(c => c.toLowerCase()); body = rows.slice(1); }
  const col = names => { for (const n of names) { const i = head ? head.indexOf(n) : -1; if (i >= 0) return i; } return -1; };
  let iLat = col(['lat', 'latitude']), iLon = col(['lon', 'long', 'lng', 'longitude']);
  let iX = col(['x_km', 'x_m', 'x']), iY = col(['y_km', 'y_m', 'y']), iLab = col(['label', 'name', 'site', 'id', 'point']);
  if (!head) {
    const num = body.map(r => r.filter(isNum).map(Number));
    if (num.every(r => r.length >= 2 && Math.abs(r[0]) <= 90 && Math.abs(r[1]) <= 360)) { iLat = 0; iLon = 1; } else { iX = 0; iY = 1; }
    if (body[0].length > 2 && !isNum(body[0][2])) iLab = 2;
  }
  const useLL = iLat >= 0 && iLon >= 0;
  if (!useLL && (iX < 0 || iY < 0)) throw new Error('no lat/lon or x/y columns found');
  const unit = useLL ? 'lat/lon' : head?.[iX] === 'x_m' ? 'm' : head?.[iX] === 'x_km' ? 'km' : null;
  const pts = [], seen = new Set();
  let metres = false;
  for (const r of body) {
    let coord;
    if (useLL) {
      const lat = +r[iLat], lon = +r[iLon];
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      coord = ol.proj.fromLonLat([lon, lat], viewCode);
    } else {
      const x = +r[iX], y = +r[iY];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const m = unit === 'm' || (unit === null && Math.max(Math.abs(x), Math.abs(y)) > 20000) ? 1 : 1000;
      metres ||= m === 1;
      coord = [x * m, y * m];
    }
    const key = coord.map(Math.round).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    pts.push({ coord, label: iLab >= 0 ? (r[iLab] ?? '') : '' });
  }
  if (!pts.length) throw new Error('no valid rows');
  return { pts, how: useLL ? 'lat/lon' : `x/y in ${metres ? 'metres' : 'km'}` };
}
async function loadTsPoints(file) {
  try {
    const { pts, how } = parseTsPoints(await file.text());
    const use = pts.slice(0, maxLoadPoints);
    setTsMode(false);
    for (const q of use) addTsPoint(q.coord, q.label, false);
    $('tsLoadNote').textContent = `Loaded ${use.length} point${use.length > 1 ? 's' : ''} from ${file.name} (${how})`
      + (pts.length > use.length ? `; only the first ${maxLoadPoints} of ${pts.length} were used.` : '.');
    const v = map.getView(), ext = v.calculateExtent(map.getSize());
    if (use.some(q => !ol.extent.containsCoordinate(ext, q.coord))) {
      const e = ol.extent.boundingExtent(tsPoints.map(p => p.coord)), pad = 20e3;
      v.fit([e[0] - pad, e[1] - pad, e[2] + pad, e[3] + pad], { size: map.getSize(), padding: [40, 40, 40, 40], duration: 250 });
    }
    selectSiteAt(use.map(q => q.coord));
    refreshTs();
  } catch (e) {
    $('tsLoadNote').textContent = `Could not load points from ${file.name}: ${e.message}`;
  }
}
function clearTsPoints() {
  ++tsToken; tsPoints = []; tsNext = 1; tsLayerOff.clear(); tsKey = ''; tsPlotInfo = null; tsYTyped = null; $('tsYRow').hidden = true; $('tsLoadNote').textContent = ''; $('tsProg').hidden = true; $('tsItsNote').textContent = '';
  tsSource.clear(); tsCache.clear();
  $('tsPlot').hidden = true; $('tsClear').hidden = true; $('tsShow').hidden = true;
  $('tsCsv').disabled = true; $('tsPng').disabled = true; $('tsNote').textContent = ''; $('tsCount').textContent = '';
}
function setTsMode(on) {
  tsMode = on;
  $('tsAdd').textContent = on ? 'Done adding' : 'Add points';
  $('tsNote').textContent = on ? 'Click the map to add points; each click plots that spot.' : $('tsNote').textContent;
  if (on) stopDraw();
}

$('tsAdd').onclick = () => setTsMode(!tsMode);
$('tsLoad').onclick = () => $('tsFile').click();
$('tsFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) loadTsPoints(f); };
$('tsSec').addEventListener('toggle', () => { if (!$('tsSec').open && tsMode) setTsMode(false); });  // collapsing ends point picking
$('cropSec').addEventListener('toggle', () => { if (!$('cropSec').open && drawKind === 'crop') stopDraw(); });  // and crop-box drawing
$('tsClear').onclick = () => { setTsMode(false); clearTsPoints(); refreshTs(); };
$('tsRange').onchange = () => refreshTs();
$('tsErr').onchange = () => refreshTs();
$('tsStyle').onchange = $('tsTrend').onchange = $('tsTrendFit').onchange = () => drawTsPlot();
$('tsIts').onchange = () => refreshIts();
$('tsItsDt').onchange = () => refreshIts();
// One button in the panel hides or shows the plot; the plot's own x also hides it.
function setTsPlot(show) {
  $('tsPlot').hidden = !show;
  $('tsShow').hidden = false; $('tsShow').textContent = show ? 'Hide plot' : 'Show plot';
  if (show) drawTsPlot();
}
$('tsHide').onclick = () => setTsPlot(false);
function floatingPlot(plot, grip, corner, redraw) {
  // Drag the grip to move the plot anywhere over the map; double-click it to put the plot back.
  let d = null;
  grip.addEventListener('pointerdown', e => {
    const r = plot.getBoundingClientRect(), w = $('mapwrap').getBoundingClientRect();
    d = { dx: e.clientX - r.left, dy: e.clientY - r.top, w };
    Object.assign(plot.style, { left: `${r.left - w.left}px`, top: `${r.top - w.top}px`, width: `${r.width}px`, right: 'auto', bottom: 'auto' });
    grip.setPointerCapture(e.pointerId); e.preventDefault();
  });
  grip.addEventListener('pointermove', e => {
    if (!d) return;
    const { w } = d, r = plot.getBoundingClientRect();
    plot.style.left = `${Math.max(Math.min(e.clientX - w.left - d.dx, w.width - r.width), 0)}px`;
    plot.style.top = `${Math.max(Math.min(e.clientY - w.top - d.dy, w.height - r.height), 0)}px`;
  });
  for (const t of ['pointerup', 'pointercancel']) grip.addEventListener(t, () => { d = null; });
  // Drag the bottom-right corner to resize (at least 320 x 180 px, or the size it had if smaller; inside the map).
  let z = null;
  corner.addEventListener('pointerdown', e => {
    const r = plot.getBoundingClientRect(), w = $('mapwrap').getBoundingClientRect();
    z = { x: e.clientX, y: e.clientY, w0: r.width, h0: r.height, r, w };
    Object.assign(plot.style, { left: `${r.left - w.left}px`, top: `${r.top - w.top}px`, width: `${r.width}px`, height: `${r.height}px`, right: 'auto', bottom: 'auto' });
    corner.setPointerCapture(e.pointerId); e.preventDefault();
  });
  corner.addEventListener('pointermove', e => {
    if (!z) return;
    // never below 320 x 180 unless it started smaller, never past the map edge (a phone may have less room)
    const maxW = z.w.right - z.r.left, maxH = z.w.bottom - z.r.top;
    plot.style.width = `${Math.max(Math.min(320, z.w0, maxW), Math.min(z.w0 + e.clientX - z.x, maxW))}px`;
    plot.style.height = `${Math.max(Math.min(180, z.h0, maxH), Math.min(z.h0 + e.clientY - z.y, maxH))}px`;
  });
  for (const t of ['pointerup', 'pointercancel']) corner.addEventListener(t, () => { z = null; });
  grip.addEventListener('dblclick', () => { for (const k of ['left', 'top', 'width', 'height', 'right', 'bottom']) plot.style[k] = ''; redraw(); });
  // Redraw at the new size when the plot is resized by its corner.
  let sized = 0;
  new ResizeObserver(() => { cancelAnimationFrame(sized); sized = requestAnimationFrame(() => { if (!plot.hidden) redraw(); }); }).observe(plot);
}
floatingPlot($('tsPlot'), $('tsDrag'), $('tsSize'), () => drawTsPlot());
$('tsShow').onclick = () => setTsPlot($('tsPlot').hidden);
window.addEventListener('resize', () => { if (!$('tsPlot').hidden) drawTsPlot(); });
$('tsXBar').onchange = () => drawTsPlot();
$('tsXMode').onchange = () => { $('tsXBar').disabled = $('tsTrend').disabled = $('tsTrendFit').disabled = $('tsXMode').value === 'season'; drawTsPlot(); };
$('tsYAuto').onclick = () => { tsYTyped = null; drawTsPlot(); };
// The trend box: dragged by the user (a press that moves less than 4 px is a click), minimized by its header.
const tsXY = e => { const r = $('tsCanvas').getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
const inTrendBox = ([x, y]) => tsTrendBox && x >= tsTrendBox.x && x <= tsTrendBox.x + tsTrendBox.w && y >= tsTrendBox.y && y <= tsTrendBox.y + tsTrendBox.h;
$('tsCanvas').addEventListener('pointerdown', e => {
  if (!inTrendBox(tsXY(e))) return;
  tsTrendDrag = { start: tsXY(e), pos: [...tsTrendBox.pos], moved: false };
  $('tsCanvas').setPointerCapture(e.pointerId);
});
$('tsCanvas').addEventListener('pointermove', e => {
  if (!tsTrendDrag) return;
  const xy = tsXY(e), dx = xy[0] - tsTrendDrag.start[0], dy = xy[1] - tsTrendDrag.start[1];
  if (!tsTrendDrag.moved && Math.hypot(dx, dy) < 4) return;
  tsTrendDrag.moved = true;
  const f = (v, room) => Math.min(1, Math.max(0, room ? v : 0));
  tsTrendPos = [f(tsTrendDrag.pos[0] + dx / tsTrendBox.roomX, tsTrendBox.roomX), f(tsTrendDrag.pos[1] + dy / tsTrendBox.roomY, tsTrendBox.roomY)];
  drawTsPlot();
});
$('tsCanvas').addEventListener('pointerup', e => { if (tsTrendDrag?.moved) tsTrendDropped = e.timeStamp; tsTrendDrag = null; });
$('tsCanvas').addEventListener('pointercancel', () => { tsTrendDrag = null; });
const tsLegendAt = e => { const r = $('tsCanvas').getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  return tsLegendHits.find(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h); };
$('tsCanvas').addEventListener('mousemove', e => { if (!tsTrendDrag) $('tsCanvas').style.cursor = tsLegendAt(e) ? 'pointer' : inTrendBox(tsXY(e)) ? 'move' : ''; });
$('tsCanvas').onclick = e => {
  if (e.timeStamp - tsTrendDropped < 300) return;  // the end of a drag, not a click
  const h = tsLegendAt(e);
  if (h?.trendToggle) { tsTrendMin = !tsTrendMin; drawTsPlot(); return; }
  if (inTrendBox(tsXY(e))) return;
  if (h?.name) {
    if (h.remove) removeTsLayer(h.name);
    else { if (tsLayerOff.has(h.name)) tsLayerOff.delete(h.name); else tsLayerOff.add(h.name); drawTsPlot(); }
    return;
  }
  if (h) {
    if (h.remove) { removeTsPoint(h.p); return; }
    h.p.off = !h.p.off; h.p.feature.set('off', h.p.off);
    drawTsPlot(); return;
  }
  // Show the image of the GrIMP point nearest the click (any point's series), as if its time-bar tick were clicked.
  const g = tsPlotInfo?.geom;
  if (!g) return;
  const r = $('tsCanvas').getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top;
  let best = null, bd = Infinity;
  for (const p of tsLayerOff.has(tsPlotInfo.name) ? [] : tsVisible()) for (const x of p.values) {
    if (!Number.isFinite(x.v)) continue;
    const d = Math.hypot(g.X((+x.it.start + +x.it.end) / 2) - cx, g.Y(x.v) - cy);
    if (d < bd) { bd = d; best = x.it; }
  }
  if (best && best !== selected) select(best);
};
$('tsCsv').onclick = () => {
  // With a trend on the plot, each row of the collection shown also carries its point's fit (blank for others).
  const info = tsPlotInfo, tr = info.trends?.length ? info.trends : null;
  const rows = [['point', 'label', 'x_km', 'y_km', 'lat', 'lon', 'item', 'start', 'end', 'asset', 'value', 'unit', 'error', 'collection',
    ...(tr ? ['trend_rate_per_year', 'trend_rate_sigma', 'trend_r2', 'trend_p', 'trend_cycle_amplitude', 'trend_cycle_peak_day', 'trend_weighted'] : [])]];
  const csvText = t => /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  const trCols = p => { if (!tr) return []; const f = tr.find(r => r.p === p)?.f;
    return f ? [f.rate, f.se, f.r2, f.p, f.amp ?? '', f.amp === undefined ? '' : Math.round(f.peak * 365) + 1, f.weighted ? 1 : 0] : ['', '', '', '', '', '', '']; };
  for (const p of tsVisible()) {
    const [lon, lat] = ol.proj.toLonLat(p.coord, viewCode);
    const pos = [p.n, csvText(p.label || ''), (p.coord[0] / 1000).toFixed(3), (p.coord[1] / 1000).toFixed(3), lat.toFixed(5), lon.toFixed(5)];
    if (!tsLayerOff.has(info.name)) for (const x of p.values) {
      rows.push([...pos, x.it.id, fmtDate(x.it.start), fmtDate(x.it.end), info.key, Number.isNaN(x.v) ? '' : x.v, info.unit,
                 Number.isFinite(x.e) ? x.e : '', csvText(info.name), ...trCols(p)]);
    }
    for (const l of p.layers || []) {
      if ((l.name === info.name && l.key === info.key) || tsLayerOff.has(l.name)) continue;
      for (const x of l.values) rows.push([...pos, x.id, fmtDate(x.start), fmtDate(x.end), l.key, Number.isNaN(x.v) ? '' : x.v, l.unit,
                                           Number.isFinite(x.e) ? x.e : '', csvText(l.name), ...(tr ? ['', '', '', '', '', '', ''] : [])]);
    }
  }
  const coll = items[0]?.raw?.collection || 'grimp';
  saveBlob(new Blob([rows.map(r => r.join(',')).join('\n') + '\n'], { type: 'text/csv' }), `${coll}_${info.key}_points.csv`);
};
$('tsPng').onclick = () => {
  const c = document.createElement('canvas'); c.style.width = `${$('tsCanvas').clientWidth}px`; c.style.height = `${$('tsCanvas').clientHeight}px`;
  document.body.append(c); drawTsPlot(c, 2); c.remove();
  const coll = items[0]?.raw?.collection || 'grimp';
  saveUrl(c.toDataURL('image/png'), `${coll}_${tsPlotInfo.key}_points.png`);
};

