// Your own outlines: GeoJSON (lon/lat and polar stereographic metres) and KML, picked with Add outlines or
// dropped on the map, listed with Zoom and remove; they follow a change of hemisphere.
import { openViewer, catalogs, check, toMap, shot, sleep, finish } from './lib.mjs';

const fx = n => new URL(`./fixtures/${n}`, import.meta.url).pathname;
const { browser, page: p } = await openViewer(catalogs.glAnnual);
const st = () => p.evaluate(() => { const l = window.grimpViewer.map.getLayers().getArray().filter(l => l.getZIndex() === 5 && l.getSource()?.getFeatures)
  .find(l => l.getSource().getFeatures().some(f => f.get('name') !== undefined && f.get('year') === undefined));
  return { n: l ? l.getSource().getFeatures().length : 0, list: [...document.querySelectorAll('#olList li')].map(li => li.textContent),
    ext: l ? l.getSource().getExtent().map(Math.round) : null, center: window.grimpViewer.map.getView().getCenter().map(Math.round) }; });

const input = await p.$('#olFile');
await input.uploadFile(fx('jakobshavnBox.geojson')); await sleep(1500);
let s = await st();
check('GeoJSON (lon/lat) loaded and listed', s.n === 2 && /jakobshavnBox\.geojson \(2 features\)/.test(s.list[0]), s);
const J = (await toMap(p, -49.6, 69.17)).map(Math.round);
check('the map zooms to it', Math.hypot(s.center[0] - J[0], s.center[1] - J[1]) < 15e3, { center: s.center, J });

// drop a metre-coordinate GeoJSON (no crs) on the map
await p.evaluate(async text => { const dt = new DataTransfer(); dt.items.add(new File([text], 'jakobshavnLine3413.geojson', { type: 'application/geo+json' }));
  window.grimpViewer.map.getViewport().dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); },
  (await import('fs')).readFileSync(fx('jakobshavnLine3413.geojson'), 'utf8'));
await sleep(1500);
s = await st();
const line = await p.evaluate(() => window.grimpViewer.map.getLayers().getArray().flatMap(l => l.getSource?.()?.getFeatures?.() || []).find(f => f.get('name') === 'gate').getGeometry().getCoordinates());
check('dropped GeoJSON in metres stays in metres (polar stereographic)', s.n === 3 && line[0][0] === -180000 && line[0][1] === -2285000, { n: s.n, line });
await shot(p, 'outlinesJakobshavn');

await input.uploadFile(fx('helheimTrack.kml')); await sleep(1500);
s = await st();
const H = (await toMap(p, -38.1, 66.39)).map(Math.round);
check('KML loaded, listed, zoomed to', s.n === 4 && s.list.length === 3 && Math.hypot(s.center[0] - H[0], s.center[1] - H[1]) < 15e3, s);

await p.evaluate(() => [...document.querySelectorAll('#olList li')].find(li => li.textContent.includes('jakobshavnBox')).querySelector('button[aria-label]').click());
await sleep(300);
s = await st();
check('x removes that file only', s.n === 2 && s.list.length === 2 && !s.list.some(t => t.includes('jakobshavnBox')), s);
await p.evaluate(() => [...document.querySelectorAll('#olList li')][0].querySelector('button').click()); await sleep(800);
const L = [-180000, -2273500];  // the metre line's midpoint
s = await st();
check('Zoom goes back to a listed file', Math.hypot(s.center[0] - L[0], s.center[1] - L[1]) < 100, { center: s.center, L });

// bad file: a status message, nothing added
await p.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(['not json'], 'bad.geojson'));
  window.grimpViewer.map.getViewport().dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); });
await sleep(500);
check('an unreadable file is reported, not added', /Could not read bad\.geojson/.test(await p.$eval('#status', e => e.textContent)) && (await st()).list.length === 2, await p.$eval('#status', e => e.textContent));
await finish(browser);
