#!/usr/bin/env bash
# Records the demo with a voice you can hear (npm run demo:record).
#   DEMO_VOICE=path/to/take.m4a DEMO_PAYPAL_MODE=sandbox DEMO_AI_MODE=live npm run demo:record
# The clip is played through Chromium's fake microphone, so the speech model really hears it, and the
# same audio is laid under the video from the moment the record button is pressed. With no DEMO_VOICE
# a macOS computer voice stands in, and the output says it's a placeholder.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=test-results/demo
mkdir -p "$OUT" videos
VOICE="${DEMO_VOICE:-}"
if [ -z "$VOICE" ]; then
  echo "[demo] DEMO_VOICE isn't set: using a computer-voice PLACEHOLDER, not a person."
  say -v Samantha -r 170 -o "$OUT/voice-placeholder.aiff" "Dryer would not heat. I was there three quarters of an hour at eighty an hour. New heating element, fifteen dollars."
  VOICE="$OUT/voice-placeholder.aiff"
fi
# Chromium's fake microphone reads WAV. A short lead-in so the first word isn't clipped, and even loudness.
ffmpeg -loglevel error -y -i "$VOICE" -af "loudnorm=I=-16:TP=-1.5,adelay=300:all=1,apad=pad_dur=0.4" -ac 1 -ar 48000 -c:a pcm_s16le "$OUT/voice.wav"
SECONDS_LONG=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/voice.wav")
echo "[demo] voice: $VOICE (${SECONDS_LONG}s)"
rm -rf "$OUT/raw" "$OUT/timeline.json"
DEMO_VOICE_WAV="$PWD/$OUT/voice.wav" DEMO_VOICE_SECONDS="$SECONDS_LONG" npx playwright test -c playwright.demo.config.ts
npx tsx scripts/demo-finish.ts "$OUT/voice.wav"
