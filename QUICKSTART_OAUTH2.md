# 🚀 Quick Start: OAuth2 Authentication

Get rid of cookie/permission issues forever! OAuth2 is the proper way to authenticate.

---

## ⚡ Super Quick Setup (5 minutes)

### Step 1: Get OAuth Credentials

1. Go to: **https://console.cloud.google.com/**
2. Create project → Name it `ai-screener-bot`
3. **APIs & Services** → **Library** → Enable **"Google Meet API"**
4. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**
5. Configure consent screen (if asked):
   - User Type: **External**
   - Add test user: `aisales1001@gmail.com`
6. Application type: **Desktop app**
7. **Download JSON** → Save as `oauth2-credentials.json` in project root

### Step 2: Run Setup Script

```bash
cd /home/kaizen/ai_screener
./setup-oauth2.sh
```

This will:
- Install required packages
- Open browser for authorization
- Save refresh token
- Configure everything

### Step 3: Start the Bot

```bash
docker compose up backend
```

**That's it!** The bot now uses OAuth2. No more cookie issues! 🎉

---

## 📋 What You'll See

```
[bot] Using OAuth2 authentication...
[bot] OAuth2 authentication successful
[bot] ✓ Authenticated with OAuth2
[bot] Navigating to Google Meet: ...
[bot] Join button clicked successfully
```

---

## ✅ Benefits

| Old Way (Cookies) | New Way (OAuth2) |
|-------------------|------------------|
| ❌ Permission errors | ✅ No file permissions needed |
| ❌ Cookie expiry | ✅ Auto-refresh tokens |
| ❌ Manual re-login | ✅ One-time setup |
| ❌ Bot detection | ✅ Google-approved |
| ❌ Complex setup | ✅ Simple script |

---

## 🔧 Troubleshooting

### "Credentials file not found"
- Make sure `oauth2-credentials.json` is in project root
- Check filename is exactly `oauth2-credentials.json`

### "Access blocked"
- Add your email as test user in OAuth consent screen
- Make sure app is in "Testing" mode (not "Published")

### "Invalid client"
- Download credentials again from Google Cloud Console
- Make sure you selected "Desktop app" not "Web application"

---

## 📖 Detailed Guide

For more details, see: `docs/OAUTH2_SETUP.md`

---

## 🔐 Security

- ✅ `oauth2-token.json` is automatically added to `.gitignore`
- ✅ Tokens are stored locally, never in code
- ✅ Refresh tokens auto-refresh, no re-authorization needed
- ✅ Much more secure than storing passwords

---

## 💡 Why OAuth2?

Google **recommends** OAuth2 for all automated access:
- It's the official, supported method
- No risk of account bans
- Works reliably long-term
- Industry standard

**Cookie-based auth** is a workaround that:
- Google actively blocks
- Has permission issues
- Breaks frequently
- Not officially supported

---

Ready? Run `./setup-oauth2.sh` now! 🚀
