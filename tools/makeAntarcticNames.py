"""Write the viewer's Antarctic place-name file from the SCAR Composite Gazetteer of Antarctica
(Secretariat SCAR (1992, updated 2025), Composite Gazetteer of Antarctica, Scientific Committee on
Antarctic Research, https://placenames.aq/), read from its public API.

Example:

    python makeAntarcticNames.py src/data/antarcticPlaceNames.json

Only the feature types in featureTypes are kept (glaciers, ice shelves, bays, stations, ranges and the
like; not the many minor islands, mountains, capes and nunataks), plus Watercourse entries named Ice Stream
or Glacier (SCAR types Rutford, Foundation, Institute and Bailey Ice Streams as watercourses). majorNames
are the places the viewer labels when zoomed all the way out (listed under 'major' in the output as
'label@lon,lat'; where two places share a name, the one more gazetteers name, e.g. the Amundsen Sea Smith
Glacier rather than the Peninsula one). The gazetteer holds one name per
country per place, so names are grouped by place: each entry is
[lon, lat, label, featureType, nGazetteers, otherName, ...], where the label is the name most of those
gazetteers use (English-language gazetteers first on a tie), at that gazetteer's position.
"""
import argparse
import collections
import json
import os
import re
import urllib.parse
import urllib.request

api = 'https://placenames.aq/api/place_names_consolidated'
featureTypes = ['Glacier', 'Ice stream', 'Ice shelf', 'Ice rise', 'Ice sheet', 'Ice field', 'Dome', 'Icefall',
                'Bay', 'Inlet', 'Sound', 'Fjord', 'Gulf', 'Sea', 'Strait', 'Channel', 'Passage', 'Station', 'Peninsula',
                'Coast', 'Land', 'Range', 'Massif', 'Plateau', 'Basin', 'Archipelago', 'Subglacial lake']
englishFirst = ['USA', 'GBR', 'AUS', 'NZL', 'CAN', 'ZAF']
majorNames = ['Pine Island Glacier', 'Thwaites Glacier', 'Smith Glacier', 'Pope Glacier', 'Kohler Glacier', 'Getz Ice Shelf', 'Dotson Ice Shelf',
              'Crosson Ice Shelf', 'Abbot Ice Shelf', 'Totten Glacier', 'Moscow University Ice Shelf', 'Denman Glacier', 'Shackleton Ice Shelf',
              'West Ice Shelf', 'Lambert Glacier', 'Amery Ice Shelf', 'Shirase Glacier', 'Jutulstraumen', 'Fimbulisen', 'Brunt Ice Shelf',
              'Recovery Glacier', 'Slessor Glacier', 'Bailey Ice Stream', 'Support Force Glacier', 'Foundation Ice Stream', 'Möller Ice Stream',
              'Institute Ice Stream', 'Rutford Ice Stream', 'Filchner Ice Shelf', 'Ronne Ice Shelf', 'Larsen Ice Shelf', 'George VI Ice Shelf',
              'Wilkins Ice Shelf', 'Ross Ice Shelf', 'Whillans Ice Stream', 'Mercer Ice Stream', 'Kamb Ice Stream', 'Bindschadler Ice Stream',
              'MacAyeal Ice Stream', 'Byrd Glacier', 'Beardmore Glacier', 'Nimrod Glacier', 'Mulock Glacier', 'David Glacier', 'Mertz Glacier',
              'Ninnis Glacier', 'Cook Ice Shelf', 'McMurdo Station', 'Amundsen Scott South Pole Station', 'Vostok Station', 'Concordia Station',
              'Casey Station', 'Davis Station', 'Mawson Station', 'Rothera Station', 'Palmer Station', 'Halley Station', 'Neumayer Station',
              "Dumont d'Urville Station", 'Marie Byrd Land', 'Ellsworth Land', 'Wilkes Land', 'Dronning Maud Land', 'Enderby Land', 'Victoria Land',
              'Coats Land', 'Palmer Land', 'Graham Land', 'Oates Land', 'Kemp Land', 'Mac. Robertson Land', 'Princess Elizabeth Land', 'Ross Sea',
              'Weddell Sea', 'Amundsen Sea', 'Bellingshausen Sea', 'Dome Argus', 'Dome Charlie', 'Dome Fuji Station', 'Siple Coast']


def fetchNames(pageSize=5000):
    columns = 'place_id,place_name_mapping,place_name_gazetteer,latitude,longitude,feature_type_name,gazetteer_code'
    types = ','.join(f'"{t}"' for t in featureTypes + ['Watercourse'])
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
    rows = [r for r in fetchNames() if r['latitude'] is not None and r['longitude'] is not None and r['place_name_mapping']
            and (r['feature_type_name'] != 'Watercourse' or re.search(r'Ice Stream|Glacier', r['place_name_mapping']))]
    for r in rows:
        if r['feature_type_name'] == 'Watercourse':
            r['feature_type_name'] = 'Ice stream' if 'Ice Stream' in r['place_name_mapping'] else 'Glacier'
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
           'major': sorted(f'{n[2]}@{n[0]},{n[1]}' for n in [max((m for m in names if m[2] == k), key=lambda m: m[4])
                                                                for k in set(majorNames) if any(m[2] == k for m in names)]),
           'fields': ['lon', 'lat', 'label', 'featureType', 'nGazetteers', 'otherNames...'],
           'names': names}
    with open(args.output, 'w', encoding='utf-8') as fp:
        json.dump(out, fp, ensure_ascii=False, separators=(',', ':'))
    missing = sorted(set(majorNames) - {n[2] for n in names})
    print(f'{len(rows)} names, {len(names)} places, {len(out["major"])} major -> {args.output} ({os.path.getsize(args.output) / 1e6:.2f} MB)'
          + (f'; major names not found: {missing}' if missing else ''))


if __name__ == '__main__':
    main()
