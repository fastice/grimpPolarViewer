"""Write the viewer's Greenland basin file from the Mouginot and Rignot (2019) glacier drainage basins
(Mouginot, J. and Rignot, E., 2019, Glacier catchments/basins for the Greenland Ice Sheet, Dryad,
doi:10.7280/D1WT11), shapefile Greenland_Basins_PS_v1.4.2.shp.

Example:

    python makeGreenlandBasins.py Greenland_Basins_PS_v1.4.2.shp src/data/greenlandBasins.json --tolerance 100

The output has the layout of makeAntarcticBoundaries.py ('basins': [name, ring, ring, ...] with rings as flat
[x0, y0, x1, y1, ...] in EPSG:3413 metres, simplified with the Douglas-Peucker tolerance given). Names are left
empty: the viewer labels glaciers from its Glacier names layer. The seven ICE_CAPS_<region> features
(outlines of the peripheral ice caps, not ice-sheet basins) and rings smaller than --minArea km2 (islands, nunatak
holes) are dropped: thousands of them speckle the coast.
"""
import argparse
import json
import os

from makeAntarcticBoundaries import readLayer


def ringArea(xy):
    return abs(sum(xy[i] * xy[i + 3] - xy[i + 2] * xy[i + 1] for i in range(0, len(xy) - 2, 2))) / 2e6


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('shapefile', help='Greenland_Basins_PS_v1.4.2.shp')
    parser.add_argument('output', help='output .json')
    parser.add_argument('--tolerance', type=float, default=100, help='simplification tolerance (m)')
    parser.add_argument('--minArea', type=float, default=10, help='smallest ring kept (km2)')
    args = parser.parse_args()
    basins, _ = readLayer(args.shapefile, args.tolerance, epsg=3413)
    basins = [b for b in ([b[0]] + [r for r in b[1:] if ringArea(r) >= args.minArea] for b in basins if not b[0].startswith('ICE_CAPS')) if len(b) > 1]
    n = sum(len(r) // 2 for b in basins for r in b[1:])
    out = {'source': 'Mouginot, J. and Rignot, E. (2019). Glacier catchments/basins for the Greenland Ice Sheet, Dryad, '
                     'doi:10.7280/D1WT11 (Greenland_Basins_PS_v1.4.2)',
           'epsg': 3413, 'tolerance': args.tolerance, 'basins': [[''] + b[1:] for b in basins]}
    with open(args.output, 'w') as fp:
        json.dump(out, fp, separators=(',', ':'))
    print(f'basins: {len(basins)} features, {n} vertices -> {args.output} '
          f'(rings >= {args.minArea} km2) ({os.path.getsize(args.output) / 1e6:.2f} MB)')


if __name__ == '__main__':
    main()
