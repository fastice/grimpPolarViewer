// Share this view carries the optional layers and their settings and the profile or flow line (Jakobshavn,
// Greenland annual): a link made with fronts (2000 on), basins, speed contours (typed levels), particles and
// a flow line with 5-year travel-time marks reopens with all of them; then a drawn line.
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, sleep, finish } from './lib.mjs';

const { browser, page: p } = await openViewer(catalogs.glAnnual);
const P = await toMap(p, -49.5, 69.17);
await zoomTo(p, P, 40e3);
for (const id of ['frontsOn', 'boundsOn', 'contourOn', 'particlesOn']) await p.click('#' + id);
await p.waitForFunction(() => document.getElementById('frontsMin').textContent, { timeout: 60000 });
await p.evaluate(() => { const lo = document.getElementById('frontsLo'); lo.value = '2000'; lo.dispatchEvent(new Event('input'));
  const c = document.getElementById('contourLevels'); c.value = '300, 3000'; c.dispatchEvent(new Event('change')); });
await p.$eval('#pfSec', e => { e.open = true; e.scrollIntoView(); });
await p.click('#pfFlow');
const px = await toPixel(p, P);
await p.mouse.click(px[0], px[1]);
await p.waitForFunction(() => window.grimpViewer.pf().pfFlow && !document.getElementById('pfAccept').disabled, { timeout: 120000 });
await p.evaluate(() => { const lo = document.getElementById('pfLo'); lo.value = '-15'; lo.dispatchEvent(new Event('input')); });
await p.click('#pfAccept');
await p.click('#pfYrOn'); await p.select('#pfYrStep', '5');
await p.click('#share'); await sleep(300);
const link = await p.evaluate(() => location.href);
check('link names the layers, ranges and flow line', /on=fronts%2Cbounds%2Cparticles%2Ccontour|on=fronts,bounds,particles,contour/.test(link) && /fy=2000/.test(link) && /clev=300/.test(link) && /flow=/.test(link) && /flen=-15000/.test(link) && /yr=5/.test(link), link);

const q = await browser.newPage();
q.on('pageerror', e => check('no page errors', false, e.message));
await q.setViewport({ width: 1400, height: 900 });
await q.goto(link, { waitUntil: 'networkidle2', timeout: 120000 });
await q.waitForFunction(() => window.grimpViewer.pf().pfCurves.length && window.grimpViewer.pf().pfCurves.every(c => c.v) && window.grimpViewer.fx().particlesRunning
  && window.grimpViewer.fx().contourLevels.length, { timeout: 180000 });
await sleep(1000);
const s = await q.evaluate(() => {
  const g = id => document.getElementById(id), f = window.grimpViewer.fx(), pf = window.grimpViewer.pf();
  return { boxes: ['frontsOn', 'boundsOn', 'contourOn', 'particlesOn', 'namesOn', 'arrowsOn'].map(id => g(id).checked).join(), frontsLo: +g('frontsLo').value,
    levels: [...new Set(f.contourLevels)].sort((a, b) => a - b).join(), accepted: g('pfAccept').textContent, off: Math.round(pf.pfOff), marks: f.pfMarks.map(m => m.t), step: g('pfYrStep').value };
});
check('reopened with the same boxes ticked', s.boxes === 'true,true,true,true,false,false', s.boxes);
check('fronts from 2000, contours at 300 and 3000', s.frontsLo === 2000 && s.levels === '300,3000', s);
check('flow line traced, accepted, 15 km upstream, 5-year marks', s.accepted === 'Adjust point' && Math.abs(s.off + 15000) < 300 && s.step === '5' && s.marks.length > 0 && s.marks.every(t => t % 5 === 0), s);
await q.close();

// a drawn line
await p.click('#pfClear');
const A = await toMap(p, -49.4, 69.17), B = await toMap(p, -49.8, 69.2);
await p.click('#pfDraw');
const a = await toPixel(p, A), b = await toPixel(p, B);
await p.mouse.click(a[0], a[1]); await sleep(400); await p.mouse.click(b[0], b[1]);
await p.waitForFunction(() => window.grimpViewer.pf().pfCurves.length, { timeout: 60000 });
const line = await p.evaluate(() => window.grimpViewer.pf().pfLine.map(c => c.map(Math.round)));
await p.click('#share'); await sleep(300);
const link2 = await p.evaluate(() => location.href);
const r = await browser.newPage();
await r.setViewport({ width: 1400, height: 900 });
await r.goto(link2, { waitUntil: 'networkidle2', timeout: 120000 });
await r.waitForFunction(() => window.grimpViewer.pf().pfCurves.length && window.grimpViewer.pf().pfCurves.every(c => c.v), { timeout: 120000 });
const line2 = await r.evaluate(() => window.grimpViewer.pf().pfLine.map(c => c.map(Math.round)));
check('a drawn line reopens with its curve', JSON.stringify(line2) === JSON.stringify(line) && !/flow=/.test(link2), { line, line2 });
await finish(browser);
