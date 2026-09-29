import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { App } from "./app";
import { studios, users } from "./db/schema";
import { hashPassword } from "./lib/passwords";
import { createFakeAi } from "./lib/ai/fake";
import { Agent, ORIGIN, PASSWORD, inviteAndRegister, resetDb, setupCoach, testApp } from "./test-utils";

let app: App;
let coach: Agent;
let other: Agent;
let lucia: Agent;
let luciaId: string;
const fake = createFakeAi((prompt) => {
  if (prompt.includes("Diseña UNA sesión"))
    return { name: "Pierna fuerza", description: "", blocks: [{ name: "Principal", items: [
      { exercise: "Sentadilla trasera", sets: 4, reps: "5", load: "80 kg", effort: "RIR 2", notes: "", supersetWithPrevious: false },
      { exercise: "Peso muerto rumano", sets: 3, reps: "8", load: "", effort: "", notes: "", supersetWithPrevious: true },
      { exercise: "Ejercicio inventado zzz", sets: 3, reps: "10", load: "", effort: "", notes: "", supersetWithPrevious: false },
    ] }] };
  if (prompt.includes("Diseña un programa"))
    return { name: "Fuerza 4 semanas", description: "", progressionKgPerWeek: 2.5, routines: [
      { routine: { name: "A", description: "", blocks: [{ name: "B", items: [{ exercise: "Sentadilla trasera", sets: 3, reps: "5", load: "80", effort: "", notes: "", supersetWithPrevious: false }] }] }, weekdays: [1, 4] },
      { routine: { name: "B", description: "", blocks: [{ name: "B", items: [{ exercise: "Peso muerto rumano", sets: 3, reps: "8", load: "60", effort: "", notes: "", supersetWithPrevious: false }] }] }, weekdays: [4, 5, 9] },
    ] };
  if (prompt.includes("plan de comidas"))
    return { name: "Definición", notes: "", kcal: 2100, protein: 150, carbs: 200, fat: 70, meals: [{ name: "Desayuno", time: "08:00", items: [{ food: "Avena", qty: "60 g" }], alternatives: "", notes: "" }, { name: "Cena", time: "25:00", items: [], alternatives: "", notes: "" }] };
  return { answer: "En la fase 2 se introduce el trote suave.", usedFragments: [1] };
});
async function uploadDoc(a: Agent, name: string, content: Buffer | string) {
  const boundary = "----x";
  const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`), Buffer.from(content), Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const res = await app.inject({ method: "POST", url: "/api/v1/ai/documents", payload, headers: { origin: ORIGIN, cookie: a.cookie, "content-type": `multipart/form-data; boundary=${boundary}` } });
  return { status: res.statusCode, body: res.json() };
}

beforeAll(async () => {
  await resetDb();
  app = await testApp({ aiDailyLimit: 8 }, { ai: fake });
  coach = await setupCoach(app);
  ({ client: lucia, clientId: luciaId } = await inviteAndRegister(app, coach, "Lucía Martínez", "lucia@example.com"));
  await coach.patch(`/api/v1/clients/${luciaId}`, { goal: "Que Lucía vuelva a correr (lucia@example.com)", healthNotes: "Plastia LCA rodilla izquierda", birthDate: "1994-05-01" });
  for (const name of ["Sentadilla trasera con barra", "Peso muerto rumano con barra"]) await coach.post("/api/v1/exercises", { name, muscle: "quads", equipment: "barbell" });
  const [st] = await app.db.insert(studios).values({ name: "B", joinCode: "BBBBBBC5" }).returning();
  await app.db.insert(users).values({ studioId: st!.id, role: "coach", name: "Otro", email: "otro14@example.com", passwordHash: await hashPassword(PASSWORD) });
  other = new Agent(app);
  await other.post("/api/v1/auth/login", { email: "otro14@example.com", password: PASSWORD });
});
afterAll(() => app.close());

describe("IA con los documentos del entrenador", () => {
  it("sube un documento de texto, lo trocea y rechaza lo que no es documento", async () => {
    const text = Array.from({ length: 20 }, (_, i) => `Fase ${i}: readaptación de LCA, trote suave y fuerza excéntrica. `.repeat(15)).join("\n\n");
    const r = await uploadDoc(coach, "Metodología LCA.txt", text);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ title: "Metodología LCA", kind: "text", status: "ready" });
    expect(r.body.chunks).toBeGreaterThan(1);
    expect((await uploadDoc(coach, "foto.png", Buffer.from("89504e470d0a1a0a", "hex"))).status).toBe(415);
    expect((await uploadDoc(lucia, "x.txt", "hola")).status).toBe(403);
    expect((await other.get("/api/v1/ai/documents")).body).toHaveLength(0);
    expect((await other.del(`/api/v1/ai/documents/${r.body.id}`)).status).toBe(404);
  });

  it("rutina: empareja con la biblioteca, marca superseries y lo que no existe; no envía datos personales", async () => {
    const r = await coach.post("/api/v1/ai/routine", { focus: "pierna, fuerza, rodilla operada", clientId: luciaId, includeHealth: true });
    expect(r.status).toBe(200);
    const items = r.body.routine.blocks[0].items;
    expect(items.map((i: { exerciseName: string }) => i.exerciseName)).toEqual(["Sentadilla trasera con barra", "Peso muerto rumano con barra"]);
    expect(items[0].group).toBe(items[1].group);
    expect(r.body.unmatched).toEqual(["Ejercicio inventado zzz"]);
    expect(r.body.sources.length).toBeGreaterThan(0);
    const sent = fake.calls.at(-1)!.prompt;
    expect(sent).not.toMatch(/Lucía|Martínez|lucia@|1994/);
    expect(sent).toContain("30–39 años");
    expect(sent).toContain("Plastia LCA");
    // Sin marcar la casilla, sin lesiones
    await coach.post("/api/v1/ai/routine", { focus: "pierna", clientId: luciaId });
    expect(fake.calls.at(-1)!.prompt).not.toContain("Plastia");
    expect((await other.post("/api/v1/ai/routine", { focus: "pierna", clientId: luciaId })).status).toBe(404);
  });

  it("programa: rutinas y días válidos (sin repetir días) y progresión", async () => {
    const r = await coach.post("/api/v1/ai/program", { focus: "fuerza general", weeks: 4, daysPerWeek: 3 });
    expect(r.status).toBe(200);
    expect(r.body.routines.map((x: { weekdays: number[] }) => x.weekdays)).toEqual([[1, 4], [5]]);
    expect(r.body.progression).toEqual({ kind: "kg", step: 2.5 });
  });

  it("plan de comidas válido (hora inválida fuera, comida vacía permitida) y pregunta con fuentes", async () => {
    const r = await coach.post("/api/v1/ai/meal-plan", { goal: "perder grasa", kcal: 2100 });
    expect(r.status).toBe(200);
    expect(r.body.plan).toMatchObject({ mode: "same", targets: { kcal: 2100, protein: 150 } });
    expect(r.body.plan.days[0].meals[1].time).toBeNull();
    const a = await coach.post("/api/v1/ai/ask", { question: "¿Cuándo empieza el trote?" });
    expect(a.body.answer).toContain("trote");
    expect(a.body.sources[0].title).toBe("Metodología LCA");
  });

  it("límite diario propio y estado", async () => {
    const s = (await coach.get("/api/v1/ai/status")).body;
    expect(s).toMatchObject({ enabled: true, documents: 1, dailyLimit: 8 });
    let last = 200;
    for (let i = 0; i < 6 && last === 200; i++) last = (await coach.post("/api/v1/ai/ask", { question: "¿Trote?" })).status;
    expect(last).toBe(429);
  });
});

describe("IA desactivada", () => {
  it("sin clave: 409 con mensaje claro", async () => {
    const off = await testApp({}, { ai: null });
    const c = new Agent(off);
    await c.post("/api/v1/auth/login", { email: "paquito@example.com", password: PASSWORD });
    const r = await c.post("/api/v1/ai/routine", { focus: "pierna" });
    expect(r.status).toBe(409);
    expect(r.body.message).toContain("falta la clave");
    await off.close();
  });
});
