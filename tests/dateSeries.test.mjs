// Profile date series (Jakobshavn, Greenland annual): dates every dt from the shown product, Earlier and
// Later up to the limit of 8 and then sliding, the slider band, another step, and turning it off; and
// on the monthly mosaics, a yearly series keeps the anchor's month and a monthly one is consecutive.
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, dragTo, text, hidden, shot, sleep, finish } from './lib.mjs';

const { browser, page: p } = await openViewer(catalogs.glAnnual);
// years: of the plotted curves in the series window (the anchor's own curve is a hand-shown one)
const ser = () => p.evaluate(() => { const q = window.grimpViewer.pf(), s = q.pfSer, win = s ? s.cands.slice(s.i0, s.i1 + 1) : [];
  const inWin = c => win.some(w => w.it.assets[q.pfKey].href === c.href);
  return { n: q.pfCurves.length, years: q.pfCurves.filter(inWin).map(c => new Date((+c.it.start + +c.it.end) / 2).getUTCFullYear()).sort(),
    nSer: q.pfCurves.filter(c => c.ser).length, manual: q.pfCurves.filter(c => !c.ser).length, on: !!s, window: win.map(c => c.k), found: s?.cands.length }; });
const settled = () => p.waitForFunction(() => { const q = window.grimpViewer.pf(), s = q.pfSer, win = s ? s.cands.slice(s.i0, s.i1 + 1) : [];
  return q.pfCurves.every(c => c.v) && win.every(w => q.pfCurves.some(c => c.href === w.it.assets[q.pfKey].href)); }, { timeout: 180000 });
const curvesRead = n => p.waitForFunction(n => { const q = window.grimpViewer.pf(); return q.pfCurves.length === n && q.pfCurves.every(c => c.v); }, { timeout: 120000 }, n);

const A = await toMap(p, -49.95, 69.17), B = await toMap(p, -48.9, 69.10);
await zoomTo(p, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], Math.abs(B[0] - A[0]) / 2 + 10e3, Math.abs(B[1] - A[1]) / 2 + 10e3);
await p.$eval('#pfSec', e => { e.open = true; });
check('series row hidden before a line', await hidden(p, 'pfSerRow'));
await p.click('#pfDraw');
const a = await toPixel(p, A), b = await toPixel(p, B);
await p.mouse.click(a[0], a[1]); await sleep(400); await p.mouse.click(b[0], b[1]);
await curvesRead(1);
check('series row shown with the line', !(await hidden(p, 'pfSerRow')));
// anchor on an older year: the newest stays as a hand-shown curve
await p.evaluate(() => { const t = document.querySelectorAll('#tticks .tick'); t[t.length - 4].click(); });
await curvesRead(2);
await p.$eval('#pfSerRow', e => e.scrollIntoView());
await p.click('#pfSerOn'); await sleep(500); await settled();
let s = await ser();
check('turning on plots the anchor and 3 later years, 1 year apart', s.on && JSON.stringify(s.window) === '[0,1,2,3]' && s.years.length === 4
  && s.years.every((y, k) => !k || y === s.years[k - 1] + 1), s);
check('hand-shown curves kept', s.manual >= 1, s);
check('note lists the dates', /4 dates, .* every 1 year/.test(await text(p, 'pfSerNote')), await text(p, 'pfSerNote'));
for (let k = 0; k < 6; k++) { await p.click('#pfSerEarlier'); await sleep(150); }
await settled(); s = await ser();
check('Earlier adds dates up to 8, then slides', s.window.length === 8 && s.window[0] === -6 && s.window[7] === 1, s.window);
await p.click('#pfSerLater'); await settled(); s = await ser();
check('Later at the limit slides the window later', s.window.length === 8 && s.window[0] === -5 && s.window[7] === 2, s.window);
check('8 curves in the window, at most 8 series curves', s.years.length === 8 && s.nSer <= 8, s);
await shot(p, 'dateSeries8');
// band drag slides the window and keeps its size
const before = s.window;
await p.$eval('#pfSerTrack', e => e.scrollIntoView({ block: 'center' }));
const band = await p.$eval('#pfSerBand', e => { const r = e.getBoundingClientRect(), t = e.parentElement.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: t.width }; });
await p.mouse.move(band.x, band.y); await p.mouse.down(); await p.mouse.move(band.x - band.w * 0.3, band.y, { steps: 8 }); await p.mouse.up();
await sleep(800); await settled(); s = await ser();
check('band drag slides the window earlier, same size', s.window.length === before.length && s.window[0] < before[0], { before, after: s.window });
// another step restarts from the anchor
await p.select('#pfSerDt', '730.5'); await sleep(500); await settled(); s = await ser();
check('2-year step: years 2 apart', s.years.length >= 2 && s.years.every((y, k) => !k || y === s.years[k - 1] + 2), s.years);
check('sub-year steps hidden for annual products', await p.$eval('#pfSerDt', e => [...e.options].filter(o => o.disabled).map(o => o.value).join()) === '6,12,30.4375,91.3125,182.625');
await p.click('#pfSerOn'); await sleep(500); s = await ser();
check('turning off removes only the series curves', !s.on && s.nSer === 0 && s.n === s.manual && s.n >= 1, s);
await browser.close();

// monthly: the series follows the shown month from year to year, or month to month
const m = await openViewer(catalogs.glMonthly), q = m.page;
await zoomTo(q, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], Math.abs(B[0] - A[0]) / 2 + 10e3, Math.abs(B[1] - A[1]) / 2 + 10e3);
await q.$eval('#pfSec', e => { e.open = true; });
await q.click('#pfDraw');
const a2 = await toPixel(q, A), b2 = await toPixel(q, B);
await q.mouse.click(a2[0], a2[1]); await sleep(400); await q.mouse.click(b2[0], b2[1]);
await q.waitForFunction(() => { const r = window.grimpViewer.pf(); return r.pfCurves.length === 1 && r.pfCurves[0].v; }, { timeout: 120000 });
await q.evaluate(() => { const t = document.querySelectorAll('#tticks .tick'); t[t.length - 30].click(); });
await q.waitForFunction(() => window.grimpViewer.pf().pfCurves.length === 2, { timeout: 60000 });
const months = () => q.evaluate(() => { const r = window.grimpViewer.pf(), s = r.pfSer;
  return s.cands.slice(s.i0, s.i1 + 1).map(c => fmt(c.it)); function fmt(it) { return new Date((+it.start + +it.end) / 2).toISOString().slice(0, 7); } });
await q.$eval('#pfSerRow', e => e.scrollIntoView());
await q.click('#pfSerOn'); await sleep(1500);
let ms = await months();
check('monthly, 1-year step: same month each year', ms.length >= 2 && ms.every(x => x.slice(5) === ms[0].slice(5)) && ms.every((x, k) => !k || +x.slice(0, 4) === +ms[k - 1].slice(0, 4) + 1), ms);
check('monthly: 6- and 12-day steps not offered, 1 month offered', await q.$eval('#pfSerDt', e => [...e.options].filter(o => o.disabled).map(o => o.value).join()) === '6,12');
await q.select('#pfSerDt', '30.4375'); await sleep(1500);
ms = await months();
check('monthly, 1-month step: consecutive months', ms.length === 4 && ms.every((x, k) => { if (!k) return true; const [y0, m0] = ms[k - 1].split('-').map(Number), [y1, m1] = x.split('-').map(Number); return (y1 * 12 + m1) - (y0 * 12 + m0) === 1; }), ms);
await finish(m.browser);
