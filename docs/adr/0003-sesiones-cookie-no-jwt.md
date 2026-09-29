# 0003 — Sesiones con token opaco en cookie, no JWT
- **Estado**: aceptada · **Fecha**: 2026-09-29
## Decisión
Token aleatorio de 256 bits en cookie `HttpOnly; Secure; SameSite=Lax` (`__Host-sid`), guardado como SHA-256 en `sessions`. Caducidad deslizante de 60 días. CSRF: comprobación de `Origin`.
## Por qué
Revocación inmediata (cerrar sesión en otro dispositivo, archivar un cliente, cambiar contraseña), nada accesible desde JS, sin gestión de claves de firma. El coste (una consulta por petición) es irrelevante a esta escala.
