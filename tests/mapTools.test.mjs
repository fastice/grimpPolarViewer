// Map tools (Greenland annual): Go to zooms to a glacier; Measure gives the true length of a drawn line
// (checked against Vincenty's ellipsoidal distance) and the true area of a polygon (against OpenLayers'
// spherical area), and both can be edited (move, add and delete points, relabeled as they change); Share's Embed copies an iframe of the view, and ?embed=1 opens the map alone with a
// link to the full viewer.
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, text, hidden, shot, sleep, finish } from './lib.mjs';

// Vincenty's inverse formula on WGS84: geodesic distance in m between [lon, lat] points (degrees).
function vincenty([L1, B1], [L2, B2]) {
  const a = 6378137, f = 1 / 298.257223563, b = a * (1 - f), r = Math.PI / 180;
  const U1 = Math.atan((1 - f) * Math.tan(B1 * r)), U2 = Math.atan((1 - f) * Math.tan(B2 * r)), L = (L2 - L1) * r;
  let lam = L, sinS, cosS, sig, cos2a, cos2sm;
  for (let k = 0; k < 200; k++) {
    const sl = Math.sin(lam), cl = Math.cos(lam);
    sinS = Math.hypot(Math.cos(U2) * sl, Math.cos(U1) * Math.sin(U2) - Math.sin(U1) * Math.cos(U2) * cl);
    cosS = Math.sin(U1) * Math.sin(U2) + Math.cos(U1) * Math.cos(U2) * cl; sig = Math.atan2(sinS, cosS);
    const sina = Math.cos(U1) * Math.cos(U2) * sl / sinS; cos2a = 1 - sina * sina; cos2sm = cosS - 2 * Math.sin(U1) * Math.sin(U2) / cos2a;
    const C = f / 16 * cos2a * (4 + f * (4 - 3 * cos2a)), prev = lam;
    lam = L + (1 - C) * f * sina * (sig + C * sinS * (cos2sm + C * cosS * (-1 + 2 * cos2sm * cos2sm)));
    if (Math.abs(lam - prev) < 1e-13) break;
  }
  const u2 = cos2a * (a * a - b * b) / (b * b), A = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2))), B = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const dS = B * sinS * (cos2sm + B / 4 * (cosS * (-1 + 2 * cos2sm * cos2sm) - B / 6 * cos2sm * (-3 + 4 * sinS * sinS) * (-3 + 4 * cos2sm * cos2sm)));
  return b * A * (sig - dS);
}

const { browser, page: p } = await openViewer(catalogs.glAnnual);

// Go to
const helheim = await p.$$eval('#goTo option', o => o.findIndex(x => /Helheim/.test(x.textContent)));
check('Go to lists Greenland glaciers', helheim > 0 && (await p.$$eval('#goTo option', o => o.length)) >= 8);
await p.select('#goTo', String(helheim - 1)); await sleep(900);
const at = await p.evaluate(() => { const c = window.grimpViewer.map.getView().getCenter(), [lon, lat] = ol.proj.toLonLat(c, window.grimpViewer.viewCode()); return { lon, lat, res: window.grimpViewer.map.getView().getResolution() }; });
check('Go to Helheim centers the map there', Math.abs(at.lon + 38.3067) < 0.05 && Math.abs(at.lat - 66.3735) < 0.02 && at.res < 200, at);
check('the menu resets after a pick', (await p.$eval('#goTo', e => e.value)) === '');

// Measure: a two-segment line and a four-corner polygon near Jakobshavn
await zoomTo(p, await toMap(p, -49.4, 69.15), 60e3);
await p.$eval('#msSec', e => { e.open = true; e.scrollIntoView(); });
await p.click('#msDist');
const pts = [[-49.9, 69.05], [-49.3, 69.25], [-48.8, 69.1]];
for (const [k, ll] of pts.entries()) {  // a double-click on the last point ends the line
  const px = await toPixel(p, await toMap(p, ...ll));
  await p.mouse.click(px[0], px[1]);
  if (k === pts.length - 1) await p.mouse.click(px[0], px[1], { clickCount: 2 });
  await sleep(250);
}
await sleep(800);
let ms = await p.evaluate(() => window.grimpViewer.ms());
const line = ms.find(m => m.type === 'LineString');
const ll = line && await p.evaluate(cs => cs.map(c => ol.proj.toLonLat(c, window.grimpViewer.viewCode())), line.coords);
const ref = ll && ll.slice(1).reduce((s, q, k) => s + vincenty(ll[k], q), 0);
const got = line && parseFloat(line.label) * 1000;
check('distance: true length matches Vincenty within 0.05%', line && Math.abs(got - ref) / ref < 5e-4, { label: line?.label, vincentyKm: ref / 1000, vertices: line?.coords.length });
check('distance note gives the map length too', /km \(.* km on the map\)/.test(await text(p, 'msNote')), await text(p, 'msNote'));

// edit the line: drag its middle point, drag a side to add a point, double-click a point to delete it
const msLine = () => p.evaluate(() => window.grimpViewer.ms().find(m => m.type === 'LineString'));
const pix = c => p.evaluate(c => { const m = window.grimpViewer.map, r = m.getTargetElement().getBoundingClientRect(), x = m.getPixelFromCoordinate(c); return [r.x + x[0], r.y + x[1]]; }, c);
const drag = async (a, b) => { await p.mouse.move(a[0], a[1]); await p.mouse.down(); await p.mouse.move(b[0], b[1], { steps: 8 }); await p.mouse.up(); await sleep(500); };
let l0 = await msLine(), mid = await pix(l0.coords[1]);
await drag(mid, [mid[0], mid[1] + 60]);
let l1 = await msLine();
const llOf = cs => p.evaluate(cs => cs.map(c => ol.proj.toLonLat(c, window.grimpViewer.viewCode())), cs), lenOf = ll => ll.slice(1).reduce((s, q, k) => s + vincenty(ll[k], q), 0);
let v1 = lenOf(await llOf(l1.coords));
check('dragging a point moves it and relabels the line', l1.coords.length === 3 && Math.abs(l1.coords[1][1] - l0.coords[1][1]) > 1000 && l1.label !== l0.label
  && Math.abs(parseFloat(l1.label) * 1000 - v1) / v1 < 5e-4, { before: l0.label, after: l1.label, vincentyKm: v1 / 1000 });
const s0 = await pix(l1.coords[0]), s1 = await pix(l1.coords[1]), half = [(s0[0] + s1[0]) / 2, (s0[1] + s1[1]) / 2];
await drag(half, [half[0] - 40, half[1] + 40]);
let l2 = await msLine();
check('dragging a side adds a point there', l2.coords.length === 4 && l2.label !== l1.label, { n: l2.coords.length, label: l2.label });
const z0 = await p.evaluate(() => window.grimpViewer.map.getView().getZoom());
const del = await pix(l2.coords[1]);
await p.mouse.click(del[0], del[1], { clickCount: 1 }); await p.mouse.click(del[0], del[1], { clickCount: 2 }); await sleep(700);
let l3 = await msLine();
check('double-clicking a point deletes it, without zooming', l3.coords.length === 3 && Math.abs(await p.evaluate(() => window.grimpViewer.map.getView().getZoom()) - z0) < 1e-6, { n: l3.coords.length, label: l3.label });
const k0 = await pix(l3.coords[1]);
await p.keyboard.down('Alt'); await p.mouse.click(k0[0], k0[1]); await p.keyboard.up('Alt'); await sleep(500);
check('Alt-click deletes a point too', (await msLine()).coords.length === 2);
const k1 = await pix((await msLine()).coords[1]);
await p.keyboard.down('Alt'); await p.mouse.click(k1[0], k1[1]); await p.keyboard.up('Alt'); await sleep(500);
check('a line keeps at least two points', (await msLine()).coords.length === 2);

await p.click('#msArea');
const box = [[-49.8, 69.0], [-49.0, 69.0], [-49.0, 69.3], [-49.8, 69.3]];
for (const c of box) { const px = await toPixel(p, await toMap(p, ...c)); await p.mouse.click(px[0], px[1]); await sleep(250); }
const p0 = await toPixel(p, await toMap(p, ...box[0])); await p.mouse.click(p0[0], p0[1]); await sleep(800);
ms = await p.evaluate(() => window.grimpViewer.ms());
const poly = ms.find(m => m.type === 'Polygon');
const sph = poly && await p.evaluate(cs => ol.sphere.getArea(new ol.geom.Polygon(cs), { projection: window.grimpViewer.viewCode() }) / 1e6, poly.coords);
const area = poly && parseFloat(poly.label.replace(/,/g, ''));
check('area: true area within 1% of the spherical area', poly && Math.abs(area - sph) / sph < 0.01, { label: poly?.label, sphericalKm2: sph });
// edit the area: drag a corner out, and it is relabeled
const poly0 = poly, c0 = await pix(poly0.coords[0][2]);
await drag(c0, [c0[0] + 50, c0[1] - 50]);
const poly1 = (await p.evaluate(() => window.grimpViewer.ms())).find(m => m.type === 'Polygon');
check('dragging a corner relabels the area', parseFloat(poly1.label.replace(/,/g, '')) > area, { before: poly0.label, after: poly1.label });
check('two measurements listed and Clear shown', ms.length === 2 && (await text(p, 'msCount')) === '(2)' && !(await hidden(p, 'msClear')));
await shot(p, 'measure');
await p.click('#msClear'); await sleep(200);
check('Clear removes them', (await p.evaluate(() => window.grimpViewer.ms())).length === 0 && await hidden(p, 'msClear'));

// Embed: the iframe code, and the page it opens
const origin = new URL(p.url()).origin;
await browser.defaultBrowserContext().overridePermissions(origin, ['clipboard-read', 'clipboard-write']);
await p.bringToFront();
await p.click('#shareEmbed'); await sleep(400);
const note = await text(p, 'shareNote');  // the code itself when the clipboard is not allowed
const code = /^Embed code: /.test(note) ? note.replace(/^Embed code: /, '') : await p.evaluate(() => navigator.clipboard.readText());
const src = (code.match(/src="([^"]+)"/) || [])[1]?.replace(/&amp;/g, '&');
check('Embed gives an iframe of the view with embed=1', /^<iframe /.test(code) && src && new URL(src).searchParams.get('embed') === '1', { note, code: code.slice(0, 160) });
if (!src) { await finish(browser); }
check('the address bar keeps the plain link', !(await p.evaluate(() => location.search)).includes('embed'));
const q = await browser.newPage();
q.on('pageerror', e => check('no page errors (embed)', false, e.message));
await q.setViewport({ width: 900, height: 600 });
await q.goto(src, { waitUntil: 'networkidle2', timeout: 120000 });
await q.waitForFunction(() => /items/.test(document.getElementById('status').textContent), { timeout: 120000 });
const e = await q.evaluate(() => ({ nopanel: document.body.classList.contains('nopanel'), toggle: getComputedStyle(document.getElementById('panelToggle')).display,
  open: !document.getElementById('embedOpen').hidden, href: document.getElementById('embedOpen').href, mapW: document.getElementById('map').getBoundingClientRect().width }));
check('embed mode: map alone, no panel toggle, link to the full viewer', e.nopanel && e.toggle === 'none' && e.open && !new URL(e.href).searchParams.has('embed') && e.mapW > 880, e);
await q.screenshot({ path: new URL('./out/embed.jpg', import.meta.url).pathname, type: 'jpeg', quality: 80 });
await finish(browser);
