import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, expectAccessible } from "./helpers";

/** F3: plantilla de comidas → aplicarla a Lucía → Lucía marca comidas → el entrenador ve el cumplimiento. */
test.describe.configure({ mode: "serial" });

let coach: Page;

test("el entrenador crea una plantilla de comidas", async ({ browser }) => {
  coach = await (await browser.newContext({ locale: "es-ES" })).newPage();
  await coach.goto("/acceso");
  await coach.getByLabel("Correo electrónico").fill("paquito@example.com");
  await coach.getByLabel("Contraseña").fill(PASSWORD);
  await coach.getByRole("button", { name: "Entrar" }).click();
  await coach.getByRole("link", { name: "Nutrición" }).first().click();
  await expect(coach.getByText("Aún no tienes plantillas")).toBeVisible();
  await expectAccessible(coach, "nutrición vacía");
  await coach.getByRole("button", { name: "Nueva plantilla" }).click();
  await expect(coach.getByText("Plantilla de plan de comidas")).toBeVisible();

  await coach.getByLabel("Nombre del plan").fill("Definición 2.000");
  await coach.getByLabel("Kcal").fill("2000");
  await coach.getByLabel("Proteína").fill("140");
  await coach.getByRole("button", { name: "Desayuno" }).click();
  await coach.getByLabel("Alimento", { exact: true }).last().fill("Avena");
  await coach.getByLabel(/Cantidad de/).last().fill("60 g");
  await coach.getByLabel("Alternativas").last().fill("Dos tostadas integrales");
  await coach.getByRole("button", { name: "Comida", exact: true }).click();
  await coach.getByLabel("Alimento", { exact: true }).last().fill("Arroz");
  await coach.getByLabel(/Cantidad de/).last().fill("80 g");
  await expectAccessible(coach, "editor de plan de comidas");
  await coach.getByRole("button", { name: "Guardar plan" }).click();
  await expect(coach.getByText("Plan guardado")).toBeVisible();

  // Distinto cada día: aparecen las 7 pestañas con la copia de las comidas
  await coach.getByRole("radio", { name: "Distinto cada día" }).click();
  await expect(coach.getByRole("tab", { name: /Domingo/ })).toContainText("2 comidas");
});

test("la aplica a Lucía", async () => {
  coach.once("dialog", (d) => d.accept());
  await coach.goto("/coach/nutricion");
  await coach.getByRole("button", { name: "Aplicar a clientes" }).click();
  await coach.getByLabel("Lucía Martínez").check();
  await coach.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(coach.getByText("Plan aplicado")).toBeVisible();
});

test("Lucía ve el plan y marca el desayuno", async ({ browser }) => {
  const lucia = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "es-ES" })).newPage();
  await lucia.goto("/acceso");
  await lucia.getByLabel("Correo electrónico").fill("lucia@example.com");
  await lucia.getByLabel("Contraseña").fill("contraseña-nueva-lucia");
  await lucia.getByRole("button", { name: "Entrar" }).click();
  await expect(lucia.getByText("0 de 2")).toBeVisible();
  await lucia.getByRole("link", { name: "Comidas" }).last().click();
  await expect(lucia.getByText("Avena")).toBeVisible();
  await expect(lucia.getByText("Dos tostadas integrales")).toBeVisible();
  await expectAccessible(lucia, "comidas del cliente");
  await lucia.getByRole("button", { name: "Desayuno: marcar como cumplida" }).click();
  await expect(lucia.getByRole("button", { name: "Desayuno: cumplida" })).toBeVisible();
  await lucia.getByRole("link", { name: "Hoy" }).last().click();
  await expect(lucia.getByText("1 de 2")).toBeVisible();
});

test("el entrenador ve el cumplimiento en la ficha", async () => {
  await coach.goto("/coach/clientes");
  await coach.getByRole("link", { name: /Lucía Martínez/ }).click();
  await coach.getByRole("tab", { name: "Nutrición" }).click();
  await expect(coach.getByRole("heading", { name: "Definición 2.000" })).toBeVisible();
  await expect(coach.getByText("1/2")).toBeVisible();
  await expectAccessible(coach, "nutrición en la ficha");
});
