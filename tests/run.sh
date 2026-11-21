#!/bin/bash
# Headless browser tests of the viewer. Builds it from src/ with a test hook that exposes its state as
# window.grimpViewer, serves it on 127.0.0.1 and runs each test (default: every tests/*.test.mjs).
# The data are read from Kopah, so the tests need the network.
#
#   tests/run.sh [test.mjs ...]      (env: CHROME = Chrome binary, PORT = local port, default 8767)
set -uo pipefail

here=$(cd "$(dirname "$0")" && pwd)
repo=$(dirname "$here")
[ -d "$here/node_modules" ] || (cd "$here" && npm install --silent) || exit 1
mkdir -p "$here/serve" "$here/out"
bash "$repo/tools/buildViewer.sh" "$here/serve/built.html" > /dev/null || exit 1
hook='window.grimpViewer = { map, pf: () => ({ pfLine, pfKey, pfCurves, pfIts, pfFlow, pfOff, pfAx, pfLegendHits }), ts: () => ({ tsPoints, tsLegendHits, tsLayerOff: [...tsLayerOff], nMarkers: tsSource.getFeatures().length }) };'
sed "s|^window.grimpViewer = { map };\$|$hook|" "$here/serve/built.html" > "$here/serve/index.html"
grep -q 'pf: () =>' "$here/serve/index.html" || { echo "run.sh: could not insert the test hook"; exit 1; }

export PORT=${PORT:-8767}
node "$here/rangeServer.mjs" "$here/serve" "$PORT" &
server=$!
trap 'kill $server' EXIT
sleep 0.5

[ $# -gt 0 ] || set -- "$here"/*.test.mjs
failed=()
for t in "$@"; do
  [ -f "$t" ] || t="$here/$t"
  echo "== $(basename "$t")"
  node "$t" || failed+=("$(basename "$t")")
done
if [ ${#failed[@]} -gt 0 ]; then echo "FAILED: ${failed[*]}"; exit 1; fi
echo "All tests passed"
