#!/usr/bin/env bash
# delete_loopbacks.sh — unload snd_aloop + remove PipeWire nodes

set -euo pipefail
echo "🧹  Unloading PipeWire loopback modules…"
for m in $(pactl list modules short | awk '/Loopback/ {print $1}'); do
  pactl unload-module "$m" || true
done

echo "🔌  Removing Loopback card from PipeWire…"
pactl unload-module module-alsa-card device_id=Loopback 2>/dev/null || true

echo "🚫  Unloading kernel module snd_aloop…"
sudo modprobe -r snd_aloop || true

echo "🔄  Restarting PipeWire session…"
systemctl --user restart pipewire

echo "✅  All Loopback sinks/sources removed."
echo "    If needed, set your hardware defaults again:"
echo "    pactl set-default-sink   <sink-name>"
echo "    pactl set-default-source <source-name>"
