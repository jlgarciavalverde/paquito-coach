# Changelog
Formato [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/), versiones [SemVer](https://semver.org/lang/es/).

## [1.5.0] — 2026-09-29 · Bonos de sesiones
### Añadido
- **Bonos** (ficha → Agenda): sesiones, precio, caducidad y si está pagado. Cada cita con cliente marcada «Hecha» o «No vino» descuenta del bono más antiguo que siga valiendo; «Cancelada» no descuenta y volver a «Programada» la devuelve.
- **Asistencia** en cada cita (Programada, Hecha, No vino, Cancelada) y botón «Marcar hecha» en las citas de Hoy que ya han empezado.
- «Necesitan atención» avisa cuando queda 1 sesión, el bono se agota o caduca. El cliente ve en su Agenda cuántas sesiones le quedan.
- Demo con bonos de ejemplo. Bonos y asistencia en la copia RGPD.

## [1.4.0] — 2026-09-29 · Programas de varias semanas
### Añadido
- **Programas** (Entrenos → Programas): rejilla de semanas × días con una rutina en cada día, «Copiar la semana 1 a todas» y subida de carga semanal (kg o %). Se aplican a uno o varios clientes desde una fecha y crean todos los entrenos de una vez («Pierna A, semana 2 de 6»), con la carga de cada semana ya puesta.
- En la ficha, el programa en curso con su semana, entrenos hechos y «Terminar ya» (quita solo lo que queda sin empezar). «Aplicar programa» también en la ficha y en ⌘K.

## [1.3.0] — 2026-09-29 · Seguimiento (paridad con Harbiz)
### Añadido
- **Check-ins periódicos**: formularios propios (escala 1–10, sí/no, número, texto, foto), con uno semanal ya preparado; se piden a uno o varios clientes cada 1, 2 o 4 semanas. El cliente lo ve en Hoy el día que toca (y le llega un aviso); las respuestas salen en la nueva pestaña «Check-ins» de la ficha, con la diferencia respecto a la vez anterior y una marca si ha tenido dolor.
- **Fotos de progreso**: de frente, perfil y espaldas por fecha, y comparación de dos fechas lado a lado. Las sube el cliente o el entrenador.
- **Medidas propias** (dolor EVA, grados de flexión, salto…): se definen en Seguimiento, se anotan en Progreso y tienen su gráfica con la tendencia (sabiendo si subir es bueno o malo).
- Nueva sección **Seguimiento** (también en ⌘K y con `g s`). En el móvil del entrenador, la barra inferior queda con Hoy, Clientes, Agenda, Mensajes y «Más».
- «Necesitan atención»: check-in nuevo por revisar o sin contestar; el enlace abre la pestaña que toca.
- Demo con check-ins, dolor y flexión de rodilla de ejemplo. Todo incluido en la copia RGPD.

## [1.2.0] — 2026-09-29 · Cualquier cosa en dos pasos
### Añadido
- **Paleta de órdenes** (⌘K / Ctrl K, «/» o el botón «Buscar»): clientes, rutinas y plantillas; crear cliente, cita, rutina o plantilla; si lo escrito apunta a un cliente, sus acciones directas (escribir, asignar rutina, nueva cita, anotar medidas). A pantalla completa en el móvil.
- **Atajos**: `g h/c/e/n/a/m` para ir a cada sección, `n` crea en la pantalla actual, `?` los muestra.
- **Ficha del cliente**: acciones a la vista (Asignar rutina, Nueva cita, Escribir, Anotar medidas); recuperar acceso, descargar datos y archivar pasan al menú «Más acciones».
- **Alta encadenada**: al crear un cliente se abre su ficha detrás y la hoja muestra «Siguientes pasos» (rutina, primera cita, plan de comidas, medidas de partida).
- **Asignar con progresión**: «Subir kilos (o un %) cada semana» con vista previa de la última semana; la API aplica la progresión al generar cada copia (`progression` en `POST /routines/:id/assign`).
- **Deshacer en lugar de preguntar**: quitar un bloque, borrar medidas y copiar o unificar días del plan se hacen al momento con aviso «Deshacer»; lo que no se puede deshacer usa el diálogo de la app en lugar del `confirm()` del navegador.

## [1.1.0] — 2026-09-29 · Registrar y revisar más rápido
### Añadido
- **Cuaderno del cliente**: bajo cada ejercicio, lo que hizo la última vez; marcar una serie sin escribir nada la da por hecha con la sugerencia (serie anterior, la última vez o lo prescrito); el foco salta a la siguiente serie, que se resalta, con botones ±1 rep, ±2,5 kg e «Igual que la anterior».
- **Detalle del entreno (entrenador)**: diferencia con lo previsto («+2,5 kg sobre lo previsto», «1 serie menos») y caja para **responder al cliente ahí mismo** (le llega a su chat con el entreno citado).
- **«Necesitan atención»** en Hoy: entrenos sin registrar esta semana, sin entrenar en 10 días, cuestionario de salud con alertas sin revisar y mensajes sin contestar hace más de 24 h, con enlace para contestar. Sustituye a «Cuestionarios de salud por revisar».
- «Lo último que han hecho»: **marcar todo como revisado** y filtro «Solo sin revisar».
- API: `GET /me/progress/last`, `GET /attention`, `POST /activity/seen`.
### Corregido
- El e2e de la agenda dependía de la hora a la que se ejecutaba.

## [1.0.0] — 2026-09-29
### Añadido
- **Recordatorios**: a las 8:00, el entreno del día a cada cliente y el resumen del día al entrenador; a las 20:00, a quien aún no ha anotado su entreno. Se pueden desactivar en Ajustes o Perfil.
- **Operaciones**: copias diarias al Mac con simulacro real de restauración y aviso si falla; vigilante que avisa si la app se cae (`tools/install-launchd.sh`).

## [0.9.0] — 2026-09-29
### Añadido
- **Demo pública** (instancia y base de datos propias): entrar con un clic como entrenador o como clienta, datos de ejemplo realistas que vuelven a su estado cada noche, banda de aviso, y sin poder subir fotos, borrar, cambiar contraseñas ni registrarse.
### Corregido
- Los monogramas ignoran paréntesis y símbolos del nombre.

## [0.8.0] — 2026-09-29
### Añadido
- **Cuestionario de salud**: PAR-Q+ (siete preguntas) y anamnesis (lesiones, operaciones, medicación, dolor 0–10, actividad, objetivo). Aparece al terminar el registro y en «Hoy» mientras esté pendiente; se puede posponer.
- Las respuestas de riesgo (un «sí» o dolor ≥ 5) salen como alerta en la ficha y en «Hoy» del entrenador hasta que las revisa; puede pedir que se repita.
- Incluido en la copia de datos (RGPD).
### Corregido
- Las zonas con scroll de las hojas laterales y diálogos se pueden recorrer con el teclado.

## [0.7.0] — 2026-09-29
### Añadido
- **Progreso**: peso, cintura, cadera y % de grasa con gráficas (el cliente y el entrenador pueden anotarlos); cargas por ejercicio con 1RM estimado y mejor serie de cada sesión, calculadas de lo que el cliente registra; tabla con los datos de cada gráfica.
- Pestaña «Progreso» en la ficha y pantalla «Progreso» del cliente (desde Entreno y Perfil).
- «Hoy» del entrenador marca los **récords** (mejor 1RM estimado del cliente en un ejercicio).
- La copia de datos (RGPD) incluye peso y medidas.

## [0.6.0] — 2026-09-29 · MVP completo
### Añadido
- **Protección de datos (RGPD)**: el cliente descarga todos sus datos en JSON y puede borrar su cuenta (con su contraseña); el entrenador exporta los datos de un cliente y lo borra definitivamente (solo archivados, escribiendo su nombre), fotos incluidas. Aviso de privacidad en `/privacidad`, enlazado desde el registro y el perfil.
- «Para empezar» en «Hoy»: cuatro pasos guiados para la primera vez.
- Título de pestaña en cada pantalla.
- Operaciones: enlace de recuperación para la cuenta del entrenador (`reset-link.js`), copia diaria de las fotos del chat.
### Cambiado
- Guardarraíl de diseño (`design.test.ts`): impide colores sueltos, clases antiguas y sobretítulos en mayúsculas.

## [0.5.0] — 2026-09-29
### Añadido
- **Mensajes**: conversación privada entre el entrenador y cada cliente, en tiempo real; fotos; no leídos en la barra y en la bandeja; «visto».
- Avisos push en el móvil y el ordenador (se activan en Ajustes/Perfil); la app se puede instalar en la pantalla de inicio.
- «Hoy» del entrenador se actualiza solo cuando un cliente termina un entreno.

## [0.4.0] — 2026-09-29
### Añadido
- **Agenda**: citas (sesión, valoración u otro; con o sin cliente; lugar y notas internas); calendario de semana (7:00–22:00, franja de todo el día con entrenos y comidas), mes y lista; filtro por cliente y capas; arrastrar citas y entrenos para cambiarlos de día u hora; crear cita pulsando un hueco.
- Ficha → pestaña «Agenda» (próximas 4 semanas). Cliente: pantalla «Agenda» y «Próxima sesión» en «Hoy». Entrenador: «Citas de hoy» en «Hoy».
### Corregido
- Desbordamiento horizontal en el móvil en «Hoy», ejercicios, ajustes y galería.

## [0.3.0] — 2026-09-29
### Añadido
- **Nutrición**: plantillas de planes de comidas; plan activo por cliente, igual todos los días o distinto cada día (copiar un día al resto); objetivos diarios de kcal y macros; comidas con hora, alimentos y cantidades, alternativas y notas; aplicar una plantilla a varios clientes (copia editable).
- Cliente: pantalla «Comidas» por día con marcar comida hecha; resumen en «Hoy».
- Ficha → pestaña «Nutrición»: plan, objetivos y cumplimiento de los últimos 7 días.

## [0.2.0] — 2026-09-29
### Añadido
- **Entrenamiento**: biblioteca con 2.534 ejercicios en español + ejercicios propios con vídeo (YouTube/Vimeo); rutinas por bloques con series, reps, carga, RIR/RPE, tempo, descanso, notas y superseries (A1/A2); duplicar; asignar a varios clientes en días concretos o repetidos durante N semanas (copia congelada).
- Ficha del cliente → pestaña «Entreno»: semanas con lo asignado y lo registrado; mover, anotar indicaciones o quitar un entreno.
- Cliente: «Hoy» con el entreno del día, semana con marcas de estado, cuaderno de series con autoguardado, temporizador de descanso, «cómo se hace» con vídeo, esfuerzo de la sesión (1–10) y comentario.
- Entrenador: «Hoy» con los entrenos del día, lo último que han hecho los clientes (sin revisar marcado) y la semana de todos en una matriz.
### Cambiado
- **Rediseño completo** («hoja de entrenamiento clínica», ADR 0008): colores de disco, Archivo, lista + ficha, hoja lateral, aviso de lesiones visible en la ficha.
### Corregido
- El límite global de peticiones contaba los archivos de la web (429 al cargar la app).

## [0.1.0] — 2026-09-29
### Añadido
- Alta inicial del estudio y del entrenador (con código de instalación).
- Clientes: alta con invitación (enlace de un uso, 7 días, listo para WhatsApp), registro con código público del estudio (queda pendiente hasta aceptar), fichas sin cuenta; aceptar, rechazar, archivar, recuperar; ficha con datos personales, objetivo, salud/lesiones y notas privadas.
- Recuperar acceso: el entrenador genera un enlace de 24 h para que el cliente ponga contraseña nueva.
- Cuenta: sesiones abiertas (cerrar a distancia), cambio de contraseña, tema claro/oscuro/automático.
- Área del cliente: Hoy, perfil; estado «solicitud enviada».
- Seguridad: cookies HttpOnly/SameSite, CSRF por Origin, CSP estricta, límites por IP y bloqueo por cuenta, scrypt, auditoría de accesos a fichas, consentimiento RGPD de datos de salud.
- Despliegue: imagen Docker, compose con Postgres interno y copia diaria, script de despliegue con vuelta atrás automática.
