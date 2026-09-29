import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Desktop, DeviceMobile, Moon, Sun, SunHorizon } from "@phosphor-icons/react";
import type { SessionInfo } from "@coach/shared";
import { Card } from "./ui/surface";
import { Button } from "./ui/button";
import { TextField } from "./ui/field";
import { useToast } from "./ui/toast";
import { FormError } from "./form-error";
import { api } from "../lib/api";
import { useSubmit } from "../lib/use-form";
import { getThemePref, setThemePref, type ThemePref } from "../lib/theme";
import { relativeTime } from "../lib/format";
import { cn } from "../lib/cn";

export function ThemeCard() {
  const [pref, setPref] = useState<ThemePref>(getThemePref);
  const opts: { v: ThemePref; label: string; icon: typeof Sun }[] = [
    { v: "system", label: "Automático", icon: SunHorizon },
    { v: "light", label: "Claro", icon: Sun },
    { v: "dark", label: "Oscuro", icon: Moon },
  ];
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-[24px]">Apariencia</h2>
      <div className="mt-4 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tema">
        {opts.map(({ v, label, icon: I }) => (
          <button
            key={v}
            role="radio"
            aria-checked={pref === v}
            onClick={() => {
              setPref(v);
              setThemePref(v);
            }}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-[14px] border py-3 text-[13px] font-medium transition-colors",
              pref === v ? "border-accent bg-accent-soft text-accent-soft-ink" : "border-line-strong text-ink-2 hover:bg-surface-2",
            )}
          >
            <I size={20} /> {label}
          </button>
        ))}
      </div>
    </Card>
  );
}

export function PasswordCard() {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const { pending, error, onSubmit } = useSubmit(
    () => api("/auth/password/change", { body: { current, next } }),
    () => {
      setCurrent("");
      setNext("");
      toast("Contraseña cambiada. Hemos cerrado tus otras sesiones.");
    },
  );
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-[24px]">Contraseña</h2>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
        <TextField label="Contraseña actual" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <TextField label="Nueva contraseña" type="password" autoComplete="new-password" hint="Mínimo 10 caracteres." value={next} onChange={(e) => setNext(e.target.value)} />
        <FormError message={error} />
        <Button type="submit" variant="secondary" loading={pending} disabled={!current || next.length < 10} className="self-start">
          Cambiar contraseña
        </Button>
      </form>
    </Card>
  );
}

export function SessionsCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sessions"], queryFn: () => api<SessionInfo[]>("/me/sessions") });
  const close = useMutation({
    mutationFn: (id: string) => api(`/me/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-[24px]">Dispositivos con sesión abierta</h2>
      <ul className="mt-4 divide-y divide-line">
        {(q.data ?? []).map((s) => {
          const mobile = /Mobile|Android|iPhone/i.test(s.userAgent ?? "");
          const I = mobile ? DeviceMobile : Desktop;
          return (
            <li key={s.id} className="flex items-center gap-3 py-3">
              <I size={20} className="text-ink-3" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{describeUA(s.userAgent)}</span>
                <span className="block text-[12px] text-ink-3">{s.current ? "Este dispositivo" : `Último uso ${relativeTime(s.lastUsedAt)}`}</span>
              </span>
              {!s.current && (
                <Button size="sm" variant="ghost" loading={close.isPending && close.variables === s.id} onClick={() => close.mutate(s.id)}>
                  Cerrar
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function describeUA(ua: string | null) {
  if (!ua) return "Dispositivo desconocido";
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  return os ? `${br} en ${os}` : br;
}
