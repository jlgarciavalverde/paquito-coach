# Changelog
Formato [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/), versiones [SemVer](https://semver.org/lang/es/).

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
