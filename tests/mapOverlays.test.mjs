// Speed contours, flow particles, the velocity error in the readout and basin areas (Jakobshavn,
// Greenland annual).
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, text, shot, sleep, finish } from './lib.mjs';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

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
// Save particle movie: a 10 s MP4 that loops. The particles repeat exactly (checked on the canvas while
// writing this), so the step from the last frame to the first differs from a frame step only by the key frame
// starting the movie being sharper than the frames before it: about 3x a step here (headless encoder) against
// 6x or more when the trails did not repeat (frames decoded small by ffmpeg, mean absolute difference).
await p.evaluate(() => { const o = URL.createObjectURL; URL.createObjectURL = b => { window.lastBlob = b; return o.call(URL, b); }; });
await p.click('#particleSave');
await p.waitForFunction(() => /Saved|failed/.test(document.getElementById('particleNote').textContent), { timeout: 180000 });
const mv = await p.evaluate(async () => ({ note: document.getElementById('particleNote').textContent, type: window.lastBlob?.type,
  b64: window.lastBlob ? await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(window.lastBlob); }) : '' }));
check('Save particle movie writes a 10 s loop MP4', /^Saved \S+_particles_\d{4}-\d\d-\d\d\.mp4 .*10\.0 s loop/.test(mv.note) && mv.type === 'video/mp4', mv.note);
if (mv.b64) {
  const file = new URL('./out/particles.mp4', import.meta.url).pathname, w = 280, h = 180;
  writeFileSync(file, Buffer.from(mv.b64, 'base64'));
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `scale=${w}:${h}`, '-pix_fmt', 'gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
  const nf = raw.length / (w * h), fr = i => raw.subarray(i * w * h, (i + 1) * w * h);
  const diff = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) s += Math.abs(a[k] - b[k]); return s / a.length; };
  const steps = Array.from({ length: nf - 1 }, (_, i) => diff(fr(i), fr(i + 1))).sort((a, b) => a - b), seam = diff(fr(nf - 1), fr(0));
  check('the movie loops: last-to-first step like a frame step', nf === 300 && seam < 4 * steps[steps.length >> 1],
    { frames: nf, seam: seam.toFixed(3), median: steps[steps.length >> 1].toFixed(3), p90: steps[Math.floor(0.9 * steps.length)].toFixed(3) });
}
await p.waitForFunction(() => window.grimpViewer.fx().particlesRunning, { timeout: 10000 }).catch(() => {});
check('particles run again after the movie', (await fx()).running);
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
