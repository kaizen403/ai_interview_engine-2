#!/bin/bash
#
# Quick Fix for Google Login Issue
# This script helps you authenticate with Google manually
#

echo "=========================================="
echo "Google Login Fix for AI Screener Bot"
echo "=========================================="
echo ""
echo "Google is blocking automated logins."
echo "You need to log in manually ONCE to establish trust."
echo ""
echo "Choose a method:"
echo ""
echo "1) Open browser on this machine (EASIEST)"
echo "2) Copy existing Chrome profile"
echo "3) View detailed instructions"
echo "4) Exit"
echo ""
read -p "Enter choice [1-4]: " choice

case $choice in
  1)
    echo ""
    echo "=========================================="
    echo "IMPORTANT: Profile Directory"
    echo "=========================================="
    echo "The bot uses: /tmp/chrome-profile"
    echo "You MUST use the SAME directory!"
    echo ""
    echo "Opening Chromium with bot's profile directory..."
    echo ""
    echo "Steps to complete:"
    echo "  1. Log into Google with: aisales1001@gmail.com"
    echo "  2. Complete any 2FA/verification"
    echo "  3. Visit https://meet.google.com to verify access"
    echo "  4. Keep the browser open for at least 30 seconds"
    echo "  5. Close the browser when you see 'Meet ready'"
    echo ""
    echo "Press ENTER to open browser..."
    read
    
    # Stop any running backend to avoid conflicts
    echo "Stopping any running backend containers..."
    docker compose down 2>/dev/null || true
    
    # Create profile directory if it doesn't exist
    mkdir -p /tmp/chrome-profile
    chmod 777 /tmp/chrome-profile
    
    echo ""
    echo "Opening browser... (this may take a moment)"
    
    # Open Chromium
    chromium --user-data-dir=/tmp/chrome-profile --no-sandbox "https://accounts.google.com" &
    BROWSER_PID=$!
    
    echo ""
    echo "=========================================="
    echo "Browser opened! (PID: $BROWSER_PID)"
    echo "=========================================="
    echo ""
    echo "Complete the login steps listed above."
    echo "When you're done and see Meet working,"
    echo "close the browser and press ENTER here..."
    echo ""
    read
    
    # Make sure browser is closed
    echo "Ensuring all Chromium processes are stopped..."
    pkill -f "chromium.*chrome-profile" 2>/dev/null || true
    sleep 2
    
    # Remove any lock files
    rm -f /tmp/chrome-profile/SingletonLock /tmp/chrome-profile/Default/SingletonLock 2>/dev/null || true
    
    # Verify cookies were saved
    if [ -d "/tmp/chrome-profile/Default" ]; then
      echo "✓ Profile directory found"
      if [ -f "/tmp/chrome-profile/Default/Cookies" ] || [ -f "/tmp/chrome-profile/Default/Network/Cookies" ]; then
        echo "✓ Cookies file found"
      else
        echo "⚠ Warning: Cookies file not found. Login may not have been saved."
      fi
    else
      echo "⚠ Warning: Profile directory not created properly"
    fi
    
    echo ""
    echo "✓ Session should be saved!"
    echo "✓ Starting backend now..."
    echo ""
    
    # Start backend
    docker compose up -d backend
    sleep 3
    echo ""
    echo "Checking authentication status..."
    docker compose logs backend | grep -E "cookies|authenticated|login" | tail -5
    echo ""
    echo "If you see 'Existing cookies count: 0', the login didn't save."
    echo "Try running this script again and keep browser open longer."
    ;;
    
  2)
    echo ""
    echo "Copying your existing Chrome profile..."
    
    if [ -d "$HOME/.config/google-chrome/Default" ]; then
      echo "Found Chrome profile"
      cp -r "$HOME/.config/google-chrome/Default" /tmp/chrome-profile
    elif [ -d "$HOME/.config/chromium/Default" ]; then
      echo "Found Chromium profile"
      cp -r "$HOME/.config/chromium/Default" /tmp/chrome-profile
    else
      echo "ERROR: Could not find Chrome/Chromium profile"
      echo "Try option 1 instead"
      exit 1
    fi
    
    chmod -R 755 /tmp/chrome-profile
    echo ""
    echo "✓ Profile copied!"
    echo "✓ You can now start the bot with: docker compose up backend"
    ;;
    
  3)
    echo ""
    cat << 'EOF'
========================================
Detailed Instructions
========================================

Problem:
  Google blocks automated logins to protect accounts.
  URL: /v3/signin/rejected

Solution:
  Log in manually once to save session cookies.

Method 1 - Manual Browser Login (Easiest):
  1. Run: chromium --user-data-dir=/tmp/chrome-profile --no-sandbox
  2. Log into Google (aisales1001@gmail.com)
  3. Complete verification if asked
  4. Visit https://meet.google.com
  5. Close browser
  6. Start bot: docker compose up backend

Method 2 - Use Existing Session:
  1. Copy profile: cp -r ~/.config/chromium/Default /tmp/chrome-profile
  2. Fix permissions: chmod -R 755 /tmp/chrome-profile
  3. Start bot: docker compose up backend

Verification:
  Check logs for: "[bot] Existing cookies count: [number > 0]"
  Should see: "[bot] Already authenticated with Google"

More info: docs/GOOGLE_LOGIN_FIX.md
========================================
EOF
    ;;
    
  4)
    echo "Exiting..."
    exit 0
    ;;
    
  *)
    echo "Invalid choice"
    exit 1
    ;;
esac

echo ""
echo "Done!"
