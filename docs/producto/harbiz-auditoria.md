# Auditoría de Harbiz (2026-10-26) y huecos frente a Paquito Coach

Objetivo del usuario: convertir Paquito Coach en un **SaaS para vender a otros entrenadores** con todas las funcionalidades de Harbiz (estética propia).

## Cómo se obtuvo
- REA sobre `app.harbiz.io` con la sesión del usuario en un Chrome aislado (CDP en 127.0.0.1:9333). Evidencias: `ev_7f487a93…` (bundle), captura de la página `home-profesional`.
- Harbiz es una app **Meteor** con un único bundle de 28 MB. De él se extrajeron, de forma estática, **178 rutas** y **423 nombres de métodos de servidor** (algunos son falsos positivos: claves i18n y clases CSS).
- Es un análisis estático: las rutas y métodos existen en el código, pero no se ha comprobado cuáles están activos en cada plan de Harbiz. Las funciones exclusivas de su app móvil del cliente solo se ven a través de los métodos que la web comparte.
- No se ha copiado código, textos ni recursos de Harbiz: solo se ha inventariado qué hace.

## Leyenda
✅ ya existe · 🟡 parcial · ❌ falta · ⏭️ propio de Harbiz como empresa, no se replica

## 1. SaaS (lo que convierte la app en un producto vendible)
| Harbiz (rutas/métodos) | Estado | Nota |
|---|---|---|
| Alta de profesionales `createProfessional`, `completar-perfil-profesional`, `formulario-inicial` | ❌ | Hoy solo `/instalar` con SETUP_CODE (un estudio) |
| Prueba gratis / demo `extendDemo`, `restricted-endDemo`, `demoClients` | 🟡 | Hay demo pública; falta la prueba por estudio con caducidad |
| Planes de la plataforma `activar-plan`, `cambiar-plan`, `modifyMaxActiveClients`, límite de clientes activos | ❌ | Facturación del SaaS al entrenador |
| Extras `purchase-harbiz-addons`, `activeExtraAddons`, `cancelAddon` | ❌ | |
| Tokens de IA `purchaseTokensHarbizAI`, `tokenLedger` | 🟡 | Hay límite diario; falta un saldo comprable |
| Baja con oferta de retención `cancelacion`, `applyAnnualRetentionOffer`, `downsell-form`, `saveCancelSuscriptionFeedBack` | ❌ | |
| Cobros de cada estudio con **Stripe Connect** `pagos/connect`, `activeStripe` | 🟡 | Stripe con una sola cuenta → pasar a Connect |
| Factura electrónica `activar-factura-electronica`, `invoice/`, `receipt/`, `credit-note/` | ❌ | Verifactu/TicketBAI en España |
| Programa de referidos `programa-referidos`, `panel-referidos/:refCode` | ❌ | |
| Panel interno `supportCenter/users`, importación masiva de clientes/ejercicios/vídeos | ❌ | Superadministrador |
| Varios idiomas `universe.i18n`, `updateUserLanguage` | ❌ | Hoy solo español |
| Subdominio/slug por estudio `l/:subdomain`, `/:subdomain/landing` | 🟡 | Hay página pública de un estudio |

## 2. Equipo
| Harbiz | Estado |
|---|---|
| Colaboradores `equipo`, `createCollaborator`, `invitacion-equipo/:id`, permisos `saveColabConfig` | ❌ (roles preparados en `studio_id`, un solo entrenador) |
| Asignar clientes a colaboradores `assignClientToCollaborator`, `deassignPt` | ❌ |
| Control de acceso a la instalación `facilityAccess`, número de tarjeta | ❌ |

## 3. Clientes
| Harbiz | Estado |
|---|---|
| Listado, ficha, información, evolución | ✅ |
| Grupos `clientes/grupos` (programa, nutrición, avisos y chat de grupo) | ❌ |
| Etiquetas `etiquetas`, `addMultiTagsClient` | ❌ |
| Archivar `removeArchiveClient` | 🟡 |
| Documentos por cliente con control de acceso `clientes/:id/documentos/acceso` | 🟡 (material general, no por cliente) |
| Notas privadas `addOrEditNote` y enlace compartible `notes/:token` | 🟡 |
| Datos clínicos `updateClinicalData` | ✅ (PAR-Q + anamnesis) |
| Recordatorios y tareas `addReminder`, `editRecurrentReminder` | 🟡 (solo push automáticos) |
| Automatizaciones (programa al iniciar el plan) `automationsAssignClient`, `insertStartPlanSchedule` | ❌ |
| Exportar CSV `export2CSV` / importación masiva | 🟡 / ❌ |
| Leads `leads`, `saveLead`, `updateStatusPaymentLeads` | ✅ (solicitudes desde la página pública) |
| Cumplimiento recalculado `recalculateComplianceClient` | ✅ |

## 4. Entrenamiento
| Harbiz | Estado |
|---|---|
| Ejercicios (privados, etiquetas, comentarios por ejercicio) | ✅ / ❌ comentarios del cliente por ejercicio |
| Workouts, programas por semanas, plantillas `libreria/plantillas` | ✅ / 🟡 plantillas predefinidas |
| Cardio: biblioteca, registro e historial `libreria/cardios`, `getCardioMontHistory` | ❌ |
| Sesiones en vídeo (biblioteca a demanda) `libreria/sesiones-en-video` | ❌ |
| Sesiones en directo (reuniones, participantes) `createMeeting`, `programLiveSession` | ❌ |
| Imprimir o enviar un workout en PDF `sendPrintWorkout` | ❌ |
| Wearables `wearables.*` | ❌ (en CheluisFIT hay Health Connect y Strava reutilizables) |

## 5. Nutrición
| Harbiz | Estado |
|---|---|
| Planes y plantillas, asignar | ✅ |
| Base de alimentos con macros `searchFood`, `libreria/alimentos` | ❌ (CheluisFIT tiene OFF y USDA) |
| Recetas `libreria/recetas` | ❌ |
| Plan semanal en PDF y por correo `sendEmailNutritionPlanPdf` | ❌ |
| Lista de la compra `calculateConcretePlanMarketList`, `sendEmailShoppingList` | ❌ |
| Nutrición con IA `libreria/nutricionAI` | 🟡 (la IA genera planes) |
| Nutrición de grupo | ❌ |

## 6. Agenda y reservas
| Harbiz | Estado |
|---|---|
| Citas, eventos, calendario | ✅ |
| Tipos de sesión con color y precio `session-types` | 🟡 |
| Clases de grupo con aforo y participantes `checkVacancies`, `countParticipantsSession` | ❌ |
| Eventos recurrentes `editRecurrentCalEventProf` | ❌ |
| Política de cancelación `politica-cancelacion` | 🟡 |
| Correos al mover o duplicar citas | 🟡 |

## 7. Cobros (de cada estudio a sus clientes)
| Harbiz `pagos-harbiz/*` | Estado |
|---|---|
| Productos y planes (suscripciones) | ✅ bonos, cuotas, enlaces |
| Cupones `stripeCouponList`, `addCouponToStripe` | ❌ |
| Facturas y facturas impagadas `unpaid-invoices` | 🟡 |
| Transferencias y pagos recibidos `stripePayoutsListByDateFilter` | ❌ |
| Checkout público con invitado `checkout/:subdomain/:product/:guestId` | 🟡 |
| Pagos externos (efectivo/transferencia) `pagos-externos` | ❌ |
| Moneda e impuestos `saveCurrencyType`, `saveModifyTax` | ❌ |

## 8. Fidelización y comunidad
| Harbiz | Estado |
|---|---|
| Logros y premios `libreria/logros`, `sendAwardToCli` | 🟡 (récords) |
| Regalo de cumpleaños `activateBirthdayGift` | ❌ |
| Comunidad: grupos con muro, eventos y reacciones `addCommunityGroup`, `addReactionToCalEventCommunity` | ❌ |
| Mensajes a varios clientes `addMessageToMultipleClients` | ❌ |

## 9. Marketing y marca
| Harbiz | Estado |
|---|---|
| Página pública personalizable `landing-personalizacion` | ✅ (una plantilla) |
| App de marca blanca (icono, pie, vídeo) `setProfessionalCustomAppAddon` | 🟡 (PWA con color y logo) |
| Píxeles de Facebook y Ads `insertPixelFb`, `insertPixelAds` | ❌ |
| Integración con ActiveCampaign | ❌ (genérico: webhooks) |
| Kit de marketing y generador de biografía de Instagram `generateBiographies` | ❌ |
| Panel de negocio `dashboard-business`, `dashboard-reports` | 🟡 informes |

## 10. No se replica
⏭️ Academy (cursos de Harbiz), DudyClub y DudyFit, contenido a validar del catálogo de Harbiz, descarga de Harbiz Manager.
