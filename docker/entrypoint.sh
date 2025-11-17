#!/usr/bin/env bash
set -euo pipefail

cd /workspace

start_container_pulseaudio() {
  # Kill any existing pulseaudio processes
  pkill -f pulseaudio || true
  sleep 1

  # Clear any existing pulse configuration
  unset PULSE_SERVER
  rm -rf ~/.pulse* ~/.config/pulse /tmp/pulse* 2>/dev/null || true

  echo "[entrypoint] Starting PulseAudio daemon..."
  
  # Start PulseAudio in daemon mode with minimal config
  pulseaudio --daemon --exit-idle-time=-1 --log-level=2 \
    --system=false --disallow-exit=false \
    --log-target=stderr >/tmp/pulse.log 2>&1

  # Wait for PulseAudio to start
  for i in $(seq 1 30); do
    if pulseaudio --check >/dev/null 2>&1; then
      echo "[entrypoint] PulseAudio daemon started successfully"
      return 0
    fi
    sleep 0.5
  done

  echo "[entrypoint] Failed to start PulseAudio daemon." >&2
  echo "[entrypoint] PulseAudio log:" >&2
  cat /tmp/pulse.log 2>/dev/null || echo "No log available"
  echo "[entrypoint] Continuing without audio - some features may not work." >&2
  return 1
}

setup_container_audio_graph() {
  local loopback_sink="${LOOPBACK_SINK:-loopback_sink}"
  local loopback_monitor="${loopback_sink}.monitor"

  local stt_sink="${STT_MONITOR:-stt_sink.monitor}"
  stt_sink="${stt_sink%.monitor}"
  local stt_monitor="${stt_sink}.monitor"

  local virtual_mic="${VIRTUAL_MIC:-salesai_mic}"

  if ! pactl list short sinks | grep -q "[[:space:]]${loopback_sink}[[:space:]]"; then
    pactl load-module module-null-sink \
      sink_name="${loopback_sink}" \
      sink_properties="device.description=Loopback_Sink" >/dev/null
  fi

  if ! pactl list short sinks | grep -q "[[:space:]]${stt_sink}[[:space:]]"; then
    pactl load-module module-null-sink \
      sink_name="${stt_sink}" \
      sink_properties="device.description=STT_Sink" >/dev/null
  fi

  if ! pactl list short sources | grep -q "[[:space:]]${virtual_mic}[[:space:]]"; then
    pactl load-module module-remap-source \
      master="${loopback_monitor}" \
      source_name="${virtual_mic}" \
      source_properties="device.description=SalesAI_Mic,device.class=sound" >/dev/null
  fi

  export LOOPBACK_SINK="${loopback_sink}"
  export LOOPBACK_MONITOR="${loopback_monitor}"
  export STT_MONITOR="${stt_monitor}"
  export VIRTUAL_MIC="${virtual_mic}"
}

if [[ "${USE_CONTAINER_AUDIO:-false}" == "true" ]]; then
  echo "[entrypoint] Enabling container-local PulseAudio graph..."
  if start_container_pulseaudio; then
    setup_container_audio_graph
    echo "[entrypoint] Audio loopbacks configured successfully"
  else
    echo "[entrypoint] Audio setup failed, but continuing..."
  fi
fi

if [[ -n "${PNPM_STORE_DIR:-}" ]]; then
  mkdir -p "${PNPM_STORE_DIR}"
  # Ensure the current user owns the pnpm store directory
  if [[ -w "${PNPM_STORE_DIR%/*}" ]]; then
    chown -R "$(id -u):$(id -g)" "${PNPM_STORE_DIR}" 2>/dev/null || true
  fi
fi

if [[ -f package.json ]]; then
  # Ensure node_modules directory exists and has correct permissions
  mkdir -p node_modules
  
  if [[ ! -f node_modules/.pnpm-installed ]]; then
    echo "[entrypoint] Installing backend dependencies with pnpm..."
    # Use pnpm without store to avoid permission issues
    pnpm install --frozen-lockfile --store-dir /tmp/pnpm-store-temp
    touch node_modules/.pnpm-installed
  fi
fi

if [[ -f salesfe/package.json && ! -d salesfe/node_modules ]]; then
  echo "[entrypoint] Installing frontend dependencies with npm..."
  npm --prefix salesfe install --no-audit --no-fund --no-package-lock
fi

exec "$@"
