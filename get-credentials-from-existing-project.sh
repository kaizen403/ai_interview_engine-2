#!/bin/bash
set -e

PROJECT_ID="speech-meet-bot"
SERVICE_ACCOUNT_NAME="sales-ai-stt"
SERVICE_ACCOUNT_EMAIL="$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com"

echo "🔧 Getting credentials from existing project: $PROJECT_ID"
echo "========================================================="

# Set project
echo "📋 Setting active project..."
gcloud config set project $PROJECT_ID

# Enable Speech-to-Text API (if not already enabled)
echo "🎙️  Ensuring Speech-to-Text API is enabled..."
gcloud services enable speech.googleapis.com

# Check if service account exists
echo "🔍 Checking for existing service accounts..."
if gcloud iam service-accounts list --filter="email:$SERVICE_ACCOUNT_EMAIL" --format="value(email)" | grep -q "$SERVICE_ACCOUNT_EMAIL"; then
    echo "✅ Service account already exists: $SERVICE_ACCOUNT_EMAIL"
else
    echo "👤 Creating new service account..."
    gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
        --description="AI sales bot STT" \
        --display-name="Sales AI STT"
    
    echo "🔑 Adding Speech Client role..."
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
        --role="roles/speech.client"
fi

# Create and download key
echo "📥 Creating new key and downloading credentials..."
gcloud iam service-accounts keys create google-cloud-stt.json \
    --iam-account=$SERVICE_ACCOUNT_EMAIL

echo ""
echo "✅ Success! Credentials saved to: $(pwd)/google-cloud-stt.json"
echo ""
echo "🎉 Next steps:"
echo "1. Restart bot: docker compose restart backend"
echo "2. Check logs: docker compose logs backend | grep STT"
echo ""
echo "💰 Billing: First 60 minutes/month FREE"
