import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Me } from "@coach/shared";
import { meQuery, useMe } from "../lib/auth";
import { api, errorMessage } from "../lib/api";
import { statusQuery } from "../lib/status";
import { useSubmit } from "../lib/use-form";
import { FormError } from "./form-error";
import { QrCode } from "./qr-code";
import { Button } from "./ui/button";
import { Checkbox, TextField } from "./ui/field";
import { Dialog } from "./ui/dialog";
import { BlockTitle } from "./ui/layout";
import { useToast } from "./ui/toast";

/** Los códigos de recuperación se enseñan una sola vez: copiar o descargar. */
function RecoveryCodes({ codes }: { codes: string[] }) {
  const toast = useToast();
  const text = `Códigos de recuperación (cada uno sirve una vez):\n\n${codes.join("\n")}\n`;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-2">
        Guárdalos en un sitio seguro (un gestor de contraseñas o en papel). Si pierdes el móvil, son la única forma de entrar. <strong className="text-ink">No se volverán a enseñar.</strong>
      </p>
      <ol className="font-narrow grid grid-cols-2 gap-x-6 gap-y-1 rounded-[var(--radius-control)] bg-tray px-4 py-3 text-[17px]">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => void navigator.clipboard.writeText(text).then(() => toast("Copiados"), () => toast("No se han podido copiar", "error"))}>
          Copiar
        </Button>
        <a className="inline-flex h-8 items-center rounded-[var(--radius-control)] px-2.5 text-[13.5px] font-medium text-primary hover:bg-tray pointer-coarse:h-10" download="codigos-de-recuperacion.txt" href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}>
          Descargar
        </a>
      </div>
    </div>
  );
}

export function TwoFactorSetting() {
  const me = useMe()!;
  const qc = useQueryClient();
  const toast = useToast();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [off, setOff] = useState(false);
  const [password, setPassword] = useState("");
  const [offCode, setOffCode] = useState("");
  const refreshMe = () => qc.invalidateQueries({ queryKey: meQuery.queryKey });

  const start = useMutation({
    mutationFn: () => api<{ secret: string; otpauthUrl: string }>("/me/2fa/setup", { body: {} }),
    onSuccess: (s) => (setSetup(s), setCode("")),
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const enable = useSubmit(
    () => api<{ codes: string[] }>("/me/2fa/enable", { body: { code } }),
    (r) => (setSetup(null), setCodes(r.codes), void refreshMe()),
  );
  const disable = useSubmit(
    () => api("/me/2fa/disable", { body: { password, code: offCode } }),
    () => (setOff(false), setPassword(""), setOffCode(""), toast("Verificación en dos pasos desactivada"), void refreshMe()),
  );

  return (
    <section>
      <BlockTitle>Verificación en dos pasos</BlockTitle>
      <p className="max-w-[56ch] text-sm text-ink-2">
        {me.twoFactor
          ? "Activada: al entrar en un dispositivo nuevo, además de la contraseña te pediremos el código de tu app de autenticación."
          : me.role === "coach"
            ? "Protege los datos de salud de tus clientes: además de la contraseña, al entrar te pediremos un código de tu móvil (Google Authenticator, Authy, 1Password…). Muy recomendable."
            : "Además de la contraseña, al entrar te pediremos un código de una app de tu móvil (Google Authenticator, Authy…)."}
      </p>
      {me.twoFactor ? (
        <Button variant="quiet" className="mt-3 -ml-3" onClick={() => setOff(true)}>
          Desactivar
        </Button>
      ) : (
        <Button variant="secondary" className="mt-3" loading={start.isPending} onClick={() => start.mutate()}>
          Activar
        </Button>
      )}

      <Dialog open={Boolean(setup)} onOpenChange={(o) => !o && setSetup(null)} title="Activar la verificación en dos pasos" description="1. Escanea el código con tu app de autenticación. 2. Escribe el código de 6 cifras que te muestra.">
        {setup && (
          <form onSubmit={enable.onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-2">
              <QrCode text={setup.otpauthUrl} label="Código QR para la app de autenticación" />
              <details className="text-[13px] text-ink-2">
                <summary className="min-h-10 cursor-pointer py-2">¿No puedes escanearlo? Escribe la clave a mano</summary>
                <code className="font-narrow block rounded-[4px] bg-tray px-2 py-1 text-[15px] break-all text-ink">{setup.secret.match(/.{1,4}/g)!.join(" ")}</code>
              </details>
            </div>
            <TextField label="Código de la app" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))} className="[&_input]:font-narrow [&_input]:text-[20px] [&_input]:tracking-[0.2em]" />
            <FormError message={enable.error} />
            <Button type="submit" loading={enable.pending} disabled={!/^\d{6}$/.test(code.replace(/\s/g, ""))} className="self-start">
              Activar
            </Button>
          </form>
        )}
      </Dialog>

      <Dialog open={Boolean(codes)} onOpenChange={(o) => !o && setCodes(null)} title="Activada. Guarda tus códigos de recuperación" footer={<Button onClick={() => setCodes(null)}>Ya los he guardado</Button>}>
        {codes && <RecoveryCodes codes={codes} />}
      </Dialog>

      <Dialog open={off} onOpenChange={setOff} title="Desactivar la verificación en dos pasos" description="Tu cuenta quedará protegida solo con la contraseña.">
        <form onSubmit={disable.onSubmit} className="flex flex-col gap-4">
          <TextField label="Contraseña" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <TextField label="Código de la app o de recuperación" autoComplete="one-time-code" value={offCode} onChange={(e) => setOffCode(e.target.value)} />
          <FormError message={disable.error} />
          <Button type="submit" variant="danger" loading={disable.pending} disabled={!password || offCode.trim().length < 6} className="self-start">
            Desactivar
          </Button>
        </form>
      </Dialog>
    </section>
  );
}

/** Correo de la cuenta (cambio con confirmación) y si se reciben correos de avisos. */
export function EmailSetting() {
  const me = useMe()!;
  const qc = useQueryClient();
  const toast = useToast();
  const mailOn = useQuery(statusQuery).data?.mail ?? false;
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const change = useSubmit(
    () => api("/me/email", { body: { email, password } }),
    () => (setSentTo(email), setOpen(false), setPassword("")),
  );
  const pref = useMutation({
    mutationFn: (emailNotifications: boolean) => api<Me>("/me/preferences", { method: "PATCH", body: { emailNotifications } }),
    onSuccess: (m) => qc.setQueryData(meQuery.queryKey, m),
    onError: (e) => toast(errorMessage(e), "error"),
  });
  return (
    <section>
      <BlockTitle>Correo</BlockTitle>
      <p className="text-sm text-ink-2">
        Entras con <strong className="text-ink">{me.email}</strong>.
      </p>
      {sentTo && (
        <p role="status" className="mt-2 border-l-[5px] border-plate-yellow bg-tray px-3 py-2 text-sm">
          Te hemos mandado un enlace a {sentTo}. El cambio se hace al abrirlo (caduca en 24 horas).
        </p>
      )}
      {mailOn && (
        <>
          <Button variant="secondary" className="mt-3" onClick={() => (setEmail(""), setOpen(true))}>
            Cambiar el correo
          </Button>
          <Checkbox
            className="mt-4"
            checked={me.emailNotifications}
            disabled={pref.isPending}
            onChange={(e) => pref.mutate(e.target.checked)}
            label="Recibir avisos por correo"
            description={me.role === "coach" ? "Reservas nuevas cuando no tienes los avisos del móvil activados." : "Confirmaciones de tus reservas. Los correos de seguridad te llegan siempre."}
          />
        </>
      )}
      <Dialog open={open} onOpenChange={setOpen} title="Cambiar el correo" description="Te mandaremos un enlace a la dirección nueva. Hasta que lo abras, sigues entrando con la de ahora.">
        <form onSubmit={change.onSubmit} className="flex flex-col gap-4">
          <TextField label="Correo nuevo" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField label="Tu contraseña" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <FormError message={change.error} />
          <Button type="submit" loading={change.pending} disabled={!email.includes("@") || !password} className="self-start">
            Enviar el enlace
          </Button>
        </form>
      </Dialog>
    </section>
  );
}
