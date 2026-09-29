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

/** G2: la paleta ⌘K lleva a las acciones de un cliente; asignar con subida de carga semanal. */
test("paleta de órdenes: asignar a Lucía con progresión de cargas", async ({ browser }) => {
  const coach = await (await browser.newContext({ locale: "es-ES", timezoneId: "Europe/Madrid", viewport: { width: 1360, height: 860 } })).newPage();
  await coach.goto("/acceso");
  await coach.getByLabel("Correo electrónico").fill("paquito@example.com");
  await coach.getByLabel("Contraseña").fill(PASSWORD);
  await coach.getByRole("button", { name: "Entrar" }).click();
  await expect(coach).toHaveURL(/\/coach$/);
  await expect(coach.getByText("Lo último que han hecho")).toBeVisible();

  await coach.keyboard.press("Control+k");
  await coach.getByRole("combobox", { name: "Buscar o hacer algo" }).fill("lucia");
  await expect(coach.getByRole("option", { name: "Asignar rutina a Lucía" })).toBeVisible();
  await expectAccessible(coach, "paleta de órdenes");
  await coach.keyboard.press("ArrowDown"); // de la ficha a «Escribir a Lucía»…
  await coach.keyboard.press("ArrowDown"); // …y a «Asignar rutina a Lucía»
  await coach.keyboard.press("Enter");

  const panel = coach.getByRole("dialog", { name: "Asignar una rutina" });
  await panel.getByLabel("Rutina").selectOption({ label: "Pierna A (2 ejercicios)" });
  await panel.getByRole("button", { name: "Lunes" }).click();
  await panel.getByRole("button", { name: "Jueves" }).click();
  await panel.getByLabel("Durante").fill("3");
  await panel.getByLabel("Carga").selectOption("kg");
  await expect(panel.getByText("70 kg a 75 kg")).toBeVisible();
  await expectAccessible(coach, "asignar con progresión");
  await panel.getByRole("button", { name: /Asignar \d+ entrenos/ }).click();
  await expect(coach.getByText(/\d+ entrenos asignados/)).toBeVisible();

  // Atajos: «?» muestra la ayuda y «g c» lleva a Clientes
  await coach.keyboard.press("?");
  await expect(coach.getByRole("dialog", { name: "Atajos de teclado" })).toBeVisible();
  await coach.keyboard.press("Escape");
  await coach.keyboard.press("g");
  await coach.keyboard.press("c");
  await expect(coach).toHaveURL(/\/coach\/clientes$/);
});
