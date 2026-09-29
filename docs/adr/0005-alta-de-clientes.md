# 0005 — Tres formas de alta de clientes
- **Estado**: aceptada · **Fecha**: 2026-09-29
## Decisión
1. Ficha + **invitación** personal (enlace de un uso, 7 días; se manda por WhatsApp; sin servidor de correo).
2. **Código público** del estudio (rotable) → cuenta **pendiente** hasta que el entrenador acepta.
3. **Ficha sin cuenta** (clientes presenciales); se puede invitar después.
La recuperación de contraseña de clientes también es por enlace generado por el entrenador (24 h), porque no hay correo saliente.
## Consecuencias
No hace falta SMTP en el MVP. Si más adelante hay correo, los mismos tokens sirven para enviarlos automáticamente.
