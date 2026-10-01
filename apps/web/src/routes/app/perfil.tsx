import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Dialog } from "../../components/ui/dialog";
import { TextField } from "../../components/ui/field";
import { BlockTitle } from "../../components/ui/layout";
import { FormError } from "../../components/form-error";
import { api } from "../../lib/api";
import { forgetDevice } from "../../lib/push";
import { useSubmit } from "../../lib/use-form";
import { Button, buttonClass } from "../../components/ui/button";
import { Monogram } from "../../components/ui/layout";
import { PasswordSetting, PushSetting, SessionsSetting, ThemeSetting } from "../../components/account-settings";
import { EmailSetting, TwoFactorSetting } from "../../components/security-settings";
import { useLogout, useMe } from "../../lib/auth";
import { useDocumentTitle } from "../../lib/title";

export const Route = createFileRoute("/app/perfil")({
  component: Profile,
});

function Profile() {
  const me = useMe()!;
  const logout = useLogout();
  useDocumentTitle("Perfil");
  return (
    <>
      <div className="mb-10 flex items-center gap-4">
        <Monogram name={me.name} size={56} />
        <div>
          <h1 className="font-wide text-[28px] leading-tight">{me.name}</h1>
          <p className="text-sm text-ink-2">
            {me.email}. Entrenas con {me.studio.name}.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-12">
        <section>
          <BlockTitle>Peso y progreso</BlockTitle>
          <p className="text-sm text-ink-2">Anota tu peso y tus medidas y mira cómo evolucionan tus cargas.</p>
          <Link to="/app/progreso" className={buttonClass("secondary", "md", "mt-3")}>
            Ir a mi progreso
          </Link>
        </section>
        <section>
          <BlockTitle>Pagos</BlockTitle>
          <p className="text-sm text-ink-2">Compra tus bonos y sesiones, y consulta tus recibos.</p>
          <Link to="/app/pagos" className={buttonClass("secondary", "md", "mt-3")}>
            Ver pagos
          </Link>
        </section>
        <section>
          <BlockTitle>Material</BlockTitle>
          <p className="text-sm text-ink-2">Pautas, vídeos y lecturas que te comparte tu entrenador.</p>
          <Link to="/app/material" className={buttonClass("secondary", "md", "mt-3")}>
            Ver material
          </Link>
        </section>
        <PushSetting />
        <ThemeSetting />
        <EmailSetting />
          <PasswordSetting />
          <TwoFactorSetting />
        <SessionsSetting />
        <MyData />
        <Button variant="secondary" onClick={logout} className="self-start">
          Cerrar sesión
        </Button>
      </div>
    </>
  );
}

function MyData() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const { pending, error, onSubmit } = useSubmit(
    () => api("/me/delete", { body: { password } }),
    () => void forgetDevice({ server: false }).finally(() => window.location.assign("/acceso")),
  );
  return (
    <section>
      <BlockTitle>Tus datos</BlockTitle>
      <p className="max-w-[56ch] text-sm text-ink-2">
        Puedes descargar una copia de todo lo que la app guarda sobre ti (con tus fotos, en un ZIP) o borrar tu cuenta.{" "}
        <Link to="/privacidad" className="font-medium text-primary hover:underline">
          Cómo tratamos tus datos
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href="/api/v1/me/export.zip" download className={buttonClass("secondary")}>
          Descargar mis datos
        </a>
        <Button variant="danger" onClick={() => setOpen(true)}>
          Borrar mi cuenta
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Borrar tu cuenta"
        description="Se borran al momento tu cuenta, tus entrenos, tu plan de comidas, tus citas, los mensajes y las fotos. No se puede deshacer."
        footer={
          <>
            <Button variant="quiet" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" type="submit" form="del-account" loading={pending} disabled={!password}>
              Borrar todo
            </Button>
          </>
        }
      >
        <form id="del-account" onSubmit={onSubmit} className="flex flex-col gap-3">
          <TextField label="Escribe tu contraseña para confirmar" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <FormError message={error} />
        </form>
      </Dialog>
    </section>
  );
}
