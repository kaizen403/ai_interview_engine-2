#!/usr/bin/env bash
# setup_loopback.sh — load/unload Loopback + virtual mic + STT null‑sink
#
#   Enable : ./setup_loopback.sh
#   Restore: ./setup_loopback.sh --restore
#
set -euo pipefail

STATE_FILE="${XDG_RUNTIME_DIR:-/tmp}/loopback_state"
LOOP_CARD_ID="Loopback"
LOOP_SINK_REGEX="Loopback.*analog-stereo"
VIRTUAL_MIC="salesai_mic"
STT_SINK="stt_sink" # null sink for STT capture

die() {
  printf '❌ %s\n' "$*" >&2
  exit 1
}

restore() {
  printf '🔙 Restoring defaults…\n'
  [[ -f $STATE_FILE ]] || die 'Nothing to restore.'

  while read -r MID; do
    [[ $MID -gt 0 ]] && pactl unload-module "$MID" 2>/dev/null || true
  done <"$STATE_FILE"

  sudo modprobe -r snd_aloop 2>/dev/null || true
  systemctl --user restart pipewire
  rm -f "$STATE_FILE"
  printf '✅ Audio stack restored.\n'
}

[[ ${1:-} == --restore ]] && restore && exit 0

printf '🎧 Loading Loopback…\n'
sudo modprobe snd_aloop
systemctl --user restart pipewire
sleep 1

# expose Loopback card
LOOP_MOD=$(pactl load-module module-alsa-card device_id="$LOOP_CARD_ID" 2>/dev/null || echo 0)
sleep 0.5

# discover Loopback sink + monitor (using -v to avoid $ expansion)
LOOP_SINK=$(pactl list short sinks | awk -v re="$LOOP_SINK_REGEX" '$0 ~ re {print $2; exit}')
LOOP_SRC=$(pactl list short sources | awk -v s="$LOOP_SINK" '$2 == s".monitor" {print $2; exit}')

DEFAULT_SINK=$(pactl get-default-sink)
DEFAULT_MON="${DEFAULT_SINK}.monitor"

[[ -n $LOOP_SINK && -n $LOOP_SRC ]] || {
  restore
  die 'Loopback nodes not found.'
}

# create virtual microphone if missing
MIC_MOD=0
if ! pactl list short sources | grep -q "[[:space:]]$VIRTUAL_MIC[[:space:]]"; then
  MIC_MOD=$(pactl load-module module-remap-source \
    master="$LOOP_SRC" \
    source_name="$VIRTUAL_MIC" \
    source_properties="device.description=SalesAI_Mic,device.class=sound")
fi

# create null sink for STT
NULL_MOD=0
if ! pactl list short sinks | grep -q "[[:space:]]$STT_SINK[[:space:]]"; then
  NULL_MOD=$(pactl load-module module-null-sink \
    sink_name="$STT_SINK" \
    sink_properties="device.description=STT_Sink")
fi

# save module IDs
printf '%s\n%s\n%s\n' "$LOOP_MOD" "$MIC_MOD" "$NULL_MOD" >"$STATE_FILE"

cat <<EOF

✅ Loopback, SalesAI mic, and STT sink ready

• Loopback sink    : $LOOP_SINK
• Loopback monitor : $LOOP_SRC
• Virtual mic      : $VIRTUAL_MIC   (select this in Meet)
• STT monitor      : ${STT_SINK}.monitor

Add these lines to your .env:

LOOPBACK_SINK=$LOOP_SINK
LOOPBACK_MONITOR=$LOOP_SRC
STT_MONITOR=${STT_SINK}.monitor
VIRTUAL_MIC=$VIRTUAL_MIC
EOF
