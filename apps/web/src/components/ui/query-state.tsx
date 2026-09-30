import type { ReactNode } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import { errorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";
import { Button } from "./button";
import { Skeleton } from "./spinner";

type Q<T> = { isPending: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown; isRefetching?: boolean; isFetching?: boolean };

/**
 * Cuando una carga falla: el motivo y «Reintentar». Sustituye a lo que había antes en muchas pantallas: un vacío falso
 * («No tienes plan») o un esqueleto eterno, que hacían creer que no había datos cuando lo que fallaba era la conexión.
 */
export function QueryError({ q, className, compact }: { q: Pick<Q<unknown>, "error" | "refetch" | "isFetching" | "isRefetching">; className?: string; compact?: boolean }) {
  const busy = Boolean(q.isRefetching ?? q.isFetching);
  return (
    <div role="alert" className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-zone)] border border-plate-red bg-plate-red-soft", compact ? "px-3 py-2 text-sm" : "px-5 py-4", className)}>
      <p className="flex min-w-0 flex-1 items-start gap-2 text-ink">
        <WarningCircle size={compact ? 16 : 18} className="mt-0.5 shrink-0 text-plate-red" aria-hidden="true" />
        <span>{errorMessage(q.error)}</span>
      </p>
      <Button variant="secondary" size={compact ? "sm" : "md"} loading={busy} onClick={() => void q.refetch()}>
        Reintentar
      </Button>
    </div>
  );
}

/** Cargando → esqueleto; error → `QueryError`; si no, el contenido con los datos ya cargados. */
export function QueryState<T>({ q, skeleton, children }: { q: Q<T>; skeleton?: ReactNode; children: (data: T) => ReactNode }) {
  if (q.isPending) return <>{skeleton ?? <Skeleton className="h-40" />}</>;
  if (q.isError || q.data === undefined) return <QueryError q={q} />;
  return <>{children(q.data)}</>;
}
