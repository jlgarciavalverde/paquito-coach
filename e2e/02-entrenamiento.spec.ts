import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, expectAccessible } from "./helpers";

/**
 * F2: el entrenador crea una rutina con la biblioteca, la asigna a Lucía para hoy, Lucía la registra
 * en el móvil (series, descanso, esfuerzo) y el entrenador ve el resultado en «Hoy» y en la ficha.
 * Depende de las cuentas creadas en 01-alta-clientes (mismo orden y misma BD).
 */
test.describe.configure({ mode: "serial" });

let coach: Page;
let lucia: Page;

test("el entrenador crea una rutina con superserie", async ({ browser }) => {
  coach = await (await browser.newContext({ locale: "es-ES" })).newPage();
  await coach.goto("/acceso");
  await coach.getByLabel("Correo electrónico").fill("paquito@example.com");
  await coach.getByLabel("Contraseña").fill(PASSWORD);
  await coach.getByRole("button", { name: "Entrar" }).click();
  await coach.getByRole("link", { name: "Entrenos" }).first().click();
  await expect(coach.getByText("Aún no tienes rutinas")).toBeVisible();
  await expectAccessible(coach, "biblioteca vacía");

  await coach.getByRole("link", { name: "Nueva rutina" }).click();
  await coach.getByLabel("Nombre de la rutina").fill("Pierna A");
  await coach.getByRole("button", { name: /Añadir ejercicio/ }).click();
  await coach.getByLabel("Buscar ejercicio").fill("sentadilla trasera");
  await coach.getByRole("button", { name: /Sentadilla trasera/ }).first().click();
  await coach.getByLabel("Buscar ejercicio").fill("plancha");
  await coach.getByRole("button", { name: /^Plancha/ }).first().click();
  await expect(coach.getByText("2 añadidos")).toBeVisible();
  await expectAccessible(coach, "selector de ejercicios");
  await coach.keyboard.press("Escape");

  await coach.getByLabel("Carga").first().fill("70 kg");
  await coach.getByLabel("RIR o RPE").first().fill("RIR 2");
  await coach.getByRole("button", { name: "Superserie con la anterior" }).click();
  await expect(coach.getByText("A1", { exact: true })).toBeVisible();
  await expect(coach.getByText("A2", { exact: true })).toBeVisible();
  await expectAccessible(coach, "editor de rutina");
  await coach.getByRole("button", { name: "Crear rutina" }).click();
  await expect(coach.getByText("Rutina creada")).toBeVisible();
  await expect(coach).toHaveURL(/\/coach\/entrenos\/[0-9a-f-]{36}$/);
});

test("la asigna a Lucía para hoy", async () => {
  await coach.getByRole("button", { name: "Asignar", exact: true }).click();
  await coach.getByLabel("Lucía Martínez").check();
  await expectAccessible(coach, "asignar rutina");
  await coach.getByRole("button", { name: "Asignar", exact: true }).last().click();
  await expect(coach.getByText("Entreno asignado")).toBeVisible();
  await coach.getByRole("link", { name: "Entrenos" }).first().click();
  await expect(coach.getByText(/Asignada a 1 cliente/)).toBeVisible();
});

test("Lucía la registra en el móvil", async ({ browser }) => {
  lucia = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "es-ES" })).newPage();
  await lucia.goto("/acceso");
  await lucia.getByLabel("Correo electrónico").fill("lucia@example.com");
  await lucia.getByLabel("Contraseña").fill("contraseña-nueva-lucia");
  await lucia.getByRole("button", { name: "Entrar" }).click();
  await expect(lucia.getByRole("heading", { name: "Pierna A" })).toBeVisible();
  await expectAccessible(lucia, "hoy del cliente con entreno");
  await lucia.getByRole("link", { name: "Empezar" }).click();

  await lucia.getByLabel("Kilos, serie 1").first().fill("70");
  await lucia.getByRole("button", { name: "Serie 1 hecha" }).first().click();
  await expect(lucia.getByRole("timer")).toBeVisible(); // arranca el descanso
  await expect(lucia.getByText("1 de 6 series")).toBeVisible();
  await expect(lucia.getByText("Guardado")).toBeVisible();
  await expectAccessible(lucia, "cuaderno de entreno");

  // El registro sobrevive a recargar (autoguardado en el servidor)
  await lucia.reload();
  await expect(lucia.getByLabel("Kilos, serie 1").first()).toHaveValue("70");

  // Marcar la serie 2 sin escribir nada la da por hecha con lo de la serie anterior
  await lucia.getByRole("button", { name: /^Serie 2 hecha/ }).first().click();
  await expect(lucia.getByLabel("Kilos, serie 2").first()).toHaveValue("70");
  await expect(lucia.getByText("2 de 6 series")).toBeVisible();

  await lucia.getByRole("button", { name: "Terminar" }).click();
  await lucia.getByRole("radio", { name: /^8,/ }).click();
  await lucia.getByLabel("Comentario").fill("Rodilla bien");
  await expectAccessible(lucia, "terminar entreno");
  await lucia.getByRole("button", { name: "Terminar entreno" }).click();
  await expect(lucia.getByText("Terminado, esfuerzo 8 de 10")).toBeVisible();

  await lucia.getByRole("link", { name: "Entreno" }).last().click();
  await expect(lucia.getByText("Hecho, RPE 8")).toBeVisible();
  await expectAccessible(lucia, "semana del cliente");
});

test("el entrenador lo ve en Hoy y en la ficha", async ({ browser }) => {
  await coach.getByRole("link", { name: "Hoy" }).first().click();
  await expect(coach.getByText("terminó Pierna A, esfuerzo 8/10")).toBeVisible();
  await expect(coach.getByText("«Rodilla bien»")).toBeVisible();
  await expect(coach.getByRole("button", { name: /Lucía Martínez, .*Pierna A: hecho/ })).toBeVisible();
  await expectAccessible(coach, "hoy del entrenador con actividad");
  await coach.getByText("terminó Pierna A, esfuerzo 8/10").click();
  await expect(coach.getByLabel("Registro del cliente").first()).toContainText("×70");
  await expectAccessible(coach, "detalle de entreno");
  await coach.keyboard.press("Escape");

  const dark = await (await browser.newContext({ colorScheme: "dark", locale: "es-ES", storageState: await coach.context().storageState() })).newPage();
  await dark.goto("/coach/entrenos?vista=ejercicios");
  await dark.getByLabel("Buscar ejercicio").fill("hip thrust");
  await expect(dark.getByRole("button", { name: /Hip thrust/i }).first()).toBeVisible();
  await expectAccessible(dark, "biblioteca de ejercicios (oscuro)");
});
