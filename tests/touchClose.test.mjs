// Closing things on a phone (Greenland annual, emulated touch): a tap shows the readout with a close button
// that hides it (as does a pan); tapping the time-series plot's x while adding points hides the plot without adding a point.
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, shot, sleep, finish } from './lib.mjs';

const [W, H] = (process.env.PHONE || '390x844').split('x').map(Number);
const { browser, page: p } = await openViewer(catalogs.glAnnual, { width: W, height: H, mobile: true });
await zoomTo(p, await toMap(p, -49.1, 69.2), 60e3, 45e3);
const tapAt = await toPixel(p, await toMap(p, -49.0, 69.3));
await p.touchscreen.tap(tapAt[0], tapAt[1]);
await p.waitForFunction(() => /m\/yr|no data/.test(document.getElementById('roText').textContent), { timeout: 60000 });
check('a tap shows the readout with a close button', !(await p.$eval('#readout', e => e.hidden)) && !(await p.$eval('#roClose', e => e.hidden)), await p.$eval('#roText', e => e.textContent));
await shot(p, 'touchReadout');
const c = await p.$eval('#roClose', e => { const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2, b.width, b.height]; });
await p.touchscreen.tap(c[0], c[1]); await sleep(800);
check('tapping the close button hides the readout and does not reopen it', await p.$eval('#readout', e => e.hidden), c);
await p.touchscreen.tap(tapAt[0], tapAt[1]);
await p.waitForFunction(() => !document.getElementById('readout').hidden, { timeout: 60000 });
await p.touchscreen.touchStart(tapAt[0], tapAt[1]); for (let k = 1; k <= 5; k++) await p.touchscreen.touchMove(tapAt[0] + 8 * k, tapAt[1]); await p.touchscreen.touchEnd(); await sleep(500);
check('a touch pan also hides the readout', await p.$eval('#readout', e => e.hidden));
await p.evaluate(() => { document.getElementById('tsSec').open = true; document.getElementById('cropSec').open = false; });
await p.$eval('#tsAdd', e => e.click());
const px = await toPixel(p, await toMap(p, -49.30, 69.17));
await p.touchscreen.tap(px[0], px[1]);
await p.waitForFunction(() => /dates in/.test(document.getElementById('tsNote').textContent), { timeout: 240000 });
const n = () => p.evaluate(() => window.grimpViewer.ts().tsPoints.length);
const n0 = await n();
const x = await p.$eval('#tsHide', e => { const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
await p.touchscreen.tap(x[0], x[1]); await sleep(800);
check('tapping the plot x hides the plot and adds no point', await p.$eval('#tsPlot', e => e.hidden) && (await n()) === n0, { n0, n: await n() });
await finish(browser);
