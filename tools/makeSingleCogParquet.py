"""Build a one-item stac-geoparquet catalog for a single COG (e.g. a one-off display mosaic).

Example (the Antarctic NISAR 25 m gamma0 display mosaic):

    python makeSingleCogParquet.py ANT_NISAR_GCOV_25m_filled_29Aug26_18Sep26_gamma0_25m_v04.0.tif \\
        https://s3.kopah.uw.edu/ianj-grimp/public/display \\
        2026-08-29 2026-09-18 nisar-gcov-ant-25m.parquet \\
        --collection nisar-gcov-ant-25m-display --asset gamma0 --title 'gamma0 (25m)'
"""
import argparse
import asyncio
import datetime
import os
import re

import rio_stac
import rustac

cogType = 'image/tiff; application=geotiff; profile=cloud-optimized'


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('cog', help='local COG to describe (statistics are read from it)')
    parser.add_argument('baseUrl', help='public URL of the directory the COG is uploaded to')
    parser.add_argument('start', help='first date covered, YYYY-MM-DD')
    parser.add_argument('end', help='last date covered, YYYY-MM-DD')
    parser.add_argument('output', help='output .parquet')
    parser.add_argument('--collection', default='grimp-display')
    parser.add_argument('--asset', default='data', help='asset name shown in the viewer (e.g. gamma0, vv)')
    parser.add_argument('--title', default=None, help='asset title, e.g. "gamma0 (25m)"')
    args = parser.parse_args()
    utc = datetime.timezone.utc
    start = datetime.datetime.fromisoformat(args.start).replace(tzinfo=utc)
    end = datetime.datetime.fromisoformat(args.end).replace(hour=23, minute=59, second=59, tzinfo=utc)
    name = os.path.basename(args.cog)
    version = re.search(r'_v(\d+\.\d+)\.tif$', name)
    properties = {'start_datetime': start.isoformat(), 'end_datetime': end.isoformat()}
    if version:
        properties['grimp:version'] = version.group(1)
    item = rio_stac.create_stac_item(
        args.cog, input_datetime=start, collection=args.collection, id=name.replace('.tif', ''),
        properties=properties, asset_name=args.asset, asset_roles=['data'], asset_media_type=cogType,
        asset_href=f"{args.baseUrl.rstrip('/')}/{name}", with_proj=True, with_raster=True,
        geom_densify_pts=21, geom_precision=6)
    if args.title:
        item.assets[args.asset].title = args.title

    async def write():
        await rustac.write(args.output, [item.to_dict()])
    asyncio.run(write())
    print(f'1 item -> {args.output}')


if __name__ == '__main__':
    main()
