import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, isNotNull } from "drizzle-orm";
import { studios } from "../db/schema";
import { studioBySlug, studioOfHost, type StudioRow } from "../lib/tenant";
import type { Ctx } from "./ctx";

/** Páginas que se pueden indexar y compartir; el resto de la app (paneles, API) lleva `noindex`. */
const PUBLIC_PAGES = ["/", "/aviso-legal", "/terminos", "/privacidad"] as const;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const TITLES: Record<string, string> = { "/aviso-legal": "Aviso legal", "/terminos": "Términos de uso", "/privacidad": "Privacidad" };

/**
 * Lo que ven los buscadores y las vistas previas al compartir el enlace (WhatsApp, Instagram…): la app es una SPA, así que
 * el servidor rellena título, descripción y Open Graph en el HTML de las páginas públicas con los datos del estudio.
 * También `robots.txt`, `sitemap.xml` y el manifest con el nombre del estudio (lo que se ve al instalar la app).
 */
export function registerSeo(app: FastifyInstance, { db, cfg }: Ctx, webDir: string | undefined) {
  let template: string | null = null;
  const indexHtml = () => (template ??= webDir ? readFileSync(join(webDir, "index.html"), "utf8") : "");

  /** En el dominio propio de un estudio, la portada es su página; en el de la plataforma, la web de alta y `/e/<slug>`. */
  const homeIndexable = async (req: FastifyRequest) => {
    const s = await studioOfHost(db, cfg, req.headers.host);
    return s ? s.published : cfg.signupOpen;
  };
  const publishedSlugs = async () =>
    (await db.select({ slug: studios.slug }).from(studios).where(and(eq(studios.published, true), isNotNull(studios.slug)))).map((r) => r.slug!);

  app.get("/robots.txt", async (req, reply) => {
    const home = await homeIndexable(req);
    const lines = ["User-agent: *", ...(home ? ["Allow: /$"] : []), ...PUBLIC_PAGES.slice(1).map((p) => `Allow: ${p}`), "Allow: /e/", "Disallow: /", `Sitemap: ${base(req)}/sitemap.xml`];
    return reply.type("text/plain; charset=utf-8").header("Cache-Control", "public, max-age=3600").send(lines.join("\n") + "\n");
  });

  app.get("/sitemap.xml", async (req, reply) => {
    const own = await studioOfHost(db, cfg, req.headers.host);
    const pages: string[] = [...((await homeIndexable(req)) ? PUBLIC_PAGES : PUBLIC_PAGES.slice(1))];
    if (!own) pages.push(...(await publishedSlugs()).map((slug) => `/e/${slug}`));
    const urls = pages.map((p) => `  <url><loc>${esc(base(req) + p)}</loc></url>`).join("\n");
    return reply.type("application/xml; charset=utf-8").header("Cache-Control", "public, max-age=3600").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  });

  app.get("/manifest.webmanifest", async (req, reply) => {
    const s = await studioOfHost(db, cfg, req.headers.host);
    const name = s?.name ?? cfg.platformName;
    return reply
      .type("application/manifest+json; charset=utf-8")
      .header("Cache-Control", "no-cache")
      .send({
        name,
        short_name: name.length > 12 ? name.split(/\s+/)[0]!.slice(0, 12) : name,
        description: s?.tagline || "Tus entrenos, tus comidas, tu agenda y el chat con tu entrenador.",
        lang: "es",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#F9FAF9",
        theme_color: "#F9FAF9",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      });
  });

  /** HTML de la app para una ruta: con cabecera propia en las públicas y `noindex` en el resto. */
  return async function sendApp(path: string, req: FastifyRequest, reply: FastifyReply) {
    const html = indexHtml();
    reply.header("Cache-Control", "no-store").type("text/html; charset=utf-8");
    const studioPage = /^\/e\/([a-z0-9-]{1,40})\/?$/.exec(path);
    if (!studioPage && !(PUBLIC_PAGES as readonly string[]).includes(path)) return reply.header("X-Robots-Tag", "noindex").send(html);
    const own = await studioOfHost(db, cfg, req.headers.host);
    const s: StudioRow | null = studioPage ? await studioBySlug(db, studioPage[1]!) : own;
    if (studioPage && !s?.published) return reply.header("X-Robots-Tag", "noindex").send(html);
    const url = base(req) + path;
    const page = TITLES[path];
    if (!s) {
      // Web de la plataforma.
      const title = page ? `${page} · ${cfg.platformName}` : `${cfg.platformName} · Gestiona tus clientes de entrenamiento`;
      const description = page ? `${page} de ${cfg.platformName}.` : "Rutinas, nutrición, agenda, cobros y chat con tus clientes en una sola app. Prueba gratis.";
      return reply.send(withHead(html, { title, description, url, siteName: cfg.platformName, image: `${base(req)}/icon-512.png`, large: false, noindex: path === "/" && !cfg.signupOpen }));
    }
    const home = (path === "/" || Boolean(studioPage)) && s.published;
    const title = page ? `${page} · ${s.name}` : home ? `${s.name}${s.tagline ? ` · ${s.tagline}` : ""}` : s.name;
    const description = home ? (s.tagline || s.bio).slice(0, 200) : `${page ?? "Acceso"} de ${s.name}.`;
    const photo = home && s.photoMediaId;
    const image = photo ? `${base(req)}/api/v1/public/studio/photo${studioPage ? `?estudio=${s.slug}` : ""}` : `${base(req)}/icon-512.png`;
    return reply.send(withHead(html, { title, description, url, siteName: s.name, image, large: Boolean(photo), noindex: path === "/" && !s.published }));
  };

  function base(req: FastifyRequest) {
    const host = req.headers.host?.toLowerCase();
    return host && cfg.hostStudios[host] ? `${new URL(cfg.publicUrl).protocol}//${host}` : cfg.publicUrl;
  }
}

function withHead(html: string, o: { title: string; description: string; url: string; siteName: string; image: string; large: boolean; noindex: boolean }) {
  const head = [
    `<title>${esc(o.title)}</title>`,
    `<meta name="description" content="${esc(o.description)}" />`,
    `<link rel="canonical" href="${esc(o.url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(o.siteName)}" />`,
    `<meta property="og:title" content="${esc(o.title)}" />`,
    `<meta property="og:description" content="${esc(o.description)}" />`,
    `<meta property="og:url" content="${esc(o.url)}" />`,
    `<meta property="og:image" content="${esc(o.image)}" />`,
    `<meta property="og:locale" content="es_ES" />`,
    `<meta name="twitter:card" content="${o.large ? "summary_large_image" : "summary"}" />`,
    ...(o.noindex ? ['<meta name="robots" content="noindex" />'] : []),
  ].join("\n    ");
  return html.replace(/<title>[\s\S]*?<\/title>/, "").replace(/<meta name="description"[^>]*>/, "").replace("</head>", `    ${head}\n  </head>`);
}
