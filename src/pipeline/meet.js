import { spawn } from "child_process";
import { PassThrough } from "stream";
import { SpeechClient } from "@google-cloud/speech";
import axios from "axios";

import {
  STT_MONITOR,
  ELEVEN_API_KEY,
  ELEVEN_VOICE_ID,
  LOOPBACK_SINK,
  LOCAL_MONITOR,
} from "../config/env.js";

import { processQuestion } from "../services/llm.js";
import { sinkInputs, autoRoute } from "../utils/pulse.js";
import { looksLikeEcho } from "../utils/text.js";

// Shared state between callbacks
let lastBot = "";
let playing = false;
let playProc = null;
let teeStream = null;
let capProc = null; // ffmpeg capture process
let sttStream = null; // Google STT stream
let sttRotateTimer = null; // rotation timer to avoid 305s hard limit
const STT_STREAM_MS = Number.parseInt(process.env.STT_STREAM_MS || "290000", 10); // default 4m50s

function clearSttTimer() {
  if (sttRotateTimer) {
    clearTimeout(sttRotateTimer);
    sttRotateTimer = null;
  }
}

function scheduleSttRotation() {
  clearSttTimer();
  sttRotateTimer = setTimeout(() => {
    console.log(`[STT] Rotating stream before Google 305s limit (every ${STT_STREAM_MS}ms)`);
    rotateSttStream();
  }, STT_STREAM_MS);
}

function rotateSttStream() {
  try {
    if (!capProc || !sttStream) return;
    capProc.stdout.unpipe(sttStream);
    try { sttStream.end(); } catch {}
    try { sttStream.destroy?.(); } catch {}
  } finally {
    startSttStream();
  }
}

function startSttStream() {
  const gClient = new SpeechClient();
  sttStream = gClient.streamingRecognize({
    config: {
      encoding: "LINEAR16",
      sampleRateHertz: 16000,
      languageCode: "en-US",
      enableAutomaticPunctuation: true,
    },
    interimResults: true,
  });
  capProc.stdout.pipe(sttStream);

  sttStream.on("error", (err) => {
    const msg = err?.message || String(err);
    console.error("[STT error]", msg);
    // Rotate on duration errors or unknown termination
    if (/Exceeded maximum allowed stream duration|RST_STREAM|INTERNAL/.test(msg)) {
      rotateSttStream();
    }
  });

  sttStream.on("end", () => {
    console.warn("[STT] Stream ended; restarting");
    rotateSttStream();
  });

  sttStream.on("data", handleSttData);
  scheduleSttRotation();
}

export function isPipelineRunning() {
  return Boolean(playing || playProc || teeStream || capProc || sttStream);
}

// Shared STT data handler (module scope so we can reattach on rotation)
async function handleSttData(d) {
  const txt = d.results?.[0]?.alternatives?.[0]?.transcript?.trim();
  if (!txt) return;

  /* ----- interruption handler ----- */
  if (d.results[0].isFinal && playing) {
    const isEcho = looksLikeEcho(txt, lastBot);
    console.log(`[DEBUG] Final transcript: "${txt}", isEcho: ${isEcho}, lastBot: "${lastBot}"`);
    
    if (!isEcho && txt.length > 2) { // Only interrupt for non-echo, substantial input
      console.log("\n[INTERRUPT] user spoke:", txt);
      console.log("[INTERRUPT] Stopping current playback...");
      if (playProc) {
        console.log("[INTERRUPT] Killing ffmpeg process");
        playProc.kill("SIGKILL");
      }
      if (teeStream) {
        console.log("[INTERRUPT] Ending stream");
        teeStream.end();
      }
      playing = false;
      // fall through to treat txt as new question
    } else {
      console.log(`[DEBUG] Ignoring: ${isEcho ? 'echo detected' : 'too short'}`);
      return; // Don't process echoes or very short inputs
    }
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
    answer = await processQuestion(txt);
    answer = answer.trim();
    console.log(`🤖 ${answer}\n`);
  } catch (e) {
    console.error("[Groq]", e.message);
    return;
  }

  /* ---------- Streaming-chunk TTS ---------- */
  try {
    const sentences = answer.match(/[^.!?]+[.!?]?/g)?.map((s) => s.trim()) || [answer];
    const beforeIds = sinkInputs()
      .split("\n")
      .map((l) => l.split(/\s+/)[0]);

    teeStream = new PassThrough();
    playProc = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-f",
      "pulse",
      "-stream_name",
      "salesai-tts",
      "-flush_packets",
      "1",
      "-fflags",
      "+flush_packets",
      LOOPBACK_SINK,
    ]);
    
    console.log("[TTS] Starting ffmpeg process, PID:", playProc.pid);
    teeStream.pipe(playProc.stdin).on("error", () => {});
    if (LOCAL_MONITOR === "1") {
      const tap = spawn("paplay", ["--device", "@DEFAULT_SINK@", "-"]);
      teeStream.pipe(tap.stdin).on("error", () => {});
    }

    playing = true;
    let totalAudioBytes = 0;

    for (let i = 0; i < sentences.length && playing; i++) {
      const piece = sentences[i];
      if (!piece) continue;
      console.log(`[TTS] Processing chunk ${i + 1}/${sentences.length}: "${piece}"`);
      
      try {
        const { data } = await axios.post(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}`,
          { text: piece, model_id: "eleven_flash_v2_5" },
          {
            responseType: "arraybuffer",
            headers: { "xi-api-key": ELEVEN_API_KEY },
          },
        );
        
        if (playing && teeStream && !teeStream.destroyed) {
          const audioBuffer = Buffer.from(data);
          totalAudioBytes += audioBuffer.length;
          console.log(`[TTS] Writing audio chunk ${i + 1}, size: ${audioBuffer.length} bytes`);
          
          // Write the audio data and wait for it to be processed
          const writeSuccessful = teeStream.write(audioBuffer);
          if (!writeSuccessful) {
            console.log(`[TTS] Waiting for drain on chunk ${i + 1}...`);
            await new Promise(resolve => teeStream.once('drain', resolve));
          }
          
          // No delay between chunks to maintain audio continuity
          console.log(`[TTS] Chunk ${i + 1} written successfully`);
        } else {
          console.log(`[TTS] Skipping chunk ${i + 1} - not playing or stream destroyed`);
        }
      } catch (error) {
        console.error(`[TTS] Error processing chunk ${i + 1}:`, error.message);
      }
    }
    
    console.log(`[TTS] Finished processing all ${sentences.length} chunks`);
    
    // Calculate estimated audio duration based on total bytes
    // ElevenLabs returns MP3 audio, typically ~12-14KB per second for speech
    // Being more conservative with 10KB per second to ensure we don't cut off
    const estimatedDurationMs = (totalAudioBytes / 10000) * 1000;
    const BUFFER_MS = 30000; // 30 second buffer after audio ends (further increased)
    const totalWaitTime = Math.max(estimatedDurationMs + BUFFER_MS, 45000); // minimum 45 seconds
    
    console.log(`[TTS] Total audio size: ${totalAudioBytes} bytes`);
    console.log(`[TTS] Estimated duration: ${Math.round(estimatedDurationMs)}ms (${Math.round(estimatedDurationMs/1000)}s)`);
    console.log(`[TTS] Will wait ${Math.round(totalWaitTime)}ms (${Math.round(totalWaitTime/1000)}s) total before closing`);

    // Write large silence padding and properly close stream
    if (playing && teeStream && !teeStream.destroyed) {
      console.log("[TTS] Writing large silence padding...");
      // Much larger silence buffer to ensure complete playback
      const silencePadding = Buffer.alloc(32768, 0); // 32KB of silence
      const paddingWritten = teeStream.write(silencePadding);
      
      if (!paddingWritten) {
        console.log("[TTS] Waiting for padding drain...");
        await new Promise(resolve => teeStream.once('drain', resolve));
      }
      
      console.log(`[TTS] All audio data written. Waiting for estimated playback duration...`);
      setTimeout(() => {
        if (playing && teeStream && !teeStream.destroyed) {
          console.log("[TTS] Estimated playback complete - closing stream...");
          teeStream.end();
        } else {
          console.log("[TTS] Stream already closed or not playing");
        }
      }, totalWaitTime);
    }

    playProc.on("exit", (code, signal) => {
      console.log(`[TTS] ffmpeg process exited with code ${code}, signal ${signal}`);
      playing = false;
      teeStream = null;
      playProc = null;
      setTimeout(() => autoRoute(beforeIds), 100);
    });

    playProc.on("error", (error) => {
      console.error("[TTS] ffmpeg process error:", error);
      playing = false;
    });

    lastBot = answer;
  } catch (e) {
    console.error("[TTS]", e.message);
    playing = false;
  }
}

export function startPipeline() {
  if (isPipelineRunning()) {
    console.log("[pipeline] Already running; ignoring start request");
    return;
  }
  clearSttTimer();
  capProc = spawn("ffmpeg", [
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

  startSttStream();

  async function handleSttData(d) {
    const txt = d.results?.[0]?.alternatives?.[0]?.transcript?.trim();
    if (!txt) return;

    /* ----- interruption handler ----- */
    if (d.results[0].isFinal && playing) {
      const isEcho = looksLikeEcho(txt, lastBot);
      console.log(`[DEBUG] Final transcript: "${txt}", isEcho: ${isEcho}, lastBot: "${lastBot}"`);
      
      if (!isEcho && txt.length > 2) { // Only interrupt for non-echo, substantial input
        console.log("\n[INTERRUPT] user spoke:", txt);
        console.log("[INTERRUPT] Stopping current playback...");
        if (playProc) {
          console.log("[INTERRUPT] Killing ffmpeg process");
          playProc.kill("SIGKILL");
        }
        if (teeStream) {
          console.log("[INTERRUPT] Ending stream");
          teeStream.end();
        }
        playing = false;
        // fall through to treat txt as new question
      } else {
        console.log(`[DEBUG] Ignoring: ${isEcho ? 'echo detected' : 'too short'}`);
        return; // Don't process echoes or very short inputs
      }
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
      answer = await processQuestion(txt);
      answer = answer.trim();
      console.log(`🤖 ${answer}\n`);
    } catch (e) {
      console.error("[Groq]", e.message);
      return;
    }

    /* ---------- Streaming-chunk TTS ---------- */
    try {
      const sentences = answer.match(/[^.!?]+[.!?]?/g)?.map((s) => s.trim()) || [answer];
      const beforeIds = sinkInputs()
        .split("\n")
        .map((l) => l.split(/\s+/)[0]);

      teeStream = new PassThrough();
      playProc = spawn("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-f",
        "pulse",
        "-stream_name",
        "salesai-tts",
        "-flush_packets",
        "1",
        "-fflags",
        "+flush_packets",
        LOOPBACK_SINK,
      ]);
      
      console.log("[TTS] Starting ffmpeg process, PID:", playProc.pid);
      teeStream.pipe(playProc.stdin).on("error", () => {});
      if (LOCAL_MONITOR === "1") {
        const tap = spawn("paplay", ["--device", "@DEFAULT_SINK@", "-"]);
        teeStream.pipe(tap.stdin).on("error", () => {});
      }

      playing = true;
      let totalAudioBytes = 0;

      for (let i = 0; i < sentences.length && playing; i++) {
        const piece = sentences[i];
        if (!piece) continue;
        console.log(`[TTS] Processing chunk ${i + 1}/${sentences.length}: "${piece}"`);
        
        try {
          const { data } = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}`,
            { text: piece, model_id: "eleven_flash_v2_5" },
            {
              responseType: "arraybuffer",
              headers: { "xi-api-key": ELEVEN_API_KEY },
            },
          );
          
          if (playing && teeStream && !teeStream.destroyed) {
            const audioBuffer = Buffer.from(data);
            totalAudioBytes += audioBuffer.length;
            console.log(`[TTS] Writing audio chunk ${i + 1}, size: ${audioBuffer.length} bytes`);
            
            // Write the audio data and wait for it to be processed
            const writeSuccessful = teeStream.write(audioBuffer);
            if (!writeSuccessful) {
              console.log(`[TTS] Waiting for drain on chunk ${i + 1}...`);
              await new Promise(resolve => teeStream.once('drain', resolve));
            }
            
            // No delay between chunks to maintain audio continuity
            console.log(`[TTS] Chunk ${i + 1} written successfully`);
          } else {
            console.log(`[TTS] Skipping chunk ${i + 1} - not playing or stream destroyed`);
          }
        } catch (error) {
          console.error(`[TTS] Error processing chunk ${i + 1}:`, error.message);
        }
      }
      
      console.log(`[TTS] Finished processing all ${sentences.length} chunks`);
      
      // Calculate estimated audio duration based on total bytes
      // ElevenLabs returns MP3 audio, typically ~12-14KB per second for speech
      // Being more conservative with 10KB per second to ensure we don't cut off
      const estimatedDurationMs = (totalAudioBytes / 10000) * 1000;
      const BUFFER_MS = 30000; // 30 second buffer after audio ends (further increased)
      const totalWaitTime = Math.max(estimatedDurationMs + BUFFER_MS, 45000); // minimum 45 seconds
      
      console.log(`[TTS] Total audio size: ${totalAudioBytes} bytes`);
      console.log(`[TTS] Estimated duration: ${Math.round(estimatedDurationMs)}ms (${Math.round(estimatedDurationMs/1000)}s)`);
      console.log(`[TTS] Will wait ${Math.round(totalWaitTime)}ms (${Math.round(totalWaitTime/1000)}s) total before closing`);

      // Write large silence padding and properly close stream
      if (playing && teeStream && !teeStream.destroyed) {
        console.log("[TTS] Writing large silence padding...");
        // Much larger silence buffer to ensure complete playback
        const silencePadding = Buffer.alloc(32768, 0); // 32KB of silence
        const paddingWritten = teeStream.write(silencePadding);
        
        if (!paddingWritten) {
          console.log("[TTS] Waiting for padding drain...");
          await new Promise(resolve => teeStream.once('drain', resolve));
        }
        
        console.log(`[TTS] All audio data written. Waiting for estimated playback duration...`);
        setTimeout(() => {
          if (playing && teeStream && !teeStream.destroyed) {
            console.log("[TTS] Estimated playback complete - closing stream...");
            teeStream.end();
          } else {
            console.log("[TTS] Stream already closed or not playing");
          }
        }, totalWaitTime);
      }

      playProc.on("exit", (code, signal) => {
        console.log(`[TTS] ffmpeg process exited with code ${code}, signal ${signal}`);
        playing = false;
        teeStream = null;
        playProc = null;
        setTimeout(() => autoRoute(beforeIds), 100);
      });

      playProc.on("error", (error) => {
        console.error("[TTS] ffmpeg process error:", error);
        playing = false;
      });

      lastBot = answer;
    } catch (e) {
      console.error("[TTS]", e.message);
      playing = false;
    }
  }
}

export function stopPipeline() {
  console.log("[pipeline] Stopping…");
  try {
    if (playProc) {
      console.log("[pipeline] Killing TTS ffmpeg");
      playProc.kill("SIGKILL");
    }
  } catch {}
  clearSttTimer();
  try {
    if (teeStream && !teeStream.destroyed) {
      console.log("[pipeline] Ending tee stream");
      teeStream.end();
    }
  } catch {}
  try {
    if (capProc) {
      console.log("[pipeline] Killing capture ffmpeg");
      capProc.kill("SIGKILL");
    }
  } catch {}
  try {
    if (sttStream) {
      console.log("[pipeline] Ending STT stream");
      sttStream.end();
      sttStream.destroy?.();
    }
  } catch {}

  playing = false;
  playProc = null;
  teeStream = null;
  capProc = null;
  sttStream = null;
  console.log("[pipeline] Stopped.");
}
