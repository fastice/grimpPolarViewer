// Your own outlines: GeoJSON, KML or GPX files dropped on the map or picked with Add outlines, drawn in
// one style (white lines on a dark casing, points as rings labelled with their name). Files stay in
// this browser tab only: they are not uploaded or shared. GeoJSON whose coordinates are larger than
// degrees is taken to be in its "crs" or else in the map's projection (polar stereographic metres);
// everything else is longitude/latitude. Each file is listed with Zoom and remove buttons, and is read
// again into the new projection when the hemisphere changes.
const outlineSource = new ol.source.Vector();
map.addLayer(new ol.layer.Vector({ source: outlineSource, zIndex: 5, style: f => {
  const t = f.getGeometry()?.getType(), point = t === 'Point' || t === 'MultiPoint', name = f.get('name');
  return [
    new ol.style.Style({ stroke: new ol.style.Stroke({ color: 'rgba(0, 0, 0, 0.6)', width: 4 }) }),
    new ol.style.Style({ stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 }), fill: new ol.style.Fill({ color: 'rgba(255, 255, 255, 0.08)' }),
      image: point ? new ol.style.Circle({ radius: 5, stroke: new ol.style.Stroke({ color: '#fff', width: 2 }), fill: new ol.style.Fill({ color: 'rgba(0, 0, 0, 0.4)' }) }) : undefined,
      text: point && name ? new ol.style.Text({ text: String(name), font: '12px system-ui, sans-serif', textAlign: 'left', offsetX: 9,
        fill: new ol.style.Fill({ color: '#fff' }), stroke: new ol.style.Stroke({ color: 'rgba(0, 0, 0, 0.85)', width: 3 }) }) : undefined }),
  ];
} }));
const outlineFiles = [];  // { name, text, kind, features }

function readOutline(text, name) {
  const ext = name.toLowerCase().split('.').pop(), opts = { featureProjection: viewCode };
  if (ext === 'kml' || /^\s*<\?xml[\s\S]{0,300}<kml|^\s*<kml/i.test(text)) return new ol.format.KML({ extractStyles: false }).readFeatures(text, opts);
  if (ext === 'gpx' || /^\s*<\?xml[\s\S]{0,300}<gpx|^\s*<gpx/i.test(text)) return new ol.format.GPX().readFeatures(text, opts);
  const json = JSON.parse(text), fmt = new ol.format.GeoJSON();
  let first = null;
  JSON.stringify(json, (k, v) => { if (first === null && k === 'coordinates') { first = v.flat(Infinity).slice(0, 2); } return v; });
  const metres = first && first.some(c => Math.abs(c) > 360), epsg = /EPSG:+(\d+)/i.exec(json.crs?.properties?.name || '')?.[1];
  return fmt.readFeatures(json, { featureProjection: viewCode, dataProjection: metres ? (`EPSG:${epsg}` in projDefs ? `EPSG:${epsg}` : viewCode) : 'EPSG:4326' });
}

function drawOutlineList() {
  $('olList').replaceChildren(...outlineFiles.map(o => {
    const li = document.createElement('li'), zoom = document.createElement('button'), rm = document.createElement('button');
    li.innerHTML = `<span>${esc(o.name)} <span class="note">(${o.features.length} feature${o.features.length === 1 ? '' : 's'})</span></span>`;
    zoom.type = rm.type = 'button'; zoom.className = rm.className = 'link';
    zoom.textContent = 'Zoom'; rm.innerHTML = '&times;'; rm.title = `Remove ${o.name}`; rm.setAttribute('aria-label', rm.title);
    zoom.onclick = () => zoomToOutline(o);
    rm.onclick = () => { outlineSource.removeFeatures(o.features); outlineFiles.splice(outlineFiles.indexOf(o), 1); drawOutlineList(); };
    li.append(zoom, rm);
    return li;
  }));
}
function zoomToOutline(o) {
  const e = ol.extent.createEmpty();
  for (const f of o.features) if (f.getGeometry()) ol.extent.extend(e, f.getGeometry().getExtent());
  if (!ol.extent.isEmpty(e)) map.getView().fit(ol.extent.buffer(e, Math.max(ol.extent.getWidth(e), ol.extent.getHeight(e), 2000) * 0.1), { duration: 300, maxZoom: 14 });
}

async function addOutlineFiles(files) {
  let last = null;
  for (const file of files) {
    try {
      const text = await file.text(), features = readOutline(text, file.name);
      if (!features.length) throw new Error('no features');
      const o = { name: file.name, text, features };
      outlineSource.addFeatures(features); outlineFiles.push(o); last = o;
    } catch (e) { setStatus(`Could not read ${file.name} (${e.message}); outlines can be GeoJSON, KML or GPX.`); }
  }
  drawOutlineList();
  if (last) zoomToOutline(last);
}

$('olAdd').onclick = () => $('olFile').click();
$('olFile').onchange = e => { addOutlineFiles([...e.target.files]); e.target.value = ''; };
const mapEl = map.getViewport();
mapEl.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
mapEl.addEventListener('drop', e => { if (e.dataTransfer.files.length) { e.preventDefault(); addOutlineFiles([...e.dataTransfer.files]); } });
map.on('change:view', () => {
  if (!outlineFiles.length) return;
  outlineSource.clear();
  for (const o of outlineFiles) { try { o.features = readOutline(o.text, o.name); } catch (e) { o.features = []; } outlineSource.addFeatures(o.features); }
  drawOutlineList();
});
