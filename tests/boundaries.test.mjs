// Antarctic boundaries (NSIDC-0709 v2): off by default, ticking draws the grounding line, ice shelves and IMBIE
// basins with a legend whose entries toggle each layer; ice-shelf names only when zoomed in; disabled in Greenland.
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, text, hidden, shot, sleep, finish } from './lib.mjs';

let { browser, page: p } = await openViewer(catalogs.aseAnnual);
const st = () => p.evaluate(() => {
  const f = window.grimpViewer.map.getLayers().getArray().filter(l => l.getZIndex() === 5 && l.getSource()?.getFeatures).flatMap(l => l.getSource().getFeatures()).filter(f => f.get('kind'));
  const n = k => f.filter(x => x.get('kind') === k && !x.get('label')).length;
  return { gl: n('groundingLine'), front: n('iceFront'), shelves: n('iceShelves'), basins: n('basins'), labels: f.filter(x => x.get('label')).map(x => x.get('name')),
    on: document.getElementById('boundsOn').checked, disabled: document.getElementById('boundsOn').disabled, legend: !document.getElementById('boundsLegend').hidden }; });
let s = await st();
check('Boundaries off by default, enabled in Antarctica', !s.on && !s.disabled && s.gl === 0 && !s.legend, s);
await p.click('#boundsOn');
await p.waitForFunction(() => window.grimpViewer.map.getLayers().getArray().some(l => l.getZIndex() === 5 && l.getSource()?.getFeatures?.().some(f => f.get('kind'))), { timeout: 60000 });
s = await st();
check('grounding line, 2026 mask ice front (191 rings) and 19 basins drawn, no 2008-09 shelf outlines, legend shown', s.gl === 1 && s.front === 1 && s.shelves === 0 && s.basins === 19 && s.legend
  && await p.evaluate(() => window.grimpViewer.map.getLayers().getArray().filter(l => l.getZIndex() === 5 && l.getSource()?.getFeatures).flatMap(l => l.getSource().getFeatures()).find(f => f.get('kind') === 'iceFront').getGeometry().getLineStrings().length === 191), { ...s, labels: s.labels.length });
check('labels include Pine Island and Thwaites shelves and basin labels', ['Pine Island', 'Thwaites', 'Ross West', 'Ep-F'].every(n => s.labels.includes(n)), s.labels.filter(n => /Pine|Thwaites|Ross|Ep-F/.test(n)));
const shelfLabel = res => p.evaluate(res => { const l = window.grimpViewer.map.getLayers().getArray().find(l => l.getZIndex() === 5 && l.getSource()?.getFeatures?.().some(f => f.get('kind')));
  const f = l.getSource().getFeatures().find(f => f.get('label') && f.get('kind') === 'iceShelves'); return !!l.getStyleFunction()(f, res); }, res);
check('ice-shelf names only when zoomed in', (await shelfLabel(500)) && !(await shelfLabel(3000)));
await sleep(1500); await shot(p, 'boundariesAse');

// dated Amundsen Sea grounding lines (NSIDC-0498 v2.1)
await p.waitForFunction(() => window.grimpViewer.map.getLayers().getArray().some(l => l.getZIndex() === 5 && l.getSource()?.getFeatures?.().some(f => f.get('sensor') !== undefined)), { timeout: 60000 });
const gl = await p.evaluate(() => { const f = window.grimpViewer.map.getLayers().getArray().filter(l => l.getZIndex() === 5 && l.getSource()?.getFeatures).flatMap(l => l.getSource().getFeatures()).filter(f => f.get('sensor') !== undefined);
  return { n: f.length, years: [Math.min(...f.map(x => x.get('year'))), Math.max(...f.map(x => x.get('year')))], pig: f.filter(x => x.get('glacier') === 'Pine Island').length }; });
check('466 dated grounding lines, 1992-2025, legend years', gl.n === 466 && gl.years.join() === '1992,2025' && (await text(p, 'glMin')) === '1992' && (await text(p, 'glMax')) === '2025', gl);
const PIG = await toMap(p, -100.2, -75.1);
await zoomTo(p, PIG, 30e3); await sleep(1500);
const v = await p.evaluate(P => { const f = window.grimpViewer.map.getLayers().getArray().filter(l => l.getZIndex() === 5 && l.getSource()?.getFeatures).flatMap(l => l.getSource().getFeatures())
  .filter(f => f.get('glacier') === 'Pine Island' && /^2024-/.test(f.get('date'))).map(f => ({ f, c: f.getGeometry().getClosestPoint(P) })).sort((a, b) => Math.hypot(a.c[0] - P[0], a.c[1] - P[1]) - Math.hypot(b.c[0] - P[0], b.c[1] - P[1]))[0];
  return { c: f.c, date: f.f.get('date') }; }, PIG).catch(e => ({ err: e.message }));
check('a dated 2024 Pine Island grounding line exists', !!v.c, v);
if (v.c) {
  const px = await toPixel(p, v.c);
  await p.mouse.move(px[0], px[1]); await sleep(800);
  const ro = await text(p, 'readout');
  check('readout gives grounding-line dates under the pointer', /grounding line/.test(ro) && /2024-/.test(ro) && /Pine Island/.test(ro), ro);
  await p.mouse.move(5, 5); await sleep(500); await shot(p, 'groundingLinesPig');
}
// legend entries toggle their layer
const drawn = kind => p.evaluate(kind => { const l = window.grimpViewer.map.getLayers().getArray().find(l => l.getZIndex() === 5 && l.getSource()?.getFeatures?.().some(f => f.get('kind')));
  const f = l.getSource().getFeatures().find(f => f.get('kind') === kind && !f.get('label')); return !!l.getStyleFunction()(f, 500); }, kind);
const glShown = () => p.evaluate(() => window.grimpViewer.map.getLayers().getArray().find(l => l.getZIndex() === 5 && l.getSource()?.getFeatures?.().some(f => f.get('sensor') !== undefined)).getVisible());
const key = k => p.$eval(`#boundsLegend .bkey[data-kind=${k}]`, e => e.click());
await key('basins'); await key('dated');
check('clicking basins and dated legend entries hides those layers only', !(await drawn('basins')) && !(await glShown()) && (await drawn('groundingLine')) && (await drawn('iceFront'))
  && await p.$eval('#boundsLegend .bkey[data-kind=basins]', e => e.classList.contains('off') && e.getAttribute('aria-pressed') === 'false'));
await sleep(800); await shot(p, 'boundariesToggled');
await key('basins'); await key('dated');
check('clicking again shows them', (await drawn('basins')) && (await glShown()));
await p.click('#boundsOn'); await sleep(200);
check('unticking hides them and the legend', await hidden(p, 'boundsLegend'));
await browser.close();

({ browser, page: p } = await openViewer(catalogs.glAnnual));
check('disabled in Greenland', await p.$eval('#boundsOn', e => e.disabled));
await finish(browser);
