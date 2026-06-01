#!/usr/bin/env bash
set -euo pipefail

# Render a 15s vertical promo from static screenshots.
# Requires ffmpeg to be installed.
# Usage:
#   ./ops/promo/render-promo-video.sh

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ASSETS_DIR="$ROOT_DIR/ops/promo/assets"
OUT_DIR="$ROOT_DIR/ops/promo/out"
BASE_VIDEO="$OUT_DIR/weekly-tax-app-promo-15s-base.mp4"
VIDEO_WITH_SUBS="$OUT_DIR/weekly-tax-app-promo-15s-subs.mp4"
OUT_VIDEO="$OUT_DIR/weekly-tax-app-promo-15s.mp4"
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

if ! command -v ffprobe >/dev/null 2>&1; then
  echo "ffprobe is required for duration checks. Install ffmpeg package with ffprobe."
  exit 1
fi

# Build a concise 15-second cut with subtle crossfades.
render_base_video() {
  ffmpeg \
    -y \
    -loop 1 -t 2.7 -i "$ASSETS_DIR/01-title.png" \
    -loop 1 -t 2.7 -i "$ASSETS_DIR/02-income.png" \
    -loop 1 -t 2.7 -i "$ASSETS_DIR/03-expenses.png" \
    -loop 1 -t 2.7 -i "$ASSETS_DIR/04-receipts.png" \
    -loop 1 -t 2.7 -i "$ASSETS_DIR/05-summary.png" \
    -loop 1 -t 1.8 -i "$ASSETS_DIR/06-export.png" \
    -loop 1 -t 1.8 -i "$ASSETS_DIR/07-endcard.png" \
    -filter_complex "
      [0:v]scale=1020:1810:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0f172a,trim=duration=2.7,setpts=PTS-STARTPTS,fps=30,format=yuv420p[v0];
      [1:v]scale=1020:1810:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0f172a,trim=duration=2.7,setpts=PTS-STARTPTS,fps=30,format=yuv420p[v1];
      [2:v]scale=1020:1810:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0f172a,trim=duration=2.7,setpts=PTS-STARTPTS,fps=30,format=yuv420p[v2];
      [3:v]scale=1020:1810:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0f172a,trim=duration=2.7,setpts=PTS-STARTPTS,fps=30,format=yuv420p[v3];
      [4:v]scale=1020:1810:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0f172a,trim=duration=2.7,setpts=PTS-STARTPTS,fps=30,format=yuv420p[v4];
      [5:v]scale=1020:1810:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0f172a,trim=duration=1.8,setpts=PTS-STARTPTS,fps=30,format=yuv420p[v5];
      [6:v]scale=1020:1810:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0f172a,trim=duration=1.8,setpts=PTS-STARTPTS,fps=30,format=yuv420p[v6];
      [v0][v1]xfade=transition=fade:duration=0.35:offset=2.35[x1];
      [x1][v2]xfade=transition=fade:duration=0.35:offset=4.70[x2];
      [x2][v3]xfade=transition=fade:duration=0.35:offset=7.05[x3];
      [x3][v4]xfade=transition=fade:duration=0.35:offset=9.40[x4];
      [x4][v5]xfade=transition=fade:duration=0.35:offset=11.75[x5];
      [x5][v6]xfade=transition=fade:duration=0.35:offset=13.20[vout]
    " \
    -map "[vout]" \
    -r 30 \
    -c:v libx264 \
    -preset medium \
    -crf 20 \
    -pix_fmt yuv420p \
    -profile:v high \
    -level:v 4.1 \
    -g 60 \
    -movflags +faststart \
    "$BASE_VIDEO"
}

render_with_subtitles() {
  local srt_escaped
  srt_escaped="${SRT_FILE//\\/\\\\}"
  srt_escaped="${srt_escaped//:/\\:}"
  ffmpeg \
    -y \
    -i "$BASE_VIDEO" \
    -vf "subtitles='${srt_escaped}':force_style='FontName=DejaVu Sans,FontSize=22,PrimaryColour=&H00EAF2F5,BackColour=&H66000000,BorderStyle=3,Outline=0,Shadow=0,Alignment=8,MarginV=110,MarginL=70,MarginR=70'" \
    -r 30 \
    -c:v libx264 \
    -preset medium \
    -crf 20 \
    -pix_fmt yuv420p \
    -profile:v high \
    -level:v 4.1 \
    -g 60 \
    -movflags +faststart \
    "$VIDEO_WITH_SUBS"
}

render_without_subtitles() {
  cp "$BASE_VIDEO" "$VIDEO_WITH_SUBS"
}

finalize_quicktime_mp4() {
  local video_duration
  video_duration="$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$VIDEO_WITH_SUBS")"

  ffmpeg \
    -y \
    -f lavfi \
    -t "$video_duration" \
    -i anullsrc=r=48000:cl=stereo \
    -i "$VIDEO_WITH_SUBS" \
    -map 1:v:0 \
    -map 0:a:0 \
    -c:v copy \
    -c:a aac \
    -b:a 128k \
    -ar 48000 \
    -ac 2 \
    -movflags +faststart \
    -shortest \
    "$OUT_VIDEO"
}

render_base_video

if [[ -f "$SRT_FILE" ]]; then
  if ! render_with_subtitles; then
    echo "Subtitle burn-in failed; publishing clean motion cut instead."
    render_without_subtitles
  fi
else
  echo "Subtitle file not found; publishing clean motion cut."
  render_without_subtitles
fi

finalize_quicktime_mp4

rm -f "$BASE_VIDEO" "$VIDEO_WITH_SUBS"

echo "Promo video created: $OUT_VIDEO"
