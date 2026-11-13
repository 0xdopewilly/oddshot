#!/usr/bin/env bash
# Renders the motion comic in 20 s chunks, then muxes the soundtrack into an X-ready MP4 (BT.709, limited range, faststart).
# Run from video/: setsid nohup bash comic/render.sh > comic/build/render.log 2>&1 &
# RESUME=1 keeps chunks from an interrupted run; otherwise every chunk is rendered fresh.
set -euo pipefail
cd "$(dirname "$0")/.."
CH=comic/build/chunks
[ "${RESUME:-}" = 1 ] || rm -rf "$CH"
mkdir -p "$CH"
N=$(python3 -c "import json, math; print(math.ceil(json.load(open('src/comic-timeline.json'))['total'] * 30))")
: > "$CH/list.txt"
for ((a = 0; a < N; a += 600)); do
  b=$((a + 599 < N - 1 ? a + 599 : N - 1)); out="$CH/$(printf %05d $a).mp4"
  if [ ! -s "$out" ]; then
    npx remotion render Episode "$CH/part.mp4" --frames=$a-$b --concurrency=4 --timeout=240000 --log=error --crf=16
    mv "$CH/part.mp4" "$out"
  fi
  echo "chunk $a-$b of $N"
  echo "file '$(basename "$out")'" >> "$CH/list.txt"
done
ffmpeg -v error -y -f concat -safe 0 -i "$CH/list.txt" -c copy out/episode-silent.mp4
ffmpeg -v error -y -i out/episode-silent.mp4 -i comic/build/mix.wav -map 0:v -map 1:a \
  -vf "scale=in_range=full:out_range=tv,format=yuv420p" -c:v libx264 -profile:v high -preset slow -crf 17 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
  -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart "${OUT:-out/oddshot-late-again-comic.mp4}"
echo DONE
