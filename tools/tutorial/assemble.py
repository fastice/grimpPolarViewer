"""Cut the raw screen recording to the narration: each sentence's stretch plays at normal speed, and the
waits between sentences (data loading) are fast-forwarded to at most maxGap seconds. The narration WAVs
are laid at the sentences' new times. Writes tutorial.mp4 (H.264 + AAC, plays everywhere).

    python3 assemble.py [raw.webm] [out.mp4]
"""
import json
import os
import subprocess
import sys

here = os.path.dirname(os.path.abspath(__file__))
raw = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, 'raw.mp4')
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, 'tutorial.mp4')
timing = json.load(open(os.path.join(here, 'timing.json')))
st = timing['stamps']
cues = [c - st[0] for c in timing['cues']]
if len(sys.argv) <= 1:
    # frames at their capture times -> constant 30 fps raw video
    lst = os.path.join(here, 'frames.txt')
    with open(lst, 'w') as f:
        for i, t in enumerate(st):
            f.write(f"file 'frames/{i:06d}.jpg'\nduration {(st[i + 1] - t) if i + 1 < len(st) else 1 / 30:.4f}\n")
        f.write(f"file 'frames/{len(st) - 1:06d}.jpg'\n")
    raw = os.path.join(here, 'raw.mp4')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-vf', 'fps=30,format=yuv420p',
                    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', raw], check=True, cwd=here)
durs = json.load(open(os.path.join(here, 'audio', 'durations.json')))
pad, keepGap, maxGap, tail = 0.45, 1.5, 5.0, 2.5

# (start, end, speed) segments of the raw timeline
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
segs.append((t, cues[-1] + durs[-1] + tail, 1.0)) if t < cues[-1] + durs[-1] + tail else None

# where each sentence lands in the output
newCue, tOut, si = [], 0.0, 0
starts = []
for a, b, s in segs:
    starts.append(tOut)
    tOut += (b - a) / s
for c in cues:
    for (a, b, s), o in zip(segs, starts):
        if a <= c < b or (a == c):
            newCue.append(o + (c - a) / s)
            break
total = tOut

parts, labels = [], []
for i, (a, b, s) in enumerate(segs):
    parts.append(f'[0:v]trim=start={a:.3f}:end={b:.3f},setpts=(PTS-STARTPTS)/{s:.4f},fps=30[v{i}]')
    labels.append(f'[v{i}]')
parts.append(''.join(labels) + f'concat=n={len(segs)}:v=1:a=0,fade=t=in:d=0.6,fade=t=out:st={total - 1:.2f}:d=1[v]')
ins = ['-i', raw]
for k in range(len(cues)):
    ins += ['-i', os.path.join(here, 'audio', f'{k:02d}.wav')]
    ms = int(round(newCue[k] * 1000))
    parts.append(f'[{k + 1}:a]aresample=48000,adelay={ms}|{ms}[a{k}]')
parts.append(''.join(f'[a{k}]' for k in range(len(cues))) + f'amix=inputs={len(cues)}:normalize=0,apad,atrim=end={total:.3f}[a]')
fc = os.path.join(here, 'filter.txt')
open(fc, 'w').write(';\n'.join(parts))
cmd = ['ffmpeg', '-y', '-v', 'error', *ins, '-filter_complex_script', fc, '-map', '[v]', '-map', '[a]',
       '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
       '-c:a', 'aac', '-b:a', '160k', '-ac', '2', '-movflags', '+faststart', out]
subprocess.run(cmd, check=True)
print(f'{out}: {total:.1f} s, {os.path.getsize(out) / 1e6:.1f} MB')
for k, c in enumerate(newCue):
    print(k, round(c, 1))
