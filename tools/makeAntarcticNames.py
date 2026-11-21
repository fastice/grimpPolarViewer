"""Write the viewer's Antarctic place-name file from the SCAR Composite Gazetteer of Antarctica
(Secretariat SCAR (1992, updated 2025), Composite Gazetteer of Antarctica, Scientific Committee on
Antarctic Research, https://placenames.aq/), read from its public API.

Example:

    python makeAntarcticNames.py src/data/antarcticPlaceNames.json

Only the feature types in featureTypes are kept (glaciers, ice shelves, bays, stations, ranges and the
like; not the many minor islands, mountains, capes and nunataks). The gazetteer holds one name per
country per place, so names are grouped by place: each entry is
[lon, lat, label, featureType, nGazetteers, otherName, ...], where the label is the name most of those
gazetteers use (English-language gazetteers first on a tie), at that gazetteer's position.
"""
import argparse
import collections
import json
import os
import urllib.parse
import urllib.request

api = 'https://placenames.aq/api/place_names_consolidated'
featureTypes = ['Glacier', 'Ice stream', 'Ice shelf', 'Ice rise', 'Ice sheet', 'Ice field', 'Dome', 'Icefall',
                'Bay', 'Inlet', 'Sound', 'Fjord', 'Gulf', 'Sea', 'Strait', 'Channel', 'Passage', 'Station', 'Peninsula',
                'Coast', 'Land', 'Range', 'Massif', 'Plateau', 'Basin', 'Archipelago', 'Subglacial lake']
englishFirst = ['USA', 'GBR', 'AUS', 'NZL', 'CAN', 'ZAF']


def fetchNames(pageSize=5000):
    columns = 'place_id,place_name_mapping,place_name_gazetteer,latitude,longitude,feature_type_name,gazetteer_code'
    types = ','.join(f'"{t}"' for t in featureTypes)
    rows, offset = [], 0
    while True:
        query = urllib.parse.urlencode({'select': columns, 'feature_type_name': f'in.({types})', 'is_relic': 'eq.false',
                                        'order': 'name_id', 'limit': pageSize, 'offset': offset})
        with urllib.request.urlopen(f'{api}?{query}', timeout=120) as r:
            page = json.load(r)
        rows += page
        if len(page) < pageSize:
            return rows
        offset += pageSize


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('output', help='output .json')
    args = parser.parse_args()
    rows = [r for r in fetchNames() if r['latitude'] is not None and r['longitude'] is not None and r['place_name_mapping']]
    places = collections.defaultdict(list)
    for r in rows:
        places[r['place_id']].append(r)
    names = []
    for group in places.values():
        votes = collections.Counter(r['place_name_mapping'] for r in group)
        rank = lambda r: (-votes[r['place_name_mapping']],
                          englishFirst.index(r['gazetteer_code']) if r['gazetteer_code'] in englishFirst else len(englishFirst))
        best = min(group, key=rank)
        others = sorted({n for r in group for n in (r['place_name_mapping'], r['place_name_gazetteer']) if n} - {best['place_name_mapping']})
        names.append([round(best['longitude'], 4), round(best['latitude'], 4), best['place_name_mapping'], best['feature_type_name'],
                      len({r['gazetteer_code'] for r in group})] + others)
    names.sort(key=lambda n: (-n[4], n[2]))
    out = {'source': 'Secretariat SCAR (1992, updated 2025). Composite Gazetteer of Antarctica, Scientific Committee on '
                     'Antarctic Research. https://placenames.aq/',
           'featureTypes': featureTypes,
           'fields': ['lon', 'lat', 'label', 'featureType', 'nGazetteers', 'otherNames...'],
           'names': names}
    with open(args.output, 'w', encoding='utf-8') as fp:
        json.dump(out, fp, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(rows)} names, {len(names)} places -> {args.output} ({os.path.getsize(args.output) / 1e6:.2f} MB)')


if __name__ == '__main__':
    main()
