import { ChatGroq } from "@langchain/groq";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { GROQ_API_KEY } from "../config/env.js";

// Create a dedicated LLM instance for profile generation
const llm = new ChatGroq({ apiKey: GROQ_API_KEY, model: "llama-3.3-70b-versatile" });

function contentToString(output) {
  if (!output) return '';
  if (typeof output === 'string') return output;
  // LangChain AIMessage
  const c = output.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c.map((p) => {
      if (!p) return '';
      if (typeof p === 'string') return p;
      if (typeof p.text === 'string') return p.text;
      if (typeof p.content === 'string') return p.content;
      return '';
    }).join(' ').trim();
  }
  try { return String(c || output); } catch { return ''; }
}

function extractUsageFromResponse(res) {
  const out = { prompt: null, completion: null, total: null };
  if (!res) return out;
  try {
    const rm = res.response_metadata || res.responseMetadata || res.additional_kwargs || {};
    const u = rm.usage || rm.token_usage || rm.tokenUsage || rm.usage_metadata || rm.usageMetadata || {};
    const flat = { ...rm, ...u };
    const keys = (k) => Object.keys(flat).find((x) => x.toLowerCase() === k);
    const get = (k) => {
      const kk = keys(k);
      return kk != null ? Number(flat[kk]) || null : null;
    };
    // common candidates
    out.prompt = get('prompt_tokens') ?? get('input_tokens') ?? get('prompttoken') ?? get('prompttokencount') ?? null;
    out.completion = get('completion_tokens') ?? get('output_tokens') ?? get('completiontoken') ?? get('completetokencount') ?? null;
    out.total = get('total_tokens') ?? ((out.prompt != null && out.completion != null) ? out.prompt + out.completion : null);
  } catch {}
  return out;
}

function cap(text = "", max = 14000) {
  if (!text) return "";
  const s = text.toString();
  return s.length > max ? s.slice(0, max) + "\n... [truncated]" : s;
}

function aggregateKB(pages = []) {
  if (!Array.isArray(pages) || !pages.length) return "";
  // Prefer home/about/product/solutions/pricing pages near the top
  const score = (p) => {
    const u = (() => { try { return new URL(p.url || ""); } catch { return null; } })();
    const path = (u?.pathname || "/").toLowerCase();
    let s = 0;
    if (path === "/") s += 5;
    if (/about|company|who-?we-?are/.test(path)) s += 4;
    if (/product|platform|solution|features/.test(path)) s += 3;
    if (/pricing|plans/.test(path)) s += 2;
    // Shorter paths first
    s += Math.max(0, 6 - (path.split("/").length));
    return s;
  };
  const sorted = pages.slice().sort((a, b) => score(b) - score(a));
  const pick = sorted.slice(0, 6);
  return pick
    .map((p, i) => [
      `# Page ${i + 1}: ${p.title || "(untitled)"}`,
      `URL: ${p.url || ""}`,
      cap(p.content || "", 5000),
    ].join("\n"))
    .join("\n\n---\n\n");
}

function extractJSON(text = "") {
  const s = text.toString().trim();
  // Try a direct parse first
  try { return JSON.parse(s); } catch {}
  // Fallback: find the first JSON object in text
  const m = s.match(/\{[\s\S]*\}/);
  if (m) {
    const chunk = m[0];
    try { return JSON.parse(chunk); } catch {}
  }
  return null;
}

export async function generateAssistantProfileFromKB(kbPages = [], opts = {}) {
  if (!Array.isArray(kbPages) || !kbPages.length) {
    throw new Error("Missing kbPages");
  }
  const { companyUrl } = opts || {};
  const context = aggregateKB(kbPages);

  const system = `You transform website content into three short fields used to configure an AI SDR. Work only with the provided KB content. Do not invent facts. Write clearly and concisely in neutral US English.`;

  const user = `KB EXTRACT:\n\n${context}\n\nINSTRUCTIONS:\n- From this KB content, make a company bio, a sales intent, and success criteria.\n- Company Bio (2–4 sentences): what the company does, who it serves, and key differentiation — based strictly on KB content.\n- Sales Intent (3–5 sentences): what the AI should achieve on first-touch calls (discovery focus, qualify, guide to next step).\n- Success Criteria: short paragraph or 3–6 semicolon-separated outcomes (e.g., demo booked; trial started).\n- No markdown. No bullet characters in fields.\n- If the KB is thin, keep statements conservative and generic for B2B, without fabricating specifics.\n- Keep company naming consistent (${companyUrl || 'the company'}).\n\nRESPONSE FORMAT (JSON only):\n{\n  "bio": string,\n  "intent": string,\n  "success": string\n}`;

  // Build messages directly to avoid LangChain template placeholder parsing of braces
  const messages = [
    new SystemMessage(system),
    new HumanMessage(user),
  ];

  // Try up to 2 times to get valid JSON
  let json = null;
  let lastContent = '';
  let usage = { prompt: null, completion: null, total: null };
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await llm.invoke(messages);
    usage = extractUsageFromResponse(res) || usage;
    lastContent = contentToString(res);
    json = extractJSON(lastContent);
    if (json && typeof json === 'object') break;
  }
  // Fallback approximation if provider didn't return usage
  try {
    if (usage.prompt == null) usage.prompt = Math.ceil((system.length + user.length) / 4);
    if (usage.completion == null) usage.completion = Math.ceil((lastContent.length || 0) / 4);
    if (usage.total == null && usage.prompt != null && usage.completion != null) usage.total = usage.prompt + usage.completion;
  } catch {}
  if (!json || typeof json !== 'object') {
    const err = new Error("Model did not return JSON");
    err.detail = lastContent?.slice?.(0, 400) || '';
    throw err;
  }
  const bio = (json.bio || "").toString().trim();
  const intent = (json.intent || "").toString().trim();
  const success = (json.success || "").toString().trim();
  return { bio, intent, success, _usage: usage };
}

// (Removed refineAssistantProfile since autofill is AI-only and direct from KB)
