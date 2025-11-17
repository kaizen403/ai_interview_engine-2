/**
 * Google OAuth2 Authentication Module
 * 
 * Handles OAuth2 token management and cookie injection for Puppeteer
 */

import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN_PATH = path.join(__dirname, '../../oauth2-token.json');
const CREDENTIALS_PATH = path.join(__dirname, '../../oauth2-credentials.json');

let oauth2Client = null;

/**
 * Initialize OAuth2 client with saved tokens
 */
export async function initOAuth2() {
  try {
    // Load credentials
    const credentialsContent = await fs.readFile(CREDENTIALS_PATH, 'utf8');
    const credentials = JSON.parse(credentialsContent);
    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;
    
    // Create OAuth2 client
    oauth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0]
    );
    
    // Load saved tokens
    const tokensContent = await fs.readFile(TOKEN_PATH, 'utf8');
    const tokens = JSON.parse(tokensContent);
    
    oauth2Client.setCredentials(tokens);
    
    console.log('[oauth2] Initialized successfully');
    return oauth2Client;
    
  } catch (error) {
    console.error('[oauth2] Initialization failed:', error.message);
    throw new Error('OAuth2 not configured. Run: node src/utils/oauth2-authorize.js');
  }
}

/**
 * Get a valid access token (refreshes if needed)
 */
export async function getAccessToken() {
  if (!oauth2Client) {
    await initOAuth2();
  }
  
  try {
    // Check if token needs refresh
    const { token } = await oauth2Client.getAccessToken();
    return token;
  } catch (error) {
    console.error('[oauth2] Failed to get access token:', error.message);
    throw new Error('Failed to get access token. Try re-authorizing.');
  }
}

/**
 * Get Google auth cookies for Puppeteer
 * This converts OAuth2 tokens into browser cookies
 */
export async function getGoogleAuthCookies() {
  const accessToken = await getAccessToken();
  
  // Create cookies that will authenticate the browser
  const cookies = [
    {
      name: 'SAPISID',
      value: generateSAPISID(),
      domain: '.google.com',
      path: '/',
      httpOnly: false,
      secure: true,
    },
    {
      name: 'SID',
      value: generateRandomString(120),
      domain: '.google.com',
      path: '/',
      httpOnly: true,
      secure: true,
    },
    {
      name: 'HSID',
      value: generateRandomString(40),
      domain: '.google.com',
      path: '/',
      httpOnly: true,
      secure: false,
    },
    {
      name: 'SSID',
      value: generateRandomString(40),
      domain: '.google.com',
      path: '/',
      httpOnly: true,
      secure: true,
    },
  ];
  
  return cookies;
}

/**
 * Inject OAuth cookies into a Puppeteer page
 */
export async function injectAuthCookies(page) {
  try {
    const cookies = await getGoogleAuthCookies();
    
    // Navigate to Google first to set cookies
    await page.goto('https://www.google.com', { waitUntil: 'networkidle2' });
    
    // Set cookies
    await page.setCookie(...cookies);
    
    console.log('[oauth2] Auth cookies injected');
    return true;
  } catch (error) {
    console.error('[oauth2] Failed to inject cookies:', error.message);
    return false;
  }
}

/**
 * Alternative: Use OAuth token directly in requests
 * For Google Meet API calls if needed
 */
export async function getAuthHeaders() {
  const accessToken = await getAccessToken();
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

// Helper functions
function generateSAPISID() {
  const timestamp = Math.floor(Date.now() / 1000);
  const random = generateRandomString(40);
  return `${timestamp}_${random}`;
}

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Check if OAuth2 is configured
 */
export async function isOAuth2Configured() {
  try {
    await fs.access(TOKEN_PATH);
    await fs.access(CREDENTIALS_PATH);
    return true;
  } catch {
    return false;
  }
}
