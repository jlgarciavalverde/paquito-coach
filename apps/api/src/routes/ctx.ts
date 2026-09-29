import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { AppConfig } from "../config";
import type { DB } from "../db/client";

export interface Ctx {
  db: DB;
  cfg: AppConfig;
}

export const typed = (app: FastifyInstance) => app.withTypeProvider<ZodTypeProvider>();
export type Typed = ReturnType<typeof typed>;
