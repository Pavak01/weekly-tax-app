#!/usr/bin/env bash
set -euo pipefail

# Generate fallback promo assets when real screenshots are not present.
ASSETS_DIR="$(cd "$(dirname "$0")" && pwd)/assets"
FONT_FILE="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

mkdir -p "$ASSETS_DIR"

files=(
  "01-title.png"
  "02-income.png"
  "03-expenses.png"
  "04-receipts.png"
  "05-summary.png"
  "06-export.png"
  "07-endcard.png"
)

captions=(
  "Weekly Tax App"
  "Track income fast"
  "Capture expenses"
  "Attach receipts"
  "See totals and estimates"
  "Export when needed"
  "Track smarter"
)

generated=0
for i in "${!files[@]}"; do
  out="$ASSETS_DIR/${files[$i]}"
  text="${captions[$i]}"

  if [[ -f "$out" ]]; then
    continue
  fi

  ffmpeg -y \
    -f lavfi -i "color=c=#0f766e:s=1080x1920:d=1" \
    -vf "drawtext=fontfile=${FONT_FILE}:text='${text}':fontcolor=white:fontsize=68:x=(w-text_w)/2:y=(h-text_h)/2" \
    -frames:v 1 \
    "$out" >/dev/null 2>&1

  echo "Generated placeholder asset: $out"
  generated=1
done

if [[ "$generated" -eq 0 ]]; then
  echo "All promo assets already exist."
fi
