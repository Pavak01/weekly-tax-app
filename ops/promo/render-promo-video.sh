#!/usr/bin/env bash
set -euo pipefail

# Render a 30s vertical promo from static screenshots.
# Requires ffmpeg to be installed.
# Usage:
#   ./ops/promo/render-promo-video.sh

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ASSETS_DIR="$ROOT_DIR/ops/promo/assets"
OUT_DIR="$ROOT_DIR/ops/promo/out"
OUT_VIDEO="$OUT_DIR/weekly-tax-app-promo-30s.mp4"
SRT_FILE="$ROOT_DIR/ops/promo/promo-subtitles.srt"

mkdir -p "$OUT_DIR"

for file in \
  01-title.png \
  02-income.png \
  03-expenses.png \
  04-receipts.png \
  05-summary.png \
  06-export.png \
  07-endcard.png; do
  if [[ ! -f "$ASSETS_DIR/$file" ]]; then
    echo "Missing asset: $ASSETS_DIR/$file"
    exit 1
  fi
done

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is not installed. Install ffmpeg and run again."
  exit 1
fi

# Segment durations: 4,5,5,5,5,4,2 = 30 seconds total
render_with_subtitles() {
ffmpeg \
  -y \
  -loop 1 -t 4 -i "$ASSETS_DIR/01-title.png" \
  -loop 1 -t 5 -i "$ASSETS_DIR/02-income.png" \
  -loop 1 -t 5 -i "$ASSETS_DIR/03-expenses.png" \
  -loop 1 -t 5 -i "$ASSETS_DIR/04-receipts.png" \
  -loop 1 -t 5 -i "$ASSETS_DIR/05-summary.png" \
  -loop 1 -t 4 -i "$ASSETS_DIR/06-export.png" \
  -loop 1 -t 2 -i "$ASSETS_DIR/07-endcard.png" \
  -filter_complex "
    [0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v0];
    [1:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v1];
    [2:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v2];
    [3:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v3];
    [4:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v4];
    [5:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v5];
    [6:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v6];
    [v0][v1][v2][v3][v4][v5][v6]concat=n=7:v=1:a=0[vid];
    [vid]subtitles='$SRT_FILE':force_style='FontName=Arial,FontSize=34,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,MarginV=96'[vout]
  " \
  -map "[vout]" \
  -r 30 \
  -c:v libx264 \
  -preset medium \
  -crf 20 \
  -movflags +faststart \
  "$OUT_VIDEO"
}

render_without_subtitles() {
ffmpeg \
  -y \
  -loop 1 -t 4 -i "$ASSETS_DIR/01-title.png" \
  -loop 1 -t 5 -i "$ASSETS_DIR/02-income.png" \
  -loop 1 -t 5 -i "$ASSETS_DIR/03-expenses.png" \
  -loop 1 -t 5 -i "$ASSETS_DIR/04-receipts.png" \
  -loop 1 -t 5 -i "$ASSETS_DIR/05-summary.png" \
  -loop 1 -t 4 -i "$ASSETS_DIR/06-export.png" \
  -loop 1 -t 2 -i "$ASSETS_DIR/07-endcard.png" \
  -filter_complex "
    [0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v0];
    [1:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v1];
    [2:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v2];
    [3:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v3];
    [4:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v4];
    [5:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v5];
    [6:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v6];
    [v0][v1][v2][v3][v4][v5][v6]concat=n=7:v=1:a=0[vout]
  " \
  -map "[vout]" \
  -r 30 \
  -c:v libx264 \
  -preset medium \
  -crf 20 \
  -movflags +faststart \
  "$OUT_VIDEO"
}

if ! render_with_subtitles; then
  echo "Subtitle render failed; retrying without subtitles."
  render_without_subtitles
fi

echo "Promo video created: $OUT_VIDEO"
