import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Barbell, CalendarBlank, ChatCircle, ForkKnife, SunHorizon, UserCircle, type Icon } from "@phosphor-icons/react";
import { Brand } from "./brand";
import { cn } from "../lib/cn";
import { useQuery } from "@tanstack/react-query";
import { myUnreadQuery } from "../lib/chat";
import { useRealtime } from "../lib/realtime";

const TABS: { to: string; label: string; icon: Icon; exact?: boolean }[] = [
  { to: "/app", label: "Hoy", icon: SunHorizon, exact: true },
  { to: "/app/entreno", label: "Entreno", icon: Barbell },
  { to: "/app/comidas", label: "Comidas", icon: ForkKnife },
  { to: "/app/agenda", label: "Agenda", icon: CalendarBlank },
  { to: "/app/chat", label: "Chat", icon: ChatCircle },
  { to: "/app/perfil", label: "Perfil", icon: UserCircle },
];

/** Marco del cliente: pensado para el móvil (barra inferior); en escritorio, una columna con pestañas arriba. */
export function ClientShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  useRealtime("client");
  const unread = useQuery({ ...myUnreadQuery, refetchInterval: 120_000 }).data?.unread ?? 0;
  const active = (t: (typeof TABS)[number]) => (t.exact ? path === t.to || path === `${t.to}/` : path.startsWith(t.to));
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-rule bg-paper/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[760px] items-center justify-between px-4">
          <Brand />
          <nav className="hidden h-14 items-stretch gap-5 sm:flex" aria-label="Principal">
            {TABS.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                aria-current={active(t) ? "page" : undefined}
                className={cn("flex items-center border-b-2 text-sm font-medium", active(t) ? "border-primary text-ink" : "border-transparent text-ink-2 hover:text-ink")}
              >
                {t.label}
                {t.to === "/app/chat" && unread > 0 && (
                  <span className="font-narrow ml-1.5 rounded-[3px] bg-primary px-1.5 text-[12px] leading-[18px] text-primary-ink" aria-label={`${unread} sin leer`}>
                    {unread}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[760px] px-4 pt-6 pb-28 sm:pt-10">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-rule bg-paper pb-[env(safe-area-inset-bottom)] sm:hidden" aria-label="Principal">
        {TABS.map((t) => {
          const on = active(t);
          const I = t.icon;
          return (
            <Link key={t.to} to={t.to} aria-current={on ? "page" : undefined} className={cn("relative flex flex-col items-center gap-0.5 pt-2 pb-2.5 text-[11px] font-medium", on ? "text-primary" : "text-ink-3")}>
              {on && <span className="absolute inset-x-3 top-0 h-[3px] rounded-b-[2px] bg-primary" aria-hidden="true" />}
              <I size={21} weight={on ? "fill" : "regular"} />
              {t.label}
              {t.to === "/app/chat" && unread > 0 && <span className="absolute top-1.5 left-1/2 ml-2.5 h-2.5 w-[5px] rounded-[1px] bg-primary" aria-label={`${unread} sin leer`} />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
