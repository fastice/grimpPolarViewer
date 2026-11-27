#!/bin/bash
# Headless browser tests of the viewer. Builds it from src/ with a test hook that exposes its state as
# window.grimpViewer, serves it on 127.0.0.1 and runs each test (default: every tests/*.test.mjs).
# The data are read from Kopah, so the tests need the network.
#
#   tests/run.sh [test.mjs ...]      (env: CHROME = Chrome binary, PORT = local port, default 8767,
#                                     JOBS = tests run at once, default 4; each test's output is printed
#                                     when it ends, in the order given; JOBS=1 streams it as it runs)
set -uo pipefail

here=$(cd "$(dirname "$0")" && pwd)
repo=$(dirname "$here")
[ -d "$here/node_modules" ] || (cd "$here" && npm install --silent) || exit 1
mkdir -p "$here/serve" "$here/out"
bash "$repo/tools/buildViewer.sh" "$here/serve/built.html" > /dev/null || exit 1
hook='window.grimpViewer = { map, pf: () => ({ pfLine, pfKey, pfCurves, pfIts, pfFlow, pfOff, pfAx, pfLegendHits, pfSer, pfRef, pfChange }), ts: () => ({ tsPoints, tsLegendHits, tsLayerOff: [...tsLayerOff], nMarkers: tsSource.getFeatures().length, geom: tsPlotInfo?.geom, trends: tsPlotInfo?.trends, trendBox: tsTrendBox, trendMin: tsTrendMin, selectedId: selected?.id }), sa: () => ({ saShown, saCache }), ms: () => msSource.getFeatures().map(f => ({ label: f.get("label"), full: f.get("full"), type: f.getGeometry().getType(), coords: f.getGeometry().getCoordinates() })), dg: () => dgFeatures().map(f => { const g = f.getGeometry(); return { name: f.get("name"), shape: f.get("shape"), type: dgGeom(g).getType(), coords: dgGeom(g).getCoordinates(), circle: g.getType() === "Circle" ? [g.getCenter(), g.getRadius()] : null, layer: f.get("layer"), fid: f.get("fid"), attrs: f.get("attrs") }; }), gpkg: async latlon => Array.from(await gpkgBytes(dgFeatures(), viewCode, latlon)), viewCode: () => viewCode, fc: (vals, lo, hi, log) => [...frameCanvas({ values: Float32Array.from(vals) }, vals.length, 1, buildLut(cmaps.gray), lo, hi, "", null, log).getContext("2d").getImageData(0, 0, vals.length, 1).data].filter((_, k) => k % 4 === 0), cmp: () => ({ compareItem, swipeAt, compareLayer }), fig: () => ({ figBox, size: map.getSize(), ratio: map.getPixelRatio(), center: map.getView().getCenter(), res: map.getView().getResolution() }), fx: () => ({ fpCross, pfMarks, nParticles: pParts.length, particlesRunning: !!pRaf, contourLevels: contourSource.getFeatures().map(f => f.get("level")) }) };'
sed "s|^window.grimpViewer = { map };\$|$hook|" "$here/serve/built.html" > "$here/serve/index.html"
grep -q 'pf: () =>' "$here/serve/index.html" || { echo "run.sh: could not insert the test hook"; exit 1; }

export PORT=${PORT:-8767}
node "$here/rangeServer.mjs" "$here/serve" "$PORT" &
server=$!
trap 'kill $server' EXIT
sleep 0.5

[ $# -gt 0 ] || set -- "$here"/*.test.mjs
failed=()
tests=()
for t in "$@"; do [ -f "$t" ] && tests+=("$t") || tests+=("$here/$t"); done
jobs=${JOBS:-4}
if [ "$jobs" -le 1 ]; then
  for t in "${tests[@]}"; do
    echo "== $(basename "$t")"
    node "$t" || failed+=("$(basename "$t")")
  done
else
  logs=$(mktemp -d)
  trap 'kill $server; rm -r "$logs"' EXIT
  printf '%s\n' "${tests[@]}" | xargs -P "$jobs" -I{} bash -c 'node "$1" > "$2/$(basename "$1").log" 2>&1 || touch "$2/$(basename "$1").fail"' _ {} "$logs"
  for t in "${tests[@]}"; do
    b=$(basename "$t")
    echo "== $b"; cat "$logs/$b.log"
    [ -e "$logs/$b.fail" ] && failed+=("$b")
  done
fi
if [ ${#failed[@]} -gt 0 ]; then echo "FAILED: ${failed[*]}"; exit 1; fi
echo "All tests passed"
