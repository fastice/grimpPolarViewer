// Seasonal plot (Jakobshavn, Greenland monthly): a point's series folded onto the months of the year.
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, shot, sleep, finish } from './lib.mjs';

const { browser, page: p } = await openViewer(catalogs.glMonthly);
const P = await toMap(p, -49.6, 69.17);
await zoomTo(p, P, 40e3);
await p.evaluate(() => { document.getElementById('tsSec').open = true; });
await p.$eval('#tsAdd', e => e.click());
const px = await toPixel(p, P);
await p.mouse.click(px[0], px[1]); await sleep(300);
await p.$eval('#tsAdd', e => e.click());
await p.waitForFunction(() => /dates in/.test(document.getElementById('tsNote').textContent), { timeout: 300000 });
const n = await p.evaluate(() => window.grimpViewer.ts().tsPoints[0].values.filter(v => Number.isFinite(v.v)).length);
check('monthly series read', n >= 24, n);
await p.select('#tsXMode', 'season'); await sleep(500);
check('time-bar x option disabled in the seasonal plot', await p.$eval('#tsXBar', e => e.disabled));
const mm = await p.evaluate(() => window.grimpViewer.ts().tsPoints[0].monthMean);
check('monthly means computed for most months', mm && mm.filter(Number.isFinite).length >= 6, mm?.map(v => Math.round(v)));
// a click on a value shows that product: its year is then drawn on top
const before = await p.$eval('#lname', e => e.textContent);
const clicked = await p.evaluate(() => { const c = document.getElementById('tsCanvas'), r = c.getBoundingClientRect(), g = window.grimpViewer.ts().geom,
  x = window.grimpViewer.ts().tsPoints[0].values.filter(v => Number.isFinite(v.v))[5]; return { id: x.it.id, px: [r.left + g.X((+x.it.start + +x.it.end) / 2), r.top + g.Y(x.v)] }; });
await p.mouse.click(clicked.px[0], clicked.px[1]);
await p.waitForFunction(id => document.getElementById('lname').textContent.length && window.grimpViewer.ts().selectedId === id, { timeout: 30000 }, clicked.id).catch(() => {});
check('clicking a value shows that product', (await p.evaluate(() => window.grimpViewer.ts().selectedId)) === clicked.id && (await p.$eval('#lname', e => e.textContent)) !== before, clicked.id);
await sleep(800); await shot(p, 'seasonalPlot');
await p.select('#tsXMode', 'date'); await sleep(300);
check('back to dates re-enables the time-bar option', !(await p.$eval('#tsXBar', e => e.disabled)));
await finish(browser);
