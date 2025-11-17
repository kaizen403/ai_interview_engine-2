# Google Cloud Speech-to-Text Setup

## Why You Need This

The AI bot uses **Google Cloud Speech-to-Text API** to transcribe audio from Google Meet calls in real-time. Without credentials, the bot will crash when trying to process audio.

---

## Quick Setup (5 minutes)

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. Click **Select a project** → **New Project**
   - Project name: `sales-ai-bot`
   - Click **Create**

### Step 2: Enable Speech-to-Text API

1. In the search bar, type: `Speech-to-Text API`
2. Click **Enable**
3. Wait for activation (takes ~30 seconds)

### Step 3: Create Service Account

1. Go to **IAM & Admin** → **Service Accounts**
2. Click **Create Service Account**
   - Name: `sales-ai-stt`
   - Description: `Service account for AI sales bot STT`
   - Click **Create and Continue**
3. Add role: **Cloud Speech Client**
4. Click **Continue** → **Done**

### Step 4: Download Credentials

1. Find your service account in the list
2. Click the **three dots** → **Manage keys**
3. Click **Add Key** → **Create new key**
4. Choose **JSON**
5. Click **Create** (file downloads automatically)

### Step 5: Add to Project

1. **Rename** the downloaded file to `google-cloud-stt.json`
2. **Move** it to your project root:
   ```bash
   mv ~/Downloads/your-project-123abc-*.json /home/kaizen/ai_screener/google-cloud-stt.json
   ```

3. **Verify** the file exists:
   ```bash
   ls -la /home/kaizen/ai_screener/google-cloud-stt.json
   ```

### Step 6: Restart Bot

```bash
docker compose restart backend
```

---

## ✅ Verification

After restarting, the bot should:
- ✅ Join the meeting
- ✅ Start audio pipeline
- ✅ Begin transcribing speech

Check logs:
```bash
docker compose logs backend | grep STT
```

You should see:
```
[STT] Stream initialized
[STT] Listening for audio...
```

---

## 💰 Pricing

Google Cloud Speech-to-Text pricing:
- **First 60 minutes/month**: FREE
- **After that**: $0.006 per 15 seconds (~$1.44/hour)

For development/testing, you'll stay within the free tier.

---

## 🔒 Security Notes

- ✅ Credentials file is in `.gitignore` (won't be committed)
- ✅ File contains sensitive service account keys
- ✅ **Never share** this file publicly
- ✅ **Never commit** to Git repositories

---

## 🆘 Troubleshooting

### Error: "Could not load the default credentials"

**Cause**: Credentials file not found or path incorrect

**Fix**:
```bash
# Check if file exists
ls -la /home/kaizen/ai_screener/google-cloud-stt.json

# Check .env file
cat /home/kaizen/ai_screener/.env | grep GOOGLE_APPLICATION_CREDENTIALS
```

### Error: "Permission denied"

**Cause**: Service account doesn't have proper role

**Fix**: Go to IAM → find your service account → add **Cloud Speech Client** role

### Error: "API not enabled"

**Cause**: Speech-to-Text API not enabled in project

**Fix**: Go to APIs & Services → Enable APIs → search "Speech-to-Text" → Enable

---

## Alternative: Use Free STT Provider

If you don't want to set up Google Cloud, you can switch to a free STT provider:

### Option 1: Whisper.cpp (Local, Free)
- Run transcription locally
- No API costs
- Requires CPU/GPU

### Option 2: AssemblyAI (Free tier)
- 5 hours/month free
- Simple API setup
- Real-time transcription

Let me know if you'd like to switch to an alternative!
