#!/usr/bin/env node
/**
 * Manual Google Login Helper
 * 
 * This script opens a browser window where you can manually log into Google.
 * The session will be saved to the chrome-profile directory and reused by the bot.
 * 
 * Usage: node src/utils/manual-login.js
 */

import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROFILE_DIR = process.env.CHROME_PROFILE_DIR || '/tmp/chrome-profile';

async function manualLogin() {
  console.log('='.repeat(60));
  console.log('Google Manual Login Helper');
  console.log('='.repeat(60));
  console.log(`Profile directory: ${PROFILE_DIR}`);
  console.log('');
  console.log('Instructions:');
  console.log('1. A browser window will open');
  console.log('2. Log in to Google manually');
  console.log('3. Complete any 2FA/verification steps');
  console.log('4. Navigate to https://meet.google.com to verify access');
  console.log('5. Press Ctrl+C in this terminal when done');
  console.log('');
  console.log('Starting browser...');
  console.log('='.repeat(60));

  const browser = await puppeteer.launch({
    headless: false, // Must be false for manual interaction
    executablePath: "/usr/bin/chromium",
    userDataDir: PROFILE_DIR,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
    defaultViewport: { width: 1280, height: 720 }
  });

  const page = await browser.newPage();
  
  // Navigate to Google login
  console.log('Navigating to Google login page...');
  await page.goto('https://accounts.google.com', { waitUntil: 'networkidle2' });
  
  console.log('');
  console.log('Browser opened! Please complete the following:');
  console.log('1. Log in with your Google account');
  console.log('2. Complete any security verifications');
  console.log('3. Visit https://meet.google.com to test access');
  console.log('4. Press Ctrl+C here when finished');
  console.log('');
  console.log('The browser will remain open. Do NOT close it manually.');
  console.log('Your session will be saved automatically.');
  
  // Keep the script running
  await new Promise(() => {}); // Wait forever
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('');
  console.log('='.repeat(60));
  console.log('Saving session and closing browser...');
  console.log(`Session saved to: ${PROFILE_DIR}`);
  console.log('You can now run the bot - it will use this authenticated session.');
  console.log('='.repeat(60));
  process.exit(0);
});

manualLogin().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
