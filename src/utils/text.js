// Text helper utilities

export function wordSet(s) {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z ]+/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
}

export function looksLikeEcho(transcript, lastReply) {
  if (!lastReply) return false;
  const a = wordSet(transcript);
  const b = wordSet(lastReply);
  let same = 0;
  a.forEach((w) => (b.has(w) ? same++ : 0));
  return same / Math.max(a.size, 1) > 0.6; // ≥60 % overlap = echo
}
