import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Brand } from "./brand";
import { useDocumentTitle } from "../lib/title";

/** Páginas legales (privacidad, aviso legal, términos): texto largo y legible, con enlaces entre ellas al pie. */
export function LegalLayout({ title, updated, intro, children }: { title: string; updated: string; intro: string; children: ReactNode }) {
  useDocumentTitle(title);
  return (
    <main className="mx-auto max-w-[680px] px-5 py-10">
      <Link to="/" aria-label="Ir al inicio">
        <Brand />
      </Link>
      <h1 className="font-wide mt-12 text-[30px] leading-tight">{title}</h1>
      <p className="mt-3 text-ink-2">
        {intro} Última revisión: {updated}.
      </p>
      <div className="text-[15.5px] leading-relaxed text-ink [&_li]:mt-1.5 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">{children}</div>
      <LegalLinks className="mt-14 border-t border-rule pt-6" />
    </main>
  );
}

export const LegalH = ({ children }: { children: ReactNode }) => <h2 className="font-wide mt-10 mb-2 text-[19px]">{children}</h2>;

export function LegalLinks({ className }: { className?: string }) {
  const a = "inline-flex min-h-10 items-center text-ink-2 underline-offset-4 hover:text-ink hover:underline";
  return (
    <nav aria-label="Información legal" className={className}>
      <ul className="flex flex-wrap gap-x-6 text-[13.5px]">
        <li>
          <Link to="/aviso-legal" className={a}>
            Aviso legal
          </Link>
        </li>
        <li>
          <Link to="/privacidad" className={a}>
            Privacidad y cookies
          </Link>
        </li>
        <li>
          <Link to="/terminos" className={a}>
            Términos de uso
          </Link>
        </li>
      </ul>
    </nav>
  );
}

/** «Francisco Pérez (NIF 12345678Z), C/ Mayor 1, Murcia», con lo que haya rellenado el entrenador. */
export function responsibleText(l: { legalName: string; taxId: string; legalAddress: string }) {
  return [l.legalName, l.taxId && `NIF ${l.taxId}`, l.legalAddress].filter(Boolean).join(", ");
}
