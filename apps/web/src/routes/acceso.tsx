import { useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { Me } from "@coach/shared";
import { AuthLayout } from "../components/auth-layout";
import { FormError } from "../components/form-error";
import { Button } from "../components/ui/button";
import { TextField } from "../components/ui/field";
import { api, errorMessage } from "../lib/api";
import { homeFor, meQuery } from "../lib/auth";
import { useSubmit } from "../lib/use-form";
import { statusQuery } from "../lib/status";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/acceso")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me) throw redirect({ to: homeFor(me) });
    const s = await context.queryClient.ensureQueryData(statusQuery);
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

  const demo = useQuery(statusQuery).data?.demo;
  const [demoPending, setDemoPending] = useState<"coach" | "client" | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  if (demo) {
    const go = async (as: "coach" | "client") => {
      setDemoPending(as);
      setDemoError(null);
      try {
        const me = await api<Me>("/auth/demo", { body: { as } });
        qc.setQueryData(meQuery.queryKey, me);
        void navigate({ to: homeFor(me) });
      } catch (e) {
        setDemoError(errorMessage(e));
      } finally {
        setDemoPending(null);
      }
    };
    return (
      <AuthLayout title="Prueba la app" subtitle="Es una demostración con clientes, entrenos y mensajes inventados. Puedes tocar lo que quieras: todo vuelve a su estado cada noche.">
        <div className="flex flex-col gap-3">
          <Button size="lg" loading={demoPending === "coach"} disabled={demoPending !== null} onClick={() => void go("coach")}>
            Entrar como entrenador
          </Button>
          <Button size="lg" variant="secondary" loading={demoPending === "client"} disabled={demoPending !== null} onClick={() => void go("client")}>
            Entrar como clienta (Lucía)
          </Button>
          <FormError message={demoError} />
          <p className="text-[13px] text-ink-3">Para ver las dos caras a la vez, abre una ventana privada y entra con el otro papel.</p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Hola de nuevo"
      subtitle="Entra con tu correo y tu contraseña."
      footer={
        <>
          ¿Tu entrenador te ha dado un código?{" "}
          <Link to="/registro" className="font-medium text-primary underline-offset-4 hover:underline">
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
