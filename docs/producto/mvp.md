# La app, explicada para Paquito

Todo lo que ahora llevas en Harbiz, WhatsApp, Excel, PDFs y el calendario, en una sola app. Tiene dos caras: la tuya (en
el ordenador o el móvil) y la de tus clientes (en el móvil; se instala como una app desde el navegador).

## Tu día a día
**Hoy** es tu pantalla de inicio: citas del día (con «Marcar hecha»), quién entrena hoy, la semana de todos de un vistazo,
lo último que han hecho (con sus récords y comentarios) y **«Necesitan atención»**: quien se está descolgando, un
cuestionario de salud con alertas, un mensaje sin contestar, un check-in nuevo, un bono que se acaba o una cuota sin cobrar.
Desde cada aviso vas directo a lo que toca.

**Buscar o hacer cualquier cosa** con ⌘K (o Ctrl K, o el botón «Buscar»): escribe «lucía» y te ofrece escribirle,
asignarle una rutina, un programa, una cita o anotar sus medidas. En el ordenador hay atajos (`?` los enseña).

## Clientes
- Alta de tres formas: invitación por WhatsApp, tu código de estudio (se apuntan y tú aceptas) o ficha sin cuenta para
  presenciales. Al crear un cliente te propone los siguientes pasos (primera rutina, primera cita, plan de comidas, medidas).
- Su ficha: datos, objetivo, **lesiones y limitaciones** (salen en rojo encima de todo), notas privadas y acciones a mano:
  asignar rutina, nueva cita, escribir, anotar medidas o generar con IA.

## Entrenamiento
- Más de 2.500 ejercicios en español, más los tuyos con tu vídeo.
- **Rutinas** por bloques con series, repeticiones, carga, %RM, RIR/RPE, tempo, descanso, notas y superseries.
- **Programas de varias semanas**: una rejilla de semanas × días; al aplicarlo se crean todos los entrenos, con la carga
  subiendo sola cada semana si quieres.
- El cliente anota cada serie en el móvil: le sale lo que hizo la última vez, marca la serie con un toque y ajusta con ±.
  Tú ves lo que ha hecho frente a lo previsto y le contestas desde ahí mismo.

## Nutrición
Plantillas de comidas (igual cada día o distintas), con cantidades, alternativas y objetivos de kcal y macros. Se aplican a
cada cliente y él marca lo que cumple.

## Agenda, bonos y reservas
- Tus citas en semana, mes o lista; arrastras para moverlas. Cada cita se marca como hecha, «no vino» o cancelada.
- **Bonos** de sesiones: cada sesión hecha descuenta; te avisa cuando queda una.
- **Reservas**: abres tus horas libres y tus clientes reservan y cancelan solos desde su app (con el plazo que decidas).

## Seguimiento
- **Check-ins** semanales o mensuales con tus preguntas (energía, sueño, dolor, una foto…). Les llega un aviso el día que toca.
- **Fotos de progreso** comparando dos fechas, **peso y medidas**, y **medidas propias** (dolor EVA, grados de flexión, salto…).
- **Material** para tus clientes: pautas en PDF, vídeos o enlaces, para todos o para algunos.
- **Informes**: cumplimiento de tus clientes, sesiones del mes y cobros.

## Cobros (Stripe)
Tus tarifas (bonos, sesión suelta, cuota mensual). El cliente paga desde su app con tarjeta, Apple Pay o Google Pay; el
bono se le activa solo al pagar. Puedes mandarle un enlace de pago por WhatsApp. Los cobros van a tu cuenta; desde
Informes descargas un CSV para tu gestor.

## IA con tus documentos
Subes tu material (PDF o Word) y la IA te prepara **rutinas, programas y dietas** basadas en él, o responde preguntas
citando de dónde lo saca. Siempre es un borrador que revisas tú. A la IA (Gemini, de Google) nunca le llegan nombres ni
datos de contacto de tus clientes.

## Mensajes y avisos
Chat privado con cada cliente, con fotos, en tiempo real, sin dar tu teléfono. Avisos en el móvil de mensajes, reservas,
pagos y del resumen del día a las 8:00; a tus clientes, del entreno del día y de su check-in.

## Seguridad y privacidad
Cada cliente solo ve lo suyo; tus datos no se mezclan con los de nadie. Contraseñas cifradas, sesiones que caducan, freno
contra quien intente adivinar contraseñas y «Cerrar las demás sesiones» si pierdes el móvil. Tus clientes pueden descargar
sus datos o borrar su cuenta; el aviso de privacidad está en `/privacidad` (revísalo: tú eres el responsable).

## Para empezar
1. Entra y sigue «Para empezar» en Hoy: una rutina, un cliente, un entreno asignado y una plantilla de comidas.
2. Instálala en tu móvil: en Android, menú del navegador → «Instalar app»; en iPhone, Compartir → «Añadir a pantalla de
   inicio». Activa los avisos en Ajustes.
3. Si quieres verla antes con datos de ejemplo: la **demo** (`demo-paquito.redgarverde.com`), que se reinicia cada noche.

## Necesitamos que decidas
1. **Nombre** de la app y subdominio (ahora «Paquito Coach», provisional).
2. Revisa las **preguntas del cuestionario de salud** y el texto de `/privacidad`.
3. Para cobrar: abrir tu cuenta de **Stripe**. Para la IA: crear tu clave de **Gemini** (guía en `docs/OPERACIONES.md`).
4. Lo que más eches en falta después de usarla unos días.
