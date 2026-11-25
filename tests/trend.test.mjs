// Trend line on the time series plot (Jakobshavn, Greenland annual): each point's least-squares rate, r2
// and p match an independent fit of the values plotted, the box lists one rate per point and can be
// dragged and minimized, the trend is off in the month-of-year view, and unticking removes it.
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, shot, sleep, finish } from './lib.mjs';

// Two-sided p of Student's t by direct integration of its density (x = tan u, Simpson), independent of the viewer's
// incomplete beta function.
function pRef(t, df) {
  const f = u => (1 + Math.tan(u) ** 2 / df) ** (-(df + 1) / 2) / Math.cos(u) ** 2;
  const simpson = (a, b, n = 20000) => { const h = (b - a) / n; let s = f(a) + f(b); for (let k = 1; k < n; k++) s += (k % 2 ? 4 : 2) * f(a + k * h); return s * h / 3; };
  const e = 1e-9, top = Math.PI / 2 - e;
  return 2 * simpson(Math.atan(Math.abs(t)), top) / simpson(-top, top);
}

const { browser, page: p } = await openViewer(catalogs.glAnnual);
await zoomTo(p, await toMap(p, -49.1, 69.2), 60e3, 45e3);
await p.evaluate(() => { document.getElementById('tsSec').open = true; document.getElementById('cropSec').open = false; });
await p.$eval('#tsAdd', e => e.click());
for (const [lon, lat] of [[-49.30, 69.17], [-48.60, 69.20]]) {
  const px = await toPixel(p, await toMap(p, lon, lat));
  await p.mouse.click(px[0], px[1]); await sleep(300);
}
await p.$eval('#tsAdd', e => e.click());
await p.waitForFunction(() => /dates in/.test(document.getElementById('tsNote').textContent), { timeout: 240000 });
await p.mouse.move(5, 5); await sleep(1000);
check('no trend until ticked', !(await p.evaluate(() => window.grimpViewer.ts().trends?.length)));

await p.$eval('#tsTrend', e => e.click()); await sleep(500);
// Independent fit: ordinary least squares from the raw sums, time in days, then per year.
const r = await p.evaluate(() => window.grimpViewer.ts().tsPoints.map(pt => {
  const q = pt.values.map(x => [(+x.it.start + +x.it.end) / 2 / 864e5, x.v]).filter(x => Number.isFinite(x[1]));
  const n = q.length, st = q.reduce((a, x) => a + x[0], 0), sv = q.reduce((a, x) => a + x[1], 0);
  const stt = q.reduce((a, x) => a + x[0] * x[0], 0), stv = q.reduce((a, x) => a + x[0] * x[1], 0);
  const b = (n * stv - st * sv) / (n * stt - st * st);
  const t = window.grimpViewer.ts().trends.find(t => t.p === pt);
  const a = (sv - b * st) / n, sst = q.reduce((s, x) => s + (x[1] - sv / n) ** 2, 0), ss = q.reduce((s, x) => s + (x[1] - a - b * x[0]) ** 2, 0);
  return { n: pt.n, dates: n, ref: b * 365.25, r2ref: 1 - ss / sst, rate: t?.f.rate, se: t?.f.se, r2: t?.f.r2, p: t?.f.p, tStat: t && t.f.rate / t.f.se, text: t?.text };
}));
check('a trend for each point', r.length === 2 && r.every(x => Number.isFinite(x.rate) && x.se > 0), r);
check('rates match an independent least-squares fit', r.every(x => Math.abs(x.rate - x.ref) <= 1e-6 * Math.max(1, Math.abs(x.ref))), r);
check('r2 matches the independent fit', r.every(x => Math.abs(x.r2 - x.r2ref) < 1e-9), r.map(x => [x.r2, x.r2ref]));
check('p is the two-sided t-test value', r.every(x => x.p > 0 && x.p < 1 && Math.abs(x.p - pRef(x.tStat, x.dates - 2)) < 1e-6), r.map(x => [x.tStat, x.p, pRef(x.tStat, x.dates - 2)]));
check('box text gives rate, error, unit, r2 and p', r.every(x => /^\d: [+\u2212][\d.]+ \u00b1 [\d.]+ m\/yr per year, r\u00b2 [\d.]+, p (< 0\.001|[\d.e-]+)$/.test(x.text)), r.map(x => x.text));
await shot(p, 'trend');

// The box: drag it, minimize it by its header, restore it by clicking 'Trend +'.
const box = () => p.evaluate(() => { const b = window.grimpViewer.ts().trendBox; return b && { x: b.x, y: b.y, w: b.w, h: b.h, min: window.grimpViewer.ts().trendMin }; });
const cv = await p.$eval('#tsCanvas', e => { const r = e.getBoundingClientRect(); return [r.left, r.top]; });
let b0 = await box();
const sel0 = await p.evaluate(() => window.grimpViewer.ts().selectedId);
await p.mouse.move(cv[0] + b0.x + b0.w / 2, cv[1] + b0.y + b0.h - 6); await p.mouse.down();
await p.mouse.move(cv[0] + b0.x + b0.w / 2 + 120, cv[1] + b0.y + b0.h - 6 + 40, { steps: 6 }); await p.mouse.up(); await sleep(400);
let b1 = await box();
check('dragging the trend box moves it', Math.abs(b1.x - b0.x - 120) < 2 && Math.abs(b1.y - b0.y - 40) < 2, { b0, b1 });
check('the drag did not pick a date', (await p.evaluate(() => window.grimpViewer.ts().selectedId)) === sel0);
await p.mouse.click(cv[0] + b1.x + 20, cv[1] + b1.y + 8); await sleep(300);
let b2 = await box();
check('clicking the header minimizes it', b2.min && b2.h < b1.h, b2);
await shot(p, 'trendMin');
await p.mouse.click(cv[0] + b2.x + b2.w / 2, cv[1] + b2.y + b2.h / 2); await sleep(300);
check("clicking 'Trend +' restores it", !(await box()).min);

await p.select('#tsXMode', 'season'); await sleep(500);
check('month-of-year view: trend off and its box disabled', !(await p.evaluate(() => window.grimpViewer.ts().trends.length)) && await p.$eval('#tsTrend', e => e.disabled));
await p.select('#tsXMode', 'date'); await sleep(300);
await p.$eval('#tsTrend', e => e.click()); await sleep(300);
check('unticking removes the trend', !(await p.evaluate(() => window.grimpViewer.ts().trends.length)));
await finish(browser);
