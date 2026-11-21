"""Write the viewer's glacier-front file from the NSIDC-0642 v2 terminus shapefiles (MEaSUREs Annual Greenland
Outlet Glacier Terminus Positions from SAR Mosaics, V002, doi:10.5067/ESFWE11AVFKW).

Example (the 50 termini_<y0>_<y1>_v02.0.shp files downloaded from NSIDC into one directory):

    python makeTermini.py nsidc0642/ src/data/greenlandTermini.json --tolerance 15

Each front is [year, glacierId, sourceDate, quality, x0, y0, x1, y1, ...] in EPSG:3413 metres (rounded),
where year is the second year of the file's winter (termini_2019_2020 -> 2020), simplified with the
Douglas-Peucker tolerance given (m).
"""
import argparse
import glob
import json
import os
import re

from osgeo import ogr

ogr.UseExceptions()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('directory', help='directory holding termini_*_v02.0.shp')
    parser.add_argument('output', help='output .json')
    parser.add_argument('--tolerance', type=float, default=15, help='simplification tolerance (m)')
    args = parser.parse_args()
    fronts, vertices = [], 0
    for path in sorted(glob.glob(os.path.join(args.directory, 'termini_*_v02.0.shp'))):
        year = int(re.search(r'termini_\d{4}_(\d{4})_', path).group(1))
        ds = ogr.Open(path)  # keep the dataset open while its layer is read
        for f in ds.GetLayer():
            g = f.GetGeometryRef()
            if g is None:
                continue
            g = g.SimplifyPreserveTopology(args.tolerance)
            parts = [g.GetGeometryRef(i) for i in range(g.GetGeometryCount())] if g.GetGeometryCount() else [g]
            for p in parts:
                xy = [round(v) for k in range(p.GetPointCount()) for v in p.GetPoint_2D(k)]
                if len(xy) >= 4:
                    fronts.append([year, f.GetField('Glacier_ID'), f.GetField('SourceDate') or '', f.GetField('Quality_Fl') or 0] + xy)
                    vertices += len(xy) // 2
    out = {'source': 'NSIDC-0642 v2, MEaSUREs Annual Greenland Outlet Glacier Terminus Positions from SAR Mosaics, '
                     'doi:10.5067/ESFWE11AVFKW',
           'epsg': 3413, 'tolerance': args.tolerance,
           'fields': ['year', 'glacierId', 'sourceDate', 'quality', 'x0', 'y0', 'x1', 'y1', '...'],
           'fronts': fronts}
    with open(args.output, 'w') as fp:
        json.dump(out, fp, separators=(',', ':'))
    print(f'{len(fronts)} fronts, {vertices} vertices -> {args.output} ({os.path.getsize(args.output) / 1e6:.2f} MB)')


if __name__ == '__main__':
    main()
