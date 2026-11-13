#!/usr/bin/env bash
# Renders "The rug, explained" at 2560×1440, 60 fps, in 10 s chunks, then muxes the soundtrack into an MP4 (BT.709, limited range, faststart).
# Run from video/: setsid nohup bash proof/render.sh > proof/build/render.log 2>&1 &
# RESUME=1 keeps chunks from an interrupted run; otherwise every chunk is rendered fresh.
set -euo pipefail
cd "$(dirname "$0")/.."
CH=proof/build/chunks
# Remotion copies public/ (the footage) into every bundle: keep its temp files on the big disk, not the small /tmp RAM disk
export TMPDIR="$PWD/proof/build/tmp"
rm -rf "$TMPDIR" && mkdir -p "$TMPDIR"
[ "${RESUME:-}" = 1 ] || rm -rf "$CH"
mkdir -p "$CH"
node proof/render.mjs
ffmpeg -v error -y -f concat -safe 0 -i "$CH/list.txt" -c copy out/proof-silent.mp4
ffmpeg -v error -y -i out/proof-silent.mp4 -i proof/build/mix.wav -map 0:v -map 1:a \
  -vf "scale=in_range=full:out_range=tv,format=yuv420p" -c:v libx264 -profile:v high -preset slow -crf 17 -x264-params aq-mode=3 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
  -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart "${OUT:-out/oddshot-rug-explained.mp4}"
echo DONE
