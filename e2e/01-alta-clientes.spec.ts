import { expect, test, type Browser, type Page } from "@playwright/test";
import { PASSWORD, expectAccessible } from "./helpers";

/**
 * Flujo principal del MVP (F1): alta inicial del entrenador, las 3 formas de alta de clientes
 * (invitación, código público + aceptar, ficha sin cuenta) y la ficha. Accesibilidad en claro y oscuro.
 */
test.describe.configure({ mode: "serial" });

let coach: Page;
let inviteUrl = "";

async function newPage(browser: Browser, opts: Parameters<Browser["newContext"]>[0] = {}) {
  const ctx = await browser.newContext(opts);
  return ctx.newPage();
}

test("alta inicial del estudio", async ({ browser }) => {
  coach = await newPage(browser);
  await coach.goto("/");
  await expect(coach).toHaveURL(/\/instalar$/);
  await expectAccessible(coach, "instalar");
  await coach.getByLabel("Nombre del estudio").fill("Estudio Paquito");
  await coach.getByLabel("Tu nombre").fill("Paquito Fernández");
  await coach.getByLabel("Correo electrónico").fill("paquito@example.com");
  await coach.getByLabel("Contraseña").fill(PASSWORD);
  await coach.getByLabel("Código de instalación").fill("mal");
  await coach.getByRole("button", { name: "Crear mi estudio" }).click();
  await expect(coach.getByRole("alert").filter({ hasText: "Código de instalación incorrecto" })).toBeVisible();
  await coach.getByLabel("Código de instalación").fill("e2e-setup");
  await coach.getByRole("button", { name: "Crear mi estudio" }).click();
  await expect(coach).toHaveURL(/\/coach$/);
  await expect(coach.getByText("Hola, Paquito.")).toBeVisible();
  await expectAccessible(coach, "inicio entrenador");
});

test("ficha con invitación: enlace listo para WhatsApp", async () => {
  await coach.getByRole("link", { name: "Clientes" }).first().click();
  await expect(coach.getByText("Todavía no hay clientes")).toBeVisible();
  await expectAccessible(coach, "clientes vacío");
  await coach.getByRole("button", { name: "Nuevo cliente" }).first().click();
  await coach.getByLabel("Nombre y apellidos").fill("Lucía Martínez");
  await coach.getByLabel("Objetivo").fill("Volver a correr tras LCA");
  await expectAccessible(coach, "diálogo nuevo cliente");
  await coach.getByRole("button", { name: "Crear e invitar" }).click();
  await expect(coach.getByText("Ficha de Lucía Martínez creada")).toBeVisible();
  inviteUrl = await coach.getByLabel("Enlace de invitación").innerText();
  expect(inviteUrl).toContain("/registro?invitacion=");
  await expect(coach.getByRole("link", { name: "Enviar por WhatsApp" })).toHaveAttribute("href", /wa\.me/);
  await coach.getByRole("button", { name: "Cerrar" }).first().click();
  await expect(coach.getByRole("link", { name: /Lucía Martínez/ })).toBeVisible();
});

test("ficha sin cuenta", async () => {
  await coach.getByRole("button", { name: "Nuevo cliente" }).first().click();
  await coach.getByLabel("Nombre y apellidos").fill("Pepe Gómez");
  await coach.getByText("No, solo ficha").click();
  await coach.getByRole("button", { name: "Crear ficha" }).click();
  await expect(coach).toHaveURL(/\/coach\/clientes\/[0-9a-f-]+$/);
  await expect(coach.getByRole("heading", { name: "Siguientes pasos con Pepe" })).toBeVisible();
  await coach.getByRole("dialog").getByRole("button", { name: "Cerrar" }).last().click();
  await expect(coach.locator("article").getByText("Sin cuenta")).toBeVisible();
  await coach.getByRole("tab", { name: "Ficha" }).click();
  await coach.getByLabel("Lesiones y limitaciones").fill("Hernia L5-S1");
  await coach.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(coach.getByText("Ficha guardada")).toBeVisible();
  await coach.reload();
  // El aviso de lesión aparece encima de las pestañas
  await expect(coach.getByRole("note")).toContainText("Hernia L5-S1");
  await coach.getByRole("tab", { name: "Ficha" }).click();
  await expect(coach.getByLabel("Lesiones y limitaciones")).toHaveValue("Hernia L5-S1");
  await expectAccessible(coach, "ficha de cliente");
});

test("el cliente se registra con la invitación (móvil)", async ({ browser }) => {
  const lucia = await newPage(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "es-ES" });
  await lucia.goto(inviteUrl);
  await expect(lucia.getByRole("heading", { name: "Hola, Lucía" })).toBeVisible();
  await expectAccessible(lucia, "registro por invitación");
  await lucia.getByLabel("Correo electrónico").fill("lucia@example.com");
  await lucia.getByLabel("Contraseña").fill(PASSWORD);
  const create = lucia.getByRole("button", { name: "Crear mi cuenta" });
  await expect(create).toBeDisabled(); // sin consentimiento RGPD no se puede
  await lucia.getByRole("checkbox").check();
  await create.click();
  // Lo primero tras registrarse: el cuestionario de salud (se puede posponer)
  await expect(lucia).toHaveURL(/\/app\/salud$/);
  await expect(lucia.getByRole("heading", { name: "Antes de empezar" })).toBeVisible();
  await expectAccessible(lucia, "cuestionario de salud");
  await lucia.getByRole("link", { name: "Lo haré más tarde" }).click();
  await expect(lucia).toHaveURL(/\/app$/);
  await expect(lucia.getByText("Hola, Lucía.")).toBeVisible();
  await expect(lucia.getByText("Antes de empezar: tu cuestionario de salud")).toBeVisible();
  await expectAccessible(lucia, "hoy (cliente)");
  // La invitación ya no vale
  const again = await newPage(browser);
  await again.goto(inviteUrl);
  await expect(again.getByRole("heading", { name: "Invitación no válida" })).toBeVisible();
});

test("registro con código del estudio + aceptar (oscuro)", async ({ browser }) => {
  await coach.goto("/coach/ajustes");
  const code = (await coach.getByTestId("join-code").innerText()).trim();
  expect(code).toMatch(/^[A-Z0-9]{8}$/);
  await expectAccessible(coach, "ajustes");

  const iker = await newPage(browser, { viewport: { width: 390, height: 844 }, colorScheme: "dark", locale: "es-ES" });
  await iker.goto("/registro");
  await iker.getByLabel("Código del estudio").fill("NOEXISTE");
  await iker.getByRole("button", { name: "Continuar" }).click();
  await expect(iker.getByText("Ese código no existe")).toBeVisible();
  await iker.getByLabel("Código del estudio").fill(code.toLowerCase());
  await iker.getByRole("button", { name: "Continuar" }).click();
  await iker.getByLabel("Nombre y apellidos").fill("Iker López");
  await iker.getByLabel("Correo electrónico").fill("iker@example.com");
  await iker.getByLabel("Contraseña").fill(PASSWORD);
  await iker.getByRole("checkbox").check();
  await expectAccessible(iker, "registro por código (oscuro)");
  await iker.getByRole("button", { name: "Crear mi cuenta" }).click();
  await expect(iker.getByText("Solicitud enviada")).toBeVisible();
  await expectAccessible(iker, "pendiente (oscuro)");

  await coach.goto("/coach/clientes");
  await expect(coach.getByText("1 persona quiere entrenar contigo")).toBeVisible();
  await coach.getByRole("button", { name: "Aceptar" }).click();
  await expect(coach.getByText("Iker López ya es cliente tuyo")).toBeVisible();
  await iker.reload();
  await expect(iker.getByText("Hola, Iker.")).toBeVisible();
});

test("recuperar acceso de un cliente con enlace del entrenador", async ({ browser }) => {
  await coach.goto("/coach/clientes");
  await coach.getByRole("link", { name: /Lucía Martínez/ }).click();
  await coach.getByRole("button", { name: "Más acciones" }).click();
  await coach.getByRole("menuitem", { name: "Recuperar acceso" }).click();
  const url = await coach.getByLabel("Enlace para nueva contraseña").innerText();
  await coach.keyboard.press("Escape");
  const p = await newPage(browser, { viewport: { width: 390, height: 844 } });
  await p.goto(url);
  await expectAccessible(p, "restablecer");
  await p.getByLabel("Contraseña nueva").fill("contraseña-nueva-lucia");
  await p.getByRole("button", { name: "Guardar y entrar" }).click();
  await expect(p).toHaveURL(/\/app$/);
});

test("accesibilidad de la lista en oscuro", async ({ browser }) => {
  const dark = await newPage(browser, { colorScheme: "dark", storageState: await coach.context().storageState() });
  await dark.goto("/coach/clientes");
  await expect(dark.getByRole("link", { name: /Iker López/ })).toBeVisible();
  await expectAccessible(dark, "clientes (oscuro)");
  await dark.goto("/galeria");
  await expectAccessible(dark, "galería (oscuro)");
});

test("login y cierre de sesión", async ({ browser }) => {
  const p = await newPage(browser);
  await p.goto("/acceso");
  await expectAccessible(p, "acceso");
  await p.getByLabel("Correo electrónico").fill("paquito@example.com");
  await p.getByLabel("Contraseña").fill("mala-contraseña");
  await p.getByRole("button", { name: "Entrar" }).click();
  await expect(p.getByRole("alert").filter({ hasText: "Correo o contraseña incorrectos" })).toBeVisible();
  await p.getByLabel("Contraseña").fill(PASSWORD);
  await p.getByRole("button", { name: "Entrar" }).click();
  await expect(p).toHaveURL(/\/coach$/);
  await p.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(p).toHaveURL(/\/acceso$/);
});
