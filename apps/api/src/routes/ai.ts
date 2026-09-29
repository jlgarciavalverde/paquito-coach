import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, asc, desc, eq, gte, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  AiDocument,
  AiStatus,
  AskAnswer,
  AskInput,
  EQUIPMENT_LABEL,
  GenerateMealPlanInput,
  GenerateProgramInput,
  GenerateRoutineInput,
  GeneratedMealPlan,
  GeneratedProgram,
  GeneratedRoutine,
  MealPlanBody,
  Ok,
  RoutineBody,
  type AiSource,
  type RoutineBlock,
} from "@coach/shared";
import { aiChunks, aiDocuments, aiUsage, clientProfiles, exercises, workouts } from "../db/schema";
import { HttpError, notFound } from "../lib/errors";
import { AiError, type AiProvider, type OutSchema } from "../lib/ai/provider";
import { clientContext } from "../lib/ai/anonymize";
import { chunkText, topK } from "../lib/ai/chunks";
import { extractDocText, sniffDoc } from "../lib/ai/extract";
import { exerciseSummaries, progressFromWorkouts } from "../lib/progress";
import { madridClock } from "../lib/scheduler";
import { madridInstant } from "../lib/tz";
import { requireCoach } from "../lib/session";
import { typed, type Ctx } from "./ctx";

const MAX_DOC = 20 * 1024 * 1024;
const MAX_CHARS = 400_000;
const newId = () => Math.random().toString(36).slice(2, 10);

// ── Esquemas de salida para la IA (formato sencillo; luego se convierte a los de la app) ──
const S = (type: string, extra: Record<string, unknown> = {}) => ({ type, ...extra });
const ITEM = S("OBJECT", {
  properties: {
    exercise: S("STRING", { description: "Nombre del ejercicio en español, lo más estándar posible" }),
    sets: S("INTEGER"),
    reps: S("STRING", { description: "Repeticiones o tiempo: «8-10», «30 s»" }),
    load: S("STRING", { description: "Carga: «70 kg», «70 % 1RM», «peso corporal» o vacío" }),
    effort: S("STRING", { description: "RIR o RPE: «RIR 2»" }),
    tempo: S("STRING"),
    restSeconds: S("INTEGER", { nullable: true }),
    notes: S("STRING"),
    supersetWithPrevious: S("BOOLEAN"),
  },
  required: ["exercise", "sets", "reps", "load", "effort", "notes", "supersetWithPrevious"],
});
const ROUTINE = S("OBJECT", {
  properties: {
    name: S("STRING"),
    description: S("STRING"),
    blocks: S("ARRAY", { items: S("OBJECT", { properties: { name: S("STRING"), items: S("ARRAY", { items: ITEM }) }, required: ["name", "items"] }) }),
  },
  required: ["name", "description", "blocks"],
});
const PROGRAM = S("OBJECT", {
  properties: {
    name: S("STRING"),
    description: S("STRING"),
    progressionKgPerWeek: S("NUMBER", { nullable: true, description: "Kilos a subir por semana en los ejercicios con carga en kg, o null" }),
    routines: S("ARRAY", { items: S("OBJECT", { properties: { routine: ROUTINE, weekdays: S("ARRAY", { items: S("INTEGER"), description: "1 = lunes … 7 = domingo" }) }, required: ["routine", "weekdays"] }) }),
  },
  required: ["name", "description", "routines"],
});
const MEALPLAN = S("OBJECT", {
  properties: {
    name: S("STRING"),
    notes: S("STRING"),
    kcal: S("INTEGER", { nullable: true }),
    protein: S("INTEGER", { nullable: true }),
    carbs: S("INTEGER", { nullable: true }),
    fat: S("INTEGER", { nullable: true }),
    meals: S("ARRAY", {
      items: S("OBJECT", {
        properties: {
          name: S("STRING"),
          time: S("STRING", { nullable: true, description: "HH:MM" }),
          items: S("ARRAY", { items: S("OBJECT", { properties: { food: S("STRING"), qty: S("STRING") }, required: ["food", "qty"] }) }),
          alternatives: S("STRING"),
          notes: S("STRING"),
        },
        required: ["name", "items", "alternatives", "notes"],
      }),
    }),
  },
  required: ["name", "notes", "meals"],
});
const ANSWER = S("OBJECT", { properties: { answer: S("STRING"), usedFragments: S("ARRAY", { items: S("INTEGER") }) }, required: ["answer", "usedFragments"] });

const AiItem = z.object({
  exercise: z.string(),
  sets: z.number(),
  reps: z.string().default(""),
  load: z.string().default(""),
  effort: z.string().default(""),
  tempo: z.string().nullish(),
  restSeconds: z.number().nullish(),
  notes: z.string().default(""),
  supersetWithPrevious: z.boolean().default(false),
});
const AiRoutine = z.object({ name: z.string(), description: z.string().default(""), blocks: z.array(z.object({ name: z.string().default(""), items: z.array(AiItem) })) });
const AiProgram = z.object({ name: z.string(), description: z.string().default(""), progressionKgPerWeek: z.number().nullish(), routines: z.array(z.object({ routine: AiRoutine, weekdays: z.array(z.number()) })) });
const AiMealPlan = z.object({
  name: z.string(),
  notes: z.string().default(""),
  kcal: z.number().nullish(),
  protein: z.number().nullish(),
  carbs: z.number().nullish(),
  fat: z.number().nullish(),
  meals: z.array(z.object({ name: z.string(), time: z.string().nullish(), items: z.array(z.object({ food: z.string(), qty: z.string().default("") })), alternatives: z.string().default(""), notes: z.string().default("") })),
});
const AiAnswer = z.object({ answer: z.string(), usedFragments: z.array(z.number()).default([]) });

const SYSTEM = `Eres el asistente de un entrenador personal graduado en Ciencias de la Actividad Física y del Deporte, especialista en fuerza y readaptación de lesiones.
Escribes en español de España, con términos técnicos correctos y sin relleno.
Te basas ANTE TODO en los fragmentos de su metodología que se te dan (son sus documentos); si no cubren algo, usa la evidencia científica actual y sé prudente.
Nunca inventes datos del cliente. Si hay lesiones o limitaciones, adapta la selección de ejercicios y la carga, y dilo en las notas.
Lo que propones es un BORRADOR que el entrenador revisará antes de usarlo.`;

/** I1: IA con los documentos del entrenador. La IA propone borradores; el entrenador decide. */
export function registerAi(app: FastifyInstance, { db, cfg }: Ctx, deps: { ai: AiProvider | null }) {
  const api = typed(app);
  const ai = deps.ai;

  const todayStart = () => madridInstant(madridClock(new Date()).date, 0);
  async function usedToday(studioId: string) {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(aiUsage).where(and(eq(aiUsage.studioId, studioId), gte(aiUsage.createdAt, todayStart())));
    return r?.n ?? 0;
  }
  async function guard(studioId: string) {
    if (!ai) throw new HttpError(409, "ai_off", cfg.demoMode ? "La IA no está disponible en la demo." : "La IA no está configurada todavía (falta la clave de Gemini en el servidor).");
    if ((await usedToday(studioId)) >= cfg.aiDailyLimit) throw new HttpError(429, "ai_limit", `Hoy ya has hecho ${cfg.aiDailyLimit} peticiones a la IA. Mañana se renueva.`);
    return ai;
  }
  const record = (studioId: string, kind: string, tokens: number) => db.insert(aiUsage).values({ studioId, kind, tokens });
  const wrap = async <T>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof AiError) throw new HttpError(e.code === "quota" ? 429 : 503, `ai_${e.code}`, e.message);
      throw e;
    }
  };

  /** Fragmentos de sus documentos más relacionados con la petición. */
  async function retrieve(p: AiProvider, studioId: string, query: string, k = 6) {
    const chunks = await db
      .select({ id: aiChunks.id, text: aiChunks.text, embedding: aiChunks.embedding, documentId: aiChunks.documentId, title: aiDocuments.title })
      .from(aiChunks)
      .innerJoin(aiDocuments, eq(aiDocuments.id, aiChunks.documentId))
      .where(eq(aiChunks.studioId, studioId));
    if (chunks.length === 0) return [];
    const [q] = await p.embed([query], "query");
    return topK(q!, chunks, k).filter((c) => c.score > 0.2);
  }
  const fragmentsText = (fs: { title: string; text: string }[]) =>
    fs.length ? fs.map((f, i) => `[${i + 1}] (de «${f.title}»)\n${f.text}`).join("\n\n---\n\n") : "(El entrenador aún no ha subido documentos: usa criterios generales de buena práctica.)";
  const sourcesOf = (fs: { documentId: string; title: string; text: string }[], used?: number[]): AiSource[] =>
    (used?.length ? used.map((i) => fs[i - 1]).filter(Boolean) : fs.slice(0, 3)).map((f) => ({ documentId: f!.documentId, title: f!.title, excerpt: f!.text.slice(0, 240).trim() + (f!.text.length > 240 ? "…" : "") }));

  async function clientBlock(studioId: string, clientId: string | null, includeHealth: boolean) {
    if (!clientId) return "Sin cliente concreto (plan general).";
    const [c] = await db.select().from(clientProfiles).where(and(eq(clientProfiles.id, clientId), eq(clientProfiles.studioId, studioId)));
    if (!c) throw notFound("Cliente");
    const done = await db
      .select({ id: workouts.id, date: workouts.date, blocks: workouts.blocks, log: workouts.log })
      .from(workouts)
      .where(and(eq(workouts.clientId, c.id), eq(workouts.status, "done"), isNotNull(workouts.completedAt)));
    const loads = exerciseSummaries(progressFromWorkouts(done)).map((e) => ({ exercise: e.exerciseName, e1rm: e.lastE1rm }));
    return clientContext({ name: c.name, birthDate: c.birthDate, goal: c.goal, healthNotes: c.healthNotes, includeHealth, loads });
  }

  /** Empareja un nombre de ejercicio con la biblioteca (los propios primero; si no, recortando palabras). */
  async function matchExercise(studioId: string, name: string) {
    const words = name.toLowerCase().replace(/[()«»"]/g, " ").split(/\s+/).filter((w) => w.length > 1);
    for (let n = words.length; n >= Math.min(2, words.length); n--) {
      const q = words.slice(0, n).join(" ");
      const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
      const [r] = await db
        .select({ id: exercises.id, name: exercises.name })
        .from(exercises)
        .where(and(isNull(exercises.archivedAt), or(isNull(exercises.studioId), eq(exercises.studioId, studioId)), or(ilike(exercises.name, like), sql`array_to_string(${exercises.aliases}, ' ') ilike ${like}`)))
        .orderBy(sql`${exercises.studioId} is null`, sql`${exercises.name} ilike ${like} desc`, sql`length(${exercises.name})`, asc(exercises.name))
        .limit(1);
      if (r) return r;
    }
    return null;
  }
  async function toRoutine(studioId: string, r: z.infer<typeof AiRoutine>, unmatched: string[]): Promise<z.infer<typeof RoutineBody>> {
    const blocks: RoutineBlock[] = [];
    let g = 0;
    for (const b of r.blocks.slice(0, 12)) {
      const items: RoutineBlock["items"] = [];
      for (const it of b.items.slice(0, 30)) {
        const ex = await matchExercise(studioId, it.exercise);
        if (!ex) {
          unmatched.push(it.exercise);
          continue;
        }
        let group: string | null = null;
        const prev = items.at(-1);
        if (it.supersetWithPrevious && prev) {
          prev.group ??= `s${++g}`;
          group = prev.group;
        }
        items.push({
          id: "i-" + newId(),
          exerciseId: ex.id,
          exerciseName: ex.name,
          sets: Math.max(1, Math.min(20, Math.round(it.sets) || 3)),
          reps: it.reps.slice(0, 20),
          load: it.load.slice(0, 30),
          effort: it.effort.slice(0, 20),
          tempo: (it.tempo ?? "").slice(0, 12),
          restSec: it.restSeconds != null ? Math.max(0, Math.min(900, Math.round(it.restSeconds))) : null,
          notes: it.notes.slice(0, 300),
          group,
        });
      }
      if (items.length) blocks.push({ id: "b-" + newId(), name: b.name.slice(0, 60), items });
    }
    return RoutineBody.parse({ name: r.name.slice(0, 100) || "Rutina", description: r.description.slice(0, 1000), blocks });
  }
  const equipmentText = (eq_: string[]) => (eq_.length ? `Material disponible: ${eq_.map((e) => EQUIPMENT_LABEL[e as keyof typeof EQUIPMENT_LABEL]).join(", ")}.` : "Material: el de un estudio de fuerza completo.");

  // ── Estado y documentos ──
  api.get("/ai/status", { schema: { tags: ["ia"], response: { 200: AiStatus } } }, async (req) => {
    const u = requireCoach(req);
    const [d] = await db.select({ n: sql<number>`count(*)::int` }).from(aiDocuments).where(and(eq(aiDocuments.studioId, u.studioId), eq(aiDocuments.status, "ready")));
    return { enabled: Boolean(ai), provider: ai?.name ?? "ninguno", usedToday: await usedToday(u.studioId), dailyLimit: cfg.aiDailyLimit, documents: d?.n ?? 0 };
  });
  api.get("/ai/documents", { schema: { tags: ["ia"], response: { 200: z.array(AiDocument) } } }, async (req) => {
    const u = requireCoach(req);
    const rows = await db
      .select({ d: aiDocuments, chunks: sql<number>`(select count(*)::int from ai_chunks c where c.document_id = ${aiDocuments.id})` })
      .from(aiDocuments)
      .where(eq(aiDocuments.studioId, u.studioId))
      .orderBy(desc(aiDocuments.createdAt));
    return rows.map(({ d, chunks }) => ({ id: d.id, title: d.title, kind: d.kind, status: d.status, error: d.error, chunks, chars: d.chars, createdAt: d.createdAt.toISOString() }));
  });
  api.post(
    "/ai/documents",
    { schema: { tags: ["ia"], response: { 200: AiDocument } }, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req: FastifyRequest) => {
      const u = requireCoach(req);
      const p = await guard(u.studioId);
      const file = await req.file({ limits: { fileSize: MAX_DOC, files: 1 } });
      if (!file) throw new HttpError(400, "validation", "No llega ningún archivo");
      const buf = await file.toBuffer().catch(() => {
        throw new HttpError(413, "too_large", "El archivo pesa demasiado (máximo 20 MB)");
      });
      const kind = sniffDoc(buf, file.filename);
      if (!kind) throw new HttpError(415, "bad_type", "Solo PDF, Word (.docx) o texto (.txt, .md)");
      const title = file.filename.replace(/\.[^.]+$/, "").slice(0, 120) || "Documento";
      let text = "";
      try {
        text = (await extractDocText(buf, kind)).slice(0, MAX_CHARS);
      } catch {
        text = "";
      }
      const pieces = chunkText(text);
      if (pieces.length === 0) {
        const [d] = await db.insert(aiDocuments).values({ studioId: u.studioId, title, kind, status: "error", error: "No se ha podido leer texto (¿es un PDF escaneado como imagen?)", chars: 0 }).returning();
        return { id: d!.id, title, kind, status: "error" as const, error: d!.error, chunks: 0, chars: 0, createdAt: d!.createdAt.toISOString() };
      }
      const vectors = await wrap(() => p.embed(pieces, "document"));
      const d = await db.transaction(async (tx) => {
        const [doc] = await tx.insert(aiDocuments).values({ studioId: u.studioId, title, kind, status: "ready", chars: text.length }).returning();
        await tx.insert(aiChunks).values(pieces.map((t, i) => ({ studioId: u.studioId, documentId: doc!.id, idx: i, text: t, embedding: vectors[i]! })));
        return doc!;
      });
      await record(u.studioId, "document", 0);
      return { id: d.id, title, kind, status: "ready" as const, error: null, chunks: pieces.length, chars: text.length, createdAt: d.createdAt.toISOString() };
    },
  );
  api.delete("/ai/documents/:id", { schema: { tags: ["ia"], params: z.object({ id: z.string().uuid() }), response: { 200: Ok } } }, async (req) => {
    const u = requireCoach(req);
    const r = await db.delete(aiDocuments).where(and(eq(aiDocuments.id, req.params.id), eq(aiDocuments.studioId, u.studioId))).returning({ id: aiDocuments.id });
    if (!r.length) throw notFound("Documento");
    return { ok: true as const };
  });

  const limited = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

  // ── Generadores ──
  api.post("/ai/routine", { schema: { tags: ["ia"], body: GenerateRoutineInput, response: { 200: GeneratedRoutine } }, ...limited }, async (req) => {
    const u = requireCoach(req);
    const p = await guard(u.studioId);
    const b = req.body;
    return wrap(async () => {
      const fs = await retrieve(p, u.studioId, `${b.focus} ${b.notes}`);
      const prompt = `Diseña UNA sesión de entrenamiento.
Enfoque: ${b.focus}
Duración aproximada: ${b.minutes} minutos.
${equipmentText(b.equipment)}
${b.notes ? `Indicaciones del entrenador: ${b.notes}` : ""}

Cliente:
${await clientBlock(u.studioId, b.clientId, b.includeHealth)}

Organiza por bloques (calentamiento/activación, principal, accesorios…). Usa nombres de ejercicio estándar en español.

Fragmentos de su metodología:
${fragmentsText(fs)}`;
      const out = await p.generateJson({ system: SYSTEM, prompt, schema: ROUTINE as OutSchema });
      await record(u.studioId, "routine", out.tokens);
      const parsed = AiRoutine.safeParse(out.data);
      if (!parsed.success) throw new AiError("bad_output", "La IA ha devuelto una rutina incompleta. Prueba otra vez.");
      const unmatched: string[] = [];
      const routine = await toRoutine(u.studioId, parsed.data, unmatched);
      return { routine, unmatched, sources: sourcesOf(fs) };
    });
  });

  api.post("/ai/program", { schema: { tags: ["ia"], body: GenerateProgramInput, response: { 200: GeneratedProgram } }, ...limited }, async (req) => {
    const u = requireCoach(req);
    const p = await guard(u.studioId);
    const b = req.body;
    return wrap(async () => {
      const fs = await retrieve(p, u.studioId, `${b.focus} ${b.notes} programa periodización semanas progresión`);
      const prompt = `Diseña un programa de ${b.weeks} semanas con ${b.daysPerWeek} sesiones por semana de unos ${b.minutes} minutos.
Enfoque: ${b.focus}
${equipmentText(b.equipment)}
${b.notes ? `Indicaciones del entrenador: ${b.notes}` : ""}
Devuelve las rutinas distintas (normalmente ${Math.min(b.daysPerWeek, 4)}) y en qué días de la semana va cada una (1 = lunes … 7 = domingo, con descanso entre sesiones de la misma zona). Las mismas rutinas se repiten cada semana; indica cuántos kg subir por semana si procede.

Cliente:
${await clientBlock(u.studioId, b.clientId, b.includeHealth)}

Fragmentos de su metodología:
${fragmentsText(fs)}`;
      const out = await p.generateJson({ system: SYSTEM, prompt, schema: PROGRAM as OutSchema });
      await record(u.studioId, "program", out.tokens);
      const parsed = AiProgram.safeParse(out.data);
      if (!parsed.success || parsed.data.routines.length === 0) throw new AiError("bad_output", "La IA ha devuelto un programa incompleto. Prueba otra vez.");
      const unmatched: string[] = [];
      const routines = [];
      const used = new Set<number>();
      for (const r of parsed.data.routines.slice(0, 7)) {
        const weekdays = [...new Set(r.weekdays.map((d) => Math.round(d)).filter((d) => d >= 1 && d <= 7 && !used.has(d)))];
        weekdays.forEach((d) => used.add(d));
        routines.push({ routine: await toRoutine(u.studioId, r.routine, unmatched), weekdays });
      }
      const kg = parsed.data.progressionKgPerWeek;
      return {
        name: parsed.data.name.slice(0, 100) || "Programa",
        description: parsed.data.description.slice(0, 1000),
        weeks: b.weeks,
        progression: kg && kg >= 0.5 && kg <= 20 ? { kind: "kg" as const, step: Math.round(kg * 2) / 2 } : null,
        routines: routines.filter((r) => r.routine.blocks.length > 0),
        unmatched: [...new Set(unmatched)],
        sources: sourcesOf(fs),
      };
    });
  });

  api.post("/ai/meal-plan", { schema: { tags: ["ia"], body: GenerateMealPlanInput, response: { 200: GeneratedMealPlan } }, ...limited }, async (req) => {
    const u = requireCoach(req);
    const p = await guard(u.studioId);
    const b = req.body;
    return wrap(async () => {
      const fs = await retrieve(p, u.studioId, `nutrición dieta ${b.goal} ${b.restrictions} ${b.notes}`);
      const prompt = `Diseña un plan de comidas para un día tipo (se repite todos los días), con cantidades concretas y alternativas.
Objetivo: ${b.goal}
${b.kcal ? `Energía objetivo: unas ${b.kcal} kcal al día.` : "Calcula una energía razonable para el objetivo y el cliente."}
Comidas al día: ${b.mealsPerDay}.
${b.restrictions ? `Restricciones y preferencias: ${b.restrictions}` : ""}
${b.notes ? `Indicaciones del entrenador: ${b.notes}` : ""}
Usa alimentos habituales en España. Da objetivos de kcal y macros (g de proteína, hidratos y grasa).

Cliente:
${await clientBlock(u.studioId, b.clientId, b.includeHealth)}

Fragmentos de su metodología:
${fragmentsText(fs)}`;
      const out = await p.generateJson({ system: SYSTEM, prompt, schema: MEALPLAN as OutSchema });
      await record(u.studioId, "meal-plan", out.tokens);
      const parsed = AiMealPlan.safeParse(out.data);
      if (!parsed.success || parsed.data.meals.length === 0) throw new AiError("bad_output", "La IA ha devuelto un plan incompleto. Prueba otra vez.");
      const m = parsed.data;
      const int = (n: number | null | undefined, max: number) => (n == null ? null : Math.max(0, Math.min(max, Math.round(n))));
      const plan = MealPlanBody.parse({
        name: m.name.slice(0, 100) || "Plan de comidas",
        notes: m.notes.slice(0, 2000),
        targets: { kcal: int(m.kcal, 10000), protein: int(m.protein, 1000), carbs: int(m.carbs, 2000), fat: int(m.fat, 1000) },
        mode: "same",
        days: [
          {
            weekday: 0,
            meals: m.meals.slice(0, 10).map((x) => ({
              id: "m-" + newId(),
              name: x.name.slice(0, 60) || "Comida",
              time: x.time && /^([01]\d|2[0-3]):[0-5]\d$/.test(x.time) ? x.time : null,
              items: x.items.filter((i) => i.food.trim()).slice(0, 30).map((i) => ({ id: "f-" + newId(), food: i.food.slice(0, 120), qty: i.qty.slice(0, 40) })),
              alternatives: x.alternatives.slice(0, 1000),
              notes: x.notes.slice(0, 500),
            })),
          },
        ],
      });
      return { plan, sources: sourcesOf(fs) };
    });
  });

  api.post("/ai/ask", { schema: { tags: ["ia"], body: AskInput, response: { 200: AskAnswer } }, ...limited }, async (req) => {
    const u = requireCoach(req);
    const p = await guard(u.studioId);
    return wrap(async () => {
      const fs = await retrieve(p, u.studioId, req.body.question, 8);
      if (fs.length === 0) return { answer: "No he encontrado nada sobre eso en tus documentos. Sube el material que uses (PDF o Word) en IA → Mis documentos.", sources: [] };
      const prompt = `Pregunta del entrenador: ${req.body.question}

Responde SOLO con lo que digan estos fragmentos de sus documentos (breve, en español). Si no lo dicen, dilo. Indica en usedFragments los números de los fragmentos que has usado.

${fragmentsText(fs)}`;
      const out = await p.generateJson({ system: SYSTEM, prompt, schema: ANSWER as OutSchema });
      await record(u.studioId, "ask", out.tokens);
      const parsed = AiAnswer.safeParse(out.data);
      if (!parsed.success) throw new AiError("bad_output", "La IA no ha respondido bien. Prueba otra vez.");
      return { answer: parsed.data.answer, sources: sourcesOf(fs, parsed.data.usedFragments) };
    });
  });
}
