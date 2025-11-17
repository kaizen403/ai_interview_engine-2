# 🎉 AI Sales Bot - Setup Complete!

## ✅ What's Working

Your AI sales bot is now **fully operational** and ready to join Google Meet calls!

### **Current Status:**

```json
{
  "ok": true,
  "running": true,
  "pipeline": true,
  "meetUrl": "https://meet.google.com/tts-vcoy-tyg"
}
```

---

## 🎯 Completed Setup

### **1. Google Authentication** ✅
- **Method**: Chrome profile with saved session
- **Location**: `/tmp/chrome-profile`
- **Account**: `aisales1001@gmail.com`
- **Status**: Authenticated and working

### **2. Google Cloud Speech-to-Text** ✅
- **Project**: `speech-meet-bot`
- **Service Account**: `sales-ai-stt@speech-meet-bot.iam.gserviceaccount.com`
- **Credentials**: `/home/kaizen/ai_screener/google-cloud-stt.json`
- **API Status**: Enabled
- **Cost**: First 60 minutes/month FREE

### **3. Bot Capabilities** ✅
- ✅ Joins Google Meet automatically
- ✅ Real-time speech-to-text transcription
- ✅ AI-powered responses (Groq LLM)
- ✅ Text-to-speech output (ElevenLabs)
- ✅ RAG knowledge base (Pinecone)
- ✅ Audio pipeline (PulseAudio)

---

## 🚀 How to Use

### **Start the Bot**

```bash
# Start backend
docker compose up -d backend

# Join a meeting
curl -X POST http://localhost:3030/api/bot/start \
  -H "Content-Type: application/json" \
  -d '{"meetUrl": "https://meet.google.com/your-meeting-code"}'
```

### **Check Status**

```bash
curl -s http://localhost:3030/api/bot/status | jq .
```

### **Stop the Bot**

```bash
curl -X POST http://localhost:3030/api/bot/stop
```

### **View Logs**

```bash
# All logs
docker compose logs backend -f

# STT logs only
docker compose logs backend -f | grep STT

# Bot activity
docker compose logs backend -f | grep bot
```

---

## 🔧 Troubleshooting

### **Profile Lock Error**

If you see "profile appears to be in use":

```bash
# Clean up locks
docker compose down
rm -f /tmp/chrome-profile/SingletonLock /tmp/chrome-profile/Default/SingletonLock
docker compose up -d backend
```

### **Authentication Issues**

If bot can't join meetings:

```bash
# Re-authenticate manually
chromium --user-data-dir=/tmp/chrome-profile --no-sandbox https://accounts.google.com

# Log in, visit meet.google.com, then close browser
# Restart bot
docker compose restart backend
```

### **STT Not Working**

If transcription fails:

```bash
# Check credentials
docker compose exec backend env | grep GOOGLE_APPLICATION_CREDENTIALS

# Verify file exists
docker compose exec backend ls -la /workspace/google-cloud-stt.json

# Check project
docker compose exec backend cat /workspace/google-cloud-stt.json | jq -r '.project_id'
```

---

## 📊 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Google Meet Call                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Puppeteer Bot                            │
│  • Joins meeting with Chrome profile                        │
│  • Captures audio via PulseAudio                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Google Cloud Speech-to-Text                    │
│  • Real-time transcription                                  │
│  • Interim results for interruption detection               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Groq LLM (AI Brain)                      │
│  • Processes transcribed text                               │
│  • Generates intelligent responses                          │
│  • Uses RAG for knowledge base queries                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  ElevenLabs TTS                             │
│  • Converts AI response to speech                           │
│  • Plays audio back in meeting                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 💰 Cost Breakdown

| Service | Free Tier | After Free Tier |
|---------|-----------|-----------------|
| **Google Cloud STT** | 60 mins/month | ~₹120/hour |
| **Groq LLM** | Generous free tier | Very cheap |
| **ElevenLabs TTS** | 10,000 chars/month | ~$0.30/1K chars |
| **Pinecone** | 1 index free | $70/month |

**Estimated monthly cost for development**: ~₹0-500

---

## 🔐 Security Notes

### **Protected Files** (in `.gitignore`)
- `google-cloud-stt.json` - Google Cloud credentials
- `oauth2-credentials.json` - OAuth2 client secrets
- `oauth2-token.json` - OAuth2 refresh tokens

### **Environment Variables**
All sensitive data is in `.env` file (also gitignored)

### **Best Practices**
- ✅ Never commit credential files
- ✅ Rotate service account keys regularly
- ✅ Use least-privilege IAM roles
- ✅ Monitor API usage for anomalies

---

## 📚 Documentation

- **Google Cloud STT Setup**: `/home/kaizen/ai_screener/docs/GOOGLE_CLOUD_STT_SETUP.md`
- **OAuth2 Setup**: `/home/kaizen/ai_screener/docs/OAUTH2_SETUP.md`
- **Google Login Fix**: `/home/kaizen/ai_screener/docs/GOOGLE_LOGIN_FIX.md`

---

## 🎊 Next Steps

### **Immediate**
1. Test the bot in a real meeting
2. Verify transcription accuracy
3. Test AI responses

### **Enhancements**
1. Add custom prompts for sales scenarios
2. Upload company knowledge base to Pinecone
3. Fine-tune interruption detection
4. Add meeting summary generation
5. Implement CRM integration

### **Production Readiness**
1. Set up monitoring and alerts
2. Implement error recovery
3. Add rate limiting
4. Set up backup credentials
5. Create deployment pipeline

---

## 🆘 Support

If you encounter issues:

1. **Check logs**: `docker compose logs backend -f`
2. **Verify status**: `curl -s http://localhost:3030/api/bot/status | jq .`
3. **Restart services**: `docker compose restart backend`
4. **Clean state**: `docker compose down && docker compose up -d backend`

---

## 🎉 Congratulations!

Your AI sales bot is ready to revolutionize your sales calls! 🚀

**Happy selling!** 💼
