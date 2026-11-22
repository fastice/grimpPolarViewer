// Flow arrows: off by default; on a velocity product they cover the view and point down-glacier
// (Jakobshavn flows west); they are redrawn after a zoom; disabled for a product without vx/vy.
import { openViewer, catalogs, kopah, check, toMap, zoomTo, shot, sleep, finish } from './lib.mjs';

let { browser, page: p } = await openViewer(catalogs.glAnnual);
const arrows = () => p.evaluate(() => { const l = window.grimpViewer.map.getLayers().getArray().find(l => l.getZIndex() === 4 && l instanceof ol.layer.Vector && Array.isArray(l.getStyle()) && l.getSource()?.getFeatures);
  return { visible: l.getVisible(), n: l.getSource().getFeatures().length, on: document.getElementById('arrowsOn').checked, disabled: document.getElementById('arrowsOn').disabled }; });
const drawn = () => p.waitForFunction(() => window.grimpViewer.map.getLayers().getArray().some(l => l.getZIndex() === 4 && l instanceof ol.layer.Vector && Array.isArray(l.getStyle()) && l.getSource()?.getFeatures?.().length), { timeout: 60000 });
let s = await arrows();
check('Flow arrows off by default, enabled for velocity', !s.visible && !s.on && !s.disabled, s);
await p.click('#arrowsOn'); await drawn();
s = await arrows();
check('arrows drawn over Greenland', s.visible && s.n > 50, s);
await shot(p, 'flowArrowsGreenland');

// Jakobshavn trunk: the arrow nearest the point points roughly west
const J = await toMap(p, -49.5, 69.17);
await zoomTo(p, J, 40e3); await sleep(1500); await drawn();
const a = await p.evaluate(J => { const l = window.grimpViewer.map.getLayers().getArray().find(l => l.getZIndex() === 4 && l instanceof ol.layer.Vector && Array.isArray(l.getStyle()) && l.getSource()?.getFeatures);
  let best = null, bd = Infinity;
  for (const f of l.getSource().getFeatures()) { const sh = f.getGeometry().getLineString(0).getCoordinates(), m = [(sh[0][0] + sh[1][0]) / 2, (sh[0][1] + sh[1][1]) / 2], d = Math.hypot(m[0] - J[0], m[1] - J[1]);
    if (d < bd) { bd = d; best = sh; } }
  const ang = Math.atan2(best[1][1] - best[0][1], best[1][0] - best[0][0]) * 180 / Math.PI; return { n: l.getSource().getFeatures().length, ang: Math.round(ang), dist: Math.round(bd) }; }, J);
check('Jakobshavn arrow points west (down-glacier)', Math.abs(Math.abs(a.ang) - 180) < 50 && a.dist < 10e3, a);
await shot(p, 'flowArrowsJakobshavn');
await p.click('#arrowsOn'); await sleep(200);
check('unticking hides the arrows', !(await arrows()).visible);
await browser.close();

({ browser, page: p } = await openViewer(kopah + 'nsidc-0723/v04/nsidc-0723.parquet'));
s = await arrows();
check('disabled for backscatter (no vx/vy)', s.disabled && !s.visible, s);
await finish(browser);
