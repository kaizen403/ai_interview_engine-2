import http from "http";
import url from "url";
import puppeteer from "puppeteer";

import { MEET_URL } from "./config/env.js";
import { startPipeline, stopPipeline, isPipelineRunning } from "./pipeline/meet.js";
import { conversationMemory } from "./services/memory.js";
import { resetProfile, setProfile, processQuestion } from "./services/llm.js";
import { initRagFromEnv, listKbSources, indexPages, unloadSources } from "./services/rag.js";
import { generateAssistantProfileFromKB } from "./services/profile.js";
import { WebSocketServer } from "ws";
import {
  loadPersistedProfile,
  savePersistedProfile,
  profileToSetProfileArgs,
  normalizeProfile,
} from "./services/profile-store.js";

let browser = null;
let page = null;
let currentMeetUrl = null;
let persistedProfile = null;

function hasProfileContent(profile = {}) {
  if (!profile || typeof profile !== "object") return false;
  if (typeof profile.companyBio === "string" && profile.companyBio.trim()) return true;
  if (typeof profile.salesIntent === "string" && profile.salesIntent.trim()) return true;
  if (typeof profile.successCriteria === "string" && profile.successCriteria.trim()) return true;
  if (Array.isArray(profile.agenda) && profile.agenda.some((item) => typeof item === "string" && item.trim())) {
    return true;
  }
  return false;
}

async function startBot({ meetUrl, profile }) {
  if (browser) {
    throw new Error("Bot already running");
  }

  // Reset conversation and set profile
  conversationMemory.reset();
  resetProfile();
  let activeProfile = null;
  if (profile) {
    const normalized = normalizeProfile(profile);
    if (hasProfileContent(normalized)) {
      activeProfile = normalized;
      setProfile(profileToSetProfileArgs(normalized));
      persistedProfile = normalized;
      try {
        await savePersistedProfile(normalized);
      } catch (e) {
        console.warn("[profile] persist on start failed:", e?.message || e);
      }
    }
  }

  if (!activeProfile) {
    if (persistedProfile && hasProfileContent(persistedProfile)) {
      setProfile(profileToSetProfileArgs(persistedProfile));
    } else {
      try {
        const stored = await loadPersistedProfile();
        if (stored && hasProfileContent(stored)) {
          persistedProfile = stored;
          setProfile(profileToSetProfileArgs(stored));
        }
      } catch (e) {
        console.warn("[profile] load on start failed:", e?.message || e);
      }
    }
  }

  const launchOpts = {
    headless: false,
    executablePath: "/usr/bin/chromium",
    userDataDir: "/tmp/chrome-profile",  // Use persistent profile with Google login
    args: [
      "--use-fake-ui-for-media-stream",
      "--disable-web-security",
      "--disable-features=VizDisplayCompositor",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-blink-features=AutomationControlled",  // Hide automation
      "--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"  // Normal user agent
    ],
  };

  console.log("[bot] Launching browser with options:", JSON.stringify(launchOpts, null, 2));
  browser = await puppeteer.launch(launchOpts);
  console.log("[bot] Browser launched successfully");
  
  ;[page] = await browser.pages();
  page.on("console", (m) => console.log("[browser]", m.text()));
  
  currentMeetUrl = meetUrl || "https://meet.google.com/uym-ugyd-qyp";
  
  // Set additional properties to avoid bot detection
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  });
  
  // Skip cookie counting - Puppeteer can't read Chrome's encrypted cookies
  console.log("[bot] Skipping cookie count (Chrome cookies are encrypted)");
  
  // Navigate directly to Meet and see if we're authenticated
  console.log("[bot] Navigating to Google Meet:", currentMeetUrl);
  await page.goto(currentMeetUrl, { waitUntil: "networkidle2" });
  console.log("[bot] Meet page loaded, current URL:", page.url());
  
  // Wait for page to load
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Step 1: Handle mic/camera permission prompt (automatically allowed by --use-fake-ui-for-media-stream)
  console.log("[bot] Media permissions auto-granted by browser flags");
  
  // Step 2: Dismiss "Sign in" popup by clicking "Got it"
  console.log("[bot] Looking for 'Got it' or dismiss button...");
  try {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const dismissedPopup = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll("button, [role='button'], span[role='button']")];
      for (const btn of buttons) {
        const text = (btn.innerText || btn.textContent || '').toLowerCase().trim();
        if (text === 'got it' || text.includes('got it') || text.includes('continue without')) {
          console.log('Found dismiss button:', text);
          btn.click();
          return true;
        }
      }
      return false;
    });
    
    if (dismissedPopup) {
      console.log("[bot] ✅ Clicked 'Got it' button");
      await new Promise(resolve => setTimeout(resolve, 3000));
    } else {
      console.log("[bot] No 'Got it' button found, continuing...");
    }
  } catch (e) {
    console.log("[bot] Error dismissing popup:", e.message);
  }
  
  // Step 3: Enter name in the input box
  console.log("[bot] Looking for name input field...");
  try {
    const nameInput = await page.$('input[placeholder*="name" i], input[aria-label*="name" i], input[type="text"]');
    if (nameInput) {
      const botName = "AI Screener";
      await nameInput.click();
      await new Promise(resolve => setTimeout(resolve, 500));
      await nameInput.type(botName, { delay: 50 });
      console.log("[bot] ✅ Entered name:", botName);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
      console.log("[bot] No name input found");
    }
  } catch (e) {
    console.log("[bot] Error entering name:", e.message);
  }
  
  console.log("[bot] Looking for join button...");
  try {
    // First, wait for the page to stabilize
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Try to find join button with multiple approaches
    const joinButton = await page.evaluate(() => {
      const allButtons = [...document.querySelectorAll("button, [role='button'], [data-testid*='join']")];

      console.log(`Found ${allButtons.length} potential buttons/elements`);

      // Look for buttons with join-related text
      for (const btn of allButtons) {
        const text = (btn.innerText || btn.textContent || '').toLowerCase().trim();
        const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        const dataTestId = (btn.getAttribute('data-testid') || '').toLowerCase();

        console.log(`Button: "${text}" aria-label: "${ariaLabel}" data-testid: "${dataTestId}"`);

        // Check multiple patterns for join buttons
        const joinPatterns = [
          /join/i, /ask.*join/i, /join.*now/i, /rejoin/i, /join.*meeting/i,
          /enter/i, /participate/i, /connect/i
        ];

        const matchesText = joinPatterns.some(pattern => pattern.test(text));
        const matchesAria = joinPatterns.some(pattern => pattern.test(ariaLabel));
        const matchesTestId = /join|enter|connect/.test(dataTestId);

        if (matchesText || matchesAria || matchesTestId) {
          console.log(`Found join button: "${text || ariaLabel || dataTestId}"`);
          return {
            found: true,
            text: text,
            ariaLabel: ariaLabel,
            dataTestId: dataTestId,
            element: btn.outerHTML.substring(0, 200) // First 200 chars for debugging
          };
        }
      }

      // If no button found, return debug info
      return {
        found: false,
        debug: {
          totalButtons: allButtons.length,
          buttonTexts: allButtons.slice(0, 5).map(btn => ({
            text: (btn.innerText || btn.textContent || '').substring(0, 50),
            ariaLabel: btn.getAttribute('aria-label'),
            dataTestId: btn.getAttribute('data-testid')
          }))
        }
      };
    });

    if (joinButton.found) {
      console.log(`[bot] Found join button: "${joinButton.text || joinButton.ariaLabel}"`);

      // Click the join button
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll("button, [role='button'], [data-testid*='join']")];
        for (const btn of buttons) {
          const text = (btn.innerText || btn.textContent || '').toLowerCase().trim();
          const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();

          if (/join|ask.*join|join.*now|rejoin|enter|participate|connect/i.test(text) ||
              /join|enter|connect/i.test(ariaLabel)) {
            console.log('Clicking button:', text || ariaLabel);
            btn.click();
            return true;
          }
        }
        return false;
      });

      console.log("[bot] Join button clicked successfully");
      
      // Wait for the page to process the join
      console.log("[bot] Waiting for join to process...");
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Take a screenshot for debugging
      try {
        await page.screenshot({ path: '/tmp/after-join.png', fullPage: true });
        console.log("[bot] Screenshot saved to /tmp/after-join.png");
      } catch (e) {
        console.log("[bot] Could not save screenshot:", e.message);
      }
    } else {
      console.log("[bot] No join button found. Debug info:");
      console.log(`Total buttons found: ${joinButton.debug.totalButtons}`);
      console.log("First 5 buttons:");
      joinButton.debug.buttonTexts.forEach((btn, i) => {
        console.log(`  ${i+1}. Text: "${btn.text}" Aria: "${btn.ariaLabel}" TestId: "${btn.dataTestId}"`);
      });

      // Try clicking any visible button as fallback
      console.log("[bot] Trying fallback: clicking first visible button...");
      const clicked = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll("button")].filter(btn =>
          btn.offsetParent !== null && // Visible
          !btn.disabled && // Not disabled
          btn.innerText.trim().length > 0 // Has text
        );

        if (buttons.length > 0) {
          console.log('Clicking fallback button:', buttons[0].innerText.trim());
          buttons[0].click();
          return true;
        }
        return false;
      });

      if (clicked) {
        console.log("[bot] Fallback button clicked");
      } else {
        throw new Error("No suitable buttons found to click");
      }
    }
  } catch (joinError) {
    console.error("[bot] Failed to find/click join button:", joinError.message);

    // Take a screenshot for debugging
    try {
      await page.screenshot({ path: '/tmp/meet-join-error.png', fullPage: true });
      console.log("[bot] Screenshot saved to /tmp/meet-join-error.png");
    } catch (screenshotError) {
      console.error("[bot] Failed to save screenshot:", screenshotError.message);
    }

    throw new Error(`Could not join meeting: ${joinError.message}`);
  }
  
  console.log("[bot] Joined — pipeline starts in 5 s…");
  
  // Wait and verify we're actually in the meeting
  setTimeout(async () => {
    try {
      const postJoinInfo = await page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        return {
          url: window.location.href,
          hasWaiting: bodyText.includes('waiting') || bodyText.includes('let you in') || bodyText.includes('ask to join'),
          hasLeave: bodyText.includes('leave call') || bodyText.includes('end call'),
          bodySnippet: document.body.innerText.substring(0, 300)
        };
      });
      console.log("[bot] Post-join status:", JSON.stringify(postJoinInfo, null, 2));
      
      if (postJoinInfo.hasWaiting) {
        console.log("[bot] ⚠️  Bot is in waiting room - host needs to admit the bot!");
      } else if (postJoinInfo.hasLeave) {
        console.log("[bot] ✅ Bot successfully joined the meeting!");
      }
    } catch (e) {
      console.error("[bot] Failed to verify join status:", e.message);
    }
    startPipeline();
  }, 5000);
}

async function stopBot() {
  stopPipeline();
  try {
    if (browser) {
      await browser.close();
    }
  } catch {}
  browser = null;
  page = null;
  currentMeetUrl = null;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const { pathname } = url.parse(req.url, true);
  res.setHeader("Content-Type", "application/json");
  // Basic CORS for local development
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && pathname === "/api/profile") {
      try {
        if (!persistedProfile) {
          const loaded = await loadPersistedProfile();
          if (loaded && hasProfileContent(loaded)) {
            persistedProfile = loaded;
          }
        }
      } catch (e) {
        console.warn("[profile] load error:", e?.message || e);
      }
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          ok: true,
          profile: persistedProfile && hasProfileContent(persistedProfile) ? persistedProfile : null,
        }),
      );
      return;
    }

    if (req.method === "POST" && pathname === "/api/profile") {
      const body = await readJson(req).catch(() => ({}));
      const normalized = normalizeProfile(body);
      if (!hasProfileContent(normalized)) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: "Missing profile fields" }));
        return;
      }
      try {
        const saved = await savePersistedProfile(normalized);
        persistedProfile = saved;
        setProfile(profileToSetProfileArgs(saved));
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, profile: saved }));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: e?.message || "Failed to save profile" }));
      }
      return;
    }

    if (req.method === "POST" && pathname === "/api/bot/start") {
      const body = await readJson(req).catch(() => ({}));
      const meetUrl = body.meetUrl || undefined; // optional
      const profile = normalizeProfile({
        companyBio: body.companyBio,
        salesIntent: body.salesIntent,
        successCriteria: body.successCriteria,
        agenda: body.agenda,
      });

      await startBot({ meetUrl, profile: hasProfileContent(profile) ? profile : undefined });
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, running: true, meetUrl: currentMeetUrl }));
      return;
    }

    if (req.method === "POST" && pathname === "/api/bot/stop") {
      await stopBot();
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, running: false }));
      return;
    }

    if (req.method === "GET" && pathname === "/api/bot/status") {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          ok: true,
          running: Boolean(browser),
          pipeline: isPipelineRunning(),
          meetUrl: currentMeetUrl,
        }),
      );
      return;
    }

    if (req.method === "GET" && pathname === "/api/kb/sources") {
      const sources = await listKbSources().catch(() => []);
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, sources }));
      return;
    }

    if (req.method === "POST" && pathname === "/api/kb/upload") {
      const body = await readJson(req).catch(() => ({}));
      const pages = Array.isArray(body?.pages) ? body.pages : [];
      if (!pages.length) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: "Missing pages[]" }));
        return;
      }
      try {
        const result = await indexPages(pages);
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, ...result }));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: e?.message || "indexing failed" }));
      }
      return;
    }

    if (req.method === "POST" && pathname === "/api/kb/unload") {
      const body = await readJson(req).catch(() => ({}));
      const sources = Array.isArray(body?.sources) ? body.sources : [];
      const all = Boolean(body?.all);
      try {
        const result = await unloadSources(sources, { all });
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, ...result }));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: e?.message || 'Unload failed' }));
      }
      return;
    }

    if (req.method === "POST" && pathname === "/api/chat") {
      const body = await readJson(req).catch(() => ({}));
      const question = (body?.question || "").toString().trim();
      const reset = Boolean(body?.reset);
      const kbPages = Array.isArray(body?.kbPages) ? body.kbPages : [];
      const documents = Array.isArray(body?.documents) ? body.documents : [];
      const sources = Array.isArray(body?.sources) ? body.sources : [];
      const profileBody = body?.profile || body?.assistant || null;

      if (!question) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: "Missing question" }));
        return;
      }

      if (reset) conversationMemory.reset();

      // If a profile is provided, apply it for this chat request
      try {
        if (profileBody && typeof profileBody === 'object') {
          const mapped = profileToSetProfileArgs(profileBody);
          if (hasProfileContent(mapped)) setProfile(mapped);
        }
      } catch {}

      const cap = (s, max = 15000) => (s && s.length > max ? s.slice(0, max) + "\n... [truncated]" : s || "");
      let extraContext = "";
      if (kbPages.length) {
        extraContext += kbPages
          .map((p) => `KB: ${p.title || p.url || "(untitled)"}\n${cap(p.content || "")}`)
          .join("\n\n");
      }
      if (documents.length) {
        extraContext += (extraContext ? "\n\n" : "") + documents
          .map((d) => `DOC: ${d.title || d.filename || "(untitled)"}\n${cap(d.body || "")}`)
          .join("\n\n");
      }

      try {
        const answer = await processQuestion(question, { extraContext, sources });
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, answer }));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: e?.message || "LLM error" }));
      }
      return;
    }

    // (Removed legacy /api/assistant/autofill)

    // Combined: generate fields directly from KB (single call)
    if (req.method === "POST" && pathname === "/api/assistant/autofill_refined") {
      const body = await readJson(req).catch(() => ({}));
      const kbPages = Array.isArray(body?.kbPages) ? body.kbPages : [];
      const companyUrl = (body?.companyUrl || "").toString() || undefined;
      if (!kbPages.length) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: "Missing kbPages[]" }));
        return;
      }
      try {
        console.log(`[api] autofill_refined: pages=${kbPages.length}`);
        const initial = await generateAssistantProfileFromKB(kbPages, { companyUrl });
        // Log token usage if available
        try {
          const u = initial?._usage || {};
          const p = u.prompt ?? u.input ?? u.prompt_tokens ?? u.input_tokens;
          const c = u.completion ?? u.output ?? u.completion_tokens ?? u.output_tokens;
          const t = u.total ?? (typeof p === 'number' && typeof c === 'number' ? p + c : undefined);
          console.log(`[ai] tokens used — prompt=${p ?? 'n/a'} completion=${c ?? 'n/a'} total=${t ?? 'n/a'}`);
        } catch {}
        const { _usage, ...payload } = initial || {};
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, ...payload }));
      } catch (e) {
        console.warn('[api] autofill_refined error:', e?.message || e);
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: e?.message || "Autofill failed" }));
      }
      return;
    }

    // (Removed legacy /api/assistant/refine)

    res.statusCode = 404;
    res.end(JSON.stringify({ ok: false, error: "Not found" }));
  } catch (e) {
    console.error("[api] Error:", e);
    res.statusCode = 400;
    res.end(JSON.stringify({ ok: false, error: e.message || String(e) }));
  }
});

const PORT = process.env.PORT || 3030;
const HOST = process.env.HOST || "127.0.0.1";
server.listen(PORT, HOST, async () => {
  console.log(`[api] Server listening on http://${HOST}:${PORT}`);
  console.log("[api] Use POST /api/bot/start to join the Meet.");
  try {
    await initRagFromEnv();
  } catch (e) {
    console.warn('[RAG] init error:', e?.message || e);
  }
  try {
    const stored = await loadPersistedProfile();
    if (stored && hasProfileContent(stored)) {
      persistedProfile = stored;
      setProfile(profileToSetProfileArgs(stored));
      console.log("[profile] Loaded assistant profile from disk.");
    }
  } catch (e) {
    console.warn("[profile] Failed to load persisted profile:", e?.message || e);
  }
});

// WebSocket chat with optional source filters per connection
const wss = new WebSocketServer({ server, path: '/ws/chat' });
wss.on('connection', (ws) => {
  ws.selectedSources = [];
  ws.send(JSON.stringify({ type: 'hello', ok: true }));
  ws.on('message', async (data) => {
    let msg = null;
    try { msg = JSON.parse(data.toString()); } catch { /* ignore */ }
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'selectSources') {
      ws.selectedSources = Array.isArray(msg.sources) ? msg.sources : [];
      ws.send(JSON.stringify({ type: 'selectSources/ok', sources: ws.selectedSources }));
      return;
    }
    if (msg.type === 'listSources') {
      const sources = await listKbSources().catch(() => []);
      ws.send(JSON.stringify({ type: 'sources', sources }));
      return;
    }
    if (msg.type === 'question') {
      const q = (msg.question || '').toString().trim();
      if (!q) return ws.send(JSON.stringify({ type: 'error', error: 'Missing question' }));
      try {
        const answer = await processQuestion(q, { sources: ws.selectedSources });
        ws.send(JSON.stringify({ type: 'answer', answer }));
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', error: e?.message || 'LLM error' }));
      }
      return;
    }
  });
});

process.on("SIGINT", async () => {
  await stopBot();
  process.exit(0);
});
