// Browse image as the pick map (Jakobshavn, Greenland annual): with the RGB browse image shown, the time
// series and profile sections stay, and points and lines read vv.
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, hidden, text, shot, sleep, finish } from './lib.mjs';

const { browser, page: p } = await openViewer(catalogs.glAnnual);
await zoomTo(p, await toMap(p, -49.1, 69.2), 60e3, 45e3);
const keys = await p.$$eval('#asset option', o => o.map(e => e.value));
check('annual items have a browse image and vv', keys.includes('browse') && keys.includes('vv'), keys);
await p.select('#asset', 'browse'); await sleep(1500);
check('time series and profile sections shown under the browse image', !(await hidden(p, 'tsSec')) && !(await hidden(p, 'pfSec')));

await p.evaluate(() => { document.getElementById('tsSec').open = true; document.getElementById('cropSec').open = false; });
await p.$eval('#tsAdd', e => e.click());
const px = await toPixel(p, await toMap(p, -49.30, 69.17));
await p.mouse.click(px[0], px[1]); await sleep(300);
await p.$eval('#tsAdd', e => e.click());
await p.waitForFunction(() => /dates in/.test(document.getElementById('tsNote').textContent), { timeout: 240000 });
const ts = await p.evaluate(() => window.grimpViewer.ts().tsPoints.map(q => q.values.filter(v => Number.isFinite(v?.v ?? v)).length));
check('point reads a vv series', ts.length === 1 && ts[0] >= 2, { ts, note: await text(p, 'tsNote') });

const A = await toMap(p, -49.95, 69.17), B = await toMap(p, -48.9, 69.10);
await p.$eval('#pfSec', e => { e.open = true; });
await p.click('#pfDraw');
const a = await toPixel(p, A), b = await toPixel(p, B);
await p.mouse.click(a[0], a[1]); await sleep(400); await p.mouse.click(b[0], b[1]);
await p.waitForFunction(() => { const q = window.grimpViewer.pf(); return q.pfCurves.length === 1 && q.pfCurves[0].v; }, { timeout: 120000 });
const pf = await p.evaluate(() => { const q = window.grimpViewer.pf(); return { key: q.pfKey, finite: [...q.pfCurves[0].v].filter(Number.isFinite).length / q.pfCurves[0].v.length }; });
check('line reads vv', pf.key === 'vv' && pf.finite > 0.5, pf);
check('browse image still shown', await p.$eval('#asset', e => e.value) === 'browse');
await shot(p, 'browsePick');
await finish(browser);
