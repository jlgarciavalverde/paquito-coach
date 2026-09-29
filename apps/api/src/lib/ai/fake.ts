import type { AiProvider } from "./provider";

/** Proveedor falso para tests y la demo: responde con lo que le digas y vectores deterministas. */
export function createFakeAi(respond: (prompt: string, system: string) => unknown): AiProvider & { calls: { prompt: string; system: string }[] } {
  const calls: { prompt: string; system: string }[] = [];
  const vec = (t: string) => {
    const v = new Array(16).fill(0);
    for (const w of t.toLowerCase().split(/\W+/).filter(Boolean)) v[[...w].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 16]! += 1;
    return v;
  };
  return {
    name: "fake",
    calls,
    async generateJson({ system, prompt }) {
      calls.push({ prompt, system });
      return { data: respond(prompt, system), tokens: 100 };
    },
    async embed(texts) {
      return texts.map(vec);
    },
  };
}
