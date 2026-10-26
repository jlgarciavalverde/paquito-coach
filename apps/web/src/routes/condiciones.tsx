import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { formatEuros, GRACE_DAYS } from "@coach/shared";
import { LegalH, LegalLayout, responsibleText } from "../components/legal-layout";
import { platformQuery } from "../lib/public";

export const Route = createFileRoute("/condiciones")({ component: ProfessionalTerms });

/**
 * Condiciones para entrenadores (contrato del servicio) y encargo de tratamiento (RGPD art. 28): el entrenador es el
 * responsable de los datos de sus clientes y la plataforma, la encargada. Texto pendiente de revisión legal (docs/ESTADO.md).
 */
function ProfessionalTerms() {
  const p = useQuery(platformQuery).data;
  const name = p?.name ?? "la plataforma";
  const holder = p ? responsibleText(p) || p.legalName || p.name : "…";
  return (
    <LegalLayout title="Condiciones para entrenadores" updated="26 de octubre de 2026" intro={`Lo que acuerdas con ${name} al crear tu estudio.`}>
      <LegalH>Quién presta el servicio</LegalH>
      <p>{holder}</p>
      {p?.contactEmail && (
        <p>
          Contacto: <a className="text-primary underline underline-offset-4" href={`mailto:${p.contactEmail}`}>{p.contactEmail}</a>
        </p>
      )}

      <LegalH>El servicio</LegalH>
      <p>
        Una app para gestionar a tus clientes de entrenamiento: fichas, rutinas, nutrición, agenda, mensajes, seguimiento y cobros. Tus clientes la usan con el nombre y los colores de tu estudio.
      </p>

      <LegalH>Prueba, planes y pago</LegalH>
      <ul>
        <li>Al crear el estudio tienes {p?.trialDays ?? 14} días de prueba gratis con todo incluido, sin tarjeta.</li>
        <li>
          Después eliges un plan mensual
          {p && p.plans.length > 0 && <> ({p.plans.map((pl) => `${pl.label}, ${formatEuros(pl.price)}`).join("; ")})</>}. Los planes solo cambian cuántos clientes llevas a la vez; los archivados no cuentan.
        </li>
        <li>El pago se hace con tarjeta a través de Stripe y se renueva cada mes. Puedes cambiar de plan o darte de baja cuando quieras desde Ajustes → Plan; la baja vale hasta el final del mes pagado.</li>
        <li>Si un cobro falla, sigues con normalidad {GRACE_DAYS} días mientras se reintenta. Pasado ese plazo, o al acabar la prueba sin plan, el estudio queda en pausa: puedes consultar y exportar todo, pero no crear ni cambiar nada hasta que elijas un plan.</li>
      </ul>

      <LegalH>Tus datos y los de tus clientes</LegalH>
      <p>
        Tú eres el <strong>responsable del tratamiento</strong> de los datos de tus clientes (incluidos los de salud) y {name} es el <strong>encargado del tratamiento</strong> (art. 28 del RGPD). Al aceptar estas condiciones firmas también este encargo:
      </p>
      <ul>
        <li>Objeto: guardar y tratar los datos que tú y tus clientes metéis en la app, solo para prestarte el servicio y siguiendo tus instrucciones.</li>
        <li>Datos: identificación y contacto, salud y actividad física (cuestionarios, lesiones, medidas, fotos de progreso, entrenos, alimentación), agenda, mensajes y pagos.</li>
        <li>Confidencialidad: solo acceden al servidor las personas autorizadas, obligadas a guardar secreto.</li>
        <li>Seguridad: conexiones cifradas, contraseñas guardadas con hash, verificación en dos pasos opcional, aislamiento entre estudios, copias de seguridad diarias y registro de las acciones sensibles.</li>
        <li>Subencargados: el alojamiento del servidor y la red (Cloudflare), el envío de correos (Brevo), los cobros (Stripe) y, si la usas, la IA (Google Gemini, con los datos de tus clientes seudonimizados). Te avisaremos antes de añadir otros.</li>
        <li>Derechos de tus clientes: la app les permite descargar y borrar sus datos; te ayudaremos con cualquier otra petición.</li>
        <li>Brechas de seguridad: te avisaremos sin dilación indebida, y en todo caso en menos de 72 horas desde que lo sepamos.</li>
        <li>Al terminar: puedes exportar todo antes de irte. Borramos los datos del estudio a los 90 días de la baja, salvo lo que la ley obligue a conservar.</li>
      </ul>

      <LegalH>Lo que te corresponde a ti</LegalH>
      <ul>
        <li>Informar a tus clientes y tener una base legal para tratar sus datos (la app les pide el consentimiento para los datos de salud al registrarse).</li>
        <li>Lo que publicas y lo que pautas: los entrenamientos y la alimentación son tu trabajo profesional y tu responsabilidad.</li>
        <li>Rellenar tus datos fiscales en Ajustes para el aviso legal de tu página.</li>
        <li>No usar la app para nada ilegal ni para enviar publicidad no deseada.</li>
      </ul>

      <LegalH>Disponibilidad</LegalH>
      <p>Hacemos lo posible para que la app funcione siempre, pero puede haber cortes por mantenimiento o por causas ajenas. Si hay un problema serio, te lo contaremos.</p>

      <LegalH>Cambios</LegalH>
      <p>Si cambian estas condiciones o los precios, te avisaremos por correo con al menos 30 días de antelación. Si no estás de acuerdo, puedes darte de baja antes.</p>

      <LegalH>Ley aplicable</LegalH>
      <p>La legislación española.</p>
    </LegalLayout>
  );
}
