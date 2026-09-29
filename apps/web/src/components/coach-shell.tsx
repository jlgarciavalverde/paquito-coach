import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Barbell, CalendarBlank, ChatCircle, ForkKnife, GearSix, SignOut, SunHorizon, UsersThree, type Icon } from "@phosphor-icons/react";
import { Brand } from "./brand";
import { Monogram } from "./ui/layout";
import { useLogout, useMe } from "../lib/auth";
import { clientsQuery } from "../lib/queries";
import { cn } from "../lib/cn";

type NavItem = { to: string; label: string; icon: Icon; exact?: boolean };

export const COACH_NAV: NavItem[] = [
  { to: "/coach", label: "Hoy", icon: SunHorizon, exact: true },
  { to: "/coach/clientes", label: "Clientes", icon: UsersThree },
  { to: "/coach/entrenos", label: "Entrenos", icon: Barbell },
  { to: "/coach/nutricion", label: "Nutrición", icon: ForkKnife },
  { to: "/coach/calendario", label: "Agenda", icon: CalendarBlank },
  { to: "/coach/chat", label: "Mensajes", icon: ChatCircle },
];

function useIsActive() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (it: { to: string; exact?: boolean }) => (it.exact ? path === it.to || path === `${it.to}/` : path.startsWith(it.to));
}

/** Marco del entrenador: barra superior de texto en escritorio; barra inferior en móvil. */
export function CoachShell({ children }: { children: ReactNode }) {
  const me = useMe()!;
  const logout = useLogout();
  const isActive = useIsActive();
  const pending = useQuery(clientsQuery("pending")).data?.length ?? 0;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-rule bg-paper/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-8 px-4 sm:px-6">
          <Link to="/coach" className="shrink-0" aria-label="Ir a Hoy">
            <Brand />
          </Link>
          <nav className="hidden h-full items-stretch gap-6 md:flex" aria-label="Principal">
            {COACH_NAV.map((it) => {
              const on = isActive(it);
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  aria-current={on ? "page" : undefined}
                  className={cn("relative flex items-center gap-1.5 border-b-2 text-sm font-medium transition-colors", on ? "border-primary text-ink" : "border-transparent text-ink-2 hover:text-ink")}
                >
                  {it.label}
                  {it.to === "/coach/clientes" && pending > 0 && (
                    <span className="font-narrow rounded-[3px] bg-plate-red px-1.5 text-[12px] leading-[18px] text-paper" aria-label={`${pending} por revisar`}>
                      {pending}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Link to="/coach/ajustes" className="hidden items-center gap-2 rounded-[var(--radius-control)] py-1 pr-2 pl-1 text-sm text-ink-2 hover:bg-tray hover:text-ink sm:flex" aria-label="Ajustes de la cuenta">
              <Monogram name={me.name} size={28} />
              <span className="max-w-[16ch] truncate">{me.studio.name}</span>
            </Link>
            <Link to="/coach/ajustes" className="rounded-[var(--radius-control)] p-2 text-ink-2 hover:bg-tray sm:hidden" aria-label="Ajustes">
              <GearSix size={20} />
            </Link>
            <button onClick={logout} className="rounded-[var(--radius-control)] p-2 text-ink-3 hover:bg-tray hover:text-ink" aria-label="Cerrar sesión" title="Cerrar sesión">
              <SignOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1280px] px-4 pt-6 pb-28 sm:px-6 md:pt-10 md:pb-16">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-rule bg-paper pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Principal">
        {COACH_NAV.map((it) => {
          const on = isActive(it);
          const I = it.icon;
          return (
            <Link key={it.to} to={it.to} aria-current={on ? "page" : undefined} className={cn("relative flex flex-col items-center gap-0.5 pt-2 pb-2.5 text-[11px] font-medium", on ? "text-primary" : "text-ink-3")}>
              {on && <span className="absolute inset-x-3 top-0 h-[3px] rounded-b-[2px] bg-primary" aria-hidden="true" />}
              <I size={21} weight={on ? "fill" : "regular"} />
              {it.label}
              {it.to === "/coach/clientes" && pending > 0 && <span className="absolute top-1.5 left-1/2 ml-2.5 h-2.5 w-[5px] rounded-[1px] bg-plate-red" aria-label={`${pending} por revisar`} />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
