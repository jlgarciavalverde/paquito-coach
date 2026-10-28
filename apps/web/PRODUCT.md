# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (PWA instalable; el cliente la usa casi siempre en el móvil, el entrenador en ordenador y móvil)

## What it is

Plataforma SaaS para entrenadores personales de fuerza y readaptación (nacida para Paquito, CAFYD) y sus clientes:
alta y vínculo de clientes, rutinas y programas, cuaderno de series, nutrición, agenda y reservas, bonos y cobros
(Stripe Connect, cada entrenador cobra en su cuenta), check-ins, salud (PAR-Q+), progreso, chat e IA sobre sus documentos.
Alternativa a Harbiz. Cada entrenador tiene su estudio con nombre, acento de color y página pública propios.

## Users and scenes

- **Entrenador (quien paga)**: entre sesiones, en el ordenador del estudio o el móvil. Revisa quién necesita atención,
  asigna rutinas, mueve citas, contesta. Lo valora por rapidez y por lo profesional que se ve ante sus clientes.
- **Cliente del entrenador**: en el móvil, en el gimnasio entre series (manos ocupadas, prisa, luz variable) o en casa
  marcando comidas y rellenando check-ins. Necesita ver qué toca, anotarlo con un toque y sentir progreso.
- Ambos lados deben verse con el mismo nivel de acabado (decisión del usuario, 2026-10-26).

## Constraints

- Interfaz en español de España, tuteo, frases cortas, botones con verbo.
- WCAG 2.1 AA verificada con axe en claro y oscuro; respeta «reducir movimiento».
- Marca por estudio: el nombre en pantalla es el del estudio (nunca el de la plataforma) y el acento sale de `ACCENTS`
  (`packages/shared`), aplicado por variables `--primary*`.
- Datos de salud: tono serio y fiable; nada de gamificación infantil.
- El texto de las cifras sigue siendo texto real (nada de shadow DOM para números).

## Brand commitments

- El usuario rechazó la v0.1 por «parecer generada por IA» (crema + serif + arcilla, tarjetas con sombra, sobretítulos en
  mayúsculas). La identidad «hoja clínica» (v0.2–2.3) se sustituye entera en 3.0.0 por verse «igual» y poco premium.
- Nombre de la plataforma: pendiente.
