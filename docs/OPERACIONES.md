# Operaciones

## Primera instalación en el VPS (una vez)
En una terminal normal del Mac: `ssh-add --apple-use-keychain ~/.ssh/id_ed25519`. Después, en el VPS:
```sh
mkdir -p ~/servicios/coach && cd ~/servicios/coach
# el .env.example lo copia tools/deploy.mjs; si aún no está, créalo desde deploy/.env.example
cp .env.example .env && chmod 600 .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
sed -i "s|^SETUP_CODE=.*|SETUP_CODE=$(openssl rand -hex 12)|" .env
grep SETUP_CODE .env      # este código se usa UNA vez en /instalar
```
En Cloudflare Zero Trust → Networks → Tunnels → (túnel existente) → Public hostname:
`paquito.redgarverde.com` → `HTTP` → `coach:3000`. **No tocar** los registros existentes del dominio.

## Desplegar una versión
```sh
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
colima status || colima start
node tools/deploy.mjs 0.1.0
```
Hace: typecheck + tests → imagen `paquito-coach:X.Y.Z` (amd64) → `docker load` por SSH → copia `pg_dump` previa
(`backups/pre-X.Y.Z-*.sql.gz`) → `docker compose up -d` → espera `/health` con la versión nueva y `db: ok`.
Si no responde, **vuelve sola a la versión anterior**. Las migraciones se aplican al arrancar la API.

## Copias de seguridad
- Automática: servicio `coach-backup`, un `pg_dump` al día en `~/servicios/coach/backups/` (14 días).
- Antes de cada despliegue: `backups/pre-<versión>-<epoch>.sql.gz`.
- Al Mac: `tools/pull-backups.sh` trae todo a `~/Backups/paquito-coach` (60 días) y, si hay copia nueva, lanza el
  **simulacro de restauración** (`tools/restore-drill.sh` → `~/Backups/paquito-coach/simulacro.txt`).
- Programado con `tools/install-launchd.sh` (una vez; `--quitar` para desinstalar): copias a las 13:00 y al iniciar sesión,
  vigilante cada 10 min (`tools/monitor.sh`, notificación de macOS si la app se cae). Registros en `~/Backups/paquito-coach/*.log`.
- **Restaurar**: `gunzip -c backups/coach-AAAA-MM-DD.sql.gz | docker exec -i coach-db psql -U coach -d coach` (sobre una BD vacía: `docker compose down; docker volume rm coach_coach-db; docker compose up -d db`).

## Volver atrás a mano
`cd ~/servicios/coach && sed -i "s|image: paquito-coach:.*|image: paquito-coach:<anterior>|" docker-compose.yml && docker compose up -d`
(las imágenes anteriores siguen cargadas; si la versión nueva migró la BD, restaurar la copia `pre-`).

## Contraseña olvidada (entrenador o cualquier cuenta)
Con el correo configurado (abajo), cada uno lo hace solo desde «¿Has olvidado la contraseña?» en la pantalla de entrar.
Sin correo, los clientes: el entrenador les genera el enlace desde su ficha («Recuperar acceso»). El entrenador, en el VPS:
```sh
docker exec coach node dist/reset-link.js paquito@correo.com
```
Imprime un enlace de un solo uso (24 h). Abrirlo, poner contraseña nueva y listo (se cierran sus demás sesiones).

## Fotos del chat
Viven en `~/servicios/coach/data/media/` (volumen `./data`). El servicio `coach-backup` guarda cada día
`backups/media-AAAA-MM-DD.tar.gz` junto al volcado de la base de datos. Restaurar: `tar -xzf backups/media-….tar.gz -C data`.

## Avisos push
Las claves VAPID las genera `tools/deploy.mjs` en el `.env` del VPS la primera vez. **No cambiarlas**: invalidarían
las suscripciones de todos los dispositivos (habría que volver a activar los avisos en cada uno).

## Demo pública
Servicios `coach-demo` y `coach-demo-db` (ADR 0009). Se re-siembra sola al arrancar y cada noche a las 4:00. Para
re-sembrarla a mano: `docker restart coach-demo`. No tiene copias de seguridad (no hay nada que conservar).

## IA (Gemini)
1. Paquito entra con su cuenta de Google en <https://aistudio.google.com/apikey> y crea una clave (plan gratuito). **No la pega en ningún chat.**
2. En el VPS, sin que se vea ni quede en el historial:
   ```sh
   cd ~/servicios/coach && read -rsp "Clave de Gemini: " K && echo && \
   (grep -v '^GEMINI_API_KEY=' .env; echo "GEMINI_API_KEY=$K") > .env.tmp && mv .env.tmp .env && chmod 600 .env && unset K && \
   docker compose up -d coach
   ```
3. Comprobar en la app → IA: «Hoy llevas 0 de 150 peticiones». Si Google cambia el nombre del modelo, ajustar `GEMINI_MODEL` en el `.env`
   (por defecto `gemini-flash-latest`) y reiniciar `coach`.
- Límites: los del plan gratuito de Google (se ven en AI Studio) y el propio `AI_DAILY_LIMIT` por estudio y día.
- Privacidad: solo se envían sus documentos y datos del cliente seudonimizados (ADR 0012). La demo usa respuestas de ejemplo.

## Cobros (Stripe)
Requisito: la app accesible en `https://paquito.redgarverde.com` (ruta de Cloudflare), porque Stripe avisa de los pagos por webhook.
1. Paquito crea su cuenta en <https://dashboard.stripe.com/register> (datos de autónomo y cuenta bancaria). Empezar en **modo de prueba**.
2. **Clave restringida** (Desarrolladores → Claves de API → Crear clave restringida) con permisos: *Customers: escritura*,
   *Checkout Sessions: escritura*, *PaymentIntents: lectura*, *Charges: lectura*, *Customer portal: escritura*. El resto, ninguno.
   Para las cuotas: Configuración → Facturación → **Portal de clientes** → activar (cambiar tarjeta, cancelar) y guardar.
3. **Webhook** (Desarrolladores → Webhooks → Añadir destino): URL `https://paquito.redgarverde.com/api/v1/stripe/webhook`, eventos
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
   `checkout.session.expired`, `charge.refunded`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Copiar su «secreto de firma» (`whsec_…`).
4. En el VPS, sin pegarlas en ningún chat:
   ```sh
   cd ~/servicios/coach && read -rsp "Clave restringida de Stripe: " K && echo && read -rsp "Secreto del webhook: " W && echo && \
   (grep -v '^STRIPE_SECRET_KEY=\|^STRIPE_WEBHOOK_SECRET=' .env; echo "STRIPE_SECRET_KEY=$K"; echo "STRIPE_WEBHOOK_SECRET=$W") > .env.tmp && \
   mv .env.tmp .env && chmod 600 .env && unset K W && docker compose up -d coach
   ```
5. Ajustes → Cobros dirá «modo de prueba». Probar una compra con la tarjeta `4242 4242 4242 4242`. Para cobrar de verdad, repetir 2–4
   con las claves *live* (el modo lo decide la clave).
- Probar en el Mac sin URL pública: `stripe listen --forward-to localhost:3000/api/v1/stripe/webhook` (Stripe CLI) da un `whsec_` temporal.
- Pagar al reservar: Ajustes → Reservas → «Si no tiene bono, que pague la sesión al reservar» + tarifa de sesión. El hueco se retiene 15 min; el planificador libera los no pagados.
- Devoluciones: desde el panel de Stripe; la app marca el cobro como «Devuelto» y archiva el bono asociado.
- Facturas: los recibos de Stripe no son facturas. Informes → «Descargar los cobros (CSV)» para su gestor.

## Correo (Brevo)
Gratis hasta 300 correos al día, servidores en la UE. Se envía desde un **subdominio nuevo** (`envios.redgarverde.com`): así no se
toca el SPF del dominio raíz (el del reenvío de correo) ni ningún registro existente.
1. Crear cuenta en <https://www.brevo.com> (plan gratuito) con el correo del usuario.
2. **Dominio**: Ajustes → Remitentes, dominios e IP → Dominios → Añadir `envios.redgarverde.com`. Brevo enseña los registros
   (código de verificación TXT, DKIM y DMARC). Añadirlos en Cloudflare → DNS **como registros nuevos** con exactamente el nombre y
   valor que da Brevo, con la nube **gris** (solo DNS). No editar ni borrar ningún registro existente. Pulsar «Verificar».
3. **Remitente**: añadir `hola@envios.redgarverde.com` (nombre «Paquito Coach» o el definitivo).
4. **Clave SMTP**: Ajustes → SMTP y API → SMTP → «Generar una clave SMTP». El usuario SMTP es el que aparece en esa pantalla.
5. En el VPS, sin pegarla en ningún chat:
   ```sh
   cd ~/servicios/coach && read -rp "Usuario SMTP de Brevo: " U && read -rsp "Clave SMTP de Brevo: " K && echo && \
   (grep -v '^MAIL_SMTP_USER=\|^MAIL_SMTP_PASS=\|^MAIL_SMTP_HOST=\|^MAIL_FROM=' .env; echo "MAIL_SMTP_HOST=smtp-relay.brevo.com"; \
    echo "MAIL_SMTP_USER=$U"; echo "MAIL_SMTP_PASS=$K"; echo "MAIL_FROM=Paquito Coach <hola@envios.redgarverde.com>") > .env.tmp && \
   mv .env.tmp .env && chmod 600 .env && unset U K && docker compose up -d coach
   ```
6. Probar: en `/acceso` aparece «¿Has olvidado la contraseña?»; pedir un enlace al propio correo. Si no llega:
   `docker logs coach 2>&1 | grep correo` (los fallos se reintentan 6 veces: 1, 2, 4… minutos) y el registro de Brevo (Estadísticas).
- Qué se manda: invitación (si la ficha tiene correo), restablecer contraseña, confirmar cambio de correo y aviso al antiguo,
  confirmación/cancelación de reservas y, al entrenador sin avisos en el móvil, reservas nuevas. Los no esenciales llevan «Darme de baja».
- La demo nunca envía correos. En e2e, `MAIL_FAKE=1` (prohibido en producción) y `GET /api/v1/test/mails`.

## Verificación en dos pasos
Ajustes (entrenador) o Perfil (cliente) → «Verificación en dos pasos» → escanear el QR con Google Authenticator, Authy,
1Password… → código → guardar los 10 códigos de recuperación. Muy recomendable para la cuenta del entrenador.
- Móvil perdido: entrar con un código de recuperación y, en Ajustes, desactivarla y volver a activarla con el móvil nuevo.
- Sin móvil ni códigos (último recurso, en el VPS): `docker exec coach-db psql -U coach -d coach -c "update users set totp_secret = null, totp_recovery = '[]' where email = 'paquito@correo.com'"`.

## Salud y logs
`docker ps --filter name=coach` · `docker logs coach --tail 100` · `curl -s https://paquito.redgarverde.com/health`
