import { createFileRoute, Link } from "@tanstack/react-router";
import { Brand } from "../components/brand";
import { useDocumentTitle } from "../lib/title";

export const Route = createFileRoute("/privacidad")({
  component: Privacy,
});

/** Aviso de privacidad (RGPD). Texto base: Paquito debe revisarlo y completar sus datos de responsable. */
function Privacy() {
  useDocumentTitle("Privacidad");
  const H = ({ children }: { children: React.ReactNode }) => <h2 className="font-wide mt-10 mb-2 text-[19px]">{children}</h2>;
  return (
    <main className="mx-auto max-w-[680px] px-5 py-10">
      <Link to="/" aria-label="Ir al inicio">
        <Brand />
      </Link>
      <h1 className="font-wide mt-12 text-[30px] leading-tight">Privacidad y tus datos</h1>
      <p className="mt-3 text-ink-2">Qué datos guarda esta app, para qué, y cómo puedes consultarlos o borrarlos. Última revisión: 29 de septiembre de 2026.</p>

      <div className="text-[15.5px] leading-relaxed text-ink [&_li]:mt-1.5 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
        <H>Quién es el responsable</H>
        <p>El responsable de tus datos es tu entrenador, que es quien te da de alta y te atiende. Si tienes cualquier duda, escríbele por el chat de la app.</p>

        <H>Qué datos guardamos</H>
        <ul>
          <li>Tu nombre, correo, teléfono y fecha de nacimiento, si los das.</li>
          <li>
            <strong>Datos de salud</strong>: lesiones, limitaciones y lo que registras al entrenar (cargas, esfuerzo, comentarios), tu plan de comidas y lo que marcas como cumplido. Solo se guardan con tu consentimiento
            expreso, que das al crear la cuenta.
          </li>
          <li>Tus citas, los mensajes y las fotos que envías por el chat.</li>
          <li>Datos técnicos mínimos para que la app funcione y sea segura: sesiones abiertas, dispositivo desde el que entras y un registro de accesos a las fichas.</li>
        </ul>

        <H>Para qué</H>
        <p>Solo para planificar y seguir tu entrenamiento y tu alimentación con tu entrenador. No se usan para publicidad, no se venden y no se comparten con terceros.</p>

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
      </div>
    </main>
  );
}
