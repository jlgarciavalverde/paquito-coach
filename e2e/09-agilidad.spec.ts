import { expect, test } from "@playwright/test";
import { PASSWORD, expectAccessible } from "./helpers";

/** G1: revisar lo que han hecho y responder sin salir de «Hoy». */
test("responde a un entreno desde su detalle y marca todo como revisado", async ({ browser }) => {
  const coach = await (await browser.newContext({ locale: "es-ES", timezoneId: "Europe/Madrid" })).newPage();
  await coach.goto("/acceso");
  await coach.getByLabel("Correo electrónico").fill("paquito@example.com");
  await coach.getByLabel("Contraseña").fill(PASSWORD);
  await coach.getByRole("button", { name: "Entrar" }).click();

  await coach.getByText("terminó Pierna A, esfuerzo 8/10").click();
  await expect(coach.getByText(/series? menos/).first()).toBeVisible();
  await coach.getByLabel("Responder a Lucía").fill("Muy bien, la semana que viene subimos.");
  await expectAccessible(coach, "detalle de entreno con respuesta");
  await coach.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(coach.getByText("Enviado a Lucía")).toBeVisible();
  await coach.keyboard.press("Escape");

  await expect(coach.getByLabel("Responder a Lucía")).toHaveCount(0);
  await coach.goto("/coach/chat");
  await coach.getByRole("button", { name: /Lucía Martínez/ }).first().click();
  await expect(coach.getByRole("log").getByText(/Sobre tu entreno «Pierna A».*la semana que viene subimos/)).toBeVisible();

  await coach.getByRole("link", { name: "Hoy" }).first().click();
  const markAll = coach.getByRole("button", { name: "Marcar todo como revisado" });
  if (await markAll.isVisible()) {
    await coach.getByLabel(/Solo sin revisar/).check();
    await markAll.click();
    await expect(coach.getByText("Todo revisado.")).toBeVisible();
  }
});
