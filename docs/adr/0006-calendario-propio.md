# 0006 — Calendario propio en vez de FullCalendar
- **Estado**: aceptada (se implementa en F4) · **Fecha**: 2026-09-29
## Decisión
Rejilla semana/mes propia con `date-fns` y `@dnd-kit` para arrastrar, estilada con los tokens del sistema de diseño.
## Por qué
Las librerías de calendario imponen un aspecto genérico difícil de personalizar y pesan mucho; aquí solo hacen falta dos vistas y tres capas (citas, entrenos, comidas).
