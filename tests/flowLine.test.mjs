// Flow-line profile from a point (Jakobshavn, Greenland annual; Pine Island, Amundsen Sea annual): trace,
// panel layout while adjusting, nudge the point (re-trace), accept, trim with the two-handle slider.
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, text, hidden, shot, sleep, finish } from './lib.mjs';

async function traceAt(p, lon, lat) {
  const P = await toMap(p, lon, lat);
  await zoomTo(p, P, 40e3);
  await p.$eval('#pfSec', e => { e.open = true; e.scrollIntoView(); });
  await p.click('#pfFlow');
  const px = await toPixel(p, P);
  await p.mouse.click(px[0], px[1]);
  await p.waitForFunction(() => (window.grimpViewer.pf().pfFlow && !document.getElementById('pfAccept').disabled) || /Could not|No velocity/.test(document.getElementById('pfNote').textContent), { timeout: 120000 });
  return px;
}
const flow = p => p.evaluate(() => { const f = window.grimpViewer.pf().pfFlow; return f && { p0: f.p0.map(Math.round), up: Math.round(f.up), down: Math.round(f.down), it: f.it.id }; });
const top = (p, id) => p.$eval('#' + id, e => Math.round(e.getBoundingClientRect().top));

let { browser, page: p } = await openViewer(catalogs.glAnnual);
const px = await traceAt(p, -49.5, 69.17);
let f0 = await flow(p);
check('traced up and down stream on the annual mosaic', f0 && f0.up > 10e3 && f0.down > 1e3 && /Annual/.test(f0.it), f0);
check('plot waits for the accept', await hidden(p, 'pfPlot'));
check('accept button shown, in the row with Flow line', !(await hidden(p, 'pfAccept')) && Math.abs((await top(p, 'pfAccept')) - (await top(p, 'pfFlow'))) < 4);
check('accept button reads "Use this line"', (await text(p, 'pfAccept')) === 'Use this line');

// nudge: drag the point 25 px sideways; it traces again
await sleep(400);
await p.mouse.move(px[0], px[1]); await p.mouse.down();
for (let k = 1; k <= 10; k++) { await p.mouse.move(px[0] + 2.5 * k, px[1] + 1.5 * k); await sleep(60); }
await p.mouse.up(); await sleep(500);
await p.waitForFunction(() => !/Tracing/.test(document.getElementById('pfNote').textContent), { timeout: 60000 });
const f1 = await flow(p);
check('dragging the point re-traces from the new point', f1 && (f1.p0[0] !== f0.p0[0] || f1.p0[1] !== f0.p0[1]) && f1.up > 0, { f0: f0.p0, f1 });
check('nothing read before the accept', await p.evaluate(() => window.grimpViewer.pf().pfCurves.length === 0));

await p.click('#pfAccept');
await p.waitForFunction(() => { const q = window.grimpViewer.pf(); return q.pfCurves.length && q.pfCurves.every(c => c.v); }, { timeout: 120000 });
const c = await p.evaluate(() => { const q = window.grimpViewer.pf(), c = q.pfCurves[0]; return { n: c.v.length, finite: [...c.v].filter(Number.isFinite).length / c.v.length, off: q.pfOff }; });
check('accepted line read', c.finite > 0.8 && c.off < 0, c);
check('button now reads "Adjust point"', (await text(p, 'pfAccept')) === 'Adjust point');
check('Hide plot and Clear line stacked beside the buttons', (await top(p, 'pfClear')) > (await top(p, 'pfShow')) && !(await hidden(p, 'pfClear')));
await shot(p, 'flowLineAccepted');

// trim: 20 km upstream, 3 km downstream
await p.evaluate(() => { const lo = document.getElementById('pfLo'), hi = document.getElementById('pfHi');
  lo.value = String(Math.max(+lo.min, -20)); lo.dispatchEvent(new Event('input')); lo.dispatchEvent(new Event('change'));
  hi.value = String(Math.min(+hi.max, 3)); hi.dispatchEvent(new Event('input')); hi.dispatchEvent(new Event('change')); });
await sleep(300);
await p.waitForFunction(() => { const q = window.grimpViewer.pf(); return q.pfCurves.length && q.pfCurves.every(c => c.v); }, { timeout: 60000 });
const t = await p.evaluate(() => { const q = window.grimpViewer.pf(); let L = 0; for (let i = 1; i < q.pfLine.length; i++) L += Math.hypot(q.pfLine[i][0] - q.pfLine[i - 1][0], q.pfLine[i][1] - q.pfLine[i - 1][1]); return { L: Math.round(L), off: Math.round(q.pfOff) }; });
check('slider trims the line to 20 km up + 3 km down', Math.abs(t.L - 23e3) < 600 && Math.abs(t.off + 20e3) < 600, t);
check('slider text gives the lengths', /20\.0 km upstream/.test(await text(p, 'pfFlowText')), await text(p, 'pfFlowText'));

await p.click('#pfClear'); await sleep(200);
check('Clear line hides the accept button and slider', (await hidden(p, 'pfAccept')) && (await hidden(p, 'pfFlowRow')));
await browser.close();

// Antarctica: traced on the Amundsen Sea annual mosaic
({ browser, page: p } = await openViewer(catalogs.aseAnnual));
await traceAt(p, -99.5, -75.1);
const fa = await flow(p);
check('Pine Island traced on the Amundsen Sea annual mosaic', fa && fa.up > 10e3 && /ase|Annual|annual/i.test(fa.it), fa);
await finish(browser);
