import { expect, test } from "@playwright/test";
import { PASSWORD, expectAccessible } from "./helpers";

/** I1: generar una rutina y un plan de comidas con la IA (respuestas de ejemplo en e2e) y abrirlos en los editores. */
test("IA: rutina al editor y plan de comidas como plantilla", async ({ browser }) => {
  const coach = await (await browser.newContext({ locale: "es-ES", timezoneId: "Europe/Madrid", viewport: { width: 1360, height: 860 } })).newPage();
  await coach.goto("/acceso");
  await coach.getByLabel("Correo electrónico").fill("paquito@example.com");
  await coach.getByLabel("Contraseña").fill(PASSWORD);
  await coach.getByRole("button", { name: "Entrar" }).click();
  await expect(coach).toHaveURL(/\/coach$/);
  await coach.getByRole("link", { name: "IA" }).first().click();
  await expect(coach.getByText(/Hoy llevas 0 de/)).toBeVisible();
  await expectAccessible(coach, "página de IA");

  await coach.getByRole("button", { name: /^Rutina/ }).click();
  const panel = coach.getByRole("dialog");
  await panel.getByLabel("Qué quieres", { exact: true }).fill("Pierna, fuerza, rodilla operada");
  await panel.getByLabel("Para").selectOption({ label: "Lucía Martínez" });
  await panel.getByLabel("Tener en cuenta sus lesiones y limitaciones").check();
  await expectAccessible(coach, "panel de IA");
  await panel.getByRole("button", { name: "Generar borrador" }).click();
  await expect(panel.getByText("Pierna: fuerza y control")).toBeVisible();
  await panel.getByRole("button", { name: "Abrir en el editor" }).click();
  await expect(coach).toHaveURL(/\/coach\/entrenos\/nueva$/);
  await expect(coach.getByLabel("Nombre de la rutina")).toHaveValue("Pierna: fuerza y control");
  await coach.getByRole("button", { name: "Crear rutina" }).click();
  await expect(coach.getByText("Rutina creada")).toBeVisible();

  await coach.keyboard.press("Control+k");
  await coach.getByRole("combobox", { name: "Buscar o hacer algo" }).fill("plan de comidas con ia");
  await coach.keyboard.press("Enter");
  await coach.getByRole("dialog").getByLabel("Objetivo").fill("Perder grasa manteniendo la fuerza");
  await coach.getByRole("dialog").getByRole("button", { name: "Generar borrador" }).click();
  await expect(coach.getByRole("dialog").getByText("Día tipo, 2.100 kcal")).toBeVisible();
  await coach.getByRole("dialog").getByRole("button", { name: "Crear plantilla y revisarla" }).click();
  await expect(coach).toHaveURL(/\/coach\/nutricion\/[0-9a-f-]{36}$/);
  await expect(coach.getByText("Plantilla creada")).toBeVisible();
});
