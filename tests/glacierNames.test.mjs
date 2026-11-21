// Glacier names (Greenland): off by default, ticking loads the 732 GGN names, the Jakobshavn label is drawn,
// local-glacier labels only when zoomed in; disabled in Antarctica.
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, shot, sleep, finish } from './lib.mjs';

let { browser, page: p } = await openViewer(catalogs.glAnnual);
const names = () => p.evaluate(() => { const l = window.grimpViewer.map.getLayers().getArray().find(l => l.getZIndex() === 7 && l.getSource()?.getFeatures);
  return l && { visible: l.getVisible(), n: l.getSource().getFeatures().length, on: document.getElementById('namesOn').checked, disabled: document.getElementById('namesOn').disabled }; });
let s = await names();
check('Glacier names off by default and enabled in Greenland', s && !s.visible && !s.on && !s.disabled, s);
await p.click('#namesOn');
await p.waitForFunction(() => window.grimpViewer.map.getLayers().getArray().some(l => l.getZIndex() === 7 && l.getSource()?.getFeatures?.().length), { timeout: 30000 });
s = await names();
check('ticking loads the 732 names', s.visible && s.n === 732, s);
check('Greenland-wide view shows the major-glacier tier', await p.evaluate(r => window.grimpViewer.map.getView().getResolution() > r, 1500), await p.evaluate(() => Math.round(window.grimpViewer.map.getView().getResolution())));
await shot(p, 'glacierNamesGreenland');

// Jakobshavn: its label is drawn (a feature at its point), with the foreign name
const J = await toMap(p, -49.8, 69.1833);
await zoomTo(p, J, 60e3);
const atJ = async () => { const px = await toPixel(p, J); return p.evaluate(px => { const m = window.grimpViewer.map, r = m.getTargetElement().getBoundingClientRect(); let label = null;
  m.forEachFeatureAtPixel([px[0] - r.x, px[1] - r.y], f => { if (f.get('label')) label = f.get('label'); }, { hitTolerance: 3 }); return label; }, px); };
const label = await atJ();
check('Jakobshavn labelled with both names', label === 'Sermeq Kujalleq (Jakobshavn Isbræ)', label);
const localShown = res => p.evaluate(res => { const l = window.grimpViewer.map.getLayers().getArray().find(l => l.getZIndex() === 7 && l.getSource()?.getFeatures);
  const f = l.getSource().getFeatures().find(f => f.get('type') === 'LGIC'); return !!l.getStyleFunction()(f, res); }, res);
check('local glaciers labelled only zoomed in', (await localShown(200)) && !(await localShown(1000)));
const shownAt = (res, test) => p.evaluate((res, test) => { const l = window.grimpViewer.map.getLayers().getArray().find(l => l.getZIndex() === 7 && l.getSource()?.getFeatures);
  return l.getSource().getFeatures().filter(f => new Function('f', 'return ' + test)(f) && l.getStyleFunction()(f, res)).length; }, res, test);
const out = { major: await shownAt(3000, 'true'), outlets: await shownAt(1000, 'true') };
check('zoomed all the way out only the 19 major glaciers; zoomed in, every outlet', out.major === 19 && out.outlets === 284, out);
const side = await p.evaluate(() => { const f = window.grimpViewer.map.getLayers().getArray().find(l => l.getZIndex() === 7 && l.getSource()?.getFeatures).getSource().getFeatures();
  const g = s => f.find(x => x.get('label').includes(s)).get('west'); return { jakobshavn: g('Jakobshavn'), helheim: g('Helheim'), petermann: g('Petermann'), zachariae: g('Zachariae') }; });
check('labels on the ocean side: west coast to the left, east coast to the right', side.jakobshavn && !side.helheim && !side.zachariae, side);
await shot(p, 'glacierNamesJakobshavn');
await p.click('#namesOn'); await sleep(200);
check('unticking hides the names', !(await names()).visible);
await browser.close();

({ browser, page: p } = await openViewer(catalogs.aseAnnual));
s = await names();
check('disabled in Antarctica', s.disabled && !s.visible, s);
await finish(browser);
