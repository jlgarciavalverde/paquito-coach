import { expect, test } from "@playwright/test";
import { expectAccessible } from "../e2e/helpers";

test("la demo se prueba con un clic y avisa de que es una demo", async ({ browser }) => {
  const coach = await (await browser.newContext({ locale: "es-ES", viewport: { width: 1360, height: 900 } })).newPage();
  await coach.goto("/");
  await expect(coach).toHaveURL(/\/acceso$/);
  await expect(coach.getByRole("note").first()).toContainText("demostración");
  await expectAccessible(coach, "acceso de la demo");
  await coach.getByRole("button", { name: "Entrar como entrenador" }).click();
  await expect(coach).toHaveURL(/\/coach$/);
  await expect(coach.getByText("Necesitan atención")).toBeVisible();
  await expect(coach.getByText(/Récord en/).first()).toBeVisible();
  await expectAccessible(coach, "hoy del entrenador (demo)");
  await coach.goto("/coach/ajustes");
  await coach.getByLabel("Contraseña actual").fill("x");
  await coach.getByLabel("Nueva contraseña").fill("otra-contraseña-larga");
  await coach.getByRole("button", { name: "Cambiar contraseña" }).click();
  await expect(coach.getByRole("alert")).toContainText("no está disponible en la demo");

  const lucia = await (await browser.newContext({ locale: "es-ES", viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
  await lucia.goto("/acceso");
  await lucia.getByRole("button", { name: /Entrar como clienta/ }).click();
  await expect(lucia).toHaveURL(/\/app$/);
  await expect(lucia.getByText("Hola, Lucía.")).toBeVisible();
  await lucia.getByRole("link", { name: "Chat" }).last().click();
  await expect(lucia.getByText("sin molestias")).toBeVisible();
  await expectAccessible(lucia, "chat de la clienta (demo)");
});
