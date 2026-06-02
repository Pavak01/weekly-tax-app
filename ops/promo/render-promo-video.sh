#!/usr/bin/env bash
set -euo pipefail

# Render a 15s vertical promo from static screenshots.
# Requires ffmpeg to be installed.
# Usage:
#   ./ops/promo/render-promo-video.sh

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ASSETS_DIR="$ROOT_DIR/ops/promo/assets"
OUT_DIR="$ROOT_DIR/ops/promo/out"
PREP_DIR="$OUT_DIR/prepped-assets"
BASE_VIDEO="$OUT_DIR/weekly-tax-app-promo-15s-base.mp4"
OUT_PREFIX="$OUT_DIR/weekly-tax-app-promo-15s"
SRT_FILE="$ROOT_DIR/ops/promo/promo-subtitles.srt"

mkdir -p "$OUT_DIR"
mkdir -p "$PREP_DIR"

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
detect_crop_filter() {
  local input_path="$1"
  local src_w src_h crop_line crop_spec crop_w crop_h crop_x crop_y
  local source_area crop_area

  src_w="$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$input_path")"
  src_h="$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$input_path")"

  crop_line="$(
    ffmpeg -hide_banner -loglevel info -loop 1 -t 0.2 -i "$input_path" \
      -vf "cropdetect=limit=0.03:round=2:reset=0" -frames:v 6 -f null - 2>&1 \
      | sed -n 's/.*crop=\([0-9:]*\).*/\1/p' | tail -n 1
  )"

  if [[ -z "$crop_line" ]]; then
    echo ""
    return 0
  fi

  IFS=':' read -r crop_w crop_h crop_x crop_y <<<"$crop_line"

  if [[ -z "$crop_w" || -z "$crop_h" || -z "$crop_x" || -z "$crop_y" ]]; then
    echo ""
    return 0
  fi

  source_area=$((src_w * src_h))
  crop_area=$((crop_w * crop_h))

  # Apply auto-crop only when a major blank-margin capture is detected.
  if (( crop_w < src_w && crop_h < src_h && crop_area * 100 <= source_area * 55 )); then
    crop_spec="crop=${crop_w}:${crop_h}:${crop_x}:${crop_y}"
    echo "$crop_spec"
    return 0
  fi

  echo ""
}

prepare_asset() {
  local file_name="$1"
  local src_path="$ASSETS_DIR/$file_name"
  local out_path="$PREP_DIR/$file_name"
  local crop_filter

  crop_filter="$(detect_crop_filter "$src_path")"

  if [[ -n "$crop_filter" ]]; then
    echo "Auto-cropping $file_name with $crop_filter"
    ffmpeg -y -i "$src_path" -vf "$crop_filter" -frames:v 1 "$out_path" >/dev/null 2>&1
  else
    cp "$src_path" "$out_path"
  fi
}

prepare_assets() {
  rm -f "$PREP_DIR"/*.png
  for file in \
    01-title.png \
    02-income.png \
    03-expenses.png \
    04-receipts.png \
    05-summary.png \
    06-export.png \
    07-endcard.png; do
    prepare_asset "$file"
  done
}

render_base_video() {
  ffmpeg \
    -y \
    -loop 1 -t 2.7 -i "$PREP_DIR/01-title.png" \
    -loop 1 -t 2.7 -i "$PREP_DIR/02-income.png" \
    -loop 1 -t 2.7 -i "$PREP_DIR/03-expenses.png" \
    -loop 1 -t 2.7 -i "$PREP_DIR/04-receipts.png" \
    -loop 1 -t 2.7 -i "$PREP_DIR/05-summary.png" \
    -loop 1 -t 1.8 -i "$PREP_DIR/06-export.png" \
    -loop 1 -t 1.8 -i "$PREP_DIR/07-endcard.png" \
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

subtitle_style_for_theme() {
  local theme="$1"
  case "$theme" in
    minimal)
      echo "FontName=DejaVu Sans,FontSize=18,PrimaryColour=&H004D3B1F,BackColour=&H55F4F6F8,BorderStyle=3,Outline=0,Shadow=0,Alignment=8,MarginV=124,MarginL=96,MarginR=96"
      ;;
    bold)
      echo "FontName=DejaVu Sans,FontSize=22,PrimaryColour=&H004D3B1F,BackColour=&H40D7E6F7,BorderStyle=3,Outline=0,Shadow=0,Alignment=8,MarginV=112,MarginL=84,MarginR=84"
      ;;
    neutral)
      echo "FontName=DejaVu Sans,FontSize=20,PrimaryColour=&H004D3B1F,BackColour=&H50E6ECEF,BorderStyle=3,Outline=0,Shadow=0,Alignment=8,MarginV=116,MarginL=90,MarginR=90"
      ;;
    *)
      echo "Unsupported subtitle theme: $theme" >&2
      return 1
      ;;
  esac
}

render_with_subtitles() {
  local theme="$1"
  local out_path="$2"
  local style
  local srt_escaped

  style="$(subtitle_style_for_theme "$theme")"
  srt_escaped="${SRT_FILE//\\/\\\\}"
  srt_escaped="${srt_escaped//:/\\:}"

  ffmpeg \
    -y \
    -i "$BASE_VIDEO" \
    -vf "subtitles='${srt_escaped}':force_style='${style}'" \
    -r 30 \
    -c:v libx264 \
    -preset medium \
    -crf 20 \
    -pix_fmt yuv420p \
    -profile:v high \
    -level:v 4.1 \
    -g 60 \
    -movflags +faststart \
    "$out_path"
}

render_without_subtitles() {
  local out_path="$1"
  cp "$BASE_VIDEO" "$out_path"
}

finalize_quicktime_mp4() {
  local in_video="$1"
  local out_video="$2"
  local video_duration
  video_duration="$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$in_video")"

  ffmpeg \
    -y \
    -f lavfi \
    -t "$video_duration" \
    -i anullsrc=r=48000:cl=stereo \
    -i "$in_video" \
    -map 1:v:0 \
    -map 0:a:0 \
    -c:v copy \
    -c:a aac \
    -b:a 128k \
    -ar 48000 \
    -ac 2 \
    -movflags +faststart \
    -shortest \
    "$out_video"
}

render_theme_variant() {
  local theme="$1"
  local subs_video="$OUT_PREFIX-${theme}-subs.mp4"
  local final_video="$OUT_PREFIX-${theme}.mp4"

  if [[ -f "$SRT_FILE" ]]; then
    render_with_subtitles "$theme" "$subs_video"
  else
    echo "Subtitle file not found; publishing clean cut for theme: $theme"
    render_without_subtitles "$subs_video"
  fi

  finalize_quicktime_mp4 "$subs_video" "$final_video"
  rm -f "$subs_video"
  echo "Promo video created ($theme): $final_video"
}

prepare_assets
render_base_video
render_theme_variant "minimal"
render_theme_variant "bold"
render_theme_variant "neutral"

rm -f "$BASE_VIDEO"
rm -f "$PREP_DIR"/*.png
