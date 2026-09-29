import { sql } from "drizzle-orm";
import type { MealDay, RoutineBlock, WorkoutLog } from "@coach/shared";
import { questionnaireAlerts } from "@coach/shared";
import type { DB } from "../db/client";
import { appointments, bodyMetrics, bookingSettings, checkinAssignments, checkinForms, checkinResponses, clientProfiles, exercises, sessionPacks, mealChecks, mealPlans, messages, metricDefs, metricValues, questionnaires, routines, studios, users, workouts } from "../db/schema";
import { hashPassword } from "../lib/passwords";
import { newJoinCode } from "../lib/tokens";

/** Credenciales públicas de la demo (se muestran en /acceso). Solo existen en la base de datos de la demo. */
export const DEMO_COACH = { email: "entrenador@demo.coach", name: "Paquito (demo)" };
export const DEMO_CLIENT = { email: "lucia@demo.coach", name: "Lucía Martín" };
export const DEMO_PASSWORD = "demo-paquito-coach";

const madridDate = (offsetDays: number) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
};
/** Instante de un día (desplazamiento) a una hora local de Madrid (aprox. con el desfase actual). */
const madridAt = (offsetDays: number, h: number, m = 0) => {
  const day = madridDate(offsetDays);
  const probe = new Date(`${day}T12:00:00Z`);
  const madridNoon = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hour12: false }).format(probe));
  const offsetH = madridNoon - 12;
  return new Date(`${day}T${String(h - offsetH).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
};
const weekdayOf = (offsetDays: number) => new Date(`${madridDate(offsetDays)}T12:00:00Z`).getUTCDay();

/**
 * Vacía la base de datos de la demo y la vuelve a llenar con un estudio realista. SOLO se llama con DEMO_MODE=1,
 * que usa su propia base de datos (nunca la de producción; ver ADR 0009).
 */
export async function resetDemo(db: DB) {
  await db.execute(sql`delete from studios`); // cascada: todo lo del estudio
  const hash = await hashPassword(DEMO_PASSWORD);
  const [st] = await db.insert(studios).values({ name: "Estudio de demostración", joinCode: newJoinCode() }).returning();
  const studioId = st!.id;
  const [coach] = await db.insert(users).values({ studioId, role: "coach", name: DEMO_COACH.name, email: DEMO_COACH.email, passwordHash: hash, healthConsentAt: new Date() }).returning();

  const people = [
    { name: DEMO_CLIENT.name, email: DEMO_CLIENT.email, goal: "Volver a correr tras la plastia de LCA", health: "Plastia de LCA rodilla izquierda (marzo 2026). Sin impacto hasta el alta del traumatólogo.", account: true },
    { name: "Iker Salas", email: "iker@demo.coach", goal: "Ganar fuerza para el fútbol", health: "Esguince de tobillo derecho recurrente.", account: true },
    { name: "Carmen Vidal", email: "carmen@demo.coach", goal: "Dolor lumbar: fortalecer y volver al pádel", health: "Lumbalgia mecánica crónica. Evitar flexión con carga al principio.", account: true },
    { name: "Andrés Molina", email: "andres@demo.coach", goal: "Hipertrofia, 4 días por semana", health: null, account: true },
    { name: "Nuria Ortega", email: null, goal: "Mantenerse activa a los 65", health: "Osteopenia. Hipertensión controlada.", account: false },
  ];
  const clients: { id: string; userId: string | null; name: string }[] = [];
  for (const p of people) {
    let userId: string | null = null;
    if (p.account) {
      const [u] = await db.insert(users).values({ studioId, role: "client", name: p.name, email: p.email!, passwordHash: hash, healthConsentAt: new Date() }).returning();
      userId = u!.id;
    }
    const [c] = await db
      .insert(clientProfiles)
      .values({ studioId, userId, name: p.name, email: p.email, goal: p.goal, healthNotes: p.health, status: p.account ? "active" : "no_account", privateNotes: p.account ? null : "Viene martes y jueves por la mañana." })
      .returning();
    clients.push({ id: c!.id, userId, name: p.name });
  }
  // Una solicitud pendiente de aceptar (se registró con el código del estudio)
  const [pu] = await db.insert(users).values({ studioId, role: "client", name: "Marta Gil", email: "marta@demo.coach", passwordHash: hash, healthConsentAt: new Date() }).returning();
  await db.insert(clientProfiles).values({ studioId, userId: pu!.id, name: "Marta Gil", email: "marta@demo.coach", status: "pending" });

  // Ejercicios de la biblioteca común (la semilla ya está cargada)
  const find = async (q: string) => {
    const [e] = await db.select({ id: exercises.id, name: exercises.name }).from(exercises).where(sql`${exercises.studioId} is null and lower(${exercises.name}) like ${q.toLowerCase() + "%"}`).orderBy(sql`length(${exercises.name})`).limit(1);
    if (!e) throw new Error(`Demo: falta el ejercicio «${q}» en la biblioteca`);
    return e;
  };
  const [sq, rdl, bss, hip, row, press, plank] = await Promise.all(
    ["Sentadilla trasera", "Peso muerto rumano", "Sentadilla búlgara", "Hip thrust", "Remo con mancuerna", "Press de banca", "Plancha"].map(find),
  );
  const item = (id: string, e: { id: string; name: string }, sets: number, reps: string, load: string, effort = "RIR 2", rest = 120, group: string | null = null) => ({
    id, exerciseId: e.id, exerciseName: e.name, sets, reps, load, effort, tempo: "", restSec: rest, notes: "", group,
  });
  const legA: RoutineBlock[] = [
    { id: "b1", name: "Fuerza", items: [item("a1", sq!, 4, "6", "60 kg", "RIR 2", 150), item("a2", rdl!, 3, "8", "50 kg")] },
    { id: "b2", name: "Accesorios", items: [item("a3", bss!, 3, "10", "2×10 kg", "RIR 1", 60, "s1"), item("a4", plank!, 3, "40 s", "", "", 60, "s1")] },
  ];
  const upper: RoutineBlock[] = [{ id: "b1", name: "Torso", items: [item("u1", press!, 4, "8", "40 kg"), item("u2", row!, 4, "10", "20 kg"), item("u3", hip!, 3, "12", "60 kg", "RIR 2", 90)] }];
  const [rLeg] = await db.insert(routines).values({ studioId, name: "Pierna A, fase 2", description: "Fuerza de cadena posterior y control unilateral.", blocks: legA, createdBy: coach!.id }).returning();
  const [rUp] = await db.insert(routines).values({ studioId, name: "Torso y glúteo", description: "", blocks: upper, createdBy: coach!.id }).returning();

  // Entrenos: 4 semanas hacia atrás (hechos, con cargas que suben) y 2 hacia delante (programados)
  const progressLog = (blocks: RoutineBlock[], step: number): WorkoutLog =>
    Object.fromEntries(
      blocks.flatMap((b) =>
        b.items.map((it) => {
          const base = Number(it.load.replace(/[^\d]/g, "").slice(-2)) || 0;
          const kg = it.load.includes("×") ? `${10 + step}` : base ? String(base + step * 2.5) : "";
          return [it.id, Array.from({ length: it.sets }, (_, k) => ({ reps: it.reps.match(/^\d+$/) ? it.reps : "", load: kg, rpe: 7 + (k % 2), done: true }))];
        }),
      ),
    );
  const active = clients.filter((c) => c.userId);
  for (const [ci, c] of active.entries()) {
    const routine = ci % 2 === 0 ? rLeg! : rUp!;
    let step = 0;
    for (let off = -27; off <= 13; off++) {
      const wd = weekdayOf(off);
      // Días distintos por cliente para que cualquier día de la semana haya alguien entrenando.
      const days = [[1, 4], [2, 5], [1, 3, 5], [2, 4, 6]][ci % 4]!;
      if (!days.includes(wd)) continue;
      const past = off < 0;
      const skipped = past && ci === 2 && step === 3;
      await db.insert(workouts).values({
        studioId, clientId: c.id, routineId: routine.id, date: madridDate(off), title: routine.name, blocks: routine.blocks,
        log: past && !skipped ? progressLog(routine.blocks, step) : {},
        status: past ? (skipped ? "skipped" : "done") : "planned",
        sessionRpe: past && !skipped ? 7 + (step % 3) : null,
        clientComment: past && step === 5 && ci === 0 ? "La rodilla bien, algo de carga en el glúteo" : null,
        completedAt: past ? madridAt(off, 19) : null,
        seenByCoach: off < -3,
      });
      if (past) step++;
    }
  }

  // Plan de comidas aplicado a Lucía y a Carmen, con algunas comidas marcadas
  const meal = (id: string, name: string, time: string, items: [string, string][], alternatives = "") => ({ id, name, time, items: items.map(([food, qty], i) => ({ id: `${id}f${i}`, food, qty })), alternatives, notes: "" });
  const days: MealDay[] = [{ weekday: 0, meals: [
    meal("m1", "Desayuno", "08:00", [["Copos de avena", "60 g"], ["Leche semidesnatada", "250 ml"], ["Plátano", "1"]], "2 tostadas integrales con aceite y pavo"),
    meal("m2", "Comida", "14:00", [["Arroz basmati (en crudo)", "80 g"], ["Pechuga de pollo", "150 g"], ["Ensalada", "al gusto"], ["Aceite de oliva", "10 g"]]),
    meal("m3", "Merienda", "18:00", [["Yogur griego natural", "125 g"], ["Nueces", "20 g"]]),
    meal("m4", "Cena", "21:30", [["Salmón", "150 g"], ["Patata cocida", "200 g"], ["Verdura a la plancha", "al gusto"]], "Merluza o 3 huevos en vez de salmón"),
  ] }];
  const planValues = { name: "Definición 2.000 kcal", notes: "2 litros de agua al día. Creatina 5 g con la comida.", targets: { kcal: 2000, protein: 145, carbs: 190, fat: 65 }, mode: "same" as const, days };
  await db.insert(mealPlans).values({ ...planValues, studioId, clientId: null });
  for (const c of [active[0]!, active[2]!]) {
    await db.insert(mealPlans).values({ ...planValues, studioId, clientId: c.id, active: true });
    for (let off = -6; off <= 0; off++) for (const m of ["m1", "m2", "m3", "m4"]) if ((off + m.length) % 3 !== 0) await db.insert(mealChecks).values({ studioId, clientId: c.id, date: madridDate(off), mealId: m, done: true });
  }

  // Citas de esta semana y la siguiente
  const appt = [[0, 9, active[0]!], [0, 18, active[1]!], [1, 10, clients[4]!], [2, 17, active[2]!], [3, 9, active[0]!], [4, 19, active[3]!]] as const;
  for (const [off, h, c] of appt) await db.insert(appointments).values({ studioId, clientId: c.id, kind: "session", startsAt: madridAt(off, h), endsAt: madridAt(off, h + 1), location: "Estudio", createdBy: coach!.id });
  await db.insert(appointments).values({ studioId, clientId: null, kind: "other", title: "Formación en readaptación", startsAt: madridAt(2, 16), endsAt: madridAt(2, 18), location: "Online", createdBy: coach!.id });

  // Mensajes con Lucía
  const lucia = active[0]!;
  const chat: [boolean, string, number][] = [
    [true, "Buenos días Lucía. Hoy toca Pierna A: céntrate en controlar la bajada en la sentadilla.", -26],
    [false, "¡Perfecto! Ayer me molestó un poco la rodilla al bajar escaleras, ¿lo hago igual?", -25],
    [true, "Sí, pero baja la carga y quédate en RIR 3. Si molesta más de 3/10, para y me escribes.", -24],
    [false, "Hoy muy bien, sin molestias 💪", -1],
  ];
  for (const [fromCoach, body, min] of chat)
    await db.insert(messages).values({ studioId, clientId: lucia.id, senderId: fromCoach ? coach!.id : lucia.userId, fromCoach, body, createdAt: new Date(Date.now() + min * 60000 * 60) });

  // Peso de Lucía (7 semanas) y cuestionario con una alerta sin revisar de Carmen
  for (let i = 0; i < 7; i++) await db.insert(bodyMetrics).values({ studioId, clientId: lucia.id, date: madridDate(-42 + i * 7), weightKg: +(66.2 - i * 0.35 + (i % 2) * 0.2).toFixed(1), waistCm: +(74 - i * 0.4).toFixed(1), createdBy: lucia.userId });
  const answers = { parq: [false, false, false, false, false, true, false], anamnesis: { pastInjuries: "Lumbalgia desde 2023", surgeries: "", medication: "Ibuprofeno a demanda", painNow: 3, painArea: "Zona lumbar", currentActivity: "Pádel 1 vez por semana", goal: "Jugar sin dolor", other: "" } };
  await db.insert(questionnaires).values({ studioId, clientId: active[2]!.id, answers, alerts: questionnaireAlerts(answers) });
  const ok = { parq: Array(7).fill(false), anamnesis: { ...answers.anamnesis, painNow: 0, pastInjuries: "", medication: "", painArea: "" } };
  for (const c of [active[0]!, active[1]!, active[3]!]) await db.insert(questionnaires).values({ studioId, clientId: c.id, answers: ok, alerts: [], reviewedAt: new Date(), reviewedBy: coach!.id });

  // Reservas abiertas de lunes a viernes, mañanas y tardes
  await db.insert(bookingSettings).values({
    studioId, enabled: true, slotMinutes: 60, capacity: 1, noticeHours: 12, cancelHours: 24, location: "Estudio",
    windows: [1, 2, 3, 4, 5].flatMap((weekday) => [{ weekday, start: "09:00", end: "13:00" }, { weekday, start: "17:00", end: "20:00" }]),
  });

  // Bonos: Lucía con un bono de 10 (pagado) y las sesiones pasadas descontadas; Iker a punto de agotarlo
  const [pl] = await db.insert(sessionPacks).values({ studioId, clientId: lucia.id, name: "Bono 10 sesiones", total: 10, price: 300, paid: true }).returning();
  const [pi] = await db.insert(sessionPacks).values({ studioId, clientId: active[1]!.id, name: "Bono 5 sesiones", total: 5, price: 160, paid: false }).returning();
  for (let w = 1; w <= 4; w++) await db.insert(appointments).values({ studioId, clientId: lucia.id, kind: "session", startsAt: madridAt(-7 * w, 9), endsAt: madridAt(-7 * w, 10), location: "Estudio", status: "done", packId: pl!.id, createdBy: coach!.id });
  for (let w = 1; w <= 4; w++) await db.insert(appointments).values({ studioId, clientId: active[1]!.id, kind: "session", startsAt: madridAt(-7 * w, 18), endsAt: madridAt(-7 * w, 19), location: "Estudio", status: w === 2 ? "no_show" : "done", packId: pi!.id, createdBy: coach!.id });

  // Seguimiento: dolor y flexión de rodilla de Lucía (readaptación de LCA) y su check-in semanal
  const [eva] = await db.insert(metricDefs).values({ studioId, name: "Dolor (EVA)", unit: "/10", higherIsBetter: false }).returning();
  const [flex] = await db.insert(metricDefs).values({ studioId, name: "Flexión de rodilla", unit: "°", clientCanLog: false }).returning();
  for (let i = 0; i < 6; i++) {
    await db.insert(metricValues).values({ studioId, clientId: lucia.id, metricId: eva!.id, date: madridDate(-35 + i * 7), value: Math.max(1, 5 - Math.floor(i * 0.8)), createdBy: lucia.userId });
    await db.insert(metricValues).values({ studioId, clientId: lucia.id, metricId: flex!.id, date: madridDate(-35 + i * 7), value: 105 + i * 5, createdBy: coach!.id });
  }
  const qs = [
    { id: "energia", kind: "scale" as const, label: "¿Qué tal de energía esta semana?", required: true },
    { id: "sueno", kind: "scale" as const, label: "¿Cómo has dormido?", required: true },
    { id: "plan", kind: "scale" as const, label: "¿Cuánto has cumplido el plan de entreno?", required: true },
    { id: "dolor", kind: "yesno" as const, label: "¿Has tenido dolor o molestias?", required: true },
    { id: "donde", kind: "text" as const, label: "Si es que sí, ¿dónde y cuándo?", required: false },
    { id: "mas", kind: "text" as const, label: "¿Algo más que quieras contarme?", required: false },
  ];
  const [form] = await db.insert(checkinForms).values({ studioId, name: "Check-in semanal", intro: "Dos minutos para contarme qué tal la semana. Con esto ajusto tu plan.", questions: qs }).returning();
  for (const c of [lucia, active[1]!]) {
    const [a] = await db.insert(checkinAssignments).values({ studioId, clientId: c.id, formId: form!.id, everyDays: 7, nextDue: madridDate(c === lucia ? 0 : 3) }).returning();
    for (let w = 3; w >= 1; w--)
      await db.insert(checkinResponses).values({
        studioId, clientId: c.id, assignmentId: a!.id, formName: form!.name, questions: qs, dueDate: madridDate(-7 * w),
        answers: { energia: 6 + (3 - w), sueno: 7, plan: 8 + (w === 1 ? 1 : 0), dolor: w === 1 && c === lucia, ...(w === 1 && c === lucia ? { donde: "Rodilla al bajar escaleras, el jueves" } : {}) },
        submittedAt: new Date(Date.now() - 7 * w * 86400000), seenAt: w === 1 ? null : new Date(),
      });
  }
}

/** Próximas 4:00 de Madrid, en ms desde ahora. */
export function msUntilNextReset(now = new Date()) {
  const next = new Date(now.getTime());
  for (let i = 0; i < 48; i++) {
    next.setTime(now.getTime() + i * 3600000);
    const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hour12: false }).format(next));
    if (i > 0 && h === 4) {
      next.setUTCMinutes(0, 0, 0);
      return Math.max(60000, next.getTime() - now.getTime());
    }
  }
  return 24 * 3600000;
}
