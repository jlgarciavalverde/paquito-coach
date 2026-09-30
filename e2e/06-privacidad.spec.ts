import { expect, test } from "@playwright/test";
import { PASSWORD, expectAccessible } from "./helpers";

/** F6: derechos RGPD visibles y operativos. */
test("el cliente descarga sus datos y ve el aviso de privacidad", async ({ browser }) => {
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES" })).newPage();
  await p.goto("/acceso");
  await p.getByLabel("Correo electrónico").fill("lucia@example.com");
  await p.getByLabel("Contraseña").fill("contraseña-nueva-lucia");
  await p.getByRole("button", { name: "Entrar" }).click();
  await p.getByRole("link", { name: "Perfil" }).last().click();
  await expect(p.getByRole("heading", { name: "Tus datos" })).toBeVisible();
  await expectAccessible(p, "perfil con tus datos");
  const [download] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: "Descargar mis datos" }).click()]);
  expect(download.suggestedFilename()).toBe("mis-datos.zip");
  const zip = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c));
  expect(zip.subarray(0, 4).toString("hex")).toBe("504b0304"); // cabecera ZIP; el contenido se prueba en la API
  const data = await (await p.request.get("/api/v1/me/export")).json();
  expect(data.ficha.nombre).toContain("Lucía");
  expect(data.mensajes.length).toBeGreaterThan(0);

  await p.getByRole("link", { name: "Cómo tratamos tus datos" }).click();
  await expect(p.getByRole("heading", { name: "Privacidad y tus datos" })).toBeVisible();
  await expectAccessible(p, "aviso de privacidad");
});

test("el entrenador borra definitivamente un cliente archivado", async ({ browser }) => {
  const c = await (await browser.newContext({ locale: "es-ES" })).newPage();
  await c.goto("/acceso");
  await c.getByLabel("Correo electrónico").fill("paquito@example.com");
  await c.getByLabel("Contraseña").fill(PASSWORD);
  await c.getByRole("button", { name: "Entrar" }).click();
  await expect(c).toHaveURL(/\/coach$/);
  await c.getByRole("link", { name: "Clientes" }).first().click();
  await c.getByRole("button", { name: "Nuevo cliente" }).first().click();
  await c.getByLabel("Nombre y apellidos").fill("Cliente de prueba");
  await c.getByText("No, solo ficha").click();
  await c.getByRole("button", { name: "Crear ficha" }).click();
  await c.getByRole("dialog").getByRole("button", { name: "Cerrar" }).last().click();
  await c.getByRole("button", { name: "Más acciones" }).click();
  await c.getByRole("menuitem", { name: "Archivar" }).click();
  await c.getByRole("dialog").getByRole("button", { name: "Archivar" }).click();
  await c.getByRole("button", { name: "Borrar definitivamente" }).click();
  const del = c.getByRole("dialog").getByRole("button", { name: "Borrar todo" });
  await expect(del).toBeDisabled();
  await c.getByLabel("Escribe «Cliente de prueba» para confirmar").fill("Cliente de prueba");
  await expectAccessible(c, "borrar cliente");
  await del.click();
  await expect(c.getByText("Cliente de prueba y todos sus datos se han borrado")).toBeVisible();
  await expect(c).toHaveURL(/\/coach\/clientes$/);
});
