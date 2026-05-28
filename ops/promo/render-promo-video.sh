#!/usr/bin/env bash
set -euo pipefail

# Render a 30s vertical promo from static screenshots.
# Requires ffmpeg to be installed.
# Usage:
#   ./ops/promo/render-promo-video.sh

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ASSETS_DIR="$ROOT_DIR/ops/promo/assets"
OUT_DIR="$ROOT_DIR/ops/promo/out"
BASE_VIDEO="$OUT_DIR/weekly-tax-app-promo-30s-base.mp4"
VIDEO_WITH_SUBS="$OUT_DIR/weekly-tax-app-promo-30s-subs.mp4"
OUT_VIDEO="$OUT_DIR/weekly-tax-app-promo-30s.mp4"
SRT_FILE="$ROOT_DIR/ops/promo/promo-subtitles.srt"
NARRATION_FILE="$ROOT_DIR/ops/promo/narration.txt"
VOICE_WAV="$OUT_DIR/weekly-tax-app-voice.wav"

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

# Build a more dynamic cut with subtle camera motion and crossfades.
render_base_video() {
  ffmpeg \
    -y \
    -loop 1 -t 4.5 -i "$ASSETS_DIR/01-title.png" \
    -loop 1 -t 5.5 -i "$ASSETS_DIR/02-income.png" \
    -loop 1 -t 5.5 -i "$ASSETS_DIR/03-expenses.png" \
    -loop 1 -t 5.5 -i "$ASSETS_DIR/04-receipts.png" \
    -loop 1 -t 5.5 -i "$ASSETS_DIR/05-summary.png" \
    -loop 1 -t 4.5 -i "$ASSETS_DIR/06-export.png" \
    -loop 1 -t 2.6 -i "$ASSETS_DIR/07-endcard.png" \
    -filter_complex "
      [0:v]scale=1020:1810:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0f172a,trim=duration=4.5,setpts=PTS-STARTPTS,fps=30,format=yuv420p[v0];
      [1:v]scale=1020:1810:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0f172a,trim=duration=5.5,setpts=PTS-STARTPTS,fps=30,format=yuv420p[v1];
      [2:v]scale=1020:1810:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0f172a,trim=duration=5.5,setpts=PTS-STARTPTS,fps=30,format=yuv420p[v2];
      [3:v]scale=1020:1810:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0f172a,trim=duration=5.5,setpts=PTS-STARTPTS,fps=30,format=yuv420p[v3];
      [4:v]scale=1020:1810:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0f172a,trim=duration=5.5,setpts=PTS-STARTPTS,fps=30,format=yuv420p[v4];
      [5:v]scale=1020:1810:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0f172a,trim=duration=4.5,setpts=PTS-STARTPTS,fps=30,format=yuv420p[v5];
      [6:v]scale=1020:1810:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0f172a,trim=duration=2.6,setpts=PTS-STARTPTS,fps=30,format=yuv420p[v6];
      [v0][v1]xfade=transition=fade:duration=0.6:offset=3.9[x1];
      [x1][v2]xfade=transition=fade:duration=0.6:offset=8.8[x2];
      [x2][v3]xfade=transition=fade:duration=0.6:offset=13.7[x3];
      [x3][v4]xfade=transition=fade:duration=0.6:offset=18.6[x4];
      [x4][v5]xfade=transition=fade:duration=0.6:offset=23.5[x5];
      [x5][v6]xfade=transition=fade:duration=0.6:offset=27.4[vout]
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
    -vf "subtitles='${srt_escaped}':force_style='FontName=DejaVu Sans,FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00101010,BorderStyle=1,Outline=2,Shadow=0,MarginV=70'" \
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

build_narration_text() {
  if [[ -f "$NARRATION_FILE" ]]; then
    cat "$NARRATION_FILE"
  else
    cat <<'EOF'
Still tracking income in notes and spreadsheets?
Qbit gives you one weekly workflow for income and expenses.
You get instant totals and a clear year to date audit view.
So tax time is calmer, with fewer surprises.
EOF
  fi
}

generate_voiceover() {
  local narration_text
  narration_text="$(build_narration_text)"

  # Prefer neural voices first for more natural delivery.
  if command -v edge-tts >/dev/null 2>&1; then
    local edge_mp3
    edge_mp3="$OUT_DIR/weekly-tax-app-voice.mp3"
    edge-tts \
      --voice "en-US-JennyNeural" \
      --rate "+2%" \
      --text "$narration_text" \
      --write-media "$edge_mp3"
    ffmpeg -y -i "$edge_mp3" -ar 48000 -ac 2 "$VOICE_WAV"
    rm -f "$edge_mp3"
    return 0
  fi

  if command -v say >/dev/null 2>&1; then
    local voice_aiff
    voice_aiff="$OUT_DIR/weekly-tax-app-voice.aiff"
    say -v Samantha -r 185 -o "$voice_aiff" "$narration_text"
    ffmpeg -y -i "$voice_aiff" -ar 48000 -ac 2 "$VOICE_WAV"
    rm -f "$voice_aiff"
    return 0
  fi

  if command -v espeak-ng >/dev/null 2>&1; then
    espeak-ng -v en-us -s 175 -w "$VOICE_WAV" "$narration_text"
    ffmpeg -y -i "$VOICE_WAV" -ar 48000 -ac 2 "$VOICE_WAV.tmp.wav"
    mv "$VOICE_WAV.tmp.wav" "$VOICE_WAV"
    return 0
  fi

  echo "No TTS engine available (edge-tts/say/espeak-ng). Rendering without narration."
  return 1
}

finalize_quicktime_mp4() {
  local video_duration
  video_duration="$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$VIDEO_WITH_SUBS")"

  if [[ -f "$VOICE_WAV" ]]; then
    ffmpeg \
      -y \
      -i "$VIDEO_WITH_SUBS" \
      -i "$VOICE_WAV" \
      -filter_complex "[1:a]loudnorm=I=-16:LRA=11:TP=-1.5,atrim=duration=${video_duration},apad[aout]" \
      -map 0:v:0 \
      -map "[aout]" \
      -c:v copy \
      -c:a aac \
      -b:a 160k \
      -ar 48000 \
      -ac 2 \
      -movflags +faststart \
      -shortest \
      "$OUT_VIDEO"
  else
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
  fi
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

if ! generate_voiceover; then
  echo "Voiceover unavailable; muxing compatibility audio track only."
fi

finalize_quicktime_mp4

rm -f "$BASE_VIDEO" "$VIDEO_WITH_SUBS" "$VOICE_WAV"

echo "Promo video created: $OUT_VIDEO"
