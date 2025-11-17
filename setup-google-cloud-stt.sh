#!/bin/bash
set -e

echo "🔧 Setting up Google Cloud Speech-to-Text for AI Sales Bot"
echo "========================================================"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found. Installing..."
    sudo pacman -S google-cloud-cli --noconfirm
fi

echo "✅ gcloud CLI ready"

# Check if already authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "🔐 Please authenticate with Google Cloud:"
    echo "Run: gcloud auth login"
    echo "Then re-run this script"
    exit 1
fi

echo "✅ Already authenticated with Google Cloud"

# Create or set project
PROJECT_NAME="sales-ai-bot-$(date +%s)"
echo "🏗️  Creating Google Cloud project: $PROJECT_NAME"

gcloud projects create $PROJECT_NAME --set-as-default

# Enable Speech-to-Text API
echo "🎙️  Enabling Cloud Speech-to-Text API..."
gcloud services enable speech.googleapis.com

# Create service account
SERVICE_ACCOUNT_NAME="sales-ai-stt"
SERVICE_ACCOUNT_EMAIL="$SERVICE_ACCOUNT_NAME@$PROJECT_NAME.iam.gserviceaccount.com"

echo "👤 Creating service account: $SERVICE_ACCOUNT_EMAIL"
gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
    --description="Service account for AI sales bot speech-to-text" \
    --display-name="Sales AI STT"

# Add Speech Client role
echo "🔑 Adding Cloud Speech Client role..."
gcloud projects add-iam-policy-binding $PROJECT_NAME \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="roles/speech.client"

# Create and download key
echo "📥 Creating and downloading service account key..."
gcloud iam service-accounts keys create google-cloud-stt.json \
    --iam-account=$SERVICE_ACCOUNT_EMAIL

echo "✅ Setup complete!"
echo "📁 Credentials saved to: $(pwd)/google-cloud-stt.json"
echo ""
echo "🎉 Next steps:"
echo "1. Restart your bot: docker compose restart backend"
echo "2. Check logs: docker compose logs backend | grep STT"
echo ""
echo "💰 Billing: First 60 minutes/month FREE, then $0.006 per 15 seconds"
