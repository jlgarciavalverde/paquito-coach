import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, expectAccessible } from "./helpers";

/** H1 (paridad con Harbiz): check-in semanal, medida propia y fotos de progreso. */
test.describe.configure({ mode: "serial" });
let coach: Page;
let lucia: Page;
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5f0000000049454e44ae426082",
  "hex",
);

test("Paquito crea el check-in semanal y una medida propia", async ({ browser }) => {
  coach = await (await browser.newContext({ locale: "es-ES", timezoneId: "Europe/Madrid", viewport: { width: 1360, height: 860 } })).newPage();
  await coach.goto("/acceso");
  await coach.getByLabel("Correo electrónico").fill("paquito@example.com");
  await coach.getByLabel("Contraseña").fill(PASSWORD);
  await coach.getByRole("button", { name: "Entrar" }).click();
  await coach.getByRole("link", { name: "Seguimiento" }).first().click();
  await expectAccessible(coach, "seguimiento vacío");
  await coach.getByRole("link", { name: "Nuevo formulario" }).click();
  await expect(coach.getByLabel("Pregunta 1", { exact: true })).toHaveValue("¿Qué tal de energía esta semana?");
  await expectAccessible(coach, "editor de check-in");
  await coach.getByRole("button", { name: "Crear formulario" }).click();
  await expect(coach.getByText("Formulario creado")).toBeVisible();
  await coach.getByRole("link", { name: "Seguimiento" }).nth(1).click();
  await coach.getByRole("button", { name: "Pedir a clientes" }).click();
  await coach.getByRole("dialog").getByLabel("Lucía Martínez").check();
  await coach.getByRole("button", { name: "Programar" }).click();
  await expect(coach.getByText("Check-in programado")).toBeVisible();

  await coach.getByRole("button", { name: "Nueva medida" }).click();
  await coach.getByLabel("Nombre").fill("Dolor (EVA)");
  await coach.getByLabel("Unidad").fill("/10");
  await coach.getByText("Cuando baja (dolor, perímetro)").click();
  await coach.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();
  await expect(coach.getByText("Medida guardada")).toBeVisible();
});

test("Lucía rellena el check-in, anota el dolor y sube una foto", async ({ browser }) => {
  lucia = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "es-ES", timezoneId: "Europe/Madrid" })).newPage();
  await lucia.goto("/acceso");
  await lucia.getByLabel("Correo electrónico").fill("lucia@example.com");
  await lucia.getByLabel("Contraseña").fill("contraseña-nueva-lucia");
  await lucia.getByRole("button", { name: "Entrar" }).click();
  await expect(lucia.getByText("Te toca: Check-in semanal")).toBeVisible();
  await lucia.getByRole("link", { name: "Rellenarlo" }).click();
  await lucia.getByRole("button", { name: "Enviar" }).click();
  await expect(lucia.getByText("Falta: «¿Qué tal de energía esta semana?»")).toBeVisible();
  for (const [q, n] of [["¿Qué tal de energía esta semana?", "8"], ["¿Cómo has dormido?", "6"], ["¿Cuánto has cumplido el plan de entreno?", "9"], ["¿Y el de comidas?", "7"]] as const)
    await lucia.getByRole("radiogroup", { name: q }).getByRole("radio", { name: new RegExp(`^${n}`) }).click();
  await lucia.getByRole("radiogroup", { name: "¿Has tenido dolor o molestias?" }).getByRole("radio", { name: "Sí" }).click();
  await lucia.getByLabel("Si es que sí, ¿dónde y cuándo?").fill("Rodilla al bajar escaleras");
  await expectAccessible(lucia, "check-in del cliente");
  await lucia.getByRole("button", { name: "Enviar" }).click();
  await expect(lucia).toHaveURL(/\/app$/);
  await expect(lucia.getByText("Te toca: Check-in semanal")).toHaveCount(0);

  await lucia.goto("/app/progreso");
  await lucia.getByRole("button", { name: "Anotar dolor (eva)" }).click();
  await lucia.getByLabel("Valor").fill("3");
  await lucia.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();
  await expect(lucia.getByText("Dolor (EVA) guardada")).toBeVisible();
  await lucia.getByRole("button", { name: "Subir fotos" }).click();
  await lucia.getByRole("dialog").locator('input[type="file"]').first().setInputFiles({ name: "frente.png", mimeType: "image/png", buffer: PNG });
  await lucia.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();
  await expect(lucia.getByText("Foto guardada")).toBeVisible();
  await expect(lucia.getByAltText(/^De frente,/).first()).toBeVisible();
  await expectAccessible(lucia, "progreso del cliente con fotos");
});

test("Paquito lo ve en Hoy y en la ficha", async () => {
  await coach.getByRole("link", { name: "Hoy" }).first().click();
  await coach.getByRole("link", { name: /Lucía Martínez.*Check-in nuevo por revisar/ }).click();
  await expect(coach.getByRole("tab", { name: "Check-ins" })).toHaveAttribute("aria-selected", "true");
  await expect(coach.getByText("Ha tenido dolor")).toBeVisible();
  await expect(coach.getByText("Rodilla al bajar escaleras")).toBeVisible();
  await expectAccessible(coach, "check-ins en la ficha");
  await coach.getByRole("tab", { name: "Progreso" }).click();
  await expect(coach.getByText("Dolor (EVA)").first()).toBeVisible();
  await expect(coach.getByAltText(/^De frente,/).first()).toBeVisible();
});
