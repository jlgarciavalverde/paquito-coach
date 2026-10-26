# 0018 — Plataforma para varios entrenadores (SaaS): direcciones, planes y administración
- **Estado**: aceptada · **Fecha**: 2026-10-26
## Contexto
El usuario quiere vender la app a otros entrenadores con las funciones de Harbiz (auditoría en
`docs/producto/harbiz-auditoria.md`). Los datos ya estaban aislados por `studio_id` (ADR 0004), pero lo público
(página, aviso legal, `/`, manifest) y el alta suponían un único estudio por instalación.
## Decisión
- **Una instalación, muchos estudios.** Lo que habla de un estudio sin sesión se resuelve así (`lib/tenant.ts`):
  `?estudio=<slug>` → dominio propio (`HOST_STUDIOS`, `dominio=slug`, `@first` = el primer estudio) → nada (es la
  plataforma). Con sesión, el estudio es siempre el del usuario (como hasta ahora).
- **Direcciones por ruta, no por subdominio**: la página de cada estudio vive en `/e/<slug>` en el dominio general.
  Evita el certificado comodín de segundo nivel de Cloudflare (de pago), cookies por subdominio y la comprobación de
  `Origin` con comodines. Un estudio puede tener además su dominio propio (Paquito: `paquito.redgarverde.com`), donde
  `/` es su página como antes.
- **Alta pública** (`POST /auth/signup`, `/alta`): crea estudio + entrenador en **prueba de 14 días** sin tarjeta.
  Cerrada salvo `SIGNUP_OPEN=1`. Campo trampa, 5 por IP y hora, direcciones reservadas, correo y dirección únicos.
  `/auth/setup` sigue para la primera instalación (estudio fundador).
- **Planes** (`packages/shared/src/platform.ts`): prueba (5 clientes), básico (15), pro (50), estudio (sin límite) y
  fundador (sin límite ni cobro, solo a mano). Solo cambia **cuántos clientes ocupan plaza a la vez** (con cuenta,
  invitados y fichas; no los pendientes ni los archivados). El límite se comprueba con cerrojo por estudio
  (`withClientSlot`) al crear, aceptar y desarchivar: dos altas a la vez no pasan las dos.
- **Cobro de la plataforma** con Stripe Billing en la cuenta de la plataforma: Checkout en modo suscripción con
  `metadata.scope = "platform"`, portal para cambiar de plan/tarjeta o darse de baja. El webhook de siempre pasa
  primero los eventos a `platformEvent` (estudio por `platform_subscription_id`). El plan se deduce del importe.
- **Estudio en pausa** (`studioAccess`): prueba vencida, impago tras **7 días de gracia**, baja al acabar el periodo
  pagado, o suspensión. Se puede consultar todo (GET) y exportar; solo se permiten cuenta, `/auth`, `/me`, plan, push y
  webhooks (`lockedAllows`). El resto responde **402 `studio_locked`**. Nadie pierde el acceso a sus datos.
- **Administración**: `PLATFORM_ADMIN_EMAILS` (no un rol en BD: no se puede conceder desde la app). Panel en
  `/coach/admin` (lista de estudios, resumen con ingresos mensuales, plan a mano, alargar prueba, suspender). Para
  quien no es admin, las rutas `/admin/*` responden 404.
- **Estudios existentes**: la migración `0022` los deja como **fundadores** (`comp`) y les da dirección a partir del
  nombre. El despliegue añade `HOST_STUDIOS=<dominio de PUBLIC_URL>=@first` si falta, así `/` sigue igual.
## Consecuencias
- Pruebas: `platform.test.ts` (alta, direcciones, límites con concurrencia, pausa, webhook, gracia, baja,
  administración), `studio.p2.test.ts` (dominio propio y web de la plataforma), e2e `20-plataforma`.
- Pendiente (S2): cobros de cada estudio a sus clientes con **Stripe Connect** (hoy van a la cuenta de la plataforma).
- Pendiente: borrar los estudios dados de baja a los 90 días (lo prometen las condiciones), correos de aviso de fin de
  prueba, y los enlaces de correo con el dominio propio de cada estudio (`studioUrl`).
- Las condiciones para entrenadores (`/condiciones`, con el encargo de tratamiento del art. 28 RGPD) y los precios son
  provisionales: revisarlos antes de abrir el alta.
