"""Write the viewer's Antarctic ice-front file from the hand-edited not-ocean outlines of the September 2026 GrIMP
Antarctic ice mask (the coastNotOcean_all.vrt union that makeIceMask.py rasterizes).

Example:

    python makeIceFront.py /Volumes/insar4/ian/Antarctica2026/AntarcticaMasks/maskShapesSeptember2026/coastNotOcean_all.vrt \\
        src/data/antarcticIceFront.json --tolerance 50

The pieces (sector outlines, the Amundsen box, Peninsula islands) are dissolved into one outline so the
straight sector cuts do not show; a closing of --close m (buffer out, then in) first bridges the gaps of up
to 2 x close between pieces (the Amundsen box edges stop ~300 m short of the sector cuts). The output is
every ring of the dissolved outline (ice front and coast, islands, holes) as flat [x0, y0, x1, y1, ...]
in EPSG:3031 metres (rounded), simplified with the Douglas-Peucker tolerance given (m).
"""
import argparse
import json
import os

from osgeo import ogr

ogr.UseExceptions()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('vrt', help='coastNotOcean_all.vrt')
    parser.add_argument('output', help='output .json')
    parser.add_argument('--tolerance', type=float, default=50, help='simplification tolerance (m)')
    parser.add_argument('--close', type=float, default=300, help='closing distance that bridges gaps between pieces (m)')
    args = parser.parse_args()
    ds = ogr.Open(args.vrt)  # keep the dataset open while its layer is read
    pieces = ogr.Geometry(ogr.wkbMultiPolygon)
    for f in ds.GetLayer():
        g = f.GetGeometryRef()
        for p in ([g.GetGeometryRef(i) for i in range(g.GetGeometryCount())] if g.GetGeometryType() == ogr.wkbMultiPolygon else [g]):
            pieces.AddGeometry(p)
    outline = pieces.Buffer(args.close).Buffer(-args.close).UnionCascaded() if args.close > 0 else pieces.UnionCascaded()
    outline = outline.SimplifyPreserveTopology(args.tolerance)
    polys = [outline.GetGeometryRef(i) for i in range(outline.GetGeometryCount())] if outline.GetGeometryType() == ogr.wkbMultiPolygon else [outline]
    rings, vertices = [], 0
    for p in polys:
        for k in range(p.GetGeometryCount()):
            r = p.GetGeometryRef(k)
            xy = [round(v) for i in range(r.GetPointCount()) for v in r.GetPoint_2D(i)]
            if len(xy) >= 8:
                rings.append(xy)
                vertices += len(xy) // 2
    out = {'source': 'GrIMP Antarctic ice mask outlines, September 2026 (coastNotOcean_all.vrt)', 'epsg': 3031,
           'tolerance': args.tolerance, 'close': args.close, 'rings': rings}
    with open(args.output, 'w') as fp:
        json.dump(out, fp, separators=(',', ':'))
    print(f'{pieces.GetGeometryCount()} pieces -> {len(polys)} polygons, {len(rings)} rings, {vertices} vertices -> {args.output} '
          f'({os.path.getsize(args.output) / 1e6:.2f} MB)')


if __name__ == '__main__':
    main()
