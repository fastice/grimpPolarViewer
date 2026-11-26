// Digitize (Greenland annual): a point, a line, a polygon, a rectangle, a circle and a freehand polygon
// drawn near Jakobshavn, renamed, edited and deleted from the list, then saved as a GeoPackage that GDAL
// reads (and its validator passes): three layers in EPSG:3413 with the names, shapes, true lengths and
// areas. The shapes stay with the Greenland map across a switch to Antarctica and back.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, text, hidden, shot, sleep, finish } from './lib.mjs';

const { browser, page: p } = await openViewer(catalogs.glAnnual);
await zoomTo(p, await toMap(p, -49.4, 69.15), 60e3);
await p.$eval('#dgSec', e => { e.open = true; e.scrollIntoView(); });
const px = async ll => toPixel(p, await toMap(p, ...ll));
const clickAt = async (ll, dbl = false) => { const q = await px(ll); await p.mouse.click(q[0], q[1]); if (dbl) await p.mouse.click(q[0], q[1], { clickCount: 2 }); await sleep(250); };
const dg = () => p.evaluate(() => window.grimpViewer.dg());

await p.click('#dgPoint');
check('a tool shows Stop while on', (await text(p, 'dgPoint')) === 'Stop');
await clickAt([-49.6, 69.2]); await clickAt([-49.2, 69.1]);
await p.click('#dgPoint'); await sleep(200);
check('Stop turns the tool off', (await text(p, 'dgPoint')) === 'Point');

await p.click('#dgLine');
await clickAt([-49.9, 69.05]); await clickAt([-49.3, 69.25]); await clickAt([-48.8, 69.1], true);
await p.click('#dgLine');
await p.click('#dgPoly');
for (const c of [[-49.8, 69.0], [-49.4, 69.0], [-49.4, 69.12]]) await clickAt(c);
await clickAt([-49.8, 69.0]);
await p.click('#dgPoly');
await p.click('#dgRect');
await clickAt([-49.2, 69.2]); await clickAt([-48.9, 69.3]);
await p.click('#dgRect');
await p.click('#dgCircle');
await clickAt([-49.0, 69.0]); await clickAt([-48.9, 69.0]);
await p.click('#dgCircle');
// freehand: press and drag around a loop
await p.click('#dgFree'); await p.click('#dgPoly');
const ring = Array.from({ length: 25 }, (_, k) => [-49.55 + 0.08 * Math.cos(k / 24 * 2 * Math.PI), 69.25 + 0.03 * Math.sin(k / 24 * 2 * Math.PI)]);
const r0 = await px(ring[0]);
await p.mouse.move(r0[0], r0[1]); await p.mouse.down();
for (const c of ring.slice(1)) { const q = await px(c); await p.mouse.move(q[0], q[1], { steps: 2 }); }
await p.mouse.up(); await sleep(400);
await p.click('#dgPoly'); await p.click('#dgFree');

let fs = await dg();
const shapes = fs.map(f => f.shape);
check('all the shapes are drawn', JSON.stringify(shapes) === JSON.stringify(['point', 'point', 'line', 'polygon', 'rectangle', 'circle', 'freehand polygon']), shapes);
check('rectangle has 4 corners, circle 64 sides', fs[4].coords[0].length === 5 && fs[5].coords[0].length === 65, [fs[4].coords[0].length, fs[5].coords[0].length]);
check('freehand polygon follows the drag', fs[6].coords[0].length > 20, fs[6].coords[0].length);
check('listed with names and Save shown', (await p.$$eval('#dgList input', e => e.map(x => x.value))).join('|') === 'Point 1|Point 2|Line 1|Polygon 1|Rectangle 1|Circle 1|Polygon 2'
  && (await text(p, 'dgCount')) === '(7)' && !(await hidden(p, 'dgSave')), await p.$$eval('#dgList input', e => e.map(x => x.value)));

// rename the line, delete the second point, drag the line's middle point
const names = await p.$$('#dgList input');
await names[2].click({ clickCount: 3 }); await names[2].type('Jakobshavn trunk');
await (await p.$$('#dgList button'))[1].click(); await sleep(200);
fs = await dg();
check('rename and delete from the list', fs.length === 6 && fs[1].name === 'Jakobshavn trunk', fs.map(f => f.name));
const lenBefore = await p.$$eval('#dgList .note', e => e[1].textContent);
const m = await toPixel(p, fs[1].coords[1]);
await p.mouse.move(m[0], m[1]); await p.mouse.down(); await p.mouse.move(m[0], m[1] + 60, { steps: 8 }); await p.mouse.up(); await sleep(500);
const fs2 = await dg(), lenAfter = await p.$$eval('#dgList .note', e => e[1].textContent);
check('dragging a point edits the shape and its length', Math.abs(fs2[1].coords[1][1] - fs[1].coords[1][1]) > 1000 && lenAfter !== lenBefore, { lenBefore, lenAfter });
await shot(p, 'digitize');

// the GeoPackage, read back with GDAL
const out = new URL('./out/digitize.gpkg', import.meta.url).pathname;
writeFileSync(out, Buffer.from(await p.evaluate(() => window.grimpViewer.gpkg())));
const info = JSON.parse(execFileSync('ogrinfo', ['-json', '-features', out], { encoding: 'utf8' }));
const lyr = Object.fromEntries(info.layers.map(l => [l.name, l]));
check('three layers: points, lines, polygons', ['points', 'lines', 'polygons'].every(n => lyr[n]) && info.layers.length === 3, info.layers.map(l => l.name));
const epsg = l => l.geometryFields[0].coordinateSystem?.projjson?.id?.code;
check('in EPSG:3413', Object.values(lyr).every(l => epsg(l) === 3413), Object.values(lyr).map(epsg));
const pts = lyr.points.features, lines = lyr.lines.features, polys = lyr.polygons.features;
check('feature counts', pts.length === 1 && lines.length === 1 && polys.length === 4, [pts.length, lines.length, polys.length]);
check('names and shapes saved', lines[0].properties.name === 'Jakobshavn trunk' && polys.map(f => f.properties.shape).join() === 'polygon,rectangle,circle,freehand polygon',
  polys.map(f => f.properties));
const pc = pts[0].properties;
check('point lat/lon match its coordinates', Math.abs(pc.lat - 69.2) < 0.01 && Math.abs(pc.lon + 49.6) < 0.02, pc);
const geomPts = lines[0].geometry.coordinates;
check('line geometry matches the edited line', geomPts.length === 3 && geomPts.every((c, k) => Math.abs(c[0] - fs2[1].coords[k][0]) < 1e-6 && Math.abs(c[1] - fs2[1].coords[k][1]) < 1e-6));
check('line length matches the list', Math.abs(lines[0].properties.length_km - parseFloat(lenAfter)) < 0.01, { gpkg: lines[0].properties.length_km, list: lenAfter });
// true area against GDAL's geodesic (ellipsoidal) area of the same polygon, its sides cut into 50 m pieces
// so they follow the straight map lines drawn
const ogrArea = execFileSync('python3', ['-c', `
from osgeo import ogr
ogr.UseExceptions()
ds = ogr.Open(${JSON.stringify(out)})
for f in ds.GetLayer('polygons'):
    g = f.GetGeometryRef().Clone(); g.Segmentize(50)
    print(f.GetField('area_km2'), g.GeodesicArea() / 1e6)
`], { encoding: 'utf8' }).trim().split('\n').map(r => r.split(' ').map(Number));
check('true areas match GDAL geodesic areas within 0.01%', ogrArea.every(([a, b]) => Math.abs(a - b) / b < 1e-4), ogrArea);
const valid = (() => { try { execFileSync('python3', ['-m', 'osgeo_utils.samples.validate_gpkg', out], { encoding: 'utf8', stdio: 'pipe' }); return ''; } catch (e) { return (e.stdout || '') + (e.stderr || ''); } })();
check('GDAL GeoPackage validator passes', valid === '', valid);

// the same in lon, lat
const out4326 = new URL('./out/digitize4326.gpkg', import.meta.url).pathname;
writeFileSync(out4326, Buffer.from(await p.evaluate(() => window.grimpViewer.gpkg(true))));
const ll = JSON.parse(execFileSync('ogrinfo', ['-json', '-features', out4326, 'points'], { encoding: 'utf8' })).layers[0];
const llc = ll.features[0].geometry.coordinates;
check('EPSG:4326 choice: lon, lat geometry', epsg(ll) === 4326 && Math.abs(llc[0] + 49.6) < 0.02 && Math.abs(llc[1] - 69.2) < 0.01, { epsg: epsg(ll), llc });
const valid4326 = (() => { try { execFileSync('python3', ['-m', 'osgeo_utils.samples.validate_gpkg', out4326], { encoding: 'utf8', stdio: 'pipe' }); return ''; } catch (e) { return (e.stdout || '') + (e.stderr || ''); } })();
check('EPSG:4326 file passes the validator', valid4326 === '', valid4326);
check('Save in lists the map grid', /EPSG:3413/.test(await p.$eval('#dgCrs option', o => o.textContent)));

// Save button downloads the file
const cdp = await p.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: new URL('./out/', import.meta.url).pathname });
await p.click('#dgSave'); await sleep(2500);
check('Save note reports the shapes', /^Saved 6 shapes.*EPSG:3413/.test(await text(p, 'dgNote')), await text(p, 'dgNote'));

// shapes belong to the Greenland map
await p.click('#hemS'); await sleep(3000);
check('none shown on the Antarctic map', (await dg()).length === 0 && await hidden(p, 'dgSave'));
await p.click('#hemN'); await sleep(3000);
check('back on Greenland they return', (await dg()).length === 6);
await finish(browser);
