import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMe } from "../../lib/auth";
import { billingQuery, daysLeft } from "../../lib/platform";

/**
 * Aviso bajo la cabecera del entrenador cuando hay algo que hacer con el plan: la prueba se acaba (últimos 5 días), un
 * cobro ha fallado o el estudio está en pausa. Si todo va bien, no se ve nada.
 */
export function PlanBanner() {
  const me = useMe();
  const q = useQuery({ ...billingQuery, enabled: Boolean(me && me.role === "coach") });
  const b = q.data;
  if (!b) return null;
  let text: string | null = null;
  let urgent = false;
  if (b.access === "locked") {
    urgent = true;
    text = b.status === "trial" ? "Tu prueba ha terminado. Elige un plan para seguir creando y cambiando cosas; mientras, puedes consultar y exportar todo." : "Tu estudio está en pausa. Elige un plan o revisa el pago para seguir trabajando con normalidad.";
  } else if (b.status === "past_due") {
    urgent = true;
    text = "No se ha podido cobrar tu plan. Revisa la tarjeta antes de que el estudio quede en pausa.";
  } else if (b.status === "trial") {
    const d = daysLeft(b.trialEndsAt);
    if (d !== null && d <= 5) text = d <= 1 ? "Tu prueba termina hoy." : `Te quedan ${d} días de prueba.`;
  }
  if (!text) return null;
  return (
    <div role={urgent ? "alert" : "note"} className={urgent ? "bg-plate-red-soft" : "bg-tray"}>
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-[14px] text-ink sm:px-6">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className={urgent ? "h-4 w-[5px] rounded-[1px] bg-plate-red" : "h-4 w-[5px] rounded-[1px] bg-primary"} />
          {text}
        </span>
        <Link to="/coach/plan" className="font-medium text-primary underline-offset-4 hover:underline">
          Ver planes
        </Link>
      </div>
    </div>
  );
}
