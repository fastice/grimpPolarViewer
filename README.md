# GrIMP Polar Viewer

A single-page web viewer for GrIMP and NISAR ice products stored as cloud-optimized GeoTIFFs
(COGs) with a [stac-geoparquet](https://github.com/stac-utils/stac-geoparquet) catalog. It draws the
data in polar stereographic (EPSG:3413 for Greenland, EPSG:3031 for Antarctica), so the poles are
in the middle of the map rather than at the edge of a Web Mercator one. It reads the same catalogs
as [stac-map](https://github.com/developmentseed/stac-map).

**Live viewer:** <https://s3.kopah.uw.edu/ianj-grimp/public/viewer/index.html>

Open a catalog directly with `?href=` (and optionally a starting asset with `&asset=`):

- Greenland 2024 S1 backscatter:
  <https://s3.kopah.uw.edu/ianj-grimp/public/viewer/index.html?href=https://s3.kopah.uw.edu/ianj-grimp/public/nsidc-0723/v04/nsidc-0723.parquet>
- Annual velocity (NSIDC-0725), browse images:
  <https://s3.kopah.uw.edu/ianj-grimp/public/viewer/index.html?href=https://s3.kopah.uw.edu/gaia/public/grimp/nsidc-0725/v05/nsidc-0725.parquet&asset=browse>
- Antarctic NISAR 25 m gamma0:
  <https://s3.kopah.uw.edu/ianj-grimp/public/viewer/index.html?href=https://s3.kopah.uw.edu/ianj-grimp/public/display/nisar-gcov-ant-25m.parquet>

## What it does

- Northern/Southern hemisphere switch with preset collections, or any catalog URL.
- NASA GIBS Blue Marble basemap and coastlines in the catalog's polar projection.
- Time range set by the handles of a vertical time bar; ticks pick the date in focus.
- Color maps, percentile clip, fixed-0 stretch for speeds and errors, symmetric stretch for
  velocity components, RGB browse images.
- Hover readout: map x/y (km), latitude/longitude and the native pixel value.
- Anomaly view: the displayed date minus the mean of its time series.
- Time-series animation with fixed color range, optional anomaly and color bar, saved as MP4.
- Downloads: original COGs, URL lists for wget, crops to a drawn box; site picking for small
  products such as the TSX glacier boxes.

Everything runs in the browser. There is no server: the page and the data are static files on UW
Kopah object storage.

## Repository layout

| Path | What it is |
|---|---|
| `index.html` | The whole viewer (HTML, CSS and JavaScript in one file). |
| `tools/deployViewer.sh` | Stamps the build and uploads `index.html` to Kopah with s3cmd. |
| `tools/makeBksParquet.py` | Catalog builder for the uncalibrated S1 backscatter mosaics. |
| `tools/makeSingleCogParquet.py` | One-item catalog for a single COG (e.g. a display mosaic). |
| `kopah/publicReadPolicy.json` | Bucket policy: anonymous read of `public/*` only. |
| `kopah/cors.xml` | CORS rules so browsers on other sites can read the data. |
| `Documents/grimpPolarViewer.md` | Full documentation: use, catalogs, hosting, design, limits. |

## Quick start

Deploy the viewer after editing `index.html`:

```bash
tools/deployViewer.sh
```

Build and publish a catalog for one year of backscatter mosaics:

```bash
python tools/makeBksParquet.py 2024 nsidc-0723.parquet
s3cmd put --mime-type=application/vnd.apache.parquet nsidc-0723.parquet s3://ianj-grimp/public/nsidc-0723/v04/
```

See [Documents/grimpPolarViewer.md](Documents/grimpPolarViewer.md) for details.
