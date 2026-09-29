import { expect, test } from "@playwright/test";
import { PASSWORD, expectAccessible } from "./helpers";

/** H3b: Paquito abre reservas; Lucía reserva una sesión y la cancela. */
test("reservas: configurar, reservar y cancelar", async ({ browser }) => {
  const coach = await (await browser.newContext({ locale: "es-ES", timezoneId: "Europe/Madrid", viewport: { width: 1360, height: 860 } })).newPage();
  await coach.goto("/acceso");
  await coach.getByLabel("Correo electrónico").fill("paquito@example.com");
  await coach.getByLabel("Contraseña").fill(PASSWORD);
  await coach.getByRole("button", { name: "Entrar" }).click();
  await expect(coach).toHaveURL(/\/coach$/);
  await coach.goto("/coach/ajustes");
  await coach.getByLabel("Permitir que los clientes reserven").check();
  for (let i = 0; i < 7; i++) await coach.getByRole("button", { name: "Añadir franja" }).click();
  await coach.getByLabel("Lugar").fill("Estudio Paquito");
  await expectAccessible(coach, "ajustes de reservas");
  await coach.getByRole("button", { name: "Guardar reservas" }).click();
  await expect(coach.getByText("Reservas guardadas")).toBeVisible();

  const lucia = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "es-ES", timezoneId: "Europe/Madrid" })).newPage();
  await lucia.goto("/acceso");
  await lucia.getByLabel("Correo electrónico").fill("lucia@example.com");
  await lucia.getByLabel("Contraseña").fill("contraseña-nueva-lucia");
  await lucia.getByRole("button", { name: "Entrar" }).click();
  await expect(lucia).toHaveURL(/\/app$/);
  await lucia.goto("/app/agenda");
  await lucia.getByRole("link", { name: "Reservar sesión" }).click();
  // El tercer día con huecos está siempre a más de 24 h: se podrá cancelar
  await lucia.getByRole("radiogroup", { name: "Día" }).getByRole("radio").nth(2).click();
  await lucia.getByRole("radiogroup", { name: "Hora" }).getByRole("radio").first().click();
  await expectAccessible(lucia, "reservar sesión");
  await lucia.getByRole("button", { name: /^Reservar / }).click();
  await expect(lucia.getByText(/^Reservada:/)).toBeVisible();
  await expect(lucia).toHaveURL(/\/app\/agenda$/);
  await expect(lucia.getByText("Estudio Paquito").first()).toBeVisible();
  await lucia.getByRole("button", { name: "Cancelar" }).last().click();
  await lucia.getByRole("dialog").getByRole("button", { name: "Cancelar sesión" }).click();
  await expect(lucia.getByText("Sesión cancelada")).toBeVisible();
});
