import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { AuthLayout } from "../components/auth-layout";
import { FormError } from "../components/form-error";
import { Button, buttonClass } from "../components/ui/button";
import { api } from "../lib/api";
import { useSubmit } from "../lib/use-form";
import { useState } from "react";

export const Route = createFileRoute("/baja")({
  validateSearch: z.object({ token: z.string().optional() }),
  component: Unsubscribe,
});

/**
 * «Darme de baja» desde un correo. Pide confirmar con un botón (no al abrir el enlace): algunos correos abren los
 * enlaces solos para revisarlos y darían de baja sin querer.
 */
function Unsubscribe() {
  const { token } = Route.useSearch();
  const [done, setDone] = useState(false);
  const { pending, error, onSubmit } = useSubmit(() => api("/auth/unsubscribe", { body: { token } }), () => setDone(true));
  return (
    <AuthLayout
      title={done ? "Hecho" : "Dejar de recibir correos"}
      subtitle={
        done
          ? "Ya no te mandaremos confirmaciones ni avisos por correo. Los de seguridad (como cambiar la contraseña) sí te llegarán. Puedes volver a activarlos en tu perfil."
          : "Dejarás de recibir confirmaciones de reservas y avisos por correo. Los avisos en el móvil no cambian."
      }
    >
      {done ? (
        <Link to="/" className={buttonClass("secondary")}>
          Ir a la app
        </Link>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormError message={token ? error : "Falta el enlace. Ábrelo tal cual te ha llegado por correo."} />
          <Button type="submit" size="lg" loading={pending} disabled={!token}>
            Darme de baja
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
