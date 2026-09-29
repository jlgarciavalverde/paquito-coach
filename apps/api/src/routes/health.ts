import type { FastifyInstance } from "fastify";
import { Health } from "@coach/shared";
import { typed, type Ctx } from "./ctx";

export function registerHealth(app: FastifyInstance, { cfg }: Ctx, pingDb: () => Promise<void>) {
  typed(app).get(
    "/health",
    { schema: { tags: ["ops"], response: { 200: Health } }, config: { rateLimit: false } },
    async (_req, reply) => {
      let db: "ok" | "error" = "ok";
      try {
        await pingDb();
      } catch {
        db = "error";
      }
      reply.header("Cache-Control", "no-store");
      return { status: "ok" as const, version: cfg.version, uptime: Math.round(process.uptime()), db };
    },
  );
}
