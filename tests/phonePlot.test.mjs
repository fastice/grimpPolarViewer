// Plots on a phone (390 x 844, Greenland annual): an accepted flow-line profile and the panel stay inside
// the screen width; its grip and corner are finger-sized and move / resize it by touch.
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, shot, sleep, finish } from './lib.mjs';

const [W, H] = (process.env.PHONE || '390x844').split('x').map(Number);
const { browser, page: p } = await openViewer(catalogs.glAnnual, { width: W, height: H, mobile: true });
const P = await toMap(p, -49.5, 69.17);
await zoomTo(p, P, 40e3);
await p.$eval('#pfSec', e => { e.open = true; e.scrollIntoView(); });
await p.$eval('#pfFlow', e => e.click());
const px = await toPixel(p, P);
await p.mouse.click(px[0], px[1]);
await p.waitForFunction(() => window.grimpViewer.pf().pfFlow && !document.getElementById('pfAccept').disabled, { timeout: 120000 });
await p.$eval('#pfAccept', e => e.click());
await p.waitForFunction(() => { const q = window.grimpViewer.pf(); return q.pfCurves.length && q.pfCurves.every(c => c.v); }, { timeout: 120000 });
await sleep(800);
const m = await p.evaluate(() => {
  const r = id => { const b = document.getElementById(id).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right)]; };
  const wide = [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && e.offsetParent)
    .slice(0, 8).map(e => `${e.tagName}#${e.id}.${e.className}:${Math.round(e.getBoundingClientRect().right)}`);
  return { vw: innerWidth, screen: screen.width, vv: visualViewport.width, doc: document.documentElement.scrollWidth, plot: r('pfPlot'), canvas: r('pfCanvas'), wide };
});
check('profile plot inside the screen', m.plot[0] >= 0 && m.plot[1] <= m.vw, m);
check('no horizontal page scroll', m.doc <= m.vw, m);
const box = id => p.$eval('#' + id, e => { const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: Math.round(b.width), h: Math.round(b.height) }; });
const sizes = { drag: await box('pfDrag'), size: await box('pfSize'), close: await box('pfHide') };
check('move grip, resize corner and close are finger-sized (>= 34 px)', Object.values(sizes).every(b => b.w >= 34 && b.h >= 34), sizes);
const touchDrag = async (b, dx, dy) => { await p.touchscreen.touchStart(b.x, b.y); for (let k = 1; k <= 5; k++) await p.touchscreen.touchMove(b.x + dx * k / 5, b.y + dy * k / 5); await p.touchscreen.touchEnd(); await sleep(300); };
const t0 = (await box('pfPlot')).y;
await touchDrag(sizes.drag, 0, 30);
check('touch drag on the grip moves the plot', (await box('pfPlot')).y > t0 + 15);
const r0 = await box('pfPlot');
await touchDrag(await box('pfSize'), -60, -40);
const r1 = await box('pfPlot'), right = await p.$eval('#pfPlot', e => e.getBoundingClientRect().right);
check('touch drag on the corner resizes the plot, inside the screen', r1.h < r0.h - 20 && right <= m.vw, { r0, r1, right });
await shot(p, 'phonePlot');
await finish(browser);
