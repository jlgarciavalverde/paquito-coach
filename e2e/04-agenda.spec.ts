import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, expectAccessible } from "./helpers";

/** F4: el entrenador crea una cita con Lucía, la mueve arrastrando, y Lucía la ve en su agenda y en «Hoy». */
test.describe.configure({ mode: "serial" });

let coach: Page;

test("crea una cita desde la agenda", async ({ browser }) => {
  coach = await (await browser.newContext({ locale: "es-ES", timezoneId: "Europe/Madrid", viewport: { width: 1360, height: 960 } })).newPage();
  await coach.goto("/acceso");
  await coach.getByLabel("Correo electrónico").fill("paquito@example.com");
  await coach.getByLabel("Contraseña").fill(PASSWORD);
  await coach.getByRole("button", { name: "Entrar" }).click();
  await coach.getByRole("link", { name: "Agenda" }).first().click();
  await expect(coach.getByRole("radio", { name: "semana" })).toBeChecked();
  await expectAccessible(coach, "agenda semanal");

  await coach.getByRole("button", { name: "Nueva cita" }).click();
  await coach.getByLabel("Cliente").last().selectOption({ label: "Lucía Martínez" });
  await coach.getByLabel("Hora").fill("20:00");
  await coach.getByLabel("Lugar").fill("Estudio");
  await expectAccessible(coach, "nueva cita");
  await coach.getByRole("button", { name: "Crear cita" }).click();
  await expect(coach.getByText("Cita creada")).toBeVisible();
  await expect(coach.getByRole("button", { name: /Sesión con Lucía Martínez, .* de 20:00 a 21:00/ })).toBeVisible();
});

test("la mueve arrastrando una hora antes", async () => {
  const appt = coach.getByRole("button", { name: /Sesión con Lucía Martínez, .* de 20:00 a 21:00/ });
  await appt.scrollIntoViewIfNeeded();
  await coach.mouse.wheel(0, 200); // que quede espacio por encima y por debajo para arrastrar
  const box = (await appt.boundingBox())!;
  await coach.mouse.move(box.x + 30, box.y + 10);
  await coach.mouse.down();
  await coach.mouse.move(box.x + 30, box.y - 20, { steps: 5 });
  await coach.mouse.move(box.x + 30, box.y - 38, { steps: 5 });
  await coach.mouse.up();
  await expect(coach.getByText("Cita movida")).toBeVisible();
  await expect(coach.getByRole("button", { name: /Sesión con Lucía Martínez, .* de 19:00 a 20:00/ })).toBeVisible();
  // Mes y lista
  await coach.getByRole("radio", { name: "mes" }).click();
  await expect(coach.getByRole("button", { name: /Sesión con Lucía Martínez, 19:00/ })).toBeVisible();
  await expectAccessible(coach, "agenda mensual");
  await coach.getByRole("radio", { name: "lista" }).click();
  await expect(coach.getByText("19:00–20:00")).toBeVisible();
});

test("Lucía la ve en su agenda y en Hoy", async ({ browser }) => {
  const lucia = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: "es-ES", timezoneId: "Europe/Madrid" })).newPage();
  await lucia.goto("/acceso");
  await lucia.getByLabel("Correo electrónico").fill("lucia@example.com");
  await lucia.getByLabel("Contraseña").fill("contraseña-nueva-lucia");
  await lucia.getByRole("button", { name: "Entrar" }).click();
  await expect(lucia.getByText("Próxima sesión")).toBeVisible();
  await expect(lucia.getByText(/Hoy, 19:00/)).toBeVisible();
  await lucia.getByRole("link", { name: "Agenda" }).last().click();
  await expect(lucia.getByText("19:00–20:00")).toBeVisible();
  await expectAccessible(lucia, "agenda del cliente");
});

test("ninguna pantalla desborda en horizontal en el móvil", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", storageState: await coach.context().storageState() });
  const p = await ctx.newPage();
  for (const path of ["/coach", "/coach/clientes", "/coach/entrenos", "/coach/entrenos?vista=ejercicios", "/coach/nutricion", "/coach/calendario", "/coach/ajustes", "/galeria"]) {
    await p.goto(path);
    await p.waitForTimeout(500);
    expect(await p.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(390);
  }
});
