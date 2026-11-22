// Speed contours, flow particles, the velocity error in the readout and basin areas (Jakobshavn,
// Greenland annual).
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, text, shot, sleep, finish } from './lib.mjs';

const { browser, page: p } = await openViewer(catalogs.glAnnual);
const fx = () => p.evaluate(() => { const q = window.grimpViewer.fx(); return { levels: q.contourLevels, n: q.nParticles, running: q.particlesRunning }; });
const P = await toMap(p, -49.4, 69.15);
await zoomTo(p, P, 50e3); await sleep(1500);

await p.click('#contourOn');
await p.waitForFunction(() => window.grimpViewer.fx().contourLevels.length > 0, { timeout: 60000 });
let f = await fx();
check('contours at the default levels, 1000 and 5000 m/yr among them', [100, 1000, 5000].every(v => f.levels.includes(v)) && f.levels.every(v => [100, 250, 500, 1000, 2500, 5000].includes(v)),
  [...new Set(f.levels)]);
await p.$eval('#contourLevels', e => { e.value = '2000'; e.dispatchEvent(new Event('change')); });
await p.waitForFunction(() => { const l = window.grimpViewer.fx().contourLevels; return l.length && l.every(v => v === 2000); }, { timeout: 60000 });
check('typed levels replace them', true);
await sleep(1000); await shot(p, 'speedContours');
await p.click('#contourOn'); await sleep(200);
check('unticking clears the contours', (await fx()).levels.length === 0 && await p.$eval('#contourLegend', e => e.hidden));

await p.click('#particlesOn');
await p.waitForFunction(() => window.grimpViewer.fx().particlesRunning, { timeout: 60000 });
f = await fx();
check('particles running', f.running && f.n > 500, f);
await sleep(1500); await shot(p, 'flowParticles');
const lit = await p.evaluate(() => { const c = document.querySelector('canvas.particles'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let k = 3; k < d.length; k += 4) if (d[k] > 40) n++; return n; });
check('particle trails drawn', lit > 2000, lit);
await zoomTo(p, P, 30e3);
await p.waitForFunction(() => window.grimpViewer.fx().particlesRunning, { timeout: 60000 });
check('particles restart after a move', (await fx()).running);
await p.click('#particlesOn'); await sleep(200);
check('unticking stops them', !(await fx()).running);

// readout: speed with its 1-sigma error
const px = await toPixel(p, await toMap(p, -49.6, 69.17));
await p.mouse.move(px[0], px[1]);
await p.waitForFunction(() => !/reading value/.test(document.getElementById('roText').textContent), { timeout: 30000 });
const ro = await text(p, 'roText');
check('readout gives vv with its error', /vv [\d.]+ ± [\d.]+ m\/yr/.test(ro), ro);

// basin area
await p.click('#boundsOn');
await p.waitForFunction(() => window.grimpViewer.map.getLayers().getArray().some(l => l.getZIndex() === 5 && l.getSource()?.getFeatures?.().some(f => f.get('kind') === 'basins')), { timeout: 60000 });
await p.mouse.move(px[0] + 3, px[1]);
await p.waitForFunction(() => /km2/.test(document.getElementById('roText').textContent), { timeout: 30000 });
const b = (await text(p, 'roText')).match(/basin.*?([\d,]+) km2 \(([\d,]+) on the polar/);
const [t, m] = b ? [b[1], b[2]].map(s => +s.replace(/,/g, '')) : [0, 0];
check('readout gives the basin and its true area near the map area at 69 N (scale 1 at 70 N)', t > 10000 && Math.abs(t / m - 1) < 0.01, { t, m, ro: await text(p, 'roText') });
await finish(browser);
