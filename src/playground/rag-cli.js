#!/usr/bin/env node
import 'dotenv/config';
import readline from 'readline';

import { initRagFromEnv, isRagEnabled, listKbSources } from '../services/rag.js';
import { processQuestion, setProfile } from '../services/llm.js';
import { loadPersistedProfile } from '../services/profile-store.js';

async function main() {
  console.log('RAG Playground — type your questions. Ctrl+C to exit.');
  try {
    const profile = await loadPersistedProfile();
    if (profile) {
      setProfile(profile);
      console.log('[Profile] Loaded saved Control Panel profile.');
    }
  } catch (e) {
    console.warn('[Profile] Unable to load saved profile:', e?.message || e);
  }
  const rag = await initRagFromEnv();
  console.log(`[RAG] enabled=${isRagEnabled()} ready=${rag.ready === true}`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(res => rl.question(q, res));
  let selected = [];
  const help = () => {
    console.log('\nCommands:');
    console.log('  :help            Show this help');
    console.log('  :list            List KB sources');
    console.log('  :select          Select sources (comma-separated numbers)');
    console.log('  :clear           Clear selection');
    console.log('  Any other input  Send as a question');
  };
  help();

  while (true) {
    const q = (await ask('\nYou > ')).trim();
    if (!q) continue;
    if (q === ':help') { help(); continue; }
    if (q === ':clear') { selected = []; console.log('Selection cleared.'); continue; }
    if (q === ':list') {
      const sources = await listKbSources();
      if (!sources.length) { console.log('(no sources)'); continue; }
      sources.forEach((s, i) => console.log(`${i + 1}. ${s}`));
      continue;
    }
    if (q === ':select') {
      const sources = await listKbSources();
      if (!sources.length) { console.log('(no sources)'); continue; }
      sources.forEach((s, i) => console.log(`${i + 1}. ${s}`));
      const pick = (await ask('Pick (e.g., 1,3,5): ')).trim();
      const idxs = pick.split(',').map(x => Number(x.trim()) - 1).filter(x => x >= 0 && x < sources.length);
      selected = [...new Set(idxs.map(i => sources[i]))];
      console.log('Selected:', selected.join(', ') || '(none)');
      continue;
    }
    try {
      const ans = await processQuestion(q, { sources: selected });
      console.log('\nBot >', typeof ans === 'string' ? ans : ans?.content || ans);
    } catch (e) {
      console.error('Error:', e?.message || e);
    }
  }
}

main().catch((e) => {
  console.error('[playground] Fatal:', e?.message || e);
  process.exit(1);
});
