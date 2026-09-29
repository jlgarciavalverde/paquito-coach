import { expect, test } from "@playwright/test";
import { PASSWORD, expectAccessible } from "./helpers";

/** H4: material para clientes, informes del estudio y constancia del cliente. */
test("material, informes y constancia", async ({ browser }) => {
  const coach = await (await browser.newContext({ locale: "es-ES", timezoneId: "Europe/Madrid", viewport: { width: 1360, height: 860 } })).newPage();
  await coach.goto("/acceso");
  await coach.getByLabel("Correo electrónico").fill("paquito@example.com");
  await coach.getByLabel("Contraseña").fill(PASSWORD);
  await coach.getByRole("button", { name: "Entrar" }).click();
  await expect(coach).toHaveURL(/\/coach$/);
  await coach.goto("/coach/seguimiento");
  await coach.getByRole("button", { name: "Añadir material" }).click();
  await coach.getByLabel("Título").fill("Movilidad de tobillo");
  await coach.getByLabel("Enlace").fill("https://www.youtube.com/watch?v=abc123");
  await expectAccessible(coach, "añadir material");
  await coach.getByRole("dialog").getByRole("button", { name: "Añadir" }).click();
  await expect(coach.getByText("Material añadido")).toBeVisible();

  await coach.getByRole("link", { name: "Hoy" }).first().click();
  await coach.getByRole("link", { name: "Ver informes" }).click();
  await expect(coach.getByText(/clientes? activos?/)).toBeVisible();
  await expectAccessible(coach, "informes");

  const lucia = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: "es-ES", timezoneId: "Europe/Madrid" })).newPage();
  await lucia.goto("/acceso");
  await lucia.getByLabel("Correo electrónico").fill("lucia@example.com");
  await lucia.getByLabel("Contraseña").fill("contraseña-nueva-lucia");
  await lucia.getByRole("button", { name: "Entrar" }).click();
  await expect(lucia).toHaveURL(/\/app$/);
  await expect(lucia.getByRole("heading", { name: "Tu constancia" })).toBeVisible();
  await lucia.getByRole("link", { name: "Material nuevo: Movilidad de tobillo" }).click();
  await expect(lucia.getByRole("link", { name: /Movilidad de tobillo/ })).toHaveAttribute("href", "https://www.youtube.com/watch?v=abc123");
  await expectAccessible(lucia, "material del cliente");
});
