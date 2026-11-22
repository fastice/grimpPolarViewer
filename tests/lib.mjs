// Shared helpers for the viewer tests: open the test build on a catalog, place things on the map by
// lon/lat, and record checks (the process exits 1 if any fails).
import puppeteer from 'puppeteer-core';

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const kopah = 'https://s3.kopah.uw.edu/ianj-grimp/public/';
export const catalogs = {
  glAnnual: kopah + 'nsidc-0725/v06/nsidc-0725.parquet',
  glMonthly: kopah + 'nsidc-0731/v06/nsidc-0731.parquet',
  aseAnnual: kopah + 'pig/annual/ase-annual.parquet',
};
const out = new URL('./out/', import.meta.url).pathname;
let failures = 0;

export function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail === '' ? '' : ': ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))}`);
  if (!ok) failures++;
}

// Open the viewer on a catalog and wait for its first product. Page errors count as failures.
export async function openViewer(catalog, { width = 1400, height = 900, mobile = false } = {}) {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  page.on('pageerror', e => check('no page errors', false, e.message));
  await page.setViewport({ width, height, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 3 : 1 });
  await page.goto(`http://127.0.0.1:${process.env.PORT || 8767}/index.html?href=${catalog}`, { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(() => /items/.test(document.getElementById('status').textContent) && document.getElementById('lname').textContent, { timeout: 120000 });
  return { browser, page };
}

// Map coordinates of a lon/lat in the viewer's projection.
export const toMap = (page, lon, lat) => page.evaluate((lon, lat) => ol.proj.fromLonLat([lon, lat], window.grimpViewer.map.getView().getProjection()), lon, lat);

// Page pixel of a map coordinate.
export const toPixel = (page, c) => page.evaluate(c => { const m = window.grimpViewer.map, r = m.getTargetElement().getBoundingClientRect(), x = m.getPixelFromCoordinate(c); return [r.x + x[0], r.y + x[1]]; }, c);

// Fit the map to a box (map coordinates) around a center, half sizes hx, hy (m).
export async function zoomTo(page, c, hx, hy = hx) {
  await page.evaluate((c, hx, hy) => { const m = window.grimpViewer.map; m.getView().fit([c[0] - hx, c[1] - hy, c[0] + hx, c[1] + hy], { size: m.getSize() }); }, c, hx, hy);
  await sleep(2000);
}

// Page pixel of the center of a canvas legend hit box.
export const hitCenter = (page, canvasId, h) => page.evaluate((id, h) => { const r = document.getElementById(id).getBoundingClientRect(); return [r.left + h.x + h.w / 2, r.top + h.y + h.h / 2]; }, canvasId, h);

// Drag an element's center to a fraction f of its parent track's width.
export async function dragTo(page, id, f) {
  const [h, t] = await page.evaluate(id => { const h = document.getElementById(id).getBoundingClientRect(), t = document.getElementById(id).parentElement.getBoundingClientRect(); return [[h.x + h.width / 2, h.y + h.height / 2], [t.x, t.width]]; }, id);
  await page.mouse.move(h[0], h[1]); await page.mouse.down(); await page.mouse.move(t[0] + f * t[1], h[1], { steps: 5 }); await page.mouse.up(); await sleep(200);
}

// Drag a range input's handle (thumbW px wide) from its value to value v with the mouse.
export async function dragRange(page, id, v, thumbW = 16) {
  const [x0, x1, y] = await page.evaluate((id, v, w) => { const e = document.getElementById(id); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect();
    const at = u => r.left + w / 2 + ((u - e.min) / (e.max - e.min)) * (r.width - w); return [at(+e.value), at(v), r.top + r.height / 2]; }, id, v, thumbW);
  await page.mouse.move(x0, y); await page.mouse.down(); await page.mouse.move(x1, y, { steps: 8 }); await page.mouse.up(); await sleep(200);
}
export const text = (page, id) => page.$eval('#' + id, e => e.textContent);
export const hidden = (page, id) => page.$eval('#' + id, e => e.hidden);
export const shot = (page, name) => page.screenshot({ path: out + name + '.jpg', type: 'jpeg', quality: 80 });

export async function finish(browser) {
  await browser.close();
  console.log(failures ? `${failures} check(s) failed` : 'passed');
  process.exit(failures ? 1 : 0);
}
