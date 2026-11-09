#!/usr/bin/env bash
# Records the demo with a voice you can hear (npm run demo:record).
#   DEMO_VOICE=path/to/take.m4a DEMO_VOICE_TEXT="the words in it" DEMO_PAYPAL_MODE=sandbox DEMO_AI_MODE=live npm run demo:record
# The clip is played through Chromium's fake microphone, so the speech model really hears it, and the
# same audio is laid under the video from the moment the record button is pressed. DEMO_VOICE_TEXT is
# what the clip says, shown as subtitles while it plays. With no DEMO_VOICE a macOS computer voice
# stands in, the subtitles say so, and DEMO_REQUIRE_LIVE=1 refuses to record.
# DEMO_BASE_URL=https://… records against a running site (the hosted one) instead of building here.
# DEMO_REQUIRE_LIVE=1 is the take for judges: it fails on anything that isn't live (demo/live-guard.ts).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=test-results/demo
mkdir -p "$OUT" videos
VOICE="${DEMO_VOICE:-}"
PLACEHOLDER_TEXT="Dryer would not heat. I was there three quarters of an hour at eighty an hour. New heating element, fifteen dollars."
if [ -z "$VOICE" ]; then
  echo "[demo] DEMO_VOICE isn't set: using a computer-voice PLACEHOLDER, not a person."
  say -v Samantha -r 170 -o "$OUT/voice-placeholder.aiff" "$PLACEHOLDER_TEXT"
  VOICE="$OUT/voice-placeholder.aiff"
  export DEMO_VOICE_PLACEHOLDER=1 DEMO_VOICE_TEXT="$PLACEHOLDER_TEXT"
elif [ -z "${DEMO_VOICE_TEXT:-}" ]; then
  echo "[demo] DEMO_VOICE is set, so DEMO_VOICE_TEXT must be too: the words the clip says, for the subtitles." >&2
  exit 1
fi
# Chromium's fake microphone reads WAV. A short lead-in so the first word isn't clipped, and even loudness.
ffmpeg -loglevel error -y -i "$VOICE" -af "loudnorm=I=-16:TP=-1.5,adelay=300:all=1,apad=pad_dur=0.4" -ac 1 -ar 48000 -c:a pcm_s16le "$OUT/voice.wav"
SECONDS_LONG=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/voice.wav")
echo "[demo] voice: $VOICE (${SECONDS_LONG}s)"
rm -rf "$OUT/raw" "$OUT/timeline.json"
DEMO_VOICE_WAV="$PWD/$OUT/voice.wav" DEMO_VOICE_SECONDS="$SECONDS_LONG" npx playwright test -c playwright.demo.config.ts
npx tsx scripts/demo-finish.ts "$OUT/voice.wav"
