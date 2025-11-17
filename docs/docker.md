# Docker Development Environment

This project supports two audio setups for speech-to-text, ElevenLabs TTS playback, and Puppeteer automation:

- **Container-local audio (default)** — run a self-contained PulseAudio instance inside the container so the host speakers/microphones are untouched.
- **Host loopback** — re-use the host PulseAudio/PipeWire stack and the loopback modules from `setup_loopback.sh`.

## 1. Host prerequisites
- Linux host with Docker Engine 24+ and Docker Compose v2.
- Google Cloud, Groq, and ElevenLabs credentials available for the backend `.env`.
- (Host loopback only) Ability to run `sudo modprobe` plus an active PulseAudio/PipeWire stack.

## 2. Pick your audio routing mode

### Option A — Container-local audio (default)
- No host setup required; the backend container starts its own PulseAudio daemon.
- Audio devices stay inside Docker, and the backend auto-configures `LOOPBACK_SINK`, `STT_MONITOR`, and `VIRTUAL_MIC`.
- Nothing to run on the host—just launch Compose (see section 5).

### Option B — Host loopback
1. Run the helper outside Docker to expose the loopback devices:
   ```bash
   ./setup_loopback.sh
   ```
2. Copy the printed environment variables (`LOOPBACK_SINK`, `LOOPBACK_MONITOR`, `STT_MONITOR`, `VIRTUAL_MIC`) into your backend `.env`. Keep the script running (or rerun as needed) while the containers are active.
3. Use the Compose override `docker/docker-compose.host-audio.yml`, which re-mounts the host PulseAudio socket and disables container audio defaults:
   ```bash
   docker compose -f docker-compose.yml -f docker/docker-compose.host-audio.yml up --build
   ```

If you ever want to restore the host audio state, use `./setup_loopback.sh --restore`.

## 3. Backend `.env`
Place the standard application secrets in `./.env` (same keys as local development: `MEET_URL`, `GROQ_API_KEY`, `ELEVEN_API_KEY`, `ELEVEN_VOICE_ID`, etc.). Audio variables (`LOOPBACK_SINK`, `STT_MONITOR`, `VIRTUAL_MIC`) only need to be set when you run against the host loopback; container audio fills them in automatically.

## 4. Docker runtime environment variables
For host loopback mode, export the following on the host so the container can talk to your PulseAudio socket:

```bash
export HOST_UID=$(id -u)
export HOST_GID=$(id -g)
export PULSE_SOCKET_DIR=${XDG_RUNTIME_DIR:-/run/user/$HOST_UID}/pulse
```

You can place those in a shell script or export them before running Compose. `PULSE_SOCKET_DIR` must point at the directory that contains the host `pulse/native` socket.

Container-local audio does not need these exports; your UID/GID are still read if available.

## 5. Build & run
```bash
docker compose up --build backend                           # Container-local audio (default backend only)
docker compose up --build                                   # Same as above but also starts the frontend
docker compose -f docker-compose.yml \
  -f docker/docker-compose.host-audio.yml up --build backend # Host loopback backend
```

The backend runs on `http://localhost:3030`, the Next.js frontend on `http://localhost:3000`. The first start takes a little longer because the entrypoint installs Node dependencies into dedicated volumes (`backend_node_modules`, `frontend_node_modules`, `pnpm-store`).

The frontend container uses `NEXT_PUBLIC_BACKEND_URL=http://backend:3030` so API calls are routed across the Compose network; adjust the variable if you expose the backend differently.

## 6. Audio routing inside the container
- **Container-local audio**: The default compose file starts a dedicated PulseAudio daemon inside the backend container (socket at `/tmp/pulse-runtime/pulse/native`) so no sound leaves or enters the host.
- **Host loopback**: The override mounts `/tmp/pulse` from the host’s `${PULSE_SOCKET_DIR}` and forwards `PULSE_SERVER`, `PULSE_COOKIE`, and `XDG_RUNTIME_DIR` so `pactl`, `ffmpeg`, and `paplay` speak to the host sound server. The backend also mounts `/dev/snd` and joins the host `audio` group so `ffmpeg` can pump audio into the loopback sink created by `setup_loopback.sh`.
- Chromium (installed via `apt`) is launched by Puppeteer using the existing `chrome-profile` volume so Meet can re-use its login state.

## 7. Common tasks
- **Stop containers**: `docker compose down`
- **Rebuild after dependency changes**: `docker compose build`
- **Cleanup named volumes** (will remove installed node_modules): `docker compose down -v`

> ⚠️ Running `setup_loopback.sh` is only required when using the host loopback option. Container-local audio takes care of the routing internally.
