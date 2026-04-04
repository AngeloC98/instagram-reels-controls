#!/bin/bash
# Build extension zip for Firefox (AMO) submission

VERSION=$(node -p "require('./manifest.json').version")
OUTDIR="dist"
OUTFILE="$OUTDIR/instagram-reels-controls-v$VERSION.zip"

mkdir -p "$OUTDIR"
rm -f "$OUTFILE"

zip -j "$OUTFILE" manifest.json content.js content.css LICENSE
zip "$OUTFILE" icons/icon.svg

echo "Built $OUTFILE"
