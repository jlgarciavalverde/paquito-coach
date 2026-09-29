import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { Appointment, Client } from "@coach/shared";
import { Button, buttonClass } from "../ui/button";
import { ListView } from "./calendar";
import { AppointmentPanel, type AppointmentDraft } from "./appointment-panel";
import { ClientPacks } from "./client-packs";
import { WorkoutPanel } from "../training/workout-panel";
import { appointmentsQuery } from "../../lib/agenda";
import { clientWorkoutsQuery } from "../../lib/training";
import { plusDays, today } from "../../lib/dates";

/** Pestaña «Agenda» de la ficha: las próximas 4 semanas de este cliente. */
export function ClientAgenda({ client }: { client: Client }) {
  const t = today();
  const to = plusDays(t, 27);
  const appts = useQuery(appointmentsQuery(t, plusDays(to, 1), client.id));
  const workouts = useQuery(clientWorkoutsQuery(client.id, t, to));
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [draft, setDraft] = useState<AppointmentDraft | null>(null);
  const [wid, setWid] = useState<string | null>(null);
  const days = Array.from({ length: 28 }, (_, i) => plusDays(t, i));
  return (
    <div>
      <ClientPacks client={client} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">Próximas cuatro semanas.</p>
        <div className="flex gap-2">
          <Link to="/coach/calendario" search={{ cliente: client.id }} className={buttonClass("quiet")}>
            Ver en el calendario
          </Link>
          <Button onClick={() => setDraft({ date: t, minutes: 9 * 60, clientId: client.id })}>Nueva cita</Button>
        </div>
      </div>
      <ListView
        days={days}
        data={{ appointments: appts.data ?? [], workouts: workouts.data ?? [] }}
        layers={{ appointments: true, workouts: true, meals: false }}
        actions={{ onOpenAppointment: setAppt, onOpenWorkout: (w) => setWid(w.id), onCreateAt: () => {}, onMoveAppointment: () => {}, onMoveWorkout: () => {} }}
      />
      <AppointmentPanel appointment={appt} draft={draft} onClose={() => (setAppt(null), setDraft(null))} />
      <WorkoutPanel id={wid} onClose={() => setWid(null)} />
    </div>
  );
}
