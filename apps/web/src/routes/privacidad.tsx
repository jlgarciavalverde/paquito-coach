import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LegalH as H, LegalLayout, responsibleText } from "../components/legal-layout";
import { legalQuery } from "../lib/public";

export const Route = createFileRoute("/privacidad")({
  component: Privacy,
});

/** Aviso de privacidad (RGPD). Texto base: Paquito debe revisarlo y completar sus datos de responsable. */
function Privacy() {
  const l = useQuery(legalQuery).data;
  const who = l ? responsibleText(l) : "";
  return (
    <LegalLayout title="Privacidad y tus datos" updated="1 de octubre de 2026" intro="Qué datos guarda esta app, para qué, y cómo puedes consultarlos o borrarlos.">
        <H>Quién es el responsable</H>
        <p>
          El responsable de tus datos es tu entrenador{who ? <>: <strong>{who}</strong></> : ""}, que es quien te da de alta y te atiende. Si tienes cualquier duda, escríbele por el chat de la app
          {l?.contactEmail ? <> o a <a className="text-primary underline underline-offset-4" href={`mailto:${l.contactEmail}`}>{l.contactEmail}</a></> : null}.
        </p>

        <H>Qué datos guardamos</H>
        <ul>
          <li>Tu nombre, correo, teléfono y fecha de nacimiento, si los das.</li>
          <li>
            <strong>Datos de salud</strong>: lesiones, limitaciones y lo que registras al entrenar (cargas, esfuerzo, comentarios), tu plan de comidas y lo que marcas como cumplido. Solo se guardan con tu consentimiento
            expreso, que das al crear la cuenta.
          </li>
          <li>Tus citas, los mensajes y las fotos que envías por el chat.</li>
          <li>Datos técnicos mínimos para que la app funcione y sea segura: sesiones abiertas, dispositivo desde el que entras y un registro de accesos a las fichas.</li>
          <li>
            Si escribes desde el formulario «Quiero empezar» sin ser cliente: tu nombre, correo, teléfono y mensaje, solo para contestarte. Se borran como mucho al año.
          </li>
        </ul>

        <H>Para qué</H>
        <p>Solo para planificar y seguir tu entrenamiento y tu alimentación con tu entrenador. No se usan para publicidad y no se venden.</p>
        <p>
          Tu entrenador puede usar un asistente de inteligencia artificial (Gemini, de Google) para preparar propuestas de entrenamiento o de dieta que luego revisa él. En ese caso se envían <strong>sin tu nombre ni tus datos de contacto</strong>: tu edad aproximada, tu objetivo, tus cargas recientes y, solo si él lo marca, tus lesiones o limitaciones. En su plan gratuito, Google puede usar lo que recibe para mejorar sus servicios.
        </p>
        <p>Si pagas desde la app, el pago lo gestiona Stripe en su propia página: la app no ve ni guarda los datos de tu tarjeta; solo guarda el concepto, el importe y si está pagado. Si borras tu cuenta, tus cobros se conservan con tu nombre y sin nada más durante el plazo que exige la ley fiscal.</p>

        <H>Correos</H>
        <p>
          Los correos (invitación, restablecer la contraseña, confirmaciones de reservas) se envían con Brevo, un proveedor con servidores en la Unión Europea. Puedes dejar de recibir los que no son de
          seguridad desde tu perfil o con «Darme de baja» en cualquiera de ellos.
        </p>

        <H>Cookies</H>
        <p>
          Solo una cookie técnica, imprescindible para mantener tu sesión abierta (se borra al cerrar sesión o a los 180 días como mucho) y, en tu navegador, tus preferencias (tema claro u oscuro).
          No hay cookies de publicidad ni de analítica, ni de terceros, así que no hace falta pedirte permiso para ellas.
        </p>

        <H>Dónde están</H>
        <p>En un servidor propio en España, cifrados en tránsito (HTTPS). Se hace una copia de seguridad diaria que se conserva 14 días.</p>

        <H>Cuánto tiempo</H>
        <p>Mientras seas cliente. Si dejas de serlo, tu entrenador archivará tu ficha y podrá borrarla; tú también puedes borrar tu cuenta cuando quieras.</p>

        <H>Tus derechos</H>
        <ul>
          <li>
            <strong>Ver y llevarte tus datos</strong>: en Perfil → Tus datos → «Descargar mis datos» obtienes una copia completa.
          </li>
          <li>
            <strong>Borrarlos</strong>: en Perfil → Tus datos → «Borrar mi cuenta». Se borra todo al momento (las copias de seguridad desaparecen en 14 días).
          </li>
          <li>
            <strong>Corregirlos o retirar el consentimiento</strong>: pídeselo a tu entrenador por el chat. Retirar el consentimiento implica dejar de usar la app.
          </li>
          <li>Si crees que no se respetan tus derechos puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).</li>
        </ul>
    </LegalLayout>
  );
}
