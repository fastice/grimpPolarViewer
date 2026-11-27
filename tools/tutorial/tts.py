"""Narration for the tutorial: one WAV per sentence of script.json (Kokoro, 24 kHz), plus durations.json.

    ~/venvs/kokoro/bin/python tts.py [voice] [outDir]
"""
import json
import os
import sys
import numpy as np
import soundfile as sf
from kokoro import KPipeline

here = os.path.dirname(os.path.abspath(__file__))
voice = sys.argv[1] if len(sys.argv) > 1 else 'af_heart'
outDir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, 'audio')
os.makedirs(outDir, exist_ok=True)
lines = json.load(open(os.path.join(here, 'script.json')))
pipeline = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M')
durations = []
for k, (scene, text) in enumerate(lines):
    audio = np.concatenate([np.asarray(a) for _, _, a in pipeline(text, voice=voice, speed=1.0)])
    sf.write(os.path.join(outDir, f'{k:02d}.wav'), audio, 24000)
    durations.append(round(len(audio) / 24000, 3))
    print(k, scene, durations[-1], flush=True)
json.dump(durations, open(os.path.join(outDir, 'durations.json'), 'w'))
print('total', round(sum(durations), 1), 's')
