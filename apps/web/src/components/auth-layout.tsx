import type { ReactNode } from "react";
import { motion } from "motion/react";
import { BRAND } from "@coach/shared";

/**
 * Pantallas de acceso: a la izquierda una columna editorial (marca + cita), a la derecha el formulario.
 * En móvil solo el formulario con la marca arriba.
 */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-brand text-brand-ink lg:flex lg:flex-col lg:justify-between lg:p-14">
        <Brand light />
        <div className="relative z-10 max-w-md">
          <p className="font-display text-[56px] leading-[1.02] tracking-[-0.01em]">
            Fuerza que se <em className="text-[#e7b98f]">construye</em>, cuerpo que se <em className="text-[#e7b98f]">recupera</em>.
          </p>
          <p className="mt-6 max-w-sm text-[15px] leading-relaxed opacity-80">
            Tu plan de entrenamiento, tus comidas, tu agenda y el contacto directo con tu entrenador, en un solo sitio.
          </p>
        </div>
        <p className="relative z-10 text-[13px] opacity-60">{BRAND.tagline}</p>
        <Rings />
      </aside>
      <main className="paper-grain flex flex-col px-5 py-8 sm:px-10 lg:justify-center lg:px-16">
        <div className="mb-10 lg:hidden">
          <Brand />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto w-full max-w-[420px]"
        >
          <h1 className="font-display text-[44px] leading-[1.05] tracking-[-0.01em]">{title}</h1>
          {subtitle && <p className="mt-2 text-ink-2">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 border-t border-line pt-6 text-sm text-ink-2">{footer}</div>}
        </motion.div>
      </main>
    </div>
  );
}

export function Brand({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`flex size-9 items-center justify-center rounded-[11px] ${light ? "bg-[rgb(255_255_255/0.12)]" : "bg-brand"}`}>
        <svg viewBox="0 0 64 64" className="size-6" aria-hidden="true">
          <path d="M16 42c7-16 25-16 32 0" fill="none" stroke="#F6F2EC" strokeWidth="5" strokeLinecap="round" />
          <circle cx="32" cy="22" r="6" fill="#E7B98F" />
        </svg>
      </span>
      <span className={`font-display text-[24px] leading-none ${light ? "" : "text-ink"}`}>{BRAND.name}</span>
    </div>
  );
}

/** Anillos concéntricos decorativos (evocan un disco de pesas / un pulso), en SVG para no pesar nada. */
function Rings() {
  return (
    <svg className="pointer-events-none absolute -right-40 -bottom-40 size-[640px] opacity-[0.14]" viewBox="0 0 400 400" aria-hidden="true">
      {[190, 160, 130, 100, 70].map((r) => (
        <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="#F6F2EC" strokeWidth={r === 130 ? 14 : 1.5} />
      ))}
    </svg>
  );
}
