import { expect, test } from "@playwright/test";
import { PASSWORD, expectAccessible } from "./helpers";

/** H2: programa de varias semanas con subida de carga, aplicado a un cliente y terminado antes de tiempo. */
test("programa de 3 semanas: crear, aplicar a Pepe y terminarlo", async ({ browser }) => {
  const coach = await (await browser.newContext({ locale: "es-ES", timezoneId: "Europe/Madrid", viewport: { width: 1360, height: 860 } })).newPage();
  await coach.goto("/acceso");
  await coach.getByLabel("Correo electrónico").fill("paquito@example.com");
  await coach.getByLabel("Contraseña").fill(PASSWORD);
  await coach.getByRole("button", { name: "Entrar" }).click();
  await expect(coach).toHaveURL(/\/coach$/);
  await coach.goto("/coach/entrenos?vista=programas");
  await coach.getByRole("link", { name: "Nuevo programa" }).click();
  await coach.getByLabel("Nombre del programa").fill("Fuerza base");
  await coach.getByLabel("Semanas", { exact: true }).fill("3");
  await coach.getByLabel("Semana 1, Lunes").selectOption({ label: "Pierna A" });
  await coach.getByLabel("Semana 1, Jueves").selectOption({ label: "Pierna A" });
  await coach.getByRole("button", { name: "Copiar la semana 1 a todas" }).click();
  await expect(coach.getByLabel("Semana 3, Jueves")).toHaveValue(/.+/);
  await coach.getByLabel("Carga").selectOption("kg");
  await expectAccessible(coach, "editor de programa");
  await coach.getByRole("button", { name: "Crear programa" }).click();
  await expect(coach.getByText("Programa creado")).toBeVisible();
  await coach.getByRole("button", { name: "Aplicar a clientes" }).click();
  const panel = coach.getByRole("dialog");
  await panel.getByLabel("Pepe Gómez").check();
  await expect(panel.getByText("La carga sube 2,5 kg cada semana.")).toBeVisible();
  await panel.getByRole("button", { name: /Crear \d+ entrenos/ }).click();
  await expect(coach.getByText(/\d+ entrenos programados/)).toBeVisible();

  await coach.goto("/coach/clientes");
  await coach.getByRole("link", { name: /Pepe Gómez/ }).click();
  await expect(coach.getByText("Fuerza base")).toBeVisible();
  await expect(coach.getByText(/semana 2 de 3/).first()).toBeVisible();
  await expectAccessible(coach, "ficha con programa en curso");
  await coach.getByRole("button", { name: "Terminar ya" }).click();
  await coach.getByRole("dialog").getByRole("button", { name: "Terminar programa" }).click();
  await expect(coach.getByText(/\d+ entrenos quitados/)).toBeVisible();
  await expect(coach.getByRole("button", { name: "Terminar ya" })).toHaveCount(0);
});
