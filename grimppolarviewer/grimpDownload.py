"""grimpdownload: download GrIMP products, whole or cropped to a box, from a download file (.grimp.yaml)
saved by the GrIMP Polar Viewer. Files are read from NSIDC when NSIDC holds the same version (this needs
a free NASA Earthdata login) and from the Kopah copies otherwise, without overloading NSIDC.

    grimpdownload selection.grimp.yaml --outDir jakobshavn
    grimpdownload --login            # save your Earthdata login once

See Documents/grimpDownload.md in https://github.com/fastice/grimpPolarViewer.
"""
import argparse
import getpass
import json
import math
import netrc
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import requests
import yaml

# Remote-read settings must be in place before GDAL starts.
os.environ.setdefault('GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR')
os.environ.setdefault('GDAL_HTTP_COOKIEFILE', os.path.expanduser('~/.grimp_download_cookiejar.txt'))
os.environ.setdefault('GDAL_HTTP_COOKIEJAR', os.path.expanduser('~/.grimp_download_cookiejar.txt'))
os.environ.setdefault('GDAL_HTTP_NETRC', 'YES')

import rasterio  # noqa: E402
from rasterio.windows import Window  # noqa: E402

cmrGranules = 'https://cmr.earthdata.nasa.gov/search/granules.umm_json'
ursHost = 'urs.earthdata.nasa.gov'
# NSIDC refuses requests when too many arrive at once: GDAL then reports the file as "not recognized as
# a supported dataset name" (no HTTP code) and the service stays unavailable for a while. Each file is
# read with one range request at a time and retried briefly; after that the downloader pauses NSIDC
# reads for these times (seconds), doubling the gap between files.
readRetryDelays = [5, 15]
nsidcBackoff = [30, 60, 120, 240, 480, 900]
maxRefusals = 8
confirmGB = 5


class Refused(Exception):
    '''The server refused or dropped the request (retry later).'''


class AuthFailed(Exception):
    '''Earthdata login was rejected (do not retry).'''


def remoteRetry(path, func):
    '''Call func() (which opens and reads path) with serial range requests, retrying a refused read.'''
    for attempt in range(len(readRetryDelays) + 1):
        try:
            with rasterio.Env(GDAL_HTTP_MULTIRANGE='SERIAL'):
                return func()
        except rasterio.errors.RasterioIOError:
            if attempt == len(readRetryDelays):
                raise
            time.sleep(readRetryDelays[attempt])


def loadManifest(path):
    with open(path) as fp:
        m = yaml.safe_load(fp)
    if not isinstance(m, dict) or m.get('grimpDownload') != 1:
        raise ValueError(f'{path}: not a grimpDownload version 1 file')
    for key in ['items', 'assets']:
        if not m.get(key):
            raise ValueError(f'{path}: no {key}')
    sites = {s.group(1) for s in (re.match(r'(?:TSX|TDX)_([EW]\d+\.\d+[NS])_', it['id']) for it in m['items']) if s}
    if len(sites) > 1:
        raise ValueError(f'{path}: TerraSAR-X downloads are one site box at a time; this one has {len(sites)}')
    return m


def nsidcFiles(nsidc, items):
    '''
    One CMR search for the product and version over the items' date span; returns {file name: url}
    for the GeoTIFFs NSIDC holds. Files are matched to the Kopah copies by name.
    '''
    start = min(str(it['start']) for it in items)[:10]
    end = max(str(it['end']) for it in items)[:10]
    params = {'short_name': nsidc['shortName'], 'version': str(nsidc['version']), 'provider': 'NSIDC_CPRD',
              'temporal': f'{start}T00:00:00Z,{end}T23:59:59Z', 'page_size': 2000}
    found, headers = {}, {}
    while True:
        r = requests.get(cmrGranules, params=params, headers=headers, timeout=60)
        r.raise_for_status()
        granules = r.json()['items']
        for g in granules:
            for u in g['umm'].get('RelatedUrls', []):
                url = u['URL']
                if url.startswith('https://') and url.endswith('.tif') and u.get('Type') == 'GET DATA':
                    found[url.rsplit('/', 1)[1]] = url
        after = r.headers.get('CMR-Search-After')
        if not after or not granules:
            return found
        headers = {'CMR-Search-After': after}


def haveLogin():
    try:
        return netrc.netrc().authenticators(ursHost) is not None
    except (FileNotFoundError, netrc.NetrcParseError):
        return False


def saveLogin():
    '''Ask for the Earthdata user name and password and put them in ~/.netrc (mode 600).'''
    print('NASA Earthdata login (create one free at https://urs.earthdata.nasa.gov/users/new)')
    user = input('User name: ').strip()
    password = getpass.getpass('Password: ')
    path = os.path.expanduser('~/.netrc')
    lines = open(path).read().splitlines() if os.path.exists(path) else []
    lines = [ln for ln in lines if ursHost not in ln]
    lines.append(f'machine {ursHost} login {user} password {password}')
    with open(path, 'w') as fp:
        fp.write('\n'.join(lines) + '\n')
    os.chmod(path, 0o600)
    print(f'Saved to {path}.')


def classify(err):
    msg = str(err)
    if re.search(r'\b(401|403)\b|Unauthorized|Forbidden', msg):
        return AuthFailed(msg)
    return Refused(msg)


def overviewLevel(src, res):
    '''Overview level (-1 = full resolution) whose pixel size is closest to res metres.'''
    if not res:
        return -1
    native = abs(src.transform.a)
    factors = [1] + src.overviews(1)
    k = min(range(len(factors)), key=lambda i: abs(math.log(native * factors[i] / res)))
    return k - 1


def bboxWindow(transform, bbox):
    '''Window covering bbox (minx, miny, maxx, maxy), expanded outward to whole pixels.'''
    c0, r0 = ~transform * (bbox[0], bbox[3])
    c1, r1 = ~transform * (bbox[2], bbox[1])
    c0, r0 = math.floor(c0), math.floor(r0)
    return Window(c0, r0, math.ceil(c1) - c0, math.ceil(r1) - r0)


class Downloader:
    '''Runs a download file; reports through self.status (a dict read by the display).'''

    def __init__(self, manifest, outDir, source='auto', nsidcGap=1.0, kopahWorkers=4, retryFailed=False):
        self.m, self.outDir, self.source = manifest, outDir, source
        self.gap, self.kopahWorkers, self.retryFailed = nsidcGap, kopahWorkers, retryFailed
        self.crop = manifest.get('crop')
        self.lock = threading.Lock()
        self.templates = {}  # (asset, overview level) -> (width, height, transform) of the first file
        self.levels = {}  # asset -> overview level for the crop resolution
        self.state = {}
        self.statePath = os.path.join(outDir, 'grimpDownload.state.json')
        self.status = {'done': 0, 'skipped': 0, 'failed': 0, 'mb': 0.0, 'now': '', 'note': '', 'stop': ''}
        self.session = requests.Session()
        self.log = None

    def plan(self):
        '''One task per item and asset: source, url and output path.'''
        m = self.m
        nsidc = nsidcFiles(m['nsidc'], m['items']) if self.source != 'kopah' and m.get('nsidc') else {}
        tasks = []
        for it in m['items']:
            for a in m['assets']:
                kopah = it.get('files', {}).get(a)
                if not kopah:
                    continue
                name = kopah.rsplit('/', 1)[1]
                if name in nsidc:
                    src, url = 'NSIDC', nsidc[name]
                elif self.source == 'nsidc':
                    src, url = 'missing', None
                else:
                    src, url = 'Kopah', kopah
                tasks.append({'id': it['id'], 'asset': a, 'source': src, 'url': url,
                              'out': os.path.join(self.outDir, self.outName(name))})
        self.tasks = tasks
        return tasks

    def outName(self, name):
        if not self.crop:
            return name
        b, r = self.crop['bbox'], self.crop.get('resolution') or 0
        return name.replace('.tif', f'_crop_{round(b[0])}_{round(b[3])}_{round(r)}m.tif')

    def estimateMB(self):
        if not self.crop:
            return None
        b, r = self.crop['bbox'], self.crop.get('resolution') or 200
        return (b[2] - b[0]) / r * (b[3] - b[1]) / r * 4 * len(self.tasks) / 1e6

    def note(self, text):
        with self.lock:
            self.status['note'] = text
        if self.log:
            self.log.write(f'{time.strftime("%F %T")} {text}\n')
            self.log.flush()

    def finish(self, task, ok, msg=''):
        with self.lock:
            key = f"{task['id']}|{task['asset']}"
            if ok:
                self.status['done'] += 1
                self.state.pop(key, None)
            else:
                self.status['failed'] += 1
                self.state[key] = msg
            with open(self.statePath, 'w') as fp:
                json.dump(self.state, fp, indent=1)
        if self.log:
            self.log.write(f"{time.strftime('%F %T')} {'ok' if ok else 'FAILED'} {task['source']} "
                           f"{os.path.basename(task['out'])} {msg}\n")
            self.log.flush()

    def fetchWhole(self, task):
        tmp = task['out'] + '.part'
        try:
            with self.session.get(task['url'], stream=True, timeout=120) as r:
                if r.status_code in (401, 403):
                    raise AuthFailed(f'HTTP {r.status_code}')
                if r.status_code != 200:
                    raise Refused(f'HTTP {r.status_code}')
                with open(tmp, 'wb') as fp:
                    for chunk in r.iter_content(1 << 20):
                        fp.write(chunk)
                        with self.lock:
                            self.status['mb'] += len(chunk) / 1e6
        except requests.RequestException as err:
            raise Refused(str(err))
        os.replace(tmp, task['out'])

    def fetchCrop(self, task):
        path = f"/vsicurl/?list_dir=no&url={task['url']}"
        bbox, res = self.crop['bbox'], self.crop.get('resolution')

        def read():
            if task['asset'] not in self.levels:  # pick the overview level once per asset
                with rasterio.open(path) as src0:
                    self.levels[task['asset']] = overviewLevel(src0, res)
            level = self.levels[task['asset']]
            with rasterio.open(path, overview_level=level) as src:
                grid = (task['asset'], level)
                t = self.templates.setdefault(grid, (src.width, src.height, src.transform))
                if (src.width, src.height) != t[:2] or not src.transform.almost_equals(t[2]):
                    raise ValueError(f'grid {src.width}x{src.height} differs from the first product '
                                     f'{t[0]}x{t[1]}; download products on different grids separately')
                w = bboxWindow(src.transform, bbox)
                fill = src.nodata if src.nodata is not None else 0
                data = src.read(window=w, boundless=True, fill_value=fill)
                profile = dict(driver='GTiff', width=w.width, height=w.height, count=src.count,
                               dtype=src.dtypes[0], crs=src.crs, transform=src.window_transform(w),
                               nodata=src.nodata, tiled=True, blockxsize=256, blockysize=256,
                               compress='deflate')
                return data, profile, src.tags()
        try:
            data, profile, tags = remoteRetry(path, read)
        except rasterio.errors.RasterioIOError as err:
            raise classify(err)
        tmp = task['out'] + '.part'
        with rasterio.open(tmp, 'w', **profile) as dst:
            dst.write(data)
            dst.update_tags(**tags, grimpDownloadSource=task['url'], grimpDownloadBbox=str(bbox))
        os.replace(tmp, task['out'])
        with self.lock:
            self.status['mb'] += data.nbytes / 1e6

    def runOne(self, task):
        with self.lock:
            self.status['now'] = f"{task['source']:5s} {os.path.basename(task['out'])}"
        (self.fetchCrop if self.crop else self.fetchWhole)(task)

    def runNsidc(self, tasks):
        '''NSIDC: one file at a time, a gap between files, long pauses when NSIDC refuses.'''
        gap, refusals, good = self.gap, 0, 0
        for task in tasks:
            while not self.status['stop']:
                try:
                    self.runOne(task)
                    self.finish(task, True)
                    refusals, good = 0, good + 1
                    if good >= 20 and gap > self.gap:
                        gap, good = max(self.gap, gap / 2), 0
                    time.sleep(gap)
                    break
                except AuthFailed as err:
                    self.status['stop'] = (f'Earthdata login refused ({err}); run grimpdownload --login, '
                                           'then rerun to resume')
                except Refused as err:
                    refusals += 1
                    if refusals > maxRefusals:
                        self.status['stop'] = f'NSIDC refused {maxRefusals} times in a row; rerun later to resume'
                        break
                    gap, good = min(gap * 2, 30), 0
                    wait = nsidcBackoff[min(refusals - 1, len(nsidcBackoff) - 1)]
                    for left in range(wait, 0, -1):
                        self.status['note'] = f'paused by NSIDC, retrying in {left} s (gap now {gap:g} s)'
                        time.sleep(1)
                    self.note(f'retry after refusal {refusals}: {str(err)[:120]}')
                    self.status['note'] = ''
                except Exception as err:  # bad file, grid mismatch: record and move on
                    self.finish(task, False, str(err)[:300])
                    break
            if self.status['stop']:
                return

    def runKopah(self, tasks):
        def one(task):
            for attempt in range(3):
                if self.status['stop']:
                    return
                try:
                    self.runOne(task)
                    self.finish(task, True)
                    return
                except (Refused, rasterio.errors.RasterioIOError) as err:
                    if attempt == 2:
                        self.finish(task, False, str(err)[:300])
                    time.sleep(5 * (attempt + 1))
                except Exception as err:
                    self.finish(task, False, str(err)[:300])
                    return
        with ThreadPoolExecutor(self.kopahWorkers) as pool:
            list(pool.map(one, tasks))

    def run(self):
        os.makedirs(self.outDir, exist_ok=True)
        if os.path.exists(self.statePath):
            with open(self.statePath) as fp:
                self.state = json.load(fp)
        self.log = open(os.path.join(self.outDir, 'grimpDownload.log'), 'a')
        todo = []
        for t in self.tasks:
            key = f"{t['id']}|{t['asset']}"
            if t['source'] == 'missing':
                self.finish(t, False, 'not at NSIDC')
            elif os.path.exists(t['out']) or (key in self.state and not self.retryFailed):
                self.status['skipped'] += 1
            else:
                todo.append(t)
        threads = [threading.Thread(target=self.runNsidc, args=([t for t in todo if t['source'] == 'NSIDC'],)),
                   threading.Thread(target=self.runKopah, args=([t for t in todo if t['source'] == 'Kopah'],))]
        for th in threads:
            th.start()
        return threads


def describe(d, mb):
    n = {s: sum(t['source'] == s for t in d.tasks) for s in ['NSIDC', 'Kopah', 'missing']}
    what = 'whole files'
    if d.crop:
        b = d.crop['bbox']
        what = f"crop {(b[2] - b[0]) / 1e3:.0f} x {(b[3] - b[1]) / 1e3:.0f} km at {d.crop.get('resolution') or 'full'} m"
    size = f' · ~{mb:,.0f} MB' if mb else ''
    miss = f", {n['missing']} not at NSIDC" if n['missing'] else ''
    return f"{len(d.tasks)} files: {n['NSIDC']} from NSIDC, {n['Kopah']} from Kopah{miss} · {what}{size}"


def runPlain(d, threads, header=None):
    total, last = len(d.tasks), None
    while any(th.is_alive() for th in threads):
        s = d.status
        line = f"{s['done'] + s['skipped'] + s['failed']}/{total} done {s['done']} skipped {s['skipped']} " \
               f"failed {s['failed']} {s['mb']:.0f} MB  {s['note'] or s['now']}"
        if line != last:
            print(line, flush=True)
            last = line
        time.sleep(1)


def runRich(d, threads, header):
    from rich.console import Group
    from rich.live import Live
    from rich.progress import BarColumn, MofNCompleteColumn, Progress, TaskProgressColumn, \
        TextColumn, TimeElapsedColumn, TimeRemainingColumn
    from rich.text import Text
    prog = Progress(TextColumn('Files'), BarColumn(bar_width=None), MofNCompleteColumn(), TaskProgressColumn(),
                    TextColumn('{task.fields[mb]}'), TimeElapsedColumn(), TimeRemainingColumn())
    bar = prog.add_task('files', total=len(d.tasks), mb='')

    def view():
        s = d.status
        prog.update(bar, completed=s['done'] + s['skipped'] + s['failed'], mb=f"{s['mb']:,.1f} MB")
        lines = [Text(header, style='bold'), prog, Text(f"Now    {s['now']}")]
        if s['note']:
            lines.append(Text(f"Status {s['note']}", style='yellow'))
        lines.append(Text(f"done {s['done']} · skipped {s['skipped']} · failed {s['failed']}",
                          style='red' if s['failed'] else 'dim'))
        return Group(*lines)
    with Live(view(), refresh_per_second=4) as live:
        while any(th.is_alive() for th in threads):
            live.update(view())
            time.sleep(0.25)
        live.update(view())


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('manifest', nargs='?', help='download file (.grimp.yaml) saved by the GrIMP Polar Viewer')
    p.add_argument('--outDir', default='grimpDownload', help='output directory (default ./grimpDownload)')
    p.add_argument('--source', choices=['auto', 'nsidc', 'kopah'], default='auto',
                   help='auto: NSIDC when it holds the version, else Kopah (default)')
    p.add_argument('--login', action='store_true', help='save your NASA Earthdata login in ~/.netrc and stop')
    p.add_argument('--nsidcGap', type=float, default=1.0, help='seconds between NSIDC files (default 1)')
    p.add_argument('--kopahWorkers', type=int, default=4, help='parallel Kopah downloads (default 4)')
    p.add_argument('--retryFailed', action='store_true', help='retry files that failed in an earlier run')
    p.add_argument('--dryRun', action='store_true', help='show the plan and stop')
    p.add_argument('--yes', action='store_true', help=f'do not ask before downloads over {confirmGB} GB')
    p.add_argument('--plain', action='store_true', help='one status line per second instead of a live display')
    a = p.parse_args()
    if a.login:
        saveLogin()
        return
    if not a.manifest:
        p.error('give the download file saved by the viewer (or --login)')
    d = Downloader(loadManifest(a.manifest), a.outDir, a.source, a.nsidcGap, a.kopahWorkers, a.retryFailed)
    d.plan()
    mb = d.estimateMB()
    header = f'grimpdownload  {os.path.basename(a.manifest)}  ->  {a.outDir}\n  {describe(d, mb)}'
    print(header)
    if a.dryRun:
        for t in d.tasks[:10]:
            print(f"  {t['source']:7s} {t['url']}")
        print('  ...' if len(d.tasks) > 10 else '')
        return
    if any(t['source'] == 'NSIDC' for t in d.tasks) and not haveLogin():
        if not sys.stdin.isatty():
            sys.exit('These files are at NSIDC, which needs a free NASA Earthdata login. Save yours once with\n'
                     '  grimpdownload --login\n(create one at https://urs.earthdata.nasa.gov/users/new), then rerun.')
        print('These files are at NSIDC, which needs a NASA Earthdata login (asked once, then kept in ~/.netrc).')
        saveLogin()
    if mb and mb > confirmGB * 1e3 and not a.yes and input(f'About {mb / 1e3:.1f} GB. Continue? [y/N] ').lower() != 'y':
        return
    threads = d.run()
    (runPlain if a.plain or not sys.stdout.isatty() else runRich)(d, threads, header.split('\n')[1].strip())
    s = d.status
    print(f"Finished: {s['done']} downloaded, {s['skipped']} already there, {s['failed']} failed, {s['mb']:,.1f} MB"
          + (f"\n{s['stop']}" if s['stop'] else '')
          + (f"\nFailures are listed in {d.statePath}; rerun with --retryFailed" if s['failed'] else ''))


if __name__ == '__main__':
    main()
