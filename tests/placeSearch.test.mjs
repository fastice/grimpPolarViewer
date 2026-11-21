// Place search (Greenland): old and foreign names find the official one, accents are ignored, arrow keys and
// Enter pick a result, the map zooms to it with a marker; Antarctica searches the SCAR gazetteer selection.
import { openViewer, catalogs, check, toMap, text, hidden, shot, sleep, finish } from './lib.mjs';

let { browser, page: p } = await openViewer(catalogs.glAnnual);
const results = () => p.$$eval('#searchResults li', l => l.map(x => x.textContent));
const type = async q => { await p.click('#searchBox', { clickCount: 3 }); await p.keyboard.press('Backspace'); await p.type('#searchBox', q); await sleep(600); return results(); };
let r = await type('jakobshavn');
check('"jakobshavn" finds Sermeq Kujalleq first', /^Sermeq Kujalleq Jakobshavn Isbræ/.test(r[0] || ''), r.slice(0, 3));
r = await type('isbrae');
check('accents ignored: "isbrae" matches Isbræ names', r.length > 0 && r.every(x => /isbræ/i.test(x)), r.slice(0, 3));
r = await type('helheim');
check('"helheim" finds Helheim Gletsjer', /^Helheim Gletsjer/.test(r[0] || ''), r);
r = await type('sermeq');
check('"sermeq" lists 8, exact names first, the major one (Upernavik) leading', r.length === 8 && /^Sermeq Upernavik Isstrøm/.test(r[0]), r.slice(0, 3));
await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await sleep(1200);
const picked = await p.$eval('#searchBox', e => e.value);
check('arrow and Enter pick the second result', picked && r[1].startsWith(picked), { picked, second: r[1] });

r = await type('petermann');
await p.keyboard.press('Enter'); await sleep(1200);
const v = await p.evaluate(() => { const m = window.grimpViewer.map, v = m.getView(), l = m.getLayers().getArray().find(l => l.getZIndex() === 8);
  return { center: v.getCenter().map(Math.round), res: Math.round(v.getResolution()), marker: l.getSource().getFeatures().map(f => f.get('label')) }; });
const P = (await toMap(p, -60.05, 80.5833)).map(Math.round);
check('Enter zooms to Petermann with a marker', Math.hypot(v.center[0] - P[0], v.center[1] - P[1]) < 500 && v.res <= 150 && v.marker[0] === 'Petermann Gletsjer', { v, P });
check('results close after picking', await hidden(p, 'searchResults'));
await shot(p, 'placeSearchPetermann');
await p.click('#searchClear'); await sleep(200);
check('the clear button removes the marker', await p.evaluate(() => window.grimpViewer.map.getLayers().getArray().find(l => l.getZIndex() === 8).getSource().getFeatures().length === 0));
r = await type('zzzz');
check('no match says so', r.join() === 'No match', r);
await browser.close();

({ browser, page: p } = await openViewer(catalogs.aseAnnual));
r = await type('pine island');
check('Antarctica: "pine island" finds the glacier first', /^Pine Island Glacier glacier/.test(r[0] || ''), r.slice(0, 3));
r = await type('thwaites');
check('"thwaites" finds Thwaites Glacier', /^Thwaites Glacier/.test(r[0] || ''), r.slice(0, 3));
await p.keyboard.press('Enter'); await sleep(1200);
const t = await p.evaluate(() => { const m = window.grimpViewer.map; return { c: m.getView().getCenter().map(Math.round), marker: m.getLayers().getArray().find(l => l.getZIndex() === 8).getSource().getFeatures().map(f => f.get('label')) }; });
const T = (await toMap(p, -106.75, -75.5)).map(Math.round);
check('Enter zooms to Thwaites with a marker', Math.hypot(t.c[0] - T[0], t.c[1] - T[1]) < 500 && t.marker[0] === 'Thwaites Glacier', { t, T });
await shot(p, 'placeSearchThwaites');
r = await type('mcmurdo');
check('"mcmurdo" lists the station, ice shelf and sound', ['McMurdo Station', 'McMurdo Ice Shelf', 'McMurdo Sound'].every(n => r.some(x => x.startsWith(n))), r);
await finish(browser);
