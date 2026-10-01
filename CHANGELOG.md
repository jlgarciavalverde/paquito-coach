# Changelog
Formato [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/), versiones [SemVer](https://semver.org/lang/es/).

## [1.18.0] — 2026-10-01 · Imagen pública de Paquito
### Añadido
- **Página pública** en la dirección de la app (ADR 0017): presentación, foto, especialidades, dónde y cuándo, tarifas que él marque y formulario **«Quiero empezar»**. Las solicitudes le llegan por aviso y correo y se convierten en cliente con «Dar de alta».
- **Su marca**: el nombre del estudio es el nombre de la app (cabecera, pestaña, correos, app instalada) y elige el color entre 5 que cumplen contraste AA.
- **Aviso legal y términos de uso** con sus datos fiscales; privacidad ampliada (responsable, formulario, correos, cookies).
- Buscadores y enlaces compartidos: título, descripción e imagen del estudio; `robots.txt`, `sitemap.xml`; los paneles no se indexan.
### Pruebas
- `studio.p2.test.ts` (12), contrastes de los acentos, marca, e2e `19-pagina-publica`. API 264, web 74, e2e 45.

## [1.17.0] — 2026-10-01 · Correo y cuentas
### Añadido
- **Correo** (Brevo, ADR 0016): la invitación llega también por correo; **«¿Has olvidado la contraseña?»** sin pasar por el entrenador; confirmación y cancelación de reservas; al entrenador sin avisos en el móvil, las reservas nuevas. Bandeja de salida con reintentos: si el proveedor falla, nada se rompe.
- **Verificación en dos pasos** (Google Authenticator, Authy…) para cualquier cuenta, recomendada para el entrenador: QR, códigos de recuperación de un uso, y ni la contraseña sola ni el enlace de restablecer dan acceso sin el código.
- **Cambiar el correo** con confirmación en la dirección nueva y aviso a la antigua. Preferencia «Recibir avisos por correo» y «Darme de baja» en los correos.
### Seguridad
- Sin enumeración de cuentas en el olvido ni en el cambio de correo; frenos por IP y por dirección; enlaces de un uso con hash y caducidad; el cuerpo de los correos se borra al enviarse.
### Pruebas
- `mail.p1.test.ts` (20), `lib/totp.test.ts` (vectores RFC 6238), e2e `18-correo-y-2fa`. API 252, e2e 44.

## [1.16.0] — 2026-09-30 · Auditoría profunda A3: la web
### Corregido
- **Cuaderno**: los guardados van en orden (una respuesta vieja ya no pisa series nuevas); lo pendiente se guarda al salir de la pantalla o cerrar la app (`keepalive`); «Terminar entreno» se detiene si no se han podido guardar las series (antes se perdían) y no admite doble toque; la barra de descanso ya no se queda colgada.
- **Pantallas que mentían**: si falla la carga, ahora dicen por qué y ofrecen «Reintentar» (40 pantallas) en lugar de un vacío falso («No tienes plan») o un esqueleto eterno; 37 acciones que fallaban en silencio avisan.
- Cerrar sesión o borrar la cuenta da de baja los avisos del dispositivo (en un móvil compartido, el siguiente no recibe los mensajes del anterior).
- Chat: sin mensajes dobles al pulsar Intro dos veces; si falla el envío, el reintento no vuelve a subir la foto; fotos con tamaño fijo (sin saltos al cargar). Fotos de progreso: si falla una, el reintento no duplica las anteriores. Vistas previas de fotos sin fugas de memoria.
- Check-in: los números con coma decimal se pueden escribir («72,5»). Fechas de cobros y check-ins en hora local (antes, en UTC: el día anterior después de las 22:00).
- Pagos: un solo «Comprar» a la vez; al volver de Stripe se actualizan cobros, cuota y bonos, y se quita `?pago=ok` de la dirección. Reservar o cancelar actualiza los bonos; editar un entreno actualiza el panel abierto.
- Confirmación antes de «Quitar entreno».
### Accesibilidad
- `RadioGroup` común (13 grupos): una sola parada con Tab y flechas para elegir. Dianas táctiles de 40–44 px en el móvil. Los avisos de error se anuncian al momento (`role="alert"`); el chat anuncia solo los mensajes nuevos, no la conversación entera.
### Pruebas
- Web: guardado del cuaderno (orden, fallo, `keepalive`), `QueryState`, `RadioGroup` con teclado, `DecimalField`, `useObjectUrl`, avisos al cerrar sesión. Web 72 tests.

## [1.15.0] — 2026-09-30 · Auditoría profunda A2: datos, RGPD y rendimiento
### Añadido
- **Descargar mis datos** ahora es un ZIP con todas las fotos (chat, progreso, check-ins) y el JSON completo: añade cuotas, programas, check-ins programados, notas de citas, sesiones abiertas, dispositivos con avisos, avisos enviados, preferencias y el registro de accesos a su ficha. El entrenador lo descarga desde la ficha.
### Corregido
- Enviar un check-in dos veces a la vez guardaba dos respuestas; marcar dos citas a la vez podía gastar dos veces la última sesión de un bono.
- Asignar un check-in o aplicar un plan de comidas a varios clientes es todo o nada; terminar un programa no queda a medias.
- Recordatorio de la mañana: solo de 8:00 a 11:00 (antes, si el servidor arrancaba a mediodía, llegaba «Hoy toca entrenar» a las 14:00) y nombra todos los entrenos del día, no solo el primero.
- Con la IA, un ejercicio sin nombre ya no se empareja con uno cualquiera.
### Rendimiento
- Índice en cada clave ajena (41 nuevos; una prueba lo vigila para las tablas futuras); conversaciones, bonos en «Necesitan atención» e informes sin una consulta por cliente; la IA empareja los ejercicios en memoria (antes, hasta cientos de consultas por rutina).
### Seguridad y privacidad
- Registro de auditoría conservado 2 años; archivos subidos que nadie usa se borran al día siguiente.
### Pruebas
- `privacy.export.test.ts` (generado desde el catálogo: toda tabla con datos de una persona se exporta y queda vacía al borrarla), `data.a2.test.ts`, `db/indexes.test.ts`, `lib/ai/match.test.ts`. API: 228 tests.

## [1.14.0] — 2026-09-30 · Auditoría profunda A1: seguridad y dinero
### Seguridad
- El límite de peticiones, el `no-store` y los bloqueos de la demo ya no se saltan con rutas codificadas (`/%61pi/…`); la IP no se falsea con `X-Forwarded-For`.
- Clientes archivados sin acceso; los pendientes de aceptar solo ven su perfil. El freno de contraseñas es por correo+IP, así que un atacante no bloquea la cuenta de otro. El registro no revela si un correo tiene cuenta.
- Avisos push solo hacia los servicios oficiales (sin URLs internas). Cuotas de almacenamiento, `.docx` «bomba», tope de documentos de IA, rangos de fechas y asignaciones con máximo.
- La API no arranca en producción con pagos o IA de prueba; `resetDemo` se niega ante una base de datos con cuentas reales.
### Corregido
- **Cobros**: un pago ya no puede crear dos bonos; los enlaces viejos se anulan en Stripe al renovar o cancelar; sin facturas ni cuotas duplicadas; el pago de una reserva ya cancelada no la reactiva y avisa al entrenador (ADR 0015).
- **Borrar un cliente** anula sus cuotas en Stripe y conserva sus cobros anonimizados; el CSV del gestor trae todos los cobros (antes, los últimos 500).
- **Reservas**: muchas a la vez ya no bloquean la API; tope de reservas por cliente (ajustable, 4 por defecto) y el bono solo cubre si le quedan sesiones para todas.
- Un entreno terminado no se edita sin «Reabrir»; no se completan entrenos de dentro de más de dos semanas.
### Pruebas
- `audit.a1.test.ts` y `security.bypass.test.ts`: una prueba por hallazgo, con carreras reales (20 reservas a la vez con 10 conexiones). API: 211 tests.

## [1.13.0] — 2026-09-30 · Pulido para el MVP de Paquito
### Cambiado
- Hoy: «Lo último que han hecho» muestra los 6 más recientes con «Ver N más»; sesiones abiertas, las 5 últimas con «Ver todas».
- Agenda en lista: los títulos largos ocupan dos líneas en el móvil en lugar de cortarse.
- Guía de la app para Paquito (`docs/producto/mvp.md`) al día con todo lo que hace.
### Seguridad
- Limpieza automática cada 5 minutos de sesiones caducadas y enlaces de restablecer vencidos.

## [1.12.0] — 2026-09-30 · Robustez en la web y pruebas de componentes
### Añadido
- **Cerrar las demás sesiones** (Ajustes o Perfil): para un móvil perdido o un ordenador ajeno.
- Aviso fijo **sin conexión**; sin red, las acciones fallan al momento con un mensaje claro (antes se quedaban «cargando»).
- **Sesión caducada o cerrada desde otro dispositivo**: vuelta a la pantalla de entrar con un aviso, sin datos en memoria.
### Corregido
- Respuestas que no son JSON (páginas de error de un proxy) ya no muestran «Unexpected token <»; peticiones con tiempo máximo de 30 s; mensajes propios para 401, 403, 404, 408, 413, 429, 502–504.
- El aviso de sin conexión no se enteraba si la red caía mientras cargaba la pantalla.
### Pruebas
- Pruebas de componentes (Testing Library + jsdom): botones, confirmación, avisos con «Deshacer», atajos, paleta ⌘K, asistencia con vuelta atrás si falla, diferencias prescrito/hecho, cuaderno (sugerencias y ±), cliente de la API. Web: 58 tests (antes 15). e2e de robustez: sesión cerrada desde otro dispositivo, sin conexión, páginas y recursos inexistentes (43 e2e).

## [1.11.0] — 2026-09-30 · Seguridad por capas y batería de pruebas
### Seguridad
- **Acceso denegado por defecto** antes de validar nada: sin sesión solo lo público; un cliente solo lo suyo. Los handlers siguen comprobando (ADR 0014).
- Sesiones: al entrar se invalida la sesión anterior del navegador; edad máxima de 180 días; tokens ocultos en los logs; `Cache-Control: no-store` y `Permissions-Policy` en la API.
- Entradas: se quita el carácter NUL (daba error 500), ids seguros como claves (`__proto__`…), fechas imposibles rechazadas, conflictos por carreras como 409 en lugar de 500.
- CSV de cobros protegido contra inyección de fórmulas. Freno de fuerza bruta con tope de memoria.
### Pruebas
- Matriz de autorización y fuzz generados desde el registro de rutas (cada endpoint, cada rol, datos basura), batería de ataques web, sesiones y tokens, carreras, cambios de hora, textos extremos y fallos de la IA. API: 181 tests.

## [1.10.0] — 2026-09-29 · Cuotas mensuales y pagar al reservar
### Añadido
- **Cuota mensual**: el cliente se suscribe desde Pagos (se cobra sola cada mes) y la gestiona él mismo en el portal de Stripe («Gestionar mi cuota»: cambiar tarjeta o darse de baja). Cada mes aparece el cobro con su factura; si falla, aviso al entrenador y en «Necesitan atención».
- **Pagar al reservar**: si el cliente no tiene bono, la sesión se paga al reservar (tarifa de sesión suelta); el hueco se le guarda 15 minutos y, si no paga, se libera solo.
- La ficha muestra la cuota del cliente con su estado y próximo cobro.

## [1.9.0] — 2026-09-29 · Cobros con Stripe
### Añadido
- **Tarifas** (Ajustes → Cobros): bonos (sesiones y días de validez), sesión suelta y cuota mensual (esta, preparada para la próxima versión).
- **El cliente paga desde su app** (Perfil → Pagos): compra un bono o una sesión en la página segura de Stripe (tarjeta, Apple Pay, Google Pay) y el bono se le activa solo al confirmarse el pago; historial con recibos.
- **Enlaces de pago** desde la ficha (Agenda → Cobros): con una tarifa o con concepto e importe libres, listos para WhatsApp o para el chat de la app; enlace nuevo si caduca.
- Aviso al entrenador con cada pago; los cobros entran en Informes y se descargan en CSV para el gestor. Devoluciones hechas en Stripe se reflejan solas.
- Seguridad: el importe lo pone el servidor, el pago solo cuenta con el webhook firmado por Stripe, eventos idempotentes, clave restringida (ADR 0013). Guía paso a paso en OPERACIONES.

## [1.8.0] — 2026-09-29 · IA con los documentos de Paquito
### Añadido
- **IA** (nueva sección, ⌘K y `g x`): Paquito sube sus documentos (PDF, Word o texto: metodología, pautas, tablas) y genera **rutinas, programas de varias semanas y planes de comidas** basados en ellos, además de **preguntar a sus documentos** con las fuentes citadas.
- Lo generado es un borrador: la rutina se abre en el editor, el programa crea sus rutinas y la rejilla, y el plan de comidas se crea como plantilla o como plan del cliente; siempre se revisa antes de que llegue al cliente. Los ejercicios se emparejan con la biblioteca y se avisa de los que no están.
- Botón «Generar con IA» en Entrenos, Programas, Nutrición y la ficha del cliente.
- Gemini (plan gratuito) con límite diario propio; a Google solo van sus documentos y datos del cliente sin nombre ni contacto (lesiones solo si se marca). Aviso en la app y en `/privacidad`. ADR 0012.
- La demo y los e2e usan respuestas de ejemplo (sin gastar cuota).

## [1.7.0] — 2026-09-29 · Material, logros e informes
### Añadido
- **Material para clientes** (Seguimiento): enlaces y vídeos o PDFs (se comprueba que lo son de verdad, hasta 15 MB), para todos o para algunos clientes. El cliente lo ve en «Material» (desde Perfil y, si es nuevo, desde Hoy); un PDF solo lo pueden abrir aquellos con quienes se ha compartido.
- **Tu constancia** en el Hoy del cliente: semanas seguidas entrenando, su mejor racha y los récords del último mes.
- **Informes** (desde Hoy, ⌘K o `g i`): clientes activos, cumplimiento de las últimas 4 semanas con su gráfica semanal y el detalle por cliente, sesiones y faltas del mes, bonos cobrados y pendientes, bonos por renovar. Las cifras van en frases, no en tarjetas.

## [1.6.0] — 2026-09-29 · Reservas desde la app
### Añadido
- **Reservas**: en Ajustes, Paquito abre franjas semanales (p. ej. lunes a viernes de 9 a 13), duración de cada sesión, plazas por hueco (grupos reducidos), antelación mínima para reservar y hasta cuándo se puede cancelar. El cliente ve los huecos libres en «Reservar sesión» (Agenda), reserva en dos toques y puede cancelar desde su agenda dentro del plazo; Paquito recibe un aviso con cada reserva o cancelación.
- Las citas sin cliente (médico, formación…) bloquean esos huecos. Un cerrojo por estudio impide que dos personas se queden con la última plaza.
- Las citas canceladas se marcan «(cancelada)» y no cuentan en Hoy ni en el resumen de la mañana.
- Demo con reservas abiertas.

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
