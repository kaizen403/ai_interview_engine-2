# Google OAuth2 Setup Guide

## Why OAuth2?

✅ **No more cookie/permission issues**
✅ **Google-approved authentication**
✅ **No bot detection**
✅ **Secure token-based auth**
✅ **Works reliably**

---

## Step 1: Create Google OAuth Credentials

### 1.1 Go to Google Cloud Console

Visit: https://console.cloud.google.com/

### 1.2 Create/Select Project

1. Click project dropdown (top left)
2. Click "New Project"
3. Name it: `ai-screener-bot`
4. Click "Create"

### 1.3 Enable Google Meet API

1. Go to "APIs & Services" → "Library"
2. Search for "Google Meet API"
3. Click "Enable"

### 1.4 Create OAuth Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. If prompted, configure consent screen:
   - User Type: **External**
   - App name: `AI Screener Bot`
   - User support email: Your email
   - Developer contact: Your email
   - Click "Save and Continue"
   - Scopes: Skip for now
   - Test users: Add your email (aisales1001@gmail.com)
   - Click "Save and Continue"

4. Create OAuth client ID:
   - Application type: **Desktop app**
   - Name: `AI Screener Desktop`
   - Click "Create"

5. **Download JSON**:
   - Click the download icon next to your client ID
   - Save as: `/home/kaizen/ai_screener/oauth2-credentials.json`

### 1.5 Add Required Scopes

Go back to OAuth consent screen and add these scopes:
- `https://www.googleapis.com/auth/userinfo.email`
- `https://www.googleapis.com/auth/userinfo.profile`
- `openid`

---

## Step 2: Install Dependencies

```bash
cd /home/kaizen/ai_screener
pnpm add googleapis @google-cloud/local-auth
```

---

## Step 3: Run OAuth Flow (One Time)

```bash
# This will open a browser for you to authorize
node src/utils/oauth2-authorize.js
```

This creates `/home/kaizen/ai_screener/oauth2-token.json` with your refresh token.

---

## Step 4: Update Environment Variables

Add to `.env`:
```bash
# OAuth2 Settings
GOOGLE_OAUTH_CLIENT_ID=your_client_id_here
GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret_here
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/oauth2callback

# Old password-based (can remove)
# GOOGLE_EMAIL=...
# GOOGLE_PASS=...
```

---

## Step 5: Start the Bot

```bash
docker compose up backend
```

The bot will now use OAuth2 tokens instead of cookies! 🎉

---

## Troubleshooting

### "Access blocked: This app's request is invalid"
- Make sure you added your email as a test user in OAuth consent screen

### "Token has been expired or revoked"
- Run the authorization script again: `node src/utils/oauth2-authorize.js`

### "Insufficient permissions"
- Check that required scopes are added in consent screen
- Re-run authorization to get new token with updated scopes

---

## Security Notes

- ✅ `oauth2-token.json` contains sensitive refresh token
- ✅ Add to `.gitignore`
- ✅ Never commit to Git
- ✅ Tokens auto-refresh, no manual intervention needed
