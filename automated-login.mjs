#!/usr/bin/env node

import puppeteer from 'puppeteer';

const GOOGLE_EMAIL = process.env.GOOGLE_EMAIL || 'aisales1001@gmail.com';
const GOOGLE_PASS = process.env.GOOGLE_PASS || 'PassAisales@103';

console.log('[login] Starting automated Google login...');
console.log('[login] Email:', GOOGLE_EMAIL);

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: '/usr/bin/chromium',
  userDataDir: '/tmp/chrome-profile-new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-software-rasterizer',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });

try {
  console.log('[login] Navigating to Google sign in...');
  await page.goto('https://accounts.google.com/signin', { waitUntil: 'networkidle2' });
  
  await new Promise(r => setTimeout(r, 2000));
  
  const currentUrl = page.url();
  if (currentUrl.includes('myaccount.google.com')) {
    console.log('[login] ✅ Already logged in!');
  } else {
    console.log('[login] Entering email...');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.type('input[type="email"]', GOOGLE_EMAIL, { delay: 100 });
    await page.keyboard.press('Enter');
    
    await new Promise(r => setTimeout(r, 3000));
    
    console.log('[login] Entering password...');
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    await page.type('input[type="password"]', GOOGLE_PASS, { delay: 100 });
    await page.keyboard.press('Enter');
    
    await new Promise(r => setTimeout(r, 5000));
    
    console.log('[login] Checking for 2FA...');
    const pageText = await page.evaluate(() => document.body.innerText.toLowerCase());
    
    if (pageText.includes('verify') || pageText.includes('confirm') || pageText.includes('phone')) {
      console.log('[login] ⚠️  2FA required - this may fail!');
      await new Promise(r => setTimeout(r, 10000));
    }
  }
  
  console.log('[login] Testing Meet access...');
  await page.goto('https://meet.google.com', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));
  
  const meetUrl = page.url();
  const meetTitle = await page.title();
  console.log('[login] Meet URL:', meetUrl);
  console.log('[login] Meet title:', meetTitle);
  
  if (meetUrl.includes('meet.google.com')) {
    console.log('[login] ✅ Successfully logged in!');
  } else {
    console.log('[login] ❌ Login failed');
  }
  
  await new Promise(r => setTimeout(r, 2000));
  
} catch (error) {
  console.error('[login] Error:', error.message);
}

await browser.close();
console.log('[login] Copying cookies to main profile...');
import { execSync } from 'child_process';
execSync('cp -r /tmp/chrome-profile-new/Default/Cookies /tmp/chrome-profile/Default/ 2>/dev/null || true');
execSync('cp -r /tmp/chrome-profile-new/Default/Storage /tmp/chrome-profile/Default/ 2>/dev/null || true');
console.log('[login] ✅ Done!');
