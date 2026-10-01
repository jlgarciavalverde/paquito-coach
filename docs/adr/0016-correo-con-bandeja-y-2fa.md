# 0016 — Correo con bandeja de salida (Brevo) y verificación en dos pasos (TOTP)
- **Estado**: aceptada · **Fecha**: 2026-10-01
## Contexto
La app no enviaba correos: la invitación iba solo por WhatsApp y quien olvidaba la contraseña dependía de que Paquito le
generase un enlace. La cuenta del entrenador, con los datos de salud de todos los clientes, solo tenía contraseña.
## Decisión
- **Proveedor**: Brevo (elección del usuario: gratis 300/día, UE) por SMTP con `nodemailer`. Remitente en el subdominio
  `envios.redgarverde.com` para no tocar el SPF del dominio raíz (el reenvío de correo existente).
- **Bandeja de salida** (`outbox`): las rutas encolan dentro de su transacción (si la operación se deshace, el correo no sale)
  y el envío va aparte (inmediato tras responder + planificador cada 5 min) con reintentos 1, 2, 4… minutos (6 intentos) y
  `for update skip locked`. Un fallo de Brevo nunca rompe una petición. Al enviarse se borra el cuerpo (lleva enlaces de un uso)
  y las filas se purgan a los 7 días.
- **Sin clave = sin correo**: `SetupStatus.mail` lo dice y la web vuelve al flujo de antes (pedir el enlace al entrenador).
  La demo nunca envía. `MAIL_FAKE` (e2e) está prohibido en producción, como los otros modos simulados.
- **Olvido de contraseña**: misma respuesta exista o no la cuenta; freno por IP (ruta) y por dirección (3 cada 15 min).
- **Cambio de correo**: enlace a la dirección nueva (24 h) y aviso a la antigua; se vuelve a comprobar que esté libre al confirmar.
- **Baja**: token aleatorio por usuario (`unsubscribe_token`) en los correos no esenciales; la página pide pulsar un botón
  (los filtros de correo abren enlaces solos). Los de seguridad se envían siempre.
- **2FA**: TOTP (RFC 6238) con `node:crypto`, sin dependencias. El secreto se confirma con un código antes de activarse; 10
  códigos de recuperación guardados como hash y de un uso; no se reutiliza un paso ya usado (condición en el `UPDATE`).
  Entrar con contraseña devuelve un **reto** (en memoria, 5 min, 5 intentos) y la sesión no se crea hasta el código; el
  restablecimiento por correo tampoco se salta el segundo paso. Activarla cierra las demás sesiones; quitarla pide contraseña y código.
## Consecuencias
- Pruebas: `mail.p1.test.ts` (bandeja, olvido, 2FA, cambio de correo, baja, reservas), `lib/totp.test.ts` (vectores del RFC),
  e2e `18-correo-y-2fa.spec.ts`.
- El secreto TOTP se guarda en claro en la BD (como casi todas las apps): quien robe la BD ya tiene los datos; la 2FA protege
  la entrada, no la BD. Las copias de la BD siguen cifradas en reposo en el Mac (ADR 0010).
- Retos en memoria: si se reinicia el servidor entre la contraseña y el código, hay que volver a escribir la contraseña.
