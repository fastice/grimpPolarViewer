// Trend line on the time series plot (Jakobshavn, Greenland annual): each point's least-squares rate, r2
// and p match an independent fit of the values plotted, the box lists one rate per point and can be
// dragged and minimized, the fit is error-weighted with error bars, the CSV and share link carry it, the
// trend is off in the month-of-year view, and unticking removes it; on monthly products a line plus annual
// cycle (residuals orthogonal to the design, not resolved on annual products).
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, text, shot, sleep, finish } from './lib.mjs';

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

// Least-squares check that needs no second fit: the weighted residuals are orthogonal to every column of the
// design (1, t, and for a cycle cos and sin of the time of year).
const orth = cycle => p.evaluate(cycle => window.grimpViewer.ts().trends.filter(t => t.f).map(t => {
  const q = t.p.values.map(x => ({ t: (+x.it.start + +x.it.end) / 2, v: x.v, e: x.e })).filter(x => Number.isFinite(x.v));
  const w = t.f.weighted ? q.map(x => 1 / x.e ** 2) : q.map(() => 1);
  const yf = tt => { const y = new Date(tt).getUTCFullYear(), a = Date.UTC(y, 0, 1); return (tt - a) / (Date.UTC(y + 1, 0, 1) - a); };
  const cols = [() => 1, x => x.t, ...(cycle ? [x => Math.cos(2 * Math.PI * yf(x.t)), x => Math.sin(2 * Math.PI * yf(x.t))] : [])];
  return Math.max(...cols.map(c => { let s = 0, m = 0; q.forEach((x, k) => { const r = w[k] * (x.v - t.f.model(x.t)) * c(x); s += r; m += Math.abs(r); }); return m ? Math.abs(s) / m : 0; }));
}), cycle);
check('residuals orthogonal to the line', (await orth(false)).every(e => e < 1e-9), await orth(false));

// annual products all fall at one time of year: no cycle
await p.select('#tsTrendFit', 'cycle'); await sleep(400);
check('line + cycle on annual products says the cycle is not resolved', (await p.evaluate(() => window.grimpViewer.ts().trends.map(t => t.text))).every(t => /no annual cycle/.test(t)));
await p.select('#tsTrendFit', 'line'); await sleep(300);

// error bars on: the fit is weighted by 1/error^2
await p.$eval('#tsErr', e => e.click());
await p.waitForFunction(() => /dates in/.test(document.getElementById('tsNote').textContent) && window.grimpViewer.ts().trends?.length, { timeout: 240000 }); await sleep(800);
const wt = await p.evaluate(() => window.grimpViewer.ts().trends.map(t => ({ w: t.f?.weighted, rate: t.f?.rate })));
check('with error bars the trend is error-weighted', wt.length === 2 && wt.every(t => t.w), wt);
check('weighted residuals orthogonal to the line', (await orth(false)).every(e => e < 1e-9), await orth(false));

// the CSV carries each point's trend
const fs = await import('fs'), out = new URL('./out/', import.meta.url).pathname;
for (const f of fs.readdirSync(out)) if (f.endsWith('_points.csv')) fs.unlinkSync(out + f);
const cdp = await p.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: out });
await p.$eval('#tsCsv', e => e.click());
let csv = null; for (let i = 0; i < 40 && !csv; i++) { await sleep(250); const f = fs.readdirSync(out).find(f => f.endsWith('_points.csv')); if (f) csv = fs.readFileSync(out + f, 'utf8'); }
const head = csv?.split('\n')[0].split(',') || [], row1 = csv?.split('\n')[1].split(',') || [];
check('CSV has the trend columns, filled with the fit', head.includes('trend_rate_per_year') && head.includes('trend_p') && Math.abs(+row1[head.indexOf('trend_rate_per_year')] - wt[0].rate) < 1e-9
  && row1[head.indexOf('trend_weighted')] === '1', { head: head.slice(14), row: row1.slice(14) });

// the share link keeps the trend
await p.$eval('#share', e => e.click()); await sleep(300);
check('share link carries trend=line', new URL(await p.evaluate(() => location.href)).searchParams.get('trend') === 'line');
await p.$eval('#tsErr', e => e.click());
await p.waitForFunction(() => /dates in/.test(document.getElementById('tsNote').textContent), { timeout: 240000 }); await sleep(500);

await p.select('#tsXMode', 'season'); await sleep(500);
check('month-of-year view: trend off and its box disabled', !(await p.evaluate(() => window.grimpViewer.ts().trends.length)) && await p.$eval('#tsTrend', e => e.disabled));
await p.select('#tsXMode', 'date'); await sleep(300);
await p.$eval('#tsTrend', e => e.click()); await sleep(300);
check('unticking removes the trend', !(await p.evaluate(() => window.grimpViewer.ts().trends.length)));

// monthly products: line + annual cycle
await p.$eval('#tsTrend', e => e.click()); await p.select('#tsTrendFit', 'cycle');
const status0 = await text(p, 'status');
await p.$eval('#href', (e, u) => { e.value = u; }, catalogs.glMonthly);
await p.click('#load');
await p.waitForFunction(s0 => /items/.test(document.getElementById('status').textContent) && document.getElementById('status').textContent !== s0, { timeout: 120000 }, status0);
await p.waitForFunction(() => /dates in/.test(document.getElementById('tsNote').textContent) && window.grimpViewer.ts().trends?.length, { timeout: 300000 }); await sleep(1500);
const cy = await p.evaluate(() => window.grimpViewer.ts().trends.map(t => ({ text: t.text, amp: t.f?.amp, peak: t.f?.peak, n: t.p.values.filter(x => Number.isFinite(x.v)).length })));
check('monthly: a cycle for each point, with amplitude and peak date', cy.length === 2 && cy.every(t => t.amp > 0 && t.peak >= 0 && t.peak < 1
  && /; cycle \u00b1[\d.]+ m\/yr, peak [A-Z][a-z]{2} \d{1,2}$/.test(t.text)), cy);
check('cycle residuals orthogonal to all four columns', (await orth(true)).every(e => e < 1e-9), await orth(true));
await shot(p, 'trendCycle');
await finish(browser);
