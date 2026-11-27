"""A catalog folder for localCatalog.test.mjs, written into the directory given: two small speed COGs near
Jakobshavn (EPSG:3413, 200 m, every pixel 111 m/yr in 2020 and 222 m/yr in 2021) and a stac-geoparquet
catalog of them. The 2020 asset's href is a bare file name, the 2021 one a URL that does not exist, so both
can only be read from the folder."""
import asyncio
import datetime
import os
import sys

import numpy as np
import rio_stac
import rustac
from osgeo import gdal, osr

gdal.UseExceptions()
outDir = sys.argv[1]
os.makedirs(outDir, exist_ok=True)
srs = osr.SpatialReference()
srs.ImportFromEPSG(3413)
items = []
for year, value in ((2020, 111.0), (2021, 222.0)):
    name = f'localTest_{year}_vv.tif'
    mem = gdal.GetDriverByName('MEM').Create('', 300, 300, 1, gdal.GDT_Float32)
    mem.SetGeoTransform((-215000, 200, 0, -2245000, 0, -200))
    mem.SetProjection(srs.ExportToWkt())
    band = mem.GetRasterBand(1)
    band.SetNoDataValue(-2e9)
    band.WriteArray(np.full((300, 300), value, dtype=np.float32))
    gdal.GetDriverByName('COG').CreateCopy(f'{outDir}/{name}', mem, options=['OVERVIEWS=IGNORE_EXISTING', 'BLOCKSIZE=256'])
    start = datetime.datetime(year, 1, 1, tzinfo=datetime.timezone.utc)
    end = datetime.datetime(year, 12, 31, 23, 59, 59, tzinfo=datetime.timezone.utc)
    href = name if year == 2020 else f'https://example.invalid/private/{name}'
    item = rio_stac.create_stac_item(f'{outDir}/{name}', input_datetime=start, collection='localtest', id=name[:-4],
                                     properties={'start_datetime': start.isoformat(), 'end_datetime': end.isoformat()},
                                     asset_name='vv', asset_roles=['data'], asset_href=href, with_proj=True, with_raster=True)
    items.append(item.to_dict())


async def write():
    await rustac.write(f'{outDir}/localTest.parquet', items)
asyncio.run(write())
