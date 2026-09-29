import type { ReactNode } from "react";
import { Brand, LoadedBarbell } from "./brand";

/**
 * Pantallas de acceso. En escritorio, a la izquierda la barra cargada (el elemento memorable de la app);
 * a la derecha, el formulario. En móvil, solo la marca y el formulario.
 */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-tray p-12 lg:flex">
        <Brand />
        <LoadedBarbell className="absolute top-1/2 -left-16 w-[92%] max-w-[640px] -translate-y-1/2" />
        <p className="relative max-w-[34ch] text-ink-2">Programación de fuerza y readaptación: rutinas, comidas, agenda y chat con tu entrenador.</p>
      </aside>
      <main className="flex flex-col px-5 py-8 sm:px-10 lg:justify-center lg:px-20">
        <div className="mb-12 lg:hidden">
          <Brand />
        </div>
        <div className="w-full max-w-[400px]">
          <h1 className="font-wide text-[30px] leading-[1.1]">{title}</h1>
          {subtitle && <p className="mt-2 text-ink-2">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-10 text-sm text-ink-2">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
