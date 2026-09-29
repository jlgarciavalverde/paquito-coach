import type { Client } from "@coach/shared";
import type { clientProfiles } from "../db/schema";

type ClientRow = typeof clientProfiles.$inferSelect;

export const toClient = (r: ClientRow): Client => ({
  id: r.id,
  userId: r.userId,
  name: r.name,
  email: r.email,
  phone: r.phone,
  birthDate: r.birthDate,
  goal: r.goal,
  healthNotes: r.healthNotes,
  privateNotes: r.privateNotes,
  tags: r.tags,
  status: r.status,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});
