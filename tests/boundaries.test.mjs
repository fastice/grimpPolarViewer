// Antarctic boundaries (NSIDC-0709 v2): off by default, ticking draws the grounding line, ice shelves and IMBIE
// basins with a legend; ice-shelf names only when zoomed in; disabled in Greenland.
import { openViewer, catalogs, check, hidden, shot, sleep, finish } from './lib.mjs';

let { browser, page: p } = await openViewer(catalogs.aseAnnual);
const st = () => p.evaluate(() => {
  const f = window.grimpViewer.map.getLayers().getArray().filter(l => l.getZIndex() === 5 && l.getSource()?.getFeatures).flatMap(l => l.getSource().getFeatures()).filter(f => f.get('kind'));
  const n = k => f.filter(x => x.get('kind') === k && !x.get('label')).length;
  return { gl: n('groundingLine'), shelves: n('iceShelves'), basins: n('basins'), labels: f.filter(x => x.get('label')).map(x => x.get('name')),
    on: document.getElementById('boundsOn').checked, disabled: document.getElementById('boundsOn').disabled, legend: !document.getElementById('boundsLegend').hidden }; });
let s = await st();
check('Boundaries off by default, enabled in Antarctica', !s.on && !s.disabled && s.gl === 0 && !s.legend, s);
await p.click('#boundsOn');
await p.waitForFunction(() => window.grimpViewer.map.getLayers().getArray().some(l => l.getZIndex() === 5 && l.getSource()?.getFeatures?.().some(f => f.get('kind'))), { timeout: 60000 });
s = await st();
check('grounding line, 181 ice shelves and 19 basins drawn, legend shown', s.gl === 1 && s.shelves === 181 && s.basins === 19 && s.legend, { ...s, labels: s.labels.length });
check('labels include Pine Island and Thwaites shelves and basin labels', ['Pine Island', 'Thwaites', 'Ross West', 'Ep-F'].every(n => s.labels.includes(n)), s.labels.filter(n => /Pine|Thwaites|Ross|Ep-F/.test(n)));
const shelfLabel = res => p.evaluate(res => { const l = window.grimpViewer.map.getLayers().getArray().find(l => l.getZIndex() === 5 && l.getSource()?.getFeatures?.().some(f => f.get('kind')));
  const f = l.getSource().getFeatures().find(f => f.get('label') && f.get('kind') === 'iceShelves'); return !!l.getStyleFunction()(f, res); }, res);
check('ice-shelf names only when zoomed in', (await shelfLabel(500)) && !(await shelfLabel(3000)));
await sleep(1500); await shot(p, 'boundariesAse');
await p.click('#boundsOn'); await sleep(200);
check('unticking hides them and the legend', await hidden(p, 'boundsLegend'));
await browser.close();

({ browser, page: p } = await openViewer(catalogs.glAnnual));
check('disabled in Greenland', await p.$eval('#boundsOn', e => e.disabled));
await finish(browser);
