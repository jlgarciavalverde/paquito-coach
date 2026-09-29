import { AiError, type AiProvider, type OutSchema } from "./provider";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Gemini por su API REST (plan gratuito). En el plan gratuito Google puede usar lo enviado para mejorar sus productos:
 * por eso solo se envían los documentos del entrenador y datos del cliente seudonimizados (ver `anonymize.ts`).
 */
export function createGemini(o: { apiKey: string; model: string; embedModel: string; fetchImpl?: typeof fetch }): AiProvider {
  const f = o.fetchImpl ?? fetch;
  async function call(path: string, body: unknown) {
    let res: Response;
    try {
      res = await f(`${BASE}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": o.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
    } catch {
      throw new AiError("unavailable", "No se ha podido contactar con la IA. Inténtalo en un momento.");
    }
    if (res.status === 429) throw new AiError("quota", "Has llegado al límite gratuito de la IA por ahora. Vuelve a intentarlo más tarde (el límite se renueva cada día).");
    if (!res.ok) throw new AiError("unavailable", `La IA no ha respondido bien (${res.status}). Inténtalo de nuevo.`);
    return res.json() as Promise<Record<string, any>>;
  }
  return {
    name: `gemini:${o.model}`,
    async generateJson({ system, prompt, schema }: { system: string; prompt: string; schema: OutSchema }) {
      const r = await call(`${o.model}:generateContent`, {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.4 },
      });
      const text = r.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
      const tokens = Number(r.usageMetadata?.totalTokenCount ?? 0);
      try {
        return { data: JSON.parse(text), tokens };
      } catch {
        throw new AiError("bad_output", "La IA ha devuelto algo que no se puede usar. Prueba otra vez o cambia un poco la petición.");
      }
    },
    async embed(texts: string[], kind: "document" | "query") {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += 100) {
        const batch = texts.slice(i, i + 100);
        const r = await call(`${o.embedModel}:batchEmbedContents`, {
          requests: batch.map((t) => ({
            model: `models/${o.embedModel}`,
            content: { parts: [{ text: t }] },
            taskType: kind === "document" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY",
            outputDimensionality: 768,
          })),
        });
        for (const e of r.embeddings ?? []) out.push(e.values as number[]);
      }
      if (out.length !== texts.length) throw new AiError("unavailable", "La IA no ha podido leer el documento. Inténtalo de nuevo.");
      return out;
    },
  };
}
