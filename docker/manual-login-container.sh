#!/bin/bash
#
# Manual Google Login for Docker Container
# 
# This script helps you log into Google manually to bypass bot detection.
# It will save the authenticated session that the bot can reuse.
#

set -e

echo "========================================"
echo "Google Manual Login - Container Mode"
echo "========================================"
echo ""
echo "IMPORTANT: This will open a browser inside the container."
echo "You'll need to use VNC or X11 forwarding to see it."
echo ""
echo "Alternative: Run the login helper on your HOST machine instead:"
echo "  cd /home/kaizen/ai_screener"
echo "  docker compose run --rm -it backend node src/utils/manual-login.js"
echo ""
echo "Or use the host machine directly (easier):"
echo "  chromium --user-data-dir=/tmp/chrome-profile --no-sandbox"
echo "  Then log into Google and visit meet.google.com"
echo ""

read -p "Continue with container login? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled. Use host machine method instead."
    exit 0
fi

# Check if we're in Docker
if [ ! -f /.dockerenv ]; then
    echo "ERROR: This script should run inside the Docker container"
    echo "Use: docker compose exec backend bash /workspace/docker/manual-login-container.sh"
    exit 1
fi

echo "Starting Chromium with profile directory: /tmp/chrome-profile"
echo "Log in to Google, then close the browser."

export DISPLAY=:99
Xvfb :99 -screen 0 1280x720x24 &
XVFB_PID=$!

chromium \
    --user-data-dir=/tmp/chrome-profile \
    --no-sandbox \
    --disable-setuid-sandbox \
    --disable-dev-shm-usage \
    https://accounts.google.com &

CHROMIUM_PID=$!

echo ""
echo "Chromium started (PID: $CHROMIUM_PID)"
echo "Complete your login, then press Ctrl+C"

# Wait for Ctrl+C
trap "kill $CHROMIUM_PID $XVFB_PID 2>/dev/null; echo 'Session saved!'; exit 0" SIGINT SIGTERM

wait $CHROMIUM_PID
kill $XVFB_PID 2>/dev/null

echo ""
echo "Login complete! Session saved to /tmp/chrome-profile"
echo "The bot will now use this authenticated session."
