import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Barbell, ChatCircle, ForkKnife, House, UserCircle, type Icon } from "@phosphor-icons/react";
import { Brand } from "./auth-layout";
import { cn } from "../lib/cn";

const TABS: { to: string; label: string; icon: Icon; exact?: boolean }[] = [
  { to: "/app", label: "Hoy", icon: House, exact: true },
  { to: "/app/entreno", label: "Entreno", icon: Barbell },
  { to: "/app/comidas", label: "Comidas", icon: ForkKnife },
  { to: "/app/chat", label: "Chat", icon: ChatCircle },
  { to: "/app/perfil", label: "Perfil", icon: UserCircle },
];

/** Marco del cliente: pensado para el móvil (barra inferior); en escritorio, columna central con barra superior. */
export function ClientShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const active = (t: (typeof TABS)[number]) => (t.exact ? path === t.to || path === `${t.to}/` : path.startsWith(t.to));
  return (
    <div className="paper-grain min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:h-16">
          <Brand />
          <nav className="hidden gap-1 sm:flex" aria-label="Principal">
            {TABS.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                aria-current={active(t) ? "page" : undefined}
                className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium", active(t) ? "bg-ink text-paper" : "text-ink-2 hover:bg-surface-2")}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pt-6 pb-28 sm:pt-10">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden" aria-label="Principal">
        {TABS.map((t) => {
          const on = active(t);
          const I = t.icon;
          return (
            <Link key={t.to} to={t.to} aria-current={on ? "page" : undefined} className={cn("flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium", on ? "text-accent" : "text-ink-3")}>
              <I size={22} weight={on ? "fill" : "regular"} />
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
