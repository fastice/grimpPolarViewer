#!/bin/bash
# Assemble the single-file viewer from src/: each line "<!-- @include <path> -->" in src/index.html is
# replaced by that file (relative to src/). The JavaScript pieces are one module, concatenated in the
# order listed, so they share one scope exactly as when the viewer was a single file. src/data/ (files the
# page reads at run time, e.g. glacier names) is copied to data/ beside the output.
#
#   tools/buildViewer.sh [out]      (default dist/index.html)
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
out=${1:-$repo/dist/index.html}
mkdir -p "$(dirname "$out")"
awk -v src="$repo/src" '
  /^<!-- @include [^ ]+ -->$/ {
    f = src "/" $3
    if ((getline l < f) <= 0) { print "buildViewer: cannot read " f > "/dev/stderr"; exit 1 }
    do print l; while ((getline l < f) > 0)
    close(f); next
  }
  { print }' "$repo/src/index.html" > "$out"
mkdir -p "$(dirname "$out")/data"
cp "$repo"/src/data/* "$(dirname "$out")/data/"
echo "Built $out"
