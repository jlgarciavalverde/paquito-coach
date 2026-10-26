import { mkdirSync } from "node:fs";
import { test, type Browser, type Page } from "@playwright/test";

/**
 * Capturas de todas las pantallas sobre la semilla de la demo (tanda D, auditoría de diseño): móvil 390×844 y escritorio
 * 1360×860, claro y oscuro. Solo corre con `SHOTS_DIR=/ruta pnpm e2e:demo`; no comprueba nada (para eso están los e2e).
 */
const SHOTS = process.env.SHOTS_DIR;
test.skip(!SHOTS, "Solo con SHOTS_DIR");
test.setTimeout(10 * 60_000);

const COACH = [
  ["hoy", "/coach"],
  ["clientes", "/coach/clientes"],
  ["entrenos", "/coach/entrenos"],
  ["programas", "/coach/entrenos?vista=programas"],
  ["ejercicios", "/coach/entrenos?vista=ejercicios"],
  ["nutricion", "/coach/nutricion"],
  ["agenda", "/coach/calendario"],
  ["mensajes", "/coach/chat"],
  ["seguimiento", "/coach/seguimiento"],
  ["ia", "/coach/ia"],
  ["informes", "/coach/informes"],
  ["ajustes", "/coach/ajustes"],
  ["plan", "/coach/plan"],
] as const;
const CLIENT = [
  ["hoy", "/app"],
  ["entrenos", "/app/entreno"],
  ["comidas", "/app/comidas"],
  ["agenda", "/app/agenda"],
  ["reservar", "/app/reservar"],
  ["progreso", "/app/progreso"],
  ["mensajes", "/app/chat"],
  ["material", "/app/material"],
  ["pagos", "/app/pagos"],
  ["salud", "/app/salud"],
  ["perfil", "/app/perfil"],
] as const;
const VIEWS = [
  { name: "movil", viewport: { width: 390, height: 844 }, isMobile: true },
  { name: "escritorio", viewport: { width: 1360, height: 860 }, isMobile: false },
] as const;
const SCHEMES = ["light", "dark"] as const;

async function shot(page: Page, dir: string, name: string) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(500); // entradas animadas
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

async function session(browser: Browser, who: "entrenador" | "clienta", view: (typeof VIEWS)[number], scheme: (typeof SCHEMES)[number]) {
  const page = await (await browser.newContext({ locale: "es-ES", timezoneId: "Europe/Madrid", viewport: view.viewport, isMobile: view.isMobile, colorScheme: scheme })).newPage();
  await page.goto("/acceso");
  await page.getByRole("button", { name: who === "entrenador" ? "Entrar como entrenador" : /Entrar como clienta/ }).click();
  await page.waitForURL(who === "entrenador" ? /\/coach$/ : /\/app$/);
  return page;
}

for (const view of VIEWS) {
  for (const scheme of SCHEMES) {
    test(`capturas ${view.name} ${scheme}`, async ({ browser }) => {
      const dir = `${SHOTS}/${view.name}-${scheme}`;
      mkdirSync(dir, { recursive: true });

      const pub = await (await browser.newContext({ locale: "es-ES", viewport: view.viewport, isMobile: view.isMobile, colorScheme: scheme })).newPage();
      await pub.goto("/acceso");
      await shot(pub, dir, "00-acceso");

      const coach = await session(browser, "entrenador", view, scheme);
      for (const [i, [name, path]] of COACH.entries()) {
        await coach.goto(path);
        await shot(coach, dir, `e${String(i + 1).padStart(2, "0")}-${name}`);
      }
      // Ficha de un cliente (la primera de la lista) y detalle de la primera rutina.
      await coach.goto("/coach/clientes");
      await coach.locator('a[href^="/coach/clientes/"]').first().click();
      await shot(coach, dir, "e20-ficha");
      await coach.goto("/coach/entrenos");
      await coach.locator('a[href^="/coach/entrenos/"]').first().click();
      await shot(coach, dir, "e21-rutina");
      // Una hoja abierta (lateral en escritorio, inferior en el móvil): nueva cita desde la agenda.
      await coach.goto("/coach/calendario");
      await coach.getByRole("button", { name: "Nueva cita" }).first().click();
      await coach.getByRole("dialog").waitFor();
      await coach.waitForTimeout(400);
      await coach.screenshot({ path: `${dir}/e22-hoja.png` });

      const client = await session(browser, "clienta", view, scheme);
      for (const [i, [name, path]] of CLIENT.entries()) {
        await client.goto(path);
        await shot(client, dir, `c${String(i + 1).padStart(2, "0")}-${name}`);
      }
      // El cuaderno de series: el entreno de hoy desde «Empezar».
      await client.goto("/app");
      await client.getByRole("link", { name: "Empezar" }).or(client.getByRole("button", { name: "Empezar" })).first().click();
      await client.waitForURL(/\/app\/entreno\/.+/);
      await shot(client, dir, "c20-cuaderno");
    });
  }
}
