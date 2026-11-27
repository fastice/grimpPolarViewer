// On a phone the outline and GeoPackage pickers take any file (phones grey out .gpkg, .geojson and .gpx, whose
// types they do not know); a desktop keeps the file-type filters.
import { openViewer, catalogs, check, finish } from './lib.mjs';

const accept = p => p.evaluate(() => ['olFile', 'dgFile', 'tsFile'].map(id => document.getElementById(id).getAttribute('accept')));
let { browser, page: p } = await openViewer(catalogs.glAnnual, { width: 390, height: 844, mobile: true });
let a = await accept(p);
check('phone: outline and GeoPackage pickers take any file (the CSV one keeps its filter)', a[0] === null && a[1] === null && /csv/.test(a[2]), a);
await browser.close();
({ browser, page: p } = await openViewer(catalogs.glAnnual));
a = await accept(p);
check('desktop: file-type filters kept', /gpx/.test(a[0]) && /gpkg/.test(a[1]), a);
await finish(browser);
