import { parquetReadObjects } from 'https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/+esm';
import { compressors } from 'https://cdn.jsdelivr.net/npm/hyparquet-compressors@1.1.2/+esm';

// [title, catalog URL, hemisphere]; the Collections menu lists only the selected hemisphere.
const presets = [
  ['Greenland S1 backscatter (uncalibrated, 2020-Aug 2026)', 'https://s3.kopah.uw.edu/ianj-grimp/public/nsidc-0723/v04/nsidc-0723.parquet', 'N'],
  ['NSIDC-0723 S1 backscatter mosaics (gaia)', 'https://s3.kopah.uw.edu/gaia/public/grimp/nsidc-0723/v04/nsidc-0723.parquet', 'N'],
  ['NSIDC-0725 annual velocity v6 (2015-2025)', 'https://s3.kopah.uw.edu/ianj-grimp/public/nsidc-0725/v06/nsidc-0725.parquet', 'N'],
  ['NSIDC-0727 quarterly velocity v6 (2015-2026)', 'https://s3.kopah.uw.edu/ianj-grimp/public/nsidc-0727/v06/nsidc-0727.parquet', 'N'],
  ['NSIDC-0731 monthly velocity v6 (2015-2026)', 'https://s3.kopah.uw.edu/ianj-grimp/public/nsidc-0731/v06/nsidc-0731.parquet', 'N'],
  ['NSIDC-0766 6/12-day velocity v3 (2015-2026)', 'https://s3.kopah.uw.edu/ianj-grimp/public/nsidc-0766/v03/nsidc-0766.parquet', 'N'],
  ['NSIDC-0481 TSX glacier site velocity v5 (2008-2026)', 'https://s3.kopah.uw.edu/ianj-grimp/public/nsidc-0481/v05/nsidc-0481.parquet', 'N'],
  ['NSIDC-0715 GrIMP DEM v2, 30 m (2008-2020 imagery)', 'https://s3.kopah.uw.edu/ianj-grimp/public/nsidc-0715/v02/nsidc-0715.parquet', 'N'],
  ['NSIDC-0714 GIMP land ice / ocean mask, 15 m (2000, 2015, 2020)', 'https://s3.kopah.uw.edu/ianj-grimp/public/nsidc-0714/v01/nsidc-0714.parquet', 'N'],
  ['Antarctica NISAR gamma0 25 m (Aug-Sep 2026)', 'https://s3.kopah.uw.edu/ianj-grimp/public/display/nisar-gcov-ant-25m.parquet', 'S'],
  ['Amundsen Sea (PIG) S1 quarterly velocity (2015-2026)', 'https://s3.kopah.uw.edu/ianj-grimp/public/pig/quarterly/ase-quarterly.parquet', 'S'],
  ['Amundsen Sea (PIG) S1 annual velocity (2015-2026)', 'https://s3.kopah.uw.edu/ianj-grimp/public/pig/annual/ase-annual.parquet', 'S'],
  ['Amundsen Sea (PIG) S1 backscatter (uncalibrated, 2015-Feb 2026)', 'https://s3.kopah.uw.edu/ianj-grimp/public/pig/backscatter/v04/ase-backscatter.parquet', 'S'],
];
let hemi = 'N';
// Go to: well-known glaciers and regions per hemisphere [name, lon, lat, half-width of the view in km]. The
// points are those of the glacier-name list (Greenland) and the SCAR gazetteer (Antarctica).
const goToPlaces = {
  N: [['Whole ice sheet', -42, 72, 1300], ['Jakobshavn Isbræ (Sermeq Kujalleq)', -49.8, 69.1833, 45], ['Helheim Gletsjer', -38.3067, 66.3735, 35],
      ['Kangerlussuaq Gletsjer', -33.076, 68.6746, 35], ['Kangiata Nunaata Sermia', -49.6102, 64.2966, 35], ['Upernavik Isstrøm', -54.2837, 72.8409, 40],
      ['Humboldt Gletsjer', -63.3957, 79.4462, 60], ['Petermann Gletsjer', -60.05, 80.5833, 60], ['79 North and Zachariae Isstrøm', -20.6, 79.25, 80]],
  S: [['Whole continent', 0, -90, 2800], ['Amundsen Sea Embayment', -105, -75.3, 250], ['Pine Island Glacier', -100, -75.1667, 80],
      ['Thwaites Glacier', -106.75, -75.5, 90], ['Getz Ice Shelf', -125, -74.25, 150], ['Totten Glacier', 116.3333, -67, 70],
      ['Denman Glacier', 99.5, -66.75, 70], ['Lambert Glacier and Amery Ice Shelf', 70.5, -70.5, 300], ['Byrd Glacier', 159, -80.3333, 70],
      ['Whillans Ice Stream', -145, -83.6667, 250], ['Recovery Glacier', -28, -81.1667, 200], ['Ross Ice Shelf', -175, -81.5, 550],
      ['Ronne Ice Shelf', -61, -78.5, 450]],
};

function setHemi(h) {
  hemi = h;
  $('hemN').setAttribute('aria-pressed', String(h === 'N'));
  $('hemS').setAttribute('aria-pressed', String(h === 'S'));
  $('preset').replaceChildren(new Option('Custom URL', ''),
    ...presets.map(([t, , ph], i) => [t, i, ph]).filter(([, , ph]) => ph === h).map(([t, i]) => new Option(t, String(i))));
  fillBackground(h);
  $('goTo').replaceChildren(new Option('Go to a glacier...', ''), ...goToPlaces[h].map(([name], i) => new Option(name, String(i))));
}
function pickHemi(h) {
  // Switching hemisphere opens that hemisphere's first collection.
  if (h === hemi) return;
  setHemi(h);
  const first = presets.find(p => p[2] === h);
  if (first) loadCatalog(first[1]);
}

// Polar stereographic grids; GIBS serves both on the same +/-4194304 m extent.
const projDefs = {
  'EPSG:3031': ['+proj=stere +lat_0=-90 +lat_ts=-71 +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs', 'epsg3031'],
  'EPSG:3413': ['+proj=stere +lat_0=90 +lat_ts=70 +lon_0=-45 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs', 'epsg3413'],
};
for (const [code, [def]] of Object.entries(projDefs)) proj4.defs(code, def);
ol.proj.proj4.register(proj4);
const gibsExtent = [-4194304, -4194304, 4194304, 4194304];
for (const code of Object.keys(projDefs)) ol.proj.get(code).setExtent(gibsExtent);

const $ = id => document.getElementById(id);
const num = v => typeof v === 'bigint' ? Number(v) : v;
const fmtDate = d => d.toISOString().slice(0, 10);

let items = [], dates = [], selected = null, viewCode = null;

const footStyle = new ol.style.Style({ stroke: new ol.style.Stroke({ color: 'rgba(31,111,159,0.9)', width: 1.2 }) });
const selStyle = new ol.style.Style({ stroke: new ol.style.Stroke({ color: '#e8a33d', width: 2.5 }) });
const footSource = new ol.source.Vector();
const pickStyle = new ol.style.Style({ stroke: new ol.style.Stroke({ color: '#b0306a', width: 2.2 }) });
const picks = new Set();  // items ticked for "Download selection"
const footLayer = new ol.layer.Vector({ source: footSource, zIndex: 3,
  style: f => f.get('item') === selected ? selStyle : picks.has(f.get('item')) ? pickStyle : footStyle });
const cmaps = {
  gray: ['#000000', '#ffffff'],
  viridis: ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'],
  magma: ['#000004', '#180f3d', '#440f76', '#721f81', '#9e2f7f', '#cd4071', '#f1605d', '#fd9668', '#feca8d', '#fcfdbf'],
  // The GrIMP browse images' colors (sampled from them), evenly spaced in log speed from 1 to 3000 m/yr: on a
  // log scale over that range, vv looks like the browse image.
  browse: ['#ffafa8', '#ffc9a7', '#ffeba6', '#ecffa3', '#c5ff9e', '#97ff97', '#88ffb7', '#71ffe2', '#48daff', '#056aff', '#0102ff', '#6500ff', '#ca00ff', '#ff00cd', '#ff0067', '#ff0005'],
  cividis: ['#00224e', '#123570', '#3b496c', '#575d6d', '#707173', '#8a8678', '#a59c74', '#c3b369', '#e1cc55', '#fee838'],
  // Diverging for signed velocity: blue negative, white exactly at 0 (middle stop), red positive.
  'blue-white-red': ['#053061', '#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#ffffff', '#fddbc7', '#f4a582', '#d6604d', '#b2182b', '#67001f'],
};
const hexRgba = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 1];
// the style variables: the color range, and on a log scale the values at lo (hi / lo)^(k / 32), k = 0-32
function styleVars(lo, hi, log) {
  if (!log) return { lo, hi };
  const l = lo > 0 ? lo : hi / 1000;
  return { lo, hi, ...Object.fromEntries(Array.from({ length: 33 }, (_, k) => [`k${k}`, l * (hi / l) ** (k / 32)])) };
}
function rasterStyle(stops, lo, hi, log = false) {
  // Normalize to 0-1 between lo and hi, then look up the color map; band 2 is the nodata mask. On a log scale
  // the colors at 0-1 positions k / 32 are placed at the values lo (hi / lo)^(k / 32) (styleVars), one ramp
  // straight on the value (the shaders have no log).
  let ramp;
  if (log) {
    const rgb = stops.map(hexRgba), n = stops.length - 1;
    ramp = ['interpolate', ['linear'], ['band', 1]];
    for (let k = 0; k <= 32; k++) {
      const t = k / 32 * n, i = Math.min(n - 1, Math.floor(t)), f = t - i;
      ramp.push(['var', `k${k}`], rgb[i].map((c, j) => j === 3 ? 1 : c + (rgb[i + 1][j] - c) * f));
    }
  } else {
    const t = ['clamp', ['/', ['-', ['band', 1], ['var', 'lo']], ['-', ['var', 'hi'], ['var', 'lo']]], 0, 1];
    ramp = ['interpolate', ['linear'], t];
    stops.forEach((c, i) => ramp.push(i / (stops.length - 1), hexRgba(c)));
  }
  return { variables: styleVars(lo, hi, log), color: ['case', ['==', ['band', 2], 0], [0, 0, 0, 0], ramp] };
}
let rawLo = 0, rawHi = 1, rgbMode = false, classMode = false, logScale = false;  // classMode: one band of classes
const rasterLayer = new ol.layer.WebGLTile({ zIndex: 2, style: rasterStyle(cmaps.gray, 0, 1) });
const baseLayer = new ol.layer.Tile({ zIndex: 0 });
// Background image: one product of an image (backscatter) collection, in gray between Blue Marble and the main layer.
const bgLayer = new ol.layer.WebGLTile({ zIndex: 1, visible: false, style: rasterStyle(cmaps.gray, 0, 1) });
const coastLayer = new ol.layer.Tile({ zIndex: 4 });
// Reset view (under the zoom buttons): zoom out to the collection's footprints in the time range.
const resetView = new ol.control.ZoomToExtent({ label: '\u2922', tipLabel: 'Reset view: zoom out to the whole collection' });
resetView.handleZoomToExtent = () => fitFootprints(250);
const map = new ol.Map({ target: 'map', layers: [baseLayer, bgLayer, rasterLayer, footLayer, coastLayer],
                         controls: ol.control.defaults.defaults({ attribution: false }).extend([new ol.control.ScaleLine({ target: 'mapfoot' }), resetView]) });

function gibs(code, layer, format) {
  return new ol.source.TileWMS({ url: `https://gibs.earthdata.nasa.gov/wms/${projDefs[code][1]}/best/wms.cgi`,
    params: { LAYERS: layer, FORMAT: format, TRANSPARENT: format === 'image/png', VERSION: '1.1.1' },
    projection: code, crossOrigin: 'anonymous' });
}

function setView(code) {
  if (code === viewCode) return;
  viewCode = code;
  map.setView(new ol.View({ projection: code, center: [0, 0], zoom: 2, maxZoom: 22, extent: gibsExtent, constrainOnlyCenter: true,
    enableRotation: false }));  // grid-up always: a phone pinch must not rotate the map (boxes are drawn on x/y)
  const polar = code in projDefs;
  baseLayer.setSource(polar ? gibs(code, 'BlueMarble_ShadedRelief_Bathymetry', 'image/jpeg') : new ol.source.OSM());
  // No GIBS coastline in Antarctica: it misplaces the grounding lines and ice fronts; Coastlines draws the
  // Boundaries grounding line and ice front there instead (coastVecLayer in boundaries.js).
  coastLayer.setSource(polar && code !== 'EPSG:3031' ? gibs(code, 'Coastlines', 'image/png') : null);
}

// Background image. The choice (collection and product) is kept per hemisphere for the browser session,
// so it is picked once rather than with every collection.
const bgPresets = h => presets.map((p, i) => [...p, i]).filter(([t, , ph]) => ph === h && /backscatter|gamma0/i.test(t));
const bgKey = h => `grimpBackground${h}`;
let bgItems = [], bgToken = 0;
function bgSaved(h) { try { return JSON.parse(sessionStorage.getItem(bgKey(h)) || 'null'); } catch (e) { return null; } }
function bgSave(h, v) { try { v ? sessionStorage.setItem(bgKey(h), JSON.stringify(v)) : sessionStorage.removeItem(bgKey(h)); } catch (e) { /* no storage */ } }
function fillBackground(h) {
  $('bgColl').replaceChildren(new Option('none (Blue Marble)', ''), ...bgPresets(h).map(([t, u]) => new Option(t, u)));
  const saved = bgSaved(h);
  $('bgColl').value = saved && bgPresets(h).some(p => p[1] === saved.href) ? saved.href : '';
  loadBackground($('bgColl').value, saved?.id);
}
async function loadBackground(href, wantId) {
  const token = ++bgToken;
  bgItems = [];
  $('bgItemRow').hidden = true; $('bgNote').hidden = true;
  bgLayer.setVisible(false); bgLayer.setSource(null);
  if (!href) return;
  $('bgNote').hidden = false; $('bgNote').textContent = 'Loading background catalog...';
  try {
    const resp = await fetch(href, { cache: 'no-cache' });  // revalidate: catalogs are replaced in place
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const rows = await parquetReadObjects({ file: await resp.arrayBuffer(), compressors });
    if (token !== bgToken) return;
    bgItems = rows.map(toItem).sort((a, b) => b.start - a.start);  // newest first
  } catch (e) {
    if (token === bgToken) $('bgNote').textContent = `Could not load the background catalog: ${e.message}`;
    return;
  }
  $('bgItem').replaceChildren(...bgItems.map((it, k) => new Option(`${fmtDate(new Date(it.start))} to ${fmtDate(new Date(it.end))}`, String(k))));
  const k = Math.max(0, bgItems.findIndex(it => it.id === wantId));
  $('bgItem').value = String(k);
  $('bgItemRow').hidden = bgItems.length < 2; $('bgNote').hidden = true;
  showBackground(bgItems[k]);
}
function showBackground(it) {
  if (!it) return;
  const key = ['image', 'gamma0', 'sigma0'].find(k => it.assets[k]) || tiffAssetKeys(it)[0];
  const a = it.assets[key], b = a['raster:bands']?.[0] || {}, st = b.statistics || {};
  let lo = num(st.minimum) ?? 0, hi = num(st.maximum) ?? 255;
  if (st.mean != null && st.stddev) { lo = Math.max(lo, st.mean - 2 * st.stddev); hi = Math.min(hi, st.mean + 2 * st.stddev); }
  bgLayer.setStyle(rasterStyle(cmaps.gray, lo, hi));
  bgLayer.setSource(new ol.source.GeoTIFF({ sources: [{ url: a.href, nodata: b.nodata ?? undefined }], normalize: false,
    interpolate: true, projection: it.epsg ? `EPSG:${it.epsg}` : undefined }));
  bgLayer.setVisible(true);
  bgSave(hemi, { href: $('bgColl').value, id: it.id });
}

