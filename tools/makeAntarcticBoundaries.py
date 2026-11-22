"""Write the viewer's Antarctic boundary file from the NSIDC-0709 v2 shapefiles (MEaSUREs Antarctic Boundaries
for IPY 2007-2009 from Satellite Radar, V002, doi:10.5067/AXE4121732AD): the grounding line, the IMBIE
basins and the ice shelves.

Example (GroundingLine_, Basins_IMBIE_ and IceShelf_Antarctica_v02.shp downloaded from NSIDC into one directory):

    python makeAntarcticBoundaries.py nsidc0709/ src/data/antarcticBoundaries.json --tolerance 100

Each layer is a list of [name, ring, ring, ...] with rings as flat [x0, y0, x1, y1, ...] in EPSG:3031 metres
(rounded), simplified with the Douglas-Peucker tolerance given (m). The grounding line is the outline of
the grounded-ice polygon.
"""
import argparse
import json
import os

from osgeo import ogr, osr

ogr.UseExceptions()

layers = {'groundingLine': 'GroundingLine_Antarctica_v02.shp', 'basins': 'Basins_IMBIE_Antarctica_v02.shp',
          'iceShelves': 'IceShelf_Antarctica_v02.shp'}


def readLayer(path, tolerance, epsg=3031):
    ds = ogr.Open(path)  # keep the dataset open while its layer is read
    layer = ds.GetLayer()
    target = osr.SpatialReference()
    target.ImportFromEPSG(epsg)
    target.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    out, vertices = [], 0
    for f in layer:
        g = f.GetGeometryRef().Clone()
        g.TransformTo(target)
        g = g.SimplifyPreserveTopology(tolerance)
        polys = [g.GetGeometryRef(i) for i in range(g.GetGeometryCount())] if g.GetGeometryType() == ogr.wkbMultiPolygon else [g]
        rings = []
        for p in polys:
            for k in range(p.GetGeometryCount()):
                r = p.GetGeometryRef(k)
                xy = [round(v) for i in range(r.GetPointCount()) for v in r.GetPoint_2D(i)]
                if len(xy) >= 8:
                    rings.append(xy)
                    vertices += len(xy) // 2
        if rings:
            out.append([(f.GetField('NAME') or '').strip()] + rings)
    return out, vertices


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('directory', help='directory holding the NSIDC-0709 v2 shapefiles')
    parser.add_argument('output', help='output .json')
    parser.add_argument('--tolerance', type=float, default=100, help='simplification tolerance (m)')
    args = parser.parse_args()
    out = {'source': 'NSIDC-0709 v2, MEaSUREs Antarctic Boundaries for IPY 2007-2009 from Satellite Radar, doi:10.5067/AXE4121732AD',
           'epsg': 3031, 'tolerance': args.tolerance}
    for key, name in layers.items():
        out[key], n = readLayer(os.path.join(args.directory, name), args.tolerance)
        print(f'{key}: {len(out[key])} features, {n} vertices')
    with open(args.output, 'w') as fp:
        json.dump(out, fp, separators=(',', ':'))
    print(f'-> {args.output} ({os.path.getsize(args.output) / 1e6:.2f} MB)')


if __name__ == '__main__':
    main()
