# 0009 — Demo pública como instancia separada
- **Estado**: aceptada · **Fecha**: 2026-09-29
## Contexto
Paquito (y quien él quiera) necesita probar la app sin miedo a romper datos reales. La app ya admite varios estudios,
así que un «estudio demo» dentro de producción sería lo más barato.
## Decisión
**Instancia aparte**: servicio `coach-demo` (misma imagen, `DEMO_MODE=1`) con su **propia base de datos** `coach-demo-db`
en una red interna distinta de la de producción. Credenciales públicas con entrada de un clic (`POST /auth/demo`),
banda fija de aviso, re-siembra al arrancar y cada noche a las 4:00 (`demo/seed.ts`), y bloqueo de lo que rompería la
demo para otros o crearía datos reales: subir fotos, borrar cuentas o clientes, cambiar contraseñas, registrarse, rotar el
código del estudio, avisos push.
## Por qué no un estudio dentro de producción
Con credenciales públicas, cualquier fallo futuro en el aislamiento por estudio expondría datos de salud reales. Separar
bases de datos convierte ese riesgo en imposible por construcción. Coste: un contenedor y un hostname más.
## Consecuencias
Un hostname más en Cloudflare (`demo-paquito.redgarverde.com` → `coach-demo:3000`). El e2e de la demo tiene su propia
configuración (`pnpm e2e:demo`, BD `coach_demo`).
