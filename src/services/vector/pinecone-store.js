import { Pinecone } from '@pinecone-database/pinecone';
import { PINECONE_API_KEY, PINECONE_INDEX_NAME, PINECONE_INDEX_HOST, PINECONE_NAMESPACE } from '../../config/env.js';

function slugify(ns) {
  return (ns || 'default')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'default';
}

export class PineconeStore {
  constructor() {
    if (!PINECONE_API_KEY) throw new Error('PINECONE_API_KEY is required');
    if (!PINECONE_INDEX_NAME) throw new Error('PINECONE_INDEX_NAME is required');
    if (!PINECONE_INDEX_HOST) throw new Error('PINECONE_INDEX_HOST is required');
    this.pc = new Pinecone({ apiKey: PINECONE_API_KEY });
    this.index = this.pc.index(PINECONE_INDEX_NAME, PINECONE_INDEX_HOST);
    this.defaultNs = slugify(PINECONE_NAMESPACE || 'kb');
  }

  namespaceForSource(source) {
    return slugify(source || this.defaultNs);
  }

  async describe() {
    try {
      return await this.index.describeIndexStats();
    } catch (e) {
      // Surface the error, caller can decide
      throw e;
    }
  }

  async countAll() {
    const desc = await this.describe();
    const ns = desc?.namespaces || {};
    return Object.values(ns).reduce((sum, v) => sum + (v?.vectorCount || 0), 0);
  }

  async listNamespaces() {
    const desc = await this.describe();
    return Object.keys(desc?.namespaces || {});
  }

  async addDocuments(docs, embedder) {
    if (!Array.isArray(docs) || !docs.length) return 0;
    if (!embedder || typeof embedder.embedTexts !== 'function') throw new Error('embedder.embedTexts is required');

    // Group by source -> namespace
    const groups = new Map();
    for (const d of docs) {
      const source = d.meta?.source || d.source || 'unknown';
      const ns = this.namespaceForSource(source);
      if (!groups.has(ns)) groups.set(ns, []);
      groups.get(ns).push(d);
    }

    let total = 0;
    for (const [ns, group] of groups) {
      const texts = group.map(g => g.text || '');
      console.log('[RAG][index] namespace', ns, 'texts', texts.length);
      let embeddings = [];
      try {
        embeddings = await embedder.embedTexts(texts);
      } catch (e) {
        console.warn('[RAG][index] embedTexts error:', e?.message || e);
        embeddings = [];
      }
      if (!Array.isArray(embeddings)) {
        console.warn('[RAG][index] invalid embeddings payload; skipping namespace', ns);
        continue;
      }
      if (embeddings.length !== texts.length) {
        console.warn('[RAG][index] embeddings/texts length mismatch', embeddings.length, '/', texts.length, 'namespace', ns);
      }
      const vectors = embeddings.map((e, i) => ({
        id: group[i].id,
        values: e,
        metadata: {
          source: group[i].meta?.source || group[i].source || 'unknown',
          chunk: group[i].meta?.chunk ?? group[i].chunk ?? 0,
          // optionally include text to enable inspection in UI
          text: group[i].text || '',
        },
      }));
      if (!vectors.length) {
        console.warn('[RAG][index] no vectors to upsert for namespace', ns);
        continue;
      }
      try {
        await this.index.namespace(ns).upsert(vectors);
        console.log('[RAG][index] upserted', vectors.length, 'vectors to', ns);
      } catch (e) {
        console.warn('[RAG][index] upsert error for namespace', ns, e?.message || e);
      }
      total += vectors.length;
    }
    return total;
  }

  async topK(queryEmbedding, k = 4, opts = {}) {
    if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) return [];
    const { sources } = opts || {};
    const namespaces = Array.isArray(sources) && sources.length
      ? sources.map(s => this.namespaceForSource(s))
      : await this.listNamespaces();

    if (!namespaces.length) return [];

    const perNamespace = await Promise.all(
      namespaces.map(async (ns) => {
        try {
          const res = await this.index.namespace(ns).query({
            topK: k,
            vector: queryEmbedding,
            includeMetadata: true,
          });
          const matches = res?.matches || [];
          console.log('[RAG][query] ns', ns, 'k', k, 'matches', matches.length);
          return matches.map((m) => ({
            id: m.id,
            score: Number(m.score || 0),
            text: m?.metadata?.text || '',
            meta: { source: m?.metadata?.source || ns, chunk: m?.metadata?.chunk },
          }));
        } catch (e) {
          // Namespace might be empty; continue
          return [];
        }
      }),
    );

    const results = perNamespace.flat();
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  async deleteNamespace(ns) {
    try {
      if (!ns) return false;
      // Try deleteAll (new SDK)
      if (typeof this.index.namespace(ns).deleteAll === 'function') {
        await this.index.namespace(ns).deleteAll();
        console.log('[RAG][delete] cleared namespace', ns);
        return true;
      }
      // Fallback to delete({ deleteAll: true })
      if (typeof this.index.namespace(ns).delete === 'function') {
        await this.index.namespace(ns).delete({ deleteAll: true });
        console.log('[RAG][delete] cleared namespace (fallback)', ns);
        return true;
      }
      console.warn('[RAG][delete] no delete method available for namespace', ns);
      return false;
    } catch (e) {
      console.warn('[RAG][delete] error clearing namespace', ns, e?.message || e);
      return false;
    }
  }

  async deleteNamespaces(namespaces = []) {
    if (!Array.isArray(namespaces) || !namespaces.length) return 0;
    let ok = 0;
    for (const ns of namespaces) {
      const done = await this.deleteNamespace(ns);
      if (done) ok += 1;
    }
    return ok;
  }
}
