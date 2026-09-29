import { expect, test } from "@playwright/test";
import { PASSWORD, expectAccessible } from "./helpers";

/** F7: el cliente anota peso y medidas; el entrenador ve su progreso (peso y cargas) en la ficha. */
test("peso, medidas y cargas", async ({ browser }) => {
  const lucia = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: "es-ES" })).newPage();
  await lucia.goto("/acceso");
  await lucia.getByLabel("Correo electrónico").fill("lucia@example.com");
  await lucia.getByLabel("Contraseña").fill("contraseña-nueva-lucia");
  await lucia.getByRole("button", { name: "Entrar" }).click();
  await lucia.getByRole("link", { name: "Entreno" }).last().click();
  await lucia.getByRole("link", { name: "Ver mi progreso" }).click();
  await expect(lucia.getByText("Aún no has anotado tu peso.")).toBeVisible();

  for (const [date, w] of [["2026-09-01", "65,4"], ["2026-09-15", "64,8"]] as const) {
    await lucia.getByRole("button", { name: /Anotar/ }).first().click();
    await lucia.getByLabel("Día").fill(date);
    await lucia.getByRole("textbox", { name: "Peso", exact: true }).fill(w);
    await lucia.getByRole("textbox", { name: "Cintura", exact: true }).fill("72");
    await lucia.getByRole("button", { name: "Guardar medidas" }).click();
    await expect(lucia.getByText("Medidas guardadas")).toBeVisible();
  }
  await expect(lucia.getByText(/-0,6 kg desde el 1/)).toBeVisible();
  await expect(lucia.getByRole("img", { name: "Evolución del peso" })).toBeVisible();
  // Cargas del entreno de 02-entrenamiento (sentadilla a 70 kg)
  await expect(lucia.getByRole("button", { name: /Sentadilla trasera/ })).toBeVisible();
  await expectAccessible(lucia, "progreso del cliente");
  await lucia.getByRole("button", { name: "Ver los datos en tabla" }).first().click();
  await expect(lucia.getByRole("cell", { name: "64,8 kg" })).toBeVisible();

  const coach = await (await browser.newContext({ locale: "es-ES", colorScheme: "dark" })).newPage();
  await coach.goto("/acceso");
  await coach.getByLabel("Correo electrónico").fill("paquito@example.com");
  await coach.getByLabel("Contraseña").fill(PASSWORD);
  await coach.getByRole("button", { name: "Entrar" }).click();
  await expect(coach).toHaveURL(/\/coach$/);
  await coach.getByRole("link", { name: "Clientes" }).first().click();
  await coach.getByRole("link", { name: /Lucía Martínez/ }).click();
  await coach.getByRole("tab", { name: "Progreso" }).click();
  await expect(coach.getByText("64,8 kg").first()).toBeVisible();
  await expect(coach.getByRole("img", { name: /Progresión en Sentadilla trasera/ })).toBeVisible();
  await expectAccessible(coach, "progreso en la ficha (oscuro)");
});
