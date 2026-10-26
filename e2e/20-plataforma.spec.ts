import { expect, test } from "@playwright/test";
import { PASSWORD, expectAccessible } from "./helpers";
import { PLATFORM } from "../playwright.config";

const SHOTS = process.env.SHOTS_DIR;
const ctx = { locale: "es-ES", timezoneId: "Europe/Madrid" } as const;

test("plataforma: un entrenador nuevo se da de alta, ve su prueba y su página en /e/<slug>", async ({ browser }) => {
  const page = await (await browser.newContext({ ...ctx, baseURL: PLATFORM, viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Tus clientes, sus entrenos y tu agenda en una sola app" })).toBeVisible();
  await expect(page.getByText("Hasta 15 clientes a la vez")).toBeVisible();
  await expectAccessible(page, "web de la plataforma (móvil)");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/plataforma-movil.png`, fullPage: true });

  await page.getByRole("link", { name: "Empezar la prueba" }).click();
  await expect(page).toHaveURL(/\/alta$/);
  await page.getByLabel("Nombre del estudio").fill("Fuerza Ána");
  await expect(page.getByLabel("Dirección de tu página")).toHaveValue("fuerza-ana");
  // Una dirección ocupada se avisa antes de enviar.
  await page.getByLabel("Dirección de tu página").fill("estudio-paquito");
  await expect(page.getByText("Esa dirección ya la usa otro estudio")).toBeVisible();
  await page.getByLabel("Dirección de tu página").fill("fuerza-ana");
  await page.getByLabel("Tu nombre y apellidos").fill("Ana Martínez");
  await page.getByLabel("Correo electrónico").fill("ana@example.com");
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByLabel(/Acepto las condiciones/).check();
  await expectAccessible(page, "alta de entrenador");
  await page.getByRole("button", { name: "Crear mi estudio" }).click();
  await expect(page).toHaveURL(/\/coach$/);

  await page.goto("/coach/plan");
  await expect(page.getByText("En prueba")).toBeVisible();
  await expect(page.getByText("0 de 5")).toBeVisible();
  await expect(page.getByRole("button", { name: "Elegir Pro" })).toBeEnabled();
  await expectAccessible(page, "plan del estudio");

  // Publica su página y se ve en /e/fuerza-ana
  await page.goto("/coach/ajustes");
  const block = page.locator("section", { has: page.getByRole("heading", { name: "Tu estudio y tu página pública" }) });
  await block.getByLabel("Publicar mi página en la dirección de la app").check();
  await block.getByLabel("Frase de presentación").fill("Fuerza para todas");
  await block.getByLabel("Quién eres").fill("Entrenadora de fuerza en Cartagena.");
  await block.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado. Tu página está publicada.")).toBeVisible();
  const visitor = await (await browser.newContext({ ...ctx, baseURL: PLATFORM })).newPage();
  await visitor.goto("/e/fuerza-ana");
  await expect(visitor.getByRole("heading", { level: 1, name: "Fuerza Ána" })).toBeVisible();
  await visitor.getByRole("link", { name: "Aviso legal" }).click();
  await expect(visitor.getByText("Ana Martínez")).toBeVisible();
  await visitor.goto("/e/no-existe");
  await expect(visitor.getByRole("heading", { level: 1 })).not.toHaveText("Fuerza Ána");
});

test("plataforma: el estudio de Paquito sigue en su dominio y la administración ve los estudios", async ({ browser }) => {
  const visitor = await (await browser.newContext(ctx)).newPage();
  await visitor.goto("/");
  await expect(visitor.getByRole("heading", { level: 1, name: "Estudio Paquito" })).toBeVisible();

  const admin = await (await browser.newContext({ ...ctx, baseURL: PLATFORM, viewport: { width: 1360, height: 860 } })).newPage();
  await admin.goto("/alta");
  await admin.getByLabel("Nombre del estudio").fill("Administración");
  await admin.getByLabel("Dirección de tu página").fill("administracion");
  await admin.getByLabel("Tu nombre y apellidos").fill("José Luis");
  await admin.getByLabel("Correo electrónico").fill("admin@example.com");
  await admin.getByLabel("Contraseña").fill(PASSWORD);
  await admin.getByLabel(/Acepto las condiciones/).check();
  await admin.getByRole("button", { name: "Crear mi estudio" }).click();
  await expect(admin).toHaveURL(/\/coach$/);
  await admin.goto("/coach/ajustes");
  await admin.getByRole("link", { name: "Administrar la plataforma" }).click();
  await expect(admin.getByRole("heading", { level: 1, name: "Plataforma" })).toBeVisible();
  await admin.getByRole("button", { name: /Fuerza Ána/ }).click();
  const panel = admin.getByRole("dialog");
  await panel.getByLabel("Plan").selectOption("fundador");
  await panel.getByRole("button", { name: "Cambiar plan" }).click();
  await expect(admin.getByText("Guardado.")).toBeVisible();
  await expectAccessible(admin, "administración");
  if (SHOTS) await admin.screenshot({ path: `${SHOTS}/administracion.png` });
  await admin.keyboard.press("Escape");

  // Registro propio de errores: un fallo sin capturar en el navegador llega a Admin → Errores.
  await admin.evaluate(() => setTimeout(() => { throw new Error("Fallo de prueba e2e del cuaderno"); }, 0));
  await admin.waitForTimeout(500);
  await admin.reload();
  await admin.getByRole("tab", { name: /Errores/ }).click();
  await expect(admin.getByText("Error: Fallo de prueba e2e del cuaderno", { exact: true })).toBeVisible();
  await expectAccessible(admin, "errores de la plataforma");
  await admin.getByRole("button", { name: "Marcar resuelto" }).first().click();
  await expect(admin.getByText("Ningún error sin resolver.")).toBeVisible();
});
