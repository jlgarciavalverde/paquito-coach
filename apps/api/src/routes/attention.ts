import type { FastifyInstance } from "fastify";
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { AttentionItem, Ok } from "@coach/shared";
import { checkinAssignments, checkinResponses, clientProfiles, messages, questionnaires, workouts } from "../db/schema";
import { madridClock } from "../lib/scheduler";
import { packAlerts } from "../lib/packs";
import { requireCoach } from "../lib/session";
import { typed, type Ctx } from "./ctx";

const daysAgo = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

/**
 * «Necesitan atención»: una sola lista con lo que pide acción del entrenador, por cliente.
 * - 2 o más entrenos de los últimos 7 días sin registrar o marcados como no hechos.
 * - Con entrenos asignados, pero ninguno hecho en 10 días.
 * - Cuestionario de salud con alertas sin revisar.
 * - Último mensaje del cliente sin contestar desde hace más de 24 h.
 * - Check-in contestado sin revisar, o sin contestar más de 2 días después de tocarle.
 */
export function registerAttention(app: FastifyInstance, { db }: Ctx) {
  const api = typed(app);

  api.get("/attention", { schema: { tags: ["entrenamiento"], response: { 200: z.array(AttentionItem) } } }, async (req) => {
    const u = requireCoach(req);
    const today = madridClock(new Date()).date;
    const clients = await db
      .select({ id: clientProfiles.id, name: clientProfiles.name })
      .from(clientProfiles)
      .where(and(eq(clientProfiles.studioId, u.studioId), eq(clientProfiles.status, "active")));
    if (clients.length === 0) return [];
    const ids = clients.map((c) => c.id);
    const reasons = new Map<string, AttentionItem["reasons"]>();
    const add = (id: string, r: AttentionItem["reasons"][number]) => reasons.set(id, [...(reasons.get(id) ?? []), r]);

    const recent = await db
      .select({ clientId: workouts.clientId, date: workouts.date, status: workouts.status })
      .from(workouts)
      .where(and(inArray(workouts.clientId, ids), gte(workouts.date, daysAgo(today, 10)), lt(workouts.date, today)));
    for (const id of ids) {
      const mine = recent.filter((w) => w.clientId === id);
      const missed = mine.filter((w) => w.date >= daysAgo(today, 7) && w.status !== "done").length;
      if (missed >= 2) add(id, { kind: "missed", text: `${missed} entrenos sin hacer esta semana` });
      else if (mine.length > 0 && !mine.some((w) => w.status === "done")) add(id, { kind: "inactive", text: "Sin entrenar en 10 días" });
    }

    const qs = await db
      .select({ clientId: questionnaires.clientId, alerts: questionnaires.alerts })
      .from(questionnaires)
      .where(and(inArray(questionnaires.clientId, ids), isNull(questionnaires.reviewedAt), sql`jsonb_array_length(${questionnaires.alerts}) > 0`));
    for (const q of new Map(qs.map((q) => [q.clientId, q])).values())
      add(q.clientId, { kind: "health", text: q.alerts.length === 1 ? "Cuestionario de salud con 1 alerta" : `Cuestionario de salud con ${q.alerts.length} alertas` });

    const lastMsgs = await db
      .selectDistinctOn([messages.clientId], { clientId: messages.clientId, fromCoach: messages.fromCoach, old: sql<boolean>`${messages.createdAt} < now() - interval '24 hours'` })
      .from(messages)
      .where(inArray(messages.clientId, ids))
      .orderBy(messages.clientId, desc(messages.createdAt));
    for (const m of lastMsgs) if (!m.fromCoach && m.old) add(m.clientId, { kind: "unanswered", text: "Mensaje sin contestar desde hace más de un día" });

    const newCheckins = await db
      .select({ clientId: checkinResponses.clientId, n: sql<number>`count(*)::int` })
      .from(checkinResponses)
      .where(and(inArray(checkinResponses.clientId, ids), isNull(checkinResponses.seenAt)))
      .groupBy(checkinResponses.clientId);
    for (const c of newCheckins) add(c.clientId, { kind: "checkin", text: c.n === 1 ? "Check-in nuevo por revisar" : `${c.n} check-ins nuevos por revisar` });
    const overdue = await db
      .select({ clientId: checkinAssignments.clientId })
      .from(checkinAssignments)
      .where(and(inArray(checkinAssignments.clientId, ids), lt(checkinAssignments.nextDue, daysAgo(today, 2))));
    for (const id of new Set(overdue.map((o) => o.clientId)))
      if (!newCheckins.some((c) => c.clientId === id)) add(id, { kind: "checkin", text: "Check-in sin contestar" });

    for (const [id, text] of await packAlerts(db, u.studioId, ids)) add(id, { kind: "pack", text });

    const order: Record<string, number> = { health: 0, missed: 1, unanswered: 2, checkin: 3, pack: 4, inactive: 5 };
    return clients
      .filter((c) => reasons.has(c.id))
      .map((c) => ({ clientId: c.id, clientName: c.name, reasons: reasons.get(c.id)!.sort((a, b) => order[a.kind]! - order[b.kind]!) }))
      .sort((a, b) => b.reasons.length - a.reasons.length || order[a.reasons[0]!.kind]! - order[b.reasons[0]!.kind]!);
  });

  /** Marca como revisados todos los entrenos terminados del estudio. */
  api.post("/activity/seen", { schema: { tags: ["entrenamiento"], response: { 200: Ok } } }, async (req) => {
    const u = requireCoach(req);
    await db.update(workouts).set({ seenByCoach: true }).where(and(eq(workouts.studioId, u.studioId), isNotNull(workouts.completedAt), eq(workouts.seenByCoach, false)));
    return { ok: true as const };
  });
}
