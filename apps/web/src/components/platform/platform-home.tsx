import { Link } from "@tanstack/react-router";
import { formatEuros, type PlatformInfo } from "@coach/shared";
import { useDocumentTitle } from "../../lib/title";
import { Brand, LoadedBarbell } from "../brand";
import { LegalLinks } from "../legal-layout";
import { buttonClass } from "../ui/button";
import { BlockTitle } from "../ui/layout";

/** Lo que hay dentro, contado como en la ficha de un cliente: qué es a la izquierda, qué hace a la derecha. */
const MODULES: [string, string][] = [
  ["Clientes", "Ficha con historia, PAR-Q+ y anamnesis, alta por invitación, por código o sin cuenta, y avisos de quién necesita atención."],
  ["Entrenamiento", "Más de 2.500 ejercicios en español, rutinas con superseries, programas de varias semanas y el cuaderno de series del cliente."],
  ["Nutrición", "Planes por día con objetivos de calorías y macros, alternativas y el cumplimiento de la semana."],
  ["Agenda", "Citas, reservas por el cliente, bonos de sesiones y asistencia."],
  ["Seguimiento", "Check-ins, fotos de progreso, medidas propias, cargas con 1RM estimado y récords."],
  ["Cobros", "Bonos, cuotas mensuales y enlaces de pago con Stripe."],
  ["Mensajes", "Chat en tiempo real con fotos y avisos en el móvil."],
  ["Tu página", "Una página pública con tus tarifas y un formulario para captar clientes."],
];

/** Web de la plataforma en `/` (dominio general, sin sesión): para entrenadores que aún no la usan. */
export function PlatformHome({ p }: { p: PlatformInfo }) {
  useDocumentTitle(null);
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-[1080px] items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Brand name={p.name} />
        <nav className="flex items-center gap-2" aria-label="Cuenta">
          <Link to="/acceso" className={buttonClass("quiet")}>
            Entrar
          </Link>
          {p.signupOpen && (
            <Link to="/alta" className={buttonClass("primary")}>
              Probar gratis
            </Link>
          )}
        </nav>
      </header>

      <main className="mx-auto max-w-[1080px] px-5 sm:px-8">
        <section className="grid grid-cols-1 items-center gap-10 py-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:py-16 [&>*]:min-w-0">
          <div>
            <h1 className="font-wide text-[36px] leading-[1.05] sm:text-[50px]">Tus clientes, sus entrenos y tu agenda en una sola app</h1>
            <p className="mt-5 max-w-[46ch] text-[18px] leading-snug text-ink-2">
              Para entrenadores personales y estudios pequeños. Tus clientes la instalan en el móvil con tu nombre y tus colores.
            </p>
            {p.signupOpen && (
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link to="/alta" className={buttonClass("primary", "lg")}>
                  Empezar la prueba
                </Link>
                <p className="text-sm text-ink-2">{p.trialDays} días gratis, sin tarjeta.</p>
              </div>
            )}
          </div>
          <LoadedBarbell className="w-full max-w-[520px]" />
        </section>

        <section className="border-t border-rule py-14">
          <BlockTitle>Qué incluye</BlockTitle>
          <dl className="divide-y divide-rule border-y border-rule">
            {MODULES.map(([k, v]) => (
              <div key={k} className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-6">
                <dt className="font-medium text-ink">{k}</dt>
                <dd className="max-w-[70ch] text-ink-2">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {p.plans.length > 0 && (
          <section className="border-t border-rule py-14" aria-labelledby="planes">
            <BlockTitle id="planes">Planes</BlockTitle>
            <p className="mb-6 max-w-[60ch] text-ink-2">Todo incluido en todos los planes; cambia solo cuántos clientes llevas a la vez. Los archivados no cuentan.</p>
            <ul className="divide-y divide-rule border-y border-rule">
              {p.plans.map((pl) => (
                <li key={pl.id} className="flex items-baseline justify-between gap-4 py-4">
                  <span className="min-w-0">
                    <span className="font-wide block text-[19px] text-ink">{pl.label}</span>
                    <span className="block text-[14px] text-ink-2">{pl.maxClients === null ? "Clientes sin límite" : `Hasta ${pl.maxClients} clientes a la vez`}</span>
                  </span>
                  <span className="font-narrow shrink-0 text-[24px] text-ink">
                    {formatEuros(pl.price)}
                    <span className="text-[14px] text-ink-2">/mes</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] text-ink-3">Sin permanencia: te das de baja cuando quieras desde la app.</p>
          </section>
        )}
      </main>

      <footer className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-4 border-t border-rule px-5 py-6 sm:px-8">
        <p className="text-[13px] text-ink-3">
          © {new Date().getFullYear()} {p.name}
        </p>
        <div className="flex flex-wrap items-center gap-x-6">
          <Link to="/condiciones" className="inline-flex min-h-10 items-center text-[13.5px] text-ink-2 underline-offset-4 hover:text-ink hover:underline">
            Condiciones para entrenadores
          </Link>
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}
