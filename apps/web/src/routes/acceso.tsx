import { useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { isChallenge, type LoginResult, type Me } from "@coach/shared";
import { AuthLayout } from "../components/auth-layout";
import { TwoFactorStep } from "../components/two-factor-step";
import { FormError } from "../components/form-error";
import { Button } from "../components/ui/button";
import { TextField } from "../components/ui/field";
import { api, errorMessage } from "../lib/api";
import { homeFor, meQuery } from "../lib/auth";
import { useSubmit } from "../lib/use-form";
import { statusQuery } from "../lib/status";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

export const Route = createFileRoute("/acceso")({
  validateSearch: z.object({ caducada: z.boolean().optional() }),
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me) throw redirect({ to: homeFor(me) });
    const s = await context.queryClient.ensureQueryData(statusQuery);
    if (s.needsSetup) throw redirect({ to: "/instalar" });
  },
  component: Login,
});

function Login() {
  const { caducada } = Route.useSearch();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "forgot" | "sent">("login");
  const enter = (me: Me) => {
    qc.setQueryData(meQuery.queryKey, me);
    void navigate({ to: homeFor(me) });
  };
  const { pending, error, onSubmit } = useSubmit(
    () => api<LoginResult>("/auth/login", { body: { email, password } }),
    (r) => (isChallenge(r) ? (setChallenge(r.challenge), setPassword("")) : enter(r)),
  );
  const forgot = useSubmit(
    () => api("/auth/password/forgot", { body: { email } }),
    () => setMode("sent"),
  );

  const status = useQuery(statusQuery).data;
  const demo = status?.demo;
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

  if (challenge)
    return (
      <AuthLayout title="Verificación en dos pasos" subtitle="Tu cuenta está protegida con un segundo paso.">
        <TwoFactorStep challenge={challenge} onDone={enter} onBack={() => setChallenge(null)} />
      </AuthLayout>
    );

  if (mode === "sent")
    return (
      <AuthLayout title="Revisa tu correo" subtitle={`Si hay una cuenta con ${email}, te llegará en unos minutos un enlace para elegir una contraseña nueva. Caduca en 1 hora.`}>
        <p className="text-sm text-ink-2">¿No llega? Mira en el correo no deseado o espera un poco antes de pedir otro.</p>
        <Button variant="secondary" className="mt-6" onClick={() => setMode("login")}>
          Volver a entrar
        </Button>
      </AuthLayout>
    );

  if (mode === "forgot")
    return (
      <AuthLayout title="Recupera tu contraseña" subtitle="Escribe el correo con el que entras y te mandaremos un enlace.">
        <form onSubmit={forgot.onSubmit} className="flex flex-col gap-4" noValidate>
          <TextField label="Correo electrónico" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          <FormError message={forgot.error} />
          <Button type="submit" size="lg" loading={forgot.pending} disabled={!email.includes("@")}>
            Enviarme el enlace
          </Button>
          <button type="button" className="min-h-10 self-start text-[13.5px] text-ink-2 hover:text-ink" onClick={() => setMode("login")}>
            Volver
          </button>
        </form>
      </AuthLayout>
    );

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
        {caducada && (
          <p role="status" className="border-l-[5px] border-plate-yellow bg-tray px-3 py-2 text-sm">
            Tu sesión ha caducado o se ha cerrado desde otro dispositivo. Vuelve a entrar.
          </p>
        )}
        <TextField label="Correo electrónico" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Contraseña" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <FormError message={error} />
        <Button type="submit" size="lg" loading={pending} className="mt-2">
          Entrar
        </Button>
        {status?.mail ? (
          <button type="button" className="min-h-10 text-center text-[13.5px] font-medium text-primary hover:underline" onClick={() => setMode("forgot")}>
            ¿Has olvidado la contraseña?
          </button>
        ) : (
          <p className="text-center text-[13px] text-ink-3">¿Has olvidado la contraseña? Pídele a tu entrenador un enlace nuevo.</p>
        )}
      </form>
    </AuthLayout>
  );
}
