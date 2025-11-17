#!/usr/bin/env bash
# reload_loopback.sh – minimal Loopback setup / tear‑down
#
#   ▸ enable  : ./reload_loopback.sh
#   ▸ restore : ./reload_loopback.sh --restore
#
set -euo pipefail
STATE="${XDG_RUNTIME_DIR:-/tmp}/loopback_state"

if [[ "${1:-}" == "--restore" ]]; then
  echo "🔙 Restoring defaults…"
  if [[ -f $STATE ]]; then
    read -r OLD_SINK < <(sed -n '1p' "$STATE")
    read -r OLD_SRC < <(sed -n '2p' "$STATE")
    [[ $OLD_SINK ]] && pactl set-default-sink "$OLD_SINK"
    [[ $OLD_SRC ]] && pactl set-default-source "$OLD_SRC"
    rm -f "$STATE"
  fi
  sudo modprobe -r snd_aloop 2>/dev/null || true
  systemctl --user restart pipewire
  echo "✅ Audio stack restored."
  exit 0
fi

echo "🎧 Loading snd_aloop kernel module…"
sudo modprobe snd_aloop
systemctl --user restart pipewire
sleep 1

# ── force PipeWire to expose the Loopback card (some distros need this) ──
pactl load-module module-alsa-card device_id=Loopback 2>/dev/null || true
sleep 0.5

# retry for up to 3 s
for i in {1..6}; do
  SINK=$(pactl list short sinks | awk '/Loopback.*analog-stereo/{print $2; exit}')
  SRC=$(pactl list short sources | awk -v s="$SINK" '$2==s".monitor"{print $2; exit}')
  [[ $SINK && $SRC ]] && break
  sleep 0.5
done

if [[ ! $SINK || ! $SRC ]]; then
  echo "❌ Loopback nodes not found (even after forcing)."
  exit 1
fi

echo "  sink   → $SINK"
echo "  source → $SRC (monitor)"

# save previous defaults (only first time)
if [[ ! -f $STATE ]]; then
  pactl get-default-sink >"$STATE"
  pactl get-default-source >>"$STATE"
fi

pactl set-default-sink "$SINK"
pactl set-default-source "$SRC"

cat <<EOF

✅ Loopback ready
• Default sink   : $SINK
• Default source : $SRC   (Meet mic / monitor)

Run your bot:
    MEET_URL="https://meet.google.com/xxx-xxxx-xxx" node meetbot.js

Restore defaults afterwards:
    ./reload_loopback.sh --restore
EOF
