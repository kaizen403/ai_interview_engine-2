import "dotenv/config";

// Required environment variables
const USE_CONTAINER_AUDIO = process.env.USE_CONTAINER_AUDIO === "true";

const need = [
  "MEET_URL",
  "GROQ_API_KEY",
  "ELEVEN_API_KEY",
  "ELEVEN_VOICE_ID",
];

for (const k of need) if (!process.env[k]) throw new Error(`Set ${k} in .env`);

const STT_MONITOR =
  process.env.STT_MONITOR ||
  (USE_CONTAINER_AUDIO ? "stt_sink.monitor" : undefined);
const LOOPBACK_SINK =
  process.env.LOOPBACK_SINK ||
  (USE_CONTAINER_AUDIO ? "loopback_sink" : undefined);
const VIRTUAL_MIC = process.env.VIRTUAL_MIC || "salesai_mic";

if (!STT_MONITOR) {
  throw new Error(
    "Set STT_MONITOR in .env or run with USE_CONTAINER_AUDIO=true for container defaults.",
  );
}

if (!LOOPBACK_SINK) {
  throw new Error(
    "Set LOOPBACK_SINK in .env or run with USE_CONTAINER_AUDIO=true for container defaults.",
  );
}

export const {
  MEET_URL,
  GROQ_API_KEY,
  ELEVEN_API_KEY,
  ELEVEN_VOICE_ID,
  LOCAL_MONITOR,
} = process.env;

export { USE_CONTAINER_AUDIO, STT_MONITOR, LOOPBACK_SINK, VIRTUAL_MIC };

// Optional RAG-related environment variables
export const {
  RAG_ENABLED = '0',
  KB_DIR = 'knowledge_base',
  PINECONE_API_KEY,
  PINECONE_EMBED_MODEL = 'llama-text-embed-v2',
  PINECONE_INPUT_TYPE = 'passage',
  PINECONE_INDEX_NAME,
  PINECONE_INDEX_HOST,
  PINECONE_NAMESPACE = 'kb',
} = process.env;
