"""helheimStakes.gpkg for the tutorial: four GPS stakes across the Helheim trunk, in UTM zone 24N, with a
name and a height each, as a file from another program would be."""
import os
from osgeo import ogr, osr
ogr.UseExceptions()
wgs = osr.SpatialReference()
wgs.ImportFromEPSG(4326)
wgs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
utm = osr.SpatialReference()
utm.ImportFromEPSG(32624)
toUtm = osr.CoordinateTransformation(wgs, utm)
ds = ogr.GetDriverByName('GPKG').CreateDataSource(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'helheimStakes.gpkg'))
lyr = ds.CreateLayer('gpsStakes', utm, ogr.wkbPoint)
for fName, fType in (('name', ogr.OFTString), ('elev_m', ogr.OFTReal), ('installed', ogr.OFTDate)):
    lyr.CreateField(ogr.FieldDefn(fName, fType))
for k, (lon, lat, elev) in enumerate([(-38.30, 66.40, 410.0), (-38.42, 66.43, 520.0), (-38.55, 66.45, 640.0), (-38.68, 66.47, 760.0)]):
    f = ogr.Feature(lyr.GetLayerDefn())
    f.SetGeometry(ogr.CreateGeometryFromWkt('POINT (%.1f %.1f)' % toUtm.TransformPoint(lon, lat)[:2]))
    f.SetField('name', f'Stake {"ABCD"[k]}')
    f.SetField('elev_m', elev)
    f.SetField('installed', '2025-06-1%d' % k)
    lyr.CreateFeature(f)
ds = None
