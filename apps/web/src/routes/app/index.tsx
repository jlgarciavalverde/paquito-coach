import { createFileRoute } from "@tanstack/react-router";
import { Barbell, CalendarBlank, ForkKnife } from "@phosphor-icons/react";
import { Card } from "../../components/ui/surface";
import { useMe } from "../../lib/auth";
import { firstName, fmtToday, greeting } from "../../lib/format";

export const Route = createFileRoute("/app/")({
  component: Today,
});

function Today() {
  const me = useMe()!;
  return (
    <>
      <p className="text-[12px] font-medium tracking-[0.14em] text-ink-3 uppercase">{fmtToday()}</p>
      <h1 className="mt-1 font-display text-[44px] leading-[1.05]">
        {greeting()}, <em className="text-accent">{firstName(me.name)}</em>
      </h1>
      <p className="mt-2 text-ink-2">Esto es lo que tienes hoy.</p>

      <div className="mt-8 flex flex-col gap-4">
        <TodayCard icon={Barbell} overline="Entreno" title="Sin entreno asignado hoy" text="Cuando tu entrenador te asigne una rutina, aparecerá aquí con sus ejercicios y vídeos." />
        <TodayCard icon={ForkKnife} overline="Comidas" title="Tu plan de comidas" text="Muy pronto verás aquí las comidas del día y podrás marcar las que vas cumpliendo." />
        <TodayCard icon={CalendarBlank} overline="Agenda" title="Sin citas próximas" text="Tus sesiones presenciales con tu entrenador aparecerán aquí." />
      </div>
    </>
  );
}

function TodayCard({ icon: I, overline, title, text }: { icon: typeof Barbell; overline: string; title: string; text: string }) {
  return (
    <Card className="flex gap-4 p-5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-accent-soft text-accent-soft-ink">
        <I size={22} />
      </span>
      <div>
        <p className="text-[12px] font-medium tracking-[0.12em] text-ink-3 uppercase">{overline}</p>
        <p className="font-display text-[24px] leading-tight">{title}</p>
        <p className="mt-1 text-sm text-ink-2">{text}</p>
      </div>
    </Card>
  );
}
