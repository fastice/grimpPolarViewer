// Digitize: points, lines, polygons, rectangles, circles and freehand lines and polygons drawn on the map,
// listed with a name each, and saved as a GeoPackage in the map's projection (one layer per geometry type:
// points, lines, polygons), with each shape's true length or perimeter and area on the ellipsoid (from
// measure.js). A tool stays on until it is clicked again, so several shapes can be drawn in a row; once
// no tool is on, shapes are edited like measurements (drag a point to move it, drag a side to add one,
// double-click or Alt-click a point to delete it). The shapes are kept per map projection, so switching
// hemisphere and back brings them back. The GeoPackage is written with sql.js (SQLite in WebAssembly),
// loaded from the CDN the first time one is saved.
const dgSource = new ol.source.Vector();
const dgColor = '#00e5ff';
const dgLabelAt = g => g.getType() === 'Polygon' ? g.getInteriorPoint() : g.getType() === 'Point' ? g : new ol.geom.Point(g.getLastCoordinate());
map.addLayer(new ol.layer.Vector({ source: dgSource, zIndex: 7, style: f => [
  new ol.style.Style({ stroke: new ol.style.Stroke({ color: 'rgba(0, 0, 0, 0.7)', width: 4.5 }),
    image: new ol.style.Circle({ radius: 6, fill: new ol.style.Fill({ color: dgColor }), stroke: new ol.style.Stroke({ color: 'rgba(0, 0, 0, 0.8)', width: 2 }) }) }),
  new ol.style.Style({ stroke: new ol.style.Stroke({ color: dgColor, width: 2.5 }), fill: new ol.style.Fill({ color: 'rgba(0, 229, 255, 0.12)' }) }),
  new ol.style.Style({ geometry: g => dgLabelAt(g.getGeometry()), text: new ol.style.Text({ text: f.get('name'), font: '600 13px system-ui, sans-serif',
    textAlign: 'left', offsetX: 9, offsetY: -10, fill: new ol.style.Fill({ color: '#fff' }), stroke: new ol.style.Stroke({ color: 'rgba(0, 0, 0, 0.85)', width: 3 }) }) }),
] }));
// button id: [shape name, Draw type, geometryFunction, freehand-capable]
const dgTools = { dgPoint: ['point', 'Point'], dgLine: ['line', 'LineString', null, true], dgPoly: ['polygon', 'Polygon', null, true],
  dgRect: ['rectangle', 'Circle', ol.interaction.Draw.createBox()], dgCircle: ['circle', 'Circle', ol.interaction.Draw.createRegularPolygon(64)] };
const dgStore = {};  // features by projection, for the projections not shown
let dgCode = null, dgCount = 0;
const dgNums = {};  // last number given to each type of shape, by projection (Point 1, Point 2, Line 1, ...)
// [true length or perimeter in km, true area in km2] of a geometry
function dgSize(g) {
  const t = g.getType();
  if (t === 'Point') return [null, null];
  const cs = t === 'Polygon' ? g.getCoordinates()[0] : g.getCoordinates();
  return [msLength(cs)[0] / 1000, t === 'Polygon' ? msArea(g)[0] : null];
}
function dgSizeText(g) {
  if (g.getType() === 'Point') { const [lon, lat] = ol.proj.toLonLat(g.getCoordinates(), viewCode); return `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`; }
  const [len, area] = dgSize(g);
  return area == null ? msKm(len * 1000) : `${msKm2(area)}, ${msKm(len * 1000)} around`;
}
// the shapes in the order drawn (the source's own order changes as they are edited)
const dgFeatures = () => dgSource.getFeatures().sort((a, b) => a.get('n') - b.get('n'));
function dgList() {
  const fs = dgFeatures(), ul = $('dgList');
  ul.replaceChildren(...fs.map(f => {
    const li = document.createElement('li'), name = document.createElement('input'), size = document.createElement('span'), del = document.createElement('button');
    name.type = 'text'; name.spellcheck = false; name.value = f.get('name'); name.title = `Name of this ${f.get('shape')} (saved in the GeoPackage)`;
    name.oninput = () => f.set('name', name.value);
    size.className = 'note'; size.textContent = dgSizeText(f.getGeometry()); f.set('sizeEl', size);
    del.type = 'button'; del.className = 'link'; del.textContent = '×'; del.title = `Delete this ${f.get('shape')}`;
    del.onclick = () => { dgSource.removeFeature(f); dgList(); };
    li.append(name, size, del);
    return li;
  }));
  $('dgSave').hidden = $('dgClear').hidden = !fs.length;
  $('dgCount').textContent = fs.length ? `(${fs.length})` : '';
}
const dgDrawing = () => drawKind in dgTools;
function dgStart(btn) {
  const was = drawKind;
  if (draw) { stopDraw(); if (was === btn) { $('dgNote').textContent = dgSource.getFeatures().length ? dgEditNote : ''; return; } refreshAnimInfo(); }
  if (tsMode) setTsMode(false);
  const [shape, type, geometryFunction, free] = dgTools[btn], freehand = free && $('dgFree').checked;
  draw = new ol.interaction.Draw({ source: dgSource, type, geometryFunction: geometryFunction || undefined, freehand, style: outline(dgColor) }); drawKind = btn;
  draw.on('drawend', e => {
    const key = `${viewCode} ${shape}`, num = dgNums[key] = (dgNums[key] || 0) + 1;
    e.feature.setProperties({ n: ++dgCount, shape: freehand ? `freehand ${shape}` : shape, name: `${shape[0].toUpperCase()}${shape.slice(1)} ${num}` });
    pfDrawnAt = performance.now();  // the click that ended it is not a map click
    setTimeout(dgList);
  });
  map.addInteraction(draw);
  $(btn).textContent = 'Stop';
  $('dgNote').textContent = {
    point: 'Click to add points.', rectangle: 'Click one corner, then the opposite corner.', circle: 'Click the center, then a point on the edge.',
    line: freehand ? 'Press and drag to draw each line.' : 'Click points along the line; double-click to finish it.',
    polygon: freehand ? 'Press and drag around each shape.' : 'Click the corners; double-click or click the first corner to finish it.',
  }[shape] + ` Click Stop when done${free && !freehand ? ' (hold Shift to draw freehand)' : ''}. Each shape is added to the list below, where you can type a new name for it.`;
}
const dgEditNote = 'To rename a shape, type over its name in the list (× deletes it). On the map, drag a point to move it, drag a side to add a point, double-click (or Alt-click) a point to delete it.';
const dgModify = new ol.interaction.Modify({ source: dgSource, pixelTolerance: 8,
  deleteCondition: e => ol.events.condition.doubleClick(e) || (ol.events.condition.altKeyOnly(e) && ol.events.condition.singleClick(e)) });
map.addInteraction(dgModify);
map.getInteractions().on(['add', 'remove'], () => dgModify.setActive(!msDrawing()));
dgSource.on('addfeature', e => e.feature.getGeometry().on('change', ev => {
  const el = e.feature.get('sizeEl');
  if (el) el.textContent = dgSizeText(ev.target);
}));
for (const id in dgTools) $(id).onclick = () => dgStart(id);
$('dgFree').onchange = () => { if (dgDrawing() && dgTools[drawKind][3]) { const k = drawKind; stopDraw(); dgStart(k); } };
$('dgClear').onclick = () => { if (dgDrawing()) stopDraw(); dgSource.clear(); for (const k in dgNums) if (k.startsWith(`${viewCode} `)) delete dgNums[k]; dgList(); $('dgNote').textContent = ''; };
map.on('change:view', () => {
  if (dgDrawing()) stopDraw();
  if (dgCode) dgStore[dgCode] = dgSource.getFeatures();
  dgSource.clear();
  dgCode = viewCode;
  dgSource.addFeatures(dgStore[dgCode] || []);
  $('dgCrs').options[0].textContent = `map grid (${dgWkt[viewCode.split(':')[1]] ? viewCode : 'EPSG:4326'}, m)`;
  dgList(); $('dgNote').textContent = '';
});

// GeoPackage (OGC 12-128r18, version 1.4): the core tables and one feature table per geometry type, with
// the geometries as GeoPackage binary (a header with the srs_id and the envelope, then little-endian WKB).
const dgWkt = {
  4326: ['WGS 84', 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AXIS["Latitude",NORTH],AXIS["Longitude",EAST],AUTHORITY["EPSG","4326"]]'],
  3413: ['WGS 84 / NSIDC Sea Ice Polar Stereographic North', 'PROJCS["WGS 84 / NSIDC Sea Ice Polar Stereographic North",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]],PROJECTION["Polar_Stereographic"],PARAMETER["latitude_of_origin",70],PARAMETER["central_meridian",-45],PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AXIS["Easting",SOUTH],AXIS["Northing",SOUTH],AUTHORITY["EPSG","3413"]]'],
  3031: ['WGS 84 / Antarctic Polar Stereographic', 'PROJCS["WGS 84 / Antarctic Polar Stereographic",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]],PROJECTION["Polar_Stereographic"],PARAMETER["latitude_of_origin",-71],PARAMETER["central_meridian",0],PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AXIS["Easting",NORTH],AXIS["Northing",NORTH],AUTHORITY["EPSG","3031"]]'],
  3857: ['WGS 84 / Pseudo-Mercator', 'PROJCS["WGS 84 / Pseudo-Mercator",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]],PROJECTION["Mercator_1SP"],PARAMETER["central_meridian",0],PARAMETER["scale_factor",1],PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AXIS["Easting",EAST],AXIS["Northing",NORTH],EXTENSION["PROJ4","+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs"],AUTHORITY["EPSG","3857"]]'],
};
// GeoPackage binary of a geometry: Point, LineString or Polygon coordinates, little endian.
function gpkgGeom(type, cs, srs) {
  const pts = type === 'Point' ? [cs] : type === 'LineString' ? cs : cs.flat();
  const n = 8 + 32 + 5 + (type === 'Point' ? 16 : type === 'LineString' ? 4 + 16 * cs.length : 4 + cs.reduce((s, r) => s + 4 + 16 * r.length, 0));
  const buf = new ArrayBuffer(n), dv = new DataView(buf), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  let o = 0;
  const u32 = v => { dv.setUint32(o, v, true); o += 4; }, f64 = v => { dv.setFloat64(o, v, true); o += 8; }, xy = p => { f64(p[0]); f64(p[1]); };
  dv.setUint8(0, 0x47); dv.setUint8(1, 0x50); dv.setUint8(2, 0); dv.setUint8(3, 0b011); o = 4;  // 'GP', version 0, xy envelope, little endian
  dv.setInt32(o, srs, true); o += 4;
  [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].forEach(f64);
  dv.setUint8(o++, 1);
  if (type === 'Point') { u32(1); xy(cs); }
  else if (type === 'LineString') { u32(2); u32(cs.length); cs.forEach(xy); }
  else { u32(3); u32(cs.length); for (const r of cs) { u32(r.length); r.forEach(xy); } }
  return new Uint8Array(buf);
}
const dgSqlBase = 'https://cdn.jsdelivr.net/npm/sql.js@1.15.2/dist/';
let dgSql = null;
function loadSqlJs() {
  return dgSql ||= new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = `${dgSqlBase}sql-wasm.js`; s.onload = ok; s.onerror = () => fail(new Error('could not load sql.js'));
    document.head.append(s);
  }).then(() => initSqlJs({ locateFile: f => dgSqlBase + f })).catch(e => { dgSql = null; throw e; });
}
// The EPSG code a GeoPackage is saved in: the map's own, or lon, lat (EPSG:4326) when asked for or when the
// map's projection has no definition here.
const dgOutSrs = (code, latlon) => latlon || !dgWkt[code.split(':')[1]] ? 4326 : +code.split(':')[1];
async function gpkgBytes(features, code, latlon = false) {
  const SQL = await loadSqlJs(), db = new SQL.Database(), srs = dgOutSrs(code, latlon);
  const tf = srs === 4326 ? c => ol.proj.toLonLat(c, code) : c => c;
  db.run(`PRAGMA application_id = 1196444487; PRAGMA user_version = 10400;
    CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, srs_id INTEGER PRIMARY KEY, organization TEXT NOT NULL,
      organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT);
    CREATE TABLE gpkg_contents (table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE, description TEXT DEFAULT '',
      last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE,
      srs_id INTEGER, CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id));
    CREATE TABLE gpkg_geometry_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL,
      srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL, CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name),
      CONSTRAINT uk_gc_table_name UNIQUE (table_name), CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name),
      CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys (srs_id));`);
  const ins = (sql, rows) => { const st = db.prepare(sql); rows.forEach(r => st.run(r)); st.free(); };
  ins('INSERT INTO gpkg_spatial_ref_sys VALUES (?, ?, ?, ?, ?, ?)', [
    ['Undefined cartesian SRS', -1, 'NONE', -1, 'undefined', 'undefined cartesian coordinate reference system'],
    ['Undefined geographic SRS', 0, 'NONE', 0, 'undefined', 'undefined geographic coordinate reference system'],
    ...[...new Set([4326, srs])].map(s => [dgWkt[s][0], s, 'EPSG', s, dgWkt[s][1], null])]);
  const layers = { Point: ['points', 'POINT'], LineString: ['lines', 'LINESTRING'], Polygon: ['polygons', 'POLYGON'] };
  for (const [type, [table, gtype]] of Object.entries(layers)) {
    const fs = features.filter(f => f.getGeometry().getType() === type);
    if (!fs.length) continue;
    const geoms = fs.map(f => { const c = f.getGeometry().getCoordinates(); return type === 'Point' ? tf(c) : type === 'LineString' ? c.map(tf) : c.map(r => r.map(tf)); });
    const all = geoms.map(c => type === 'Point' ? [c] : type === 'LineString' ? c : c.flat()).flat();
    const ext = [Math.min(...all.map(p => p[0])), Math.min(...all.map(p => p[1])), Math.max(...all.map(p => p[0])), Math.max(...all.map(p => p[1]))];
    const cols = type === 'Point' ? 'lat REAL, lon REAL' : type === 'LineString' ? 'length_km REAL' : 'area_km2 REAL, perimeter_km REAL';
    db.run(`CREATE TABLE ${table} (fid INTEGER PRIMARY KEY AUTOINCREMENT, geom ${gtype}, name TEXT, shape TEXT, ${cols})`);
    ins('INSERT INTO gpkg_contents (table_name, data_type, identifier, description, min_x, min_y, max_x, max_y, srs_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [[table, 'features', table, `Drawn in the GrIMP Polar Viewer (${type === 'Point' ? 'lat, lon in degrees' : 'true lengths and areas on the WGS84 ellipsoid'})`, ...ext, srs]]);
    ins('INSERT INTO gpkg_geometry_columns VALUES (?, ?, ?, ?, 0, 0)', [[table, 'geom', gtype, srs]]);
    ins(`INSERT INTO ${table} (geom, name, shape, ${cols.replace(/ REAL/g, '')}) VALUES (?, ?, ?, ?${type === 'LineString' ? '' : ', ?'})`, fs.map((f, k) => {
      const g = f.getGeometry(), [len, area] = dgSize(g), vals = type === 'Point' ? ol.proj.toLonLat(g.getCoordinates(), code).reverse() : type === 'LineString' ? [len] : [area, len];
      return [gpkgGeom(type, geoms[k], srs), f.get('name'), f.get('shape'), ...vals];
    }));
  }
  const out = db.export();
  db.close();
  return out;
}
$('dgSave').onclick = async () => {
  if (dgDrawing()) stopDraw();
  $('dgNote').textContent = 'Writing the GeoPackage…';
  try {
    const latlon = $('dgCrs').value === '4326', srs = dgOutSrs(viewCode, latlon), bytes = await gpkgBytes(dgFeatures(), viewCode, latlon);
    saveBlob(new Blob([bytes], { type: 'application/geopackage+sqlite3' }), `grimpShapes_EPSG${srs}_${new Date().toISOString().slice(0, 10)}.gpkg`);
    $('dgNote').textContent = `Saved ${dgSource.getFeatures().length} shapes (layers points, lines and polygons, in EPSG:${srs}). ${dgEditNote}`;
  } catch (e) {
    $('dgNote').textContent = `Could not write the GeoPackage: ${e.message}`;
  }
};
