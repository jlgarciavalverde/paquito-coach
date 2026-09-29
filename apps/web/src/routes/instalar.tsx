import { useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { Me } from "@coach/shared";
import { AuthLayout } from "../components/auth-layout";
import { FormError } from "../components/form-error";
import { Button } from "../components/ui/button";
import { TextField } from "../components/ui/field";
import { api } from "../lib/api";
import { meQuery } from "../lib/auth";
import { useSubmit } from "../lib/use-form";

/** Alta inicial (una sola vez): el estudio y la cuenta del entrenador. Pide el código de instalación del servidor. */
export const Route = createFileRoute("/instalar")({
  beforeLoad: async () => {
    const s = await api<{ needsSetup: boolean }>("/auth/setup-status");
    if (!s.needsSetup) throw redirect({ to: "/acceso" });
  },
  component: Setup,
});

function Setup() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [f, setF] = useState({ setupCode: "", studioName: "", name: "", email: "", password: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((v) => ({ ...v, [k]: e.target.value }));
  const { pending, error, onSubmit } = useSubmit(
    () => api<Me>("/auth/setup", { body: f }),
    (me) => {
      qc.setQueryData(meQuery.queryKey, me);
      void navigate({ to: "/coach" });
    },
  );
  return (
    <AuthLayout title="Pongamos en marcha tu estudio" subtitle="Esto solo se hace una vez. Después invitarás a tus clientes desde dentro.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField label="Nombre del estudio" placeholder="Ej.: Estudio Paquito" required value={f.studioName} onChange={set("studioName")} />
        <TextField label="Tu nombre" autoComplete="name" required value={f.name} onChange={set("name")} />
        <TextField label="Correo electrónico" type="email" autoComplete="email" required value={f.email} onChange={set("email")} />
        <TextField label="Contraseña" type="password" autoComplete="new-password" hint="Mínimo 10 caracteres. Mejor una frase que una palabra." required value={f.password} onChange={set("password")} />
        <TextField label="Código de instalación" hint="Te lo da quien administra el servidor." autoComplete="off" required value={f.setupCode} onChange={set("setupCode")} />
        <FormError message={error} />
        <Button type="submit" size="lg" loading={pending} className="mt-2">
          Crear mi estudio
        </Button>
      </form>
    </AuthLayout>
  );
}
