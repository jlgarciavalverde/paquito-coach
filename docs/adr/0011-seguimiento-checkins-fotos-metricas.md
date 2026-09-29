# 0011 — Seguimiento: check-ins periódicos, fotos de progreso y medidas propias
- **Estado**: aceptada · **Fecha**: 2026-09-29
## Contexto
Paquito usa hoy Harbiz. Su módulo de «Evolución del cliente» y «Cuestionarios» es lo que más echaría en falta:
formularios propios que el cliente rellena cada semana o cada mes, fotos para comparar y métricas propias además del peso.
En readaptación, las métricas propias (dolor EVA, grados de flexión, salto) son tan importantes como el peso.
## Decisión
- **Check-ins**: `checkin_forms` (preguntas en JSONB: texto, escala 1–10, sí/no, número, foto), `checkin_assignments`
  (un formulario por cliente con `every_days` 7/14/28 y `next_due`) y `checkin_responses`. La respuesta **copia las
  preguntas** para que editar el formulario no cambie lo ya contestado. Al contestar, `next_due` salta a la siguiente fecha
  posterior a hoy (`nextDueAfter`, no se acumulan los atrasados). Validación compartida (`checkinError`) en web y API.
  Solo lo que toca (`next_due <= hoy`, hora de Madrid) puede contestarse. Retirar un formulario borra sus asignaciones y
  conserva las respuestas.
- **Avisos**: push a las 8:00 el día que toca (`reminder_log` kind `client-checkin`); en «Necesitan atención», respuesta
  nueva sin revisar o check-in atrasado más de 2 días. Abrir la pestaña Check-ins de la ficha los marca como revisados.
- **Fotos**: se reutiliza `media` (tipo real por bytes, acceso solo del cliente y de su estudio) y `progress_photos`
  la enlaza con fecha y postura. Borrar la foto borra el archivo.
- **Medidas propias**: `metric_defs` por estudio (unidad, si subir es bueno, si el cliente puede anotarla) y
  `metric_values` (una por cliente, medida y día). Archivar no borra la historia.
- Todo entra en la copia RGPD y cae con el borrado del cliente (cascade + archivos de `media`).
## Descartado
Formularios asignados por etiqueta de forma dinámica (se asigna a los clientes elegidos; la etiqueta sirve para elegirlos),
lógica condicional entre preguntas y cobros (Stripe), por ahora.
