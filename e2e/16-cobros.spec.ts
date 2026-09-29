import { expect, test } from "@playwright/test";
import { PASSWORD, expectAccessible } from "./helpers";

/** C1: tarifa de bono, Lucía lo compra (pasarela simulada) y se le activa; Paquito manda un enlace de pago. */
test("cobros: tarifa, compra del bono y enlace de pago", async ({ browser }) => {
  const coach = await (await browser.newContext({ locale: "es-ES", timezoneId: "Europe/Madrid", viewport: { width: 1360, height: 860 } })).newPage();
  await coach.goto("/acceso");
  await coach.getByLabel("Correo electrónico").fill("paquito@example.com");
  await coach.getByLabel("Contraseña").fill(PASSWORD);
  await coach.getByRole("button", { name: "Entrar" }).click();
  await expect(coach).toHaveURL(/\/coach$/);
  await coach.goto("/coach/ajustes");
  await expect(coach.getByText(/Stripe en modo de prueba/)).toBeVisible();
  await coach.getByRole("button", { name: "Nueva tarifa" }).click();
  await coach.getByLabel("Nombre").fill("Bono 5 sesiones");
  await coach.getByLabel("Precio").fill("150");
  await coach.getByLabel("Sesiones").fill("5");
  await expectAccessible(coach, "nueva tarifa");
  await coach.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();
  await expect(coach.getByText("Tarifa guardada")).toBeVisible();

  const lucia = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: "es-ES", timezoneId: "Europe/Madrid" })).newPage();
  await lucia.goto("/acceso");
  await lucia.getByLabel("Correo electrónico").fill("lucia@example.com");
  await lucia.getByLabel("Contraseña").fill("contraseña-nueva-lucia");
  await lucia.getByRole("button", { name: "Entrar" }).click();
  await expect(lucia).toHaveURL(/\/app$/);
  await lucia.goto("/app/pagos");
  await expectAccessible(lucia, "pagos del cliente");
  await lucia.getByRole("button", { name: "Comprar" }).click();
  await expect(lucia).toHaveURL(/simulado=/);
  await lucia.getByRole("button", { name: "Simular pago" }).click();
  await expect(lucia.getByText("Pagado")).toBeVisible();
  await expect(lucia.getByRole("link", { name: "Recibo" })).toBeVisible();

  await coach.goto("/coach/clientes");
  await coach.getByRole("link", { name: /Lucía Martínez/ }).click();
  await coach.getByRole("tab", { name: "Agenda" }).click();
  await expect(coach.getByText("Bono 5 sesiones").first()).toBeVisible();
  await coach.getByRole("button", { name: "Nuevo cobro" }).click();
  await coach.getByLabel("Concepto").fill("Valoración inicial");
  await coach.getByLabel("Importe").fill("45");
  await coach.getByRole("button", { name: "Crear enlace de pago" }).click();
  await expect(coach.getByRole("dialog", { name: "Enlace de pago" })).toBeVisible();
  await expect(coach.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", /wa\.me/);
  await expectAccessible(coach, "enlace de pago");
});
