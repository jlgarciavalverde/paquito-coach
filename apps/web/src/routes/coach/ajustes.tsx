import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { JoinCode } from "@coach/shared";
import { Button } from "../../components/ui/button";
import { CopyField } from "../../components/ui/copy-field";
import { BlockTitle, PageTitle } from "../../components/ui/layout";
import { Skeleton } from "../../components/ui/spinner";
import { useToast } from "../../components/ui/toast";
import { PasswordSetting, SessionsSetting, ThemeSetting } from "../../components/account-settings";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { joinCodeQuery } from "../../lib/queries";

export const Route = createFileRoute("/coach/ajustes")({
  component: Settings,
});

function Settings() {
  const me = useMe()!;
  return (
    <>
      <PageTitle title="Ajustes" lead={`${me.name}, ${me.email}. Estudio «${me.studio.name}».`} />
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 [&>*]:min-w-0">
        <div className="flex flex-col gap-12">
          <JoinCodeSetting />
          <ThemeSetting />
        </div>
        <div className="flex flex-col gap-12">
          <PasswordSetting />
          <SessionsSetting />
        </div>
      </div>
    </>
  );
}

function JoinCodeSetting() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery(joinCodeQuery);
  const rotate = useMutation({
    mutationFn: () => api<JoinCode>("/studio/join-code/rotate", { body: {} }),
    onSuccess: (d) => {
      qc.setQueryData(joinCodeQuery.queryKey, d);
      toast("Código cambiado. El anterior ya no sirve.");
    },
  });
  return (
    <section>
      <BlockTitle>Código del estudio</BlockTitle>
      <p className="max-w-[56ch] text-sm text-ink-2">
        Quien lo tenga puede pedirte entrenar contigo desde la app (por ejemplo, si lo pones en tu Instagram). Cada solicitud la aceptas o la rechazas tú.
      </p>
      {q.data ? (
        <div className="mt-5 flex flex-col gap-3">
          <p className="font-narrow text-[44px] leading-none tracking-[0.08em] text-ink" data-testid="join-code">
            {q.data.code}
          </p>
          <CopyField value={q.data.url} label="Enlace de registro con el código" />
          <Button variant="quiet" size="sm" className="self-start" loading={rotate.isPending} onClick={() => confirm("¿Cambiar el código? El actual dejará de funcionar.") && rotate.mutate()}>
            Cambiar el código
          </Button>
        </div>
      ) : (
        <Skeleton className="mt-5 h-24" />
      )}
    </section>
  );
}
