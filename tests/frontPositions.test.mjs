// Fronts along a line (Jakobshavn, Greenland annual): with Glacier fronts on, the crossings of the winter
// fronts with a line drawn down the fjord are listed, plotted against date and ticked on the profile plot;
// the year slider narrows them. A flow line stops at the newest front (where the mosaic ends), so only the
// fronts since about 2014 cross it. Travel-time marks dot a flow line every 1 or 5 years downstream (+) and
// upstream (-).
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, text, hidden, shot, sleep, finish } from './lib.mjs';

const { browser, page: p } = await openViewer(catalogs.glAnnual);
const fx = () => p.evaluate(() => { const q = window.grimpViewer.fx(); return { n: q.fpCross.length, years: q.fpCross.map(c => c.year), km: q.fpCross.map(c => c.km), marks: q.pfMarks.map(m => [m.t, m.km]) }; });
await p.click('#frontsOn');
await p.waitForFunction(() => !document.getElementById('frontsLegend').hidden && document.getElementById('frontsMin').textContent, { timeout: 60000 });
const A = await toMap(p, -49.4, 69.17), Bm = await toMap(p, -50.2, 69.2);
await zoomTo(p, A.map((v, i) => (v + Bm[i]) / 2), 30e3);
await p.$eval('#pfSec', e => { e.open = true; e.scrollIntoView(); });
await p.click('#pfDraw');
const a = await toPixel(p, A), b = await toPixel(p, Bm);
await p.mouse.click(a[0], a[1]); await sleep(400); await p.mouse.click(b[0], b[1]);
await p.waitForFunction(() => { const q = window.grimpViewer.pf(); return q.pfCurves.length && q.pfCurves.every(c => c.v); }, { timeout: 120000 });
await sleep(500);
let f = await fx();
check('fronts cross the line down the fjord, 1973-2021', f.n >= 20 && Math.min(...f.years) <= 1980 && Math.max(...f.years) >= 2020,
  { n: f.n, years: [Math.min(...f.years), Math.max(...f.years)], km: [Math.min(...f.km), Math.max(...f.km)].map(v => +v.toFixed(1)) });
check('Fronts along the line offered, with a count', !(await hidden(p, 'fpRow')) && /crossings/.test(await text(p, 'fpNote')), await text(p, 'fpNote'));
// the fronts retreated: the newest crossings are nearer the point than the oldest
const old = f.km.filter((k, i) => f.years[i] <= 1990), recent = f.km.filter((k, i) => f.years[i] >= 2015);
check('newest fronts are nearer A than the oldest (retreat)', Math.max(...recent) < Math.min(...old), { old: Math.min(...old).toFixed(1), recent: Math.max(...recent).toFixed(1) });
await p.click('#fpShow'); await sleep(500);
check('front-position plot shown', !(await hidden(p, 'fpPlot')));
await shot(p, 'frontPositions');
await p.evaluate(() => { const lo = document.getElementById('frontsLo'); lo.value = '2010'; lo.dispatchEvent(new Event('input')); });
await sleep(300);
f = await fx();
check('the fronts slider narrows the crossings', f.n > 0 && Math.min(...f.years) >= 2010, { n: f.n, min: Math.min(...f.years) });
await p.click('#fpHide');
await p.evaluate(() => { const lo = document.getElementById('frontsLo'); lo.value = lo.min; lo.dispatchEvent(new Event('input')); });

// travel-time marks on a flow line
const P = await toMap(p, -49.5, 69.17);
await zoomTo(p, P, 40e3);
await p.click('#pfFlow');
const px = await toPixel(p, P);
await p.mouse.click(px[0], px[1]);
await p.waitForFunction(() => window.grimpViewer.pf().pfFlow && !document.getElementById('pfAccept').disabled, { timeout: 120000 });
await p.evaluate(() => { const hi = document.getElementById('pfHi'); hi.value = hi.max; hi.dispatchEvent(new Event('input')); });
await p.click('#pfAccept');
await p.waitForFunction(() => { const q = window.grimpViewer.pf(); return q.pfCurves.length && q.pfCurves.every(c => c.v); }, { timeout: 120000 });
await sleep(500);
f = await fx();
check('the newest fronts cross the flow line, downstream of the point', f.n > 0 && Math.min(...f.years) >= 2010 && f.km.every(k => k > 0), { n: f.n, years: f.years });
await p.click('#pfYrOn'); await sleep(300);
f = await fx();
const down = f.marks.filter(m => m[0] > 0), up = f.marks.filter(m => m[0] < 0);
check('yearly marks both ways, + downstream at increasing km, - upstream at negative km', down.length >= 1 && up.length >= 3
  && down.every((m, i) => m[1] > 0 && (!i || m[1] > down[i - 1][1])) && up.every(m => m[1] < 0) && /marks, 1 year apart/.test(await text(p, 'pfYrNote')), { down: down.slice(0, 4), up: up.slice(0, 4), note: await text(p, 'pfYrNote') });
const n1 = f.marks.length;
await p.select('#pfYrStep', '5'); await sleep(300);
f = await fx();
check('5-year marks: fewer, at multiples of 5', f.marks.length < n1 && f.marks.every(m => m[0] % 5 === 0), { n1, n5: f.marks.length });
check('marks drawn on the map', await p.evaluate(() => window.grimpViewer.map.getLayers().getArray().some(l => l.getSource?.()?.getFeatures?.().some(x => x.get('yr') !== undefined))));
await zoomTo(p, P, 25e3); await sleep(1500); await shot(p, 'travelMarks');
await p.click('#pfYrOn'); await sleep(200);
check('unticking removes the marks', (await fx()).marks.length === 0);
await p.click('#pfClear'); await sleep(200);
check('Clear line hides Fronts along the line', await hidden(p, 'fpRow'));

// typed flow-line points
const typed = async t => {
  await p.$eval('#pfAt', (e, t) => { e.value = t; }, t); await p.click('#pfAtGo');
  await p.waitForFunction(() => window.grimpViewer.pf().pfFlow || /Type the point|No velocity|Could not/.test(document.getElementById('pfNote').textContent), { timeout: 120000 });
  return p.evaluate(() => window.grimpViewer.pf().pfFlow?.p0.map(Math.round) || null);
};
const want = (await toMap(p, -49.5, 69.17)).map(Math.round);
let got = await typed('69.17N 49.5W');
check('lat/lon with letters traces from that point', got && Math.hypot(got[0] - want[0], got[1] - want[1]) < 2, { got, want });
await p.click('#pfClear');
got = await typed('-180, -2273 km');
check('x, y in km traces from that point', got && got[0] === -180000 && got[1] === -2273000, got);
await p.click('#pfClear');
got = await typed('Jakobshavn');
check('unreadable text says how to type it', !got && /Type the point/.test(await text(p, 'pfNote')), await text(p, 'pfNote'));
await finish(browser);
