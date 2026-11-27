// GrIMP DEM and land ice / ocean mask: elevation contours of the DEM over a velocity product ("every 100" and
// typed levels), Show only ice on it (land masked in the readout, ice read, share link), the DEM's own
// collection (elevation readout at Summit), and the mask, a class map (three classes in the legend, the
// readout naming ice, water and land).
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, text, sleep, shot, finish } from './lib.mjs';

const levels = p => p.evaluate(() => window.grimpViewer.fx().demContourLevels);
const readAt = async (p, lon, lat) => {
  const px = await toPixel(p, await toMap(p, lon, lat));
  await p.mouse.move(px[0] + 1, px[1]); await p.mouse.move(px[0], px[1]);
  await sleep(300);
  await p.waitForFunction(() => !/reading value/.test(document.getElementById('roText').textContent), { timeout: 30000 });
  return text(p, 'roText');
};

// elevation contours over the annual velocity
let { browser, page: p } = await openViewer(catalogs.glAnnual);
await zoomTo(p, await toMap(p, -49.4, 69.17), 60e3); await sleep(2000);
check('elevation contours offered in Greenland', !(await p.$eval('#demContourOn', e => e.disabled)));
await p.click('#demContourOn');
await p.waitForFunction(() => window.grimpViewer.fx().demContourLevels.length > 0, { timeout: 90000 });
let l = [...new Set(await levels(p))];
check('every 100 m: several levels, all multiples of 100 between 0 and 2000 m', l.length >= 5 && l.every(v => v % 100 === 0 && v > 0 && v < 2000), l);
await p.$eval('#demContourLevels', e => { e.value = '500, 1000'; e.dispatchEvent(new Event('change')); });
await p.waitForFunction(() => { const l = window.grimpViewer.fx().demContourLevels; return l.length && l.every(v => v === 500 || v === 1000); }, { timeout: 60000 });
l = [...new Set(await levels(p))];
check('typed levels', l.includes(500) && l.includes(1000), l);
await shot(p, 'demContours');

// Show only ice: land reads as masked, ice still gives a speed, and the share link carries it
check('Show only offered for a Greenland velocity product', !(await p.$eval('#maskRow', e => e.hidden)));
await p.select('#maskSel', '1'); await sleep(3000);
check('mask year shown', /GIMP mask 20(15|20)/.test(await text(p, 'maskNote')), await text(p, 'maskNote'));
await zoomTo(p, await toMap(p, -50.5, 67.05), 30e3); await sleep(3000);
let ro = await readAt(p, -50.5, 67.05);
check('land masked in the readout', /vv masked \(land\)/.test(ro), ro);
await zoomTo(p, await toMap(p, -48.9, 69.17), 30e3); await sleep(3000);
ro = await readAt(p, -48.9, 69.17);
check('ice still read', /vv [\d.]+/.test(ro) && !/masked/.test(ro), ro);
await shot(p, 'maskIce');
await p.click('#share'); await sleep(500);
check('share link carries mask=1', /[?&]mask=1(&|$)/.test(await p.evaluate(() => location.href)), await p.evaluate(() => location.href));
await browser.close();

// the DEM itself
({ browser, page: p } = await openViewer(catalogs.dem));
await zoomTo(p, await toMap(p, -38.46, 72.58), 50e3); await sleep(2000);
ro = await readAt(p, -38.46, 72.58);
const z = +(/dem ([\d.]+) m/.exec(ro) || [])[1];
check('DEM readout at Summit about 3250 m (ellipsoid)', z > 3150 && z < 3350, ro);
await browser.close();

// the mask
({ browser, page: p } = await openViewer(catalogs.mask));
const keys = await p.$$eval('#rgbNote .classKey', e => e.map(k => k.textContent));
check('legend lists ice, land, water', JSON.stringify(keys) === '["ice","land","water"]', keys);
for (const [lon, lat, want, half] of [[-38.46, 72.58, 'ice', 50e3], [-52.5, 69.0, 'water', 30e3], [-50.7, 67.0, 'land', 30e3]]) {
  await zoomTo(p, await toMap(p, lon, lat), half); await sleep(1500);
  ro = await readAt(p, lon, lat);
  check(`mask readout: ${want}`, new RegExp(`mask ${want}`).test(ro), ro);
}
await shot(p, 'mask');
await finish(browser);
