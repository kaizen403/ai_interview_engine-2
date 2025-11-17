#!/bin/bash
set -e

echo "=========================================="
echo "Manual Google Login - Interactive"
echo "=========================================="
echo ""
echo "Opening Chromium with the chrome profile..."
echo "Please login to: aisales1001@gmail.com"
echo "Password: PassAisales@103"
echo ""
echo "Steps:"
echo "1. Login to Google account"
echo "2. Visit https://meet.google.com and test joining a meeting"
echo "3. Close the browser when done"
echo ""

# Open browser
chromium --user-data-dir=/tmp/chrome-profile --no-sandbox "https://accounts.google.com/signin" &
BROWSER_PID=$!

echo "Browser PID: $BROWSER_PID"
echo ""
echo "After logging in and testing Meet, close the browser..."
echo "Press ENTER when you're done..."
read

# Ensure browser is closed
pkill -9 -f "chromium.*chrome-profile" 2>/dev/null || true
sleep 2

# Remove locks
rm -f /tmp/chrome-profile/SingletonLock /tmp/chrome-profile/Default/SingletonLock 2>/dev/null || true

# Fix permissions
chmod -R 755 /tmp/chrome-profile 2>/dev/null || true
chmod 644 /tmp/chrome-profile/Default/Cookies 2>/dev/null || true

echo ""
echo "✅ Login complete! Starting backend..."
cd /home/kaizen/ai_screener
docker compose up -d backend
sleep 8

echo ""
echo "Testing bot join..."
curl -X POST http://localhost:3030/api/bot/start \
  -H "Content-Type: application/json" \
  -d '{"meetUrl": "https://meet.google.com/tts-vcoy-tyg"}'

echo ""
echo ""
echo "Check logs: docker compose logs -f backend"
