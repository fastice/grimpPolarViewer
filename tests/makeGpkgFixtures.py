"""GeoPackages for gpkgOpen.test.mjs, written by GDAL into the directory given: one from "another program"
(UTM zone 22N, a multi-part polygon layer with a hole and heights, a point layer with a row with no shape, a
curved layer), one in EPSG:3031 (Pine Island), and one too large to open (300,000 points)."""
import sys
from osgeo import ogr, osr
ogr.UseExceptions()
outDir = sys.argv[1]


def srs(code):
    s = osr.SpatialReference()
    s.ImportFromEPSG(code)
    return s


def newLayer(ds, name, code, gType, fields):
    lyr = ds.CreateLayer(name, srs(code), gType)
    for fName, fType in fields:
        lyr.CreateField(ogr.FieldDefn(fName, fType))
    return lyr


def addFeature(lyr, wkt, values):
    f = ogr.Feature(lyr.GetLayerDefn())
    if wkt:
        f.SetGeometry(ogr.CreateGeometryFromWkt(wkt))
    for k, v in values.items():
        f.SetField(k, v)
    lyr.CreateFeature(f)



wgs = srs(4326)
wgs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
utm = srs(32622)
toUtm = osr.CoordinateTransformation(wgs, utm)


def ring(lonLats):
    return '(' + ', '.join(f'{x:.3f} {y:.3f} 100' for x, y, _ in (toUtm.TransformPoint(lon, lat) for lon, lat in lonLats + lonLats[:1])) + ')'


ds = ogr.GetDriverByName('GPKG').CreateDataSource(f'{outDir}/foreign.gpkg')
gl = newLayer(ds, 'glaciers', 32622, ogr.wkbMultiPolygon25D, [('NAME', ogr.OFTString), ('code', ogr.OFTInteger), ('area', ogr.OFTReal),
                                                               ('surveyed', ogr.OFTDate), ('Shape_Length', ogr.OFTReal)])
outer = ring([(-49.8, 69.0), (-49.3, 69.0), (-49.3, 69.2), (-49.8, 69.2)])
hole = ring([(-49.6, 69.08), (-49.5, 69.08), (-49.5, 69.12), (-49.6, 69.12)])
second = ring([(-49.2, 69.25), (-49.0, 69.25), (-49.0, 69.3)])
addFeature(gl, f'MULTIPOLYGON Z (({outer}, {hole}), ({second}))', {'NAME': 'Glacier A', 'code': 7, 'area': 123.5, 'surveyed': '2024-08-15', 'Shape_Length': 1.5})
addFeature(gl, f'MULTIPOLYGON Z (({ring([(-48.9, 69.0), (-48.7, 69.0), (-48.7, 69.1)])}))', {'NAME': 'Glacier B', 'code': 8})
st = newLayer(ds, 'stakes', 32622, ogr.wkbPoint, [('id', ogr.OFTInteger), ('elev', ogr.OFTReal), ('label', ogr.OFTString)])
for k, ll in enumerate([(-49.4, 69.15), None, (-49.1, 69.05)]):
    wkt = None if ll is None else "POINT (%.3f %.3f)" % toUtm.TransformPoint(*ll)[:2]
    addFeature(st, wkt, {'id': 100 + k, 'elev': 250.5 + k, 'label': f'stake {k}'})
arcs = ds.CreateLayer('arcs', utm, ogr.wkbCircularString)
addFeature(arcs, 'CIRCULARSTRING (%.0f %.0f, %.0f %.0f, %.0f %.0f)' % (*toUtm.TransformPoint(-49.5, 69.3)[:2], *toUtm.TransformPoint(-49.4, 69.32)[:2],
                                                                        *toUtm.TransformPoint(-49.3, 69.3)[:2]), {})
ds = None

ds = ogr.GetDriverByName('GPKG').CreateDataSource(f'{outDir}/antarctic.gpkg')
pig = newLayer(ds, 'pig', 3031, ogr.wkbPolygon, [('name', ogr.OFTString)])
addFeature(pig, 'POLYGON ((-1600000 -250000, -1550000 -250000, -1550000 -300000, -1600000 -250000))', {'name': 'Pine Island box'})
ds = None

ds = ogr.GetDriverByName('GPKG').CreateDataSource(f'{outDir}/tooBig.gpkg')
big = newLayer(ds, 'track', 4326, ogr.wkbLineString, [])
addFeature(big, 'LINESTRING (' + ', '.join(f'{-50 + k * 1e-5:.5f} 69.1' for k in range(300000)) + ')', {})
ds = None
