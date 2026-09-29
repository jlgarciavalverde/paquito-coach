# 0004 — Datos separados por estudio desde el día 1
- **Estado**: aceptada · **Fecha**: 2026-09-29
## Decisión
Tabla `studios`; `studio_id` en toda tabla con datos; toda consulta filtra por el estudio del usuario y devuelve 404 si el recurso es de otro. En el MVP solo existe el estudio de Paquito (el alta inicial solo se permite una vez).
## Consecuencias
Añadir un segundo entrenador o convertirlo en SaaS no requiere migrar datos, solo un flujo de alta de estudios. `isolation.test.ts` debe crecer con cada módulo.
