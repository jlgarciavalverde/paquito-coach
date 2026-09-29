# 0008 — Rediseño: «hoja de entrenamiento clínica» (v0.2)
- **Estado**: aceptada · **Fecha**: 2026-09-29 · Sustituye la dirección visual de la v0.1
## Contexto
La v0.1 («clínico premium claro»: crema + serif + arcilla, tarjetas con sombra, sobretítulos en mayúsculas) se
percibía como diseño generado por IA. Petición del usuario: otros componentes y otra disposición, manteniendo la línea clara y profesional.
## Decisión
Sistema propio sacado del mundo de Paquito: colores de disco de competición como único color con significado,
Archivo (una familia, contraste de anchura), ficha tipo historia clínica, lista + ficha en dos columnas,
hoja lateral para crear/editar, marcas de disco como indicador de estado, barra cargada como único elemento
memorable. Detalle y tabla de «antes/después» en `docs/diseno.md`.
## Consecuencias
Se eliminan `Card`, `Badge`, `Avatar`, `PageHeader`, `Stat`, `EmptyState`. Nuevos: `PageTitle`, `BlockTitle`, `Tray`,
`ObjectCard`, `RecordSheet/RecordRow`, `PlateMark`, `StatusMark`, `Monogram`, `HealthAlert`, `EmptyNote`, `SidePanel`.
