# GrIMP Polar Viewer

A browser viewer for GrIMP/NISAR ice products: cloud-optimized GeoTIFFs (COGs) described by a
stac-geoparquet catalog, drawn in polar stereographic. Written 2026-11-18.

- Live: <https://s3.kopah.uw.edu/ianj-grimp/public/viewer/index.html>
- Source: this repository. The app is one page, `index.html`, assembled from `src/` by
  `tools/buildViewer.sh`.

This is the reference and maintainer guide. The illustrated tour for users is the
[README](../README.md).

## Repository layout

| Path | What it is |
|---|---|
| `src/index.html` | The page: HTML, with `<!-- @include ... -->` lines where the CSS and JavaScript go. |
| `src/viewer.css` | The styles. |
| `src/js/*.js` | The script, in pieces by feature (`core`, `catalog`, `display`, `download`, `animation`, `staticAnomaly`, `timeSeries`, `timeSeriesPlot`, `compare`, `profile`, `profilePlot`, `names`, `search`, `fronts`, `boundaries`, `outlines`, `arrows`, `contours`, `frontPositions`, `ui`). |
| `src/data/` | Files the page reads at run time, deployed to `viewer/data/`: `greenlandGlacierNames.json`, `greenlandTermini.json`, `antarcticPlaceNames.json`, `antarcticBoundaries.json`, `antarcticIceFront.json`, `aseGroundingLines.json`, `greenlandBasins.json`. |
| `tools/buildViewer.sh` | Assembles `src/` into one `dist/index.html` (untracked). |
| `tools/deployViewer.sh` | Builds, stamps and uploads `index.html` to Kopah with s3cmd. |
| `tests/` | Headless browser tests (`tests/run.sh`). |
| `tools/makeBksParquet.py` | Catalog builder for the uncalibrated S1 backscatter mosaics (Greenland, Amundsen Sea; newest version per window). |
| `tools/makeSingleCogParquet.py` | One-item catalog for a single COG (e.g. a display mosaic). |
| `tools/makeGreenlandBasins.py` | Writes `src/data/greenlandBasins.json` from the Mouginot and Rignot (2019) basin shapefile. |
| `tools/makeIceFront.py` | Writes `src/data/antarcticIceFront.json` by dissolving the September 2026 GrIMP ice-mask outlines (`coastNotOcean_all.vrt`). |
| `tools/makeAseGroundingLines.py` | Writes `src/data/aseGroundingLines.json` from the NSIDC-0498 v2.1 GeoPackage (Amundsen Sea glaciers). |
| `tools/makeAntarcticBoundaries.py` | Writes `src/data/antarcticBoundaries.json` from the NSIDC-0709 v2 grounding line, IMBIE basin and ice shelf shapefiles. |
| `tools/makeAntarcticNames.py` | Writes `src/data/antarcticPlaceNames.json` from the SCAR Composite Gazetteer API (placenames.aq). |
| `tools/makeTermini.py` | Writes `src/data/greenlandTermini.json` from the NSIDC-0642 v2 terminus shapefiles. |
| `tools/makeGlacierNames.py` | Writes `src/data/greenlandGlacierNames.json` from the GGN v01 shapefile. |
| `tools/makeVelocityParquet.py` | Catalog builder for velocity mosaics (NSIDC-0766 6/12-day, Amundsen Sea quarterly/annual, NSIDC-0481 TSX sites with `--pattern`), one item per window directory. |
| `tools/guideScreenshots.mjs`, `tools/guideImages.py` | Regenerate the README images. |
| `kopah/publicReadPolicy.json` | Bucket policy: anonymous read of `public/*` only. |
| `kopah/cors.xml` | CORS rules so browsers on other sites can read the data. |
| `Documents/images/` | Screenshots and the animation used by the README. |

## Why a separate viewer

[stac-map](https://github.com/developmentseed/stac-map) (and Scott Henderson's GrIMP deployment
at <https://scottyhq.github.io/stac-map/>) draws with MapLibre, which offers only Web Mercator and a
globe. Both are north-up web maps: near the South Pole the view spins as you pan, and MapLibre will
not center the map past about ±85° latitude, so the Antarctic interior cannot be reached. This
viewer uses OpenLayers, which draws directly in EPSG:3031/3413, so the pole sits in the middle of the
map and every zoom level works. It reads the same stac-geoparquet catalogs, so the same files serve
both viewers.

## Using the viewer

### Opening a catalog

- **Northern / Southern** buttons pick the hemisphere; **Collections** lists that hemisphere's
  presets (the `presets` array in `src/js/core.js`). Switching hemisphere opens its first
  collection.
- **Catalog URL** loads any public `.parquet` catalog. The hemisphere follows the catalog's EPSG.
- Link parameters: `?href=<catalog URL>` opens a catalog; `&asset=<name>` picks the first asset shown
  (e.g. `browse`, `vx`). The browser Back button returns to the previous catalog.
- **Share this view** writes the whole view into the link (address bar, and clipboard where the browser
  allows) and says which. Its extra parameters apply only to the first catalog loaded:
  `item` (item id; otherwise the newest), `x`, `y`, `z` (map center in the catalog's projection, m, and
  zoom), `t0`, `t1` (time range, dates; left out for the full range), `lo`, `hi` (color range in display
  units, which wins over the clip slider once), `cmap` (only when one was picked), `op` (opacity, when
  below 1), `off` (`base`, `coast`, `foot`: layers turned off), `bg`, `bgi` (background catalog file name
  and item id, or `bg=none`; it replaces the session's saved background for that hemisphere) and `pts`
  (time-series points as `x,y;x,y` in m, without labels; the series are computed again on opening),
  `on` (optional layers ticked: `names`, `fronts`, `bounds`, `gl`, `arrows`, `particles`, `contour`; set
  before the catalog loads, so each layer's own refresh draws it), `clev` (contour levels, when not the
  default), `fy`, `gy` (fronts and grounding-line year ranges, when narrowed; applied by `yearSlider` from
  `startYears` when the slider is built), `coff` (Coastlines legend entries hidden), `pf` (drawn line `x,y;x,y`)
  or `flow`, `flen` (flow-line point, and m up (negative) and down; traced and accepted on opening), `yr`
  (travel-time step, when the marks are on) and `tsx=season` (time-series x axis by month).
  Anomalies, the crop box and download picks are not in the link.
- **Share this animation** (Animate section) adds `anim=1`, `area` (the area box, `x0,y0,x1,y1` in m,
  mosaics only), `astep` (days between frames), `ares` (frame resolution, m; kept if it still fits),
  `aanom=1` (anomaly), `arange` (anomaly range, only when typed), `abar=1` (color bar), `afps` and
  `aloop=0`. The link opens the Animate section with these set, scrolls the panel to it (again once the
  image is read, as the sections above fill in) and notes to click **Load frames**; it never loads the
  frames by itself.
- **QR code** (next to either share button) shows the same link as a QR code in a dialog (error
  correction M, 4-module white margin), with **Save image** (PNG). It uses `qrcode-generator` 1.4.4 from
  jsdelivr. A link too long for a QR code (over about 2,300 characters, in practice only with many
  points) gives a note instead. Checked by decoding the codes back to the link with zxing.

Each catalog opens on its newest item. The map keeps its zoom and position when the new catalog is in
the same projection and its extent overlaps the view; otherwise (first load, other hemisphere, or
nothing in view) it fits the catalog. The **⤢** button beside the zoom buttons (an OpenLayers
`ZoomToExtent` control) fits the footprints in the time range at any time. Items are listed below the panel; clicking a row or a
footprint shows it. Clicking repeatedly where footprints overlap steps back through the dates.

**Hide controls** (top left of the map) removes the panel so the map fills the window; **Controls**
brings it back.

### Phones and tablets

On screens narrower than 760 px the map sits on top with the panel in a scrolling strip below it;
**Hide controls** gives the map the whole screen. Touch screens have no hover, so a tap shows the
readout (top right on phones). A tap inside the product on the map only reads its value; a tap on
another footprint shows that product. The time-bar handles and ticks get larger touch targets.

### Time bar

The vertical bar at the left edge of the map has one tick per acquisition date (newest at the top).

- **Handles** (drag, or arrow keys) set the range of products. The list, footprints, anomaly, stack,
  animation and point plot all use that range.
- **Ticks** pick the date in focus without changing the range. If a product at that date covers
  the same place as the current one (e.g. the same TSX site), it is chosen; otherwise the newest
  product at that date. A tick outside the range widens the range to include it.
- **Reset** restores the full range.
- The bar sits in a faint dashed box, which marks where it takes clicks: points cannot be placed
  under it (pan the map to sample there).

### Color and values

- The **Color bar** section (file name, color bar, **Color map**, **Clip % (percentile stretch)** and
  **Min/Max**) collapses; it starts open. The clip is computed from a ~1000-pixel overview of the COG.
- Speed (`vv`) opens in viridis and other single-band assets in gray, until a color map is picked;
  after that the pick is kept (vx/vy still switch to blue-white-red and back).
- Stretch rules by asset name: `vv`, `ex`, `ey` start at a hard 0 (clip only the top); `vx`, `vy`
  are symmetric about 0 (±L, the larger tail at the clip %) and switch to the blue-white-red map;
  everything else clips both ends.
- RGB(A) assets (three or more bands, e.g. `browse`) are drawn as stored; the stretch controls hide.
  Three-band images without alpha (the velocity browse COGs) have a pure white (255, 255, 255)
  background, which is drawn transparent.
- **Hover readout** (bottom right; tap on touch screens): map x/y in km, latitude/longitude, and the value under the
  pointer read from the full-resolution COG (exact native value, with units). During an animation,
  anomaly or stack it reports that layer's value instead (for the stack, the mean and how many dates
  went into it).
- **Pixel size** (beside the scale bar, bottom left): the pixel size the map is drawing. For the
  product this is the COG level OpenLayers picks for the zoom (`getZForResolution` with the source's
  `zDirection`, as its WebGL tile renderer does): an overview such as `Pixels 3,200 m (overview; full
  200 m)` zoomed out, `Pixels 200 m (full resolution)` once zoomed in. During an animation, anomaly or
  stack it gives that grid's pixel size. The map zooms on without limit, so once a pixel is 1.5 or
  more screen pixels wide the label turns amber and says how far past full resolution the view is
  (`zoomed 6.3× past full resolution`).

### Anomaly and stack

**Anomaly and stack** (a collapsible section below the colors) appears when the displayed item has a
time series (see Catalog requirements). **Show as anomaly** shows the displayed date minus the per-pixel mean of every date in the series,
in blue-white-red, with a range of ±L: automatic (1% clip over all dates) or typed. **Earlier /
Later** step through the dates; ticks and list clicks also step while it is on. The series stack is
kept in memory, so stepping takes under a second. **Minus** picks what is subtracted: the mean (default)
or one date of the series, for a two-date difference. With a date, the automatic range is the larger 1%
tail of that one difference, and the note names both dates.

The anomaly is computed at the resolution chosen in its menu, over the **area box** if one is drawn
(**Draw box** on the section's Area row), otherwise the whole image or site. Whole mosaics therefore
show an overview grid; draw a box for full resolution (see Limits). The area box (cyan) is shared
with the animation and is separate from the download crop box (amber); **Whole image** clears it.
Both boxes are outlines only, so they do not tint the image.

**Show stack** (just below) shows the per-pixel mean of the dates in the time range instead, with
the normal stretch and color map (changing them recolors it). Each pixel averages the dates that
have data there (a plain, unweighted mean); the readout gives the mean and how many dates went into
it. It shares the anomaly's cached stack and resolution menu, so switching between the two is
immediate. Checked against GDAL on the nine annual speed mosaics: 688.49 m/yr at (-150, -2280) km on
the 1600 m grid, the same as the mean of the nine 1600 m overview pixels.

**Swipe: compare with another date** (`src/js/compare.js`) adds a second WebGL copy of the main
layer showing the date picked under **Left of the line** (same asset, stretch and color map, kept in
step as they change), clipped with a WebGL scissor to the left of a vertical line; the displayed date
shows to the right. The round handle drags the line (arrow keys move it 2%, Page Up/Down 10%), and
labels give both dates. It is hidden while an anomaly, stack or animation replaces the main layer.

### Time series at points

**Time series at points** (a collapsible section) appears when the displayed item has a time series
(not for RGB images). Each point is read at full resolution from every date of the series (one-pixel
reads, six at a time; the same values the hover readout gives) and plotted against the middle of each
product's date range, one color per point.

**Adding points**

- **Add points**, then click the map; each click adds a numbered marker. Collapsing the section, or
  clicking **Done adding**, stops adding.
- **Load points** reads a CSV or text file of positions, for extracting values at many sites:
  `lat`/`lon` columns (preferred), or `x`/`y` in the map's projection (`x_km`/`y_km`, `x_m`/`y_m`, or
  `x`/`y`, taken as metres when larger than 20000). The header is optional; without one, two numbers
  that fit lat/lon are read as lat, lon, otherwise as x, y. An optional `label`, `name`, `site` or
  `id` column names the points. Up to 100 points per file (but see Limits for the time this takes);
  repeated positions are dropped, and the map zooms out to show points outside the view. A saved
  CSV loads back (one point per position). Example:

  ```
  name,lat,lon
  Jakobshavn trunk,69.1317,-48.7640
  Upstream,69.20,-48.60
  ```
- **Clear points** removes them all. In the plot's legend (the numbered dots), a click on a number
  hides or shows that point (its series, earlier-catalog series and ITS_LIVE cloud; the number and
  map marker fade, the y range and CSV leave it out, and the state is kept when the catalog changes);
  the x beside it (screen only) removes the point and its marker, and removing the last one clears
  the plot as Clear points does. Point numbers are not reused. The catalog row of the legend (shown
  when earlier catalogs are kept) works the same way per catalog: a click hides or shows that
  catalog's series at every point (by catalog name, so it applies again if that catalog is loaded;
  Clear points resets it), and the x of an earlier catalog drops its series for the plotted asset
  from all points. Hidden catalogs are left out of the y range and the CSV.

**The plot**

- While values are read, a progress bar under the buttons shows the count and an estimate of the
  time left, and the plot fills in as values arrive. Values already read are cached, so changing
  the asset or the time range redraws quickly.
- **Only dates in the time range** follows the time-bar handles; untick it for every date.
- **Error bars** (1 sigma; off by default, since speed errors read four more files per date): `ex` for `vx`, `ey` for `vy`, and for speed
  $`\sigma_v = \sqrt{(v_x e_x)^2 + (v_y e_y)^2}/v`$ from the four component files.
- **Axes:** **Plot x axis follows the time-bar range** (on by default) limits the x axis to the time
  bar's handles; untick it to show every date plotted. **Plot y range** sets the y axis with two handles
  on one track (drag a handle, click the track to move the nearer one, or drag the band between them to
  shift the range keeping its height; arrow keys and Page Up/Down on a focused handle or the band); it spans the GrIMP values and the 1st-99th percentile of the ITS_LIVE values shown, plus half that
  span each way. **Auto** fits the GrIMP values again; a new asset or Clear points returns to Auto.
  Everything outside the axes is clipped.
- **Linked to the map:** a thin dashed line marks the displayed date and each point's value there is
  ringed, so clicking a time-bar tick moves the marker. Clicking a point on the plot shows that
  date's image, as if its tick were clicked.
- **Hide plot / Show plot** in the panel toggles the plot; its x also hides it.
- **Plot style:** lines and points (default), points only, or lines only; applies to the series of
  earlier collections too. The axes are titled with the asset and unit (y) and Date (x).
- **Moving and resizing:** drag the ✥ grip (top left) to move the plot anywhere over the map and the
  striped corner (bottom right) to resize it (at least 320 x 180 px, inside the map); double-click the
  grip to put it back. The plot sits above the time bar.

**Comparing**

- **ITS_LIVE in grey** (for vv, vx, vy) adds the ITS_LIVE image-pair velocities at the same points
  as a grey cloud behind the GrIMP series; each point's cloud has its own grey level, shown as a
  swatch under that point in the legend. The viewer fetches the ITS_LIVE datacube catalog
  (`its-live-data/datacubes/catalog_v02.json`, 7.6 MB, once), picks the cube in the map's projection
  that holds the point (so vx/vy are the same components), and reads the nearest 120 m pixel's full
  time series with zarrita 0.7.5 (about 2 s and 3 MB per point). **Pairs up to** limits the image
  separation (default 12 days, to match the 6/12-day products; ITS_LIVE pairs at Jakobshavn have a
  median separation of 125 days). The grey points are not in the CSV. Checked against xarray at two
  Jakobshavn points: 2040 pairs of 12 days or less and 16297 in all, identical.
- **Other GrIMP collections:** switching to a collection in the same projection keeps the points
  (e.g. annual to 6/12-day velocity). The new collection's values are read and drawn on top (filled
  circles, solid lines); the previous collection's series stay underneath as dashed lines with large
  hollow markers (squares, then triangles, diamonds), named in a legend line under the title. Only the
  asset plotted when leaving a collection is kept, and it shows while the same asset is plotted.
  Switching hemisphere clears the points.

**Saving**

- **Save CSV**: `point, label, x_km, y_km, lat, lon, item, start, end, asset, value, unit, error,
  collection`, one row per point and date, including earlier collections' rows.
- **Save plot**: a PNG at twice screen resolution, without the displayed-date marker.

Checked against GDAL at one point (2014-15 annual mosaic): speed 625.9329 m/yr and speed error
0.467258 m/yr, identical to `gdallocationinfo`; the 6/12-day series matches GDAL at its first and
last dates. Read times are under Limits.

### Profile along a line

**Profile along a line** (a collapsible section) appears for any single-band product. **Draw line**
takes two clicks, A then B (the click that ends the line does not also pick a footprint). The shown
asset is sampled at evenly spaced points from A to B, at the resolution level nearest 1/1000 of the
line length but never finer than the full image (a 42.6 km line on the 200 m annual mosaic: 214
samples, every 200 m), nearest pixel, read in windows of 256 samples so each read stays close to the
line. The plot is distance from A (km) against value, in its own movable, resizable window (it opens
near the top of the map, clear of the time-series plot).

- **Curves:** every product shown while the line is up adds a curve in the next point color: another
  date, or another catalog in the same projection (the line is kept when the catalog changes, as the
  points are). Showing a product already on the plot adds nothing. A different asset or a new line
  starts a new plot; **Clear line** removes both. The legend (newest 8 curves) gives each curve's
  dates, plus its catalog when the plot holds more than one; the shown product is drawn thickest and
  named in bold. A click on a legend entry hides or shows its curve (hidden entries fade; the y range
  follows the visible curves, or all of them when every one is hidden); hidden curves stay hidden
  when a flow line is trimmed, and are left out of the CSV and PNG. The x at the end of an entry
  (screen only, not in the PNG) removes the curve; showing that product again adds it back, and a new
  curve takes the first color not in use. The legend can be dragged anywhere inside the plot area
  (a press that moves less than 4 px is a click on an entry instead); its place is kept as fractions
  of the free room across and down, so it stays put through redraws and resizes, and the PNG uses it.
- **Plot x / y range** (appear with the first curve): two-handle sliders sharing the time-series y
  slider's code (`rangeSlider`: handles, band to pan, track click, arrow/Page keys). x spans the
  whole line in plotted km; y spans the automatic range and the 1st-99th percentile of the ITS_LIVE
  values in view, half a span beyond each. The automatic y range uses only samples inside the x
  range. A new or trimmed line resets x; another asset resets y; **Auto** resets either. The PNG
  uses the set ranges; the CSV always has the whole line.
- **ITS_LIVE in grey** (vv, vx, vy): the image pairs whose span (mid date ± half the separation)
  includes the shown product's central date, separation up to **Pairs up to** (default 12 d), one
  grey line per pair, sampled every 120 m from A (the cube pixel, nearest pixel; the cube for each sample
  comes from the same catalog as the point comparison, so a line can cross cube edges and pairs join
  up by mid date and separation). Datacube chunks hold about 20000 dates of 10 x 10 pixels, so a
  line reads every 1.2 km chunk it crosses, but only the time chunks holding matching pairs (2 of 5
  at Jakobshavn); the pixels read are kept, so other products along the same line reuse them.
  Sampling every 120 m reads hardly more than every 0.5 km did, since the chunks are 1.2 km. Measured:
  42.6 km line at Jakobshavn, June 2022 monthly product, 37 pairs of 30 d or less, 355 samples each,
  about 8 s. The cubes end 2025-05-28, so later products report no pairs and give the cubes' end date.
- **Annual products** (spanning 350-380 days) use the ITS_LIVE annual mosaic instead of pairs: the
  calendar year holding the product's central date (GrIMP Dec 2019-Nov 2020 -> ITS_LIVE 2020), from
  the 120 m COGs `its-live-data/velocity_mosaic/v2/annual/cog/ITS_LIVE_velocity_120m_<region>_<year>_v02_<v|vx|vy>.tif`
  (region RGI05A in EPSG:3413, RGI19A in EPSG:3031; other projections have none). It is read exactly
  like a GrIMP asset (same sampling rule) and drawn as one dashed grey line; **Pairs up to** is
  disabled. A HEAD request finds whether the year exists; the mosaics run 1984-2022, so later years
  report "no annual mosaic". Checked: the middle sample of the 2020 line is 416.27319 m/yr in the
  viewer and from `gdallocationinfo` on the COG.
- **Save CSV:** `source, collection, item, start, end, asset, unit, distance_km, x_km, y_km, lat, lon,
  value`, one row per sample of every GrIMP curve shown (empty value where there is no data).
  ITS_LIVE samples are not saved (since 2026-11-21): data that are not GrIMP products are shown for
  comparison only, never exported, and the same holds for the names, fronts and boundary layers.
  **Save plot:** a PNG at twice screen resolution.

**Flow line** (point, then two-handle slider):

- **Trace:** one click places the point; the line is traced from it upstream and downstream on the
  newest annual velocity mosaic in the map's projection (`nsidc-0725` in EPSG:3413, `ase-annual` in
  EPSG:3031, catalog read once), whatever product is shown, so every product is compared along the
  same path. If that catalog is unavailable or gives no flow at the point, the loaded catalog's
  velocity items covering the point are tried, longest averaging period first (newest first among
  equals, at most 3). Steps are one pixel (200 m GL, 250 m ASE) of midpoint (RK2) integration of the
  unit flow direction, bilinear vx/vy between pixel centres from full-resolution 256 x 256 tiles read
  as the trace reaches them; a direction stops where data end, speed falls below 1 m/yr, the
  direction turns back, or after 150 km. Tracing takes under 1 s (150 km up, 17 km down at
  Jakobshavn).
- **Nudge, then accept:** the new point can be dragged (OpenLayers Translate); each move traces again
  (a move during a trace queues one more), drawing only the map line. **Use this line** reads the
  products along it; **Adjust point** turns dragging back on, and the next **Use this line** reads
  the products on the plot again along the new line.
- **Slider:** two range inputs over one track, from the traced upstream length (left, negative) to
  the traced downstream length; the handles stay either side of the point and start at 25 km each
  way. Dragging trims only the map line; letting go re-reads the plot's products along the trimmed
  line (the trace itself is kept). Lengths asked for are remembered across nudges and clipped to
  what each trace reaches.
- **Plot and CSV:** x is distance downstream of the point (negative upstream), with the point
  marked by a dashed line; `distance_km` in the CSV is the same. The sampling rule is that of a
  straight line, applied to the trimmed path. Checked: the middle sample of a nudged Jakobshavn
  flow line (60 km up, 5 km down) is 434.94086 m/yr in the viewer and from `gdallocationinfo`.

Checked against GDAL: the middle sample of the 2024-25 annual speed line (x -176.123 km,
y -2277.678 km) is 294.27005 m/yr in the viewer and from `gdallocationinfo`.

### Animation

**Animate time series** appears only when the displayed item has a time series.

1. Optionally draw a box (**Draw box** on the Area row; the same cyan area box as the anomaly and
   stack, not the download crop; mosaics only, sites are animated whole).
2. Optional: **At least N days between frames** skips dates so frames are at least that far apart
   (window start to window start). In a mix of 6- and 12-day products the closely spaced ones drop
   first: 12 days keeps 356 of the 516 NSIDC-0766 windows, 24 days 178, 90 days 46. Fewer frames
   allow a finer resolution.
3. Pick a frame resolution (a new area starts at the finest level that fits).
4. Optional: **Anomaly** (frames minus the mean of the frames; **Anomaly range ±** recolors loaded frames
   at once) and **Color bar** (burned into the frames).
5. **Load frames**, then **Play/Pause**, the frame slider, speed and loop. The time bar follows.
6. **Save movie** writes an H.264 MP4 that opens in QuickTime. No-data areas are black in the movie.

Every frame uses the color range and color map in force when the frames are loaded, so frames are
directly comparable; changing either asks for a reload.

### Downloads

The **Download** section collapses (it starts collapsed); the product list and its pick boxes below it
show only while it is open.

- **Assets (one file each)** with an **All** box choose what to download.
- **Download this product's assets** saves the ticked assets' original COGs of the displayed item: from NSIDC when a CMR search
  (started when the item is shown, matched by file name) finds them for the collection's exact version
  (collection id `nsidc-<number>-v<version>`), so the browser goes through the Earthdata login; otherwise
  from Kopah. A crop of an item at NSIDC saves a download file instead (NSIDC files cannot be read
  cross-site).
- **Save download file** covers picked items, or every item in the time range (for site products,
  the displayed site's items; picks must be from one site). It saves `<collection>[_<site>]_<date>.grimp.yaml`
  (JSON) naming each item's files (paths under the Kopah root, so no ready-made links), the assets and the crop box and resolution, for the
  `grimpdownload` command in this repository's `grimppolarviewer` package, which reads each file from
  NSIDC when NSIDC holds that exact file (matched by name) and from Kopah otherwise.
  See [grimpDownload.md](grimpDownload.md).
- **Crop to a box** (mosaics only): draw a box (amber; separate from the cyan area box of the anomaly,
  stack and animation), choose a resolution (levels over 64 Mpx are
  disabled) and the buttons save cropped GeoTIFFs, cut in the browser. Single-band products are
  written as float32 in physical units (e.g. dB) with nodata kept; RGB as 8-bit RGB. Selections are
  cropped by `grimpdownload`, not in the browser.
- **Site products** (median footprint under 100 km across, e.g. NSIDC-0481 TSX boxes) get a
  **Download sites** section instead: no crop, one site box per download file (the displayed site's
  dates in the time range, or dates picked from one site with the list checkboxes or
  Shift/Ctrl/Cmd-click on a box). The old **Select all sites** box is hidden.

## Catalog requirements

Catalogs are stac-geoparquet files, as written by `rustac` (used by `tools/`). The viewer reads:

| Field | Use |
|---|---|
| `id` | List label, download names. |
| `start_datetime`, `end_datetime` (or `datetime`) | Time bar, labels. |
| `proj:epsg` | Map projection: 3031 or 3413 (others fall back to Web Mercator with OpenStreetMap). |
| `geometry` (WKB, geoarrow) | Footprint in lon/lat. |
| `proj:geometry` | Footprint in the projection, used when it decodes as GeoJSON (better at the pole). |
| `assets.<name>.href`, `.type` | COG assets: `.tif` or a `tiff` media type. |
| `assets.<name>.raster:bands[0]` | `nodata`, `scale`, `offset`, `unit`, `statistics` (first stretch before the overview loads). Three or more bands mean RGB. |

A **time series** is the set of items in the current time range whose footprint overlaps the
displayed item's footprint by at least 50% and that have the same asset. Every image in a mosaic
catalog is one series; each TSX site is its own series. Point time series in a site collection are
the exception: each point reads every item in the range whose footprint contains it, so points can be
at different sites, and unless the displayed item has data at a point, adding (or loading) points shows
the newest item with data at the first such point (the pixel is read, since overlapping boxes often put
a point in another frame's no-data area), so the orange box is the site the animation uses. A point inside no box is
reported in the note. Until a box is picked, the status line asks for one.

COGs must be tiled with overviews. The viewer and the crop/anomaly/animation tools read only the
tiles and overview levels they need, using HTTP range requests.

## Making and publishing catalogs

Needs `rio_stac` and `rustac` (`~/miniforge3/bin/pip install rustac`; `rio_stac` was already there).

```bash
# One year of uncalibrated S1 backscatter mosaics (windows overlapping the year).
python tools/makeBksParquet.py 2024 nsidc-0723.parquet

# Every Amundsen Sea backscatter window (newest version in each).
python tools/makeBksParquet.py all ase-backscatter.parquet \
    --releaseRoot /Volumes/insar10/ian/SentinelPIG/Release/mosaics/uncalibrated \
    --baseUrl https://s3.kopah.uw.edu/ianj-grimp/public/pig/backscatter/v04 --collection ase-s1bks-v4

# 6/12-day velocity (NSIDC-0766 v3): one item per window directory; list every window each time.
python tools/makeVelocityParquet.py nsidc-0766.parquet \
    /Volumes/insar9/ian/Sentinel1/Release/sixDayVelocities/Vel-2026-09-07.2026-09-18

# Greenland annual (quarterly and monthly the same with 0727/quarterlyMosaics, 0731/monthlyMosaics;
# monthly 2020-03 failed in the 11-19 run and was rebuilt separately, so list dirs, not run.log).
python tools/makeVelocityParquet.py nsidc-0725.parquet /Volumes/insar9/ian/Sentinel1/Release/annualMosaics/Vel-* \
    --baseUrl https://s3.kopah.uw.edu/ianj-grimp/public/nsidc-0725/v06 --collection nsidc-0725-v6

# Amundsen Sea (PIG) quarterly; annual is the same with annual in place of quarterly.
python tools/makeVelocityParquet.py ase-quarterly.parquet /Volumes/insar10/ian/SentinelPIG/Release/quarterly/Vel-* \
    --baseUrl https://s3.kopah.uw.edu/ianj-grimp/public/pig/quarterly --collection ase-vel-quarterly

# TSX glacier sites (NSIDC-0481 v5, full release): one item per Vel.<d1>.<d2> product dir, from the
# TSX root (skip intermediate/); the site code goes into grimp:site. All 9 files of each product are
# uploaded (5 COGs plus .jpg/.meta/.premet/.spo); the catalog lists the 5 COGs.
cd /Volumes/insar4/ian/TSX
python tools/makeVelocityParquet.py nsidc-0481.parquet \
    $(ls -d */release/Version5-all-through-November2026/*/Vel.* | grep -v /intermediate/) \
    --pattern 'TSX_*_v*.tif' --baseUrl https://s3.kopah.uw.edu/ianj-grimp/public/nsidc-0481/v05 \
    --collection nsidc-0481-v5

# A single COG, e.g. a display mosaic.
python tools/makeSingleCogParquet.py <file.tif> https://s3.kopah.uw.edu/ianj-grimp/public/display \
    2026-08-29 2026-09-18 nisar-gcov-ant-25m.parquet --collection nisar-gcov-ant-25m-display \
    --asset gamma0 --title 'gamma0 (25m)'
```

Upload the COGs to the URL the catalog points at, then the catalog, with explicit content types:

```bash
s3cmd put --mime-type='image/tiff; application=geotiff; profile=cloud-optimized' \
    --multipart-chunk-size-mb=100 *.tif s3://ianj-grimp/public/nsidc-0723/v04/
s3cmd put --mime-type=application/vnd.apache.parquet --add-header='Cache-Control: no-cache' nsidc-0723.parquet s3://ianj-grimp/public/nsidc-0723/v04/
```

Measured upload rates from helheim: 62 MB/s averaged over 95.5 GB, about 90 MB/s on a single large
file.

## Hosting on Kopah

UW-IT Kopah is S3-compatible object storage (`https://s3.kopah.uw.edu`, ~$5/TB/month, no egress
fees, not backed up). Credentials live in `~/.s3cfg` (s3cmd); `/home/ian` is shared, so it works
on every host.

- **Bucket `ianj-grimp`:** anything under `public/` is readable by anyone with the URL
  (`kopah/publicReadPolicy.json`); everything else is private, and listing is private (403).
  Apply with `s3cmd setpolicy kopah/publicReadPolicy.json s3://ianj-grimp`.
- **CORS** (`kopah/cors.xml`, `s3cmd setcors kopah/cors.xml s3://ianj-grimp`) lets pages on other
  sites, such as stac-map on github.io, read the data and make range requests.
- **Layout:** `public/viewer/index.html` (the viewer), `public/nsidc-0723/v04/` (Greenland backscatter, 2020 on),
  `public/nsidc-0766/v03/` (Greenland 6/12-day velocity, 516 windows, 409 GB),
  `public/nsidc-0725/v06/`, `public/nsidc-0727/v06/`, `public/nsidc-0731/v06/` (Greenland annual,
  quarterly and monthly velocity; rebuilt 2026-11-19 with the floating-point predictor),
  `public/pig/quarterly/` and `public/pig/annual/` (Amundsen Sea velocity, 12 GB),
  `public/pig/backscatter/v04/` (Amundsen Sea S1 backscatter, 524 windows to 2026-02-13, 256 GB),
  `public/nsidc-0481/v05/` (TSX glacier sites, full v5 release, 4996 products 2008-2026, 19 GB),
  `public/display/` (one-off display products). Scott's presets point at his `gaia` bucket.
- **Deploy** the viewer with `tools/deployViewer.sh`. It uploads as `text/html` with
  `Cache-Control: no-cache` and replaces `build dev` under the title with the UTC time and git
  commit, so the live version is visible on the page.
- **Maintenance:** Kopah is offline the second Tuesday of each month, 9 a.m.-5 p.m. Pacific, and for
  24 hours (to 9 a.m. the next day) in January, April, July and October. The viewer shows these
  hours and warns during a window, but because the page itself is on Kopah, it cannot load at all
  during an outage. Hosting the built `index.html` elsewhere (e.g. GitHub Pages) would
  let the warning reach visitors.
- **No download logging.** Kopah refuses S3 bucket logging (`PutBucketLogging` returns 405), and
  UW-IT confirms it has none. Counting downloads would need a service in front of Kopah (e.g.
  Cloudflare) or a small counter endpoint; letting browsers write to the bucket directly is not
  safe. For the official products, NSIDC's download counts are the reference.

## How it works

Everything runs in the browser; there is no server-side code.

| Piece | Library (pinned on jsDelivr) |
|---|---|
| Map, projections, COG tiles (WebGL) | OpenLayers 10.11.0 (`ol.js` full build) |
| COG reading for clip, crops, frames, readout | geotiff.js 3.1.0-beta.0 (the version OpenLayers 10.11 requires) |
| ITS_LIVE datacube reads (point plot, on demand) | zarrita 0.7.5 |
| Projection definitions | proj4 2.22.0 |
| Catalog reading | hyparquet 1.32.0 + hyparquet-compressors 1.1.2 (ZSTD for Scott's catalogs) |
| MP4 packaging | mp4-muxer 5.2.2 with the browser's WebCodecs H.264 encoder |
| Basemap | NASA GIBS WMS (`BlueMarble_ShadedRelief_Bathymetry`, `Coastlines`). The GIBS coastline is not used in Antarctica (EPSG:3031): it misplaces the grounding lines and ice fronts, so there the Coastlines box draws the NSIDC-0709 grounding line and 2026 ice-mask front instead (`coastVecLayer` in `boundaries.js`, see Antarctic boundaries). Antarctic Coastlines is on by default, so `antarcticBoundaries.json` and `antarcticIceFront.json` (2.6 MB) now load with every Antarctic view (Ian, 2026-11-22). |
| Flow arrows | The shown item's `vx`/`vy`, read with the animation's `readFrame` on a grid every 44 screen px (fixed in map coordinates) from the overview level nearest the grid spacing, after every move. Length 30-100% of 0.8 cell, log speed from 5 m/yr to the 95th percentile in view; none below 5 m/yr (rock noise near Jakobshavn is 1-4 m/yr). Vector layer, white on a dark outline. Directions are in the product grid, which is the map projection. |
| Flow particles | In `arrows.js`: the shown item's `vx`/`vy` read with `readFrame` on a screen-aligned grid every 4 px after every move; up to 3000 particles (one per 300 screen px2) start on cells at least 5 m/yr and live 100 frames. Each frame moves them linearly with speed (the 95th percentile in view moves 2 px a frame; screen y is map -y) and fades the trails (`destination-in`, alpha 0.92). Drawn on a canvas inserted in the OpenLayers viewport above the layers (`canvas.particles`; its rule must out-rank OpenLayers' `.ol-viewport canvas { all: unset }`), cleared on `movestart`. Every 30 frames alpha below 8 is cleared, since `destination-in` rounds alpha of 6 or less back to itself and the trails would leave a haze. **Save particle movie** (`saveParticleMovie`): a still of the map (the `.ol-layer` canvases composited as OpenLayers' export example does, after `rendercomplete`) under 300 particle frames, H.264 via `pickH264` (shared with the animation export) and mp4-muxer. It loops: in loop mode (`moveParticles({ t, cycles })`) particle q starts at `q.seeds[n % cycles]` when `t + q.phase` is a multiple of the 100-frame life and waits there if it leaves the data, 200 frames run in first, and the residue is cleared every frame, so the canvas after frame 299 equals the one before frame 0 exactly. The encoder is fed the loop's last 30 frames first (chunks dropped, `firstTimestampBehavior: 'offset'`) so its rate control has settled at the key frame that starts the file; there is no other key frame (each flickers on a still background). |
| Speed contours | `contours.js`: the shown item's `vv` read with `readFrame` on a grid every 3 screen px (fixed in map coordinates), 3 x 3 NaN-aware mean, then marching squares (`isolines`: saddles split by the cell mean, segments joined through their shared edge crossings into lines and loops) at the typed levels (`contourLevels`, at most 12). Lines under 6 points are dropped. Vector layer, z-index 4, labels along the lines (`placement: 'line'`, repeat 350 px), decluttered. |
| Velocity error readout | `readoutError` in `ui.js`: the same 1-sigma as the time-series error bars (ex/ey; for vv from vx, vy, ex, ey), read uncached one pixel at a time through `pixelValue` (`pointValue` caches; hover positions never repeat). |
| Seasonal time-series plot | `tsXMode` in `drawTsPlot`: x is the fraction of the calendar year of each product's central date; each year's values are joined in its color on the front ramp (`rampColor` over the years plotted), markers keep the point colors (with one point shown: year-colored, ringed in the point color), earlier catalogs are markers only. Year lines are 2.8 px (selected 4.5) on a grey casing, so the pale middle of the ramp shows on a light panel. A thick (3.8 px) `--fg` line joins each point's mean per calendar month (`p.monthMean`; broken at months without data; point-colored squares when several points are shown). The year of the product shown (picked by clicking a value, as on the date plot) is drawn last, 3 px wide and labeled, the other years at 30% opacity. The time-bar x option is disabled. |
| Typed flow-line point | `parseFlowPoint` in `profilePlot.js`: two numbers, lat, lon (signs or N/S/E/W, either order with letters) or, with `km`/`m` in the text, x, y in the map projection (metres when over 20000); the map centers on it when out of view, then `newFlowProfile` as for a click. |
| Travel-time marks | `traceOn` records the time of each one-pixel step (pixel / midpoint speed), so `pfFlow.years` holds the years of travel from the point to every path point (negative upstream). `travelMarks` interpolates the positions of +/- n x step years inside the trimmed line (at most 200 each way), as yellow dots in `pfSource` (labeled each when 12 or fewer, else every 5th) and ticks along the bottom of the profile plot (`pfMarks`). Steady flow at the traced mosaic's speeds. |
| Fronts along the line | `frontPositions.js`: segment intersections of the drawn fronts / dated grounding lines (in their slider years) with `pfLine`, as plotted km, refreshed once a frame when the line, the layers or their year ranges change. Their own floating plot (date vs km, circles for fronts, triangles for grounding lines, year colors) with a PNG but no CSV (display-only data), and ticks along the top of the profile plot. Undated grounding lines are placed at 1 July of their year. |
| Glacier fronts | NSIDC-0642 v2, MEaSUREs Annual Greenland Outlet Glacier Terminus Positions from SAR Mosaics, <https://doi.org/10.5067/ESFWE11AVFKW>: 50 winter files (1972-73 to 2020-21), downloaded from NSIDC 2026-11-21 and converted by `tools/makeTermini.py` (Douglas-Peucker 15 m, metre coordinates) to `data/greenlandTermini.json` (5582 fronts, 110,616 vertices, 2.0 MB, read when first ticked). Colored by winter on a blue-to-red ramp (`frontColors`) with a dark casing; the readout lists the dates of fronts within 3 px (or their span when more than 3 overlap). NSIDC-0642 v2 ends in 2021. Two handles over the color bar (`yearSlider` in `fronts.js`, shared with the dated grounding lines: two range inputs on a `.dual.yr` track that is the bar itself, shaded outside the range, larger under `pointer: coarse`; the outlined `<key>Band` between the handles drags both by whole years, keeping the span, like the plot range sliders) pick the winters drawn (`frontsSel`/`glSel`; the style returns null outside, so hidden lines are not in the readout either). The ramp keeps spanning all years. The share link carries the range (`fy`/`gy`). |
| Antarctic boundaries | From the University of California, Irvine (UCI AIV): NSIDC-0709 v2, MEaSUREs Antarctic Boundaries for IPY 2007-2009 from Satellite Radar, <https://doi.org/10.5067/AXE4121732AD>: GroundingLine, Basins_IMBIE and IceShelf shapefiles downloaded from NSIDC 2026-11-21, converted by `tools/makeAntarcticBoundaries.py` (Douglas-Peucker 100 m, EPSG:3031 metres) to `data/antarcticBoundaries.json` (134,000 vertices, 2.2 MB, read when first ticked). Drawn as outlines (polygon rings as lines) behind three boxes (2026-11-22; before that one Boundaries box with legend toggles): **Coastlines** in Antarctica draws the grounding line (white) and the ice front (cyan) with the ice shelf names finer than 1500 m/pixel (`coastVecLayer`, z-index 4, in place of the GIBS coastline; its legend entries hide either line, `coastOff`); **Basins** draws the IMBIE basins dashed yellow with their labels (`boundsLayer`); both share one source per projection. Labels sit at the middle of each feature's largest ring, decluttered. NSIDC-0709's own ice shelf outlines are NOT drawn (their fronts are 2008-09); the ice front (cyan) is the September 2026 GrIMP Antarctic ice mask outline instead: the 223 hand-edited pieces of `Antarctica2026/AntarcticaMasks/maskShapesSeptember2026/coastNotOcean_all.vrt` (the outlines `makeIceMask.py` rasterizes) dissolved by `tools/makeIceFront.py` (300 m closing to bridge the Amundsen box gaps, so the sector cuts vanish; 50 m simplification) into 191 rings, 25,232 vertices, 0.41 MB; 100.0% of the vertices lie within 500 m of an edge of `antarcticaIceMaskSeptember2026_250m.tif`. Rebuild it when the mask outlines change. Display only, like every non-GrIMP layer. With it, the dated Amundsen Sea grounding lines: NSIDC-0498 v2.1, MEaSUREs Antarctic Grounding Line from Differential Satellite Radar Interferometry, <https://doi.org/10.5067/IKBWW4RYHF1Q> (`InSAR_GL_Antarctica_v02.1.gpkg`, 27 MB, downloaded 2026-11-21), kept by `tools/makeAseGroundingLines.py` for the ASE glaciers (`aseGlaciers` names within the ASE box), simplified 30 m, one entry per source line with its pieces: 466 lines, 194,443 vertices, 3.3 MB, read when **Dated grounding lines** (its own box, Antarctica only) is first ticked. Dated by the first image date in the DInSAR file name where it carries one (most 2016 and later lines), else the year; colored by year on the glacier-front ramp (`rampColor`), drawn over the composite line; the readout lists the dates, glacier and sensors within 3 px. |
| Greenland basins | From the University of California, Irvine (UCI): Mouginot and Rignot (2019), Glacier catchments/basins for the Greenland Ice Sheet, Dryad, <https://doi.org/10.7280/D1WT11>: `Greenland_Basins_PS_v1.4.2.shp` (260 basins in 7 regions, EPSG:3413), downloaded 2026-11-21 by Ian (Dryad refuses scripted downloads) to `/Volumes/insar9/ian/Sentinel1/GreenlandBasins_Mouginot2019/`, converted by `tools/makeGreenlandBasins.py` (shares `readLayer` with `makeAntarcticBoundaries.py`; Douglas-Peucker 100 m; drops the seven `ICE_CAPS_<region>` peripheral ice-cap features and rings under 10 km2, whose thousands of island and nunatak rings speckled the coast) to `data/greenlandBasins.json` (251 basins, 51,375 vertices, 0.83 MB, read when Basins is first ticked in Greenland). Drawn as the Antarctic basins (dashed yellow) but unlabeled: the converter writes empty names, and the Glacier names layer labels the glaciers (Ian, 2026-11-21). Basins keeps one source per projection (`boundsSets`). Display only. |
| Basin areas | `basinNote` in `boundaries.js`: the basin under the pointer (inside an odd number of its rings) and its true WGS84 area, from Green's theorem about the pole: the sum over each ring of the true polar-cap area out to each vertex (authalic latitude) times the angle turned about the pole, signed by ring nesting. Exact for the projection scale; checked against pyproj `Geod.polygon_area_perimeter` (within 0.004%). The polar stereographic map area is given beside it. Cached on the feature. |
| Your own outlines | `src/js/outlines.js`: GeoJSON, KML (its styles ignored) or GPX dropped on the map or picked with Add outlines, read in the browser with OpenLayers' formats into one vector layer (white on a dark casing; named points labelled). GeoJSON coordinates larger than 360 are taken as metres in the `crs` EPSG code if the viewer knows it, else in the map projection; otherwise lon/lat. The file text is kept so the features are read again into a new projection. Nothing is uploaded or shared. |
| Place search | `src/js/search.js`: a Search button at the top right of the map that opens a box (collapsed at start, after a pick and on Escape; the marker stays). Per projection a name list (`searchSets`; Greenland: the glacier-name file, shared with Glacier names, every name field searchable; Antarctica: `data/antarcticPlaceNames.json`, 3802 places (8038 names, 0.2 MB) of 27 feature types from the SCAR Composite Gazetteer, fetched 2026-11-21 by `tools/makeAntarcticNames.py`, grouped by place with the majority name as the label and every country's name searchable). Case and accents folded (NFD, æ→ae, ø→o); score exact < prefix < word prefix < substring, then major < outlet < local glacier (Greenland) or ice shelf/stream, glacier, station and region types first, more naming countries first (Antarctica); 8 results. Picking one zooms to it (400 m/pixel or closer) with a pink marker (13.5 px circle) and label, cleared by the × or a change of projection. |
| Glacier names (Antarctica) | The SCAR selection shared with place search (`loadAntarcticNames`), 3820 places in three tiers: zoomed out only the file's `major` list (80 entries keyed `label@lon,lat`, chosen in `tools/makeAntarcticNames.py`; a shared name goes to the place more gazetteers name, e.g. the Amundsen Sea Smith Glacier), then `namesMidTypes` (glacier, ice stream, ice shelf, station, land, coast, sea, ice sheet, dome, ice rise), then all below 400 m/pixel. SCAR types Rutford, Foundation, Institute and Bailey Ice Streams as Watercourse; the tool keeps Watercourse entries named Ice Stream or Glacier. Labels left-aligned. |
| Glacier names | Greenland Glacier Names GGN v01 (Bjørk, A. A., et al. (2015), Brief communication: Getting Greenland's glaciers right, a new data set of all official Greenlandic glacier names, *The Cryosphere*, 9, 2215-2218, <https://doi.org/10.5194/tc-9-2215-2015>), 732 glaciers, converted by `tools/makeGlacierNames.py` from `/Volumes/insar9/ian/Sentinel1/GreenlandGlacierNames_GGNv01_WGS84/` to `data/greenlandGlacierNames.json` (66 KB, read when first ticked). Labels: official name plus a differing foreign name. Coarser than 1500 m/pixel only the 19 `major` glaciers (listed in the tool), then every `GrIS` outlet, and `LGIC` local glaciers finer than 400 m/pixel; OpenLayers declutter drops overlaps. Labels go left of glaciers west of a mid-Greenland longitude (by latitude, `namesMidLon`) and right of those east of it, to keep them over the ocean. Each entry also keeps the new/old Greenlandic and alternative names. Plus one supplementary entry not in GGN v01: `SUP0001` Nioghalvfjerdsbræ (79 North Glacier; also 79N, Nioghalvfjerdsfjorden Glacier) at the NSIDC-0642 v2 glacier 211 position (79.565 N, 20.27 W, unnamed there), major tier (`supplements` in `tools/makeGlacierNames.py`). |
| Background image | Any preset whose title contains "backscatter" or "gamma0", for the current hemisphere; one item drawn in gray (catalog mean +/- 2 sigma stretch) between Blue Marble and the main layer; collection and item kept per hemisphere in `sessionStorage` (`grimpBackgroundN`/`S`) |

The displayed image is rendered on the GPU from the COG tiles (WebGL). Crops, animation frames, the
anomaly and the stack are computed on the CPU: each date is read at the chosen level, resampled
(nearest neighbor) onto a common grid over the area, and colorized into a canvas that is shown as a
static image layer. Limits: 2.5 Mpx per frame; per series 120 Mpx on laptops and desktops and
40 Mpx on phones and tablets (a coarse pointer) or devices reporting under 4 GB of memory, since
every frame stays in memory (a 75 Mpx whole-Greenland animation used about 535 MB); 64 Mpx per crop.
These are the viewer's own limits (`maxFramePixels`, `maxAnimPixels`), not the browser's.

## Limits and known issues

- **WebGL is required** for the main image. The anomaly and animation layers and all other
  controls work without it (they were tested in a browser without WebGL); the main image was not.
- **Anomaly, stack and animation are at overview resolution for whole mosaics.** Full resolution needs a
  box that fits the limits, e.g. about 316 km across for the 200 m annual velocity (9 dates) and
  about 28 km for 25 m backscatter (31 dates). Full resolution at any zoom would need GPU band math
  across all dates per tile.
- **Point reads scale with points x dates x files.** Each date is one file for a value, five with
  speed error bars (vv, vx, vy, ex, ey), and each read fetches the tile around the pixel. Measured:
  3 points over the 9 annual mosaics in about 4 s; 1 point over the 516 six-day windows (with error
  bars, 2580 files) in about 1 minute; 2 points in about 3 minutes. A 100-point file on the 6/12-day
  series would take well over an hour, so narrow the time range or leave Error bars off.
- **On touch screens a tap reads the value,** so tapping cannot step through overlapping dates;
  use the time bar or the item list.
- `mp4-muxer` is superseded by Mediabunny, and geotiff.js 3.1 is a beta pinned to match OpenLayers.
  Both work as pinned; revisit when upgrading OpenLayers.
- Catalogs written by `tools/` differ slightly from Scott's: no `type` column, and `proj:*` fields at
  item level rather than per asset. stac-map and this viewer read both.
- Movie export needs a browser with WebCodecs H.264 encoding (recent Chrome, Edge, Safari 16.4+,
  Firefox 130+).

## Development

Edit the files in `src/`, build, and test the page from a local web server (the data come from Kopah,
whose CORS allows any origin):

```bash
tools/buildViewer.sh
cd dist && python -m http.server 8000
```

Then open `http://localhost:8000/index.html?href=<catalog URL>`. Deploy with
`tools/deployViewer.sh` once it works, and check the build stamp under the title.

**Adding a collection to the menu:** append `[title, catalog URL, 'N' or 'S']` to the `presets`
array in `src/js/core.js`, then deploy.

**Source layout:** the build only concatenates. Each `<!-- @include path -->` line of `src/index.html` is
replaced by that file, so the `src/js/` pieces are still one module sharing one scope, in the order
listed: a top-level name declared in one piece is visible in all of them, and must be unique across
them. Split 2026-11-21 from the single `index.html` (the build reproduced it byte for byte).

**Tests:** `tests/run.sh` builds the page with a test hook (it adds the profile and time-series state
to `window.grimpViewer`), serves it on 127.0.0.1 and runs each `tests/*.test.mjs` in headless Chrome;
`tests/run.sh flowLine.test.mjs` runs one. They read data from Kopah, install puppeteer-core into
`tests/node_modules` on the first run, and run four at a time (`JOBS=4`, each test's output printed when
it ends; the whole suite takes about 3 minutes; `JOBS=1` runs them one by one, streaming the output). Each check prints `ok` or `FAIL`; the
script exits 1 if any failed, and screenshots go to `tests/out/`. Set `CHROME` to the Chrome binary
on a Mac (default `/usr/bin/google-chrome`); `mapOverlays.test.mjs` also needs `ffmpeg` on the PATH.

| Test | Covers |
|---|---|
| `profileLine.test.mjs` | Drawn profile: curves, a second date, legend hide/show/remove, x/y ranges and Auto, ITS_LIVE annual mode |
| `flowLine.test.mjs` | Flow line: trace, panel layout, nudge and re-trace, accept, trim; Pine Island on the Amundsen Sea annual |
| `boundaries.test.mjs` | Antarctic Coastlines (grounding line + 191-ring 2026 mask front, no GIBS, shelf names zoomed in, legend toggles each line); Basins (19 IMBIE with labels); Dated grounding lines (466, 1992-2025, readout at Pine Island, year handle); each box hides only its own layer; Greenland: GIBS coastline, 251 unlabeled Mouginot basins, dated lines disabled |
| `compare.test.mjs` | Two-date difference (equals displayed minus chosen date) and swipe: hidden under the anomaly, drag, keys, labels |
| `flowArrows.test.mjs` | Flow arrows: off by default, drawn over Greenland, Jakobshavn points west after a zoom, disabled for backscatter |
| `glacierFronts.test.mjs` | Glacier fronts: off by default, 5582 loaded, legend years, readout date at Jakobshavn, year handles (mouse drag, keyboard, push, band shift) filter the drawn winters and the readout, disabled in Antarctica |
| `outlines.test.mjs` | Your own outlines: GeoJSON in lon/lat (file picker) and in metres (dropped), KML, list, Zoom, remove, unreadable file; fixtures in `tests/fixtures/` |
| `placeSearch.test.mjs` | Place search: old/foreign names, accents, ranking, keys, zoom and marker, clear, no match; Antarctica: Pine Island, Thwaites zoom, McMurdo |
| `glacierNames.test.mjs` | Glacier names: off by default, 733 loaded (732 GGN + 79N), Jakobshavn label, zoom tiers (20 major, 285 outlets), ocean side; Antarctica: 3820 SCAR names, 80 major zoomed out, more as you zoom in |
| `browsePick.test.mjs` | Browse image as the pick map: time series and profile stay under the RGB browse image and read vv |
| `phonePlot.test.mjs` | Flow-line plot on an emulated phone (`PHONE=WxH`, default 390x844): plot and page inside the screen width |
| `touchClose.test.mjs` | Emulated phone: a tap's readout has a close button (and a pan hides it); the time-series plot x adds no point |
| `frontPositions.test.mjs` | Fronts along a line down Jakobshavn fjord (47 crossings 1973-2021, retreat, plot, year slider) and a flow line (2014 on); travel-time marks (1 and 5 years, signs, map, untick); typed flow-line points (lat/lon with letters, x/y km, bad text) |
| `mapOverlays.test.mjs` | Speed contours (default and typed levels), flow particles (trails drawn, 10 s particle movie decoded by ffmpeg and its loop seam checked, restart after a move, stop), vv ± error in the readout, Jakobshavn basin true area vs map area |
| `shareLink.test.mjs` | A shared link reopens the ticked layers, the fronts year range, typed contour levels, a trimmed flow line (accepted) with 5-year marks, and a drawn line |
| `seasonal.test.mjs` | Monthly series at a Jakobshavn point folded onto the months of the year; monthly means; a click on a value shows that product; time-bar option disabled and restored |
| `digitize.test.mjs` | Digitize: every tool, freehand, rename/delete, vertex drag, circle resize, moving shapes, GeoPackage read back by GDAL (layers, EPSG, names, true areas vs GDAL geodesic within 0.01%, validator), EPSG:4326 choice, hemisphere stash, list scrolling. |
| `areaSeries.test.mjs` | Shapes as series: a Digitize rectangle and an opened multi-part polygon with a hole, plotted from their list rows; means and pixel counts equal GDAL's rasterization of the same shapes on the same overview grid; error bars; CSV shape columns; outline in the series color. |
| `localCatalog.test.mjs` | Open a folder (`makeLocalCatalog.py`): parquet and GeoTIFFs read from the disk (a bare-name href and a made-up URL), readout and a point's series from the files, no share link. |
| `strain.test.mjs` | Strain rates on synthetic stretching and simple-shear fields (`makeStrainCatalog.py`, a folder catalog): all four kinds exact under the pointer, recomputed on a date change, Clear. |
| `logScale.test.mjs` | vv on a log scale in browse colors, 1-3000 m/yr, matching the browse image pixel for pixel; decade labels; linear; clip; each image back at 1-3000. |
| `gpkgOpen.test.mjs` | Open GeoPackage: UTM file with multi-part, hole, Z, null and curved rows; fields, fids and types kept on save; reopen; size and format refusals; south shapes to the Antarctic map. |
| `phoneFiles.test.mjs` | Phone file pickers take any file; desktop keeps the type filters. |
| `timeSeries.test.mjs` | Points: read, legend hide/remove, y range slider and Auto, catalog switch with per-catalog hide/remove |

**Scripting hook:** the page sets `window.grimpViewer = { map }` (the OpenLayers map), for the
screenshot script and for debugging in the browser console.

**Updating the README images** after interface changes:

```bash
npm install --no-save puppeteer-core
node tools/guideScreenshots.mjs /tmp/guideShots
python tools/guideImages.py /tmp/guideShots Documents/images
```

The script drives the live viewer in headless Google Chrome with software WebGL (about two minutes),
so deploy first. It frames Jakobshavn Isbræ for the readout, animation and TSX examples.

A link from stac-map to this viewer only needs the same catalog URL:
`https://s3.kopah.uw.edu/ianj-grimp/public/viewer/index.html?href=<current catalog>`.
