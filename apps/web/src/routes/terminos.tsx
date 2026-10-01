import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LegalH, LegalLayout } from "../components/legal-layout";
import { legalQuery } from "../lib/public";

export const Route = createFileRoute("/terminos")({ component: Terms });

/** Términos de uso de la app (cuenta, pagos, cancelaciones). Texto base: el entrenador lo revisa. */
function Terms() {
  const name = useQuery(legalQuery).data?.studioName ?? "el estudio";
  return (
    <LegalLayout title="Términos de uso" updated="1 de octubre de 2026" intro={`Las normas para usar la app de ${name}.`}>
      <LegalH>Tu cuenta</LegalH>
      <ul>
        <li>La cuenta es personal. Guarda tu contraseña y, si puedes, activa la verificación en dos pasos (Perfil).</li>
        <li>Tu entrenador puede dar de baja tu cuenta si dejas de ser cliente; tus datos se conservan hasta que los borres o se borre tu ficha.</li>
      </ul>
      <LegalH>Entrenamientos y salud</LegalH>
      <p>
        Rellena con sinceridad el cuestionario de salud y avisa de cualquier lesión o molestia: tu entrenador adapta el plan a lo que le cuentas. Ante dolor o síntomas extraños, para y consulta.
      </p>
      <LegalH>Reservas y cancelaciones</LegalH>
      <p>Puedes reservar y cancelar sesiones desde la app dentro de los plazos que fija tu entrenador (se muestran al reservar). Fuera de plazo, escríbele por el chat.</p>
      <LegalH>Pagos</LegalH>
      <ul>
        <li>Los pagos se hacen en la página segura de Stripe. Los bonos se activan al pagarse y caducan en el plazo indicado en cada tarifa.</li>
        <li>Las cuotas mensuales se cobran solas cada mes; puedes darte de baja desde la app y dejan de cobrarse al final del periodo pagado.</li>
        <li>Para devoluciones, habla con tu entrenador.</li>
      </ul>
      <LegalH>Uso correcto</LegalH>
      <p>No uses la app para molestar a nadie ni para intentar acceder a lo que no es tuyo. Los mensajes del chat son entre tú y tu entrenador.</p>
      <LegalH>Cambios</LegalH>
      <p>Si estos términos cambian de forma importante, te lo diremos en la app.</p>
    </LegalLayout>
  );
}
