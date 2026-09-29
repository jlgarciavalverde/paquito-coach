import { createFileRoute } from "@tanstack/react-router";
import { Button } from "../../components/ui/button";
import { Monogram } from "../../components/ui/layout";
import { PasswordSetting, PushSetting, SessionsSetting, ThemeSetting } from "../../components/account-settings";
import { useLogout, useMe } from "../../lib/auth";

export const Route = createFileRoute("/app/perfil")({
  component: Profile,
});

function Profile() {
  const me = useMe()!;
  const logout = useLogout();
  return (
    <>
      <div className="mb-10 flex items-center gap-4">
        <Monogram name={me.name} size={56} />
        <div>
          <h1 className="font-wide text-[28px] leading-tight">{me.name}</h1>
          <p className="text-sm text-ink-2">
            {me.email}. Entrenas con {me.studio.name}.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-12">
        <PushSetting />
        <ThemeSetting />
        <PasswordSetting />
        <SessionsSetting />
        <Button variant="secondary" onClick={logout} className="self-start">
          Cerrar sesión
        </Button>
      </div>
    </>
  );
}
