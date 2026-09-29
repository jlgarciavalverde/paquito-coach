import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowsClockwise } from "@phosphor-icons/react";
import type { JoinCode } from "@coach/shared";
import { Card, PageHeader } from "../../components/ui/surface";
import { Button } from "../../components/ui/button";
import { CopyField } from "../../components/ui/copy-field";
import { Skeleton } from "../../components/ui/spinner";
import { useToast } from "../../components/ui/toast";
import { PasswordCard, SessionsCard, ThemeCard } from "../../components/account-settings";
import { api } from "../../lib/api";
import { joinCodeQuery } from "../../lib/queries";

export const Route = createFileRoute("/coach/ajustes")({
  component: Settings,
});

function Settings() {
  return (
    <>
      <PageHeader overline="Tu estudio" title="Ajustes" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <JoinCodeCard />
          <ThemeCard />
        </div>
        <div className="flex flex-col gap-6">
          <PasswordCard />
          <SessionsCard />
        </div>
      </div>
    </>
  );
}

function JoinCodeCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery(joinCodeQuery);
  const rotate = useMutation({
    mutationFn: () => api<JoinCode>("/studio/join-code/rotate", { body: {} }),
    onSuccess: (d) => {
      qc.setQueryData(joinCodeQuery.queryKey, d);
      toast("Código cambiado. El anterior ya no funciona.");
    },
  });
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-[24px]">Código del estudio</h2>
      <p className="mt-1 text-sm text-ink-2">
        Compártelo (por ejemplo en tu bio de Instagram) para que un cliente nuevo se registre solo. Tendrás que aceptar cada solicitud.
      </p>
      {q.data ? (
        <div className="mt-5 flex flex-col gap-3">
          <p className="font-display text-[44px] leading-none tracking-[0.12em] text-accent tabular">{q.data.code}</p>
          <CopyField value={q.data.url} label="Enlace de registro con código" />
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            icon={<ArrowsClockwise size={15} />}
            loading={rotate.isPending}
            onClick={() => confirm("¿Cambiar el código? El actual dejará de funcionar.") && rotate.mutate()}
          >
            Cambiar código
          </Button>
        </div>
      ) : (
        <Skeleton className="mt-5 h-24" />
      )}
    </Card>
  );
}
