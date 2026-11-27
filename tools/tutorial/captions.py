"""Captions for tutorial.mp4: each narration sentence at its place in the assembled video (the same
segment timing as assemble.py), split into cues of at most two 42-character lines, timed in
proportion to their length. Writes captions.vtt.

    python3 captions.py
"""
import json
import os
import re

here = os.path.dirname(os.path.abspath(__file__))
timing = json.load(open(os.path.join(here, 'timing.json')))
st = timing['stamps']
cues = [c - st[0] for c in timing['cues']]
durs = json.load(open(os.path.join(here, 'audio', 'durations.json')))
lines = json.load(open(os.path.join(here, 'script.json')))
pad, keepGap, maxGap, tail = 0.45, 1.5, 5.0, 2.5

# segments and sentence starts exactly as in assemble.py
segs, t = [], 0.0
for k, c in enumerate(cues):
    if c > t:
        g = c - t
        outLen = g if g <= keepGap else min(maxGap, keepGap + (g - keepGap) / 4)
        segs.append((t, c, g / outLen))
    end = c + durs[k] + pad
    nxt = cues[k + 1] if k + 1 < len(cues) else end + tail
    segs.append((c, min(end, nxt), 1.0))
    t = min(end, nxt)
starts, tOut = [], 0.0
for a, b, s in segs:
    starts.append(tOut)
    tOut += (b - a) / s
newCue = []
for c in cues:
    for (a, b, s), o in zip(segs, starts):
        if a <= c < b or a == c:
            newCue.append(o + (c - a) / s)
            break

# the narration's phonetic spellings, written as they are spelled
spell = {'Grimp': 'GrIMP', 'Terra SAR X': 'TerraSAR-X', 'M P 4': 'MP4', 'Q R': 'QR', 'Nye-sar': 'NISAR', 'r squared': 'r²', 'well known': 'well-known', 'Geo Package': 'GeoPackage', 'Q G I S': 'QGIS', 'Arc G I S': 'ArcGIS'}


def chunks(text, width=42, rows=2):
    """Split text into cues of at most rows lines of width characters, preferring sentence and clause ends."""
    words, out, cur = text.split(), [], []
    for w in words:
        if cur and len(' '.join(cur + [w])) > width * rows:
            # break after the last clause end in the cue if it is past halfway
            j = max((i for i, x in enumerate(cur) if re.search(r'[.,;:]$', x)), default=-1)
            if j >= len(cur) // 2 and j < len(cur) - 1:
                out.append(cur[:j + 1]); cur = cur[j + 1:]
            else:
                out.append(cur); cur = []
        cur.append(w)
        if re.search(r'[.;:]$', w) and len(' '.join(cur)) > width:
            out.append(cur); cur = []
    if cur:
        out.append(cur)
    return [wrap(' '.join(c), width) for c in out]


def wrap(text, width):
    """Two balanced lines when longer than width."""
    if len(text) <= width:
        return text
    words = text.split()
    best = min(range(1, len(words)), key=lambda i: max(len(' '.join(words[:i])), len(' '.join(words[i:]))))
    return ' '.join(words[:best]) + '\n' + ' '.join(words[best:])


def stamp(t):
    return f'{int(t // 3600):02d}:{int(t % 3600 // 60):02d}:{t % 60:06.3f}'


out = ['WEBVTT', '']
n = 0
for k, (scene, text) in enumerate(lines):
    for a, b in spell.items():
        text = text.replace(a, b)
    parts = chunks(text)
    weights = [len(p) + 8 for p in parts]
    t0 = newCue[k]
    for p, w in zip(parts, weights):
        d = durs[k] * w / sum(weights)
        n += 1
        out += [str(n), f'{stamp(t0)} --> {stamp(t0 + d)}', p, '']
        t0 += d
open(os.path.join(here, 'captions.vtt'), 'w').write('\n'.join(out))
print(n, 'cues, last ends', stamp(t0), 'video', round(tOut, 1), 's')
