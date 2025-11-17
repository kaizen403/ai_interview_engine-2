#!/bin/bash
#
# Cleanup Chrome Profile Lock
# Run this if you get "profile appears to be in use" errors
#

echo "=========================================="
echo "Chrome Profile Lock Cleanup"
echo "=========================================="
echo ""

# Kill any running Chromium processes using the profile
echo "1. Killing any Chromium processes using /tmp/chrome-profile..."
pkill -9 -f "chromium.*chrome-profile" 2>/dev/null && echo "   ✓ Killed Chromium processes" || echo "   - No Chromium processes found"
sleep 1

# Remove lock files
echo "2. Removing lock files..."
rm -f /tmp/chrome-profile/SingletonLock 2>/dev/null && echo "   ✓ Removed /tmp/chrome-profile/SingletonLock" || echo "   - Lock file not found"
rm -f /tmp/chrome-profile/Default/SingletonLock 2>/dev/null && echo "   ✓ Removed /tmp/chrome-profile/Default/SingletonLock" || echo "   - Lock file not found"

# Check for any remaining processes
echo ""
echo "3. Checking for remaining processes..."
PROCS=$(ps aux | grep -i "[c]hromium.*chrome-profile" | wc -l)
if [ $PROCS -eq 0 ]; then
    echo "   ✓ No Chromium processes using profile"
else
    echo "   ⚠ Warning: Still found $PROCS Chromium process(es)"
    echo ""
    echo "   You may need to run with sudo:"
    echo "   sudo pkill -9 -f chromium"
fi

# Restart backend
echo ""
echo "4. Restarting backend container..."
cd /home/kaizen/ai_screener
docker compose restart backend

echo ""
echo "=========================================="
echo "Cleanup complete!"
echo "=========================================="
echo ""
echo "You can now try starting the bot again:"
echo "curl -X POST http://localhost:3030/api/bot/start \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{\"meetUrl\": \"https://meet.google.com/your-code\"}'"
