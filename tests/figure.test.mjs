// Save figure (Greenland annual): a box drawn over Jakobshavn from a zoomed-out view, sized 4x the box on
// screen, the data's pixels or a width in inches (too large refused); saved as a PNG of exactly that size with
// its dpi and link stored, sharper than the screen (finer data, lines and labels drawn again, not enlarged),
// beside a .json sidecar; the map comes back as it was. The sidecar's link reopens the viewer with the box and
// size, and saving again there makes the same figure.
import { execFileSync } from 'node:child_process';
import { existsSync, unlinkSync, readFileSync } from 'node:fs';
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, text, sleep, shot, finish } from './lib.mjs';

const out = new URL('./out/figure/', import.meta.url).pathname;
execFileSync('mkdir', ['-p', out]);
const { browser, page: p } = await openViewer(catalogs.glAnnual);
const fig = () => p.evaluate(() => window.grimpViewer.fig());
const note = () => text(p, 'figNote');
const C = await toMap(p, -49.4, 69.17);
await zoomTo(p, C, 300e3); await sleep(2500);
await p.$eval('#figSec', e => { e.open = true; e.scrollIntoView(); });
check('Save disabled with no box', await p.$eval('#figSave', e => e.disabled));
// the box: 150 km x 100 km around the glacier
await p.click('#figDraw');
const a = await toPixel(p, [C[0] - 75e3, C[1] + 50e3]), b = await toPixel(p, [C[0] + 75e3, C[1] - 50e3]);
await p.mouse.click(...a); await sleep(300); await p.mouse.click(...b); await sleep(800);
const f0 = await fig(), box = f0.figBox, bw = box[2] - box[0], bh = box[3] - box[1];
check('box drawn', box && Math.abs(bw - 150e3) < 3e3 && Math.abs(bh - 100e3) < 3e3 && !(await p.$eval('#figSave', e => e.disabled)), box);
const size = async () => (/^(\d+) x (\d+) pixels/.exec(await note()) || []).slice(1).map(Number);
let s = await size();
check('4x the box on screen', Math.abs(s[0] - Math.round(4 * bw / f0.res)) <= 1, { s, want: 4 * bw / f0.res });
await p.select('#figSize', 'data'); s = await size();
check('the data\'s pixels (200 m)', Math.abs(s[0] - bw / 200) <= 1 && Math.abs(s[1] - bh / 200) <= 1, { s, note: await note() });
await p.select('#figSize', 'in');
check('width in inches shown for that choice only', !(await p.$eval('#figWidthRow', e => e.hidden)));
await p.$eval('#figWidth', e => { e.value = '40'; e.dispatchEvent(new Event('input')); });
check('too large refused', /too large/.test(await note()) && await p.$eval('#figSave', e => e.disabled), await note());
await p.$eval('#figWidth', e => { e.value = '6.5'; e.dispatchEvent(new Event('input')); });
s = await size();
const H = Math.round(1950 * bh / bw);
check('6.5 in at 300 dpi: 1950 pixels, finer than the data', s[0] === 1950 && s[1] === H && /6.50 x \d\.\d\d in at 300 dpi.*finer than the data's 200 m/.test(await note()), await note());

// save it
for (const f of ['png', 'json']) { const n = `${out}${await p.$eval('#lname', e => e.textContent.replace(/_vv_.*$/, ''))}_vv_figure.${f}`; if (existsSync(n)) unlinkSync(n); }
const cdp = await p.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: out });
const before = await fig();
await p.click('#figSave');
await p.waitForFunction(() => /^Saved|Could not/.test(document.getElementById('figNote').textContent), { timeout: 180000 });
await sleep(2000);
const saved = await note(), name = (/^Saved (\S+)\.png/.exec(saved) || [])[1];
check('saved note', !!name && saved.includes(`1950 x ${H} pixels`) && !/had not loaded/.test(saved), saved);
const after = await fig();
check('map back as it was', JSON.stringify(after.size) === JSON.stringify(before.size) && after.ratio === before.ratio
  && Math.abs(after.res - before.res) < 1e-6 && Math.hypot(after.center[0] - before.center[0], after.center[1] - before.center[1]) < 1
  && JSON.stringify(after.figBox) === JSON.stringify(box), { before, after });
const png = `${out}${name}.png`, side = JSON.parse(readFileSync(`${out}${name}.json`, 'utf8'));
// size, dpi and text chunks, and how much finer it is than the screen: the figure against itself averaged down to
// the screen's pixels and enlarged back (a figure that only enlarged the screen would match it closely)
const py = `
import sys, json, numpy as np
from PIL import Image
im = Image.open(sys.argv[1]); a = np.asarray(im.convert('L'), float)
k = int(sys.argv[2]); h, w = a.shape[0] // k * k, a.shape[1] // k * k
lo = a[:h, :w].reshape(h // k, k, w // k, k).mean(axis=(1, 3)).repeat(k, 0).repeat(k, 1)
print(json.dumps({ 'size': im.size, 'dpi': [round(v) for v in im.info.get('dpi', (0, 0))], 'source': im.info.get('Source', ''),
  'software': im.info.get('Software', ''), 'std': a.std(), 'detail': float(np.abs(a[:h, :w] - lo).mean()) }))`;
const k = Math.round(1950 / (bw / before.res));
const m = JSON.parse(execFileSync('python3', ['-c', py, png, String(k)], { encoding: 'utf8' }));
check('PNG 1950 pixels across at 300 dpi, with the link and viewer', m.size[0] === 1950 && m.size[1] === H && m.dpi[0] === 300 && /[?&]fig=/.test(m.source) && /GrIMP Polar Viewer/.test(m.software), m);
check('not blank, and sharper than the screen', m.std > 20 && m.detail > 3, { std: m.std, detail: m.detail, k });
check('sidecar: box, size, product, colors, link', JSON.stringify(side.box) === JSON.stringify(box.map(Math.round)) && side.crs === 'EPSG:3413'
  && side.pixels[0] === 1950 && side.dpi === 300 && side.product.asset === 'vv' && side.colors.logScale === true && side.allTilesLoaded === true
  && side.link === m.source, side);

// the link rebuilds it
const p2 = await browser.newPage();
await p2.setViewport({ width: 1400, height: 900 });
await p2.goto(side.link.replace(/^https?:\/\/[^/]+\/[^?]*/, `http://127.0.0.1:${process.env.PORT || 8767}/index.html`), { waitUntil: 'networkidle2', timeout: 120000 });
await p2.waitForFunction(() => window.grimpViewer.fig().figBox && document.getElementById('lname').textContent, { timeout: 120000 });
await sleep(3000);
const g = await p2.evaluate(() => ({ box: window.grimpViewer.fig().figBox, size: document.getElementById('figSize').value, w: document.getElementById('figWidth').value,
  open: document.getElementById('figSec').open, note: document.getElementById('figNote').textContent }));
check('link reopens with the box and size', JSON.stringify(g.box) === JSON.stringify(side.box) && g.size === 'in' && g.w === '6.5' && g.open && /^Figure link/.test(g.note), g);
const cdp2 = await p2.createCDPSession();
const out2 = out + 'again/';
execFileSync('mkdir', ['-p', out2]);
await cdp2.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: out2 });
await p2.click('#figSave');
await p2.waitForFunction(() => /^Saved|Could not/.test(document.getElementById('figNote').textContent), { timeout: 180000 });
await sleep(2000);
const cmp = `
import sys, numpy as np
from PIL import Image
a, b = (np.asarray(Image.open(f).convert('RGB'), float) for f in sys.argv[1:3])
print(a.shape == b.shape and float(np.abs(a - b).mean()))`;
const diff = execFileSync('python3', ['-c', cmp, png, `${out2}${name}.png`], { encoding: 'utf8' }).trim();
check('saving again from the link makes the same figure', diff !== 'False' && +diff < 1, diff);
await p.bringToFront();
await shot(p, 'figure');
await finish(browser);
