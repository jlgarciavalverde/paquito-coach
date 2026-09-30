import { expect, test } from "@playwright/test";
import { PASSWORD, expectAccessible } from "./helpers";

async function login(browser: import("@playwright/test").Browser) {
  const p = await (await browser.newContext({ locale: "es-ES", timezoneId: "Europe/Madrid", viewport: { width: 1360, height: 860 } })).newPage();
  await p.goto("/acceso");
  await p.getByLabel("Correo electrónico").fill("paquito@example.com");
  await p.getByLabel("Contraseña").fill(PASSWORD);
  await p.getByRole("button", { name: "Entrar" }).click();
  await expect(p).toHaveURL(/\/coach$/);
  return p;
}

test("sesión cerrada desde otro dispositivo: de vuelta a entrar con un aviso", async ({ browser }) => {
  const a = await login(browser);
  const b = await login(browser);
  await b.goto("/coach/ajustes");
  await b.getByRole("button", { name: "Cerrar las demás sesiones" }).click();
  await expect(b.getByText("Sesiones cerradas en los demás dispositivos")).toBeVisible();
  // La siguiente petición al servidor (aquí, los formularios de seguimiento) descubre que la sesión ya no vale.
  await a.getByRole("link", { name: "Seguimiento" }).first().click();
  await expect(a).toHaveURL(/\/acceso\?caducada=true/);
  await expect(a.getByText(/Tu sesión ha caducado/)).toBeVisible();
  await expectAccessible(a, "sesión caducada");
});

test("sin conexión: aviso fijo y mensaje claro al intentar guardar; vuelve al recuperar la red", async ({ browser }) => {
  const p = await login(browser);
  await p.goto("/coach/clientes");
  await expect(p.getByRole("heading", { name: "Clientes" })).toBeVisible();
  await p.context().setOffline(true);
  await expect(p.getByText(/Sin conexión/)).toBeVisible();
  await p.getByRole("button", { name: "Nuevo cliente" }).first().click();
  await p.getByLabel("Nombre y apellidos").fill("Sin red");
  await p.getByText("No, solo ficha").click();
  await p.getByRole("button", { name: "Crear ficha" }).click();
  await expect(p.getByText("No hay conexión con el servidor. Revisa tu internet.")).toBeVisible();
  await p.context().setOffline(false);
  await expect(p.getByText(/Sin conexión/)).toHaveCount(0);
  await p.getByRole("button", { name: "Crear ficha" }).click();
  await expect(p.getByRole("heading", { name: /Siguientes pasos con Sin/ })).toBeVisible();
});

test("página inexistente y recurso borrado: mensajes claros, sin pantallas en blanco", async ({ browser }) => {
  const p = await login(browser);
  await p.goto("/esto/no/existe");
  await expect(p.getByRole("heading", { name: "Página no encontrada" })).toBeVisible();
  await p.goto("/coach/clientes/3f1c1b9e-7d2a-4c1e-9a3b-2b8f4d6e1a55");
  await expect(p.getByText(/no existe|No encontrado|no se ha encontrado/i).first()).toBeVisible();
  await p.goto("/coach/entrenos/3f1c1b9e-7d2a-4c1e-9a3b-2b8f4d6e1a55");
  await expect(p.getByText(/no existe|No encontrad|no se ha encontrado/i).first()).toBeVisible();
});
