/** Trocea un texto largo en fragmentos de ~`size` caracteres, cortando por párrafos y con un poco de solape. */
export function chunkText(text: string, size = 3500, overlap = 300): string[] {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const paras = clean.split(/\n\n/);
  const out: string[] = [];
  let cur = "";
  for (const p of paras) {
    if ((cur + "\n\n" + p).length > size && cur) {
      out.push(cur.trim());
      cur = cur.slice(-overlap) + "\n\n" + p;
    } else cur = cur ? cur + "\n\n" + p : p;
    while (cur.length > size * 1.5) {
      out.push(cur.slice(0, size).trim());
      cur = cur.slice(size - overlap);
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function topK<T extends { embedding: number[] }>(query: number[], items: T[], k: number): (T & { score: number })[] {
  return items
    .map((it) => ({ ...it, score: cosine(query, it.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
