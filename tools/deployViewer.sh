#!/bin/bash
# Build the viewer from src/ (tools/buildViewer.sh) and publish it to Kopah as the live viewer, with a
# build stamp under the title.
#
#   tools/deployViewer.sh [s3://bucket/prefix/]      (default s3://ianj-grimp/public/viewer/)
#
# The stamp is the UTC time plus the git commit (with -dirty for uncommitted changes), so the page
# shows exactly which code is live. Needs s3cmd with ~/.s3cfg pointing at s3.kopah.uw.edu.
set -euo pipefail

target=${1:-s3://ianj-grimp/public/viewer/}
repo=$(cd "$(dirname "$0")/.." && pwd)
commit=$(git -C "$repo" rev-parse --short HEAD 2>/dev/null || echo nogit)
if [ -n "$(git -C "$repo" status --porcelain -- src 2>/dev/null)" ]; then commit="$commit-dirty"; fi
stamp="build $(date -u '+%Y-%m-%d %H:%M') UTC ($commit)"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
bash "$repo/tools/buildViewer.sh" "$tmp/built.html" > /dev/null
sed "s/build dev/$stamp/" "$tmp/built.html" > "$tmp/index.html"

# text/html so browsers render it; no-cache so a reload always picks up a new deploy.
s3cmd put --mime-type='text/html; charset=utf-8' --add-header='Cache-Control: no-cache' \
    "$tmp/index.html" "${target%/}/index.html"
for f in "$tmp"/data/*; do
    s3cmd put --mime-type="$(case $f in *.json) echo application/json;; *) echo application/octet-stream;; esac)" \
        --add-header='Cache-Control: no-cache' "$f" "${target%/}/data/$(basename "$f")"
done
echo "Deployed $stamp to ${target%/}/index.html"
