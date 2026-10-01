import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, expectAccessible } from "./helpers";
import { base32Decode, hotp, totpStep } from "../apps/api/src/lib/totp";

const ctx = { locale: "es-ES", timezoneId: "Europe/Madrid", viewport: { width: 390, height: 844 }, isMobile: true } as const;
type Mail = { to: string; subject: string; text: string };
const mails = async (p: Page, to: string) => (await (await p.request.get(`/api/v1/test/mails?to=${encodeURIComponent(to)}`)).json()) as Mail[];
const link = (m: Mail) => m.text.match(/https?:\/\/\S+/g)!.find((u) => u.includes("token=") || u.includes("invitacion="))!;

test("invitación por correo, «he olvidado la contraseña» y verificación en dos pasos", async ({ browser }) => {
  // Paquito da de alta a Nora con correo: la invitación sale también por correo
  const coach = await (await browser.newContext({ ...ctx, viewport: { width: 1360, height: 860 }, isMobile: false })).newPage();
  await coach.goto("/acceso");
  await coach.getByLabel("Correo electrónico").fill("paquito@example.com");
  await coach.getByLabel("Contraseña").fill(PASSWORD);
  await coach.getByRole("button", { name: "Entrar" }).click();
  await expect(coach).toHaveURL(/\/coach$/);
  const r = await coach.request.post("/api/v1/clients", { data: { name: "Nora Gil", email: "nora@example.com", invite: true }, headers: { origin: new URL(coach.url()).origin } });
  expect((await r.json()).invite.emailedTo).toBe("nora@example.com");

  const nora = await (await browser.newContext(ctx)).newPage();
  const [invite] = await mails(nora, "nora@example.com");
  expect(invite!.subject).toBe("Paquito te invita a su app");
  await nora.goto(link(invite!));
  await nora.getByLabel("Contraseña").fill(PASSWORD);
  await nora.getByRole("checkbox").check();
  await nora.getByRole("button", { name: /Crear/ }).click();
  await expect(nora).toHaveURL(/\/app/);
  await nora.goto("about:blank"); // sin la app abierta: al borrar la cookie, su aviso de «sesión caducada» no se cruza
  await nora.context().clearCookies();

  // Se le olvida la contraseña
  await nora.goto("/acceso");
  await nora.getByRole("button", { name: "¿Has olvidado la contraseña?" }).click();
  await nora.getByLabel("Correo electrónico").fill("nora@example.com");
  await nora.getByRole("button", { name: "Enviarme el enlace" }).click();
  await expect(nora.getByRole("heading", { name: "Revisa tu correo" })).toBeVisible();
  await expectAccessible(nora, "recuperar contraseña");
  const reset = (await mails(nora, "nora@example.com")).find((m) => m.subject === "Restablece tu contraseña")!;
  await nora.goto(link(reset));
  await nora.getByLabel("Contraseña nueva").fill("nora-nueva-contraseña");
  await nora.getByRole("button", { name: "Guardar y entrar" }).click();
  await expect(nora).toHaveURL(/\/app/);

  // Activa la verificación en dos pasos desde su perfil
  await nora.goto("/app/perfil");
  await nora.getByRole("heading", { name: "Verificación en dos pasos" }).scrollIntoViewIfNeeded();
  await nora.locator("section", { has: nora.getByRole("heading", { name: "Verificación en dos pasos" }) }).getByRole("button", { name: "Activar" }).click();
  await expect(nora.getByRole("img", { name: "Código QR para la app de autenticación" })).toBeVisible();
  await expectAccessible(nora, "activar 2FA");
  await nora.getByText("¿No puedes escanearlo?").click();
  const secret = (await nora.locator("details code").innerText()).replace(/\s/g, "");
  const now = (offset = 0) => hotp(base32Decode(secret), totpStep() + offset);
  await nora.getByLabel("Código de la app").fill(now());
  await nora.getByRole("dialog").getByRole("button", { name: "Activar" }).click();
  await expect(nora.getByRole("heading", { name: /Guarda tus códigos de recuperación/ })).toBeVisible();
  const codes = await nora.getByRole("dialog").locator("ol li").allInnerTexts();
  expect(codes).toHaveLength(10);
  await nora.getByRole("button", { name: "Ya los he guardado" }).click();

  // Al volver a entrar, la contraseña sola no basta
  await nora.goto("about:blank"); // sin la app abierta: al borrar la cookie, su aviso de «sesión caducada» no se cruza
  await nora.context().clearCookies();
  await nora.goto("/acceso");
  await nora.getByLabel("Correo electrónico").fill("nora@example.com");
  await nora.getByLabel("Contraseña").fill("nora-nueva-contraseña");
  await nora.getByRole("button", { name: "Entrar" }).click();
  await expect(nora.getByRole("heading", { name: "Verificación en dos pasos" })).toBeVisible();
  await expectAccessible(nora, "segundo paso");
  await nora.getByLabel("Código").fill("000000");
  await nora.getByRole("button", { name: "Entrar" }).click();
  await expect(nora.getByText(/El código no es correcto/)).toBeVisible();
  await nora.getByRole("button", { name: /usar un código de recuperación/ }).click();
  await nora.getByLabel("Código de recuperación").fill(codes[0]!);
  await nora.getByRole("button", { name: "Entrar" }).click();
  await expect(nora).toHaveURL(/\/app/);
});
