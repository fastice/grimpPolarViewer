"""Write the viewer's dated Amundsen Sea grounding-line file from NSIDC-0498 v2.1 (MEaSUREs Antarctic Grounding
Line from Differential Satellite Radar Interferometry, doi:10.5067/IKBWW4RYHF1Q).

Example:

    python makeAseGroundingLines.py InSAR_GL_Antarctica_v02.1.gpkg src/data/aseGroundingLines.json --tolerance 30

Keeps the lines of the Amundsen Sea glaciers (aseGlaciers, matched in Glac_Name) that reach into the
Amundsen Sea box (EPSG:3031 metres; Abbot to Getz). Each line is
[year, date, sensor, glacier, [x0, y0, x1, y1, ...], ...] (one flat list per piece) in EPSG:3031 metres
(rounded), simplified with the
Douglas-Peucker tolerance given (m); date is the first image date in the DInSAR file name (YYYY-MM-DD)
where the name carries one, else empty (the 1990s ERS lines give only the year).
"""
import argparse
import json
import os
import re

from osgeo import ogr

ogr.UseExceptions()

aseBox = (-1950e3, -1250e3, -1200e3, 200e3)  # xmin, ymin, xmax, ymax
aseGlaciers = ['Pine Island', 'Thwaites', 'Pope', 'Smith', 'Kohler', 'Haynes', 'Getz', 'Abbot', 'Cosgrove', 'Venable', 'Dotson', 'Crosson']


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('gpkg', help='InSAR_GL_Antarctica_v02.1.gpkg')
    parser.add_argument('output', help='output .json')
    parser.add_argument('--tolerance', type=float, default=30, help='simplification tolerance (m)')
    args = parser.parse_args()
    ds = ogr.Open(args.gpkg)  # keep the dataset open while its layer is read
    layer = ds.GetLayer()
    layer.SetSpatialFilterRect(*aseBox)
    lines, vertices = [], 0
    for f in layer:
        if not any(n in (f.GetField('Glac_Name') or '') for n in aseGlaciers):
            continue
        m = re.search(r'(?<!\d)((?:19|20)\d{2})(\d{2})(\d{2})(?!\d)', f.GetField('Filename') or '')
        date = f'{m.group(1)}-{m.group(2)}-{m.group(3)}' if m else ''
        g = f.GetGeometryRef().SimplifyPreserveTopology(args.tolerance)
        parts = [g.GetGeometryRef(i) for i in range(g.GetGeometryCount())] if g.GetGeometryCount() else [g]
        pieces = [[round(v) for k in range(p.GetPointCount()) for v in p.GetPoint_2D(k)] for p in parts]
        pieces = [xy for xy in pieces if len(xy) >= 4]
        if pieces:
            lines.append([f.GetField('Year'), date, f.GetField('Sensor') or '', (f.GetField('Glac_Name') or '').strip()] + pieces)
            vertices += sum(len(xy) // 2 for xy in pieces)
    out = {'source': 'NSIDC-0498 v2.1, MEaSUREs Antarctic Grounding Line from Differential Satellite Radar Interferometry, '
                     'doi:10.5067/IKBWW4RYHF1Q',
           'epsg': 3031, 'tolerance': args.tolerance, 'box': aseBox,
           'fields': ['year', 'date', 'sensor', 'glacier', 'pieces...'],
           'lines': lines}
    with open(args.output, 'w') as fp:
        json.dump(out, fp, separators=(',', ':'))
    print(f'{len(lines)} lines, {vertices} vertices -> {args.output} ({os.path.getsize(args.output) / 1e6:.2f} MB)')


if __name__ == '__main__':
    main()
