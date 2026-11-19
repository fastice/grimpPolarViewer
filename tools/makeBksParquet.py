"""Build a stac-geoparquet catalog of uncalibrated S1 backscatter mosaics (Greenland GL_, Amundsen ASE_, ...).

Each window directory <region>_S1bks_mosaic_uncalibrated.<start>.<end>/release holds one or more
versions of the 25 m image; the newest version is used.

The catalog works in both the GrIMP Polar Viewer and stac-map. Its layout mirrors
gaia/public/grimp/nsidc-0723/v04/nsidc-0723.parquet (rio_stac items written by rustac).
Upload the COGs to --baseUrl and the parquet next to them; see Documents/grimpPolarViewer.md.
"""
import argparse
import asyncio
import datetime
import glob
import os
import re

import rio_stac
import rustac

defaultReleaseRoot = '/Volumes/insar10/ian/Sentinel1/Release/mosaics/uncalibrated'
cogType = 'image/tiff; application=geotiff; profile=cloud-optimized'


def parseDates(dirName):
    """Return (start, end) datetimes from <region>_S1bks_mosaic_uncalibrated.YYYY-MM-DD.YYYY-MM-DD."""
    first, last = re.findall(r'\d{4}-\d{2}-\d{2}', dirName)[-2:]
    start = datetime.datetime.fromisoformat(first).replace(tzinfo=datetime.timezone.utc)
    end = datetime.datetime.fromisoformat(last).replace(hour=23, minute=59, second=59,
                                                         tzinfo=datetime.timezone.utc)
    return start, end


def makeItem(tifFile, baseUrl, collection):
    start, end = parseDates(os.path.basename(os.path.dirname(os.path.dirname(tifFile))))
    tifName = os.path.basename(tifFile)
    version = re.search(r'_v(\d+\.\d+)\.tif$', tifName).group(1)
    item = rio_stac.create_stac_item(
        tifFile, input_datetime=start, collection=collection,
        id=tifName.replace('_image_25m', '').replace('.tif', ''),
        properties={'start_datetime': start.isoformat(), 'end_datetime': end.isoformat(),
                    'grimp:version': version},
        asset_name='image', asset_roles=['data'], asset_media_type=cogType,
        asset_href=f'{baseUrl}/{tifName}', with_proj=True, with_raster=True,
        geom_densify_pts=21, geom_precision=6)
    item.assets['image'].title = 'image (25m)'
    return item.to_dict()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('year', help="include windows with any day in this year, or 'all'")
    parser.add_argument('output', help='output .parquet')
    parser.add_argument('--baseUrl', default='https://s3.kopah.uw.edu/ianj-grimp/public/nsidc-0723/v04')
    parser.add_argument('--collection', default='nsidc-0723-v4')
    parser.add_argument('--releaseRoot', default=defaultReleaseRoot,
                        help='directory holding the <region>_S1bks_mosaic_uncalibrated.* window directories')
    args = parser.parse_args()
    newest = {}
    for tifFile in glob.glob(f'{args.releaseRoot}/*_S1bks_mosaic_uncalibrated.*/release/*_image_25m_v*.tif'):
        version = tuple(int(v) for v in re.search(r'_v(\d+)\.(\d+)\.tif$', tifFile).groups())
        window = os.path.dirname(tifFile)
        if window not in newest or version > newest[window][0]:
            newest[window] = (version, tifFile)
    items = []
    for window in sorted(newest):
        tifFile = newest[window][1]
        start, end = parseDates(os.path.basename(os.path.dirname(window)))
        if args.year == 'all' or start.year <= int(args.year) <= end.year:
            items.append(makeItem(tifFile, args.baseUrl, args.collection))
            print(items[-1]['id'], flush=True)
    async def write():
        await rustac.write(args.output, items)
    asyncio.run(write())
    print(f'{len(items)} items -> {args.output}')


if __name__ == '__main__':
    main()
