#!/usr/bin/env node
/**
 * Google OAuth2 Authorization Script
 * 
 * Run this once to authorize the app and get a refresh token.
 * The token will be saved to oauth2-token.json for future use.
 * 
 * Usage: node src/utils/oauth2-authorize.js
 */

import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CREDENTIALS_PATH = path.join(__dirname, '../../oauth2-credentials.json');
const TOKEN_PATH = path.join(__dirname, '../../oauth2-token.json');

// Scopes required for Google Meet access
const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'openid'
];

async function authorize() {
  console.log('='.repeat(60));
  console.log('Google OAuth2 Authorization');
  console.log('='.repeat(60));
  console.log('');
  
  // Check if credentials file exists
  try {
    await fs.access(CREDENTIALS_PATH);
  } catch (error) {
    console.error('ERROR: OAuth credentials file not found!');
    console.error('Expected location:', CREDENTIALS_PATH);
    console.error('');
    console.error('Please follow these steps:');
    console.error('1. Go to https://console.cloud.google.com/');
    console.error('2. Create OAuth 2.0 credentials');
    console.error('3. Download the JSON file');
    console.error('4. Save it as: oauth2-credentials.json');
    console.error('');
    console.error('See docs/OAUTH2_SETUP.md for detailed instructions');
    process.exit(1);
  }
  
  console.log('Starting OAuth2 authorization flow...');
  console.log('');
  console.log('A browser window will open for you to:');
  console.log('1. Log into Google');
  console.log('2. Grant permissions to the app');
  console.log('3. The token will be saved automatically');
  console.log('');
  console.log('Press Ctrl+C to cancel');
  console.log('');
  
  try {
    // Authenticate using local OAuth flow
    const auth = await authenticate({
      scopes: SCOPES,
      keyfilePath: CREDENTIALS_PATH,
    });
    
    console.log('');
    console.log('✓ Authorization successful!');
    console.log('');
    
    // Get credentials
    const credentials = auth.credentials;
    
    // Save tokens
    const tokens = {
      type: 'authorized_user',
      client_id: (await fs.readFile(CREDENTIALS_PATH, 'utf8').then(JSON.parse)).installed.client_id,
      client_secret: (await fs.readFile(CREDENTIALS_PATH, 'utf8').then(JSON.parse)).installed.client_secret,
      refresh_token: credentials.refresh_token,
      access_token: credentials.access_token,
      expiry_date: credentials.expiry_date,
    };
    
    await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    
    console.log('✓ Refresh token saved to:', TOKEN_PATH);
    console.log('');
    console.log('This token will be used by the bot for authentication.');
    console.log('You won\'t need to log in manually anymore!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Add oauth2-token.json to .gitignore');
    console.log('2. Start the bot: docker compose up backend');
    console.log('');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('');
    console.error('ERROR: Authorization failed');
    console.error(error.message);
    console.error('');
    
    if (error.message.includes('invalid_client')) {
      console.error('The OAuth credentials are invalid.');
      console.error('Make sure you downloaded the correct JSON file.');
    } else if (error.message.includes('access_denied')) {
      console.error('Authorization was denied.');
      console.error('You need to grant permissions for the app to work.');
    }
    
    console.error('');
    console.error('For help, see: docs/OAUTH2_SETUP.md');
    process.exit(1);
  }
}

authorize();
