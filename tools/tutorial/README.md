# Video tutorial

Makes the narrated tutorial at
https://s3.kopah.uw.edu/ianj-grimp/public/viewer/tutorial/index.html: a headless Chrome drives the
**live** viewer through the scenes in `record.mjs`, a narration voice reads `script.json`, and the two
are laid together with the waits between sentences fast-forwarded.

| File | What it does |
|---|---|
| `script.json` | The narration: `[scene, sentence]` pairs. Sentence k starts when `record.mjs` calls `say(k)`. |
| `tts.py` | One WAV per sentence into `audio/`, plus `audio/durations.json` (Kokoro, voice `af_heart`). |
| `record.mjs` | Drives the viewer at 1920 x 1080 and saves every screencast frame to `frames/`, with the sentence start times in `timing.json`. `--warm` runs the same actions with no recording or pauses, to fill the cache and save `w_*.jpg` check shots. |
| `assemble.py` | Frames to `raw.mp4`, then cuts it to the narration (waits fast-forwarded to at most 5 s) and mixes the WAVs in: `tutorial.mp4`. |
| `captions.py` | `captions.vtt`, timed the same way as `assemble.py`. |
| `makeStakes.py` | `helheimStakes.gpkg`, the sample GeoPackage (UTM 24N) opened in the Digitize scene. |
| `index.html` | The tutorial page on Kopah. Update its length ("10 minutes") when the video changes. |

Everything else written here (audio, frames, video, timing) is ignored by git.

## Steps

Adding a scene: add its sentences to `script.json`, renumber the `say(k)` calls in `record.mjs` after
the new ones, and add the actions. Run `--warm` first and look at the `w_*.jpg` shots.

```bash
cd tools/tutorial && python3 makeStakes.py
```

```bash
cd tools/tutorial && ~/venvs/kokoro/bin/python tts.py
```

```bash
cd tools/tutorial && node record.mjs --warm
```

```bash
cd tools/tutorial && node record.mjs
```

```bash
cd tools/tutorial && python3 assemble.py && python3 captions.py
```

```bash
cd tools/tutorial && ffmpeg -y -v error -i tutorial.mp4 -i captions.vtt -map 0 -map 1 -c copy -c:s mov_text -metadata:s:s:0 language=eng -disposition:s:0 0 -movflags +faststart tutorial_cc.mp4
```

The real recording takes about 22 minutes and the assembly about 12. The recording drives the deployed
viewer (`V` in `record.mjs`), so deploy first. The tests' `node_modules` (`tests/run.sh` installs them)
provide puppeteer, and Chrome is `/usr/bin/google-chrome`.

Upload (public, so only when the new video is approved):

```bash
cd tools/tutorial && s3cmd put --no-progress --mime-type=video/mp4 tutorial_cc.mp4 s3://ianj-grimp/public/viewer/tutorial/grimpPolarViewerTutorial.mp4 && s3cmd put --no-progress --mime-type=text/vtt captions.vtt s3://ianj-grimp/public/viewer/tutorial/captions.vtt && s3cmd put --no-progress --mime-type=text/html index.html s3://ianj-grimp/public/viewer/tutorial/index.html
```

If the length changes, update "(N min)" on the viewer's tutorial button (`src/index.html`) and
"(N minutes" in the top-level README.
