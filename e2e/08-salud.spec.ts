import { expect, test } from "@playwright/test";
import { PASSWORD, expectAccessible } from "./helpers";

/** F8: Lucía rellena el PAR-Q y la anamnesis; Paquito ve la alerta en «Hoy» y en la ficha, lee las respuestas y lo revisa. */
test("cuestionario de salud con alerta", async ({ browser }) => {
  const lucia = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: "es-ES" })).newPage();
  await lucia.goto("/acceso");
  await lucia.getByLabel("Correo electrónico").fill("lucia@example.com");
  await lucia.getByLabel("Contraseña").fill("contraseña-nueva-lucia");
  await lucia.getByRole("button", { name: "Entrar" }).click();
  await lucia.getByRole("link", { name: "Rellenarlo ahora" }).click();
  const send = lucia.getByRole("button", { name: /^Enviar a/ });
  await expect(send).toBeDisabled();
  const radios = lucia.getByRole("radiogroup");
  for (let i = 0; i < 7; i++) await radios.nth(i).getByRole("radio", { name: i === 5 ? "Sí" : "No" }).click();
  await lucia.getByLabel("Operaciones").fill("Plastia de LCA en marzo de 2026");
  await lucia.getByRole("radio", { name: "3" }).click();
  await lucia.getByLabel("Dónde te duele").fill("Rodilla izquierda al bajar escaleras");
  await expectAccessible(lucia, "cuestionario rellenado");
  await send.click();
  await expect(lucia).toHaveURL(/\/app$/);
  await expect(lucia.getByText("Antes de empezar: tu cuestionario de salud")).toHaveCount(0);

  const coach = await (await browser.newContext({ locale: "es-ES" })).newPage();
  await coach.goto("/acceso");
  await coach.getByLabel("Correo electrónico").fill("paquito@example.com");
  await coach.getByLabel("Contraseña").fill(PASSWORD);
  await coach.getByRole("button", { name: "Entrar" }).click();
  await expect(coach.getByText("Cuestionarios de salud por revisar")).toBeVisible();
  await coach.getByRole("link", { name: /Lucía Martínez.*1 alerta/ }).click();
  await expect(coach.getByText("Cuestionario de salud: 1 respuesta de riesgo")).toBeVisible();
  await coach.getByRole("button", { name: "Ver respuestas" }).first().click();
  await expect(coach.getByText("Plastia de LCA en marzo de 2026")).toBeVisible();
  await expectAccessible(coach, "respuestas del cuestionario");
  await coach.keyboard.press("Escape");
  await coach.getByRole("button", { name: "Marcar como revisado" }).click();
  await expect(coach.getByText("Cuestionario de salud: 1 respuesta de riesgo")).toHaveCount(0);
  await coach.getByRole("tab", { name: "Ficha" }).click();
  await expect(coach.getByText(/1 alerta, revisado el/)).toBeVisible();
});
