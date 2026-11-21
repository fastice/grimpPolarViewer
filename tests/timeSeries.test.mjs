// Time series at points (Jakobshavn, Greenland annual, then monthly): read three points, legend hide /
// show / remove of points, the y range slider and Auto, and per-catalog hide / remove after a switch.
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, hitCenter, text, hidden, shot, sleep, finish } from './lib.mjs';

const { browser, page: p } = await openViewer(catalogs.glAnnual);
const ts = () => p.evaluate(() => { const q = window.grimpViewer.ts();
  return { pts: q.tsPoints.map(p => p.n), off: q.tsPoints.filter(p => p.off).map(p => p.n), markers: q.nMarkers, offMarkers: q.tsPoints.filter(p => p.feature.get('off')).length, layerOff: q.tsLayerOff }; });
const hit = test => p.evaluate(test => { const h = window.grimpViewer.ts().tsLegendHits.find(new Function('h', 'return ' + test)); return h && { x: h.x, y: h.y, w: h.w, h: h.h }; }, test);
const clickHit = async test => { const h = await hit(test); if (!h) return false; const xy = await hitCenter(p, 'tsCanvas', h); await p.mouse.click(xy[0], xy[1]); await sleep(500); return true; };
const tsRead = () => p.waitForFunction(() => /dates in/.test(document.getElementById('tsNote').textContent), { timeout: 240000 });

await zoomTo(p, await toMap(p, -49.1, 69.2), 60e3, 45e3);
check('time series section shown', !(await hidden(p, 'tsSec')));
await p.evaluate(() => { document.getElementById('tsSec').open = true; document.getElementById('cropSec').open = false; });
await p.$eval('#tsAdd', e => e.click());
for (const [lon, lat] of [[-49.30, 69.17], [-48.60, 69.20], [-49.30, 69.45]]) {
  const px = await toPixel(p, await toMap(p, lon, lat));
  await p.mouse.click(px[0], px[1]); await sleep(300);
}
await p.$eval('#tsAdd', e => e.click());
await tsRead();
await p.mouse.move(5, 5); await sleep(1500);
let s = await ts();
check('three points read and plotted', s.pts.length === 3 && s.markers === 3 && !(await hidden(p, 'tsPlot')), { ...s, note: await text(p, 'tsNote') });

// legend: hide 2, remove 1, show 2
check('legend has an entry for point 2', await clickHit('h.p && h.p.n === 2 && !h.remove'));
s = await ts();
check('clicking point 2 hides it and fades its marker', s.off.join() === '2' && s.offMarkers === 1, s);
await clickHit('h.p && h.p.n === 1 && h.remove'); await sleep(800);
s = await ts();
check('x on point 1 removes the point and its marker', s.pts.join() === '2,3' && s.markers === 2, s);
await clickHit('h.p && h.p.n === 2 && !h.remove');
check('clicking point 2 again shows it', (await ts()).off.length === 0);
await shot(p, 'timeSeriesLegend');

// y range slider
const lab = async () => `${await text(p, 'tsYMinV')} to ${await text(p, 'tsYMaxV')}`;
const yAuto = await lab();
await (await p.$('#tsYTrack')).scrollIntoView();
const r = await p.$eval('#tsYHi', e => { const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
await p.mouse.move(r[0], r[1]); await p.mouse.down(); await p.mouse.move(r[0] - 60, r[1], { steps: 5 }); await p.mouse.up(); await sleep(200);
check('dragging the y top handle lowers the top', (await lab()) !== yAuto && !(await hidden(p, 'tsYAuto')), { before: yAuto, after: await lab() });
await p.click('#tsYAuto'); await sleep(200);
check('y Auto restores the range', (await lab()) === yAuto, await lab());

// switch catalog: the points carry over, each catalog gets a legend row
const status0 = await text(p, 'status');
await p.$eval('#href', (e, u) => { e.value = u; }, catalogs.glMonthly);
await p.click('#load');
await p.waitForFunction(s0 => /items/.test(document.getElementById('status').textContent) && document.getElementById('status').textContent !== s0, { timeout: 120000 }, status0);
await tsRead(); await sleep(1500);
const names = await p.evaluate(() => [...new Set(window.grimpViewer.ts().tsLegendHits.filter(h => h.name).map(h => h.name))]);
check('points carried over: two catalog rows in the legend', names.length === 2 && (await ts()).pts.join() === '2,3', names);
await clickHit(`h.name === ${JSON.stringify(names[1])} && !h.remove`);
check('clicking the earlier catalog hides it', JSON.stringify((await ts()).layerOff) === JSON.stringify([names[1]]), (await ts()).layerOff);
await clickHit(`h.name === ${JSON.stringify(names[1])} && !h.remove`);
await clickHit(`h.name === ${JSON.stringify(names[1])} && h.remove`);
const left = await p.evaluate(() => [...new Set(window.grimpViewer.ts().tsLegendHits.filter(h => h.name).map(h => h.name))]);
check('x on the earlier catalog drops it', !left.includes(names[1]) && (await ts()).pts.length === 2, left);
await shot(p, 'timeSeriesCatalogs');

await p.click('#tsClear'); await sleep(300);
check('Clear removes every point and the plot', (await ts()).markers === 0 && (await hidden(p, 'tsPlot')));
await finish(browser);
