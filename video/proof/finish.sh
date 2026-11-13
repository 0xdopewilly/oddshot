#!/usr/bin/env bash
# Two-pass loudnorm of the rendered video to -14 LUFS (video stream copied), landing near -1 dBTP after AAC.
# Run from video/ after proof/render.sh: bash proof/finish.sh
# Also writes the X upload: X plays at most 1080p, so a 1080p60 copy scaled down from the 1440p master is the sharpest file it keeps as is.
set -euo pipefail
cd "$(dirname "$0")/.."
IN=out/oddshot-rug-explained.mp4 OUT=out/oddshot-rug-explained-final.mp4
J=$(ffmpeg -hide_banner -i "$IN" -af loudnorm=I=-14:TP=-2.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
g() { echo "$J" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
ffmpeg -v error -y -i "$IN" -map 0:v -map 0:a -c:v copy \
  -af "loudnorm=I=-14:TP=-2.5:LRA=11:measured_I=$(g input_i):measured_TP=$(g input_tp):measured_LRA=$(g input_lra):measured_thresh=$(g input_thresh):offset=$(g target_offset):linear=true" \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart "$OUT"
ffmpeg -hide_banner -i "$OUT" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I|Peak):" | tr -s ' '
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate,color_space -of compact "$OUT"
X=out/oddshot-rug-explained-x1080.mp4
ffmpeg -v error -y -i "$OUT" -map 0:v -map 0:a -vf "scale=1920:1080:flags=lanczos,format=yuv420p" -c:v libx264 -profile:v high -preset slow -crf 17 -x264-params aq-mode=3 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv -c:a copy -movflags +faststart "$X"
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate -of compact "$X"
