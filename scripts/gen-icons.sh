#!/usr/bin/env bash
# Generate PWA icons from the SVG source
# Requires: inkscape or rsvg-convert or ImageMagick (convert)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLIC="${SCRIPT_DIR}/../nuxt-ui/public"
SVG="${PUBLIC}/icon.svg"

gen() {
  local size=$1
  local out="${PUBLIC}/icon-${size}.png"
  if command -v rsvg-convert &>/dev/null; then
    rsvg-convert -w "$size" -h "$size" "$SVG" -o "$out"
  elif command -v inkscape &>/dev/null; then
    inkscape --export-type=png --export-width="$size" --export-height="$size" \
      --export-filename="$out" "$SVG" 2>/dev/null
  elif command -v convert &>/dev/null; then
    convert -background none -resize "${size}x${size}" "$SVG" "$out"
  else
    echo "⚠ No SVG renderer found (rsvg-convert / inkscape / ImageMagick)."
    echo "  Install one and re-run, or supply icon-${size}.png manually in nuxt-ui/public/"
    return 1
  fi
  echo "✓ Generated ${out}"
}

gen 192
gen 512
