import type { FastifyInstance, FastifyReply } from "fastify";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Ctx } from "./ctx";
import { mainStudio } from "./studio";

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

  app.get("/robots.txt", async (_req, reply) => {
    const s = await mainStudio(db);
    const lines = ["User-agent: *", ...(s?.published ? ["Allow: /$", ...PUBLIC_PAGES.slice(1).map((p) => `Allow: ${p}`)] : []), "Disallow: /", `Sitemap: ${cfg.publicUrl}/sitemap.xml`];
    return reply.type("text/plain; charset=utf-8").header("Cache-Control", "public, max-age=3600").send(lines.join("\n") + "\n");
  });

  app.get("/sitemap.xml", async (_req, reply) => {
    const s = await mainStudio(db);
    const pages = s?.published ? PUBLIC_PAGES : PUBLIC_PAGES.slice(1);
    const urls = pages.map((p) => `  <url><loc>${esc(cfg.publicUrl + p)}</loc></url>`).join("\n");
    return reply.type("application/xml; charset=utf-8").header("Cache-Control", "public, max-age=3600").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  });

  app.get("/manifest.webmanifest", async (_req, reply) => {
    const s = await mainStudio(db);
    const name = s?.name ?? "Coach";
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
  return async function sendApp(path: string, reply: FastifyReply) {
    const html = indexHtml();
    reply.header("Cache-Control", "no-store").type("text/html; charset=utf-8");
    if (!(PUBLIC_PAGES as readonly string[]).includes(path)) return reply.header("X-Robots-Tag", "noindex").send(html);
    const s = await mainStudio(db);
    if (!s) return reply.send(html);
    const page = TITLES[path];
    const home = path === "/" && s.published;
    const title = page ? `${page} · ${s.name}` : home ? `${s.name}${s.tagline ? ` · ${s.tagline}` : ""}` : s.name;
    const description = home ? (s.tagline || s.bio).slice(0, 200) : `${page ?? "Acceso"} de ${s.name}.`;
    const image = home && s.photoMediaId ? `${cfg.publicUrl}/api/v1/public/studio/photo` : `${cfg.publicUrl}/icon-512.png`;
    const head = [
      `<title>${esc(title)}</title>`,
      `<meta name="description" content="${esc(description)}" />`,
      `<link rel="canonical" href="${esc(cfg.publicUrl + path)}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="${esc(s.name)}" />`,
      `<meta property="og:title" content="${esc(title)}" />`,
      `<meta property="og:description" content="${esc(description)}" />`,
      `<meta property="og:url" content="${esc(cfg.publicUrl + path)}" />`,
      `<meta property="og:image" content="${esc(image)}" />`,
      `<meta property="og:locale" content="es_ES" />`,
      `<meta name="twitter:card" content="${home && s.photoMediaId ? "summary_large_image" : "summary"}" />`,
      ...(path === "/" && !s.published ? ['<meta name="robots" content="noindex" />'] : []),
    ].join("\n    ");
    const out = html.replace(/<title>[\s\S]*?<\/title>/, "").replace(/<meta name="description"[^>]*>/, "").replace("</head>", `    ${head}\n  </head>`);
    return reply.send(out);
  };
}
