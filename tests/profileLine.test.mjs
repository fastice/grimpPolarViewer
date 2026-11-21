// Profile along a drawn line (Jakobshavn, Greenland annual): curves read, a second date adds a curve,
// the legend hides/shows and removes curves, the plot x/y range sliders and Auto, ITS_LIVE annual mode.
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, hitCenter, dragTo, text, hidden, shot, sleep, finish } from './lib.mjs';

const { browser, page: p } = await openViewer(catalogs.glAnnual);
const pf = () => p.evaluate(() => { const q = window.grimpViewer.pf();
  return { n: q.pfCurves.length, read: q.pfCurves.every(c => c.v), off: q.pfCurves.map(c => !!c.off), ids: q.pfCurves.map(c => c.it.id),
    finite: q.pfCurves.map(c => c.v ? [...c.v].filter(Number.isFinite).length / c.v.length : 0), ax: [q.pfAx.x.typed, q.pfAx.y.typed] }; });
const curvesRead = n => p.waitForFunction(n => { const q = window.grimpViewer.pf(); return q.pfCurves.length === n && q.pfCurves.every(c => c.v); }, { timeout: 120000 }, n);

const A = await toMap(p, -49.95, 69.17), B = await toMap(p, -48.9, 69.10);
await zoomTo(p, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], Math.abs(B[0] - A[0]) / 2 + 10e3, Math.abs(B[1] - A[1]) / 2 + 10e3);
check('profile section shown for a velocity product', !(await hidden(p, 'pfSec')));
await p.$eval('#pfSec', e => { e.open = true; });
await p.click('#pfDraw');
const a = await toPixel(p, A), b = await toPixel(p, B);
await p.mouse.click(a[0], a[1]); await sleep(400); await p.mouse.click(b[0], b[1]);
await curvesRead(1);
let s = await pf();
check('line read: one curve, over half finite (it starts in the fjord)', s.n === 1 && s.finite[0] > 0.5, s.finite);
check('plot and axis sliders shown', !(await hidden(p, 'pfPlot')) && !(await hidden(p, 'pfAxRow')));

// another date adds a curve
await p.evaluate(() => { const t = document.querySelectorAll('#tticks .tick'); t[t.length - 4].click(); });
await curvesRead(2);
s = await pf();
check('second date adds a curve', s.n === 2 && s.ids[0] !== s.ids[1], s.ids);
check('curve count in the section title', /2 curves/.test(await text(p, 'pfCount')), await text(p, 'pfCount'));

// legend: click hides, click again shows, x removes
await p.mouse.move(5, 5); await sleep(500);
const legendHit = remove => p.evaluate(remove => { const h = window.grimpViewer.pf().pfLegendHits.find(h => !!h.remove === remove); return h && { x: h.x, y: h.y, w: h.w, h: h.h }; }, remove);
let xy = await hitCenter(p, 'pfCanvas', await legendHit(false));
await p.mouse.click(xy[0], xy[1]); await sleep(300);
check('legend click hides a curve', (await pf()).off.filter(Boolean).length === 1, (await pf()).off);
await p.mouse.click(xy[0], xy[1]); await sleep(300);
check('second click shows it again', (await pf()).off.every(o => !o), (await pf()).off);
xy = await hitCenter(p, 'pfCanvas', await legendHit(true));
await p.mouse.click(xy[0], xy[1]); await sleep(300);
check('legend x removes a curve', (await pf()).n === 1);
await p.evaluate(() => { const t = document.querySelectorAll('#tticks .tick'); t[t.length - 4].click(); t[t.length - 1].click(); });
await sleep(1500); await curvesRead(2);
check('a removed curve comes back when its product is shown', (await pf()).n === 2);

// axis ranges
await p.$eval('#pfAxRow', e => e.scrollIntoView());
const x0 = [await text(p, 'pfXMinV'), await text(p, 'pfXMaxV')];
await dragTo(p, 'pfXLo', 0.45); await dragTo(p, 'pfXHi', 0.75);
const x1 = [await text(p, 'pfXMinV'), await text(p, 'pfXMaxV')];
check('x sliders narrow the x range', +x1[0] > +x0[0] && +x1[1] < +x0[1], { x0, x1 });
check('x Auto offered once set', !(await hidden(p, 'pfXAuto')));
await dragTo(p, 'pfYHi', 0.4);
check('y slider sets a y range', (await pf()).ax[1] !== null, (await pf()).ax);
await shot(p, 'profileLineAxes');
await p.click('#pfXAuto'); await p.click('#pfYAuto'); await sleep(200);
check('Auto restores both axes', (await pf()).ax.every(v => v === null) && (await text(p, 'pfXMinV')) === x0[0], (await pf()).ax);

// ITS_LIVE: an annual product uses the ITS_LIVE annual mosaic of its central year (they end in 2022)
const itsDone = () => p.waitForFunction(() => window.grimpViewer.pf().pfIts && !/reading|finding|read \d+ of/.test(document.getElementById('pfItsNote').textContent), { timeout: 240000 });
const its = () => p.evaluate(() => { const i = window.grimpViewer.pf().pfIts; return { annual: i.annual, year: i.year, n: i.pairs.length, finite: i.pairs.length ? [...i.pairs[0].v].filter(Number.isFinite).length / i.pairs[0].v.length : 0 }; });
await p.click('#pfIts'); await sleep(300); await itsDone();
let q = await its();
check('no ITS_LIVE annual mosaic for 2025: none drawn, note says so', q.annual && q.year === 2025 && q.n === 0 && /ITS_LIVE: /.test(await text(p, 'pfItsNote')), { ...q, note: await text(p, 'pfItsNote') });
await p.evaluate(() => { const t = [...document.querySelectorAll('#tticks .tick')]; t[t.length - 4].click(); });
await sleep(1500); await itsDone();
q = await its();
check('ITS_LIVE 2022 annual mosaic read for the Dec 2021-Nov 2022 product', q.annual && q.year === 2022 && q.finite > 0.5, q);
check('pair window disabled in annual mode', await p.$eval('#pfItsDt', e => e.disabled));

// CSV export: GrIMP curves only, never the ITS_LIVE samples shown
const out = new URL('./out/', import.meta.url).pathname, fs = await import('fs');
for (const f of fs.readdirSync(out)) if (f.endsWith('_profile.csv')) fs.unlinkSync(out + f);
const cdp = await p.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: out });
await p.click('#pfCsv');
let csv = null; for (let i = 0; i < 40 && !csv; i++) { await sleep(250); const f = fs.readdirSync(out).find(f => f.endsWith('_profile.csv')); if (f) csv = fs.readFileSync(out + f, 'utf8'); }
const csvRows = csv ? csv.trim().split('\n').slice(1) : [];
check('profile CSV has GrIMP rows only (no ITS_LIVE)', csvRows.length > 100 && csvRows.every(r => r.startsWith('GrIMP,')) && !/ITS_LIVE/.test(csv), { rows: csvRows.length, sources: [...new Set(csvRows.map(r => r.split(',')[0]))] });
await shot(p, 'profileLineIts');
await finish(browser);
