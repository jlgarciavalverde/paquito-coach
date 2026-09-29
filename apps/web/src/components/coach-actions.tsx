import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { NewClientPanel } from "./clients/new-client-panel";
import { AssignPanel } from "./training/assign-panel";
import { AppointmentPanel, type AppointmentDraft } from "./agenda/appointment-panel";
import { MetricPanel } from "./progress/client-progress";
import { metricsQuery } from "../lib/progress";
import { today } from "../lib/dates";

type Actions = {
  newClient: () => void;
  assign: (o?: { clientId?: string; routineId?: string }) => void;
  newAppointment: (clientId?: string) => void;
  measure: (clientId: string) => void;
  write: (clientId: string) => void;
};
const Ctx = createContext<Actions | null>(null);

/**
 * Las acciones frecuentes del entrenador, disponibles desde cualquier pantalla (paleta ⌘K, cabecera de la ficha,
 * «Siguientes pasos» del alta) sin tener que ir antes a la sección donde viven.
 */
export function CoachActionsProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [newClient, setNewClient] = useState(false);
  const [assign, setAssign] = useState<{ clientId?: string; routineId?: string; n: number } | null>(null);
  const [appt, setAppt] = useState<AppointmentDraft | null>(null);
  const [measure, setMeasure] = useState<string | null>(null);

  const actions = useMemo<Actions>(
    () => ({
      newClient: () => setNewClient(true),
      assign: (o) => setAssign({ ...o, n: Date.now() }),
      newAppointment: (clientId) => {
        const now = new Date();
        const next = Math.min(21 * 60, (now.getHours() + 1) * 60);
        setAppt({ date: today(), minutes: next, clientId: clientId ?? null });
      },
      measure: (clientId) => setMeasure(clientId),
      write: (clientId) => void navigate({ to: "/coach/chat", search: { cliente: clientId } }),
    }),
    [navigate],
  );

  return (
    <Ctx.Provider value={actions}>
      {children}
      <NewClientPanel open={newClient} onOpenChange={setNewClient} />
      {assign && <AssignPanel key={assign.n} open onOpenChange={(o) => !o && setAssign(null)} clientId={assign.clientId} routineId={assign.routineId} />}
      <AppointmentPanel draft={appt} onClose={() => setAppt(null)} />
      {measure && <Measure clientId={measure} onClose={() => setMeasure(null)} />}
    </Ctx.Provider>
  );
}

function Measure({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const q = useQuery(metricsQuery(clientId));
  return <MetricPanel who={clientId} open={q.isSuccess} onClose={onClose} existing={q.data ?? []} />;
}

export function useCoachActions() {
  const a = useContext(Ctx);
  if (!a) throw new Error("useCoachActions fuera de CoachActionsProvider");
  return a;
}
