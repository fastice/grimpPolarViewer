// Glacier fronts (NSIDC-0642 v2): off by default, ticking loads every front with a year legend; at Jakobshavn
// the readout names the date of the front under the pointer; the color bar's two handles pick the winters drawn;
// disabled in Antarctica.
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, dragRange, text, hidden, shot, sleep, finish } from './lib.mjs';

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

// year range: drag the first-winter handle to ~2000 with the mouse, step the last back 3 winters with the keyboard
const drawnYears = () => p.evaluate(() => { const l = window.grimpViewer.map.getLayers().getArray().find(l => l.getZIndex() === 5 && l.getSource()?.getFeatures?.().some(f => f.get('year')));
  const fn = l.getStyleFunction(), ys = new Set(); for (const f of l.getSource().getFeatures()) if (fn(f, 100)) ys.add(f.get('year')); return [...ys].sort((a, b) => a - b); });
await dragRange(p, 'frontsLo', 2000);
await p.focus('#frontsHi'); for (let k = 0; k < 3; k++) await p.keyboard.press('ArrowLeft'); await sleep(300);
const lo = +(await p.$eval('#frontsLo', e => e.value)), hi = +(await p.$eval('#frontsHi', e => e.value)), ys = await drawnYears();
check('handles pick the winters drawn, labels follow', Math.abs(lo - 2000) <= 1 && hi === 2018 && ys[0] === lo && ys[ys.length - 1] === 2018
  && (await text(p, 'frontsMin')) === `${lo - 1}-${String(lo).slice(2)}` && (await text(p, 'frontsMax')) === '2017-18', { lo, hi, ys: [ys[0], ys[ys.length - 1]] });
await p.mouse.move(px[0], px[1]); await sleep(800);
check('a hidden 2020-21 front is not in the readout', !(await text(p, 'readout')).includes(v.date), await text(p, 'readout'));
await p.mouse.move(5, 5); await sleep(500); await shot(p, 'glacierFrontsRange');
// the band between the handles shifts both, keeping the span
const bandAt = await p.evaluate(() => { const r = document.getElementById('frontsBand').getBoundingClientRect(), t = document.getElementById('frontsBar').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, perYear: t.width / (document.getElementById('frontsLo').max - document.getElementById('frontsLo').min) }; });
await p.mouse.move(bandAt.x, bandAt.y); await p.mouse.down(); await p.mouse.move(bandAt.x - 10 * bandAt.perYear, bandAt.y, { steps: 8 }); await p.mouse.up(); await sleep(300);
const sh = { lo: +(await p.$eval('#frontsLo', e => e.value)), hi: +(await p.$eval('#frontsHi', e => e.value)) }, ys2 = await drawnYears();
check('dragging the band shifts both handles 10 winters, span kept', sh.lo === lo - 10 && sh.hi === 2008 && ys2[0] === sh.lo && ys2[ys2.length - 1] === 2008
  && (await text(p, 'frontsMax')) === '2007-08', { sh, ys: [ys2[0], ys2[ys2.length - 1]] });
await dragRange(p, 'frontsHi', 1980); await sleep(200);
check('a handle dragged past the other pushes it', +(await p.$eval('#frontsLo', e => e.value)) === +(await p.$eval('#frontsHi', e => e.value)));
await p.click('#frontsOn'); await sleep(200);
check('unticking hides the fronts and legend', await hidden(p, 'frontsLegend'));
await browser.close();

({ browser, page: p } = await openViewer(catalogs.aseAnnual));
check('disabled in Antarctica', await p.$eval('#frontsOn', e => e.disabled));
await finish(browser);
