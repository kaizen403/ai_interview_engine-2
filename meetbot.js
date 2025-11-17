#!/usr/bin/env node
/**
 * meetbot.js — streaming‑chunk TTS, echo‑filtered STT, instant interrupt,
 *              no tail cut‑off
 *
 * .env needs:
 *   MEET_URL, GROQ_API_KEY, ELEVEN_API_KEY, ELEVEN_VOICE_ID
 *   STT_MONITOR=stt_sink.monitor
 *   LOOPBACK_SINK=alsa_output.Loopback.analog-stereo
 *   VIRTUAL_MIC=salesai_mic
 * Optional:
 *   LOCAL_MONITOR=1   # hear the bot locally
 */

import "dotenv/config";
import puppeteer from "puppeteer";
import { spawn, spawnSync, execSync } from "child_process";
import axios from "axios";
import { PassThrough } from "stream";
import { SpeechClient } from "@google-cloud/speech";
import { ChatGroq } from "@langchain/groq";
import { ChatPromptTemplate } from "@langchain/core/prompts";

/* ---------- env ---------- */
const need = [
  "MEET_URL",
  "GROQ_API_KEY",
  "ELEVEN_API_KEY",
  "ELEVEN_VOICE_ID",
  "STT_MONITOR",
  "LOOPBACK_SINK",
];
for (const k of need) if (!process.env[k]) throw new Error(`Set ${k} in .env`);
const {
  MEET_URL,
  GROQ_API_KEY,
  ELEVEN_API_KEY,
  ELEVEN_VOICE_ID,
  STT_MONITOR,
  LOOPBACK_SINK,
  VIRTUAL_MIC = "salesai_mic",
  LOCAL_MONITOR,
} = process.env;

/* ---------- Pulse helpers ---------- */
const run = (a) =>
  spawnSync("pactl", a.split(" "), { encoding: "utf8" }).stdout.trim();
const sinkInputs = () => run("list sink-inputs short");
const sourceOuts = () => run("list source-outputs short");

function detectMeetSink() {
  const l =
    sourceOuts()
      .split("\n")
      .find((x) => x.split(/\s+/)[3] === VIRTUAL_MIC) || "";
  return l ? l.split(/\s+/)[3].replace(/\.monitor$/, "") : "";
}

function autoRoute(before) {
  const after = sinkInputs()
    .split("\n")
    .map((l) => l.split(/\s+/)[0]);
  const id = after.find((x) => !before.includes(x));
  if (!id) return;
  const sink = detectMeetSink();
  if (!sink) return;
  try {
    execSync(`pactl move-sink-input ${id} ${sink}`);
    console.log(`[DBG] moved #${id} → ${sink}`);
  } catch {}
}

/* ---------- LLM ---------- */

const systemPrompt = `You are Pandit Ji, a wise and traditional Hindu marriage priest conducting a sacred wedding ceremony between Rishi and Sristi.
take it step by step
Your role and mission:
• Introduce yourself as Pandit Ji, the marriage priest
• Explain the sacred nature of Hindu marriage (Vivah Sanskar)
• Guide both Rishi and Sristi through the marriage ceremony
• Ask meaningful questions about loyalty, commitment, and love
• Use traditional Hindu marriage mantras and dialogues
• When both say "yes", begin the marriage rituals
• Officially declare them married at the end

Traditional Hindu marriage elements to include:
• "Om Namah Shivaya" and other sacred mantras
• "Saat Phere" (seven vows) references
• "Mangal Sutra" and "Sindoor" mentions
• "Vivah Sanskar" ceremony steps
• "Om Shanti" for peace and blessings

Guidelines:
1. Start with a proper introduction as Pandit Ji
2. Ask both Rishi and Sristi about their commitment to each other
3. Use respectful and traditional language
4. Include some Hindi/Hindu marriage phrases naturally
5. When both agree, begin chanting and rituals
6. End by officially declaring them husband and wife
7. Keep responses warm, spiritual, and ceremonial
8. Always address both Rishi and Sristi respectfully
at the last tell us both to tell I love you

Remember: This is a sacred ceremony - be respectful, traditional, and guide them through this beautiful moment.`;

export const qa = ChatPromptTemplate.fromMessages([
  ["system", systemPrompt],
  ["user", "{question}"],
]).pipe(new ChatGroq({ apiKey: GROQ_API_KEY, model: "llama-3.3-70b-versatile" }));
/* ---------- helpers ---------- */
function wordSet(s) {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z ]+/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
}
function looksLikeEcho(transcript, lastReply) {
  if (!lastReply) return false;
  const a = wordSet(transcript);
  const b = wordSet(lastReply);
  let same = 0;
  a.forEach((w) => (b.has(w) ? same++ : 0));
  return same / Math.max(a.size, 1) > 0.6; // ≥60 % overlap = echo
}

/* ---------- STT + TTS ---------- */
const gClient = new SpeechClient();
let lastBot = "";
let playing = false;
let playProc = null;
let teeStream = null;

function startPipeline() {
  const cap = spawn("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "pulse",
    "-i",
    STT_MONITOR,
    "-ac",
    "1",
    "-ar",
    "16000",
    "-f",
    "s16le",
    "pipe:1",
  ]);

  const stt = gClient.streamingRecognize({
    config: {
      encoding: "LINEAR16",
      sampleRateHertz: 16000,
      languageCode: "en-US",
      enableAutomaticPunctuation: true,
    },
    interimResults: true,
  });
  cap.stdout.pipe(stt);

  stt.on("data", async (d) => {
    const txt = d.results?.[0]?.alternatives?.[0]?.transcript?.trim();
    if (!txt) return;

    /* ----- interruption handler ----- */
    if (d.results[0].isFinal && playing && !looksLikeEcho(txt, lastBot)) {
      console.log("\n[INTERRUPT] user spoke:", txt);
      if (playProc) playProc.kill("SIGKILL");
      if (teeStream) teeStream.end();
      playing = false;
      // fall through to treat txt as new question
    }

    /* ignore interim or echo transcripts while playing */
    if (!d.results[0].isFinal || (playing && looksLikeEcho(txt, lastBot))) {
      process.stdout.write("\r⏳ " + txt.padEnd(process.stdout.columns));
      return;
    }

    console.log(`\n📝 ${txt}`);

    /* ---------- LLM ---------- */
    let answer;
    try {
      const r = await qa.invoke({ question: txt });
      answer = (typeof r === "string" ? r : r.content).trim();
      console.log(`🤖 ${answer}\n`);
    } catch (e) {
      console.error("[Groq]", e.message);
      return;
    }

    /* ---------- Streaming‑chunk TTS ---------- */
    try {
      const sentences = answer
        .match(/[^.!?]+[.!?]?/g)
        ?.map((s) => s.trim()) || [answer];
      const beforeIds = sinkInputs()
        .split("\n")
        .map((l) => l.split(/\s+/)[0]);

      teeStream = new PassThrough();
      playProc = spawn("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "quiet",
        "-i",
        "pipe:0",
        "-f",
        "pulse",
        "-stream_name",
        "salesai-tts",
        LOOPBACK_SINK,
      ]);
      teeStream.pipe(playProc.stdin).on("error", () => {});
      if (LOCAL_MONITOR === "1") {
        const tap = spawn("paplay", ["--device", "@DEFAULT_SINK@", "-"]);
        teeStream.pipe(tap.stdin).on("error", () => {});
      }

      playing = true;
      const TAIL_PAD_MS = 500; // let ffmpeg flush last audio

      for (let i = 0; i < sentences.length && playing; i++) {
        const piece = sentences[i];
        if (!piece) continue;
        console.log(`[TTS] part ${i + 1}/${sentences.length}`);
        const { data } = await axios.post(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}`,
          { text: piece, model_id: "eleven_turbo_v2" },
          {
            responseType: "arraybuffer",
            headers: { "xi-api-key": ELEVEN_API_KEY },
          },
        );
        if (playing) teeStream.write(Buffer.from(data));
      }

      /* allow decoder to flush last frames */
      setTimeout(() => playing && teeStream.end(), TAIL_PAD_MS);

      playProc.on("exit", () => {
        playing = false;
        teeStream = null;
        playProc = null;
        setTimeout(() => autoRoute(beforeIds), 100);
      });

      lastBot = answer;
    } catch (e) {
      console.error("[TTS]", e.message);
      playing = false;
    }
  });
}

/* ---------- Puppeteer join ---------- */
(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: "/usr/bin/chromium",
    userDataDir: "./chrome-profile",
    args: ["--use-fake-ui-for-media-stream"],
  });
  const [page] = await browser.pages();
  page.on("console", (m) => console.log("[browser]", m.text()));

  await page.goto(MEET_URL, { waitUntil: "networkidle2" });
  await page.waitForFunction(
    () => {
      const btn = [...document.querySelectorAll("button")].find(
        (b) =>
          b.offsetParent && /Ask to join|Join now|Rejoin/.test(b.innerText),
      );
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    },
    { timeout: 120_000 },
  );

  console.log("[bot] Joined — pipeline starts in 5 s…");
  setTimeout(startPipeline, 5000);

  process.on("SIGINT", async () => {
    await browser.close();
    process.exit(0);
  });
})();
