#!/bin/bash
set -e

echo "🔧 Google Cloud Speech-to-Text Setup"
echo "==================================="

# Create project
PROJECT_NAME="sales-ai-bot-$(date +%s)"
echo "🏗️  Creating project: $PROJECT_NAME"

gcloud projects create $PROJECT_NAME --set-as-default

# Enable API
echo "🎙️  Enabling Speech-to-Text API..."
gcloud services enable speech.googleapis.com

# Create service account
SERVICE_ACCOUNT_NAME="sales-ai-stt"
SERVICE_ACCOUNT_EMAIL="$SERVICE_ACCOUNT_NAME@$PROJECT_NAME.iam.gserviceaccount.com"

echo "👤 Creating service account..."
gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
    --description="AI sales bot STT" \
    --display-name="Sales AI STT"

# Add role
echo "🔑 Adding Speech Client role..."
gcloud projects add-iam-policy-binding $PROJECT_NAME \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="roles/speech.client"

# Download key
echo "📥 Downloading credentials..."
gcloud iam service-accounts keys create google-cloud-stt.json \
    --iam-account=$SERVICE_ACCOUNT_EMAIL

echo "✅ Success! Credentials saved to google-cloud-stt.json"
echo "🎉 Restart bot: docker compose restart backend"
