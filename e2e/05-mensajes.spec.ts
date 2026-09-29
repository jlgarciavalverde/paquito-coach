import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, expectAccessible } from "./helpers";

/** F5: chat en tiempo real entre Paquito (escritorio) y Lucía (móvil), con foto, no leídos y «visto». */
test.describe.configure({ mode: "serial" });

let coach: Page;
let lucia: Page;
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5f0000000049454e44ae426082",
  "hex",
);

test("Paquito escribe a Lucía", async ({ browser }) => {
  coach = await (await browser.newContext({ locale: "es-ES", timezoneId: "Europe/Madrid" })).newPage();
  await coach.goto("/acceso");
  await coach.getByLabel("Correo electrónico").fill("paquito@example.com");
  await coach.getByLabel("Contraseña").fill(PASSWORD);
  await coach.getByRole("button", { name: "Entrar" }).click();
  await coach.getByRole("link", { name: "Mensajes" }).first().click();
  await expect(coach.getByText("Elige una conversación")).toBeVisible();
  await expectAccessible(coach, "bandeja vacía");
  await coach.getByRole("button", { name: /Lucía Martínez/ }).click();
  await expect(coach.getByText("Aún no os habéis escrito")).toBeVisible();
  await coach.getByLabel("Escribe un mensaje").fill("Hola Lucía, ¿qué tal la rodilla después del entreno?");
  await coach.getByRole("button", { name: "Enviar" }).click();
  await expect(coach.getByText("Hola Lucía, ¿qué tal la rodilla")).toBeVisible();
  await expectAccessible(coach, "conversación del entrenador");
});

test("Lucía ve el aviso de no leído, lee y contesta con una foto", async ({ browser }) => {
  lucia = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "es-ES", timezoneId: "Europe/Madrid" })).newPage();
  await lucia.goto("/acceso");
  await lucia.getByLabel("Correo electrónico").fill("lucia@example.com");
  await lucia.getByLabel("Contraseña").fill("contraseña-nueva-lucia");
  await lucia.getByRole("button", { name: "Entrar" }).click();
  await expect(lucia.getByLabel("1 sin leer").first()).toBeAttached();
  await lucia.getByRole("link", { name: "Chat" }).last().click();
  await expect(lucia.getByText("Hola Lucía, ¿qué tal la rodilla")).toBeVisible();
  await expectAccessible(lucia, "chat del cliente");

  // Paquito ve «visto» en tiempo real (sin recargar)
  await expect(coach.getByText(/, visto/)).toBeVisible();

  await lucia.locator('input[type="file"]').setInputFiles({ name: "rodilla.png", mimeType: "image/png", buffer: PNG });
  await expect(lucia.getByAltText("Foto a punto de enviarse")).toBeVisible();
  await lucia.getByLabel("Escribe un mensaje").fill("Bien, sin dolor. Te mando cómo está hoy");
  await lucia.getByRole("button", { name: "Enviar" }).click();
  await expect(lucia.getByAltText("Foto que has enviado")).toBeVisible();
});

test("a Paquito le llega en directo, con la foto", async () => {
  await expect(coach.getByRole("log").getByText("Bien, sin dolor. Te mando cómo está hoy")).toBeVisible();
  await expect(coach.getByAltText("Foto de Lucía Martínez")).toBeVisible();
  const ok = await coach.getByAltText("Foto de Lucía Martínez").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
  expect(ok).toBe(true);
});

test("Paquito ve en la bandeja quién le ha escrito", async ({ browser }) => {
  // Otra pestaña de Paquito sin la conversación abierta: el mensaje nuevo cuenta como no leído
  const p = await (await browser.newContext({ locale: "es-ES", storageState: await coach.context().storageState() })).newPage();
  await lucia.getByLabel("Escribe un mensaje").fill("Otra cosa: ¿el jueves a qué hora?");
  await lucia.getByRole("button", { name: "Enviar" }).click();
  await p.goto("/coach/chat");
  await expect(p.getByRole("button", { name: /Lucía Martínez/ })).toContainText("¿el jueves a qué hora?");
  await p.goto("/coach/ajustes");
  await expect(p.getByRole("heading", { name: "Avisos" })).toBeVisible();
  await expectAccessible(p, "ajustes con avisos");
});
