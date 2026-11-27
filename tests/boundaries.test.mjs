// Reference lines. Antarctica: Coastlines (on by default) draws the NSIDC-0709 v2 grounding line and the 2026 mask
// ice front (ice-shelf names only when zoomed in) in place of the GIBS coastline, its legend entries toggling
// each; Basins (off by default) the 19 IMBIE basins with their labels; Dated grounding lines the NSIDC-0498 v2.1
// Amundsen Sea lines with a year slider and readout. Greenland: the GIBS coastline, Basins the 251 Mouginot and
// Rignot (2019) basins unlabeled, Dated grounding lines disabled.
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, dragRange, text, hidden, shot, sleep, finish } from './lib.mjs';

let { browser, page: p } = await openViewer(catalogs.aseAnnual);
// What a reference layer (z-index 4: coastlines, 5: basins) draws at resolution res (m per pixel).
const drawn = (z, res = 500) => p.evaluate((z, res) => {
  const l = window.grimpViewer.map.getLayers().getArray().find(l => l.getZIndex() === z && l instanceof ol.layer.Vector && l.getSource().getFeatures().some(f => f.get('kind')));
  if (!l) return null;
  const fn = l.getStyleFunction(), fs = l.getSource().getFeatures().filter(f => fn(f, res)), lines = fs.filter(f => !f.get('label'));
  return { visible: l.getVisible(), kinds: [...new Set(lines.map(f => f.get('kind')))].sort().join(), n: lines.length, labels: fs.filter(f => f.get('label')).map(f => f.get('name')),
    fronts: lines.find(f => f.get('kind') === 'iceFront')?.getGeometry().getLineStrings().length };
}, z, res);
const gibsCoast = () => p.evaluate(() => window.grimpViewer.map.getLayers().getArray().some(l => l.getZIndex() === 4 && l instanceof ol.layer.Tile && l.getSource()));
const box = id => p.$eval('#' + id, e => ({ on: e.checked, disabled: e.disabled }));

// Coastlines
await p.waitForFunction(() => window.grimpViewer.map.getLayers().getArray().some(l => l.getZIndex() === 4 && l.getVisible() && l.getSource()?.getFeatures?.().some(f => f.get('kind') === 'groundingLine')), { timeout: 60000 });
const c = await drawn(4);
check('Antarctic Coastlines: grounding line and 2026 mask ice front (191 rings), no GIBS coastline, no basins, legend shown',
  c.visible && c.kinds === 'groundingLine,iceFront' && c.fronts === 191 && !(await gibsCoast()) && !(await hidden(p, 'coastLegend')), { ...c, labels: c.labels.length });
check('Coastlines labels ice shelves when zoomed in only', ['Pine Island', 'Thwaites', 'Ross West'].every(n => c.labels.includes(n)) && !c.labels.includes('Ep-F') && (await drawn(4, 3000)).labels.length === 0,
  c.labels.filter(n => /Pine|Thwaites|Ross|Ep-F/.test(n)));
const key = k => p.$eval(`#coastLegend .bkey[data-kind=${k}]`, e => e.click());
await key('iceFront');
let t = await drawn(4);
check('the ice front legend entry hides the ice front and shelf names only', t.kinds === 'groundingLine' && t.labels.length === 0
  && await p.$eval('#coastLegend .bkey[data-kind=iceFront]', e => e.classList.contains('off') && e.getAttribute('aria-pressed') === 'false'), t);
await key('groundingLine'); await key('iceFront');
t = await drawn(4);
check('the grounding line entry hides the grounding line; a second click restores the ice front', t.kinds === 'iceFront' && t.labels.length > 0, { ...t, labels: t.labels.length });
await key('groundingLine');

// Basins
check('Basins and Dated grounding lines off by default, enabled in Antarctica', (await box('boundsOn')).on === false && !(await box('boundsOn')).disabled
  && (await box('glOn')).on === false && !(await box('glOn')).disabled && (await hidden(p, 'boundsLegend')) && (await hidden(p, 'glLegend')));
await p.click('#boundsOn'); await sleep(500);
const b = await drawn(5);
check('Basins: 19 IMBIE basins with labels, legend shown, Coastlines still drawn', b.visible && b.kinds === 'basins' && b.n === 19 && ['Ep-F', 'A-Ap'].every(n => b.labels.includes(n))
  && !b.labels.includes('Pine Island') && !b.labels.includes('Ross West') && !(await hidden(p, 'boundsLegend')) && (await text(p, 'basinsKey')) === 'IMBIE basins (UCI AIV)'
  && (await drawn(4)).kinds === 'groundingLine,iceFront', { ...b, labels: b.labels });
await sleep(1000); await shot(p, 'boundariesAse');

// Dated grounding lines (NSIDC-0498 v2.1)
await p.click('#glOn');
await p.waitForFunction(() => window.grimpViewer.map.getLayers().getArray().some(l => l.getZIndex() === 5 && l.getVisible() && l.getSource()?.getFeatures?.().some(f => f.get('sensor') !== undefined)), { timeout: 60000 });
const glLayer = 'window.grimpViewer.map.getLayers().getArray().find(l => l.getZIndex() === 5 && l.getSource()?.getFeatures?.().some(f => f.get(\'sensor\') !== undefined))';
const gl = await p.evaluate(`(() => { const f = ${glLayer}.getSource().getFeatures();
  return { n: f.length, years: [Math.min(...f.map(x => x.get('year'))), Math.max(...f.map(x => x.get('year')))] }; })()`);
check('466 dated grounding lines, 1992-2025, legend shown with years', gl.n === 466 && gl.years.join() === '1992,2025' && !(await hidden(p, 'glLegend'))
  && (await text(p, 'glMin')) === '1992' && (await text(p, 'glMax')) === '2025', gl);
const PIG = await toMap(p, -100.2, -75.1);
await zoomTo(p, PIG, 30e3); await sleep(1500);
const v = await p.evaluate(`(P => { const f = ${glLayer}.getSource().getFeatures()
  .filter(f => f.get('glacier') === 'Pine Island' && /^2024-/.test(f.get('date'))).map(f => ({ f, c: f.getGeometry().getClosestPoint(P) })).sort((a, b) => Math.hypot(a.c[0] - P[0], a.c[1] - P[1]) - Math.hypot(b.c[0] - P[0], b.c[1] - P[1]))[0];
  return { c: f.c, date: f.f.get('date') }; })(${JSON.stringify(PIG)})`).catch(e => ({ err: e.message }));
check('a dated 2024 Pine Island grounding line exists', !!v.c, v);
if (v.c) {
  const px = await toPixel(p, v.c);
  await p.mouse.move(px[0], px[1]); await sleep(800);
  const ro = await text(p, 'readout');
  check('readout gives grounding-line dates under the pointer', /grounding line/.test(ro) && /2024-/.test(ro) && /Pine Island/.test(ro), ro);
  await p.mouse.move(5, 5); await sleep(500); await shot(p, 'groundingLinesPig');
}
// the color bar's handles pick the years of the dated lines drawn
await dragRange(p, 'glLo', 2010);
const gr = await p.evaluate(`(() => { const l = ${glLayer}, fn = l.getStyleFunction(), y = l.getSource().getFeatures().filter(f => fn(f)).map(f => f.get('year'));
  return { lo: +document.getElementById('glLo').value, n: y.length, min: Math.min(...y) }; })()`);
check('grounding-line handles pick the years drawn', Math.abs(gr.lo - 2010) <= 1 && gr.min >= gr.lo && gr.n < 466 && (await text(p, 'glMin')) === String(gr.lo), gr);
await sleep(500); await shot(p, 'groundingLinesRange');

// each box hides its own layer only
await p.click('#coastOn'); await sleep(200);
check('unticking Coastlines hides its lines and legend only', !(await drawn(4)).visible && (await hidden(p, 'coastLegend')) && (await drawn(5)).visible && !(await hidden(p, 'glLegend')));
await p.click('#glOn'); await sleep(200);
check('unticking Dated grounding lines hides them and their legend', (await hidden(p, 'glLegend')) && !(await p.evaluate(`${glLayer}.getVisible()`)));
await p.click('#boundsOn'); await sleep(200);
check('unticking Basins hides them and the legend', (await hidden(p, 'boundsLegend')) && !(await drawn(5)).visible);
await browser.close();

({ browser, page: p } = await openViewer(catalogs.glAnnual));
check('Greenland: Basins enabled, Dated grounding lines disabled, GIBS coastline, no coastline legend', !(await box('boundsOn')).disabled && (await box('glOn')).disabled
  && (await gibsCoast()) && (await hidden(p, 'coastLegend')));
await p.click('#boundsOn');
await p.waitForFunction(() => window.grimpViewer.map.getLayers().getArray().some(l => l.getZIndex() === 5 && l.getSource()?.getFeatures?.().some(f => f.get('kind'))), { timeout: 60000 });
const g = await drawn(5);
check('251 Greenland basins (no ice caps, none under 10 km2), unlabeled, legend names Mouginot', g.visible && g.kinds === 'basins' && g.n === 251 && g.labels.length === 0
  && /Mouginot/.test(await text(p, 'basinsKey')) && !(await hidden(p, 'boundsLegend')), { ...g, labels: g.labels.slice(0, 5) });
await zoomTo(p, await toMap(p, -49.1, 69.2), 300e3); await sleep(2000); await shot(p, 'boundariesGreenland');
await finish(browser);
