import { expect, test } from "@playwright/test";
import { PASSWORD, expectAccessible } from "./helpers";

/** H3: bono de 10 sesiones; marcar la cita como hecha descuenta y Lucía ve lo que le queda. */
test("bono de sesiones: crear, descontar al marcar la cita y verlo el cliente", async ({ browser }) => {
  const coach = await (await browser.newContext({ locale: "es-ES", timezoneId: "Europe/Madrid", viewport: { width: 1360, height: 860 } })).newPage();
  await coach.goto("/acceso");
  await coach.getByLabel("Correo electrónico").fill("paquito@example.com");
  await coach.getByLabel("Contraseña").fill(PASSWORD);
  await coach.getByRole("button", { name: "Entrar" }).click();
  await expect(coach).toHaveURL(/\/coach$/);
  await coach.goto("/coach/clientes");
  await coach.getByRole("link", { name: /Lucía Martínez/ }).click();
  await coach.getByRole("tab", { name: "Agenda" }).click();
  await coach.getByRole("button", { name: "Nuevo bono" }).click();
  await coach.getByLabel("Precio").fill("300");
  await coach.getByLabel("Pagado").check();
  await expectAccessible(coach, "nuevo bono");
  await coach.getByRole("button", { name: "Crear bono" }).click();
  await expect(coach.getByText("Quedan 10")).toBeVisible();

  await coach.getByRole("button", { name: /Sesión con Lucía Martínez/ }).first().click();
  await coach.getByRole("radiogroup", { name: "Asistencia" }).getByRole("radio", { name: "Hecha" }).click();
  await expect(coach.getByText("Hecha: descontada del bono")).toBeVisible();
  await expectAccessible(coach, "cita con asistencia");
  await coach.keyboard.press("Escape");
  await expect(coach.getByText("Quedan 9")).toBeVisible();

  const lucia = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: "es-ES", timezoneId: "Europe/Madrid" })).newPage();
  await lucia.goto("/acceso");
  await lucia.getByLabel("Correo electrónico").fill("lucia@example.com");
  await lucia.getByLabel("Contraseña").fill("contraseña-nueva-lucia");
  await lucia.getByRole("button", { name: "Entrar" }).click();
  await expect(lucia).toHaveURL(/\/app$/);
  await lucia.goto("/app/agenda");
  await expect(lucia.getByText("Te quedan 9 sesiones de 10")).toBeVisible();
});
