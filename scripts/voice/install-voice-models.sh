#!/usr/bin/env bash
# Downloads the local voice models for the T3 voice spike into $T3CODE_VOICE_DIR
# (default ~/.t3/voice): Parakeet TDT 0.6B int8 (speech-to-text) and Kokoro (text-to-speech).
set -euo pipefail

VOICE_DIR="${T3CODE_VOICE_DIR:-$HOME/.t3/voice}"
PARAKEET_ARCHIVE="${PARAKEET_ARCHIVE:-sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8}"
KOKORO_ARCHIVE="${KOKORO_ARCHIVE:-kokoro-multi-lang-v1_0}"
RELEASES="https://github.com/k2-fsa/sherpa-onnx/releases/download"

install_model() {
  local url="$1" target="$2"
  local tmp
  tmp="$(mktemp -d)"
  echo "Downloading $url"
  curl -fL --progress-bar "$url" -o "$tmp/model.tar.bz2"
  tar -xjf "$tmp/model.tar.bz2" -C "$tmp"
  rm -rf "$target"
  mkdir -p "$(dirname "$target")"
  # Each archive unpacks into one top-level folder; its contents become the model directory.
  mv "$(find "$tmp" -mindepth 1 -maxdepth 1 -type d | head -n 1)" "$target"
  rm -rf "$tmp"
  echo "Installed $(basename "$target") -> $target"
}

install_model "$RELEASES/asr-models/$PARAKEET_ARCHIVE.tar.bz2" "$VOICE_DIR/models/parakeet"
install_model "$RELEASES/tts-models/$KOKORO_ARCHIVE.tar.bz2" "$VOICE_DIR/models/kokoro"

if [ ! -f "$VOICE_DIR/voice.json" ]; then
  cp "$(dirname "$0")/voice.example.json" "$VOICE_DIR/voice.json"
  echo "Wrote starter phrase book to $VOICE_DIR/voice.json"
fi

echo "Done. Restart the T3 server, then check GET /api/voice/status."
