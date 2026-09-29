/** Esquema de salida (subconjunto OpenAPI que entiende Gemini: OBJECT, ARRAY, STRING, INTEGER, NUMBER, BOOLEAN). */
export type OutSchema = Record<string, unknown>;

export interface AiProvider {
  name: string;
  /** Genera JSON que cumple `schema`. Lanza `AiError` con un mensaje para personas. */
  generateJson(o: { system: string; prompt: string; schema: OutSchema }): Promise<{ data: unknown; tokens: number }>;
  /** Vectores para buscar en los documentos. */
  embed(texts: string[], kind: "document" | "query"): Promise<number[][]>;
}

export class AiError extends Error {
  constructor(
    public code: "quota" | "unavailable" | "bad_output" | "disabled",
    message: string,
  ) {
    super(message);
  }
}
