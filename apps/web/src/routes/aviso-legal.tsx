import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LegalH, LegalLayout, responsibleText } from "../components/legal-layout";
import { legalQuery } from "../lib/public";

export const Route = createFileRoute("/aviso-legal")({ component: LegalNotice });

/** Aviso legal (LSSI, art. 10): quién está detrás de la web. Los datos los rellena el entrenador en Ajustes. */
function LegalNotice() {
  const l = useQuery(legalQuery).data;
  return (
    <LegalLayout title="Aviso legal" updated="1 de octubre de 2026" intro="Quién está detrás de esta web y de la app.">
      <LegalH>Titular</LegalH>
      <p>{l ? (responsibleText(l) || l.studioName) : "…"}</p>
      {l?.contactEmail && (
        <p>
          Contacto: <a className="text-primary underline underline-offset-4" href={`mailto:${l.contactEmail}`}>{l.contactEmail}</a>
        </p>
      )}
      <LegalH>Qué es esta web</LegalH>
      <p>
        La página de presentación de {l?.studioName ?? "este estudio"} y la app con la que sus clientes siguen sus entrenamientos, su alimentación y sus citas, y se comunican con su entrenador.
      </p>
      <LegalH>Propiedad intelectual</LegalH>
      <p>Los textos, rutinas, planes y materiales que publica el entrenador son suyos. No se pueden copiar ni difundir fuera de la app sin su permiso.</p>
      <LegalH>Responsabilidad</LegalH>
      <p>
        Los entrenamientos y pautas los diseña tu entrenador para ti. Si notas dolor o cualquier síntoma extraño, para y avísale; la app no sustituye a la consulta con un profesional sanitario.
      </p>
      <LegalH>Ley aplicable</LegalH>
      <p>La legislación española. Para cualquier conflicto, los juzgados y tribunales del domicilio del usuario cuando sea consumidor.</p>
    </LegalLayout>
  );
}
