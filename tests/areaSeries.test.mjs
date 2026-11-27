// Speed over time inside a shape (Greenland annual): a Digitize rectangle near Jakobshavn and an opened
// multi-part polygon with a hole are added to Time series at points with their plot buttons; every date's
// value is the mean of the pixels inside, matching GDAL's own rasterization of the same shape on the same
// overview grid; the CSV carries the shape columns; the outline is drawn in the series color.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, text, sleep, shot, finish } from './lib.mjs';

const out = new URL('./out/', import.meta.url).pathname;
execFileSync('python3', [new URL('./makeGpkgFixtures.py', import.meta.url).pathname, out]);
const { browser, page: p } = await openViewer(catalogs.glAnnual);
await zoomTo(p, await toMap(p, -49.4, 69.15), 60e3);
const cdp = await p.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: out });
await p.$eval('#dgSec', e => { e.open = true; e.scrollIntoView(); });
const clickAt = async ll => { const q = await toPixel(p, await toMap(p, ...ll)); await p.mouse.click(q[0], q[1]); await sleep(250); };
await p.click('#dgRect'); await clickAt([-49.6, 69.1]); await clickAt([-49.2, 69.22]); await p.click('#dgRect');
check('a polygon row has a plot button, a point row none', (await p.$$('#dgList li:first-child .dgPlot')).length === 1);
const series = () => p.evaluate(() => window.grimpViewer.ts().tsPoints.map(q => ({ n: q.n, label: q.label, area: !!q.area,
  values: q.values.map(x => ({ href: x.it.assets.vv.href, v: x.v, e: x.e, s: x.s })) })));
const done = () => p.waitForFunction(() => document.getElementById('tsProg').hidden && /dates in/.test(document.getElementById('tsNote').textContent), { timeout: 180000 });
await p.click('#dgList li:first-child .dgPlot'); await done();
let s = await series();
check('the rectangle is series 1, a shape, named after it', s.length === 1 && s[0].area && s[0].label === 'Rectangle 1' && /series 1/.test(await text(p, 'dgNote')), s.map(q => [q.n, q.label]));
check('a mean and pixel count on every date, nearly all the shape covered', s[0].values.length === 11 && s[0].values.every(x => Number.isFinite(x.v) && x.s.n > 1000 && x.s.cov > 0.9),
  s[0].values.map(x => [x.v, x.s?.n, x.s?.cov]));
await p.$eval('#tsErr', e => e.click()); await sleep(300); await done();
s = await series();
check('Error bars: the mean pixel error on every date', s[0].values.every(x => x.e > 0 && x.e < x.v / 2), s[0].values.map(x => x.e));

// an opened multi-part polygon with a hole (UTM 22N) as series 2
await (await p.$('#dgFile')).uploadFile(out + 'foreign.gpkg');
await p.waitForFunction(() => /^Opened/.test(document.getElementById('dgNote').textContent), { timeout: 30000 });
await p.$$eval('#dgList li', lis => lis.find(li => li.querySelector('input').value === 'Glacier A').querySelector('.dgPlot').click()); await done();
s = await series();
check('the multi-part shape is series 2', s.length === 2 && s[1].label === 'Glacier A' && s[1].values.every(x => x.s.n > 100), s[1].values.map(x => x.s?.n));

// GDAL: the same shapes rasterized (pixel centers inside) on the overview grid the viewer read, first and last dates
const shapes = await p.evaluate(() => window.grimpViewer.ts().tsPoints.map(q => q.area.geom.getType() === 'Polygon' ? [q.area.geom.getCoordinates()] : q.area.geom.getCoordinates()));
const want = JSON.parse(execFileSync('python3', ['-c', `
import json, sys, math
import numpy as np
from osgeo import gdal, ogr, osr
gdal.UseExceptions()
gdal.SetConfigOption('GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR')
shapes, jobs = json.loads(sys.argv[1]), json.loads(sys.argv[2])
srs = osr.SpatialReference(); srs.ImportFromEPSG(3413)
out = []
for k, href, res in jobs:
    ds = gdal.Open('/vsicurl/' + href); gt = ds.GetGeoTransform(); b = ds.GetRasterBand(1)
    full = gt[1]; lv = [(b, full)] + [(b.GetOverview(i), full * ds.RasterXSize / b.GetOverview(i).XSize) for i in range(b.GetOverviewCount())]
    band, r = min(lv, key=lambda l: abs(l[1] - res))
    geom = ogr.CreateGeometryFromJson(json.dumps({'type': 'MultiPolygon', 'coordinates': shapes[k]}))
    x0, x1, y0, y1 = geom.GetEnvelope()
    c0, r0 = max(0, math.floor((x0 - gt[0]) / r)), max(0, math.floor((gt[3] - y1) / r))
    c1, r1 = min(band.XSize, math.ceil((x1 - gt[0]) / r)), min(band.YSize, math.ceil((gt[3] - y0) / r))
    vals = band.ReadAsArray(c0, r0, c1 - c0, r1 - r0).astype(float)
    mem = gdal.GetDriverByName('MEM').Create('', c1 - c0, r1 - r0, 1, gdal.GDT_Byte)
    mem.SetGeoTransform((gt[0] + c0 * r, r, 0, gt[3] - r0 * r, 0, -r)); mem.SetProjection(srs.ExportToWkt())
    vds = ogr.GetDriverByName('Memory').CreateDataSource(''); lyr = vds.CreateLayer('s', srs)
    f = ogr.Feature(lyr.GetLayerDefn()); f.SetGeometry(geom); lyr.CreateFeature(f)
    gdal.RasterizeLayer(mem, [1], lyr, burn_values=[1])
    m = mem.ReadAsArray() == 1
    nd = band.GetNoDataValue()
    ok = m & np.isfinite(vals) & (vals != nd if nd is not None else True)
    out.append([float(vals[ok].mean()), int(ok.sum())])
print(json.dumps(out))`, JSON.stringify(shapes), JSON.stringify(s.flatMap((q, k) => [0, 10].map(j => [k, q.values[j].href, q.values[j].s.res])))], { encoding: 'utf8' }));
const ours = s.flatMap(q => [0, 10].map(j => [q.values[j].v, q.values[j].s.n]));
check('means and pixel counts match GDAL', ours.every(([v, n], k) => Math.abs(v - want[k][0]) / want[k][0] < 1e-6 && n === want[k][1]), { ours, want });

// the CSV has the shape columns
const csv = out + 'nsidc-0725-v6_vv_points.csv';
if (existsSync(csv)) unlinkSync(csv);
await p.$eval('#tsCsv', e => e.click()); await sleep(1500);
const rows = readFileSync(csv, 'utf8').trim().split('\n').map(r => r.split(','));
const h = rows[0], col = n => h.indexOf(n);
check('CSV: area, median, pixels, coverage and pixel size per date', ['area_km2', 'median', 'pixels', 'coverage', 'pixel_m'].every(n => col(n) > 0) && rows.length === 23
  && rows.slice(1).every(r => +r[col('pixels')] > 100 && +r[col('area_km2')] > 1), h);
check('outline drawn in the series color', await p.evaluate(() => window.grimpViewer.map.getLayers().getArray().some(l => l.getSource?.()?.getFeatures?.().some(f => f.getGeometry().getType() === 'MultiPolygon' && f.get('n') === 2))));
await shot(p, 'areaSeries');
await finish(browser);
