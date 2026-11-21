"""Write the viewer's Greenland glacier-name file from the Greenland Glacier Names shapefile (GGN v01,
Bjørk et al. 2015, The Cryosphere 9, 2215-2218, doi:10.5194/tc-9-2215-2015).

Example:

    python makeGlacierNames.py \\
        /Volumes/insar9/ian/Sentinel1/GreenlandGlacierNames_GGNv01_WGS84/GreenlandGlacierNames_GGNv01_WGS84.shp \\
        src/data/greenlandGlacierNames.json

Each entry is [lon, lat, id, type, official, foreign, newGreenlandic, oldGreenlandic, alternative, major]
(type: GrIS = ice-sheet outlet, LGIC = local glacier or ice cap; empty strings where a name is absent;
major = 1 for the glaciers in majorIds, the only ones the viewer labels when zoomed all the way out).
"""
import argparse
import json

from osgeo import ogr

ogr.UseExceptions()

nameFields = ['Official_n', 'Foreign_na', 'New_Greenl', 'Old_Greenl', 'Alternativ']
# Major outlet glaciers: Jakobshavn, Helheim, Kangerlussuaq, Petermann, Humboldt, Zachariae, Storstrømmen,
# Ryder, Hagen, Rink, Upernavik, Store, Kong Oscar, Daugaard-Jensen, Kangiata Nunaata, A.P. Bernstorff,
# Steenstrup, Hayes, Tracy. (79N / Nioghalvfjerdsbræ is not in GGN v01.)
majorIds = {'GGN0235', 'GGN0163', 'GGN0218', 'GGN0679', 'GGN0671', 'GGN0670', 'GGN0599', 'GGN0697', 'GGN0694',
            'GGN0347', 'GGN0452', 'GGN0279', 'GGN0553', 'GGN0345', 'GGN0094', 'GGN0089', 'GGN0542', 'GGN0539',
            'GGN0642'}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('shapefile', help='GreenlandGlacierNames_GGNv01_WGS84.shp')
    parser.add_argument('output', help='output .json')
    args = parser.parse_args()
    ds = ogr.Open(args.shapefile)  # keep the dataset open while its layer is read
    layer = ds.GetLayer()
    names = []
    for f in layer:
        names.append([round(f.GetField('LON'), 4), round(f.GetField('LAT'), 4), f.GetField('ID'), f.GetField('Type')]
                     + [(f.GetField(k) or '').strip() for k in nameFields] + [int(f.GetField('ID') in majorIds)])
    out = {'source': 'Greenland Glacier Names GGN v01, Bjørk et al. 2015, The Cryosphere 9, 2215-2218, '
                     'doi:10.5194/tc-9-2215-2015',
           'fields': ['lon', 'lat', 'id', 'type', 'official', 'foreign', 'newGreenlandic', 'oldGreenlandic', 'alternative',
                      'major'],
           'names': names}
    with open(args.output, 'w', encoding='utf-8') as fp:
        json.dump(out, fp, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(names)} names -> {args.output}')


if __name__ == '__main__':
    main()
