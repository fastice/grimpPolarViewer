# grimpdownload: download what you picked in the GrIMP Polar Viewer

`grimpdownload` downloads the products you select in the
[GrIMP Polar Viewer](../README.md), whole or cropped to a box. Each file comes from
[NSIDC](https://nsidc.org/grimp) when NSIDC holds that exact version, and from the viewer's Kopah copy
otherwise. Files from NSIDC are the archived copies that the NSIDC DOIs refer to, so they are the ones to
cite (see the NSIDC column in the [README](../README.md#open-the-viewer)); the Kopah copies can be a
version ahead of NSIDC. When NSIDC releases a version, the same download file switches to NSIDC by
itself. Either way the steps and the files you get are the same: NSIDC asks once for a free NASA
Earthdata login and is slower.

## Install (once)

```bash
pip install git+https://github.com/fastice/grimpPolarViewer
```

This installs the `grimpdownload` command and what it needs (rasterio, requests, pyyaml, rich). It
works in any Python 3.9 or later environment, including conda environments.

## Use

1. In the viewer, open **Download**, tick the assets you want, pick products (tick them in the list,
   or leave none picked for every product in the time range), and optionally tick **Crop to a box**,
   draw the box and choose a resolution.
2. Click **Save download file**. The viewer saves a small file such as
   `nsidc-0725-v6_2026-11-20.grimp.yaml`.
3. Run

   ```bash
   grimpdownload nsidc-0725-v6_2026-11-20.grimp.yaml --outDir jakobshavn
   ```

The first time a download needs NSIDC, `grimpdownload` asks for your
[Earthdata login](https://urs.earthdata.nasa.gov/users/new) and keeps it in `~/.netrc` (or run
`grimpdownload --login` beforehand). A live display shows the files done, MB, time left, the file being
read and any pause. Rerunning the same command resumes: finished files are skipped.

TerraSAR-X glacier sites are downloaded one site box per file (the viewer saves the displayed site's
dates, or the dates you pick from one site).

| Option | Default | Meaning |
|---|---|---|
| `--outDir` | `./grimpDownload` | output directory (also holds `grimpDownload.log` and `grimpDownload.state.json`) |
| `--source` | `auto` | `auto`: NSIDC when it holds the version, else Kopah; `nsidc`: NSIDC only; `kopah`: Kopah only |
| `--login` | | ask for your Earthdata login, save it in `~/.netrc`, and stop |
| `--dryRun` | off | print where each file will come from, and stop |
| `--retryFailed` | off | retry files that failed in an earlier run |
| `--yes` | off | do not ask before downloads over 5 GB |
| `--plain` | off | one status line per second (automatic when not in a terminal) |
| `--nsidcGap` | 1 | seconds between NSIDC files (doubles on each refusal, up to 30 s) |
| `--kopahWorkers` | 4 | parallel Kopah reads |

## Output

Whole files keep their names. Crops are named `<file>_crop_<x0>_<y0>_<res>m.tif` (as the viewer's own
crops): tiled, deflate-compressed GeoTIFFs with the source file's metadata plus `grimpDownloadSource`
(the URL read) and `grimpDownloadBbox`.

## How it works

**The download file** is JSON (which is also YAML), written by the viewer:

```json
{
 "grimpDownload": 1,
 "created": "2026-11-20T00:57:00.000Z",
 "viewer": "2026-11-20 00:57 UTC (e7474ef)",
 "collection": "nsidc-0725-v6",
 "nsidc": {"shortName": "NSIDC-0725", "version": "6"},
 "epsg": 3413,
 "assets": ["vv", "vx", "vy"],
 "crop": {"bbox": [-230000, -2300000, -150000, -2250000], "resolution": 200},
 "items": [
  {"id": "GL_vel_mosaic_Annual_01Dec24_30Nov25_v06.0", "start": "2024-12-01", "end": "2025-11-30",
   "files": {"vv": "nsidc-0725/v06/GL_vel_mosaic_Annual_01Dec24_30Nov25_vv_v06.0.tif", "...": "..."}}
 ]
}
```

`files` gives each asset's path under the GrIMP Kopah root (`https://s3.kopah.uw.edu/ianj-grimp/public/`,
built into `grimpdownload`), or a full URL for catalogs stored elsewhere.
`nsidc` comes from the catalog's collection id (`nsidc-<number>-v<version>`); it is `null` for
collections not at NSIDC (Amundsen Sea, NISAR display mosaics), which always come from Kopah.
`crop` is left out for whole files.

**Choosing the source:** one CMR granule search per download file (product, version, the items' date
span, paged with `CMR-Search-After`). NSIDC files are matched to the Kopah files by file name, so a file
comes from NSIDC only when NSIDC holds that exact file.

**Reading:** whole files are streamed with `requests` to a `.part` file and renamed when complete.
Crops are a single windowed read per file at the overview level nearest the requested resolution
(chosen once per asset), with the first file's grid as a template: a file on a different grid is
reported as failed rather than cut in the wrong place.

**Not overloading NSIDC.** NSIDC refuses requests when too many arrive at once; GDAL then reports the
file as "not recognized as a supported dataset name" (no HTTP code) and the service stays unavailable
for a while. So `grimpdownload`:

1. reads NSIDC **one file at a time**, and each file's tile ranges one request at a time
   (`GDAL_HTTP_MULTIRANGE=SERIAL`; GDAL otherwise sends them in parallel), with a 1 s gap between files;
2. retries a refused read after 5 and 15 s, then **pauses NSIDC reads** 30 s, 60, 120 ... up to 15 min
   (with a countdown), doubling the gap each time (up to 30 s; 20 successes in a row halve it again);
3. stops cleanly after 8 refusals in a row, or at once if the Earthdata login is refused, saying how to
   resume;
4. writes every file under a temporary name and records failures in `grimpDownload.state.json`, so a
   rerun resumes.

Kopah files are read in parallel (`--kopahWorkers`), alongside the NSIDC queue.

**Measured 2026-11-19** (80 x 50 km Jakobshavn crop at 200 m, 9 files, one at a time): NSIDC 1.6 s per
file with no gap (about 2.6 s with the default 1 s gap); Kopah 0.12 s per file. No refusals.

## Code

`grimppolarviewer/grimpDownload.py`; the package is defined by `pyproject.toml` at the top of this
repository. It needs nothing from grimpfunc or nisardev (nisardev has its own copy of the serial-read and
retry logic for notebooks).
