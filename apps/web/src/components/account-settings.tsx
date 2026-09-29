import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SessionInfo } from "@coach/shared";
import { Button } from "./ui/button";
import { TextField } from "./ui/field";
import { BlockTitle } from "./ui/layout";
import { useToast } from "./ui/toast";
import { FormError } from "./form-error";
import { api } from "../lib/api";
import { useSubmit } from "../lib/use-form";
import { getThemePref, setThemePref, type ThemePref } from "../lib/theme";
import { relativeTime } from "../lib/format";
import { cn } from "../lib/cn";

export function ThemeSetting() {
  const [pref, setPref] = useState<ThemePref>(getThemePref);
  const opts: { v: ThemePref; label: string }[] = [
    { v: "system", label: "Como el dispositivo" },
    { v: "light", label: "Claro" },
    { v: "dark", label: "Oscuro" },
  ];
  return (
    <section>
      <BlockTitle>Apariencia</BlockTitle>
      <div className="inline-flex rounded-[var(--radius-control)] border border-rule-strong p-0.5" role="radiogroup" aria-label="Tema">
        {opts.map(({ v, label }) => (
          <button
            key={v}
            role="radio"
            aria-checked={pref === v}
            onClick={() => {
              setPref(v);
              setThemePref(v);
            }}
            className={cn("h-9 rounded-[4px] px-3 text-sm font-medium", pref === v ? "bg-ink text-paper" : "text-ink-2 hover:text-ink")}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

export function PasswordSetting() {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const { pending, error, onSubmit } = useSubmit(
    () => api("/auth/password/change", { body: { current, next } }),
    () => {
      setCurrent("");
      setNext("");
      toast("Contraseña cambiada. Se han cerrado tus otras sesiones.");
    },
  );
  return (
    <section>
      <BlockTitle>Contraseña</BlockTitle>
      <form onSubmit={onSubmit} className="flex max-w-[420px] flex-col gap-4">
        <TextField label="Contraseña actual" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <TextField label="Nueva contraseña" type="password" autoComplete="new-password" hint="Mínimo 10 caracteres." value={next} onChange={(e) => setNext(e.target.value)} />
        <FormError message={error} />
        <Button type="submit" variant="secondary" loading={pending} disabled={!current || next.length < 10} className="self-start">
          Cambiar contraseña
        </Button>
      </form>
    </section>
  );
}

export function SessionsSetting() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sessions"], queryFn: () => api<SessionInfo[]>("/me/sessions") });
  const close = useMutation({
    mutationFn: (id: string) => api(`/me/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
  return (
    <section>
      <BlockTitle>Dónde tienes la sesión abierta</BlockTitle>
      <ul className="divide-y divide-rule border-y border-rule">
        {(q.data ?? []).map((s) => (
          <li key={s.id} className="flex items-center gap-3 py-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink">{describeUA(s.userAgent)}</span>
              <span className="block text-[13px] text-ink-3">{s.current ? "Este dispositivo" : `Último uso ${relativeTime(s.lastUsedAt)}`}</span>
            </span>
            {!s.current && (
              <Button size="sm" variant="quiet" loading={close.isPending && close.variables === s.id} onClick={() => close.mutate(s.id)}>
                Cerrar sesión
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function describeUA(ua: string | null) {
  if (!ua) return "Dispositivo desconocido";
  const os = /iPhone|iPad/.test(ua) ? "iPhone o iPad" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  return os ? `${br} en ${os}` : br;
}
