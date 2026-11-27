// Strain rates on synthetic vx, vy with known answers (a folder catalog from makeStrainCatalog.py): 2020
// stretching along x at 0.01 /yr, 2021 simple shear of 0.004 /yr (strain rate 0.002 /yr); each kind under the
// pointer in the readout, recomputed when the date changes; Antarctica-style section hidden without vx/vy.
import { execFileSync } from 'node:child_process';
import { openViewer, catalogs, check, toPixel, zoomTo, text, sleep, shot, finish } from './lib.mjs';

const dir = new URL('./out/strainCatalog/', import.meta.url).pathname;
execFileSync('python3', [new URL('./makeStrainCatalog.py', import.meta.url).pathname, dir]);
const { browser, page: p } = await openViewer(catalogs.glAnnual);
check('strain section shown for velocity mosaics', !(await p.$eval('#srSec', e => e.hidden)));
await (await p.$('#diskFiles')).uploadFile(dir.replace(/\/$/, ''));
await p.waitForFunction(() => /strainTest_2021/.test(document.getElementById('lname').textContent || '') || /strainTest/.test(document.getElementById('title').textContent), { timeout: 60000 });
const C = [-200000, -2280000];
await zoomTo(p, C, 50e3); await sleep(1500);
await p.$eval('#srSec', e => { e.open = true; e.scrollIntoView(); });
await p.select('#srLen', '10000');
const at = async kind => {
  await p.select('#srKind', kind);
  await p.click('#srCompute');
  await p.waitForFunction(() => /differences across/.test(document.getElementById('srNote').textContent), { timeout: 60000 });
  const q = await toPixel(p, C); await p.mouse.move(q[0] + 1, q[1]); await p.mouse.move(q[0], q[1]); await sleep(900);
  const m = /strain rate<\/b> (\S+) \/yr|divergence<\/b> (\S+) \/yr/.exec(await p.$eval('#roText', e => e.innerHTML));
  return m ? +(m[1] ?? m[2]) : NaN;
};
const near = (v, want, tol) => Math.abs(v - want) <= tol;
const item = () => text(p, 'lname');
// the newest item (2021, shear) is shown first
let r = { eff: await at('eff'), lon: await at('lon'), shear: await at('shear'), div: await at('div') };
check('simple shear: effective and shear 0.002, along-flow and divergence 0', near(r.eff, 0.002, 1e-4) && near(r.shear, 0.002, 1e-4) && near(r.lon, 0, 1e-6) && near(r.div, 0, 1e-6), { item: await item(), r });
await shot(p, 'strain');
// the 2020 item (stretching): the strain map follows the date
await p.$$eval('#items li', lis => lis.find(li => /2020/.test(li.textContent)).click());
await p.waitForFunction(() => /strainTest_2020/.test(document.getElementById('srNote').textContent), { timeout: 60000 });
r = { div: await at('div'), eff: await at('eff'), lon: await at('lon'), shear: await at('shear') };
check('stretching: effective, along-flow and divergence 0.01, shear 0', near(r.eff, 0.01, 3e-4) && near(r.lon, 0.01, 3e-4) && near(r.div, 0.01, 3e-4) && near(r.shear, 0, 1e-6), { item: await item(), r });
await p.click('#srClear');
{ const q = await toPixel(p, C); await p.mouse.move(q[0] + 2, q[1]); await sleep(900); }
check('Clear removes the map and its readout line', await p.$eval('#srLegend', e => e.hidden) && !/strain rate/.test(await p.$eval('#roText', e => e.innerHTML)));
await finish(browser);
