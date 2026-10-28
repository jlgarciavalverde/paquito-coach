# Requisitos

[← Documentación](README.md) · [README del proyecto](../README.md)

Resumen de lo que la plataforma debe hacer y con qué garantías. El detalle del producto está en [`producto/mvp.md`](producto/mvp.md), la comparación con Harbiz en [`producto/harbiz-auditoria.md`](producto/harbiz-auditoria.md) y el porqué de cada decisión en [`adr/`](adr/).

## Actores

| Actor | Dispositivo habitual | Objetivo |
|---|---|---|
| Entrenador | Ordenador del estudio y móvil | Gestionar clientes, planificar entrenos y comidas, cobrar y comunicarse rápido y con imagen profesional. |
| Cliente del entrenador | Móvil, en el gimnasio o en casa | Saber qué toca hoy, apuntar sus series, reservar, pagar y hablar con su entrenador. |
| Visitante | Cualquiera | Conocer el estudio en su página pública y pedir entrar. |
| Administrador de la plataforma | Ordenador | Dar de alta estudios, gestionar planes, pruebas y suspensiones. |

## Requisitos funcionales

### Clientes
| ID | Requisito |
|---|---|
| RF-01 | Hay tres formas de dar de alta a un cliente: por invitación (enlace de un uso, 7 días), con el código público del estudio más aceptación, o como ficha sin cuenta. |
| RF-02 | La ficha del cliente reúne datos, lesiones, objetivos, plan de entreno y comidas, agenda, progreso, salud y chat. |
| RF-03 | Un cliente se puede archivar (se cierran sus sesiones) y recuperar después. |
| RF-04 | El panel «Hoy» del entrenador avisa de quién necesita atención: entrenos por revisar, check-ins, alertas de salud y solicitudes. |

### Entrenamiento
| ID | Requisito |
|---|---|
| RF-05 | Hay una biblioteca de ejercicios, rutinas por bloques y programas de varias semanas, y todo se puede duplicar y reutilizar. |
| RF-06 | Las rutinas y los programas se asignan a clientes con fechas. |
| RF-07 | El cliente apunta sus series en un cuaderno que no pierde datos, con descanso y aviso de récord en el momento. |
| RF-08 | El progreso de cargas se muestra con 1RM estimado y récords por ejercicio. |

### Nutrición, agenda y cobros
| ID | Requisito |
|---|---|
| RF-09 | Planes de comidas por cliente, con intercambios y comidas marcadas como hechas. |
| RF-10 | Agenda semanal arrastrable, reservas del cliente según la disponibilidad del estudio, asistencia y cancelación. |
| RF-11 | Bonos de sesiones que se descuentan al asistir. |
| RF-12 | Cobros con Stripe: bonos, cuotas recurrentes con portal del cliente, pago al reservar y enlaces de pago. |
| RF-13 | Cada estudio cobra en su propia cuenta de Stripe Connect Express, sin comisión de la plataforma. |

### Seguimiento y salud
| ID | Requisito |
|---|---|
| RF-14 | Check-ins periódicos con formularios propios, fotos de progreso y métricas personalizadas. |
| RF-15 | PAR-Q+ y anamnesis, con alertas cuando una respuesta lo requiere. |
| RF-16 | Informes de progreso y material descargable para el cliente. |

### Comunicación e IA
| ID | Requisito |
|---|---|
| RF-17 | Chat privado entrenador-cliente en tiempo real, con fotos y avisos push. |
| RF-18 | Recordatorios push automáticos (8:00 y 20:00) y correo transaccional con reintentos. |
| RF-19 | La IA propone rutinas, programas y planes de comidas a partir de los documentos del entrenador y responde preguntas sobre ellos. El entrenador revisa la propuesta antes de guardarla. |

### Plataforma
| ID | Requisito |
|---|---|
| RF-20 | Alta pública de estudios con prueba de 14 días sin tarjeta. |
| RF-21 | Planes por número de clientes activos, con cobro mensual (Stripe Billing) y portal. |
| RF-22 | Cada estudio tiene una página pública con su nombre, color de acento y dirección `/e/<slug>`, y opcionalmente un dominio propio. |
| RF-23 | Un estudio en pausa (prueba vencida, impago o baja) puede consultar y exportar sus datos, pero no modificarlos. |
| RF-24 | Demo pública con datos inventados y entrada en un clic, que se vuelve a sembrar cada noche. |

## Requisitos no funcionales

| ID | Categoría | Requisito |
|---|---|---|
| RNF-01 | Seguridad | Acceso denegado por defecto: cada ruta declara quién puede usarla (`lib/access.ts`) y la matriz y el fuzz se generan del registro de rutas. |
| RNF-02 | Seguridad | Sesiones opacas en cookie `__Host-` (sha256 en reposo), CSRF por `Origin`, 2FA TOTP opcional, verificación de correo y límite de peticiones. |
| RNF-03 | Aislamiento | Ningún estudio puede ver ni tocar datos de otro (`studio_id` en todo, con tests de aislamiento). |
| RNF-04 | Dinero | Cobros idempotentes, webhooks firmados y deduplicados, y un evento de Stripe solo puede tocar cobros de su propia cuenta. |
| RNF-05 | Privacidad (RGPD) | Exportación en ZIP, borrado con cobros anonimizados, auditoría de acciones sensibles y datos del cliente seudonimizados al llamar a la IA. |
| RNF-06 | Disponibilidad | `pg_dump` diario, copia en el Mac con simulacro real de restauración y vigilante. El despliegue vuelve atrás solo si `/health` falla. |
| RNF-07 | Rendimiento | Índice en cada clave foránea y vigilancia de consultas lentas. |
| RNF-08 | Accesibilidad | WCAG 2.1 AA con axe en los e2e, en claro y oscuro. |
| RNF-09 | Usabilidad | El cliente usa la app con una mano entre series: objetivos grandes, sin pasos innecesarios, PWA instalable. |
| RNF-10 | Calidad | Tests de API y web contra Postgres real, e2e con Playwright sobre la build de producción y guardarraíl de diseño (`design.test.ts`). |
| RNF-11 | Coste | La IA usa el plan gratuito de Gemini, con límite diario propio por estudio. |
