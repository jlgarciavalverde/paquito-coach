import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Fastify, { LogController, type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import { join } from "node:path";
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { ZodError } from "zod";
import { sql } from "drizzle-orm";
import { BRAND } from "@coach/shared";
import type { AppConfig } from "./config";
import { createDb, runMigrations, type DB } from "./db/client";
import { HttpError } from "./lib/errors";
import { authenticate, cookieName } from "./lib/session";
import { registerAuth } from "./routes/auth";
import { registerClients } from "./routes/clients";
import { registerHealth } from "./routes/health";
import { registerMe } from "./routes/me";
import { registerStudio } from "./routes/studio";
import { registerTraining } from "./routes/training";
import { registerNutrition } from "./routes/nutrition";
import { registerAgenda } from "./routes/agenda";
import { registerChat } from "./routes/chat";
import { Hub } from "./lib/realtime";
import { createPushSender, type PushSender } from "./lib/push";
import { seedExercises } from "./db/seed";
import type { Ctx } from "./routes/ctx";

export type App = FastifyInstance & { db: DB };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function buildApp(cfg: AppConfig, opts: { push?: PushSender } = {}): Promise<App> {
  const { db, sql: pg } = createDb(cfg.databaseUrl);
  await runMigrations(db);
  if (cfg.seedExercises !== false) await seedExercises(db);
  const hub = new Hub();
  const ctx: Ctx = { db, cfg, hub };
  const push = opts.push ?? createPushSender(db, { publicKey: cfg.vapidPublicKey, privateKey: cfg.vapidPrivateKey, subject: cfg.vapidSubject ?? "mailto:admin@example.com" });

  const app = Fastify({
    logger:
      cfg.logLevel === "silent"
        ? false
        : { level: cfg.logLevel ?? "info", redact: ["req.headers.cookie", 'res.headers["set-cookie"]'] },
    // Detrás del túnel de Cloudflare la IP real llega en CF-Connecting-IP (ver keyGenerator).
    trustProxy: true,
    bodyLimit: 256 * 1024,
    // El healthcheck de Docker no debe llenar los logs.
    logController: new LogController({ disableRequestLogging: (req) => req.url === "/health" }),
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const clientIp = (req: { headers: Record<string, unknown>; ip: string }) => {
    const cf = req.headers["cf-connecting-ip"];
    if (cfg.trustCloudflare && typeof cf === "string" && cf.length < 64) return cf;
    try {
      return req.ip;
    } catch {
      return "sin-ip"; // peticiones inyectadas sin socket (tests de WebSocket)
    }
  };

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Motion anima con estilos en línea
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'"],
        // El canal en tiempo real (wss://…/ws): algunos Safari no lo incluyen en 'self'.
        connectSrc: ["'self'", ...cfg.allowedOrigins.map((o) => o.replace(/^http/, "ws"))],
        mediaSrc: ["'self'", "blob:"],
        frameSrc: ["https://www.youtube-nocookie.com", "https://player.vimeo.com"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: cfg.secureCookies ? [] : null,
      },
    },
    hsts: cfg.secureCookies ? { maxAge: 31536000, includeSubDomains: false } : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 5 } });
  await app.register(websocket, { options: { maxPayload: 1024 } });
  await app.register(rateLimit, {
    global: true,
    max: cfg.globalRateLimit,
    timeWindow: "1 minute",
    keyGenerator: clientIp,
    // Solo la API cuenta: los archivos estáticos (decenas de trozos JS por página) agotarían el límite al cargar la app.
    allowList: (req) => !req.url.startsWith("/api/"),
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      error: "rate_limited",
      message: `Demasiadas peticiones. Espera ${Math.ceil(ctx.ttl / 1000)} s y vuelve a intentarlo.`,
    }),
  });

  if (cfg.exposeDocs) {
    await app.register(swagger, {
      openapi: {
        info: { title: `${BRAND.name} API`, version: cfg.version, description: "API REST del MVP. Autenticación por cookie de sesión." },
        components: { securitySchemes: { cookieAuth: { type: "apiKey", in: "cookie", name: cookieName(cfg) } } },
      },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, { routePrefix: "/api/docs" });
  }

  // Sesión: se resuelve una vez por petición a partir de la cookie.
  app.decorateRequest("user", null);
  app.addHook("onRequest", async (req) => {
    const token = req.cookies[cookieName(cfg)];
    req.user = token ? await authenticate(db, token) : null;
  });

  // CSRF: además de SameSite=Lax, toda petición que modifica datos debe venir de un origen permitido.
  app.addHook("onRequest", async (req, reply) => {
    if (SAFE_METHODS.has(req.method)) return;
    if (req.url.startsWith("/ws")) return;
    const origin = req.headers.origin;
    if (!origin || !cfg.allowedOrigins.includes(origin)) {
      return reply.code(403).send({ error: "bad_origin", message: "Origen no permitido" });
    }
  });

  app.setErrorHandler((err: unknown, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      const first = err.validation[0];
      return reply.code(400).send({ error: "validation", message: first?.message ?? "Datos no válidos" });
    }
    if (err instanceof ZodError) return reply.code(400).send({ error: "validation", message: err.issues[0]?.message ?? "Datos no válidos" });
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.code, message: err.message });
    const e = err as { statusCode?: number; message?: string; code?: string };
    if (e.statusCode === 429) return reply.code(429).send({ error: "rate_limited", message: e.message ?? "Demasiadas peticiones" });
    if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: "request", message: e.message ?? "Petición no válida" });
    req.log.error(err);
    return reply.code(500).send({ error: "internal", message: "Algo ha fallado en el servidor" });
  });

  await app.register(
    async (api) => {
      registerAuth(api, ctx);
      registerMe(api, ctx);
      registerClients(api, ctx);
      registerStudio(api, ctx);
      registerTraining(api, ctx);
      registerNutrition(api, ctx);
      registerAgenda(api, ctx);
      registerChat(api, ctx, { hub, push, mediaDir: join(cfg.dataDir, "media"), vapidPublicKey: cfg.vapidPublicKey });
    },
    { prefix: "/api/v1" },
  );
  // Canal en tiempo real. Se autentica con la misma cookie y SOLO desde un origen permitido
  // (sin esta comprobación, otra web podría abrir el socket con la cookie del usuario: CSWSH).
  app.get("/ws", { websocket: true }, (socket, req) => {
    const origin = req.headers.origin;
    if (!req.user || !origin || !cfg.allowedOrigins.includes(origin)) {
      socket.close(4401, "unauthorized");
      return;
    }
    hub.add(req.user.id, socket);
    socket.send(JSON.stringify({ type: "ready" }));
    socket.on("message", () => {}); // el canal es solo de bajada
  });
  const pinger = setInterval(() => hub.pingAll(), 30_000);
  pinger.unref();

  registerHealth(app, ctx, async () => {
    await db.execute(sql`select 1`);
  });

  const webDir = cfg.webDir ? resolve(cfg.webDir) : undefined;
  if (webDir && existsSync(webDir)) {
    await app.register(fastifyStatic, {
      root: webDir,
      cacheControl: false,
      setHeaders(res, path) {
        // Los assets llevan hash en el nombre; el HTML nunca se cachea (Cloudflare incluido: no-store).
        res.header("Cache-Control", path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-store");
      },
    });
  }
  app.setNotFoundHandler((req, reply) => {
    const isApi = req.url.startsWith("/api") || req.url.startsWith("/ws");
    if (webDir && req.method === "GET" && !isApi) return reply.header("Cache-Control", "no-store").sendFile("index.html");
    return reply.code(404).send({ error: "not_found", message: "No encontrado" });
  });

  app.addHook("onClose", async () => {
    clearInterval(pinger);
    await pg.end({ timeout: 5 });
  });

  return Object.assign(app, { db }) as App;
}
