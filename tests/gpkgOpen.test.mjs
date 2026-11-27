// Digitize, opening GeoPackages (Greenland annual): a file written by GDAL in UTM 22N (a multi-part polygon
// layer with a hole and heights, a point layer with a row with no shape, a curved layer) opens in the map
// projection where GDAL puts it, with its fields; edited, it saves under a typed file name with the layers,
// fields and fids kept, beside a newly drawn point. A file in EPSG:3031 goes to the Antarctic map, and a file
// too large, or not a GeoPackage, is refused with a message.
import { execFileSync } from 'node:child_process';
import { writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, text, sleep, shot, finish } from './lib.mjs';

const out = new URL('./out/', import.meta.url).pathname;
execFileSync('python3', [new URL('./makeGpkgFixtures.py', import.meta.url).pathname, out]);
writeFileSync(out + 'notGpkg.gpkg', 'just some text\n');
writeFileSync(out + 'huge.gpkg', Buffer.alloc(51e6));
for (const f of ['myEdits.gpkg', 'roundTrip.gpkg']) if (existsSync(out + f)) unlinkSync(out + f);

const { browser, page: p } = await openViewer(catalogs.glAnnual);
await zoomTo(p, await toMap(p, -49.4, 69.15), 60e3);
await p.$eval('#dgSec', e => { e.open = true; e.scrollIntoView(); });
const cdp = await p.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: out });
const dg = () => p.evaluate(() => window.grimpViewer.dg());
const note = () => text(p, 'dgNote');
const open = async f => { await (await p.$('#dgFile')).uploadFile(out + f); await p.waitForFunction(() => !/^Reading/.test(document.getElementById('dgNote').textContent), { timeout: 30000 }); return note(); };
const ogr = f => Object.fromEntries(JSON.parse(execFileSync('ogrinfo', ['-json', '-features', out + f], { encoding: 'utf8' })).layers.map(l => [l.name, l]));
const valid = f => { try { execFileSync('python3', ['-m', 'osgeo_utils.samples.validate_gpkg', out + f], { encoding: 'utf8', stdio: 'pipe' }); return ''; } catch (e) { return (e.stdout || '') + (e.stderr || ''); } };

check('Open shown with nothing drawn', !(await p.$eval('#dgOpen', e => e.hidden)));
let n = await open('foreign.gpkg');
let fs = await dg();
check('opened note: shapes, layers, CRS, skipped curve, row with no shape, Z dropped',
  /^Opened 4 shapes \(layers glaciers, stakes, in EPSG:32622\)/.test(n) && /Skipped 1 curved/.test(n) && /Left out 1 row with no shape/.test(n) && /Z/.test(n), n);
check('names from NAME, else layer and fid', fs.map(f => f.name).join('|') === 'Glacier A|Glacier B|stakes 1|stakes 3', fs.map(f => f.name));
check('types and layers kept', fs.map(f => `${f.layer}:${f.type}`).join() === 'glaciers:MultiPolygon,glaciers:MultiPolygon,stakes:Point,stakes:Point', fs.map(f => `${f.layer}:${f.type}`));
check('fields kept', fs[0].attrs.code === 7 && fs[0].attrs.surveyed === '2024-08-15' && fs[0].attrs.Shape_Length === 1.5 && fs[3].attrs.label === 'stake 2' && fs[3].attrs.elev === 252.5, fs[0].attrs);
check('the hole is kept', fs[0].coords[0].length === 2 && fs[0].coords.length === 2, fs[0].coords.map(p => p.length));
// coordinates where GDAL (PROJ) puts them in EPSG:3413
const gdal = JSON.parse(execFileSync('python3', ['-c', `
import json
from osgeo import ogr, osr
ogr.UseExceptions()
t = osr.SpatialReference(); t.ImportFromEPSG(3413); t.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
ds = ogr.Open(${JSON.stringify(out + 'foreign.gpkg')})
out = []
for name in ('glaciers', 'stakes'):
    for f in ds.GetLayer(name):
        g = f.GetGeometryRef()
        if g is None: continue
        g = g.Clone(); g.FlattenTo2D(); g.TransformTo(t)
        out.append(json.loads(g.ExportToJson())['coordinates'])
print(json.dumps(out))`], { encoding: 'utf8' }));
const flat = c => typeof c[0] === 'number' ? [c] : c.flatMap(flat);
const worst = Math.max(...fs.map((f, k) => Math.max(...flat(f.coords).map((c, j) => Math.hypot(c[0] - flat(gdal[k])[j][0], c[1] - flat(gdal[k])[j][1])))));
check('coordinates match GDAL\'s EPSG:3413 within 1 cm', worst < 0.01, worst);
check('the file name box takes the opened file\'s name', (await p.$eval('#dgName', e => e.value)) === 'foreign');

// edit: rename, move a stake (Ctrl-drag), draw a new point; then save under a typed name
const names = await p.$$('#dgList input');
await names[1].click({ clickCount: 3 }); await names[1].type('Glacier B renamed');
const s0 = (await dg())[2].coords, sp = await toPixel(p, s0);
await p.keyboard.down('Control'); await p.mouse.move(sp[0], sp[1]); await p.mouse.down(); await p.mouse.move(sp[0] + 40, sp[1], { steps: 8 }); await p.mouse.up(); await p.keyboard.up('Control'); await sleep(400);
const s1 = (await dg())[2].coords;
check('an opened point moves', s1[0] - s0[0] > 1000, [s0, s1]);
await p.click('#dgPoint'); const q = await toPixel(p, await toMap(p, -49.0, 69.2)); await p.mouse.click(q[0], q[1]); await sleep(300); await p.click('#dgPoint');
await p.$eval('#dgName', e => { e.value = 'my/Edits.gpkg'; });
await p.click('#dgSave'); await sleep(2500);
check('saved under the typed name, made safe', /^Saved 5 shapes as my_Edits\.gpkg/.test(await note()) && existsSync(out + 'my_Edits.gpkg'), await note());
const L = ogr('my_Edits.gpkg');
check('layers glaciers, stakes and points (no curved layer)', Object.keys(L).sort().join() === 'glaciers,points,stakes', Object.keys(L));
check('glaciers stay multi-part polygons in EPSG:3413', L.glaciers.geometryFields[0].type === 'MultiPolygon' && L.glaciers.geometryFields[0].coordinateSystem.projjson.id.code === 3413);
const g = L.glaciers.features, st = L.stakes.features;
check('opened fields saved with their types', g[0].properties.code === 7 && /^2024.08.15$/.test(g[0].properties.surveyed) && g[1].properties.name === 'Glacier B renamed'
  && L.glaciers.fields.find(f => f.name === 'surveyed').type === 'Date' && L.glaciers.fields.find(f => f.name === 'code').type === 'Integer', g.map(f => f.properties));
check('fids kept', st.map(f => f.fid).join() === '1,3' && st[1].properties.label === 'stake 2', st.map(f => [f.fid, f.properties]));
check('the moved stake saved where it was moved', Math.abs(st[0].geometry.coordinates[0] - s1[0]) < 1e-6, [st[0].geometry.coordinates, s1]);
check('stakes get lat, lon; the drawn point goes in points', 'lat' in st[0].properties && L.points.features.length === 1 && L.points.features[0].properties.name === 'Point 1');
// true area with the hole taken out, against GDAL's geodesic area (sides cut into 50 m pieces)
const areas = execFileSync('python3', ['-c', `
from osgeo import ogr
ogr.UseExceptions()
ds = ogr.Open(${JSON.stringify(out + 'my_Edits.gpkg')})
for f in ds.GetLayer('glaciers'):
    g = f.GetGeometryRef().Clone(); g.Segmentize(50)
    print(f.GetField('area_km2'), g.GeodesicArea() / 1e6)
`], { encoding: 'utf8' }).trim().split('\n').map(r => r.split(' ').map(Number));
check('multi-part areas with holes match GDAL within 0.01%', areas.every(([a, b]) => Math.abs(a - b) / b < 1e-4), areas);
check('the saved file passes the validator', valid('my_Edits.gpkg') === '', valid('my_Edits.gpkg'));

// our own file opens again with nothing lost
await p.click('#dgClear');
n = await open('my_Edits.gpkg');
fs = await dg();
check('reopened: 5 shapes in their layers', fs.length === 5 && fs.map(f => f.layer).join() === 'points,glaciers,glaciers,stakes,stakes', n);
check('reopened point keeps its name and shape', fs[0].name === 'Point 1' && fs[0].shape === 'point' && fs[1].attrs.code === 7, fs[0]);
await p.$eval('#dgName', e => { e.value = 'roundTrip'; });
await p.select('#dgCrs', '4326');
await p.click('#dgSave'); await sleep(2500);
const R = ogr('roundTrip.gpkg');
check('saved again, in EPSG:4326', R.glaciers.features[1].properties.name === 'Glacier B renamed' && R.stakes.geometryFields[0].coordinateSystem.projjson.id.code === 4326
  && R.points.features.length === 1 && valid('roundTrip.gpkg') === '', Object.keys(R));
await p.select('#dgCrs', 'map');

// refusals: too many points, too big a file, not a GeoPackage; the list stays as it was
for (const [f, re] of [['tooBig.gpkg', /too large to open here \(over 250,000 points/], ['huge.gpkg', /too large to open here \(51 MB; the limit is 50 MB\)/], ['notGpkg.gpkg', /not a GeoPackage/]]) {
  n = await open(f);
  check(`${f} refused with a message`, n.startsWith(`Could not open ${f}: `) && re.test(n) && (await dg()).length === 5, n);
}
await shot(p, 'gpkgOpen');

// a file in the other hemisphere goes with the Antarctic map
await p.click('#dgClear');
n = await open('antarctic.gpkg');
check('south shapes go to the Antarctic map', /1 shape is in the south/.test(n) && (await dg()).length === 0, n);
await p.click('#hemS'); await sleep(3000);
fs = await dg();
check('there on the Antarctic map, in EPSG:3031', fs.length === 1 && fs[0].name === 'Pine Island box' && Math.abs(fs[0].coords[0][0][0] + 1600000) < 1e-6, fs);
await finish(browser);
