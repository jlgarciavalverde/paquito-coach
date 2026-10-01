import { expect, test } from "@playwright/test";
import { PASSWORD, expectAccessible } from "./helpers";

const SHOTS = process.env.SHOTS_DIR;

test("página pública: Paquito la publica, alguien escribe y le da de alta", async ({ browser }) => {
  const coach = await (await browser.newContext({ locale: "es-ES", timezoneId: "Europe/Madrid", viewport: { width: 1360, height: 860 } })).newPage();
  await coach.goto("/acceso");
  await coach.getByLabel("Correo electrónico").fill("paquito@example.com");
  await coach.getByLabel("Contraseña").fill(PASSWORD);
  await coach.getByRole("button", { name: "Entrar" }).click();
  await expect(coach).toHaveURL(/\/coach$/);

  // Sin publicar, `/` lleva a entrar
  const visitor = await (await browser.newContext({ locale: "es-ES", timezoneId: "Europe/Madrid", viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
  await visitor.goto("/");
  await expect(visitor).toHaveURL(/\/acceso/);

  // Ajustes → Tu estudio
  await coach.goto("/coach/ajustes");
  const block = coach.locator("section", { has: coach.getByRole("heading", { name: "Tu estudio y tu página pública" }) });
  await block.getByRole("radio", { name: "Verde" }).click();
  await block.getByLabel("Publicar mi página en la dirección de la app").check();
  await block.getByLabel("Frase de presentación").fill("Fuerza y readaptación de lesiones en Murcia");
  await block.getByLabel("Quién eres").fill("Graduado en Ciencias de la Actividad Física. Te ayudo a volver a entrenar sin dolor y a ganar fuerza con un plan hecho para ti.");
  await block.getByLabel("Especialidades").fill("Readaptación de rodilla\nFuerza para mayores de 50\nPreparación física");
  await block.getByLabel("Dónde").fill("Gimnasio Centro, Murcia");
  await block.getByLabel("Horario").fill("Lunes a viernes, 8:00–21:00");
  await block.getByLabel("Instagram").fill("@paquito.entrena");
  await block.getByLabel("Nombre o razón social").fill("Francisco Pérez");
  await block.getByLabel("NIF").fill("12345678Z");
  await block.getByRole("button", { name: "Guardar" }).click();
  await expect(coach.getByText("Guardado. Tu página está publicada.")).toBeVisible();
  await expectAccessible(coach, "ajustes con página pública");

  // Lo ve cualquiera en `/`
  await visitor.goto("/");
  await expect(visitor.getByRole("heading", { level: 1, name: "Estudio Paquito" })).toBeVisible();
  await expect(visitor.getByText("Readaptación de rodilla")).toBeVisible();
  await expectAccessible(visitor, "página pública (móvil)");
  if (SHOTS) await visitor.screenshot({ path: `${SHOTS}/publica-movil.png`, fullPage: true });
  const desk = await (await browser.newContext({ locale: "es-ES", viewport: { width: 1360, height: 860 }, colorScheme: "dark" })).newPage();
  await desk.goto("/");
  await expectAccessible(desk, "página pública (escritorio, oscuro)");
  if (SHOTS) await desk.screenshot({ path: `${SHOTS}/publica-escritorio-oscuro.png`, fullPage: true });

  // Aviso legal con los datos de Paquito
  await visitor.getByRole("link", { name: "Aviso legal" }).click();
  await expect(visitor.getByText(/Francisco Pérez, NIF 12345678Z/)).toBeVisible();
  await expectAccessible(visitor, "aviso legal");
  await visitor.goBack();

  // «Quiero empezar»
  await visitor.getByRole("link", { name: "Quiero empezar" }).click();
  await visitor.getByLabel("Nombre").fill("Rosa Martín");
  await visitor.getByLabel("Correo electrónico").fill("rosa@example.com");
  await visitor.getByLabel("Qué te gustaría conseguir").fill("Me duele la rodilla al correr");
  await visitor.getByLabel(/Acepto que se usen estos datos/).check();
  await visitor.getByRole("button", { name: "Enviar" }).click();
  await expect(visitor.getByText(/Recibido. Te contestaré/)).toBeVisible();

  // Paquito la ve en Clientes y la da de alta con un toque
  await coach.goto("/coach/clientes");
  await expect(coach.getByText("1 solicitud desde tu página")).toBeVisible();
  await coach.getByRole("button", { name: "Dar de alta" }).click();
  await expect(coach.getByLabel("Nombre y apellidos")).toHaveValue("Rosa Martín");
  await coach.getByRole("button", { name: "Crear e invitar" }).click();
  await expect(coach.getByText(/Ficha de Rosa Martín creada/)).toBeVisible();
  await coach.goto("/coach/clientes");
  await expect(coach.getByText("1 solicitud desde tu página")).toHaveCount(0);
});
