"""Build a stac-geoparquet catalog of GrIMP velocity mosaics (e.g. NSIDC-0766 6/12-day), one item per window.

Each window directory (e.g. .../sixDayVelocities/Vel-2026-09-07.2026-09-18) holds a release/ directory
of <region>_vel_mosaic_*_<asset>_v*.tif COGs (GL, ASE, ...) (vv, vx, vy, ex, ey, dT, browse); each becomes an asset of one
item, laid out like gaia/public/grimp/nsidc-0725/v05/nsidc-0725.parquet. Upload the COGs to --baseUrl
and the parquet next to them; see Documents/grimpPolarViewer.md. To add windows later, rerun with all
of them: the catalog is rewritten, not appended to.

    python makeVelocityParquet.py nsidc-0766.parquet \\
        /Volumes/insar9/ian/Sentinel1/Release/sixDayVelocities/Vel-2026-09-07.2026-09-18

TSX glacier-site products (NSIDC-0481) sit directly in Vel.<d1>.<d2>/ dirs; their site code (e.g. E63.85N)
becomes grimp:site:

    python makeVelocityParquet.py nsidc-0481.parquet .../TSX/*/release/<release>/*coast*/Vel.* \\
        --pattern 'TSX_*_v*.tif' --baseUrl https://s3.kopah.uw.edu/ianj-grimp/public/nsidc-0481/v05 \\
        --collection nsidc-0481-v5
"""
import argparse
import asyncio
import datetime
import glob
import os
import re

import rasterio
import rio_stac
import rustac

cogType = 'image/tiff; application=geotiff; profile=cloud-optimized'
assetOrder = ['browse', 'vv', 'vx', 'vy', 'ex', 'ey', 'dT']
units = {'vv': 'm/yr', 'vx': 'm/yr', 'vy': 'm/yr', 'ex': 'm/yr', 'ey': 'm/yr', 'dT': 'days'}


def parseDates(windowDir):
    """Return (start, end) datetimes from a window directory name ending YYYY-MM-DD.YYYY-MM-DD."""
    first, last = re.findall(r'\d{4}-\d{2}-\d{2}', os.path.basename(windowDir.rstrip('/')))[-2:]
    start = datetime.datetime.fromisoformat(first).replace(tzinfo=datetime.timezone.utc)
    end = datetime.datetime.fromisoformat(last).replace(hour=23, minute=59, second=59,
                                                         tzinfo=datetime.timezone.utc)
    return start, end


def makeItem(windowDir, baseUrl, collection, pattern):
    start, end = parseDates(windowDir)
    tifFiles = {}
    for tifFile in glob.glob(f'{windowDir}/{pattern}'):
        key = re.search(r'_([A-Za-z]+)_v\d+\.\d+\.tif$', tifFile).group(1)
        tifFiles[key] = tifFile
    keys = [k for k in assetOrder if k in tifFiles]
    first = os.path.basename(tifFiles[keys[0]])
    version = re.search(r'_v(\d+\.\d+)\.tif$', first).group(1)
    itemId = first.replace(f'_{keys[0]}_v', '_v').replace('.tif', '')
    properties = {'start_datetime': start.isoformat(), 'end_datetime': end.isoformat(), 'grimp:version': version}
    site = re.match(r'(?:TSX|TDX)_([EW]\d+\.\d+[NS])_', first)
    if site:
        properties['grimp:site'] = site.group(1)
    item = None
    for key in keys:
        tifName = os.path.basename(tifFiles[key])
        one = rio_stac.create_stac_item(
            tifFiles[key], input_datetime=start, collection=collection, id=itemId,
            properties=properties,
            asset_name=key, asset_roles=['data'], asset_media_type=cogType,
            asset_href=f"{baseUrl.rstrip('/')}/{tifName}", with_proj=True, with_raster=True,
            geom_densify_pts=21, geom_precision=6)
        asset = one.assets[key]
        with rasterio.open(tifFiles[key]) as ds:
            asset.title = f'{key} ({round(ds.res[0])}m)'
        if key in units:
            for band in asset.extra_fields.get('raster:bands', []):
                band['unit'] = units[key]
        if item is None:
            item = one
        else:
            item.add_asset(key, asset)
    return item.to_dict()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('output', help='output .parquet')
    parser.add_argument('windowDirs', nargs='+', help='window directories, each holding release/')
    parser.add_argument('--pattern', default='release/*_vel_mosaic_*_v*.tif', help='COG glob within each window dir')
    parser.add_argument('--baseUrl', default='https://s3.kopah.uw.edu/ianj-grimp/public/nsidc-0766/v03')
    parser.add_argument('--collection', default='nsidc-0766-v3')
    args = parser.parse_args()
    items = []
    for windowDir in sorted(args.windowDirs):
        items.append(makeItem(windowDir, args.baseUrl, args.collection, args.pattern))
        print(items[-1]['id'], ' '.join(items[-1]['assets']), flush=True)

    async def write():
        await rustac.write(args.output, items)
    asyncio.run(write())
    print(f'{len(items)} items -> {args.output}')


if __name__ == '__main__':
    main()
