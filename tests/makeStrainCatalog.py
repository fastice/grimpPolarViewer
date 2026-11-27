"""A catalog folder for strain.test.mjs, written into the directory given: two items of vx, vy (EPSG:3413,
200 m, near Jakobshavn) with known strain rates. 2020: stretching along x, vx = 50 + 0.01 (x - x0) m/yr,
vy = 0 (effective, along-flow and divergence 0.01 /yr, shear 0). 2021: simple shear, vx = 100 + 0.004 (y - y0),
vy = 0 (effective and shear 0.002 /yr, along-flow and divergence 0)."""
import asyncio
import copy
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
n, res, x0, y0 = 400, 200.0, -240000.0, -2240000.0
xs = x0 + (np.arange(n) + 0.5) * res
ys = y0 - (np.arange(n) + 0.5) * res
xx, yy = np.meshgrid(xs, ys)
fields = {2020: (50 + 0.01 * (xx - x0), 0 * xx), 2021: (100 + 0.004 * (yy - (y0 - n * res)), 0 * xx)}


def writeCog(name, values):
    mem = gdal.GetDriverByName('MEM').Create('', n, n, 1, gdal.GDT_Float32)
    mem.SetGeoTransform((x0, res, 0, y0, 0, -res))
    mem.SetProjection(srs.ExportToWkt())
    mem.GetRasterBand(1).SetNoDataValue(-2e9)
    mem.GetRasterBand(1).WriteArray(values.astype(np.float32))
    gdal.GetDriverByName('COG').CreateCopy(f'{outDir}/{name}', mem, options=['BLOCKSIZE=256'])


items = []
for year, (vx, vy) in fields.items():
    names = {k: f'strainTest_{year}_{k}.tif' for k in ('vx', 'vy')}
    writeCog(names['vx'], vx)
    writeCog(names['vy'], vy)
    start = datetime.datetime(year, 1, 1, tzinfo=datetime.timezone.utc)
    end = datetime.datetime(year, 12, 31, 23, 59, 59, tzinfo=datetime.timezone.utc)
    item = rio_stac.create_stac_item(f'{outDir}/{names["vx"]}', input_datetime=start, collection='straintest', id=f'strainTest_{year}',
                                     properties={'start_datetime': start.isoformat(), 'end_datetime': end.isoformat()},
                                     asset_name='vx', asset_roles=['data'], asset_href=names['vx'], with_proj=True, with_raster=True).to_dict()
    item['assets']['vy'] = copy.deepcopy(item['assets']['vx'])
    item['assets']['vy']['href'] = names['vy']
    items.append(item)


async def write():
    await rustac.write(f'{outDir}/strainTest.parquet', items)
asyncio.run(write())
