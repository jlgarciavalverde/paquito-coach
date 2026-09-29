import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { Me } from "@coach/shared";
import { AuthLayout } from "../components/auth-layout";
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
  const { pending, error, onSubmit } = useSubmit(
    () => api<Me>("/auth/password/reset", { body: { token, password } }),
    (me) => {
      qc.setQueryData(meQuery.queryKey, me);
      void navigate({ to: homeFor(me) });
    },
  );
  return (
    <AuthLayout title="Nueva contraseña" subtitle="Elige una contraseña nueva. Se cerrará la sesión en tus otros dispositivos.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField label="Contraseña nueva" type="password" autoComplete="new-password" hint="Mínimo 10 caracteres." value={password} onChange={(e) => setPassword(e.target.value)} />
        <FormError message={token ? error : "Falta el enlace. Ábrelo tal cual te lo ha mandado tu entrenador."} />
        <Button type="submit" size="lg" loading={pending} disabled={!token || password.length < 10}>
          Guardar y entrar
        </Button>
      </form>
    </AuthLayout>
  );
}
