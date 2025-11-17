# Google Login Issue - Solutions

## Problem
Google is rejecting automated login attempts from the bot with error:
```
/v3/signin/rejected
```

This is Google's bot detection mechanism. They block automated logins to protect user accounts.

## Solution: Manual Authentication

You need to log into Google **manually once** to establish trust. The session will be saved and reused by the bot.

### Option 1: Manual Login on Host Machine (EASIEST) ⭐

```bash
# 1. Open Chromium with the same profile directory the bot uses
chromium --user-data-dir=/tmp/chrome-profile --no-sandbox

# 2. In the browser:
#    - Log into Google with aisales1001@gmail.com
#    - Complete any 2FA/verification
#    - Visit https://meet.google.com to verify access
#    - Close the browser

# 3. Start the bot - it will now use the saved session!
cd /home/kaizen/ai_screener
docker compose up backend
```

### Option 2: Use Existing Google Session

If you have Chrome/Chromium already logged into Google:

```bash
# 1. Copy your existing Chrome profile
cp -r ~/.config/chromium/Default /tmp/chrome-profile

# 2. Fix permissions
chmod -R 755 /tmp/chrome-profile

# 3. Start the bot
docker compose up backend
```

### Option 3: Disable Automated Login

Modify the code to skip automatic login and rely on saved cookies only:

```javascript
// In src/index.js, comment out the login attempt section
// and just check for existing authentication
```

## Why This Happens

Google detects:
- ✗ Headless browser automation
- ✗ Missing browser fingerprints
- ✗ Unusual login patterns
- ✗ New device/location
- ✗ Puppeteer user agent

## Verification

After manual login, test the bot:

```bash
curl -X POST http://localhost:3030/api/bot/start \
  -H "Content-Type: application/json" \
  -d '{"meetUrl": "https://meet.google.com/your-meet-code"}'
```

You should see:
```
[bot] Existing cookies count: [some number > 0]
[bot] Already authenticated with Google
[bot] Navigating to Google Meet: ...
```

## Alternative: Use Less Secure App Access

**NOT RECOMMENDED** - but if you must:

1. Go to Google Account settings
2. Enable "Less secure app access"
3. Create an app-specific password
4. Use that password in `.env`

Note: Google is phasing this out.

## Long-term Solution

Consider using OAuth2 flow instead of password-based login:
- More secure
- Google-approved method
- No bot detection issues

Would require refactoring the authentication logic.
