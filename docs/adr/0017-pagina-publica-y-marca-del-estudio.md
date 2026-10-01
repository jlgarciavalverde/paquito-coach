# 0017 — Página pública en `/`, marca del estudio y datos legales
- **Estado**: aceptada · **Fecha**: 2026-10-01
## Contexto
`/` llevaba siempre a la pantalla de entrar: la app no servía para que alguien conociera a Paquito ni le contactara. El
nombre era provisional («Paquito Coach», `BRAND`) y faltaban el aviso legal (LSSI) y los términos.
## Decisión
- **Una instalación, un estudio**: las rutas públicas (`/public/*`) hablan del primer estudio. Si un día hay varios
  entrenadores en la misma instalación, se añadirá un `slug` (`/e/:slug`); el esquema ya lo permite.
- **`/`**: con sesión, a su panel; sin sesión, la página pública si está publicada; si no, a entrar. El entrenador la ve
  con `/?vista=publica`. Publicar exige frase de presentación y «quién eres».
- **Lo público es explícito**: tarifas con la marca `public`, foto propia del estudio, datos de contacto que él escribe.
  Nunca salen el código de alta, el correo de la cuenta ni datos fiscales en la página (solo en el aviso legal).
- **«Quiero empezar»** crea una solicitud (`leads`, sin cuenta) y avisa por push y correo; campo trampa, 3 por IP cada 10
  min, sin duplicar la misma dirección en 24 h, sin respuesta automática al remitente (no se puede usar para mandar correo
  a terceros). Se borran al año. Desde la solicitud, «Dar de alta» abre el alta de cliente ya rellena.
- **Buscadores y compartir**: la API sirve el HTML de las páginas públicas con título, descripción y Open Graph (escapados);
  el resto lleva `X-Robots-Tag: noindex`; `robots.txt`, `sitemap.xml` y un manifest con el nombre del estudio.
  `@fastify/static` va con `index: false` y `/` es una ruta propia (si no, `/` saldría del disco sin la cabecera).
- **Marca**: nombre del estudio = nombre de la app (cabecera, título, correos, app instalada). Color de acento de una
  paleta cerrada (`ACCENTS`), con prueba de contraste AA en claro y oscuro; se aplica con una hoja de estilo que reescribe
  los tokens `--primary*`.
- **Legal**: aviso legal y términos con los datos fiscales que rellena el entrenador; privacidad con el responsable, el
  formulario, los correos y las cookies (solo técnicas: sin banner).
## Consecuencias
- Pruebas: `studio.p2.test.ts`, `studio.test.ts` (contrastes), `lib/brand.test.ts`, e2e `19-pagina-publica` (axe en móvil y escritorio oscuro).
- Los textos legales son una base razonable, no asesoría jurídica: Paquito debe revisarlos.
