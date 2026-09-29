# Sistema de diseño — «clínico premium claro»

Referencia viva: **`/galeria`** (todas las piezas con sus variantes, en claro y oscuro).

## Principios
- Transmite **profesional de la salud**, no gimnasio: papel cálido, mucho aire, tipografía editorial.
- Un único color de acción (**verde clínico** `accent`) y un segundo acento **arcilla** (`clay`) solo para llamar la atención (pendientes, avisos suaves).
- Los números importan (cargas, kcal, series): cifras grandes en serif con `tabular`.
- Movimiento sutil (150–350 ms, `ease-out-soft`), siempre respetando `prefers-reduced-motion`.

## Tokens (definidos en `apps/web/src/styles.css`, claro + oscuro)
| Token (clase Tailwind) | Uso |
|---|---|
| `paper` | fondo de página (con `paper-grain`) |
| `surface`, `surface-2`, `surface-3` | tarjetas, hover, pistas |
| `ink`, `ink-2`, `ink-3` | texto principal, secundario, terciario (todos AA sobre `paper`/`surface`/`surface-2`) |
| `line`, `line-strong` | bordes de tarjeta, bordes de control |
| `accent`, `accent-ink`, `accent-soft`, `accent-soft-ink` | acción principal, estado activo |
| `clay`, `clay-soft` | pendiente / atención |
| `success`, `warning`, `danger` (+ `-soft`) | estados |
| `brand`, `brand-ink` | logotipo y panel de acceso (igual en claro y oscuro) |

Tipografía: `font-display` = **Instrument Serif** (títulos: página 40–48, sección 24, cifras 44) · `font-sans` = **Instrument Sans** (texto 15, secundario 13, sobretítulo 12 en mayúsculas con tracking 0,14em). Radios: 8/12/18/26 (`--radius-*`). Sombras: `--shadow-soft`, `--shadow-lift`.

## Qué componente usar
| Necesito… | Componente |
|---|---|
| Título de página con sobretítulo y acciones | `PageHeader` |
| Título de sección | `SectionTitle` |
| Contenedor | `Card` |
| Acción | `Button` (`primary` una por pantalla, `secondary`, `soft`, `ghost`, `danger`) · solo icono: `IconButton` · en un enlace: `buttonClass()` |
| Campo | `TextField`, `TextArea`, `Checkbox` (etiqueta, ayuda y error incluidos) |
| Estado | `Badge` (tonos) · de cliente: `StatusBadge` |
| Cifra | `Stat` |
| Persona | `Avatar` (iniciales, color estable por nombre) |
| Modal (en móvil hoja inferior) | `Dialog` |
| Secciones dentro de una página | `Tabs` + `TabPanel` |
| Nada que mostrar | `EmptyState` (qué falta + acción) |
| Cargando | `Skeleton` (bloques) · `Spinner` (en botones: `loading`) |
| Confirmación breve | `useToast()` |
| Copiar un enlace/código | `CopyField` |
| Error de formulario | `FormError` |
| Módulo aún no construido | `ComingSoon` |

## Maquetación
- Entrenador: barra lateral 264 px en ≥ lg; barra inferior en móvil. Contenido `max-w-6xl`.
- Cliente: columna `max-w-3xl`; barra inferior en móvil, pestañas arriba en ≥ sm.
- Capturas de verificación: móvil 390×844 y escritorio 1360×860, claro y oscuro.
