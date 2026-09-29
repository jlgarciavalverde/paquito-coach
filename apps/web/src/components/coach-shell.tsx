import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Barbell, CalendarBlank, ChatCircle, ForkKnife, GearSix, House, SignOut, UsersThree } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { Brand } from "./auth-layout";
import { Avatar } from "./ui/avatar";
import { useLogout, useMe } from "../lib/auth";
import { clientsQuery } from "../lib/queries";
import { cn } from "../lib/cn";

type NavItem = { to: string; label: string; icon: Icon; exact?: boolean; soon?: boolean };

const NAV: NavItem[] = [
  { to: "/coach", label: "Inicio", icon: House, exact: true },
  { to: "/coach/clientes", label: "Clientes", icon: UsersThree },
  { to: "/coach/calendario", label: "Calendario", icon: CalendarBlank, soon: true },
  { to: "/coach/entrenos", label: "Entrenamientos", icon: Barbell, soon: true },
  { to: "/coach/nutricion", label: "Nutrición", icon: ForkKnife, soon: true },
  { to: "/coach/chat", label: "Mensajes", icon: ChatCircle, soon: true },
];

function useActive() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (it: NavItem) => (it.exact ? path === it.to || path === `${it.to}/` : path.startsWith(it.to));
}

/** Marco del entrenador: barra lateral en escritorio, barra inferior en móvil. */
export function CoachShell({ children }: { children: ReactNode }) {
  const me = useMe()!;
  const logout = useLogout();
  const isActive = useActive();
  const pending = useQuery(clientsQuery("pending")).data?.length ?? 0;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface/60 px-4 py-6 backdrop-blur lg:flex">
        <div className="px-2">
          <Brand />
          <p className="mt-2 truncate text-[13px] text-ink-3">{me.studio.name}</p>
        </div>
        <nav className="mt-8 flex flex-col gap-0.5" aria-label="Principal">
          {NAV.map((it) => (
            <SideLink key={it.to} item={it} active={isActive(it)} badge={it.to === "/coach/clientes" ? pending : 0} />
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-4">
          <SideLink item={{ to: "/coach/ajustes", label: "Ajustes", icon: GearSix }} active={isActive({ to: "/coach/ajustes", label: "", icon: GearSix })} />
          <div className="mt-3 flex items-center gap-3 rounded-[12px] px-2 py-2">
            <Avatar name={me.name} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{me.name}</p>
              <p className="truncate text-[12px] text-ink-3">Entrenador</p>
            </div>
            <button onClick={logout} className="rounded-[10px] p-2 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Cerrar sesión" title="Cerrar sesión">
              <SignOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-paper/85 px-4 backdrop-blur lg:hidden">
          <Brand />
          <Link to="/coach/ajustes" aria-label="Ajustes" className="rounded-[10px] p-2 text-ink-2 hover:bg-surface-2">
            <GearSix size={20} />
          </Link>
        </header>
        <main className="paper-grain min-h-dvh flex-1 px-4 pt-6 pb-28 sm:px-8 lg:px-12 lg:pt-12 lg:pb-16">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Principal">
        {NAV.filter((n) => !n.soon || n.to === "/coach/calendario" || n.to === "/coach/chat").map((it) => {
          const active = isActive(it);
          const Ico = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              aria-current={active ? "page" : undefined}
              className={cn("relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium", active ? "text-accent" : "text-ink-3")}
            >
              <Ico size={22} weight={active ? "fill" : "regular"} />
              {it.label}
              {it.to === "/coach/clientes" && pending > 0 && <span className="absolute top-1.5 left-1/2 ml-2 size-2 rounded-full bg-clay" aria-label={`${pending} pendientes`} />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function SideLink({ item, active, badge = 0 }: { item: NavItem; active: boolean; badge?: number }) {
  const Ico = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-10 items-center gap-3 rounded-[11px] px-3 text-[14px] font-medium transition-colors",
        active ? "bg-accent-soft text-accent-soft-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
      )}
    >
      <Ico size={19} weight={active ? "fill" : "regular"} />
      <span className="flex-1">{item.label}</span>
      {item.soon && <span className="text-[11px] font-normal text-ink-3">Pronto</span>}
      {badge > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-clay px-1.5 text-[11px] font-semibold text-paper tabular">{badge}</span>}
    </Link>
  );
}
