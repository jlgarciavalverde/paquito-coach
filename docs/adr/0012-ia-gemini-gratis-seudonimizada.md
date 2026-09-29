# 0012 — IA con Gemini (plan gratuito), documentos del entrenador y seudonimización
- **Estado**: aceptada · **Fecha**: 2026-09-29
## Contexto
Paquito quiere generar entrenos, programas y dietas con IA «gratis e ilimitada» a partir de sus documentos. No hay IA
gratuita e ilimitada de calidad: el servidor casero no tiene GPU (un modelo local tardaría minutos y lo calentaría) y los
planes gratuitos en la nube tienen límites diarios. El usuario eligió **Gemini en su plan gratuito**, que puede usar lo
enviado para mejorar los productos de Google.
## Decisión
- Proveedor detrás de una interfaz (`lib/ai/provider.ts`); `gemini.ts` usa `generateContent` con `responseMimeType:
  application/json` + `responseSchema` y `batchEmbedContents` (`gemini-embedding-001`, 768 dimensiones). Modelo configurable
  (`GEMINI_MODEL`). Sin clave → desactivada. Demo y e2e → respuestas fijas (`canned.ts`, `AI_FAKE=1`).
- **Qué se envía**: sus documentos (su material; se le pide que no suba datos de clientes) y, del cliente, solo contexto
  seudonimizado (`anonymize.ts`): edad por tramos, objetivo y lesiones (estas solo si marca la casilla) sin nombre, correo,
  teléfono ni enlaces, y sus 1RM estimados. Nunca notas privadas, check-ins, mensajes ni fotos. Aviso en la UI y en `/privacidad`.
- **Documentos**: se guarda el texto extraído (PDF con `unpdf`, Word con `mammoth`, texto), troceado (~3.500 caracteres) con
  embeddings en `real[]`; búsqueda por coseno en la API (cientos de trozos; sin pgvector para no cambiar la imagen de Postgres).
- **La IA propone, el entrenador decide**: la salida se valida con los esquemas de la app (`RoutineBody`, `MealPlanBody`,
  `ProgramBody`), los ejercicios se emparejan con la biblioteca (los que no existen se listan) y todo se abre como borrador en los
  editores de siempre. Nada llega al cliente sin guardar.
- Límite propio por estudio y día (`AI_DAILY_LIMIT`, tabla `ai_usage`) además de los de Google; 429 con mensaje claro.
## Consecuencias
Coste 0 € con límites; si se queda corto o se quiere más privacidad, se cambia a un proveedor de pago implementando la misma interfaz.
