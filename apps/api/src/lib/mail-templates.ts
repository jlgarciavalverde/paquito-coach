/**
 * Plantillas de los correos: HTML sencillo (tablas e estilos en línea, lo que entienden todos los clientes de correo) y
 * versión de texto. Todo lo que viene del usuario se escapa.
 */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

type Brand = { studioName: string; accent?: string };
type Out = { subject: string; html: string; text: string };

function layout(b: Brand, o: { title: string; paragraphs: string[]; button?: { label: string; url: string }; footer?: string }): Out & { subject: string } {
  const accent = b.accent ?? "#1f6f5c";
  const ps = o.paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#1d2420">${p}</p>`).join("");
  const btn = o.button
    ? `<p style="margin:22px 0"><a href="${esc(o.button.url)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:6px;font-size:15px">${esc(o.button.label)}</a></p>
       <p style="margin:0 0 14px;font-size:13px;color:#5b655f">Si el botón no funciona, copia este enlace en el navegador:<br><span style="word-break:break-all">${esc(o.button.url)}</span></p>`
    : "";
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f4f6f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;border-top:5px solid ${accent}">
<tr><td style="padding:24px 28px 8px;font-size:13px;font-weight:700;letter-spacing:.02em;color:#5b655f">${esc(b.studioName)}</td></tr>
<tr><td style="padding:4px 28px 20px"><h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:#1d2420">${esc(o.title)}</h1>${ps}${btn}</td></tr>
<tr><td style="padding:14px 28px 22px;border-top:1px solid #e3e8e5;font-size:12px;color:#7a847e">${o.footer ?? `Este correo te lo envía la app de ${esc(b.studioName)}.`}</td></tr>
</table></td></tr></table></body></html>`;
  const strip = (h: string) => h.replace(/<br>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const text = [o.title, "", ...o.paragraphs.map(strip), ...(o.button ? ["", `${o.button.label}: ${o.button.url}`] : []), "", "—", b.studioName].join("\n");
  return { subject: o.title, html, text };
}

export const mailTemplates = {
  invite: (b: Brand, d: { clientName: string; coachName: string; url: string }) =>
    layout(b, {
      title: `${first(d.coachName)} te invita a su app`,
      paragraphs: [
        `Hola ${esc(first(d.clientName))}:`,
        `${esc(d.coachName)} te ha dado de alta en su app. Ahí verás tus entrenos, tu plan de comidas y tus citas, y podrás escribirle.`,
        "Crea tu contraseña con este enlace (caduca en 7 días):",
      ],
      button: { label: "Crear mi cuenta", url: d.url },
    }),

  passwordReset: (b: Brand, d: { name: string; url: string }) =>
    layout(b, {
      title: "Restablece tu contraseña",
      paragraphs: [
        `Hola ${esc(first(d.name))}:`,
        "Alguien (seguramente tú) ha pedido cambiar la contraseña de tu cuenta. El enlace sirve una vez y caduca en 1 hora.",
        "Si no lo has pedido, ignora este correo: tu contraseña sigue igual.",
      ],
      button: { label: "Elegir una contraseña nueva", url: d.url },
      footer: "Correo de seguridad: se envía aunque hayas desactivado los avisos por correo.",
    }),

  emailChange: (b: Brand, d: { name: string; url: string }) =>
    layout(b, {
      title: "Confirma tu correo nuevo",
      paragraphs: [`Hola ${esc(first(d.name))}:`, "Para usar esta dirección en tu cuenta, confírmala con este enlace (caduca en 24 horas)."],
      button: { label: "Confirmar el correo", url: d.url },
      footer: "Si no has pedido este cambio, ignora este correo.",
    }),

  emailChanged: (b: Brand, d: { name: string; newEmail: string }) =>
    layout(b, {
      title: "Tu correo ha cambiado",
      paragraphs: [
        `Hola ${esc(first(d.name))}:`,
        `A partir de ahora entras con <strong>${esc(d.newEmail)}</strong>.`,
        `Si no has sido tú, escribe a tu entrenador cuanto antes.`,
      ],
      footer: "Correo de seguridad: se envía aunque hayas desactivado los avisos por correo.",
    }),

  bookingConfirmed: (b: Brand, d: { name: string; when: string; location: string; url: string; unsubscribeUrl: string }) =>
    layout(b, {
      title: "Sesión reservada",
      paragraphs: [`Hola ${esc(first(d.name))}:`, `Tienes sesión el <strong>${esc(d.when)}</strong>${d.location ? ` en ${esc(d.location)}` : ""}.`, "Si no puedes ir, cancélala desde la app."],
      button: { label: "Ver mi agenda", url: d.url },
      footer: `¿No quieres estos correos? <a href="${esc(d.unsubscribeUrl)}" style="color:#7a847e">Darme de baja</a>.`,
    }),

  bookingCancelled: (b: Brand, d: { name: string; when: string; url: string; unsubscribeUrl: string }) =>
    layout(b, {
      title: "Sesión cancelada",
      paragraphs: [`Hola ${esc(first(d.name))}:`, `Se ha cancelado tu sesión del <strong>${esc(d.when)}</strong>.`],
      button: { label: "Reservar otra", url: d.url },
      footer: `¿No quieres estos correos? <a href="${esc(d.unsubscribeUrl)}" style="color:#7a847e">Darme de baja</a>.`,
    }),

  newLead: (b: Brand, d: { coachName: string; name: string; email: string; phone: string; message: string; url: string }) =>
    layout(b, {
      title: `${first(d.name)} quiere empezar contigo`,
      paragraphs: [
        `Hola ${esc(first(d.coachName))}:`,
        `Te ha escrito desde tu página pública <strong>${esc(d.name)}</strong> (${esc(d.email)}${d.phone ? `, ${esc(d.phone)}` : ""}).`,
        ...(d.message ? [`«${esc(d.message)}»`] : []),
        "Desde la app puedes darle de alta e invitarle con un toque.",
      ],
      button: { label: "Ver la solicitud", url: d.url },
    }),

  newBookingForCoach: (b: Brand, d: { coachName: string; clientName: string; when: string; url: string; unsubscribeUrl: string }) =>
    layout(b, {
      title: `${first(d.clientName)} ha reservado`,
      paragraphs: [`Hola ${esc(first(d.coachName))}:`, `${esc(d.clientName)} ha reservado una sesión el <strong>${esc(d.when)}</strong>.`],
      button: { label: "Abrir la agenda", url: d.url },
      footer: `Te llega por correo porque no tienes activados los avisos en el móvil. <a href="${esc(d.unsubscribeUrl)}" style="color:#7a847e">Darme de baja</a>.`,
    }),
};

/** «miércoles 7 de octubre a las 9:30», en hora de Madrid. */
export function whenEs(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.weekday} ${p.day} de ${p.month} a las ${Number(p.hour)}:${p.minute}`;
}
