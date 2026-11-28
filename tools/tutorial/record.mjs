// Drive the live GrIMP Polar Viewer through the tutorial scenes and screen-record it, with a drawn mouse
// cursor. Each narration sentence k starts when say(k) is called (but never before the previous sentence
// has finished); the start times go to cues.json so the narration can be laid on the video afterwards.
//
//   node record.mjs [--warm]      --warm: same actions, no recording and no narration pauses (fills the cache)
import fs from 'fs';
import puppeteer from '../../tests/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const warm = process.argv.includes('--warm');
const durs = warm ? JSON.parse(fs.readFileSync(here + 'script.json')).map(() => 0) : JSON.parse(fs.readFileSync(here + 'audio/durations.json'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const V = 'https://s3.kopah.uw.edu/ianj-grimp/public/viewer/index.html';
const K = 'https://s3.kopah.uw.edu/ianj-grimp/public/';
const W = 1920, H = 1080, gap = 0.45;

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', userDataDir: here + 'profile',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${W},${H}`] });
await browser.defaultBrowserContext().overridePermissions('https://s3.kopah.uw.edu', ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
const p = await browser.newPage();
p.on('pageerror', e => console.log('pageerror', e.message));
await p.setViewport({ width: W, height: H });
// drawn cursor + click ripple (headless Chrome draws no cursor)
await p.evaluateOnNewDocument(() => {
  addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M3 2 L3 19 L7.5 15 L10.5 22 L13.5 20.7 L10.6 14 L16.5 14 Z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    c.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:2147483647;transform:translate(-4px,-3px)';
    c.id = 'tutCursor'; document.documentElement.appendChild(c);
    addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', e => {
      const r = document.createElement('div');
      r.style.cssText = `position:fixed;left:${e.clientX - 20}px;top:${e.clientY - 20}px;width:40px;height:40px;border-radius:50%;border:3px solid #ffc83d;pointer-events:none;z-index:2147483646`;
      document.documentElement.appendChild(r);
      r.animate([{ transform: 'scale(.3)', opacity: 1 }, { transform: 'scale(1.3)', opacity: 0 }], { duration: 450 }).onfinish = () => r.remove();
    }, true);
  });
});

// ---- narration clock
let t0 = 0, nextFree = 0;
const cues = [], epochCues = [];
const now = () => (performance.now() - t0) / 1000;
async function say(k) {
  if (!warm) { const wait = nextFree - now(); if (wait > 0) await sleep(wait * 1000); }
  cues[k] = +now().toFixed(3); epochCues[k] = Date.now() / 1000; nextFree = cues[k] + durs[k] + gap;
  console.log(`say ${k} at ${cues[k]}`);
}
const quiet = async (extra = 0) => { if (warm) return; const w = nextFree - now() + extra; if (w > 0) await sleep(w * 1000); };
const pause = ms => sleep(warm ? Math.min(ms, 300) : ms);

// ---- mouse
let cur = [W / 2, H / 2];
async function glide(x, y, ms = 700) {
  const [x0, y0] = cur, n = Math.max(6, Math.round((warm ? 80 : ms) / 16));
  for (let i = 1; i <= n; i++) { const u = i / n, e = u < .5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2; await p.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e); await sleep((warm ? 80 : ms) / n); }
  cur = [x, y];
}
async function at(sel, { scroll = true } = {}) {
  if (scroll) { await p.$eval(sel, e => e.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); await pause(350); }
  return p.$eval(sel, e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
}
async function click(sel, ms = 700) { const [x, y] = await at(sel); await glide(x, y, ms); await pause(150); await p.mouse.click(x, y); await pause(250); }
async function clickXY([x, y], ms = 700) { await glide(x, y, ms); await pause(120); await p.mouse.click(x, y); await pause(200); }
async function tick(id, on = true) { if ((await p.$eval('#' + id, e => e.checked)) !== on) await click('#' + id); else await pause(300); }
async function openSec(id) { await click(`#${id} > summary`); await p.$eval('#' + id, e => { if (!e.open) e.open = true; }); await pause(300); }
async function closeSec(id) { await p.$eval('#' + id, e => { e.open = false; }); }
const pix = (lon, lat) => p.evaluate((lon, lat) => { const m = window.grimpViewer.map, r = m.getTargetElement().getBoundingClientRect(),
  x = m.getPixelFromCoordinate(ol.proj.fromLonLat([lon, lat], m.getView().getProjection())); return [r.x + x[0], r.y + x[1]]; }, lon, lat);
async function flyTo(lon, lat, halfW, ms = 2500) {
  await p.evaluate((lon, lat, halfW, ms) => { const m = window.grimpViewer.map, v = m.getView(), c = ol.proj.fromLonLat([lon, lat], v.getProjection());
    v.animate({ center: c, resolution: 2 * halfW / m.getSize()[0], duration: ms }); }, lon, lat, halfW, warm ? 50 : ms);
  await pause(ms + 200); await rendered();
}
const rendered = (ms = 30000) => p.evaluate(ms => new Promise(r => { const m = window.grimpViewer.map; const t = setTimeout(r, ms); m.once('rendercomplete', () => { clearTimeout(t); r(); }); m.render(); }), ms);
const name = () => p.$eval('#lname', e => e.textContent);
async function waitName(prev, ms = 60000) { await p.waitForFunction(prev => { const n = document.getElementById('lname').textContent; return n && n !== prev; }, { timeout: ms }, prev); await rendered(); }
// the viewer re-applies its automatic clip whenever it reads a new overview; keep the speed range at 0-hi
async function holdStretch(hi) { await p.evaluate(hi => { window.__tutMax = hi; if (window.__tutHold) return;
  window.__tutHold = setInterval(() => { const a = document.getElementById('smin'), b = document.getElementById('smax');
    if (window.__tutMax && +a.value === 0 && +b.value !== window.__tutMax && /m\/yr/.test(document.getElementById('lunit').textContent)) { b.value = window.__tutMax; b.dispatchEvent(new Event('change')); } }, 80); }, hi); }
async function setStretch(lo, hi) { await holdStretch(hi); await p.evaluate((lo, hi) => { const a = document.getElementById('smin'), b = document.getElementById('smax'); a.value = lo; b.value = hi; b.dispatchEvent(new Event('change')); }, lo, hi); }
// show a select as an open list in the page (native drop-downs are not drawn in a screen capture), hover to an option, pick it
async function pickFrom(sel, value, hoverOthers = []) {
  const [x, y] = await at(sel); await glide(x, y); await pause(150); await p.mouse.down(); await p.mouse.up();
  await p.$eval(sel, e => { e.dataset.size = e.size; e.size = Math.min(e.options.length, 10); e.style.position = 'relative'; e.style.zIndex = 50; e.style.boxShadow = '0 6px 18px rgba(0,0,0,.35)'; });
  await pause(300);
  const opt = v => p.$eval(sel, (e, v) => { const o = [...e.options].find(o => o.value === v), r = o.getBoundingClientRect(); return [r.x + Math.min(160, r.width / 2), r.y + r.height / 2]; }, v);
  for (const v of hoverOthers) { const [ox, oy] = await opt(v); await glide(ox, oy, 450); await pause(350); }
  if (value !== null) { const [ox, oy] = await opt(value); await glide(ox, oy, 450); await pause(250); await p.mouse.down(); await p.mouse.up(); }
  await p.$eval(sel, (e, v) => { e.size = 0; e.style.boxShadow = ''; e.style.zIndex = ''; if (v !== null && e.value !== v) { e.value = v; e.dispatchEvent(new Event('change')); } }, value);
  await pause(300);
}

// ---- open on the Greenland annual mosaic
await p.goto(V + `?href=${K}nsidc-0725/v06/nsidc-0725.parquet&asset=vv`, { waitUntil: 'networkidle2', timeout: 120000 });
await p.waitForFunction(() => /items/.test(document.getElementById('status').textContent) && document.getElementById('lname').textContent, { timeout: 120000 });
await rendered(); await sleep(warm ? 500 : 4000);
{ const dl = await p.createCDPSession(); fs.mkdirSync(here + 'downloads', { recursive: true });
  await dl.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: here + 'downloads' }); }
// own screencast: every frame saved with its capture time, so the video and the cues share one clock
const frameDir = here + 'frames/', stamps = [];
let cdp = null;
if (!warm) {
  fs.rmSync(frameDir, { recursive: true, force: true }); fs.mkdirSync(frameDir);
  cdp = await p.createCDPSession();
  cdp.on('Page.screencastFrame', f => {
    fs.writeFileSync(frameDir + String(stamps.length).padStart(6, '0') + '.jpg', Buffer.from(f.data, 'base64'));
    stamps.push(f.metadata.timestamp);
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  await sleep(500);
}
t0 = performance.now(); nextFree = 0.8;
await p.mouse.move(cur[0], cur[1]);

// 1. opening
await say(0); await glide(1250, 560, 1500);
await say(1); await glide(1400, 420, 3000); await glide(1150, 700, 3000);
await say(2); await quiet();

// 2. collections
await say(3); await pickFrom('#preset', null, ['2', '3', '4', '5', '0', '6']);
await quiet(-1.5);
await say(4); await flyTo(-49.35, 69.2, 60e3, 3000); await rendered();
let n0 = await name(); await pickFrom('#preset', '4');  // monthly await waitName(n0); await rendered(); await pause(1500);
await quiet();

// 2b. the log scale in browse colors; untick it (linear, the fast glaciers saturate), type a maximum, point at
// the clip slider, tick it again
await say(5); await pause(2500);
const logBox = () => p.$eval('#logRow', e => { e.scrollIntoView({ block: 'nearest' }); const r = e.querySelector('input').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
{ const [x, y] = await logBox(); await glide(x, y, 900); await pause(300); await p.mouse.click(x, y); await rendered(); await pause(1200); }
if (warm) await p.screenshot({ path: here + 'w_sat.jpg', quality: 70 });
{ const [x, y] = await at('#smax'); await glide(x, y, 900); await p.mouse.click(x, y, { clickCount: 3 }); await pause(300);
  await p.keyboard.type('3000', { delay: warm ? 0 : 140 }); await p.keyboard.press('Enter'); await pause(300); await holdStretch(3000); await rendered(); }
{ const [x, y] = await at('#clip'); await glide(x - 40, y, 900); await pause(600); await glide(x + 30, y, 900); }
{ const [x, y] = await logBox(); await glide(x, y, 900); await pause(300); await p.mouse.click(x, y); await rendered(); }
await quiet();
// 2c. Show only ice (the GIMP land ice / ocean mask)
await say(6); await pickFrom('#maskSel', '1', ['12', '2', '3']); await rendered(); await pause(2500);
if (warm) await p.screenshot({ path: here + 'w_maskice.jpg', quality: 70 });
await quiet(1);
await pickFrom('#maskSel', ''); await rendered();

// 3. time bar and readout
await say(7); { const [x, y] = await at('#ttrack', { scroll: false }); await glide(x, y - 200, 900); await glide(x, y + 200, 1600); }
await quiet();
await say(8);
{ const h = await at('#th0', { scroll: false }); await glide(...h, 600); await p.mouse.down();
  const [x, y] = await p.$eval('#ttrack', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height * 0.45]; });
  await glide(h[0], y, 1500); await p.mouse.up(); cur = [h[0], y]; await pause(800); }
{ const ticks = await p.$$eval('#tticks > *', es => es.map(e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }).filter(([x, y]) => y > 0));
  n0 = await name(); await clickXY(ticks[Math.floor(ticks.length * 0.3)]); await waitName(n0).catch(() => {}); }
await quiet(-0.5);
await say(9);
for (const [lon, lat] of [[-49.53, 69.163], [-49.43, 69.197], [-49.2, 69.23], [-49.03, 69.252]]) { await glide(...await pix(lon, lat), 900); await pause(1100); }
await quiet();
await click('#treset'); await pause(500);

// 4. time series at points
await say(10); await openSec('tsSec'); await click('#tsAdd');
for (const [lon, lat] of [[-49.5292, 69.1633], [-49.4301, 69.1972], [-49.0318, 69.2523]]) await clickXY(await pix(lon, lat), 800);
await click('#tsAdd');
await say(11);
await p.waitForFunction(() => document.getElementById('tsProg').hidden && !document.getElementById('tsPlot').hidden, { timeout: 180000 }).catch(e => console.log('ts wait', e.message));
await quiet(0.5);
await say(12); await pickFrom('#tsXMode', 'season'); await pause(1500);
await quiet(1.5);
await say(13); await pickFrom('#tsXMode', 'date'); await pause(600); await tick('tsTrend'); await pause(1500);
await pickFrom('#tsTrendFit', 'cycle'); await pause(2500);
if (warm) await p.screenshot({ path: here + 'w_trend.jpg', quality: 70 });
await quiet(1);
await say(14); await glide(...await at('#tsPng'), 800); await pause(1200); await glide(...await at('#tsCsv'), 700); await pause(1500);
await quiet(0.5);

// 5. flow line
await click('#tsClear'); await p.$eval('#tsTrend', e => { if (e.checked) e.click(); }); await closeSec('tsSec');
await say(15); await openSec('pfSec'); await click('#pfFlow'); await clickXY(await pix(-49.5, 69.17), 900);
await p.waitForFunction(() => !document.getElementById('pfAccept').hidden && !document.getElementById('pfAccept').disabled, { timeout: 120000 });
await pause(800);
await say(16);
{ const a = await pix(-49.5, 69.17); await glide(...a, 500); await p.mouse.down(); await glide(a[0] + 25, a[1] - 18, 1400); await pause(700); await glide(a[0] + 45, a[1] - 30, 1400); await p.mouse.up(); await pause(1800); }
await click('#pfAccept');
await p.waitForFunction(() => !document.getElementById('pfPlot').hidden, { timeout: 120000 }).catch(e => console.log('pf wait', e.message));
await tick('pfYrOn'); await pause(1500);
await say(17);
{ const [x0, x1, y] = await p.$eval('#pfLo', e => { e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(), w = 16,
    at = u => r.left + w / 2 + ((u - e.min) / (e.max - e.min)) * (r.width - w); return [at(+e.value), at(Math.max(+e.min, -70)), r.top + r.height / 2]; });
  await pause(400); await glide(x0, y, 800); await p.mouse.down(); await glide(x1, y, 2000); await p.mouse.up(); await pause(500);
  console.log('pfFlowText', await p.$eval('#pfFlowText', e => e.textContent)); }
await pickFrom('#pfYrStep', '10');
await flyTo(-48.9, 69.3, 85e3, 1500);
if (warm) await p.screenshot({ path: here + 'w_pflen.jpg', quality: 70 });
await say(18);
{ const ticks = await p.$$eval('#tticks > *', es => es.map(e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }).filter(([x, y]) => y > 0));
  for (const f of [0.85, 0.05]) { const n1 = await name(); await clickXY(ticks[Math.floor(ticks.length * f)], 800); await waitName(n1).catch(() => {}); await pause(1500); } }
await p.waitForFunction(() => document.getElementById('pfProg').hidden, { timeout: 120000 }).catch(() => {});
await pause(1500); if (warm) await p.screenshot({ path: here + 'w_pfcurves.jpg', quality: 70 });
await quiet();
await say(19);
{ const r = await p.$eval('#pfPlot', e => { const b = e.getBoundingClientRect(); return [b.right, b.top]; });
  const row = k => r[1] + 60 + 15 * k;  // under the legend's header row
  await clickXY([r[0] - 115, row(0)], 900); await pause(1500); if (warm) await p.screenshot({ path: here + 'w_pfhide.jpg', quality: 70 });  // hide the first curve
  await clickXY([r[0] - 115, row(0)], 600); await pause(1200);        // and show it again
  await clickXY([r[0] - 30, row(1)], 900); await pause(1500); }       // remove the second
if (warm) await p.screenshot({ path: here + 'w_pflegend.jpg', quality: 70 });
await quiet(1);
await say(20);
{ const v = await p.$$eval('#pfRef option', o => o.map(x => x.value)); console.log('pfRef options', v.length); await pickFrom('#pfRef', v[1]); }
await pause(3000); if (warm) await p.screenshot({ path: here + 'w_pfref.jpg', quality: 70 });
await quiet(1);
await pickFrom('#pfRef', ''); await pause(600);
await say(21); await tick('pfElevOn'); await pause(3500);
if (warm) await p.screenshot({ path: here + 'w_pfelev.jpg', quality: 70 });
await quiet(1.5);
await p.$eval('#pfElevOn', e => { if (e.checked) e.click(); });

// 6. layers (annual collection from here)
await click('#pfHide'); await click('#pfClear'); await closeSec('pfSec');
n0 = await name(); await p.select('#preset', '2'); await waitName(n0); await rendered();
await p.$eval('#panel', e => e.scrollTo({ top: 0, behavior: 'smooth' })); await pause(500);
await say(22);
await flyTo(-49.6, 69.6, 160e3, 2000);
for (const id of ['namesOn', 'frontsOn', 'boundsOn', 'contourOn']) { await click('#' + id, 500); await pause(900); }
await quiet();
for (const id of ['namesOn', 'boundsOn', 'contourOn']) await p.$eval('#' + id, e => { e.click(); });
await say(23); await click('#demContourOn', 600); await rendered(); await pause(2500);
if (warm) await p.screenshot({ path: here + 'w_demcontours.jpg', quality: 70 });
await quiet(1);
await p.$eval('#demContourOn', e => e.click());
await say(24); await click('#particlesOn'); await pause(2000);
await quiet(4);
await click('#particlesOn', 400); await p.$eval('#frontsOn', e => e.click());

// 6b. strain rates at Jakobshavn: effective, then along flow, with the readout
await flyTo(-49.4, 69.18, 45e3, 1500);
await say(25); await openSec('srSec'); await pause(800);
await quiet(-1);
await say(26); await pickFrom('#srKind', 'eff', ['lon', 'shear', 'div']);
await glide(...await at('#srLen'), 700); await pause(600);
await click('#srCompute');
await p.waitForFunction(() => !document.getElementById('srLegend').hidden, { timeout: 120000 }).catch(e => console.log('sr wait', e.message));
await rendered(); await pause(1200);
for (const [lon, lat] of [[-49.6, 69.17], [-49.35, 69.2], [-49.1, 69.24]]) { await glide(...await pix(lon, lat), 900); await pause(1100); }
await pickFrom('#srKind', 'lon');
await p.waitForFunction(() => /along-flow/.test(document.getElementById('srNote').textContent), { timeout: 120000 }).catch(e => console.log('sr lon', e.message));
await rendered(); await pause(2500);
if (warm) await p.screenshot({ path: here + 'w_strain.jpg', quality: 70 });
await quiet(1);
await click('#srClear'); await closeSec('srSec');

// 6c. Save figure: a box at Jakobshavn, sized in inches, saved as a GeoTIFF with its side file
await say(27); await openSec('figSec'); await click('#figDraw');
await clickXY(await pix(-49.9, 69.27), 700); await glide(...await pix(-48.95, 69.08), 1000); await p.mouse.click(...cur); await pause(700);
await pickFrom('#figSize', 'in', ['2', '4', '8', 'data']); await pause(600);
await glide(...await at('#figWidth'), 600); await pause(500); await glide(...await at('#figDpi'), 600); await pause(600);
await quiet(-1);
await say(28); await pickFrom('#figFormat', 'tif', ['png', 'jpg']); await click('#figSave');
await p.waitForFunction(() => /^Saved|Could not/.test(document.getElementById('figNote').textContent), { timeout: 180000 }).catch(e => console.log('fig', e.message));
console.log('figure', await p.$eval('#figNote', e => e.textContent));
await pause(1500); if (warm) await p.screenshot({ path: here + 'w_figure.jpg', quality: 70 });
await glide(...await at('#figJson'), 700); await pause(1200);
await quiet(1);
await click('#figClearBox'); await closeSec('figSec');

// 7. animation
await say(29); await openSec('animSec'); await click('#animDrawBox');
await clickXY(await pix(-49.95, 69.3), 700); await glide(...await pix(-48.9, 69.06), 1200); await p.mouse.click(...cur); await pause(500);
await quiet();
await say(30); await tick('animAnom'); await tick('animBar'); await click('#animBuild');
await p.waitForFunction(() => !document.getElementById('animPlay').disabled, { timeout: 240000 });
await click('#animPlay'); await pause(3000);
await quiet(4);
await say(31); await glide(...await at('#animExport'), 800); await pause(1000);
await quiet(2);
await click('#animPlay'); await click('#animClose'); await closeSec('animSec'); await rendered();

// 7b. backscatter animation of the Jakobshavn front, then back to annual velocity
await p.$eval('#panel', e => e.scrollTo({ top: 0, behavior: 'smooth' })); await pause(400);
await say(32);
n0 = await name(); await pickFrom('#preset', '0'); await waitName(n0, 120000).catch(e => console.log('bks', e.message)); await rendered();
await flyTo(-49.75, 69.18, 25e3, 1500);
await openSec('animSec');
await p.evaluate(() => { const a = document.getElementById('animAnom'); if (a.checked) { a.checked = false; a.dispatchEvent(new Event('change')); } });
{ const [x, y] = await at('#animStep'); await glide(x, y, 600); await p.mouse.click(x, y, { clickCount: 3 }); await p.keyboard.type('30', { delay: warm ? 0 : 140 }); await p.keyboard.press('Tab'); }
await p.select('#animFps', '8');
await click('#animDrawBox');
await clickXY(await pix(-50.1, 69.24), 700); await glide(...await pix(-49.45, 69.12), 1000); await p.mouse.click(...cur); await pause(400);
await click('#animBuild');
await p.waitForFunction(() => !document.getElementById('animPlay').disabled, { timeout: 400000 });
console.log('bks frames', await p.$eval('#animNote', e => e.textContent), await p.$eval('#animCount', e => e.textContent));
await click('#animPlay'); await pause(9000); if (warm) { await sleep(2500); await p.screenshot({ path: here + 'w_bksanim.jpg', quality: 70 }); }
await quiet(1);
await click('#animPlay'); await click('#animClose'); await closeSec('animSec');
await say(33); await openSec('saBlock'); await click('#swOn');
{ const o = await p.$$eval('#swRef option', o => o.map(x => [x.value, x.textContent]).filter(x => x[0]));
  console.log('bks swRef', o.length, o.slice(-3));
  const w = o.find(x => /Feb[^a-z]*26|2026-02/.test(x[0] + ' ' + x[1])) || o[Math.floor(o.length * 0.9)];
  console.log('winter', w); await pickFrom('#swRef', w[0]); }
await rendered(); await pause(800);
{ const h = await at('#swHandle', { scroll: false }); await glide(...h, 700); await p.mouse.down(); await glide(h[0] - 250, h[1], 1800); await glide(h[0] + 250, h[1], 2600); await glide(h[0], h[1], 1200); await p.mouse.up(); }
if (warm) await p.screenshot({ path: here + 'w_bkssw.jpg', quality: 70 });
await quiet(1);
await click('#swOn'); await closeSec('saBlock');
n0 = await name(); await p.select('#preset', '2'); await waitName(n0); await rendered();
await flyTo(-49.4, 69.18, 45e3, 800);

// 8. share and download
await p.$eval('#panel', e => e.scrollTo({ top: 0, behavior: 'smooth' })); await pause(500);
await say(34); await click('#share'); await pause(1500); await click('#shareQr'); await pause(2500); await click('#qrClose');
await quiet();
await say(35); await click('#shareEmbed'); await pause(2500);
await quiet();
await say(36); await pickFrom('#goTo', '2', ['1', '4']); await pause(800); await rendered(); await pause(1200);
await quiet(-1);
// the line is drawn before the sentence (up Helheim's main trunk from the front); its edits while it is spoken
await openSec('msSec'); await click('#msDist');
{ const pts = [[-38.166, 66.364], [-38.378, 66.426], [-38.607, 66.535]];
  for (const [k, ll] of pts.entries()) { const xy = await pix(...ll); await glide(...xy, 700); await pause(150); await p.mouse.click(...xy); if (k === pts.length - 1) await p.mouse.click(...xy, { clickCount: 2 }); await pause(300); }
  await pause(600);
  await say(37); await pause(1800);
  const mid = await pix(...pts[1]); await glide(...mid, 700); await p.mouse.down(); await glide(mid[0] + 18, mid[1] - 12, 1200); await p.mouse.up(); await pause(900);
  const a = await pix(...pts[0]), side = [(a[0] + mid[0] + 18) / 2, (a[1] + mid[1] - 12) / 2]; await glide(...side, 700); await p.mouse.down(); await glide(side[0] - 12, side[1] - 22, 1200); await p.mouse.up(); await pause(1500); }
if (warm) await p.screenshot({ path: here + 'w_measure.jpg', quality: 70 });
await quiet(2);
await click('#msClear'); await closeSec('msSec');
// Digitize: a freehand outline of the trunk and a rectangle at the front, then the outline renamed
await openSec('dgSec');
await say(38); await tick('dgFree'); await click('#dgPoly');
{ const c = await pix(-38.378, 66.426), ring = Array.from({ length: 33 }, (_, k) => [c[0] + 95 * Math.cos(k / 32 * 2 * Math.PI + 0.6), c[1] + 50 + 42 * Math.sin(k / 32 * 2 * Math.PI + 0.6)]);
  await glide(...ring[0], 700); await pause(150); await p.mouse.down();
  for (const q of ring.slice(1)) await glide(...q, 70);
  await p.mouse.up(); await pause(500); }
await click('#dgPoly'); await tick('dgFree', false); await click('#dgCircle');
const front = await pix(-38.166, 66.364);
await clickXY([front[0] + 30, front[1]], 700); await clickXY([front[0] + 62, front[1]], 900); await pause(400);
await click('#dgCircle');
if (warm) await p.screenshot({ path: here + 'w_digitize.jpg', quality: 70 });
await quiet();
// move the circle by dragging inside it, then resize it by its edge
await say(39);
{ const c = [front[0] + 30, front[1]]; await glide(c[0] - 8, c[1] + 6, 700); await pause(200); await p.mouse.down(); await glide(c[0] - 38, c[1] + 6, 1300); await p.mouse.up(); await pause(700);
  const e = [front[0] + 32, front[1]]; await glide(...e, 700); await pause(250); await p.mouse.down(); await glide(e[0] + 30, e[1], 1300); await p.mouse.up(); await pause(1200); }
if (warm) await p.screenshot({ path: here + 'w_digitize1.jpg', quality: 70 });
await quiet();
// the trunk outline's plot button: its mean speed on every date in Time series at points
await say(40); await click('#dgList li:first-child .dgPlot');
await p.waitForFunction(() => document.getElementById('tsProg').hidden && !document.getElementById('tsPlot').hidden, { timeout: 180000 }).catch(e => console.log('area ts', e.message));
await pause(2500); if (warm) await p.screenshot({ path: here + 'w_area.jpg', quality: 70 });
await quiet(1);
await click('#tsClear'); await closeSec('tsSec');
await say(41);
{ const [x, y] = await at('#dgList li:first-child input'); await glide(x, y, 700); await pause(150); await p.mouse.click(x, y, { clickCount: 3 }); await pause(200);
  await p.keyboard.type('Helheim trunk', { delay: warm ? 0 : 90 }); await pause(600); }
{ const [x, y] = await at('#dgName'); await glide(x, y, 700); await p.mouse.click(x, y); await p.keyboard.type('helheimShapes', { delay: warm ? 0 : 80 }); await pause(400); }
await glide(...await at('#dgCrs'), 700); await pause(700); await glide(...await at('#dgSave'), 700); await pause(1200);
// Open GeoPackage: a file chooser is not drawn in a screen capture, so the sample file goes straight into the picker
{ const [x, y] = await at('#dgOpen'); await glide(x, y, 700); await pause(500);
  await (await p.$('#dgFile')).uploadFile(here + 'helheimStakes.gpkg');
  await p.waitForFunction(() => /^Opened/.test(document.getElementById('dgNote').textContent), { timeout: 30000 }).catch(e => console.log('open', e.message));
  await rendered(); await pause(2500); }
if (warm) await p.screenshot({ path: here + 'w_digitize2.jpg', quality: 70 });
await quiet(1.5);
await click('#dgClear'); await closeSec('dgSec');
await flyTo(-49.4, 69.18, 45e3, 1500);
await say(42); await openSec('cropSec'); await pause(1500); await click('#cropOn'); await click('#drawBox');
await clickXY(await pix(-49.8, 69.27), 700); await glide(...await pix(-49.1, 69.1), 1000); await p.mouse.click(...cur); await pause(800);
await quiet();
await say(43); { const [x, y] = await p.$eval('#cropSec .block-inner > .note', e => { e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return [r.x + r.width * 0.6, r.y + r.height / 2]; }); await glide(x, y, 900); } await pause(1500);
await quiet();
await say(44); await glide(...await at('#dlSel'), 800); await pause(2500);
await quiet();
await closeSec('cropSec');
await p.$eval('#panel', e => e.scrollTo({ top: 0, behavior: 'smooth' })); await pause(500);
await say(45); await glide(...await at('#openDisk'), 900); await pause(2500);
await quiet();

// 8b. the GrIMP DEM and the land ice / ocean mask collections, at Jakobshavn
{ const o = await p.$$eval('#preset option', o => o.map(x => [x.value, x.textContent])), f = re => o.find(x => re.test(x[1]))?.[0];
  await say(46); n0 = await name(); await pickFrom('#preset', f(/GrIMP DEM/)); await waitName(n0, 120000).catch(e => console.log('dem', e.message)); await pause(2000);
  n0 = await name(); await pickFrom('#preset', f(/land ice/)); await waitName(n0, 120000).catch(e => console.log('mask', e.message)); await pause(800); }
for (const [lon, lat] of [[-49.0, 69.2], [-49.75, 69.18], [-50.3, 69.32]]) { await glide(...await pix(lon, lat), 900); await pause(1200); }
if (warm) await p.screenshot({ path: here + 'w_mask.jpg', quality: 70 });
await quiet(1);

// 9. Antarctica: Pine Island on the Amundsen Sea annual series, browse image, a point, swipe
await p.$eval('#panel', e => e.scrollTo({ top: 0, behavior: 'smooth' })); await pause(500);
n0 = await name();
await say(47); await click('#hemS'); await waitName(n0, 120000).catch(e => console.log('hemS', e.message)); await pause(1000);
const opts = await p.$$eval('#preset option', o => o.map(x => [x.value, x.textContent]));
const optOf = re => opts.find(o => re.test(o[1]))?.[0];
n0 = await name(); await pickFrom('#preset', optOf(/Amundsen.*annual velocity/), [optOf(/Amundsen.*quarterly/)]); await waitName(n0, 120000).catch(() => {});
await flyTo(-100.4, -75.0, 150e3, 3000);
await quiet();
await say(48);
{ const a = await p.$$eval('#asset option', o => o.map(x => x.value)); console.log('assets', a); }
await pickFrom('#asset', 'browse'); await rendered(); await pause(800);
await openSec('tsSec'); await click('#tsAdd'); await clickXY(await pix(-100.4, -75.03), 900); await click('#tsAdd');
await p.waitForFunction(() => document.getElementById('tsProg').hidden && !document.getElementById('tsPlot').hidden, { timeout: 180000 }).catch(e => console.log('ts wait', e.message));
await pause(4500); await quiet(1); if (warm) await p.screenshot({ path: here + 'w_pigts.jpg', quality: 70 });
await click('#tsClear'); await closeSec('tsSec');
await say(49); await pickFrom('#asset', 'vv'); await rendered(); await openSec('saBlock'); await click('#swOn');
{ const v = await p.$$eval('#swRef option', o => o.map(x => x.value).filter(Boolean)); console.log('swRef', v[0], v.length);
  await pickFrom('#swRef', v[0]); }
await rendered(); await pause(800);
{ const h = await at('#swHandle', { scroll: false }); await glide(...h, 700); await p.mouse.down(); await glide(h[0] - 300, h[1], 1800); await glide(h[0] + 250, h[1], 2600); await p.mouse.up(); }
await quiet(1); if (warm) await p.screenshot({ path: here + 'w_pigsw.jpg', quality: 70 });
await click('#swOn'); await closeSec('saBlock');
await p.$eval('#panel', e => e.scrollTo({ top: 0, behavior: 'smooth' })); await pause(500);
await say(50);
n0 = await name(); await pickFrom('#preset', optOf(/NISAR/), [optOf(/Amundsen.*backscatter/)]); await waitName(n0, 120000).catch(() => {});
await flyTo(0, -90, 2900e3, 3000);
await quiet();
await say(51); await glide(1200, 540, 2000);
await quiet(2.5);

if (cdp) { await cdp.send('Page.stopScreencast'); await sleep(500); }
fs.writeFileSync(here + (warm ? 'cuesWarm.json' : 'cues.json'), JSON.stringify(cues));
if (!warm) fs.writeFileSync(here + 'timing.json', JSON.stringify({ stamps, cues: epochCues }));
console.log('done', now().toFixed(1), 's');
await browser.close();
