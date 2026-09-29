import { useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { Me } from "@coach/shared";
import { AuthLayout } from "../components/auth-layout";
import { FormError } from "../components/form-error";
import { Button } from "../components/ui/button";
import { TextField } from "../components/ui/field";
import { api } from "../lib/api";
import { homeFor, meQuery } from "../lib/auth";
import { useSubmit } from "../lib/use-form";

export const Route = createFileRoute("/acceso")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me) throw redirect({ to: homeFor(me) });
    const s = await api<{ needsSetup: boolean }>("/auth/setup-status");
    if (s.needsSetup) throw redirect({ to: "/instalar" });
  },
  component: Login,
});

function Login() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { pending, error, onSubmit } = useSubmit(
    () => api<Me>("/auth/login", { body: { email, password } }),
    (me) => {
      qc.setQueryData(meQuery.queryKey, me);
      void navigate({ to: homeFor(me) });
    },
  );

  return (
    <AuthLayout
      title="Hola de nuevo"
      subtitle="Entra con tu correo y tu contraseña."
      footer={
        <>
          ¿Tu entrenador te ha dado un código?{" "}
          <Link to="/registro" className="font-medium text-accent underline-offset-4 hover:underline">
            Crea tu cuenta
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField label="Correo electrónico" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Contraseña" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <FormError message={error} />
        <Button type="submit" size="lg" loading={pending} className="mt-2">
          Entrar
        </Button>
        <p className="text-center text-[13px] text-ink-3">¿Has olvidado la contraseña? Pídele a tu entrenador un enlace nuevo.</p>
      </form>
    </AuthLayout>
  );
}
