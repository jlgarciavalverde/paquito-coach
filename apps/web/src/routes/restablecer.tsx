import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { isChallenge, type LoginResult, type Me } from "@coach/shared";
import { AuthLayout } from "../components/auth-layout";
import { TwoFactorStep } from "../components/two-factor-step";
import { FormError } from "../components/form-error";
import { Button } from "../components/ui/button";
import { TextField } from "../components/ui/field";
import { api } from "../lib/api";
import { homeFor, meQuery } from "../lib/auth";
import { useSubmit } from "../lib/use-form";

export const Route = createFileRoute("/restablecer")({
  validateSearch: z.object({ token: z.string().optional() }),
  component: Reset,
});

function Reset() {
  const { token } = Route.useSearch();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const enter = (me: Me) => {
    qc.setQueryData(meQuery.queryKey, me);
    void navigate({ to: homeFor(me) });
  };
  const { pending, error, onSubmit } = useSubmit(
    () => api<LoginResult>("/auth/password/reset", { body: { token, password } }),
    (r) => (isChallenge(r) ? setChallenge(r.challenge) : enter(r)),
  );
  // Con la verificación en dos pasos, la contraseña ya está cambiada pero falta el código para entrar.
  if (challenge)
    return (
      <AuthLayout title="Contraseña cambiada" subtitle="Para entrar, completa la verificación en dos pasos.">
        <TwoFactorStep challenge={challenge} onDone={enter} onBack={() => void navigate({ to: "/acceso" })} />
      </AuthLayout>
    );
  return (
    <AuthLayout title="Nueva contraseña" subtitle="Elige una contraseña nueva. Se cerrará la sesión en tus otros dispositivos.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField label="Contraseña nueva" type="password" autoComplete="new-password" hint="Mínimo 10 caracteres." value={password} onChange={(e) => setPassword(e.target.value)} />
        <FormError message={token ? error : "Falta el enlace. Ábrelo tal cual te ha llegado (por correo o de tu entrenador)."} />
        <Button type="submit" size="lg" loading={pending} disabled={!token || password.length < 10}>
          Guardar y entrar
        </Button>
      </form>
    </AuthLayout>
  );
}
