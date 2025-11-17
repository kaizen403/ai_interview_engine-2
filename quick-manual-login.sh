#!/bin/bash
#
# Quick manual login - simplified version
#

set -e

echo "========================================"
echo "Quick Google Login"
echo "========================================"
echo ""

# Stop backend to release profile
echo "Stopping backend..."
cd /home/kaizen/ai_screener
docker compose down

# Clean up any locks
rm -f /tmp/chrome-profile/SingletonLock /tmp/chrome-profile/Default/SingletonLock 2>/dev/null || true

# Kill any existing chromium
pkill -9 -f chromium 2>/dev/null || true
sleep 2

echo ""
echo "Opening Chromium..."
echo "Log into: aisales1001@gmail.com"
echo "Visit: https://meet.google.com"
echo "Close browser when done"
echo ""

# Open browser
chromium --user-data-dir=/tmp/chrome-profile --no-sandbox "https://accounts.google.com/signin" 2>/dev/null &
BROWSER_PID=$!

echo "Browser PID: $BROWSER_PID"
echo ""
echo "After logging in and testing Meet,"
echo "close the browser and press ENTER..."
read

# Ensure browser is closed
pkill -9 -f "chromium.*chrome-profile" 2>/dev/null || true
sleep 2

# Remove locks
rm -f /tmp/chrome-profile/SingletonLock /tmp/chrome-profile/Default/SingletonLock 2>/dev/null || true

# Fix permissions
chmod -R 755 /tmp/chrome-profile
chmod 644 /tmp/chrome-profile/Default/Cookies 2>/dev/null || true

echo ""
echo "Cookies saved. Starting backend..."
docker compose up -d backend
sleep 5

echo ""
echo "Testing bot..."
curl -X POST http://localhost:3030/api/bot/start \
  -H "Content-Type: application/json" \
  -d '{"meetUrl": "https://meet.google.com/tts-vcoy-tyg"}'

echo ""
echo ""
echo "Check logs with: docker compose logs -f backend"
