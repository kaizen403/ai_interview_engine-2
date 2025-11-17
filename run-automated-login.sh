#!/bin/bash
set -e

echo "=========================================="
echo "Automated Google Login"
echo "=========================================="
echo ""

# Stop backend
echo "Stopping backend..."
docker compose down

# Clean locks
rm -f /tmp/chrome-profile/SingletonLock /tmp/chrome-profile/Default/SingletonLock 2>/dev/null || true
pkill -9 chromium 2>/dev/null || true
sleep 2

echo ""
echo "Running automated login..."
echo "This will open a browser window for login..."
echo ""

# Run the login script
node automated-login.mjs

# Clean up
sleep 2
pkill -9 chromium 2>/dev/null || true
rm -f /tmp/chrome-profile/SingletonLock /tmp/chrome-profile/Default/SingletonLock 2>/dev/null || true

# Fix permissions
chmod -R 755 /tmp/chrome-profile 2>/dev/null || true

echo ""
echo "✅ Login complete! Starting backend..."
docker compose up -d backend
sleep 8

echo ""
echo "Testing bot join..."
curl -X POST http://localhost:3030/api/bot/start \
  -H "Content-Type: application/json" \
  -d '{"meetUrl": "https://meet.google.com/tts-vcoy-tyg"}'

echo ""
echo ""
echo "Check status: curl http://localhost:3030/api/bot/status"
echo "Check logs: docker compose logs -f backend"
