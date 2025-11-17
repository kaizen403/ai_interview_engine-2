import { Pinecone } from '@pinecone-database/pinecone';
import axios from 'axios';
import { PINECONE_API_KEY, PINECONE_EMBED_MODEL, PINECONE_INPUT_TYPE } from '../../config/env.js';

function normalize(vec) {
  if (!Array.isArray(vec)) return [];
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  return vec.map((x) => x / norm);
}

export async function makeEmbedderFromEnv() {
  if (!PINECONE_API_KEY) throw new Error('PINECONE_API_KEY is required for embeddings');
  const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
  const model = PINECONE_EMBED_MODEL || 'llama-text-embed-v2';
  const inputType = PINECONE_INPUT_TYPE || 'passage';

  const callInfer = async (texts) => {
    const arr = Array.isArray(texts) ? texts : [texts];
    const input = arr.map((t) => (t ?? '').toString());
    try {
      // Use v6 SDK signature: embed(model: string, inputs: string[], params?: { inputType: string })
      const res = await pc.inference.embed(model, input, { inputType });
      const dt = Array.isArray(res?.data) ? 'array' : typeof res?.data;
      console.log(`[RAG][embed] model=${model} inputType=${inputType} items=${input.length} data=${dt}`);
      const rows = Array.isArray(res?.data) ? res.data : [];
      if (Array.isArray(rows) && rows.length) {
        return rows.map((row) => normalize(Array.isArray(row?.values) ? row.values : Array.isArray(row) ? row : []));
      }
      console.warn('[RAG][embed] SDK returned no embeddings; trying HTTP fallback');
    } catch (e) {
      console.warn('[RAG][embed] SDK call failed:', e?.message || e);
    }

    // HTTP fallback
    try {
      const url = 'https://api.pinecone.io/inference/v1/embeddings';
      const resp = await axios.post(url, {
        model,
        input,
        parameters: { input_type: inputType },
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': process.env.PINECONE_API_KEY,
          'X-Pinecone-Api-Key': process.env.PINECONE_API_KEY,
        },
        timeout: 20000,
      });
      const data = resp?.data;
      const rows = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.embeddings)
          ? data.embeddings
          : [];
      if (!rows.length) {
        console.warn('[RAG][embed] HTTP fallback returned no embeddings');
        return [];
      }
      return rows.map((row) => normalize(Array.isArray(row?.values) ? row.values : Array.isArray(row) ? row : []));
    } catch (e) {
      console.warn('[RAG][embed] HTTP fallback failed:', e?.message || e);
      return [];
    }
  };

  return {
    name: 'pinecone-inference',
    async embedTexts(texts) { return await callInfer(texts); },
    async embedText(text) { const [v] = await callInfer([text]); return v; },
  };
}
