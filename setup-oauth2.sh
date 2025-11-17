#!/bin/bash
#
# OAuth2 Setup Script
# This script guides you through setting up OAuth2 authentication
#

set -e

cd "$(dirname "$0")"

echo "=========================================="
echo "Google OAuth2 Setup for AI Screener"
echo "=========================================="
echo ""

# Step 1: Install dependencies
echo "Step 1: Installing OAuth2 dependencies..."
pnpm add googleapis @google-cloud/local-auth

echo ""
echo "✓ Dependencies installed"
echo ""

# Step 2: Check for credentials
echo "Step 2: Checking for OAuth credentials..."
if [ ! -f "oauth2-credentials.json" ]; then
    echo ""
    echo "⚠ OAuth credentials not found!"
    echo ""
    echo "You need to create OAuth credentials first:"
    echo ""
    echo "1. Visit: https://console.cloud.google.com/"
    echo "2. Create a new project (or select existing)"
    echo "3. Enable Google Meet API"
    echo "4. Create OAuth 2.0 Client ID (Desktop app)"
    echo "5. Download the JSON file"
    echo "6. Save it as: oauth2-credentials.json"
    echo ""
    echo "For detailed instructions, see: docs/OAUTH2_SETUP.md"
    echo ""
    echo "After downloading the credentials file, run this script again."
    exit 1
fi

echo "✓ Credentials file found"
echo ""

# Step 3: Add to .gitignore
echo "Step 3: Adding OAuth files to .gitignore..."
if ! grep -q "oauth2-credentials.json" .gitignore 2>/dev/null; then
    echo "oauth2-credentials.json" >> .gitignore
    echo "oauth2-token.json" >> .gitignore
    echo "✓ Added to .gitignore"
else
    echo "✓ Already in .gitignore"
fi
echo ""

# Step 4: Run authorization
echo "Step 4: Running OAuth authorization..."
echo ""
echo "A browser will open for you to:"
echo "- Log into Google"
echo "- Grant permissions"
echo "- Get your refresh token"
echo ""
echo "Press ENTER to continue..."
read

node src/utils/oauth2-authorize.js

echo ""
echo "=========================================="
echo "OAuth2 Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Start the backend: docker compose up backend"
echo "2. The bot will automatically use OAuth2"
echo "3. No more manual logins needed!"
echo ""
echo "To test:"
echo "  curl -X POST http://localhost:3030/api/bot/start \\"
echo "    -H \"Content-Type: application/json\" \\"
echo "    -d '{\"meetUrl\": \"https://meet.google.com/your-code\"}'"
echo ""
