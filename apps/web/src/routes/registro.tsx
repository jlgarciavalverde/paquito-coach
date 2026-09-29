import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { InvitePreview, Me } from "@coach/shared";
import { AuthLayout } from "../components/auth-layout";
import { FormError } from "../components/form-error";
import { Button } from "../components/ui/button";
import { Checkbox, TextField } from "../components/ui/field";
import { Skeleton } from "../components/ui/spinner";
import { api, errorMessage } from "../lib/api";
import { homeFor, meQuery } from "../lib/auth";
import { firstName } from "../lib/format";
import { useSubmit } from "../lib/use-form";

export const Route = createFileRoute("/registro")({
  validateSearch: z.object({ invitacion: z.string().optional(), codigo: z.string().optional() }),
  component: Register,
});

function Register() {
  const { invitacion, codigo } = Route.useSearch();
  const [code, setCode] = useState(codigo ?? "");
  const [confirmedCode, setConfirmedCode] = useState(codigo ?? "");

  const preview = useQuery({
    queryKey: ["invite-preview", invitacion ?? null, confirmedCode],
    enabled: Boolean(invitacion || confirmedCode),
    queryFn: () => (invitacion ? api<InvitePreview>(`/auth/invites/${encodeURIComponent(invitacion)}`) : api<InvitePreview>(`/auth/join/${encodeURIComponent(confirmedCode)}`)),
    retry: false,
  });

  const footer = (
    <>
      ¿Ya tienes cuenta?{" "}
      <Link to="/acceso" className="font-medium text-primary underline-offset-4 hover:underline">
        Entra aquí
      </Link>
    </>
  );

  // Sin invitación ni código: pedir el código del entrenador.
  if (!invitacion && (!confirmedCode || preview.isError)) {
    return (
      <AuthLayout title="Únete a tu entrenador" subtitle="Escribe el código que te ha pasado tu entrenador." footer={footer}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setConfirmedCode(code.trim().toUpperCase());
          }}
        >
          <TextField
            label="Código del estudio"
            placeholder="Ej.: K7QM4RZP"
            autoComplete="off"
            autoCapitalize="characters"
            className="[&_input]:tracking-[0.2em] [&_input]:uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            error={preview.isError ? errorMessage(preview.error) : null}
          />
          <Button type="submit" size="lg" disabled={code.trim().length < 4}>
            Continuar
          </Button>
        </form>
      </AuthLayout>
    );
  }

  if (preview.isPending) {
    return (
      <AuthLayout title="Un momento…">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
      </AuthLayout>
    );
  }

  if (preview.isError) {
    return (
      <AuthLayout title="Invitación no válida" subtitle={errorMessage(preview.error)} footer={footer}>
        <Link to="/registro" search={{}} className="font-medium text-primary underline-offset-4 hover:underline">
          Tengo un código de estudio
        </Link>
      </AuthLayout>
    );
  }

  return <RegisterForm preview={preview.data} inviteToken={invitacion} joinCode={invitacion ? undefined : confirmedCode} footer={footer} />;
}

function RegisterForm({ preview, inviteToken, joinCode, footer }: { preview: InvitePreview; inviteToken?: string; joinCode?: string; footer: React.ReactNode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(preview.clientName ?? "");
  const [email, setEmail] = useState(preview.email ?? "");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const { pending, error, onSubmit } = useSubmit(
    () => api<Me>("/auth/register", { body: { inviteToken, joinCode, name, email, password, healthDataConsent: consent } }),
    (me) => {
      qc.setQueryData(meQuery.queryKey, me);
      // Con invitación ya está activo: lo primero, el cuestionario de salud (puede posponerlo).
      void navigate({ to: me.clientStatus === "active" ? "/app/salud" : homeFor(me) });
    },
  );
  const coach = firstName(preview.coachName);
  return (
    <AuthLayout
      title={preview.clientName ? `Hola, ${firstName(preview.clientName)}` : "Crea tu cuenta"}
      subtitle={
        <>
          {coach} te espera en <strong className="font-medium text-ink">{preview.studioName}</strong>.
          {joinCode && " Cuando te registres, tendrá que aceptar tu solicitud."}
        </>
      }
      footer={footer}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField label="Nombre y apellidos" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="Correo electrónico" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Contraseña" type="password" autoComplete="new-password" hint="Mínimo 10 caracteres." required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Checkbox
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          label={`Doy mi consentimiento para que ${coach} guarde y trate mis datos de salud (lesiones, medidas, entrenos y alimentación) para planificar mi entrenamiento.`}
          description={
            <>
              Puedes descargar o borrar tus datos cuando quieras desde tu perfil.{" "}
              <Link to="/privacidad" target="_blank" className="font-medium text-primary underline-offset-4 hover:underline">
                Más información
              </Link>
            </>
          }
        />
        <FormError message={error} />
        <Button type="submit" size="lg" loading={pending} disabled={!consent} className="mt-2">
          Crear mi cuenta
        </Button>
      </form>
    </AuthLayout>
  );
}
