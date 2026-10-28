# Auditoría de diseño (tanda D, 2026-10-26)

[← Documentación](README.md) · [README del proyecto](../README.md)

Capturas con `SHOTS_DIR=/ruta pnpm e2e:demo` (`e2e-demo/capturas.spec.ts`): 28 pantallas × móvil/escritorio × claro/oscuro
sobre la semilla de la demo. Revisadas a mano hasta ahora: Hoy (cliente y entrenador), cuaderno de series (oscuro),
Progreso, Comidas, ficha de cliente, editor de rutina, agenda. El resto queda para la pasada con Impeccable `/audit` y
`design:design-critique` cuando estén instalados (fase D0).

Lo que ya funciona y no se toca: la identidad (discos, Archivo ancho/estrecho, hoja clínica), la ficha etiqueta/dato, las
gráficas (una serie, marcador, tabla alternativa), las marcas de disco como estado, el tono de los textos.

## Prioridad alta
| Pantalla | Hallazgo | Fase |
|---|---|---|
| Cuaderno de series | Cada serie son 4 controles + 4 botones ± repetidos en todas las filas: mucha densidad para usar entre series con las manos ocupadas. La prescripción («4×6 60 kg») y lo precargado (75 kg de la última vez) no se distinguen: no se sabe qué es objetivo y qué sugerencia. | D3 |
| Cuaderno de series | El descanso solo aparece como barra pequeña sobre «Terminar» al marcar una serie (`RestBar`): poco protagonismo para lo que más se mira entre series. | D3 |
| Agenda (semana) | Citas solapadas se pisan: «Formación en readaptación» queda tapada por la sesión de las 17:00 y el texto se corta. | D4 |
| Hoy del entrenador | Todo es texto del mismo peso: la frase resumen, «Necesitan atención» y la actividad compiten. La matriz semanal no dice el cumplimiento por cliente (solo marcas). | D4 |
| Cabecera del entrenador | ✅ 2.2.0: el menú de cuenta mostraba el nombre del estudio truncado en vez del de la persona; y con un nombre de estudio largo la cabecera **desbordaba 40 px en el móvil en todas las pantallas** (la prueba no lo veía porque «Estudio Paquito» es corto; ahora la demo lo comprueba). | D2 |

## Prioridad media
| Pantalla | Hallazgo | Fase |
|---|---|---|
| Hoy del cliente | Jerarquía correcta, pero «Próximos» y «Próxima sesión» repiten forma; «Tu constancia» es el dato más motivador y está al final. | D3 |
| Progreso | Página muy larga sin resumen arriba (peso, mejor carga, constancia de un vistazo). | D3 |
| Comidas | Los macros arriba son 4 cifras sueltas sin relación con lo marcado del día; la tira de días es buena. | D3 |
| Ficha de cliente | Cabecera sin resumen (cumplimiento, última actividad, alerta de salud); la lista de semanas futuras vacías ocupa mucho. | D4 |
| Editor de rutina vacío | Lienzo vacío sin guía ni plantillas a la vista; «Crear rutina» desactivado sin explicar por qué. | D4 |
| Móvil (todas) | ✅ 2.2.0: hojas inferiores con arrastre y transiciones entre pantallas. | D2 |

## Momentos que merecen trabajo propio
1. Marcar una serie (feedback inmediato, siguiente serie enfocada, descanso arrancando).
2. Batir un récord (e1RM) durante el entreno.
3. Terminar el entreno (resumen: volumen, récords, RPE).
4. Completar todas las comidas del día.
5. El entrenador revisa todo lo pendiente («Marcar todo como revisado»).
