import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { JoinCode } from "@coach/shared";
import { studios } from "../db/schema";
import { audit } from "../lib/audit";
import { requireCoach } from "../lib/session";
import { newJoinCode } from "../lib/tokens";
import { typed, type Ctx } from "./ctx";

export function registerStudio(app: FastifyInstance, { db, cfg }: Ctx) {
  const api = typed(app);
  const link = (code: string) => ({ code, url: `${cfg.publicUrl}/registro?codigo=${code}` });

  api.get("/studio/join-code", { schema: { tags: ["estudio"], response: { 200: JoinCode } } }, async (req) => {
    const u = requireCoach(req);
    const [st] = await db.select({ code: studios.joinCode }).from(studios).where(eq(studios.id, u.studioId));
    return link(st!.code);
  });

  /** Cambia el código público (el anterior deja de funcionar al instante). */
  api.post("/studio/join-code/rotate", { schema: { tags: ["estudio"], response: { 200: JoinCode } } }, async (req) => {
    const u = requireCoach(req);
    const code = newJoinCode();
    await db.update(studios).set({ joinCode: code }).where(eq(studios.id, u.studioId));
    await audit(db, req, "studio.join_code.rotate");
    return link(code);
  });
}
