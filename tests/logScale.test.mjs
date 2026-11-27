// Speed on a log scale (Greenland annual): vv opens on a log scale in the browse colors over 1-3000 m/yr, and
// the map then matches the item's own browse image pixel for pixel; unticking Log scale goes back to viridis
// from 0 with the top clip; moving the clip on a log scale fits both ends to the image; the animation and
// stack frames use the same log mapping.
import { openViewer, catalogs, check, toMap, zoomTo, text, sleep, shot, finish } from './lib.mjs';

const { browser, page: p } = await openViewer(catalogs.glAnnual);
await p.waitForFunction(() => /valid pixels/.test(document.getElementById('clipnote').textContent), { timeout: 60000 });
const val = id => p.$eval('#' + id, e => e.type === 'checkbox' ? e.checked : e.value);
check('vv opens on a log scale in browse colors, 1 to 3000', (await val('logScale')) && (await val('cmap')) === 'browse' && +(await val('smin')) === 1 && +(await val('smax')) === 3000
  && /log scale/.test(await text(p, 'lunit')) && !(await p.$eval('#logRow', e => e.hidden)), [await val('cmap'), await val('smin'), await val('smax'), await text(p, 'lunit')]);

check('log color bar labels its decades', (await p.$$eval('#barTicks span', e => e.map(x => x.textContent))).join() === '10,100,1000' && !(await p.$eval('#barTicks', e => e.hidden)),
  await p.$$eval('#barTicks span', e => e.map(x => [x.textContent, x.style.left])));
// the map against the browse image: screen colors at a grid of points over Jakobshavn and the ice sheet
await zoomTo(p, await toMap(p, -48.0, 69.2), 400e3);
await p.evaluate(() => { for (const id of ['footOn', 'coastOn', 'baseOn']) { const e = document.getElementById(id); if (e?.checked) e.click(); } });
const grab = async () => {
  await sleep(4000);
  const png = (await p.screenshot({ encoding: 'base64', clip: { x: 500, y: 100, width: 800, height: 700 } }));
  return p.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const out = [];
    for (let j = 10; j < 700; j += 23) for (let i = 10; i < 800; i += 23) out.push([...x.getImageData(i, j, 1, 1).data.slice(0, 3)]);
    return out;
  }, png);
};
const ours = await grab();
await p.select('#asset', 'browse');
const theirs = await grab();
const bg = c => c.every(v => v > 245) || c.every(v => v < 10);
const diffs = ours.map((c, k) => bg(c) || bg(theirs[k]) ? null : Math.max(...c.map((v, j) => Math.abs(v - theirs[k][j])))).filter(d => d != null).sort((a, b) => a - b);
const med = diffs[diffs.length >> 1], p90 = diffs[Math.floor(diffs.length * 0.9)];
check('map colors match the browse image (median and 90th percentile channel difference)', diffs.length > 300 && med <= 12 && p90 <= 40, { n: diffs.length, med, p90 });
await p.select('#asset', 'vv'); await sleep(1500);

// unticking: viridis from 0, clipped at the top
await p.click('#logScale'); await sleep(500);
check('linear: no decade labels', await p.$eval('#barTicks', e => e.hidden));
check('linear: viridis from 0', !(await val('logScale')) && (await val('cmap')) === 'viridis' && +(await val('smin')) === 0 && +(await val('smax')) < 3000 && !/log/.test(await text(p, 'lunit')),
  [await val('cmap'), await val('smin'), await val('smax')]);
await p.click('#logScale'); await sleep(500);
check('ticked again: back to browse, 1 to 3000', (await val('cmap')) === 'browse' && +(await val('smin')) === 1 && +(await val('smax')) === 3000);
// moving the clip fits the log range to the image (both ends, low end above 0)
await p.$eval('#clip', e => { e.value = '0.5'; e.dispatchEvent(new Event('input')); }); await sleep(300);
const lo = +(await val('smin')), hi = +(await val('smax'));
check('clip on a log scale fits both ends', lo > 0 && lo < 5 && hi > 500 && hi !== 3000 && /each end \(log scale\)/.test(await text(p, 'clipwhere')), { lo, hi });
// a typed 0 is moved above 0
await p.$eval('#smin', e => { e.value = '0'; e.dispatchEvent(new Event('change')); });
check('a log scale never starts at 0', +(await val('smin')) > 0, await val('smin'));
// the next image starts at 1 to 3000 again, as does ticking the box after the clip was moved
await p.select('#asset', 'vx'); await sleep(1500); await p.select('#asset', 'vv');
await p.waitForFunction(() => /valid pixels/.test(document.getElementById('clipnote').textContent), { timeout: 60000 }); await sleep(300);
check('a new image starts at 1 to 3000 after the clip was moved', +(await val('smin')) === 1 && +(await val('smax')) === 3000, [await val('smin'), await val('smax')]);
await p.$eval('#clip', e => { e.value = '0.5'; e.dispatchEvent(new Event('input')); }); await sleep(300);
await p.click('#logScale'); await p.click('#logScale'); await sleep(300);
check('ticking the box again starts at 1 to 3000', +(await val('smin')) === 1 && +(await val('smax')) === 3000, [await val('smin'), await val('smax')]);
// the frame renderer's log mapping: 1, the geometric middle and 3000 give the bottom, middle and top
const q = await p.evaluate(() => window.grimpViewer.fc([1, Math.sqrt(3000), 3000], 1, 3000, true));
check('frames use the log mapping', q[0] === 0 && Math.abs(q[1] - 128) <= 1 && q[2] === 255, q);
await shot(p, 'logScale');
await finish(browser);
