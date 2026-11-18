# GrIMP Polar Viewer

A browser viewer for GrIMP/NISAR ice products: cloud-optimized GeoTIFFs (COGs) described by a
stac-geoparquet catalog, drawn in polar stereographic. Written 2026-11-18.

- Live: <https://s3.kopah.uw.edu/ianj-grimp/public/viewer/index.html>
- Source: this repository (`index.html` is the whole app).

This is the reference and maintainer guide. The illustrated tour for users is the
[README](../README.md).

## Repository layout

| Path | What it is |
|---|---|
| `index.html` | The whole viewer (HTML, CSS and JavaScript in one file). |
| `tools/deployViewer.sh` | Stamps the build and uploads `index.html` to Kopah with s3cmd. |
| `tools/makeBksParquet.py` | Catalog builder for the uncalibrated S1 backscatter mosaics. |
| `tools/makeSingleCogParquet.py` | One-item catalog for a single COG (e.g. a display mosaic). |
| `tools/makeVelocityParquet.py` | Catalog builder for velocity mosaics (NSIDC-0766 6/12-day, Amundsen Sea quarterly/annual, ...), one item per window directory. |
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
  presets (the `presets` array near the top of the script). Switching hemisphere opens its first
  collection.
- **Catalog URL** loads any public `.parquet` catalog. The hemisphere follows the catalog's EPSG.
- Link parameters: `?href=<catalog URL>` opens a catalog; `&asset=<name>` picks the first asset shown
  (e.g. `browse`, `vx`). The browser Back button returns to the previous catalog.

Each catalog opens on its newest item. Items are listed below the panel; clicking a row or a
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

- **Handles** (drag, or arrow keys) set the range of products. The list, footprints, animation
  and anomaly mean all use that range.
- **Ticks** pick the date in focus without changing the range. If a product at that date covers
  the same place as the current one (e.g. the same TSX site), it is chosen; otherwise the newest
  product at that date. A tick outside the range widens the range to include it.
- **Reset** restores the full range.

### Color and values

- **Color map**, **Clip % (percentile stretch)** and **Min/Max**. The clip is computed from a
  ~1000-pixel overview of the COG.
- Stretch rules by asset name: `vv`, `ex`, `ey` start at a hard 0 (clip only the top); `vx`, `vy`
  are symmetric about 0 (±L, the larger tail at the clip %) and switch to the blue-white-red map;
  everything else clips both ends.
- RGB(A) assets (three or more bands, e.g. `browse`) are drawn as stored; the stretch controls hide.
- **Hover readout** (bottom right; tap on touch screens): map x/y in km, latitude/longitude, and the value under the
  pointer read from the full-resolution COG (exact native value, with units). During an animation or
  anomaly view it reports that layer's value instead.

### Anomaly view

**Anomaly and stack** (a collapsible section below the colors) appears when the displayed item has a time series
(see below). It shows the displayed date minus the per-pixel mean of every date in the series,
in blue-white-red, with a range of ±L: automatic (1% clip over all dates) or typed. **Earlier /
Later** step through the dates; ticks and list clicks also step while it is on. The series stack is
kept in memory, so stepping takes under a second.

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

### Time series at points

**Time series at points** appears when the displayed item has a time series (not for RGB images).
**Add points**, then click the map; each click adds a numbered, colored marker. Every point is read
at full resolution from every date of the series (one-pixel reads, six at a time; the same values
the hover readout gives) and plotted against the middle of each product's date range.

- **Only dates in the time range** follows the time-bar handles; untick it for every date.
- **Hide plot / Show plot** in the panel toggles the plot; its x also hides it.
- The plot marks the displayed date with a thin dashed line and rings each point's value there, so
  clicking a time-bar tick moves the marker. Clicking a point on the plot shows that date's image
  (as if its tick were clicked). The saved PNG leaves the marker out.
- **Error bars** (1 sigma): `ex` for `vx`, `ey` for `vy`, and for speed
  $`\sigma_v = \sqrt{(v_x e_x)^2 + (v_y e_y)^2}/v`$ from the four component files.
- Changing the asset or the time range redraws the plot; values already read are cached.
- While values are read, a progress bar under the buttons shows the count and an estimate of the
  time left, and the plot fills in as values arrive (the time axis is fixed to the whole series).
- **ITS_LIVE in grey** (for vv, vx, vy) adds the ITS_LIVE image-pair velocities at the same points
  as a grey cloud behind the GrIMP series, for comparison; each point's cloud has its own grey level,
  shown as a swatch under that point in the legend. The viewer fetches the ITS_LIVE
  datacube catalog (`its-live-data/datacubes/catalog_v02.json`, 7.6 MB, once), picks the cube in
  the map's projection that holds the point (so vx/vy are the same components), and reads the nearest
  120 m pixel's full time series with zarrita 0.7.5 (about 2 s and 3 MB per point). **Pairs up to**
  limits the image separation (default 12 days, to match the 6/12-day products; ITS_LIVE pairs at
  Jakobshavn have a median separation of 125 days). The grey points are clipped to the axes set by
  the GrIMP values and are not in the CSV. Checked against xarray at two Jakobshavn points: 2040
  pairs of 12 days or less and 16297 in all, identical.
- The time bar takes clicks across its shaded box, so points cannot be placed under it; pan the map
  to sample there.
- **Save CSV**: `point, x_km, y_km, lat, lon, item, start, end, asset, value, unit, error`.
  **Save plot**: a PNG at twice screen resolution.

Checked against GDAL at one point (2014-15 annual mosaic): speed 625.9329 m/yr and speed error
0.467258 m/yr, identical to `gdallocationinfo`. Three points over the nine annual mosaics read in
about 3.6 s; one point over 141 six-day windows (speed with error bars, 705 files) in about 17 s.

### Animation

**Animate time series** appears only when the displayed item has a time series.

1. Optionally draw a box (**Draw box** on the Area row; the same cyan area box as the anomaly and
   stack, not the download crop; mosaics only, sites are animated whole).
2. Pick a frame resolution (a new area starts at the finest level that fits).
3. Optional: **Anomaly** (frames minus the series mean; **Anomaly range ±** recolors loaded frames
   at once) and **Color bar** (burned into the frames).
4. **Load frames**, then **Play/Pause**, the frame slider, speed and loop. The time bar follows.
5. **Save movie** writes an H.264 MP4 that opens in QuickTime. No-data areas are black in the movie.

Every frame uses the color range and color map in force when the frames are loaded, so frames are
directly comparable; changing either asks for a reload.

### Downloads

- **Assets (one file each)** with an **All** box choose what to download.
- **Download this image** saves the original COGs of the displayed item from Kopah.
- **Download selection** covers picked items, or every item in the time range. Without a crop it
  saves a URL list (`<collection>_selection_urls.txt`) to fetch with `wget -i`, since selections can
  be hundreds of GB.
- **Crop to a box** (mosaics only): draw a box, choose a resolution (levels over 64 Mpx are
  disabled) and the buttons save cropped GeoTIFFs, cut in the browser. Single-band products are
  written as float32 in physical units (e.g. dB) with nodata kept; RGB as 8-bit RGB. Up to 100
  crops per selection download.
- **Site products** (median footprint under 100 km across, e.g. NSIDC-0481 TSX boxes) get a
  **Download sites** section instead: no crop, a **Select all sites** box, list checkboxes, and
  Shift/Ctrl/Cmd-click on a box to pick it.

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
catalog is one series; each TSX site is its own series.

COGs must be tiled with overviews. The viewer and the crop/anomaly/animation tools read only the
tiles and overview levels they need, using HTTP range requests.

## Making and publishing catalogs

Needs `rio_stac` and `rustac` (`~/miniforge3/bin/pip install rustac`; `rio_stac` was already there).

```bash
# One year of uncalibrated S1 backscatter mosaics (windows overlapping the year).
python tools/makeBksParquet.py 2024 nsidc-0723.parquet

# 6/12-day velocity (NSIDC-0766 v3): one item per window directory; list every window each time.
python tools/makeVelocityParquet.py nsidc-0766.parquet \
    /Volumes/insar9/ian/Sentinel1/Release/sixDayVelocities/Vel-2026-09-07.2026-09-18

# Amundsen Sea (PIG) quarterly; annual is the same with annual in place of quarterly.
python tools/makeVelocityParquet.py ase-quarterly.parquet /Volumes/insar10/ian/SentinelPIG/Release/quarterly/Vel-* \
    --baseUrl https://s3.kopah.uw.edu/ianj-grimp/public/pig/quarterly --collection ase-vel-quarterly

# A single COG, e.g. a display mosaic.
python tools/makeSingleCogParquet.py <file.tif> https://s3.kopah.uw.edu/ianj-grimp/public/display \
    2026-08-29 2026-09-18 nisar-gcov-ant-25m.parquet --collection nisar-gcov-ant-25m-display \
    --asset gamma0 --title 'gamma0 (25m)'
```

Upload the COGs to the URL the catalog points at, then the catalog, with explicit content types:

```bash
s3cmd put --mime-type='image/tiff; application=geotiff; profile=cloud-optimized' \
    --multipart-chunk-size-mb=100 *.tif s3://ianj-grimp/public/nsidc-0723/v04/
s3cmd put --mime-type=application/vnd.apache.parquet nsidc-0723.parquet s3://ianj-grimp/public/nsidc-0723/v04/
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
- **Layout:** `public/viewer/index.html` (the viewer), `public/nsidc-0723/v04/` (2024 backscatter),
  `public/display/` (one-off display products). Scott's presets point at his `gaia` bucket.
- **Deploy** the viewer with `tools/deployViewer.sh`. It uploads as `text/html` with
  `Cache-Control: no-cache` and replaces `build dev` under the title with the UTC time and git
  commit, so the live version is visible on the page.
- **Maintenance:** Kopah is offline the second Tuesday of each month, 9 a.m.-5 p.m. Pacific, and for
  24 hours (to 9 a.m. the next day) in January, April, July and October. The viewer shows these
  hours and warns during a window, but because the page itself is on Kopah, it cannot load at all
  during an outage. Hosting `index.html` elsewhere (e.g. GitHub Pages from this repository) would
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
| Basemap | NASA GIBS WMS (`BlueMarble_ShadedRelief_Bathymetry`, `Coastlines`) |

The displayed image is rendered on the GPU from the COG tiles (WebGL). Crops, animation frames and
the anomaly view are computed on the CPU: each date is read at the chosen level, resampled
(nearest neighbor) onto a common grid over the area, and colorized into a canvas that is shown as a
static image layer. Limits: 2.5 Mpx per frame and 40 Mpx per series (about 160 MB of values),
64 Mpx per crop.

## Limits and known issues

- **WebGL is required** for the main image. The anomaly and animation layers and all other
  controls work without it (they were tested in a browser without WebGL); the main image was not.
- **Anomaly and animation are at overview resolution for whole mosaics.** Full resolution needs a
  box that fits the limits, e.g. about 316 km across for the 200 m annual velocity (9 dates) and
  about 28 km for 25 m backscatter (31 dates). Full resolution at any zoom would need GPU band math
  across all dates per tile.
- **On touch screens a tap reads the value,** so tapping cannot step through overlapping dates;
  use the time bar or the item list.
- `mp4-muxer` is superseded by Mediabunny, and geotiff.js 3.1 is a beta pinned to match OpenLayers.
  Both work as pinned; revisit when upgrading OpenLayers.
- Catalogs written by `tools/` differ slightly from Scott's: no `type` column, and `proj:*` fields at
  item level rather than per asset. stac-map and this viewer read both.
- Movie export needs a browser with WebCodecs H.264 encoding (recent Chrome, Edge, Safari 16.4+,
  Firefox 130+).

## Development

Edit `index.html` and test it from a local web server (the data come from Kopah, whose CORS allows
any origin):

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/index.html?href=<catalog URL>`. Deploy with
`tools/deployViewer.sh` once it works, and check the build stamp under the title.

**Adding a collection to the menu:** append `[title, catalog URL, 'N' or 'S']` to the `presets`
array near the top of the script, then deploy.

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
