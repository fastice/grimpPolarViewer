// Screenshots for the grimpPolarViewer user guide, taken from the live viewer in headless Chrome.
//
//   npm install --no-save puppeteer-core   (in the repo; node_modules is git-ignored; uses system Chrome)
//   node tools/guideScreenshots.mjs <outDir>            (VIEWER_URL=<page> to shoot a local build instead of the live one)
//   python tools/guideImages.py <outDir> Documents/images
//
// Chrome runs with software WebGL (SwiftShader), so the map renders without a GPU. The script uses
// the window.grimpViewer.map hook to place views and boxes.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';

const out = process.argv[2] || 'shots';
mkdirSync(`${out}/gif`, { recursive: true });
const base = process.env.VIEWER_URL || 'https://s3.kopah.uw.edu/ianj-grimp/public/viewer/index.html';  // VIEWER_URL: a local build
const cat = {
  vel: 'https://s3.kopah.uw.edu/ianj-grimp/public/nsidc-0725/v06/nsidc-0725.parquet',
  bks: 'https://s3.kopah.uw.edu/ianj-grimp/public/nsidc-0723/v04/nsidc-0723.parquet',
  tsx: 'https://s3.kopah.uw.edu/ianj-grimp/public/nsidc-0481/v05/nsidc-0481.parquet',
  ant: 'https://s3.kopah.uw.edu/ianj-grimp/public/display/nisar-gcov-ant-25m.parquet',
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1400,900', '--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });

const waitText = (sel, re, ms = 90000) => page.waitForFunction((s, r) => new RegExp(r).test(document.querySelector(s)?.textContent || ''),
  { timeout: ms, polling: 300 }, sel, re.source);
const rect = sel => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
const pad = (r, p) => ({ x: Math.max(0, r.x - p), y: Math.max(0, r.y - p), width: r.width + 2 * p, height: r.height + 2 * p });
const shotEl = async (name, sel) => {
  // The panel scrolls inside itself: bring the section to the top of the panel, then crop to it.
  await page.$eval(sel, e => e.scrollIntoView({ block: 'start' }));
  await sleep(300);
  const r = await rect(sel);
  return page.screenshot({ path: `${out}/${name}`, captureBeyondViewport: false, clip: { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 900 - r.y) } });
};
const shot = (name, clip) => page.screenshot({ path: `${out}/${name}`, clip, captureBeyondViewport: false, ...(name.endsWith('.jpg') ? { type: 'jpeg', quality: 82 } : {}) });
const mapClip = async () => rect('#map');
async function open(url) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
  await waitText('#status', /items/);
}
async function settle(ms = 9000) { await sleep(ms); }
// Map helpers: view extent around a lon/lat, and screen pixels of projected coordinates.
const fitAround = (lon, lat, halfKm) => page.evaluate((lon, lat, h) => {
  const m = window.grimpViewer.map, v = m.getView(), c = ol.proj.fromLonLat([lon, lat], v.getProjection());
  v.fit([c[0] - h * 1e3, c[1] - h * 1e3, c[0] + h * 1e3, c[1] + h * 1e3], { size: m.getSize() });
}, lon, lat, halfKm);
const boxPixels = (lon, lat, halfKm) => page.evaluate((lon, lat, h) => {
  const m = window.grimpViewer.map, c = ol.proj.fromLonLat([lon, lat], m.getView().getProjection());
  const r = m.getTargetElement().getBoundingClientRect();
  const p0 = m.getPixelFromCoordinate([c[0] - h * 1e3, c[1] + h * 1e3]), p1 = m.getPixelFromCoordinate([c[0] + h * 1e3, c[1] - h * 1e3]);
  return [[r.x + p0[0], r.y + p0[1]], [r.x + p1[0], r.y + p1[1]]];
}, lon, lat, halfKm);
const setSelect = (sel, value) => page.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('change')); }, value);
const click = sel => page.$eval(sel, e => e.click());
const jak = [-49.6, 69.15];  // Jakobshavn Isbrae / Sermeq Kujalleq

// 1. Annual velocity overview, panel crops, time bar.
await open(`${base}?href=${cat.vel}&asset=vv`);
await waitText('#clipnote', /Clip from/);
await settle();
await shot('overview.jpg');
await shotEl('panel-catalog.png', '#panel header');
await shotEl('panel-color.png', '#legend');
const tb = await rect('#timebar');
await shot('timebar.png', { x: tb.x - 8, y: tb.y - 14, width: 190, height: tb.height + 28 });

// 2. Hover readout near Jakobshavn.
await fitAround(...jak, 70);
await settle();
const m = await mapClip();
await page.mouse.move(m.x + m.width * 0.6, m.y + m.height * 0.45);
await page.mouse.move(m.x + m.width * 0.66, m.y + m.height * 0.5, { steps: 8 });
await waitText('#readout', /\d m\/yr/, 30000).catch(async () => console.log('readout now:', await page.$eval('#readout', e => [e.hidden, e.innerText])));
await sleep(500);
await page.evaluate(() => { const r = document.getElementById('readout'), c = r.cloneNode(true); c.id = 'readoutCopy'; c.hidden = false; r.after(c); });
await shot('readout.jpg', m);
await page.evaluate(() => document.getElementById('readoutCopy').remove());

// 2b. Time series at three points near Jakobshavn (trunk margin, upstream trunk, slow ice).
await page.evaluate(() => { const mm = window.grimpViewer.map, c = ol.proj.fromLonLat([-49.1, 69.2], mm.getView().getProjection());
  mm.getView().fit([c[0] - 60e3, c[1] - 45e3, c[0] + 60e3, c[1] + 45e3], { size: mm.getSize() }); });
await settle(4000);
await page.$eval('#tsSec', e => { e.open = true; });
await click('#tsAdd');
for (const [lon, lat] of [[-49.30, 69.17], [-48.60, 69.20], [-49.30, 69.45]]) {
  const px = await page.evaluate((lon, lat) => { const mm = window.grimpViewer.map, r = mm.getTargetElement().getBoundingClientRect();
    const pp = mm.getPixelFromCoordinate(ol.proj.fromLonLat([lon, lat], mm.getView().getProjection())); return [r.x + pp[0], r.y + pp[1]]; }, lon, lat);
  await page.mouse.click(px[0], px[1]);
  await sleep(300);
}
await click('#tsAdd');
await waitText('#tsNote', /dates in/);
await page.mouse.move(5, 5);
await settle(3000);
await shot('timeseries.jpg');
await click('#tsClear');
await page.$eval('#tsSec', e => { e.open = false; });

// 3. vx with the diverging map, whole ice sheet.
await setSelect('#asset', 'vx');
await waitText('#clipnote', /Clip from/);
await page.evaluate(() => { const mm = window.grimpViewer.map; mm.getView().fit([-659100, -3379100, 857900, -639100], { size: mm.getSize(), padding: [30, 30, 30, 30] }); });
await page.mouse.move(5, 5);
await settle();
await shot('vx.jpg');

// 4. Static anomaly of the newest year.
await setSelect('#asset', 'vv');
await waitText('#clipnote', /Clip from/);
await page.$eval('#saBlock', e => { e.open = true; });
await click('#saOn');
await waitText('#saNote', /minus the mean/);
await settle(6000);
await shot('anomaly.jpg');

// 5. Animation inside a box around Jakobshavn, with color bar; frames for a GIF.
await click('#saOn');
await page.$eval('#animSec', e => { e.open = true; });
await fitAround(...jak, 160);
await settle(3000);
await click('#animDrawBox');
const [c0, c1] = await boxPixels(...jak, 80);
await page.mouse.click(c0[0], c0[1]); await sleep(300);
await page.mouse.click(c1[0], c1[1]); await sleep(800);
await click('#animBar');
await click('#animAnom');
await click('#animBuild');
await waitText('#animNote', /frames loaded/);
await page.$eval('#animRange', e => { e.value = '1500'; e.dispatchEvent(new Event('change')); });
await waitText('#animNote', /typed/);
await fitAround(...jak, 95);
await page.mouse.move(5, 5);
await settle(4000);
await shot('animation.jpg');
const n = await page.$eval('#animPos', e => +e.max + 1);
const [g0, g1] = await boxPixels(...jak, 80);
for (let i = 0; i < n; i++) {
  await page.$eval('#animPos', (e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, i);
  await sleep(700);
  await shot(`gif/frame${String(i).padStart(2, '0')}.png`, { x: g0[0], y: g0[1], width: g1[0] - g0[0], height: g1[1] - g0[1] });
}
await click('#animClose');

// 6. Download panel (collapsed by default) with the crop option on.
await page.$eval('#saBlock', e => { e.open = false; });
await page.$eval('#animSec', e => { e.open = false; });
await page.$eval('#cropSec', e => { e.open = true; });
await page.$eval('#cropOn', e => { e.checked = true; e.dispatchEvent(new Event('change')); });
await fitAround(...jak, 90);
await settle(2000);
await click('#drawBox');
const [d0, d1] = await boxPixels(...jak, 30);
await page.mouse.click(d0[0], d0[1]); await sleep(300);
await page.mouse.click(d1[0], d1[1]); await sleep(1500);
await shotEl('panel-download.png', '#cropSec');
await click('#clearBox');
await page.$eval('#cropOn', e => { e.checked = false; e.dispatchEvent(new Event('change')); });

// 6b. Background: 2024 Sentinel-1 backscatter under the speed at 60% opacity, Jakobshavn.
const bksOption = await page.$eval('#bgColl', (e, u) => [...e.options].find(o => o.value === u)?.value, cat.bks);
await setSelect('#bgColl', bksOption);
await page.waitForFunction(() => !document.getElementById('bgItemRow').hidden, { timeout: 60000 });
await page.$eval('#opacity', e => { e.value = '0.6'; e.dispatchEvent(new Event('input')); });
await fitAround(...jak, 45);
await page.mouse.move(5, 5);
await settle(12000);
await shot('background.jpg');
await setSelect('#bgColl', '');
await page.$eval('#opacity', e => { e.value = '1'; e.dispatchEvent(new Event('input')); });

// 7. TSX glacier sites.
await open(`${base}?href=${cat.tsx}`);
await waitText('#clipnote', /Clip from/);
await page.$eval('#cropSec', e => { e.open = true; });
await page.evaluate(() => {
  const mm = window.grimpViewer.map;
  const src = mm.getLayers().getArray().map(l => l.getSource?.()).find(s => s?.getFeatures && s.getFeatures().length > 10);
  const c = ol.proj.fromLonLat([-49.6, 69.15], mm.getView().getProjection());
  const hits = src.getFeaturesAtCoordinate(c).sort((a, b) => b.get('item').start - a.get('item').start);
  const f = hits[0] || src.getFeatures()[0];
  f.get('item').li.click();
  f.get('item').li.querySelector('input').click();
  const e = f.getGeometry().getExtent();
  const w = (e[2] - e[0]) * 1.6, h = (e[3] - e[1]) * 1.6, cx = (e[0] + e[2]) / 2, cy = (e[1] + e[3]) / 2;
  mm.getView().fit([cx - w, cy - h, cx + w, cy + h], { size: mm.getSize() });
});
await page.mouse.move(5, 5);
await settle();
await shot('tsx.jpg');
await shotEl('panel-sites.png', '#cropSec');

// 8. Antarctica, NISAR gamma0.
await open(`${base}?href=${cat.ant}`);
await waitText('#clipnote', /Clip from/);
await settle(15000);
await shot('antarctica.jpg');

await browser.close();
console.log('done', n, 'gif frames');
