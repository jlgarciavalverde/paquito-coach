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
import { ZodError, z } from "zod";
import { sql } from "drizzle-orm";
import { BRAND } from "@coach/shared";
import type { AppConfig } from "./config";
import { createDb, runMigrations, type DB } from "./db/client";
import { HttpError, notFound } from "./lib/errors";
import { redactUrl } from "./lib/redact";
import { gate } from "./lib/access";
import { stripNul } from "./lib/sanitize";
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
import { registerPrivacy } from "./routes/privacy";
import { registerProgress } from "./routes/progress";
import { registerQuestionnaire } from "./routes/questionnaire";
import { registerAttention } from "./routes/attention";
import { registerFollowup } from "./routes/followup";
import { registerPrograms } from "./routes/programs";
import { registerPacks } from "./routes/packs";
import { registerBooking } from "./routes/booking";
import { registerLibrary } from "./routes/library";
import { registerAi } from "./routes/ai";
import { createGemini } from "./lib/ai/gemini";
import { createCannedAi } from "./lib/ai/canned";
import { registerPayments } from "./routes/payments";
import { createFakeGateway, createStripeGateway, type PaymentGateway } from "./lib/stripe";
import type { AiProvider } from "./lib/ai/provider";
import { Hub } from "./lib/realtime";
import { createPushSender, type PushSender } from "./lib/push";
import { seedExercises } from "./db/seed";
import type { Ctx } from "./routes/ctx";

export type App = FastifyInstance & { db: DB; push: PushSender; routeList: { method: string; url: string }[] };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function buildApp(cfg: AppConfig, opts: { push?: PushSender; ai?: AiProvider | null; gateway?: PaymentGateway | null } = {}): Promise<App> {
  const { db, sql: pg } = createDb(cfg.databaseUrl);
  await runMigrations(db);
  if (cfg.seedExercises !== false) await seedExercises(db);
  const hub = new Hub();
  const ctx: Ctx = { db, cfg, hub };
  // IA: sin clave (o en la demo) queda desactivada; los tests inyectan un proveedor falso.
  const ai =
    opts.ai !== undefined
      ? opts.ai
      : cfg.aiFake || cfg.demoMode
        ? createCannedAi()
        : cfg.geminiApiKey
          ? createGemini({ apiKey: cfg.geminiApiKey, model: cfg.geminiModel, embedModel: cfg.geminiEmbedModel })
          : null;
  // Cobros: Stripe con claves; simulado en e2e; nunca en la demo.
  const fakeGateway = cfg.paymentsFake && !cfg.demoMode ? createFakeGateway() : null;
  const gateway =
    opts.gateway !== undefined
      ? opts.gateway
      : cfg.demoMode
        ? null
        : (fakeGateway ?? (cfg.stripeSecretKey && cfg.stripeWebhookSecret ? createStripeGateway({ secretKey: cfg.stripeSecretKey, webhookSecret: cfg.stripeWebhookSecret }) : null));
  const push = opts.push ?? createPushSender(db, { publicKey: cfg.vapidPublicKey, privateKey: cfg.vapidPrivateKey, subject: cfg.vapidSubject ?? "mailto:admin@example.com" });

  const routeList: { method: string; url: string }[] = [];
  const app = Fastify({
    logger:
      cfg.logLevel === "silent"
        ? false
        : {
            level: cfg.logLevel ?? "info",
            redact: ["req.headers.cookie", 'res.headers["set-cookie"]', 'req.headers["stripe-signature"]'],
            // Los tokens de invitación y de restablecer viajan en la URL: no deben quedar en los logs.
            serializers: { req: (r: { method: string; url: string }) => ({ method: r.method, url: redactUrl(r.url) }) },
          },
    // Detrás del túnel de Cloudflare la IP real llega en CF-Connecting-IP (ver keyGenerator).
    trustProxy: true,
    bodyLimit: 256 * 1024,
    // El healthcheck de Docker no debe llenar los logs.
    logController: new LogController({ disableRequestLogging: (req) => req.url === "/health" }),
  });
  // Registro de rutas (lo usan los tests de seguridad para recorrer todos los endpoints).
  app.addHook("onRoute", (r) => {
    for (const m of [r.method].flat()) if (m !== "HEAD") routeList.push({ method: m, url: r.url });
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
  // Datos privados: que ningún navegador ni proxy (Cloudflare) guarde respuestas de la API. Sin cámara ni micro para nadie.
  app.addHook("onSend", async (req, reply) => {
    if (req.url.startsWith("/api/") && !reply.hasHeader("cache-control")) reply.header("Cache-Control", "no-store");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
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

  // Postgres no admite el carácter NUL en textos: se quita de todo lo que entra (cuerpo, consulta y parámetros).
  app.addHook("preValidation", async (req) => {
    if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) req.body = stripNul(req.body);
    req.query = stripNul(req.query) as typeof req.query;
    req.params = stripNul(req.params) as typeof req.params;
  });

  // Acceso denegado por defecto antes de validar el cuerpo (ver lib/access.ts).
  app.addHook("preValidation", async (req, reply) => {
    const g = gate(req.method, req.routeOptions.url, req.user);
    if (g === "login") return reply.code(401).send({ error: "unauthorized", message: "Inicia sesión para continuar" });
    if (g === "coach-only") return reply.code(403).send({ error: "forbidden", message: "No tienes permiso para esto" });
  });

  // CSRF: además de SameSite=Lax, toda petición que modifica datos debe venir de un origen permitido.
  app.addHook("onRequest", async (req, reply) => {
    if (SAFE_METHODS.has(req.method)) return;
    if (req.url.startsWith("/ws")) return;
    // Stripe no manda Origin: el webhook se autentica con su firma.
    if (req.url.startsWith("/api/v1/stripe/webhook")) return;
    const origin = req.headers.origin;
    if (!origin || !cfg.allowedOrigins.includes(origin)) {
      return reply.code(403).send({ error: "bad_origin", message: "Origen no permitido" });
    }
  });

  // Demo pública: nada que suba archivos, cambie credenciales, cree cuentas reales o borre la demo para los demás.
  if (cfg.demoMode) {
    const BLOCKED: RegExp[] = [
      /^\/api\/v1\/media/, /^\/api\/v1\/me\/delete/, /^\/api\/v1\/clients\/[^/]+\/(delete|reset-link)/, /^\/api\/v1\/auth\/(password|setup|register)/,
      /^\/api\/v1\/push\/subscriptions/, /^\/api\/v1\/studio\/join-code\/rotate/, /^\/api\/v1\/ai\/documents/, /^\/api\/v1\/resources\/upload/,
    ];
    app.addHook("onRequest", async (req, reply) => {
      if (req.method !== "GET" && BLOCKED.some((r) => r.test(req.url))) {
        return reply.code(403).send({ error: "demo", message: "Esto no está disponible en la demo." });
      }
    });
  }

  app.setErrorHandler((err: unknown, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      const first = err.validation[0];
      return reply.code(400).send({ error: "validation", message: first?.message ?? "Datos no válidos" });
    }
    if (err instanceof ZodError) return reply.code(400).send({ error: "validation", message: err.issues[0]?.message ?? "Datos no válidos" });
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.code, message: err.message });
    // Carreras entre dos peticiones iguales (p. ej. dos registros con el mismo correo a la vez): conflicto, no error del servidor.
    const pg = (err as { code?: string; cause?: { code?: string } }).cause?.code ?? (err as { code?: string }).code;
    if (pg === "23505") return reply.code(409).send({ error: "conflict", message: "Eso ya existe o se acaba de hacer. Vuelve a cargar e inténtalo de nuevo." });
    if (pg === "22021" || pg === "22P05" || pg === "22P02" || pg === "22007" || pg === "22008" || pg === "22003")
      return reply.code(400).send({ error: "validation", message: "Hay un dato con un formato que no se puede guardar" });
    if (pg === "23503") return reply.code(409).send({ error: "conflict", message: "Algo relacionado ya no existe. Vuelve a cargar." });
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
      registerPrivacy(api, ctx);
      registerProgress(api, ctx);
      registerQuestionnaire(api, ctx);
      registerAttention(api, ctx);
      registerFollowup(api, ctx);
      registerPrograms(api, ctx);
      registerPacks(api, ctx);
      registerLibrary(api, ctx);
      registerAi(api, ctx, { ai });
      const billing = registerPayments(api, ctx, { gateway, push });
      registerBooking(api, ctx, { push, billing });
      if (fakeGateway) {
        // Solo e2e: simula que Stripe confirma el pago de un checkout (evento firmado que entra por el webhook real).
        api.post("/stripe/simulate", async (req) => {
          const { checkoutId } = z.object({ checkoutId: z.string() }).parse(req.body);
          const c = fakeGateway.checkouts.find((x) => x.id === checkoutId);
          if (!c) throw notFound("Pago");
          const send = async (ev: Record<string, unknown>) => {
            const payload = JSON.stringify({ object: "event", ...ev });
            return (await api.inject({ method: "POST", url: "/api/v1/stripe/webhook", payload, headers: { "content-type": "application/json", "stripe-signature": fakeGateway.sign(payload) } })).statusCode;
          };
          if (c.metadata.subscriptionRowId) {
            const sub = `sub_${checkoutId}`;
            await send({ id: `evt_${checkoutId}`, type: "checkout.session.completed", data: { object: { id: c.id, object: "checkout.session", mode: "subscription", subscription: sub, payment_status: "paid", metadata: c.metadata } } });
            return { status: await send({ id: `evt_in_${checkoutId}`, type: "invoice.paid", data: { object: { id: `in_${checkoutId}`, object: "invoice", amount_paid: c.amountCents, subscription: sub } } }) };
          }
          return { status: await send({ id: `evt_${checkoutId}`, type: "checkout.session.completed", data: { object: { id: c.id, object: "checkout.session", mode: "payment", amount_total: c.amountCents, currency: "eur", payment_status: "paid", payment_intent: `pi_${checkoutId}`, metadata: c.metadata } } }) };
        });
      }
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

  return Object.assign(app, { db, push, routeList }) as App;
}
