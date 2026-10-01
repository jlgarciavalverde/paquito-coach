import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Clock, EnvelopeSimple, InstagramLogo, MapPin, Phone } from "@phosphor-icons/react";
import { formatEuros, type PublicStudio } from "@coach/shared";
import { api } from "../lib/api";
import { useSubmit } from "../lib/use-form";
import { useDocumentTitle } from "../lib/title";
import { Brand } from "./brand";
import { FormError } from "./form-error";
import { LegalLinks } from "./legal-layout";
import { Button, buttonClass } from "./ui/button";
import { Checkbox, TextArea, TextField } from "./ui/field";
import { BlockTitle, Monogram } from "./ui/layout";

const priceDetail = (p: PublicStudio["prices"][number]) =>
  p.kind === "subscription" ? "Cada mes" : p.kind === "pack" ? `${p.sessions} sesiones${p.validDays ? `, para usar en ${p.validDays} días` : ""}` : "Una sesión";

/**
 * Página pública del estudio en `/` (para quien aún no es cliente): quién es, qué hace, dónde, cuánto cuesta y un
 * formulario para empezar. Mismo lenguaje visual que la app (hoja de entrenamiento, ADR 0008), sin artificios.
 */
export function PublicHome({ s }: { s: PublicStudio }) {
  useDocumentTitle(null);
  const contact = [
    s.location && { icon: MapPin, text: s.location },
    s.hours && { icon: Clock, text: s.hours },
    s.phone && { icon: Phone, text: s.phone, href: `tel:${s.phone.replace(/\s/g, "")}` },
    s.contactEmail && { icon: EnvelopeSimple, text: s.contactEmail, href: `mailto:${s.contactEmail}` },
    s.instagram && { icon: InstagramLogo, text: `@${s.instagram}`, href: `https://www.instagram.com/${s.instagram}/` },
  ].filter(Boolean) as { icon: typeof MapPin; text: string; href?: string }[];

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-[1080px] items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Brand />
        <Link to="/acceso" className={buttonClass("quiet")}>
          Entrar
        </Link>
      </header>

      <main className="mx-auto max-w-[1080px] px-5 sm:px-8">
        <section className="grid grid-cols-1 items-center gap-10 py-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:py-16">
          <div>
            <h1 className="font-wide text-[38px] leading-[1.05] sm:text-[52px]">{s.name}</h1>
            {s.tagline && <p className="mt-4 max-w-[40ch] text-[19px] leading-snug text-ink-2">{s.tagline}</p>}
            {s.coachName && (
              <p className="mt-6 flex items-center gap-3 text-ink">
                <Monogram name={s.coachName} size={32} /> Con {s.coachName}
              </p>
            )}
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#empezar" className={buttonClass("primary", "lg")}>
                Quiero empezar
              </a>
              <Link to="/acceso" className={buttonClass("secondary", "lg")}>
                Ya soy cliente
              </Link>
            </div>
          </div>
          {s.hasPhoto && (
            <img src="/api/v1/public/studio/photo" alt={s.coachName ? `${s.coachName} entrenando` : s.name} width={540} height={640} className="aspect-[4/5] w-full rounded-[var(--radius-zone)] bg-tray object-cover" />
          )}
        </section>

        <div className="grid grid-cols-1 gap-14 border-t border-rule py-14 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] [&>*]:min-w-0">
          <div className="flex flex-col gap-14">
            {s.bio && (
              <section>
                <BlockTitle>Quién soy</BlockTitle>
                <p className="max-w-[62ch] text-[16.5px] leading-relaxed whitespace-pre-line text-ink">{s.bio}</p>
              </section>
            )}
            {s.specialties.length > 0 && (
              <section>
                <BlockTitle>En qué te puedo ayudar</BlockTitle>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {s.specialties.map((x) => (
                    <li key={x} className="border-l-[5px] border-primary bg-tray px-4 py-3 text-[15.5px] text-ink">
                      {x}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {s.prices.length > 0 && (
              <section>
                <BlockTitle>Tarifas</BlockTitle>
                <ul className="divide-y divide-rule border-y border-rule">
                  {s.prices.map((p) => (
                    <li key={`${p.kind}-${p.name}`} className="flex items-baseline justify-between gap-4 py-3">
                      <span className="min-w-0">
                        <span className="block font-medium text-ink">{p.name}</span>
                        <span className="block text-[13.5px] text-ink-2">{priceDetail(p)}</span>
                      </span>
                      <span className="font-narrow shrink-0 text-[20px] text-ink">
                        {formatEuros(p.amount)}
                        {p.kind === "subscription" && <span className="text-[14px] text-ink-2">/mes</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div className="flex flex-col gap-14">
            {contact.length > 0 && (
              <section>
                <BlockTitle>Dónde y cuándo</BlockTitle>
                <ul className="flex flex-col gap-3">
                  {contact.map(({ icon: Icon, text, href }) => (
                    <li key={text} className="flex items-start gap-3 text-[15.5px]">
                      <Icon size={20} className="mt-0.5 shrink-0 text-ink-2" aria-hidden="true" />
                      {href ? (
                        <a href={href} className="break-words text-primary underline-offset-4 hover:underline" {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>
                          {text}
                        </a>
                      ) : (
                        <span className="whitespace-pre-line text-ink">{text}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <StartForm />
          </div>
        </div>
      </main>

      <footer className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-4 border-t border-rule px-5 py-6 sm:px-8">
        <p className="text-[13px] text-ink-3">© {new Date().getFullYear()} {s.name}</p>
        <LegalLinks />
      </footer>
    </div>
  );
}

function StartForm() {
  const [f, setF] = useState({ name: "", email: "", phone: "", message: "", website: "", consent: false });
  const [sent, setSent] = useState(false);
  const { pending, error, onSubmit } = useSubmit(() => api("/public/contact", { body: f }), () => setSent(true));
  return (
    <section id="empezar" className="scroll-mt-6 rounded-[var(--radius-zone)] bg-tray p-5 sm:p-6">
      <BlockTitle>Quiero empezar</BlockTitle>
      {sent ? (
        <p role="status" className="text-[15.5px] text-ink">
          Recibido. Te contestaré en cuanto pueda a <strong>{f.email}</strong>.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <p className="text-sm text-ink-2">Cuéntame qué buscas y te escribo para hacer una primera valoración.</p>
          <TextField label="Nombre" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="Correo electrónico" type="email" autoComplete="email" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <TextField label="Teléfono" aside="opcional" type="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </div>
          <TextArea label="Qué te gustaría conseguir" aside="opcional" rows={3} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder="Volver a correr sin dolor de rodilla, ganar fuerza…" />
          {/* Campo trampa: invisible para las personas; los robots lo rellenan y su mensaje se descarta. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label>
              Web
              <input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
            </label>
          </div>
          <Checkbox
            checked={f.consent}
            onChange={(e) => setF({ ...f, consent: e.target.checked })}
            label="Acepto que se usen estos datos para contestarme"
            description={
              <>
                Solo para eso; se borran como mucho al año.{" "}
                <Link to="/privacidad" className="text-primary underline underline-offset-4">
                  Privacidad
                </Link>
              </>
            }
          />
          <FormError message={error} />
          <Button type="submit" size="lg" loading={pending} disabled={!f.name.trim() || !f.email.includes("@") || !f.consent} className="self-start">
            Enviar
          </Button>
          <p className="text-[12.5px] text-ink-3">No es una suscripción: no recibirás publicidad.</p>
        </form>
      )}
    </section>
  );
}
