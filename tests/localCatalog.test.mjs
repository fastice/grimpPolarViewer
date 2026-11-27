// A catalog folder from this computer: Open a folder reads its parquet and GeoTIFFs from the disk (an asset
// href that is a bare file name, and one whose URL does not exist), shows the newest item with its value in
// the readout, plots a point's series from both files, and refuses to make a share link.
import { execFileSync } from 'node:child_process';
import { openViewer, catalogs, check, toMap, toPixel, text, sleep, shot, finish } from './lib.mjs';

const dir = new URL('./out/localCatalog/', import.meta.url).pathname;
execFileSync('python3', [new URL('./makeLocalCatalog.py', import.meta.url).pathname, dir]);
const { browser, page: p } = await openViewer(catalogs.glAnnual);
const failed = [];
p.on('requestfailed', r => failed.push(r.url()));
await (await p.$('#diskFiles')).uploadFile(dir.replace(/\/$/, ''));  // a folder, as the picker gives it
await p.waitForFunction(() => /files read from the folder/.test(document.getElementById('status').textContent) && document.getElementById('lname').textContent.startsWith('localTest'), { timeout: 30000 })
  .catch(async e => { console.log('status:', await text(p, 'status'), '| lname:', await text(p, 'lname'), '| files:', await p.$eval('#diskFiles', e => e.files.length)); throw e; });
const st = await text(p, 'status');
check('both files read from the folder', /^2 items, EPSG:3413; 2 of 2 files read from the folder\b/.test(st), st);
check('the newest item shown, named in the title', (await text(p, 'lname')) === 'localTest_2021_vv.tif' && /localTest\.parquet/.test(await p.$eval('#title', e => e.textContent)), await text(p, 'lname'));
check('the URL box says it is from this computer, the page URL has no catalog', /from this computer/.test(await p.$eval('#href', e => e.placeholder)) && !new URL(p.url()).searchParams.has('href'), p.url());
await sleep(2500);
const c = await toMap(p, -49.6, 69.0), q = await toPixel(p, c);
await p.mouse.move(q[0], q[1]); await sleep(1200);
check('the readout reads the file: 222 m/yr', /vv 222\b/.test(await text(p, 'readout')), await text(p, 'readout'));
// a point's series from both files
await p.evaluate(() => { document.getElementById('tsSec').open = true; });
await p.$eval('#tsAdd', e => e.click()); await sleep(300);
{ const q2 = await toPixel(p, c); await p.mouse.click(q2[0], q2[1]); await sleep(300); }
await p.$eval('#tsAdd', e => e.click());
await p.waitForFunction(() => /dates in/.test(document.getElementById('tsNote').textContent), { timeout: 30000 })
  .catch(async e => { console.log('tsNote:', await text(p, 'tsNote'), '| hidden:', await p.$eval('#tsSec', e => e.hidden), '| n:', await p.evaluate(() => window.grimpViewer.ts().tsPoints.length)); throw e; });
const v = await p.evaluate(() => window.grimpViewer.ts().tsPoints[0].values.map(x => x.v));
check('a point reads 111 and 222 from the two files', v.join() === '111,222', v);
check('nothing fetched from the made-up URL', !failed.some(u => /example\.invalid|localTest_20/.test(u)), failed);
await p.click('#share'); await sleep(300);
check('no share link for a catalog from this computer', /cannot show it to anyone else/.test(await text(p, 'shareNote')), await text(p, 'shareNote'));
await shot(p, 'localCatalog');
await finish(browser);
