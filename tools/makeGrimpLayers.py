"""Build the viewer's GrIMP DEM and land ice / ocean mask collections from the NSIDC tiles.

    dem      NSIDC-0715 v2 30 m DEM tiles (*_dem_v02.0.tif) -> one float32 COG with averaged overviews
    mask     NSIDC-0714 v1.2 15 m GimpIceMask / GimpOceanMask tiles -> per epoch (2000, 2015, 2020) a class
             class COG (1 ice, 2 land, 3 water, 0 no data; mode overviews). The viewer colors the classes
             from their color_hint in the catalog.
    catalog  the two stac-geoparquet catalogs, for the COGs as uploaded under baseUrl

Example:

    python makeGrimpLayers.py dem  /Volumes/insar1/ian/viewerLayers/raw/nsidc-0715 /Volumes/insar1/ian/viewerLayers/cogs
    python makeGrimpLayers.py mask /Volumes/insar1/ian/viewerLayers/raw/nsidc-0714 /Volumes/insar1/ian/viewerLayers/cogs
    python makeGrimpLayers.py catalog /Volumes/insar1/ian/viewerLayers/cogs https://s3.kopah.uw.edu/ianj-grimp/public

The raw tiles are only read; the per-tile intermediates go in <out>/work. The tiles are on the EPSG:3413 grid
but their projection metadata vary (unnamed, or garbled as lat_ts=7 in two 2000 mask tiles), so every output
is stamped EPSG:3413.
"""
import argparse
import asyncio
import concurrent.futures
import datetime
import glob
import os
import subprocess

import numpy as np
import rio_stac
import rustac
from osgeo import gdal, osr

gdal.UseExceptions()
srs3413 = osr.SpatialReference()
srs3413.ImportFromEPSG(3413)
srs3413 = srs3413.ExportToWkt()
cogType = 'image/tiff; application=geotiff; profile=cloud-optimized'
demName = 'GrIMP_DEM_30m_v02.0.tif'
epochs = {'2000': ('1999-07-01', '2001-09-30'), '2015': ('2013-03-26', '2015-09-30'), '2020': ('2020-07-01', '2020-10-01')}
# class value, name, display color
maskClasses = [(1, 'ice', (225, 233, 242)), (2, 'land', (140, 115, 85)), (3, 'water', (30, 90, 160))]
vrtOptions = ['-allow_projection_difference', '-a_srs', 'EPSG:3413']
cogOptions = ['-a_srs', 'EPSG:3413', '-of', 'COG', '-co', 'COMPRESS=DEFLATE', '-co', 'BLOCKSIZE=512', '-co', 'BIGTIFF=YES', '-co', 'NUM_THREADS=8']


def maskName(epoch):
    return f'GrIMP_LandIceOceanMask_15m_{epoch}_class_v01.2.tif'


def run(cmd):
    print(' '.join(cmd), flush=True)
    subprocess.run(cmd, check=True)


def makeDem(rawDir, outDir):
    tiles = sorted(glob.glob(os.path.join(rawDir, '*_dem_v02.0.tif')))
    vrt = os.path.join(outDir, 'work', 'dem.vrt')
    os.makedirs(os.path.dirname(vrt), exist_ok=True)
    run(['gdalbuildvrt', '-overwrite', *vrtOptions, vrt, *tiles])
    run(['gdal_translate', *cogOptions, '-co', 'PREDICTOR=FLOATING_POINT', '-co', 'OVERVIEW_RESAMPLING=AVERAGE',
         vrt, os.path.join(outDir, demName)])


def makeMaskTile(iceFile, oceanFile, classFile):
    ice, ocean = gdal.Open(iceFile), gdal.Open(oceanFile)
    isIce, isWater = ice.GetRasterBand(1).ReadAsArray() == 1, ocean.GetRasterBand(1).ReadAsArray() == 1
    cls = np.full(isIce.shape, 2, np.uint8)  # the two masks never overlap
    cls[isIce] = 1
    cls[isWater] = 3
    out = gdal.GetDriverByName('GTiff').Create(classFile, cls.shape[1], cls.shape[0], 1, gdal.GDT_Byte,
                                               ['TILED=YES', 'COMPRESS=DEFLATE', 'BLOCKXSIZE=512', 'BLOCKYSIZE=512'])
    out.SetGeoTransform(ice.GetGeoTransform())
    out.SetProjection(srs3413)
    out.GetRasterBand(1).WriteArray(cls)
    out.GetRasterBand(1).SetNoDataValue(0)
    out = None


def makeMask(rawDir, outDir):
    for epoch in epochs:
        work = os.path.join(outDir, 'work', f'mask{epoch}')
        os.makedirs(work, exist_ok=True)
        classTiles, todo = [], []
        for iceFile in sorted(glob.glob(os.path.join(rawDir, f'GimpIceMask_15m_{epoch}_tile*_v1.2.tif'))):
            tile = '_'.join(iceFile.split('_')[-3:-1])  # e.g. tile0_0
            oceanFile = iceFile.replace('GimpIceMask', 'GimpOceanMask')
            classFile = os.path.join(work, f'class_{tile}.tif')
            if not os.path.exists(classFile):
                todo.append((iceFile, oceanFile, classFile))
            classTiles.append(classFile)
        if todo:
            with concurrent.futures.ProcessPoolExecutor(8) as pool:  # about 3 GB each
                list(pool.map(makeMaskTile, *zip(*todo)))
        print(f'{epoch}: {len(classTiles)} tiles', flush=True)
        vrt = os.path.join(work, 'class.vrt')
        run(['gdalbuildvrt', '-overwrite', *vrtOptions, vrt, *classTiles])
        run(['gdal_translate', *cogOptions, '-co', 'OVERVIEW_RESAMPLING=MODE', vrt, os.path.join(outDir, maskName(epoch))])


def stacItem(cog, baseUrl, collection, itemId, start, end, assetKey, title, extra=None):
    utc = datetime.timezone.utc
    t0 = datetime.datetime.fromisoformat(start).replace(tzinfo=utc)
    t1 = datetime.datetime.fromisoformat(end).replace(hour=23, minute=59, second=59, tzinfo=utc)
    item = rio_stac.create_stac_item(
        cog, input_datetime=t0, collection=collection, id=itemId,
        properties={'start_datetime': t0.isoformat(), 'end_datetime': t1.isoformat()},
        asset_name=assetKey, asset_roles=['data'], asset_media_type=cogType,
        asset_href=f'{baseUrl}/{os.path.basename(cog)}', with_proj=True, with_raster=True,
        geom_densify_pts=21, geom_precision=6)
    item.assets[assetKey].title = title
    item.assets[assetKey].extra_fields.update(extra or {})
    return item


def makeCatalog(cogDir, baseUrl):
    baseUrl = baseUrl.rstrip('/')
    dem = stacItem(os.path.join(cogDir, demName), f'{baseUrl}/nsidc-0715/v02', 'nsidc-0715', demName[:-4],
                   '2008-05-15', '2020-11-19', 'dem', 'elevation (m, WGS84 ellipsoid)')
    dem.assets['dem'].extra_fields['raster:bands'][0]['unit'] = 'm'
    classes = [{'value': v, 'name': n, 'color_hint': '%02x%02x%02x' % c} for v, n, c in maskClasses]
    items = []
    for epoch, (start, end) in epochs.items():
        url = f'{baseUrl}/nsidc-0714/v01'
        items.append(stacItem(os.path.join(cogDir, maskName(epoch)), url, 'nsidc-0714', f'GrIMP_LandIceOceanMask_15m_{epoch}_v01.2',
                              start, end, 'mask', 'class: 1 ice, 2 land, 3 water', {'classification:classes': classes}).to_dict())

    async def write():
        await rustac.write(os.path.join(cogDir, 'nsidc-0715.parquet'), [dem.to_dict()])
        await rustac.write(os.path.join(cogDir, 'nsidc-0714.parquet'), items)
    asyncio.run(write())
    print(f'1 + {len(items)} items -> {cogDir}/nsidc-0715.parquet, nsidc-0714.parquet')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('step', choices=['dem', 'mask', 'catalog'])
    parser.add_argument('source', help='raw tile directory (dem, mask) or COG directory (catalog)')
    parser.add_argument('dest', help='COG output directory (dem, mask) or public base URL (catalog)')
    args = parser.parse_args()
    if args.step == 'catalog':
        makeCatalog(args.source, args.dest)
        return
    os.makedirs(args.dest, exist_ok=True)
    (makeDem if args.step == 'dem' else makeMask)(args.source, args.dest)


if __name__ == '__main__':
    main()
