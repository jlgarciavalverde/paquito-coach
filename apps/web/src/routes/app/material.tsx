import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FilePdf, LinkSimple } from "@phosphor-icons/react";
import { EmptyNote, PageTitle } from "../../components/ui/layout";
import { Skeleton } from "../../components/ui/spinner";
import { resourceHref } from "../../components/followup/resources";
import { myResourcesQuery } from "../../lib/library";
import { useMe } from "../../lib/auth";
import { relativeTime } from "../../lib/format";
import { QueryError } from "../../components/ui/query-state";

export const Route = createFileRoute("/app/material")({
  component: Material,
});

/** Material que el entrenador comparte: pautas en PDF, vídeos y enlaces. */
function Material() {
  const me = useMe()!;
  const q = useQuery(myResourcesQuery);
  const coach = me.studio.coachName?.split(" ")[0] ?? "tu entrenador";
  return (
    <>
      <PageTitle title="Material" lead={`Pautas, vídeos y lecturas que te ha preparado ${coach}.`} />
      {q.isPending ? (
        <Skeleton className="h-40" />
      ) : q.isError ? (
        <QueryError q={q} />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyNote>Todavía no hay nada. Cuando {coach} comparta algo contigo, aparecerá aquí.</EmptyNote>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {q.data!.map((r) => (
            <li key={r.id}>
              <a href={resourceHref(r)} target="_blank" rel="noreferrer noopener" className="flex items-start gap-3 py-4 hover:text-primary">
                {r.kind === "pdf" ? <FilePdf size={22} className="mt-0.5 shrink-0 text-plate-red" aria-hidden="true" /> : <LinkSimple size={22} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />}
                <span className="min-w-0">
                  <span className="block font-medium">{r.title}</span>
                  {r.description && <span className="block text-sm text-ink-2">{r.description}</span>}
                  <span className="block text-[13px] text-ink-3">
                    {r.kind === "pdf" ? "PDF" : "Enlace"}, {relativeTime(r.createdAt)}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
