// Digitize: points, lines, polygons, rectangles, circles and freehand lines and polygons drawn on the map,
// listed with a name each, and saved as a GeoPackage in the map's projection (one layer per geometry type:
// points, lines, polygons), with each shape's true length or perimeter and area on the ellipsoid (from
// measure.js). A tool stays on until it is clicked again, so several shapes can be drawn in a row; once
// no tool is on, shapes are edited like measurements (drag a point to move it, drag a side to add one,
// double-click or Alt-click a point to delete it). The shapes are kept per map projection, so switching
// hemisphere and back brings them back. A GeoPackage can also be opened (from QGIS, ArcGIS or this viewer):
// its shapes are added to the list with all their fields, which are saved again with them. GeoPackages are
// read and written with sql.js (SQLite in WebAssembly), loaded from the CDN the first time one is needed.
const dgSource = new ol.source.Vector();
const dgColor = '#00e5ff';
const dgLabelAt = g => g.getType() === 'Circle' ? new ol.geom.Point(g.getCenter()) : g.getType() === 'Polygon' ? g.getInteriorPoint()
  : g.getType() === 'MultiPolygon' ? new ol.geom.Point(g.getInteriorPoints().getFirstCoordinate()) : g.getType() === 'Point' ? g : new ol.geom.Point(g.getLastCoordinate());
const dgLayer = new ol.layer.Vector({ source: dgSource, zIndex: 7, style: f => [
  new ol.style.Style({ stroke: new ol.style.Stroke({ color: 'rgba(0, 0, 0, 0.7)', width: 4.5 }),
    image: new ol.style.Circle({ radius: 6, fill: new ol.style.Fill({ color: dgColor }), stroke: new ol.style.Stroke({ color: 'rgba(0, 0, 0, 0.8)', width: 2 }) }) }),
  new ol.style.Style({ stroke: new ol.style.Stroke({ color: dgColor, width: 2.5 }), fill: new ol.style.Fill({ color: 'rgba(0, 229, 255, 0.12)' }) }),
  new ol.style.Style({ geometry: g => dgLabelAt(g.getGeometry()), text: new ol.style.Text({ text: f.get('name'), font: '600 13px system-ui, sans-serif',
    textAlign: 'left', offsetX: 9, offsetY: -10, fill: new ol.style.Fill({ color: '#fff' }), stroke: new ol.style.Stroke({ color: 'rgba(0, 0, 0, 0.85)', width: 3 }) }) }),
] });
map.addLayer(dgLayer);
// button id: [shape name, Draw type, geometryFunction, freehand-capable]
const dgTools = { dgPoint: ['point', 'Point'], dgLine: ['line', 'LineString', null, true], dgPoly: ['polygon', 'Polygon', null, true],
  dgRect: ['rectangle', 'Circle', ol.interaction.Draw.createBox()], dgCircle: ['circle', 'Circle'] };
const dgStore = {};  // features by projection, for the projections not shown
let dgCode = null, dgCount = 0;
const dgNums = {};  // last number given to each type of shape, by projection (Point 1, Point 2, Line 1, ...)
// A circle stays a circle on the map (so dragging its edge resizes it and dragging its center moves it);
// it is measured and saved as a 64-sided polygon.
const dgGeom = g => g.getType() === 'Circle' ? ol.geom.Polygon.fromCircle(g, 64) : g;
const dgBase = t => t.replace('Multi', '');  // Point, LineString or Polygon
// true area of a polygon in km2, its holes taken out
const dgPolyArea = p => msPolar() ? p.getCoordinates().reduce((s, r, k) => s + (k ? -1 : 1) * ringArea(msDense(r))[0], 0) : msArea(p)[0];
// [true length or perimeter (of all the rings and parts) in km, true area in km2] of a geometry
function dgSize(g) {
  g = dgGeom(g);
  const t = g.getType(), cs = g.getCoordinates();
  if (dgBase(t) === 'Point') return [null, null];
  const len = (t === 'LineString' ? [cs] : t === 'MultiPolygon' ? cs.flat() : cs).reduce((s, l) => s + msLength(l)[0], 0) / 1000;
  return [len, dgBase(t) === 'Polygon' ? (t === 'Polygon' ? [g] : g.getPolygons()).reduce((s, p) => s + dgPolyArea(p), 0) : null];
}
function dgSizeText(g) {
  if (g.getType() === 'Point') { const [lon, lat] = ol.proj.toLonLat(g.getCoordinates(), viewCode); return `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`; }
  if (g.getType() === 'MultiPoint') return `${g.getPoints().length} points`;
  const [len, area] = dgSize(g);
  return area == null ? msKm(len * 1000) : `${msKm2(area)}, ${msKm(len * 1000)} around`;
}
// the size text, kept with the shape (a big outline opened from a file is slow to measure) and redone as it is edited
const dgSizeOf = f => f.get('sizeText') ?? (f.set('sizeText', dgSizeText(f.getGeometry()), true), f.get('sizeText'));
// the shapes in the order drawn (the source's own order changes as they are edited)
const dgFeatures = () => dgSource.getFeatures().sort((a, b) => a.get('n') - b.get('n'));
// The list of shapes, rebuilt; it keeps its scroll position, or scrolls to the newest shape (toEnd).
function dgList(toEnd = false) {
  const fs = dgFeatures(), ul = $('dgList'), top = ul.scrollTop;
  ul.replaceChildren(...fs.map(f => {
    const li = document.createElement('li'), name = document.createElement('input'), size = document.createElement('span'), del = document.createElement('button');
    name.type = 'text'; name.spellcheck = false; name.value = f.get('name'); name.title = `Name of this ${f.get('shape')} (saved in the GeoPackage)`;
    name.oninput = () => f.set('name', name.value);
    size.className = 'note'; size.textContent = dgSizeOf(f); f.set('sizeEl', size, true);
    del.type = 'button'; del.className = 'link'; del.textContent = '×'; del.title = `Delete this ${f.get('shape')}`;
    del.onclick = () => { dgSource.removeFeature(f); dgList(); };
    li.append(name, size, del);
    return li;
  }));
  ul.scrollTop = toEnd ? ul.scrollHeight : top;
  $('dgSave').hidden = $('dgClear').hidden = !fs.length;
  $('dgName').placeholder = dgFileName(dgOutSrs(viewCode, $('dgCrs').value === '4326'), true);
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
    setTimeout(() => dgList(true));
  });
  map.addInteraction(draw);
  $(btn).textContent = 'Stop';
  $('dgNote').textContent = {
    point: 'Click to add points.', rectangle: 'Click one corner, then the opposite corner.', circle: 'Click the center, then a point on the edge.',
    line: freehand ? 'Press and drag to draw each line.' : 'Click points along the line; double-click to finish it.',
    polygon: freehand ? 'Press and drag around each shape.' : 'Click the corners; double-click or click the first corner to finish it.',
  }[shape] + ` Click Stop when done${free && !freehand ? ' (hold Shift to draw freehand)' : ''}. Each shape is added to the list below, where you can type a new name for it.`;
}
const dgEditNote = 'To rename a shape, type over its name in the list (× deletes it). On the map, drag a point to move it, drag a side to add a point, double-click (or Alt-click) a point to delete it; drag a circle\'s edge to resize it. To move a whole shape, drag inside it, or Ctrl-drag (⌘-drag on a Mac) any shape.';
const dgModify = new ol.interaction.Modify({ source: dgSource, pixelTolerance: 8,
  deleteCondition: e => ol.events.condition.doubleClick(e) || (ol.events.condition.altKeyOnly(e) && ol.events.condition.singleClick(e)) });
map.addInteraction(dgModify);
// Moving a whole shape: drag inside a polygon, rectangle or circle (away from its edge, where a drag edits
// it instead), or Ctrl-drag (Cmd-drag on a Mac) any shape, lines and points included.
let dgMoving = null;
function dgShapeAt(e) {
  const fs = map.getFeaturesAtPixel(e.pixel, { layerFilter: l => l === dgLayer, hitTolerance: 4 });
  if (ol.events.condition.platformModifierKeyOnly(e)) return fs[0] || null;
  return fs.find(f => {
    const g = dgGeom(f.getGeometry()), q = dgBase(g.getType()) === 'Polygon' && map.getPixelFromCoordinate(g.getClosestPoint(e.coordinate));
    return q && Math.hypot(q[0] - e.pixel[0], q[1] - e.pixel[1]) > 10;
  }) || null;
}
const dgTranslate = new ol.interaction.Translate({ layers: [dgLayer], hitTolerance: 4, condition: e => !!(dgMoving = dgShapeAt(e)), filter: f => f === dgMoving });
map.addInteraction(dgTranslate);
map.getInteractions().on(['add', 'remove'], () => { const on = !msDrawing(); dgModify.setActive(on); dgTranslate.setActive(on); });
dgSource.on('addfeature', e => e.feature.getGeometry().on('change', ev => {
  const el = e.feature.get('sizeEl'), text = dgSizeText(ev.target);
  e.feature.set('sizeText', text, true);
  if (el) el.textContent = text;
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
const dgWkbCode = { Point: 1, LineString: 2, Polygon: 3, MultiPoint: 4, MultiLineString: 5, MultiPolygon: 6 };
const wkbSize = (t, cs) => t === 'Point' ? 21 : t === 'LineString' ? 9 + 16 * cs.length : t === 'Polygon' ? 9 + cs.reduce((s, r) => s + 4 + 16 * r.length, 0)
  : 9 + cs.reduce((s, c) => s + wkbSize(dgBase(t), c), 0);
// GeoPackage binary of a geometry (OpenLayers type, x/y coordinates, srs_id, extent), little endian.
function gpkgGeom(type, cs, srs, ext) {
  const dv = new DataView(new ArrayBuffer(40 + wkbSize(type, cs)));
  let o = 0;
  const u32 = v => { dv.setUint32(o, v, true); o += 4; }, f64 = v => { dv.setFloat64(o, v, true); o += 8; }, xy = p => { f64(p[0]); f64(p[1]); };
  dv.setUint8(0, 0x47); dv.setUint8(1, 0x50); dv.setUint8(2, 0); dv.setUint8(3, 0b011); o = 4;  // 'GP', version 0, xy envelope, little endian
  dv.setInt32(o, srs, true); o += 4;
  [ext[0], ext[2], ext[1], ext[3]].forEach(f64);
  const wkb = (t, c) => {
    dv.setUint8(o++, 1); u32(dgWkbCode[t]);
    if (t === 'Point') xy(c);
    else if (t === 'LineString') { u32(c.length); c.forEach(xy); }
    else if (t === 'Polygon') { u32(c.length); for (const r of c) { u32(r.length); r.forEach(xy); } }
    else { u32(c.length); c.forEach(part => wkb(dgBase(t), part)); }
  };
  wkb(type, cs);
  return new Uint8Array(dv.buffer);
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
// Each shape is saved in the layer it was opened from, or in points, lines or polygons if drawn here, with
// its name, its shape and the fields worked out from it (lat, lon of a point; true lengths and areas in km),
// then the fields it was opened with.
const dgTables = { Point: 'points', LineString: 'lines', Polygon: 'polygons' };
const dgCalc = { Point: [['lat', 'REAL'], ['lon', 'REAL']], LineString: [['length_km', 'REAL']], Polygon: [['area_km2', 'REAL'], ['perimeter_km', 'REAL']] };
const dgSchemas = {};  // the columns ([name, declared type]) and description of each layer opened from a GeoPackage
const sqlName = s => `"${String(s).replace(/"/g, '""')}"`;
async function gpkgBytes(features, code, latlon = false) {
  const SQL = await loadSqlJs(), db = new SQL.Database(), srs = dgOutSrs(code, latlon);
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
  const groups = new Map(Object.values(dgTables).map(t => [t, []]));
  for (const f of features) {
    const table = f.get('layer') || dgTables[dgBase(dgGeom(f.getGeometry()).getType())];
    if (!groups.has(table)) groups.set(table, []);
    groups.get(table).push(f);
  }
  for (const [table, fs] of groups) {
    if (!fs.length) continue;
    // one geometry type per layer: multi-part if any shape is (single ones are saved as one-part), or any
    // geometry if the layer mixes points, lines and polygons
    const types = fs.map(f => dgGeom(f.getGeometry()).getType()), kinds = [...new Set(types.map(dgBase))];
    const multi = kinds.length === 1 && types.some(t => t.startsWith('Multi'));
    const gtype = kinds.length > 1 ? 'GEOMETRY' : (multi ? 'MULTI' : '') + kinds[0].toUpperCase();
    const geoms = fs.map(f => {
      let g = dgGeom(f.getGeometry()).clone();
      if (srs === 4326) g.transform(code, 'EPSG:4326');
      return multi && !g.getType().startsWith('Multi') ? new ol.geom[`Multi${g.getType()}`]([g.getCoordinates()]) : g;
    });
    const ext = geoms.reduce((e, g) => ol.extent.extend(e, g.getExtent()), ol.extent.createEmpty());
    const calc = Object.keys(dgCalc).filter(k => kinds.includes(k)).flatMap(k => dgCalc[k]), calcNames = new Set(calc.map(c => c[0]));
    const opened = fs.some(f => f.get('layer') === table) ? dgSchemas[table] : null, extra = [...(opened?.cols || [])];
    for (const f of fs) for (const k of Object.keys(f.get('attrs') || {})) if (!extra.some(c => c[0] === k)) extra.push([k, '']);
    const taken = new Set(['fid', 'geom', 'name', 'shape', ...calcNames]);
    const cols = [['name', 'TEXT'], ['shape', 'TEXT'], ...calc, ...extra.filter(([c]) => !taken.has(c.toLowerCase()) && taken.add(c.toLowerCase()))];
    db.run(`CREATE TABLE ${sqlName(table)} (fid INTEGER PRIMARY KEY AUTOINCREMENT, geom ${gtype}, ${cols.map(([c, t]) => `${sqlName(c)} ${t}`).join(', ')})`);
    ins('INSERT INTO gpkg_contents (table_name, data_type, identifier, description, min_x, min_y, max_x, max_y, srs_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [[table, 'features', table, opened?.desc ?? `Drawn in the GrIMP Polar Viewer (${gtype === 'POINT' ? 'lat, lon in degrees' : 'true lengths and areas on the WGS84 ellipsoid'})`, ...ext, srs]]);
    ins('INSERT INTO gpkg_geometry_columns VALUES (?, ?, ?, ?, 0, 0)', [[table, 'geom', gtype, srs]]);
    const used = new Set(), rows = fs.map((f, k) => {
      const g = f.getGeometry(), t = dgGeom(g).getType(), [len, area] = dgSize(g), attrs = f.get('attrs') || {};
      const v = t === 'Point' ? (([lon, lat]) => ({ lat, lon }))(ol.proj.toLonLat(g.getCoordinates(), code))
        : { length_km: dgBase(t) === 'LineString' ? len : null, area_km2: area, perimeter_km: dgBase(t) === 'Polygon' ? len : null };
      const fid = f.get('fid'), keep = fid != null && f.get('layer') === table && !used.has(fid) && used.add(fid);
      return [keep ? fid : null, gpkgGeom(geoms[k].getType(), geoms[k].getCoordinates(), srs, geoms[k].getExtent()),
        ...cols.map(([c]) => c === 'name' ? f.get('name') : c === 'shape' ? f.get('shape') : calcNames.has(c) ? v[c] ?? null : attrs[c] ?? null)];
    });
    // the shapes keeping the fid they were opened with first, so a new fid never takes one of theirs
    ins(`INSERT INTO ${sqlName(table)} (fid, geom, ${cols.map(c => sqlName(c[0])).join(', ')}) VALUES (${Array(cols.length + 2).fill('?').join(', ')})`,
      [...rows.filter(r => r[0] != null), ...rows.filter(r => r[0] == null)]);
  }
  const out = db.export();
  db.close();
  return out;
}

// Opening a GeoPackage: the shapes of its feature layers (points, lines and polygons, multi-part or with
// holes, in any coordinate system it defines) are moved into the map's projection, or into the other polar
// map's for shapes in the other hemisphere, and added to the list with every field they have. Curved shapes
// are skipped, and heights (Z) and measures (M) dropped. Files too big to edit smoothly are refused.
const dgMaxMB = 50, dgMaxShapes = 5000, dgMaxPoints = 250000;
// WKB (ISO or EWKB, either byte order) at byte o: [OpenLayers type, x/y coordinates, next byte], or
// [null] for a curve or a geometry collection.
function readWkb(dv, o, flags) {
  const le = dv.getUint8(o) === 1, raw = dv.getUint32(o + 1, le), iso = Math.floor((raw & 0xffff) / 1000);
  const z = (raw & 0x80000000) !== 0 || iso === 1 || iso === 3, m = (raw & 0x40000000) !== 0 || iso >= 2, stride = 8 * (2 + z + m);
  const type = [, 'Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'][(raw & 0xffff) % 1000];
  if (!type) return [null];
  if (z || m) flags.zm = true;
  o += 5;
  const n = () => { const v = dv.getUint32(o, le); o += 4; if (v * 16 > dv.byteLength) throw new Error('bad geometry'); return v; };
  const pt = () => { const p = [dv.getFloat64(o, le), dv.getFloat64(o + 8, le)]; o += stride; return p; };
  const pts = () => Array.from({ length: n() }, pt);
  let cs;
  if (type === 'Point') cs = pt();
  else if (type === 'LineString') cs = pts();
  else if (type === 'Polygon') cs = Array.from({ length: n() }, pts);
  else cs = Array.from({ length: n() }, () => { const [t, c, next] = readWkb(dv, o, flags); if (!t) throw new Error('bad geometry'); o = next; return c; });
  return [type, cs, o];
}
// a GeoPackage geometry blob (or plain WKB): [type, coordinates] or null when empty
function gpkgRead(blob, flags) {
  if (!(blob instanceof Uint8Array) || blob.length < 5) return null;
  const dv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  if (blob[0] !== 0x47 || blob[1] !== 0x50) return readWkb(dv, 0, flags);
  if (blob[3] & 0x10) return null;  // empty
  return readWkb(dv, 8 + [0, 32, 48, 48, 64][(blob[3] >> 1) & 7], flags);
}
// the OpenLayers projection of a gpkg_spatial_ref_sys row: an EPSG code it knows, or else its definition
function dgSrsProj([id, org, orgId, def]) {
  if (id === 0) return 'EPSG:4326';  // undefined geographic: lon, lat
  const code = `${String(org).toUpperCase()}:${orgId}`;
  if (ol.proj.get(code)) return code;
  const name = `gpkg ${code} ${def}`;
  if (!proj4.defs(name)) {
    if (!def || def === 'undefined') throw new Error(`its coordinate system (srs_id ${id}) is undefined`);
    try { proj4.defs(name, def); } catch (e) { /* not understood */ }
    if (!proj4.defs(name)) throw new Error(`its coordinate system (${code}) is not one this viewer can read`);
    proj4.defs(name).axis = 'enu';  // GeoPackage x, y are always east, north (lon, lat)
    ol.proj.proj4.register(proj4);
  }
  return name;
}
async function dgOpen(file) {
  const tooBig = what => new Error(`it is too large to open here (${what}). Simplify it, or clip it to the area you need, in QGIS or ArcGIS first.`);
  const big = v => v.toLocaleString('en-US'), had = dgSource.getFeatures(), with_ = had.length ? ', with the shapes already listed' : '';
  if (file.size > dgMaxMB * 1e6) throw tooBig(`${(file.size / 1e6).toFixed(0)} MB; the limit is ${dgMaxMB} MB`);
  const SQL = await loadSqlJs();
  let db;
  try { db = new SQL.Database(new Uint8Array(await file.arrayBuffer())); db.exec('SELECT count(*) FROM sqlite_master'); }
  catch (e) { throw new Error('it is not a GeoPackage (not an SQLite database)'); }
  try {
    const q = sql => { const st = db.prepare(sql), rows = []; while (st.step()) rows.push(st.get()); st.free(); return rows; };
    let layers;
    try { layers = q('SELECT g.table_name, g.column_name, g.srs_id, c.description FROM gpkg_geometry_columns g LEFT JOIN gpkg_contents c ON c.table_name = g.table_name'); }
    catch (e) { throw new Error('it is not a GeoPackage (it has no gpkg_geometry_columns table)'); }
    if (!layers.length) throw new Error('it has no layers of points, lines or polygons');
    const srsRows = new Map(q('SELECT srs_id, organization, organization_coordsys_id, definition FROM gpkg_spatial_ref_sys').map(r => [r[0], r]));
    const nShapes = layers.reduce((s, [t]) => s + q(`SELECT count(*) FROM ${sqlName(t)}`)[0][0], had.length);
    if (nShapes > dgMaxShapes) throw tooBig(`${big(nShapes)} shapes${with_}; the limit is ${big(dgMaxShapes)}`);
    let points = had.reduce((s, f) => s + dgGeom(f.getGeometry()).getFlatCoordinates().length / 2, 0);
    const flags = { zm: false }, read = [], srsUsed = new Set(), named = { Point: 'point', LineString: 'line', Polygon: 'polygon' };
    let skipped = 0, empty = 0;
    for (const [table, gcol, srsId, desc] of layers) {
      let src;
      try { src = dgSrsProj(srsRows.get(srsId) || [srsId, 'srs_id', srsId, null]); } catch (e) { throw new Error(`layer ${table}: ${e.message}`); }
      srsUsed.add(src.startsWith('gpkg ') ? src.split(' ')[1] : src);
      const info = q(`PRAGMA table_info(${sqlName(table)})`), pk = info.find(c => c[5])?.[1];
      const ours = c => c === gcol || c === pk || /^(name|shape)$/i.test(c);
      const schema = dgSchemas[table] ||= { cols: [], desc };
      for (const [, c, t] of info) if (!ours(c) && !schema.cols.some(x => x[0] === c)) schema.cols.push([c, t]);
      const st = db.prepare(`SELECT * FROM ${sqlName(table)}`), names = st.getColumnNames();
      const nameCol = names.find(c => c !== gcol && /^name$/i.test(c)), shapeCol = names.find(c => c !== gcol && /^shape$/i.test(c));
      while (st.step()) {
        const r = st.get(), rec = Object.fromEntries(names.map((c, k) => [c, r[k]]));
        let g;
        try { g = gpkgRead(rec[gcol], flags); } catch (e) { g = [null]; }
        if (!g) { empty++; continue; }
        const geom = g[0] && new ol.geom[g[0]](g[1]);
        if (!geom || geom.getFlatCoordinates().some(isNaN) || !geom.getFlatCoordinates().length) { skipped++; continue; }
        if ((points += geom.getFlatCoordinates().length / 2) > dgMaxPoints) { st.free(); throw tooBig(`over ${big(dgMaxPoints)} points along its shapes${with_}`); }
        const fid = pk ? rec[pk] : null, kind = dgBase(g[0]);
        const attrs = Object.fromEntries(names.filter(c => !ours(c)).map(c => [c, rec[c]]));
        read.push([geom, src, { layer: table, fid, attrs, name: rec[nameCol] != null && rec[nameCol] !== '' ? String(rec[nameCol]) : `${table} ${fid ?? read.length + 1}`,
          shape: typeof rec[shapeCol] === 'string' ? rec[shapeCol] : `${g[0].startsWith('Multi') ? 'multi-part ' : ''}${named[kind]}` }]);
      }
      st.free();
    }
    if (!read.length) throw new Error(`it has no points, lines or polygons that can be read${skipped ? ` (${skipped} curved or unreadable shapes)` : ''}`);
    // shapes in the other hemisphere go with the other polar map
    const other = { 'EPSG:3413': 'EPSG:3031', 'EPSG:3031': 'EPSG:3413' }[viewCode], here = [], away = [];
    for (const [geom, src, props] of read) {
      const to = other && (ol.proj.transform(geom.getFirstCoordinate(), src, 'EPSG:4326')[1] < 0) !== (viewCode === 'EPSG:3031') ? other : viewCode;
      geom.transform(src, to);
      if (geom.getFlatCoordinates().some(v => !isFinite(v))) { skipped++; continue; }
      (to === viewCode ? here : away).push(new ol.Feature({ geometry: geom, n: ++dgCount, ...props }));
    }
    dgSource.addFeatures(here);
    if (away.length) dgStore[other] = [...(dgStore[other] || []), ...away];
    dgList(true);
    if (here.length) map.getView().fit(here.reduce((e, f) => ol.extent.extend(e, f.getGeometry().getExtent()), ol.extent.createEmpty()),
      { padding: [60, 60, 60, 60], maxZoom: 13, duration: 400 });
    if (!here.length && !away.length) throw new Error(`its coordinates could not be moved into the map's projection (${[...srsUsed].join(', ')})`);
    const layerNames = [...new Set(read.map(r => r[2].layer))];
    const shapes = k => `${k} shape${k === 1 ? '' : 's'}`;
    return `Opened ${shapes(here.length + away.length)} (layer${layerNames.length > 1 ? 's' : ''} ${layerNames.join(', ')}, in ${[...srsUsed].join(', ')}), with their fields.`
      + (away.length ? ` ${shapes(away.length)} ${away.length === 1 ? 'is' : 'are'} in the ${other === 'EPSG:3031' ? 'south' : 'north'}: switch hemisphere to see ${away.length === 1 ? 'it' : 'them'}.` : '')
      + (skipped ? ` Skipped ${skipped} curved or unreadable ${skipped === 1 ? 'shape' : 'shapes'}.` : '') + (empty ? ` Left out ${empty} ${empty === 1 ? 'row' : 'rows'} with no shape.` : '')
      + (flags.zm ? ' Heights (Z) and measures (M) were dropped.' : '') + ` ${dgEditNote}`;
  } finally {
    db.close();
  }
}
// the file name to save as: the one typed (made safe, with .gpkg), or the default
function dgFileName(srs, auto = false) {
  const typed = auto ? '' : $('dgName').value.trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\.gpkg$/i, '');
  return `${typed || `grimpShapes_EPSG${srs}_${new Date().toISOString().slice(0, 10)}`}.gpkg`;
}
$('dgCrs').addEventListener('change', () => dgList());
$('dgOpen').onclick = () => $('dgFile').click();
$('dgFile').onchange = async () => {
  const file = $('dgFile').files[0];
  $('dgFile').value = '';
  if (!file) return;
  if (dgDrawing()) stopDraw();
  $('dgNote').textContent = `Reading ${file.name}…`;
  try {
    $('dgNote').textContent = await dgOpen(file);
    if (!$('dgName').value.trim()) $('dgName').value = file.name.replace(/\.gpkg$/i, '');
  } catch (e) {
    $('dgNote').textContent = `Could not open ${file.name}: ${e.message}`;
  }
};
$('dgSave').onclick = async () => {
  if (dgDrawing()) stopDraw();
  $('dgNote').textContent = 'Writing the GeoPackage…';
  try {
    const latlon = $('dgCrs').value === '4326', srs = dgOutSrs(viewCode, latlon), bytes = await gpkgBytes(dgFeatures(), viewCode, latlon), name = dgFileName(srs);
    saveBlob(new Blob([bytes], { type: 'application/geopackage+sqlite3' }), name);
    $('dgNote').textContent = `Saved ${dgSource.getFeatures().length} shapes as ${name} (in EPSG:${srs}). ${dgEditNote}`;
  } catch (e) {
    $('dgNote').textContent = `Could not write the GeoPackage: ${e.message}`;
  }
};
