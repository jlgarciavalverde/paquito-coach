import { useState } from "react";
import type { Me } from "@coach/shared";
import { FormError } from "./form-error";
import { Button } from "./ui/button";
import { TextField } from "./ui/field";
import { api } from "../lib/api";
import { useSubmit } from "../lib/use-form";

/** Segundo paso al entrar: el código de 6 cifras de la app de autenticación, o uno de los de recuperación. */
export function TwoFactorStep({ challenge, onDone, onBack }: { challenge: string; onDone: (me: Me) => void; onBack: () => void }) {
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState("");
  const { pending, error, onSubmit } = useSubmit(() => api<Me>("/auth/login/2fa", { body: { challenge, code } }), onDone);
  const ready = recovery ? code.trim().length >= 8 : /^\d{6}$/.test(code.replace(/\s/g, ""));
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <p className="text-ink-2">{recovery ? "Escribe uno de los códigos de recuperación que guardaste al activarla. Cada uno sirve una vez." : "Abre tu app de autenticación y escribe el código de 6 cifras."}</p>
      {recovery ? (
        <TextField key="rec" label="Código de recuperación" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="abcd-efgh" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
      ) : (
        <TextField
          key="totp"
          label="Código"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))}
          className="[&_input]:font-narrow [&_input]:text-[22px] [&_input]:tracking-[0.2em]"
          autoFocus
        />
      )}
      <FormError message={error} />
      <Button type="submit" size="lg" loading={pending} disabled={!ready}>
        Entrar
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-[13.5px]">
        <button type="button" className="min-h-10 font-medium text-primary hover:underline" onClick={() => (setRecovery((r) => !r), setCode(""))}>
          {recovery ? "Usar el código de la app" : "No tengo el móvil: usar un código de recuperación"}
        </button>
        <button type="button" className="min-h-10 text-ink-2 hover:text-ink" onClick={onBack}>
          Volver
        </button>
      </div>
    </form>
  );
}
