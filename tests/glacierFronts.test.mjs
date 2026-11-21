// Glacier fronts (NSIDC-0642 v2): off by default, ticking loads every front with a year legend; at Jakobshavn
// the readout names the date of the front under the pointer; disabled in Antarctica.
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, text, hidden, shot, sleep, finish } from './lib.mjs';

let { browser, page: p } = await openViewer(catalogs.glAnnual);
const fronts = () => p.evaluate(() => {
  const n = window.grimpViewer.map.getLayers().getArray().filter(l => l.getZIndex() === 5 && l.getSource()?.getFeatures).map(l => l.getSource().getFeatures()).flat().filter(f => f.get('year')).length;
  return { n, on: document.getElementById('frontsOn').checked, disabled: document.getElementById('frontsOn').disabled, legend: !document.getElementById('frontsLegend').hidden }; });
let s = await fronts();
check('Glacier fronts off by default, enabled in Greenland', !s.on && !s.disabled && s.n === 0 && !s.legend, s);
await p.click('#frontsOn');
await p.waitForFunction(() => window.grimpViewer.map.getLayers().getArray().some(l => l.getZIndex() === 5 && l.getSource()?.getFeatures?.().some(f => f.get('year'))), { timeout: 60000 });
s = await fronts();
check('ticking loads every front, legend shown', s.n === 5582 && s.legend, s);
check('legend spans 1972-73 to 2020-21', (await text(p, 'frontsMin')) === '1972-73' && (await text(p, 'frontsMax')) === '2020-21', [await text(p, 'frontsMin'), await text(p, 'frontsMax')]);

// Jakobshavn: point at the newest front near the fjord head; the readout gives its date
const J = await toMap(p, -49.9, 69.17);
await zoomTo(p, J, 25e3); await sleep(1500);
const v = await p.evaluate(J => { const f = window.grimpViewer.map.getLayers().getArray().filter(l => l.getZIndex() === 5 && l.getSource()?.getFeatures).map(l => l.getSource().getFeatures()).flat()
  .filter(f => f.get('year') === 2021).map(f => ({ f, d: Math.hypot(...ol.extent.getCenter(f.getGeometry().getExtent()).map((c, i) => c - J[i])) })).sort((a, b) => a.d - b.d)[0];
  const c = f.f.getGeometry().getCoordinates(); return { xy: c[Math.floor(c.length / 2)], date: f.f.get('date'), glacier: f.f.get('glacier'), d: Math.round(f.d) }; }, J);
check('a 2020-21 front lies at Jakobshavn', v.d < 15e3, v);
const px = await toPixel(p, v.xy);
await p.mouse.move(px[0], px[1]); await sleep(800);
const ro = await text(p, 'readout');
check('readout gives the date of the front under the pointer', ro.includes('front') && ro.includes(v.date), ro);
await p.mouse.move(5, 5);
await shot(p, 'glacierFrontsJakobshavn');
await p.click('#frontsOn'); await sleep(200);
check('unticking hides the fronts and legend', await hidden(p, 'frontsLegend'));
await browser.close();

({ browser, page: p } = await openViewer(catalogs.aseAnnual));
check('disabled in Antarctica', await p.$eval('#frontsOn', e => e.disabled));
await finish(browser);
