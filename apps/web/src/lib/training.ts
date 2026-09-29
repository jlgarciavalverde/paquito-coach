import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ActivityItem, AssignInput, Exercise, ExerciseInput, Muscle, Routine, RoutineBlock, RoutineBody, Workout, WorkoutLog } from "@coach/shared";
import { api } from "./api";

export const exercisesQuery = (p: { q?: string; muscle?: Muscle | ""; own?: boolean; limit?: number }) => {
  const s = new URLSearchParams();
  if (p.q) s.set("q", p.q);
  if (p.muscle) s.set("muscle", p.muscle);
  if (p.own) s.set("own", "1");
  s.set("limit", String(p.limit ?? 40));
  return queryOptions({ queryKey: ["exercises", s.toString()], queryFn: () => api<Exercise[]>(`/exercises?${s}`), staleTime: 60_000 });
};
export const exerciseQuery = (id: string) => queryOptions({ queryKey: ["exercise", id], queryFn: () => api<Exercise>(`/exercises/${id}`), staleTime: 5 * 60_000 });

export const routinesQuery = queryOptions({ queryKey: ["routines"], queryFn: () => api<Routine[]>("/routines") });
export const routineQuery = (id: string) => queryOptions({ queryKey: ["routine", id], queryFn: () => api<Routine>(`/routines/${id}`) });

export const clientWorkoutsQuery = (clientId: string, from: string, to: string) =>
  queryOptions({ queryKey: ["workouts", "client", clientId, from, to], queryFn: () => api<Workout[]>(`/clients/${clientId}/workouts?from=${from}&to=${to}`), staleTime: 0 });
export const myWorkoutsQuery = (from: string, to: string) =>
  queryOptions({ queryKey: ["workouts", "me", from, to], queryFn: () => api<Workout[]>(`/me/workouts?from=${from}&to=${to}`) });
export const workoutQuery = (id: string) => queryOptions({ queryKey: ["workout", id], queryFn: () => api<Workout>(`/workouts/${id}`) });
// Lo que cambia por acción de otra persona (clientes) se vuelve a pedir siempre al abrir la pantalla.
export const activityQuery = queryOptions({ queryKey: ["activity"], queryFn: () => api<(ActivityItem & { unseen: boolean })[]>("/activity"), staleTime: 0, refetchInterval: 60_000 });
export const studioWorkoutsQuery = (from: string, to: string) =>
  queryOptions({ queryKey: ["workouts", "studio", from, to], queryFn: () => api<Workout[]>(`/workouts?from=${from}&to=${to}`), staleTime: 0 });
export const todayWorkoutsQuery = (date: string) => queryOptions({ queryKey: ["workouts", "today", date], queryFn: () => api<Workout[]>(`/today/workouts?date=${date}`), staleTime: 0 });

export function useSaveRoutine(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RoutineBody) => (id ? api<Routine>(`/routines/${id}`, { method: "PUT", body }) : api<Routine>("/routines", { body })),
    onSuccess: (r) => {
      qc.setQueryData(["routine", r.id], r);
      void qc.invalidateQueries({ queryKey: ["routines"] });
    },
  });
}

export function useRoutineAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "duplicate" | "delete" }) =>
      action === "delete" ? api(`/routines/${id}`, { method: "DELETE" }) : api<Routine>(`/routines/${id}/duplicate`, { body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["routines"] }),
  });
}

export function useAssign(routineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AssignInput) => api<{ created: number }>(`/routines/${routineId}/assign`, { body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["workouts"] });
      void qc.invalidateQueries({ queryKey: ["routines"] });
    },
  });
}

export function useCreateExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ExerciseInput) => api<Exercise>("/exercises", { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exercises"] }),
  });
}

export function useUpdateExercise(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ExerciseInput>) => api<Exercise>(`/exercises/${id}`, { method: "PATCH", body }),
    onSuccess: (e) => {
      qc.setQueryData(["exercise", e.id], e);
      void qc.invalidateQueries({ queryKey: ["exercises"] });
    },
  });
}

export function useWorkoutEdit(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { date?: string; title?: string; coachNotes?: string; blocks?: RoutineBlock[] } | "delete") =>
      p === "delete" ? api(`/workouts/${id}`, { method: "DELETE" }) : api<Workout>(`/workouts/${id}`, { method: "PATCH", body: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workouts"] }),
  });
}

export const saveLog = (id: string, log: WorkoutLog) => api(`/workouts/${id}/log`, { method: "PUT", body: log });

export function useCompleteWorkout(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { sessionRpe: number | null; comment: string | null; skipped?: boolean } | "reopen") =>
      body === "reopen" ? api<Workout>(`/workouts/${id}/reopen`, { body: {} }) : api<Workout>(`/workouts/${id}/complete`, { body }),
    onSuccess: (w) => {
      qc.setQueryData(["workout", id], w);
      void qc.invalidateQueries({ queryKey: ["workouts"] });
    },
  });
}

/** Etiquetas de programación A1, A2 (superserie), B1… en el orden de la rutina. */
export function itemLabels(blocks: RoutineBlock[]) {
  const labels = new Map<string, string>();
  let letter = -1;
  let n = 0;
  let prevGroup: string | null = null;
  for (const b of blocks) {
    for (const it of b.items) {
      if (it.group && it.group === prevGroup) n++;
      else {
        letter++;
        n = 1;
      }
      prevGroup = it.group;
      labels.set(it.id, `${String.fromCharCode(65 + (letter % 26))}${n}`);
    }
    prevGroup = null; // una superserie no cruza de bloque
  }
  return labels;
}

export const newId = () => Math.random().toString(36).slice(2, 10);
