# Sistema de diseño — «hoja de entrenamiento clínica»

Referencia viva: **`/galeria`** (todas las piezas, en claro y oscuro).

## De dónde sale
El mundo de Paquito son dos cosas: la **consulta de readaptación** (fichas, historia clínica, avisos de lesión)
y la **sala de fuerza** (el cuaderno de series, los **discos de competición** con su código de color: rojo 25 kg,
azul 20, amarillo 15, verde 10). El diseño toma de ahí sus piezas:

- **Color**: base clara y fría de consulta, tinta azul pizarra, y los **colores de disco** como único sistema de color
  con significado (acción = azul, atención = rojo, datos de intensidad = amarillo/verde). Nada de color decorativo.
- **Forma**: la ficha de cliente se lee como una historia clínica (etiqueta a la izquierda, dato a la derecha,
  filas separadas por una línea), y los entrenos como el cuaderno de series (rejilla de series × reps × kg).
- **Elemento memorable** (uno solo): la barra cargada con discos, dibujada en SVG, en la pantalla de acceso y
  como marca en pequeño. Todo lo demás, sobrio.

## Revisión frente a los rasgos típicos de «diseño generado» (v0.1 → v0.2)
| Lo que había (v0.1) | Por qué era un tic | Ahora |
|---|---|---|
| Fondo crema + serif de alto contraste + acento arcilla | Combinación por defecto de las interfaces generadas | Base fría de consulta + una sola familia (Archivo) con contraste de **anchura** + colores de disco |
| Todo dentro de tarjetas redondeadas iguales con sombra | «Kit SaaS» | Zonas en bandeja (`tray`) sin sombra, filas con línea, tarjetas solo donde hay un objeto (una rutina, una comida) |
| Manchas de degradado de fondo | Decoración sin información | Fondo liso |
| Sobretítulos en MAYÚSCULAS con espaciado | Cromo de plantilla | Sin sobretítulos; etiquetas en minúscula normal |
| «Buenos días, *Paquito*» con una palabra en cursiva de color | El tic tipográfico más reconocible | El día como titular ancho y una frase de resumen con datos reales |
| Tarjetas de cifras (número grande + etiqueta) | Tratamiento por defecto | Las cifras van dentro de frases o en la rejilla de datos donde se usan |
| Separadores «A · B · C» | Cromo de plantilla | Rejilla de definición (etiqueta/dato) |
| Modal centrado para crear | Genérico | Panel lateral (hoja) que deja ver la lista detrás |
| Barra lateral con pastillas tintadas e iconos | Genérico | Barra superior con texto; clientes en **lista + ficha** (como un programa de historias clínicas) |
| Avatares en círculos pastel | Genérico | Monograma cuadrado sobre bandeja |
| Estado con pastilla y punto | Genérico | Marca de disco (rectángulo vertical del color del disco) + texto |
| Entradas animadas en cada bloque | Movimiento gratuito | Solo movimiento que responde a una acción (abrir hoja, aceptar/rechazar) |

## Tokens (`apps/web/src/styles.css`, claro + oscuro)
| Clase | Claro | Uso |
|---|---|---|
| `paper` | `#F9FAF9` | fondo de página |
| `tray`, `tray-2` | `#EEF2F0`, `#E3E9E6` | zonas agrupadas (barra, lista de clientes, cabecera de ficha), hover |
| `ink`, `ink-2`, `ink-3` | `#15222C`, `#475661`, `#5A6770` | texto (todos AA sobre `paper` y `tray`) |
| `rule`, `rule-strong` | `#D3DCD8`, `#B4C0BB` | líneas de fila, bordes de control |
| `primary` (+`-ink`, `-soft`) | `#2447A6` | disco azul: la acción y lo seleccionado |
| `plate-red` (+`-soft`) | `#C22F28` | disco rojo: requiere atención (pendiente, lesión, error) |
| `plate-yellow` | `#E0A81E` | disco amarillo: datos (intensidad media) — nunca texto sobre blanco |
| `plate-green` (+`-soft`) | `#2B7C46` | disco verde: activo, completado |

Tipografía: **Archivo** (variable, ejes `wght` y `wdth`), una sola familia:
- Titulares: `font-wide` (wdth 118, peso 640), tamaños 34/26/19. Tracking ligeramente negativo.
- Cifras (cargas, series, horas, contadores): `font-narrow` (wdth 78, peso 600) + `tabular`.
- Texto: 15/1.55, peso 400; secundario 13.5. Etiquetas en minúscula normal, peso 500.

Radios: 6 px controles y objetos, 12 px bandejas y hojas. Sombra solo en lo que flota (hoja lateral, menús, avisos).

## Qué componente usar
| Necesito… | Componente |
|---|---|
| Título de pantalla (+ frase y acciones) | `PageTitle` |
| Título de bloque | `BlockTitle` |
| Zona agrupada | `Tray` · objeto concreto (rutina, comida): `Sheet`-less `ObjectCard` |
| Filas de lista | `RowList` / `Row` |
| Ficha etiqueta/dato (lectura o formulario) | `RecordSheet` + `RecordRow` |
| Estado | `PlateMark` (tono de disco) · de cliente: `StatusMark` |
| Persona | `Monogram` |
| Acción | `Button` (`primary`, `secondary`, `quiet`, `danger`) · en enlace: `buttonClass()` · solo icono: `IconButton` |
| Campos | `TextField`, `TextArea`, `Select`, `Checkbox` |
| Crear/editar sin salir de la lista | `SidePanel` (hoja lateral; en móvil, a pantalla completa) |
| Confirmar algo pequeño | `Dialog` |
| Pestañas | `Tabs` |
| Vacío | `EmptyNote` (una frase + la acción, sin icono decorativo) |
| Aviso de lesión/limitación | `HealthAlert` |
| Cargando | `Skeleton`, `Spinner` |
| Confirmación breve | `useToast()` |

## Maquetación
- Entrenador: barra superior (marca, secciones en texto, cuenta). Clientes en **dos columnas**: lista a la izquierda
  (320 px) y ficha a la derecha; en móvil, lista → ficha. Barra inferior en móvil.
- Cliente: una columna de 680 px; barra inferior en móvil, pestañas arriba en escritorio.
- Alineación a la izquierda siempre; líneas de texto < 75 caracteres.
- Capturas de verificación: móvil 390×844 y escritorio 1360×860, claro y oscuro.
