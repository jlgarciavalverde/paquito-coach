import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { AuthLayout } from "../components/auth-layout";
import { FormError } from "../components/form-error";
import { buttonClass } from "../components/ui/button";
import { Spinner } from "../components/ui/spinner";
import { api, errorMessage } from "../lib/api";
import { meQuery } from "../lib/auth";

export const Route = createFileRoute("/confirmar-correo")({
  validateSearch: z.object({ token: z.string().optional() }),
  component: ConfirmEmail,
});

/** Enlace del correo «Confirma tu correo nuevo». Se confirma al abrirlo (una vez, aunque React monte dos veces). */
function ConfirmEmail() {
  const { token } = Route.useSearch();
  const qc = useQueryClient();
  const [state, setState] = useState<"working" | "done" | string>(token ? "working" : "Falta el enlace. Ábrelo tal cual te ha llegado por correo.");
  const sent = useRef(false);
  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    api("/auth/email/confirm", { body: { token } }).then(
      () => (setState("done"), void qc.invalidateQueries({ queryKey: meQuery.queryKey })),
      (e) => setState(errorMessage(e)),
    );
  }, [token, qc]);
  return (
    <AuthLayout title={state === "done" ? "Correo cambiado" : "Confirmar el correo"} subtitle={state === "done" ? "A partir de ahora entras con tu correo nuevo." : undefined}>
      {state === "working" ? (
        <p className="flex items-center gap-2 text-ink-2">
          <Spinner className="size-4" /> Confirmando…
        </p>
      ) : state === "done" ? null : (
        <FormError message={state} />
      )}
      <Link to="/" className={buttonClass("secondary", "md", "mt-6")}>
        Ir a la app
      </Link>
    </AuthLayout>
  );
}
