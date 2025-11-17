import { join, resolve } from 'path';
import { readdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';

import { RAG_ENABLED, KB_DIR } from '../config/env.js';
import { makeEmbedderFromEnv } from './embeddings/pinecone.js';
import { PineconeStore } from './vector/pinecone-store.js';

let store = null; // PineconeStore
let embedder = null;
let ready = false;
let backend = 'pinecone';

const DEFAULTS = {
  chunkSize: 800,
  chunkOverlap: 160,
  topK: 4,
  minScore: 0.3,
};

function splitIntoChunks(text, size = DEFAULTS.chunkSize, overlap = DEFAULTS.chunkOverlap) {
  if (!text) return [];
  const clean = text.replace(/\r/g, '').replace(/[\t ]+/g, ' ').trim();
  const chunks = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(clean.length, i + size);
    chunks.push(clean.slice(i, end));
    if (end === clean.length) break;
    i = end - overlap;
    if (i < 0) i = 0;
  }
  return chunks;
}

async function* walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walkFiles(full);
    } else if (/\.(md|txt|html?)$/i.test(ent.name)) {
      yield full;
    }
  }
}

export function isRagEnabled() {
  return String(RAG_ENABLED || '0') === '1';
}

export function isRagReady() {
  return ready;
}

export async function initRagFromEnv() {
  ready = false;
  if (!isRagEnabled()) {
    console.log('[RAG] Disabled via RAG_ENABLED');
    return { enabled: false };
  }

  try {
    embedder = await makeEmbedderFromEnv();
  } catch (e) {
    console.warn('[RAG] Failed to initialize embedder:', e?.message || e);
    embedder = null;
  }

  const kbDir = resolve(KB_DIR || 'knowledge_base');
  store = new PineconeStore();
  backend = 'pinecone';

  // Only report index status; indexing is now manual via API
  try {
    const count = await store.countAll();
    console.log('[RAG] (pinecone) Existing chunks:', count);
  } catch (e) {
    console.warn('[RAG] Unable to inspect Pinecone index:', e?.message || e);
  }

  ready = Boolean(embedder);
  return { enabled: true, ready, backend };
}

export async function retrieveContext(question, k = DEFAULTS.topK, minScore = DEFAULTS.minScore, opts = {}) {
  if (!ready || !store || !embedder || !question) return '';
  const { sources } = opts || {};
  let q;
  try {
    q = await embedder.embedText(question);
  } catch (e) {
    console.warn('[RAG] embedText error:', e?.message || e);
    return '';
  }
  if (!Array.isArray(q) || q.length === 0) return '';
  let top = [];
  try {
    top = await store.topK(q, k, { sources });
  } catch (e) {
    console.warn('[RAG] topK error:', e?.message || e);
    return '';
  }
  const filtered = top.filter(t => (t.score || 0) >= minScore);
  if (!filtered.length) return '';
  return filtered.map(t => `KB(${(t.score).toFixed(3)}): ${t.meta?.source || '(unknown)'}\n${t.text}`).join('\n\n');
}

export async function listKbSources() {
  if (!store) return [];
  try {
    return await store.listNamespaces();
  } catch {
    return [];
  }
}

export async function indexPages(pages = []) {
  // pages: [{ source?: string, title?: string, content: string }]
  if (!embedder || !store || !Array.isArray(pages) || !pages.length) return { added: 0 };
  const docs = [];
  for (const p of pages) {
    const source = (p.source || p.title || 'untitled').toString();
    const chunks = splitIntoChunks(p.content || '');
    chunks.forEach((text, idx) => docs.push({ id: `${source}#${idx}`, text, meta: { source, chunk: idx } }));
  }
  const n = await store.addDocuments(docs, embedder);
  return { added: n };
}

export async function unloadSources(sources = [], opts = {}) {
  if (!store) return { deleted: 0 };
  const { all = false } = opts || {};
  let namespaces = [];
  if (all) {
    try { namespaces = await store.listNamespaces(); } catch { namespaces = []; }
  } else if (Array.isArray(sources) && sources.length) {
    namespaces = sources.map((s) => store.namespaceForSource(s));
  }
  if (!namespaces.length) return { deleted: 0 };
  const deleted = await store.deleteNamespaces(namespaces);
  return { deleted, namespaces };
}
