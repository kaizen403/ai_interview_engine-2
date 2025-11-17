import { ChatGroq } from "@langchain/groq";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { GROQ_API_KEY } from "../config/env.js";
import { conversationMemory } from "./memory.js";
import * as defaultProfile from "../config/profile.js";
import { isRagReady, retrieveContext } from "./rag.js";

// Dynamic profile that can be overridden via API
let currentProfile = {
  COMPANY_BIO: defaultProfile.COMPANY_BIO,
  SALES_INTENT: defaultProfile.SALES_INTENT,
  SUCCESS_CRITERIA: defaultProfile.SUCCESS_CRITERIA,
  AGENDA: Array.isArray(defaultProfile.AGENDA) ? [...defaultProfile.AGENDA] : [],
};

export function setProfile({ companyBio, salesIntent, successCriteria, agenda } = {}) {
  if (companyBio) currentProfile.COMPANY_BIO = companyBio;
  if (salesIntent) currentProfile.SALES_INTENT = salesIntent;
  if (successCriteria) currentProfile.SUCCESS_CRITERIA = successCriteria;
  if (agenda) {
    if (Array.isArray(agenda)) {
      const cleaned = agenda
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length);
      currentProfile.AGENDA = cleaned;
    } else if (typeof agenda === "string" && agenda.trim()) {
      currentProfile.AGENDA = [agenda.trim()];
    }
  }
}

export function resetProfile() {
  currentProfile = {
    COMPANY_BIO: defaultProfile.COMPANY_BIO,
    SALES_INTENT: defaultProfile.SALES_INTENT,
    SUCCESS_CRITERIA: defaultProfile.SUCCESS_CRITERIA,
    AGENDA: Array.isArray(defaultProfile.AGENDA) ? [...defaultProfile.AGENDA] : [],
  };
}

function buildSystemPrompt() {
  const { COMPANY_BIO, SALES_INTENT, SUCCESS_CRITERIA, AGENDA } = currentProfile;
  const agendaBlock =
    Array.isArray(AGENDA) && AGENDA.length
      ? `\nPriority agenda for this conversation:\n${AGENDA.map(
          (item, idx) => `${idx + 1}. ${item}`,
        ).join("\n")}\n`
      : "";
  return `You are Chris, a virtual sales representative for ${COMPANY_BIO}.

Mission: ${SALES_INTENT}
Success definition: ${SUCCESS_CRITERIA}
${agendaBlock}

Apply the principles from Tom Hopkins' "How to Master the Art of Selling":
• Build rapport quickly through empathy and mirroring language.
• Ask open-ended, qualifying questions to uncover needs.
• Present benefits tailored to the prospect’s stated goals.
• Handle objections with feel-felt-found and social proof.
• Close confidently, always asking for the next commitment.

RESPONSE STYLE GUIDELINES:
• Keep most responses short and interactive (1–2 sentences).
• Use longer explanations only for complex features or detailed objections.
• Mention the company name only in the opening; avoid repeating it mid-conversation.
• Keep the tone casual yet professional ("chill").`;
}
// Create the Groq LLM instance
const llm = new ChatGroq({ apiKey: GROQ_API_KEY, model: "llama-3.3-70b-versatile" });

// Core function used by the pipeline to process each user utterance
export async function processQuestion(question, opts = {}) {
  const { extraContext, sources } = opts || {};
  // Store user message in memory
  conversationMemory.addMessage("user", question);

  // Build context from recent conversation
  const context = conversationMemory.getContext();

  // Compose full prompt with context (RAG + any provided extraContext)
  let ragBlock = "";
  const cleanedSources = Array.isArray(sources)
    ? sources.map((s) => (s ?? "").toString()).filter((s) => s)
    : undefined;
  const shouldUseRag =
    isRagReady() && (cleanedSources === undefined || cleanedSources.length > 0);
  try {
    if (shouldUseRag) {
      const ctx = await retrieveContext(
        question,
        undefined,
        undefined,
        cleanedSources ? { sources: cleanedSources } : undefined,
      );
      if (ctx) ragBlock = `\n\nKNOWLEDGE BASE CONTEXT:\n${ctx}`;
    }
  } catch (e) {
    // Non-fatal: continue without RAG context
    console.warn("[RAG] retrieval error:", e?.message || e);
  }

  const extra = extraContext ? `\n\nREFERENCE MATERIAL (selected):\n${extraContext}` : "";
  const promptWithContext = `${buildSystemPrompt()}\n\nRECENT CONVERSATION:\n${context}${extra}\n\nRespond as an expert sales representative to progress the conversation toward the next step.`;
  const finalSystem = `${promptWithContext}${ragBlock}`;

  // Create a temporary prompt template for this invocation
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", finalSystem],
    ["user", question],
  ]);

  try {
    const response = await prompt.pipe(llm).invoke({ question });
    const answer = typeof response === "string" ? response : response.content;

    // Store bot response in memory
    conversationMemory.addMessage("assistant", answer);

    return answer;
  } catch (error) {
    console.error("[LLM Error]", error);
    throw error;
  }
}
